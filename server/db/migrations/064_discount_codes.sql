-- Subscription discount codes + subscription wallet bonus (dedicated domain - never commercial_config_overrides).
--
-- discount_codes: one row per admin-defined code. `code` is stored already normalized (trimmed, upper-cased,
-- ASCII [A-Z0-9_-]{3,32}; see server/commercial/discount-codes.mjs) and is UNIQUE, so two spellings of one code
-- can never coexist. `discount_value` is an integer in either unit - basis points for 'percent' (1..10000) or
-- micro-USD for 'fixed' (> 0) - so no monetary value is ever stored as an inexact number.
--
-- discount_redemptions: one row per (code, user) attempt. It doubles as the RESERVATION record: a checkout
-- reserves a slot ('reserved', held until reserved_until), payment confirmation turns it into 'confirmed', a
-- failed/abandoned checkout ends it as 'released', and a lapsed hold is swept to 'expired'. Capacity in use is
-- confirmed rows plus reserved rows whose hold has not lapsed. The amounts and the code terms are SNAPSHOTTED
-- here so a later edit to the code or the plan can never change a historic purchase.
--
-- Atomicity: every capacity decision is made while holding a row lock on the code (repo.pg.mjs), and the two
-- partial unique indexes below are the database-level backstop: one LIVE redemption per user per code, and one
-- redemption per payment transaction.
--
-- Additive only - expand, never edit 001-063.
CREATE TABLE IF NOT EXISTS discount_codes (
  id                TEXT PRIMARY KEY,
  code              TEXT NOT NULL,
  campaign_name     TEXT NOT NULL,
  active            BOOLEAN NOT NULL DEFAULT true,
  discount_type     TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value    BIGINT NOT NULL,
  starts_at         TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ,
  max_redemptions   INTEGER CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  created_by        TEXT REFERENCES users(id),
  updated_by        TEXT REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((discount_type = 'percent' AND discount_value BETWEEN 1 AND 10000) OR (discount_type = 'fixed' AND discount_value > 0)),
  CHECK (starts_at IS NULL OR expires_at IS NULL OR expires_at > starts_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS discount_codes_code_uidx ON discount_codes (code);

CREATE TABLE IF NOT EXISTS discount_redemptions (
  id                          TEXT PRIMARY KEY,
  code_id                     TEXT NOT NULL REFERENCES discount_codes(id),
  user_id                     TEXT NOT NULL REFERENCES users(id),
  transaction_id              TEXT REFERENCES payment_transactions(id),
  status                      TEXT NOT NULL CHECK (status IN ('reserved', 'confirmed', 'released', 'expired')),
  plan_id                     TEXT NOT NULL,
  code_snapshot               TEXT NOT NULL,
  campaign_name_snapshot      TEXT NOT NULL,
  discount_type_snapshot      TEXT NOT NULL,
  discount_value_snapshot     BIGINT NOT NULL,
  original_amount_micro_usd   BIGINT NOT NULL,
  discount_amount_micro_usd   BIGINT NOT NULL,
  final_amount_micro_usd      BIGINT NOT NULL,
  reserved_until              TIMESTAMPTZ NOT NULL,
  confirmed_at                TIMESTAMPTZ,
  released_at                 TIMESTAMPTZ,
  release_reason              TEXT,
  refunded_at                 TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (original_amount_micro_usd >= 0 AND discount_amount_micro_usd >= 0 AND final_amount_micro_usd >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS discount_redemptions_live_user_uidx ON discount_redemptions (code_id, user_id) WHERE status IN ('reserved', 'confirmed');
CREATE UNIQUE INDEX IF NOT EXISTS discount_redemptions_transaction_uidx ON discount_redemptions (transaction_id) WHERE transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS discount_redemptions_code_status_idx ON discount_redemptions (code_id, status);
CREATE INDEX IF NOT EXISTS discount_redemptions_user_idx ON discount_redemptions (user_id);

-- Subscription wallet bonus ledger types. 027_wallet.sql restricts wallet_ledger.type with an inline CHECK whose
-- auto-generated name must not be guessed, so the old constraint is found by its definition and replaced.
-- Widening a CHECK never invalidates existing rows.
DO $$
DECLARE
  old_constraint TEXT;
BEGIN
  FOR old_constraint IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'wallet_ledger'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%AI_SETTLEMENT%'
  LOOP
    EXECUTE format('ALTER TABLE wallet_ledger DROP CONSTRAINT %I', old_constraint);
  END LOOP;
END $$;

ALTER TABLE wallet_ledger ADD CONSTRAINT wallet_ledger_type_check CHECK (type IN (
  'PROMO_CREDIT', 'TOP_UP', 'AI_RESERVATION', 'AI_SETTLEMENT', 'AI_RELEASE', 'ADMIN_CREDIT', 'ADMIN_DEBIT',
  'SUBSCRIPTION_BONUS', 'SUBSCRIPTION_BONUS_REVERSAL'
));
