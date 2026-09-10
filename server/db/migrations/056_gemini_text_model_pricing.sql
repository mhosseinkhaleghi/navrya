-- Production incident: authenticated Gemini Chat requests reached the commercial wallet gate but
-- failed closed with PROVIDER_PRICING_NOT_CONFIGURED before the Gemini provider was called. The
-- production Gemini credential itself remained healthy (Voice/TTS calls continued to succeed),
-- so the missing provider_model_pricing rows were the complete cause of /api/ai/chat returning 503.
--
-- Rates are Google Gemini Developer API Standard paid-tier text rates published at
-- https://ai.google.dev/gemini-api/docs/pricing on 2026-09-10, converted from per-1M tokens to
-- this table's per-1K unit. The Gemini 3.1 Pro Preview row uses the <=200k-prompt tier
-- ($2 input / $12 output / $0.20 cached input per 1M); NAVRYA's bounded Chat context is well below
-- that tier boundary. The 2.5 Flash rows use text/image/video input and cached-input rates, not
-- the separate audio rates, because these model ids belong to the text Chat catalog.
--
-- ON CONFLICT DO NOTHING deliberately preserves a rate already managed through Admin. Additive
-- only - expand, never edit 001-055.
INSERT INTO provider_model_pricing
  (provider, model, prompt_price_per_1k, completion_price_per_1k, cached_input_price_per_1k, currency, enabled, updated_at)
VALUES
  ('gemini', 'gemini-3.1-pro-preview', 0.0020, 0.0120, 0.00020, 'USD', true, now()),
  ('gemini', 'gemini-2.5-flash',       0.0003, 0.0025, 0.00003, 'USD', true, now()),
  ('gemini', 'gemini-2.5-flash-lite',  0.0001, 0.0004, 0.00001, 'USD', true, now())
ON CONFLICT (provider, model) DO NOTHING;
