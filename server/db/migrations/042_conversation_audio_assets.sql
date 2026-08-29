-- Journey H2, Gate 3: pre-generated Voice audio for admin-published, STATIC Conversation Studio
-- responses (faq/surface_help scenarios only - never data_query, whose text is rendered from a
-- live per-user template variable and can never be safely shared as one static clip; enforced in
-- code at the generation endpoint, not by this schema alone).
--
-- One row per generated candidate. At most one row per (scenario_version_id, language,
-- variant_key) may ever be status='approved' at a time - enforced by a partial unique index, the
-- same technique 004_admin.sql's user_sessions_one_open_idx already established in this codebase.
-- Approving a new candidate for an already-approved slot archives the old one in the same
-- transaction (never deletes it - full history stays queryable for audit/comparison, per the
-- brief's own "preserve sufficient auditability" instruction).
--
-- "Staleness" is never a stored column - a scenario VERSION's definition is immutable once
-- published (Gate 2), so an approved asset for a published version can never go stale under it by
-- construction; staleness only matters for a still-mutable DRAFT version's own draft-audio
-- candidates, and is computed at read time by recomputing content_hash from the version's CURRENT
-- definition and comparing.

CREATE TABLE IF NOT EXISTS conversation_audio_assets (
  id                     TEXT PRIMARY KEY,
  scenario_id            TEXT NOT NULL REFERENCES conversation_scenarios(id) ON DELETE CASCADE,
  scenario_version_id    TEXT NOT NULL REFERENCES conversation_scenario_versions(id) ON DELETE CASCADE,
  language               TEXT NOT NULL,
  variant_key            TEXT NOT NULL DEFAULT 'standard',
  content_hash           TEXT NOT NULL,
  provider               TEXT NOT NULL DEFAULT 'elevenlabs',
  voice_profile_key      TEXT NOT NULL,
  voice_id               TEXT NOT NULL,
  model_id               TEXT,
  file_url               TEXT NOT NULL,
  mime_type              TEXT NOT NULL,
  duration_ms            INTEGER,
  status                 TEXT NOT NULL DEFAULT 'preview' CHECK (status IN ('preview','approved','archived')),
  created_by             TEXT REFERENCES users(id),
  approved_by            TEXT REFERENCES users(id),
  approved_at            TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conversation_audio_assets_version_idx ON conversation_audio_assets (scenario_version_id, language, variant_key);
CREATE UNIQUE INDEX IF NOT EXISTS conversation_audio_assets_one_approved_idx
  ON conversation_audio_assets (scenario_version_id, language, variant_key) WHERE status = 'approved';
