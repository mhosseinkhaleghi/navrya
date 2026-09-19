-- Referral & Affiliate subsystem, part 2/3: codes, attribution, and the append-only earnings
-- ledger with lot accounting. Additive only. Requires 068 (programs/versions/assignments).
--
-- LOCK ORDER (repo.pg.mjs): every path that touches more than one of these takes locks in this
-- order and never the reverse, so the flows below serialise per user and cannot deadlock:
--   wallet_accounts -> referral_programs -> referral_accounts -> referral_earning_lots (by seq) -> referral_payout_requests
-- (AI conversion is the only flow that touches wallet_accounts; the others simply start lower
-- in the chain.) referral_accounts is the per-user serialisation row: AI conversion and payout
-- reservation both lock it BEFORE reading any lot, so they can never both spend the same lot.
--
-- referral_earning_lots: ONE lot per qualifying earning event (a confirmed subscription/storage
-- payment, or an AI gross-margin settlement). The lot's money is tracked in four consumption
-- columns (ai_converted / payout_reserved / paid / reversed) exactly like subscription_bonus_lots
-- tracks consumed/reversed - the still-free remainder is DERIVED (original minus the four), never
-- stored, so there is no second truth to drift. "pending" vs "available_cash" is also derived
-- (remainder while now < matures_at vs. >= matures_at), so a lot's row is never rewritten just
-- because time passed - maturity needs no scheduler and no lazy UPDATE.
--
-- FIFO (documented, deterministic): conversions and payout reservations draw from a user's MATURED
-- lots ordered by (matures_at, seq) ascending - oldest maturity first, ties by insertion order.
CREATE TABLE IF NOT EXISTS referral_codes (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL UNIQUE REFERENCES users(id),
  public_code   TEXT NOT NULL UNIQUE CHECK (public_code ~ '^[A-Z2-9]{6,10}$'),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Aggregated click counters only - never a raw IP or user agent. visitor_hash is an HMAC of
-- ip|user-agent (server/commercial/referral-attribution.mjs), enough for "unique visitors" and
-- overlap risk signals without persisting the identifiers themselves.
CREATE TABLE IF NOT EXISTS referral_click_stats (
  code_id        TEXT NOT NULL REFERENCES referral_codes(id),
  day            DATE NOT NULL,
  visitor_hash   TEXT NOT NULL,
  click_count    INT NOT NULL DEFAULT 1 CHECK (click_count >= 1),
  first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (code_id, day, visitor_hash)
);

-- The per-user serialisation row (see LOCK ORDER above) plus the account-level payout controls.
CREATE TABLE IF NOT EXISTS referral_accounts (
  user_id                  TEXT PRIMARY KEY REFERENCES users(id),
  payout_blocked           BOOLEAN NOT NULL DEFAULT false,
  payout_blocked_reason    TEXT,
  debt_micro_usd           BIGINT NOT NULL DEFAULT 0 CHECK (debt_micro_usd >= 0),
  terms_accepted_version   TEXT,
  terms_accepted_at        TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One attribution per referred user, ever (UNIQUE referred_user_id): this is what makes a claim
-- idempotent and what prevents a duplicate code claim. The rules_snapshot / assignment_snapshot
-- JSONB freeze the exact program version, rate, source rules, caps and payout policy that applied
-- at attribution time, so a later edit can never retroactively change what this referral earns.
CREATE TABLE IF NOT EXISTS referral_attributions (
  id                     TEXT PRIMARY KEY,
  referred_user_id       TEXT NOT NULL UNIQUE REFERENCES users(id),
  referrer_user_id       TEXT NOT NULL REFERENCES users(id),
  code_id                TEXT NOT NULL REFERENCES referral_codes(id),
  assignment_id          TEXT REFERENCES referral_partner_assignments(id),
  program_id             TEXT NOT NULL REFERENCES referral_programs(id),
  program_version_id     TEXT NOT NULL REFERENCES referral_program_versions(id),
  mode                   TEXT NOT NULL CHECK (mode IN ('standard', 'influencer')),
  commission_bps         INT NOT NULL CHECK (commission_bps BETWEEN 0 AND 10000),
  rules_snapshot         JSONB NOT NULL,
  assignment_snapshot    JSONB,
  attributed_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  commission_ends_at     TIMESTAMPTZ,
  status                 TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'void')),
  void_reason            TEXT,
  voided_at              TIMESTAMPTZ,
  risk_flags             JSONB NOT NULL DEFAULT '[]'::jsonb,
  risk_review_status     TEXT NOT NULL DEFAULT 'none' CHECK (risk_review_status IN ('none', 'flagged', 'cleared', 'confirmed_abuse')),
  signup_ip_hash         TEXT,
  signup_ua_hash         TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Self-referral backstop (the application checks first; the database refuses regardless).
  CHECK (referrer_user_id <> referred_user_id)
);
CREATE INDEX IF NOT EXISTS referral_attributions_referrer_idx ON referral_attributions (referrer_user_id, attributed_at DESC);
CREATE INDEX IF NOT EXISTS referral_attributions_program_idx ON referral_attributions (program_id);
CREATE INDEX IF NOT EXISTS referral_attributions_risk_idx ON referral_attributions (risk_review_status) WHERE risk_review_status = 'flagged';
CREATE INDEX IF NOT EXISTS referral_attributions_signup_fp_idx ON referral_attributions (referrer_user_id, signup_ip_hash, signup_ua_hash);

