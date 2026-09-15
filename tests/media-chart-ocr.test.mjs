import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import test, { after } from 'node:test';
import { detectChartMetadata, terminateOcrWorker } from '../server/community/media-chart-ocr.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'media-chart-ocr');

// NAVRYA Media Drive - fully local chart-metadata detection (2026-09-15, replacing the earlier
// AI-vision call - real-user feedback: too slow, inconsistent, and burned tokens for a small,
// structurally fixed label). No live TradingView screenshot is fetched here (browser automation
// is out of scope for this suite, per this repo's own convention) - instead this generates a
// SYNTHETIC chart image with sharp that reproduces the real widget's own layout (dark theme, a
// top toolbar timeframe-button row, and a legend line reading "EXCHANGE:SYMBOL, INTERVAL" just
// below it - see navrya-src/liveSessionView.jsx's TradingViewAdvancedChart/tradingViewIntervalFor)
// closely enough to exercise the real crop/OCR/parsing pipeline end to end, not just its pure
// parsing helpers. This is what "tested on a chart image" means in a suite with no browser.

after(async () => { await terminateOcrWorker(); });

function syntheticChart({ legend = 'BINANCE:BTCUSDT, 15', toolbar = '1m  5m  15m  1h  4h  1D', includeLegend = true } = {}) {
  const width = 1200, height = 700;
  const svg = `
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#0b0e11"/>
    <rect x="0" y="0" width="100%" height="40" fill="#131722"/>
    <text x="20" y="26" font-family="Arial" font-size="16" fill="#d1d4dc">${toolbar}</text>
    ${includeLegend ? `<text x="14" y="70" font-family="Arial" font-size="22" font-weight="bold" fill="#d1d4dc">${legend}</text>` : ''}
    <text x="14" y="96" font-family="Arial" font-size="14" fill="#787b86">O 60,120.5 H 60,340.0 L 59,900.2 C 60,180.7</text>
    ${Array.from({ length: 40 }).map((_, i) => {
      const x = 100 + i * 26;
      const up = i % 2 === 0;
      const bodyTop = 300 + (Math.sin(i) * 80);
      const bodyH = 40 + (i % 5) * 8;
      return `<rect x="${x}" y="${bodyTop}" width="10" height="${bodyH}" fill="${up ? '#26a69a' : '#ef5350'}"/>`;
    }).join('\n')}
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

test('reads a real chart legend ("EXCHANGE:SYMBOL, RAW_INTERVAL") straight off the pixels - BINANCE:BTCUSDT, 15 -> BTCUSDT / 15m - in well under a second, no network, no AI', async () => {
  const image = await syntheticChart({ legend: 'BINANCE:BTCUSDT, 15' });
  const startedAt = Date.now();
  const result = await detectChartMetadata(image);
  const elapsedMs = Date.now() - startedAt;
  assert.equal(result.status, 'ready');
  assert.equal(result.isTradingChart, true);
  assert.equal(result.symbol, 'BTCUSDT');
  assert.equal(result.timeframe, '15m');
  assert.ok(result.confidence > 0.5, `expected real confidence, got ${result.confidence}`);
  assert.ok(elapsedMs < 5000, `expected local OCR to complete in well under 5s, took ${elapsedMs}ms`);
});

test('maps every real TradingView raw interval code the widget can actually display - not just the app\'s own "15m"/"1h" labels', async () => {
  const cases = [
    ['OANDA:XAUUSD, 60', 'XAUUSD', '1h'],
    ['OANDA:EURUSD, D', 'EURUSD', '1D'],
    ['BINANCE:ETHUSDT, 240', 'ETHUSDT', '4h'],
    ['OANDA:GBPUSD, 30', 'GBPUSD', '30m']
  ];
  for (const [legend, wantSymbol, wantTimeframe] of cases) {
    const image = await syntheticChart({ legend });
    const result = await detectChartMetadata(image);
    assert.equal(result.symbol, wantSymbol, `legend "${legend}"`);
    assert.equal(result.timeframe, wantTimeframe, `legend "${legend}"`);
  }
});

test('an image with no recognizable chart legend is reported honestly as unknown - never a fabricated guess', async () => {
  const image = await syntheticChart({ includeLegend: false });
  const result = await detectChartMetadata(image);
  assert.equal(result.status, 'ready');
  assert.equal(result.isTradingChart, null);
  assert.equal(result.symbol, null);
  assert.equal(result.timeframe, null);
  assert.equal(result.confidence, null);
});

test('a genuinely non-chart image (no legend, no candlesticks) is also reported as unknown, not misread as some other value', async () => {
  const svg = `<svg width="1200" height="700" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#222"/><text x="400" y="360" font-family="Arial" font-size="40" fill="#fff">Vacation Photo</text></svg>`;
  const image = await sharp(Buffer.from(svg)).png().toBuffer();
  const result = await detectChartMetadata(image);
  assert.equal(result.isTradingChart, null);
  assert.equal(result.symbol, null);
  assert.equal(result.timeframe, null);
});

