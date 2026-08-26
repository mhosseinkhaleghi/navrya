-- Commercial System Slice 1: optional, more-specific markup overrides (spec section 18's
-- override hierarchy - global default -> feature -> provider -> model -> feature+model, most
-- specific wins). The GLOBAL default itself is NOT a row here - it lives in
-- commercial_config_overrides under 'wallet:markupPercent' (026_commercial_config.sql), same as
-- every other single-value commercial setting. This table exists only for the rows that make the
-- hierarchy actually have more than one level; the default system works with zero rows in it.
CREATE TABLE IF NOT EXISTS ai_markup_rules (
  id                TEXT PRIMARY KEY,
  scope_type        TEXT NOT NULL CHECK (scope_type IN ('feature','provider','model','feature_model')),
  -- 'feature' -> the feature name (e.g. 'aiChat'); 'provider' -> provider name; 'model' -> model
  -- name; 'feature_model' -> 'feature:model' composite string. Interpretation lives in
  -- server/commercial/markup.mjs, never re-derived here.
  scope_key         TEXT NOT NULL,
  markup_percent    NUMERIC NOT NULL CHECK (markup_percent >= 0),
  enabled           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scope_type, scope_key)
);
