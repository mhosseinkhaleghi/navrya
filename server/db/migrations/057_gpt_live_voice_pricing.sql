-- GPT-Live 1 voice provider migration: a third non-token pricing shape on the SAME
-- provider_model_pricing table (029_provider_model_pricing.sql), following the exact precedent
-- 046_flat_priced_ai_features.sql already set (an additive nullable column, never a new table -
-- 029's own comment already established provider_model_pricing itself is the extension point for
-- a new pricing shape, not provider_pricing). GPT-Live 1 (server/pattern-ai-server.mjs's
-- mintGptLiveClientSecret()) is billed by OpenAI per minute of a connected full-duplex voice
-- session, billed per second - a fundamentally different shape from both the token-based columns
-- above and the per-call flat price beside it, so it gets its own column rather than overloading
-- either.
ALTER TABLE provider_model_pricing
  ADD COLUMN IF NOT EXISTS per_minute_price_micro_usd BIGINT;

-- Seed row so an operator sees a real, editable starting point in Admin > Commercial > AI pricing
-- instead of a blank/missing row. 50000 micro-USD/min = $0.05/min, OpenAI's published GPT-Live 1
-- rate as of this migration's authoring - VERIFY against OpenAI's current Live API pricing page
-- before enabling AI_WALLET_ENFORCED=true for any user who can select this voice engine; the
-- resolvePricingRate()/reserveForAiCall() fail-closed path (wallet-service.mjs) already refuses to
-- mint a session at all if this row is ever removed or disabled, so a wrong number here is a
-- billing-accuracy risk, not a fail-open/free-usage risk.
INSERT INTO provider_model_pricing (provider, model, per_minute_price_micro_usd, currency, enabled, updated_at)
VALUES ('openai', 'gpt-live-1', 50000, 'USD', true, now())
ON CONFLICT (provider, model) DO NOTHING;
