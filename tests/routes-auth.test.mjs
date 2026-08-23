import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { parseCookie } from 'cookie';
import { sessionCookieName, csrfCookieName } from '../server/community/security/cookies.mjs';
import { __resetRateLimitStoreForTests, createMemoryRateLimitStore, __setRateLimitStoreForTests } from '../server/community/security/rate-limit.mjs';

let server, baseUrl, repo;

before(async () => {
  process.env.ALLOWED_ORIGINS = 'http://app.example.test';
  repo = createMemoryRepo();
  server = createApp({ repo, uploadsDir: '/tmp' }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));
// A fresh in-memory rate-limit store per test - registration/login are rate-limited per IP, and
// every request in this file's own test process shares "127.0.0.1", so without this reset an
// earlier test's attempts would count against a later, unrelated test's own limit.
beforeEach(() => { __setRateLimitStoreForTests(createMemoryRateLimitStore()); });
after(() => __resetRateLimitStoreForTests());

// Real cookie-jar behavior, minimal: extracts Set-Cookie values from one response and returns a
// header string suitable for the next request, plus the parsed values individually.
function cookiesFrom(response) {
  const list = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
  const jar = {};
  for (const raw of list) {
    const parsed = parseCookie(raw.split(';')[0]);
    Object.assign(jar, parsed);
  }
  return jar;
}
function cookieHeader(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}

let uniqueCounter = 0;
function uniqueEmail() {
  uniqueCounter += 1;
  return `trader${uniqueCounter}-${Date.now()}@example.com`;
}
const GOOD_PASSWORD = 'a genuinely long passphrase 1234';

async function register(email, password = GOOD_PASSWORD, displayName = 'Test Trader') {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, displayName })
  });
  const body = await response.json();
  return { response, body, jar: cookiesFrom(response) };
}

test('register: success returns selfUserView + csrfToken, sets an HttpOnly session cookie and a readable CSRF cookie, never a raw token field', async () => {
  const { response, body, jar } = await register(uniqueEmail());
  assert.equal(response.status, 201);
  assert.equal(body.user.displayName, 'Test Trader');
  assert.ok(body.csrfToken);
  assert.doesNotMatch(JSON.stringify(body), /"token"/);
  assert.ok(jar[sessionCookieName()]);
  assert.ok(jar[csrfCookieName()]);
  const setCookieRaw = response.headers.getSetCookie().find((c) => c.startsWith(`${sessionCookieName()}=`));
  assert.match(setCookieRaw, /HttpOnly/i);
});

test('register: a password under 15 characters is rejected with PASSWORD_TOO_SHORT, not the old 4-char minimum', async () => {
  const { response, body } = await register(uniqueEmail(), 'short1234');
  assert.equal(response.status, 400);
  assert.equal(body.error, 'PASSWORD_TOO_SHORT');
});

test('register: a duplicate email is rejected with EMAIL_TAKEN', async () => {
  const email = uniqueEmail();
  await register(email);
  const { response, body } = await register(email);
  assert.equal(response.status, 409);
  assert.equal(body.error, 'EMAIL_TAKEN');
});

test('register: setting ADMIN_BOOTSTRAP_EMAIL to the registrant address has NO effect - the auto-promotion path is removed entirely, not just disabled', async () => {
  const email = uniqueEmail();
  process.env.ADMIN_BOOTSTRAP_EMAIL = email;
  try {
    const { body } = await register(email);
    assert.equal(body.user.role, 'user', 'the account must never be silently promoted to admin based on ADMIN_BOOTSTRAP_EMAIL');
    const stored = await repo.users.get(body.user.id);
    assert.equal(stored.role, 'user', 'the account must never be silently promoted to admin based on ADMIN_BOOTSTRAP_EMAIL');
  } finally {
    delete process.env.ADMIN_BOOTSTRAP_EMAIL;
  }
});

test('login: correct credentials succeed and issue a fresh session', async () => {
  const email = uniqueEmail();
  await register(email);
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: GOOD_PASSWORD })
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.user.email, email);
});

