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
// 2026-09-15 real-production fix #1: a live capture showed the symbol ("BITCOIN") recognized
// correctly while the timeframe stayed unknown. Scanning only OCR's first non-blank line (the
// original design, before any real evidence existed) was widened to every line in the crop.
//
// 2026-09-15 real-production fix #2: the user then supplied an actual reference screenshot of the
// real embedded widget (a full "hide_top_toolbar:false / hide_side_toolbar:false" capture, exactly
// this app's own config - see navrya-src/liveSessionView.jsx's TradingViewAdvancedChart). Its real
// legend line reads, verbatim: "Bitcoin / TetherUS · 4h · Binance   O76,930.00 H77,007.84
// L76,703.59 C76,975.43 +45.42 (+0.06%)" - ONE single line, "Description / Quote · INTERVAL ·
// EXCHANGE", then the OHLC readout - not the two-line layout fix #1 above assumed as its primary
// case (kept anyway as a secondary, harmless-if-unused code path, in case a different widget skin
// ever does wrap it). Concretely this reference image proved three real, previously-unverified
// assumptions wrong/incomplete: (1) TradingView's legend interval is NOT always the bare numeric
// widget-config code (TV_RAW_INTERVAL_TO_TIMEFRAME) - here it renders the human label "4h"
// directly, which happens to already be a literal TIMEFRAMES entry, but ONLY if OCR preserves its
// exact lowercase 'h' - a real OCR engine has no guarantee of that, so timeframe matching below is
// now case-insensitive; (2) the crop's `widthPct` (0.6) was measured against this module's own
// synthetic fixture, not a real legend line, which runs noticeably wider once description text,
// separators, and the exchange name are all real, proportional pixels - widened with margin;
// (3) the exchange/data-source ("Binance") was never extracted at all - it now is, read as the
// token immediately following a trusted timeframe match on the same line (this app's own capture
// flow never lets a user type a source, so this is read only, best-effort, and null when absent).
//
// Contract: isTradingChart/symbol/timeframe/confidence (the original AI-version fields) plus a new
// read-only `exchange` field - null/unknown whenever nothing was confidently read, this module
// never guesses a value that was not actually recognized against the real Instrument Catalog /
// TIMEFRAMES rules.

import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { createWorker, OEM } from 'tesseract.js';
import { normalizeInstrumentCode } from '../db/instrument-normalize.mjs';
import { TIMEFRAMES } from '../db/timeframe-normalize.mjs';

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
// widthPct widened from an earlier 0.6, measured only against this module's own synthetic test
// fixture - a real legend line ("Bitcoin / TetherUS · 4h · Binance   O76,930.00 H...") runs
// noticeably wider once a real description, both separators, and a real exchange name are all
// real proportional pixels, not the short guessed string the fixture used. Cropping too WIDE only
// risks capturing harmless extra OHLC digits we never read anyway - cheap insurance.
const CROP = { topPct: 0.05, heightPct: 0.2, widthPct: 0.85 };
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
// Case-insensitive lookup for the OTHER vocabulary - this app's own already-human labels (a real
// reference capture showed the widget printing "4h" directly, a literal TIMEFRAMES entry - but
// OCR has no guarantee of preserving that exact lowercase 'h'; a real engine misreading it as "4H"
// must still resolve to the same canonical '4h', not silently fail).
const TIMEFRAME_UPPER_LOOKUP = new Map(TIMEFRAMES.map((tf) => [tf.toUpperCase(), tf]));

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
  const upper = text.toUpperCase().replace(/[.,]$/, '');
  const direct = TIMEFRAME_UPPER_LOOKUP.get(upper);
  if (direct) return { value: direct, safe: true };
  if (Object.prototype.hasOwnProperty.call(TV_RAW_INTERVAL_TO_TIMEFRAME, upper)) return { value: TV_RAW_INTERVAL_TO_TIMEFRAME[upper], safe: false };
  return null;
}

