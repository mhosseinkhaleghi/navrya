-- Referral & Affiliate subsystem, part 3/3: the MANUAL, audited BSC payout-request workflow.
-- Additive only. Requires 069.
--
-- Scope (deliberate): this domain records requests and their audited review; it never holds a key,
-- signs, or broadcasts anything. A treasury operator sends the USDT manually; an admin enters the
-- transaction hash; the SERVER then independently verifies it on-chain (chain 56, the configured
-- BEP-20 token contract, the configured treasury sender, the recipient, the EXACT atomic amount,
-- required confirmations) before a request may reach 'confirmed', and a DIFFERENT admin finalises
-- it to 'paid'. Payment transactions (payment_transactions / crypto_invoices) are incoming
-- purchases only - outbound withdrawals live in their own tables, here.
--
-- referral_payout_requests: amount, asset, chain, token, decimals, atomic amount, treasury sender,
-- recipient (encrypted at rest, plus an HMAC for lookups and a masked display value) and the
-- policy/terms/acknowledgement snapshots are IMMUTABLE once submitted - the trigger below refuses
-- any change to them, and refuses any status change the state machine does not allow.
CREATE TABLE IF NOT EXISTS referral_payout_requests (
  id                        TEXT PRIMARY KEY,
  user_id                   TEXT NOT NULL REFERENCES users(id),
  idempotency_key           TEXT NOT NULL,
  amount_micro_usd          BIGINT NOT NULL CHECK (amount_micro_usd > 0),
  asset_symbol              TEXT NOT NULL,
  chain_id                  INT NOT NULL CHECK (chain_id = 56),  -- BSC Mainnet only; never user-selectable
  token_contract            TEXT NOT NULL CHECK (token_contract ~ '^0x[0-9a-fA-F]{40}$'),
  token_decimals            INT NOT NULL CHECK (token_decimals BETWEEN 6 AND 36),
  atomic_amount             TEXT NOT NULL CHECK (atomic_amount ~ '^[1-9][0-9]*$'),
  treasury_sender           TEXT NOT NULL CHECK (treasury_sender ~ '^0x[0-9a-fA-F]{40}$'),
  recipient_address_enc     TEXT NOT NULL,   -- AES-256-GCM envelope (crypto-util.mjs encryptSecret); never plaintext
  recipient_address_hash    TEXT NOT NULL,   -- HMAC of the lower-cased address: dedupe / future blocklist, not reversible
  recipient_masked          TEXT NOT NULL,
  status                    TEXT NOT NULL DEFAULT 'requested' CHECK (status IN (
    'requested', 'under_review', 'approved', 'submitted', 'confirmed', 'paid', 'rejected', 'cancelled', 'failed'
  )),
  policy_snapshot           JSONB NOT NULL,
  terms_version             TEXT NOT NULL,
  acknowledgements          JSONB NOT NULL,
  kyc_status_snapshot       TEXT NOT NULL,
  email_verified_snapshot   BOOLEAN NOT NULL,
  reauth_at                 TIMESTAMPTZ,
  requested_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by               TEXT REFERENCES users(id),
  reviewed_at               TIMESTAMPTZ,
  approved_by               TEXT REFERENCES users(id),
  approved_at               TIMESTAMPTZ,
  submitted_by              TEXT REFERENCES users(id),
  submitted_at              TIMESTAMPTZ,
  tx_hash                   TEXT CHECK (tx_hash IS NULL OR tx_hash ~ '^0x[0-9a-f]{64}$'),  -- stored lower-cased
  verification              JSONB,
  confirmations             INT,
  confirmed_at              TIMESTAMPTZ,
  confirmed_by              TEXT REFERENCES users(id),
  finalized_by              TEXT REFERENCES users(id),
  paid_at                   TIMESTAMPTZ,
  rejection_reason          TEXT,
  failure_reason            TEXT,
  cancelled_at              TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key),
  CHECK (status NOT IN ('submitted', 'confirmed', 'paid') OR tx_hash IS NOT NULL),
  CHECK (status <> 'paid' OR (paid_at IS NOT NULL AND finalized_by IS NOT NULL))
);
-- A transaction hash can back at most one payout request, ever (also enforced against inbound
-- crypto_invoices.tx_hash inside the submit transaction, since that lives in a different table).
CREATE UNIQUE INDEX IF NOT EXISTS referral_payout_requests_tx_hash_uidx ON referral_payout_requests (tx_hash) WHERE tx_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS referral_payout_requests_user_idx ON referral_payout_requests (user_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS referral_payout_requests_status_idx ON referral_payout_requests (status, requested_at);
CREATE INDEX IF NOT EXISTS referral_payout_requests_recipient_idx ON referral_payout_requests (recipient_address_hash);

CREATE OR REPLACE FUNCTION referral_payout_requests_guard() RETURNS trigger AS $$
BEGIN
  -- Immutable once created: who, how much, where, which asset/chain, and the snapshots.
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.amount_micro_usd IS DISTINCT FROM OLD.amount_micro_usd
    OR NEW.asset_symbol IS DISTINCT FROM OLD.asset_symbol
    OR NEW.chain_id IS DISTINCT FROM OLD.chain_id
    OR NEW.token_contract IS DISTINCT FROM OLD.token_contract
    OR NEW.token_decimals IS DISTINCT FROM OLD.token_decimals
    OR NEW.atomic_amount IS DISTINCT FROM OLD.atomic_amount
    OR NEW.treasury_sender IS DISTINCT FROM OLD.treasury_sender
    OR NEW.recipient_address_enc IS DISTINCT FROM OLD.recipient_address_enc
    OR NEW.recipient_address_hash IS DISTINCT FROM OLD.recipient_address_hash
    OR NEW.recipient_masked IS DISTINCT FROM OLD.recipient_masked
    OR NEW.policy_snapshot IS DISTINCT FROM OLD.policy_snapshot
    OR NEW.terms_version IS DISTINCT FROM OLD.terms_version
    OR NEW.acknowledgements IS DISTINCT FROM OLD.acknowledgements
    OR NEW.kyc_status_snapshot IS DISTINCT FROM OLD.kyc_status_snapshot
    OR NEW.email_verified_snapshot IS DISTINCT FROM OLD.email_verified_snapshot
    OR NEW.requested_at IS DISTINCT FROM OLD.requested_at
  THEN
    RAISE EXCEPTION 'referral_payout_requests amount, recipient, asset and policy are immutable once submitted' USING ERRCODE = 'restrict_violation';
  END IF;
  -- The transaction hash may only be (re)entered while the request is approved/submitted; once
  -- confirmed/paid it is frozen.
  IF NEW.tx_hash IS DISTINCT FROM OLD.tx_hash AND OLD.status NOT IN ('approved', 'submitted') THEN
    RAISE EXCEPTION 'referral_payout_requests tx_hash can only be set while approved or submitted' USING ERRCODE = 'restrict_violation';
  END IF;
  -- Legal status transitions only (mirrors referral-rules.mjs's assertLegalPayoutTransition).
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'requested'    AND NEW.status IN ('under_review', 'cancelled', 'rejected'))
      OR (OLD.status = 'under_review' AND NEW.status IN ('approved', 'rejected'))
      OR (OLD.status = 'approved'     AND NEW.status IN ('submitted', 'rejected'))
      OR (OLD.status = 'submitted'    AND NEW.status IN ('confirmed', 'failed'))
      OR (OLD.status = 'confirmed'    AND NEW.status IN ('paid', 'failed'))
    ) THEN
      RAISE EXCEPTION 'referral_payout_requests illegal status transition % -> %', OLD.status, NEW.status USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS referral_payout_requests_guard_trg ON referral_payout_requests;
