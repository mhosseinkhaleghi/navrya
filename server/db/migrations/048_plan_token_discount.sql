-- Real-money subscription rollout: a per-plan AI token discount (server/commercial/
-- commercial-defaults.mjs's PLAN_DEFAULTS[*].tokenDiscountPercent, admin-editable via
-- PATCH /api/admin/commercial/plans/:plan same as every other plan field) is applied to the
-- RETAIL charge at settlement time (wallet-service.mjs's settleAiCall(), routes.internal.mjs's
-- /usage/record - the only two places a retail AI charge is ever computed). These columns are
-- purely for transparency/audit - "which discount, if any, applied to this exact charge" - never
-- read back to recompute anything; the charge itself is always the already-discounted number
-- already stored in retail_charge_micro_usd/cash_delta_micro_usd/promo_delta_micro_usd.
--
-- Additive only - expand, never edit 001-047.

ALTER TABLE wallet_ledger
  ADD COLUMN IF NOT EXISTS token_discount_percent NUMERIC;

ALTER TABLE ai_usage_events
  ADD COLUMN IF NOT EXISTS token_discount_percent NUMERIC;
