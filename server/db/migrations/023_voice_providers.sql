-- Admin-managed, encrypted voice-provider (ElevenLabs) credentials + per-language voice routing.
-- Additive only - expand, never edit 001-022.
--
-- Deliberately a SEPARATE domain from admin_ai_keys (004_admin.sql): admin_ai_keys is a
-- natural-key (provider PK), single-row-per-provider, plaintext-at-rest table for the four LLM
-- gateway providers (openai/anthropic/kimi/deepseek) - see that table's own documented
-- plaintext-at-rest tradeoff. ElevenLabs credentials are (a) encrypted at rest (real AES-256-GCM,
-- reusing crypto-util.mjs's existing encryptSecret()/decryptSecret(), the same primitive already
-- used for users.totp_secret_enc), (b) a voice provider, not an LLM token/pricing provider (never
-- added to KNOWN_PROVIDERS), and (c) support MULTIPLE named profiles per provider (an
-- administrator may want more than one ElevenLabs account/workspace), so a natural-key PK does
-- not fit - a generated id is used instead, matching every other app-generated-id table.

CREATE TABLE IF NOT EXISTS admin_voice_provider_credentials (
  id                 TEXT PRIMARY KEY,
  provider           TEXT NOT NULL DEFAULT 'elevenlabs',
  label              TEXT NOT NULL,
  api_key_encrypted  TEXT NOT NULL,
  key_hint           TEXT NOT NULL,               -- last 4 chars only, e.g. "…a1b2" - never the raw key
  enabled            BOOLEAN NOT NULL DEFAULT true,
  validation_status  TEXT NOT NULL DEFAULT 'unknown', -- 'unknown' | 'valid' | 'invalid' | 'restricted'
  validation_error   TEXT,                          -- sanitized reason only, never a raw upstream body
  validated_at       TIMESTAMPTZ,
  updated_by         TEXT REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_voice_language_configs (
  language_code      TEXT PRIMARY KEY,               -- 'fa' | 'ar' | 'en' | 'es' - see REALTIME_LANGUAGES
  provider           TEXT NOT NULL DEFAULT 'elevenlabs',
  credential_id      TEXT REFERENCES admin_voice_provider_credentials(id) ON DELETE SET NULL,
  voice_id           TEXT,
  model_id           TEXT,
  enabled            BOOLEAN NOT NULL DEFAULT false,
  voice_settings     JSONB NOT NULL DEFAULT '{}'::jsonb, -- stability/similarity_boost/style/speed etc. - safe, non-secret
  fallback_provider  TEXT NOT NULL DEFAULT 'openai',
  fallback_voice     TEXT,                           -- e.g. 'marin'/'cedar' - see REALTIME_VOICE_BY_LANGUAGE
  updated_by         TEXT REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Real TTS usage/events, deliberately separate from any LLM token table (ElevenLabs bills in
-- characters, not tokens, and character-cost per request can vary by model/plan/custom voice -
-- never assumed to equal characters 1:1, see character_cost below).
CREATE TABLE IF NOT EXISTS voice_tts_usage_events (
  id                 TEXT PRIMARY KEY,
  language_code      TEXT NOT NULL,
  provider           TEXT NOT NULL,
  credential_id      TEXT REFERENCES admin_voice_provider_credentials(id) ON DELETE SET NULL,
  source             TEXT NOT NULL,                  -- 'live_voice_mode' | 'admin_test' | 'admin_validation'
  characters         INTEGER NOT NULL DEFAULT 0,
  character_cost     INTEGER,                        -- upstream-reported character-cost header, when available
  success            BOOLEAN NOT NULL,
  error_code         TEXT,                            -- sanitized only
  latency_ms         INTEGER,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS voice_tts_usage_events_lang_idx ON voice_tts_usage_events (language_code, created_at DESC);
CREATE INDEX IF NOT EXISTS voice_tts_usage_events_credential_idx ON voice_tts_usage_events (credential_id, created_at DESC);
