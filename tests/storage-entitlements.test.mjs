import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { resolveStorageQuotaBytes } from '../server/commercial/storage-service.mjs';
import { invalidateCommercialConfigCache } from '../server/commercial/commercial-config.mjs';

beforeEach(() => invalidateCommercialConfigCache());

test('Free receives the configured 100 MB base quota with zero add-ons', async () => {
  const repo = createMemoryRepo();
  const user = await repo.users.create({ displayName: 'Trader' });
  assert.equal(await resolveStorageQuotaBytes(repo, user.id), 104857600);
});

test('the default Storage Add-on catalog matches spec section 6 exactly, self-seeded on first read', async () => {
  const repo = createMemoryRepo();
  const products = await repo.storageProducts.list();
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));
  assert.equal(byId['storage-25'].capacityBytes, 25 * 1073741824);
  assert.equal(byId['storage-25'].priceAmountMicroUsd, 4990000);
  assert.equal(byId['storage-25'].validityDays, 90);
  assert.equal(byId['storage-100'].capacityBytes, 100 * 1073741824);
  assert.equal(byId['storage-500'].capacityBytes, 500 * 1073741824);
});

test('an active 25 GB storage entitlement adds capacity on top of the base quota', async () => {
  const repo = createMemoryRepo();
  const user = await repo.users.create({ displayName: 'Trader' });
  const products = await repo.storageProducts.list();
  const storage25 = products.find((p) => p.id === 'storage-25');
  await repo.storageEntitlements.create({
    userId: user.id, productId: storage25.id, capacityBytesSnapshot: storage25.capacityBytes,
    pricePaidSnapshotMicroUsd: storage25.priceAmountMicroUsd, validityDaysSnapshot: 90,
    expiresAt: new Date(Date.now() + 90 * 86400000).toISOString()
  });
  const quota = await resolveStorageQuotaBytes(repo, user.id);
  assert.equal(quota, 104857600 + storage25.capacityBytes);
});

test('multiple storage packs stack while all active', async () => {
  const repo = createMemoryRepo();
  const user = await repo.users.create({ displayName: 'Trader' });
  const products = await repo.storageProducts.list();
  const storage25 = products.find((p) => p.id === 'storage-25');
  const storage100 = products.find((p) => p.id === 'storage-100');
  for (const product of [storage25, storage100]) {
    await repo.storageEntitlements.create({
      userId: user.id, productId: product.id, capacityBytesSnapshot: product.capacityBytes,
      pricePaidSnapshotMicroUsd: product.priceAmountMicroUsd, validityDaysSnapshot: 90,
      expiresAt: new Date(Date.now() + 90 * 86400000).toISOString()
    });
  }
  const quota = await resolveStorageQuotaBytes(repo, user.id);
  assert.equal(quota, 104857600 + storage25.capacityBytes + storage100.capacityBytes);
});

test('an expired storage entitlement no longer contributes capacity, but is not deleted', async () => {
  const repo = createMemoryRepo();
  const user = await repo.users.create({ displayName: 'Trader' });
  const products = await repo.storageProducts.list();
  const storage25 = products.find((p) => p.id === 'storage-25');
  const entitlement = await repo.storageEntitlements.create({
    userId: user.id, productId: storage25.id, capacityBytesSnapshot: storage25.capacityBytes,
    pricePaidSnapshotMicroUsd: storage25.priceAmountMicroUsd, validityDaysSnapshot: 90,
    expiresAt: new Date(Date.now() - 1000).toISOString() // already expired
  });
  const quota = await resolveStorageQuotaBytes(repo, user.id);
  assert.equal(quota, 104857600); // base only - the expired entitlement no longer counts
  const stillListed = await repo.storageEntitlements.listForUser(user.id);
  assert.equal(stillListed.length, 1);
  assert.equal(stillListed[0].id, entitlement.id); // the row itself still exists, untouched
});
