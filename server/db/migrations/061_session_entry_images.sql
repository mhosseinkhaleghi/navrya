-- Session / Analysis Desk AI upgrade, section 3: canonical ordered multi-image representation for
-- one Session Entry (chart or movement), so a trader can attach 1-4 labelled timeframe images to
-- the same entry instead of exactly one. Purely additive - `trading_session_entries` itself is
-- untouched; a pre-existing entry's own single-image fields (image_blob_id/image_url) stay the
-- read/normalization fallback for an entry with no rows here (see repo.pg.mjs's own comment).
-- References an existing Media Drive asset (media_assets, 060) rather than copying its bytes when
-- the image came from the picker; image_blob_id/image_url cover the plain-upload path exactly like
-- trading_session_entries' own columns already do, so no image is ever re-uploaded or duplicated.
CREATE TABLE IF NOT EXISTS trading_session_entry_images (
  id                  TEXT PRIMARY KEY,
  entry_id            TEXT NOT NULL REFERENCES trading_session_entries(id) ON DELETE CASCADE,
  session_id          TEXT NOT NULL REFERENCES trading_sessions(id) ON DELETE CASCADE,
  order_index         INTEGER NOT NULL DEFAULT 0,
  -- Exactly one real image source, matching trading_session_entries' own convention: a Media Drive
  -- reference (never re-uploaded), an IndexedDB blob reference, or a direct-uploaded URL.
  media_asset_id      TEXT REFERENCES media_assets(id),
  image_blob_id       TEXT,
  image_url           TEXT,
  -- The trader-confirmed timeframe for THIS image, and the detected value NAVRYA's existing
  -- chart/media detection capability (server/pattern-ai-server.mjs's analyzeMediaChart) offered
  -- before the trader reviewed/overrode it - kept separately so "detection failed, trader typed it
  -- manually" stays distinguishable from "detection succeeded and was accepted as-is".
  timeframe           TEXT,
  detected_timeframe  TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trading_session_entry_images_entry_idx ON trading_session_entry_images (entry_id, order_index);
