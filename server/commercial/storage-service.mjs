// Server-authoritative storage usage/quota (spec section 12). Never trusts a client-reported
// total - usage is always SUM(storage_objects.sizeBytes) for rows this server itself wrote after
// a real saveImage() call; quota is the plan's base storageBytes (Slice 1) plus every currently
// unexpired storage_entitlements row (Slice 2), computed fresh on every call - never cached,
// matching this codebase's "derive status at read time" convention (design decision 5).
import { ApiError } from '../community/errors.mjs';
import { resolveUserEntitlements } from './entitlement-resolver.mjs';

export async function resolveStorageUsageBytes(repo, userId) {
  return repo.storageObjects.sumActiveBytesForUser(userId);
}

export async function resolveStorageQuotaBytes(repo, userId) {
  const entitlements = await resolveUserEntitlements(userId, repo);
  const addOnBytes = await repo.storageEntitlements.sumActiveCapacityForUser(userId);
  return entitlements.storageBytes + addOnBytes;
}

// Called BEFORE saveImage() on every quota-metered upload endpoint (patterns/strategies/
// sessions/trades - never posts/marketplace, which aren't part of the Cloud Storage concept in
// the spec). `incomingBytes` is the raw decoded byte length (same measurement storage.mjs itself
// uses for its own MAX_IMAGE_BYTES check) - a safe, slightly-conservative pre-check, since the
// final re-encoded size actually recorded afterward is typically smaller.
export async function assertStorageAvailable(repo, userId, incomingBytes) {
  const [usedBytes, quotaBytes] = await Promise.all([resolveStorageUsageBytes(repo, userId), resolveStorageQuotaBytes(repo, userId)]);
  if (usedBytes + incomingBytes > quotaBytes) {
    throw new ApiError(403, 'STORAGE_QUOTA_EXCEEDED', null, { usedBytes, quotaBytes, requiredBytes: incomingBytes });
  }
}

// Called AFTER a successful saveImage() - records the REAL final size, never the pre-check
// estimate (same "conservative estimate, exact settlement" shape already established by the
// Wallet's reserve/settle flow in Slice 1).
export async function recordStorageObject(repo, { userId, objectKey, sizeBytes, mimeType, category, sourceDomain, sourceRecordId }) {
  return repo.storageObjects.record({ userId, objectKey, sizeBytes, mimeType, category, sourceDomain: sourceDomain || null, sourceRecordId: sourceRecordId || null });
}

// Threshold/expiry fields for a future notification layer to consume (spec section 10) - computed
// here, not stored, and not pushed anywhere; the seam is these numbers being present on
// GET /api/sync/storage's response.
export function percentUsed(usedBytes, quotaBytes) {
  return quotaBytes > 0 ? Math.min(100, Math.round((usedBytes / quotaBytes) * 1000) / 10) : 0;
}
export function thresholdCrossedFor(percent) {
  if (percent >= 100) return 100;
  if (percent >= 90) return 90;
  if (percent >= 80) return 80;
  return null;
}
