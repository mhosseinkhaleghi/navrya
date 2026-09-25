import express from 'express';
import { asyncHandler, ApiError } from './errors.mjs';
import { createWithQuota } from '../commercial/quota.mjs';
import { normalizeInstrumentCode } from '../db/instrument-normalize.mjs';

// Instrument Catalog domain (025_instrument_catalog.sql). Mounted at
// /api/sync/instrument-catalog, behind the same requireAuth()+csrfProtection() chain every
// other /api/sync/* route sits behind - see routes.accounts.mjs's comment for why /api/sync/*
// is its own prefix. Same idempotent-upsert-by-client-id shape as every other list-shaped sync
// domain (accounts/trades/patterns/...) - no archive-vs-delete distinction like accounts needs,
// since nothing else holds a foreign key to a catalog row's own id (every consumer stores the
// plain code string - see the migration's comment).
//
// This catalog is also the instrument entitlement: the plan's `analysisSymbols` limit caps how many
// DISTINCT codes a user may hold here (server/commercial/quota.mjs), which is what the Session
// InstrumentPicker really writes. A brand-new code is gated by createWithQuota() under the same
// (user, resource) lock every other capped domain uses; updating a row, re-adding a code the user
// already has (a duplicate is the repo's own 409, never a quota error) and deleting one are never
// gated, so a downgrade never deletes data and a delete frees capacity immediately.
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
    const userId = req.currentUser.id;
    const code = normalizeInstrumentCode(record.code);
    const rows = code ? await repo.instrumentCatalog.listByUser(userId) : [];
    // Only a genuinely new (id AND code) instrument consumes capacity. An invalid code and a
    // duplicate code fall through to the repo, which answers 400/409 itself.
    const addsInstrument = Boolean(code) && !rows.some((row) => row.id === record.id || row.code === code);
    const saved = addsInstrument
      ? await createWithQuota('analysisSymbols', userId, repo, () => repo.instrumentCatalog.upsert(userId, record))
      : await repo.instrumentCatalog.upsert(userId, record);
    res.status(200).json(saved);
  }));

  app.delete('/:id', asyncHandler(async (req, res) => {
    await repo.instrumentCatalog.remove(req.currentUser.id, req.params.id);
    res.status(204).end();
  }));

  return app;
}
