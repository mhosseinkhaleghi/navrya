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

// Real-money subscription rollout: a subscriber's plan-level tokenDiscountPercent (Pro's default
// is 20%) reduces the RETAIL charge at settlement time - never the provider's real cost, never
// the token counts themselves, and never the reservation's own pre-call estimate (which stays a
// conservative hold, true-up always happens here at settle).
test('settleAiCall applies the active plan\'s token discount on top of the standard markup, and it is visible on the ledger entry', async () => {
  const repo = createMemoryRepo();
  await seedPricing(repo);
  const user = await repo.users.create({ displayName: 'Trader' });
  await repo.wallet.grant(user.id, { type: 'ADMIN_CREDIT', cashDeltaMicroUsd: toMicroUsd(10) });
  await repo.subscriptions.create({
    userId: user.id, planId: 'pro', provider: 'manual', status: 'active',
    currentPeriodStart: new Date().toISOString(), currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
    cancelAtPeriodEnd: false, priceAmountMicroUsd: toMicroUsd(14.99), currency: 'usd'
  });

  const gate = await reserveForAiCall(repo, { userId: user.id, feature: 'aiChat', provider: 'openai', model: 'gpt', payload: { input: 'hi' } });
  assert.equal(gate.ok, true);
  const settled = await settleAiCall(repo, { reservationId: gate.reservationId, provider: 'openai', model: 'gpt', feature: 'aiChat', usage: { promptTokens: 1000, completionTokens: 1000 } });
  assert.equal(settled.ok, true);
  // Same provider cost/markup as the undiscounted test above ($0.09 -> $0.27 retail), then Pro's
  // 20% discount: $0.27 * 0.8 = $0.216.
  assert.equal(settled.ledgerEntry.providerCostMicroUsd, toMicroUsd(0.09), 'the real provider cost itself is never discounted');
  assert.equal(settled.ledgerEntry.retailChargeMicroUsd, toMicroUsd(0.216));
  assert.equal(settled.ledgerEntry.tokenDiscountPercent, 20, 'the discount actually applied must be visible on the ledger entry for admin/user transparency');
});

test('once the discounted subscription lapses (back to Free), a later call for the same user is charged full price again', async () => {
  const repo = createMemoryRepo();
  await seedPricing(repo);
  const user = await repo.users.create({ displayName: 'Trader' });
  await repo.wallet.grant(user.id, { type: 'ADMIN_CREDIT', cashDeltaMicroUsd: toMicroUsd(10) });
  await repo.subscriptions.create({
    userId: user.id, planId: 'pro', provider: 'manual', status: 'active',
    // Already expired - entitlement-resolver.mjs re-checks currentPeriodEnd > now() on every read,
    // so this must no longer count as "active" without any extra migration/expire step.
    currentPeriodStart: new Date(Date.now() - 60 * 86400000).toISOString(), currentPeriodEnd: new Date(Date.now() - 30 * 86400000).toISOString(),
    cancelAtPeriodEnd: false, priceAmountMicroUsd: toMicroUsd(14.99), currency: 'usd'
  });

  const gate = await reserveForAiCall(repo, { userId: user.id, feature: 'aiChat', provider: 'openai', model: 'gpt', payload: { input: 'hi' } });
  const settled = await settleAiCall(repo, { reservationId: gate.reservationId, provider: 'openai', model: 'gpt', feature: 'aiChat', usage: { promptTokens: 1000, completionTokens: 1000 } });
  assert.equal(settled.ledgerEntry.retailChargeMicroUsd, toMicroUsd(0.27), 'a lapsed subscription must never keep discounting - full retail applies exactly like a plain Free user');
  assert.equal(settled.ledgerEntry.tokenDiscountPercent, 0);
});

// Production incident: Scenario Map's image generation (gpt-image-1) failed closed with
// PROVIDER_PRICING_NOT_CONFIGURED on every attempt - the wallet pricing system was exclusively
// token-based (prompt/completion price-per-1k), but OpenAI bills image generation per call, and
// the call itself always reports usage:null (no token count to price at all). See
// 046_flat_priced_ai_features.sql and resolvePricingRate()'s own comment.
test('reserveForAiCall + settleAiCall use a flat per-call rate when the model row is flat-priced, ignoring payload size and reporting a fixed cost regardless of usage:null', async () => {
  const repo = createMemoryRepo();
  await repo.providerModelPricing.upsert({ provider: 'openai', model: 'gpt-image-1', flatPricePerCallMicroUsd: toMicroUsd(0.07), currency: 'USD', enabled: true });
  const user = await repo.users.create({ displayName: 'Trader' });
  await repo.wallet.grant(user.id, { type: 'ADMIN_CREDIT', cashDeltaMicroUsd: toMicroUsd(10) });

  // A large payload (simulating a real base64 chart image) must not inflate the flat-rate estimate
  // the way it would for the token-estimate formula.
  const largePayload = { imageDataUrl: 'x'.repeat(500000) };
  const gate = await reserveForAiCall(repo, { userId: user.id, feature: 'sessionScenarioVisualization', provider: 'openai', model: 'gpt-image-1', payload: largePayload });
  assert.equal(gate.ok, true);

  // visualizeScenario() always reports usage:null for this route (brief §35) - settlement must
  // still charge the real flat rate, never fall back to $0 for lack of token usage.
  const settled = await settleAiCall(repo, { reservationId: gate.reservationId, provider: 'openai', model: 'gpt-image-1', feature: 'sessionScenarioVisualization', usage: null });
  assert.equal(settled.ok, true);
  assert.equal(settled.ledgerEntry.providerCostMicroUsd, toMicroUsd(0.07));
  assert.equal(settled.ledgerEntry.retailChargeMicroUsd, toMicroUsd(0.07) * 3); // default global 3x markup
});

test('a flat-priced row with no rate configured still fails closed with PROVIDER_PRICING_NOT_CONFIGURED', async () => {
  const repo = createMemoryRepo();
  const user = await repo.users.create({ displayName: 'Trader' });
  const gate = await reserveForAiCall(repo, { userId: user.id, feature: 'sessionScenarioVisualization', provider: 'openai', model: 'gpt-image-1', payload: {} });
  assert.equal(gate.ok, false);
  assert.equal(gate.reason, 'PROVIDER_PRICING_NOT_CONFIGURED');
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
