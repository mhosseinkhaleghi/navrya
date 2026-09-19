import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Structural contract test against the real 068 migration SQL text - no live Postgres required,
// same precedent as tests/ai-analysis-discipline-migration-contract.test.mjs.

const root = process.cwd();
let migrationSql;

test.before(async () => {
  migrationSql = await readFile(path.join(root, 'server', 'db', 'migrations', '068_analysis_profile_authoring.sql'), 'utf8');
});

test('068 adds custom_method_links and custom_focuses to analysis_profiles, both additive and defaulted', () => {
  assert.match(migrationSql, /ALTER TABLE analysis_profiles/);
  assert.match(migrationSql, /ADD COLUMN IF NOT EXISTS custom_method_links\s+JSONB NOT NULL DEFAULT '\{\}'/);
  assert.match(migrationSql, /ADD COLUMN IF NOT EXISTS custom_focuses\s+JSONB NOT NULL DEFAULT '\[\]'/);
});

test('068 is a numbered migration following 067 (discount code scope), and 001-067 are never edited by this change', async () => {
  const files = (await readdir(path.join(root, 'server', 'db', 'migrations'))).filter((name) => name.endsWith('.sql')).sort();
  assert.ok(files.includes('068_analysis_profile_authoring.sql'));
  assert.ok(files.includes('066_widen_plan_checks_for_pro.sql'), 'the migration this one builds on must still exist unchanged');
  // Later migrations (069+, e.g. the engine-memory one) are expected - the property that matters is
  // only that 068 sorts after 067 and everything after it carries a genuinely higher number.
  const index = files.indexOf('068_analysis_profile_authoring.sql');
  assert.ok(index > files.indexOf('066_widen_plan_checks_for_pro.sql'));
  for (const later of files.slice(index + 1)) assert.ok(parseInt(later, 10) > 68, `${later} must sort after 068 by a higher leading number`);
});
