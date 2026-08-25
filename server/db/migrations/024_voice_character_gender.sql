-- Per-character, per-gender voice routing - replaces admin_voice_language_configs
-- (023_voice_providers.sql) as the mechanism the live Voice Mode actually resolves against.
-- Additive only - expand, never edit 001-023. admin_voice_language_configs itself is left in
-- place untouched (any row an admin already saved there is preserved), just no longer read by
-- the runtime or the admin UI - see docs/ai/elevenlabs-voice-providers.md.
--
-- Found via real usage: NAVRYA has 4 fixed character "skins" (hunter/commander/engineer/sage -
-- navrya-src/characters.js) that a user can switch between per browser tab at any time (never a
-- permanent per-account field - see currentCharacter.js). Voice selection needed to move from
-- "one shared voice per language" to "one voice per character, with both a male and a female
-- option the end user picks between" - language remains a real parameter of the actual synthesis
-- call (still sent as language_code to ElevenLabs, see elevenlabs-client.mjs's synthesize()), but
-- is no longer part of the admin CONFIG key: a single multilingual-capable voice/model pair
-- (eleven_v3, the same model already used for Persian) is expected to serve every language for a
-- given character+gender, avoiding a 4-language x 4-character x 2-gender = 32-slot matrix nobody
-- asked for.
CREATE TABLE IF NOT EXISTS admin_voice_character_configs (
  character          TEXT NOT NULL,                    -- 'hunter' | 'commander' | 'engineer' | 'sage'
  gender             TEXT NOT NULL,                     -- 'male' | 'female'
  provider           TEXT NOT NULL DEFAULT 'elevenlabs',
  credential_id      TEXT REFERENCES admin_voice_provider_credentials(id) ON DELETE SET NULL,
  voice_id           TEXT,
  model_id           TEXT,
  enabled            BOOLEAN NOT NULL DEFAULT false,
  voice_settings     JSONB NOT NULL DEFAULT '{}'::jsonb,
  fallback_provider  TEXT NOT NULL DEFAULT 'openai',
  fallback_voice     TEXT,
  updated_by         TEXT REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (character, gender)
);
CREATE INDEX IF NOT EXISTS admin_voice_character_configs_credential_idx ON admin_voice_character_configs (credential_id);
