// Subscription wallet bonus: grant, reversal, status derivation, DTO enrichment and the admin repair path. The bonus
// is credited to the PROMO balance through the existing wallet ledger, only after a CONFIRMED payment, exactly once
// (a transaction-derived ledger idempotency key), and always from the amount SNAPSHOTTED on the transaction at
// checkout (metadata.pricing.walletBonusMicroUsd) - never today's plan setting.
//
// LOT ACCOUNTING (065_subscription_bonus_lots.sql): the grant creates a LOT linked to the transaction and to its ledger
// grant, AI settlement consumes lots FIFO (recorded as immutable allocations), and a refund reverses ONLY the lot's
// unspent remainder - never the whole grant - so a bonus the user already spent on AI can no longer drive the promo
// balance negative. The grant, the settlement allocation and the reversal all run inside repo.subscriptionBonus /
// repo.wallet.settle(), under the wallet account lock; this module never computes a balance or a reversal amount.
//
// A purchase whose confirmed final payable amount is zero earns NO bonus (approved rule): the snapshot itself is
// written as 0 for a zero-price checkout, and bonusOwedMicroUsd() re-checks the amount at grant time.
import { ApiError } from '../community/errors.mjs';
import { grantKey, reversalKey } from './subscription-bonus-lots.mjs';

export { grantKey, reversalKey };
export const lostDiscountKey = (transactionId) => 'discount-lost:' + transactionId;

// The authoritative pricing snapshot of a subscription transaction. A row created before discount codes existed
// has none: it is presented as "original == what was charged, no discount, no bonus" and grants nothing.
export function pricingOf(transaction) {
  const stored = transaction.metadata && transaction.metadata.pricing;
  if (stored) return stored;
  return {
    originalAmountMicroUsd: transaction.amountMicroUsd, discountAmountMicroUsd: 0, finalAmountMicroUsd: transaction.amountMicroUsd,
    walletBonusMicroUsd: 0, discount: null
  };
}

export function bonusOwedMicroUsd(transaction) {
  if (transaction.type !== 'subscription') return 0;
  const bonus = pricingOf(transaction).walletBonusMicroUsd || 0;
  return transaction.amountMicroUsd > 0 && bonus > 0 ? bonus : 0;
}

// Called only from confirmTransaction() and the repair path. Safe to call twice: a lot already exists -> nothing is
// credited again. `refused: 'REFUNDED'` means a refund already exists for the purchase, so nothing was written.
export async function grantSubscriptionBonus(repo, transaction) {
  const amountMicroUsd = bonusOwedMicroUsd(transaction);
  if (!amountMicroUsd) return { granted: false, amountMicroUsd: 0 };
  const result = await repo.subscriptionBonus.grant({
    userId: transaction.userId, transactionId: transaction.id, amountMicroUsd,
    planId: (transaction.metadata && transaction.metadata.planId) || transaction.productId || null
  });
  return { granted: Boolean(result.granted), amountMicroUsd, ...(result.ok === false ? { refused: result.reason } : {}) };
}

// Refund policy: entitlement AND the UNSPENT part of the bonus are taken back. Which part that is gets decided inside the
// repository, under the account lock, from the lot itself: the whole bonus if AI never used it, the exact remainder if
// it partly did, and a zero-amount (fully consumed) reversal entry if it all did. A bonus that was never granted has no
// lot and is not "reversed" into a debit.
export async function reverseSubscriptionBonus(repo, original, refundTransaction, adminUserId) {
  const result = await repo.subscriptionBonus.reverseForRefund({
    transactionId: original.id, refundTransactionId: refundTransaction.id, adminUserId: adminUserId || null
  });
  return { reversed: Boolean(result.reversed), reversedMicroUsd: result.reversedMicroUsd || 0, fullyConsumed: Boolean(result.fullyConsumed) };
}

const NO_BONUS = { amountMicroUsd: 0, status: 'none', originalMicroUsd: 0, consumedMicroUsd: 0, remainingMicroUsd: 0, reversedMicroUsd: 0, lotId: null };

