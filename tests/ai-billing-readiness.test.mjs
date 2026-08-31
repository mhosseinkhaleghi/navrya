import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { authHeadersFor } from './helpers/auth-token.mjs';

// AI billing operational fix (tasks A/E) - the two confirmed gaps found while diagnosing the
// production "openai/gpt-5.6, real calls, $0.00000 cost" symptom that are covered here:
//   1. An enabled pricing row with both prices at exactly 0 used to be silently accepted
//      (resolvePricingRate() treats 0 as "configured", never "missing") - this would make every
//      provider-funded call under that row free forever, undetected.
//   2. No Admin surface existed to see WHY a real, actively-used provider/model has $0 cost.
// Mirrors commercial-admin-api-contract.test.mjs's own createApp()/repo.memory.mjs convention.

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
  if (userId) Object.assign(headers, await authHeadersFor(repo, userId));
  const response = await fetch(baseUrl + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}
async function createAdmin(name) {
  const user = await repo.users.create({ displayName: name });
  return repo.users.update(user.id, { role: 'admin' });
}

test('an enabled provider_model_pricing row with both prices at 0 is rejected (ZERO_PRICE_NOT_ALLOWED)', async () => {
  const admin = await createAdmin('Zero Price Admin');
  const result = await api('POST', '/api/admin/commercial/provider-pricing', {
    userId: admin.id, body: { provider: 'openai', model: 'gpt-5.6', promptPricePer1k: 0, completionPricePer1k: 0, enabled: true }
  });
  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'ZERO_PRICE_NOT_ALLOWED');
  assert.equal(await repo.providerModelPricing.get('openai', 'gpt-5.6'), null, 'the rejected row must never be persisted');
});

// Production incident (046_flat_priced_ai_features.sql): the flat, non-token per-call rate
// (gpt-image-1-style pricing) needs the exact same zero-price guard as the token-priced pair
// above - an enabled row saved at exactly $0/call would silently make every provider-funded call
// in that pricing mode free forever.
test('an enabled provider_model_pricing row with flatPricePerCallUsd at 0 is rejected (ZERO_PRICE_NOT_ALLOWED)', async () => {
  const admin = await createAdmin('Zero Flat Price Admin');
  const result = await api('POST', '/api/admin/commercial/provider-pricing', {
    userId: admin.id, body: { provider: 'openai', model: 'gpt-image-1', flatPricePerCallUsd: 0, enabled: true }
  });
  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'ZERO_PRICE_NOT_ALLOWED');
  assert.equal(await repo.providerModelPricing.get('openai', 'gpt-image-1'), null, 'the rejected row must never be persisted');
});

test('a real flatPricePerCallUsd is accepted and stored converted to micro-USD', async () => {
  const admin = await createAdmin('Flat Price Admin');
  const result = await api('POST', '/api/admin/commercial/provider-pricing', {
    userId: admin.id, body: { provider: 'openai', model: 'gpt-image-1', flatPricePerCallUsd: 0.07, enabled: true }
  });
  assert.equal(result.status, 201);
  const row = await repo.providerModelPricing.get('openai', 'gpt-image-1');
  assert.equal(row.flatPricePerCallMicroUsd, 70000);
});

test('a DISABLED provider_model_pricing row with both prices at 0 is allowed (a draft the admin has not turned on yet)', async () => {
  const admin = await createAdmin('Draft Zero Price Admin');
  const result = await api('POST', '/api/admin/commercial/provider-pricing', {
    userId: admin.id, body: { provider: 'openai', model: 'gpt-5.6-preview', promptPricePer1k: 0, completionPricePer1k: 0, enabled: false }
  });
  assert.equal(result.status, 201);
});

test('a provider_model_pricing row left entirely unconfigured (null+null) still correctly fails closed at call time - never conflated with the zero-price case', async () => {
  // Simply never creating the row is the "unconfigured" case - resolvePricingRate() and
  // reserveForAiCall() already cover this (wallet-service.test.mjs's own
  // PROVIDER_PRICING_NOT_CONFIGURED test); this asserts the two failure modes stay distinguishable
  // from the admin route's own perspective: an explicit null+null save is accepted (it's just
  // "nothing set yet"), unlike an explicit 0+0 save.
  const admin = await createAdmin('Null Price Admin');
  const result = await api('POST', '/api/admin/commercial/provider-pricing', {
    userId: admin.id, body: { provider: 'anthropic', model: 'claude-sonnet-4-5', enabled: true }
  });
  assert.equal(result.status, 201);
  const row = await repo.providerModelPricing.get('anthropic', 'claude-sonnet-4-5');
  assert.equal(row.promptPricePer1k, null);
  assert.equal(row.completionPricePer1k, null);
});

