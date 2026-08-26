-- Commercial System Slice 2: server-authoritative object metadata (spec section 12). Before this
-- migration, disk usage was not knowable from Postgres at all - server/storage/storage.mjs's
-- saveImage() only ever returned a URL string, and the one existing byte-size column anywhere
-- (strategy_attachments.size_bytes) is client-supplied and untrusted. This table's size_bytes is
-- instead the REAL final re-encoded buffer length storage.mjs actually wrote to disk.
--
-- `deleted_at` exists for forward-compatibility but nothing sets it yet: this codebase never
-- deletes an uploaded file today (every attachment-replace across patterns/strategies/sessions/
-- trades deletes the DB row referencing it but leaves the file on disk - confirmed by inspecting
-- every repo.pg.mjs remove()/upsert()). A row here that is never marked deleted is therefore an
-- ACCURATE reflection of "this many bytes are still sitting on disk", not an approximation - real
-- file cleanup (and setting deleted_at) is a named follow-up, not something this migration or its
-- reader logic pretends already exists.
CREATE TABLE IF NOT EXISTS storage_objects (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id),
  object_key          TEXT NOT NULL,
  size_bytes          BIGINT NOT NULL CHECK (size_bytes >= 0),
  mime_type           TEXT,
  category            TEXT NOT NULL,
  source_domain       TEXT,
  source_record_id    TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);
-- Every quota-usage query is "SUM(size_bytes) WHERE user_id=$1 AND deleted_at IS NULL".
CREATE INDEX IF NOT EXISTS storage_objects_user_active_idx ON storage_objects (user_id) WHERE deleted_at IS NULL;