// Real, reproduced false-positive this module was specifically hardened against: the widget's own
// top TOOLBAR row lists every timeframe option as plain text ("1m 5m 15m 1h 4h 1D") - before the
// crop region was tuned to start below it, OCR picked up "1M" from that row and misidentified it
// as the SYMBOL (a short, technically pattern-valid-looking token), instead of the real "BTCUSDT"
// on the legend line below. This proves that class of misread stays fixed.
test('never mistakes a toolbar timeframe-button label ("1M", "5M", "15M"...) for the symbol - only a real, long-enough ticker qualifies', async () => {
  const image = await syntheticChart({ legend: 'BINANCE:BTCUSDT, 15', toolbar: '1m  5m  15m  1h  4h  1D' });
  const result = await detectChartMetadata(image);
  assert.equal(result.symbol, 'BTCUSDT');
  assert.notEqual(result.symbol, '1M');
});

test('an exchange-prefixed symbol ("EXCHANGE:CODE") is normalized to the plain instrument code, the same shape normalizeInstrumentCode() accepts everywhere else in this app', async () => {
  const image = await syntheticChart({ legend: 'OANDA:XAUUSD, 60' });
  const result = await detectChartMetadata(image);
  assert.equal(result.symbol, 'XAUUSD');
  assert.doesNotMatch(result.symbol, /:/);
});

// Real production bug fixed 2026-09-15: a live capture recognized the symbol ("BITCOIN") but not
// the timeframe. Root cause - unlike this suite's earlier single-line fixture, a real TradingView
// legend can print the symbol/description on its OWN first line, with the raw interval code
// leading the OHLC readout line right below it, instead of comma-joined with the symbol. This
// reproduces that exact two-line layout to prove detection now covers it too.
test('reads the timeframe even when it is NOT on the same line as the symbol - the interval leading a separate OHLC line below it, as a real capture can look', async () => {
  const width = 1200, height = 700;
  const svg = `
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#0b0e11"/>
    <rect x="0" y="0" width="100%" height="40" fill="#131722"/>
    <text x="20" y="26" font-family="Arial" font-size="16" fill="#d1d4dc">1m  5m  15m  1h  4h  1D</text>
    <text x="14" y="70" font-family="Arial" font-size="22" font-weight="bold" fill="#d1d4dc">BINANCE:BTCUSDT</text>
    <text x="14" y="96" font-family="Arial" font-size="14" fill="#787b86">15  O 43,251.00 H 43,500.00 L 43,100.00 C 43,300.00</text>
    ${Array.from({ length: 40 }).map((_, i) => {
      const x = 100 + i * 26;
      const up = i % 2 === 0;
      const bodyTop = 300 + (Math.sin(i) * 80);
      const bodyH = 40 + (i % 5) * 8;
      return `<rect x="${x}" y="${bodyTop}" width="10" height="${bodyH}" fill="${up ? '#26a69a' : '#ef5350'}"/>`;
    }).join('\n')}
  </svg>`;
  const image = await sharp(Buffer.from(svg)).png().toBuffer();
  const result = await detectChartMetadata(image);
  assert.equal(result.symbol, 'BTCUSDT');
  assert.equal(result.timeframe, '15m');
  assert.equal(result.isTradingChart, true);
});

