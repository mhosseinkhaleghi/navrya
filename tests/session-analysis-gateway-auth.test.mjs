import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';

// Adaptive AI Session Analysis - verifies /api/sessions/analyze and /api/sessions/visualize-
// scenario are real, dispatcher-wired routes on the AI gateway (not just exported functions),
// and that they sit behind the exact same real-session auth gate ADR-0001 section 6/7 requires
// of every other AI endpoint. Same two-real-server topology as tests/ai-gateway-auth.test.mjs.
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

async function registerAndGetCookie(email) {
  const response = await fetch(`${communityBaseUrl}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'a genuinely long passphrase 1234', displayName: 'Session Analysis Tester' })
  });
  const body = await response.json();
  const setCookie = response.headers.getSetCookie().find((c) => c.startsWith('navrya_session=') || c.startsWith('__Host-navrya_session='));
  return { userId: body.user.id, cookie: setCookie.split(';')[0] };
}

let counter = 0;
function uniqueEmail() { counter += 1; return `session-analysis-tester-${counter}-${Date.now()}@example.com`; }

test('an anonymous call to /api/sessions/analyze is rejected with AUTH_SESSION_REQUIRED, never reaching provider-calling logic', async () => {
  const response = await fetch(`${aiBaseUrl}/api/sessions/analyze`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: 'openai', analysisType: 'initial' })
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'AUTH_SESSION_REQUIRED');
});

test('an anonymous call to /api/sessions/visualize-scenario is rejected the same way', async () => {
  const response = await fetch(`${aiBaseUrl}/api/sessions/visualize-scenario`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({})
  });
  assert.equal(response.status, 401);
});

test('a real, valid session reaches the real analyzeSession handler (a clean *_API_KEY_MISSING with no key configured, never 401/404)', async () => {
  const { cookie } = await registerAndGetCookie(uniqueEmail());
  const response = await fetch(`${aiBaseUrl}/api/sessions/analyze`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ provider: 'openai', model: 'gpt-5.6-luna', language: 'en', analysisType: 'initial', activeScenarios: [], patternContext: [], images: [] })
  });
  assert.notEqual(response.status, 401);
  assert.notEqual(response.status, 404);
});

test('a real, valid session reaches the real visualizeScenario handler (CHART_IMAGE_REQUIRED with no image, never 401/404)', async () => {
  const { cookie } = await registerAndGetCookie(uniqueEmail());
  const response = await fetch(`${aiBaseUrl}/api/sessions/visualize-scenario`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ visualizationBrief: {}, language: 'en' })
  });
  assert.notEqual(response.status, 401);
  assert.notEqual(response.status, 404);
  assert.equal((await response.json()).error, 'CHART_IMAGE_REQUIRED');
});

test('an anonymous call to /api/sessions/visualize-analysis is rejected the same way', async () => {
  const response = await fetch(`${aiBaseUrl}/api/sessions/visualize-analysis`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({})
  });
  assert.equal(response.status, 401);
});

test('a real, valid session reaches the real visualizeAnalysis handler (CHART_IMAGE_REQUIRED with no image, never 401/404)', async () => {
  const { cookie } = await registerAndGetCookie(uniqueEmail());
  const response = await fetch(`${aiBaseUrl}/api/sessions/visualize-analysis`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ analysisSnapshot: {}, language: 'en' })
  });
  assert.notEqual(response.status, 401);
  assert.notEqual(response.status, 404);
  assert.equal((await response.json()).error, 'CHART_IMAGE_REQUIRED');
});

// Production incident: visualize-scenario's wallet RESERVATION step (in the dispatcher, before
// visualizeScenario() itself ever runs) read body.provider/body.model to resolve pricing - but
// this route's own client (session-analysis-client.js) never sends either field, since the real
// provider/model ('openai'/IMAGE_EDIT_MODEL) are fixed and only known INSIDE visualizeScenario()
// itself. Reserving against undefined/undefined could never resolve any pricing row, so with wallet
// enforcement on this route failed closed with PROVIDER_PRICING_NOT_CONFIGURED unconditionally -
// confirmed live, independent of whether real pricing existed. Verifies the reservation now
// resolves the same fixed 'openai'/gpt-image-2 pair visualizeScenario() itself always uses
// (gpt-image-2 - upgraded from gpt-image-1 - is now priced through the normal token-based path,
// same shape a real text call already uses, since its response reports real usage).
test('with wallet enforcement on and real openai/gpt-image-2 token pricing configured, visualize-scenario reservation succeeds (reaches CHART_IMAGE_REQUIRED, never PROVIDER_PRICING_NOT_CONFIGURED)', async () => {
  const previousEnforced = process.env.AI_WALLET_ENFORCED;
  process.env.AI_WALLET_ENFORCED = 'true';
  try {
    await communityRepo.providerModelPricing.upsert({ provider: 'openai', model: 'gpt-image-2', promptPricePer1k: 0.008, completionPricePer1k: 0.03, cachedInputPricePer1k: 0.002, currency: 'USD', enabled: true });
    const { userId, cookie } = await registerAndGetCookie(uniqueEmail());
    await communityRepo.wallet.grant(userId, { type: 'ADMIN_CREDIT', cashDeltaMicroUsd: 10000000 });
    const response = await fetch(`${aiBaseUrl}/api/sessions/visualize-scenario`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ visualizationBrief: {}, language: 'en' })
    });
    const body = await response.json();
    assert.notEqual(body.error, 'PROVIDER_PRICING_NOT_CONFIGURED');
    assert.equal(body.error, 'CHART_IMAGE_REQUIRED');
  } finally {
    process.env.AI_WALLET_ENFORCED = previousEnforced;
  }
});

// Same pinning fix, same reason - visualize-analysis (Analysis Map) is the second, newer
// IMAGE_GENERATION_ROUTES member and shares the exact same reservation code path.
test('with wallet enforcement on and real openai/gpt-image-2 token pricing configured, visualize-analysis reservation succeeds (reaches CHART_IMAGE_REQUIRED, never PROVIDER_PRICING_NOT_CONFIGURED)', async () => {
  const previousEnforced = process.env.AI_WALLET_ENFORCED;
  process.env.AI_WALLET_ENFORCED = 'true';
  try {
    await communityRepo.providerModelPricing.upsert({ provider: 'openai', model: 'gpt-image-2', promptPricePer1k: 0.008, completionPricePer1k: 0.03, cachedInputPricePer1k: 0.002, currency: 'USD', enabled: true });
    const { userId, cookie } = await registerAndGetCookie(uniqueEmail());
    await communityRepo.wallet.grant(userId, { type: 'ADMIN_CREDIT', cashDeltaMicroUsd: 10000000 });
    const response = await fetch(`${aiBaseUrl}/api/sessions/visualize-analysis`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ analysisSnapshot: {}, language: 'en' })
    });
    const body = await response.json();
    assert.notEqual(body.error, 'PROVIDER_PRICING_NOT_CONFIGURED');
    assert.equal(body.error, 'CHART_IMAGE_REQUIRED');
  } finally {
    process.env.AI_WALLET_ENFORCED = previousEnforced;
  }
});
