-- Journey G (AI Companion & Journey Orchestration). Mirrors 010_mental_health_profiles.sql's
-- shape exactly, for the same reason: the client store (ai-journey-engine.js /
-- ai-companion-profile.js) holds a handful of small preferences/dismissals per user, not a
-- growing list of records with their own ids - not the derived Journey snapshot itself (that is
-- recomputed fresh from real product data on every read, never persisted - see
-- docs/ai/journey-engine.md). Nothing anywhere queries into this document's individual fields via
-- SQL, so it is stored verbatim as one jsonb column, exactly like mental_health_profiles.
--
-- What actually lives in `state` (never a derivable fact like "hasPattern" or "hasStrategy" -
-- see docs/ai/journey-engine.md's persistence boundary): walkthroughSeenAt, dismissed/snoozed
-- step ids with their snoozeUntil, an explicit user-chosen currentGoal, and the Companion
-- communication-preference profile (experienceLevel/explanationDepth/teachingPreference/
-- initiativePreference/interactionPreference - never a psychological label).
CREATE TABLE IF NOT EXISTS companion_state (
  user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  state         JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
