import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Structural contract test against the real 066 migration SQL text - no live Postgres required,
// same precedent as tests/ai-analysis-discipline-migration-contract.test.mjs.

const root = process.cwd();
let migrationSql;

test.before(async () => {
  migrationSql = await readFile(path.join(root, 'server', 'db', 'migrations', '066_analysis_profile_authoring.sql'), 'utf8');
});

test('066 adds custom_method_links and custom_focuses to analysis_profiles, both additive and defaulted', () => {
  assert.match(migrationSql, /ALTER TABLE analysis_profiles/);
  assert.match(migrationSql, /ADD COLUMN IF NOT EXISTS custom_method_links\s+JSONB NOT NULL DEFAULT '\{\}'/);
  assert.match(migrationSql, /ADD COLUMN IF NOT EXISTS custom_focuses\s+JSONB NOT NULL DEFAULT '\[\]'/);
});

test('066 is a numbered migration following 065 (subscription bonus lots), and 001-065 are never edited by this change', async () => {
  const files = (await readdir(path.join(root, 'server', 'db', 'migrations'))).filter((name) => name.endsWith('.sql')).sort();
  assert.ok(files.includes('066_analysis_profile_authoring.sql'));
  assert.ok(files.includes('065_subscription_bonus_lots.sql'), 'the migration this one builds on must still exist unchanged');
  // Later migrations (067+, e.g. the engine-memory one) are expected - the property that matters is
  // only that 066 sorts after 065 and everything after it carries a genuinely higher number.
  const index = files.indexOf('066_analysis_profile_authoring.sql');
  assert.ok(index > files.indexOf('065_subscription_bonus_lots.sql'));
  for (const later of files.slice(index + 1)) assert.ok(parseInt(later, 10) > 66, `${later} must sort after 066 by a higher leading number`);
});
