import express from 'express';
import { asyncHandler, ApiError } from './errors.mjs';

// Mounted at /api/users, after requireAuth (server/community/app.mjs) - bootstrapping an
// identity now happens at /api/auth (routes.auth.mjs) instead, which is why the old
// unauthenticated publicRouter (GET /, POST /) was removed entirely: nothing legitimate needs
// an unauthenticated full user list or a no-credential account-creation endpoint anymore.
export function protectedRouter(repo) {
  const router = express.Router();
  router.get('/me', asyncHandler(async (req, res) => {
    res.json(req.currentUser);
  }));
  // Registered before /:id (mirrors routes.marketplace.mjs's by-source/:sourceId convention) -
  // otherwise Express would try to match "heartbeat"/"usage-report" as a user id first.
  router.post('/heartbeat', asyncHandler(async (req, res) => {
    await repo.sessions.heartbeat(req.currentUser.id);
    res.json({ ok: true });
  }));
  router.post('/usage-report', asyncHandler(async (req, res) => {
    const body = req.body || {};
    await repo.usageEvents.create({
      userId: req.currentUser.id, provider: body.provider, promptTokens: body.promptTokens,
      completionTokens: body.completionTokens, totalTokens: body.totalTokens, source: body.source
    });
    res.status(201).json({ ok: true });
  }));
  router.get('/:id', asyncHandler(async (req, res) => {
    // /me is matched above before this handler ever runs for that literal path.
    const target = req.params.id === req.currentUser.id ? req.currentUser : await repo.users.get(req.params.id);
    if (!target) throw new ApiError(404, 'USER_NOT_FOUND');
    res.json(target);
  }));
  return router;
}
