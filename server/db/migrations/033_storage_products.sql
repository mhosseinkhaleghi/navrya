-- Commercial System Slice 2: the Storage Add-on catalog (spec section 6/19). Unlike the fixed
-- three plans, this is a genuinely open-ended, admin-creatable list - so unlike
-- commercial_config_overrides' fixed-key convention, this is a real table an admin can add rows
-- to. This repo's migrations never seed rows (confirmed across every prior migration) - the 3
-- initial defaults (Storage 25/100/500) are instead lazily self-seeded by
-- repo.storageProducts.list() on first call (fixed well-known ids, ON CONFLICT DO NOTHING), so
-- the catalog works out of the box with zero admin setup, and every row - including the 3
-- defaults - is a real, independently editable row from the start. See
-- server/commercial/commercial-defaults.mjs's DEFAULT_STORAGE_PRODUCTS for the actual default
-- values (never hard-coded anywhere else).
CREATE TABLE IF NOT EXISTS storage_products (
  id                       TEXT PRIMARY KEY,
  name                     TEXT NOT NULL,
  capacity_bytes           BIGINT NOT NULL CHECK (capacity_bytes > 0),
  price_amount_micro_usd   BIGINT NOT NULL CHECK (price_amount_micro_usd >= 0),
  currency                 TEXT NOT NULL DEFAULT 'USD',
  validity_days            INTEGER NOT NULL CHECK (validity_days > 0),
  enabled                  BOOLEAN NOT NULL DEFAULT TRUE,
  display_order            INTEGER NOT NULL DEFAULT 0,
  stacking_allowed         BOOLEAN NOT NULL DEFAULT TRUE,
  purchase_limit           INTEGER,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
