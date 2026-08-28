-- 2026-08-28 bug report: problem/invalidationNote/invalidationTagIds have always been real
-- fields on the client-side Scenario shape (navrya-src/liveSessionView.jsx's own addScenario())
-- - never new UI - but 006_trading_sessions.sql's own trading_session_scenarios table never
-- carried columns for them. Confirmed via real production testing that this silently loses real
-- user data on every reconcile: server-replica.js's own optimistic-then-reconcile write flow
-- replaces the client's local value with whatever the server's own INSERT ... RETURNING * response
-- contains once a write round-trips successfully - a field the server never had a column for
-- comes back missing, and that missing value overwrites the correct local one, even though the
-- write itself reported success (a real DOM edit, not just AI/voice, reproduces this identically).
-- Nullable + additive - no backfill for pre-existing rows (their problem/invalidationNote/
-- invalidationTagIds were already lost by the time this migration exists; there is nothing left
-- to recover them from).
ALTER TABLE trading_session_scenarios ADD COLUMN IF NOT EXISTS problem TEXT;
ALTER TABLE trading_session_scenarios ADD COLUMN IF NOT EXISTS invalidation_note TEXT;
ALTER TABLE trading_session_scenarios ADD COLUMN IF NOT EXISTS invalidation_tag_ids JSONB NOT NULL DEFAULT '[]';
