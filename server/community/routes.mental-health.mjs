import express from 'express';
import { asyncHandler, ApiError } from './errors.mjs';

// Module 5 (final module) of the local-first-to-server migration (see ARCHITECTURE.md's
// Global Data Sync section, 7.18). Mounted at /api/sync/mental-health, behind devUserAuth - see
// routes.trading-sessions.mjs's comment for why /api/sync/* is its own prefix.
//
// Unlike every other synced module's router, this one takes only `repo` - no `uploadsDir` and
// no /images sub-route, since Mental Health Profile has no user-uploaded files anywhere in it.
// There is also no GET /:id or DELETE /:id - there is exactly one profile per user, addressed
// implicitly by req.currentUser.id, never by a separate record id.
export function router(repo) {
  const app = express.Router();

  app.get('/', asyncHandler(async (req, res) => {
    const profile = await repo.mentalHealthProfile.get(req.currentUser.id);
    res.json({ profile });
  }));

  // Whole-document upsert - the client always sends the full, already-normalized profile
  // object, never a partial patch, matching how mental-health-store.js's own save() always
  // writes the complete document locally too.
  app.post('/', asyncHandler(async (req, res) => {
    const profile = req.body;
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw new ApiError(400, 'VALIDATION_FAILED');
    const saved = await repo.mentalHealthProfile.upsert(req.currentUser.id, profile);
    res.status(200).json(saved);
  }));

  return app;
}