-- Every claim outcome, including the rejected ones (self-referral, existing customer, not new,
-- disabled referrer...), for abuse reporting. Append-only by convention (no UPDATE path exists).
CREATE TABLE IF NOT EXISTS referral_attribution_attempts (
  id                 TEXT PRIMARY KEY,
  referred_user_id   TEXT NOT NULL REFERENCES users(id),
  code_id            TEXT REFERENCES referral_codes(id),
  outcome            TEXT NOT NULL CHECK (outcome IN ('attributed', 'rejected')),
  reason             TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS referral_attribution_attempts_code_idx ON referral_attribution_attempts (code_id, created_at DESC);

CREATE TABLE IF NOT EXISTS referral_earning_lots (
  id                              TEXT PRIMARY KEY,
  seq                             BIGSERIAL NOT NULL,
  referrer_user_id                TEXT NOT NULL REFERENCES users(id),
  attribution_id                  TEXT NOT NULL REFERENCES referral_attributions(id),
  program_id                      TEXT NOT NULL REFERENCES referral_programs(id),
  program_version_id              TEXT NOT NULL REFERENCES referral_program_versions(id),
  source                          TEXT NOT NULL CHECK (source IN ('subscription', 'storage_purchase', 'ai_margin')),
  source_event_id                 TEXT NOT NULL,
  -- Set only for payment-derived earnings (an ai_margin lot is keyed by its settlement ledger key).
  -- UNIQUE = "one commission per qualifying payment", the idempotency identity the spec requires.
  payment_transaction_id          TEXT UNIQUE REFERENCES payment_transactions(id),
  commissionable_base_micro_usd   BIGINT NOT NULL CHECK (commissionable_base_micro_usd >= 0),
  commission_bps                  INT NOT NULL CHECK (commission_bps BETWEEN 0 AND 10000),
  original_micro_usd              BIGINT NOT NULL CHECK (original_micro_usd > 0),
  ai_converted_micro_usd          BIGINT NOT NULL DEFAULT 0 CHECK (ai_converted_micro_usd >= 0),
  payout_reserved_micro_usd       BIGINT NOT NULL DEFAULT 0 CHECK (payout_reserved_micro_usd >= 0),
  paid_micro_usd                  BIGINT NOT NULL DEFAULT 0 CHECK (paid_micro_usd >= 0),
  reversed_micro_usd              BIGINT NOT NULL DEFAULT 0 CHECK (reversed_micro_usd >= 0),
  matures_at                      TIMESTAMPTZ NOT NULL,
  snapshot                        JSONB NOT NULL,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, source_event_id),
  CHECK (ai_converted_micro_usd + payout_reserved_micro_usd + paid_micro_usd + reversed_micro_usd <= original_micro_usd)
);
CREATE INDEX IF NOT EXISTS referral_earning_lots_fifo_idx ON referral_earning_lots (referrer_user_id, matures_at, seq);
CREATE INDEX IF NOT EXISTS referral_earning_lots_attribution_idx ON referral_earning_lots (attribution_id);
CREATE INDEX IF NOT EXISTS referral_earning_lots_program_idx ON referral_earning_lots (program_id);

