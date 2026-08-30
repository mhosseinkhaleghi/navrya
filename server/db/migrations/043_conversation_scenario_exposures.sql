-- Journey H2 follow-up: simple context variants (first-time / nth-time-or-later dialogue). Tracks
-- how many times NAVRYA has actually DELIVERED a given published scenario's local answer to a
-- given user - the only signal the deterministic variant selector (ai-conversation-matcher.js's
-- selectVariant()) needs. Deliberately its own small table, not an addition to companion_state
-- (018_companion_state.sql) - that document is a closed, privacy-tested schema for communication
-- preferences and explicit user choices; this is a different, ever-growing, per-scenario counter
-- that would only couple two unrelated read/write paths together for no benefit.
--
-- Bounded by construction: only a published scenario_key (never free text), a count, and two
-- small timestamps/labels - never raw user messages, never Psychology data, never anything that
-- did not already exist as a real, code-owned identifier.
--
-- One row per (user, scenario) - upserted in place by repo.conversationScenarioExposures.record(),
-- the only write path (always a server-side increment, never a client-supplied count).

CREATE TABLE IF NOT EXISTS conversation_scenario_exposures (
  user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scenario_key       TEXT NOT NULL,
  count              INTEGER NOT NULL DEFAULT 0,
  last_presented_at  TIMESTAMPTZ,
  last_variant_key   TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, scenario_key)
);
