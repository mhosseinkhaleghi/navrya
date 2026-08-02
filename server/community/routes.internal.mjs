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

  app.get('/admin-ai-keys', asyncHandler(async (req, res) => {
    const secret = process.env.INTERNAL_API_SECRET;
    if (secret) {
      if (req.header('x-internal-secret') !== secret) return res.status(403).json({ error: 'INTERNAL_SECRET_REQUIRED' });
    } else if (!warnedOpen) {
      warnedOpen = true;
      console.warn('[admin] INTERNAL_API_SECRET is not set - /internal/admin-ai-keys is reachable without a secret (local-only, not production-hardened)'); // eslint-disable-line no-console
    }
    const rows = await repo.adminKeys.list();
    const byProvider = {};
    rows.forEach((row) => { byProvider[row.provider] = row.apiKey; });
    const result = {};
    KNOWN_PROVIDERS.forEach((provider) => { result[provider] = byProvider[provider] || null; });
    res.json(result);
  }));

  return app;
}
