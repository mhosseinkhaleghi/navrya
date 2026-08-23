import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import {
  createSession, resolveSession, revokeCurrentSession, revokeAllSessions,
  rotateSession, isStepUpFresh
} from '../server/community/security/session-service.mjs';
import { readSessionCookie } from '../server/community/security/cookies.mjs';

function fakeReqWithCookieHeader(cookieHeader) {
  return { headers: { cookie: cookieHeader || '' }, ip: '203.0.113.5', socket: {} };
}
function fakeRes() {
  const headers = {};
  return {
    getHeader: (name) => headers[name],
    setHeader: (name, value) => { headers[name] = value; },
    _headers: headers
  };
}
function cookieHeaderFromSetCookies(res) {
  const setCookie = res._headers['Set-Cookie'];
  const list = Array.isArray(setCookie) ? setCookie : [setCookie];
  return list.map((c) => c.split(';')[0]).join('; ');
}

async function makeUser(repo) {
  return repo.users.create({ displayName: 'Trader One', email: 'trader1@example.com' });
}

test('createSession + resolveSession round-trips a real cookie-carried session end to end', async () => {
  const repo = createMemoryRepo();
  const user = await makeUser(repo);
  const { rawId, record } = await createSession(repo, { userId: user.id, req: fakeReqWithCookieHeader() });
  assert.ok(rawId.length > 20);

  const res = fakeRes();
  const { issueSessionCookies } = await import('../server/community/security/session-service.mjs');
  issueSessionCookies(res, rawId, record.id);
  const cookieHeader = cookieHeaderFromSetCookies(res);

  const req = fakeReqWithCookieHeader(cookieHeader);
  const resolved = await resolveSession(repo, req);
  assert.ok(resolved);
  assert.equal(resolved.userId, user.id);
});

test('the raw session id is never recoverable from the stored record - only its hash is kept', async () => {
  const repo = createMemoryRepo();
  const user = await makeUser(repo);
  const { rawId, record } = await createSession(repo, { userId: user.id });
  assert.notEqual(record.sessionHash, rawId);
  assert.equal(record.sessionHash.length, 64); // sha256 hex
});

test('resolveSession returns null for a completely unknown/forged session cookie', async () => {
  const repo = createMemoryRepo();
  const req = fakeReqWithCookieHeader(`${readSessionCookieName()}=totally-made-up-value`);
  const resolved = await resolveSession(repo, req);
  assert.equal(resolved, null);
});

test('resolveSession returns null once the session has been revoked (logout takes effect immediately)', async () => {
  const repo = createMemoryRepo();
  const user = await makeUser(repo);
  const { rawId, record } = await createSession(repo, { userId: user.id });
  const req = fakeReqWithCookieHeader(`${readSessionCookieName()}=${rawId}`);
  assert.ok(await resolveSession(repo, req));
  await revokeCurrentSession(repo, record.id);
  assert.equal(await resolveSession(repo, req), null);
});

test('revokeAllSessions revokes every session for a user (logout-all), leaving other users unaffected', async () => {
  const repo = createMemoryRepo();
  const user = await makeUser(repo);
  const other = await repo.users.create({ displayName: 'Trader Two', email: 'trader2@example.com' });
  const s1 = await createSession(repo, { userId: user.id });
  const s2 = await createSession(repo, { userId: user.id });
  const s3 = await createSession(repo, { userId: other.id });

  await revokeAllSessions(repo, user.id, 'logout_all');

  const req1 = fakeReqWithCookieHeader(`${readSessionCookieName()}=${s1.rawId}`);
  const req2 = fakeReqWithCookieHeader(`${readSessionCookieName()}=${s2.rawId}`);
  const req3 = fakeReqWithCookieHeader(`${readSessionCookieName()}=${s3.rawId}`);
  assert.equal(await resolveSession(repo, req1), null);
  assert.equal(await resolveSession(repo, req2), null);
  assert.ok(await resolveSession(repo, req3)); // the other user's session is untouched
});

test('revokeAllSessions with exceptId preserves the session that triggered the change (e.g. the session that just changed its own password)', async () => {
  const repo = createMemoryRepo();
  const user = await makeUser(repo);
  const keep = await createSession(repo, { userId: user.id });
  const revoked = await createSession(repo, { userId: user.id });
  await revokeAllSessions(repo, user.id, 'password_changed', { exceptId: keep.record.id });

  const reqKeep = fakeReqWithCookieHeader(`${readSessionCookieName()}=${keep.rawId}`);
  const reqRevoked = fakeReqWithCookieHeader(`${readSessionCookieName()}=${revoked.rawId}`);
  assert.ok(await resolveSession(repo, reqKeep));
  assert.equal(await resolveSession(repo, reqRevoked), null);
});

test('rotateSession issues a brand-new session id (fixation prevention) and immediately invalidates the old one', async () => {
  const repo = createMemoryRepo();
  const user = await makeUser(repo);
  const original = await createSession(repo, { userId: user.id });
  const res = fakeRes();
  const rotated = await rotateSession(repo, res, original.record);
  assert.notEqual(rotated.id, original.record.id);

  const oldReq = fakeReqWithCookieHeader(`${readSessionCookieName()}=${original.rawId}`);
  assert.equal(await resolveSession(repo, oldReq), null, 'the pre-rotation session id must no longer work');

  const newCookieHeader = cookieHeaderFromSetCookies(res);
  const newReq = fakeReqWithCookieHeader(newCookieHeader);
  assert.ok(await resolveSession(repo, newReq));
});

test('isStepUpFresh reflects whether reauthentication happened recently enough for a sensitive action', async () => {
  const repo = createMemoryRepo();
  const user = await makeUser(repo);
  const { record } = await createSession(repo, { userId: user.id });
  assert.equal(isStepUpFresh(record, 5 * 60 * 1000), true);
  const stale = { ...record, reauthAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() };
  assert.equal(isStepUpFresh(stale, 5 * 60 * 1000), false);
  assert.equal(isStepUpFresh(null, 5 * 60 * 1000), false);
});

function readSessionCookieName() {
  return process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true' ? '__Host-navrya_session' : 'navrya_session';
}
