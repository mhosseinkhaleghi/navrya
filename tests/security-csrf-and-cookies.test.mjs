import { test } from 'node:test';
import assert from 'node:assert/strict';
import { issueCsrfToken, verifyCsrfToken } from '../server/community/security/csrf.mjs';
import {
  serializeSessionCookie, serializeCsrfCookie, readCookies, sessionCookieName, csrfCookieName
} from '../server/community/security/cookies.mjs';

test('a CSRF token issued for one session verifies for that same session', () => {
  const token = issueCsrfToken('session-abc');
  assert.equal(verifyCsrfToken(token, 'session-abc'), true);
});

test('a CSRF token issued for one session does NOT verify against a different session id', () => {
  const token = issueCsrfToken('session-abc');
  assert.equal(verifyCsrfToken(token, 'session-xyz'), false);
});

test('a tampered CSRF token (wrong signature) is rejected', () => {
  const token = issueCsrfToken('session-abc');
  const [nonce] = token.split('.');
  assert.equal(verifyCsrfToken(`${nonce}.deadbeef00`, 'session-abc'), false);
});

test('a malformed/empty CSRF token never throws, just fails verification', () => {
  assert.equal(verifyCsrfToken('', 'session-abc'), false);
  assert.equal(verifyCsrfToken(null, 'session-abc'), false);
  assert.equal(verifyCsrfToken('no-dot-here', 'session-abc'), false);
  assert.equal(verifyCsrfToken('valid.token', ''), false);
});

test('the session cookie is HttpOnly, SameSite=Lax, and Path=/ (never readable by page JS)', () => {
  const serialized = serializeSessionCookie('raw-session-id', { maxAgeSeconds: 3600 });
  assert.match(serialized, /HttpOnly/i);
  assert.match(serialized, /SameSite=Lax/i);
  assert.match(serialized, /Path=\//);
  assert.doesNotMatch(serialized, /Domain=/i);
});

test('the CSRF cookie is explicitly NOT HttpOnly (client JS must read it to echo it in a header)', () => {
  const serialized = serializeCsrfCookie('csrf-token-value', { maxAgeSeconds: 3600 });
  assert.doesNotMatch(serialized, /HttpOnly/i);
});

test('readCookies parses a real Cookie request header into a plain object', () => {
  const req = { headers: { cookie: `${sessionCookieName()}=abc123; ${csrfCookieName()}=def456` } };
  const parsed = readCookies(req);
  assert.equal(parsed[sessionCookieName()], 'abc123');
  assert.equal(parsed[csrfCookieName()], 'def456');
});

test('readCookies never throws on a missing or malformed Cookie header', () => {
  assert.deepEqual(readCookies({ headers: {} }), {});
  assert.doesNotThrow(() => readCookies({ headers: { cookie: ';;; not really a cookie ===' } }));
});
