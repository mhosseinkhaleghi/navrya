-- Defect #5 (Accounts domain, phase 2): trading sessions become optionally account-scoped.
-- Additive only - expand, never edit 001-021.
--
-- Nullable and ON DELETE SET NULL, same convention as trades.account_id (021_accounts.sql):
-- a session created before the user's first account, or one the user deliberately leaves
-- unassigned, keeps account_id NULL forever - never retroactively forced onto an account, and
-- never lost if the account it pointed at is later removed. Unlike trades.account_id, a session
-- is never made mandatory here - Session Start offers the picker (defect #5's UI), but nothing
-- server-side rejects an accountless session, since a session is a journal/workspace concept,
-- not a money-attribution one the way a trade is.
ALTER TABLE trading_sessions ADD COLUMN IF NOT EXISTS account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS trading_sessions_account_idx ON trading_sessions (account_id);
