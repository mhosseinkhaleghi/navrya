-- Real BSC crypto payment provider SECRETS (admin-config task). Deliberately a separate table
-- from commercial_config_overrides/commercial_config_versions - those two exist to keep a
-- permanent before/after JSON history of every admin setting change (see
-- server/commercial/commercial-config.mjs / repo.commercialConfig.publish()), which makes them
-- exactly the wrong place for a secret: a value written there is retained forever in plaintext-ish
-- JSON. This table instead holds only AES-256-GCM envelopes (server/community/security/
-- crypto-util.mjs's encryptSecret()/decryptSecret(), same primitive already used for TOTP
-- secrets), and is never read by any admin-facing GET - only server/commercial/bsc-config.mjs's
-- resolveBscRuntimeConfig() ever decrypts these columns, for internal runtime use.
--
-- Singleton row (fixed id 'default') - there is exactly one BSC provider configuration for the
-- whole deployment, mirroring how server/commercial/commercial-config.mjs's `bsc` section is a
-- single object, not a per-user/per-plan table.
CREATE TABLE IF NOT EXISTS bsc_payment_secrets (
  id                        TEXT PRIMARY KEY DEFAULT 'default',
  rpc_url_encrypted         TEXT,
  webhook_secret_encrypted  TEXT,
  -- Last 4 characters only, the same "key_hint" convention admin_voice_provider_credentials
  -- already uses (023_voice_providers.sql) - lets the Admin UI show "...a1b2" without ever
  -- exposing or reconstructing the real secret.
  webhook_secret_hint       TEXT,
  last_tested_at            TIMESTAMPTZ,
  last_test_ok              BOOLEAN,
  last_detected_chain_id    INTEGER,
  updated_by                TEXT REFERENCES users(id),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
