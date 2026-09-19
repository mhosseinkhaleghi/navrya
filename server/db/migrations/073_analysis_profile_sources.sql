-- Analysis Profile knowledge sources (Phase 3, ARCHITECTURE.md §7.25): the website / YouTube /
-- PDF material a trader teaches a profile from. A CHILD table, deliberately NOT a JSONB column on
-- analysis_profiles - a source can carry a multi-KB digest and a reference to a stored file, is
-- added/removed/re-read independently of the profile record, and (like analysis_profile_events)
-- is lazily fetched only when a profile's Knowledge tab opens rather than riding the boot-time
-- replica hydrate every flat list domain participates in.
--
--   kind        'youtube' | 'website' | 'pdf'. A trader's generic "reference link" is a 'website'
--               source - if it is really a PDF URL the reader refuses it (content-type gate) and
--               the row records why, rather than this table growing a fourth kind.
--   status      'queued' (added, not read yet - e.g. a wizard link) | 'ready' (has a digest, or is
--               a stored PDF) | 'taught' (the engine already learned from it) | 'failed'
--               (a read attempt failed; error_code says why, and the row is kept so the trader
--               can retry or see the reason instead of it vanishing).
--   digest      a BOUNDED plain-text excerpt (never a full page/transcript) - the website/YouTube
--               reader caps it, and the repository caps it again as defense in depth.
--   storage_object_id / file_url / file_name / file_size_bytes  set only for a stored PDF. The
--               bytes live in the normal private upload area and count against the trader's
--               storage quota through storage_objects; this row only points at them (loose ref, no
--               FK - the same convention media_assets.storage_object_id uses, because the Storage
--               page can delete an object independently and the Knowledge tab reports that
--               honestly instead of breaking).
--
-- Additive only (expand, never edit 001-069): a brand-new table, IF NOT EXISTS everywhere.

CREATE TABLE IF NOT EXISTS analysis_profile_sources (
  id                           TEXT PRIMARY KEY,
  user_id                      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id                   TEXT NOT NULL REFERENCES analysis_profiles(id) ON DELETE CASCADE,
  kind                         TEXT NOT NULL CHECK (kind IN ('youtube', 'website', 'pdf')),
  status                       TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'ready', 'taught', 'failed')),
  title                        TEXT NOT NULL DEFAULT '',
  url                          TEXT NOT NULL DEFAULT '',
  digest                       TEXT NOT NULL DEFAULT '',
  error_code                   TEXT NOT NULL DEFAULT '',
  storage_object_id            TEXT,
  file_url                     TEXT NOT NULL DEFAULT '',
  file_name                    TEXT NOT NULL DEFAULT '',
  file_size_bytes              BIGINT,
  taught_at                    TIMESTAMPTZ,
  taught_understanding_version INTEGER,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analysis_profile_sources_profile ON analysis_profile_sources (profile_id, created_at);
CREATE INDEX IF NOT EXISTS idx_analysis_profile_sources_user ON analysis_profile_sources (user_id);
