import assert from 'node:assert/strict';
import test, { after, afterEach, before } from 'node:test';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';

// AI billing operational fix (task B) - the confirmed, explicitly-documented gap this closes:
// "no background sweep in this slice" (server/db/repo.pg.mjs's own comment on wallet.reserve()).
// A real, already-paid provider call whose settle/usage-record call never got through would
// otherwise strand its reservation as 'pending' forever, silently counting against that same
// user's available balance. Covers both halves of the fix: the bounded in-process retry
// (internalWalletCallWithRetry, pattern-ai-server.mjs) and the stale-reservation release sweep
// (repo.memory.mjs/repo.pg.mjs's releaseStalePendingReservations()).

process.env.INTERNAL_API_SECRET = 'test-internal-secret-please-ignore';
process.env.PATTERN_AI_PORT = '0';
process.env.COMMUNITY_API_URL = 'http://127.0.0.1:9';

let aiServer, internalWalletCallWithRetry;
before(async () => {
  const aiModule = await import('../server/pattern-ai-server.mjs');
  aiServer = aiModule.default;
  internalWalletCallWithRetry = aiModule.internalWalletCallWithRetry;
  if (!aiServer.listening) await new Promise((resolve) => aiServer.once('listening', resolve));
});
after(() => aiServer.close());

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test('internalWalletCallWithRetry succeeds on the 2nd attempt after one transient failure, never surfacing the first failure', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) throw new Error('ECONNRESET'); // simulates a Community API restart mid-call
    return { ok: true, json: async () => ({ id: 'usageEvent-1', providerCostMicroUsd: 1000 }) };
  };
  const result = await internalWalletCallWithRetry('/internal/usage/record', { userId: 'u1' });
  assert.equal(calls, 2, 'must retry exactly once after the first transient failure');
  assert.equal(result.id, 'usageEvent-1');
});

test('internalWalletCallWithRetry gives up after exhausting all attempts on a persistent outage', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error('ECONNREFUSED'); };
  const result = await internalWalletCallWithRetry('/internal/wallet/settle', { reservationId: 'r1' }, 3);
  assert.equal(calls, 3);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'WALLET_SERVICE_UNAVAILABLE');
});

test('internalWalletCallWithRetry never retries a definitive business answer (e.g. WALLET_INSUFFICIENT_BALANCE) - a single call only', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return { ok: true, json: async () => ({ ok: false, reason: 'WALLET_INSUFFICIENT_BALANCE', availableMicroUsd: 0 }) };
  };
  const result = await internalWalletCallWithRetry('/internal/wallet/reserve', { userId: 'u1' });
  assert.equal(calls, 1, 'a real business answer must never be retried');
  assert.equal(result.reason, 'WALLET_INSUFFICIENT_BALANCE');
});

test('releaseStalePendingReservations releases a pending reservation older than the threshold, with an AI_RELEASE ledger row and no charge', async () => {
  const repo = createMemoryRepo();
  const user = await repo.users.create({ displayName: 'Stale Reservation Tester' });
  const { reservation } = await repo.wallet.reserve(user.id, { estimatedRetailMicroUsd: 500000, provider: 'openai', model: 'gpt-5.6', feature: 'aiChat' });
  const before = await repo.wallet.getAccount(user.id);

  // A negative threshold means "older than 1s in the future" - true for any already-committed
  // row with a full second of margin (avoids a same-millisecond race against Date.now() that a
  // literal 0 threshold could hit under load), letting this test verify the sweep deterministically
  // without waiting out the real 10-minute default.
  await repo.wallet.releaseStalePendingReservations(user.id, -1000);

  const after = await repo.wallet.getAccount(user.id);
  assert.deepEqual(after, before, 'a release must never move the balance, only free the hold');
  const ledger = await repo.wallet.ledgerForUser(user.id);
  const release = ledger.find((entry) => entry.metadata && entry.metadata.reservationId === reservation.id);
  assert.ok(release, 'a released stale reservation must leave a real AI_RELEASE ledger row');
  assert.equal(release.type, 'AI_RELEASE');
  assert.equal(release.metadata.reason, 'stale');
});

test('a fresh pending reservation is left untouched by the real (10-minute) default threshold', async () => {
  const repo = createMemoryRepo();
  const user = await repo.users.create({ displayName: 'Fresh Reservation Tester' });
  await repo.wallet.grant(user.id, { type: 'ADMIN_CREDIT', cashDeltaMicroUsd: 2000000, sourceAction: 'test-grant' }); // enough for both reservations below
  await repo.wallet.reserve(user.id, { estimatedRetailMicroUsd: 500000, provider: 'openai', model: 'gpt-5.6', feature: 'aiChat' });
  // A second reserve() call runs the SAME lazy sweep this task adds - the first reservation is
  // only a moment old, so it must survive and still count against available balance.
  const second = await repo.wallet.reserve(user.id, { estimatedRetailMicroUsd: 500000, provider: 'openai', model: 'gpt-5.6', feature: 'aiChat' });
  assert.equal(second.ok, true);
  const ledger = await repo.wallet.ledgerForUser(user.id);
  assert.equal(ledger.filter((entry) => entry.type === 'AI_RELEASE').length, 0, 'nothing should have been swept away yet');
});
