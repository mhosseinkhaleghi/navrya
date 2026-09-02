// Code-level defaults for the Commercial System (NAVRYA Commercial System V2, spec section 77).
// Mirrors server/community/xp-rules.mjs's role for xp-config.mjs exactly: these are the ONLY
// place a commercial number is ever hardcoded. Everything else (route handlers, the entitlement
// resolver, the AI gateway) asks commercial-config.mjs's getEffectiveCommercialConfig(), which
// merges these defaults with admin overrides from commercial_config_overrides - never these
// constants directly. An admin change never requires touching this file or redeploying.
//
// `null` means "unlimited" (spec section 7: never a fake sentinel like 999999999).
// Slice 2 adds `price` per plan ({amountUsd, billingInterval}) - Free's is fixed at 0 (never
// admin-editable, there is no "price" concept for a $0 plan), Plus/Personalized default to the
// spec's own initial defaults. This is a plain new field on the same PLAN_DEFAULTS object, merged
// through commercial-config.mjs's existing buildEffective() exactly like limits/storageBytes/
// features already are - no new table, no new merge mechanism.
//
// 2026-09-01 additions (real-money subscription rollout):
// - `tokenDiscountPercent`: a per-plan discount applied to the RETAIL AI charge (never to the
//   provider's real cost, never to the token counts themselves) at settlement time only - see
//   wallet-service.mjs's settleAiCall() and server/community/routes.internal.mjs's /usage/record,
//   the two (and only) places a retail AI charge is ever computed. Free's is fixed at 0 (same
//   "no admin edit for the $0 tier" rule price already follows) - a lapsed/free user simply gets
//   no discount, exactly the "reverts to normal once the subscription ends" behavior the task
//   asked for, for free by reusing entitlement-resolver.mjs's existing real-time plan lookup.
// - `displayName`: an optional plain-string admin override of the plan's shown name (client falls
//   back to the localized i18n label when this is null) - lets Admin rename any plan without a
//   code change/redeploy, never itself localized (an admin-typed name is shown as-is in every
//   language, the same way a product name usually is).
// - `features.byok`/`features.premiumModels`: two new plan-gated feature flags. `byok` gates the
//   "use your own API key" section of the AI Assistant screen; `premiumModels` gates the specific
//   real, already-existing frontier model ids named in ai-settings-store.js's
//   PROVIDER_CATALOG[*].premiumModels (GPT-5.6 Sol, Claude Opus 4.1) - never a made-up model name.
// - The new `pro` plan sits between Plus and Personalized, introduced specifically to carry the
//   premium-model unlock and a meaningful token discount as an upsell step before Personalized's
//   full aiPanelBuilder tier. Every field below (price, limits, discount, features) is
//   admin-editable exactly like the pre-existing three plans - these are starting defaults only.
export const PLAN_DEFAULTS = {
  free: {
    limits: { patterns: 3, strategies: 3, accounts: 3, sessions: 10, analysisSymbols: 1 },
    storageBytes: 104857600, // 100 MB - see spec section 4, deliberately not the old 10MB value
    features: { wallet: true, ai: true, voice: true, aiPanelBuilder: false, byok: false, premiumModels: false },
    price: { amountUsd: 0, billingInterval: 'month' },
    tokenDiscountPercent: 0,
    displayName: null
  },
  plus: {
    limits: { patterns: null, strategies: null, accounts: null, sessions: null, analysisSymbols: null },
    storageBytes: 10737418240, // 10 GB
    features: { wallet: true, ai: true, voice: true, aiPanelBuilder: false, byok: true, premiumModels: false },
    price: { amountUsd: 4.99, billingInterval: 'month' },
    tokenDiscountPercent: 10,
    displayName: null
  },
  pro: {
    limits: { patterns: null, strategies: null, accounts: null, sessions: null, analysisSymbols: null },
    storageBytes: 10737418240,
    features: { wallet: true, ai: true, voice: true, aiPanelBuilder: false, byok: true, premiumModels: true },
    price: { amountUsd: 14.99, billingInterval: 'month' },
    tokenDiscountPercent: 20,
    displayName: null
  },
  personalized: {
    // Inherits Plus (spec section 9) - expressed here as identical limits/storage rather than a
    // runtime merge, so each plan's effective config is independently readable/editable by an
    // admin without needing to know Personalized "extends" Plus.
    limits: { patterns: null, strategies: null, accounts: null, sessions: null, analysisSymbols: null },
    storageBytes: 10737418240,
    features: { wallet: true, ai: true, voice: true, aiPanelBuilder: true, byok: true, premiumModels: true },
    price: { amountUsd: 59, billingInterval: 'month' },
    tokenDiscountPercent: 25,
    displayName: null
  }
};

