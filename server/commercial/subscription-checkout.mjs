// Server-authoritative subscription checkout, shared by BOTH billing providers (Manual and BSC) so a discounted
// purchase is priced, reserved, snapshotted and settled by exactly one implementation.
//
//   quoteSubscription()             read-only, PROVISIONAL preview for the checkout review step. Reserves nothing.
//   prepareSubscriptionCheckout()   the authoritative step: re-validates the code and re-computes every amount from
//                                   server state, and atomically RESERVES the code slot (repo.discountRedemptions).
//   createSubscriptionTransaction() creates the payment_transactions row at the FINAL amount (which is what both the
//                                   BSC invoice and a refund are derived from), attaches the reservation, and - only
//                                   for a code-produced $0 price - settles it through the existing choke point.
//
// Nothing here trusts a client-supplied price: the only request inputs are planId and the code text.
import { ApiError } from '../community/errors.mjs';
import { getPlanConfig } from './commercial-config.mjs';
import { toMicroUsd } from './wallet-service.mjs';
import { PAID_PLAN_NAMES } from './commercial-defaults.mjs';
import { normalizeDiscountCode, computeDiscount } from './discount-codes.mjs';
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
  if (!record) throw new ApiError(404, 'DISCOUNT_CODE_INVALID');
  await repo.discountRedemptions.check({ codeId: record.id, userId }); // throws the exact reason a code cannot be used
  const { discountAmountMicroUsd, finalAmountMicroUsd } = computeDiscount({
    originalAmountMicroUsd: snapshot.originalAmountMicroUsd, discountType: record.discountType, discountValue: record.discountValue
  });
  return {
    provisional: true, planId, code: record.code, campaignName: record.campaignName, discountType: record.discountType, currency: 'USD',
    originalAmountMicroUsd: snapshot.originalAmountMicroUsd, discountAmountMicroUsd, finalAmountMicroUsd,
    walletBonusMicroUsd: effectiveBonus(snapshot.planWalletBonusMicroUsd, finalAmountMicroUsd), noCost: finalAmountMicroUsd === 0
  };
}

// `holdMinutes` is how long a reserved slot is held while the payment is outstanding (provider-specific).
export async function prepareSubscriptionCheckout(repo, { userId, planId, discountCode, holdMinutes }) {
  requirePaidPlan(planId);
  const snapshot = await readPlanSnapshot(repo, planId);
  let redemption = null;
  if (discountCode !== undefined && discountCode !== null) {
    const normalized = normalizeDiscountCode(discountCode);
    if (!normalized) throw new ApiError(400, 'VALIDATION_FAILED');
    const record = await repo.discountCodes.getByCode(normalized);
    if (!record) throw new ApiError(404, 'DISCOUNT_CODE_INVALID');
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
      type: redemption.discountType, value: redemption.discountValue
    } : null
  };
  return { pricing, redemption, priceAmountUsd: snapshot.priceAmountUsd, billingInterval: snapshot.billingInterval };
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
    return { transactionId: transaction.id, status: settled.transaction.status, noCost: true, pricing };
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
  return { transactionId: transaction.id, status: transaction.status, ...(invoice ? { invoiceId: invoice.id } : {}), pricing };
}
