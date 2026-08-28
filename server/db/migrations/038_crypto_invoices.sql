-- Real BSC (BNB Smart Chain) crypto payment invoices (task A). Exactly one invoice per
-- payment_transactions row (the same canonical payment lifecycle every other BillingProvider
-- uses - see server/commercial/manual-billing-provider.mjs) - a crypto_invoices row never exists
-- without a matching payment_transactions row, and never grants/credits anything itself. Only
-- server/commercial/payment-service.mjs's confirmTransaction() ever activates an entitlement or
-- wallet credit, exactly as for the Manual provider; this table exists purely to carry the
-- chain-specific facts needed to display and verify an on-chain payment.
--
-- Immutable in the same sense payment_transactions/wallet_ledger already are in this codebase:
-- created once with every pricing/snapshot fact frozen at creation time, and only status/
-- tx_hash/confirmation_count/confirmed_at are ever updated in place afterward - the frozen fields
-- (chain_id, token_contract, decimals, recipient_address, atomic_amount, exchange_rate_snapshot)
-- are never rewritten, so a later admin/config change can never retroactively alter what an
-- already-created invoice actually asked for.
--
-- Money/token precision: usd_amount_micro_usd is BIGINT microUSD (this codebase's existing
-- convention - never NUMERIC/float for authoritative money). atomic_amount is TEXT, not a numeric
-- column - it holds the exact base-unit token amount (e.g. wei-equivalent for an 18-decimal
-- BEP-20 token) as a decimal string, so it round-trips through BigInt exactly with zero float
-- precision loss in either direction (JS numbers cannot safely represent every possible uint256).
CREATE TABLE IF NOT EXISTS crypto_invoices (
  id                       TEXT PRIMARY KEY,
  transaction_id           TEXT NOT NULL UNIQUE REFERENCES payment_transactions(id),
  provider                 TEXT NOT NULL DEFAULT 'bsc_crypto',
  chain_id                 INTEGER NOT NULL,
  asset_symbol             TEXT NOT NULL,
  token_contract           TEXT NOT NULL,
  token_decimals           INTEGER NOT NULL,
  recipient_address        TEXT NOT NULL,
  atomic_amount            TEXT NOT NULL,
  usd_amount_micro_usd     BIGINT NOT NULL,
  exchange_rate_snapshot   NUMERIC NOT NULL,
  status                   TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','expired','failed')),
  expires_at               TIMESTAMPTZ NOT NULL,
  gateway_invoice_id       TEXT,
  -- UNIQUE (not just indexed) - the same on-chain transaction hash can never be claimed by two
  -- different invoices, even under a race between two verification attempts (task A.6's
  -- "transaction-hash uniqueness" requirement, enforced at the database level, not just in
  -- application logic).
  tx_hash                  TEXT UNIQUE,
  confirmation_count       INTEGER NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at             TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS crypto_invoices_status_expires_idx ON crypto_invoices (status, expires_at);