// Real production bug fixed 2026-09-15 (second pass): the user supplied an actual reference
// screenshot of the real embedded widget. Its real legend line reads, verbatim: "Bitcoin /
// TetherUS · 4h · Binance   O76,930.00 H77,007.84 L76,703.59 C76,975.43 +45.42 (+0.06%)" - ONE
// line, "/" and "·" separators (not the earlier synthetic fixtures' comma), a human-readable
// interval label rather than a bare numeric code, an exchange name right after it, and much
// smaller real-world text/image proportions than this suite's other (deliberately large, easy)
// fixtures. This reproduces that exact real layout/proportions - including the toolbar row still
// genuinely containing its own "4h" button label directly above the legend, which must NOT be
// what gets matched - to prove symbol/timeframe/exchange all now come from the real legend line.
test('reads the real reference capture\'s own legend format ("Description / Quote · INTERVAL · EXCHANGE") at realistic small-text/full-widget proportions, never the toolbar\'s own matching button label above it', async () => {
  const width = 1270, height = 651;
  const svg = `
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#131722"/>
    <rect x="0" y="0" width="100%" height="34" fill="#1e222d"/>
    <text x="10" y="22" font-family="Arial" font-size="13" fill="#d1d4dc">BTCUSD1   1m  5m  30m  1h  4h</text>
    <text x="10" y="58" font-family="Arial" font-size="13" fill="#d1d4dc">Bitcoin / TetherUS &#183; 4h &#183; Binance   O76,930.00 H77,007.84 L76,703.59 C76,975.43 +45.42 (+0.06%)</text>
    <text x="10" y="80" font-family="Arial" font-size="11" fill="#787b86">Vol &#183; BTC 998</text>
    ${Array.from({ length: 60 }).map((_, i) => {
      const x = 60 + i * 20;
      const up = i % 2 === 0;
      const bodyTop = 300 + (Math.sin(i) * 80);
      const bodyH = 40 + (i % 5) * 8;
      return `<rect x="${x}" y="${bodyTop}" width="8" height="${bodyH}" fill="${up ? '#26a69a' : '#ef5350'}"/>`;
    }).join('\n')}
  </svg>`;
  const image = await sharp(Buffer.from(svg)).png().toBuffer();
  const result = await detectChartMetadata(image);
  assert.equal(result.symbol, 'BITCOIN');
  assert.equal(result.timeframe, '4h');
  assert.equal(result.exchange, 'Binance');
  assert.equal(result.isTradingChart, true);
});

test('timeframe matching against this app\'s own human labels (1D/4h/1W...) is case-insensitive, since real OCR has no guarantee of preserving exact letter case', async () => {
  const image = await syntheticChart({ legend: 'Gold / U.S. Dollar · 4H · OANDA' });
  const result = await detectChartMetadata(image);
  assert.equal(result.timeframe, '4h');
});

