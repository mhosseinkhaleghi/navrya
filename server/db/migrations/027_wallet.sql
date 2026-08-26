-- Commercial System Slice 1 (Foundation): the prepaid AI Wallet. All money is integer microUSD
-- (1,000,000 microUSD = $1.00, BIGINT) - never NUMERIC/float - so ledger deltas and balances can
-- be summed without floating-point drift (spec section 21). Paid and promo balances are tracked
-- separately (spec section 23: promo spends first, never withdrawable/transferable).
--
-- No self-serve top-up in this slice (no payment processor yet) - wallet_accounts is funded only
-- via the signup promo grant (repo.pg.mjs/repo.memory.mjs's users.create()) and Admin credit/debit
-- (server/admin/routes.commercial.mjs). TOP_UP/TOP_UP_BONUS/REFUND/CHARGEBACK/VOICE_* ledger types
-- arrive with the payment-provider/storage/subscription slice; the CHECK below is intentionally
-- narrow to what this slice actually writes and can be widened later with a plain ALTER (no data
-- migration needed, since widening a CHECK never invalidates existing rows).
CREATE TABLE IF NOT EXISTS wallet_accounts (
  user_id                  TEXT PRIMARY KEY REFERENCES users(id),
  paid_balance_micro_usd   BIGINT NOT NULL DEFAULT 0,
  promo_balance_micro_usd  BIGINT NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Append-only. A settled/released row is NEVER updated or deleted after the fact - a correction
-- is always a new reversing row (spec section 26). idempotency_key is UNIQUE so a retried
-- settle/grant call can never double-credit or double-charge (e.g. 'signup-promo:{userId}',
-- 'ai-settle:{reservationId}').
CREATE TABLE IF NOT EXISTS wallet_ledger (
  id                        TEXT PRIMARY KEY,
  user_id                   TEXT NOT NULL REFERENCES users(id),
  type                      TEXT NOT NULL CHECK (type IN ('PROMO_CREDIT','TOP_UP','AI_RESERVATION','AI_SETTLEMENT','AI_RELEASE','ADMIN_CREDIT','ADMIN_DEBIT')),
  cash_delta_micro_usd      BIGINT NOT NULL DEFAULT 0,
  promo_delta_micro_usd     BIGINT NOT NULL DEFAULT 0,
  provider_cost_micro_usd   BIGINT,
  retail_charge_micro_usd   BIGINT,
  markup_percent            NUMERIC,
  retail_multiplier         NUMERIC,
  provider                  TEXT,
  model                     TEXT,
  feature                   TEXT,
  source_action             TEXT,
  admin_user_id             TEXT REFERENCES users(id),
  idempotency_key           TEXT UNIQUE,
  metadata                  JSONB,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wallet_ledger_user_created_idx ON wallet_ledger (user_id, created_at DESC);

-- A reservation is the "hold" placed before an AI provider call and resolved (settled or
-- released) after - see server/commercial/wallet-service.mjs. `pending` reservations older than
-- a few minutes are effectively orphaned (the caller crashed/timed out before resolving) and are
-- treated as expired/ignored by balance calculations rather than cleaned up by a background job
-- in this slice.
CREATE TABLE IF NOT EXISTS wallet_reservations (
  id                            TEXT PRIMARY KEY,
  user_id                       TEXT NOT NULL REFERENCES users(id),
  status                        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','settled','released')),
  estimated_retail_micro_usd    BIGINT NOT NULL,
  provider                      TEXT,
  model                         TEXT,
  feature                       TEXT,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at                   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS wallet_reservations_user_status_idx ON wallet_reservations (user_id, status);
