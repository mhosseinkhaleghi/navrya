import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';

// Authoritative AI cost/usage recording (see 037_ai_usage_events_authoritative.sql). Tests the
// real /internal/usage/record route directly (same server-to-server bridge pattern already
// exercised by ai-gateway-wallet.test.mjs for /internal/wallet/*) - this is the write path
// server/pattern-ai-server.mjs calls unconditionally, regardless of AI_WALLET_ENFORCED, so real
// provider cost is captured even in today's rollout-safe (enforcement off) production config.
process.env.INTERNAL_API_SECRET = 'test-internal-secret-please-ignore';

let repo, server, baseUrl;

before(async () => {
  repo = createMemoryRepo();
  server = createApp({ repo, uploadsDir: '/tmp' }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise((resolve) => server.close(resolve)); });

function internalPost(path, body) {
  return fetch(`${baseUrl}/internal${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_API_SECRET },
    body: JSON.stringify(body)
  });
}

test('recording usage for a billed=true call computes real provider cost AND a real retail charge, with a linked ledger key', async () => {
  await repo.providerModelPricing.upsert({ provider: 'openai', model: 'gpt-4o', promptPricePer1k: 0.01, completionPricePer1k: 0.03, enabled: true });
  const response = await internalPost('/usage/record', {
    userId: 'user-1', feature: 'ai.chat', provider: 'openai', model: 'gpt-4o',
    usage: { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
    billed: true, reservationId: 'reservation-abc'
  });
  assert.equal(response.status, 201);
  const record = await response.json();
  assert.equal(record.origin, 'gateway');
  assert.equal(record.model, 'gpt-4o');
  assert.equal(record.providerCostMicroUsd, 25000, '1000 prompt @ $0.01/1k + 500 completion @ $0.03/1k = $0.025');
  assert.ok(record.retailChargeMicroUsd > 0, 'a billed call must carry a real, non-zero retail charge');
  assert.equal(record.linkedLedgerIdempotencyKey, 'ai-settle:reservation-abc');
});

test('recording usage for a billed=false (platform-funded) call still reports real provider cost, but retail charge is zero, never invented', async () => {
  await repo.providerModelPricing.upsert({ provider: 'openai', model: 'gpt-4o-mini', promptPricePer1k: 0.002, completionPricePer1k: 0.006, enabled: true });
  const response = await internalPost('/usage/record', {
    userId: 'user-2', feature: 'ai.chat', provider: 'openai', model: 'gpt-4o-mini',
    usage: { promptTokens: 2000, completionTokens: 1000, totalTokens: 3000 },
    billed: false
  });
  const record = await response.json();
  assert.ok(record.providerCostMicroUsd > 0, 'real cost must still be captured for a platform-funded call');
  assert.equal(record.retailChargeMicroUsd, 0);
  assert.equal(record.linkedLedgerIdempotencyKey, null);
});

test('a request without the internal secret is rejected', async () => {
  const response = await fetch(`${baseUrl}/internal/usage/record`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: 'x' })
  });
  assert.equal(response.status, 403);
});

test('aggregateByModelForUser defaults to origin=gateway and excludes an untrusted client-reported row from real cost reporting', async () => {
  const memRepo = createMemoryRepo();
  await memRepo.usageEvents.create({ userId: 'u1', provider: 'openai', model: 'gpt-4o', promptTokens: 10, completionTokens: 10, totalTokens: 20, source: 'client-report' }); // origin defaults to 'client'
  await memRepo.usageEvents.create({ userId: 'u1', provider: 'openai', model: 'gpt-4o', promptTokens: 100, completionTokens: 50, totalTokens: 150, source: 'gateway-dispatch', origin: 'gateway', providerCostMicroUsd: 5000, retailChargeMicroUsd: 10000 });
  const gatewayOnly = await memRepo.usageEvents.aggregateByModelForUser('u1');
  assert.equal(gatewayOnly.length, 1, 'the default (origin=gateway) aggregation must ignore the client-reported row entirely');
  assert.equal(gatewayOnly[0].totalTokens, 150);
  assert.equal(gatewayOnly[0].providerCostMicroUsd, 5000);
  const clientOnly = await memRepo.usageEvents.aggregateByModelForUser('u1', { origin: 'client' });
  assert.equal(clientOnly[0].totalTokens, 20);
  assert.equal(clientOnly[0].providerCostMicroUsd, 0, 'a client-reported row never carries real cost data');
});

test('aggregateByModel (admin, all users) sums per (provider, model) across users and is also gateway-scoped by default', async () => {
  const memRepo = createMemoryRepo();
  await memRepo.usageEvents.create({ userId: 'u1', provider: 'anthropic', model: 'claude-sonnet-4-5', totalTokens: 100, source: 'gateway-dispatch', origin: 'gateway', providerCostMicroUsd: 3000, retailChargeMicroUsd: 6000 });
  await memRepo.usageEvents.create({ userId: 'u2', provider: 'anthropic', model: 'claude-sonnet-4-5', totalTokens: 200, source: 'gateway-dispatch', origin: 'gateway', providerCostMicroUsd: 4000, retailChargeMicroUsd: 8000 });
  const rows = await memRepo.usageEvents.aggregateByModel();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].calls, 2);
  assert.equal(rows[0].providerCostMicroUsd, 7000);
  assert.equal(rows[0].retailChargeMicroUsd, 14000);
});
