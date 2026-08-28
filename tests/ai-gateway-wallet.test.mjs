import assert from 'node:assert/strict';
import test, { after, afterEach, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';

// Commercial System Slice 1 - end-to-end coverage of the real Wallet bridge between
// server/pattern-ai-server.mjs (the AI gateway, DB-free) and server/community-api-server.mjs's
// app (real repo, real /internal/wallet/* routes), talked to over real HTTP exactly like the
// deployed topology - same two-server setup as ai-gateway-auth.test.mjs, which this file
// deliberately mirrors rather than mocking the bridge.
process.env.INTERNAL_API_SECRET = 'test-internal-secret-please-ignore';
process.env.PATTERN_AI_PORT = '0';

let communityRepo, communityServer, communityBaseUrl;
let aiServer, aiBaseUrl;

before(async () => {
  communityRepo = createMemoryRepo();
  communityServer = createApp({ repo: communityRepo, uploadsDir: '/tmp' }).listen(0);
  await new Promise((resolve) => communityServer.once('listening', resolve));
  communityBaseUrl = `http://127.0.0.1:${communityServer.address().port}`;
  process.env.COMMUNITY_API_URL = communityBaseUrl;

  const aiModule = await import('../server/pattern-ai-server.mjs');
  aiServer = aiModule.default;
  if (!aiServer.listening) await new Promise((resolve) => aiServer.once('listening', resolve));
  aiBaseUrl = `http://127.0.0.1:${aiServer.address().port}`;
});
after(async () => {
  await new Promise((resolve) => communityServer.close(resolve));
  aiServer.close();
});

let counter = 0;
function uniqueEmail() { counter += 1; return `wallet-tester-${counter}-${Date.now()}@example.com`; }

// pattern-ai-server.mjs is imported into THIS SAME process (not a child process - see `before()`
// above), so mocking globalThis.fetch here also intercepts the AI gateway's own outbound calls
// (to OpenAI, and to the internal wallet bridge) as well as this file's own calls to aiBaseUrl.
// Only the literal OpenAI endpoint is ever faked - everything else (this file's own fetch to
// aiBaseUrl, and pattern-ai-server.mjs's own internal-bridge calls to communityBaseUrl) passes
// straight through to the real fetch, so the real wallet-service/repo logic still runs for real.
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
function mockOpenAiResponse({ inputTokens = 1000, outputTokens = 500 } = {}) {
  globalThis.fetch = async (url, options) => {
    if (String(url) !== 'https://api.openai.com/v1/responses') return originalFetch(url, options);
    return {
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({ reply: 'a real reply' }),
        usage: { input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: inputTokens + outputTokens }
      })
    };
  };
}

async function registerAndGetCookie() {
  const response = await fetch(`${communityBaseUrl}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: uniqueEmail(), password: 'a genuinely long passphrase 1234', displayName: 'Wallet Tester' })
  });
  const body = await response.json();
  const setCookie = response.headers.getSetCookie().find((c) => c.startsWith('navrya_session=') || c.startsWith('__Host-navrya_session='));
  return { userId: body.user.id, cookie: setCookie.split(';')[0] };
}

test('a billed AI route with no provider pricing configured fails closed (503 PROVIDER_PRICING_NOT_CONFIGURED) and never reaches the provider', async () => {
  process.env.AI_WALLET_ENFORCED = 'true';
  const { cookie } = await registerAndGetCookie();
  const response = await fetch(`${aiBaseUrl}/api/ai/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ message: 'hi', provider: 'openai' })
  });
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.error, 'PROVIDER_PRICING_NOT_CONFIGURED');
});

test('once pricing is configured, the wallet gate passes and the request reaches real provider-calling logic (failing later on the expected missing-key error, not a wallet error)', async () => {
  process.env.AI_WALLET_ENFORCED = 'true';
  await communityRepo.providerPricing.upsert({ provider: 'openai', promptPricePer1k: 0.03, completionPricePer1k: 0.06, monthlyTokenBudget: null });
  const { userId, cookie } = await registerAndGetCookie();
  const before = await communityRepo.wallet.getAccount(userId);
  assert.ok(before.promoBalanceMicroUsd > 0, 'the signup promo credit should already be present');

  const response = await fetch(`${aiBaseUrl}/api/ai/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ message: 'hi', provider: 'openai' })
  });
  // No real OPENAI_API_KEY is configured in this test environment - the call fails past the
  // wallet gate for the SAME reason /api/ai/test-connection does elsewhere in this suite.
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.error, 'OPENAI_API_KEY_MISSING');

  // A failed provider call must never be charged (spec section 27) - the reservation was
  // released, not settled, so the balance is exactly what it was before this request.
  const after = await communityRepo.wallet.getAccount(userId);
  assert.deepEqual(after, before);
  const ledger = await communityRepo.wallet.ledgerForUser(userId);
  assert.ok(ledger.some((entry) => entry.type === 'AI_RELEASE'));
  assert.ok(!ledger.some((entry) => entry.type === 'AI_SETTLEMENT'));
});

test('a BYOK call (client-supplied apiKey) bypasses the wallet entirely, even with zero balance and no pricing configured', async () => {
  process.env.AI_WALLET_ENFORCED = 'true';
  const { userId, cookie } = await registerAndGetCookie();
  await communityRepo.wallet.grant(userId, { type: 'ADMIN_DEBIT', promoDeltaMicroUsd: -(await communityRepo.wallet.getAccount(userId)).promoBalanceMicroUsd }); // drain to $0
  const response = await fetch(`${aiBaseUrl}/api/ai/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ message: 'hi', provider: 'openai', apiKey: 'sk-user-own-key-not-real' })
  });
  // Reaches real provider-calling logic directly (no wallet gate at all for BYOK) - it still
  // fails, but for a genuine upstream-call reason, never WALLET_INSUFFICIENT_BALANCE or
  // PROVIDER_PRICING_NOT_CONFIGURED.
  const body = await response.json();
  assert.notEqual(body.error, 'WALLET_INSUFFICIENT_BALANCE');
  assert.notEqual(body.error, 'PROVIDER_PRICING_NOT_CONFIGURED');
  const ledger = await communityRepo.wallet.ledgerForUser(userId);
  assert.equal(ledger.filter((entry) => entry.type === 'AI_RESERVATION' || entry.type === 'AI_SETTLEMENT' || entry.type === 'AI_RELEASE').length, 0);
});

