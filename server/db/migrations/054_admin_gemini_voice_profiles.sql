-- Gemini Voice personality rules are operational configuration, separate from both Gemini text
-- model selection and ElevenLabs credential routing. A row only tunes an allowlisted NAVRYA role.
CREATE TABLE IF NOT EXISTS admin_gemini_voice_profiles (
  character        TEXT PRIMARY KEY CHECK (character IN ('hunter', 'commander', 'engineer', 'sage')),
  voice_male       TEXT NOT NULL,
  voice_female     TEXT NOT NULL,
  speech_rule      TEXT NOT NULL,
  interaction_rule TEXT NOT NULL,
  updated_by       TEXT REFERENCES users(id),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
