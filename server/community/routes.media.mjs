import express from 'express';
import { asyncHandler, ApiError } from './errors.mjs';
import { decodedByteLength } from '../storage/storage.mjs';
import { LocalDiskObjectStorageProvider } from '../storage/object-storage-provider.mjs';
import { assertStorageAvailable, recordStorageObject } from '../commercial/storage-service.mjs';

const KINDS = new Set(['chart', 'image']);
const LINK_DOMAINS = new Set(['sessionEntry', 'trade', 'pattern', 'strategy']);

function assetResponse(asset, linkCount) {
  return {
    id: asset.id, url: asset.url, kind: asset.kind, originalFilename: asset.originalFilename, mimeType: asset.mimeType,
    source: asset.source, sessionId: asset.sessionId, activeMarketSession: asset.activeMarketSession,
    metadataStatus: asset.metadataStatus, isTradingChart: asset.isTradingChart, symbol: asset.symbol, timeframe: asset.timeframe,
    confidence: asset.confidence, analysisProvider: asset.analysisProvider, analysisModel: asset.analysisModel, analysisErrorCode: asset.analysisErrorCode,
    registeredAt: asset.registeredAt, createdAt: asset.createdAt,
    linkCount: typeof linkCount === 'number' ? linkCount : undefined
  };
}

async function loadOwnedAsset(repo, id, userId) {
  const asset = await repo.mediaAssets.get(id);
  if (!asset || asset.deletedAt) throw new ApiError(404, 'MEDIA_ASSET_NOT_FOUND');
  if (asset.userId !== userId) throw new ApiError(403, 'NOT_MEDIA_ASSET_OWNER');
  return asset;
}