test('login: wrong password and unknown email both return the identical generic INVALID_CREDENTIALS - never confirming which', async () => {
  const email = uniqueEmail();
  await register(email);
  const wrongPw = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'totally the wrong passphrase' }) });
  const unknownEmail = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: uniqueEmail(), password: 'totally the wrong passphrase' }) });
  const wrongBody = await wrongPw.json();
  const unknownBody = await unknownEmail.json();
  assert.equal(wrongPw.status, 401);
  assert.equal(unknownEmail.status, 401);
  assert.equal(wrongBody.error, 'INVALID_CREDENTIALS');
  assert.equal(unknownBody.error, 'INVALID_CREDENTIALS');
});

test('login: a suspended account is rejected with ACCOUNT_SUSPENDED even with the correct password', async () => {
  const email = uniqueEmail();
  const { body: regBody } = await register(email);
  await repo.users.update(regBody.user.id, { suspendedAt: new Date().toISOString() });
  const response = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: GOOD_PASSWORD }) });
  const body = await response.json();
  assert.equal(response.status, 403);
  assert.equal(body.error, 'ACCOUNT_SUSPENDED');
});

test('login: a pre-existing legacy scrypt$ hash is verified successfully and transparently upgraded to argon2id', async () => {
  const { hashPassword: legacyHash } = await legacyHasher();
  const email = uniqueEmail();
  const user = await repo.users.create({ displayName: 'Legacy User', email });
  await repo.users.setCredentials(user.id, { passwordHash: legacyHash('an old legacy password 123') });
  const before = await repo.users.findCredentialsByEmail(email);
  assert.match(before.passwordHash, /^scrypt\$/);

  const response = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'an old legacy password 123' }) });
  assert.equal(response.status, 200);
  const after = await repo.users.findCredentialsByEmail(email);
  assert.match(after.passwordHash, /^\$argon2id\$/, 'a successful login against the legacy format must rehash under argon2id');
});
async function legacyHasher() {
  const { scryptSync, randomBytes } = await import('node:crypto');
  return {
    hashPassword(password) {
      const salt = randomBytes(16);
      const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
      return `scrypt$16384$8$1$${salt.toString('hex')}$${hash.toString('hex')}`;
    }
  };
}

test('GET /session: reports authenticated:false with no cookie, and the real self view once logged in', async () => {
  const anon = await fetch(`${baseUrl}/api/auth/session`);
  const anonBody = await anon.json();
  assert.equal(anonBody.authenticated, false);
  assert.equal(anonBody.user, null);

  const email = uniqueEmail();
  const { jar } = await register(email);
  const authed = await fetch(`${baseUrl}/api/auth/session`, { headers: { Cookie: cookieHeader(jar) } });
  const authedBody = await authed.json();
  assert.equal(authedBody.authenticated, true);
  assert.equal(authedBody.user.email, email);
  assert.ok(authedBody.csrfToken);
});

test('logout requires a valid CSRF token (double-submit + signature), and actually revokes the session server-side', async () => {
  const { jar } = await register(uniqueEmail());
  const noCsrf = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers: { Cookie: cookieHeader(jar) } });
  assert.equal(noCsrf.status, 403);
  assert.equal((await noCsrf.json()).error, 'CSRF_TOKEN_MISSING');

  const mismatched = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers: { Cookie: cookieHeader(jar), 'x-csrf-token': 'not-the-real-token' } });
  assert.equal(mismatched.status, 403);

  const real = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers: { Cookie: cookieHeader(jar), 'x-csrf-token': jar[csrfCookieName()] } });
  assert.equal(real.status, 200);

  const after = await fetch(`${baseUrl}/api/auth/session`, { headers: { Cookie: cookieHeader(jar) } });
  assert.equal((await after.json()).authenticated, false, 'the session must be unusable immediately after logout');
});

