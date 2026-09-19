import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Structural contract test against the real 072 migration SQL text - no live Postgres required, same
// precedent as tests/analysis-profile-messages-migration-contract.test.mjs.

const root = process.cwd();
let sql;
test.before(async () => { sql = await readFile(path.join(root, 'server', 'db', 'migrations', '072_session_analysis_profile_attribution.sql'), 'utf8'); });

test('072 adds exactly the four attribution columns to session_ai_analysis_completions, all NULLABLE and IF NOT EXISTS', () => {
  assert.match(sql, /ALTER TABLE session_ai_analysis_completions/);
  for (const [name, type] of [['analysis_profile_id', 'TEXT'], ['analysis_profile_revision', 'TEXT'], ['active_market_session', 'TEXT'], ['concept_coverage', 'JSONB']]) {
    assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS ${name}\\s+${type}(,|;)`), `${name} must be an additive ${type} column`);
  }
  const columnLines = sql.split('\n').filter((line) => /ADD COLUMN/.test(line));
  assert.equal(columnLines.length, 4);
  columnLines.forEach((line) => assert.doesNotMatch(line, /NOT NULL|DEFAULT/, 'existing rows must simply get NULLs - nothing is back-filled or guessed'));
});

test('analysis_profile_id is a LOOSE reference with no foreign key: deleting a profile must never delete (and so un-earn) the completions that drive the AI Analysis Discipline streak', () => {
  assert.doesNotMatch(sql, /REFERENCES/i, 'no column in this migration may reference another table');
  assert.doesNotMatch(sql, /ON DELETE/i);
});

test('072 declares the partial per-profile index that backs GET .../:id/usage', () => {
  assert.match(sql, /CREATE INDEX IF NOT EXISTS session_ai_analysis_completions_profile_idx\s+ON session_ai_analysis_completions \(analysis_profile_id, occurred_at\)\s+WHERE analysis_profile_id IS NOT NULL;/);
});

test('072 is additive only: no destructive statement, no data rewrite, only the one existing table is altered, IF NOT EXISTS everywhere', () => {
  assert.doesNotMatch(sql, /DROP\s+(TABLE|COLUMN|INDEX|SCHEMA)/i);
  assert.doesNotMatch(sql, /\b(TRUNCATE|DELETE\s+FROM|UPDATE\s+\w+\s+SET|INSERT\s+INTO)\b/i, 'no data is rewritten or backfilled');
  assert.doesNotMatch(sql, /CONCURRENTLY/i, 'a plain .sql migration runs inside a transaction');
  const alters = [...sql.matchAll(/ALTER TABLE\s+(?:IF EXISTS\s+)?(\w+)/gi)].map((m) => m[1]);
  assert.deepEqual(alters, ['session_ai_analysis_completions']);
  assert.equal((sql.match(/CREATE TABLE/gi) || []).length, 0);
  assert.equal((sql.match(/CREATE (UNIQUE )?INDEX(?! IF NOT EXISTS)/gi) || []).length, 0);
});

test('the market-session values the server can stamp are exactly the four the real clock returns', async () => {
  const { currentMarketSession } = await import('../server/community/market-session-clock.mjs');
  const seen = new Set();
  for (let hour = 0; hour < 24; hour += 1) seen.add(currentMarketSession(new Date(Date.UTC(2026, 0, 5, hour, 30))));
  assert.deepEqual([...seen].sort(), ['London', 'New York', 'Sydney', 'Tokyo']);
});

test('072 follows 071 in filename order and is the only migration numbered 072', async () => {
  const files = (await readdir(path.join(root, 'server', 'db', 'migrations'))).filter((name) => name.endsWith('.sql')).sort();
  assert.deepEqual(files.filter((name) => name.startsWith('072_')), ['072_session_analysis_profile_attribution.sql']);
  assert.ok(files.indexOf('072_session_analysis_profile_attribution.sql') > files.indexOf('071_analysis_profile_messages.sql'));
});
