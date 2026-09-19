// The only BillingProvider implementation this slice ships (spec section 13/16). No live payment
// gateway - every "create*" call here just creates a real `payment_transactions` row in 'pending'
// status through the SAME server-side path a real provider's checkout-session creation would use
// (never a fake browser-only success, per spec section 13's explicit requirement). Nothing is
// entitled/credited until an admin (or, for a real provider, a verified webhook) confirms it via
// server/commercial/payment-service.mjs's confirmTransaction().
import { newId } from '../db/id.mjs';
import { ApiError } from '../community/errors.mjs';
import { BillingProvider } from './billing-provider.mjs';
import { getWalletRules } from './commercial-config.mjs';
import { toMicroUsd } from './wallet-service.mjs';
import { PAID_PLAN_NAMES } from './commercial-defaults.mjs';
import { MANUAL_CHECKOUT_HOLD_MINUTES } from './commercial-defaults.mjs';
import { prepareSubscriptionCheckout, createSubscriptionTransaction } from './subscription-checkout.mjs';

export class ManualBillingProvider extends BillingProvider {
  constructor(repo) {
    super();
    this.repo = repo;
  }

  async createWalletTopUp({ userId, amountUsd }) {
    const walletRules = await getWalletRules(this.repo);
    if (!Number.isFinite(amountUsd) || amountUsd < walletRules.minimumTopUpUsd) {
      throw new ApiError(400, 'WALLET_TOPUP_BELOW_MINIMUM', null, { minimumTopUpUsd: walletRules.minimumTopUpUsd });
    }
    const transaction = await this.repo.paymentTransactions.create({
      userId, type: 'wallet_topup', provider: 'manual', externalTransactionId: newId('manualTx'),
      amountMicroUsd: toMicroUsd(amountUsd), currency: 'USD', metadata: { amountUsd }
    });
    return { transactionId: transaction.id, status: transaction.status };
  }

  // Snapshots the plan's CURRENT price, the optional discount code's terms and the plan's wallet bonus into the
  // transaction's metadata right now - confirming this transaction later never re-reads live commercial config
  // (spec section 2's price-snapshot requirement). The transaction is created at the FINAL (discounted) amount, and
  // a discount code's slot is reserved for MANUAL_CHECKOUT_HOLD_MINUTES while the admin confirmation is
  // outstanding. See subscription-checkout.mjs (shared with the BSC provider).
  async createSubscription({ userId, planId, discountCode }) {
    if (!PAID_PLAN_NAMES.includes(planId)) throw new ApiError(400, 'VALIDATION_FAILED');
    const checkout = await prepareSubscriptionCheckout(this.repo, { userId, planId, discountCode, holdMinutes: MANUAL_CHECKOUT_HOLD_MINUTES });
    return createSubscriptionTransaction(this.repo, {
      checkout, userId, planId, provider: 'manual', externalTransactionId: newId('manualTx'), createInvoice: null
    });
  }

  // Snapshots the storage product's CURRENT capacity/price/validity - same reasoning as above,
  // applied to spec section 7's "existing purchase unaffected by a later product edit".
  async createStoragePurchase({ userId, productId }) {
    const product = await this.repo.storageProducts.get(productId);
    if (!product || !product.enabled) throw new ApiError(404, 'STORAGE_PRODUCT_NOT_FOUND');
    const transaction = await this.repo.paymentTransactions.create({
      userId, type: 'storage_purchase', provider: 'manual', externalTransactionId: newId('manualTx'),
      amountMicroUsd: product.priceAmountMicroUsd, currency: product.currency, productId: product.id,
      metadata: { productId: product.id, capacityBytes: product.capacityBytes, priceAmountMicroUsd: product.priceAmountMicroUsd, validityDays: product.validityDays }
    });
    return { transactionId: transaction.id, status: transaction.status };
  }

  // No real gateway to notify for a manual provider - the actual state transition
  // (cancelAtPeriodEnd / status) happens directly against the repo in
  // server/commercial/subscription-service.mjs. This method exists so a real
  // StripeBillingProvider's cancellation call has the same call site to replace.
  // eslint-disable-next-line no-unused-vars
  async cancelSubscription({ subscriptionId }) {
    return { ok: true };
  }

  // Refunds are always full - this interface has no notion of a partial amount (spec section 22:
  // "if partial refunds are not currently supported, fail explicitly"). Passing an `amountUsd`
  // that doesn't match the original transaction's full amount is rejected outright rather than
  // silently refunding the full amount anyway. On confirmation
  // (server/commercial/payment-service.mjs), a 'wallet_topup' original is reversed automatically;
  // a 'subscription'/'storage_purchase' original has its entitlement revoked immediately (spec
  // section 19/20's Manual/Test default policy) - see that module's own comment.
  async refund({ transactionId, amountUsd }) {
    const original = await this.repo.paymentTransactions.get(transactionId);
    if (!original) throw new ApiError(404, 'PAYMENT_TRANSACTION_NOT_FOUND');
    if (original.status !== 'confirmed') throw new ApiError(400, 'ONLY_CONFIRMED_TRANSACTIONS_CAN_BE_REFUNDED');
    if (amountUsd !== undefined && Math.round(Number(amountUsd) * 1000000) !== original.amountMicroUsd) {
      throw new ApiError(400, 'PARTIAL_REFUND_NOT_SUPPORTED');
    }
    // Idempotency at the REQUEST layer (spec section 21) - a second refund() call for the same
    // original transaction is rejected outright, before it could ever create a second pending
    // refund transaction that might later be independently confirmed and double-reverse things.
    const existingRefund = await this.repo.paymentTransactions.findRefundFor(transactionId);
    if (existingRefund) throw new ApiError(409, 'ALREADY_REFUNDED', null, { refundTransactionId: existingRefund.id });
    const refundTransaction = await this.repo.paymentTransactions.create({
      userId: original.userId, type: 'refund', provider: 'manual', externalTransactionId: newId('manualTx'),
      amountMicroUsd: original.amountMicroUsd, currency: original.currency, productId: original.productId,
      metadata: { originalTransactionId: transactionId, originalType: original.type }
    });
    return { transactionId: refundTransaction.id, status: refundTransaction.status };
  }

  // A manual/test provider has no real webhook source to verify a signature against - this
  // exists purely so a future StripeBillingProvider's real signature-verification logic has an
  // identical call site to implement, with zero caller changes.
  // eslint-disable-next-line no-unused-vars
  async verifyWebhook(req) {
    throw new ApiError(501, 'WEBHOOK_NOT_SUPPORTED');
  }
}
