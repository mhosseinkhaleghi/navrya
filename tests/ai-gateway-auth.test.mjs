import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { __resetRateLimitStoreForTests, createMemoryRateLimitStore, __setRateLimitStoreForTests } from '../server/community/security/rate-limit.mjs';

// Verifies ADR-0001 section 6/7: every AI endpoint requires a real, non-suspended session
// (verified via /internal/session-introspect against a REAL running Community API, not a stub),
// and per-user/global quotas are enforced server-side. Spins up two real servers - the Community
// API (memory repo) and the actual AI gateway module (server/pattern-ai-server.mjs, imported
// exactly once per test-runner process the way tests/ai-gateway.test.mjs already does) - and
// talks to both over real HTTP, the same way the real deployed topology does.
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
    body: JSON.stringify({ email, password: 'a genuinely long passphrase 1234', displayName: 'AI Tester' })
  });
  const body = await response.json();
  const setCookie = response.headers.getSetCookie().find((c) => c.startsWith('navrya_session=') || c.startsWith('__Host-navrya_session='));
  return { userId: body.user.id, cookie: setCookie.split(';')[0] };
}

let counter = 0;
function uniqueEmail() { counter += 1; return `ai-tester-${counter}-${Date.now()}@example.com`; }

test('an anonymous (no session cookie) call to any AI endpoint is rejected with AUTH_SESSION_REQUIRED, and never reaches provider-calling logic', async () => {
  const originalFetch = globalThis.fetch;
  let externalCalls = 0;
  globalThis.fetch = async (url, ...rest) => {
    const href = String(url);
    if (!href.startsWith(communityBaseUrl) && !href.startsWith(aiBaseUrl)) externalCalls += 1;
    return originalFetch(url, ...rest);
  };
  try {
    const response = await fetch(`${aiBaseUrl}/api/ai/test-connection`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: 'openai' })
    });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error, 'AUTH_SESSION_REQUIRED');
    assert.equal(externalCalls, 0, 'an anonymous caller must never reach provider-calling code at all');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('the Realtime session-minting endpoint also requires a real session - anonymous gets 401, never a minted credential', async () => {
  const response = await fetch(`${aiBaseUrl}/api/ai/realtime/session`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ language: 'en' })
  });
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.value, undefined, 'no client secret may ever be present in an unauthenticated response');
});

test('a valid session is admitted past the auth gate (reaches real handler logic, e.g. a clean *_API_KEY_MISSING with no key configured)', async () => {
  const { cookie } = await registerAndGetCookie(uniqueEmail());
  const response = await fetch(`${aiBaseUrl}/api/ai/test-connection`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ provider: 'openai' })
  });
  assert.notEqual(response.status, 401, 'a real, valid session must never be rejected as unauthenticated');
});

test('a suspended user is rejected with ACCOUNT_SUSPENDED, not treated as anonymous and not admitted', async () => {
  const { userId, cookie } = await registerAndGetCookie(uniqueEmail());
  await communityRepo.users.update(userId, { suspendedAt: new Date().toISOString() });
  const response = await fetch(`${aiBaseUrl}/api/ai/test-connection`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ provider: 'openai' })
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'ACCOUNT_SUSPENDED');
});

test('a forged/garbage session cookie is rejected exactly like no cookie at all', async () => {
  const response = await fetch(`${aiBaseUrl}/api/ai/test-connection`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: 'navrya_session=totally-forged-not-real' }, body: JSON.stringify({ provider: 'openai' })
  });
  assert.equal(response.status, 401);
});

test('per-user AI quota is enforced server-side and is isolated between users - one user hitting their cap never affects another', async () => {
  __setRateLimitStoreForTests(createMemoryRateLimitStore());
  process.env.AI_QUOTA_PER_USER_PER_HOUR = '1';
  try {
    const { cookie: cookieA } = await registerAndGetCookie(uniqueEmail());
    const { cookie: cookieB } = await registerAndGetCookie(uniqueEmail());

    const firstA = await fetch(`${aiBaseUrl}/api/ai/test-connection`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookieA }, body: JSON.stringify({ provider: 'openai' }) });
    assert.notEqual(firstA.status, 429);
    const secondA = await fetch(`${aiBaseUrl}/api/ai/test-connection`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookieA }, body: JSON.stringify({ provider: 'openai' }) });
    assert.equal(secondA.status, 429, 'the SAME user exceeding their quota must be rejected');
    assert.ok(secondA.headers.get('retry-after'));

    const firstB = await fetch(`${aiBaseUrl}/api/ai/test-connection`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookieB }, body: JSON.stringify({ provider: 'openai' }) });
    assert.notEqual(firstB.status, 429, 'a DIFFERENT user must have their own independent quota bucket');
  } finally {
    delete process.env.AI_QUOTA_PER_USER_PER_HOUR;
    __resetRateLimitStoreForTests();
  }
});

test('direct access to the AI gateway service bypasses no authentication - hitting it straight (as if skipping a reverse proxy) still enforces the same session check', async () => {
  // This test file already talks to the gateway "directly" (its own bound port, not through
  // Caddy/Vite) for every case above - there is no separate "proxied" code path in this server
  // that skips verifySession(). This test exists to make that property explicit and named.
  const response = await fetch(`${aiBaseUrl}/api/ai/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'hi' }) });
  assert.equal(response.status, 401);
});
