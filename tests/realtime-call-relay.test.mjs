import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { __resetRateLimitStoreForTests } from '../server/community/security/rate-limit.mjs';
import { __resetRealtimeLeaseStoreForTests } from '../server/community/security/realtime-lease-store.mjs';

// GPT-Live 1 voice provider migration: OpenAI Realtime is retired as a Voice Mode transport -
// POST /api/ai/realtime/call (the same-origin SDP relay, fix/voice-mode-hosted-connection) and
// POST /api/ai/realtime/session (the ephemeral-credential mint) both now return
// REALTIME_VOICE_RETIRED unconditionally, never forwarding to OpenAI, for ANY request shape - see
// server/pattern-ai-server.mjs's own comments at each route's dispatch point. This file used to be
// the full behavioral suite for the live relay (auth, lease single-use, content-type, SDP size,
// upstream error mapping, ...); all of that is now unreachable dead code from the HTTP surface, so
// this file was rewritten to prove the retirement itself instead - the underlying
// handleRealtimeCallRelay()/mintRealtimeClientSecret() implementations are left fully intact
// (tests/ai-realtime-voice-session.test.mjs still calls mintRealtimeClientSecret() directly and
// passes) as the historical, still-correct record of what Realtime Voice Mode used to do. Same
// real-two-server-over-real-HTTP convention tests/ai-gateway-auth.test.mjs already established.
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

beforeEach(() => {
  __resetRateLimitStoreForTests();
  __resetRealtimeLeaseStoreForTests();
});

const originalFetch = globalThis.fetch;
let upstreamCalled = false;
function stubOpenAiUpstream() {
  upstreamCalled = false;
  globalThis.fetch = async (url, options) => {
    const href = String(url);
    if (href === 'https://api.openai.com/v1/realtime/calls' || href === 'https://api.openai.com/v1/realtime/client_secrets') {
      upstreamCalled = true;
      return new Response('should never be reached', { status: 200 });
    }
    return originalFetch(url, options);
  };
}
function restoreFetch() { globalThis.fetch = originalFetch; }

let counter = 0;
function uniqueEmail() { counter += 1; return `voice-retired-${counter}-${Date.now()}@example.com`; }

async function registerAndGetCookie(email) {
  const response = await fetch(`${communityBaseUrl}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'a genuinely long passphrase 1234', displayName: 'Voice Retired Tester' })
  });
  const body = await response.json();
  const setCookie = response.headers.getSetCookie().find((c) => c.startsWith('navrya_session=') || c.startsWith('__Host-navrya_session='));
  return { userId: body.user.id, cookie: setCookie.split(';')[0] };
}

test('POST /api/ai/realtime/call always returns 410 REALTIME_VOICE_RETIRED and never reaches OpenAI, with a real, plausible-looking SDP/bearer/cookie', async () => {
  const { cookie } = await registerAndGetCookie(uniqueEmail());
  stubOpenAiUpstream();
  try {
    const response = await fetch(`${aiBaseUrl}/api/ai/realtime/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/sdp', Authorization: 'Bearer ek_looks_real_but_was_never_minted', Cookie: cookie },
      body: 'v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\ns=-\r\n'
    });
    assert.equal(response.status, 410);
    assert.equal((await response.json()).error, 'REALTIME_VOICE_RETIRED');
    assert.equal(upstreamCalled, false, 'no request may ever reach OpenAI\'s Realtime endpoint once retired');
  } finally { restoreFetch(); }
});

test('the retirement applies even with no auth at all - never a real auth error, never a real relay attempt', async () => {
  stubOpenAiUpstream();
  try {
    const response = await fetch(`${aiBaseUrl}/api/ai/realtime/call`, {
      method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: 'v=0'
    });
    assert.equal(response.status, 410);
    assert.equal((await response.json()).error, 'REALTIME_VOICE_RETIRED');
    assert.equal(upstreamCalled, false);
  } finally { restoreFetch(); }
});

test('the retirement applies regardless of Content-Type or body shape - it never even reaches the old content-type/SDP-size validation', async () => {
  const { cookie } = await registerAndGetCookie(uniqueEmail());
  const response = await fetch(`${aiBaseUrl}/api/ai/realtime/call`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: '{}'
  });
  assert.equal(response.status, 410);
  assert.equal((await response.json()).error, 'REALTIME_VOICE_RETIRED');
});

test('a GET to the relay URL is unaffected - the retirement only intercepts POST, matching the route\'s own pre-existing method scoping', async () => {
  const response = await fetch(`${aiBaseUrl}/api/ai/realtime/call`, { method: 'GET' });
  assert.notEqual(response.status, 410, 'a GET was never the relay route to begin with');
});

test('POST /api/ai/realtime/session still requires a real session (401 for anonymous) - the pre-existing auth contract is preserved - but an authenticated caller now gets 410 REALTIME_VOICE_RETIRED, never a minted credential', async () => {
  const anonymous = await fetch(`${aiBaseUrl}/api/ai/realtime/session`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ language: 'en' })
  });
  assert.equal(anonymous.status, 401);

  const { cookie } = await registerAndGetCookie(uniqueEmail());
  stubOpenAiUpstream();
  try {
    const authenticated = await fetch(`${aiBaseUrl}/api/ai/realtime/session`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ language: 'en', apiKey: 'sk-whatever' })
    });
    assert.equal(authenticated.status, 410);
    const body = await authenticated.json();
    assert.equal(body.error, 'REALTIME_VOICE_RETIRED');
    assert.equal(body.value, undefined, 'no client secret may ever be present once retired');
    assert.equal(upstreamCalled, false, 'no request may ever reach OpenAI\'s Realtime endpoint once retired, even a real BYOK-shaped one');
  } finally { restoreFetch(); }
});

test('a suspended user hitting either retired route still gets the real ACCOUNT_SUSPENDED answer, not the retirement error - auth is checked first', async () => {
  const { userId, cookie } = await registerAndGetCookie(uniqueEmail());
  await communityRepo.users.update(userId, { suspendedAt: new Date().toISOString() });
  const response = await fetch(`${aiBaseUrl}/api/ai/realtime/session`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ language: 'en' })
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'ACCOUNT_SUSPENDED');
});
