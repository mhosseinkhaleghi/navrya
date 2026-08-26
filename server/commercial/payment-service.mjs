// The single choke point where a payment transaction actually grants something (spec section 14:
// "a commercial entitlement or Wallet credit activates only after confirmed payment state").
// Idempotent via payment_events (spec section 15) - a duplicate confirm (an admin double-click, a
// retried/replayed provider webhook once a real provider exists) is a safe no-op, never a double
// credit/entitlement.
import { ApiError } from '../community/errors.mjs';
import { activateOrRenewSubscription, revokeSubscriptionForRefund } from './subscription-service.mjs';

export async function confirmTransaction(repo, transactionId, { adminUserId } = {}) {
  const transaction = await repo.paymentTransactions.get(transactionId);
  if (!transaction) throw new ApiError(404, 'PAYMENT_TRANSACTION_NOT_FOUND');
  if (transaction.status !== 'pending') return { alreadyProcessed: true, transaction };

  // Synthesizes its own event id for the Manual/Test provider (a real Stripe webhook would carry
  // its own `evt_...` id here instead) - same idempotency guard either way, so this call site
  // never has to change when a real provider is added.
  const externalEventId = 'manual:' + transactionId + ':confirm';
  const { isNew } = await repo.paymentEvents.recordIfNew({ provider: transaction.provider, externalEventId, transactionId });
  if (!isNew) return { alreadyProcessed: true, transaction };

  const confirmed = await repo.paymentTransactions.setStatus(transactionId, 'confirmed', { confirmedAt: new Date().toISOString() });

  if (transaction.type === 'wallet_topup') {
    await repo.wallet.grant(transaction.userId, {
      type: 'TOP_UP', cashDeltaMicroUsd: transaction.amountMicroUsd, sourceAction: 'wallet-topup',
      idempotencyKey: 'topup:' + transactionId, metadata: { transactionId }
    });
  } else if (transaction.type === 'subscription') {
    await activateOrRenewSubscription(repo, transaction);
  } else if (transaction.type === 'storage_purchase') {
    const meta = transaction.metadata || {};
    const expiresAt = new Date(Date.now() + meta.validityDays * 24 * 60 * 60 * 1000);
    await repo.storageEntitlements.create({
      userId: transaction.userId, productId: meta.productId, capacityBytesSnapshot: meta.capacityBytes,
      pricePaidSnapshotMicroUsd: meta.priceAmountMicroUsd, currency: transaction.currency,
      validityDaysSnapshot: meta.validityDays, expiresAt: expiresAt.toISOString(), paymentTransactionId: transactionId
    });
  } else if (transaction.type === 'refund') {
    const original = transaction.metadata && transaction.metadata.originalTransactionId
      ? await repo.paymentTransactions.get(transaction.metadata.originalTransactionId) : null;
    // Validation Gate (spec section 19/20) - every original transaction type now has a real,
    // deterministic reversal. wallet_topup debits the wallet back; subscription/storage_purchase
    // immediately revoke the entitlement THIS transaction produced (found via the
    // payment_transaction_id link each one records) - files/user content are never touched.
    if (original && original.type === 'wallet_topup') {
      await repo.wallet.grant(transaction.userId, {
        type: 'ADMIN_DEBIT', cashDeltaMicroUsd: -transaction.amountMicroUsd, adminUserId: adminUserId || null,
        sourceAction: 'refund', idempotencyKey: 'refund:' + transactionId, metadata: { transactionId }
      });
    } else if (original && original.type === 'subscription') {
      const subscription = await repo.subscriptions.getByPaymentTransactionId(original.id);
      if (subscription) await revokeSubscriptionForRefund(repo, subscription.id);
    } else if (original && original.type === 'storage_purchase') {
      const entitlement = await repo.storageEntitlements.getByPaymentTransactionId(original.id);
      if (entitlement) await repo.storageEntitlements.revoke(entitlement.id);
    }
  }

  return { alreadyProcessed: false, transaction: confirmed };
}

export async function failTransaction(repo, transactionId) {
  const transaction = await repo.paymentTransactions.get(transactionId);
  if (!transaction) throw new ApiError(404, 'PAYMENT_TRANSACTION_NOT_FOUND');
  if (transaction.status !== 'pending') return { alreadyProcessed: true, transaction };
  const failed = await repo.paymentTransactions.setStatus(transactionId, 'failed', {});
  return { alreadyProcessed: false, transaction: failed };
}
