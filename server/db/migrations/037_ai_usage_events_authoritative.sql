-- Makes ai_usage_events reportable per-model/per-cost without creating a second parallel usage
-- ledger (ARCHITECTURE.md's explicit constraint: "reconcile onto the *existing* ai_usage_events
-- table, never build a second parallel usage ledger"). Today this table is written to ONLY by the
-- client's self-report (POST /api/users/usage-report -> ai-usage-store.js's reportToServer()) and
-- carries no model or cost column at all - untrusted for money/financial reporting by construction.
--
-- `origin` distinguishes that pre-existing client-reported row shape ('client', the default - every
-- existing row and every existing repo.usageEvents.create() call site is unaffected) from a NEW
-- gateway-originated row ('gateway') written server-side, at the real AI dispatch point
-- (server/pattern-ai-server.mjs), from the SAME real usage/pricing data
-- server/commercial/wallet-service.mjs already computes for wallet_ledger's AI_SETTLEMENT rows -
-- unconditionally, regardless of whether AI_WALLET_ENFORCED is on (see that column's own writer
-- for why: production currently runs with enforcement off, so wallet_ledger alone would report
-- zero AI cost today). retail_charge_micro_usd is 0 for a platform-funded (unenforced) call - it
-- was not actually charged to any wallet - never invented.
--
-- linked_ledger_idempotency_key optionally cross-references the wallet_ledger.idempotency_key
-- ('ai-settle:{reservationId}') of the AI_SETTLEMENT row this same call produced, when one exists
-- (enforcement on). Null when there is no such row (enforcement off) - accurately reflecting that
-- no wallet debit happened for that call, not a missing link.
ALTER TABLE ai_usage_events
  ADD COLUMN IF NOT EXISTS model TEXT,
  ADD COLUMN IF NOT EXISTS feature TEXT,
  ADD COLUMN IF NOT EXISTS provider_cost_micro_usd BIGINT,
  ADD COLUMN IF NOT EXISTS retail_charge_micro_usd BIGINT,
  ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'client',
  ADD COLUMN IF NOT EXISTS linked_ledger_idempotency_key TEXT;

CREATE INDEX IF NOT EXISTS ai_usage_events_origin_provider_model_idx ON ai_usage_events (origin, provider, model);
