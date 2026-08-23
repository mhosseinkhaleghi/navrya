import { signToken, resolveAuthSecret } from '../../server/community/auth-tokens.mjs';
import { createSession } from '../../server/community/security/session-service.mjs';
import { sessionCookieName, csrfCookieName } from '../../server/community/security/cookies.mjs';

// Legacy-format bearer token - kept only for the small number of tests that specifically
// exercise the time-boxed POST /api/auth/legacy-exchange endpoint (the one place this old format
// is still accepted at all). Every other contract test uses authHeadersFor() below instead,
// since requireAuth (server/community/auth-real.mjs) now verifies a real cookie-backed session,
// never this header.
export function testToken(userId) {
  return signToken(userId, resolveAuthSecret());
}

// Mints a REAL session (server/community/security/session-service.mjs) against the same repo
// instance the test's app was built with, and returns the exact header pair a real browser
// would send: a Cookie carrying the raw session id, and the matching X-CSRF-Token for any
// state-changing request (server/community/security/csrf.mjs's double-submit check needs both
// the cookie and the header to match, plus the signature to verify against the session id -
// see that module's own tests). GET/HEAD/OPTIONS requests simply ignore the extra header.
//
// Cached per (repo, userId) so a test file calling api(..., {userId}) many times across many
// assertions reuses one session instead of minting a new one per call - mirrors how a real
// browser keeps one session cookie for the duration of its use, and keeps this helper's own
// overhead negligible even across this project's large contract-test suite.
const sessionCache = new WeakMap();
export async function authHeadersFor(repo, userId) {
  let byUser = sessionCache.get(repo);
  if (!byUser) { byUser = new Map(); sessionCache.set(repo, byUser); }
  let entry = byUser.get(userId);
  if (!entry) {
    const { rawId, record } = await createSession(repo, { userId });
    // Reproduces just the cookie VALUES a real Set-Cookie response would carry (there's no real
    // `res` object inside this helper to run issueSessionCookies() against), using the exact
    // same cookie names cookies.mjs defines so this stays correct if those names ever change.
    const { issueCsrfToken } = await import('../../server/community/security/csrf.mjs');
    const csrfToken = issueCsrfToken(record.id);
    entry = { cookie: `${sessionCookieName()}=${rawId}; ${csrfCookieName()}=${csrfToken}`, csrfToken };
    byUser.set(userId, entry);
  }
  return { Cookie: entry.cookie, 'x-csrf-token': entry.csrfToken };
}
