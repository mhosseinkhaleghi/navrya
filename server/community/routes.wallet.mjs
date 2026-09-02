import express from 'express';
import { asyncHandler, ApiError } from './errors.mjs';
import { getBillingProvider } from '../commercial/billing-provider-factory.mjs';
import { buildInvoiceDto, checkInvoicePayment } from '../commercial/crypto-invoice-service.mjs';
import { getWalletRules } from '../commercial/commercial-config.mjs';

// Commercial System Slice 1/2 - the user-facing AI Wallet (spec section 55/57). Mounted at
// /api/sync/wallet, same requireAuth()+csrfProtection() chain as every other /api/sync/* route.
// Balance still only ever changes via the signup promo grant, Admin credit/debit
// (server/admin/routes.commercial.mjs), AI settlement (routes.internal.mjs's wallet bridge), or -
// new in Slice 2 - a CONFIRMED top-up transaction. POST /topup-request itself grants nothing: it
// only creates a pending payment_transactions row through the BillingProvider abstraction;
// funds land only after an admin confirms it (server/commercial/payment-service.mjs).
export function router(repo) {
  const app = express.Router();

  // minimumTopUpUsd is served ALONGSIDE the balance so the top-up UI can offer/validate amounts
  // against the real, admin-configured floor up front. Without it the client could only discover
  // the minimum by being rejected (400 WALLET_TOPUP_BELOW_MINIMUM) - which is exactly how the
  // wallet came to offer a $5 amount chip that the server then refused. It is the SAME
  // getWalletRules() value both billing providers enforce against, never a second source.
  app.get('/', asyncHandler(async (req, res) => {
    const [account, walletRules] = await Promise.all([
      repo.wallet.getAccount(req.currentUser.id),
      getWalletRules(repo)
    ]);
    res.json({
      paidBalanceMicroUsd: account.paidBalanceMicroUsd,
      promoBalanceMicroUsd: account.promoBalanceMicroUsd,
      totalBalanceMicroUsd: account.paidBalanceMicroUsd + account.promoBalanceMicroUsd,
      minimumTopUpUsd: walletRules.minimumTopUpUsd
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
    const billingProvider = await getBillingProvider(repo);
    const result = await billingProvider.createWalletTopUp({ userId: req.currentUser.id, amountUsd });
    res.status(201).json(result);
  }));

  // Real BSC crypto invoice surface (task A.5) - shared across wallet top-ups, subscription
  // upgrades, and storage purchases, since a crypto_invoices row is keyed by transaction_id, not
  // by purchase type. Ownership is checked via the invoice's OWN linked payment_transactions row
  // (crypto_invoices carries no user_id of its own) - never trusts a bare invoice id alone.
  async function loadOwnedInvoice(req) {
    const invoice = await repo.cryptoInvoices.get(req.params.invoiceId);
    if (!invoice) throw new ApiError(404, 'CRYPTO_INVOICE_NOT_FOUND');
    const transaction = await repo.paymentTransactions.get(invoice.transactionId);
    if (!transaction || transaction.userId !== req.currentUser.id) throw new ApiError(404, 'CRYPTO_INVOICE_NOT_FOUND');
    return invoice;
  }

  app.get('/invoices/:invoiceId', asyncHandler(async (req, res) => {
    const invoice = await loadOwnedInvoice(req);
    res.json(await buildInvoiceDto(invoice, repo));
  }));

  // Never trusts the browser to say a payment happened (task A.6) - this only ever triggers a
  // real server-side on-chain verification (server/commercial/crypto-invoice-service.mjs), which
  // itself only ever activates anything through the existing idempotent confirmTransaction().
  // txHash is required (task C's security fix) - checkInvoicePayment() itself rejects a missing
  // one (400 TX_HASH_REQUIRED) rather than falling back to scanning the shared deposit address.
  app.post('/invoices/:invoiceId/check', asyncHandler(async (req, res) => {
    await loadOwnedInvoice(req);
    const txHash = (req.body || {}).txHash;
    const result = await checkInvoicePayment(repo, req.params.invoiceId, { txHash });
    res.json({ ...result, invoice: await buildInvoiceDto(result.invoice, repo) });
  }));

  return app;
}
