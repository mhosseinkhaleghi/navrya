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
export const PLAN_DEFAULTS = {
  free: {
    limits: { patterns: 3, strategies: 3, accounts: 3, sessions: 10, analysisSymbols: 1 },
    storageBytes: 104857600, // 100 MB - see spec section 4, deliberately not the old 10MB value
    features: { wallet: true, ai: true, voice: true, aiPanelBuilder: false },
    price: { amountUsd: 0, billingInterval: 'month' }
  },
  plus: {
    limits: { patterns: null, strategies: null, accounts: null, sessions: null, analysisSymbols: null },
    storageBytes: 10737418240, // 10 GB
    features: { wallet: true, ai: true, voice: true, aiPanelBuilder: false },
    price: { amountUsd: 4.99, billingInterval: 'month' }
  },
  personalized: {
    // Inherits Plus (spec section 9) - expressed here as identical limits/storage rather than a
    // runtime merge, so each plan's effective config is independently readable/editable by an
    // admin without needing to know Personalized "extends" Plus.
    limits: { patterns: null, strategies: null, accounts: null, sessions: null, analysisSymbols: null },
    storageBytes: 10737418240,
    features: { wallet: true, ai: true, voice: true, aiPanelBuilder: true },
    price: { amountUsd: 59, billingInterval: 'month' }
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
  minimumTopUpUsd: 10,
  signupPromoRetailUsd: 0.50
};

export const PLAN_NAMES = ['free', 'plus', 'personalized'];
export const RESOURCE_TYPES = ['patterns', 'strategies', 'accounts', 'sessions', 'analysisSymbols'];
