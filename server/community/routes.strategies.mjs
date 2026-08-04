import express from 'express';
import { asyncHandler, ApiError } from './errors.mjs';
import { saveImage } from '../storage/storage.mjs';

// Module 3 of the local-first-to-server migration (see ARCHITECTURE.md's Global Data Sync
// section, 7.18). Mounted at /api/sync/strategies, behind devUserAuth - see
// routes.trading-sessions.mjs's comment for why /api/sync/* is its own prefix.
export function router(repo, uploadsDir) {
  const app = express.Router();

  app.get('/', asyncHandler(async (req, res) => {
    res.json({ strategies: await repo.strategies.listByUser(req.currentUser.id) });
  }));

  app.get('/:id', asyncHandler(async (req, res) => {
    const record = await repo.strategies.get(req.currentUser.id, req.params.id);
    if (!record) throw new ApiError(404, 'STRATEGY_NOT_FOUND');
    res.json(record);
  }));

  // Idempotent upsert by the record's own client-generated id - used both by the sync queue's
  // per-write push and the one-time bulk migration of pre-existing local strategies.
  app.post('/', asyncHandler(async (req, res) => {
    const record = req.body || {};
    if (!record.id) throw new ApiError(400, 'VALIDATION_FAILED');
    const saved = await repo.strategies.upsert(req.currentUser.id, record);
    res.status(200).json(saved);
  }));

  app.delete('/:id', asyncHandler(async (req, res) => {
    await repo.strategies.remove(req.currentUser.id, req.params.id);
    res.status(204).end();
  }));

  // Image-type attachments only (see 7.18's Known Constraints note) - the shared storage
  // module validates/stores images; non-image attachments (pdf/txt/docx) stay local-only for
  // now, exactly as strategy-education-store.js already handled a missing/failed image store.
  app.post('/images', asyncHandler(async (req, res) => {
    const { dataUrl } = req.body || {};
    const url = await saveImage(dataUrl, { uploadsDir, category: 'strategy' });
    res.status(201).json({ url });
  }));

  return app;
}