// AI billing operational fix (task E) - the production symptom this task diagnosed: real OpenAI
// usage recorded, cost stuck at $0.00000. Every existing test above stops at OPENAI_API_KEY_MISSING
// (no real key in this environment) - this is the first test in the suite that mocks the actual
// OpenAI response and drives the full reserve -> real provider call -> settle -> usage-record path
// to a genuine 200, with the real (openai, gpt-5.6) pair this bug was reported against.
test('a platform-funded successful openai/gpt-5.6 call debits the wallet exactly once, creates one AI_SETTLEMENT, and ai_usage_events cost matches the ledger', async () => {
  process.env.AI_WALLET_ENFORCED = 'true';
  process.env.OPENAI_API_KEY = 'test-fake-openai-key';
  await communityRepo.providerModelPricing.upsert({ provider: 'openai', model: 'gpt-5.6', promptPricePer1k: 0.01, completionPricePer1k: 0.03, currency: 'USD', enabled: true });
  const { userId, cookie } = await registerAndGetCookie();
  await communityRepo.wallet.grant(userId, { type: 'ADMIN_CREDIT', cashDeltaMicroUsd: 2000000, adminUserId: 'test-admin', sourceAction: 'test-grant' }); // a real $2 credit
  const before = await communityRepo.wallet.getAccount(userId);

  mockOpenAiResponse({ inputTokens: 1000, outputTokens: 500 });
  const response = await fetch(`${aiBaseUrl}/api/ai/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ message: 'hi', provider: 'openai' })
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.reply, 'a real reply');

  const expectedProviderCostMicroUsd = Math.round((1000 / 1000 * 0.01 + 500 / 1000 * 0.03) * 1000000); // 25000 microUSD = $0.025
  const expectedRetailChargeMicroUsd = Math.round(expectedProviderCostMicroUsd * 3); // default 200% markup -> 3x retail multiplier
  assert.ok(expectedProviderCostMicroUsd > 0, 'sanity check - the rate card must actually be non-zero for this test to mean anything');

  const after = await communityRepo.wallet.getAccount(userId);
  const beforeTotal = before.paidBalanceMicroUsd + before.promoBalanceMicroUsd;
  const afterTotal = after.paidBalanceMicroUsd + after.promoBalanceMicroUsd;
  assert.equal(beforeTotal - afterTotal, expectedRetailChargeMicroUsd, 'the wallet must be debited by exactly the real retail charge computed from real usage');

  const ledger = await communityRepo.wallet.ledgerForUser(userId);
  const settlements = ledger.filter((entry) => entry.type === 'AI_SETTLEMENT');
  assert.equal(settlements.length, 1, 'exactly one AI_SETTLEMENT must be created for one successful call');
  assert.equal(settlements[0].providerCostMicroUsd, expectedProviderCostMicroUsd);
  assert.equal(settlements[0].retailChargeMicroUsd, expectedRetailChargeMicroUsd);
  assert.equal(settlements[0].provider, 'openai');
  assert.equal(settlements[0].model, 'gpt-5.6');

  // The gateway's independent usage-recording path (POST /internal/usage/record) writes its own
  // ai_usage_events row for the SAME call - its cost values must equal the ledger's, proving the
  // two authoritative records the admin/client UIs read from never disagree about the real cost.
  const usageRows = await communityRepo.usageEvents.aggregateByModelForUser(userId, { origin: 'gateway' });
  const openaiRow = usageRows.find((row) => row.provider === 'openai' && row.model === 'gpt-5.6');
  assert.ok(openaiRow, 'a gateway-origin usage event must exist for this call');
  assert.equal(openaiRow.providerCostMicroUsd, expectedProviderCostMicroUsd);
  assert.equal(openaiRow.retailChargeMicroUsd, expectedRetailChargeMicroUsd);
});

test('the wallet gate is rollout-safe by default: without explicit enforcement, platform-funded chat reaches provider logic even when pricing is absent', async () => {
  delete process.env.AI_WALLET_ENFORCED;
  delete process.env.OPENAI_API_KEY; // explicit precondition, same self-contained convention as AI_WALLET_ENFORCED above - never relies on a previous test's cleanup
  const { userId, cookie } = await registerAndGetCookie();
  const response = await fetch(`${aiBaseUrl}/api/ai/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ message: 'hi', provider: 'openai' })
  });
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.error, 'OPENAI_API_KEY_MISSING', 'the request must pass the disabled wallet gate and reach the provider-key boundary');
  const ledger = await communityRepo.wallet.ledgerForUser(userId);
  assert.equal(ledger.filter((entry) => entry.type === 'AI_RESERVATION' || entry.type === 'AI_SETTLEMENT' || entry.type === 'AI_RELEASE').length, 0);
});
