// Pure rules of the subscription-bonus LOT accounting (065_subscription_bonus_lots.sql). No I/O: both repositories
// (repo.memory.mjs, repo.pg.mjs) import the same functions, so the two can only differ in HOW they lock and persist,
// never in what the numbers are. All money is integer micro-USD.
//
// Consumption order (deterministic, documented in ARCHITECTURE.md section 7.28): an AI charge is paid by promo first,
// as before. INSIDE the promo spend, the user's ACTIVE bonus lots are consumed first, oldest grant first (ties:
// insertion order); whatever promo remains is generic promo (signup / admin credit); anything beyond promo is paid.

export const grantKey = (transactionId) => 'subscription-bonus:' + transactionId;
export const reversalKey = (transactionId) => 'subscription-bonus-reversal:' + transactionId;

export const lotRemainingMicroUsd = (lot) => lot.originalMicroUsd - lot.consumedMicroUsd - lot.reversedMicroUsd;

// `lots` MUST already be in consumption order and carry { id, transactionId, remainingMicroUsd }.
// Returns [{ lotId, transactionId, amountMicroUsd }] - only lots that actually absorb something, amounts > 0.
export function allocateFifo(lots, amountMicroUsd) {
  if (!Number.isSafeInteger(amountMicroUsd) || amountMicroUsd < 0) throw new Error('allocateFifo needs a non-negative integer micro-USD amount');
  const allocations = [];
  let left = amountMicroUsd;
  for (const lot of lots) {
    if (left <= 0) break;
    const take = Math.min(left, lot.remainingMicroUsd);
    if (take > 0) {
      allocations.push({ lotId: lot.id, transactionId: lot.transactionId, amountMicroUsd: take });
      left -= take;
    }
  }
  return allocations;
}

export const sumAllocations = (allocations) => allocations.reduce((sum, allocation) => sum + allocation.amountMicroUsd, 0);

// The audit metadata of a refund reversal ledger entry. `reversedMicroUsd` is the lot's unspent remainder; when the
// bonus was already fully consumed it is 0 and the entry is a zero-amount, fully-consumed record.
export function reversalMetadata({ lotId, originalTransactionId, refundTransactionId, originalMicroUsd, consumedMicroUsd, reversedMicroUsd }) {
  return { originalTransactionId, refundTransactionId, lotId, originalMicroUsd, consumedMicroUsd, reversedMicroUsd, fullyConsumed: reversedMicroUsd === 0 };
}
