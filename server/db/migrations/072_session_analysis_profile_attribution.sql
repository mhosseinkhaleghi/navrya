-- Analysis Profile attribution on the AI Session Analysis completions ledger (Phase 5,
-- ARCHITECTURE.md §7.25). session_ai_analysis_completions (063) is the gateway-recorded, server-
-- authoritative evidence that a real analysis ran; this adds the four facts the Analysis Profile
-- Report needs about each run, none of which the browser is trusted to assert:
--
--   analysis_profile_id        which profile the analysis was run under. The gateway only forwards
--                              the browser's CLAIM; routes.internal.mjs re-verifies the profile
--                              really belongs to the verified user before storing it (NULL otherwise).
--                              Deliberately a LOOSE id with no foreign key: this table also drives the
--                              AI Analysis Discipline streak, so deleting a profile must never delete
--                              (and so un-earn) the completions that were run under it.
--   analysis_profile_revision  the profile's content revision at run time (analysis-context.js's hash) -
--                              lets a report separate "before" and "after" a piece of training. Informational.
--   active_market_session      London / New York / Tokyo / Sydney by the SERVER's own clock at record
--                              time (market-session-clock.mjs) - never a browser-supplied label - so the
--                              weekday x market-session heatmap cannot be skewed by a client.
--   concept_coverage           [{ conceptId, status }] - the server's own rebuilt mandatory-concept
--                              coverage for that run (applied / not_visible / not_applicable /
--                              unaddressed). NULL when the profile had no mandatory concepts. The
--                              evidence prose stays on the analysis result, not in this analytics table.
--
-- Additive only (expand, never edit 001-071): four nullable columns and one partial index, all
-- IF NOT EXISTS. Rows recorded before this migration simply have NULLs - the Report says so honestly
-- ("tracking began <date>") rather than back-filling a guess.

ALTER TABLE session_ai_analysis_completions
  ADD COLUMN IF NOT EXISTS analysis_profile_id       TEXT,
  ADD COLUMN IF NOT EXISTS analysis_profile_revision TEXT,
  ADD COLUMN IF NOT EXISTS active_market_session    TEXT,
  ADD COLUMN IF NOT EXISTS concept_coverage          JSONB;

-- Backs GET /api/sync/analysis-profiles/:id/usage (one profile's runs, oldest first).
CREATE INDEX IF NOT EXISTS session_ai_analysis_completions_profile_idx
  ON session_ai_analysis_completions (analysis_profile_id, occurred_at)
  WHERE analysis_profile_id IS NOT NULL;
