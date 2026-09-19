import assert from 'node:assert/strict';
import test from 'node:test';

// The REAL-PostgreSQL companion to analysis-profile-memory-fields.test.mjs and
// analysis-profile-memory-migration-contract.test.mjs - proves migration 068's columns/table
// really exist and round-trip through repo.pg.mjs's own upsert()/analysisProfileEvents, which the
// memory repo cannot show. Skips cleanly (no DATABASE_URL) - `npm test` must never fail or hang
// because no database is reachable, same convention as
// tests/analysis-profile-authoring-postgres-integration.test.mjs.
//
//   DATABASE_URL=postgres://user:pass@host:5432/dbname node --test tests/analysis-profile-memory-postgres-integration.test.mjs
//
// Applies pending migrations, creates one user named "APMemIT ...", and removes only that user's
// own rows afterward - never touches other data.

const hasDb = !!process.env.DATABASE_URL;

if (!hasDb) {
  test('SKIPPED (no DATABASE_URL) - analysis profile engine memory PostgreSQL integration', { skip: true }, () => {});
  console.log('analysis-profile-memory-postgres-integration.test.mjs: DATABASE_URL not set - skipped. Set DATABASE_URL to a disposable test Postgres to run this file.');
} else {
  const { createPool } = await import('../server/db/pool.mjs');
  const { run: runMigrations } = await import('../server/db/migrate.mjs');
  const { createPgRepo } = await import('../server/db/repo.pg.mjs');

  let pool, repo, userId;

  test.before(async () => {
    await runMigrations();
    pool = createPool(process.env.DATABASE_URL);
    repo = createPgRepo(pool);
    const user = await repo.users.create({ displayName: 'APMemIT Trader' });
    userId = user.id;
  });

  test.after(async () => {
    const swallow = (promise) => promise.catch(() => {});
    if (pool && userId) {
      await swallow(pool.query('DELETE FROM analysis_profile_events WHERE user_id=$1', [userId]));
      await swallow(pool.query('DELETE FROM analysis_profiles WHERE user_id=$1', [userId]));
      await swallow(pool.query('DELETE FROM users WHERE id=$1', [userId]));
    }
    if (pool) await pool.end();
  });

  test('migration 068 is applied: analysis_profiles has concepts/understanding (JSONB), and analysis_profile_events exists', async () => {
    const { rows: columns } = await pool.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='analysis_profiles' AND column_name IN ('concepts','understanding')"
    );
    const byName = Object.fromEntries(columns.map((r) => [r.column_name, r]));
    assert.equal(byName.concepts?.data_type, 'jsonb');
    assert.equal(byName.understanding?.data_type, 'jsonb');
    const { rows: tables } = await pool.query("SELECT 1 FROM information_schema.tables WHERE table_name='analysis_profile_events'");
    assert.equal(tables.length, 1);
  });

  test('a real row round-trips concepts/understanding through repo.pg.mjs\'s upsert()/get(), re-normalizing defensively', async () => {
    const saved = await repo.analysisProfiles.upsert(userId, {
      id: 'apmem-it-1', name: 'IT Profile', primaryStyleId: 'price_action', secondaryStyleIds: [], focusIds: [],
      concepts: [{ id: 'cpt-it-1', title: 'Swept liquidity levels', priority: 'mandatory' }, { id: 'cpt-it-1', title: 'duplicate id, dropped' }],
      understanding: { summary: 'Reads price action first.', version: 3 }
    });
    assert.equal(saved.concepts.length, 1, 'the duplicate id must be dropped server-side');
    assert.equal(saved.concepts[0].priority, 'mandatory');
    assert.equal(saved.understanding.version, 3);

    const reloaded = await repo.analysisProfiles.get(userId, 'apmem-it-1');
    assert.deepEqual(reloaded.concepts, saved.concepts);
    assert.deepEqual(reloaded.understanding, saved.understanding);
  });

  test('an omitted concepts/understanding on upsert defaults to the empty shape, never null/undefined', async () => {
    const saved = await repo.analysisProfiles.upsert(userId, { id: 'apmem-it-2', name: 'Bare', primaryStyleId: 'general_analysis', secondaryStyleIds: [], focusIds: [] });
    assert.deepEqual(saved.concepts, []);
    assert.deepEqual(saved.understanding, { summary: '', version: 0, updatedAt: null });
  });

  test('analysisProfileEvents.create()/listByProfile() really persist and query real rows, ordered newest first, ownership enforced', async () => {
    await repo.analysisProfiles.upsert(userId, { id: 'apmem-it-3', name: 'Events Profile', primaryStyleId: 'price_action', secondaryStyleIds: [], focusIds: [] });
    await repo.analysisProfileEvents.create(userId, 'apmem-it-3', { kind: 'note', title: 'First' });
    await repo.analysisProfileEvents.create(userId, 'apmem-it-3', { kind: 'concept_added', title: 'Second', tokenUsage: { promptTokens: 50 } });

    const events = await repo.analysisProfileEvents.listByProfile(userId, 'apmem-it-3');
    assert.equal(events.length, 2);
    assert.equal(events[0].title, 'Second', 'newest event must come first');
    assert.equal(events[0].tokenUsage.promptTokens, 50);

    const other = await repo.users.create({ displayName: 'APMemIT Stranger' });
    await assert.rejects(() => repo.analysisProfileEvents.listByProfile(other.id, 'apmem-it-3'), /NOT_ANALYSIS_PROFILE_OWNER/);
    await pool.query('DELETE FROM users WHERE id=$1', [other.id]);
  });
}
