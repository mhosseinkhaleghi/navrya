-- Commercial System Slice 2: the real payment transaction system (spec section 14/15). Every
-- Wallet top-up / subscription purchase / storage purchase / refund flows through exactly one of
-- these rows - an entitlement or Wallet credit is only ever granted after `status='confirmed'`
-- (server/commercial/payment-service.mjs is the one place that transition happens). `metadata`
-- carries the commercial-config SNAPSHOT captured at creation time (plan price, storage product
-- capacity/price/validity) - confirmation only ever copies these already-frozen values, never
-- re-reads current config (spec section 6/7's "existing purchase is unaffected by a later price
-- change").
--
-- marketplace_purchases (003_marketplace_and_messaging.sql) cannot be reused here - it carries a
-- DB-level CHECK (mock = TRUE) that physically forbids a non-mock row.
CREATE TABLE IF NOT EXISTS payment_transactions (
  id                       TEXT PRIMARY KEY,
  user_id                  TEXT NOT NULL REFERENCES users(id),
  type                     TEXT NOT NULL CHECK (type IN ('wallet_topup','subscription','storage_purchase','refund')),
  provider                 TEXT NOT NULL DEFAULT 'manual',
  external_transaction_id  TEXT,
  status                   TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','failed','refunded')),
  amount_micro_usd         BIGINT NOT NULL,
  currency                 TEXT NOT NULL DEFAULT 'USD',
  product_id               TEXT,
  metadata                 JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at             TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS payment_transactions_user_created_idx ON payment_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_transactions_status_idx ON payment_transactions (status, created_at DESC);

-- Idempotency guard for provider events (spec section 15) - same natural-key/purpose-tagged shape
-- as auth_transactions (020_auth_sessions.sql): a (provider, external_event_id) pair can only
-- ever be processed once. The Manual/Test provider's admin-confirm action synthesizes its own
-- external_event_id ('manual:{transactionId}:confirm') so even an admin double-clicking Confirm
-- goes through this exact same guard a real Stripe webhook replay would.
CREATE TABLE IF NOT EXISTS payment_events (
  id                  TEXT PRIMARY KEY,
  provider            TEXT NOT NULL,
  external_event_id   TEXT NOT NULL,
  transaction_id      TEXT REFERENCES payment_transactions(id),
  processed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, external_event_id)
);