// Storage Add-on catalog defaults (spec section 6) - the ONLY place 25/100/500 GB, $4.99/$14.99/
// $49.99, and 90-day validity are ever hardcoded. Lazily self-seeded into the real
// `storage_products` table by repo.storageProducts.list() (see that method's own comment) rather
// than a migration-level INSERT, matching this repo's no-seed-migrations convention. Fixed ids so
// the self-seed is idempotent and an admin edit to one of these becomes a real, permanent row.
const GB = 1073741824;
export const DEFAULT_STORAGE_PRODUCTS = [
  { id: 'storage-25', name: 'Storage 25', capacityBytes: 25 * GB, priceAmountUsd: 4.99, validityDays: 90, displayOrder: 1 },
  { id: 'storage-100', name: 'Storage 100', capacityBytes: 100 * GB, priceAmountUsd: 14.99, validityDays: 90, displayOrder: 2 },
  { id: 'storage-500', name: 'Storage 500', capacityBytes: 500 * GB, priceAmountUsd: 49.99, validityDays: 90, displayOrder: 3 }
];

export const WALLET_DEFAULTS = {
  markupPercent: 200, // retailMultiplier = 1 + markupPercent/100 = 3.00x (spec section 16)
  // $5 is the product's advertised floor (the smallest amount chip the wallet UI offers). Still
  // admin-editable afterward via Admin > Commercial > Wallet (PATCH /commercial/wallet-rules) -
  // and because a stored override WINS over this default, migration 049 also brings any existing
  // override down to 5, otherwise a deployment that had previously been set to 10 would keep
  // rejecting the $5 the UI now offers.
  minimumTopUpUsd: 5,
  signupPromoRetailUsd: 0.50
};

export const PLAN_NAMES = ['free', 'plus', 'pro', 'personalized'];
// Every plan that can actually be PURCHASED - i.e. PLAN_NAMES minus the free tier. Derived rather
// than written out a second time so adding a 5th plan to PLAN_NAMES can never again leave a
// billing provider silently rejecting it (the exact bug 'pro' hit: both providers carried their
// own hardcoded ['plus', 'personalized'] list and returned VALIDATION_FAILED for 'pro').
export const PAID_PLAN_NAMES = PLAN_NAMES.filter((name) => name !== 'free');
export const RESOURCE_TYPES = ['patterns', 'strategies', 'accounts', 'sessions', 'analysisSymbols'];

// Real BSC crypto payment provider configuration (admin-managed - see commercial-config.mjs's
// `bsc:*` override keys and server/commercial/bsc-config.mjs's resolveBscRuntimeConfig()).
// `enabled` deliberately defaults false and is NEVER sourced from .env (see commercial-config.mjs)
// - it only ever becomes true through an explicit admin action (PATCH /api/admin/commercial/
// crypto-payments/status), after that route's own live RPC + completeness validation passes.
// depositAddress/tokenContract default to '' (never a placeholder address) so "not yet
// configured" is unambiguous. The two real secrets this provider needs (the RPC URL and the
// optional webhook HMAC secret) are NOT here - they live encrypted-at-rest in the dedicated
// bsc_payment_secrets table (039_bsc_payment_secrets.sql), never in commercial_config_overrides/
// versions, since that history is permanent and would otherwise leak them forever.
export const BSC_DEFAULTS = {
  enabled: false,
  chainId: 56, // BSC mainnet
  depositAddress: '',
  tokenSymbol: 'USDT',
  tokenContract: '',
  tokenDecimals: 18,
  exchangeRateUsdPerToken: 1, // USD value of one whole token unit; 1 = USD-pegged stablecoin
  confirmationsRequired: 15,
  invoiceExpiryMinutes: 30
};
