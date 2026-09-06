-- Admin-managed runtime model overrides. These are deliberately separate from
-- admin_ai_keys: a model is operational configuration, not credential material.
-- The AI gateway reads this table through the existing internal service bridge,
-- so a save takes effect for provider calls without a redeploy.
CREATE TABLE IF NOT EXISTS admin_ai_model_overrides (
  provider     TEXT PRIMARY KEY,
  model        TEXT NOT NULL,
  updated_by   TEXT REFERENCES users(id),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
