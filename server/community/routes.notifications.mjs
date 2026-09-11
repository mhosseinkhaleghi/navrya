import express from 'express';
import { asyncHandler } from './errors.mjs';
import { rateLimit, sessionKey } from './security/rate-limit.mjs';

// Light session-keyed throttle - not a security boundary (acknowledging is idempotent and
// harmless), just defense-in-depth against a runaway client loop, same primitive as every other
// mutating route in this file group.
const ackLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, keyFn: sessionKey('notifications-ack') });

// Mounted at /api/sync/notifications, behind requireAuth+csrfProtection - the ONE canonical
// notification-summary adapter/API path (spec section D) both the main app sidebar and the Admin
// Panel sidebar read from. An admin is an authenticated user like any other, so this single route
// serves both surfaces: `supportAwaitingStaffCount` is populated only when the caller's own role
// is 'admin', never computed or exposed for a normal user.
export function router(repo) {
  const app = express.Router();

  app.get('/summary', asyncHandler(async (req, res) => {
    const summary = await repo.notifications.summaryFor(req.currentUser.id, { isAdmin: req.currentUser.role === 'admin' });
    res.json(summary);
  }));

  // Called when the Community page actually opens and its data has loaded (navrya-src/
  // communityView.jsx) - advances this user's cursor so already-seen activity stops counting.
  app.post('/community/ack', ackLimiter, asyncHandler(async (req, res) => {
    await repo.notifications.acknowledgeCommunity(req.currentUser.id);
    res.json({ ok: true });
  }));

  return app;
}
