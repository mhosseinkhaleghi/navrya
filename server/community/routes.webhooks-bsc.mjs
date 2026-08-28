// Optional secondary confirmation path for a real BSC crypto invoice (task A.6) - a future
// external indexer/gateway posts here instead of the client's own "check now" poll
// (routes.wallet.mjs's POST /invoices/:invoiceId/check) triggering the same verification. Public
// route (no browser session - mounted before requireAuth/csrfProtection in app.mjs, the same
// precedent as /internal), verified entirely by its own HMAC signature over the RAW request body,
// never by a shared-secret header or session cookie. With no BSC_WEBHOOK_SECRET configured, every
// call is refused outright (BillingProvider.verifyWebhook() throws WEBHOOK_NOT_SUPPORTED) - never
// a silently-accepted, unverified payload (task A.8's "retain a safe manual/dev path").
import express from 'express';
import { asyncHandler, ApiError } from './errors.mjs';
import { getBillingProvider } from '../commercial/billing-provider-factory.mjs';
import { checkInvoicePayment, buildInvoiceDto } from '../commercial/crypto-invoice-service.mjs';

export function router(repo) {
  const app = express.Router();

  app.post('/bsc', asyncHandler(async (req, res) => {
    // req.rawBody/req.body are set by app.mjs's dedicated raw-body middleware for this one path
    // prefix - req.body is already reparsed JSON by the time this handler runs. Billing provider
    // is resolved per-request (never cached at router-construction time) so an admin toggling BSC
    // on/off takes effect on the very next webhook call, no restart required.
    const billingProvider = await getBillingProvider(repo);
    await billingProvider.verifyWebhook(req);
    const { invoiceId, txHash } = req.body || {};
    if (!invoiceId || !txHash) throw new ApiError(400, 'VALIDATION_FAILED');
    const result = await checkInvoicePayment(repo, invoiceId, { txHash });
    res.json({ ...result, invoice: await buildInvoiceDto(result.invoice, repo) });
  }));

  return app;
}
