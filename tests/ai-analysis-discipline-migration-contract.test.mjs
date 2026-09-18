import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Structural contract test against the real migration SQL text - no live Postgres required, same
// precedent as tests/session-entry-images-migration-contract.test.mjs.

const root = process.cwd();
let migrationSql;

test.before(async () => {
  migrationSql = await readFile(path.join(root, 'server', 'db', 'migrations', '063_ai_analysis_discipline.sql'), 'utf8');
});

test('063 creates session_ai_analysis_completions with every required column', () => {
  const tableMatch = /CREATE TABLE IF NOT EXISTS session_ai_analysis_completions \(([\s\S]*?)\n\);/.exec(migrationSql);
  assert.ok(tableMatch, 'could not find the real CREATE TABLE statement');
  const body = tableMatch[1];
  const requiredColumns = [
    ['id', /id\s+TEXT PRIMARY KEY/],
    ['user_id', /user_id\s+TEXT NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/],
    ['session_id', /session_id\s+TEXT NOT NULL REFERENCES trading_sessions\(id\) ON DELETE CASCADE/],
    ['entry_id', /entry_id\s+TEXT,/],
    ['analysis_id', /analysis_id\s+TEXT NOT NULL/],
    ['analysis_type', /analysis_type\s+TEXT,/],
    ['provider', /provider\s+TEXT,/],
    ['model', /model\s+TEXT,/],
    ['source', /source\s+TEXT NOT NULL DEFAULT 'live' CHECK \(source IN \('live','backfill'\)\)/],
    ['occurred_at', /occurred_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/],
    ['created_at', /created_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/],
    ['unique analysis_id', /UNIQUE \(analysis_id\)/]
  ];
  requiredColumns.forEach(([name, re]) => assert.match(body, re, 'missing or malformed column: ' + name));
});

test('063 declares a per-user-day index and a per-session index on session_ai_analysis_completions', () => {
  assert.match(migrationSql, /CREATE INDEX IF NOT EXISTS session_ai_analysis_completions_user_day_idx ON session_ai_analysis_completions \(user_id, occurred_at\);/);
  assert.match(migrationSql, /CREATE INDEX IF NOT EXISTS session_ai_analysis_completions_session_idx ON session_ai_analysis_completions \(session_id\);/);
});

test('063 creates user_discipline_settings as a one-row-per-user timezone table', () => {
  const tableMatch = /CREATE TABLE IF NOT EXISTS user_discipline_settings \(([\s\S]*?)\n\);/.exec(migrationSql);
  assert.ok(tableMatch, 'could not find the real CREATE TABLE statement');
  const body = tableMatch[1];
  assert.match(body, /user_id\s+TEXT PRIMARY KEY REFERENCES users\(id\) ON DELETE CASCADE/);
  assert.match(body, /timezone\s+TEXT NOT NULL DEFAULT 'UTC'/);
});

test('the migration is purely additive - never touches any pre-existing table', () => {
  assert.doesNotMatch(migrationSql, /ALTER TABLE/);
  assert.doesNotMatch(migrationSql, /DROP (TABLE|COLUMN|INDEX)/i);
});

test('063 is the only migration file claiming that number', async () => {
  const files = (await readdir(path.join(root, 'server', 'db', 'migrations'))).filter((f) => f.endsWith('.sql'));
  const own = files.filter((f) => f.startsWith('063_'));
  assert.equal(own.length, 1, 'exactly one migration file must claim number 063');
  assert.equal(own[0], '063_ai_analysis_discipline.sql');
});
