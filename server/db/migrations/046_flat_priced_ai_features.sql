-- Production incident: Scenario Map's image generation (gpt-image-1 via
-- /api/sessions/visualize-scenario) failed closed with PROVIDER_PRICING_NOT_CONFIGURED on every
-- attempt. Root cause: provider_model_pricing (029_provider_model_pricing.sql) and
-- wallet-service.mjs's costMicroUsdFor() are exclusively token-based (prompt/completion
-- price-per-1k) - a real gap, since OpenAI bills image generation/edits per call (by size/
-- quality), not by token, and visualizeScenario() itself always reports usage:null (there is no
-- token count to price). No existing column shape fit a per-call rate, so this had silently never
-- been priceable since the feature shipped.
--
-- Additive only - expand, never edit 001-045. A NULL flat_price_per_call_micro_usd changes nothing
-- for every existing token-priced row; wallet-service.mjs only takes the flat-rate path for a row
-- that explicitly sets it (see resolvePricingRate()'s own comment).
ALTER TABLE provider_model_pricing
  ADD COLUMN IF NOT EXISTS flat_price_per_call_micro_usd BIGINT;

-- Seeds a real, immediately-usable rate for gpt-image-1 at the 'auto' size/quality this app always
-- requests (callOpenAIImageEdit()) so the fix takes effect without requiring a separate admin
-- panel visit. $0.07/call approximates OpenAI's published medium-quality image-edit pricing as of
-- this writing - an admin should verify/adjust this in Admin > Commercial > Provider model pricing
-- against OpenAI's current pricing page, this is a reasonable starting estimate, not a
-- contractual rate. ON CONFLICT DO NOTHING - never overwrites a rate an admin already configured.
INSERT INTO provider_model_pricing (provider, model, flat_price_per_call_micro_usd, currency, enabled, updated_at)
VALUES ('openai', 'gpt-image-1', 70000, 'USD', true, now())
ON CONFLICT (provider, model) DO NOTHING;
