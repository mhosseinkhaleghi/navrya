import express from 'express';
import { asyncHandler, ApiError } from './errors.mjs';
import { ManualBillingProvider } from '../commercial/manual-billing-provider.mjs';
import { cancelAtPeriodEnd, reactivateSubscription } from '../commercial/subscription-service.mjs';
import { resolveUserEntitlements } from '../commercial/entitlement-resolver.mjs';
import { getEffectiveCommercialConfig } from '../commercial/commercial-config.mjs';

// Commercial System Slice 2 - the user-facing Subscription surface (spec section 21/22/23).
// Mounted at /api/sync/subscriptions, same requireAuth()+csrfProtection() chain as every other
// /api/sync/* route. POST /upgrade-request grants nothing itself - it only creates a pending
// payment_transactions row through the BillingProvider abstraction (spec section 22: "Do NOT
// immediately unlock feature before confirmed server-side payment"); the plan only actually
// changes once an admin confirms it (server/commercial/payment-service.mjs), at which point
// server/commercial/entitlement-resolver.mjs picks it up automatically on the next read.
export function router(repo) {
  const app = express.Router();
  const billingProvider = new ManualBillingProvider(repo);

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
  app.get('/catalog', asyncHandler(async (req, res) => {
    const config = await getEffectiveCommercialConfig(repo);
    res.json({ plans: config.plans });
  }));

  app.post('/upgrade-request', asyncHandler(async (req, res) => {
    const planId = (req.body || {}).planId;
    const result = await billingProvider.createSubscription({ userId: req.currentUser.id, planId });
    res.status(201).json(result);
  }));

  app.post('/:id/cancel', asyncHandler(async (req, res) => {
    const subscription = await repo.subscriptions.get(req.params.id);
    if (!subscription || subscription.userId !== req.currentUser.id) throw new ApiError(404, 'SUBSCRIPTION_NOT_FOUND');
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
