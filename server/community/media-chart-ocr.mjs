// NAVRYA Media Drive - fully LOCAL chart-metadata detection (2026-09-15). Replaces the earlier
// AI-vision call (server/pattern-ai-server.mjs's retired analyzeMediaChart): no provider API, no
// wallet charge, no network call of any kind at request time - symbol/timeframe are read straight
// off the pixels with sharp (crop/preprocess, already an existing dependency - see
// server/storage/storage.mjs) + tesseract.js (OCR engine + WASM core bundled locally in
// node_modules, English trained data vendored in server/assets/tessdata/eng.traineddata.gz -
// nothing is ever fetched from a CDN at runtime, unlike tesseract.js's own default behavior).
//
// Why local OCR, not "just read session.instrument/session.timeframe": the free TradingView
// widget this app embeds lets the trader change the visible symbol/timeframe from INSIDE the
// widget itself (allow_symbol_change:true) without that ever updating the session record - a
// screenshot can genuinely show a different symbol/timeframe than what the session was created
// with. Only pixels reflect truth here, so this module always reads the real captured image.
//
// Crop-region caveat (honest limitation): CROP below targets the top-left of the chart pane,
// where TradingView's Advanced Chart widget draws its own symbol/interval legend overlay in every
// capture this app produces (same widget, same theme, same toolbar visibility - see
// navrya-src/liveSessionView.jsx's TradingViewAdvancedChart). This was tuned against a
// synthetically generated test chart (tests/media-chart-ocr.test.mjs), not a live TradingView
// screenshot (browser automation is out of scope here) - if real captures show the legend
// slightly outside this box, CROP is the one place to retune it.
//
// Contract preserved from the retired AI version: isTradingChart/symbol/timeframe/confidence
// only, null/unknown whenever nothing was confidently read - this module never guesses a value
// that was not actually recognized against the real Instrument Catalog / TIMEFRAMES rules.

import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { createWorker, OEM } from 'tesseract.js';
import { normalizeInstrumentCode } from '../db/instrument-normalize.mjs';
import { normalizeTimeframe } from '../db/timeframe-normalize.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Vendored trained data - a local directory path (never a URL), so tesseract.js's own worker
// script reads it straight off disk and never falls back to its default jsdelivr CDN fetch.
const TESSDATA_DIR = path.join(__dirname, '..', 'assets', 'tessdata');
// The worker's own post-decompress cache (separate from TESSDATA_DIR, which stays read-only/
// vendored) - written once per process into the OS temp dir so a repeat request never re-gunzips
// the same ~2MB file.
const CACHE_DIR = path.join(os.tmpdir(), 'navrya-tessdata-cache');

// Fraction of the captured chart image's own width/height that the TradingView legend
// ("EXCHANGE:SYMBOL, INTERVAL") reliably falls within. `topPct` deliberately SKIPS the widget's
// own top toolbar strip (the 1m/5m/15m/1h/4h/1D timeframe BUTTON ROW, when hide_top_toolbar is
// off) - that row lists every possible timeframe as plain text, not just the one actually
// selected (telling those apart would need pixel/color analysis of which button is highlighted,
// not OCR), so including it would make timeframe detection pick an arbitrary button instead of
// the real one. The legend line just below the toolbar always reflects the chart's own real,
// current symbol/interval, so cropping to start just past the toolbar and stay shallow avoids
// that whole class of false match. Generous on both axes - cheap insurance against a slightly
// different real-world position - while still excluding the candlesticks themselves, which is
// what makes this both fast and resistant to an unrelated number deep in the chart body.
const CROP = { topPct: 0.05, heightPct: 0.14, widthPct: 0.6 };
// A real ticker (BTCUSDT, XAUUSD, EURUSD...) is always at least this many characters - the
// toolbar's own timeframe buttons (1M, 5M, 15M, 1H, 4H, 1D) are all shorter, so this alone
// rejects that entire false-positive class even if the crop above ever includes a sliver of it.
const MIN_SYMBOL_LENGTH = 4;

