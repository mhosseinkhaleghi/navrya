-- Real authentication (replacing the dev-mode x-dev-user-id header trust model). Both columns
-- are credentials, not part of the public user shape - see repo.pg.mjs's findCredentialsByEmail
-- / findIdByGoogleId / setCredentials, which read/write these two columns via their own raw
-- queries, deliberately never through mapUser() (which stays untouched by this migration and
-- must never be extended to include either column).
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT;

-- Same partial-unique pattern as users_email_unique_idx (005_account_profile.sql) - only
-- enforced once a row actually has a google_id.
CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_unique_idx ON users (google_id) WHERE google_id IS NOT NULL;