// The chart's data source/exchange (e.g. "Binance", "OANDA") - read-only, best-effort, never
// validated against a catalog (this app has none for exchanges the way it does for instruments) -
// a real legend prints it as the token right after the interval ("... · 4h · Binance ...", see
// this module's own header comment), so that is the one place this ever looks. Never itself a
// timeframe/price fragment - requires a letter and rejects a bare number outright.
function candidateExchange(rawToken) {
  const text = String(rawToken || '').trim();
  if (!text || text.length > 40) return null;
  if (!/[A-Za-z]/.test(text)) return null;
  if (/^[\d.,]+$/.test(text)) return null;
  return text;
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
      // reliably at 3x with stretched contrast than at native chart-panel resolution. A real
      // reference capture's legend text renders quite small relative to the full chart image, so
      // 2x (this module's original guess) left it too small/blurry to reliably recognize; bumped
      // to 3x (with a taller cap, since CROP's own widthPct was also widened above).
      .resize({ width: Math.min(3000, width * 3) })
      .greyscale().normalize()
      .png().toBuffer();
  } catch (_) {
    return { status: 'unavailable', isTradingChart: null, symbol: null, timeframe: null, exchange: null, confidence: null, errorCode: 'IMAGE_DECODE_FAILED' };
  }

  let recognized;
  try {
    const worker = await getWorker();
    recognized = await worker.recognize(cropped);
  } catch (_) {
    return { status: 'failed', isTradingChart: null, symbol: null, timeframe: null, exchange: null, confidence: null, errorCode: 'OCR_FAILED' };
  }

  const pageConfidence = Number(recognized && recognized.data && recognized.data.confidence);
  const rawText = (recognized && recognized.data && recognized.data.text) || '';
  // Every non-blank OCR line is scanned, not just the first - a REAL TradingView legend (unlike
  // this module's earlier assumption, written before any live-production evidence existed) does
  // NOT reliably put "SYMBOL, INTERVAL" on one single line: the symbol/description often sits on
  // its own first line, with the interval code printed as the LEADING token of the OHLC readout
  // line right below it (e.g. "15  O 43,251.00 H 43,500.00 L ..."). Restricting to line 1 alone
  // (the previous design) silently dropped that second line's interval entirely - confirmed by a
  // real production capture where the symbol ("BITCOIN") was recognized correctly but the
  // timeframe never was. ':' is deliberately kept OUT of the split/separator class -
  // "BINANCE:BTCUSDT" survives as one token exactly as printed, which is what candidateSymbol()'s
  // own exchange-prefix strip expects.
  const lines = rawText.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);

  let symbol = null;
  let exchange = null;
  let safeTimeframe = null;
  let unsafeTimeframe = null;
  for (const line of lines) {
    // A real, reproduced bug: the real legend's "·" separator regularly OCRs as a lone "-", and
    // "-" is deliberately kept as a valid TOKEN character (a real ticker can contain one, e.g.
    // "BRK-B") - so that misread separator forms its own isolated one-character token instead of
    // being swallowed as whitespace, throwing off "the token right after this one" adjacency
    // (candidateExchange, the OHLC-line positional guards below). Dropping any token with no
    // alnum character at all removes exactly that noise - a real symbol/timeframe/exchange token
    // always contains at least one letter or digit, so this can never drop a genuine candidate.
    const tokens = line.split(/[^A-Za-z0-9:._-]+/).map((w) => w.trim()).filter((w) => w && /[A-Za-z0-9]/.test(w));
    // Found first so a same-line timeframe token can check adjacency to it below - real legends
    // print "Description / Quote · INTERVAL · EXCHANGE" as one line (interval is a few tokens
    // after the symbol's own description, exchange right after that - see this module's own
    // header comment), while a real OHLC readout row prints the interval as that ENTIRE line's
    // own first token instead (e.g. "15  O 43,251.00 H..."), with the symbol on a separate line
    // above it - both real, seen layouts, so both are recognized.
    let symbolIndexInLine = -1;
    if (!symbol) {
      tokens.forEach((token, index) => {
        if (symbolIndexInLine === -1) {
          const candidate = candidateSymbol(token);
          if (candidate) { symbol = candidate; symbolIndexInLine = index; }
        }
      });
    }
    tokens.forEach((token, index) => {
      const tf = candidateTimeframe(token);
      if (!tf) return;
      if (tf.safe) {
        if (!safeTimeframe) { safeTimeframe = tf.value; if (!exchange) exchange = candidateExchange(tokens[index + 1]); }
        return;
      }
      // A bare numeric raw code (e.g. "60", "240") is shape-identical to a fragment an OCR'd OHLC
      // price readout can equally produce ("O 60,120.5 H..." tokenizes to a lone "60" once the
      // comma splits it - a real, reproduced false positive this module was hardened against, see
      // this module's own test suite). Requiring it to either lead its own line, or sit directly
      // after the symbol on the SAME line, is what still rejects that exact case (there, "O"
      // leads the line and the symbol is on a different line entirely) while covering both real
      // legend layouts above.
      const leadsItsOwnLine = index === 0;
      const followsSymbolOnSameLine = symbolIndexInLine !== -1 && index === symbolIndexInLine + 1;
      if ((leadsItsOwnLine || followsSymbolOnSameLine) && !unsafeTimeframe) {
        unsafeTimeframe = tf.value;
        if (!exchange) exchange = candidateExchange(tokens[index + 1]);
      }
    });
  }
  // A letter-suffixed label (15m/1h/1D...) is trusted anywhere it appears; a bare numeric raw code
  // is only trusted once a real symbol was ALSO found somewhere in the crop - see
  // candidateTimeframe()'s own comment - and it satisfied one of the two positional guards above.
  const timeframe = safeTimeframe || (symbol ? unsafeTimeframe : null);
  if (!timeframe) exchange = null;

  const matched = Boolean(symbol || timeframe);
  const confidence = matched && Number.isFinite(pageConfidence) ? Math.max(0, Math.min(1, pageConfidence / 100)) : null;
  return {
    status: 'ready',
    // OCR reads text, not semantics - "is this really a trading chart" is only ever inferred from
    // whether a real, catalog-shaped symbol or a real timeframe label was actually recognized,
    // never a free-standing visual judgment the way the retired AI prompt made one.
    isTradingChart: matched ? true : null,
    symbol, timeframe, exchange, confidence, errorCode: null
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
