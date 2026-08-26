// BillingProvider abstraction (spec section 13). Business services (routes, admin actions) call
// ONLY this interface - never a provider-specific SDK directly - so a future real
// StripeBillingProvider is a second implementation of these same six methods, not a rewrite of
// every caller. This file is the interface only; server/commercial/manual-billing-provider.mjs is
// the sole implementation this slice ships.
export class BillingProvider {
  // eslint-disable-next-line no-unused-vars
  async createWalletTopUp({ userId, amountUsd }) { throw new Error('NOT_IMPLEMENTED'); }
  // eslint-disable-next-line no-unused-vars
  async createSubscription({ userId, planId }) { throw new Error('NOT_IMPLEMENTED'); }
  // eslint-disable-next-line no-unused-vars
  async createStoragePurchase({ userId, productId }) { throw new Error('NOT_IMPLEMENTED'); }
  // eslint-disable-next-line no-unused-vars
  async cancelSubscription({ subscriptionId }) { throw new Error('NOT_IMPLEMENTED'); }
  // eslint-disable-next-line no-unused-vars
  async refund({ transactionId }) { throw new Error('NOT_IMPLEMENTED'); }
  // eslint-disable-next-line no-unused-vars
  async verifyWebhook(req) { throw new Error('NOT_IMPLEMENTED'); }
}
