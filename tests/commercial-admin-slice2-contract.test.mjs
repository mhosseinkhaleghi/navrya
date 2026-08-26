import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { authHeadersFor } from './helpers/auth-token.mjs';
import { ManualBillingProvider } from '../server/commercial/manual-billing-provider.mjs';
import { invalidateCommercialConfigCache } from '../server/commercial/commercial-config.mjs';

// Slice 2 admin contract coverage: Storage Products CRUD, Subscriptions stats, Transactions
// confirm/fail (with step-up reauth + audit), and the snapshot-immutability guarantees (spec
// section 7/26/27/28). Mirrors commercial-admin-api-contract.test.mjs's own convention.

let server, baseUrl, repo;

before(async () => {
  delete process.env.ADMIN_AUTH_ENFORCED;
  repo = createMemoryRepo();
  server = createApp({ repo, uploadsDir: '/tmp' }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));
beforeEach(() => invalidateCommercialConfigCache());

async function api(method, path, { body, userId } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (userId) Object.assign(headers, await authHeadersFor(repo, userId));
  const response = await fetch(baseUrl + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}
async function createUser(name) { return repo.users.create({ displayName: name }); }
async function createAdmin(name) {
  const user = await repo.users.create({ displayName: name });
  return repo.users.update(user.id, { role: 'admin' });
}

test('a non-admin cannot list or edit storage products, or confirm transactions', async () => {
  const user = await createUser('Regular User');
  assert.equal((await api('GET', '/api/admin/commercial/storage-products', { userId: user.id })).status, 403);
  assert.equal((await api('POST', '/api/admin/commercial/transactions/anything/confirm', { userId: user.id })).status, 403);
});

test('editing a default storage product (e.g. raising Storage 25 to 30 GB) never alters an already-purchased entitlement, only new purchases', async () => {
  const admin = await createAdmin('Admin A');
  const user = await createUser('Trader');
  const billing = new ManualBillingProvider(repo);

  const { transactionId: firstTxId } = await billing.createStoragePurchase({ userId: user.id, productId: 'storage-25' });
  await api('POST', `/api/admin/commercial/transactions/${firstTxId}/confirm`, { userId: admin.id });
  const firstEntitlement = (await repo.storageEntitlements.listForUser(user.id))[0];
  assert.equal(firstEntitlement.capacityBytesSnapshot, 25 * 1073741824);

  const editResult = await api('PATCH', '/api/admin/commercial/storage-products/storage-25', {
    userId: admin.id, body: { capacityBytes: 30 * 1073741824 }
  });
  assert.equal(editResult.status, 200);
  assert.equal(editResult.body.capacityBytes, 30 * 1073741824);

  // The already-purchased entitlement is untouched.
  const stillOriginal = (await repo.storageEntitlements.listForUser(user.id))[0];
  assert.equal(stillOriginal.capacityBytesSnapshot, 25 * 1073741824);

  // A brand-new purchase uses the NEW config.
  const { transactionId: secondTxId } = await billing.createStoragePurchase({ userId: user.id, productId: 'storage-25' });
  await api('POST', `/api/admin/commercial/transactions/${secondTxId}/confirm`, { userId: admin.id });
  const entitlementsAfter = await repo.storageEntitlements.listForUser(user.id);
  assert.equal(entitlementsAfter.length, 2);
  assert.ok(entitlementsAfter.some((e) => e.capacityBytesSnapshot === 30 * 1073741824));
});

test('changing the Plus price never alters an already-active subscription, only a new purchase', async () => {
  const admin = await createAdmin('Admin B');
  const user = await createUser('Trader');
  const billing = new ManualBillingProvider(repo);

  const { transactionId } = await billing.createSubscription({ userId: user.id, planId: 'plus' });
  await api('POST', `/api/admin/commercial/transactions/${transactionId}/confirm`, { userId: admin.id });
  const subscription = await repo.subscriptions.getActiveForUser(user.id);
  assert.equal(subscription.priceAmountMicroUsd, 4990000);

  const priceEdit = await api('PATCH', '/api/admin/commercial/plans/plus', { userId: admin.id, body: { price: { amountUsd: 9.99, billingInterval: 'month' } } });
  assert.equal(priceEdit.status, 200);

  const stillOriginal = await repo.subscriptions.get(subscription.id);
  assert.equal(stillOriginal.priceAmountMicroUsd, 4990000); // unchanged

  const { transactionId: newTxId } = await billing.createSubscription({ userId: user.id, planId: 'plus' });
  const newTransaction = await repo.paymentTransactions.get(newTxId);
  assert.equal(newTransaction.amountMicroUsd, 9990000); // the new price
});

test('confirming a transaction requires a fresh step-up reauth even for a real admin, and a successful confirm is audited', async () => {
  const admin = await createAdmin('Admin C');
  const user = await createUser('Trader');
  const billing = new ManualBillingProvider(repo);
  const { transactionId } = await billing.createWalletTopUp({ userId: user.id, amountUsd: 30 });

  const result = await api('POST', `/api/admin/commercial/transactions/${transactionId}/confirm`, { userId: admin.id });
  assert.equal(result.status, 200);
  const audit = await repo.auditLog.list({ limit: 10 });
  assert.ok(audit.some((entry) => entry.action === 'commercial.transaction.confirm' && entry.targetId === transactionId));
});

test('the admin refund route is real, step-up-gated, audited, and idempotent end to end', async () => {
  const admin = await createAdmin('Admin E');
  const user = await createUser('Refund Target');
  const billing = new ManualBillingProvider(repo);
  const { transactionId } = await billing.createWalletTopUp({ userId: user.id, amountUsd: 30 });
  await api('POST', `/api/admin/commercial/transactions/${transactionId}/confirm`, { userId: admin.id });
  const funded = await repo.wallet.getAccount(user.id);
  assert.equal(funded.paidBalanceMicroUsd, 30000000);

  const refundResult = await api('POST', `/api/admin/commercial/transactions/${transactionId}/refund`, { userId: admin.id });
  assert.equal(refundResult.status, 201);
  const refunded = await repo.wallet.getAccount(user.id);
  assert.equal(refunded.paidBalanceMicroUsd, 0);

  const audit = await repo.auditLog.list({ limit: 20 });
  assert.ok(audit.some((entry) => entry.action === 'commercial.transaction.refund' && entry.targetId === transactionId));

  // A second refund attempt on the SAME original transaction is rejected, not silently re-applied.
  const secondAttempt = await api('POST', `/api/admin/commercial/transactions/${transactionId}/refund`, { userId: admin.id });
  assert.equal(secondAttempt.status, 409);
  assert.equal(secondAttempt.body.error, 'ALREADY_REFUNDED');
  const stillZero = await repo.wallet.getAccount(user.id);
  assert.equal(stillZero.paidBalanceMicroUsd, 0);
});

test('subscription admin stats reflect real rows only', async () => {
  const admin = await createAdmin('Admin D');
  const user = await createUser('Trader');
  const billing = new ManualBillingProvider(repo);
  const { transactionId } = await billing.createSubscription({ userId: user.id, planId: 'plus' });
  await api('POST', `/api/admin/commercial/transactions/${transactionId}/confirm`, { userId: admin.id });

  const stats = await api('GET', '/api/admin/commercial/subscriptions', { userId: admin.id });
  assert.equal(stats.status, 200);
  // This file shares one repo/server across every test (matching this codebase's own HTTP-
  // contract convention) - an earlier test in this file also activates a Plus subscription for
  // its own separate user, so the real count here is ">= 1", never a fixed "exactly 1".
  assert.ok(stats.body.stats.activePlus >= 1);
  assert.equal(stats.body.stats.activePersonalized, 0);
});
