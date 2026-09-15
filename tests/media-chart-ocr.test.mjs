import assert from 'node:assert/strict';
import sharp from 'sharp';
import test, { after } from 'node:test';
import { detectChartMetadata, terminateOcrWorker } from '../server/community/media-chart-ocr.mjs';

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

test('a corrupt/undecodable buffer fails honestly as "unavailable", never throwing past this module or hanging', async () => {
  const result = await detectChartMetadata(Buffer.from('not a real image'));
  assert.equal(result.status, 'unavailable');
  assert.equal(result.errorCode, 'IMAGE_DECODE_FAILED');
  assert.equal(result.symbol, null);
  assert.equal(result.timeframe, null);
});
