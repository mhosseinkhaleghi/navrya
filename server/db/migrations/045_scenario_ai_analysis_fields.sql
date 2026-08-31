-- Adaptive AI Session Analysis: additive columns for the new Scenario fields
-- (session-analysis-client.js's buildScenarioDraftFromAi()/applyScenarioEvaluationPatch()) - all
-- nullable JSONB/TEXT, never a NOT NULL/CHECK constraint, so an existing row (and every existing
-- write path that never sets them) is completely unaffected.
--
-- PRODUCTION INCIDENT FIX (2026-08-31): repo.pg.mjs's trading_session_scenarios INSERT never
-- referenced these fields at all, so a scenario's status/aiSource/aiVisualization/lastEvaluation
-- silently vanished on the very next session save (the delete-then-reinsert upsert only carries
-- forward whatever columns exist) - real, silent data loss, not a crash. status stays a plain TEXT
-- column (not folded into a jsonb blob) matching this table's own existing convention for fields
-- worth filtering/reporting on later (see 006_trading_sessions.sql's comment on title/occurred/
-- pattern_tag_id); a CHECK enum is deliberately NOT added here since the value set may still grow
-- as the feature matures and a rejected write is worse than an unrecognized status string.
ALTER TABLE trading_session_scenarios ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE trading_session_scenarios ADD COLUMN IF NOT EXISTS ai_source JSONB;
ALTER TABLE trading_session_scenarios ADD COLUMN IF NOT EXISTS ai_visualization JSONB;
ALTER TABLE trading_session_scenarios ADD COLUMN IF NOT EXISTS last_evaluation JSONB;
