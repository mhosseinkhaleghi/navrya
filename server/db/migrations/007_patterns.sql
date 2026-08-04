-- Module 2 of the local-first-to-server migration (see ARCHITECTURE.md's Global Data Sync
-- section, 7.18). Mirrors pattern-registry.types.js field-for-field. Flatter than Module 1's
-- Sessions (no nested-array-of-nested-arrays), so stages/screenshots/chat messages are each a
-- simple one-level child table, no denormalized cross-link needed.
CREATE TABLE IF NOT EXISTS patterns (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL DEFAULT '',
  description           TEXT NOT NULL DEFAULT '',
  completion_threshold  INTEGER NOT NULL DEFAULT 70,
  usage_count           INTEGER NOT NULL DEFAULT 0,
  is_public             BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS patterns_user_idx ON patterns (user_id);

-- `stage_order`, not `order` - a reserved SQL keyword.
CREATE TABLE IF NOT EXISTS pattern_stages (
  id            TEXT PRIMARY KEY,
  pattern_id    TEXT NOT NULL REFERENCES patterns(id) ON DELETE CASCADE,
  stage_order   INTEGER NOT NULL,
  text          TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS pattern_stages_pattern_idx ON pattern_stages (pattern_id);

-- `image_url` mirrors trading_session_entries.image_url (Module 1) - populated once the
-- screenshot's blob is uploaded via the generalized storage module (category 'pattern').
-- `blob_id` is kept for cross-device correlation even before the upload resolves.
CREATE TABLE IF NOT EXISTS pattern_screenshots (
  id            TEXT PRIMARY KEY,
  pattern_id    TEXT NOT NULL REFERENCES patterns(id) ON DELETE CASCADE,
  file_name     TEXT,
  blob_id       TEXT,
  image_url     TEXT,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  note          TEXT
);
CREATE INDEX IF NOT EXISTS pattern_screenshots_pattern_idx ON pattern_screenshots (pattern_id);

CREATE TABLE IF NOT EXISTS pattern_chat_messages (
  id                TEXT PRIMARY KEY,
  pattern_id        TEXT NOT NULL REFERENCES patterns(id) ON DELETE CASCADE,
  role              TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content           TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  suggested_stages  JSONB
);
CREATE INDEX IF NOT EXISTS pattern_chat_messages_pattern_idx ON pattern_chat_messages (pattern_id);
