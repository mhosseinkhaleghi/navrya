import express from 'express';
import { asyncHandler, ApiError } from './errors.mjs';
import { getBillingProvider } from '../commercial/billing-provider-factory.mjs';
import { cancelAtPeriodEnd, reactivateSubscription } from '../commercial/subscription-service.mjs';
import { resolveUserEntitlements } from '../commercial/entitlement-resolver.mjs';
import { getEffectiveCommercialConfig } from '../commercial/commercial-config.mjs';
import { quoteSubscription } from '../commercial/subscription-checkout.mjs';
import { rateLimit } from './security/rate-limit.mjs';

// Commercial System Slice 2 - the user-facing Subscription surface (spec section 21/22/23).
// Mounted at /api/sync/subscriptions, same requireAuth()+csrfProtection() chain as every other
// /api/sync/* route. POST /upgrade-request grants nothing itself - it only creates a pending
// payment_transactions row through the BillingProvider abstraction (spec section 22: "Do NOT
// immediately unlock feature before confirmed server-side payment"); the plan only actually
// changes once an admin confirms it (server/commercial/payment-service.mjs), at which point
// server/commercial/entitlement-resolver.mjs picks it up automatically on the next read.
//
// Discount codes: the client sends ONLY { planId, code } (quote) or { planId, discountCode } (checkout). Every
// amount is computed by the server (server/commercial/subscription-checkout.mjs); a quote is provisional and the
// authoritative validation + calculation runs again when the transaction is really created.

// Code guessing is throttled per user with ONE shared budget across quote and checkout-with-a-code (20 attempts
// per 10 minutes); buying without a code is never counted, so it can never be blocked by it.
const codeAttemptLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, max: 20, keyFn: (req) => 'discount-code:' + req.currentUser.id, message: 'RATE_LIMITED'
});
const hasDiscountCode = (body) => Boolean(body) && body.discountCode !== undefined && body.discountCode !== null && body.discountCode !== '';

export function router(repo) {
  const app = express.Router();

  app.get('/', asyncHandler(async (req, res) => {
    const [entitlements, subscription] = await Promise.all([
      resolveUserEntitlements(req.currentUser.id, repo),
      repo.subscriptions.getActiveForUser(req.currentUser.id)
    ]);
    res.json({ plan: entitlements.plan, subscription });
  }));

  // Real plan-comparison UI addition - exposes the SAME effective config (defaults merged with
  // any admin override) the entitlement resolver itself reads, so displayed prices/limits can
  // never drift from what a purchase actually snapshots. No commercial number is hard-coded
  // client-side; overridesByKey is intentionally omitted (admin-internal bookkeeping only).
  // Each plan carries its admin-set walletBonusUsd so the bonus is visible before purchase.
  app.get('/catalog', asyncHandler(async (req, res) => {
    const config = await getEffectiveCommercialConfig(repo);
    res.json({ plans: config.plans });
  }));

  app.post('/quote', codeAttemptLimiter, asyncHandler(async (req, res) => {
    const { planId, code } = req.body || {};
    res.json(await quoteSubscription(repo, { userId: req.currentUser.id, planId, code }));
  }));

  app.post(
    '/upgrade-request',
    (req, res, next) => (hasDiscountCode(req.body) ? codeAttemptLimiter(req, res, next) : next()),
    asyncHandler(async (req, res) => {
      const body = req.body || {};
      const withCode = hasDiscountCode(body);
      if (withCode && typeof body.discountCode !== 'string') throw new ApiError(400, 'VALIDATION_FAILED');
      const billingProvider = await getBillingProvider(repo);
      const result = await billingProvider.createSubscription({
        userId: req.currentUser.id, planId: body.planId, discountCode: withCode ? body.discountCode : undefined
      });
      res.status(201).json(result);
    })
  );

  app.post('/:id/cancel', asyncHandler(async (req, res) => {
    const subscription = await repo.subscriptions.get(req.params.id);
    if (!subscription || subscription.userId !== req.currentUser.id) throw new ApiError(404, 'SUBSCRIPTION_NOT_FOUND');
    const billingProvider = await getBillingProvider(repo);
    await billingProvider.cancelSubscription({ subscriptionId: subscription.id });
    res.json(await cancelAtPeriodEnd(repo, subscription.id));
  }));

  app.post('/:id/reactivate', asyncHandler(async (req, res) => {
    const subscription = await repo.subscriptions.get(req.params.id);
    if (!subscription || subscription.userId !== req.currentUser.id) throw new ApiError(404, 'SUBSCRIPTION_NOT_FOUND');
    res.json(await reactivateSubscription(repo, subscription.id));
  }));

  return app;
}
