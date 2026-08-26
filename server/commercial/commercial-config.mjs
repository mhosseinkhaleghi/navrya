// Merges the hardcoded plan/wallet defaults (commercial-defaults.mjs) with admin-set overrides
// from Postgres (commercial_config_overrides) - mirrors server/community/xp-config.mjs exactly,
// down to the TTL-cache/invalidate-on-write shape, since this runs in the same process/pool as
// the admin routes that write these overrides (server/admin/routes.commercial.mjs). The AI
// gateway process (server/pattern-ai-server.mjs) never imports this file directly - it has no
// Postgres access by design - it reads resolved config over the internal HTTP bridge instead
// (server/community/routes.internal.mjs's /internal/entitlements/:userId and wallet endpoints).
import { PLAN_DEFAULTS, WALLET_DEFAULTS, PLAN_NAMES } from './commercial-defaults.mjs';

const CACHE_TTL_MS = 30000;
let cache = { data: null, fetchedAt: 0 };

// Called by every admin write route so the very next read reflects the change immediately,
// rather than waiting out the TTL (spec section 44: "No server restart should be necessary").
export function invalidateCommercialConfigCache() { cache = { data: null, fetchedAt: 0 }; }

function cloneDeep(value) { return JSON.parse(JSON.stringify(value)); }

function buildEffective(overrideRows) {
  const plans = {};
  PLAN_NAMES.forEach((plan) => { plans[plan] = cloneDeep(PLAN_DEFAULTS[plan]); });
  const wallet = cloneDeep(WALLET_DEFAULTS);
  const overridesByKey = {};

  overrideRows.forEach((row) => {
    overridesByKey[row.configKey] = row;
    const value = row.value || {};
    const planLimitsMatch = /^plan:(free|plus|personalized):limits$/.exec(row.configKey);
    const planStorageMatch = /^plan:(free|plus|personalized):storageBytes$/.exec(row.configKey);
    const planFeaturesMatch = /^plan:(free|plus|personalized):features$/.exec(row.configKey);
    // Slice 2 - Free's price is never admin-editable (a $0 plan has no price to change), so this
    // match deliberately excludes it even though the regex above allows it for limits/features.
    const planPriceMatch = /^plan:(plus|personalized):price$/.exec(row.configKey);
    if (planLimitsMatch) {
      const plan = plans[planLimitsMatch[1]];
      Object.keys(plan.limits).forEach((key) => {
        if (key in value) plan.limits[key] = value[key] === null ? null : Number(value[key]);
      });
    } else if (planStorageMatch) {
      if (Number.isFinite(value.bytes) && value.bytes >= 0) plans[planStorageMatch[1]].storageBytes = value.bytes;
    } else if (planFeaturesMatch) {
      const plan = plans[planFeaturesMatch[1]];
      Object.keys(plan.features).forEach((key) => {
        if (key in value) plan.features[key] = Boolean(value[key]);
      });
    } else if (planPriceMatch) {
      const plan = plans[planPriceMatch[1]];
      if (Number.isFinite(value.amountUsd) && value.amountUsd >= 0) plan.price.amountUsd = value.amountUsd;
      if (value.billingInterval === 'month' || value.billingInterval === 'year') plan.price.billingInterval = value.billingInterval;
    } else if (row.configKey === 'wallet:markupPercent') {
      if (Number.isFinite(value.percent) && value.percent >= 0) wallet.markupPercent = value.percent;
    } else if (row.configKey === 'wallet:minimumTopUpUsd') {
      if (Number.isFinite(value.amount) && value.amount >= 0) wallet.minimumTopUpUsd = value.amount;
    } else if (row.configKey === 'wallet:signupPromoRetailUsd') {
      if (Number.isFinite(value.amount) && value.amount >= 0) wallet.signupPromoRetailUsd = value.amount;
    }
  });

  return { plans, wallet, overridesByKey };
}

export async function getEffectiveCommercialConfig(repo) {
  if (cache.data && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.data;
  const rows = await repo.commercialConfig.list();
  cache = { data: buildEffective(rows), fetchedAt: Date.now() };
  return cache.data;
}

export async function getPlanConfig(repo, plan) {
  const config = await getEffectiveCommercialConfig(repo);
  return config.plans[plan] || config.plans.free;
}

export async function getWalletRules(repo) {
  const config = await getEffectiveCommercialConfig(repo);
  return config.wallet;
}

export async function getPlanPrice(repo, plan) {
  const config = await getPlanConfig(repo, plan);
  return config.price;
}

// retailMultiplier = 1 + markupPercent/100 (spec section 16) - the one formula every markup
// display/calculation in this system must share, never re-derived inline.
export function retailMultiplierFor(markupPercent) { return 1 + Number(markupPercent) / 100; }
