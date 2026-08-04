import express from 'express';
import { asyncHandler, ApiError } from './errors.mjs';
import { saveImage } from '../storage/storage.mjs';

// Module 4 of the local-first-to-server migration (see ARCHITECTURE.md's Global Data Sync
// section, 7.18). Mounted at /api/sync/trades, behind devUserAuth - see
// routes.trading-sessions.mjs's comment for why /api/sync/* is its own prefix.
export function router(repo, uploadsDir) {
  const app = express.Router();

  app.get('/', asyncHandler(async (req, res) => {
    res.json({ trades: await repo.trades.listByUser(req.currentUser.id) });
  }));

  app.get('/:id', asyncHandler(async (req, res) => {
    const record = await repo.trades.get(req.currentUser.id, req.params.id);
    if (!record) throw new ApiError(404, 'TRADE_NOT_FOUND');
    res.json(record);
  }));

  // Idempotent upsert by the record's own client-generated id - used both by the sync queue's
  // per-write push and the one-time bulk migration of pre-existing local trades.
  app.post('/', asyncHandler(async (req, res) => {
    const record = req.body || {};
    if (!record.id) throw new ApiError(400, 'VALIDATION_FAILED');
    const saved = await repo.trades.upsert(req.currentUser.id, record);
    res.status(200).json(saved);
  }));

  app.delete('/:id', asyncHandler(async (req, res) => {
    await repo.trades.remove(req.currentUser.id, req.params.id);
    res.status(204).end();
  }));

  app.post('/images', asyncHandler(async (req, res) => {
    const { dataUrl } = req.body || {};
    const url = await saveImage(dataUrl, { uploadsDir, category: 'trade' });
    res.status(201).json({ url });
  }));

  return app;
}
