import express from 'express';
import { asyncHandler, ApiError } from './errors.mjs';
import { getBillingProvider } from '../commercial/billing-provider-factory.mjs';
import { resolveStorageUsageBytes, resolveStorageQuotaBytes, percentUsed, thresholdCrossedFor } from '../commercial/storage-service.mjs';
import { LocalDiskObjectStorageProvider } from '../storage/object-storage-provider.mjs';

// Commercial System Slice 2/Validation Gate - the user-facing Storage surface (spec section
// 9/10/15/21). Mounted at /api/sync/storage, same requireAuth()+csrfProtection() chain as every
// other /api/sync/* route. GET / never trusts a client-reported total (spec section 12) -
// usedBytes/quotaBytes are always server-authoritative (server/commercial/storage-service.mjs).
// percentUsed/thresholdCrossed are the "clean event seam" for a future notification layer (spec
// section 10) - computed here, not pushed anywhere.
export function router(repo, uploadsDir) {
  const app = express.Router();
  const billingProvider = getBillingProvider(repo);
  const objectStorage = new LocalDiskObjectStorageProvider({ uploadsDir });

  app.get('/', asyncHandler(async (req, res) => {
    const [usedBytes, quotaBytes, entitlements] = await Promise.all([
      resolveStorageUsageBytes(repo, req.currentUser.id),
      resolveStorageQuotaBytes(repo, req.currentUser.id),
      repo.storageEntitlements.listForUser(req.currentUser.id)
    ]);
    const percent = percentUsed(usedBytes, quotaBytes);
    res.json({ usedBytes, quotaBytes, percentUsed: percent, thresholdCrossed: thresholdCrossedFor(percent), entitlements });
  }));

  app.get('/products', asyncHandler(async (req, res) => {
    const products = await repo.storageProducts.list();
    res.json({ products: products.filter((product) => product.enabled) });
  }));

  app.post('/purchase-request', asyncHandler(async (req, res) => {
    const productId = (req.body || {}).productId;
    const result = await billingProvider.createStoragePurchase({ userId: req.currentUser.id, productId });
    res.status(201).json(result);
  }));

  // Validation Gate (spec section 15/16/17) - the real deletion lifecycle. `objectKey` is never
  // taken from the client here - it's read back from the user's OWN storage_objects row, so
  // path-traversal can only ever be reached by directly calling
  // ObjectStorageProvider.delete()/storage.mjs's deleteFile() with an untrusted key (defended
  // there regardless - see deleteFile()'s own comment), never through this HTTP surface.
  app.get('/objects', asyncHandler(async (req, res) => {
    res.json({ objects: await repo.storageObjects.listActiveForUser(req.currentUser.id) });
  }));

  app.delete('/objects/:id', asyncHandler(async (req, res) => {
    const object = await repo.storageObjects.get(req.params.id);
    if (!object || object.deletedAt) throw new ApiError(404, 'STORAGE_OBJECT_NOT_FOUND');
    if (object.userId !== req.currentUser.id) throw new ApiError(403, 'NOT_STORAGE_OBJECT_OWNER');
    await objectStorage.delete(object.objectKey);
    await repo.storageObjects.markDeleted(object.id);
    res.status(204).end();
  }));

  return app;
}
