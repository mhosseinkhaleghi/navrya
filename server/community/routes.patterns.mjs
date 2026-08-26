import express from 'express';
import { asyncHandler, ApiError } from './errors.mjs';
import { decodedByteLength } from '../storage/storage.mjs';
import { LocalDiskObjectStorageProvider } from '../storage/object-storage-provider.mjs';
import { createWithQuota } from '../commercial/quota.mjs';
import { assertStorageAvailable, recordStorageObject } from '../commercial/storage-service.mjs';

// Module 2 of the local-first-to-server migration (see ARCHITECTURE.md's Global Data Sync
// section, 7.18). Mounted at /api/sync/patterns, behind devUserAuth - see
// routes.trading-sessions.mjs's comment for why /api/sync/* is its own prefix.
export function router(repo, uploadsDir) {
  const app = express.Router();
  const objectStorage = new LocalDiskObjectStorageProvider({ uploadsDir });

  app.get('/', asyncHandler(async (req, res) => {
    res.json({ patterns: await repo.patterns.listByUser(req.currentUser.id) });
  }));

  app.get('/:id', asyncHandler(async (req, res) => {
    const record = await repo.patterns.get(req.currentUser.id, req.params.id);
    if (!record) throw new ApiError(404, 'PATTERN_NOT_FOUND');
    res.json(record);
  }));

  // Idempotent upsert by the record's own client-generated id - used both by the sync queue's
  // per-write push and the one-time bulk migration of pre-existing local patterns. The plan
  // Pattern limit (Commercial System Slice 1) only ever gates a genuinely NEW id - an update to
  // an existing pattern the user already owns always goes straight through, even over the limit
  // (spec section 54: downgrade blocks creating another, never editing what already exists).
  app.post('/', asyncHandler(async (req, res) => {
    const record = req.body || {};
    if (!record.id) throw new ApiError(400, 'VALIDATION_FAILED');
    const existing = await repo.patterns.get(req.currentUser.id, record.id);
    const saved = existing
      ? await repo.patterns.upsert(req.currentUser.id, record)
      : await createWithQuota('patterns', req.currentUser.id, repo, () => repo.patterns.upsert(req.currentUser.id, record));
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
    await assertStorageAvailable(repo, req.currentUser.id, decodedByteLength(dataUrl));
    const { url, objectKey, sizeBytes, mimeType } = await objectStorage.put(dataUrl, { category: 'pattern' });
    await recordStorageObject(repo, { userId: req.currentUser.id, objectKey, sizeBytes, mimeType, category: 'pattern' });
    res.status(201).json({ url });
  }));

  return app;
}
