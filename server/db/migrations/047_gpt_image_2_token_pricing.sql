-- Follow-up to 046_flat_priced_ai_features.sql. That migration added flat/per-call pricing
-- because gpt-image-1's images/edits response was assumed to report no token-style usage at all -
-- server/pattern-ai-server.mjs's callOpenAIImageEdit() was reading nothing from result.usage and
-- Scenario Map/Analysis Map always passed usage:null.
--
-- That assumption was wrong for the model actually in use now: OpenAI's images/edits endpoint DOES
-- report a real usage object (input_tokens/input_tokens_details.cached_tokens/output_tokens/
-- total_tokens) for GPT image models, and NAVRYA is upgrading its own image-generation model to
-- gpt-image-2 (server/pattern-ai-server.mjs's IMAGE_EDIT_MODEL) at the same time. callOpenAIImageEdit()
-- now captures and returns that real usage, so Scenario Map/Analysis Map are priced through the
-- SAME accurate, already-battle-tested token-based path every text call uses
-- (wallet-service.mjs's resolvePricingRate()/costMicroUsdFor()) instead of an admin-guessed flat
-- rate per call - a real improvement in billing accuracy, not just a model swap.
--
-- Rates below are OpenAI's own published per-1M-token pricing for gpt-image-2 converted to this
-- table's per-1K unit ($8.00/1M input -> $0.008/1K, $2.00/1M cached input -> $0.002/1K, $30.00/1M
-- output -> $0.03/1K) - verify/adjust in Admin > Commercial > Provider model pricing against
-- OpenAI's current pricing page; these are a real, sourced starting point, not a guess like
-- 046's flat rate was.
--
-- The old gpt-image-1 flat-priced row from 046 is left as-is (harmless, simply no longer
-- referenced by any real call now that IMAGE_EDIT_MODEL points at gpt-image-2).
--
-- Additive only - expand, never edit 001-046.
INSERT INTO provider_model_pricing (provider, model, prompt_price_per_1k, completion_price_per_1k, cached_input_price_per_1k, currency, enabled, updated_at)
VALUES ('openai', 'gpt-image-2', 0.008, 0.03, 0.002, 'USD', true, now())
ON CONFLICT (provider, model) DO NOTHING;
