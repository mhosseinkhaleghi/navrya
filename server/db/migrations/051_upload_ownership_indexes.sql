-- P0-2 launch-readiness fix (server/community/security/upload-ownership.mjs): private
-- /uploads/{session,pattern,strategy,trade}/* files are now authorized by real ownership, not
-- merely by authentication. These indexes back the two lookup tiers that resolution needs to stay
-- fast at real scale:
--   1. storage_objects.object_key - the primary, upload-time-synchronous ownership record for
--      every file uploaded since 035_storage_objects.sql landed.
--   2. Each private domain's own image/attachment URL column - the fallback tier for a real,
--      still-legitimate file uploaded BEFORE storage_objects existed (006-009 predate 035 by a
--      long stretch of this app's history), where tier 1 has no row at all.
-- Partial (WHERE ... IS NOT NULL) on every column that is nullable in practice, matching this
-- schema's existing convention (e.g. storage_objects_user_active_idx).
CREATE INDEX IF NOT EXISTS storage_objects_object_key_idx ON storage_objects (object_key) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS trading_session_entries_image_url_idx ON trading_session_entries (image_url) WHERE image_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS pattern_screenshots_image_url_idx ON pattern_screenshots (image_url) WHERE image_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS strategy_attachments_file_url_idx ON strategy_attachments (file_url) WHERE file_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS trade_screenshots_image_url_idx ON trade_screenshots (image_url) WHERE image_url IS NOT NULL;
