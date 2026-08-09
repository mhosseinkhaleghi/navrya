import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { testToken } from './helpers/auth-token.mjs';

// Exercises the real XP engine (ARCHITECTURE.md Section 11) end-to-end through the actual
// Express app + in-memory repo - the same app.listen(0) + native fetch convention already used
// by account-profile-api-contract.test.mjs - covering the behavior that's new in this pass:
// dedupe-key idempotency, per-source caps, server-side ownership/state re-verification, and the
// mastery-gate endpoint. Points clamping and once-per-user semantics are already covered by the
// existing account-profile-api-contract.test.mjs file and are not repeated here.

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
  if (userId) headers['x-dev-user-id'] = testToken(userId);
  const response = await fetch(baseUrl + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}
async function createUser(name) { return repo.users.create({ displayName: name }); }

test('a repeated dedupeKey is skipped (reason:duplicate) and never double-awards XP', async () => {
  const user = await createUser('Dedupe Tester');
  const first = await api('POST', '/api/users/me/xp-events', { userId: user.id, body: { type: 'first_pattern_bonus', dedupeKey: 'once:first_pattern_bonus' } });
  assert.equal(first.status, 201);
  assert.equal(first.body.xpTotal, 15);
  // first_pattern_bonus is also in ONCE_PER_USER_TYPES, so a repeat is caught earlier (hasType)
  // - use a type that is NOT once-per-user to actually exercise the dedupe-key path itself.
  // trade_calculation_valid is server-verified against a real owned trade record.
  await repo.trades.upsert(user.id, { id: 't1', status: 'hunting' });
  const a = await api('POST', '/api/users/me/xp-events', { userId: user.id, body: { type: 'trade_calculation_valid', sourceType: 'trade', sourceId: 't1', dedupeKey: 'trade.calc:t1' } });
  assert.equal(a.status, 201);
  assert.equal(a.body.xpTotal, 17);
  const b = await api('POST', '/api/users/me/xp-events', { userId: user.id, body: { type: 'trade_calculation_valid', sourceType: 'trade', sourceId: 't1', dedupeKey: 'trade.calc:t1' } });
  assert.equal(b.status, 200);
  assert.equal(b.body.skipped, true);
  assert.equal(b.body.reason, 'duplicate');
  const profile = await api('GET', '/api/users/me/profile', { userId: user.id });
  assert.equal(profile.body.xpTotal, 17, 'the duplicate dedupeKey must not have awarded a second time');
});

test('PER_SOURCE_MAX caps a per-session type at its declared maximum, even across different dedupeKeys', async () => {
  const user = await createUser('Cap Tester');
  const session = await repo.tradingSessions.upsert(user.id, { id: 's1', market: 'London', timeframe: '15m', date: '2026-01-01', entries: [] });
  assert.ok(session.id);
  for (let i = 1; i <= 4; i += 1) {
    await api('POST', '/api/users/me/xp-events', { userId: user.id, body: { type: 'session_chart_entry_added', sourceType: 'session', sourceId: 's1', dedupeKey: 'session.entry:e' + i } });
  }
  const profile = await api('GET', '/api/users/me/profile', { userId: user.id });
  assert.equal(profile.body.xpTotal, 6, 'session_chart_entry_added is capped at 3 per session (2 XP each) - the 4th call must be skipped');
});

test('an event tied to a sourceId the user does not own (or that does not exist) is rejected, never silently awarded', async () => {
  const owner = await createUser('Owner');
  const other = await createUser('Other');
  await repo.trades.upsert(owner.id, { id: 'trade-owned', status: 'closed', exitPrice: 100, pnl: 5 });

  const missing = await api('POST', '/api/users/me/xp-events', { userId: owner.id, body: { type: 'trade_closed_with_pnl', sourceType: 'trade', sourceId: 'does-not-exist', dedupeKey: 'trade.closed:does-not-exist' } });
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error, 'SOURCE_NOT_FOUND');

  const stolen = await api('POST', '/api/users/me/xp-events', { userId: other.id, body: { type: 'trade_closed_with_pnl', sourceType: 'trade', sourceId: 'trade-owned', dedupeKey: 'trade.closed:trade-owned' } });
  assert.equal(stolen.status, 404, 'a trade owned by a different user must look the same as a nonexistent one - never leak ownership');

  const ownProfile = await api('GET', '/api/users/me/profile', { userId: owner.id });
  const otherProfile = await api('GET', '/api/users/me/profile', { userId: other.id });
  assert.equal(ownProfile.body.xpTotal, 0, 'the trade owner never called the endpoint, so no XP was awarded to them either');
  assert.equal(otherProfile.body.xpTotal, 0);
});

