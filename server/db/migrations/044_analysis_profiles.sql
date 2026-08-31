-- Analysis Profiles domain (see ARCHITECTURE.md §7.25). "How this user reads a chart" - a
-- separate, first-class domain from Strategy (execution/risk rules, 008_strategies.sql) and
-- Pattern (007_patterns.sql). Built directly on the current server-replica.js persistence
-- pattern (Phase 2+) rather than the older §7.18 sync-queue shape 007/008 originally used - see
-- public/pages/shared/server-replica.js and analysis-profile-store.js for the client half.
--
-- Flat table, no child tables: secondary_style_ids/focus_ids are small string-id arrays nothing
-- queries into individually (same reasoning trades.take_profits/concept_tags already use) - see
-- Section 18 of the brief ("Do not over-normalize just for theoretical purity").
CREATE TABLE IF NOT EXISTS analysis_profiles (
  id                      TEXT PRIMARY KEY,
  user_id                 TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                    TEXT NOT NULL DEFAULT '',
  description             TEXT NOT NULL DEFAULT '',
  -- Style/Focus ids reference the code-owned registries (analysis-style-registry.js /
  -- analysis-focus-registry.js), never a database table - see brief §19 ("Registry entries need
  -- stable IDs... built-in registry definitions should live in version-controlled application
  -- code/data, not one database row per style per user"). No FK here by design.
  primary_style_id        TEXT NOT NULL DEFAULT 'general_analysis',
  secondary_style_ids     JSONB NOT NULL DEFAULT '[]',
  focus_ids               JSONB NOT NULL DEFAULT '[]',
  custom_method_notes     TEXT NOT NULL DEFAULT '',
  is_default              BOOLEAN NOT NULL DEFAULT FALSE,
  is_active               BOOLEAN NOT NULL DEFAULT TRUE,
  registry_version        INTEGER NOT NULL DEFAULT 1,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analysis_profiles_user_idx ON analysis_profiles (user_id);
-- At most one default profile per user - defense in depth on top of the client store's own
-- "clear the previous default" logic (analysis-profile-store.js's save()) and repo.pg.mjs's own
-- transactional clear-then-set. A partial unique index (not a plain UNIQUE) since most rows have
-- is_default = false and must never collide with each other.
CREATE UNIQUE INDEX IF NOT EXISTS analysis_profiles_one_default_per_user
  ON analysis_profiles (user_id) WHERE is_default;

-- Strategy → Analysis Profile link (brief §15): optional, loose application-level reference, no
-- FK - same convention as trades.linked_pattern_ids/linked_strategy_id (009_trades.sql). Deleting
-- an Analysis Profile clears this column on any referencing Strategy (analysis-profile-store.js's
-- orphanLinkedStrategies(), mirroring strategy-education-store.js's own orphanLinkedTrades());
-- deleting a Strategy never touches an Analysis Profile.
ALTER TABLE strategies ADD COLUMN IF NOT EXISTS linked_analysis_profile_id TEXT;
