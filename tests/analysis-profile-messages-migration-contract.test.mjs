import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Structural contract test against the real 071 migration SQL text - no live Postgres required, same
// precedent as tests/analysis-profile-sources-migration-contract.test.mjs.

const root = process.cwd();
let migrationSql;

test.before(async () => {
  migrationSql = await readFile(path.join(root, 'server', 'db', 'migrations', '071_analysis_profile_messages.sql'), 'utf8');
});

test('071 creates analysis_profile_messages with every required column, FKs cascading on delete', () => {
  const tableMatch = /CREATE TABLE IF NOT EXISTS analysis_profile_messages \(([\s\S]*?)\n\);/.exec(migrationSql);
  assert.ok(tableMatch, 'could not find the real CREATE TABLE statement');
  const body = tableMatch[1];
  const requiredColumns = [
    ['id', /id\s+TEXT PRIMARY KEY/],
    ['user_id', /user_id\s+TEXT NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/],
    ['profile_id', /profile_id\s+TEXT NOT NULL REFERENCES analysis_profiles\(id\) ON DELETE CASCADE/],
    ['role', /role\s+TEXT NOT NULL CHECK \(role IN \('user', 'assistant'\)\)/],
    ['content', /content\s+TEXT NOT NULL DEFAULT ''/],
    ['proposals', /proposals\s+JSONB NOT NULL DEFAULT '\[\]'/],
    ['token_usage', /token_usage\s+JSONB,/],
    ['created_at', /created_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/]
  ];
  requiredColumns.forEach(([name, re]) => assert.match(body, re, 'missing or malformed column: ' + name));
});

test('the role CHECK matches the shared normalizer exactly, so the database and the API can never disagree', async () => {
  const { MESSAGE_ROLES } = await import('../server/db/analysis-profile-normalize.mjs');
  const roles = /CHECK \(role IN \(([^)]*)\)\)/.exec(migrationSql)[1].split(',').map((s) => s.trim().replace(/'/g, ''));
  assert.deepEqual(roles, MESSAGE_ROLES);
});

test('071 declares a per-profile (with created_at, for ordering) and a per-user index', () => {
  assert.match(migrationSql, /CREATE INDEX IF NOT EXISTS idx_analysis_profile_messages_profile ON analysis_profile_messages \(profile_id, created_at\);/);
  assert.match(migrationSql, /CREATE INDEX IF NOT EXISTS idx_analysis_profile_messages_user ON analysis_profile_messages \(user_id\);/);
});

test('071 is additive only: a brand-new table, no destructive statement, no ALTER of any existing table, IF NOT EXISTS everywhere', () => {
  assert.doesNotMatch(migrationSql, /DROP\s+(TABLE|COLUMN|INDEX|SCHEMA)/i);
  assert.doesNotMatch(migrationSql, /\b(TRUNCATE|DELETE\s+FROM|UPDATE\s+\w+\s+SET|INSERT\s+INTO)\b/i, 'no data is rewritten or backfilled');
  assert.doesNotMatch(migrationSql, /CONCURRENTLY/i, 'a plain .sql migration runs inside a transaction');
  assert.doesNotMatch(migrationSql, /ALTER TABLE/i, 'no existing table is altered');
  assert.equal((migrationSql.match(/CREATE TABLE(?! IF NOT EXISTS)/gi) || []).length, 0, 'every CREATE TABLE is IF NOT EXISTS');
  assert.equal((migrationSql.match(/CREATE (UNIQUE )?INDEX(?! IF NOT EXISTS)/gi) || []).length, 0, 'every CREATE INDEX is IF NOT EXISTS');
});

test('071 follows 070 in filename order and is the only migration numbered 071', async () => {
  const files = (await readdir(path.join(root, 'server', 'db', 'migrations'))).filter((name) => name.endsWith('.sql')).sort();
  assert.deepEqual(files.filter((name) => name.startsWith('071_')), ['071_analysis_profile_messages.sql']);
  assert.ok(files.indexOf('071_analysis_profile_messages.sql') > files.indexOf('070_analysis_profile_sources.sql'));
});
