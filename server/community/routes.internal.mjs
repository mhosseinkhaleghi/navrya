import express from 'express';
import { asyncHandler } from './errors.mjs';

const KNOWN_PROVIDERS = ['openai', 'anthropic', 'kimi', 'deepseek'];

// Server-to-server only - never called by a browser. pattern-ai-server.mjs (a plain node:http
// server with zero Postgres coupling by design) polls this route to resolve admin-configured
// AI provider keys without ever touching the database directly itself. Protected by a shared
// secret header rather than devUserAuth, since there is no dev-user identity on this call at
// all. If INTERNAL_API_SECRET is unset (the common zero-setup dev case), this route is left
// open - consistent with this app's existing "both servers bind to 127.0.0.1 only, not
// production-hardened" stance already documented for every other endpoint.
export function router(repo) {
  const app = express.Router();
  let warnedOpen = false;

  // Shared by both routes below - same secret, same "open in local dev, logged once" behavior.
  function secretOk(req) {
    const secret = process.env.INTERNAL_API_SECRET;
    if (!secret) {
      if (!warnedOpen) {
        warnedOpen = true;
        console.warn('[admin] INTERNAL_API_SECRET is not set - /internal/* routes are reachable without a secret (local-only, not production-hardened)'); // eslint-disable-line no-console
      }
      return true;
    }
    return req.header('x-internal-secret') === secret;
  }

  app.get('/admin-ai-keys', asyncHandler(async (req, res) => {
    if (!secretOk(req)) return res.status(403).json({ error: 'INTERNAL_SECRET_REQUIRED' });
    const rows = await repo.adminKeys.list();
    const byProvider = {};
    rows.forEach((row) => { byProvider[row.provider] = row.apiKey; });
    const result = {};
    KNOWN_PROVIDERS.forEach((provider) => { result[provider] = byProvider[provider] || null; });
    res.json(result);
  }));

  // pattern-ai-server.mjs fires this after every callProvider() outcome (success or failure) so
  // the Admin AI tab can show real per-provider health/uptime instead of just token totals - see
  // ARCHITECTURE.md 7.16 follow-up and 016_ai_provider_health.sql. Deliberately tolerant: a
  // malformed/missing field never 400s here, since the caller never awaits this request and must
  // never see a health-reporting failure surface as an AI-response failure.
  app.post('/ai-health-event', asyncHandler(async (req, res) => {
    if (!secretOk(req)) return res.status(403).json({ error: 'INTERNAL_SECRET_REQUIRED' });
    const body = req.body || {};
    const record = await repo.providerHealth.record({
      provider: body.provider, ok: Boolean(body.ok), errorCode: body.errorCode || null,
      latencyMs: body.latencyMs, source: body.source || null
    });
    res.status(201).json(record);
  }));

  return app;
}
