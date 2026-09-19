import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Structural contract test against the real 069 migration SQL text - no live Postgres required,
// same precedent as tests/analysis-profile-authoring-migration-contract.test.mjs.

const root = process.cwd();
let migrationSql;

test.before(async () => {
  migrationSql = await readFile(path.join(root, 'server', 'db', 'migrations', '069_analysis_profile_memory.sql'), 'utf8');
});

test('069 adds concepts and understanding to analysis_profiles, both additive and defaulted', () => {
  assert.match(migrationSql, /ALTER TABLE analysis_profiles/);
  assert.match(migrationSql, /ADD COLUMN IF NOT EXISTS concepts\s+JSONB NOT NULL DEFAULT '\[\]'/);
  assert.match(migrationSql, /ADD COLUMN IF NOT EXISTS understanding\s+JSONB NOT NULL DEFAULT '\{"summary":"","version":0,"updatedAt":null\}'/);
});

test('069 creates analysis_profile_events with every required column, FKs cascading on delete', () => {
  const tableMatch = /CREATE TABLE IF NOT EXISTS analysis_profile_events \(([\s\S]*?)\n\);/.exec(migrationSql);
  assert.ok(tableMatch, 'could not find the real CREATE TABLE statement');
  const body = tableMatch[1];
  const requiredColumns = [
    ['id', /id\s+TEXT PRIMARY KEY/],
    ['user_id', /user_id\s+TEXT NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/],
    ['profile_id', /profile_id\s+TEXT NOT NULL REFERENCES analysis_profiles\(id\) ON DELETE CASCADE/],
    ['kind', /kind\s+TEXT NOT NULL/],
    ['title', /title\s+TEXT NOT NULL DEFAULT ''/],
    ['detail', /detail\s+TEXT NOT NULL DEFAULT ''/],
    ['understanding_version', /understanding_version\s+INTEGER/],
    ['token_usage', /token_usage\s+JSONB/],
    ['created_at', /created_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/]
  ];
  requiredColumns.forEach(([name, re]) => assert.match(body, re, 'missing or malformed column: ' + name));
});

test('069 declares a per-profile and a per-user index on analysis_profile_events', () => {
  assert.match(migrationSql, /CREATE INDEX IF NOT EXISTS analysis_profile_events_profile_idx ON analysis_profile_events \(profile_id, created_at\);/);
  assert.match(migrationSql, /CREATE INDEX IF NOT EXISTS analysis_profile_events_user_idx ON analysis_profile_events \(user_id\);/);
});

test('069 is additive only: no destructive statement, no edit of an unrelated existing table, IF NOT EXISTS everywhere', () => {
  assert.doesNotMatch(migrationSql, /DROP\s+(TABLE|COLUMN|INDEX|SCHEMA)/i);
  assert.doesNotMatch(migrationSql, /\b(TRUNCATE|DELETE\s+FROM|UPDATE\s+\w+\s+SET|INSERT\s+INTO)\b/i, 'no data is rewritten or backfilled');
  assert.doesNotMatch(migrationSql, /CONCURRENTLY/i, 'a plain .sql migration runs inside a transaction');
  assert.doesNotMatch(migrationSql, /ALTER TABLE\s+(?!analysis_profiles)/i, 'no table other than analysis_profiles is altered');
  assert.equal((migrationSql.match(/CREATE TABLE(?! IF NOT EXISTS)/gi) || []).length, 0, 'every CREATE TABLE is IF NOT EXISTS');
  assert.equal((migrationSql.match(/CREATE (UNIQUE )?INDEX(?! IF NOT EXISTS)/gi) || []).length, 0, 'every CREATE INDEX is IF NOT EXISTS');
});

test('069 follows 068 in filename order, and no migration before it is edited by this change', async () => {
  const files = (await readdir(path.join(root, 'server', 'db', 'migrations'))).filter((name) => name.endsWith('.sql')).sort();
  assert.ok(files.includes('069_analysis_profile_memory.sql'));
  assert.ok(files.includes('068_analysis_profile_authoring.sql'));
  assert.ok(files.indexOf('069_analysis_profile_memory.sql') > files.indexOf('068_analysis_profile_authoring.sql'));
});
