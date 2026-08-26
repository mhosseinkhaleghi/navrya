// Server-side plan-limit enforcement (spec section 5/52). Route handlers call createWithQuota()
// only on the "this is a genuinely new record" branch (they already look up the existing record
// to distinguish create-from-update, since patterns/strategies/sessions all use one upsert
// endpoint for both) - an update to an existing record never runs a limit check, which is what
// gives Free's "block create, allow edit/delete" behavior (spec section 54) for free, with no
// separate downgrade-handling code path.
import { ApiError } from '../community/errors.mjs';
import { resolveUserEntitlements } from './entitlement-resolver.mjs';

async function countCurrent(resourceType, userId, repo) {
  if (resourceType === 'patterns') return (await repo.patterns.listByUser(userId)).length;
  if (resourceType === 'strategies') return (await repo.strategies.listByUser(userId)).length;
  if (resourceType === 'sessions') return (await repo.tradingSessions.listByUser(userId)).length;
  // Archived accounts don't count against the limit - they were already voluntarily given up
  // (spec section 5's "current resources, not lifetime creations").
  if (resourceType === 'accounts') return (await repo.accounts.listByUser(userId)).filter((a) => a.status !== 'archived').length;
  if (resourceType === 'analysisSymbols') return (await repo.analysisSymbols.listByUser(userId)).length;
  throw new Error('Unknown quota resourceType: ' + resourceType);
}

// Wraps `createFn` (the caller's actual insert) in a lock scoped to (userId, resourceType) -
// repo.quota.withCreateLock (pg: transaction-scoped advisory lock; memory: an async mutex) -
// so the count-check below and the caller's insert can never both observe "2 of 3" and both
// proceed (spec section 53's concurrent-double-submit requirement).
export async function createWithQuota(resourceType, userId, repo, createFn) {
  return repo.quota.withCreateLock(userId, resourceType, async () => {
    const entitlements = await resolveUserEntitlements(userId, repo);
    const limit = entitlements.limits[resourceType];
    if (limit != null) {
      const count = await countCurrent(resourceType, userId, repo);
      if (count >= limit) throw new ApiError(403, 'PLAN_LIMIT_REACHED');
    }
    return createFn();
  });
}
