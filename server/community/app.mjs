import express from 'express';
import { requireAuth } from './auth-real.mjs';
import { errorMiddleware, notFoundMiddleware } from './errors.mjs';
import { requireAdmin } from '../admin/auth-admin.mjs';
import * as routesAuth from './routes.auth.mjs';
import * as routesUsers from './routes.users.mjs';
import * as routesPosts from './routes.posts.mjs';
import * as routesMarketplace from './routes.marketplace.mjs';
import * as routesMessages from './routes.messages.mjs';
import * as routesInternal from './routes.internal.mjs';
import * as routesAdmin from '../admin/routes.mjs';
import * as routesProfile from './routes.profile.mjs';
import * as routesTradingSessions from './routes.trading-sessions.mjs';
import * as routesPatterns from './routes.patterns.mjs';
import * as routesStrategies from './routes.strategies.mjs';
import * as routesTrades from './routes.trades.mjs';
import * as routesMentalHealth from './routes.mental-health.mjs';

// Shared-secret gate for the public preview deploy - BASIC_AUTH_USER/PASS are unset in local
// dev (checkBasicAuth then always passes), and set as Render env vars once a real link is
// handed to testers/investors, since neither this API nor pattern-ai-server.mjs has real user
// authentication yet. /internal is exempt - it's server-to-server (pattern-ai-server.mjs's
// admin-key bridge), already protected by its own x-internal-secret header, and never goes
// through a browser.
function checkBasicAuth(req) {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASS;
  if (!user || !pass) return true;
  const header = req.headers['authorization'] || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme !== 'Basic' || !encoded) return false;
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const sep = decoded.indexOf(':');
  if (sep === -1) return false;
  return decoded.slice(0, sep) === user && decoded.slice(sep + 1) === pass;
}

// Pure app factory - zero side effects at import time (no port binding, no DB pool). This is
// what tests inject a fake repo into; the real, pg-backed, port-binding instance lives only
// in server/community-api-server.mjs so that importing THIS module never risks a port
// collision between multiple test files that each want their own createApp() instance.
export function createApp({ repo, uploadsDir }) {
  const app = express();

  // Mirrors pattern-ai-server.mjs's exact CORS/no-store header set, extended with the one
  // header this API additionally reads.
  app.use((req, res, next) => {
    res.set({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, x-dev-user-id, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Cache-Control': 'no-store'
    });
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // No DB query here - lets a smoke test hit /health with zero Postgres connectivity required,
  // and lets a hosting platform's health probe succeed without the shared-secret gate below.
  app.get('/health', (req, res) => res.json({ ok: true, uploadsDir }));

  app.use((req, res, next) => {
    if (req.path.startsWith('/internal')) return next();
    if (checkBasicAuth(req)) return next();
    res.set('WWW-Authenticate', 'Basic realm="NAVRYA"');
    res.status(401).json({ error: 'UNAUTHORIZED' });
  });

  // Base64 images inflate payloads ~33% over their binary size; 60mb comfortably covers a
  // handful of 15MB-capped images per request, well under the AI server's 100mb cap.
  app.use(express.json({ limit: '60mb' }));
  app.use('/uploads', express.static(uploadsDir));

  // Public - the admin frontend's login/test-mode gate reads this BEFORE anyone is
  // identified, to decide whether to show the "TEST MODE" banner or a real login screen.
  app.get('/api/admin/config', (req, res) => res.json({ authEnforced: process.env.ADMIN_AUTH_ENFORCED === 'true' }));
  // Server-to-server only (pattern-ai-server.mjs's admin-key bridge) - protected by its own
  // shared-secret header inside the route, not by devUserAuth/requireAdmin, since there is no
  // dev-user identity on this call at all.
  app.use('/internal', routesInternal.router(repo));

  app.use('/api/auth', routesAuth.router(repo)); // register/login/google - bootstraps identity, no auth required yet
  app.use(requireAuth(repo));
  app.use('/api/users', routesUsers.protectedRouter(repo));
  // Two segments after /users (/me/profile, /me/xp-events, ...) - never collides with the
  // single-segment GET /:id above, so mount order between the two doesn't matter.
  app.use('/api/users', routesProfile.router(repo));
  app.use('/api/community', routesPosts.router(repo, uploadsDir));
  app.use('/api/marketplace', routesMarketplace.router(repo, uploadsDir));
  app.use('/api/messages', routesMessages.router(repo));
  // /api/sync/* is its own prefix (not /api/sessions, /api/patterns, etc.) because those
  // exact prefixes are already claimed end-to-end by vite.config.js's proxy rules, routed to
  // the AI-only gateway (server/pattern-ai-server.mjs, a different port/process) for its
  // existing analysis endpoints - reusing them here would either collide or require Vite to
  // pick apart sub-paths of the same prefix across two backends. One new prefix, one new proxy
  // rule, no ambiguity - see ARCHITECTURE.md's Global Data Sync section for the full reasoning.
  app.use('/api/sync/sessions', routesTradingSessions.router(repo, uploadsDir));
  app.use('/api/sync/patterns', routesPatterns.router(repo, uploadsDir));
  app.use('/api/sync/strategies', routesStrategies.router(repo, uploadsDir));
  app.use('/api/sync/trades', routesTrades.router(repo, uploadsDir));
  app.use('/api/sync/mental-health', routesMentalHealth.router(repo));
  app.use('/api/admin', requireAdmin(repo), routesAdmin.router(repo));

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);
  return app;
}
