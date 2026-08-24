import assert from 'node:assert/strict';
import test, { after, before, beforeEach, afterEach } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { __resetRateLimitStoreForTests } from '../server/community/security/rate-limit.mjs';
import { __resetRealtimeLeaseStoreForTests } from '../server/community/security/realtime-lease-store.mjs';

// fix/voice-mode-hosted-connection: behavioral coverage for the same-origin SDP relay
// (POST /api/ai/realtime/call, server/pattern-ai-server.mjs's handleRealtimeCallRelay). Same real-
// two-server-over-real-HTTP convention tests/ai-gateway-auth.test.mjs already established: a real
// Community API (memory repo) for real session cookies/auth, and the real pattern-ai module for
// the route under test. The only thing ever stubbed is the actual OpenAI upstream
// (`https://api.openai.com/v1/realtime/calls`) - session auth, quota, and the lease store are all
// exercised for real.
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
afterEach(() => { globalThis.fetch = originalFetch; });

let counter = 0;
function uniqueEmail() { counter += 1; return `voice-relay-${counter}-${Date.now()}@example.com`; }

async function registerAndGetCookie(email) {
  const response = await fetch(`${communityBaseUrl}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'a genuinely long passphrase 1234', displayName: 'Voice Relay Tester' })
  });
  const body = await response.json();
  const setCookie = response.headers.getSetCookie().find((c) => c.startsWith('navrya_session=') || c.startsWith('__Host-navrya_session='));
  return { userId: body.user.id, cookie: setCookie.split(';')[0] };
}

// Stubs only calls whose URL is the real OpenAI upstream; every other fetch (session-introspect,
// health-event, quota) passes through to the real local servers untouched - matching the
// selective-stub convention ai-gateway-auth.test.mjs's own first test already established.
function stubOpenAiUpstream(handler) {
  globalThis.fetch = async (url, options) => {
    const href = String(url);
    if (href === 'https://api.openai.com/v1/realtime/calls') return handler(url, options);
    return originalFetch(url, options);
  };
}

let mintedEkCounter = 0;
// Test setup only: mints a REAL credential through the REAL /api/ai/realtime/session handler
// (real session-cookie auth, real quota check, real lease-store write) - only the actual OpenAI
// `/v1/realtime/client_secrets` network call is faked (a per-call unique fake ek_ value, so two
// mints in the same test never collide), restored immediately afterward so it never leaks into
// whatever the calling test stubs next for its own `/v1/realtime/calls` assertions.
async function mintRealCredential(cookie) {
  mintedEkCounter += 1;
  const fakeValue = `ek_test_${mintedEkCounter}_${Date.now()}`;
  globalThis.fetch = async (url, options) => {
    if (String(url) === 'https://api.openai.com/v1/realtime/client_secrets') {
      return new Response(JSON.stringify({ value: fakeValue, expires_at: Math.floor(Date.now() / 1000) + 600, session: { model: 'gpt-realtime-2.1' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return originalFetch(url, options);
  };
  try {
    const response = await fetch(`${aiBaseUrl}/api/ai/realtime/session`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ language: 'en', apiKey: 'test-openai-key-not-real' })
    });
    assert.equal(response.status, 200, 'test setup: minting a real session must succeed');
    return await response.json();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function fakeSdpAnswer(status = 201, { location = 'https://api.openai.com/v1/realtime/calls/rtc_test123', body = 'v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\n' } = {}) {
  return new Response(body, { status, headers: { 'Content-Type': 'application/sdp', Location: location } });
}

test('an authenticated user with a real minted credential relays SDP successfully - upstream 2xx body/Content-Type/Location are all forwarded, Cache-Control: no-store', async () => {
  const { cookie } = await registerAndGetCookie(uniqueEmail());
  const creds = await mintRealCredential(cookie);
  let upstreamSeen = null;
  stubOpenAiUpstream((url, options) => {
    upstreamSeen = { headers: options.headers, body: options.body, redirect: options.redirect };
    return fakeSdpAnswer(201, { body: 'v=0\r\no=- 9 9 IN IP4 0.0.0.0\r\n' });
  });

  const response = await fetch(`${aiBaseUrl}/api/ai/realtime/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/sdp', Authorization: `Bearer ${creds.value}`, Cookie: cookie },
    body: 'v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\ns=-\r\n'
  });

  assert.equal(response.status, 201);
  assert.equal(response.headers.get('content-type'), 'application/sdp');
  assert.equal(response.headers.get('location'), 'https://api.openai.com/v1/realtime/calls/rtc_test123');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const text = await response.text();
  assert.match(text, /o=- 9 9 IN IP4 0\.0\.0\.0/);

  // The upstream call itself: only the required headers, the real ek_ bearer, redirects disabled.
  assert.equal(upstreamSeen.headers['Content-Type'], 'application/sdp');
  assert.equal(upstreamSeen.headers.Authorization, `Bearer ${creds.value}`);
  assert.equal(upstreamSeen.redirect, 'manual');
});

