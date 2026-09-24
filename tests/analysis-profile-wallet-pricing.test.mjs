import assert from 'node:assert/strict';
import test, { after, afterEach, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';

// Production regression: teaching the engine from a website failed with
//   PROVIDER_PRICING_NOT_CONFIGURED - HTTP 503
// for every trader who had no personal API key.
//
// Root cause: the Analysis Profile client sent no provider and no model without a key, and the AI
// gateway's wallet gate reserved funds against those RAW request fields. `undefined` can never
// match a price row, so the call failed closed no matter what an admin had priced. The gateway now
// prices a hold against the provider and model that callProvider() will actually resolve for the
// same request, and the client sends the trader's selected provider/model like the dock does.
//
// These tests use the real gateway, the real wallet and the real internal bridge over real HTTP
// (the same topology tests/ai-gateway-wallet.test.mjs uses), and - unlike that file - configure
// MODEL-LEVEL price rows only, with no provider-level fallback row, because that is the shape
// production has and it is exactly what let the bug hide: a provider-level row would have priced an
// omitted model, and no test exercised an omitted PROVIDER.
process.env.INTERNAL_API_SECRET = 'test-internal-secret-please-ignore';
process.env.PATTERN_AI_PORT = '0';

let repo, communityServer, aiServer, aiBaseUrl, aiModule;

before(async () => {
  repo = createMemoryRepo();
  communityServer = createApp({ repo, uploadsDir: '/tmp' }).listen(0);
  await new Promise((resolve) => communityServer.once('listening', resolve));
  process.env.COMMUNITY_API_URL = `http://127.0.0.1:${communityServer.address().port}`;
  process.env.AI_WALLET_ENFORCED = 'true';
  process.env.OPENAI_API_KEY = 'test-fake-openai-key';
  delete process.env.OPENAI_MODEL;

  aiModule = await import('../server/pattern-ai-server.mjs');
  aiServer = aiModule.default;
  if (!aiServer.listening) await new Promise((resolve) => aiServer.once('listening', resolve));
  aiBaseUrl = `http://127.0.0.1:${aiServer.address().port}`;
});
after(async () => {
  await new Promise((resolve) => communityServer.close(resolve));
  aiServer.close();
});

const originalFetch = globalThis.fetch;
let providerRequests = [];
afterEach(() => { globalThis.fetch = originalFetch; providerRequests = []; aiModule.__resetAdminModelOverrideCacheForTests(); });

// Fakes only OpenAI; everything else (this file's calls to the gateway, the gateway's bridge calls to
// the community app) passes through to the real fetch, so the real wallet logic runs for real.
function mockOpenAi() {
  globalThis.fetch = async (url, options) => {
    if (String(url) !== 'https://api.openai.com/v1/responses') return originalFetch(url, options);
    const sent = JSON.parse(options.body);
    providerRequests.push(sent);
    return {
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({ updatedUnderstanding: '', conceptsProposed: [] }),
        usage: { input_tokens: 800, output_tokens: 200, total_tokens: 1000 }
      })
    };
  };
}

