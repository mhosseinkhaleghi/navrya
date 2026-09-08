-- Voice Command Learning Profile addendum. Additive only - expand, never edit 001-054.
--
-- One user-owned row per learned phrase->action mapping (id is client-generated, the same
-- idempotent-upsert-by-client-id shape as accounts/instrument_catalog). A phrase is unique per
-- user after normalization+language, mirroring instrument_catalog's own "unique per user after
-- normalization" rule exactly - a genuine correction (same phrase, different action/mapping)
-- updates the existing row rather than creating a second, competing one for the same phrase.
--
-- field_mappings/target_strategy deliberately never store a permanent entity id (trade/session/
-- recipient/message id) - see server/db/learned-command-normalize.mjs's looksLikeOpaqueId() for
-- the write-time backstop. target_strategy instead names one of a small, safe set of resolution
-- strategies (active_open_trade, currently_open_session, most_recent_matching_entity,
-- ask_when_multiple - see SAFE_TARGET_STRATEGIES in that same module) that the real Action
-- Registry resolution path (client-side) re-resolves fresh every time the mapping fires, never a
-- stale id from whenever it was first learned.
--
-- normalized_phrase is the ONLY form of "what the user said" this table may ever hold - never a
-- raw transcript (see learned-command-normalize.mjs's normalizeLearnedPhrase(), the one place
-- allowed to produce this value).
CREATE TABLE IF NOT EXISTS learned_commands (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  normalized_phrase TEXT NOT NULL,
  language          TEXT,
  action_id         TEXT NOT NULL,
  field_mappings    JSONB NOT NULL DEFAULT '{}',
  target_strategy   TEXT,
  source            TEXT NOT NULL DEFAULT 'explicit_approval',
  confidence        INTEGER NOT NULL DEFAULT 60,
  success_count     INTEGER NOT NULL DEFAULT 0,
  correction_count  INTEGER NOT NULL DEFAULT 0,
  last_used_at      TIMESTAMPTZ,
  enabled           BOOLEAN NOT NULL DEFAULT true,
  schema_version    INTEGER NOT NULL DEFAULT 1,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS learned_commands_user_idx ON learned_commands (user_id);
-- The real uniqueness rule this domain exists to enforce, relied on directly by
-- repo.pg.mjs's learnedCommands.upsert()/findByPhrase() - one mapping per (user, phrase,
-- language), so a correction updates it in place rather than ever creating a duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS learned_commands_user_phrase_idx ON learned_commands (user_id, normalized_phrase, COALESCE(language, ''));
-- Resolution-time lookup ("does the user have an enabled mapping I should check before falling
-- through to the model") always filters on enabled=true - a partial index keeps that hot path
-- cheap without scanning disabled/corrected-away rows.
CREATE INDEX IF NOT EXISTS learned_commands_user_enabled_idx ON learned_commands (user_id) WHERE enabled = true;
