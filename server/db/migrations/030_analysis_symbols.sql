-- Commercial System Slice 1: the "Active Analysis Symbols" entitlement (spec section 6/51). No
-- existing "active symbol"/watchlist concept was found anywhere in this codebase (checked via a
-- repo-wide grep before adding this - see the Slice 1 plan's own "open item" note), so this is a
-- genuinely new, minimal primitive: a plain set of symbols a user has registered for AI analysis,
-- enforced by the same plan-limit mechanism as Patterns/Strategies/Sessions/Accounts
-- (server/commercial/quota.mjs). Free's limit is 1 but replaceable (spec section 6): the client
-- removes the old row then adds the new one, regaining the quota slot exactly like deleting a
-- Pattern does - no special "replace" verb needed at this layer.
CREATE TABLE IF NOT EXISTS user_analysis_symbols (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id),
  symbol       TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_analysis_symbols_user_idx ON user_analysis_symbols (user_id);
