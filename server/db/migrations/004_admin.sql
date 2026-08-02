ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','moderator','admin'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
ALTER TABLE marketplace_listings ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS user_sessions (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_heartbeat_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at            TIMESTAMPTZ
);
-- "One open session per user": the app's heartbeat logic (find-open-else-create, mirroring
-- dm_threads' find-or-create idempotency) is the primary mechanism; this partial unique index
-- is the DB-level backstop against a concurrent-heartbeat race, translated by repo.pg.mjs the
-- same way ALREADY_PURCHASED already is (catch pg error code '23505' -> retry as an update).
CREATE UNIQUE INDEX IF NOT EXISTS user_sessions_one_open_idx ON user_sessions (user_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS user_sessions_user_idx ON user_sessions (user_id);

CREATE TABLE IF NOT EXISTS ai_usage_events (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT REFERENCES users(id),
  provider            TEXT NOT NULL,
  prompt_tokens       INTEGER,
  completion_tokens   INTEGER,
  total_tokens        INTEGER,
  source              TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_usage_events_user_idx ON ai_usage_events (user_id);
CREATE INDEX IF NOT EXISTS ai_usage_events_provider_created_idx ON ai_usage_events (provider, created_at);

CREATE TABLE IF NOT EXISTS provider_pricing (
  provider                    TEXT PRIMARY KEY,
  prompt_price_per_1k         NUMERIC,
  completion_price_per_1k     NUMERIC,
  monthly_token_budget        INTEGER,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_ai_keys (
  provider     TEXT PRIMARY KEY,
  api_key      TEXT NOT NULL,
  updated_by   TEXT REFERENCES users(id),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id              TEXT PRIMARY KEY,
  admin_user_id   TEXT REFERENCES users(id),
  action          TEXT NOT NULL,
  target_type     TEXT,
  target_id       TEXT,
  details         JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx ON admin_audit_log (created_at DESC);
