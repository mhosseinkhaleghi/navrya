import { createApp } from './community/app.mjs';
import { createPool } from './db/pool.mjs';
import { createPgRepo } from './db/repo.pg.mjs';
import { createMemoryRepo } from './db/repo.memory.mjs';
import { sessionSigningSecret, csrfSecret } from './community/security/secrets.mjs';
import { resolveRateLimitStore } from './community/security/rate-limit.mjs';

// The project's first real multi-user backend - the entrypoint process. Deliberately a
// separate file/process from server/pattern-ai-server.mjs (AI-endpoint code and
// community/account CRUD stay cleanly separated) even though both could technically run on
// one machine. The actual Express app is built by the side-effect-free createApp() in
// server/community/app.mjs; this file's only job is to wire up a repo and bind a real port -
// kept separate so tests can import createApp() directly without ever triggering a port bind.
const uploadsDir = process.env.UPLOADS_DIR || './uploads';
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || process.env.COMMUNITY_API_PORT || 8788);
const isProduction = process.env.NODE_ENV === 'production';

// Production preflight - fail LOUD and IMMEDIATELY at startup, never lazily on the first
// request that happens to need one of these. Each of these has its own dev-only fallback
// (memory repo, in-memory rate limiter, an ephemeral signing secret) that is real and useful
// locally, but every one of them is a genuine security/durability regression in production -
// see docs/auth/ADR-0001-authentication-architecture.md for why each is required.
if (isProduction) {
  const missing = [];
  if (!process.env.DATABASE_URL) missing.push('DATABASE_URL');
  if (!process.env.ALLOWED_ORIGINS) missing.push('ALLOWED_ORIGINS');
  if (!process.env.REDIS_URL) missing.push('REDIS_URL');
  if (!process.env.INTERNAL_API_SECRET) missing.push('INTERNAL_API_SECRET');
  if (missing.length) {
    throw new Error(`FATAL: NODE_ENV=production but the following required environment variables are not set: ${missing.join(', ')}. See .env.production.example.`);
  }
  // Forces the lazy "generate an ephemeral secret" fallback in secrets.mjs to actually throw
  // right now if AUTH_TOKEN_SECRET/CSRF_SECRET are missing, rather than only on the first
  // login/CSRF check a real user happens to trigger.
  sessionSigningSecret();
  csrfSecret();
  // Same idea for the rate-limit store - resolves (and connects) the real Redis-backed store
  // now, so a misconfigured/unreachable REDIS_URL is caught at startup, not on the first
  // request's rate-limit check.
  resolveRateLimitStore();
}

// No DATABASE_URL configured -> no Postgres/Docker setup has been done. Rather than refusing
// to start (leaving account creation permanently broken until someone installs Docker), fall
// back to the same in-memory repo the contract tests already run against: real business rules
// (unique purchase, rating-requires-purchase, thread find-or-create, etc.), just non-persistent
// across process restarts. Explicitly logged so it is never mistaken for real persistence. This
// fallback is DEV/TEST-ONLY - the preflight check above already refused to start this way under
// NODE_ENV=production.
const usingMemoryRepo = !process.env.DATABASE_URL;
const repo = usingMemoryRepo ? createMemoryRepo() : createPgRepo(createPool(process.env.DATABASE_URL));

// pg.Pool never opens a connection at construction (lazy per-query), so building it is safe
// even with no Postgres reachable - exactly what makes the import-triggers-listen smoke test
// (mirroring tests/ai-gateway.test.mjs) safe to run here.
const server = createApp({ repo, uploadsDir }).listen(port, host, () => {
  console.log(`Community API server: http://${host}:${port}`);
  if (usingMemoryRepo) {
    console.log('  -> No DATABASE_URL set: using an IN-MEMORY repo. Data resets on restart. Set DATABASE_URL (see .env.example) for real Postgres persistence.');
  }
});

// Launch-readiness audit fix (P2): auth_sessions/auth_transactions grow forever without this -
// deleteExpired() has existed on both repo domains since the original auth rework
// (docs/auth/IMPLEMENTATION_STATUS.md section 1, honestly flagged there as "no cron/scheduler
// wiring was added yet"), but nothing ever called it. Wired here as a simple in-process interval
// rather than a separate scheduler/cron container - this is cheap, idempotent, best-effort
// cleanup, not a job that needs its own retry/alerting infrastructure. Only runs against a real
// repo: the memory fallback resets on restart anyway, so unbounded growth is never a real concern
// there.
const SESSION_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
let sessionCleanupTimer = null;
if (!usingMemoryRepo) {
  const runExpiredCleanup = async () => {
    try {
      const cutoff = new Date().toISOString();
      const [expiredSessions, expiredTransactions] = await Promise.all([
        repo.authSessions.deleteExpired(cutoff),
        repo.authTransactions.deleteExpired(cutoff)
      ]);
      if (expiredSessions || expiredTransactions) {
        console.log(`[cleanup] removed ${expiredSessions} expired auth_sessions row(s), ${expiredTransactions} expired auth_transactions row(s)`);
      }
    } catch (error) {
      // Best-effort - a failed sweep must never crash the process or block a real request; it
      // just tries again on the next interval.
      console.error('[cleanup] expired-session sweep failed:', error.message);
    }
  };
  sessionCleanupTimer = setInterval(runExpiredCleanup, SESSION_CLEANUP_INTERVAL_MS);
  sessionCleanupTimer.unref(); // never keeps the process alive on its own
  runExpiredCleanup(); // also once at startup, not only after the first interval elapses
}

// Graceful shutdown: stop accepting new connections, let in-flight requests finish, then close
// the DB pool - a rolling deploy/restart should never abruptly cut off a request that was
// already being served. SIGTERM is what `docker compose stop`/most orchestrators send first
// (SIGKILL only follows after a grace period they control).
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[community-api] ${signal} received, shutting down gracefully...`);
  if (sessionCleanupTimer) clearInterval(sessionCleanupTimer);
  server.close(async (error) => {
    if (error) console.error('[community-api] error while closing HTTP server:', error.message);
    if (!usingMemoryRepo && typeof repo.health === 'function') {
      try { await repo.health(); } catch (_) { /* best-effort - just confirms the pool can still be reached before we let the process exit */ }
    }
    process.exit(error ? 1 : 0);
  });
  // Hard stop if graceful close hangs (e.g. a long-lived connection never finishes) - never
  // block a deploy/restart forever.
  setTimeout(() => { console.warn('[community-api] graceful shutdown timed out, forcing exit'); process.exit(1); }, 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default server;
