-- Commercial System Slice 1: model-level provider cost overrides (spec section 19). Deliberately
-- a SEPARATE table from provider_pricing (004_admin.sql), not an ALTER of it - provider_pricing's
-- existing PK is `provider` alone and its repo.pg.mjs upsert already does
-- `ON CONFLICT (provider) DO UPDATE`, relied on unmodified by the existing Admin "AI" tab. Adding
-- model-level rows to that same table would require multiple rows per provider, which the
-- existing PK/upsert cannot support without rewriting a working, already-shipped admin flow this
-- slice has no reason to touch. Pricing resolution (server/commercial/wallet-service.mjs) checks
-- HERE first (provider+model, the more specific rate) and falls back to provider_pricing's
-- provider-level rate when no model-specific row exists - the fallback IS the provider-level row,
-- not a second concept.
-- Natural composite key (provider, model), same style as provider_pricing's own single-column
-- natural key - no synthetic id column, so upsert-by-natural-key stays a plain
-- `ON CONFLICT (provider, model) DO UPDATE`, never a generated id an update would just discard.
CREATE TABLE IF NOT EXISTS provider_model_pricing (
  provider                  TEXT NOT NULL,
  model                     TEXT NOT NULL,
  prompt_price_per_1k       NUMERIC,
  completion_price_per_1k   NUMERIC,
  currency                  TEXT NOT NULL DEFAULT 'USD',
  enabled                   BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from            TIMESTAMPTZ,
  effective_until           TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, model)
);
