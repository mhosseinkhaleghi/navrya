import express from 'express';
import { asyncHandler } from './errors.mjs';
import { ManualBillingProvider } from '../commercial/manual-billing-provider.mjs';

// Commercial System Slice 1/2 - the user-facing AI Wallet (spec section 55/57). Mounted at
// /api/sync/wallet, same requireAuth()+csrfProtection() chain as every other /api/sync/* route.
// Balance still only ever changes via the signup promo grant, Admin credit/debit
// (server/admin/routes.commercial.mjs), AI settlement (routes.internal.mjs's wallet bridge), or -
// new in Slice 2 - a CONFIRMED top-up transaction. POST /topup-request itself grants nothing: it
// only creates a pending payment_transactions row through the BillingProvider abstraction;
// funds land only after an admin confirms it (server/commercial/payment-service.mjs).
export function router(repo) {
  const app = express.Router();
  const billingProvider = new ManualBillingProvider(repo);

  app.get('/', asyncHandler(async (req, res) => {
    const account = await repo.wallet.getAccount(req.currentUser.id);
    res.json({
      paidBalanceMicroUsd: account.paidBalanceMicroUsd,
      promoBalanceMicroUsd: account.promoBalanceMicroUsd,
      totalBalanceMicroUsd: account.paidBalanceMicroUsd + account.promoBalanceMicroUsd
    });
  }));

  app.get('/ledger', asyncHandler(async (req, res) => {
    res.json({ entries: await repo.wallet.ledgerForUser(req.currentUser.id, { limit: 50 }) });
  }));

  // Billing History (real UI addition) - every payment_transactions row for this user, whatever
  // its type (wallet_topup/subscription/storage_purchase/refund) or status. Reuses the existing
  // repo.paymentTransactions.listForUser() the admin surface already relies on; scoped to
  // req.currentUser.id here so a user can only ever see their own transactions.
  app.get('/transactions', asyncHandler(async (req, res) => {
    res.json({ transactions: await repo.paymentTransactions.listForUser(req.currentUser.id, { limit: 50 }) });
  }));

  app.post('/topup-request', asyncHandler(async (req, res) => {
    const amountUsd = Number((req.body || {}).amountUsd);
    const result = await billingProvider.createWalletTopUp({ userId: req.currentUser.id, amountUsd });
    res.status(201).json(result);
  }));

  return app;
}
