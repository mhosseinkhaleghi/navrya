import express from 'express';
import { asyncHandler, ApiError } from './errors.mjs';
import { saveImage } from '../storage/storage.mjs';

// Module 1 of the local-first-to-server migration (see ARCHITECTURE.md's Global Data Sync
// section). Mounted at /api/sync/sessions, behind devUserAuth like every other /api/sync/*
// route - see app.mjs's comment on why /api/sync exists as its own prefix rather than reusing
// /api/trades|patterns|strategy-education|mental-health (those already route to the AI-only
// gateway on a different port/process for their existing analysis endpoints).
export function router(repo, uploadsDir) {
  const app = express.Router();

  // Full reconciliation pull - the client merges this into its local write-through cache on
  // load and on reconnect (see session-workspace-logic.js's reconcileFromServer()).
  app.get('/', asyncHandler(async (req, res) => {
    res.json({ sessions: await repo.tradingSessions.listByUser(req.currentUser.id) });
  }));

  app.get('/:id', asyncHandler(async (req, res) => {
    const record = await repo.tradingSessions.get(req.currentUser.id, req.params.id);
    if (!record) throw new ApiError(404, 'SESSION_NOT_FOUND');
    res.json(record);
  }));

  // Idempotent upsert by the record's own client-generated id - the single endpoint used both
  // by the sync queue's per-write push AND the one-time bulk migration of pre-existing local
  // sessions (called once per record; a repeat call for the same id is always a no-op-shaped
  // overwrite, never a duplicate).
  app.post('/', asyncHandler(async (req, res) => {
    const record = req.body || {};
    if (!record.id) throw new ApiError(400, 'VALIDATION_FAILED');
    const saved = await repo.tradingSessions.upsert(req.currentUser.id, record);
    res.status(200).json(saved);
  }));

  app.delete('/:id', asyncHandler(async (req, res) => {
    await repo.tradingSessions.remove(req.currentUser.id, req.params.id);
    res.status(204).end();
  }));

  // A session-entry chart image, uploaded independently of the session record itself (see
  // sync-queue.js's 'session-images' sender in session-entry-flow.js) - the client attaches the
  // returned URL to the entry's imageUrl field on its next session upsert once available,
  // rather than this endpoint trying to update the session row directly and risk racing a
  // concurrent session upsert's own delete+reinsert of the same entry.
  app.post('/images', asyncHandler(async (req, res) => {
    const { dataUrl } = req.body || {};
    const url = await saveImage(dataUrl, { uploadsDir, category: 'session' });
    res.status(201).json({ url });
  }));

  return app;
}
