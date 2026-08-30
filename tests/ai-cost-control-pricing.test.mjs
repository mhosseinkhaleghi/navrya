import assert from 'node:assert/strict';
import test, { after, afterEach } from 'node:test';
import { costMicroUsdFor, resolvePricingRate, settleAiCall } from '../server/commercial/wallet-service.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';

// Importing server/pattern-ai-server.mjs has a real side effect: it calls server.listen(...) at
// module scope (intentional - that file is normally run directly via `npm run dev:api`). Mirrors
// tests/ai-gateway.test.mjs's own established convention exactly: grab the exported default
// (the http.Server instance) and close it in `after()` so this test file's process can exit.
const serverModule = await import('../server/pattern-ai-server.mjs');
const { callOpenAI, callAnthropic } = serverModule;
after(() => { serverModule.default.close(); });

// --- costMicroUsdFor: cached/cache-write pricing dimensions ---------------------------------

test('costMicroUsdFor is byte-identical to the pre-cache-dimension formula when no cached/cache-write tokens are present', () => {
  const rate = { promptPricePer1k: 1, completionPricePer1k: 2, cachedInputPricePer1k: 0.1, cacheWriteInputPricePer1k: 1.25 };
  const withoutCache = costMicroUsdFor(rate, { promptTokens: 1000, completionTokens: 500 });
  const withZeroCache = costMicroUsdFor(rate, { promptTokens: 1000, completionTokens: 500, cachedInputTokens: 0, cacheWriteInputTokens: 0 });
  assert.equal(withoutCache, 1000 / 1000 * 1 * 1000000 + 500 / 1000 * 2 * 1000000);
  assert.equal(withoutCache, withZeroCache);
});

test('cached input tokens are priced at the discounted rate and subtracted from the regular-input bucket (never double-counted)', () => {
  const rate = { promptPricePer1k: 1, completionPricePer1k: 2, cachedInputPricePer1k: 0.1, cacheWriteInputPricePer1k: null };
  // 1000 prompt tokens total, 400 of them cached: 600 regular @ $1/1k + 400 cached @ $0.10/1k.
  const cost = costMicroUsdFor(rate, { promptTokens: 1000, completionTokens: 0, cachedInputTokens: 400 });
  const expected = Math.round((600 / 1000 * 1 + 400 / 1000 * 0.1) * 1000000);
  assert.equal(cost, expected);
});

test('cache-write tokens are priced additively on top of the regular prompt tokens (never subtracted from them)', () => {
  const rate = { promptPricePer1k: 1, completionPricePer1k: 2, cachedInputPricePer1k: null, cacheWriteInputPricePer1k: 1.5 };
  const cost = costMicroUsdFor(rate, { promptTokens: 1000, completionTokens: 0, cacheWriteInputTokens: 200 });
  const expected = Math.round((1000 / 1000 * 1 + 200 / 1000 * 1.5) * 1000000);
  assert.equal(cost, expected);
});

test('an unpriced cached/cache-write dimension falls back to the base prompt price - never silently treated as zero', () => {
  const rate = { promptPricePer1k: 2, completionPricePer1k: 0, cachedInputPricePer1k: null, cacheWriteInputPricePer1k: null };
  const withCache = costMicroUsdFor(rate, { promptTokens: 1000, completionTokens: 0, cachedInputTokens: 500 });
  const withoutCacheAtAll = costMicroUsdFor(rate, { promptTokens: 1000, completionTokens: 0 });
  // Falling back to the base prompt rate for the cached portion means the total is unchanged from
  // pricing the same 1000 tokens with no cache distinction at all - never a $0 discount for a
  // dimension nobody configured a rate for.
  assert.equal(withCache, withoutCacheAtAll);
  assert.ok(withCache > 0);
});