// TradingView's own widget `interval` config value (see tradingViewIntervalFor() in
// liveSessionView.jsx: '1','5','15','30','60','240','D') is what it actually prints in its own
// legend text - NOT this app's own '15m'/'4h'/'1D' labels. Both vocabularies are checked so a
// literal interval code and a human-readable label are equally recognized.
const TV_RAW_INTERVAL_TO_TIMEFRAME = {
  1: '1m', 3: '3m', 5: '5m', 15: '15m', 30: '30m', 60: '1h', 120: '2h', 240: '4h', D: '1D', W: '1W'
};

let workerPromise = null;
function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker('eng', OEM.LSTM_ONLY, {
      langPath: TESSDATA_DIR, cachePath: CACHE_DIR, gzip: true, logger: () => {}
    });
  }
  return workerPromise;
}

function candidateSymbol(rawToken) {
  const text = String(rawToken || '').trim();
  if (!text) return null;
  // "BINANCE:BTCUSDT" -> "BTCUSDT" - the same EXCHANGE:CODE shape tradingViewSymbolFor() itself
  // builds when a curated mapping exists (server-side normalizeInstrumentCode never accepts ':').
  const withoutExchange = text.includes(':') ? text.split(':').pop() : text;
  if (withoutExchange.length < MIN_SYMBOL_LENGTH) return null;
  // A real, reproduced false positive during tuning: normalizeInstrumentCode()'s own pattern
  // (shared with every other symbol-entry surface in this app) allows digits/dots/dashes, so a
  // plain OCR'd price fragment like "120.5" from an OHLC readout technically "validates" as a
  // syntactically-plausible code the same way a real ticker would. A real ticker always has at
  // least one letter (BTCUSDT, XAUUSD, EURUSD); a bare price never does - this is the one extra
  // guard the plain regex alone does not give, and it is safe precisely because every real
  // instrument code in this app's own catalog is letter-containing by construction.
  if (!/[A-Z]/i.test(withoutExchange)) return null;
  return normalizeInstrumentCode(withoutExchange);
}
// `safe: true` - an unambiguous, letter-suffixed label (15m/1h/4h/1D/1W) that could never be
// confused with a plain price fragment, so it is trusted standalone. `safe: false` - one of
// TradingView's own bare NUMERIC raw interval codes (e.g. "60" for 1h) - identical in shape to a
// stray digit out of an OHLC/price readout, so the caller only trusts this when a real symbol was
// ALSO found on the same legend line (see the real false positive this fixed, in this module's
// own test suite: a lone "60" inside "O 60,120.5 H..." was briefly misread as a raw interval code
// with nothing else corroborating it was actually a legend at all).
function candidateTimeframe(rawToken) {
  const text = String(rawToken || '').trim();
  if (!text) return null;
  const direct = normalizeTimeframe(text);
  if (direct) return { value: direct, safe: true };
  const upper = text.toUpperCase().replace(/[.,]$/, '');
  if (Object.prototype.hasOwnProperty.call(TV_RAW_INTERVAL_TO_TIMEFRAME, upper)) return { value: TV_RAW_INTERVAL_TO_TIMEFRAME[upper], safe: false };
  return null;
}

