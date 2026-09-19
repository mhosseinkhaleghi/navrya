import assert from 'node:assert/strict';
import test from 'node:test';
import { dropAnalysisProfileTestUser } from './helpers/analysis-profile-pg-cleanup.mjs';

// The REAL-PostgreSQL companion to analysis-profile-messages-migration-contract.test.mjs and
// analysis-profile-messages-api-contract.test.mjs - proves migration 071's table really exists and that
// repo.pg.mjs's analysisProfileMessages behaves exactly like the memory repository the API contract test runs
// against (ownership, atomic ordered batches, the rolling cap, immutable words / resolve-once proposals,
// cascade on profile delete). The ordering test matters most here: a multi-row INSERT with the column default
// now() would give a user message and its reply the SAME timestamp. Skips cleanly (no DATABASE_URL) - `npm
// test` must never fail or hang because no database is reachable.
//
//   DATABASE_URL=postgres://user:pass@host:5432/dbname node --test tests/analysis-profile-messages-postgres-integration.test.mjs
//
// Applies pending migrations, creates users named "APMsgIT ...", and removes only their own rows afterward.

const hasDb = !!process.env.DATABASE_URL;

if (!hasDb) {
  test('SKIPPED (no DATABASE_URL) - analysis profile messages PostgreSQL integration', { skip: true }, () => {});
  console.log('analysis-profile-messages-postgres-integration.test.mjs: DATABASE_URL not set - skipped. Set DATABASE_URL to a disposable test Postgres to run this file.');
} else {
  const { createPool } = await import('../server/db/pool.mjs');
  const { run: runMigrations } = await import('../server/db/migrate.mjs');
  const { createPgRepo } = await import('../server/db/repo.pg.mjs');
  const { MESSAGES_PER_PROFILE_MAX } = await import('../server/db/analysis-profile-normalize.mjs');

  let pool, repo, userId;
  // A stranger never needs to exist as a user: ownership is checked against the profile row and refused first.
  const otherId = 'apmsg-it-stranger';

  test.before(async () => {
    await runMigrations();
    pool = createPool(process.env.DATABASE_URL);
    repo = createPgRepo(pool);
    userId = (await repo.users.create({ displayName: 'APMsgIT Trader' })).id;
    await repo.analysisProfiles.upsert(userId, { id: 'apmsg-it-1', name: 'IT', primaryStyleId: 'price_action', secondaryStyleIds: [], focusIds: [] });
  });

  test.after(async () => {
    await dropAnalysisProfileTestUser(pool, userId);
    if (pool) await pool.end();
  });

  test('migration 071 is applied: analysis_profile_messages exists with its role CHECK enforced by the database itself', async () => {
    const { rows } = await pool.query("SELECT 1 FROM information_schema.tables WHERE table_name='analysis_profile_messages'");
    assert.equal(rows.length, 1);
    await assert.rejects(
      () => pool.query("INSERT INTO analysis_profile_messages (id, user_id, profile_id, role) VALUES ('bad-role', $1, 'apmsg-it-1', 'system')", [userId]),
      /check constraint/i
    );
  });

  test('append() stores a user message and its reply in order (strictly increasing timestamps), and list() returns them oldest first with real column mapping', async () => {
    const saved = await repo.analysisProfileMessages.append(userId, 'apmsg-it-1', [
      { role: 'user', content: 'I wait for a sweep.' },
      { role: 'assistant', content: 'Understood.', tokenUsage: { promptTokens: 50, completionTokens: 10 }, proposals: [{ id: 'p1', kind: 'concept', title: 'Swept liquidity', priority: 'mandatory' }] }
    ]);
    assert.deepEqual(saved.map((m) => m.role), ['user', 'assistant']);
    assert.ok(new Date(saved[1].createdAt) > new Date(saved[0].createdAt), 'a reply must sort after its message');
    const list = await repo.analysisProfileMessages.listByProfile(userId, 'apmsg-it-1');
    assert.deepEqual(list.map((m) => m.role), ['user', 'assistant']);
    assert.deepEqual(list[1].tokenUsage, { promptTokens: 50, completionTokens: 10 });
    assert.equal(list[1].proposals[0].status, 'pending');
  });

  test('a batch is atomic: a valid message followed by an invalid one stores neither', async () => {
    const before = (await repo.analysisProfileMessages.listByProfile(userId, 'apmsg-it-1')).length;
    await assert.rejects(() => repo.analysisProfileMessages.append(userId, 'apmsg-it-1', [{ role: 'user', content: 'valid' }, { role: 'assistant', content: '' }]), /VALIDATION_FAILED/);
    assert.equal((await repo.analysisProfileMessages.listByProfile(userId, 'apmsg-it-1')).length, before);
  });

  test('a stranger is refused on every method', async () => {
    await assert.rejects(() => repo.analysisProfileMessages.listByProfile(otherId, 'apmsg-it-1'), /NOT_ANALYSIS_PROFILE_OWNER/);
    await assert.rejects(() => repo.analysisProfileMessages.append(otherId, 'apmsg-it-1', [{ role: 'user', content: 'x' }]), /NOT_ANALYSIS_PROFILE_OWNER/);
    await assert.rejects(() => repo.analysisProfileMessages.clear(otherId, 'apmsg-it-1'), /NOT_ANALYSIS_PROFILE_OWNER/);
  });

  test('updateProposalStatuses resolves each proposal once and never touches the words', async () => {
    const list = await repo.analysisProfileMessages.listByProfile(userId, 'apmsg-it-1');
    const reply = list.find((m) => m.role === 'assistant');
    const applied = await repo.analysisProfileMessages.updateProposalStatuses(userId, 'apmsg-it-1', reply.id, { p1: 'applied' });
    assert.equal(applied.proposals[0].status, 'applied');
    assert.equal(applied.content, 'Understood.');
    const flipped = await repo.analysisProfileMessages.updateProposalStatuses(userId, 'apmsg-it-1', reply.id, { p1: 'dismissed' });
    assert.equal(flipped.proposals[0].status, 'applied', 'a resolved proposal is final');
    const user = list.find((m) => m.role === 'user');
    await assert.rejects(() => repo.analysisProfileMessages.updateProposalStatuses(userId, 'apmsg-it-1', user.id, { p1: 'applied' }), /ANALYSIS_PROFILE_MESSAGE_NOT_FOUND/);
  });

  test('the log is rolled to the latest cap, oldest dropped first', async () => {
    await repo.analysisProfiles.upsert(userId, { id: 'apmsg-it-roll', name: 'Roll', primaryStyleId: 'price_action', secondaryStyleIds: [], focusIds: [] });
    for (let i = 0; i < 101; i += 1) {
      await repo.analysisProfileMessages.append(userId, 'apmsg-it-roll', [{ role: 'user', content: `q${i}` }, { role: 'assistant', content: `a${i}` }]);
    }
    const list = await repo.analysisProfileMessages.listByProfile(userId, 'apmsg-it-roll');
    assert.equal(list.length, MESSAGES_PER_PROFILE_MAX);
    assert.equal(list[0].content, 'q1', 'the two oldest of 202 (q0 and a0) were trimmed');
    assert.equal(list[list.length - 1].content, 'a100');
  });

  test('order is a fact of the data: back-to-back appends stay strictly ordered, and a clock that steps back cannot sort a new message before an old one', async () => {
    await repo.analysisProfiles.upsert(userId, { id: 'apmsg-it-order', name: 'Order', primaryStyleId: 'price_action', secondaryStyleIds: [], focusIds: [] });
    for (let i = 0; i < 25; i += 1) {
      await repo.analysisProfileMessages.append(userId, 'apmsg-it-order', [{ role: 'user', content: `q${i}` }, { role: 'assistant', content: `a${i}` }]);
    }
    const list = await repo.analysisProfileMessages.listByProfile(userId, 'apmsg-it-order');
    assert.deepEqual(list.map((m) => m.content), Array.from({ length: 25 }, (_, i) => [`q${i}`, `a${i}`]).flat());
    const realNow = Date.now;
    try {
      // repo.pg.mjs returns a native pg Date object for createdAt (the whole file's own convention -
      // it JSON-serializes to a real ISO string over HTTP, but calling the repo directly here means
      // Date.parse would stringify it via Date.prototype.toString() first and silently drop the
      // milliseconds; new Date(dateObject) copies the value exactly instead.
      Date.now = () => new Date(list[list.length - 1].createdAt).getTime() - 60000;
      await repo.analysisProfileMessages.append(userId, 'apmsg-it-order', [{ role: 'user', content: 'after-clock-step-back' }]);
    } finally { Date.now = realNow; }
    const after = await repo.analysisProfileMessages.listByProfile(userId, 'apmsg-it-order');
    assert.equal(after[after.length - 1].content, 'after-clock-step-back');
  });

  test('two simultaneous appends to one conversation are serialised on the profile row: both land, whole turns, never interleaved or tied', async () => {
    await repo.analysisProfiles.upsert(userId, { id: 'apmsg-it-race', name: 'Race', primaryStyleId: 'price_action', secondaryStyleIds: [], focusIds: [] });
    await Promise.all([0, 1, 2, 3].map((n) => repo.analysisProfileMessages.append(userId, 'apmsg-it-race', [{ role: 'user', content: `q${n}` }, { role: 'assistant', content: `a${n}` }])));
    const list = await repo.analysisProfileMessages.listByProfile(userId, 'apmsg-it-race');
    assert.equal(list.length, 8);
    for (let i = 0; i < list.length; i += 2) {
      assert.equal(list[i].role, 'user');
      assert.equal(list[i + 1].role, 'assistant');
      assert.equal(list[i + 1].content, list[i].content.replace('q', 'a'), 'a reply must directly follow its own question');
    }
    const stamps = list.map((m) => new Date(m.createdAt).getTime()); // see the note above on Date.parse vs a real Date object
    for (let i = 1; i < stamps.length; i += 1) assert.ok(stamps[i] > stamps[i - 1]);
  });

  test('clear() removes only that profile\'s conversation, and deleting the profile cascades the rest', async () => {
    assert.ok(await repo.analysisProfileMessages.clear(userId, 'apmsg-it-roll') > 0);
    assert.equal((await repo.analysisProfileMessages.listByProfile(userId, 'apmsg-it-roll')).length, 0);
    assert.ok((await repo.analysisProfileMessages.listByProfile(userId, 'apmsg-it-1')).length > 0, 'the other profile is untouched');
    await repo.analysisProfiles.remove(userId, 'apmsg-it-1');
    const { rows } = await pool.query('SELECT 1 FROM analysis_profile_messages WHERE profile_id=$1', ['apmsg-it-1']);
    assert.equal(rows.length, 0, 'ON DELETE CASCADE removes the child rows');
  });
}
