-- Module 5 (final module) of the local-first-to-server migration (see ARCHITECTURE.md's Global
-- Data Sync section, 7.18). Structurally different from every other migrated module: the client
-- store (mental-health-store.js) has exactly ONE profile document per user - not a list of
-- records with their own ids - and every one of its mutation functions funnels through a single
-- write() call, never a per-record create/save/remove. There are also no user-uploaded files
-- anywhere in this feature (no attachments/screenshots), so there is no image-store integration
-- and no /images sub-route, unlike every prior module.
--
-- Given that, and given nothing anywhere (client or server) ever queries into any of this
-- profile's ~14 nested sections individually via SQL - every read is the client's own
-- synchronous, whole-document normalize()/load() - splitting this into per-section columns or
-- child tables would only add mapping surface (and mapping bugs) for no real query benefit.
-- The entire client-side profile object is instead stored verbatim as a single jsonb column,
-- keyed by user_id itself (not a separate generated id, since there is exactly one row per
-- user by construction). This is the same reasoning already used for individual compound fields
-- elsewhere (ai_understanding_summary, fate_summary, ...), just applied to the whole document
-- rather than one field of it.
CREATE TABLE IF NOT EXISTS mental_health_profiles (
  user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  profile       JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