test('reasoning tokens are never an extra pricing dimension - passing them changes nothing about the computed cost', () => {
  const rate = { promptPricePer1k: 1, completionPricePer1k: 2, cachedInputPricePer1k: null, cacheWriteInputPricePer1k: null };
  const withoutReasoning = costMicroUsdFor(rate, { promptTokens: 1000, completionTokens: 500 });
  const withReasoning = costMicroUsdFor(rate, { promptTokens: 1000, completionTokens: 500, reasoningTokens: 300 });
  assert.equal(withoutReasoning, withReasoning, 'reasoning tokens are already included in completionTokens by the provider - pricing them again would double-bill');
});

// --- resolvePricingRate surfaces the new cache pricing columns -------------------------------

test('resolvePricingRate returns cachedInputPricePer1k/cacheWriteInputPricePer1k from a model-specific row, and null for the provider-level fallback', async () => {
  const repo = createMemoryRepo();
  await repo.providerModelPricing.upsert({ provider: 'openai', model: 'gpt-5.6-sol', promptPricePer1k: 1, completionPricePer1k: 2, cachedInputPricePer1k: 0.5, cacheWriteInputPricePer1k: 1.5, enabled: true });
  const modelRate = await resolvePricingRate(repo, { provider: 'openai', model: 'gpt-5.6-sol' });
  assert.equal(modelRate.cachedInputPricePer1k, 0.5);
  assert.equal(modelRate.cacheWriteInputPricePer1k, 1.5);

  await repo.providerPricing.upsert({ provider: 'anthropic', promptPricePer1k: 3, completionPricePer1k: 4 });
  const providerRate = await resolvePricingRate(repo, { provider: 'anthropic', model: 'claude-unknown-model' });
  assert.equal(providerRate.cachedInputPricePer1k, null);
  assert.equal(providerRate.cacheWriteInputPricePer1k, null);
});

test('a provider_model_pricing row with only prompt/completion prices set (no cache columns at all) is still fully backward compatible', async () => {
  const repo = createMemoryRepo();
  await repo.providerModelPricing.upsert({ provider: 'openai', model: 'legacy-model', promptPricePer1k: 1, completionPricePer1k: 2, enabled: true });
  const rate = await resolvePricingRate(repo, { provider: 'openai', model: 'legacy-model' });
  assert.equal(rate.promptPricePer1k, 1);
  assert.equal(rate.completionPricePer1k, 2);
  assert.equal(rate.cachedInputPricePer1k, null);
  assert.equal(rate.cacheWriteInputPricePer1k, null);
  const cost = costMicroUsdFor(rate, { promptTokens: 1000, completionTokens: 500, cachedInputTokens: 100 });
  assert.ok(cost > 0);
});

// --- Price-change-mid-reservation immutability ------------------------------------------------

test('settling with a pricing row that only appeared AFTER a reservation was created still produces one deterministic, immutable ledger cost - no retroactive recompute after settlement', async () => {
  const repo = createMemoryRepo();
  const user = await repo.users.create({ displayName: 'Trader' });
  await repo.wallet.grant(user.id, { type: 'PROMO_CREDIT', promoDeltaMicroUsd: 50000000, sourceAction: 'test-seed' });
  // No pricing exists yet at "reservation time" in this test's own timeline - reserve() itself
  // isn't exercised here (that invariant is already covered by wallet-service.test.mjs); this
  // test isolates settleAiCall()'s own contract: it always resolves pricing FRESH, at settle time.
  const reserved = await repo.wallet.reserve(user.id, { estimatedRetailMicroUsd: 1000000, provider: 'openai', model: 'gpt-5.6-sol', feature: 'aiChat' });
  assert.equal(reserved.ok, true);

  // Pricing (including a cached-token rate) is configured only now, between reserve and settle.
  await repo.providerModelPricing.upsert({ provider: 'openai', model: 'gpt-5.6-sol', promptPricePer1k: 1, completionPricePer1k: 2, cachedInputPricePer1k: 0.1, enabled: true });

  const settled = await settleAiCall(repo, {
    reservationId: reserved.reservation.id, provider: 'openai', model: 'gpt-5.6-sol', feature: 'aiChat',
    usage: { promptTokens: 1000, completionTokens: 500, cachedInputTokens: 400 }
  });
  assert.equal(settled.ok, true);
  const expectedProviderCostMicroUsd = Math.round((600 / 1000 * 1 + 400 / 1000 * 0.1 + 500 / 1000 * 2) * 1000000);
  assert.equal(settled.ledgerEntry.providerCostMicroUsd, expectedProviderCostMicroUsd);

  // Now change pricing AGAIN, after settlement - the already-written ledger row must never change,
  // and re-settling the same (already-resolved) reservation must return the SAME historical entry,
  // never recompute against the new rate (settle() is idempotent by reservation status).
  await repo.providerModelPricing.upsert({ provider: 'openai', model: 'gpt-5.6-sol', promptPricePer1k: 999, completionPricePer1k: 999, enabled: true });
  const resettled = await settleAiCall(repo, {
    reservationId: reserved.reservation.id, provider: 'openai', model: 'gpt-5.6-sol', feature: 'aiChat',
    usage: { promptTokens: 1000, completionTokens: 500, cachedInputTokens: 400 }
  });
  assert.equal(resettled.alreadySettled, true);
  assert.equal(resettled.ledgerEntry.providerCostMicroUsd, expectedProviderCostMicroUsd, 'a settled reservation\'s recorded cost must never change after the fact, regardless of later pricing edits');
});

