import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { ManualBillingProvider } from '../server/commercial/manual-billing-provider.mjs';
import { confirmTransaction, failTransaction } from '../server/commercial/payment-service.mjs';
import { invalidateCommercialConfigCache } from '../server/commercial/commercial-config.mjs';
import { resolveUserEntitlements } from '../server/commercial/entitlement-resolver.mjs';

// commercial-config.mjs's effective-config cache is process-wide, not per-repo - see
// wallet-service.test.mjs's identical beforeEach for the full reasoning.
beforeEach(() => invalidateCommercialConfigCache());

test('a pending transaction grants nothing', async () => {
  const repo = createMemoryRepo();
  const user = await repo.users.create({ displayName: 'Trader' });
  const billing = new ManualBillingProvider(repo);
  await billing.createWalletTopUp({ userId: user.id, amountUsd: 30 });
  const account = await repo.wallet.getAccount(user.id);
  // Only the signup promo credit is present - the pending top-up has not touched the balance.
  assert.equal(account.paidBalanceMicroUsd, 0);
});

test('a confirmed Wallet top-up grants exactly once, and a duplicate confirmation never double-credits', async () => {
  const repo = createMemoryRepo();
  const user = await repo.users.create({ displayName: 'Trader' });
  const billing = new ManualBillingProvider(repo);
  const { transactionId } = await billing.createWalletTopUp({ userId: user.id, amountUsd: 30 });

  const first = await confirmTransaction(repo, transactionId);
  assert.equal(first.alreadyProcessed, false);
  const afterFirst = await repo.wallet.getAccount(user.id);
  assert.equal(afterFirst.paidBalanceMicroUsd, 30000000);

  const second = await confirmTransaction(repo, transactionId);
  assert.equal(second.alreadyProcessed, true);
  const afterSecond = await repo.wallet.getAccount(user.id);
  assert.equal(afterSecond.paidBalanceMicroUsd, 30000000); // unchanged - not double-credited

  const ledger = await repo.wallet.ledgerForUser(user.id);
  assert.equal(ledger.filter((entry) => entry.type === 'TOP_UP').length, 1);
});

test('a failed transaction grants nothing, and cannot later be confirmed', async () => {
  const repo = createMemoryRepo();
  const user = await repo.users.create({ displayName: 'Trader' });
  const billing = new ManualBillingProvider(repo);
  const { transactionId } = await billing.createWalletTopUp({ userId: user.id, amountUsd: 30 });
  const before = await repo.wallet.getAccount(user.id);

  await failTransaction(repo, transactionId);
  const after = await repo.wallet.getAccount(user.id);
  assert.deepEqual(before, after);

  const result = await confirmTransaction(repo, transactionId);
  assert.equal(result.alreadyProcessed, true); // status is no longer 'pending' - confirm is a no-op
  const afterConfirmAttempt = await repo.wallet.getAccount(user.id);
  assert.deepEqual(afterConfirmAttempt, after);
});

test('a confirmed subscription purchase activates the plan, and the price is snapshotted at request time', async () => {
  const repo = createMemoryRepo();
  const user = await repo.users.create({ displayName: 'Trader' });
  const billing = new ManualBillingProvider(repo);
  const { transactionId } = await billing.createSubscription({ userId: user.id, planId: 'plus' });

  // Admin changes the price AFTER the transaction was created but BEFORE it's confirmed - the
  // already-created transaction's snapshot must not move.
  await repo.commercialConfig.publish('plan:plus:price', { amountUsd: 9.99, billingInterval: 'month' }, {});
  invalidateCommercialConfigCache();

  await confirmTransaction(repo, transactionId);
  const entitlements = await resolveUserEntitlements(user.id, repo);
  assert.equal(entitlements.plan, 'plus');
  assert.equal(entitlements.limits.patterns, null); // unlimited

  const subscription = await repo.subscriptions.getActiveForUser(user.id);
  assert.equal(subscription.priceAmountMicroUsd, 4990000); // the ORIGINAL $4.99 default, not the later $9.99
});

test('a confirmed storage purchase grants a real storage entitlement', async () => {
  const repo = createMemoryRepo();
  const user = await repo.users.create({ displayName: 'Trader' });
  const products = await repo.storageProducts.list();
  const storage25 = products.find((p) => p.id === 'storage-25');
  const billing = new ManualBillingProvider(repo);
  const { transactionId } = await billing.createStoragePurchase({ userId: user.id, productId: storage25.id });

  await confirmTransaction(repo, transactionId);
  const entitlements = await repo.storageEntitlements.listForUser(user.id);
  assert.equal(entitlements.length, 1);
  assert.equal(entitlements[0].capacityBytesSnapshot, storage25.capacityBytes);
  assert.equal(entitlements[0].validityDaysSnapshot, 90);
});
