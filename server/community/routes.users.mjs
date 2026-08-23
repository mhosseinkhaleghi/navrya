import express from 'express';
import { asyncHandler, ApiError } from './errors.mjs';
import { selfUserView, publicUserView, publicUserViewList } from './security/user-views.mjs';

// Mounted at /api/users, after requireAuth (server/community/app.mjs) - bootstrapping an
// identity now happens at /api/auth (routes.auth.mjs) instead, which is why the old
// unauthenticated publicRouter (GET /, POST /) was removed entirely: nothing legitimate needs
// an unauthenticated full user list or a no-credential account-creation endpoint anymore.
//
// DTO discipline: /me (the account owner looking at their own record) is the only route that
// returns selfUserView (email/phone/verification/KYC/role/suspension - private FROM everyone
// else, not from the owner). /:id and /search are OTHER users' records as seen by a peer -
// publicUserView only. Previously all three returned the repo's full raw record, which leaked
// every other user's email/phone/KYC/role/suspension to any authenticated caller who searched
// for them or guessed/enumerated their id.
export function protectedRouter(repo) {
  const router = express.Router();
  router.get('/me', asyncHandler(async (req, res) => {
    res.json(selfUserView(req.currentUser));
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
  // Recipient autocomplete for Community's "New message" dialog - registered before /:id for the
  // same reason /heartbeat and /usage-report are (otherwise Express treats "search" as a user id).
  router.get('/search', asyncHandler(async (req, res) => {
    res.json(publicUserViewList(await repo.users.search(req.query.q, { excludeUserId: req.currentUser.id, limit: 8 })));
  }));
  router.get('/:id', asyncHandler(async (req, res) => {
    // /me is matched above before this handler ever runs for that literal path.
    if (req.params.id === req.currentUser.id) return res.json(selfUserView(req.currentUser));
    const target = await repo.users.get(req.params.id);
    if (!target) throw new ApiError(404, 'USER_NOT_FOUND');
    res.json(publicUserView(target));
  }));
  return router;
}