// The ONLY fields this module is ever allowed to report - the exact same contract the retired AI
// vision call had. `imageBuffer` is the real decoded image bytes (never trust a caller-supplied
// symbol/timeframe string instead of actually reading the pixels).
export async function detectChartMetadata(imageBuffer) {
  let cropped;
  try {
    const meta = await sharp(imageBuffer).metadata();
    const sourceWidth = meta.width || 0;
    const sourceHeight = meta.height || 0;
    if (!sourceWidth || !sourceHeight) throw new Error('NO_DIMENSIONS');
    const top = Math.max(0, Math.min(sourceHeight - 1, Math.round(sourceHeight * CROP.topPct)));
    const width = Math.max(1, Math.min(sourceWidth, Math.round(sourceWidth * CROP.widthPct)));
    const height = Math.max(1, Math.min(sourceHeight - top, Math.round(sourceHeight * CROP.heightPct)));
    cropped = await sharp(imageBuffer)
      .extract({ left: 0, top, width, height })
      // Upscale + greyscale + contrast-normalize - small anti-aliased UI text OCRs far more
      // reliably at 2x with stretched contrast than at native chart-panel resolution.
      .resize({ width: Math.min(1800, width * 2) })
      .greyscale().normalize()
      .png().toBuffer();
  } catch (_) {
    return { status: 'unavailable', isTradingChart: null, symbol: null, timeframe: null, confidence: null, errorCode: 'IMAGE_DECODE_FAILED' };
  }

  let recognized;
  try {
    const worker = await getWorker();
    recognized = await worker.recognize(cropped);
  } catch (_) {
    return { status: 'failed', isTradingChart: null, symbol: null, timeframe: null, confidence: null, errorCode: 'OCR_FAILED' };
  }

  const pageConfidence = Number(recognized && recognized.data && recognized.data.confidence);
  const rawText = (recognized && recognized.data && recognized.data.text) || '';
  // Only the FIRST non-blank OCR line, deliberately - TradingView's own legend always draws the
  // symbol+interval as its own first line, with any OHLC value readout (when the widget shows
  // one) on a SEPARATE line right below it. A real, reproduced false positive during tuning: a
  // whole-region token scan picked up a plain "60" out of an OHLC price line and misread it as
  // the RAW interval code for "1h" - restricting to the legend's own first line avoids that whole
  // class of contamination instead of relying on crop-height pixel-tuning alone.
  // ':' is deliberately kept OUT of the split/separator class - "BINANCE:BTCUSDT" survives as one
  // token exactly as printed, which is what candidateSymbol()'s own exchange-prefix strip expects.
  // (An earlier version also concatenated adjacent token pairs to guard against font-kerning
  // splits that never actually occurred in practice - dropped after it produced its own false
  // positive, joining an unrelated price token to a following stray letter into a string that
  // technically passed the symbol pattern; seen in this module's own test suite.)
  const firstLine = rawText.split(/\r?\n/).map((line) => line.trim()).find((line) => line.length > 0) || '';
  const tokens = firstLine.split(/[^A-Za-z0-9:._-]+/).map((w) => w.trim()).filter(Boolean);

  let symbol = null;
  let safeTimeframe = null;
  let unsafeTimeframe = null;
  for (const token of tokens) {
    if (!symbol) symbol = candidateSymbol(token);
    const tf = candidateTimeframe(token);
    if (tf && tf.safe && !safeTimeframe) safeTimeframe = tf.value;
    else if (tf && !tf.safe && !unsafeTimeframe) unsafeTimeframe = tf.value;
  }
  // A letter-suffixed label (15m/1h/1D...) is trusted on its own; a bare numeric raw code (which
  // an OCR'd price fragment can equally produce) is only trusted once a real symbol was ALSO
  // found on the same legend line - see candidateTimeframe()'s own comment.
  const timeframe = safeTimeframe || (symbol ? unsafeTimeframe : null);

  const matched = Boolean(symbol || timeframe);
  const confidence = matched && Number.isFinite(pageConfidence) ? Math.max(0, Math.min(1, pageConfidence / 100)) : null;
  return {
    status: 'ready',
    // OCR reads text, not semantics - "is this really a trading chart" is only ever inferred from
    // whether a real, catalog-shaped symbol or a real timeframe label was actually recognized,
    // never a free-standing visual judgment the way the retired AI prompt made one.
    isTradingChart: matched ? true : null,
    symbol, timeframe, confidence, errorCode: null
  };
}

// Test-only: releases the persistent worker so a test run can exit cleanly instead of leaving a
// live WASM worker process/handle open.
export async function terminateOcrWorker() {
  if (!workerPromise) return;
  const worker = await workerPromise;
  workerPromise = null;
  await worker.terminate();
}
