import express from 'express';
import { asyncHandler, ApiError } from './errors.mjs';
import { createWithQuota } from '../commercial/quota.mjs';

// Commercial System Slice 1 (030_analysis_symbols.sql) - the "Active Analysis Symbols"
// entitlement primitive (spec section 6/51). Mounted at /api/sync/analysis-symbols, same
// requireAuth()+csrfProtection() chain every other /api/sync/* route sits behind. Deliberately
// minimal (no existing UI consumer yet - see the Slice 1 plan's open item) - a future "active
// symbol picker" feature calls this exactly like it would any other /api/sync/* domain.
export function router(repo) {
  const app = express.Router();

  app.get('/', asyncHandler(async (req, res) => {
    res.json({ symbols: await repo.analysisSymbols.listByUser(req.currentUser.id) });
  }));

  // Idempotent upsert by the record's own client-generated id. Free's limit-of-1 only gates a
  // genuinely NEW id - "replacing" the active symbol is DELETE the old id, then POST a new one,
  // which naturally regains the quota slot (spec section 6: "may replace it").
  app.post('/', asyncHandler(async (req, res) => {
    const record = req.body || {};
    if (!record.id || !record.symbol) throw new ApiError(400, 'VALIDATION_FAILED');
    const existing = await repo.analysisSymbols.listByUser(req.currentUser.id).then((rows) => rows.find((row) => row.id === record.id));
    const saved = existing
      ? await repo.analysisSymbols.upsert(req.currentUser.id, record)
      : await createWithQuota('analysisSymbols', req.currentUser.id, repo, () => repo.analysisSymbols.upsert(req.currentUser.id, record));
    res.status(200).json(saved);
  }));

  app.delete('/:id', asyncHandler(async (req, res) => {
    await repo.analysisSymbols.remove(req.currentUser.id, req.params.id);
    res.status(204).end();
  }));

  return app;
}
