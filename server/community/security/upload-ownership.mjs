// P0-2 fix (Public Launch Readiness Audit, 2026-09-04): private trading/mental-health-adjacent
// media (/uploads/{session,pattern,strategy,trade}/*) was previously gated only by requireAuth() -
// ANY authenticated user, never the file's actual owner (see app.mjs's own former comment, and
// docs/auth/IMPLEMENTATION_STATUS.md section 8, which named this gap explicitly rather than
// silently shipping it). This module is the real owner resolution that closes it.
//
// Two-tier lookup, deliberately in this order:
//   1. storage_objects (Commercial System Slice 2, 035_storage_objects.sql) - the real,
//      upload-time-synchronous ownership record written by every private upload endpoint
//      (routes.trades.mjs/routes.patterns.mjs/routes.strategies.mjs/routes.trading-sessions.mjs's
//      own POST /images) via ObjectStorageProvider.put()+recordStorageObject(). Indexed lookup by
//      object_key, correct from the moment a file is written - even before the record that will
//      eventually reference it (a Trade, a Pattern, ...) is itself saved.
//   2. A per-category fallback that resolves ownership from the actual domain row still
//      referencing this exact URL (trade_screenshots/pattern_screenshots/strategy_attachments/
//      trading_session_entries) - required because every one of these four domains (migrations
//      006-009) predates storage_objects (migration 035) by a long stretch of this app's history.
//      A real, still-legitimate screenshot uploaded before that table existed has NO
//      storage_objects row at all; skipping this fallback would 404 every existing user's older
//      screenshots the moment this fix shipped - a real regression, not just closing a gap.
// A URL matching neither tier belongs to no one this server can verify, and is denied - fail
// closed, never fail open on an unresolvable owner.
const RESOLVERS = {
  session: (repo, url) => repo.tradingSessions.findOwnerByEntryImageUrl(url),
  pattern: (repo, url) => repo.patterns.findOwnerByScreenshotUrl(url),
  strategy: (repo, url) => repo.strategies.findOwnerByAttachmentUrl(url),
  trade: (repo, url) => repo.trades.findOwnerByScreenshotUrl(url)
};

export async function resolveUploadOwnerId(repo, category, objectKey) {
  const viaStorageObjects = await repo.storageObjects.findActiveByObjectKey(objectKey);
  if (viaStorageObjects) return viaStorageObjects;
  const resolver = RESOLVERS[category];
  if (!resolver) return null;
  return resolver(repo, `/uploads/${objectKey}`);
}

// Express middleware factory - mounted after requireAuth() on the four private upload categories
// only (see server/community/app.mjs). `req.path` here is already relative to the `/uploads`
// mount point (e.g. `/trade/img-abc123.jpg`), matching the existing category-detection convention
// right above this middleware in app.mjs.
//
// Never distinguishes "no such file" from "not yours" in the response - the same uniform-404
// convention every other owner-scoped GET in this codebase already uses (e.g. routes.trades.mjs's
// GET /:id) - a 403 would confirm the file's existence to a probing attacker, a 404 does not.
export function requireUploadOwnership(repo) {
  return async function (req, res, next) {
    try {
      const objectKey = req.path.replace(/^\/+/, '');
      const category = objectKey.split('/')[0];
      if (!objectKey || objectKey === category) return res.status(404).json({ error: 'UPLOAD_NOT_FOUND' });
      const ownerId = await resolveUploadOwnerId(repo, category, objectKey);
      if (!ownerId || ownerId !== req.currentUser.id) {
        return res.status(404).json({ error: 'UPLOAD_NOT_FOUND' });
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
