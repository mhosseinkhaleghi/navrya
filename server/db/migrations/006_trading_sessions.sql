-- Module 1 of the local-first-to-server migration (see ARCHITECTURE.md's Global Data Sync
-- section). Named "trading_sessions" (not "sessions") deliberately - `sessions`/`user_sessions`
-- is already taken by the Admin Panel's login/presence heartbeat tracking (004_admin.sql,
-- exposed as repo.sessions); this is a completely unrelated concept (a trading journal session)
-- that happens to share the English word, so it gets its own name to avoid any collision with
-- that existing table or the existing `repo.sessions` JS property.
--
-- Scoped by user_id alone, not (user_id, character) - the four separate character localStorage
-- keys were a client-storage-key artifact, not a real data boundary. session-signature-store.js
-- already treats signatures as cross-character/global (one key, no per-character split), so
-- collapsing the source sessions the same way is more consistent, not less. `character` is kept
-- as a plain column for filtering/display, never part of a uniqueness constraint.
CREATE TABLE IF NOT EXISTS trading_sessions (
  id                          TEXT PRIMARY KEY,
  user_id                     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character                   TEXT NOT NULL,
  name                        TEXT,
  market                      TEXT NOT NULL,
  timeframe                   TEXT,
  date                        TEXT,
  jalali                      TEXT,
  started_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at                   TIMESTAMPTZ,
  status                      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  update_interval_minutes     INTEGER NOT NULL DEFAULT 30,
  grace_period_minutes        INTEGER NOT NULL DEFAULT 5,
  fate_summary                JSONB,
  previous_session_summary    JSONB,
  ai_session_analysis         TEXT,
  ai_session_analysis_result  JSONB,
  final_entry_id              TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trading_sessions_user_idx ON trading_sessions (user_id);

CREATE TABLE IF NOT EXISTS trading_session_entries (
  id                  TEXT PRIMARY KEY,
  session_id          TEXT NOT NULL REFERENCES trading_sessions(id) ON DELETE CASCADE,
  type                TEXT NOT NULL CHECK (type IN ('chart','movement','fate')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  has_image           BOOLEAN NOT NULL DEFAULT FALSE,
  image_blob_id       TEXT,
  image_url           TEXT,
  timeframe           TEXT,
  market              TEXT,
  trading_session     TEXT,
  gregorian_date      TEXT,
  note                TEXT,
  movement_note       TEXT,
  related_scenario_ids JSONB NOT NULL DEFAULT '[]',
  ai_analysis_result  JSONB
);
CREATE INDEX IF NOT EXISTS trading_session_entries_session_idx ON trading_session_entries (session_id);

-- title/occurred/pattern_tag_id are real columns (not folded into the `pattern` jsonb blob)
-- because the Pattern Registry report and admin/gamification work already query across
-- scenarios by these fields - the rest of the pattern-progress shape (stages, completedStageIds,
-- completionThreshold) stays jsonb since nothing queries into it directly.
CREATE TABLE IF NOT EXISTS trading_session_scenarios (
  id                  TEXT PRIMARY KEY,
  entry_id            TEXT NOT NULL REFERENCES trading_session_entries(id) ON DELETE CASCADE,
  session_id          TEXT NOT NULL REFERENCES trading_sessions(id) ON DELETE CASCADE,
  title               TEXT NOT NULL DEFAULT '',
  description         TEXT,
  evidence            TEXT,
  trigger_text        TEXT,
  occurred            BOOLEAN NOT NULL DEFAULT FALSE,
  pattern_tag_id       TEXT,
  completion_percent  INTEGER,
  probability_history JSONB NOT NULL DEFAULT '[]',
  pattern             JSONB,
  execution_plan      JSONB
);
CREATE INDEX IF NOT EXISTS trading_session_scenarios_session_idx ON trading_session_scenarios (session_id);
CREATE INDEX IF NOT EXISTS trading_session_scenarios_entry_idx ON trading_session_scenarios (entry_id);
CREATE INDEX IF NOT EXISTS trading_session_scenarios_pattern_idx ON trading_session_scenarios (pattern_tag_id);

CREATE TABLE IF NOT EXISTS trading_session_activity_log (
  id                          TEXT PRIMARY KEY,
  session_id                  TEXT NOT NULL REFERENCES trading_sessions(id) ON DELETE CASCADE,
  type                        TEXT NOT NULL,
  detail                      TEXT,
  scenario_id                 TEXT,
  logged_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  counts_toward_loop_update   BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS trading_session_activity_log_session_idx ON trading_session_activity_log (session_id);
