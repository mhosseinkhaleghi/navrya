// Single source of truth for "which browser origins may talk to this API", used by both the
// CORS middleware and the unsafe-request Origin/Referer/Fetch-Metadata check below. Replaces
// the previous `Access-Control-Allow-Origin: '*'` (which cannot be combined with credentialed
// cookies anyway - the fetch/XHR spec forbids `*` alongside `Access-Control-Allow-Credentials`).
//
// ALLOWED_ORIGINS is a comma-separated list (e.g.
// "https://app.navrya.com,https://admin.navrya.com,http://localhost:5173"). Production refuses
// to start with this unset - see server/community/app.mjs's startup check.
export function allowedOrigins() {
  const raw = process.env.ALLOWED_ORIGINS || '';
  const configured = raw.split(',').map((item) => item.trim()).filter(Boolean);
  if (configured.length) return configured;
  // Zero-setup local dev only (never reached in production - app.mjs's startup check refuses
  // to boot without ALLOWED_ORIGINS set when NODE_ENV=production).
  return ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173'];
}

export function isOriginAllowed(origin) {
  if (!origin) return false;
  return allowedOrigins().includes(origin);
}

// CORS middleware: reflects the Origin ONLY if it is on the explicit allowlist (never `*`,
// never an unconditional reflect-everything), and always sets Vary: Origin so a shared/CDN
// cache never serves one origin's CORS headers to another's request.
export function corsMiddleware() {
  const origins = allowedOrigins();
  return function (req, res, next) {
    const origin = req.headers.origin;
    res.setHeader('Vary', 'Origin');
    if (origin && origins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token, x-dev-user-id, x-internal-secret');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  };
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Defense-in-depth alongside CSRF tokens (OWASP: "SameSite alone is not sufficient"). For any
// unsafe (state-changing) request that carries a session cookie, verify the browser-supplied
// Origin (or, if absent, Referer's origin) is on the same allowlist as CORS, AND - when the
// browser sends it (Sec-Fetch-Site is broadly supported but not universal) - that
// Sec-Fetch-Site is 'same-origin' or 'same-site', never 'cross-site'. A request with neither
// Origin nor Referer (some non-browser clients) is allowed through to this check but still must
// pass CSRF token verification, which a same-origin browser page can satisfy and a cross-site
// page cannot.
export function verifyRequestOrigin(req) {
  const fetchSite = req.headers['sec-fetch-site'];
  if (fetchSite && fetchSite === 'cross-site') return false;
  const origin = req.headers.origin;
  if (origin) return isOriginAllowed(origin);
  const referer = req.headers.referer;
  if (referer) {
    try { return isOriginAllowed(new URL(referer).origin); } catch (_) { return false; }
  }
  return true; // no Origin/Referer at all - rely on CSRF token verification for this request
}

export function originCheck() {
  return function (req, res, next) {
    if (SAFE_METHODS.has(req.method)) return next();
    if (!verifyRequestOrigin(req)) return res.status(403).json({ error: 'ORIGIN_REJECTED' });
    next();
  };
}
