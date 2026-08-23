import { randomToken, hmacHex, timingSafeEqualHex } from './crypto-util.mjs';
import { csrfSecret } from './secrets.mjs';
import { readCsrfCookie } from './cookies.mjs';

// Signed double-submit cookie CSRF defense (OWASP CSRF Prevention Cheat Sheet's documented
// pattern for a stateless/no-per-request-server-state design): the token handed to the client
// is `nonce.signature`, where signature = HMAC(nonce + ':' + sessionId, secret). Binding the
// signature to the CURRENT session id (not just "some random value only the server could have
// issued") means a token cannot be replayed against a different session - e.g. if an attacker
// can plant a cookie on the victim's browser via a related subdomain but cannot read it or the
// victim's real session, they cannot forge a value that verifies against the victim's session id.
export function issueCsrfToken(sessionId) {
  const nonce = randomToken(16);
  const sig = hmacHex(`${nonce}:${sessionId}`, csrfSecret());
  return `${nonce}.${sig}`;
}

export function verifyCsrfToken(token, sessionId) {
  if (!token || typeof token !== 'string' || !sessionId) return false;
  const dot = token.indexOf('.');
  if (dot < 1) return false;
  const nonce = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = hmacHex(`${nonce}:${sessionId}`, csrfSecret());
  return timingSafeEqualHex(sig, expected);
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Applied AFTER session resolution (req.currentUser/req.sessionId already set) and after the
// Origin/Referer/Fetch-Metadata check (see origin-check.mjs) - CSRF token verification is the
// second, independent layer, not a replacement for origin validation. Requires BOTH the double
// submit (header value === cookie value, proving the request could read this origin's cookies)
// AND the signature binding (proving the value was actually issued by this server for THIS
// session, not just copied from cookie to header by same-origin JS an attacker also controls
// via some other bug). A request with no session (anonymous/public POST endpoints) is exempt -
// callers only mount this on session-gated routers.
export function csrfProtection() {
  return function (req, res, next) {
    if (SAFE_METHODS.has(req.method)) return next();
    const header = req.header('x-csrf-token');
    const cookie = readCsrfCookie(req);
    if (!header || !cookie || header !== cookie) {
      return res.status(403).json({ error: 'CSRF_TOKEN_MISSING' });
    }
    if (!verifyCsrfToken(cookie, req.sessionId)) {
      return res.status(403).json({ error: 'CSRF_TOKEN_INVALID' });
    }
    next();
  };
}
