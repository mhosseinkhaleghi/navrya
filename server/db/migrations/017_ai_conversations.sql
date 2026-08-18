-- Reshapes ai_chat_history (014_ai_chat_history.sql) from "one row per user, one flat messages
-- array" into "one row per conversation" - the client (chat-dock-core.js) never actually called
-- this table's route, so it holds no real data anywhere it has been deployed; this ALTER is safe.
-- The global AI assistant dock now supports real, multiple, resumable conversations per user
-- (like the app's other three chat surfaces - Pattern/Strategy/Mental-Health chat - already do
-- with their own chatHistory arrays), instead of treating every question+answer pair as its own
-- disconnected one-off exchange.
ALTER TABLE ai_chat_history DROP CONSTRAINT IF EXISTS ai_chat_history_pkey;
ALTER TABLE ai_chat_history ADD COLUMN IF NOT EXISTS id TEXT;
UPDATE ai_chat_history SET id = 'aiConv-legacy-' || user_id WHERE id IS NULL;
ALTER TABLE ai_chat_history ALTER COLUMN id SET NOT NULL;
ALTER TABLE ai_chat_history ADD PRIMARY KEY (id);
ALTER TABLE ai_chat_history ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT 'Untitled conversation';
ALTER TABLE ai_chat_history ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'openai';
-- Running total across every exchange in this conversation - the AI Assistant screen's history
-- list has always shown a per-conversation token count (aiAsstMessagesTokensMeta); incremented on
-- each PATCH (append), set on the initial POST (create), never recomputed from messages.
ALTER TABLE ai_chat_history ADD COLUMN IF NOT EXISTS total_tokens INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS ai_chat_history_user_idx ON ai_chat_history (user_id, updated_at DESC);