// Real reference captures the user supplied (2026-09-15, second pass): four screenshots of the
// SAME app-embedded widget at four different real intervals. Proved a real, reproduced bug: the
// legend's "Description" is regularly TWO tokens ("Bitcoin" / "TetherUS"), so an interval shown as
// TradingView's own bare numeric code (not this app's own letter-suffixed label - real evidence:
// "5" for 5-minute, "30" for 30-minute, but "1h"/"1D" ARE shown letter-suffixed) was never actually
// adjacent to the SYMBOL token alone, only to the full two-token description - the earlier
// "immediately after the symbol" adjacency check silently failed on every one of these real
// captures. This full-widget fixture (small text, real toolbar, real legend format) reproduces
// each of the four real captures at their own real interval to prove the fix.
function realWidgetChart({ legend, toolbar = 'BTCUSD1   1m  5m  30m  1h  4h' } = {}) {
  const width = 1270, height = 651;
  const svg = `
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#131722"/>
    <rect x="0" y="0" width="100%" height="34" fill="#1e222d"/>
    <text x="10" y="22" font-family="Arial" font-size="13" fill="#d1d4dc">${toolbar}</text>
    <text x="10" y="58" font-family="Arial" font-size="13" fill="#d1d4dc">${legend}</text>
    <text x="10" y="80" font-family="Arial" font-size="11" fill="#787b86">Vol &#183; BTC 265</text>
    ${Array.from({ length: 60 }).map((_, i) => {
      const x = 60 + i * 20;
      const up = i % 2 === 0;
      const bodyTop = 300 + (Math.sin(i) * 80);
      const bodyH = 40 + (i % 5) * 8;
      return `<rect x="${x}" y="${bodyTop}" width="8" height="${bodyH}" fill="${up ? '#26a69a' : '#ef5350'}"/>`;
    }).join('\n')}
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

test('real reference capture #1 (1h, safe letter-suffixed path): "Bitcoin / TetherUS · 1h · Binance ..."', async () => {
  const image = await realWidgetChart({ legend: 'Bitcoin / TetherUS &#183; 1h &#183; Binance   O76,984.05 H77,054.64 L76,892.01 C76,892.02 -92.03 (-0.12%)' });
  const result = await detectChartMetadata(image);
  assert.equal(result.symbol, 'BITCOIN');
  assert.equal(result.timeframe, '1h');
  assert.equal(result.exchange, 'Binance');
});

test('real reference capture #2 (bare "5", unsafe path - the actual real bug: two description tokens sit between the symbol and the interval): "Bitcoin / TetherUS · 5 · Binance ..."', async () => {
  const image = await realWidgetChart({ legend: 'Bitcoin / TetherUS &#183; 5 &#183; Binance   O77,032.63 H77,042.01 L76,892.01 C76,895.25 -137.38 (-0.18%)', toolbar: 'BTCUSD1   1m  5m  30m  1h' });
  const result = await detectChartMetadata(image);
  assert.equal(result.symbol, 'BITCOIN');
  assert.equal(result.timeframe, '5m');
  assert.equal(result.exchange, 'Binance');
});

test('real reference capture #3 (1D, safe letter-suffixed path): "Bitcoin / TetherUS · 1D · Binance ..."', async () => {
  const image = await realWidgetChart({ legend: 'Bitcoin / TetherUS &#183; 1D &#183; Binance   O78,189.20 H78,250.46 L76,703.59 C76,920.54 -1,268.67 (-1.62%)', toolbar: 'BTCUSD1   1m  5m  30m  1h  D' });
  const result = await detectChartMetadata(image);
  assert.equal(result.symbol, 'BITCOIN');
  assert.equal(result.timeframe, '1D');
  assert.equal(result.exchange, 'Binance');
});

test('real reference capture #4 (bare "30", unsafe path, a different symbol/exchange): "Ethereum / U.S. Dollar · 30 · Coinbase ..."', async () => {
  const image = await realWidgetChart({ legend: 'Ethereum / U.S. Dollar &#183; 30 &#183; Coinbase   O2,473.50 H2,478.35 L2,470.77 C2,473.62 +0.10 (+0.00%)', toolbar: 'ETHUSD   1m  5m  30m  1h  D' });
  const result = await detectChartMetadata(image);
  assert.equal(result.symbol, 'ETHEREUM');
  assert.equal(result.timeframe, '30m');
  assert.equal(result.exchange, 'Coinbase');
});

// Real reference capture (a wildly different, arbitrary third-party TradingView skin, not this
// app's own embedded widget - a real user-supplied example of what an ordinary device Upload can
// contain): extra indicator-overlay legend lines below the real one, packed with bare numbers
// ("Sessions Flow [Cartel Console] 0000-0900 2100-0600 ... 25 70 20 5 90 95 99 70 1 8 90 top_right",
// "ICT Concepts [LuxAlgo] Present 5 2 10 1 1 4 2 FVG 2 3 1 Default 0700-0900 ..."). Proves the
// OHLC-region cutoff keeps those numbers from ever being mistaken for the real interval, even
// though several of them exactly equal a real raw interval code (5, 90->no, but literally "5"
// appears twice, "30" nowhere here but the principle is the same class of risk).
test('extra indicator-overlay legend lines packed with bare numbers never contaminate timeframe detection - only the real legend line\'s own OHLC-bounded region is ever searched', async () => {
  const width = 1320, height = 900;
  const svg = `
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#ffffff"/>
    <rect x="0" y="0" width="100%" height="30" fill="#f0f3fa"/>
    <text x="10" y="20" font-family="Arial" font-size="13" fill="#131722">OILUSD   1m  5m  15m  1h  4h  D  W</text>
    <text x="10" y="90" font-family="Arial" font-size="13" fill="#131722">WTI Crude (OIL) / US Dollar &#183; 5 &#183; easyMarkets   O103.460 H103.495 L103.445 C103.475 +0.020 (+0.02%)</text>
    <text x="10" y="110" font-family="Arial" font-size="11" fill="#787b86">Sessions Flow [Cartel Console] 0000-0900 2100-0600 0800-1700 1300-2200 25 70 20 5 90 95 99 70 1 8 90 top_right</text>
    <text x="10" y="128" font-family="Arial" font-size="11" fill="#787b86">ICT Concepts [LuxAlgo] Present 5 2 10 1 1 4 2 FVG 2 3 1 Default 0700-0900 0700-1000 1500-1700 1000-1400</text>
  </svg>`;
  const image = await sharp(Buffer.from(svg)).png().toBuffer();
  const result = await detectChartMetadata(image);
  assert.equal(result.timeframe, '5m', 'must read the real legend\'s own interval, never a stray "5" out of an indicator overlay line');
});

// Real production files (2026-09-15, fourth pass) - actual PNGs the user captured through the
// real app and downloaded via Media Drive's own Download button, not a synthetic reproduction.
// Found the actual remaining real bug this way: raw OCR on real-gold-1h-oanda.png reads
// "...Dollar: 1h-OANDA (c) (c) 04,281.545..." - the "·" separator between the interval and the
// exchange vanished ENTIRELY (no dash, no space), fusing them into one glued token "1h-OANDA" that
// matched nothing on its own, since both '-' and ':' are kept as valid instrument-code characters.
// Fixed by also offering a token's own dash/colon-split pieces as fallback candidates. These two
// fixtures are the real, ground-truth regression test for that fix - not a guess at what a real
// capture might look like.
test('real production file: real-gold-1h-oanda.png - a genuine capture where OCR fused the interval and exchange into one token ("1h-OANDA"), the actual bug this module was fixed for', async () => {
  const buffer = await readFile(path.join(FIXTURES_DIR, 'real-gold-1h-oanda.png'));
  const result = await detectChartMetadata(buffer);
  assert.equal(result.symbol, 'GOLD');
  assert.equal(result.timeframe, '1h');
  assert.equal(result.exchange, 'OANDA');
});

test('real production file: real-bitcoin-1h-binance.png - a second genuine capture, confirming the fix generalizes beyond the one fixture it was found from', async () => {
  const buffer = await readFile(path.join(FIXTURES_DIR, 'real-bitcoin-1h-binance.png'));
  const result = await detectChartMetadata(buffer);
  assert.equal(result.symbol, 'BITCOIN');
  assert.equal(result.timeframe, '1h');
  assert.equal(result.exchange, 'Binance');
});

// Real production files (2026-09-15, fifth pass) - three MORE real downloads, found via the same
// method (batch-testing every real file straight from the user's own Downloads folder). Two new
// real OCR artifacts, distinct from the token-fusion bug above: (1) the "·" separator sometimes
// glues a dash to the TRAILING edge of the interval token itself while the token after it stays
// properly separated - real raw OCR text "TetherUS - 15- Binance" tokenizes to "15-" and "Binance",
// and "15-" doesn't equal "15" under a strict lookup; (2) OCR occasionally misreads the unit letter
// itself - real raw text "1n- Binance" for a genuine 1-hour chart (h/n look alike at small sizes in
// many fonts). Fixed by stripping any leading/trailing punctuation before matching, and trying a
// trailing N->H substitution (safe: no real timeframe value ever legitimately contains "N").
test('real production file: real-bitcoin-1h-binance-2.png - trailing-dash artifact ("1n- Binance") PLUS an h/n OCR misread, both on the same real capture', async () => {
  const buffer = await readFile(path.join(FIXTURES_DIR, 'real-bitcoin-1h-binance-2.png'));
  const result = await detectChartMetadata(buffer);
  assert.equal(result.symbol, 'BITCOIN');
  assert.equal(result.timeframe, '1h');
  assert.equal(result.exchange, 'Binance');
});

test('real production file: real-bitcoin-15m-binance.png - a genuine 15-minute chart with the same trailing-dash artifact ("15- Binance")', async () => {
  const buffer = await readFile(path.join(FIXTURES_DIR, 'real-bitcoin-15m-binance.png'));
  const result = await detectChartMetadata(buffer);
  assert.equal(result.symbol, 'BITCOIN');
  assert.equal(result.timeframe, '15m');
  assert.equal(result.exchange, 'Binance');
});

test('real production file: real-bitcoin-1h-binance-3.png - a third independent 1h capture, confirming the fix is not a one-off', async () => {
  const buffer = await readFile(path.join(FIXTURES_DIR, 'real-bitcoin-1h-binance-3.png'));
  const result = await detectChartMetadata(buffer);
  assert.equal(result.symbol, 'BITCOIN');
  assert.equal(result.timeframe, '1h');
  assert.equal(result.exchange, 'Binance');
});

test('a corrupt/undecodable buffer fails honestly as "unavailable", never throwing past this module or hanging', async () => {
  const result = await detectChartMetadata(Buffer.from('not a real image'));
  assert.equal(result.status, 'unavailable');
  assert.equal(result.errorCode, 'IMAGE_DECODE_FAILED');
  assert.equal(result.symbol, null);
  assert.equal(result.timeframe, null);
});
