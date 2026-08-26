import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { reserveForAiCall, settleAiCall, releaseAiCall, toMicroUsd } from '../server/commercial/wallet-service.mjs';
import { invalidateCommercialConfigCache } from '../server/commercial/commercial-config.mjs';

// commercial-config.mjs's effective-config cache is process-wide (by design - one real repo per
// process in production), not per-repo - so across tests in this file, each of which builds its
// OWN fresh createMemoryRepo(), the cache must be invalidated before every test or a later test
// can silently read an earlier test's (now-discarded) repo's cached config.
beforeEach(() => invalidateCommercialConfigCache());

async function seedPricing(repo, provider = 'openai') {
  return repo.providerPricing.upsert({ provider, promptPricePer1k: 0.03, completionPricePer1k: 0.06, monthlyTokenBudget: null });
}

test('a new user is granted exactly the configured signup promo credit once', async () => {
  const repo = createMemoryRepo();
  const user = await repo.users.create({ displayName: 'Trader' });
  const account = await repo.wallet.getAccount(user.id);
  assert.equal(account.promoBalanceMicroUsd, toMicroUsd(0.5)); // spec section 22 default
  assert.equal(account.paidBalanceMicroUsd, 0);
  const ledger = await repo.wallet.ledgerForUser(user.id);
  assert.equal(ledger.filter((e) => e.type === 'PROMO_CREDIT').length, 1);
});

test('reserveForAiCall fails closed with PROVIDER_PRICING_NOT_CONFIGURED when no pricing exists', async () => {
  const repo = createMemoryRepo();
  const user = await repo.users.create({ displayName: 'Trader' });
  const gate = await reserveForAiCall(repo, { userId: user.id, feature: 'aiChat', provider: 'unknown-provider', model: 'x', payload: { input: 'hi' } });
  assert.equal(gate.ok, false);
  assert.equal(gate.reason, 'PROVIDER_PRICING_NOT_CONFIGURED');
});

test('reserveForAiCall fails closed with FEATURE_NOT_ENTITLED when the plan disables ai', async () => {
  const repo = createMemoryRepo();
  await seedPricing(repo);
  await repo.commercialConfig.publish('plan:free:features', { ai: false }, {});
  invalidateCommercialConfigCache();
  const user = await repo.users.create({ displayName: 'Trader' });
  const gate = await reserveForAiCall(repo, { userId: user.id, feature: 'aiChat', provider: 'openai', model: 'gpt', payload: {} });
  assert.equal(gate.ok, false);
  assert.equal(gate.reason, 'FEATURE_NOT_ENTITLED');
});

test('reserveForAiCall fails with WALLET_INSUFFICIENT_BALANCE once the balance is depleted', async () => {
  const repo = createMemoryRepo();
  await seedPricing(repo);
  const user = await repo.users.create({ displayName: 'Trader' });
  await repo.wallet.grant(user.id, { type: 'ADMIN_DEBIT', promoDeltaMicroUsd: -toMicroUsd(0.5) }); // drain the $0.50 signup credit
  const gate = await reserveForAiCall(repo, { userId: user.id, feature: 'aiChat', provider: 'openai', model: 'gpt', payload: { input: 'hi' } });
  assert.equal(gate.ok, false);
  assert.equal(gate.reason, 'WALLET_INSUFFICIENT_BALANCE');
});

test('reserve -> settle spends promo before paid and records the real markup/retail charge', async () => {
  const repo = createMemoryRepo();
  await seedPricing(repo);
  const user = await repo.users.create({ displayName: 'Trader' });
  await repo.wallet.grant(user.id, { type: 'ADMIN_CREDIT', cashDeltaMicroUsd: toMicroUsd(10) }); // plenty of paid balance too
  const gate = await reserveForAiCall(repo, { userId: user.id, feature: 'aiChat', provider: 'openai', model: 'gpt', payload: { input: 'hi' } });
  assert.equal(gate.ok, true);
  assert.equal(gate.markupPercent, 200); // default global markup
  const before = await repo.wallet.getAccount(user.id);

  const settled = await settleAiCall(repo, { reservationId: gate.reservationId, provider: 'openai', model: 'gpt', feature: 'aiChat', usage: { promptTokens: 1000, completionTokens: 1000 } });
  assert.equal(settled.ok, true);
  // provider cost = 1*0.03 + 1*0.06 = $0.09 -> retail at 3x = $0.27
  assert.equal(settled.ledgerEntry.providerCostMicroUsd, toMicroUsd(0.09));
  assert.equal(settled.ledgerEntry.retailChargeMicroUsd, toMicroUsd(0.27));

  const after = await repo.wallet.getAccount(user.id);
  // promo balance (0.50) fully covers the 0.27 charge before paid balance is ever touched
  assert.equal(before.promoBalanceMicroUsd - after.promoBalanceMicroUsd, toMicroUsd(0.27));
  assert.equal(before.paidBalanceMicroUsd, after.paidBalanceMicroUsd);
});

test('settling the same reservation twice never double-charges (idempotent)', async () => {
  const repo = createMemoryRepo();
  await seedPricing(repo);
  const user = await repo.users.create({ displayName: 'Trader' });
  const gate = await reserveForAiCall(repo, { userId: user.id, feature: 'aiChat', provider: 'openai', model: 'gpt', payload: {} });
  const usage = { promptTokens: 500, completionTokens: 500 };
  await settleAiCall(repo, { reservationId: gate.reservationId, provider: 'openai', model: 'gpt', feature: 'aiChat', usage });
  const balanceAfterFirst = await repo.wallet.getAccount(user.id);
  const second = await settleAiCall(repo, { reservationId: gate.reservationId, provider: 'openai', model: 'gpt', feature: 'aiChat', usage });
  assert.equal(second.alreadySettled, true);
  const balanceAfterSecond = await repo.wallet.getAccount(user.id);
  assert.deepEqual(balanceAfterFirst, balanceAfterSecond);
});

test('a released reservation never charges the user (failed provider call)', async () => {
  const repo = createMemoryRepo();
  await seedPricing(repo);
  const user = await repo.users.create({ displayName: 'Trader' });
  const before = await repo.wallet.getAccount(user.id);
  const gate = await reserveForAiCall(repo, { userId: user.id, feature: 'aiChat', provider: 'openai', model: 'gpt', payload: {} });
  await releaseAiCall(repo, gate.reservationId);
  const after = await repo.wallet.getAccount(user.id);
  assert.deepEqual(before, after);
});
