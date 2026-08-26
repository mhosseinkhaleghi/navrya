-- Commercial System Slice 1 (Foundation): admin-editable plan/wallet configuration. Follows the
-- exact same generic {config_key -> JSONB value} convention xp_config_overrides already
-- established (012_xp_config_overrides.sql) - defaults live in code
-- (server/commercial/commercial-defaults.mjs), this table only ever holds an admin's deviation
-- from a default, and a missing row simply means "use the code default" (see
-- server/commercial/commercial-config.mjs's buildEffective()). No migration-level seeding on
-- purpose - this repo's migrations never INSERT seed rows (confirmed across all prior
-- migrations); an empty table on day one is correct and expected.
--
-- config_key convention:
--   plan:{free|plus|personalized}:limits    -> {"patterns":3,"strategies":3,...} (null = unlimited)
--   plan:{free|plus|personalized}:storageBytes -> {"bytes":104857600}
--   plan:{free|plus|personalized}:features  -> {"wallet":true,"ai":true,"voice":true,"aiPanelBuilder":false}
--   wallet:markupPercent                    -> {"percent":200}
--   wallet:minimumTopUpUsd                  -> {"amount":10}
--   wallet:signupPromoRetailUsd             -> {"amount":0.50}
CREATE TABLE IF NOT EXISTS commercial_config_overrides (
  config_key   TEXT PRIMARY KEY,
  value        JSONB NOT NULL,
  updated_by   TEXT REFERENCES users(id),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Append-only publish history (spec section 43/44's "Configuration History") - separate from
-- admin_audit_log (which every mutating admin route already writes to for the generic "who did
-- what" trail) because this one is domain-specific and carries the actual before/after config
-- value shape, letting the Admin "Configuration History" screen reconstruct a real diff rather
-- than parsing audit_log.details.
CREATE TABLE IF NOT EXISTS commercial_config_versions (
  id               TEXT PRIMARY KEY,
  config_key       TEXT NOT NULL,
  changed_by       TEXT REFERENCES users(id),
  change_summary   TEXT,
  previous_value   JSONB,
  new_value        JSONB,
  changed_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commercial_config_versions_key_idx ON commercial_config_versions (config_key, changed_at DESC);

-- Real subscriptions/billing don't exist yet this slice - a plain column an admin can set
-- directly (spec section 50 "assign test plan") is the simplest correct representation until a
-- real subscription lifecycle (a later slice) starts driving this field from webhook events
-- instead of a manual admin UPDATE.
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','plus','personalized'));
