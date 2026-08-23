// A small, explicit security-header set for the Community API (and mirrored, where applicable,
// on the AI gateway in server/pattern-ai-server.mjs) - deliberately hand-written rather than
// pulling in a large middleware framework, since the actual header set NAVRYA needs is short and
// stable. No `unsafe-eval`; CSP is intentionally scoped to this app's REAL, inventoried needs
// (same-origin static assets, the same-origin iframe architecture, Google Sign-In's script/frame,
// Google Fonts) - not a broad allow-everything policy "fixed" after a breakage.
//
// This API serves JSON, not HTML, for nearly every route, so most CSP directives are moot for it
// - but the header is still set (defense in depth for any future HTML error page, and because a
// browser applies CSP headers on ANY response from an origin, not only ones it expects HTML for).
// The static frontend (dist/, served by Caddy - see deploy/Caddyfile) is where CSP actually
// constrains page behavior; this module's policy is written to be safe to reuse there too, via
// the CSP_STATIC export a future Caddy/Express static-serving layer can apply verbatim.
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", // vendored + Google Fonts stylesheets; inline styles are pervasive in this codebase's existing DOM builders
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:", // user/AI-provider avatar and marketplace images are stored as data URLs or served from this origin's /uploads
  "connect-src 'self' https://accounts.google.com",
  "frame-src 'self' https://accounts.google.com", // the character chooser/dashboard iframe architecture is same-origin; Google Sign-In's own iframe is the one cross-origin exception
  "frame-ancestors 'self'", // this app's own iframes must only ever be embedded by itself, never a third party
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join('; ');

export function securityHeaders({ enforceCsp = process.env.CSP_ENFORCE === 'true' } = {}) {
  return function (req, res, next) {
    res.removeHeader('X-Powered-By');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN'); // legacy fallback alongside frame-ancestors for older browsers
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    }
    // Report-only by default until CSP violations have been inventoried against the real static
    // build (CSP_ENFORCE='true' flips it to a blocking policy) - see IMPLEMENTATION_STATUS.md.
    res.setHeader(enforceCsp ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only', CSP_DIRECTIVES);
    next();
  };
}

export function noStoreAuthResponses() {
  return function (req, res, next) {
    if (req.path.startsWith('/api/auth')) res.setHeader('Cache-Control', 'no-store');
    next();
  };
}

export { CSP_DIRECTIVES };
