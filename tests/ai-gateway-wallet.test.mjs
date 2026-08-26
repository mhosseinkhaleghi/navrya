import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
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
  const { cookie } = await registerAndGetCookie();
  const response = await fetch(`${aiBaseUrl}/api/ai/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ message: 'hi', provider: 'openai' })
  });
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.error, 'PROVIDER_PRICING_NOT_CONFIGURED');
});

test('once pricing is configured, the wallet gate passes and the request reaches real provider-calling logic (failing later on the expected missing-key error, not a wallet error)', async () => {
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
