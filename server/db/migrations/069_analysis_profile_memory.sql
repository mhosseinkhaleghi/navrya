-- Analysis Profile engine memory (ARCHITECTURE.md §7.25) - the learning loop a trader can teach
-- over time, mirroring how Patterns/Strategies already carry a chat + learned understanding.
--
--   concepts       [{id, title, description, priority: 'mandatory'|'preferred'|'reference',
--                    origin: 'user'|'ai'|'source'|'chat'|'starter', enabled, createdAt}] - specific,
--                   checkable things the engine should look for under this profile (e.g. "Elliott
--                   impulse count", "swept liquidity levels"). A small JSON document nothing
--                   queries into individually, same reasoning as custom_focuses (068).
--   understanding  {summary, version, updatedAt} - the engine's own compact, evolving
--                   understanding of how this trader reads a chart under this profile.
--
-- Additive only (expand, never edit 001-068): both columns default to their empty document, so
-- every existing row and every older client that never sends them keeps working unchanged.
ALTER TABLE analysis_profiles
  ADD COLUMN IF NOT EXISTS concepts      JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS understanding JSONB NOT NULL DEFAULT '{"summary":"","version":0,"updatedAt":null}';

-- analysis_profile_events - the append-only learning ledger: one row per real teaching moment
-- (a note saved, a source ingested, a chat lesson approved, a correction applied), so the Memory
-- tab can show real history instead of only the current understanding snapshot. Never updated or
-- deleted by anything in this codebase - a correction is always a NEW event, never a rewrite of an
-- old one (the same "history is append-only" convention trades/probabilityHistory already uses).
--
-- Lazily loaded only when a profile's Memory tab opens (never part of the boot-time replica
-- hydrate) - kept as its own table, not embedded JSON on analysis_profiles, since it grows
-- unboundedly over a profile's lifetime.
CREATE TABLE IF NOT EXISTS analysis_profile_events (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id            TEXT NOT NULL REFERENCES analysis_profiles(id) ON DELETE CASCADE,
  kind                  TEXT NOT NULL,
  title                 TEXT NOT NULL DEFAULT '',
  detail                TEXT NOT NULL DEFAULT '',
  understanding_version INTEGER,
  -- {promptTokens, completionTokens, ...} for an AI-assisted event (the /ingest route); null for
  -- a free manual edit that spent no tokens - the Memory tab's "tokens spent teaching this
  -- profile" total is a real SUM over this column, never estimated.
  token_usage           JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analysis_profile_events_profile_idx ON analysis_profile_events (profile_id, created_at);
CREATE INDEX IF NOT EXISTS analysis_profile_events_user_idx ON analysis_profile_events (user_id);