-- Every earning decision, including the ones that produced NO lot (skipped: source not eligible,
-- outside term, margin guard, cap...), keyed by the same (source, source_event_id) identity so a
-- replayed confirmTransaction or an admin reprocess never re-decides and never double-records.
CREATE TABLE IF NOT EXISTS referral_earning_outcomes (
  id                 TEXT PRIMARY KEY,
  source             TEXT NOT NULL CHECK (source IN ('subscription', 'storage_purchase', 'ai_margin', 'wallet_topup')),
  source_event_id    TEXT NOT NULL,
  attribution_id     TEXT REFERENCES referral_attributions(id),
  lot_id             TEXT REFERENCES referral_earning_lots(id),
  outcome            TEXT NOT NULL CHECK (outcome IN ('earned', 'clamped', 'skipped')),
  reason             TEXT,
  math               JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, source_event_id)
);

-- Append-only earnings ledger: every movement of referral value, in the seven spec states
-- (pending, available_cash, ai_converted, payout_reserved, paid, reversed, debt). A correction is
-- always a new row. idempotency_key is UNIQUE, so a retried operation can never double-write.
CREATE TABLE IF NOT EXISTS referral_ledger_entries (
  id                 TEXT PRIMARY KEY,
  seq                BIGSERIAL NOT NULL,
  user_id            TEXT NOT NULL REFERENCES users(id),
  lot_id             TEXT REFERENCES referral_earning_lots(id),
  entry_type         TEXT NOT NULL CHECK (entry_type IN (
    'EARN', 'CONVERT_AI', 'RESERVE_PAYOUT', 'RELEASE_PAYOUT', 'PAYOUT_PAID',
    'REVERSE_PENDING', 'REVERSE_AVAILABLE', 'REVERSE_RESERVED', 'DEBT_OPENED', 'DEBT_RESOLVED'
  )),
  state              TEXT NOT NULL CHECK (state IN ('pending', 'available_cash', 'ai_converted', 'payout_reserved', 'paid', 'reversed', 'debt')),
  amount_micro_usd   BIGINT NOT NULL CHECK (amount_micro_usd > 0),
  idempotency_key    TEXT NOT NULL UNIQUE,
  ref_type           TEXT,
  ref_id             TEXT,
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS referral_ledger_entries_user_idx ON referral_ledger_entries (user_id, seq DESC);
CREATE INDEX IF NOT EXISTS referral_ledger_entries_lot_idx ON referral_ledger_entries (lot_id);

-- One row per (lot, trigger): idempotent reversal bookkeeping. `trigger_ref` is the refund
-- transaction id (or the admin-supplied reference for a chargeback/cancellation).
CREATE TABLE IF NOT EXISTS referral_reversals (
  id                              TEXT PRIMARY KEY,
  lot_id                          TEXT NOT NULL REFERENCES referral_earning_lots(id),
  trigger                         TEXT NOT NULL CHECK (trigger IN ('refund', 'chargeback', 'cancellation', 'admin_void')),
  trigger_ref                     TEXT NOT NULL,
  commission_after_micro_usd      BIGINT NOT NULL CHECK (commission_after_micro_usd >= 0),
  from_remaining_micro_usd        BIGINT NOT NULL DEFAULT 0 CHECK (from_remaining_micro_usd >= 0),
  from_reserved_micro_usd         BIGINT NOT NULL DEFAULT 0 CHECK (from_reserved_micro_usd >= 0),
  debt_micro_usd                  BIGINT NOT NULL DEFAULT 0 CHECK (debt_micro_usd >= 0),
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lot_id, trigger, trigger_ref)
);

