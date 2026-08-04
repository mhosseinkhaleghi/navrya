-- Module 4 of the local-first-to-server migration (see ARCHITECTURE.md's Global Data Sync
-- section, 7.18). Mirrors trade.types.js's Trade shape. Every scalar the client's own
-- filter()/analytics() functions read individually is a real column (status, direction,
-- outcome, pnl, linkedStrategyId, source.sessionId/scenarioId, ...), matching the flattening
-- rule already used for trading_sessions/patterns/strategies; the remaining fields are small,
-- non-identity-bearing, nested structures (takeProfits, commission, timeframeTrends,
-- conceptTags, linkedPatternIds, statusHistory, aiPredictionLinks, aiInitialAnalysis) that
-- nothing queries into individually server-side, so they stay jsonb rather than becoming their
-- own child tables. `linked_pattern_ids`/`linked_strategy_id` are plain TEXT (no FK) - same
-- convention as trading_session_scenarios.pattern_tag_id: a loose, application-level reference
-- across independent domain tables, not a hard cross-module constraint. statusHistory's
-- `{status,timestamp}` shape and aiPredictionLinks' `{id,patternId,correct}` shape are stored
-- verbatim as jsonb (post the Section 7.18 Module 4 schema-drift fix in trade-store.js/
-- trade.types.js) - the server never re-encodes their field names, so there is no second place
-- for that drift to reappear.
CREATE TABLE IF NOT EXISTS trades (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status                TEXT NOT NULL DEFAULT 'hunting' CHECK (status IN ('hunting','open','closed','cancelled')),
  direction             TEXT NOT NULL DEFAULT 'long' CHECK (direction IN ('long','short')),
  entry_mode            TEXT NOT NULL DEFAULT 'full' CHECK (entry_mode IN ('quick','full')),
  entry_price           NUMERIC,
  stop_loss             NUMERIC,
  take_profits          JSONB NOT NULL DEFAULT '[]',
  sl_distance_percent   NUMERIC,
  risk_percent          NUMERIC,
  risk_amount           NUMERIC,
  leverage              NUMERIC,
  position_size         NUMERIC,
  margin_required       NUMERIC,
  liquidation_price     NUMERIC,
  rr                    NUMERIC,
  margin_mode           TEXT NOT NULL DEFAULT 'isolated' CHECK (margin_mode IN ('isolated','cross')),
  commission            JSONB,
  breakeven_percent     NUMERIC,
  exit_price            NUMERIC,
  outcome               TEXT CHECK (outcome IS NULL OR outcome IN ('win','loss','breakeven')),
  pnl                   NUMERIC,
  pnl_percent           NUMERIC,
  session               TEXT NOT NULL DEFAULT 'london' CHECK (session IN ('tokyo','london','newyork','sydney')),
  primary_timeframe     TEXT,
  timeframe_trends      JSONB NOT NULL DEFAULT '[]',
  concept_tags          JSONB NOT NULL DEFAULT '[]',
  linked_pattern_ids    JSONB NOT NULL DEFAULT '[]',
  linked_strategy_id    TEXT,
  chart_note            TEXT NOT NULL DEFAULT '',
  status_history        JSONB NOT NULL DEFAULT '[]',
  source_character      TEXT,
  source_session_id     TEXT,
  source_scenario_id    TEXT,
  ai_prediction_links   JSONB NOT NULL DEFAULT '[]',
  ai_initial_analysis   JSONB,
  discipline_impact     NUMERIC NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  opened_at             TIMESTAMPTZ,
  closed_at             TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS trades_user_idx ON trades (user_id);

-- `image_url` mirrors pattern_screenshots.image_url/strategy_attachments.file_url - populated
-- once the screenshot's blob uploads via the generalized storage module (category 'trade').
CREATE TABLE IF NOT EXISTS trade_screenshots (
  id            TEXT PRIMARY KEY,
  trade_id      TEXT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  file_name     TEXT,
  blob_id       TEXT,
  image_url     TEXT,
  mime_type     TEXT,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trade_screenshots_trade_idx ON trade_screenshots (trade_id);

-- Its own child table (not jsonb on the parent row) because it carries per-item identity and
-- Module 5 (Mental Health Profile) is expected to query into per-emotion fields directly once
-- it lands, the same way the Pattern Registry report already queries trading_session_scenarios
-- by name rather than reaching into a jsonb blob. `timestamp` is stored as `occurred_at` -
-- consistent with every other *_at column name in this schema (detected_at, uploaded_at,
-- logged_at) - and mapped back to the client's `timestamp` field name in the JS mapper.
CREATE TABLE IF NOT EXISTS trade_emotion_log (
  id                          TEXT PRIMARY KEY,
  trade_id                    TEXT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  occurred_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  stage                       TEXT NOT NULL DEFAULT 'entry' CHECK (stage IN ('entry','mid_trade','exit')),
  dominant_emotions           JSONB NOT NULL DEFAULT '[]',
  emotion_details             JSONB NOT NULL DEFAULT '[]',
  stress_level                INTEGER,
  focus_quality                INTEGER,
  plan_commitment             INTEGER,
  would_take_if_not_forced    BOOLEAN,
  note                        TEXT
);
CREATE INDEX IF NOT EXISTS trade_emotion_log_trade_idx ON trade_emotion_log (trade_id);
