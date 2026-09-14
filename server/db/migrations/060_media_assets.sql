-- NAVRYA Media Drive - canonical, reusable trader-owned media asset domain. storage_objects (035)
-- already tracks quota/bytes for every uploaded file but carries no reusable domain metadata
-- (detected symbol/timeframe, active market session, AI extraction status) and is written by many
-- unrelated domains (session/pattern/strategy/trade/ticket) with no shared identity of their own.
-- This table is the ONE place a chart's real registration time, detected symbol/timeframe, active
-- market session and extraction status live - it REFERENCES (never copies) the existing
-- storage_objects row for the actual bytes, so no binary is ever duplicated.
CREATE TABLE IF NOT EXISTS media_assets (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES users(id),
  storage_object_id     TEXT NOT NULL REFERENCES storage_objects(id),
  url                   TEXT NOT NULL,
  kind                  TEXT NOT NULL CHECK (kind IN ('chart','image')),
  original_filename     TEXT,
  mime_type             TEXT,
  source                TEXT NOT NULL DEFAULT 'upload' CHECK (source IN ('capture','upload')),
  -- Verified-context fields only - never set from pixels. session_id/active_market_session are
  -- derived server-side at creation time from the caller's OWN trading session row (see
  -- routes.media.mjs), never from a client-supplied label.
  session_id            TEXT REFERENCES trading_sessions(id),
  active_market_session TEXT,
  -- AI vision extraction - 'not_applicable' for kind='image' (never analyzed), 'processing'
  -- immediately after a new 'chart' asset is stored, then 'ready' | 'failed' | 'unavailable'.
  -- is_trading_chart/symbol/timeframe/confidence are the ONLY fields AI is ever allowed to write
  -- (see server/pattern-ai-server.mjs's analyzeMediaChart) - null/unknown when unclear, never
  -- guessed.
  metadata_status       TEXT NOT NULL DEFAULT 'not_applicable' CHECK (metadata_status IN ('not_applicable','processing','ready','failed','unavailable')),
  is_trading_chart      BOOLEAN,
  symbol                TEXT,
  timeframe             TEXT,
  confidence            REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  analysis_provider     TEXT,
  analysis_model        TEXT,
  analysis_error_code   TEXT,
  -- Deterministic application-clock registration time (never AI-generated, never client-supplied).
  registered_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at            TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS media_assets_user_recent_idx ON media_assets (user_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS media_assets_user_symbol_idx ON media_assets (user_id, symbol) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS media_assets_user_timeframe_idx ON media_assets (user_id, timeframe) WHERE deleted_at IS NULL;

-- Reuse links: lets ONE media asset be safely attached to more than one domain record (a Session
-- chart entry, a Trade screenshot, a Pattern reference screenshot, a Strategy Education
-- attachment...) without ever re-uploading bytes or re-charging storage quota for the same file.
-- This table never owns the linked record's own fields - it is purely a reference join, and is
-- what routes.media.mjs's delete endpoint checks before allowing a real asset deletion.
CREATE TABLE IF NOT EXISTS media_asset_links (
  id              TEXT PRIMARY KEY,
  media_asset_id  TEXT NOT NULL REFERENCES media_assets(id),
  user_id         TEXT NOT NULL REFERENCES users(id),
  domain          TEXT NOT NULL CHECK (domain IN ('sessionEntry','trade','pattern','strategy')),
  record_id       TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS media_asset_links_asset_idx ON media_asset_links (media_asset_id);
CREATE UNIQUE INDEX IF NOT EXISTS media_asset_links_unique_idx ON media_asset_links (media_asset_id, domain, record_id);
