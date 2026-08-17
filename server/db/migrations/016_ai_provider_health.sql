-- Admin panel (7.16 follow-up): per-provider AI call health tracking. ai_usage_events only ever
-- gains a row on a *successful* response that happens to carry a `usage` field - a thrown error
-- (bad key, timeout, schema failure) leaves zero trace anywhere today. This table is an
-- append-only log of every callProvider() outcome (pattern-ai-server.mjs), success or failure,
-- reported via the same internal-HTTP-bridge pattern the admin-key resolution already uses
-- (POST /internal/ai-health-event), so the AI gateway's "never touches Postgres directly"
-- property stays intact. Status (healthy/degraded/idle/disconnected/unconfigured) is derived at
-- read time in server/admin/routes.mjs, never stored here - same "computed, not cached" choice
-- xp-config.mjs's effective-config merge already makes.
CREATE TABLE IF NOT EXISTS ai_provider_health_events (
  id            TEXT PRIMARY KEY,
  provider      TEXT NOT NULL,
  ok            BOOLEAN NOT NULL,
  error_code    TEXT,
  latency_ms    INTEGER,
  source        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_provider_health_events_provider_created_idx
  ON ai_provider_health_events (provider, created_at DESC);