// original / consumed (by AI) / remaining / reversed (by a refund) come from the lot as stored; a bonus that is owed but
// has no lot yet (pending, or 'missing') shows the owed amount and nothing consumed. `amountMicroUsd` keeps its old
// meaning: the bonus the purchase carried.
function bonusFigures(status, owedMicroUsd, lot) {
  if (status === 'none') return { ...NO_BONUS };
  if (lot) {
    return {
      amountMicroUsd: lot.originalMicroUsd, status, originalMicroUsd: lot.originalMicroUsd, consumedMicroUsd: lot.consumedMicroUsd,
      remainingMicroUsd: lot.remainingMicroUsd, reversedMicroUsd: lot.reversedMicroUsd, lotId: lot.id
    };
  }
  return { ...NO_BONUS, amountMicroUsd: owedMicroUsd, status, originalMicroUsd: owedMicroUsd };
}

// One batched lookup for a whole list of transactions. Returns Map(transactionId -> { pricing, bonus, discountOutcome })
// for the subscription rows; the callers shape it for admin (bonusStatus + bonus) or customer (bonus).
//   bonus.status: 'none' | 'pending' | 'credited' | 'reversed' | 'missing'
//   'missing' = confirmed, bonus owed, no lot, not refunded (e.g. a crash between the status flip and the grant) -
//   recoverable through repairSubscriptionBonus().
export async function describeSubscriptionTransactions(repo, transactions) {
  const subscriptions = transactions.filter((transaction) => transaction.type === 'subscription');
  const lots = subscriptions.length ? await repo.subscriptionBonus.listByTransactionIds(subscriptions.map((transaction) => transaction.id)) : [];
  const lotByTransaction = new Map(lots.map((lot) => [lot.transactionId, lot]));
  const lostKeys = subscriptions.filter((transaction) => transaction.status === 'failed').map((transaction) => lostDiscountKey(transaction.id));
  const lostEntries = lostKeys.length ? await repo.wallet.ledgerEntriesByIdempotencyKeys(lostKeys) : [];
  const lostByKey = new Map(lostEntries.map((entry) => [entry.idempotencyKey, entry]));
  const described = new Map();
  for (const transaction of subscriptions) {
    const owedMicroUsd = bonusOwedMicroUsd(transaction);
    const lot = lotByTransaction.get(transaction.id) || null;
    let status = 'none';
    if (lot) status = lot.status === 'reversed' ? 'reversed' : 'credited';
    else if (owedMicroUsd > 0) {
      if (transaction.status === 'pending') status = 'pending';
      else if (transaction.status === 'confirmed') status = (await repo.paymentTransactions.findRefundFor(transaction.id)) ? 'none' : 'missing';
    }
    const lost = lostByKey.get(lostDiscountKey(transaction.id));
    described.set(transaction.id, {
      pricing: pricingOf(transaction),
      bonus: bonusFigures(status, owedMicroUsd, lot),
      discountOutcome: lost ? { reason: 'DISCOUNT_CAPACITY_LOST', creditedMicroUsd: lost.cashDeltaMicroUsd } : null
    });
  }
  return described;
}

export async function enrichTransactionsForAdmin(repo, transactions) {
  const described = await describeSubscriptionTransactions(repo, transactions);
  return transactions.map((transaction) => {
    const info = described.get(transaction.id);
    return info
      ? { ...transaction, pricing: info.pricing, bonusStatus: info.bonus.status, bonus: info.bonus, discountOutcome: info.discountOutcome }
      : { ...transaction, pricing: null, bonusStatus: 'none', bonus: { ...NO_BONUS }, discountOutcome: null };
  });
}

export async function enrichTransactionsForCustomer(repo, transactions) {
  const described = await describeSubscriptionTransactions(repo, transactions);
  return transactions.map((transaction) => {
    const info = described.get(transaction.id);
    return info
      ? { ...transaction, pricing: info.pricing, bonus: info.bonus, discountOutcome: info.discountOutcome }
      : { ...transaction, pricing: null, bonus: { ...NO_BONUS }, discountOutcome: null };
  });
}

