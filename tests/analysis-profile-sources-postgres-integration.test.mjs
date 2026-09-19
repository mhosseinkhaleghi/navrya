import assert from 'node:assert/strict';
import test from 'node:test';

// The REAL-PostgreSQL companion to analysis-profile-sources-migration-contract.test.mjs and
// analysis-profile-sources-api-contract.test.mjs - proves migration 070's table really exists and
// that repo.pg.mjs's analysisProfileSources behaves exactly like the memory repository the API
// contract test runs against (ownership, duplicate/limit rules, the PATCH allowlist, cascade on
// profile delete). Skips cleanly (no DATABASE_URL) - `npm test` must never fail or hang because no
// database is reachable, same convention as analysis-profile-memory-postgres-integration.test.mjs.
//
//   DATABASE_URL=postgres://user:pass@host:5432/dbname node --test tests/analysis-profile-sources-postgres-integration.test.mjs
//
// Applies pending migrations, creates users named "APSrcIT ...", and removes only their own rows
// afterward - never touches other data.

const hasDb = !!process.env.DATABASE_URL;

if (!hasDb) {
  test('SKIPPED (no DATABASE_URL) - analysis profile sources PostgreSQL integration', { skip: true }, () => {});
  console.log('analysis-profile-sources-postgres-integration.test.mjs: DATABASE_URL not set - skipped. Set DATABASE_URL to a disposable test Postgres to run this file.');
} else {
  const { createPool } = await import('../server/db/pool.mjs');
  const { run: runMigrations } = await import('../server/db/migrate.mjs');
  const { createPgRepo } = await import('../server/db/repo.pg.mjs');

  let pool, repo, userId, otherId;

  test.before(async () => {
    await runMigrations();
    pool = createPool(process.env.DATABASE_URL);
    repo = createPgRepo(pool);
    userId = (await repo.users.create({ displayName: 'APSrcIT Trader' })).id;
    otherId = (await repo.users.create({ displayName: 'APSrcIT Stranger' })).id;
    await repo.analysisProfiles.upsert(userId, { id: 'apsrc-it-1', name: 'IT', primaryStyleId: 'price_action', secondaryStyleIds: [], focusIds: [] });
  });

  test.after(async () => {
    const swallow = (promise) => promise.catch(() => {});
    if (pool) {
      for (const id of [userId, otherId].filter(Boolean)) {
        await swallow(pool.query('DELETE FROM analysis_profile_sources WHERE user_id=$1', [id]));
        await swallow(pool.query('DELETE FROM analysis_profiles WHERE user_id=$1', [id]));
        await swallow(pool.query('DELETE FROM users WHERE id=$1', [id]));
      }
      await pool.end();
    }
  });

  test('migration 070 is applied: analysis_profile_sources exists with its kind/status CHECKs enforced by the database itself', async () => {
    const { rows } = await pool.query("SELECT 1 FROM information_schema.tables WHERE table_name='analysis_profile_sources'");
    assert.equal(rows.length, 1);
    await assert.rejects(
      () => pool.query("INSERT INTO analysis_profile_sources (id, user_id, profile_id, kind) VALUES ('bad-kind', $1, 'apsrc-it-1', 'bogus')", [userId]),
      /check constraint/i
    );
  });

  test('create()/listByProfile() round-trip a URL source and a PDF source, newest first, with real column mapping', async () => {
    const web = await repo.analysisProfileSources.create(userId, 'apsrc-it-1', { kind: 'website', url: 'https://example.com/a', title: 'A' });
    assert.equal(web.status, 'queued');
    assert.equal(web.fileSizeBytes, null);
    const pdf = await repo.analysisProfileSources.create(userId, 'apsrc-it-1', { kind: 'pdf', title: 'P', status: 'ready' }, { storageObjectId: 'so-1', fileUrl: '/uploads/media/x.pdf', fileName: 'x.pdf', fileSizeBytes: 1234 });
    assert.equal(pdf.fileSizeBytes, 1234, 'BIGINT must come back as a number');
    assert.equal(pdf.storageObjectId, 'so-1');
    const list = await repo.analysisProfileSources.listByProfile(userId, 'apsrc-it-1');
    assert.deepEqual(list.map((s) => s.kind), ['pdf', 'website']);
  });

  test('a duplicate URL is rejected, and a stranger is refused on every method', async () => {
    await assert.rejects(() => repo.analysisProfileSources.create(userId, 'apsrc-it-1', { kind: 'website', url: 'https://example.com/a' }), /ANALYSIS_PROFILE_SOURCE_DUPLICATE/);
    await assert.rejects(() => repo.analysisProfileSources.listByProfile(otherId, 'apsrc-it-1'), /NOT_ANALYSIS_PROFILE_OWNER/);
    await assert.rejects(() => repo.analysisProfileSources.create(otherId, 'apsrc-it-1', { kind: 'website', url: 'https://example.com/z' }), /NOT_ANALYSIS_PROFILE_OWNER/);
  });

  test('update() applies only the allowlisted fields, stamps taught_at once, and clears a stale error code', async () => {
    const [first] = (await repo.analysisProfileSources.listByProfile(userId, 'apsrc-it-1')).filter((s) => s.kind === 'website');
    const failed = await repo.analysisProfileSources.update(userId, 'apsrc-it-1', first.id, { status: 'failed', errorCode: 'SOURCE_TIMEOUT' });
    assert.equal(failed.errorCode, 'SOURCE_TIMEOUT');
    const ready = await repo.analysisProfileSources.update(userId, 'apsrc-it-1', first.id, { status: 'ready', digest: 'text' });
    assert.equal(ready.errorCode, '');
    const taught = await repo.analysisProfileSources.update(userId, 'apsrc-it-1', first.id, { status: 'taught', taughtUnderstandingVersion: 2 });
    assert.ok(taught.taughtAt);
    assert.equal(taught.taughtUnderstandingVersion, 2);
    assert.equal(taught.url, 'https://example.com/a', 'the URL is never patchable');
  });

  test('remove() returns the removed row (so the route can delete a stored file) and is idempotent; deleting the profile cascades the rest', async () => {
    const list = await repo.analysisProfileSources.listByProfile(userId, 'apsrc-it-1');
    const removed = await repo.analysisProfileSources.remove(userId, 'apsrc-it-1', list[0].id);
    assert.equal(removed.id, list[0].id);
    assert.equal(await repo.analysisProfileSources.remove(userId, 'apsrc-it-1', list[0].id), null);
    await repo.analysisProfiles.remove(userId, 'apsrc-it-1');
    const { rows } = await pool.query('SELECT 1 FROM analysis_profile_sources WHERE profile_id=$1', ['apsrc-it-1']);
    assert.equal(rows.length, 0, 'ON DELETE CASCADE removes the child rows');
  });
}
