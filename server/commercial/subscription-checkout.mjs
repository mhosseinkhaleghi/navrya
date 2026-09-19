// Server-authoritative subscription checkout, shared by BOTH billing providers (Manual and BSC) so a discounted
// purchase is priced, reserved, snapshotted and settled by exactly one implementation.
//
//   quoteSubscription()             read-only, PROVISIONAL preview of a customer-TYPED code. Reserves nothing.
//   listAutomaticOffers()           read-only: the AUTOMATIC discounts (no code) this customer can use right now, per plan, with
//                                   server-computed amounts - what the plan cards strike the price with.
//   prepareSubscriptionCheckout()   the authoritative step: re-validates the typed code OR the automatic discount (claimed by
//                                   its opaque id) and re-computes every amount from server state, and atomically RESERVES
//                                   the slot (repo.discountRedemptions).
//   createSubscriptionTransaction() creates the payment_transactions row at the FINAL amount (which is what both the
//                                   BSC invoice and a refund are derived from), attaches the reservation, and - only
//                                   for a code-produced $0 price - settles it through the existing choke point.
//
// Nothing here trusts a client-supplied price: the only request inputs are planId and either the code text or the id of an
// automatic discount the customer was shown. If that discount is no longer valid the checkout is REFUSED - it never silently
// falls back to charging the full price the customer did not agree to.
import { ApiError } from '../community/errors.mjs';
import { getPlanConfig } from './commercial-config.mjs';
import { toMicroUsd } from './wallet-service.mjs';
import { PAID_PLAN_NAMES } from './commercial-defaults.mjs';
import { normalizeDiscountCode, computeDiscount, codeAppliesToPlan, customerFacingPricing } from './discount-codes.mjs';
import { confirmTransaction, failTransaction } from './payment-service.mjs';

export function requirePaidPlan(planId) {
  if (!PAID_PLAN_NAMES.includes(planId)) throw new ApiError(400, 'VALIDATION_FAILED');
}

// Every commercial number a checkout needs, read once from the effective config at this moment.
async function readPlanSnapshot(repo, planId) {
  const plan = await getPlanConfig(repo, planId);
  return {
    priceAmountUsd: plan.price.amountUsd, billingInterval: plan.price.billingInterval,
    originalAmountMicroUsd: toMicroUsd(plan.price.amountUsd), planWalletBonusMicroUsd: toMicroUsd(plan.walletBonusUsd || 0)
  };
}

// A purchase whose final payable amount is zero earns no wallet bonus (approved rule), so the snapshot says 0.
const effectiveBonus = (planWalletBonusMicroUsd, finalAmountMicroUsd) => (finalAmountMicroUsd > 0 ? planWalletBonusMicroUsd : 0);

export async function quoteSubscription(repo, { userId, planId, code }) {
  requirePaidPlan(planId);
  const normalized = normalizeDiscountCode(code);
  if (!normalized) throw new ApiError(400, 'VALIDATION_FAILED');
  const snapshot = await readPlanSnapshot(repo, planId);
  const record = await repo.discountCodes.getByCode(normalized);
  // An automatic discount has no customer-typed code: its internal identifier answers exactly like an unknown code.
  if (!record || record.applicationMode === 'automatic') throw new ApiError(404, 'DISCOUNT_CODE_INVALID');
  await repo.discountRedemptions.check({ codeId: record.id, userId, planId }); // throws the exact reason a code cannot be used
  const { discountAmountMicroUsd, finalAmountMicroUsd } = computeDiscount({
    originalAmountMicroUsd: snapshot.originalAmountMicroUsd, discountType: record.discountType, discountValue: record.discountValue
  });
  // codeId/expiresAt/maxRedemptions/remaining: the checkout urgency UI's countdown-to-expiry and live-remaining-
  // capacity display. The client polls GET .../discount-codes/:codeId/status for the live figures - never this
  // rate-limited quote endpoint - so codeId is the one thing it needs to remember from here.
  const stats = await repo.discountCodes.stats(record.id);
  return {
    provisional: true, planId, codeId: record.id, code: record.code, campaignName: record.campaignName, discountType: record.discountType, currency: 'USD',
    originalAmountMicroUsd: snapshot.originalAmountMicroUsd, discountAmountMicroUsd, finalAmountMicroUsd,
    walletBonusMicroUsd: effectiveBonus(snapshot.planWalletBonusMicroUsd, finalAmountMicroUsd), noCost: finalAmountMicroUsd === 0,
    expiresAt: record.expiresAt, maxRedemptions: record.maxRedemptions, remaining: stats.remaining
  };
}

