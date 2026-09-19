import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { parseCookie } from 'cookie';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { ApiError } from '../server/community/errors.mjs';
import { createMockOidcIssuer } from './support/mock-oidc-issuer.mjs';
import { __resetOidcConfigCacheForTests } from '../server/community/security/oidc.mjs';
import { __setRateLimitStoreForTests, createMemoryRateLimitStore, __resetRateLimitStoreForTests } from '../server/community/security/rate-limit.mjs';
import { referralCookieName, serializeReferralCookie } from '../server/community/security/cookies.mjs';
import { signReferralCookie, verifyReferralCookie, claimReferralAttribution, claimReferralAttributionSafe, ipHashOf, uaHashOf, NEW_ACCOUNT_WINDOW_MS } from '../server/commercial/referral-attribution.mjs';
import { parseAssignmentInput, MICRO } from '../server/commercial/referral-rules.mjs';
import { setupProgram } from './helpers/referral-repo-scenarios.mjs';

let server, baseUrl, repo, issuer;
const GOOD_PASSWORD = 'a genuinely long passphrase 1234';
let counter = 0;
const email = () => `referral${(counter += 1)}-${Date.now()}@example.test`;

async function fakeVerifyGoogleCredential(_clientId, credential) {
  try { return JSON.parse(credential); } catch { throw new ApiError(401, 'GOOGLE_TOKEN_INVALID'); }
}
const googleCredential = (sub, addr, verified = true) => JSON.stringify({ sub, email: addr, email_verified: verified, name: 'Google Person' });

before(async () => {
  process.env.ALLOWED_ORIGINS = 'http://app.example.test';
  process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
  issuer = await createMockOidcIssuer();
  process.env.OIDC_ISSUER_URL = issuer.url;
  process.env.OIDC_CLIENT_ID = 'navrya-test-client';
  process.env.OIDC_CLIENT_SECRET = 'navrya-test-secret';
  process.env.OIDC_ALLOW_INSECURE_ISSUER = 'true';
  __resetOidcConfigCacheForTests();
  repo = createMemoryRepo();
  server = createApp({ repo, uploadsDir: '/tmp', authDeps: { verifyGoogleCredential: fakeVerifyGoogleCredential } }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  process.env.OIDC_REDIRECT_URI = `${baseUrl}/api/auth/oidc/callback`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await issuer.close();
  for (const key of ['OIDC_ISSUER_URL', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET', 'OIDC_ALLOW_INSECURE_ISSUER', 'OIDC_REDIRECT_URI', 'COOKIE_SECURE']) delete process.env[key];
  __resetOidcConfigCacheForTests();
  __resetRateLimitStoreForTests();
});
beforeEach(() => { __setRateLimitStoreForTests(createMemoryRateLimitStore()); delete process.env.COOKIE_SECURE; });

const setCookies = (response) => (response.headers.getSetCookie ? response.headers.getSetCookie() : []);
function jarFrom(response) {
  const jar = {};
  for (const raw of setCookies(response)) Object.assign(jar, parseCookie(raw.split(';')[0]));
  return jar;
}
const cookieHeader = (jar) => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');

// One shared server/repo for the file; each test builds its OWN program world (archiving the previous platform default, which
// relinquishes the default flag) and only ever queries by its own referrer / code.
async function freshWorld(options = {}) {
  for (const program of await repo.referralPrograms.listPrograms()) {
    if (program.status !== 'archived') await repo.referralPrograms.updateProgram(program.id, { status: 'archived' });
  }
  return setupProgram(repo, options);
}

const click = (code, headers = {}) => fetch(`${baseUrl}/api/referrals/c/${code}`, { redirect: 'manual', headers });
async function attributionCookieFor(code) {
  const response = await click(code);
  const jar = jarFrom(response);
  return { response, token: jar[referralCookieName()] };
}
const register = (token, addr = email()) => fetch(`${baseUrl}/api/auth/register`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Cookie: `${referralCookieName()}=${token}` } : {}) },
  body: JSON.stringify({ email: addr, password: GOOD_PASSWORD, displayName: 'New Trader' })
});