CREATE TRIGGER referral_payout_requests_guard_trg
  BEFORE UPDATE ON referral_payout_requests FOR EACH ROW EXECUTE PROCEDURE referral_payout_requests_guard();

CREATE OR REPLACE FUNCTION referral_payout_requests_reject_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'referral_payout_requests rows are never deleted (% refused)', TG_OP USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS referral_payout_requests_reject_delete_trg ON referral_payout_requests;
CREATE TRIGGER referral_payout_requests_reject_delete_trg
  BEFORE DELETE ON referral_payout_requests FOR EACH ROW EXECUTE PROCEDURE referral_payout_requests_reject_delete();

-- Append-only status history: who moved a request, from where to where, and why.
CREATE TABLE IF NOT EXISTS referral_payout_events (
  id            TEXT PRIMARY KEY,
  request_id    TEXT NOT NULL REFERENCES referral_payout_requests(id),
  from_status   TEXT,
  to_status     TEXT NOT NULL,
  actor_type    TEXT NOT NULL CHECK (actor_type IN ('user', 'admin', 'system')),
  actor_id      TEXT,
  note          TEXT,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS referral_payout_events_request_idx ON referral_payout_events (request_id, created_at);
DROP TRIGGER IF EXISTS referral_payout_events_immutable ON referral_payout_events;
CREATE TRIGGER referral_payout_events_immutable
  BEFORE UPDATE OR DELETE ON referral_payout_events FOR EACH ROW EXECUTE PROCEDURE referral_append_only_reject_change();

-- Which lots (and how much of each) a conversion or a payout request consumed. Immutable: the lot's
-- own bucket columns move, but this row is the permanent record of WHICH request took WHAT from
-- WHICH lot (exactly one of the two target columns is set, matching `kind`). A release/reversal is
-- recorded in the ledger and on the request, never by editing an allocation.
CREATE TABLE IF NOT EXISTS referral_lot_allocations (
  id                  TEXT PRIMARY KEY,
  lot_id              TEXT NOT NULL REFERENCES referral_earning_lots(id),
  user_id             TEXT NOT NULL REFERENCES users(id),
  kind                TEXT NOT NULL CHECK (kind IN ('ai_conversion', 'payout_reservation')),
  conversion_id       TEXT REFERENCES referral_ai_conversions(id),
  payout_request_id   TEXT REFERENCES referral_payout_requests(id),
  amount_micro_usd    BIGINT NOT NULL CHECK (amount_micro_usd > 0),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (kind = 'ai_conversion' AND conversion_id IS NOT NULL AND payout_request_id IS NULL)
    OR (kind = 'payout_reservation' AND payout_request_id IS NOT NULL AND conversion_id IS NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS referral_lot_allocations_conversion_uidx ON referral_lot_allocations (lot_id, conversion_id) WHERE conversion_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS referral_lot_allocations_payout_uidx ON referral_lot_allocations (lot_id, payout_request_id) WHERE payout_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS referral_lot_allocations_payout_idx ON referral_lot_allocations (payout_request_id);
DROP TRIGGER IF EXISTS referral_lot_allocations_immutable ON referral_lot_allocations;
CREATE TRIGGER referral_lot_allocations_immutable
  BEFORE UPDATE OR DELETE ON referral_lot_allocations FOR EACH ROW EXECUTE PROCEDURE referral_append_only_reject_change();
