import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Structural contract test against the real 073 migration SQL text - no live Postgres required,
// same precedent as tests/analysis-profile-memory-migration-contract.test.mjs.

const root = process.cwd();
let migrationSql;

test.before(async () => {
  migrationSql = await readFile(path.join(root, 'server', 'db', 'migrations', '073_analysis_profile_sources.sql'), 'utf8');
});

test('073 creates analysis_profile_sources with every required column, FKs cascading on delete', () => {
  const tableMatch = /CREATE TABLE IF NOT EXISTS analysis_profile_sources \(([\s\S]*?)\n\);/.exec(migrationSql);
  assert.ok(tableMatch, 'could not find the real CREATE TABLE statement');
  const body = tableMatch[1];
  const requiredColumns = [
    ['id', /id\s+TEXT PRIMARY KEY/],
    ['user_id', /user_id\s+TEXT NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/],
    ['profile_id', /profile_id\s+TEXT NOT NULL REFERENCES analysis_profiles\(id\) ON DELETE CASCADE/],
    ['kind', /kind\s+TEXT NOT NULL CHECK \(kind IN \('youtube', 'website', 'pdf'\)\)/],
    ['status', /status\s+TEXT NOT NULL DEFAULT 'queued' CHECK \(status IN \('queued', 'ready', 'taught', 'failed'\)\)/],
    ['title', /title\s+TEXT NOT NULL DEFAULT ''/],
    ['url', /url\s+TEXT NOT NULL DEFAULT ''/],
    ['digest', /digest\s+TEXT NOT NULL DEFAULT ''/],
    ['error_code', /error_code\s+TEXT NOT NULL DEFAULT ''/],
    ['storage_object_id', /storage_object_id\s+TEXT,/],
    ['file_url', /file_url\s+TEXT NOT NULL DEFAULT ''/],
    ['file_name', /file_name\s+TEXT NOT NULL DEFAULT ''/],
    ['file_size_bytes', /file_size_bytes\s+BIGINT/],
    ['taught_at', /taught_at\s+TIMESTAMPTZ,/],
    ['taught_understanding_version', /taught_understanding_version\s+INTEGER/],
    ['created_at', /created_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/],
    ['updated_at', /updated_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/]
  ];
  requiredColumns.forEach(([name, re]) => assert.match(body, re, 'missing or malformed column: ' + name));
});

test('the storage object reference is deliberately a loose id (no FK) - the Storage page can delete an object independently and the Knowledge tab reports it', () => {
  assert.doesNotMatch(migrationSql, /storage_object_id\s+TEXT\s+REFERENCES/i);
});

test('the kind and status CHECKs match the shared normalizer exactly, so the database and the API can never disagree', async () => {
  const { SOURCE_KINDS, SOURCE_STATUSES } = await import('../server/db/analysis-profile-normalize.mjs');
  const kinds = /kind\s+TEXT NOT NULL CHECK \(kind IN \(([^)]*)\)\)/.exec(migrationSql)[1].split(',').map((s) => s.trim().replace(/'/g, ''));
  const statuses = /CHECK \(status IN \(([^)]*)\)\)/.exec(migrationSql)[1].split(',').map((s) => s.trim().replace(/'/g, ''));
  assert.deepEqual(kinds, SOURCE_KINDS);
  assert.deepEqual(statuses, SOURCE_STATUSES);
});

test('073 declares a per-profile and a per-user index on analysis_profile_sources', () => {
  assert.match(migrationSql, /CREATE INDEX IF NOT EXISTS idx_analysis_profile_sources_profile ON analysis_profile_sources \(profile_id, created_at\);/);
  assert.match(migrationSql, /CREATE INDEX IF NOT EXISTS idx_analysis_profile_sources_user ON analysis_profile_sources \(user_id\);/);
});

test('073 is additive only: a brand-new table, no destructive statement, no ALTER of any existing table, IF NOT EXISTS everywhere', () => {
  assert.doesNotMatch(migrationSql, /DROP\s+(TABLE|COLUMN|INDEX|SCHEMA)/i);
  assert.doesNotMatch(migrationSql, /\b(TRUNCATE|DELETE\s+FROM|UPDATE\s+\w+\s+SET|INSERT\s+INTO)\b/i, 'no data is rewritten or backfilled');
  assert.doesNotMatch(migrationSql, /CONCURRENTLY/i, 'a plain .sql migration runs inside a transaction');
  assert.doesNotMatch(migrationSql, /ALTER TABLE/i, 'no existing table is altered');
  assert.equal((migrationSql.match(/CREATE TABLE(?! IF NOT EXISTS)/gi) || []).length, 0, 'every CREATE TABLE is IF NOT EXISTS');
  assert.equal((migrationSql.match(/CREATE (UNIQUE )?INDEX(?! IF NOT EXISTS)/gi) || []).length, 0, 'every CREATE INDEX is IF NOT EXISTS');
});

test('073 follows 072 in filename order and is the only migration numbered 073', async () => {
  const files = (await readdir(path.join(root, 'server', 'db', 'migrations'))).filter((name) => name.endsWith('.sql')).sort();
  assert.deepEqual(files.filter((name) => name.startsWith('073_')), ['073_analysis_profile_sources.sql']);
  assert.ok(files.indexOf('073_analysis_profile_sources.sql') > files.indexOf('072_analysis_profile_memory.sql'));
});