// --- the link endpoint ----------------------------------------------------------------------------------------------
test('GET /api/referrals/c/:code is public, sets a signed HttpOnly SameSite=Lax host-only cookie, records a click and redirects to /', async () => {
  const ctx = await freshWorld();
  const { response, token } = await attributionCookieFor(ctx.code.publicCode);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/');
  const raw = setCookies(response).find((c) => c.startsWith(referralCookieName() + '='));
  assert.ok(raw, 'the attribution cookie was set');
  assert.match(raw, /HttpOnly/i);
  assert.match(raw, /SameSite=Lax/i);
  assert.match(raw, /Path=\//);
  assert.doesNotMatch(raw, /Domain=/i, 'host-only: never a Domain attribute');
  assert.match(raw, new RegExp('Max-Age=' + 30 * 24 * 60 * 60), 'lifetime = the program attribution window');
  const payload = verifyReferralCookie(token);
  assert.equal(payload.publicCode, ctx.code.publicCode);
  assert.deepEqual(await repo.referral.clickStats(ctx.code.id), { clicks: 1, uniqueVisitors: 1 });
});
test('in a secure deployment the cookie is __Host- prefixed, Secure and still host-only', async () => {
  const ctx = await freshWorld();
  process.env.COOKIE_SECURE = 'true';
  const response = await click(ctx.code.publicCode);
  const raw = setCookies(response).find((c) => c.startsWith('__Host-navrya_ref='));
  assert.ok(raw);
  assert.match(raw, /Secure/i);
  assert.match(raw, /HttpOnly/i);
  assert.doesNotMatch(raw, /Domain=/i);
});
test('an unknown, malformed, disabled-referrer or paused code answers the IDENTICAL redirect with no cookie (no existence oracle)', async () => {
  const ctx = await freshWorld();
  const outcomes = [];
  for (const code of ['NOSUCHCODE', 'x', "'--", ctx.code.publicCode.toLowerCase() + '%00']) {
    const response = await click(code);
    outcomes.push([response.status, response.headers.get('location'), setCookies(response).length]);
  }
  await repo.referralPrograms.assign(ctx.referrer.id, parseAssignmentInput({ mode: 'disabled' }), { createdBy: ctx.admin.id });
  const disabled = await click(ctx.code.publicCode);
  outcomes.push([disabled.status, disabled.headers.get('location'), setCookies(disabled).length]);
  assert.ok(outcomes.every(([status, location, cookies]) => status === 302 && location === '/' && cookies === 0), JSON.stringify(outcomes));
  const other = await freshWorld();
  await repo.referralPrograms.updateProgram(other.program.id, { status: 'paused' });
  const paused = await click(other.code.publicCode);
  assert.deepEqual([paused.status, paused.headers.get('location'), setCookies(paused).length], [302, '/', 0], 'a paused program takes no NEW attributions');
});
test('the link endpoint is rate limited per IP', async () => {
  const ctx = await freshWorld();
  let last;
  for (let i = 0; i < 61; i++) last = await click(ctx.code.publicCode);
  assert.equal(last.status, 429);
});
test('a broken repository never breaks the link: the visitor is still redirected', async () => {
  const ctx = await freshWorld();
  const original = repo.referral.getCodeByPublicCode;
  repo.referral.getCodeByPublicCode = async () => { throw new Error('db down'); };
  const log = console.error; console.error = () => {};
  try {
    const response = await click(ctx.code.publicCode);
    assert.deepEqual([response.status, response.headers.get('location')], [302, '/']);
  } finally { console.error = log; repo.referral.getCodeByPublicCode = original; }
});

// --- signed cookie ------------------------------------------------------------------------------------------------
test('the attribution token cannot be forged, altered, replayed after expiry or reused across versions', () => {
  const good = signReferralCookie({ publicCode: 'ABCD2345', ttlSeconds: 3600 });
  assert.equal(verifyReferralCookie(good).publicCode, 'ABCD2345');
  const [v, payload, signature] = good.split('.');
  const forged = Buffer.from(JSON.stringify({ c: 'ZZZZ2345', i: Math.floor(Date.now() / 1000), e: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
  assert.equal(verifyReferralCookie([v, forged, signature].join('.')), null, 'a payload swapped under a valid signature');
  assert.equal(verifyReferralCookie([v, payload, signature.slice(0, -2) + 'AA'].join('.')), null, 'a corrupted signature');
  assert.equal(verifyReferralCookie(['v2', payload, signature].join('.')), null, 'an unknown version');
  assert.equal(verifyReferralCookie(good, Date.now() + 2 * 3600 * 1000), null, 'expired');
  assert.equal(verifyReferralCookie('garbage'), null);
  assert.equal(verifyReferralCookie(null), null);
  assert.equal(verifyReferralCookie('a'.repeat(1000)), null);
});

// --- new-account registration paths --------------------------------------------------------------------------------
test('EMAIL registration with a valid cookie creates the account AND a snapshotted attribution, and clears the one-shot cookie', async () => {
  const ctx = await freshWorld({ commissionBps: 1234 });
  const { token } = await attributionCookieFor(ctx.code.publicCode);
  const response = await register(token);
  assert.equal(response.status, 201);
  const body = await response.json();
  const attribution = await repo.referral.getAttributionByReferred(body.user.id);
  assert.ok(attribution, 'attributed');
  assert.equal(attribution.referrerUserId, ctx.referrer.id);
  assert.equal(attribution.commissionBps, 1234);
  assert.equal(attribution.rulesSnapshot.versionId, ctx.version.id, 'the program version is frozen on the attribution');
  assert.equal(attribution.mode, 'standard');
  const cleared = setCookies(response).find((c) => c.startsWith(referralCookieName() + '='));
  assert.match(cleared, /Max-Age=0/, 'the cookie is consumed');
  assert.equal((await repo.referral.listAttempts({ codeId: ctx.code.id }))[0].outcome, 'attributed');
});
test('registration with NO cookie, a tampered cookie or an expired cookie still creates the account and no attribution', async () => {
  const ctx = await freshWorld();
  const { token } = await attributionCookieFor(ctx.code.publicCode);
  const tampered = token.slice(0, -3) + 'abc';
  const expired = signReferralCookie({ publicCode: ctx.code.publicCode, ttlSeconds: 60, nowMs: Date.now() - 3600 * 1000 });
  for (const value of [null, tampered, expired]) {
    const response = await register(value);
    assert.equal(response.status, 201);
    assert.equal(await repo.referral.getAttributionByReferred((await response.json()).user.id), null);
  }
});
test('LOGIN of an existing user never attributes, even with a valid cookie', async () => {
  const ctx = await freshWorld();
  const addr = email();
  const created = await register(null, addr);
  const existingId = (await created.json()).user.id;
  const { token } = await attributionCookieFor(ctx.code.publicCode);
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: `${referralCookieName()}=${token}` }, body: JSON.stringify({ email: addr, password: GOOD_PASSWORD })
  });
  assert.equal(login.status, 200);
  assert.equal(await repo.referral.getAttributionByReferred(existingId), null);
  assert.deepEqual(await repo.referral.listAttempts({ codeId: ctx.code.id }), [], 'not even an attempt: login never reaches the claim');
});
test('GOOGLE: a brand-new identity is attributed; a returning identity and an email collision are not', async () => {
  const ctx = await freshWorld();
  const { token } = await attributionCookieFor(ctx.code.publicCode);
  const google = (credential, cookie) => fetch(`${baseUrl}/api/auth/google`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: `${referralCookieName()}=${cookie}` } : {}) }, body: JSON.stringify({ credential })
  });
  const fresh = await google(googleCredential('g-sub-1', email()), token);
  assert.equal(fresh.status, 201);
  const freshUser = (await fresh.json()).user;
  assert.ok(await repo.referral.getAttributionByReferred(freshUser.id), 'a new Google account is attributed');

  const again = await attributionCookieFor(ctx.code.publicCode);
  const returning = await google(googleCredential('g-sub-1', 'whatever@example.test'), again.token);
  assert.equal(returning.status, 200, 'the same Google identity signs in');
  assert.equal((await repo.referral.listAttributions({ referrerUserId: ctx.referrer.id })).length, 1, 'a returning login adds no attribution');

  const takenEmail = email();
  await register(null, takenEmail);
  const collision = await google(googleCredential('g-sub-2', takenEmail), (await attributionCookieFor(ctx.code.publicCode)).token);
  assert.equal(collision.status, 409);
  assert.equal((await repo.referral.listAttributions({ referrerUserId: ctx.referrer.id })).length, 1, 'a collision never attributes');
});
test('OIDC: a brand-new identity is attributed; a returning identity is not', async () => {
  const ctx = await freshWorld();
  async function oidcLogin(user, attributionToken) {
    issuer.setNextUser(user);
    const start = await fetch(`${baseUrl}/api/auth/oidc/start`, { redirect: 'manual' });
    const txn = jarFrom(start);
    const provider = await fetch(start.headers.get('location'), { redirect: 'manual' });
    const headers = { Cookie: cookieHeader({ ...txn, ...(attributionToken ? { [referralCookieName()]: attributionToken } : {}) }) };
    return fetch(provider.headers.get('location'), { headers, redirect: 'manual' });
  }
  const first = await oidcLogin({ sub: 'oidc-ref-1', email: email(), email_verified: true, name: 'Oidc One' }, (await attributionCookieFor(ctx.code.publicCode)).token);
  assert.equal(first.status, 302);
  const identity = await repo.externalIdentities.findUserId(issuer.url, 'oidc-ref-1');
  assert.ok(await repo.referral.getAttributionByReferred(identity), 'a new OIDC identity is attributed');
  const second = await oidcLogin({ sub: 'oidc-ref-1', email: 'x@example.test', email_verified: true, name: 'Oidc One' }, (await attributionCookieFor(ctx.code.publicCode)).token);
  assert.equal(second.status, 302);
  assert.equal((await repo.referral.listAttributions({ referrerUserId: ctx.referrer.id })).length, 1, 'a returning OIDC identity never attributes');
});

