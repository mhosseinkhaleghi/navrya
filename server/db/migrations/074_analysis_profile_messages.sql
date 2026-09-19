-- Analysis Profile teaching chat (Phase 4, ARCHITECTURE.md §7.25): the conversation a trader has with
-- the engine to teach a profile. A CHILD table, like analysis_profile_events / analysis_profile_sources
-- - lazily fetched only when the Chat tab opens, never part of the boot-time replica hydrate.
--
--   role          'user' | 'assistant'.
--   content       the message text (the API caps it; a reply that carries only proposals may be empty).
--   proposals     assistant messages only: what the engine PROPOSED to learn from this turn - an array of
--                 { id, kind: 'concept' | 'understanding', ..., status: 'pending' | 'applied' | 'dismissed' }.
--                 A proposal changes nothing until the trader applies it; the status is kept so a reloaded
--                 conversation never offers an already-applied proposal a second time. Only the STATUS is
--                 ever updatable afterwards - the engine's words cannot be rewritten.
--   token_usage   assistant messages only: the REAL usage the provider reported for the call that produced
--                 the message ({ promptTokens, completionTokens }), NULL for a user message and for a call
--                 made with the trader's own API key.
--
-- Rolling log, not an archive: the API keeps at most the latest 200 messages per profile. Additive only
-- (expand, never edit 001-070): a brand-new table, IF NOT EXISTS everywhere.

CREATE TABLE IF NOT EXISTS analysis_profile_messages (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id   TEXT NOT NULL REFERENCES analysis_profiles(id) ON DELETE CASCADE,
  role         TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content      TEXT NOT NULL DEFAULT '',
  proposals    JSONB NOT NULL DEFAULT '[]',
  token_usage  JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analysis_profile_messages_profile ON analysis_profile_messages (profile_id, created_at);
CREATE INDEX IF NOT EXISTS idx_analysis_profile_messages_user ON analysis_profile_messages (user_id);
