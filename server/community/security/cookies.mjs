import { parseCookie, stringifySetCookie } from 'cookie';

// Centralized cookie naming/attributes - the ONLY place either cookie's name or flags are
// decided, so a future attribute change (e.g. SameSite=Strict once the iframe architecture no
// longer needs Lax) is a one-file change. Uses the maintained `cookie` package for RFC 6265
// serialization/parsing rather than hand-rolling cookie string parsing, per instruction.
//
// `__Host-` prefix (browser-enforced: Secure + Path=/ + no Domain attribute, or the browser
// silently refuses to set the cookie at all) is used whenever the cookie is actually Secure -
// i.e. production, or local dev explicitly opted into HTTPS via COOKIE_SECURE=true. Plain HTTP
// local dev (the common case) cannot use Secure (the cookie would never be sent back over
// http://127.0.0.1), so it falls back to the unprefixed name - still HttpOnly, still SameSite,
// just without the extra browser-enforced guarantee that only applies over HTTPS anyway.
function secureCookies() {
  return process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true';
}

export function sessionCookieName() {
  return secureCookies() ? '__Host-navrya_session' : 'navrya_session';
}
// The CSRF cookie is deliberately NOT HttpOnly (client JS must read it to echo it in a header -
// that's the entire double-submit mechanism) but is still SameSite + (when possible) __Host-.
export function csrfCookieName() {
  return secureCookies() ? '__Host-navrya_csrf' : 'navrya_csrf';
}
// A short-lived OIDC transaction reference (Section auth flow) - HttpOnly, same lifetime rules
// as the session cookie but much shorter maxAge (the OIDC round trip only, ~10 minutes).
export function oidcTxnCookieName() {
  return secureCookies() ? '__Host-navrya_oidc_txn' : 'navrya_oidc_txn';
}

function baseAttributes({ maxAgeSeconds } = {}) {
  const attrs = {
    path: '/',
    sameSite: 'lax', // OWASP: SameSite=Lax is the documented minimum; Strict would break the OIDC redirect-back (a top-level cross-site GET) landing already-authenticated
    secure: secureCookies()
  };
  if (typeof maxAgeSeconds === 'number') attrs.maxAge = Math.max(0, Math.floor(maxAgeSeconds));
  // __Host- already forbids a Domain attribute; for the non-__Host- dev fallback we still never
  // set one (host-only cookie), so a cookie set for app.navrya.com is never implicitly readable
  // by a sibling subdomain.
  return attrs;
}

export function serializeSessionCookie(rawSessionId, { maxAgeSeconds }) {
  return stringifySetCookie({ name: sessionCookieName(), value: rawSessionId, httpOnly: true, ...baseAttributes({ maxAgeSeconds }) });
}
export function serializeCsrfCookie(csrfToken, { maxAgeSeconds }) {
  return stringifySetCookie({ name: csrfCookieName(), value: csrfToken, httpOnly: false, ...baseAttributes({ maxAgeSeconds }) });
}
export function serializeOidcTxnCookie(txnId, { maxAgeSeconds = 600 } = {}) {
  return stringifySetCookie({ name: oidcTxnCookieName(), value: txnId, httpOnly: true, ...baseAttributes({ maxAgeSeconds }) });
}
function serializeClearCookie(name, httpOnly) {
  return stringifySetCookie({ name, value: '', httpOnly, ...baseAttributes({ maxAgeSeconds: 0 }) });
}
export function clearAuthCookies(res) {
  appendSetCookie(res, serializeClearCookie(sessionCookieName(), true));
  appendSetCookie(res, serializeClearCookie(csrfCookieName(), false));
  appendSetCookie(res, serializeClearCookie(oidcTxnCookieName(), true));
}

// Express's res.cookie() would work too, but going through one shared serializer keeps every
// attribute decision (SameSite/Secure/__Host-) in this single file instead of scattered
// res.cookie() call sites with their own options objects that could silently drift apart.
export function appendSetCookie(res, serialized) {
  const existing = res.getHeader('Set-Cookie');
  if (!existing) return res.setHeader('Set-Cookie', serialized);
  const list = Array.isArray(existing) ? existing : [existing];
  res.setHeader('Set-Cookie', [...list, serialized]);
}

export function readCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  try {
    return parseCookie(header);
  } catch (_) {
    return {};
  }
}
export function readSessionCookie(req) { return readCookies(req)[sessionCookieName()] || null; }
export function readCsrfCookie(req) { return readCookies(req)[csrfCookieName()] || null; }
export function readOidcTxnCookie(req) { return readCookies(req)[oidcTxnCookieName()] || null; }
