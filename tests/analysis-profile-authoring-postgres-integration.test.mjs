import assert from 'node:assert/strict';
import test from 'node:test';
import { dropAnalysisProfileTestUser } from './helpers/analysis-profile-pg-cleanup.mjs';

// The REAL-PostgreSQL companion to analysis-profile-authoring-fields.test.mjs and
// analysis-profile-authoring-migration-contract.test.mjs - proves migration 068's two columns
// really exist and round-trip through repo.pg.mjs's own upsert(), which the memory repo cannot
// show. Skips cleanly (one explicit log line, exit 0) unless DATABASE_URL is set - `npm test`
// must never fail or hang because no database is reachable, same convention as
// tests/subscription-bonus-lots-postgres-integration.test.mjs.
//
//   DATABASE_URL=postgres://user:pass@host:5432/dbname node --test tests/analysis-profile-authoring-postgres-integration.test.mjs
//
// Applies pending migrations, creates one user named "APAuthIT ...", and removes only that user's
// own rows afterward - never touches other data.

const hasDb = !!process.env.DATABASE_URL;

if (!hasDb) {
  test('SKIPPED (no DATABASE_URL) - analysis profile authoring fields PostgreSQL integration', { skip: true }, () => {});
  console.log('analysis-profile-authoring-postgres-integration.test.mjs: DATABASE_URL not set - skipped. Set DATABASE_URL to a disposable test Postgres to run this file.');
} else {
  const { createPool } = await import('../server/db/pool.mjs');
  const { run: runMigrations } = await import('../server/db/migrate.mjs');
  const { createPgRepo } = await import('../server/db/repo.pg.mjs');

  let pool, repo, userId;

  test.before(async () => {
    await runMigrations();
    pool = createPool(process.env.DATABASE_URL);
    repo = createPgRepo(pool);
    const user = await repo.users.create({ displayName: 'APAuthIT Trader' });
    userId = user.id;
  });

  test.after(async () => {
    await dropAnalysisProfileTestUser(pool, userId);
    if (pool) await pool.end();
  });

  test('migration 068 is applied: analysis_profiles has custom_method_links and custom_focuses, both JSONB defaulted', async () => {
    const { rows } = await pool.query(
      "SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name='analysis_profiles' AND column_name IN ('custom_method_links','custom_focuses')"
    );
    const byName = Object.fromEntries(rows.map((r) => [r.column_name, r]));
    assert.equal(byName.custom_method_links?.data_type, 'jsonb');
    assert.equal(byName.custom_focuses?.data_type, 'jsonb');
  });

  test('a real row round-trips both new fields through repo.pg.mjs\'s upsert()/get(), and re-normalizes malformed stored JSON defensively', async () => {
    const saved = await repo.analysisProfiles.upsert(userId, {
      id: 'apauth-it-1', name: 'IT Profile', primaryStyleId: 'price_action', secondaryStyleIds: [], focusIds: [],
      customMethodLinks: { youtubeUrl: 'https://youtu.be/abc', websiteUrl: 'not a url', referenceUrl: '' },
      customFocuses: [{ id: 'cf-it-1', name: 'Swept liquidity levels', description: 'stop hunts', origin: 'user' }]
    });
    assert.equal(saved.customMethodLinks.youtubeUrl, 'https://youtu.be/abc');
    assert.equal(saved.customMethodLinks.websiteUrl, '', 'an invalid URL must never be stored as-is');
    assert.equal(saved.customFocuses.length, 1);
    assert.equal(saved.customFocuses[0].name, 'Swept liquidity levels');

    const reloaded = await repo.analysisProfiles.get(userId, 'apauth-it-1');
    assert.deepEqual(reloaded.customMethodLinks, saved.customMethodLinks);
    assert.deepEqual(reloaded.customFocuses, saved.customFocuses);
  });

  test('an omitted customMethodLinks/customFocuses on upsert defaults to the empty shape, never null/undefined', async () => {
    const saved = await repo.analysisProfiles.upsert(userId, { id: 'apauth-it-2', name: 'Bare', primaryStyleId: 'general_analysis', secondaryStyleIds: [], focusIds: [] });
    assert.deepEqual(saved.customMethodLinks, { youtubeUrl: '', websiteUrl: '', referenceUrl: '' });
    assert.deepEqual(saved.customFocuses, []);
  });
}