let counter = 0;
async function newFundedUser() {
  counter += 1;
  const response = await fetch(`${process.env.COMMUNITY_API_URL}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `wallet-pricing-${counter}-${Date.now()}@example.com`, password: 'a genuinely long passphrase 1234', displayName: 'Pricing Tester' })
  });
  const body = await response.json();
  const cookie = response.headers.getSetCookie().find((c) => c.startsWith('navrya_session=') || c.startsWith('__Host-navrya_session=')).split(';')[0];
  await repo.wallet.grant(body.user.id, { type: 'ADMIN_CREDIT', cashDeltaMicroUsd: 5000000, adminUserId: 'test-admin', sourceAction: 'test-grant' });
  return { userId: body.user.id, cookie };
}

function ingest(cookie, extra) {
  return fetch(`${aiBaseUrl}/api/analysis-profiles/ingest`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ kind: 'source', text: 'A page digest about liquidity sweeps and stop clusters.', language: 'en', ...extra })
  });
}

const price = (model) => repo.providerModelPricing.upsert({ provider: 'openai', model, promptPricePer1k: 0.01, completionPricePer1k: 0.03, currency: 'USD', enabled: true });

test('THE REPORTED BUG: a teach request naming no provider and no model is priced on the platform default and succeeds', async () => {
  // Only the model the platform default resolves to is priced (gpt-5.6, priced through its canonical
  // gpt-5.6-sol alias), and there is deliberately NO provider-level row.
  await price('gpt-5.6-sol');
  const { userId, cookie } = await newFundedUser();
  const before = await repo.wallet.getAccount(userId);

  mockOpenAi();
  const response = await ingest(cookie, {});
  assert.equal(response.status, 200, 'this was 503 PROVIDER_PRICING_NOT_CONFIGURED before the fix');
  const body = await response.json();
  assert.equal(body.provider, 'openai');
  assert.equal(providerRequests.length, 1, 'the provider was really called once');

  const after = await repo.wallet.getAccount(userId);
  assert.ok(after.paidBalanceMicroUsd + after.promoBalanceMicroUsd < before.paidBalanceMicroUsd + before.promoBalanceMicroUsd, 'a real charge was settled');
  const ledger = await repo.wallet.ledgerForUser(userId);
  assert.equal(ledger.filter((e) => e.type === 'AI_SETTLEMENT').length, 1);
  assert.ok(!ledger.some((e) => e.type === 'AI_RELEASE'), 'nothing was released: the hold was settled');
});

test('the request the FIXED client sends (provider + model, no key) is priced on exactly that model', async () => {
  await price('gpt-5.6-luna');
  const { userId, cookie } = await newFundedUser();
  mockOpenAi();
  const response = await ingest(cookie, { provider: 'openai', model: 'gpt-5.6-luna' });
  assert.equal(response.status, 200);
  assert.equal(providerRequests[0].model, 'gpt-5.6-luna', 'the trader\'s selected model is the one that served the call');
  const ledger = await repo.wallet.ledgerForUser(userId);
  const settlement = ledger.find((e) => e.type === 'AI_SETTLEMENT');
  assert.ok(settlement);
  assert.equal(settlement.model, 'gpt-5.6-luna');
});

test('an omitted model follows the ADMIN-selected default, and the hold is priced on that same model', async () => {
  // The platform default is admin-configurable at runtime. If the hold were priced on the code
  // default while the call ran on the admin's model, the two would disagree the moment an admin
  // changed it - and a price row for one model would silently cover a call served by another.
  await repo.adminModelOverrides.upsert({ provider: 'openai', model: 'gpt-5.6-terra', updatedBy: 'test-admin' });
  await repo.providerModelPricing.upsert({ provider: 'openai', model: 'gpt-5.6-terra', promptPricePer1k: 0.02, completionPricePer1k: 0.05, currency: 'USD', enabled: true });
  const { cookie } = await newFundedUser();
  mockOpenAi();
  const response = await ingest(cookie, { provider: 'openai' });
  assert.equal(response.status, 200);
  assert.equal(providerRequests[0].model, 'gpt-5.6-terra', 'the call ran on the admin-selected model');
  await repo.adminModelOverrides.upsert({ provider: 'openai', model: 'gpt-5.6-terra', updatedBy: 'test-admin' });
});

test('an unpriced model still fails closed and never reaches the provider - the fix does not make anything free', async () => {
  await repo.adminModelOverrides.upsert({ provider: 'openai', model: 'gpt-5.6-luna', updatedBy: 'test-admin' });
  const { userId, cookie } = await newFundedUser();
  mockOpenAi();
  const response = await ingest(cookie, { provider: 'openai', model: 'a-model-nobody-priced' });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'PROVIDER_PRICING_NOT_CONFIGURED');
  assert.equal(providerRequests.length, 0, 'an unpriceable request must never be served for free by omission');
  const ledger = await repo.wallet.ledgerForUser(userId);
  assert.equal(ledger.filter((e) => e.type === 'AI_RESERVATION' || e.type === 'AI_SETTLEMENT').length, 0);
});

test('an unrecognised provider name is priced as the provider callProvider() will really use (openai), not as a phantom provider', async () => {
  await price('gpt-5.6-luna');
  const { cookie } = await newFundedUser();
  mockOpenAi();
  const response = await ingest(cookie, { provider: 'not-a-real-provider', model: 'gpt-5.6-luna' });
  assert.equal(response.status, 200);
  assert.equal(providerRequests.length, 1);
});

test('a request that names a model does not trigger an extra admin-override lookup', async () => {
  await price('gpt-5.6-luna');
  const { cookie } = await newFundedUser();
  mockOpenAi();
  let overrideLookups = 0;
  const wrapped = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes('/internal/admin-ai-model-overrides')) overrideLookups += 1;
    return wrapped(url, options);
  };
  aiModule.__resetAdminModelOverrideCacheForTests();
  const response = await ingest(cookie, { provider: 'openai', model: 'gpt-5.6-luna' });
  assert.equal(response.status, 200);
  // callProvider() itself reads the overrides once; the reservation must not add a second lookup.
  assert.equal(overrideLookups, 1);
});

test('BYOK is untouched: a personal key still bypasses the wallet entirely', async () => {
  const { userId, cookie } = await newFundedUser();
  mockOpenAi();
  const response = await ingest(cookie, { provider: 'openai', model: 'a-model-nobody-priced', apiKey: 'sk-user-own-key-not-real' });
  assert.equal(response.status, 200, 'never priced, never blocked');
  const ledger = await repo.wallet.ledgerForUser(userId);
  assert.equal(ledger.filter((e) => e.type === 'AI_RESERVATION' || e.type === 'AI_SETTLEMENT' || e.type === 'AI_RELEASE').length, 0);
});
