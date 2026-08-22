import express from 'express';
import { asyncHandler, ApiError } from './errors.mjs';

// Phase 8 of the local-first-to-server-authoritative migration (see ARCHITECTURE.md's Known
// Constraints section). Mounted at /api/sync/preferences, behind requireAuth - see
// routes.trading-sessions.mjs's comment for why /api/sync/* is its own prefix. Generic
// {user_id, pref_key -> value} store shared by every Phase 8 sub-module that is a small
// scalar/object setting rather than a growing list of its own records (session-signature-ui.js's
// similarity threshold today; language/panel-layout/AI-settings/app-settings in later
// sub-phases) - this route has no opinion on what any pref_key means, only that a value exists
// for it. One preference is upserted/removed at a time (POST/DELETE), never the whole set in one
// call, so changing one setting never risks clobbering an unrelated one written moments earlier
// from another tab.
export function router(repo) {
  const app = express.Router();

  app.get('/', asyncHandler(async (req, res) => {
    res.json({ preferences: await repo.userPreferences.listByUser(req.currentUser.id) });
  }));

  app.post('/', asyncHandler(async (req, res) => {
    const { id, value } = req.body || {};
    if (!id) throw new ApiError(400, 'VALIDATION_FAILED');
    const saved = await repo.userPreferences.upsert(req.currentUser.id, id, value);
    res.status(200).json(saved);
  }));

  // Resets one preference back to its client-side default - the row is deleted, never stored as
  // an explicit "null override", so a later change to that key's own hardcoded default is
  // honored immediately rather than staying pinned to whatever null once meant.
  app.delete('/:id', asyncHandler(async (req, res) => {
    await repo.userPreferences.remove(req.currentUser.id, req.params.id);
    res.status(204).end();
  }));

  return app;
}
