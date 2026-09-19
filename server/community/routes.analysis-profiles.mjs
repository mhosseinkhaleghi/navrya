import express from 'express';
import { asyncHandler, ApiError } from './errors.mjs';
import { assertStorageAvailable, recordStorageObject } from '../commercial/storage-service.mjs';
import { LocalDiskObjectStorageProvider } from '../storage/object-storage-provider.mjs';
import { decodedByteLength } from '../storage/storage.mjs';
import { SOURCES_PER_PROFILE_MAX } from '../db/analysis-profile-normalize.mjs';

// Analysis Profiles domain (see ARCHITECTURE.md §7.25). Mounted at /api/sync/analysis-profiles,
// behind devUserAuth/requireAuth - see routes.trading-sessions.mjs's comment for why /api/sync/*
// is its own prefix, separate from the AI-only gateway. Mirrors routes.patterns.mjs's shape
// exactly, minus an /images route - this domain has no user-uploaded files.
//
// Deliberately NOT gated by createWithQuota (unlike Patterns/Strategies, which are commercial
// content domains with their own plan limits) - Analysis Profiles is a foundational identity
// domain the brief never asked to be plan-limited; adding that gate would be unrequested scope.
// The one exception is a knowledge-source PDF (below): it is real stored bytes, so it counts
// against the trader's storage quota exactly like every other quota-metered upload.
export function router(repo, uploadsDir) {
  const app = express.Router();
  const objectStorage = new LocalDiskObjectStorageProvider({ uploadsDir });

  // Removes a stored knowledge-source PDF: the file first, then its storage_objects row - the same
  // "delete file, then mark the row deleted" order routes.media.mjs and routes.storage.mjs use, so
  // a failed file delete leaves the quota row in place rather than freeing bytes still on disk.
  async function removeSourceFile(source) {
    if (!source || !source.storageObjectId) return;
    const storageObject = await repo.storageObjects.get(source.storageObjectId);
    if (storageObject && !storageObject.deletedAt) {
      await objectStorage.delete(storageObject.objectKey);
      await repo.storageObjects.markDeleted(storageObject.id);
    }
  }

  app.get('/', asyncHandler(async (req, res) => {
    res.json({ analysisProfiles: await repo.analysisProfiles.listByUser(req.currentUser.id) });
  }));

  app.get('/:id', asyncHandler(async (req, res) => {
    const record = await repo.analysisProfiles.get(req.currentUser.id, req.params.id);
    if (!record) throw new ApiError(404, 'ANALYSIS_PROFILE_NOT_FOUND');
    res.json(record);
  }));

  // Idempotent upsert by the record's own client-generated id - the one write path
  // server-replica.js's upsert() always calls, for both a brand-new profile and an edit.
  app.post('/', asyncHandler(async (req, res) => {
    const record = req.body || {};
    if (!record.id) throw new ApiError(400, 'VALIDATION_FAILED');
    const saved = await repo.analysisProfiles.upsert(req.currentUser.id, record);
    res.status(200).json(saved);
  }));

  app.delete('/:id', asyncHandler(async (req, res) => {
    // The child rows cascade in the database, but a stored PDF's FILE and its quota row do not -
    // without this the profile's PDFs would keep counting against the trader's storage forever.
    let sources = [];
    try { sources = await repo.analysisProfileSources.listByProfile(req.currentUser.id, req.params.id); }
    catch (error) { if (!(error instanceof ApiError) || error.status !== 404) throw error; }
    await repo.analysisProfiles.remove(req.currentUser.id, req.params.id);
    for (const source of sources) await removeSourceFile(source);
    res.status(204).end();
  }));

  // Engine-memory learning ledger (069_analysis_profile_memory.sql) - append-only, nested under
  // its owning profile (same "action route under the parent id" shape as routes.media.mjs's own
  // POST /assets/:id/links), never a top-level server-replica list domain: lazily fetched only
  // when a profile's Memory tab actually opens, not part of the boot-time hydrate every list
  // domain participates in. Ownership is re-checked against the real profile row inside the repo
  // methods themselves, never trusted from the URL alone.
  app.get('/:id/events', asyncHandler(async (req, res) => {
    res.json({ events: await repo.analysisProfileEvents.listByProfile(req.currentUser.id, req.params.id) });
  }));
  app.post('/:id/events', asyncHandler(async (req, res) => {
    const saved = await repo.analysisProfileEvents.create(req.currentUser.id, req.params.id, req.body || {});
    res.status(201).json(saved);
  }));

  // Knowledge sources (070_analysis_profile_sources.sql) - website / YouTube / PDF material a
  // trader teaches a profile from. Nested under the owning profile like the events ledger, lazily
  // fetched when the Knowledge tab opens. Ownership is re-checked against the real profile row
  // inside every repo method. A URL source is only ever RECORDED here - fetching the page is the
  // AI gateway's /api/analysis-profiles/read-source (this API process never makes an outbound
  // request to a trader-supplied URL). Only a small allowlist of fields is ever patchable: the
  // URL and kind are fixed at creation, so a source cannot be re-pointed after the fact.
  const PATCHABLE_SOURCE_FIELDS = ['title', 'digest', 'status', 'errorCode', 'taughtUnderstandingVersion'];

  // A stored PDF can be deleted independently from the Storage page; the Knowledge tab must say so
  // honestly rather than offer to teach from a file that is gone.
  async function withFileAvailability(source) {
    if (source.kind !== 'pdf') return source;
    const storageObject = source.storageObjectId ? await repo.storageObjects.get(source.storageObjectId) : null;
    return { ...source, fileAvailable: Boolean(storageObject && !storageObject.deletedAt) };
  }

  app.get('/:id/sources', asyncHandler(async (req, res) => {
    const sources = await repo.analysisProfileSources.listByProfile(req.currentUser.id, req.params.id);
    res.json({ sources: await Promise.all(sources.map(withFileAvailability)) });
  }));

  app.post('/:id/sources', asyncHandler(async (req, res) => {
    const body = req.body || {};
    if (body.kind === 'pdf') throw new ApiError(400, 'VALIDATION_FAILED'); // a PDF is a file upload - POST .../sources/pdf
    const saved = await repo.analysisProfileSources.create(req.currentUser.id, req.params.id, body);
    res.status(201).json(saved);
  }));

  app.post('/:id/sources/pdf', asyncHandler(async (req, res) => {
    const { dataUrl, filename, title } = req.body || {};
    if (!dataUrl || typeof dataUrl !== 'string') throw new ApiError(400, 'VALIDATION_FAILED');
    // Ownership and the per-profile cap are checked BEFORE any bytes are written, so a refused
    // upload never leaves an orphaned file or a stray quota row behind.
    const existing = await repo.analysisProfileSources.listByProfile(req.currentUser.id, req.params.id);
    if (existing.length >= SOURCES_PER_PROFILE_MAX) throw new ApiError(400, 'ANALYSIS_PROFILE_SOURCE_LIMIT');
    await assertStorageAvailable(repo, req.currentUser.id, decodedByteLength(dataUrl));
    // Stored under the existing private 'media' category: every object there already has a
    // storage_objects row from upload time, which is exactly what upload-ownership.mjs resolves
    // ownership from - so it is owner-only with no new category or resolver needed.
    const stored = await objectStorage.putDocument(dataUrl, { category: 'media' });
    const storageObject = await recordStorageObject(repo, {
      userId: req.currentUser.id, objectKey: stored.objectKey, sizeBytes: stored.sizeBytes, mimeType: stored.mimeType,
      category: 'media', sourceDomain: 'analysis-profile-source', sourceRecordId: req.params.id
    });
    const fileName = typeof filename === 'string' ? filename.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
    try {
      const saved = await repo.analysisProfileSources.create(req.currentUser.id, req.params.id, {
        kind: 'pdf', title: typeof title === 'string' && title.trim() ? title : fileName.replace(/\.pdf$/i, ''), status: 'ready'
      }, { storageObjectId: storageObject.id, fileUrl: stored.url, fileName, fileSizeBytes: stored.sizeBytes });
      res.status(201).json({ ...saved, fileAvailable: true });
    } catch (error) {
      // The row could not be written after the file already was - release the bytes so the failed
      // upload does not silently eat the trader's quota.
      await objectStorage.delete(stored.objectKey).catch(() => {});
      await repo.storageObjects.markDeleted(storageObject.id).catch(() => {});
      throw error;
    }
  }));

  app.patch('/:id/sources/:sourceId', asyncHandler(async (req, res) => {
    const body = req.body || {};
    const patch = {};
    PATCHABLE_SOURCE_FIELDS.forEach((key) => { if (Object.prototype.hasOwnProperty.call(body, key)) patch[key] = body[key]; });
    const saved = await repo.analysisProfileSources.update(req.currentUser.id, req.params.id, req.params.sourceId, patch);
    res.json(await withFileAvailability(saved));
  }));

  app.delete('/:id/sources/:sourceId', asyncHandler(async (req, res) => {
    const removed = await repo.analysisProfileSources.remove(req.currentUser.id, req.params.id, req.params.sourceId);
    await removeSourceFile(removed);
    res.status(204).end();
  }));

  return app;
}