test('a token is single-use: a second relay attempt with the SAME minted credential is rejected (REALTIME_LEASE_INVALID), even though the first attempt already succeeded', async () => {
  const { cookie } = await registerAndGetCookie(uniqueEmail());
  const creds = await mintRealCredential(cookie);
  stubOpenAiUpstream(() => fakeSdpAnswer(201));

  const first = await fetch(`${aiBaseUrl}/api/ai/realtime/call`, {
    method: 'POST', headers: { 'Content-Type': 'application/sdp', Authorization: `Bearer ${creds.value}`, Cookie: cookie }, body: 'v=0'
  });
  assert.equal(first.status, 201);

  const second = await fetch(`${aiBaseUrl}/api/ai/realtime/call`, {
    method: 'POST', headers: { 'Content-Type': 'application/sdp', Authorization: `Bearer ${creds.value}`, Cookie: cookie }, body: 'v=0'
  });
  assert.equal(second.status, 401);
  assert.equal((await second.json()).error, 'REALTIME_LEASE_INVALID');
});

test('an anonymous (no session cookie) relay call is rejected with AUTH_SESSION_REQUIRED and never reaches OpenAI', async () => {
  let upstreamCalled = false;
  stubOpenAiUpstream(() => { upstreamCalled = true; return fakeSdpAnswer(); });
  const response = await fetch(`${aiBaseUrl}/api/ai/realtime/call`, {
    method: 'POST', headers: { 'Content-Type': 'application/sdp', Authorization: 'Bearer ek_whatever' }, body: 'v=0'
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'AUTH_SESSION_REQUIRED');
  assert.equal(upstreamCalled, false, 'an anonymous caller must never reach the OpenAI relay logic at all');
});

test('a suspended user is rejected with ACCOUNT_SUSPENDED, never admitted to the relay', async () => {
  const { userId, cookie } = await registerAndGetCookie(uniqueEmail());
  await communityRepo.users.update(userId, { suspendedAt: new Date().toISOString() });
  const response = await fetch(`${aiBaseUrl}/api/ai/realtime/call`, {
    method: 'POST', headers: { 'Content-Type': 'application/sdp', Authorization: 'Bearer ek_whatever', Cookie: cookie }, body: 'v=0'
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'ACCOUNT_SUSPENDED');
});

test('a non-application/sdp Content-Type is rejected with 415, before any lease/upstream work', async () => {
  const { cookie } = await registerAndGetCookie(uniqueEmail());
  let upstreamCalled = false;
  stubOpenAiUpstream(() => { upstreamCalled = true; return fakeSdpAnswer(); });
  const response = await fetch(`${aiBaseUrl}/api/ai/realtime/call`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ek_whatever', Cookie: cookie }, body: '{}'
  });
  assert.equal(response.status, 415);
  assert.equal((await response.json()).error, 'REALTIME_SDP_CONTENT_TYPE_REQUIRED');
  assert.equal(upstreamCalled, false);
});

test('a missing Authorization header is rejected with REALTIME_BEARER_INVALID', async () => {
  const { cookie } = await registerAndGetCookie(uniqueEmail());
  const response = await fetch(`${aiBaseUrl}/api/ai/realtime/call`, {
    method: 'POST', headers: { 'Content-Type': 'application/sdp', Cookie: cookie }, body: 'v=0'
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'REALTIME_BEARER_INVALID');
});

test('a malformed Bearer value (not ek_-shaped) is rejected the exact same way as a missing header', async () => {
  const { cookie } = await registerAndGetCookie(uniqueEmail());
  const response = await fetch(`${aiBaseUrl}/api/ai/realtime/call`, {
    method: 'POST', headers: { 'Content-Type': 'application/sdp', Authorization: 'Bearer not-an-ephemeral-token', Cookie: cookie }, body: 'v=0'
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'REALTIME_BEARER_INVALID');
});

test('a standard sk- API key is rejected exactly like any other malformed bearer - never given a more specific/helpful error', async () => {
  const { cookie } = await registerAndGetCookie(uniqueEmail());
  const response = await fetch(`${aiBaseUrl}/api/ai/realtime/call`, {
    method: 'POST', headers: { 'Content-Type': 'application/sdp', Authorization: 'Bearer sk-this-is-a-standard-secret-key-not-ephemeral', Cookie: cookie }, body: 'v=0'
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'REALTIME_BEARER_INVALID');
});

test('a Basic Authorization header (the preview-deploy shared-password shape) is also rejected as an invalid bearer, not treated as a valid credential for this route', async () => {
  const { cookie } = await registerAndGetCookie(uniqueEmail());
  const response = await fetch(`${aiBaseUrl}/api/ai/realtime/call`, {
    method: 'POST', headers: { 'Content-Type': 'application/sdp', Authorization: `Basic ${Buffer.from('user:pass').toString('base64')}`, Cookie: cookie }, body: 'v=0'
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'REALTIME_BEARER_INVALID');
});

test('an ek_-shaped bearer this server never minted is rejected with REALTIME_LEASE_INVALID, and never reaches OpenAI', async () => {
  const { cookie } = await registerAndGetCookie(uniqueEmail());
  let upstreamCalled = false;
  stubOpenAiUpstream(() => { upstreamCalled = true; return fakeSdpAnswer(); });
  const response = await fetch(`${aiBaseUrl}/api/ai/realtime/call`, {
    method: 'POST', headers: { 'Content-Type': 'application/sdp', Authorization: 'Bearer ek_forged_never_minted_by_this_server', Cookie: cookie }, body: 'v=0'
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'REALTIME_LEASE_INVALID');
  assert.equal(upstreamCalled, false);
});

test('a real credential minted by a DIFFERENT authenticated user is rejected - the lease is bound to the minting user, not merely "some real session exists"', async () => {
  const { cookie: cookieA } = await registerAndGetCookie(uniqueEmail());
  const { cookie: cookieB } = await registerAndGetCookie(uniqueEmail());
  const credsA = await mintRealCredential(cookieA);
  let upstreamCalled = false;
  stubOpenAiUpstream(() => { upstreamCalled = true; return fakeSdpAnswer(); });

  const response = await fetch(`${aiBaseUrl}/api/ai/realtime/call`, {
    method: 'POST', headers: { 'Content-Type': 'application/sdp', Authorization: `Bearer ${credsA.value}`, Cookie: cookieB }, body: 'v=0'
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'REALTIME_LEASE_INVALID');
  assert.equal(upstreamCalled, false, 'a cross-user lease mismatch must fail closed before ever contacting OpenAI');
});

test('an oversized SDP body is rejected with 413 before ever contacting OpenAI', async () => {
  const { cookie } = await registerAndGetCookie(uniqueEmail());
  const creds = await mintRealCredential(cookie);
  let upstreamCalled = false;
  stubOpenAiUpstream(() => { upstreamCalled = true; return fakeSdpAnswer(); });

  const oversized = 'a'.repeat(70 * 1024); // > the 64 KiB ceiling
  const response = await fetch(`${aiBaseUrl}/api/ai/realtime/call`, {
    method: 'POST', headers: { 'Content-Type': 'application/sdp', Authorization: `Bearer ${creds.value}`, Cookie: cookie }, body: oversized
  });
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error, 'REALTIME_SDP_TOO_LARGE');
  assert.equal(upstreamCalled, false);
});

test('an empty SDP body is rejected with 400, distinct from an oversized one', async () => {
  const { cookie } = await registerAndGetCookie(uniqueEmail());
  const creds = await mintRealCredential(cookie);
  const response = await fetch(`${aiBaseUrl}/api/ai/realtime/call`, {
    method: 'POST', headers: { 'Content-Type': 'application/sdp', Authorization: `Bearer ${creds.value}`, Cookie: cookie }, body: ''
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'REALTIME_SDP_EMPTY');
});

test('upstream 401/403 is mapped to a sanitized REALTIME_UPSTREAM_UNAUTHORIZED, never the raw upstream body', async () => {
  const { cookie } = await registerAndGetCookie(uniqueEmail());
  const creds = await mintRealCredential(cookie);
  stubOpenAiUpstream(() => new Response(JSON.stringify({ error: { message: 'invalid ephemeral key, project abc123, org secret-detail' } }), { status: 401, headers: { 'Content-Type': 'application/json' } }));

  const response = await fetch(`${aiBaseUrl}/api/ai/realtime/call`, {
    method: 'POST', headers: { 'Content-Type': 'application/sdp', Authorization: `Bearer ${creds.value}`, Cookie: cookie }, body: 'v=0'
  });
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.error, 'REALTIME_UPSTREAM_UNAUTHORIZED');
  const raw = JSON.stringify(body);
  assert.doesNotMatch(raw, /project abc123/);
  assert.doesNotMatch(raw, /secret-detail/);
});

test('upstream 429 is mapped to REALTIME_UPSTREAM_RATE_LIMITED and forwards Retry-After', async () => {
  const { cookie } = await registerAndGetCookie(uniqueEmail());
  const creds = await mintRealCredential(cookie);
  stubOpenAiUpstream(() => new Response('rate limited', { status: 429, headers: { 'Retry-After': '30' } }));

  const response = await fetch(`${aiBaseUrl}/api/ai/realtime/call`, {
    method: 'POST', headers: { 'Content-Type': 'application/sdp', Authorization: `Bearer ${creds.value}`, Cookie: cookie }, body: 'v=0'
  });
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error, 'REALTIME_UPSTREAM_RATE_LIMITED');
  assert.equal(response.headers.get('retry-after'), '30');
});

test('upstream 5xx is mapped to REALTIME_UPSTREAM_UNAVAILABLE', async () => {
  const { cookie } = await registerAndGetCookie(uniqueEmail());
  const creds = await mintRealCredential(cookie);
  stubOpenAiUpstream(() => new Response('internal error', { status: 503 }));

  const response = await fetch(`${aiBaseUrl}/api/ai/realtime/call`, {
    method: 'POST', headers: { 'Content-Type': 'application/sdp', Authorization: `Bearer ${creds.value}`, Cookie: cookie }, body: 'v=0'
  });
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error, 'REALTIME_UPSTREAM_UNAVAILABLE');
});

test('a genuine upstream network/timeout failure is mapped to REALTIME_RELAY_TIMEOUT, never crashes the request', async () => {
  const { cookie } = await registerAndGetCookie(uniqueEmail());
  const creds = await mintRealCredential(cookie);
  stubOpenAiUpstream(() => { throw Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' }); });

  const response = await fetch(`${aiBaseUrl}/api/ai/realtime/call`, {
    method: 'POST', headers: { 'Content-Type': 'application/sdp', Authorization: `Bearer ${creds.value}`, Cookie: cookie }, body: 'v=0'
  });
  assert.equal(response.status, 504);
  assert.equal((await response.json()).error, 'REALTIME_RELAY_TIMEOUT');
});

test('a plain upstream network error (not a timeout) is mapped to REALTIME_RELAY_FAILED', async () => {
  const { cookie } = await registerAndGetCookie(uniqueEmail());
  const creds = await mintRealCredential(cookie);
  stubOpenAiUpstream(() => { throw new Error('getaddrinfo ENOTFOUND api.openai.com'); });

  const response = await fetch(`${aiBaseUrl}/api/ai/realtime/call`, {
    method: 'POST', headers: { 'Content-Type': 'application/sdp', Authorization: `Bearer ${creds.value}`, Cookie: cookie }, body: 'v=0'
  });
  assert.equal(response.status, 504);
  assert.equal((await response.json()).error, 'REALTIME_RELAY_FAILED');
});

test('a GET to the relay URL is never treated as the relay route - falls through to the ordinary 404/Basic-Auth-gated path', async () => {
  const response = await fetch(`${aiBaseUrl}/api/ai/realtime/call`, { method: 'GET' });
  assert.notEqual(response.status, 401, 'a GET must not hit the relay\'s own auth branch at all');
});

test('console output during a real failure never contains the bearer token, the SDP body, or the raw upstream error text', async () => {
  const { cookie } = await registerAndGetCookie(uniqueEmail());
  const creds = await mintRealCredential(cookie);
  stubOpenAiUpstream(() => new Response('{"error":{"message":"a raw upstream secret-ish detail 12345"}}', { status: 400 }));

  const originalError = console.error;
  const originalWarn = console.warn;
  const originalLog = console.log;
  const captured = [];
  console.error = (...args) => captured.push(args.join(' '));
  console.warn = (...args) => captured.push(args.join(' '));
  console.log = (...args) => captured.push(args.join(' '));
  try {
    await fetch(`${aiBaseUrl}/api/ai/realtime/call`, {
      method: 'POST', headers: { 'Content-Type': 'application/sdp', Authorization: `Bearer ${creds.value}`, Cookie: cookie }, body: 'v=0 SENSITIVE_SDP_MARKER'
    });
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
    console.log = originalLog;
  }
  const combined = captured.join('\n');
  assert.doesNotMatch(combined, new RegExp(creds.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(combined, /SENSITIVE_SDP_MARKER/);
  assert.doesNotMatch(combined, /secret-ish detail 12345/);
});
