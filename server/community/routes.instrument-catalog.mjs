import express from 'express';
import { asyncHandler, ApiError } from './errors.mjs';

// Instrument Catalog domain (025_instrument_catalog.sql). Mounted at
// /api/sync/instrument-catalog, behind the same requireAuth()+csrfProtection() chain every
// other /api/sync/* route sits behind - see routes.accounts.mjs's comment for why /api/sync/*
// is its own prefix. Same idempotent-upsert-by-client-id shape as every other list-shaped sync
// domain (accounts/trades/patterns/...) - no archive-vs-delete distinction like accounts needs,
// since nothing else holds a foreign key to a catalog row's own id (every consumer stores the
// plain code string - see the migration's comment).
export function router(repo) {
  const app = express.Router();

  app.get('/', asyncHandler(async (req, res) => {
    res.json({ instrumentCatalog: await repo.instrumentCatalog.listByUser(req.currentUser.id) });
  }));

  app.get('/:id', asyncHandler(async (req, res) => {
    const record = await repo.instrumentCatalog.get(req.currentUser.id, req.params.id);
    if (!record) throw new ApiError(404, 'INSTRUMENT_NOT_FOUND');
    res.json(record);
  }));

  app.post('/', asyncHandler(async (req, res) => {
    const record = req.body || {};
    if (!record.id) throw new ApiError(400, 'VALIDATION_FAILED');
    const saved = await repo.instrumentCatalog.upsert(req.currentUser.id, record);
    res.status(200).json(saved);
  }));

  app.delete('/:id', asyncHandler(async (req, res) => {
    await repo.instrumentCatalog.remove(req.currentUser.id, req.params.id);
    res.status(204).end();
  }));

  return app;
}
