-- Phase 8a of the local-first-to-server-authoritative migration (see ARCHITECTURE.md's Known
-- Constraints section for the full Phase 8 plan). Two independent domains, bundled into one
-- migration file because they were built together, not because they are related:
--
-- session_signatures - real user data (session-signature-store.js's derived per-session
-- analysis records: what happened, what patterns/strategies were involved, how it resolved).
-- Flat columns for every field the client actually filters/compares on (session_id, character,
-- market, timeframe, date, fate_summary_text); the rest (movement_sequence, pattern_ids,
-- strategy_ids, scenario_outcomes, trade_summary) stay jsonb, since nothing anywhere queries
-- into their individual fields - same "flat where compared, jsonb where opaque" convention
-- 009_trades.sql already established for takeProfits/emotionLog/aiPredictionLinks.
CREATE TABLE IF NOT EXISTS session_signatures (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id          TEXT NOT NULL,
  character           TEXT NOT NULL DEFAULT '',
  market              TEXT NOT NULL DEFAULT '',
  timeframe           TEXT NOT NULL DEFAULT '',
  date                TEXT NOT NULL DEFAULT '',
  movement_sequence   JSONB NOT NULL DEFAULT '[]',
  pattern_ids         JSONB NOT NULL DEFAULT '[]',
  strategy_ids        JSONB NOT NULL DEFAULT '[]',
  scenario_outcomes   JSONB NOT NULL DEFAULT '[]',
  trade_summary       JSONB NOT NULL DEFAULT '{}',
  fate_summary_text   TEXT NOT NULL DEFAULT '',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS session_signatures_user_idx ON session_signatures (user_id);
-- The client's own upsert() already dedupes by sessionId (looks up the existing row's real `id`
-- and reuses it before ever calling this endpoint) - this unique index is a defensive backstop,
-- not the primary dedupe mechanism: it turns a real bug (two different ids racing to create a
-- signature for the same session) into a loud constraint violation instead of a silent duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS session_signatures_user_session_idx ON session_signatures (user_id, session_id);

-- user_preferences - a generic {user_id, pref_key -> value} store, one row per preference, for
-- every Phase 8 sub-module that is a small scalar/object setting rather than a growing list of
-- its own records. Same "one generic natural-key store beats N near-identical typed tables"
-- reasoning as 012_xp_config_overrides.sql, scoped per-user instead of global. Each Phase 8
-- sub-module owns its own pref_key namespace (documented at its own call site, e.g.
-- session-signature-ui.js's 'similarityThreshold') - this table has no opinion on what any key
-- means, only that a value exists for it.
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pref_key     TEXT NOT NULL,
  value        JSONB NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, pref_key)
);
