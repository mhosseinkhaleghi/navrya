import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { resolveUserEntitlements } from '../server/commercial/entitlement-resolver.mjs';
import { resolveStorageQuotaBytes } from '../server/commercial/storage-service.mjs';
import { activateOrRenewSubscription, cancelAtPeriodEnd, expireSubscription } from '../server/commercial/subscription-service.mjs';
import { invalidateCommercialConfigCache } from '../server/commercial/commercial-config.mjs';

beforeEach(() => invalidateCommercialConfigCache());

async function activatePlus(repo, userId) {
  return activateOrRenewSubscription(repo, {
    userId, provider: 'manual', amountMicroUsd: 4990000, currency: 'USD',
    metadata: { planId: 'plus', billingInterval: 'month' }
  });
}

test('activating Plus removes the Free commercial record limits', async () => {
  const repo = createMemoryRepo();
  const user = await repo.users.create({ displayName: 'Trader' });
  const before = await resolveUserEntitlements(user.id, repo);
  assert.equal(before.limits.patterns, 3);

  await activatePlus(repo, user.id);
  const after = await resolveUserEntitlements(user.id, repo);
  assert.equal(after.plan, 'plus');
  assert.equal(after.limits.patterns, null);
  assert.equal(after.limits.sessions, null);
});

test('Plus gives the configured 10 GB storage quota (base plan quota, config-driven)', async () => {
  const repo = createMemoryRepo();
  const user = await repo.users.create({ displayName: 'Trader' });
  await activatePlus(repo, user.id);
  const quota = await resolveStorageQuotaBytes(repo, user.id);
  assert.equal(quota, 10737418240);
});

test('cancelAtPeriodEnd preserves the plan until currentPeriodEnd, then it expires', async () => {
  const repo = createMemoryRepo();
  const user = await repo.users.create({ displayName: 'Trader' });
  const subscription = await activatePlus(repo, user.id);

  await cancelAtPeriodEnd(repo, subscription.id);
  const stillPlus = await resolveUserEntitlements(user.id, repo);
  assert.equal(stillPlus.plan, 'plus'); // currentPeriodEnd is still ~1 month out

  // Simulate the period actually ending, without any cron - entitlement resolution is entirely
  // read-time (see entitlement-resolver.mjs's own comment), so moving current_period_end into the
  // past is enough on its own.
  await repo.subscriptions.update(subscription.id, { currentPeriodEnd: new Date(Date.now() - 1000).toISOString() });
  const afterLapse = await resolveUserEntitlements(user.id, repo);
  assert.equal(afterLapse.plan, 'free');
});

test('an expired Plus subscription falls back to Free limits', async () => {
  const repo = createMemoryRepo();
  const user = await repo.users.create({ displayName: 'Trader' });
  const subscription = await activatePlus(repo, user.id);
  await expireSubscription(repo, subscription.id);
  const entitlements = await resolveUserEntitlements(user.id, repo);
  assert.equal(entitlements.plan, 'free');
  assert.equal(entitlements.limits.patterns, 3);
});

test('a Plus->Free downgrade never deletes existing records - only blocks creating a new one', async () => {
  const repo = createMemoryRepo();
  const user = await repo.users.create({ displayName: 'Trader' });
  const subscription = await activatePlus(repo, user.id);
  await repo.instrumentCatalog.upsert(user.id, { id: 'instr-1', code: 'XAUUSD' });
  // Create 5 patterns - well over Free's limit of 3 - while still on Plus (unlimited).
  for (let i = 0; i < 5; i += 1) {
    await repo.patterns.upsert(user.id, { id: 'pattern-' + i, name: 'P' + i, instruments: ['XAUUSD'] });
  }
  await expireSubscription(repo, subscription.id);

  // All 5 remain fully intact and readable.
  const patterns = await repo.patterns.listByUser(user.id);
  assert.equal(patterns.length, 5);
  const single = await repo.patterns.get(user.id, 'pattern-0');
  assert.ok(single);
});
