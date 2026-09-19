-- Analysis Profile authoring (ARCHITECTURE.md §7.25): two optional, trader-authored additions to the
-- profile record, both small JSON documents nothing queries into individually (same "don't
-- over-normalize" reasoning 044_analysis_profiles.sql already gave for secondary_style_ids/focus_ids).
--
--   custom_method_links  {youtubeUrl, websiteUrl, referenceUrl} - optional teaching material the
--                        trader points a Custom Method profile at; each value is '' or a validated
--                        http(s) URL (server/db/analysis-profile-normalize.mjs).
--   custom_focuses       [{id, name, description, origin: 'user'|'ai', createdAt}] - focus areas the
--                        trader added themselves or accepted from an AI suggestion. A SEPARATE list
--                        from focus_ids on purpose: focus_ids reference the code-owned Focus Registry
--                        by stable id, a custom focus has no registry entry.
--
-- Additive only (expand, never edit 001-067): both columns default to an empty document, so every
-- existing row and every older client that never sends them keeps working unchanged.
ALTER TABLE analysis_profiles
  ADD COLUMN IF NOT EXISTS custom_method_links JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS custom_focuses      JSONB NOT NULL DEFAULT '[]';