// --- claim rules ---------------------------------------------------------------------------------------------------
function fakeReq(token, { ip = '10.9.8.7', ua = 'Mozilla/5.0 test' } = {}) {
  return { ip, headers: { cookie: `${referralCookieName()}=${token}`, 'user-agent': ua } };
}
const fakeRes = () => ({ headers: {}, getHeader(k) { return this.headers[k]; }, setHeader(k, v) { this.headers[k] = v; } });
async function newUser(name = 'Claimant') { return repo.users.create({ displayName: name, email: email() }); }

test('self-referral is refused (own code, or the same email), and recorded as a rejected attempt', async () => {
  const ctx = await freshWorld();
  const token = signReferralCookie({ publicCode: ctx.code.publicCode, ttlSeconds: 3600 });
  const own = await claimReferralAttribution(repo, { req: fakeReq(token), res: fakeRes(), userId: ctx.referrer.id });
  assert.deepEqual([own.claimed, own.reason], [false, 'SELF_REFERRAL']);
  const referrer = await repo.users.get(ctx.referrer.id);
  const twin = await repo.users.create({ displayName: 'Twin' });
  // a second account that somehow carries the referrer's email (case-insensitively) is the same person
  const tweaked = { ...twin }; void tweaked;
  const originalGet = repo.users.get;
  repo.users.get = async (id) => (id === twin.id ? { ...(await originalGet(id)), email: referrer.email ? referrer.email.toUpperCase() : 'same@example.test' } : originalGet(id));
  const withEmail = referrer.email ? await claimReferralAttribution(repo, { req: fakeReq(token), res: fakeRes(), userId: twin.id }) : { reason: 'SELF_REFERRAL' };
  repo.users.get = originalGet;
  assert.equal(withEmail.reason, 'SELF_REFERRAL');
  assert.ok((await repo.referral.listAttempts({ codeId: ctx.code.id })).every((a) => a.outcome === 'rejected'));
});
test('only a GENUINELY NEW account is attributed: an old account and an existing paying customer are refused', async () => {
  const ctx = await freshWorld();
  const token = signReferralCookie({ publicCode: ctx.code.publicCode, ttlSeconds: 86400 });
  const old = await newUser('Old');
  const tooLate = await claimReferralAttribution(repo, { req: fakeReq(token), res: fakeRes(), userId: old.id, nowMs: Date.now() + NEW_ACCOUNT_WINDOW_MS + 1000 });
  assert.equal(tooLate.reason, 'NOT_NEW_ACCOUNT');
  const customer = await newUser('Customer');
  const tx = await repo.paymentTransactions.create({ userId: customer.id, type: 'subscription', provider: 'manual', amountMicroUsd: 10 * MICRO, currency: 'USD', productId: 'pro', metadata: {} });
  await repo.paymentTransactions.setStatus(tx.id, 'confirmed', { confirmedAt: new Date().toISOString() });
  assert.equal((await claimReferralAttribution(repo, { req: fakeReq(token), res: fakeRes(), userId: customer.id })).reason, 'EXISTING_CUSTOMER');
});
test('a duplicate claim is idempotent: the second claim for the same user changes nothing', async () => {
  const ctx = await freshWorld();
  const token = signReferralCookie({ publicCode: ctx.code.publicCode, ttlSeconds: 3600 });
  const user = await newUser();
  assert.equal((await claimReferralAttribution(repo, { req: fakeReq(token), res: fakeRes(), userId: user.id })).claimed, true);
  const second = await claimReferralAttribution(repo, { req: fakeReq(token), res: fakeRes(), userId: user.id });
  assert.deepEqual([second.claimed, second.reason], [false, 'ALREADY_ATTRIBUTED']);
  assert.equal((await repo.referral.listAttributions({ referrerUserId: ctx.referrer.id })).length, 1);
});
test('a suspended referrer, a disabled code, a Disabled assignment and a paused program take no new attribution', async () => {
  const ctx = await freshWorld();
  const token = signReferralCookie({ publicCode: ctx.code.publicCode, ttlSeconds: 3600 });
  await repo.referral.setCodeStatus(ctx.referrer.id, 'disabled');
  assert.equal((await claimReferralAttribution(repo, { req: fakeReq(token), res: fakeRes(), userId: (await newUser()).id })).reason, 'CODE_INVALID');
  await repo.referral.setCodeStatus(ctx.referrer.id, 'active');
  await repo.users.update(ctx.referrer.id, { suspendedAt: new Date().toISOString() });
  assert.equal((await claimReferralAttribution(repo, { req: fakeReq(token), res: fakeRes(), userId: (await newUser()).id })).reason, 'REFERRER_UNAVAILABLE');
  await repo.users.update(ctx.referrer.id, { suspendedAt: null });
  await repo.referralPrograms.assign(ctx.referrer.id, parseAssignmentInput({ mode: 'disabled' }), { createdBy: ctx.admin.id });
  assert.equal((await claimReferralAttribution(repo, { req: fakeReq(token), res: fakeRes(), userId: (await newUser()).id })).reason, 'REFERRER_NOT_ELIGIBLE');
});
test('an INFLUENCER assignment is snapshotted with its negotiated rate, term and caps', async () => {
  const ctx = await freshWorld();
  const inf = await repo.referralPrograms.createProgram({ kind: 'influencer', name: 'Creators', createdBy: ctx.admin.id });
  const { parseProgramVersionInput } = await import('../server/commercial/referral-rules.mjs');
  const draft = await repo.referralPrograms.createDraftVersion(inf.id, parseProgramVersionInput({ commissionBps: 2000, eligibleSources: ['subscription'], attributionWindowDays: 60, holdDays: 7, cashOutMinimumUsd: 10 }), { createdBy: ctx.admin.id });
  const version = await repo.referralPrograms.publishVersion(draft.id, { publishedBy: ctx.admin.id });
  await repo.referralPrograms.assign(ctx.referrer.id, parseAssignmentInput({ mode: 'influencer', programVersionId: version.id, rateBpsOverride: 3000, commissionTermDays: 90, partnershipCapUsd: 250 }), { createdBy: ctx.admin.id });
  const link = await click(ctx.code.publicCode);
  assert.match(setCookies(link)[0], new RegExp('Max-Age=' + 60 * 24 * 60 * 60), 'the influencer version sets the cookie window');
  const token = jarFrom(link)[referralCookieName()];
  const user = await newUser();
  const result = await claimReferralAttribution(repo, { req: fakeReq(token), res: fakeRes(), userId: user.id });
  assert.equal(result.claimed, true);
  const attribution = await repo.referral.getAttributionByReferred(user.id);
  assert.equal(attribution.mode, 'influencer');
  assert.equal(attribution.commissionBps, 3000, 'the negotiated override, not the version rate');
  assert.equal(attribution.rulesSnapshot.caps.partnershipCapMicroUsd, 250 * MICRO);
  assert.ok(attribution.commissionEndsAt, 'a term limit was set');
  assert.equal(attribution.assignmentId !== null, true);
});

