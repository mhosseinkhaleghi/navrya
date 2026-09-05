import express from 'express';
import { requireAuth } from './auth-real.mjs';
import { errorMiddleware, notFoundMiddleware } from './errors.mjs';
import { requireAdmin } from '../admin/auth-admin.mjs';
import * as routesAuth from './routes.auth.mjs';
import * as routesAuthOidc from './routes.auth-oidc.mjs';
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
import * as routesAnalysisProfiles from './routes.analysis-profiles.mjs';
import * as routesTrades from './routes.trades.mjs';
import * as routesAccounts from './routes.accounts.mjs';
import * as routesInstrumentCatalog from './routes.instrument-catalog.mjs';
import * as routesMentalHealth from './routes.mental-health.mjs';
import * as routesAiChatHistory from './routes.ai-chat-history.mjs';
import * as routesCompanion from './routes.companion.mjs';
import * as routesSessionSignatures from './routes.session-signatures.mjs';
import * as routesPreferences from './routes.preferences.mjs';
import * as routesAnalysisSymbols from './routes.analysis-symbols.mjs';
import * as routesWallet from './routes.wallet.mjs';
import * as routesSubscriptions from './routes.subscriptions.mjs';
import * as routesStorage from './routes.storage.mjs';
import * as routesConversationScenariosSync from './routes.conversation-scenarios-sync.mjs';
import * as routesConversationScenarioExposuresSync from './routes.conversation-scenario-exposures-sync.mjs';
import * as routesWebhooksBsc from './routes.webhooks-bsc.mjs';
import { corsMiddleware, originCheck } from './security/origins.mjs';
import { securityHeaders, noStoreAuthResponses } from './security/headers.mjs';
import { csrfProtection } from './security/csrf.mjs';
import { requireUploadOwnership } from './security/upload-ownership.mjs';

