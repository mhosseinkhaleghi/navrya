import assert from 'node:assert/strict';
import test from 'node:test';

// Voice Command Learning Profile addendum, section 10 (PostgreSQL validation) - the OPTIONAL,
// real-Postgres companion to tests/learned-commands-migration-contract.test.mjs's own zero-DB
// structural checks. This repo has no existing Postgres-backed test for ANY domain to build on
// (confirmed via a repo-wide search - see that file's own header comment), so this is a new,
// minimal harness, not an extension of an established one.
//
// Skips cleanly (a single explicit log line, zero assertions run, exit 0) unless DATABASE_URL is
// set - `npm test` must never fail or hang because no real database is reachable in this sandbox.
// To actually run this against a real Postgres instance:
//
//   DATABASE_URL=postgres://user:pass@host:5432/dbname node --test tests/learned-commands-postgres-integration.test.mjs
//
// This applies the real migration chain (server/db/migrate.mjs's own run(), idempotent via its
// schema_migrations tracking) then exercises repo.pg.mjs's learnedCommands domain directly -
// create/find/outcome/enable/delete/cross-user isolation - the same scenarios
// tests/learned-commands-api-contract.test.mjs already proves against repo.memory.mjs, so a real
// divergence between the two backends would show up as a difference between which file passes.
// NOT executed in this session - no DATABASE_URL/reachable Postgres instance in this sandboxed
// environment (see the final report for the exact, honest evidence split).

const hasDb = !!process.env.DATABASE_URL;

if (!hasDb) {
  test('SKIPPED (no DATABASE_URL) - learned_commands PostgreSQL integration', { skip: true }, () => {});
  console.log('learned-commands-postgres-integration.test.mjs: DATABASE_URL not set - skipped. Set DATABASE_URL to a real Postgres instance to run this file.');
} else {
  const { createPool } = await import('../server/db/pool.mjs');
  const { run: runMigrations } = await import('../server/db/migrate.mjs');
  const { createPgRepo } = await import('../server/db/repo.pg.mjs');

  let pool, repo;
  const createdUserIds = [];

  test.before(async () => {
    await runMigrations();
    pool = createPool(process.env.DATABASE_URL);
    repo = createPgRepo(pool);
  });
  test.after(async () => {
    // Best-effort cleanup - never leaves test fixtures behind in a real, possibly-shared database.
    for (const id of createdUserIds) {
      await pool.query('DELETE FROM learned_commands WHERE user_id=$1', [id]).catch(() => {});
      await pool.query('DELETE FROM users WHERE id=$1', [id]).catch(() => {});
    }
    await pool.end();
  });

  async function createUser(name) {
    const user = await repo.users.create({ displayName: name });
    createdUserIds.push(user.id);
    return user;
  }

  test('migration 055 has actually been applied - the real learned_commands table exists with the expected columns', async () => {
    const { rows } = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='learned_commands'`);
    const columns = rows.map((r) => r.column_name);
    ['id', 'user_id', 'normalized_phrase', 'language', 'action_id', 'field_mappings', 'target_strategy', 'source', 'confidence', 'success_count', 'correction_count', 'last_used_at', 'enabled', 'schema_version', 'created_at', 'updated_at']
      .forEach((col) => assert.ok(columns.includes(col), 'missing real column: ' + col));
  });

  test('create/list/find/outcome/enable/delete against the real Postgres backend, matching repo.memory.mjs\'s own identical contract', async () => {
    const user = await createUser('PG Integration Trader');
    const created = await repo.learnedCommands.upsert(user.id, { id: 'pg-lc-1', normalizedPhrase: 'log this trade', language: 'en', actionId: 'trade.wizard', fieldMappings: { direction: 'long' } });
    assert.equal(created.confidence, 60);

    const found = await repo.learnedCommands.findByPhrase(user.id, 'Log This Trade.', 'en');
    assert.equal(found.id, 'pg-lc-1');

    const afterSuccess = await repo.learnedCommands.recordOutcome(user.id, 'pg-lc-1', 'success');
    assert.equal(afterSuccess.confidence, 70);
    assert.equal(afterSuccess.successCount, 1);

    const afterCorrection1 = await repo.learnedCommands.recordOutcome(user.id, 'pg-lc-1', 'correction');
    const afterCorrection2 = await repo.learnedCommands.recordOutcome(user.id, 'pg-lc-1', 'correction');
    assert.equal(afterCorrection2.correctionCount, 2);
    assert.equal(afterCorrection2.enabled, false, 'two corrections auto-disable, matching the deterministic policy');

    const reenabled = await repo.learnedCommands.setEnabled(user.id, 'pg-lc-1', true);
    assert.equal(reenabled.enabled, true);

    const list = await repo.learnedCommands.listByUser(user.id);
    assert.equal(list.length, 1);

    await repo.learnedCommands.remove(user.id, 'pg-lc-1');
    assert.equal((await repo.learnedCommands.listByUser(user.id)).length, 0);
  });

  test('server-side validation rejects an unknown/gated/high-risk action id and a field-mapping key outside the reusable allowlist, against the real database', async () => {
    const user = await createUser('PG Validation Trader');
    await assert.rejects(repo.learnedCommands.upsert(user.id, { id: 'pg-lc-2', normalizedPhrase: 'x', actionId: 'nonexistent.action' }));
    await assert.rejects(repo.learnedCommands.upsert(user.id, { id: 'pg-lc-3', normalizedPhrase: 'x', actionId: 'trade.delete' }));
    await assert.rejects(repo.learnedCommands.upsert(user.id, { id: 'pg-lc-4', normalizedPhrase: 'x', actionId: 'trade.wizard', fieldMappings: { notARealField: '1' } }));
  });

  test('cross-user isolation holds against the real database - user B never sees or can modify user A\'s mapping', async () => {
    const userA = await createUser('PG Owner Trader');
    const userB = await createUser('PG Stranger Trader');
    await repo.learnedCommands.upsert(userA.id, { id: 'pg-lc-5', normalizedPhrase: 'log this trade', actionId: 'trade.wizard' });
    assert.equal(await repo.learnedCommands.get(userB.id, 'pg-lc-5'), null);
    await assert.rejects(repo.learnedCommands.setEnabled(userB.id, 'pg-lc-5', false));
  });

  test('removeAllForUser deletes only that user\'s own rows against the real database', async () => {
    const userA = await createUser('PG Reset Trader');
    const userB = await createUser('PG Reset Untouched Trader');
    await repo.learnedCommands.upsert(userA.id, { id: 'pg-lc-6', normalizedPhrase: 'log this trade', actionId: 'trade.wizard' });
    await repo.learnedCommands.upsert(userB.id, { id: 'pg-lc-7', normalizedPhrase: 'log this trade', actionId: 'trade.wizard' });
    const removed = await repo.learnedCommands.removeAllForUser(userA.id);
    assert.equal(removed, 1);
    assert.equal((await repo.learnedCommands.listByUser(userB.id)).length, 1);
  });
}
