-- Real authentication/session infrastructure, additive only (expand, never edit 001-019).
-- Replaces the hand-rolled HMAC bearer-token model (013_real_auth.sql's password_hash/google_id
-- columns are kept AS-IS and still used for credential verification) with server-side sessions,
-- external-identity mapping for OIDC/Google, short-lived auth transactions (OIDC state/nonce/
-- PKCE, password reset, email verification, legacy-token exchange), and a security/audit event
-- log distinct from admin_audit_log (that table is admin-action-only; this one is
-- identity/session/security-relevant events for ANY user, including anonymous attempts).

-- Session identifiers are never stored in plaintext: only their SHA-256 hash is kept, mirroring
-- how a password itself is never stored plaintext. The raw session id lives only in the
-- browser's HttpOnly cookie and in memory for the duration of one request.
CREATE TABLE IF NOT EXISTS auth_sessions (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_hash      TEXT NOT NULL,
  family_id         TEXT NOT NULL, -- groups sessions created by rotation from the same original login, for replay-detection revocation
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  idle_expires_at   TIMESTAMPTZ NOT NULL,
  absolute_expires_at TIMESTAMPTZ NOT NULL,
  revoked_at        TIMESTAMPTZ,
  revoked_reason    TEXT, -- 'logout' | 'logout_all' | 'role_change' | 'suspended' | 'replay_detected' | 'rotated'
  reauth_at         TIMESTAMPTZ, -- last time this session re-proved a credential (password/OIDC) - drives step-up checks
  ip_hash           TEXT, -- salted hash, never the raw IP - enough to correlate/revoke, not enough to be PII at rest
  user_agent        TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS auth_sessions_hash_unique_idx ON auth_sessions (session_hash);
CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions (user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS auth_sessions_family_idx ON auth_sessions (family_id);
-- Cleanup path: a scheduled job deletes rows well past absolute_expires_at (see
-- server/db/cleanup-expired-auth.mjs) - this index makes that scan cheap at scale.
CREATE INDEX IF NOT EXISTS auth_sessions_cleanup_idx ON auth_sessions (absolute_expires_at);

-- Maps a federated identity (Google, or any future generic-OIDC provider) to NAVRYA's own
-- internal user id by the stable (issuer, subject) pair - never by email. google_id on `users`
-- (013_real_auth.sql) is left untouched for backward read compatibility with existing rows;
-- new Google sign-ins and every generic-OIDC sign-in are recorded here going forward, and
-- findIdByGoogleId()/findIdByExternalIdentity() both check this table first.
CREATE TABLE IF NOT EXISTS external_identities (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issuer      TEXT NOT NULL,
  subject     TEXT NOT NULL,
  email_at_link TEXT, -- informational only, never used for matching/linking
  linked_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS external_identities_issuer_subject_idx ON external_identities (issuer, subject);
CREATE INDEX IF NOT EXISTS external_identities_user_idx ON external_identities (user_id);

-- Short-lived, single-use transaction state for flows that need to survive a redirect:
-- OIDC (state/nonce/PKCE verifier), password reset, email verification, and the time-boxed
-- legacy-bearer-token exchange. One generic table (same "natural-key/purpose table beats N
-- near-identical tables" convention as user_preferences/xp_config_overrides) rather than four
-- separate tables, since every row here is opaque, short-lived, and looked up by id or token_hash
-- alone - nothing ever queries across purposes.
CREATE TABLE IF NOT EXISTS auth_transactions (
  id            TEXT PRIMARY KEY,
  purpose       TEXT NOT NULL CHECK (purpose IN ('oidc', 'password_reset', 'email_verify', 'legacy_exchange')),
  user_id       TEXT REFERENCES users(id) ON DELETE CASCADE, -- null for 'oidc' until the callback resolves an identity
  token_hash    TEXT, -- SHA-256 of the opaque token handed to the client (reset link / verify link) - never the raw token
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb, -- oidc: {state, nonce, codeVerifier, redirectUri, provider}; others: {}
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  consumed_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS auth_transactions_token_hash_idx ON auth_transactions (token_hash) WHERE token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS auth_transactions_cleanup_idx ON auth_transactions (expires_at);

-- Identity/session-security event log - distinct from admin_audit_log (016_admin.sql; that one
-- is "an admin did X to a target" only). This is "something security-relevant happened to/around
-- an identity", including failed and anonymous attempts, so it can back real alerting later
-- (repeated failed logins, impossible-travel heuristics, etc.). user_id is nullable on purpose
-- (a failed login against a nonexistent email still needs to be counted for abuse detection).
-- Never store the raw credential, token, or password here - `detail` is a small structured jsonb
-- blob and callers are responsible for only ever putting redacted data into it (see
-- server/community/security/audit.mjs, the single write path).
CREATE TABLE IF NOT EXISTS security_events (
  id          TEXT PRIMARY KEY,
  user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  type        TEXT NOT NULL, -- 'login_success' | 'login_failed' | 'register' | 'logout' | 'logout_all' | 'session_revoked' | 'password_changed' | 'email_changed' | 'role_changed' | 'suspended' | 'oidc_link' | 'legacy_token_exchanged' | 'rate_limited' | 'csrf_rejected' | 'admin_step_up_required' | ...
  ip_hash     TEXT,
  detail      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_events_user_idx ON security_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS security_events_type_idx ON security_events (type, created_at DESC);

-- Recovery/MFA metadata NAVRYA owns regardless of identity provider (a managed OIDC provider may
-- own its own MFA state; this column is for a self-hosted TOTP fallback and is additive/optional).
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret_enc TEXT; -- encrypted at rest (see security/crypto.mjs), never plaintext
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