// --- IP / device overlap = a review flag, never a ban --------------------------------------------------------------
test('IP/device overlap flags the attribution for review but never blocks it, and earnings still accrue', async () => {
  const ctx = await freshWorld();
  const token = signReferralCookie({ publicCode: ctx.code.publicCode, ttlSeconds: 3600 });
  const req = fakeReq(token, { ip: '203.0.113.9', ua: 'Same Browser' });
  // the referrer has a session from the SAME network as the new signup
  await repo.authSessions.create({ userId: ctx.referrer.id, sessionHash: 'h1', familyId: 'f1', idleExpiresAt: new Date(Date.now() + 1e7).toISOString(), absoluteExpiresAt: new Date(Date.now() + 1e8).toISOString(), reauthAt: null, ipHash: ipHashOf(req), userAgent: 'x' });
  const first = await claimReferralAttribution(repo, { req, res: fakeRes(), userId: (await newUser('A')).id });
  assert.equal(first.claimed, true, 'never an automatic ban');
  assert.deepEqual(first.riskFlags, ['REFERRER_IP_MATCH']);
  const stored = (await repo.referral.listAttributions({ referrerUserId: ctx.referrer.id, riskReviewStatus: 'flagged' }));
  assert.equal(stored.length, 1);
  assert.equal(stored[0].signupIpHash, ipHashOf(req));
  assert.notEqual(stored[0].signupIpHash, '203.0.113.9', 'only a keyed hash is stored, never the raw IP');
  assert.equal(stored[0].signupUaHash, uaHashOf(req));
  // several signups from one fingerprint flag the later ones
  await claimReferralAttribution(repo, { req, res: fakeRes(), userId: (await newUser('B')).id });
  const third = await claimReferralAttribution(repo, { req, res: fakeRes(), userId: (await newUser('C')).id });
  assert.ok(third.riskFlags.includes('DUPLICATE_SIGNUP_FINGERPRINT'));
});

