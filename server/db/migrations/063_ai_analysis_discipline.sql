-- AI Analysis Discipline (Level 1 "Start of the Path" + AI Analysis Discipline streak ladder).
--
-- session_ai_analysis_completions is the authoritative, gateway-recorded evidence that a REAL
-- AI Session Analysis succeeded for a specific (user, session, entry) - never a client-submitted
-- fact. It is written only by server/community/routes.internal.mjs's own
-- POST /internal/session-analysis-completions, called only from server/pattern-ai-server.mjs
-- after its own analyzeSession() call has already succeeded against a real provider, using the
-- REAL verified session identity from verifySession() (never a client-asserted userId) and a
-- freshly server-minted analysis_id (never the client's own display-only analysisId). A browser
-- can send whatever sessionId/entryId it wants to /api/sessions/analyze, but that alone never
-- creates a row here - only a genuine successful provider call does, and the internal route
-- still re-verifies the named session/entry actually belong to that same verified user before
-- inserting anything (see routes.internal.mjs).
--
-- entry_id is nullable - a session-level ("initial"/"update") analysis may run without one
-- specific chart entry pinned, and the discipline day check only cares that the SAME session
-- was created and analyzed on the same day, not that a specific entry was involved.
--
-- UNIQUE(analysis_id) makes the internal route's insert naturally idempotent: the gateway may
-- legitimately retry the internal call (network hiccup) without ever double-counting the same
-- real analysis.
CREATE TABLE IF NOT EXISTS session_ai_analysis_completions (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id     TEXT NOT NULL REFERENCES trading_sessions(id) ON DELETE CASCADE,
  entry_id       TEXT,
  analysis_id    TEXT NOT NULL,
  analysis_type  TEXT,
  provider       TEXT,
  model          TEXT,
  source         TEXT NOT NULL DEFAULT 'live' CHECK (source IN ('live','backfill')),
  occurred_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (analysis_id)
);
-- Backs the per-user, per-calendar-day discipline-streak scan (routes.profile.mjs's opportunistic
-- GET /me/achievements evaluation, server/community/ai-discipline.mjs's computeQualifyingDiscipline).
CREATE INDEX IF NOT EXISTS session_ai_analysis_completions_user_day_idx ON session_ai_analysis_completions (user_id, occurred_at);
CREATE INDEX IF NOT EXISTS session_ai_analysis_completions_session_idx ON session_ai_analysis_completions (session_id);

-- One row per user, written once (first read that needs it) and never overwritten afterward -
-- "Keep it stable for that track so changing timezone cannot re-bucket past days" (brief). Same
-- singleton-per-user shape as companion_state (018_companion_state.sql), but a plain scalar
-- column rather than a JSONB document since there is exactly one field. Falls back to 'UTC' at
-- the application layer (server/community/ai-discipline.mjs) for an invalid/unavailable browser
-- timezone - never stored un-validated.
CREATE TABLE IF NOT EXISTS user_discipline_settings (
  user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  timezone    TEXT NOT NULL DEFAULT 'UTC',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
