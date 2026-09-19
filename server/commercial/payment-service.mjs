// The single choke point where a payment transaction actually grants something (spec section 14:
// "a commercial entitlement or Wallet credit activates only after confirmed payment state").
// Idempotent via payment_events (spec section 15) - a duplicate confirm (an admin double-click, a
// retried/replayed provider webhook once a real provider exists) is a safe no-op, never a double
// credit/entitlement.
import { ApiError } from '../community/errors.mjs';
import { activateOrRenewSubscription, revokeSubscriptionForRefund } from './subscription-service.mjs';
import { grantSubscriptionBonus, reverseSubscriptionBonus, pricingOf, lostDiscountKey } from './subscription-bonus.mjs';

export async function confirmTransaction(repo, transactionId, { adminUserId } = {}) {
  const transaction = await repo.paymentTransactions.get(transactionId);
  if (!transaction) throw new ApiError(404, 'PAYMENT_TRANSACTION_NOT_FOUND');
  if (transaction.status !== 'pending') return { alreadyProcessed: true, transaction };

  // A discounted subscription only activates at its discounted price if its code redemption can be CONFIRMED
  // (idempotent). A hold that lapsed is re-claimed when its slot is still free; if the slot was reused (or the
  // reservation is gone) the strict rule applies and the subscription is NOT activated - see settleLostDiscount().
  // This runs before the payment_events guard so a retry after a transient failure is never stranded.
  if (transaction.type === 'subscription' && pricingOf(transaction).discount) {
    const claim = await repo.discountRedemptions.confirmForTransaction(transactionId);
    if (!claim.ok) return settleLostDiscount(repo, transaction);
  }

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
    // Wallet bonus: from the checkout snapshot, exactly once (transaction-derived ledger key), and only when the
    // confirmed final payable amount is greater than zero - see subscription-bonus.mjs.
    await grantSubscriptionBonus(repo, transaction);
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
      // The wallet bonus this purchase granted is taken back too (idempotent reversing entry), and the code
      // redemption is only annotated - a refund never returns the slot or the user's one redemption.
      await reverseSubscriptionBonus(repo, original, transaction, adminUserId);
      await repo.discountRedemptions.markRefundedForTransaction(original.id);
    } else if (original && original.type === 'storage_purchase') {
      const entitlement = await repo.storageEntitlements.getByPaymentTransactionId(original.id);
      if (entitlement) await repo.storageEntitlements.revoke(entitlement.id);
    }
  }

  return { alreadyProcessed: false, transaction: confirmed };
}

// STRICT LATE-PAYMENT RULE (approved): a verified payment arrived for a discounted checkout whose limited-code
// slot was lost (the hold lapsed AND the slot was reused, or the reservation no longer exists). The subscription
// is NOT activated and the cap is never exceeded; the money that arrived is credited to the user's PAID wallet
// instead (TOP_UP, sourceAction 'discount-capacity-lost') exactly once, and the transaction is failed so the
// outcome is visible to admin and customer. Ordered credit -> release -> fail so a crash part-way converges on
// retry (the ledger key makes the credit idempotent; a still-pending transaction simply re-enters this path).
async function settleLostDiscount(repo, transaction) {
  const creditedMicroUsd = transaction.amountMicroUsd;
  if (creditedMicroUsd > 0) {
    await repo.wallet.grant(transaction.userId, {
      type: 'TOP_UP', cashDeltaMicroUsd: creditedMicroUsd, sourceAction: 'discount-capacity-lost',
      idempotencyKey: lostDiscountKey(transaction.id),
      metadata: { transactionId: transaction.id, redemptionId: pricingOf(transaction).discount.redemptionId }
    });
  }
  await repo.discountRedemptions.releaseForTransaction(transaction.id, 'capacity_lost');
  const failed = await repo.paymentTransactions.setStatus(transaction.id, 'failed', {});
  return { alreadyProcessed: false, transaction: failed, discountLost: true, creditedMicroUsd };
}

export async function failTransaction(repo, transactionId) {
  const transaction = await repo.paymentTransactions.get(transactionId);
  if (!transaction) throw new ApiError(404, 'PAYMENT_TRANSACTION_NOT_FOUND');
  if (transaction.status !== 'pending') return { alreadyProcessed: true, transaction };
  const failed = await repo.paymentTransactions.setStatus(transactionId, 'failed', {});
  // A failed checkout gives its discount-code slot back (a no-op for a purchase that holds none).
  await repo.discountRedemptions.releaseForTransaction(transactionId, 'transaction_failed');
  return { alreadyProcessed: false, transaction: failed };
}
