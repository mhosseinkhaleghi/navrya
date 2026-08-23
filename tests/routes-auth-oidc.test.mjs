import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { createMockOidcIssuer } from './support/mock-oidc-issuer.mjs';
import { __resetOidcConfigCacheForTests } from '../server/community/security/oidc.mjs';
import { sessionCookieName, csrfCookieName } from '../server/community/security/cookies.mjs';
import { parseCookie } from 'cookie';

let server, baseUrl, repo, issuer;

before(async () => {
  process.env.ALLOWED_ORIGINS = 'http://app.example.test';
  issuer = await createMockOidcIssuer();
  process.env.OIDC_ISSUER_URL = issuer.url;
  process.env.OIDC_CLIENT_ID = 'navrya-test-client';
  process.env.OIDC_CLIENT_SECRET = 'navrya-test-secret';
  process.env.OIDC_ALLOW_INSECURE_ISSUER = 'true';
  __resetOidcConfigCacheForTests();
  repo = createMemoryRepo();
  server = createApp({ repo, uploadsDir: '/tmp' }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  process.env.OIDC_REDIRECT_URI = `${baseUrl}/api/auth/oidc/callback`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await issuer.close();
  delete process.env.OIDC_ISSUER_URL;
  delete process.env.OIDC_CLIENT_ID;
  delete process.env.OIDC_CLIENT_SECRET;
  delete process.env.OIDC_ALLOW_INSECURE_ISSUER;
  delete process.env.OIDC_REDIRECT_URI;
  __resetOidcConfigCacheForTests();
});

function cookiesFrom(response) {
  const list = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
  const jar = {};
  for (const raw of list) Object.assign(jar, parseCookie(raw.split(';')[0]));
  return jar;
}
function cookieHeader(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}

// Full, real, end-to-end OIDC login through the ACTUAL Express app (not just the adapter in
// isolation, which tests/oidc-adapter.test.mjs already covers) - /start issues the transaction
// cookie and redirects to the (mock) provider; the provider auto-approves and redirects back to
// /callback; /callback exchanges the code, creates a brand-new user (first-time sign-in), and
// issues a real session cookie, landing the browser back on the allowlisted return path.
test('a brand-new OIDC identity: /start -> provider -> /callback creates a real user and a real session end to end', async () => {
  issuer.setNextUser({ sub: 'oidc-sub-new-1', email: 'oidcnew1@example.com', email_verified: true, name: 'OIDC Newcomer' });

  const startResponse = await fetch(`${baseUrl}/api/auth/oidc/start?returnTo=/account`, { redirect: 'manual' });
  assert.equal(startResponse.status, 302);
  const txnCookie = cookiesFrom(startResponse);
  const providerUrl = startResponse.headers.get('location');
  assert.match(providerUrl, new RegExp(`^${issuer.url}/authorize`));

  const providerResponse = await fetch(providerUrl, { redirect: 'manual' });
  assert.equal(providerResponse.status, 302);
  const callbackUrl = providerResponse.headers.get('location');

  const callbackResponse = await fetch(callbackUrl, { headers: { Cookie: cookieHeader(txnCookie) }, redirect: 'manual' });
  assert.equal(callbackResponse.status, 302);
  assert.equal(callbackResponse.headers.get('location'), '/account', 'must land on the allowlisted return path, never an arbitrary one');
  const sessionJar = cookiesFrom(callbackResponse);
  assert.ok(sessionJar[sessionCookieName()]);
  assert.ok(sessionJar[csrfCookieName()]);

  const me = await fetch(`${baseUrl}/api/auth/session`, { headers: { Cookie: cookieHeader(sessionJar) } });
  const meBody = await me.json();
  assert.equal(meBody.authenticated, true);
  assert.equal(meBody.user.email, 'oidcnew1@example.com');
  assert.equal(meBody.user.emailVerified, true, 'a provider-verified email must be trusted and marked verified immediately');

  const identity = await repo.externalIdentities.findUserId(issuer.url, 'oidc-sub-new-1');
  assert.equal(identity, meBody.user.id, '(issuer, subject) must map to the real internal user id');
});

test('a returning OIDC identity resolves to the SAME internal user on a second login, never creating a duplicate account', async () => {
  issuer.setNextUser({ sub: 'oidc-sub-returning-1', email: 'returning1@example.com', email_verified: true, name: 'Returning User' });

  async function loginOnce() {
    const startResponse = await fetch(`${baseUrl}/api/auth/oidc/start`, { redirect: 'manual' });
    const txnCookie = cookiesFrom(startResponse);
    const providerResponse = await fetch(startResponse.headers.get('location'), { redirect: 'manual' });
    const callbackResponse = await fetch(providerResponse.headers.get('location'), { headers: { Cookie: cookieHeader(txnCookie) }, redirect: 'manual' });
    const jar = cookiesFrom(callbackResponse);
    const me = await fetch(`${baseUrl}/api/auth/session`, { headers: { Cookie: cookieHeader(jar) } });
    return (await me.json()).user;
  }

  const first = await loginOnce();
  const second = await loginOnce();
  assert.equal(first.id, second.id);
  assert.equal((await repo.users.list()).filter((u) => u.email === 'returning1@example.com').length, 1);
});

test('an OIDC identity whose email already belongs to a password account is rejected, never silently auto-linked', async () => {
  const existing = await repo.users.create({ displayName: 'Password User', email: 'alreadypassword@example.com' });
  await repo.users.setCredentials(existing.id, { passwordHash: 'irrelevant-for-this-test' });
  issuer.setNextUser({ sub: 'oidc-sub-preempt-1', email: 'alreadypassword@example.com', email_verified: true, name: 'Preemption Attempt' });

  const startResponse = await fetch(`${baseUrl}/api/auth/oidc/start`, { redirect: 'manual' });
  const txnCookie = cookiesFrom(startResponse);
  const providerResponse = await fetch(startResponse.headers.get('location'), { redirect: 'manual' });
  const callbackResponse = await fetch(providerResponse.headers.get('location'), { headers: { Cookie: cookieHeader(txnCookie) } });
  assert.equal(callbackResponse.status, 409);
  assert.equal((await callbackResponse.json()).error, 'EMAIL_ALREADY_REGISTERED');
});

test('the OIDC transaction cookie is single-use - replaying the same callback URL a second time fails', async () => {
  issuer.setNextUser({ sub: 'oidc-sub-replay-1', email: 'replay1@example.com', email_verified: true, name: 'Replay Test' });
  const startResponse = await fetch(`${baseUrl}/api/auth/oidc/start`, { redirect: 'manual' });
  const txnCookie = cookiesFrom(startResponse);
  const providerResponse = await fetch(startResponse.headers.get('location'), { redirect: 'manual' });
  const callbackUrl = providerResponse.headers.get('location');

  const first = await fetch(callbackUrl, { headers: { Cookie: cookieHeader(txnCookie) }, redirect: 'manual' });
  assert.equal(first.status, 302);
  const second = await fetch(callbackUrl, { headers: { Cookie: cookieHeader(txnCookie) }, redirect: 'manual' });
  assert.equal(second.status, 400, 'a consumed OIDC transaction must never be usable twice');
});

test('a callback with no transaction cookie at all is rejected, not silently trusted', async () => {
  const response = await fetch(`${baseUrl}/api/auth/oidc/callback?code=whatever&state=whatever`);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'OIDC_TRANSACTION_MISSING');
});

test('/start returns 503 OIDC_NOT_CONFIGURED when OIDC env vars are unset', async () => {
  const savedIssuer = process.env.OIDC_ISSUER_URL;
  delete process.env.OIDC_ISSUER_URL;
  try {
    const response = await fetch(`${baseUrl}/api/auth/oidc/start`, { redirect: 'manual' });
    assert.equal(response.status, 503);
  } finally {
    process.env.OIDC_ISSUER_URL = savedIssuer;
  }
});