test('trade_closed_with_pnl requires the trade to actually be closed with a real exit price and P&L, not just exist', async () => {
  const user = await createUser('State Tester');
  await repo.trades.upsert(user.id, { id: 'trade-open', status: 'open' });
  const result = await api('POST', '/api/users/me/xp-events', { userId: user.id, body: { type: 'trade_closed_with_pnl', sourceType: 'trade', sourceId: 'trade-open', dedupeKey: 'trade.closed:trade-open' } });
  assert.equal(result.status, 409);
  assert.equal(result.body.error, 'STATE_NOT_ELIGIBLE');

  await repo.trades.upsert(user.id, { id: 'trade-open', status: 'closed', exitPrice: 42, pnl: 10 });
  const success = await api('POST', '/api/users/me/xp-events', { userId: user.id, body: { type: 'trade_closed_with_pnl', sourceType: 'trade', sourceId: 'trade-open', dedupeKey: 'trade.closed:trade-open' } });
  assert.equal(success.status, 201);
  assert.equal(success.body.xpTotal, 4);
});

test('pattern_report_generated requires a real 5-sample minimum, verified server-side against actual scenario data, not trusted from the client', async () => {
  const user = await createUser('Report Tester');
  await repo.patterns.upsert(user.id, { id: 'pat1', name: 'Sweep', description: 'x', stages: [{ id: 'st1', order: 1, text: 'a' }] });

  const tooFew = await api('POST', '/api/users/me/xp-events', { userId: user.id, body: { type: 'pattern_report_generated', sourceType: 'pattern', sourceId: 'pat1', dedupeKey: 'pattern.report:pat1' } });
  assert.equal(tooFew.status, 409);
  assert.equal(tooFew.body.error, 'INSUFFICIENT_SAMPLES');

  await repo.tradingSessions.upsert(user.id, {
    id: 'sess1', market: 'London', timeframe: '15m', date: '2026-01-01',
    entries: [{ id: 'entry1', type: 'chart', scenarios: Array.from({ length: 5 }, (_, i) => ({ id: 'scn' + i, pattern: { patternTagId: 'pat1' } })) }]
  });
  const enough = await api('POST', '/api/users/me/xp-events', { userId: user.id, body: { type: 'pattern_report_generated', sourceType: 'pattern', sourceId: 'pat1', dedupeKey: 'pattern.report:pat1' } });
  assert.equal(enough.status, 201);
  assert.equal(enough.body.xpTotal, 10);
});

test('GET /api/users/me/mastery reports the raw XP level and a lower gated level with real, itemized blockers when requirements are not yet met', async () => {
  const user = await createUser('Mastery Tester');
  await repo.users.updateProfile(user.id, {}); // no-op, just confirms the user exists in this repo instance
  const empty = await api('GET', '/api/users/me/mastery', { userId: user.id });
  assert.equal(empty.status, 200);
  assert.equal(empty.body.xpLevel, 1);
  assert.equal(empty.body.gatedLevel, 1);
  assert.deepEqual(empty.body.blockers, []);

  // Push xpTotal to level 2 (100+) without satisfying level 2's activity requirements.
  await repo.xpEvents.record({ userId: user.id, type: 'achievement:manual_test_bonus', domain: null, points: 150, meta: {} });
  const gated = await api('GET', '/api/users/me/mastery', { userId: user.id });
  assert.equal(gated.status, 200);
  assert.equal(gated.body.xpLevel, 2);
  assert.equal(gated.body.gatedLevel, 1, 'raw XP alone must not be sufficient to level up - Section 11.13/11.18');
  assert.ok(gated.body.blockers.length > 0);
  assert.ok(gated.body.blockers.some((b) => b.requirement === 'closedSessions'));
});
