-- Real XP engine (ARCHITECTURE.md Section 11): adds domain/source/dedupe tracking to the
-- 7.17 user_xp_events table so events can be verified, capped, and deduplicated server-side
-- instead of trusting the client's own bookkeeping. Additive only - existing rows keep
-- dedupe_key NULL and are simply exempt from the new unique index (see its WHERE clause).
ALTER TABLE user_xp_events ADD COLUMN IF NOT EXISTS domain TEXT;
ALTER TABLE user_xp_events ADD COLUMN IF NOT EXISTS source_type TEXT;
ALTER TABLE user_xp_events ADD COLUMN IF NOT EXISTS source_id TEXT;
ALTER TABLE user_xp_events ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

-- One dedupe key can only ever pay XP once per user. Partial index (WHERE dedupe_key IS NOT NULL)
-- so pre-engine rows (and any future event type that legitimately has no dedupe key) never
-- collide with each other under a shared NULL.
CREATE UNIQUE INDEX IF NOT EXISTS user_xp_events_dedupe_idx ON user_xp_events (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

-- Backs domain-daily-cap checks and domainBreakdown() (mastery domain-balance math).
CREATE INDEX IF NOT EXISTS user_xp_events_domain_idx ON user_xp_events (user_id, domain, occurred_at);

-- Backs per-source caps (e.g. "max 3 chart-entry awards per session") and per-source running
-- totals (e.g. "at most 18 points across every trade_* event tagged to one tradeId").
CREATE INDEX IF NOT EXISTS user_xp_events_source_idx ON user_xp_events (user_id, type, source_id);