// --- failure isolation -----------------------------------------------------------------------------------------------
test('an attribution failure NEVER prevents account creation (email registration still returns 201 with a working session)', async () => {
  const ctx = await freshWorld();
  const { token } = await attributionCookieFor(ctx.code.publicCode);
  const original = repo.referral.claimAttribution;
  repo.referral.claimAttribution = async () => { throw new Error('attribution store exploded'); };
  const log = console.error; console.error = () => {};
  try {
    const response = await register(token);
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.ok(await repo.users.get(body.user.id), 'the account exists');
    const me = await fetch(`${baseUrl}/api/auth/session`, { headers: { Cookie: cookieHeader(jarFrom(response)) } });
    assert.equal((await me.json()).authenticated, true, 'and its session works');
  } finally { console.error = log; repo.referral.claimAttribution = original; }
});
test('claimReferralAttributionSafe swallows every error and reports it as "no attribution"', async () => {
  const ctx = await freshWorld();
  const token = signReferralCookie({ publicCode: ctx.code.publicCode, ttlSeconds: 3600 });
  const broken = { ...repo, referral: { ...repo.referral, getCodeByPublicCode: async () => { throw new Error('boom'); } } };
  const log = console.error; console.error = () => {};
  try {
    const result = await claimReferralAttributionSafe(broken, { req: fakeReq(token), res: fakeRes(), userId: (await newUser()).id });
    assert.deepEqual([result.claimed, result.reason], [false, 'ERROR']);
  } finally { console.error = log; }
});
test('serializeReferralCookie is host-only HttpOnly SameSite=Lax by construction', () => {
  const raw = serializeReferralCookie('tok', { maxAgeSeconds: 100 });
  assert.match(raw, /HttpOnly/);
  assert.match(raw, /SameSite=Lax/);
  assert.doesNotMatch(raw, /Domain=/);
});
