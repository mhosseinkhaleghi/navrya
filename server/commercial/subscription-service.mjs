// Subscription lifecycle actions (spec section 2). No cron/background job anywhere in this
// codebase, and none is added here - "expire" is a real, explicit action an admin/future webhook
// can call, but entitlement resolution never actually WAITS for it (entitlement-resolver.mjs's
// repo.subscriptions.getActiveForUser() re-checks `current_period_end > now()` on every call, so
// a lapsed subscription stops conferring its plan the moment its period ends regardless of
// whether anything ever calls expireSubscription()). That function still exists so Admin has a
// real, auditable action to mark the record for reporting/history purposes.
import { ApiError } from '../community/errors.mjs';

// Called only from server/commercial/payment-service.mjs's confirmTransaction() for a confirmed
// 'subscription' transaction. Renews IN PLACE if the user already has an active subscription for
// the SAME plan (extends the period, refreshes the price to whatever THIS transaction snapshotted
// - never today's live config); otherwise creates a fresh row, so an upgrade/downgrade between
// plans keeps its own history rather than mutating a differently-priced row in place.
export async function activateOrRenewSubscription(repo, transaction) {
  const meta = transaction.metadata || {};
  const startedAt = new Date();
  const periodEnd = new Date(startedAt);
  if (meta.billingInterval === 'year') periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  else periodEnd.setMonth(periodEnd.getMonth() + 1);

  const existing = await repo.subscriptions.getActiveForUser(transaction.userId);
  if (existing && existing.planId === meta.planId) {
    return repo.subscriptions.update(existing.id, {
      status: 'active', currentPeriodStart: startedAt.toISOString(), currentPeriodEnd: periodEnd.toISOString(),
      cancelAtPeriodEnd: false, priceAmountMicroUsd: transaction.amountMicroUsd, currency: transaction.currency,
      paymentTransactionId: transaction.id
    });
  }
  return repo.subscriptions.create({
    userId: transaction.userId, planId: meta.planId, provider: transaction.provider, status: 'active',
    currentPeriodStart: startedAt.toISOString(), currentPeriodEnd: periodEnd.toISOString(),
    cancelAtPeriodEnd: false, priceAmountMicroUsd: transaction.amountMicroUsd, currency: transaction.currency,
    paymentTransactionId: transaction.id
  });
}

// spec section 23: remains active until currentPeriodEnd, never an immediate downgrade.
export async function cancelAtPeriodEnd(repo, subscriptionId) {
  return repo.subscriptions.update(subscriptionId, { cancelAtPeriodEnd: true });
}

export async function reactivateSubscription(repo, subscriptionId) {
  const subscription = await repo.subscriptions.get(subscriptionId);
  if (!subscription) throw new ApiError(404, 'SUBSCRIPTION_NOT_FOUND');
  if (new Date(subscription.currentPeriodEnd).getTime() <= Date.now()) throw new ApiError(400, 'SUBSCRIPTION_ALREADY_EXPIRED');
  return repo.subscriptions.update(subscriptionId, { cancelAtPeriodEnd: false, status: 'active' });
}

export async function recordPaymentFailure(repo, subscriptionId) {
  return repo.subscriptions.update(subscriptionId, { status: 'past_due' });
}

export async function expireSubscription(repo, subscriptionId) {
  return repo.subscriptions.update(subscriptionId, { status: 'expired', cancelAtPeriodEnd: false });
}

// Validation Gate (spec section 19) - the Manual/Test default refund policy: a fully refunded
// subscription purchase terminates that subscription's entitlement IMMEDIATELY (moving
// currentPeriodEnd to now, same read-time gate every other lapse already goes through - no new
// "revoked" concept). User content is never touched; the plan simply falls back through normal
// entitlement resolution (active subscription -> users.plan -> 'free') on the very next read.
export async function revokeSubscriptionForRefund(repo, subscriptionId) {
  return repo.subscriptions.update(subscriptionId, { status: 'expired', cancelAtPeriodEnd: false, currentPeriodEnd: new Date().toISOString() });
}
