// Merges the hardcoded plan/wallet defaults (commercial-defaults.mjs) with admin-set overrides
// from Postgres (commercial_config_overrides) - mirrors server/community/xp-config.mjs exactly,
// down to the TTL-cache/invalidate-on-write shape, since this runs in the same process/pool as
// the admin routes that write these overrides (server/admin/routes.commercial.mjs). The AI
// gateway process (server/pattern-ai-server.mjs) never imports this file directly - it has no
// Postgres access by design - it reads resolved config over the internal HTTP bridge instead
// (server/community/routes.internal.mjs's /internal/entitlements/:userId and wallet endpoints).
import { PLAN_DEFAULTS, WALLET_DEFAULTS, BSC_DEFAULTS, PLAN_NAMES } from './commercial-defaults.mjs';

const CACHE_TTL_MS = 30000;
let cache = { data: null, fetchedAt: 0 };

// Called by every admin write route so the very next read reflects the change immediately,
// rather than waiting out the TTL (spec section 44: "No server restart should be necessary").
export function invalidateCommercialConfigCache() { cache = { data: null, fetchedAt: 0 }; }

function cloneDeep(value) { return JSON.parse(JSON.stringify(value)); }

// Real BSC crypto payment config's `.env` tier - a local-development/bootstrap fallback ONLY
// (task B.1), applied before any DB override is considered below. Production configuration is
// meant to live in the DB (set via Admin > Commercial > Crypto payments), never here - notably
// `enabled` is NEVER read from `.env` at all (see BSC_DEFAULTS's own comment), so a bare `.env`
// with legacy BSC_* values set can never silently turn real payments on by itself.
function bscEnvFallback() {
  const bsc = cloneDeep(BSC_DEFAULTS);
  if (process.env.BSC_CHAIN_ID) { const n = Number(process.env.BSC_CHAIN_ID); if (Number.isFinite(n) && n > 0) bsc.chainId = n; }
  if (process.env.BSC_DEPOSIT_ADDRESS) bsc.depositAddress = process.env.BSC_DEPOSIT_ADDRESS;
  if (process.env.BSC_TOKEN_SYMBOL) bsc.tokenSymbol = process.env.BSC_TOKEN_SYMBOL;
  if (process.env.BSC_TOKEN_CONTRACT) bsc.tokenContract = process.env.BSC_TOKEN_CONTRACT;
  if (process.env.BSC_TOKEN_DECIMALS) { const n = Number(process.env.BSC_TOKEN_DECIMALS); if (Number.isFinite(n) && n >= 0) bsc.tokenDecimals = n; }
  if (process.env.BSC_EXCHANGE_RATE_USD_PER_TOKEN) { const n = Number(process.env.BSC_EXCHANGE_RATE_USD_PER_TOKEN); if (Number.isFinite(n) && n > 0) bsc.exchangeRateUsdPerToken = n; }
  if (process.env.BSC_CONFIRMATIONS_REQUIRED) { const n = Number(process.env.BSC_CONFIRMATIONS_REQUIRED); if (Number.isFinite(n) && n >= 1) bsc.confirmationsRequired = n; }
  if (process.env.BSC_INVOICE_EXPIRY_MINUTES) { const n = Number(process.env.BSC_INVOICE_EXPIRY_MINUTES); if (Number.isFinite(n) && n >= 1) bsc.invoiceExpiryMinutes = n; }
  return bsc;
}

function buildEffective(overrideRows) {
  const plans = {};
  PLAN_NAMES.forEach((plan) => { plans[plan] = cloneDeep(PLAN_DEFAULTS[plan]); });
  const wallet = cloneDeep(WALLET_DEFAULTS);
  const bsc = bscEnvFallback();
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
    } else if (row.configKey === 'bsc:enabled') {
      bsc.enabled = Boolean(value.enabled);
    } else if (row.configKey === 'bsc:chainId') {
      if (Number.isFinite(value.chainId) && value.chainId > 0) bsc.chainId = value.chainId;
    } else if (row.configKey === 'bsc:depositAddress') {
      if (typeof value.address === 'string') bsc.depositAddress = value.address;
    } else if (row.configKey === 'bsc:tokenSymbol') {
      if (typeof value.symbol === 'string' && value.symbol.trim()) bsc.tokenSymbol = value.symbol.trim();
    } else if (row.configKey === 'bsc:tokenContract') {
      if (typeof value.address === 'string') bsc.tokenContract = value.address;
    } else if (row.configKey === 'bsc:tokenDecimals') {
      if (Number.isFinite(value.decimals) && value.decimals >= 0) bsc.tokenDecimals = value.decimals;
    } else if (row.configKey === 'bsc:exchangeRateUsdPerToken') {
      if (Number.isFinite(value.rate) && value.rate > 0) bsc.exchangeRateUsdPerToken = value.rate;
    } else if (row.configKey === 'bsc:confirmationsRequired') {
      if (Number.isFinite(value.count) && value.count >= 1) bsc.confirmationsRequired = value.count;
    } else if (row.configKey === 'bsc:invoiceExpiryMinutes') {
      if (Number.isFinite(value.minutes) && value.minutes >= 1) bsc.invoiceExpiryMinutes = value.minutes;
    }
  });

  return { plans, wallet, bsc, overridesByKey };
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

// Public (non-secret) BSC crypto payment settings only - never the RPC URL or webhook secret,
// which live encrypted-at-rest in the dedicated bsc_payment_secrets table and are resolved by
// server/commercial/bsc-config.mjs's resolveBscRuntimeConfig(), not this function.
export async function getBscPublicConfig(repo) {
  const config = await getEffectiveCommercialConfig(repo);
  return config.bsc;
}

// retailMultiplier = 1 + markupPercent/100 (spec section 16) - the one formula every markup
// display/calculation in this system must share, never re-derived inline.
export function retailMultiplierFor(markupPercent) { return 1 + Number(markupPercent) / 100; }
