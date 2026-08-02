import express from 'express';
import { devUserAuth } from './auth-dev.mjs';
import { errorMiddleware, notFoundMiddleware } from './errors.mjs';
import { requireAdmin } from '../admin/auth-admin.mjs';
import * as routesUsers from './routes.users.mjs';
import * as routesPosts from './routes.posts.mjs';
import * as routesMarketplace from './routes.marketplace.mjs';
import * as routesMessages from './routes.messages.mjs';
import * as routesInternal from './routes.internal.mjs';
import * as routesAdmin from '../admin/routes.mjs';

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
      'Access-Control-Allow-Headers': 'Content-Type, x-dev-user-id',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Cache-Control': 'no-store'
    });
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // Base64 images inflate payloads ~33% over their binary size; 60mb comfortably covers a
  // handful of 15MB-capped images per request, well under the AI server's 100mb cap.
  app.use(express.json({ limit: '60mb' }));
  app.use('/uploads', express.static(uploadsDir));

  // No DB query here - mirrors pattern-ai-server.mjs's /health, and lets a smoke test hit
  // /health with zero Postgres connectivity required.
  app.get('/health', (req, res) => res.json({ ok: true, uploadsDir }));

  // Public - the admin frontend's login/test-mode gate reads this BEFORE anyone is
  // identified, to decide whether to show the "TEST MODE" banner or a real login screen.
  app.get('/api/admin/config', (req, res) => res.json({ authEnforced: process.env.ADMIN_AUTH_ENFORCED === 'true' }));
  // Server-to-server only (pattern-ai-server.mjs's admin-key bridge) - protected by its own
  // shared-secret header inside the route, not by devUserAuth/requireAdmin, since there is no
  // dev-user identity on this call at all.
  app.use('/internal', routesInternal.router(repo));

  app.use('/api/users', routesUsers.publicRouter(repo)); // bootstraps identity - no auth required yet
  app.use(devUserAuth(repo)); // <- the ONLY line a real-auth swap touches
  app.use('/api/users', routesUsers.protectedRouter(repo));
  app.use('/api/community', routesPosts.router(repo, uploadsDir));
  app.use('/api/marketplace', routesMarketplace.router(repo, uploadsDir));
  app.use('/api/messages', routesMessages.router(repo));
  app.use('/api/admin', requireAdmin(repo), routesAdmin.router(repo));

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);
  return app;
}
