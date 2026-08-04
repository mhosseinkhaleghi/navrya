ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_role TEXT NOT NULL DEFAULT 'trader' CHECK (profile_role IN ('trader','mentor','teacher'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_status TEXT NOT NULL DEFAULT 'not_started' CHECK (kyc_status IN ('not_started','pending','verified','rejected'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS xp_total INTEGER NOT NULL DEFAULT 0;
-- Reuses the app's existing base64-data-URL upload convention (never multipart) - a small
-- avatar image only, same as every other upload in this codebase.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_data_url TEXT;

-- Only enforced while set - a fresh dev-mode user never has an email, so this must not block
-- account creation.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx ON users (email) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_xp_events (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,
  points       INTEGER NOT NULL,
  meta         JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_xp_events_user_idx ON user_xp_events (user_id, occurred_at);

CREATE TABLE IF NOT EXISTS user_achievements (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_key   TEXT NOT NULL,
  unlocked_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  evidence          JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (user_id, achievement_key)
);
CREATE INDEX IF NOT EXISTS user_achievements_user_idx ON user_achievements (user_id);

-- Widens the existing type enum (marketplace_listings already has `type` from
-- 003_marketplace_and_messaging.sql) to also allow 'subscription', rather than adding a second,
-- overlapping enum column. Existing pattern/strategy rows need no data migration - only the
-- CHECK constraint changes. `marketplace_listings_type_check` is Postgres's standard
-- auto-generated name for an inline column CHECK created without an explicit name.
ALTER TABLE marketplace_listings DROP CONSTRAINT IF EXISTS marketplace_listings_type_check;
ALTER TABLE marketplace_listings ADD CONSTRAINT marketplace_listings_type_check CHECK (type IN ('pattern','strategy','subscription'));
