import express from 'express';
import { asyncHandler, ApiError } from './errors.mjs';

// Mounted at /api/users, in two halves: publicRouter runs BEFORE devUserAuth (bootstrapping
// an identity requires no identity yet), protectedRouter runs after.
export function publicRouter(repo) {
  const router = express.Router();
  router.get('/', asyncHandler(async (req, res) => {
    res.json(await repo.users.list());
  }));
  router.post('/', asyncHandler(async (req, res) => {
    const user = await repo.users.create(req.body || {});
    res.status(201).json(user);
  }));
  return router;
}

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
