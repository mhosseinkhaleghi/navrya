import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { ManualBillingProvider } from '../server/commercial/manual-billing-provider.mjs';
import { confirmTransaction } from '../server/commercial/payment-service.mjs';
import { invalidateCommercialConfigCache } from '../server/commercial/commercial-config.mjs';
import { resolveUserEntitlements } from '../server/commercial/entitlement-resolver.mjs';
import { resolveStorageQuotaBytes } from '../server/commercial/storage-service.mjs';

// Validation Gate (spec section 19/20/21/22/23) - deterministic refund reversal for every
// transaction type, idempotency, and the explicit partial-refund rejection.
beforeEach(() => invalidateCommercialConfigCache());

test('wallet top-up refund regression: an unspent top-up is fully reversed, exactly once', async () => {
  const repo = createMemoryRepo();
  const user = await repo.users.create({ displayName: 'Trader' });
  const billing = new ManualBillingProvider(repo);
  const { transactionId } = await billing.createWalletTopUp({ userId: user.id, amountUsd: 30 });
  await confirmTransaction(repo, transactionId);
  const funded = await repo.wallet.getAccount(user.id);
  assert.equal(funded.paidBalanceMicroUsd, 30000000);

  const { transactionId: refundTxId } = await billing.refund({ transactionId });
  await confirmTransaction(repo, refundTxId);
  const refunded = await repo.wallet.getAccount(user.id);
  assert.equal(refunded.paidBalanceMicroUsd, 0);

  // Confirming the SAME refund transaction twice never double-debits.
  await confirmTransaction(repo, refundTxId);
  const afterDoubleConfirm = await repo.wallet.getAccount(user.id);
  assert.equal(afterDoubleConfirm.paidBalanceMicroUsd, 0);
});

test('a second refund() call for the same original transaction is rejected outright (idempotency at the request layer)', async () => {
  const repo = createMemoryRepo();
  const user = await repo.users.create({ displayName: 'Trader' });
  const billing = new ManualBillingProvider(repo);
  const { transactionId } = await billing.createWalletTopUp({ userId: user.id, amountUsd: 30 });
  await confirmTransaction(repo, transactionId);
  await billing.refund({ transactionId });

  await assert.rejects(() => billing.refund({ transactionId }), (error) => error.code === 'ALREADY_REFUNDED' && error.status === 409);
});

test('a partial refund amount is rejected explicitly, never silently refunding the full amount instead', async () => {
  const repo = createMemoryRepo();
  const user = await repo.users.create({ displayName: 'Trader' });
  const billing = new ManualBillingProvider(repo);
  const { transactionId } = await billing.createWalletTopUp({ userId: user.id, amountUsd: 30 });
  await confirmTransaction(repo, transactionId);

  await assert.rejects(
    () => billing.refund({ transactionId, amountUsd: 15 }),
    (error) => error.code === 'PARTIAL_REFUND_NOT_SUPPORTED' && error.status === 400
  );
  // The full-amount refund still works fine afterward.
  const full = await billing.refund({ transactionId, amountUsd: 30 });
  assert.ok(full.transactionId);
});

test('only a CONFIRMED transaction can be refunded - a pending one is rejected', async () => {
  const repo = createMemoryRepo();
  const user = await repo.users.create({ displayName: 'Trader' });
  const billing = new ManualBillingProvider(repo);
  const { transactionId } = await billing.createWalletTopUp({ userId: user.id, amountUsd: 30 });
  await assert.rejects(() => billing.refund({ transactionId }), (error) => error.code === 'ONLY_CONFIRMED_TRANSACTIONS_CAN_BE_REFUNDED');
});

test('a fully refunded subscription immediately loses its plan entitlement, without deleting any user data', async () => {
  const repo = createMemoryRepo();
  const user = await repo.users.create({ displayName: 'Trader' });
  await repo.instrumentCatalog.upsert(user.id, { id: 'instr-1', code: 'XAUUSD' });
  const billing = new ManualBillingProvider(repo);
  const { transactionId } = await billing.createSubscription({ userId: user.id, planId: 'plus' });
  await confirmTransaction(repo, transactionId);

  // Create data while entitled to unlimited Patterns (Plus), well over Free's limit of 3.
  for (let i = 0; i < 5; i += 1) await repo.patterns.upsert(user.id, { id: 'p-' + i, name: 'P' + i, instruments: ['XAUUSD'] });
  const beforeEntitlements = await resolveUserEntitlements(user.id, repo);
  assert.equal(beforeEntitlements.plan, 'plus');

  const { transactionId: refundTxId } = await billing.refund({ transactionId });
  await confirmTransaction(repo, refundTxId);

  const afterEntitlements = await resolveUserEntitlements(user.id, repo);
  assert.equal(afterEntitlements.plan, 'free');
  const patterns = await repo.patterns.listByUser(user.id);
  assert.equal(patterns.length, 5); // nothing deleted

  // Idempotent - confirming the refund a second time doesn't do anything further (plan already free).
  const second = await confirmTransaction(repo, refundTxId);
  assert.equal(second.alreadyProcessed, true);
});

test('a fully refunded storage purchase immediately revokes the entitlement (files untouched, quota drops)', async () => {
  const repo = createMemoryRepo();
  const user = await repo.users.create({ displayName: 'Trader' });
  const billing = new ManualBillingProvider(repo);
  const { transactionId } = await billing.createStoragePurchase({ userId: user.id, productId: 'storage-25' });
  await confirmTransaction(repo, transactionId);
  const withAddOn = await resolveStorageQuotaBytes(repo, user.id);
  assert.equal(withAddOn, 104857600 + 25 * 1073741824);

  const { transactionId: refundTxId } = await billing.refund({ transactionId });
  await confirmTransaction(repo, refundTxId);
  const afterRefund = await resolveStorageQuotaBytes(repo, user.id);
  assert.equal(afterRefund, 104857600); // back to base only

  // The entitlement ROW still exists (not deleted) - just expired.
  const entitlements = await repo.storageEntitlements.listForUser(user.id);
  assert.equal(entitlements.length, 1);
  assert.equal(entitlements[0].status, 'expired');

  // Idempotent double-confirm of the same refund never re-revokes anything further.
  const second = await confirmTransaction(repo, refundTxId);
  assert.equal(second.alreadyProcessed, true);
});
