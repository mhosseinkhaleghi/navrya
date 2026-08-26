import express from 'express';
import { asyncHandler, ApiError } from './errors.mjs';
import { decodedByteLength } from '../storage/storage.mjs';
import { LocalDiskObjectStorageProvider } from '../storage/object-storage-provider.mjs';
import { createWithQuota } from '../commercial/quota.mjs';
import { assertStorageAvailable, recordStorageObject } from '../commercial/storage-service.mjs';

// Module 3 of the local-first-to-server migration (see ARCHITECTURE.md's Global Data Sync
// section, 7.18). Mounted at /api/sync/strategies, behind devUserAuth - see
// routes.trading-sessions.mjs's comment for why /api/sync/* is its own prefix.
export function router(repo, uploadsDir) {
  const app = express.Router();
  const objectStorage = new LocalDiskObjectStorageProvider({ uploadsDir });

  app.get('/', asyncHandler(async (req, res) => {
    res.json({ strategies: await repo.strategies.listByUser(req.currentUser.id) });
  }));

  app.get('/:id', asyncHandler(async (req, res) => {
    const record = await repo.strategies.get(req.currentUser.id, req.params.id);
    if (!record) throw new ApiError(404, 'STRATEGY_NOT_FOUND');
    res.json(record);
  }));

  // Idempotent upsert by the record's own client-generated id - used both by the sync queue's
  // per-write push and the one-time bulk migration of pre-existing local strategies. The plan
  // Strategy limit only ever gates a genuinely NEW id, never an update to one the user already owns.
  app.post('/', asyncHandler(async (req, res) => {
    const record = req.body || {};
    if (!record.id) throw new ApiError(400, 'VALIDATION_FAILED');
    const existing = await repo.strategies.get(req.currentUser.id, record.id);
    const saved = existing
      ? await repo.strategies.upsert(req.currentUser.id, record)
      : await createWithQuota('strategies', req.currentUser.id, repo, () => repo.strategies.upsert(req.currentUser.id, record));
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
    await assertStorageAvailable(repo, req.currentUser.id, decodedByteLength(dataUrl));
    const { url, objectKey, sizeBytes, mimeType } = await objectStorage.put(dataUrl, { category: 'strategy' });
    await recordStorageObject(repo, { userId: req.currentUser.id, objectKey, sizeBytes, mimeType, category: 'strategy' });
    res.status(201).json({ url });
  }));

  return app;
}
