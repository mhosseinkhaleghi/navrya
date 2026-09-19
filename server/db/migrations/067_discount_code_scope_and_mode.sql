-- Discount codes: which plans a discount applies to, and whether the customer types a code or the discount is automatic.
--
-- plan_ids: the paid plans the discount applies to. The empty array (the default) means EVERY paid plan, so each
-- existing code keeps working exactly as before. There is deliberately NO CHECK on the element values: the allowed set
-- is PAID_PLAN_NAMES in the application layer, and a database CHECK on plan names is precisely what once left the Pro
-- plan unpurchasable on real PostgreSQL (see 066_widen_plan_checks_for_pro.sql).
--
-- application_mode: 'code' (the customer types the code - the historic behaviour and the default) or 'automatic' (no
-- code to type: the discount is advertised per customer on the plan cards and applied at checkout by its id). An
-- automatic discount still owns an internal, unguessable identifier in the code column, because every reservation and
-- redemption row is keyed by it; the application refuses to let anyone type it.
--
-- Additive only - expand, never edit 001-066. Existing rows read as mode 'code' with no plan restriction.
ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS plan_ids TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS application_mode TEXT NOT NULL DEFAULT 'code' CHECK (application_mode IN ('code', 'automatic'));
CREATE INDEX IF NOT EXISTS discount_codes_automatic_idx ON discount_codes (created_at, id) WHERE application_mode = 'automatic' AND active;
