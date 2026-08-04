import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { getEffectiveXpConfig, invalidateXpConfigCache } from '../server/community/xp-config.mjs';
import { POINTS_BY_TYPE } from '../server/community/xp-rules.mjs';
import { LEVEL_REQUIREMENTS, blockersForLevel } from '../server/community/mastery-rules.mjs';

// Admin-editable XP configuration (ARCHITECTURE.md Section 11's Admin Panel "XP & Segmentation"
// tab) - covers the repo domain, the cached defaults-plus-overrides merge, and the actual admin
// routes, including that an admin's edit really changes what POST /me/xp-events awards, not just
// a reporting view. Same app.listen(0) + native fetch convention as the other *-api-contract
// test files.

let server, baseUrl, repo;

before(async () => {
  delete process.env.ADMIN_AUTH_ENFORCED;
  repo = createMemoryRepo();
  server = createApp({ repo, uploadsDir: '/tmp' }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

async function api(method, path, { body, userId } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (userId) headers['x-dev-user-id'] = userId;
  const response = await fetch(baseUrl + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}
async function createUser(name) { return api('POST', '/api/users', { body: { displayName: name } }).then((r) => r.body); }

test('repo.xpConfig.set/list/remove round-trips a natural-key override', async () => {
  const memRepo = createMemoryRepo();
  assert.deepEqual(await memRepo.xpConfig.list(), []);
  await memRepo.xpConfig.set('points:session_created', { points: 9 }, 'admin-1');
  const rows = await memRepo.xpConfig.list();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].key, 'points:session_created');
  assert.deepEqual(rows[0].value, { points: 9 });
  // Upsert by natural key - a second set() replaces, never duplicates.
  await memRepo.xpConfig.set('points:session_created', { points: 3 }, 'admin-1');
  assert.equal((await memRepo.xpConfig.list()).length, 1);
  assert.equal((await memRepo.xpConfig.list())[0].value.points, 3);
  await memRepo.xpConfig.remove('points:session_created');
  assert.deepEqual(await memRepo.xpConfig.list(), []);
});

test('getEffectiveXpConfig merges an override on top of the code default without mutating other types', async () => {
  const memRepo = createMemoryRepo();
  invalidateXpConfigCache();
  const before2 = await getEffectiveXpConfig(memRepo);
  assert.equal(before2.points.session_created, POINTS_BY_TYPE.session_created);

  await memRepo.xpConfig.set('points:session_created', { points: 99 }, null);
  invalidateXpConfigCache();
  const after2 = await getEffectiveXpConfig(memRepo);
  assert.equal(after2.points.session_created, 99, 'the overridden type reflects the admin value');
  assert.equal(after2.points.trade_closed_with_pnl, POINTS_BY_TYPE.trade_closed_with_pnl, 'an unrelated type is untouched');
});

test('getEffectiveXpConfig merges a nested mastery requirement (domainXpMin:psychology) without disturbing sibling requirements', async () => {
  const memRepo = createMemoryRepo();
  invalidateXpConfigCache();
  await memRepo.xpConfig.set('mastery:4:domainXpMin:psychology', { value: 250 }, null);
  invalidateXpConfigCache();
  const cfg = await getEffectiveXpConfig(memRepo);
  assert.equal(cfg.masteryRequirements[4].domainXpMin.psychology, 250);
  assert.equal(cfg.masteryRequirements[4].closedSessions, LEVEL_REQUIREMENTS[4].closedSessions, 'sibling requirement on the same level is untouched');
  assert.equal(cfg.masteryRequirements[2].closedSessions, LEVEL_REQUIREMENTS[2].closedSessions, 'a different level is untouched');
});

test('blockersForLevel honors a custom requirementsTable when passed, defaults to LEVEL_REQUIREMENTS when omitted', async () => {
  const snapshot = { closedSessions: 1, reviewedTrades: 0, reflections: 0, tradePlans: 0, domainBreakdown: {}, xpTotal: 100 };
  const defaultBlockers = blockersForLevel(2, snapshot);
  assert.ok(defaultBlockers.some((b) => b.requirement === 'closedSessions'));
  const relaxed = { 2: { closedSessions: 1 } };
  const relaxedBlockers = blockersForLevel(2, snapshot, relaxed);
  assert.equal(relaxedBlockers.length, 0, 'a custom, relaxed requirements table must actually be honored, not silently ignored');
});

test('GET /api/admin/xp/config lists every type with default/current/overridden, and reflects a prior override', async () => {
  const admin = await createUser('Config Admin');
  // A type not touched by any other test in this file - every test below shares one repo/server
  // instance (see the file-level before()), so each test uses its own dedicated type/level to
  // stay isolated rather than resetting shared state.
  await repo.xpConfig.set('points:trade_linked', { points: 7 }, admin.id);
  invalidateXpConfigCache();
  const result = await api('GET', '/api/admin/xp/config', { userId: admin.id });
  assert.equal(result.status, 200);
  const row = result.body.points.find((r) => r.type === 'trade_linked');
  assert.ok(row);
  assert.equal(row.default, POINTS_BY_TYPE.trade_linked);
  assert.equal(row.current, 7);
  assert.equal(row.overridden, true);
  const untouched = result.body.points.find((r) => r.type === 'session_created');
  assert.equal(untouched.overridden, false);
  assert.equal(untouched.current, untouched.default);
});

test('POST /api/admin/xp/config rejects an unknown type/category (never lets an admin invent a new XP source)', async () => {
  const admin = await createUser('Config Admin 2');
  const badType = await api('POST', '/api/admin/xp/config', { userId: admin.id, body: { category: 'points', key: 'made_up_type', value: 5 } });
  assert.equal(badType.status, 400);
  assert.equal(badType.body.error, 'UNKNOWN_XP_CONFIG_TARGET');
  const badCategory = await api('POST', '/api/admin/xp/config', { userId: admin.id, body: { category: 'not_a_real_category', key: 'x', value: 5 } });
  assert.equal(badCategory.status, 400);
});

test('an admin override to a XP point value actually changes what POST /me/xp-events awards a trader, end to end', async () => {
  const admin = await createUser('Config Admin 3');
  const trader = await createUser('Config Trader');
  await repo.trades.upsert(trader.id, { id: 't-before', status: 'hunting' });
  await repo.trades.upsert(trader.id, { id: 't-after', status: 'hunting' });
  const before2 = await api('POST', '/api/users/me/xp-events', { userId: trader.id, body: { type: 'trade_calculation_valid', sourceType: 'trade', sourceId: 't-before', dedupeKey: 'trade.calc:t-before' } });
  assert.equal(before2.status, 201);
  assert.equal(before2.body.xpTotal, POINTS_BY_TYPE.trade_calculation_valid);

  // Kept well under SOURCE_TOTAL_CAP.trade (18) - a single event exceeding a different trade's
  // own point ceiling is already covered by the source_total_cap behavior other tests exercise;
  // this test is specifically about the override value itself taking effect.
  const set = await api('POST', '/api/admin/xp/config', { userId: admin.id, body: { category: 'points', key: 'trade_calculation_valid', value: 11 } });
  assert.equal(set.status, 201);

  const after2 = await api('POST', '/api/users/me/xp-events', { userId: trader.id, body: { type: 'trade_calculation_valid', sourceType: 'trade', sourceId: 't-after', dedupeKey: 'trade.calc:t-after' } });
  assert.equal(after2.status, 201);
  assert.equal(after2.body.xpTotal - before2.body.xpTotal, 11, 'the second award must use the admin-overridden value, not the code default');
});

test('DELETE /api/admin/xp/config resets an override back to the code default, verified via the real award amount', async () => {
  const admin = await createUser('Config Admin 4');
  const trader = await createUser('Config Trader 2');
  await repo.trades.upsert(trader.id, { id: 't-reset', status: 'hunting' });
  await api('POST', '/api/admin/xp/config', { userId: admin.id, body: { category: 'points', key: 'trade_calculation_valid', value: 1 } });
  const reset = await api('DELETE', '/api/admin/xp/config?category=points&key=trade_calculation_valid', { userId: admin.id });
  assert.equal(reset.status, 200);
  assert.equal(reset.body.removed, true);
  const result = await api('POST', '/api/users/me/xp-events', { userId: trader.id, body: { type: 'trade_calculation_valid', sourceType: 'trade', sourceId: 't-reset', dedupeKey: 'trade.calc:t-reset' } });
  assert.equal(result.body.xpTotal, POINTS_BY_TYPE.trade_calculation_valid, 'after reset, the award must be back to the code default');
});

test('an admin override to a mastery requirement actually changes GET /me/mastery blockers, end to end', async () => {
  const admin = await createUser('Config Admin 5');
  const trader = await createUser('Mastery Trader');
  await repo.xpEvents.record({ userId: trader.id, type: 'achievement:manual_test_bonus', domain: null, points: 150, meta: {} });
  const before2 = await api('GET', '/api/users/me/mastery', { userId: trader.id });
  assert.equal(before2.body.xpLevel, 2);
  assert.equal(before2.body.gatedLevel, 1, 'level 2 requires 2 closed sessions (among other things) by default - none exist yet');
  assert.ok(before2.body.blockers.some((b) => b.requirement === 'closedSessions' && b.need === 2));

  // Relax every one of level 2's requirements (closedSessions/reviewedTrades/reflections/
  // tradePlans) to 0 via the admin route - only then should the gate actually open, proving the
  // override is read on the real award/gate path, not just displayed differently in the admin UI.
  for (const requirementKey of ['closedSessions', 'reviewedTrades', 'reflections', 'tradePlans']) {
    const result = await api('POST', '/api/admin/xp/config', { userId: admin.id, body: { category: 'mastery', key: '2:' + requirementKey, value: 0 } });
    assert.equal(result.status, 201);
  }
  const after2 = await api('GET', '/api/users/me/mastery', { userId: trader.id });
  assert.equal(after2.body.gatedLevel, 2, 'once every level-2 requirement is relaxed to 0, the gate must actually open');
  assert.deepEqual(after2.body.blockers, []);
});