// --- Real provider usage-breakdown capture (OpenAI cached/reasoning, Anthropic cache read/write) ---

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test('callOpenAI captures cached_tokens and reasoning_tokens from a real Responses-API usage shape, without changing promptTokens/completionTokens/totalTokens', async () => {
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      output_text: '{"ok":true}',
      usage: {
        input_tokens: 1000, output_tokens: 500, total_tokens: 1500,
        input_tokens_details: { cached_tokens: 400 },
        output_tokens_details: { reasoning_tokens: 120 }
      }
    })
  });
  const { usage } = await callOpenAI({ input: [], text: { format: { name: 'x', schema: { type: 'object', properties: {}, required: [] } } } }, 'sk-test', 'gpt-5.6-sol');
  assert.equal(usage.promptTokens, 1000);
  assert.equal(usage.completionTokens, 500);
  assert.equal(usage.totalTokens, 1500);
  assert.equal(usage.cachedInputTokens, 400);
  assert.equal(usage.reasoningTokens, 120);
  assert.equal(usage.cacheWriteInputTokens, null, 'OpenAI has no cache-write concept - must stay null, never guessed');
});

test('callOpenAI degrades cleanly when the provider omits the detail breakdown (older response shape / another OpenAI-compatible-style usage object)', async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ output_text: '{"ok":true}', usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } }) });
  const { usage } = await callOpenAI({ input: [], text: { format: { name: 'x', schema: { type: 'object', properties: {}, required: [] } } } }, 'sk-test', 'gpt-5.6-sol');
  assert.equal(usage.cachedInputTokens, null);
  assert.equal(usage.reasoningTokens, null);
  assert.equal(usage.promptTokens, 10);
});

test('callAnthropic captures cache_read_input_tokens/cache_creation_input_tokens as cachedInputTokens/cacheWriteInputTokens', async () => {
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      content: [{ type: 'tool_use', input: { ok: true } }],
      usage: { input_tokens: 800, output_tokens: 300, cache_read_input_tokens: 250, cache_creation_input_tokens: 60 }
    })
  });
  const payload = { input: [{ role: 'user', content: [{ type: 'input_text', text: 'hi' }] }], text: { format: { name: 'x', schema: { type: 'object', properties: {}, required: [] } } } };
  const { usage } = await callAnthropic(payload, 'sk-ant-test', 'claude-test');
  assert.equal(usage.promptTokens, 800);
  assert.equal(usage.completionTokens, 300);
  assert.equal(usage.totalTokens, 1100);
  assert.equal(usage.cachedInputTokens, 250);
  assert.equal(usage.cacheWriteInputTokens, 60);
  assert.equal(usage.reasoningTokens, null, 'Anthropic has no separately-reported reasoning-token concept in this usage object - must stay null');
});
