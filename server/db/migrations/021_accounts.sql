-- NAVRYA Accounts domain (Prop Firm / Personal trading accounts). Additive only - expand,
-- never edit 001-020. Mirrors accounts.types.js's Account shape the same way 009_trades.sql
-- mirrors trade.types.js's Trade shape.
--
-- There is deliberately no `equity`/`balance`/`todayPL`/`totalPL`/connection-state column here:
-- this app has no real broker/prop-firm API integration, so any such figure could only ever be
-- fabricated or stale. Every account is manual by construction. Equity/P&L/risk-in-use are all
-- derived on the client, on read, from `starting_balance` plus the real trades whose
-- `account_id` points at this row (see accounts-engine.js) - never stored, so there is nothing
-- here that can silently drift from the truth or imply a live feed that does not exist.
--
-- `rules` is one jsonb blob (prop vs personal rule configs have a different shape entirely -
-- see accounts.types.js's normalizeRules()) rather than ~10 nullable columns, matching the
-- `commission`/`ai_initial_analysis` precedent on `trades` for a small nested structure nothing
-- queries into individually server-side. It is normalized/validated on write by both the client
-- store and routes.accounts.mjs, never trusted as free-form input.
CREATE TABLE IF NOT EXISTS accounts (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind              TEXT NOT NULL CHECK (kind IN ('prop','personal')),
  firm              TEXT NOT NULL DEFAULT '',
  program           TEXT,
  platform          TEXT,
  number_masked     TEXT,
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  archived_at       TIMESTAMPTZ,
  currency          TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD','EUR','GBP','AUD')),
  start_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  starting_balance  NUMERIC NOT NULL DEFAULT 0,
  rules             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS accounts_user_idx ON accounts (user_id);

-- Trade attribution. A real FK (unlike linked_pattern_ids/linked_strategy_id's deliberately
-- loose TEXT convention - see 009_trades.sql's comment) because an account is a money/ownership
-- boundary: misattributing a trade to another user's account would be a real cross-tenant leak,
-- not just a broken UI label. ON DELETE SET NULL, never CASCADE - archiving/removing an account
-- must never delete trade history (see repo.*.accounts.remove(), which archives rather than
-- deletes whenever any trade still references the account). Existing trades get NULL here and
-- render as "Unassigned" client-side - never silently attributed to a new account.
ALTER TABLE trades ADD COLUMN IF NOT EXISTS account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS trades_account_idx ON trades (account_id);

-- Free-text instrument ticker (e.g. "XAUUSD"). Additive gap-fill for the Performance tab's
-- "by instrument" breakdown and the Pre-trade check's open-exposure table - trade.types.js's
-- Trade shape never had a symbol/instrument field before this domain needed one. Nullable/free
-- text on purpose: this app has no instrument master list to validate against, and never will
-- without a real market-data integration.
ALTER TABLE trades ADD COLUMN IF NOT EXISTS instrument TEXT;
