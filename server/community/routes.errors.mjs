import express from 'express';
import { asyncHandler, ApiError } from './errors.mjs';
import { rateLimit, ipKey } from './security/rate-limit.mjs';

// Launch-readiness audit fix (P1-1): a minimal, low-overhead error-telemetry ingestion endpoint -
// docs/PUBLIC-LAUNCH-READINESS-AUDIT.md's Section 18 design, built. Deliberately mounted BEFORE
// requireAuth() (see app.mjs) - a boot failure or an error on the pre-login character chooser has
// no session to attach an error to, and requiring one would silently drop exactly the failures an
// operator most needs visibility into.
//
// The real defenses against this being an abuse/cost vector: a tight JSON body limit (mounted
// ahead of this router in app.mjs, matching the existing /api/auth precedent), a real per-IP rate
// limit, hard-capped field lengths, and upsert-based aggregation in repo.clientErrors.record() -
// a fingerprint repeated 100,000 times is one row with a counter, never 100,000 writes. This
// route also never trusts (or even reads) anything resembling a stack trace, screenshot, cookie,
// or free-text field beyond a short message - the redaction boundary the audit's Section 18
// required is enforced here, not left to the (not-yet-built) client sender to self-police.
const ingestLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, keyFn: ipKey('client-error-ingest') });

function shortString(value, max) {
  return typeof value === 'string' ? value.slice(0, max) : null;
}

export function router(repo) {
  const app = express.Router();

  app.post('/', ingestLimiter, asyncHandler(async (req, res) => {
    const body = req.body || {};
    const fingerprint = shortString(body.fingerprint, 200);
    if (!fingerprint) throw new ApiError(400, 'VALIDATION_FAILED');
    await repo.clientErrors.record({
      fingerprint,
      releaseVersion: shortString(body.releaseVersion, 50),
      source: 'client',
      message: shortString(body.message, 500) || 'Unknown error',
      route: shortString(body.route, 200),
      samplePayload: {
        browser: shortString(body.browser, 200),
        os: shortString(body.os, 100),
        viewport: shortString(body.viewport, 50),
        language: shortString(body.language, 20)
      }
    });
    // Always 204 regardless of the exact internal outcome - a telemetry beacon has nothing
    // meaningful to render, and navigator.sendBeacon (the intended sender) has no response
    // access at all.
    res.status(204).end();
  }));

  return app;
}