// NAVRYA Media Drive - the ONE reusable, server-canonical trader media library (chart
// screenshots/uploads and ordinary images) behind Session/Trade/Pattern/Strategy attachment flows.
// Mounted at /api/sync/media, same requireAuth()+csrfProtection() chain as every other
// /api/sync/* route (see app.mjs). Storage bytes/quota still flow through the existing
// storage_objects/storage-service.mjs machinery unchanged - this router only adds the reusable
// domain metadata (symbol/timeframe/session/extraction-status) on top, and never re-uploads a
// binary that already has a Media Asset (see the `links` endpoint, which reuses an existing
// asset by reference only).
export function router(repo, uploadsDir) {
  const app = express.Router();
  const objectStorage = new LocalDiskObjectStorageProvider({ uploadsDir });

  // Recent (default landing tab) and My Drive (searchable full library) - see the Media Picker's
  // own two tabs. `scope=recent` ignores q/cursor; `scope=mine` supports both.
  app.get('/assets', asyncHandler(async (req, res) => {
    const scope = req.query.scope === 'mine' ? 'mine' : 'recent';
    if (scope === 'recent') {
      const assets = await repo.mediaAssets.listRecentForUser(req.currentUser.id, { limit: 24 });
      return res.json({ assets: assets.map((a) => assetResponse(a)), nextCursor: null });
    }
    const { assets, nextCursor } = await repo.mediaAssets.listForUser(req.currentUser.id, {
      q: typeof req.query.q === 'string' ? req.query.q : '',
      cursor: typeof req.query.cursor === 'string' ? req.query.cursor : null,
      limit: 30
    });
    res.json({ assets: assets.map((a) => assetResponse(a)), nextCursor });
  }));

  app.get('/assets/:id', asyncHandler(async (req, res) => {
    const asset = await loadOwnedAsset(repo, req.params.id, req.currentUser.id);
    const linkCount = await repo.mediaAssets.countLinksForAsset(asset.id);
    res.json(assetResponse(asset, linkCount));
  }));

  // Stores a NEW chart/image (capture or manual upload) - the only endpoint that ever writes new
  // bytes for this domain. Every later "reuse" of the same asset goes through POST /assets/:id/links
  // instead, which never touches storage or quota again. When sessionId is given (the trader is
  // inside a real Live Session), the active market session is derived from that OWNED session row
  // itself - never from a client-supplied label, and silently ignored (not a hard failure) if the
  // session id doesn't resolve to one this user actually owns, so an otherwise-valid upload is
  // never blocked by a stale/foreign sessionId.
  app.post('/assets', asyncHandler(async (req, res) => {
    const { dataUrl, filename, mimeType, kind, source, sessionId } = req.body || {};
    if (!dataUrl || typeof dataUrl !== 'string') throw new ApiError(400, 'VALIDATION_FAILED');
    const resolvedKind = KINDS.has(kind) ? kind : 'image';
    await assertStorageAvailable(repo, req.currentUser.id, decodedByteLength(dataUrl));
    const stored = await objectStorage.put(dataUrl, { category: 'media' });
    const storageObject = await recordStorageObject(repo, {
      userId: req.currentUser.id, objectKey: stored.objectKey, sizeBytes: stored.sizeBytes, mimeType: stored.mimeType,
      category: 'media', sourceDomain: 'media-drive', sourceRecordId: null
    });

    let activeMarketSession = null;
    let verifiedSessionId = null;
    if (sessionId) {
      const session = await repo.tradingSessions.get(req.currentUser.id, sessionId);
      if (session) { verifiedSessionId = session.id; activeMarketSession = session.market || null; }
    }

    const asset = await repo.mediaAssets.create({
      userId: req.currentUser.id, storageObjectId: storageObject.id, url: stored.url, kind: resolvedKind,
      originalFilename: typeof filename === 'string' ? filename.slice(0, 200) : null, mimeType: stored.mimeType || mimeType || null,
      source: source === 'capture' ? 'capture' : 'upload', sessionId: verifiedSessionId, activeMarketSession,
      // Only a real chart ever gets AI extraction (step 1 of the extraction contract) - an
      // ordinary image is 'not_applicable' and never billed/analyzed.
      metadataStatus: resolvedKind === 'chart' ? 'processing' : 'not_applicable'
    });
    res.status(201).json(assetResponse(asset, 0));
  }));

  // Explicit, user-triggered retry only - refused (409) while an extraction is already in flight
  // (metadataStatus==='processing'), so a duplicate concurrent job can never start. The client is
  // responsible for calling the AI gateway's /api/media/analyze-chart again after this succeeds
  // (this route only flips the status; it holds no AI provider credentials itself).
  app.post('/assets/:id/retry-analysis', asyncHandler(async (req, res) => {
    const asset = await loadOwnedAsset(repo, req.params.id, req.currentUser.id);
    if (asset.kind !== 'chart') throw new ApiError(400, 'NOT_A_CHART_ASSET');
    if (asset.metadataStatus === 'processing') throw new ApiError(409, 'ANALYSIS_ALREADY_IN_PROGRESS');
    const updated = await repo.mediaAssets.markProcessing(asset.id);
    if (!updated) throw new ApiError(409, 'ANALYSIS_ALREADY_IN_PROGRESS');
    res.json(assetResponse(updated));
  }));

  // Creates a REFERENCE only - never re-uploads bytes or re-checks/re-charges storage quota. This
  // is what lets the same chart be attached to, e.g., both a Session entry and a Trade without
  // doubling disk usage.
  app.post('/assets/:id/links', asyncHandler(async (req, res) => {
    const asset = await loadOwnedAsset(repo, req.params.id, req.currentUser.id);
    const { domain, recordId } = req.body || {};
    if (!LINK_DOMAINS.has(domain) || !recordId || typeof recordId !== 'string') throw new ApiError(400, 'VALIDATION_FAILED');
    const link = await repo.mediaAssetLinks.create({ mediaAssetId: asset.id, userId: req.currentUser.id, domain, recordId });
    res.status(201).json(link);
  }));

  // Deletion cannot silently break an attached record (spec requirement). A linked asset is
  // blocked (409) unless the caller explicitly passes ?detach=true, in which case every link is
  // removed first, then the real file and its storage_objects/media_assets rows - the exact same
  // "delete file, then mark rows deleted" order routes.storage.mjs's own DELETE /objects/:id uses.
  app.delete('/assets/:id', asyncHandler(async (req, res) => {
    const asset = await loadOwnedAsset(repo, req.params.id, req.currentUser.id);
    const linkCount = await repo.mediaAssets.countLinksForAsset(asset.id);
    if (linkCount > 0 && req.query.detach !== 'true') throw new ApiError(409, 'MEDIA_ASSET_LINKED', null, { linkCount });
    if (linkCount > 0) await repo.mediaAssetLinks.deleteForAsset(asset.id);
    const storageObject = await repo.storageObjects.get(asset.storageObjectId);
    if (storageObject && !storageObject.deletedAt) {
      await objectStorage.delete(storageObject.objectKey);
      await repo.storageObjects.markDeleted(storageObject.id);
    }
    await repo.mediaAssets.markDeleted(asset.id);
    res.status(204).end();
  }));

  return app;
}