// Ledger entries for the wallet-activity views (customer and admin): an AI settlement reports how much of it the
// subscription bonus covered (from the immutable allocation records), and a bonus / bonus-reversal entry reports the
// current state of its lot. Entries of every other type are returned untouched. Batched: two lookups per call.
export async function enrichLedgerEntries(repo, entries) {
  const isBonusEntry = (entry) => entry.type === 'SUBSCRIPTION_BONUS' || entry.type === 'SUBSCRIPTION_BONUS_REVERSAL';
  const bonusTransactionId = (entry) => entry.metadata && (entry.metadata.transactionId || entry.metadata.originalTransactionId);
  const settlementIds = entries.filter((entry) => entry.type === 'AI_SETTLEMENT').map((entry) => entry.id);
  const transactionIds = Array.from(new Set(entries.filter(isBonusEntry).map(bonusTransactionId).filter(Boolean)));
  const allocations = settlementIds.length ? await repo.subscriptionBonus.allocationsForLedgerIds(settlementIds) : [];
  const lots = transactionIds.length ? await repo.subscriptionBonus.listByTransactionIds(transactionIds) : [];
  const allocationsByLedger = new Map();
  allocations.forEach((allocation) => {
    if (!allocationsByLedger.has(allocation.ledgerId)) allocationsByLedger.set(allocation.ledgerId, []);
    allocationsByLedger.get(allocation.ledgerId).push({ lotId: allocation.lotId, transactionId: allocation.transactionId, amountMicroUsd: allocation.amountMicroUsd });
  });
  const lotByTransaction = new Map(lots.map((lot) => [lot.transactionId, lot]));
  return entries.map((entry) => {
    if (entry.type === 'AI_SETTLEMENT') {
      const own = allocationsByLedger.get(entry.id) || [];
      return { ...entry, subscriptionBonusUsedMicroUsd: own.reduce((sum, allocation) => sum + allocation.amountMicroUsd, 0), subscriptionBonusAllocations: own };
    }
    if (isBonusEntry(entry)) {
      const lot = lotByTransaction.get(bonusTransactionId(entry));
      return {
        ...entry,
        bonusLot: lot ? {
          lotId: lot.id, transactionId: lot.transactionId, status: lot.status, originalMicroUsd: lot.originalMicroUsd,
          consumedMicroUsd: lot.consumedMicroUsd, remainingMicroUsd: lot.remainingMicroUsd, reversedMicroUsd: lot.reversedMicroUsd
        } : null
      };
    }
    return entry;
  });
}

// Admin repair for bonusStatus 'missing'. Idempotent by construction: the repository creates the lot, the ledger grant
// and the balance credit in ONE atomic step keyed by the transaction, so a repair racing a replayed confirmation (or
// another repair) can never double-credit; a second call answers { repaired: false, alreadyGranted: true }. It is
// refused (409 REFUNDED) once a refund exists - checked here for a clear early answer and again atomically inside the
// repository, which closes the race with a refund confirmed at the same moment.
export async function repairSubscriptionBonus(repo, transactionId) {
  const transaction = await repo.paymentTransactions.get(transactionId);
  if (!transaction) throw new ApiError(404, 'PAYMENT_TRANSACTION_NOT_FOUND');
  const notApplicable = (reason) => new ApiError(409, 'BONUS_REPAIR_NOT_APPLICABLE', null, { reason });
  if (transaction.type !== 'subscription') throw notApplicable('NOT_SUBSCRIPTION');
  if (transaction.status !== 'confirmed') throw notApplicable('NOT_CONFIRMED');
  if (await repo.paymentTransactions.findRefundFor(transaction.id)) throw notApplicable('REFUNDED');
  const amountMicroUsd = bonusOwedMicroUsd(transaction);
  if (!amountMicroUsd) throw notApplicable('NO_BONUS');
  const { granted, refused } = await grantSubscriptionBonus(repo, transaction);
  if (refused === 'REFUNDED') throw notApplicable('REFUNDED');
  return { repaired: granted, alreadyGranted: !granted, bonusStatus: 'credited', transactionId, bonusMicroUsd: amountMicroUsd };
}
