-- History for the global AI assistant dock (chat-dock-core.js / chatDockView.jsx), which had no
-- persistence at all before this: its transcript lived only in React state and was lost on
-- every reload/close. Same structural reasoning as mental_health_profiles
-- (010_mental_health_profiles.sql) - one document per user, stored verbatim as jsonb, keyed by
-- user_id itself rather than a separate generated id. Therapist-mode dock messages are
-- deliberately excluded from this table - they already persist inside the mental-health
-- profile's own chatHistory (chat-dock-core.js's existing branch), so storing them here too
-- would duplicate the same messages in two places.
CREATE TABLE IF NOT EXISTS ai_chat_history (
  user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  messages      JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
