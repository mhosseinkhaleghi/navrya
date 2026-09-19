-- Subscription wallet bonus LOT accounting: how much of each subscription bonus AI usage has consumed, so a refund
-- can reverse only what is still unspent instead of the whole grant (which used to leave a negative promo balance
-- once the user had spent part of it).
--
-- subscription_bonus_lots: one row per payment transaction that granted a bonus, created in the SAME database
-- transaction as its SUBSCRIPTION_BONUS ledger grant and the promo balance credit (grant_ledger_id links them).
-- original / consumed / reversed are integer micro-USD; the remaining amount is DERIVED (original - consumed -
-- reversed) and never stored, so there is no second truth to drift. status 'reversed' is set exactly when the
-- refund reversal ledger entry exists (reversal_ledger_id) - including the zero-amount reversal of a lot that was
-- already fully spent, which keeps the outcome auditable. granted_at (clock_timestamp, so it follows real insertion
-- order) plus seq (a monotonic tie-break) is the deterministic FIFO key: AI settlement consumes a user's ACTIVE
-- lots oldest-first, before any generic promo (signup / admin credit) and before the paid balance.
--
-- subscription_bonus_allocations: one immutable row per (lot, AI_SETTLEMENT ledger entry) recording the exact amount
-- of that lot the settlement consumed. The database itself refuses to change or remove an allocation (trigger below).
-- The lot's consumed_micro_usd is always the sum of its allocations.
--
-- Locking (repo.pg.mjs): every path takes the wallet_accounts row first and the lot rows second, so settlement,
-- refund reversal and bonus repair serialise per user and can never deadlock.
--
-- Additive only - expand, never edit 001-064. No backfill: 064 never released, so no bonus was granted without a lot.
CREATE TABLE IF NOT EXISTS subscription_bonus_lots (
  id                     TEXT PRIMARY KEY,
  seq                    BIGSERIAL NOT NULL,
  user_id                TEXT NOT NULL REFERENCES users(id),
  transaction_id         TEXT NOT NULL UNIQUE REFERENCES payment_transactions(id),
  grant_ledger_id        TEXT NOT NULL UNIQUE REFERENCES wallet_ledger(id),
  original_micro_usd     BIGINT NOT NULL,
  consumed_micro_usd     BIGINT NOT NULL DEFAULT 0,
  reversed_micro_usd     BIGINT NOT NULL DEFAULT 0,
  status                 TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'reversed')),
  granted_at             TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  reversed_at            TIMESTAMPTZ,
  reversal_ledger_id     TEXT UNIQUE REFERENCES wallet_ledger(id),
  refund_transaction_id  TEXT REFERENCES payment_transactions(id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (original_micro_usd > 0),
  CHECK (consumed_micro_usd >= 0),
  CHECK (reversed_micro_usd >= 0),
  CHECK (consumed_micro_usd + reversed_micro_usd <= original_micro_usd),
  CHECK ((status = 'reversed') = (reversal_ledger_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS subscription_bonus_lots_active_fifo_idx ON subscription_bonus_lots (user_id, granted_at, seq) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS subscription_bonus_allocations (
  id                 TEXT PRIMARY KEY,
  lot_id             TEXT NOT NULL REFERENCES subscription_bonus_lots(id),
  ledger_id          TEXT NOT NULL REFERENCES wallet_ledger(id),
  user_id            TEXT NOT NULL REFERENCES users(id),
  amount_micro_usd   BIGINT NOT NULL CHECK (amount_micro_usd > 0),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lot_id, ledger_id)
);
CREATE INDEX IF NOT EXISTS subscription_bonus_allocations_ledger_idx ON subscription_bonus_allocations (ledger_id);

-- Allocations are append-only evidence: a correction is never an edit, it would be a new record.
CREATE OR REPLACE FUNCTION subscription_bonus_allocations_reject_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'subscription_bonus_allocations rows are immutable (% refused)', TG_OP USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS subscription_bonus_allocations_immutable ON subscription_bonus_allocations;
CREATE TRIGGER subscription_bonus_allocations_immutable
  BEFORE UPDATE OR DELETE ON subscription_bonus_allocations
  FOR EACH ROW EXECUTE PROCEDURE subscription_bonus_allocations_reject_change();
