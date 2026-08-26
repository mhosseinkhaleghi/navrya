import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { getEffectiveCommercialConfig, invalidateCommercialConfigCache, getPlanConfig, retailMultiplierFor } from '../server/commercial/commercial-config.mjs';
import { PLAN_DEFAULTS, WALLET_DEFAULTS } from '../server/commercial/commercial-defaults.mjs';

test('defaults match spec section 77 with zero overrides', async () => {
  const repo = createMemoryRepo();
  invalidateCommercialConfigCache();
  const config = await getEffectiveCommercialConfig(repo);
  assert.deepEqual(config.plans.free.limits, PLAN_DEFAULTS.free.limits);
  assert.equal(config.plans.free.storageBytes, 104857600);
  assert.equal(config.plans.plus.limits.patterns, null); // unlimited, never a sentinel number
  assert.equal(config.plans.personalized.features.aiPanelBuilder, true);
  assert.equal(config.plans.plus.features.aiPanelBuilder, false);
  assert.equal(config.wallet.markupPercent, 200);
  assert.equal(retailMultiplierFor(config.wallet.markupPercent), 3);
});

test('an admin override changes the effective plan limit without touching code defaults', async () => {
  const repo = createMemoryRepo();
  invalidateCommercialConfigCache();
  await repo.commercialConfig.publish('plan:free:limits', { patterns: 5 }, { updatedBy: 'admin-1', changeSummary: 'raise free pattern limit' });
  invalidateCommercialConfigCache();
  const plan = await getPlanConfig(repo, 'free');
  assert.equal(plan.limits.patterns, 5);
  assert.equal(plan.limits.strategies, 3); // untouched keys keep their default
  assert.equal(PLAN_DEFAULTS.free.limits.patterns, 3); // the code default itself is never mutated
});

test('publish() records an immutable version row with before/after values', async () => {
  const repo = createMemoryRepo();
  await repo.commercialConfig.publish('wallet:markupPercent', { percent: 150 }, { updatedBy: 'admin-1', changeSummary: 'lower markup' });
  const versions = await repo.commercialConfig.listVersions({ configKey: 'wallet:markupPercent' });
  assert.equal(versions.length, 1);
  assert.equal(versions[0].previousValue, null);
  assert.deepEqual(versions[0].newValue, { percent: 150 });
  await repo.commercialConfig.publish('wallet:markupPercent', { percent: 100 }, { updatedBy: 'admin-1' });
  const versionsAfterSecond = await repo.commercialConfig.listVersions({ configKey: 'wallet:markupPercent' });
  assert.equal(versionsAfterSecond.length, 2);
  assert.deepEqual(versionsAfterSecond[0].previousValue, { percent: 150 }); // most recent first
});

test('the in-process cache is honored until invalidated', async () => {
  const repo = createMemoryRepo();
  invalidateCommercialConfigCache();
  await getEffectiveCommercialConfig(repo); // populate cache
  await repo.commercialConfig.publish('wallet:signupPromoRetailUsd', { amount: 5 }, {});
  const stillCached = await getEffectiveCommercialConfig(repo);
  assert.equal(stillCached.wallet.signupPromoRetailUsd, WALLET_DEFAULTS.signupPromoRetailUsd); // not yet reflected
  invalidateCommercialConfigCache();
  const fresh = await getEffectiveCommercialConfig(repo);
  assert.equal(fresh.wallet.signupPromoRetailUsd, 5);
});