// `holdMinutes` is how long a reserved slot is held while the payment is outstanding (provider-specific).
export async function prepareSubscriptionCheckout(repo, { userId, planId, discountCode, automaticDiscountId, holdMinutes }) {
  requirePaidPlan(planId);
  const typed = discountCode !== undefined && discountCode !== null;
  const automatic = automaticDiscountId !== undefined && automaticDiscountId !== null;
  if (typed && automatic) throw new ApiError(400, 'VALIDATION_FAILED'); // one discount per purchase - the client never sends both
  const snapshot = await readPlanSnapshot(repo, planId);
  let record = null;
  if (typed) {
    const normalized = normalizeDiscountCode(discountCode);
    if (!normalized) throw new ApiError(400, 'VALIDATION_FAILED');
    record = await repo.discountCodes.getByCode(normalized);
    if (!record || record.applicationMode === 'automatic') throw new ApiError(404, 'DISCOUNT_CODE_INVALID');
  } else if (automatic) {
    if (typeof automaticDiscountId !== 'string' || !automaticDiscountId) throw new ApiError(400, 'VALIDATION_FAILED');
    record = await repo.discountCodes.get(automaticDiscountId);
    // Only an AUTOMATIC discount can be claimed by id: a typed-code discount is reachable solely through its code.
    if (!record || record.applicationMode !== 'automatic') throw new ApiError(404, 'DISCOUNT_CODE_INVALID');
  }
  let redemption = null;
  if (record) {
    // reserve() enforces window, capacity, plan scope and one-redemption-per-user under the code's lock, and refuses loudly.
    redemption = await repo.discountRedemptions.reserve({
      codeId: record.id, userId, planId, originalAmountMicroUsd: snapshot.originalAmountMicroUsd,
      reservedUntil: new Date(Date.now() + holdMinutes * 60 * 1000).toISOString()
    });
  }
  const discountAmountMicroUsd = redemption ? redemption.discountAmountMicroUsd : 0;
  const finalAmountMicroUsd = redemption ? redemption.finalAmountMicroUsd : snapshot.originalAmountMicroUsd;
  const pricing = {
    originalAmountMicroUsd: snapshot.originalAmountMicroUsd, discountAmountMicroUsd, finalAmountMicroUsd,
    walletBonusMicroUsd: effectiveBonus(snapshot.planWalletBonusMicroUsd, finalAmountMicroUsd),
    discount: redemption ? {
      redemptionId: redemption.id, codeId: redemption.codeId, code: redemption.code, campaignName: redemption.campaignName,
      type: redemption.discountType, value: redemption.discountValue, automatic: record.applicationMode === 'automatic'
    } : null
  };
  return { pricing, redemption, priceAmountUsd: snapshot.priceAmountUsd, billingInterval: snapshot.billingInterval };
}

// The automatic discounts THIS customer can use right now: for every paid plan the single best offer (largest discount; ties go
// to the oldest discount - no stacking). Every candidate goes through the SAME availability check the checkout enforces, so an
// offer that is inactive, outside its window, used up, scoped to another plan, or already redeemed / held by this customer is
// simply not offered. The internal identifier never leaves the server; the customer gets the discount's opaque id.
export async function listAutomaticOffers(repo, { userId }) {
  const candidates = await repo.discountCodes.listAutomatic();
  const offers = {};
  if (!candidates.length) return offers;
  for (const planId of PAID_PLAN_NAMES) {
    const snapshot = await readPlanSnapshot(repo, planId);
    let best = null;
    for (const record of candidates) {
      if (!codeAppliesToPlan(record, planId)) continue;
      try {
        await repo.discountRedemptions.check({ codeId: record.id, userId, planId });
      } catch (error) {
        if (error instanceof ApiError) continue; // not usable by this customer right now
        throw error;
      }
      const { discountAmountMicroUsd, finalAmountMicroUsd } = computeDiscount({
        originalAmountMicroUsd: snapshot.originalAmountMicroUsd, discountType: record.discountType, discountValue: record.discountValue
      });
      if (discountAmountMicroUsd > 0 && (!best || discountAmountMicroUsd > best.discountAmountMicroUsd)) best = { record, discountAmountMicroUsd, finalAmountMicroUsd };
    }
    if (!best) continue;
    const stats = await repo.discountCodes.stats(best.record.id);
    offers[planId] = {
      automatic: true, planId, codeId: best.record.id, campaignName: best.record.campaignName, discountType: best.record.discountType, currency: 'USD',
      originalAmountMicroUsd: snapshot.originalAmountMicroUsd, discountAmountMicroUsd: best.discountAmountMicroUsd, finalAmountMicroUsd: best.finalAmountMicroUsd,
      walletBonusMicroUsd: effectiveBonus(snapshot.planWalletBonusMicroUsd, best.finalAmountMicroUsd), noCost: best.finalAmountMicroUsd === 0,
      expiresAt: best.record.expiresAt, maxRedemptions: best.record.maxRedemptions, remaining: stats.remaining
    };
  }
  return offers;
}

// `createInvoice(transaction)` is the provider's own payment rail (BSC: a crypto invoice); null for Manual.
export async function createSubscriptionTransaction(repo, { checkout, userId, planId, provider, externalTransactionId, createInvoice }) {
  const { pricing, redemption, priceAmountUsd, billingInterval } = checkout;
  let transaction;
  try {
    transaction = await repo.paymentTransactions.create({
      userId, type: 'subscription', provider, externalTransactionId, amountMicroUsd: pricing.finalAmountMicroUsd, currency: 'USD', productId: planId,
      metadata: { planId, priceAmountUsd, billingInterval, pricing }
    });
    if (redemption) await repo.discountRedemptions.attachTransaction(redemption.id, transaction.id);
  } catch (error) {
    if (redemption) await repo.discountRedemptions.releaseRedemption(redemption.id, 'checkout_failed').catch(() => {});
    throw error;
  }

  // A code that makes the plan free: there is nothing to invoice and nothing for a client to "pay", so it is settled
  // server-side through the SAME confirmation choke point every other purchase uses - never a client-side success.
  if (redemption && pricing.finalAmountMicroUsd === 0) {
    const settled = await confirmTransaction(repo, transaction.id, { adminUserId: null });
    return { transactionId: transaction.id, status: settled.transaction.status, noCost: true, pricing: customerFacingPricing(pricing) };
  }

  let invoice = null;
  try {
    if (createInvoice) invoice = await createInvoice(transaction);
  } catch (error) {
    // The payment rail failed AFTER the slot was reserved: give the slot back (and stop the orphan transaction) so
    // the user can simply retry instead of being blocked by their own dead checkout.
    if (redemption) await failTransaction(repo, transaction.id).catch(() => {});
    throw error;
  }
  return { transactionId: transaction.id, status: transaction.status, ...(invoice ? { invoiceId: invoice.id } : {}), pricing: customerFacingPricing(pricing) };
}
