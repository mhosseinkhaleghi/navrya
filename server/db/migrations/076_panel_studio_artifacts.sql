-- Vibe Coding Panel Studio: server-canonical, user-owned AI-generated-artifact persistence.
--
-- Two tables, parent + immutable-append-only-child, the same shape 041_conversation_scenarios.sql
-- established for "current state + a history of versions that are never mutated in place." This
-- domain is simpler than 041's draft/publish workflow though: every revision IS the new "current"
-- the instant it is created (there is no separate draft/published distinction here), so unlike 041
-- there is no circular-FK problem to solve - an artifact row is always inserted first with both
-- pointer columns NULL, then its first revision references the already-existing artifact, then a
-- plain UPDATE points current_revision_id at it. No DEFERRABLE constraint is needed.
--
-- "current" vs "applied" are deliberately two independent pointers. current_revision_id is
-- whatever the Panel Studio is showing/editing right now (advances on every generation, manual
-- edit, or restore). applied_revision_id is only ever set by the explicit "Apply to dashboard"
-- action (server/community/routes.panel-studio.mjs). A panel must never appear on a trader's
-- dashboard merely because generation finished - this split is what makes that true structurally,
-- not just by UI convention.
--
-- target is a closed one-value CHECK today (v1 only enables dashboard.panel) as defense-in-depth
-- alongside the code-level target registry (navrya-src/panelStudioTargets.js) - adding a future
-- target requires a migration here too, never just a client-side config flip.
--
-- The byte/char CHECKs on source/prompt mirror app-level constants that must never silently drift
-- (navrya-src/dashboardPanelBuilder.js's own MAX_SOURCE_BYTES/MAX_PROMPT_CHARS) - the same "the
-- real ceiling lives in the app module, this is only a backstop" idiom analysisWorkspacePanelStore.js
-- already uses for its own 12KB/400-char limits.
CREATE TABLE IF NOT EXISTS panel_studio_artifacts (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target                TEXT NOT NULL CHECK (target IN ('dashboard.panel')),
  title                 TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready','applied','archived')),
  current_revision_id   TEXT,
  applied_revision_id   TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Owner's own artifact list, most-recently-updated first (GET /api/sync/panel-studio/artifacts).
CREATE INDEX IF NOT EXISTS panel_studio_artifacts_user_idx ON panel_studio_artifacts (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS panel_studio_artifacts_status_idx ON panel_studio_artifacts (user_id, status);

CREATE TABLE IF NOT EXISTS panel_studio_revisions (
  id                        TEXT PRIMARY KEY,
  artifact_id               TEXT NOT NULL REFERENCES panel_studio_artifacts(id) ON DELETE CASCADE,
  revision_number           INTEGER NOT NULL,
  source                    TEXT NOT NULL CHECK (octet_length(source) <= 12288),
  -- generated: produced by a real streamed AI call. manual-edit: the trader edited the source
  -- directly in the code pane and explicitly saved. restore: a past revision's source copied
  -- verbatim into a brand-new revision - restoring NEVER mutates the revision being restored.
  source_kind               TEXT NOT NULL CHECK (source_kind IN ('generated','manual-edit','restore')),
  prompt                    TEXT CHECK (prompt IS NULL OR char_length(prompt) <= 400),
  restored_from_revision_id TEXT REFERENCES panel_studio_revisions(id),
  provider                  TEXT CHECK (provider IS NULL OR provider IN ('openai','anthropic')),
  model                     TEXT,
  coding_engine_id          TEXT CHECK (coding_engine_id IS NULL OR coding_engine_id IN ('codex','claude-code')),
  created_by                TEXT NOT NULL REFERENCES users(id),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS panel_studio_revisions_number_idx ON panel_studio_revisions (artifact_id, revision_number);
CREATE INDEX IF NOT EXISTS panel_studio_revisions_artifact_idx ON panel_studio_revisions (artifact_id, created_at DESC);

ALTER TABLE panel_studio_artifacts
  ADD CONSTRAINT panel_studio_artifacts_current_revision_fkey FOREIGN KEY (current_revision_id) REFERENCES panel_studio_revisions(id) ON DELETE SET NULL,
  ADD CONSTRAINT panel_studio_artifacts_applied_revision_fkey FOREIGN KEY (applied_revision_id) REFERENCES panel_studio_revisions(id) ON DELETE SET NULL;