// Shared-secret gate for the public preview deploy - BASIC_AUTH_USER/PASS are unset in local
// dev (checkBasicAuth then always passes), and set as Render env vars once a real link is
// handed to testers/investors, since neither this API nor pattern-ai-server.mjs has real user
// authentication yet. /internal is exempt - it's server-to-server (pattern-ai-server.mjs's
// admin-key bridge), already protected by its own x-internal-secret header, and never goes
// through a browser. This is an ADDITIONAL layer on top of real per-user auth below, never a
// substitute for it - it existed before real sessions did and is kept only for the "keep a
// public preview link away from bots/crawlers" use case it was built for.
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
export function createApp({ repo, uploadsDir, authDeps }) {
  const app = express();

  // Exactly the deployment topology's own reverse-proxy hop count (Caddy in front, one hop -
  // see deploy/Caddyfile / docker-compose.production.yml), never "trust everything" - an
  // unconfigured/forged X-Forwarded-For must never be trusted as the real client IP (that IP
  // feeds rate-limit keys and security_events.ip_hash). Defaults to 0 (no proxy trusted) for
  // local dev, where there genuinely is no reverse proxy in front of this process.
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 0));

  app.use(securityHeaders());
  app.use(corsMiddleware());
  app.use(originCheck());
  app.use(noStoreAuthResponses());

  // No DB query here - lets a smoke test hit /health with zero Postgres connectivity required,
  // and lets a hosting platform's health probe succeed without the shared-secret gate below.
  // /livez is process-only liveness (never checks a dependency); /readyz is dependency-aware
  // but never leaks paths/secrets/internal detail - just a boolean per dependency.
  app.get('/health', (req, res) => res.json({ ok: true, uploadsDir }));
  app.get('/livez', (req, res) => res.json({ ok: true }));
  app.get('/readyz', async (req, res) => {
    let dbOk = false;
    try { const health = await repo.health(); dbOk = Boolean(health.dbOk); } catch (_) { dbOk = false; }
    const ready = dbOk;
    res.status(ready ? 200 : 503).json({ ready, checks: { database: dbOk } });
  });

  app.use((req, res, next) => {
    if (req.path.startsWith('/internal')) return next();
    if (checkBasicAuth(req)) return next();
    res.set('WWW-Authenticate', 'Basic realm="NAVRYA"');
    res.status(401).json({ error: 'UNAUTHORIZED' });
  });

  // Small body limit for auth endpoints specifically, applied BEFORE the general 60mb parser
  // and BEFORE any expensive work (password hashing) - an oversized auth request body is
  // rejected at the framing layer, never reaches assertPasswordPolicy/hashPassword. Mounted on
  // the path prefix only; body-parser skips re-parsing an already-parsed body, so the general
  // parser below is a no-op for these paths.
  app.use('/api/auth', express.json({ limit: '32kb' }));
  // Real BSC crypto webhook (task A.6) - needs the RAW request body to verify its HMAC signature
  // (server/commercial/bsc-crypto-billing-provider.mjs's verifyWebhook()), so this is parsed as
  // raw bytes, BEFORE the general JSON parser below would otherwise consume it, exactly like the
  // /api/auth line above reserves its own smaller parser first. req.rawBody carries the exact
  // bytes the signature was computed over; req.body is then reparsed to plain JSON so the route
  // handler itself never has to special-case a Buffer.
  app.use('/api/webhooks', express.raw({ type: 'application/json', limit: '16kb' }), (req, res, next) => {
    req.rawBody = req.body;
    try { req.body = req.body && req.body.length ? JSON.parse(req.body.toString('utf8')) : {}; } catch (_) { req.body = {}; }
    next();
  });
  // Base64 images inflate payloads ~33% over their binary size; 60mb comfortably covers a
  // handful of 15MB-capped images per request, well under the AI server's 100mb cap.
  app.use(express.json({ limit: '60mb' }));
  // Session/pattern/strategy/trade screenshots are private trading-journal/mental-health-adjacent
  // media (Section 7.18) - never publicly reachable, unlike Community's own posts/listings
  // images, which are public by product design (a feed post or a marketplace storefront image is
  // meant to be visible to other users). Everything else under /uploads stays public.
  //
  // Launch-readiness audit fix (P0-2, 2026-09-04): a real session used to be the ONLY check here -
  // any authenticated NAVRYA user, not the file's actual owner, could read another user's private
  // screenshot if they could guess/enumerate its filename. requireUploadOwnership() (see
  // security/upload-ownership.mjs) closes this: it resolves the file's real owner (via
  // storage_objects for anything uploaded through the normal upload endpoints, falling back to
  // the owning domain row for images uploaded before that table existed) and only lets the request
  // through when that owner is the current session's user - never merely "a" logged-in user.
  const PRIVATE_UPLOAD_CATEGORIES = new Set(['session', 'pattern', 'strategy', 'trade']);
  function isPrivateUploadPath(req) {
    return PRIVATE_UPLOAD_CATEGORIES.has(req.path.split('/')[1]);
  }
  app.use('/uploads',
    (req, res, next) => (isPrivateUploadPath(req) ? requireAuth(repo)(req, res, next) : next()),
    (req, res, next) => (isPrivateUploadPath(req) ? requireUploadOwnership(repo)(req, res, next) : next()),
    express.static(uploadsDir)
  );

  // Public - the admin frontend's login/test-mode gate reads this BEFORE anyone is
  // identified, to decide whether to show the "TEST MODE" banner or a real login screen.
  app.get('/api/admin/config', (req, res) => res.json({ authEnforced: process.env.ADMIN_AUTH_ENFORCED !== 'false' }));
  // Server-to-server only (pattern-ai-server.mjs's admin-key bridge and session-introspection
  // caller) - protected by its own shared-secret header inside the route, not by
  // requireAuth/requireAdmin, since there is no browser identity on this call at all.
  app.use('/internal', routesInternal.router(repo));
  // Public - a real external indexer/webhook source has no NAVRYA session either; verified
  // entirely by its own HMAC signature (see the raw-body middleware above), never by
  // requireAuth/csrfProtection below.
  app.use('/api/webhooks', routesWebhooksBsc.router(repo));

  app.use('/api/auth', routesAuth.router(repo, authDeps)); // register/login/google/logout/sessions/password/email - bootstraps identity, applies its own per-route auth+CSRF (authDeps: test-only Google-verify override)
  app.use('/api/auth/oidc', routesAuthOidc.router(repo)); // generic OIDC start/callback

  app.use(requireAuth(repo));
  app.use(csrfProtection()); // every route mounted below this line requires a valid session; unsafe methods also require a valid CSRF token
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
  app.use('/api/sync/analysis-profiles', routesAnalysisProfiles.router(repo));
  app.use('/api/sync/trades', routesTrades.router(repo, uploadsDir));
  app.use('/api/sync/accounts', routesAccounts.router(repo));
  app.use('/api/sync/instrument-catalog', routesInstrumentCatalog.router(repo));
  app.use('/api/sync/mental-health', routesMentalHealth.router(repo));
  app.use('/api/sync/ai-chat-history', routesAiChatHistory.router(repo));
  app.use('/api/sync/companion-state', routesCompanion.router(repo));
  app.use('/api/sync/session-signatures', routesSessionSignatures.router(repo));
  app.use('/api/sync/preferences', routesPreferences.router(repo));
  app.use('/api/sync/analysis-symbols', routesAnalysisSymbols.router(repo));
  app.use('/api/sync/wallet', routesWallet.router(repo));
  app.use('/api/sync/subscriptions', routesSubscriptions.router(repo));
  app.use('/api/sync/storage', routesStorage.router(repo, uploadsDir));
  // Journey H2, Gate 2: the published Conversation Scenario bundle the browser Router fetches -
  // public app content, not user data, but still sits behind requireAuth()/csrfProtection() like
  // every other /api/sync/* route (a GET needs no CSRF token; this just keeps the mount
  // consistent rather than carving out a bespoke unauthenticated exception).
  app.use('/api/sync/conversation-scenarios', routesConversationScenariosSync.router(repo));
  // Journey H2 expressive/context follow-up: the small, per-user, bounded exposure-count map the
  // browser Router's own deterministic variant selector reads/increments - real user data, real
  // requireAuth, unlike the bundle above.
  app.use('/api/sync/conversation-scenario-exposures', routesConversationScenarioExposuresSync.router(repo));
  app.use('/api/admin', requireAdmin(repo), routesAdmin.router(repo, uploadsDir));

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);
  return app;
}
