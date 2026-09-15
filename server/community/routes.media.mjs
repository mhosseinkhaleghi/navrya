import express from 'express';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { asyncHandler, ApiError } from './errors.mjs';
import { decodedByteLength } from '../storage/storage.mjs';
import { LocalDiskObjectStorageProvider } from '../storage/object-storage-provider.mjs';
import { assertStorageAvailable, recordStorageObject } from '../commercial/storage-service.mjs';
import { detectChartMetadata } from './media-chart-ocr.mjs';
import { currentMarketSession } from './market-session-clock.mjs';

const KINDS = new Set(['chart', 'image']);
const LINK_DOMAINS = new Set(['sessionEntry', 'trade', 'pattern', 'strategy']);

function bufferFromDataUrl(dataUrl) {
  const match = /^data:[^;]+;base64,(.+)$/.exec(dataUrl || '');
  return match ? Buffer.from(match[1], 'base64') : null;
}

// Runs the fully local OCR pipeline (server/community/media-chart-ocr.mjs) and persists whatever
// it honestly found - guarded so a genuine crash in the OCR module itself (never expected, since
// that module already catches its own decode/recognize failures) still leaves the asset in a
// real, visible 'failed' state instead of stuck 'processing' forever. Synchronous within the
// same request - local OCR on the small, pre-cropped legend region typically completes in well
// under a second, so there is no async "processing -> poll later" round trip to manage any more.
async function runChartDetection(repo, assetId, imageBuffer) {
  let outcome;
  try {
    outcome = await detectChartMetadata(imageBuffer);
  } catch (_) {
    outcome = { status: 'failed', isTradingChart: null, symbol: null, timeframe: null, confidence: null, errorCode: 'OCR_FAILED' };
  }
  return repo.mediaAssets.updateAnalysis(assetId, {
    status: outcome.status, isTradingChart: outcome.isTradingChart, symbol: outcome.symbol, timeframe: outcome.timeframe,
    exchange: outcome.exchange, confidence: outcome.confidence, provider: 'local-ocr', model: 'tesseract.js', errorCode: outcome.errorCode
  });
}

function assetResponse(asset, linkCount) {
  return {
    id: asset.id, url: asset.url, kind: asset.kind, originalFilename: asset.originalFilename, mimeType: asset.mimeType,
    source: asset.source, sessionId: asset.sessionId, activeMarketSession: asset.activeMarketSession,
    metadataStatus: asset.metadataStatus, isTradingChart: asset.isTradingChart, symbol: asset.symbol, timeframe: asset.timeframe,
    exchange: asset.exchange, confidence: asset.confidence, analysisProvider: asset.analysisProvider, analysisModel: asset.analysisModel, analysisErrorCode: asset.analysisErrorCode,
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
  // instead, which never touches storage or quota again. `sessionId` (when the trader is inside a
  // real Live Session) is still verified against that user's own owned session row and stored for
  // linking purposes - silently ignored (not a hard failure) if it doesn't resolve to one this
  // user actually owns, so an otherwise-valid upload is never blocked by a stale/foreign sessionId
  // - but activeMarketSession itself is NEVER read from that session's own stored `market` label
  // any more (real user correction: a session can stay open long after its own city's real market
  // has closed, or the trader can screenshot a chart well after switching context - the field this
  // app calls "the active market session" must mean the one genuinely live RIGHT NOW, at capture
  // time, not whichever one the trader happened to pick when they opened their session). Always
  // computed fresh from the server's own real clock (market-session-clock.mjs) instead.
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

    let verifiedSessionId = null;
    if (sessionId) {
      const session = await repo.tradingSessions.get(req.currentUser.id, sessionId);
      if (session) verifiedSessionId = session.id;
    }

    let asset = await repo.mediaAssets.create({
      userId: req.currentUser.id, storageObjectId: storageObject.id, url: stored.url, kind: resolvedKind,
      originalFilename: typeof filename === 'string' ? filename.slice(0, 200) : null, mimeType: stored.mimeType || mimeType || null,
      source: source === 'capture' ? 'capture' : 'upload', sessionId: verifiedSessionId, activeMarketSession: currentMarketSession(),
      // Only a real chart ever gets metadata extraction (step 1 of the extraction contract) - an
      // ordinary image is 'not_applicable' and never analyzed at all.
      metadataStatus: resolvedKind === 'chart' ? 'processing' : 'not_applicable'
    });
    // Local OCR (server/community/media-chart-ocr.mjs) - no AI provider, no wallet, no network
    // call, so this runs right here, synchronously, before the response - the trader gets the
    // real result immediately rather than polling a separate "processing" state.
    if (resolvedKind === 'chart') {
      const imageBuffer = bufferFromDataUrl(dataUrl);
      const updated = imageBuffer ? await runChartDetection(repo, asset.id, imageBuffer) : null;
      if (updated) asset = updated;
    }
    res.status(201).json(assetResponse(asset, 0));
  }));

  // Explicit, user-triggered retry only - refused (409) while an extraction is already in flight
  // (metadataStatus==='processing'), so a duplicate concurrent job can never start. Re-reads the
  // already-stored file straight off disk (never re-uploaded/re-charged) and re-runs the same
  // local OCR pipeline synchronously, returning the final result directly - no separate follow-up
  // call for the client to make.
  app.post('/assets/:id/retry-analysis', asyncHandler(async (req, res) => {
    const asset = await loadOwnedAsset(repo, req.params.id, req.currentUser.id);
    if (asset.kind !== 'chart') throw new ApiError(400, 'NOT_A_CHART_ASSET');
    if (asset.metadataStatus === 'processing') throw new ApiError(409, 'ANALYSIS_ALREADY_IN_PROGRESS');
    const marked = await repo.mediaAssets.markProcessing(asset.id);
    if (!marked) throw new ApiError(409, 'ANALYSIS_ALREADY_IN_PROGRESS');
    const storageObject = await repo.storageObjects.get(asset.storageObjectId);
    let imageBuffer = null;
    try { imageBuffer = storageObject ? await readFile(path.join(uploadsDir, storageObject.objectKey)) : null; } catch (_) { imageBuffer = null; }
    const updated = imageBuffer ? await runChartDetection(repo, asset.id, imageBuffer) : await repo.mediaAssets.updateAnalysis(asset.id, { status: 'failed', errorCode: 'SOURCE_FILE_MISSING' });
    res.json(assetResponse(updated || marked));
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
