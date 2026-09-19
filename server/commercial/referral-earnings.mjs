// Referral earnings triggers. This module decides NOTHING about money - the pure rules (referral-rules.mjs, decideEarning /
// planReversal) and the locked, atomic persistence (repo.referralEarnings) do. Its job is to translate a confirmed payment,
// a refund or a settled AI call into the repository call, from server-authoritative facts only.
//
// A commission is created ONLY from:
//   * a payment that is `confirmed` (never pending / failed / an invoice / a checkout intent / a frontend callback),
//   * of a real, eligible type (subscription by default, storage_purchase if the program lists it - NEVER a wallet top-up),
//   * with a final amount actually paid > 0,
// and never from a click, a signup, or any trading/broker figure. Both entry points are idempotent by the payment's identity
// (source, transaction id), so a replayed confirmation, an admin reprocess and a retry can never double-earn.
import { computeAiMarginBase, recomputeCommissionAfterRefund, MICRO } from './referral-rules.mjs';
import { pricingOf } from './subscription-bonus.mjs';

const SOURCE_OF_TYPE = { subscription: 'subscription', storage_purchase: 'storage_purchase', wallet_topup: 'wallet_topup' };

function pricingFacts(transaction) {
  const pricing = (transaction.metadata && transaction.metadata.pricing) || {};
  return {
    taxMicroUsd: Number.isSafeInteger(pricing.taxMicroUsd) ? pricing.taxMicroUsd : 0,
    excludedMicroUsd: Number.isSafeInteger(pricing.excludedMicroUsd) ? pricing.excludedMicroUsd : 0
  };
}

// Called from confirmTransaction() AFTER the entitlement was activated. `transaction` is the CONFIRMED row.
export async function awardReferralForTransaction(repo, transaction) {
  if (!transaction || transaction.status !== 'confirmed') return { ok: false, reason: 'NOT_CONFIRMED' };
  const source = SOURCE_OF_TYPE[transaction.type];
  if (!source) return { ok: true, outcome: 'none', reason: 'NOT_A_PURCHASE' }; // e.g. a refund row
  const meta = transaction.metadata || {};
  return repo.referralEarnings.recordEarning({
    source, sourceEventId: transaction.id, paymentTransactionId: transaction.id, referredUserId: transaction.userId,
    planId: meta.planId || transaction.productId || null, productId: meta.productId || transaction.productId || null,
    finalAmountMicroUsd: transaction.amountMicroUsd, ...pricingFacts(transaction),
    walletBonusMicroUsd: transaction.type === 'subscription' ? (pricingOf(transaction).walletBonusMicroUsd || 0) : 0,
    confirmedAt: transaction.confirmedAt || new Date().toISOString()
  });
}

// Never lets a referral problem affect a real, already-confirmed payment. The earning is idempotent, so a failure here is
// recoverable: an admin reprocess (POST .../transactions/:id/reprocess) or the "unprocessed payments" report re-runs it.
export async function safeAwardReferral(repo, transaction) {
  try {
    return await awardReferralForTransaction(repo, transaction);
  } catch (error) {
    try { console.error('[referral] earning creation failed - the payment itself is unaffected, reprocess from Admin:', (error && (error.code || error.message)) || 'unknown'); } catch { /* ignore */ }
    return null;
  }
}

// Admin recovery: re-run the (idempotent) earning for one confirmed payment; refuses a payment that has since been refunded.
export async function reprocessReferralForTransaction(repo, transactionId) {
  const transaction = await repo.paymentTransactions.get(transactionId);
  if (!transaction) return { ok: false, reason: 'PAYMENT_TRANSACTION_NOT_FOUND' };
  if (transaction.status !== 'confirmed') return { ok: false, reason: 'NOT_CONFIRMED' };
  if (await repo.paymentTransactions.findRefundFor(transaction.id)) return { ok: false, reason: 'REFUNDED' };
  return awardReferralForTransaction(repo, transaction);
}

