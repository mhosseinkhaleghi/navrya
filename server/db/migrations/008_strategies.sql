-- Module 3 of the local-first-to-server migration (see ARCHITECTURE.md's Global Data Sync
-- section, 7.18). Mirrors strategy-education.types.js field-for-field. The three sections
-- (positionManagement/riskManagement/overallFramework) are flattened onto the parent row as
-- real columns - each is a handful of plain scalars client-side (strings/numbers), not a nested
-- array, so there is no separate child table per section; only the two real arrays each section
-- can carry (attachments, shared by all three via `category`) and the strategy-level arrays
-- (chatHistory, detectionEvents) get their own child tables.
CREATE TABLE IF NOT EXISTS strategies (
  id                              TEXT PRIMARY KEY,
  user_id                         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                            TEXT NOT NULL DEFAULT '',
  active                          BOOLEAN NOT NULL DEFAULT TRUE,
  is_public                       BOOLEAN NOT NULL DEFAULT FALSE,
  origin                          TEXT NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','ai_from_event')),
  entry_rules                     TEXT NOT NULL DEFAULT '',
  stop_loss_rules                 TEXT NOT NULL DEFAULT '',
  exit_target_rules               TEXT NOT NULL DEFAULT '',
  position_sizing_rules           TEXT NOT NULL DEFAULT '',
  position_management_notes       TEXT NOT NULL DEFAULT '',
  max_risk_per_trade_percent       NUMERIC,
  daily_drawdown_limit_percent     NUMERIC,
  total_drawdown_limit_percent     NUMERIC,
  max_concurrent_trades            INTEGER,
  max_profit_cap_per_trade         NUMERIC,
  risk_management_notes           TEXT NOT NULL DEFAULT '',
  overall_framework_description   TEXT NOT NULL DEFAULT '',
  -- {positionManagement, riskManagement, overallFramework, updatedAt} - rarely queried into
  -- individually, jsonb is fine per the same reasoning as trading_sessions.fate_summary.
  ai_understanding_summary        JSONB,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS strategies_user_idx ON strategies (user_id);

-- `category` distinguishes which of the three sections an attachment belongs to - one shared
-- table rather than three near-identical ones. `file_url` mirrors pattern_screenshots.image_url;
-- kept generically named since non-image attachments (pdf/txt/docx - see 7.18) never populate it.
CREATE TABLE IF NOT EXISTS strategy_attachments (
  id            TEXT PRIMARY KEY,
  strategy_id   TEXT NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  category      TEXT NOT NULL CHECK (category IN ('positionManagement','riskManagement','overallFramework')),
  file_name     TEXT,
  blob_id       TEXT,
  file_url      TEXT,
  mime_type     TEXT,
  size_bytes    INTEGER,
  note          TEXT,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS strategy_attachments_strategy_idx ON strategy_attachments (strategy_id);

CREATE TABLE IF NOT EXISTS strategy_chat_messages (
  id            TEXT PRIMARY KEY,
  strategy_id   TEXT NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content       TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  suggestions   JSONB
);
CREATE INDEX IF NOT EXISTS strategy_chat_messages_strategy_idx ON strategy_chat_messages (strategy_id);

CREATE TABLE IF NOT EXISTS strategy_detection_events (
  id                  TEXT PRIMARY KEY,
  strategy_id         TEXT NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  detected_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  source              JSONB,
  predicted_outcome   TEXT,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','invalidated')),
  resolved_at         TIMESTAMPTZ,
  note                TEXT
);
CREATE INDEX IF NOT EXISTS strategy_detection_events_strategy_idx ON strategy_detection_events (strategy_id);
