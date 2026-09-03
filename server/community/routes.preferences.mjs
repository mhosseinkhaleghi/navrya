import express from 'express';
import { asyncHandler, ApiError } from './errors.mjs';

const PREFERENCE_ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const SUPPORTED_LANGUAGES = new Set(['fa', 'ar', 'en', 'es']);
const SUPPORTED_CHARACTERS = new Set(['hunter', 'engineer', 'commander', 'sage']);
const MAX_VALUE_BYTES = 16 * 1024;

function assertPreferenceId(id) {
  if (typeof id !== 'string' || !PREFERENCE_ID.test(id)) throw new ApiError(400, 'VALIDATION_FAILED');
}
function assertPreferenceInput(id, value) {
  assertPreferenceId(id);
  if (id === 'language' && !SUPPORTED_LANGUAGES.has(value)) throw new ApiError(400, 'VALIDATION_FAILED');
  if (id === 'character' && !SUPPORTED_CHARACTERS.has(value)) throw new ApiError(400, 'VALIDATION_FAILED');
  let encoded;
  try { encoded = JSON.stringify(value); } catch (_) { throw new ApiError(400, 'VALIDATION_FAILED'); }
  if (encoded === undefined || Buffer.byteLength(encoded, 'utf8') > MAX_VALUE_BYTES) throw new ApiError(400, 'VALIDATION_FAILED');
}

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
    assertPreferenceInput(id, value);
    const saved = await repo.userPreferences.upsert(req.currentUser.id, id, value);
    res.status(200).json(saved);
  }));

  // Resets one preference back to its client-side default - the row is deleted, never stored as
  // an explicit "null override", so a later change to that key's own hardcoded default is
  // honored immediately rather than staying pinned to whatever null once meant.
  app.delete('/:id', asyncHandler(async (req, res) => {
    assertPreferenceId(req.params.id);
    await repo.userPreferences.remove(req.currentUser.id, req.params.id);
    res.status(204).end();
  }));

  return app;
}