// Refund / chargeback / cancellation of an ORIGINAL payment. For a refund, the lot may keep what the commission would have
// been on the reduced base (a partial refund reverses only the increment; refunds are full-amount today, the maths is ready
// for partials). A chargeback / cancellation / admin void always removes the whole commission.
export async function reverseReferralForTransaction(repo, original, { reason, triggerRef }) {
  const source = SOURCE_OF_TYPE[original.type];
  if (!source || source === 'wallet_topup') return { ok: true, reversed: false, reason: 'NOT_EARNING_SOURCE' };
  let commissionAfterMicroUsd = 0;
  if (reason === 'refund') {
    const lot = await repo.referralEarnings.getLotBySource(source, original.id);
    if (!lot) return { ok: true, reversed: false, reason: 'NO_LOT' };
    const refunds = (await repo.paymentTransactions.listForUser(original.userId, { limit: 500 }))
      .filter((t) => t.type === 'refund' && t.status === 'confirmed' && t.metadata && t.metadata.originalTransactionId === original.id);
    const refundedMicroUsd = refunds.reduce((sum, t) => sum + t.amountMicroUsd, 0);
    commissionAfterMicroUsd = refundedMicroUsd >= original.amountMicroUsd
      ? 0
      : Math.min(lot.originalMicroUsd, recomputeCommissionAfterRefund({ originalBaseMicroUsd: lot.commissionableBaseMicroUsd, refundedMicroUsd, commissionBps: lot.commissionBps }));
  }
  return repo.referralEarnings.reverseEarning({ source, sourceEventId: original.id, trigger: reason, triggerRef, commissionAfterMicroUsd });
}
export async function safeReverseReferral(repo, original, args) {
  try {
    return await reverseReferralForTransaction(repo, original, args);
  } catch (error) {
    try { console.error('[referral] earning reversal failed - re-run from Admin (Referral -> Reversals):', (error && (error.code || error.message)) || 'unknown'); } catch { /* ignore */ }
    return null;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// AI gross-margin source (off unless a published program version lists 'ai_margin'). Called after a SETTLED AI call. The base
// is the settled gross margin (retail charge - provider cost) scaled to the CASH-funded share only - never a wallet top-up,
// and promo / subscription-bonus / referral-conversion-funded spend earns nothing.
// ---------------------------------------------------------------------------------------------------------------------
const GATE_TTL_MS = 60 * 1000;
const GATE_MAX_ENTRIES = 5000;
const aiMarginGate = new Map();
export function __resetAiMarginGateForTests() { aiMarginGate.clear(); }

// One cached, indexed lookup per payer: a user with no active attribution (almost everyone) costs at most one query a minute
// and never reaches the earning code at all.
async function aiMarginEligible(repo, userId) {
  const hit = aiMarginGate.get(userId);
  if (hit && Date.now() - hit.at < GATE_TTL_MS) return hit.value;
  const attribution = await repo.referral.getAttributionByReferred(userId);
  const value = Boolean(attribution && attribution.status === 'active' && attribution.rulesSnapshot && attribution.rulesSnapshot.eligibleSources.includes('ai_margin'));
  if (aiMarginGate.size >= GATE_MAX_ENTRIES) aiMarginGate.clear();
  aiMarginGate.set(userId, { value, at: Date.now() });
  return value;
}

export async function awardReferralForAiSettlement(repo, settleResult) {
  if (!settleResult || !settleResult.ok || settleResult.alreadySettled || !settleResult.ledgerEntry) return { ok: true, outcome: 'none', reason: 'NOT_A_NEW_SETTLEMENT' };
  const entry = settleResult.ledgerEntry;
  if (!(await aiMarginEligible(repo, entry.userId))) return { ok: true, outcome: 'none', reason: 'NOT_ELIGIBLE' };
  const cash = Math.abs(entry.cashDeltaMicroUsd || 0);
  const promo = Math.abs(entry.promoDeltaMicroUsd || 0);
  const base = computeAiMarginBase({
    retailChargeMicroUsd: entry.retailChargeMicroUsd, providerCostMicroUsd: entry.providerCostMicroUsd, cashDeltaMicroUsd: cash, totalDeltaMicroUsd: cash + promo
  });
  return repo.referralEarnings.recordEarning({
    source: 'ai_margin', sourceEventId: entry.idempotencyKey || entry.id, paymentTransactionId: null, referredUserId: entry.userId,
    finalAmountMicroUsd: base, taxMicroUsd: 0, excludedMicroUsd: 0, walletBonusMicroUsd: 0, confirmedAt: entry.createdAt ? new Date(entry.createdAt).toISOString() : new Date().toISOString()
  });
}
export async function safeAwardReferralForAiSettlement(repo, settleResult) {
  try {
    return await awardReferralForAiSettlement(repo, settleResult);
  } catch (error) {
    try { console.error('[referral] AI-margin earning failed - the AI settlement itself is unaffected:', (error && (error.code || error.message)) || 'unknown'); } catch { /* ignore */ }
    return null;
  }
}
export { MICRO };