-- A refund/chargeback that arrives AFTER the value was already converted to AI credit or paid out
-- cannot be clawed back in place: it becomes recoverable debt. While any case is open the
-- account's payouts are blocked and conversions are limited to (available - open debt).
CREATE TABLE IF NOT EXISTS referral_debt_cases (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES users(id),
  lot_id                TEXT NOT NULL REFERENCES referral_earning_lots(id),
  trigger               TEXT NOT NULL CHECK (trigger IN ('refund', 'chargeback', 'cancellation', 'admin_void')),
  trigger_ref           TEXT NOT NULL,
  amount_micro_usd      BIGINT NOT NULL CHECK (amount_micro_usd > 0),
  recovered_micro_usd   BIGINT NOT NULL DEFAULT 0 CHECK (recovered_micro_usd >= 0),
  status                TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'recovering', 'resolved', 'written_off')),
  resolution_note       TEXT,
  resolved_by           TEXT REFERENCES users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at           TIMESTAMPTZ,
  UNIQUE (lot_id, trigger, trigger_ref),
  CHECK (recovered_micro_usd <= amount_micro_usd)
);
CREATE INDEX IF NOT EXISTS referral_debt_cases_user_open_idx ON referral_debt_cases (user_id) WHERE status IN ('open', 'recovering');

-- A voluntary, IRREVERSIBLE conversion of referral earnings into AI wallet credit. wallet_ledger_id
-- links the REFERRAL_AI_CONVERSION wallet ledger row created in the SAME database transaction.
CREATE TABLE IF NOT EXISTS referral_ai_conversions (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id),
  amount_micro_usd    BIGINT NOT NULL CHECK (amount_micro_usd > 0),
  idempotency_key     TEXT NOT NULL,
  wallet_ledger_id    TEXT NOT NULL UNIQUE REFERENCES wallet_ledger(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);

-- Append-only evidence: the ledger and conversions are never edited or removed after the fact.
CREATE OR REPLACE FUNCTION referral_append_only_reject_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only (% refused)', TG_TABLE_NAME, TG_OP USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS referral_ledger_entries_immutable ON referral_ledger_entries;
CREATE TRIGGER referral_ledger_entries_immutable
  BEFORE UPDATE OR DELETE ON referral_ledger_entries FOR EACH ROW EXECUTE PROCEDURE referral_append_only_reject_change();
DROP TRIGGER IF EXISTS referral_ai_conversions_immutable ON referral_ai_conversions;
CREATE TRIGGER referral_ai_conversions_immutable
  BEFORE UPDATE OR DELETE ON referral_ai_conversions FOR EACH ROW EXECUTE PROCEDURE referral_append_only_reject_change();
DROP TRIGGER IF EXISTS referral_reversals_immutable ON referral_reversals;
CREATE TRIGGER referral_reversals_immutable
  BEFORE UPDATE OR DELETE ON referral_reversals FOR EACH ROW EXECUTE PROCEDURE referral_append_only_reject_change();
DROP TRIGGER IF EXISTS referral_attribution_attempts_immutable ON referral_attribution_attempts;
CREATE TRIGGER referral_attribution_attempts_immutable
  BEFORE UPDATE OR DELETE ON referral_attribution_attempts FOR EACH ROW EXECUTE PROCEDURE referral_append_only_reject_change();

-- Wallet ledger type for the AI conversion. 027_wallet.sql / 064 restrict wallet_ledger.type with a
-- CHECK; the old constraint is found by its definition (never by a guessed name) and replaced with a
-- widened one - the same DO-block pattern 064_discount_codes.sql uses. Widening never invalidates rows.
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
  'SUBSCRIPTION_BONUS', 'SUBSCRIPTION_BONUS_REVERSAL', 'REFERRAL_AI_CONVERSION'
));
