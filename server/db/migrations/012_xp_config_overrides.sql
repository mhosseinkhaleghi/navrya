-- Admin-editable XP configuration (Admin Panel "XP & Segmentation" tab). Mirrors the natural-
-- key-PK, single-generic-store convention this migration's own domain already benefits from
-- (compare provider_pricing/admin_ai_keys in 004_admin.sql, one row per natural key). A single
-- JSONB-value table rather than one typed table per config category (points/domain caps/source
-- caps/period caps/achievement points/mastery requirements) on purpose - those categories have
-- different shapes, and a generic {config_key -> value} store avoids six near-identical tables/
-- repo methods for what is, in total, well under a hundred small rows.
--
-- config_key convention (namespaced, never ambiguous which category a row belongs to):
--   points:{xpType}                      -> {"points": 8}
--   domainCap:{domain}                   -> {"dailyCap": 35}
--   recurringCap                         -> {"dailyCap": 80}                (singleton row)
--   sourceCap:{xpType}                   -> {"maxCount": 3}
--   periodCap:{xpType}                   -> {"maxCount": 2, "period": "day"}
--   achievementPoints:{achievementKey}   -> {"points": 10}
--   mastery:{level}:{requirementKey}     -> {"value": 5}
--
-- Only the NUMBER is ever admin-editable - the verification logic behind each type/achievement/
-- requirement (what counts as a real closed Session, a valid achievement's minEvidence, etc.)
-- stays in code, never becomes admin-configurable data. This is a deliberate boundary: an admin
-- can retune how generous the system is, never inject unverified logic into what the server
-- trusts as evidence.
CREATE TABLE IF NOT EXISTS xp_config_overrides (
  config_key   TEXT PRIMARY KEY,
  value        JSONB NOT NULL,
  updated_by   TEXT REFERENCES users(id),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
