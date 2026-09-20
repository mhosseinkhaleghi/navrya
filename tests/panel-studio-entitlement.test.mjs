import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { reserveForAiCall } from '../server/commercial/wallet-service.mjs';

// The Vibe Coding Panel Studio's server-side entitlement gate: the client-side
// plan.features.aiPanelBuilder check (liveSessionView.jsx) is UX only, this is the authoritative
// one, enforced inside reserveForAiCall() - the one function that already runs, server-side and
// DB-backed, before ANY provider call on every AI_BILLED_ROUTES entry (see
// server/pattern-ai-server.mjs's AI_BILLED_ROUTES map for '/api/ai/panel-builder/generate' ->
// 'aiPanelBuilder').

async function makeUser(repo, plan) {
  const user = await repo.users.create({ displayName: 'Trader ' + plan, email: `trader-${plan}-${Date.now()}-${Math.random()}@example.com` });
  await repo.users.update(user.id, { plan });
  return user;
}

test('a free-plan user is rejected with FEATURE_NOT_ENTITLED before any pricing/provider work happens', async () => {
  const repo = createMemoryRepo();
  const user = await makeUser(repo, 'free');
  const result = await reserveForAiCall(repo, { userId: user.id, feature: 'aiPanelBuilder', provider: 'openai', model: 'gpt-5.6-luna', payload: {} });
  assert.deepEqual(result, { ok: false, reason: 'FEATURE_NOT_ENTITLED' });
});

test('plus and pro plans (aiPanelBuilder:false per commercial-defaults.mjs) are also rejected', async () => {
  const repo = createMemoryRepo();
  for (const plan of ['plus', 'pro']) {
    const user = await makeUser(repo, plan);
    const result = await reserveForAiCall(repo, { userId: user.id, feature: 'aiPanelBuilder', provider: 'openai', model: 'gpt-5.6-luna', payload: {} });
    assert.deepEqual(result, { ok: false, reason: 'FEATURE_NOT_ENTITLED' }, `plan ${plan} must not be entitled`);
  }
});

test('a personalized-plan user (aiPanelBuilder:true) clears the entitlement gate and proceeds to pricing', async () => {
  const repo = createMemoryRepo();
  const user = await makeUser(repo, 'personalized');
  const noPricing = await reserveForAiCall(repo, { userId: user.id, feature: 'aiPanelBuilder', provider: 'openai', model: 'gpt-5.6-luna', payload: {} });
  // Entitled, but no pricing row configured in this bare test repo - proves the entitlement gate
  // itself passed (a different, later reason), not that the whole call was allowed for free.
  assert.equal(noPricing.reason, 'PROVIDER_PRICING_NOT_CONFIGURED', 'must fail on pricing, never on entitlement, once the plan actually has the flag');

  await repo.providerPricing.upsert({ provider: 'openai', promptPricePer1k: 0.03, completionPricePer1k: 0.06, monthlyTokenBudget: null });
  const withPricing = await reserveForAiCall(repo, { userId: user.id, feature: 'aiPanelBuilder', provider: 'openai', model: 'gpt-5.6-luna', payload: {} });
  assert.equal(withPricing.ok, true);
});

test('a feature name that is not itself a features.* key (e.g. an ordinary chat/session-analysis call) is never affected by this gate', async () => {
  const repo = createMemoryRepo();
  const user = await makeUser(repo, 'free');
  await repo.providerPricing.upsert({ provider: 'openai', promptPricePer1k: 0.03, completionPricePer1k: 0.06, monthlyTokenBudget: null });
  const result = await reserveForAiCall(repo, { userId: user.id, feature: 'aiChat', provider: 'openai', model: 'gpt-5.6-luna', payload: {} });
  assert.equal(result.ok, true, 'aiChat is not a features.* key, so a Free user with the generic ai flag must still pass');
});
