// Single resolver every feature module asks instead of embedding plan/price knowledge itself
// (spec section 51/78: "No feature module should directly ask 'Is plan $4.99?' - it asks 'Does
// this user have entitlement X?'"). Never persisted - always derived fresh (through
// commercial-config.mjs's own short-lived cache), so an admin plan-limit edit is visible on the
// very next call with no server restart.
import { getPlanConfig } from './commercial-config.mjs';

// Commercial System Slice 2 - plan resolution now prefers a real, currently-active subscription
// (server/db's user_subscriptions, via repo.subscriptions.getActiveForUser - see that method's
// own comment for the exact active/past_due/canceling-grace-period rule) over the Slice 1
// `users.plan` column. Falling back to `users.plan` when there is no active subscription keeps
// Admin's "assign test plan" (spec section 50) working standalone, exactly as Slice 1 built it -
// no fake subscription is ever required just to test a plan manually.
export async function resolveUserEntitlements(userId, repo) {
  const user = await repo.users.get(userId);
  const activeSubscription = await repo.subscriptions.getActiveForUser(userId);
  const plan = (activeSubscription && activeSubscription.planId) || (user && user.plan) || 'free';
  const config = await getPlanConfig(repo, plan);
  return {
    plan,
    limits: { ...config.limits },
    features: { ...config.features },
    storageBytes: config.storageBytes
  };
}