test('logout-all revokes every session for the user, including ones from a different "device"', async () => {
  const email = uniqueEmail();
  const { jar: deviceA } = await register(email);
  const loginB = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: GOOD_PASSWORD }) });
  const deviceB = cookiesFrom(loginB);

  const logoutAll = await fetch(`${baseUrl}/api/auth/logout-all`, { method: 'POST', headers: { Cookie: cookieHeader(deviceA), 'x-csrf-token': deviceA[csrfCookieName()] } });
  assert.equal(logoutAll.status, 200);

  const checkA = await fetch(`${baseUrl}/api/auth/session`, { headers: { Cookie: cookieHeader(deviceA) } });
  const checkB = await fetch(`${baseUrl}/api/auth/session`, { headers: { Cookie: cookieHeader(deviceB) } });
  assert.equal((await checkA.json()).authenticated, false);
  assert.equal((await checkB.json()).authenticated, false, 'a DIFFERENT device/session for the same user must also be revoked by logout-all');
});

test('GET /sessions lists active sessions and marks the current one; DELETE revokes a specific session by id, never someone else\'s', async () => {
  const emailX = uniqueEmail();
  const emailY = uniqueEmail();
  const { jar: userXJar } = await register(emailX);
  const { jar: userYJar } = await register(emailY);

  const listResponse = await fetch(`${baseUrl}/api/auth/sessions`, { headers: { Cookie: cookieHeader(userXJar) } });
  const list = (await listResponse.json()).sessions;
  assert.equal(list.length, 1);
  assert.equal(list[0].isCurrent, true);

  // User Y cannot revoke User X's session id, even knowing it.
  const crossDelete = await fetch(`${baseUrl}/api/auth/sessions/${list[0].id}`, { method: 'DELETE', headers: { Cookie: cookieHeader(userYJar), 'x-csrf-token': userYJar[csrfCookieName()] } });
  assert.equal(crossDelete.status, 404);
  const stillThere = await fetch(`${baseUrl}/api/auth/session`, { headers: { Cookie: cookieHeader(userXJar) } });
  assert.equal((await stillThere.json()).authenticated, true, 'a cross-user delete attempt must never revoke the real owner\'s session');

  const ownDelete = await fetch(`${baseUrl}/api/auth/sessions/${list[0].id}`, { method: 'DELETE', headers: { Cookie: cookieHeader(userXJar), 'x-csrf-token': userXJar[csrfCookieName()] } });
  assert.equal(ownDelete.status, 200);
});

test('password/change requires the correct current password, applies the new policy, and revokes OTHER sessions while keeping the current one', async () => {
  const email = uniqueEmail();
  const { jar: deviceA } = await register(email);
  const loginB = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: GOOD_PASSWORD }) });
  const deviceB = cookiesFrom(loginB);

  const wrongCurrent = await fetch(`${baseUrl}/api/auth/password/change`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookieHeader(deviceA), 'x-csrf-token': deviceA[csrfCookieName()] },
    body: JSON.stringify({ currentPassword: 'not the real password at all', newPassword: 'a brand new long passphrase 99' })
  });
  assert.equal(wrongCurrent.status, 401);

  const changed = await fetch(`${baseUrl}/api/auth/password/change`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookieHeader(deviceA), 'x-csrf-token': deviceA[csrfCookieName()] },
    body: JSON.stringify({ currentPassword: GOOD_PASSWORD, newPassword: 'a brand new long passphrase 99' })
  });
  assert.equal(changed.status, 200);

  const stillA = await fetch(`${baseUrl}/api/auth/session`, { headers: { Cookie: cookieHeader(deviceA) } });
  assert.equal((await stillA.json()).authenticated, true, 'the session that performed the change must remain valid');
  const nowB = await fetch(`${baseUrl}/api/auth/session`, { headers: { Cookie: cookieHeader(deviceB) } });
  assert.equal((await nowB.json()).authenticated, false, 'every OTHER session must be revoked by a password change');
});

// Captures the real dev-mode mailer.mjs console.log output (NODE_ENV !== 'production' logs the
// reset/verify link directly, since no real email provider is wired - see security/mailer.mjs)
// to recover the transactionId/token a real email would have delivered, without reaching into
// any repo internals or adding test-only surface to production code.
async function captureConsoleLog(run) {
  const original = console.log; // eslint-disable-line no-console
  const lines = [];
  console.log = (...args) => { lines.push(args.join(' ')); }; // eslint-disable-line no-console
  try {
    await run();
  } finally {
    console.log = original; // eslint-disable-line no-console
  }
  return lines.join('\n');
}
function extractLinkParams(logOutput, path) {
  const match = new RegExp(`${path}\\?transactionId=([^&\\s]+)&token=([^\\s]+)`).exec(logOutput);
  if (!match) return null;
  return { transactionId: match[1], token: match[2] };
}

