-- Media Drive (060_media_assets.sql) - adds the chart's data source/exchange (e.g. "Binance",
-- "OANDA"), read by local OCR alongside symbol/timeframe (server/community/media-chart-ocr.mjs) -
-- a real reference capture showed TradingView's own legend prints it right after the interval
-- ("Bitcoin / TetherUS · 4h · Binance"). Read-only/best-effort like symbol/timeframe - null
-- whenever it was not confidently recognized, never guessed.
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS exchange TEXT;
