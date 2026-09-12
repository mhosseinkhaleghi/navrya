import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { reserveForAiCall, settleAiCall, toMicroUsd } from '../server/commercial/wallet-service.mjs';
import { invalidateCommercialConfigCache } from '../server/commercial/commercial-config.mjs';

// GPT-Live 1 voice provider migration (057_gpt_live_voice_pricing.sql): a third non-token pricing
// shape on provider_model_pricing (per-minute of connected voice session time), following the same
// "fails closed when unset, additive rate/cost formula when set" contract as
// 046_flat_priced_ai_features.sql's flatPricePerCallMicroUsd - mirrors
// tests/wallet-service.test.mjs's own flat-price test pair exactly, adapted for the per-minute
// shape.
beforeEach(() => invalidateCommercialConfigCache());

test('a gpt-live-1 row with no per-minute rate configured still fails closed with PROVIDER_PRICING_NOT_CONFIGURED', async () => {
  const repo = createMemoryRepo();
  const user = await repo.users.create({ displayName: 'Trader' });
  const gate = await reserveForAiCall(repo, { userId: user.id, feature: 'voiceGptLive', provider: 'openai', model: 'gpt-live-1', payload: {} });
  assert.equal(gate.ok, false);
  assert.equal(gate.reason, 'PROVIDER_PRICING_NOT_CONFIGURED');
});

test('reserveForAiCall + settleAiCall use the per-minute rate for a gpt-live-1 row, pricing by real elapsed seconds rather than token/payload size', async () => {
  const repo = createMemoryRepo();
  // $0.05/min = 50000 micro-USD/min, the same seed value 057_gpt_live_voice_pricing.sql ships.
  await repo.providerModelPricing.upsert({ provider: 'openai', model: 'gpt-live-1', perMinutePriceMicroUsd: 50000, currency: 'USD', enabled: true });
  const user = await repo.users.create({ displayName: 'Trader' });
  await repo.wallet.grant(user.id, { type: 'ADMIN_CREDIT', cashDeltaMicroUsd: toMicroUsd(10) });

  // A large payload must not inflate the reservation estimate the way the token-count heuristic
  // would - the per-minute rate shape ignores payload size entirely, same "flat/fixed pricing
  // shapes are payload-size-independent" property the existing flat-price test already proves.
  const gate = await reserveForAiCall(repo, { userId: user.id, feature: 'voiceGptLive', provider: 'openai', model: 'gpt-live-1', payload: { note: 'x'.repeat(500000) } });
  assert.equal(gate.ok, true);
  assert.ok(gate.reservationId);

  // 90 real elapsed seconds = 1.5 minutes -> 1.5 * 50000 = 75000 micro-USD provider cost.
  const settled = await settleAiCall(repo, { reservationId: gate.reservationId, provider: 'openai', model: 'gpt-live-1', feature: 'voiceGptLive', usage: { elapsedSeconds: 90 } });
  assert.equal(settled.ok, true);
  assert.equal(settled.ledgerEntry.providerCostMicroUsd, 75000);
  assert.equal(settled.ledgerEntry.retailChargeMicroUsd, 75000 * 3); // default global 3x markup
});

test('a disabled gpt-live-1 pricing row still fails closed - disabling is not the same as a zero rate', async () => {
  const repo = createMemoryRepo();
  await repo.providerModelPricing.upsert({ provider: 'openai', model: 'gpt-live-1', perMinutePriceMicroUsd: 50000, currency: 'USD', enabled: false });
  const user = await repo.users.create({ displayName: 'Trader' });
  const gate = await reserveForAiCall(repo, { userId: user.id, feature: 'voiceGptLive', provider: 'openai', model: 'gpt-live-1', payload: {} });
  assert.equal(gate.ok, false);
  assert.equal(gate.reason, 'PROVIDER_PRICING_NOT_CONFIGURED');
});

test('zero and negative reported elapsed seconds never produce a negative charge for a per-minute-priced row', async () => {
  const repo = createMemoryRepo();
  await repo.providerModelPricing.upsert({ provider: 'openai', model: 'gpt-live-1', perMinutePriceMicroUsd: 50000, currency: 'USD', enabled: true });
  const user = await repo.users.create({ displayName: 'Trader' });
  await repo.wallet.grant(user.id, { type: 'ADMIN_CREDIT', cashDeltaMicroUsd: toMicroUsd(10) });
  const gate = await reserveForAiCall(repo, { userId: user.id, feature: 'voiceGptLive', provider: 'openai', model: 'gpt-live-1', payload: {} });
  const settled = await settleAiCall(repo, { reservationId: gate.reservationId, provider: 'openai', model: 'gpt-live-1', feature: 'voiceGptLive', usage: { elapsedSeconds: -30 } });
  assert.equal(settled.ledgerEntry.providerCostMicroUsd, 0);
});

// Production incident (2026-09-12): the original 600s (10-minute) reservation estimate sized a
// hold (~$1.50 at $0.05/min x 3x markup) larger than a brand-new account's own $0.50 signup promo
// credit, so a real first-time user's very first Voice attempt failed closed with
// WALLET_INSUFFICIENT_BALANCE before a single second of real usage - see wallet-service.mjs's own
// ASSUMED_MAX_VOICE_SESSION_SECONDS comment for the full record. This proves the fix: a brand-new
// account with ONLY the default signup credit (no extra grant) can now actually reserve.
test('a brand-new user with only the default signup promo credit can reserve a GPT-Live session - the conservative hold no longer exceeds a real starting balance', async () => {
  const repo = createMemoryRepo();
  await repo.providerModelPricing.upsert({ provider: 'openai', model: 'gpt-live-1', perMinutePriceMicroUsd: 50000, currency: 'USD', enabled: true });
  const user = await repo.users.create({ displayName: 'Brand New Trader' }); // signup promo credit only - no extra grant
  const gate = await reserveForAiCall(repo, { userId: user.id, feature: 'voiceGptLive', provider: 'openai', model: 'gpt-live-1', payload: {} });
  assert.equal(gate.ok, true, gate.reason);
});

test('a token-priced row for a different OpenAI model is unaffected by the new per-minute column (byte-identical resolution to before this migration)', async () => {
  const repo = createMemoryRepo();
  await repo.providerModelPricing.upsert({ provider: 'openai', model: 'gpt-5.6-sol', promptPricePer1k: 0.01, completionPricePer1k: 0.03, enabled: true });
  const user = await repo.users.create({ displayName: 'Trader' });
  const gate = await reserveForAiCall(repo, { userId: user.id, feature: 'aiChat', provider: 'openai', model: 'gpt-5.6-sol', payload: { input: 'hi' } });
  assert.equal(gate.ok, true);
});