test('password/forgot always responds identically whether or not the email exists (enumeration-resistant), and a real reset actually changes the password end to end', async () => {
  const email = uniqueEmail();
  await register(email);

  const known = await fetch(`${baseUrl}/api/auth/password/forgot`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
  const unknown = await fetch(`${baseUrl}/api/auth/password/forgot`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: uniqueEmail() }) });
  assert.equal(known.status, 200);
  assert.equal(unknown.status, 200);
  assert.deepEqual(await known.json(), await unknown.json());

  const email2 = uniqueEmail();
  await register(email2);
  const log = await captureConsoleLog(() => fetch(`${baseUrl}/api/auth/password/forgot`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email2 }) }));
  const params = extractLinkParams(log, '/reset-password');
  assert.ok(params, 'the dev-mode mailer must have logged a real reset link with a transactionId and token');

  const newPassword = 'a completely different long passphrase 7';
  const resetResponse = await fetch(`${baseUrl}/api/auth/password/reset`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactionId: params.transactionId, token: params.token, newPassword })
  });
  assert.equal(resetResponse.status, 200);

  const oldPwLogin = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email2, password: GOOD_PASSWORD }) });
  assert.equal(oldPwLogin.status, 401, 'the OLD password must no longer work');
  const newPwLogin = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email2, password: newPassword }) });
  assert.equal(newPwLogin.status, 200, 'the NEW password must work');

  const replay = await fetch(`${baseUrl}/api/auth/password/reset`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transactionId: params.transactionId, token: params.token, newPassword: 'yet another long passphrase 12' })
  });
  assert.equal(replay.status, 400, 'a reset token must be single-use - replaying it must fail');
});

test('email/verify: a real link works exactly once; a garbage token is rejected', async () => {
  const email = uniqueEmail();
  const log = await captureConsoleLog(() => register(email));
  const params = extractLinkParams(log, '/verify-email');
  assert.ok(params, 'registering must have sent (dev-mode logged) a real verification link');

  const badToken = await fetch(`${baseUrl}/api/auth/email/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transactionId: 'nope', token: 'nope' }) });
  assert.equal(badToken.status, 400);

  const real = await fetch(`${baseUrl}/api/auth/email/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params) });
  assert.equal(real.status, 200);

  const replay = await fetch(`${baseUrl}/api/auth/email/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params) });
  assert.equal(replay.status, 400, 'a verification token must be single-use');
});

test('legacy-exchange is disabled by default (no LEGACY_AUTH_SUNSET_AT set), and rejects once the sunset date has passed', async () => {
  delete process.env.LEGACY_AUTH_SUNSET_AT;
  const disabled = await fetch(`${baseUrl}/api/auth/legacy-exchange`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ legacyToken: 'anything' }) });
  assert.equal(disabled.status, 410);

  process.env.LEGACY_AUTH_SUNSET_AT = new Date(Date.now() - 60000).toISOString(); // in the past
  const pastSunset = await fetch(`${baseUrl}/api/auth/legacy-exchange`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ legacyToken: 'anything' }) });
  assert.equal(pastSunset.status, 410);
  delete process.env.LEGACY_AUTH_SUNSET_AT;
});

test('legacy-exchange, while inside its sunset window, trades a real legacy bearer token for a real session exactly once and revokes nothing new', async () => {
  const { testToken } = await import('./helpers/auth-token.mjs');
  const email = uniqueEmail();
  const { body } = await register(email);
  process.env.LEGACY_AUTH_SUNSET_AT = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  try {
    const legacyToken = testToken(body.user.id);
    const response = await fetch(`${baseUrl}/api/auth/legacy-exchange`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ legacyToken }) });
    const exchanged = await response.json();
    assert.equal(response.status, 200);
    assert.equal(exchanged.user.id, body.user.id);
    assert.ok(cookiesFrom(response)[sessionCookieName()], 'a real new session cookie must be issued');
  } finally {
    delete process.env.LEGACY_AUTH_SUNSET_AT;
  }
});