test('the provider-level fallback (POST /admin/ai/pricing) rejects the same zero-priced shape', async () => {
  const admin = await createAdmin('Zero Provider Price Admin');
  const result = await api('POST', '/api/admin/ai/pricing', {
    userId: admin.id, body: { provider: 'deepseek', promptPricePer1k: 0, completionPricePer1k: 0 }
  });
  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'ZERO_PRICE_NOT_ALLOWED');
});

test('billing readiness reflects the exact reported production symptom: real usage, no pricing, priceConfigured false - then true once pricing is added', async () => {
  const admin = await createAdmin('Readiness Admin');
  // Simulates the 6 real, already-recorded openai/gpt-5.6 calls with $0 cost (no pricing existed
  // yet) - written directly via the same repo method /internal/usage/record itself calls.
  for (let i = 0; i < 6; i += 1) {
    await repo.usageEvents.create({
      userId: admin.id, provider: 'openai', model: 'gpt-5.6', feature: 'aiChat',
      promptTokens: 100, completionTokens: 50, totalTokens: 150, source: 'gateway-dispatch', origin: 'gateway',
      providerCostMicroUsd: 0, retailChargeMicroUsd: 0
    });
  }
  const before = await api('GET', '/api/admin/commercial/billing-readiness', { userId: admin.id });
  assert.equal(before.status, 200);
  const beforeRow = before.body.pricing.find((row) => row.provider === 'openai' && row.model === 'gpt-5.6');
  assert.ok(beforeRow, 'the actively-used openai/gpt-5.6 pair must be surfaced even with zero cost');
  assert.equal(beforeRow.calls, 6);
  assert.equal(beforeRow.priceConfigured, false, 'this is exactly the reported production symptom - real calls, no resolvable price');
  assert.equal(beforeRow.providerCostMicroUsd, 0);

  await repo.providerModelPricing.upsert({ provider: 'openai', model: 'gpt-5.6', promptPricePer1k: 0.01, completionPricePer1k: 0.03, currency: 'USD', enabled: true });
  const after = await api('GET', '/api/admin/commercial/billing-readiness', { userId: admin.id });
  const afterRow = after.body.pricing.find((row) => row.provider === 'openai' && row.model === 'gpt-5.6');
  assert.equal(afterRow.priceConfigured, true, 'once pricing is configured, readiness must reflect it immediately - no cache/restart needed');

  // The 6 historical zero-cost rows themselves are never touched/backfilled by adding pricing
  // later - only NEW calls after configuration will show non-zero cost.
  assert.equal(afterRow.providerCostMicroUsd, 0, 'historical zero-cost rows must remain unchanged - no implicit backfill');
});

test('billing readiness reports walletEnforced and internalApiSecretConfigured from real env state', async () => {
  const admin = await createAdmin('Env State Admin');
  const originalEnforced = process.env.AI_WALLET_ENFORCED;
  const originalSecret = process.env.INTERNAL_API_SECRET;
  try {
    process.env.AI_WALLET_ENFORCED = 'true';
    delete process.env.INTERNAL_API_SECRET;
    const result = await api('GET', '/api/admin/commercial/billing-readiness', { userId: admin.id });
    assert.equal(result.body.walletEnforced, true);
    assert.equal(result.body.internalApiSecretConfigured, false);
  } finally {
    if (originalEnforced === undefined) delete process.env.AI_WALLET_ENFORCED; else process.env.AI_WALLET_ENFORCED = originalEnforced;
    if (originalSecret === undefined) delete process.env.INTERNAL_API_SECRET; else process.env.INTERNAL_API_SECRET = originalSecret;
  }
});

test('a non-admin cannot read billing readiness or write pricing', async () => {
  const user = await repo.users.create({ displayName: 'Regular User' });
  const readResult = await api('GET', '/api/admin/commercial/billing-readiness', { userId: user.id });
  assert.equal(readResult.status, 403);
  const writeResult = await api('POST', '/api/admin/commercial/provider-pricing', { userId: user.id, body: { provider: 'openai', model: 'gpt-5.6', promptPricePer1k: 0.01 } });
  assert.equal(writeResult.status, 403);
});
