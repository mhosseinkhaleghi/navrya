-- Instrument Catalog domain + mandatory exact-instrument matching. Additive only - expand,
-- never edit 001-024.
--
-- Context: `market`/city (trading_sessions.market, session_signatures.market) is a workspace/
-- timezone concept, never a financial symbol - a "NewYork" BTC session and a "NewYork" XAU
-- session share nothing except which clock they were opened against. Similarity/reporting code
-- only ever gated on that column, so two completely different instruments were fully comparable
-- whenever their city happened to match. `trades.instrument` (021_accounts.sql) already exists
-- but that migration's own comment states plainly this app "has no instrument master list to
-- validate against, and never will" - this migration is exactly that master list, now that one
-- is needed to make instrument matching a real, enforceable gate instead of free text.
--
-- One user-owned catalog row per known instrument code (XAUUSD, BTCUSDT, ...), unique per user
-- after normalization (trim/uppercase - see instrument-normalize.mjs). Every consumer below
-- stores the plain normalized CODE STRING directly (never the catalog row's own id) - this is
-- deliberately the same "instrument is the exact code, not a foreign id" shape trades.instrument
-- already established, so catalog membership is checked at the application layer
-- (repo.pg.mjs/repo.memory.mjs's assertInstrumentInCatalog()), not via a DB foreign key: a plain
-- TEXT/TEXT[] column keeps every consumer (a single value on trades/trading_sessions/
-- session_signatures, an array on patterns) uniform, where a composite FK could only ever cover
-- the single-value columns (Postgres has no native per-element FK for a text[] column).
CREATE TABLE IF NOT EXISTS instrument_catalog (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code          TEXT NOT NULL,
  display_name  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS instrument_catalog_user_idx ON instrument_catalog (user_id);
-- The one real uniqueness rule this domain exists to enforce - "Codes must be unique per user
-- after normalization" - relied on directly by repo.pg.mjs's instrumentCatalog.upsert() to turn a
-- duplicate add into a real 409, not a silent second row.
CREATE UNIQUE INDEX IF NOT EXISTS instrument_catalog_user_code_idx ON instrument_catalog (user_id, code);

-- Sessions: nullable/free of a default on purpose - a session created before this migration (or
-- one a user has not yet classified) keeps instrument NULL forever rather than a guessed value,
-- same "never invent a default" rule 022_sessions_accounts.sql already applied to account_id.
-- Mandatory only for a BRAND NEW session going forward - enforced in tradingSessions.upsert(),
-- never retroactively on an update to a pre-existing NULL row.
ALTER TABLE trading_sessions ADD COLUMN IF NOT EXISTS instrument TEXT;
CREATE INDEX IF NOT EXISTS trading_sessions_user_instrument_idx ON trading_sessions (user_id, instrument);

-- Trades: trades.instrument itself already exists (021_accounts.sql) - this only adds the index
-- now that instrument becomes a real, frequently-filtered dimension (Performance's "by
-- instrument" breakdown, the new session-library/strategy-hub filters, catalog-membership
-- lookups).
CREATE INDEX IF NOT EXISTS trades_user_instrument_idx ON trades (user_id, instrument);

-- Session signatures: same nullable/no-default convention as trading_sessions.instrument above.
-- A signature backfilled from a legacy, instrument-less session stays NULL and is therefore
-- excluded by session-signature-engine.js's fail-closed gate automatically - no separate
-- "unassigned" bookkeeping needed.
ALTER TABLE session_signatures ADD COLUMN IF NOT EXISTS instrument TEXT;
CREATE INDEX IF NOT EXISTS session_signatures_user_instrument_idx ON session_signatures (user_id, instrument);

-- Patterns: a pattern can apply to more than one instrument (e.g. a liquidity-sweep pattern
-- valid on both XAUUSD and BTCUSDT), hence an array rather than a single column. Defaults to
-- '{}' (not NULL) so `array_length`/`= ANY()` checks never need a NULL-guard - an empty array is
-- the one, unambiguous "unassigned/legacy, not selectable anywhere" state pattern-registry-
-- store.js's listForInstrument() and every consumer filter checks for.
ALTER TABLE patterns ADD COLUMN IF NOT EXISTS instruments TEXT[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS patterns_instruments_gin_idx ON patterns USING GIN (instruments);
