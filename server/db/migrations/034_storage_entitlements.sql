-- Commercial System Slice 2: a completed Storage purchase's immutable snapshot (spec section 7).
-- capacity_bytes_snapshot/price_paid_snapshot_micro_usd/validity_days_snapshot are copied from
-- the purchasing payment_transactions row's own metadata snapshot at confirmation time - never
-- re-read from the live storage_products row, so an admin editing a product's price/capacity
-- later never alters an already-purchased entitlement (spec section 7's explicit example).
--
-- `status` exists for admin-facing readability but is NOT the authoritative "is this active"
-- check anywhere in code - every quota calculation instead compares `expires_at > now()` directly
-- (computed at read time, matching this codebase's existing convention - e.g.
-- ai_provider_health_events' status is derived at read time, never stored). No background expiry
-- job exists or is needed for correctness because of this.
CREATE TABLE IF NOT EXISTS storage_entitlements (
  id                                TEXT PRIMARY KEY,
  user_id                           TEXT NOT NULL REFERENCES users(id),
  product_id                        TEXT REFERENCES storage_products(id),
  capacity_bytes_snapshot           BIGINT NOT NULL,
  price_paid_snapshot_micro_usd     BIGINT NOT NULL,
  currency                          TEXT NOT NULL DEFAULT 'USD',
  validity_days_snapshot            INTEGER NOT NULL,
  starts_at                         TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at                        TIMESTAMPTZ NOT NULL,
  status                            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired')),
  payment_transaction_id            TEXT REFERENCES payment_transactions(id),
  created_at                        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS storage_entitlements_user_expires_idx ON storage_entitlements (user_id, expires_at);
