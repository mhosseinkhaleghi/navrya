import express from 'express';
import { asyncHandler, ApiError } from './errors.mjs';
import { saveImage } from '../storage/storage.mjs';

// Module 2 of the local-first-to-server migration (see ARCHITECTURE.md's Global Data Sync
// section, 7.18). Mounted at /api/sync/patterns, behind devUserAuth - see
// routes.trading-sessions.mjs's comment for why /api/sync/* is its own prefix.
export function router(repo, uploadsDir) {
  const app = express.Router();

  app.get('/', asyncHandler(async (req, res) => {
    res.json({ patterns: await repo.patterns.listByUser(req.currentUser.id) });
  }));

  app.get('/:id', asyncHandler(async (req, res) => {
    const record = await repo.patterns.get(req.currentUser.id, req.params.id);
    if (!record) throw new ApiError(404, 'PATTERN_NOT_FOUND');
    res.json(record);
  }));

  // Idempotent upsert by the record's own client-generated id - used both by the sync queue's
  // per-write push and the one-time bulk migration of pre-existing local patterns.
  app.post('/', asyncHandler(async (req, res) => {
    const record = req.body || {};
    if (!record.id) throw new ApiError(400, 'VALIDATION_FAILED');
    const saved = await repo.patterns.upsert(req.currentUser.id, record);
    res.status(200).json(saved);
  }));

  app.delete('/:id', asyncHandler(async (req, res) => {
    await repo.patterns.remove(req.currentUser.id, req.params.id);
    res.status(204).end();
  }));

  // A pattern reference-screenshot image, uploaded independently of the pattern record itself
  // (see sync-queue.js's 'pattern-images' sender in pattern-registry-store.js) - mirrors
  // routes.trading-sessions.mjs's /images endpoint exactly, one category swapped for the other.
  app.post('/images', asyncHandler(async (req, res) => {
    const { dataUrl } = req.body || {};
    const url = await saveImage(dataUrl, { uploadsDir, category: 'pattern' });
    res.status(201).json({ url });
  }));

  return app;
}
