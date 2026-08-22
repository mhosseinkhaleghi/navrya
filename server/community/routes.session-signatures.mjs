import express from 'express';
import { asyncHandler, ApiError } from './errors.mjs';

// Phase 8a of the local-first-to-server-authoritative migration (see ARCHITECTURE.md's Known
// Constraints section). Mounted at /api/sync/session-signatures, behind requireAuth - see
// routes.trading-sessions.mjs's comment for why /api/sync/* is its own prefix. No images
// sub-route - a SessionSignature has no user-uploaded files of its own.
export function router(repo) {
  const app = express.Router();

  app.get('/', asyncHandler(async (req, res) => {
    res.json({ signatures: await repo.sessionSignatures.listByUser(req.currentUser.id) });
  }));

  // Idempotent upsert by the record's own client-generated id - session-signature-store.js's
  // own upsert() already looks up any existing row by sessionId and reuses its id before ever
  // calling this endpoint, so a repeat call for the same session is always an overwrite, never a
  // duplicate (session_signatures_user_session_idx is the defensive DB-level backstop for that).
  app.post('/', asyncHandler(async (req, res) => {
    const record = req.body || {};
    if (!record.id || !record.sessionId) throw new ApiError(400, 'VALIDATION_FAILED');
    const saved = await repo.sessionSignatures.upsert(req.currentUser.id, record);
    res.status(200).json(saved);
  }));

  app.delete('/:id', asyncHandler(async (req, res) => {
    await repo.sessionSignatures.remove(req.currentUser.id, req.params.id);
    res.status(204).end();
  }));

  return app;
}
