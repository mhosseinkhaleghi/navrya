import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Adds a third "Market chart" Live Session view (TradingView's free hosted Advanced Chart
// widget) beside the existing Timeline/Session report CommandBar views.
//
// navrya-src/*.jsx has no JSX/ESM transform wired into this project's plain `node --test` runner
// (the established, documented limitation - see tests/session-actions.test.mjs and
// tests/session-date-defaults.test.mjs), so this is static source-assertion coverage of the real
// file, matching the rest of this project's own convention for the same reason.
const root = process.cwd();
const src = await readFile(path.join(root, 'navrya-src', 'liveSessionView.jsx'), 'utf8');

function block(re, label) {
  const match = re.exec(src);
  assert.ok(match, `could not find ${label} in navrya-src/liveSessionView.jsx`);
  return match[0];
}

// Extracts the literal text between two exact markers (indexOf-based, not regex) - robust
// against nested braces/parens inside a real function body, which a non-greedy `[\s\S]*?`
// regex cannot reliably bound.
function sliceBetween(startMarker, endMarker, label) {
  const start = src.indexOf(startMarker);
  assert.ok(start > -1, `could not find the start of ${label} ("${startMarker}") in navrya-src/liveSessionView.jsx`);
  const end = src.indexOf(endMarker, start + startMarker.length);
  assert.ok(end > -1, `could not find the end of ${label} ("${endMarker}") in navrya-src/liveSessionView.jsx`);
  return src.slice(start, end);
}

test('CommandBar segmented control gains a third "chart" view beside timeline and report, in that order', () => {
  const segmented = block(
    /\[\['timeline', tr\(lang, 'viewTimeline'\)\][\s\S]{0,80}\]\.map/,
    'the CommandBar segmented-control view list'
  );
  assert.match(segmented, /\['chart', tr\(lang, 'viewChart'\)\]/);
  // Order: timeline, then chart, then report - Timeline/Report positions and behavior unchanged.
  const order = segmented.match(/\['(timeline|chart|report)',/g).map((s) => s.match(/'(\w+)'/)[1]);
  assert.deepEqual(order, ['timeline', 'chart', 'report']);
});

test('the segmented-control buttons expose an accessible active-state label', () => {
  const segmented = block(/\[\['timeline'[\s\S]{0,700}?<\/button>/, 'the segmented-control button markup');
  assert.match(segmented, /aria-pressed=\{view === id\}/);
  assert.match(segmented, /aria-label=\{label\}/);
});

test('the main view render adds a distinct chart branch without touching Timeline/Report behavior', () => {
  const render = sliceBetween("{view === 'timeline' ? (", '{chartModalOpen', 'the view === render conditional');
  assert.match(render, /\) : view === 'chart' \? \(\s*<MarketChartView session=\{session\} lang=\{lang\} \/>\s*\) : \(/);
  assert.match(render, /<ReportView session=\{session\} lang=\{lang\} indexById=\{indexById\} \/>/);
});

test('the widget loads the official TradingView free hosted Advanced Chart embed script, and nothing else', () => {
  assert.match(src, /const TV_ADVANCED_CHART_SCRIPT_SRC = 'https:\/\/s3\.tradingview\.com\/external-embedding\/embed-widget-advanced-chart\.js';/);
  assert.match(src, /script\.src = TV_ADVANCED_CHART_SCRIPT_SRC;/);
  // No other TradingView network host/URL is ever referenced by this feature - only the s3
  // embed script and the plain tradingview.com attribution link.
  const hosts = (src.match(/https:\/\/([^/'"\s]+)/g) || []).map((u) => u.replace('https://', ''));
  const tvHosts = hosts.filter((h) => /tradingview/i.test(h));
  new Set(tvHosts).forEach((h) => assert.ok(h === 's3.tradingview.com' || h === 'www.tradingview.com', `unexpected TradingView host referenced: ${h}`));
});

test('no TradingView API key, npm package, backend endpoint, or secret is introduced', () => {
  assert.doesNotMatch(src, /apiKey|api_key|API_KEY|process\.env\.[A-Z_]*TRADING/);
  assert.doesNotMatch(src, /require\(['"]tradingview|from ['"]tradingview/i);
  assert.doesNotMatch(src, /\/api\/(sync\/)?tradingview|\/api\/[\w-]*chart[\w-]*/i);
});

test('package.json gained no new TradingView npm dependency', async () => {
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const all = Object.assign({}, pkg.dependencies, pkg.devDependencies);
  Object.keys(all).forEach((name) => assert.doesNotMatch(name, /tradingview/i));
});

test('the widget component builds and tears down its container with plain DOM APIs, never dangerouslySetInnerHTML', () => {
  const widget = sliceBetween('function TradingViewAdvancedChart(', 'function ChartUnmappedNotice(', 'TradingViewAdvancedChart');
  assert.doesNotMatch(widget, /dangerouslySetInnerHTML/);
  assert.match(widget, /document\.createElement\('div'\)/);
  assert.match(widget, /document\.createElement\('script'\)/);
  // Cleanup on unmount/re-run so switching views/instruments/timeframes never duplicates widgets.
  assert.match(widget, /return \(\) => \{ while \(host\.firstChild\) host\.removeChild\(host\.firstChild\); \};/);
  assert.match(widget, /\[symbol, interval, lang\]/);
});

test('the official Advanced Chart widget configuration includes the required options and dark theme, with TradingView attribution always rendered', () => {
  const widget = sliceBetween('function TradingViewAdvancedChart(', 'function ChartUnmappedNotice(', 'TradingViewAdvancedChart');
  assert.match(widget, /autosize: true/);
  assert.match(widget, /theme: 'dark'/);
  assert.match(widget, /style: '1'/);
  assert.match(widget, /allow_symbol_change: true/);
  assert.match(widget, /copyrightLink\.href = 'https:\/\/www\.tradingview\.com\/';/);
  assert.match(widget, /tr\(lang, 'tvAttribution'\)/);
});

test('explicit instrument -> TradingView symbol mapping covers the required symbols (plus the short ticker forms a trader actually types)', () => {
  const map = block(/const TV_SYMBOL_BY_INSTRUMENT = \{[\s\S]*?\};/, 'TV_SYMBOL_BY_INSTRUMENT');
  assert.match(map, /XAUUSD: 'OANDA:XAUUSD'/);
  assert.match(map, /BTCUSDT: 'BINANCE:BTCUSDT'/);
  assert.match(map, /ETHUSDT: 'BINANCE:ETHUSDT'/);
  assert.match(map, /EURUSD: 'OANDA:EURUSD'/);
  assert.match(map, /GBPUSD: 'OANDA:GBPUSD'/);
  // The short forms a trader is likely to actually type (product feedback: a session tagged
  // just "BTC" must still open a real Bitcoin chart) resolve to the same curated targets.
  assert.match(map, /BTC: 'BINANCE:BTCUSDT'/);
  assert.match(map, /GOLD: 'OANDA:XAUUSD'/);

  const fn = sliceBetween('function tradingViewSymbolFor(instrument) {', '// Session timeframe', 'tradingViewSymbolFor');
  // market/city must never be read as a symbol fallback anywhere in the resolver.
  assert.doesNotMatch(fn, /\.market/);
  assert.match(fn, /if \(!code\) return null;/);
  assert.match(fn, /return TV_SYMBOL_BY_INSTRUMENT\[code\] \|\| code;/);

  const intervals = block(/const TV_INTERVAL_BY_TIMEFRAME = \{[\s\S]*?\};/, 'TV_INTERVAL_BY_TIMEFRAME');
  assert.match(intervals, /'1m': '1'/);
  assert.match(intervals, /'5m': '5'/);
  assert.match(intervals, /'15m': '15'/);
  assert.match(intervals, /'30m': '30'/);
  assert.match(intervals, /'1h': '60'/);
  assert.match(intervals, /'4h': '240'/);
  assert.match(intervals, /'1d': 'D'/);
  assert.match(src, /const TV_INTERVAL_DEFAULT = '15';/);
});

test('MarketChartView reads only session.instrument for the chart symbol, never session.market/city, and always opens a real chart for any non-empty instrument', () => {
  const view = sliceBetween('function MarketChartView({ session, lang }) {', 'function ReportView(', 'MarketChartView');
  assert.match(view, /const symbol = tradingViewSymbolFor\(session\.instrument\);/);
  assert.match(view, /if \(!symbol\) return <ChartUnmappedNotice lang=\{lang\} \/>;/);
  // The only session.market use inside this component is display text (city/timeframe/date line),
  // never symbol resolution - guarded by the assertion above that the symbol always comes from
  // tradingViewSymbolFor(session.instrument) alone.
  assert.doesNotMatch(view, /tradingViewSymbolFor\(session\.market/);
});

test('an absent instrument (the only unresolvable case) shows a localized empty-state notice pointing at the instrument chip', () => {
  const notice = sliceBetween('function ChartUnmappedNotice({ lang }) {', 'function MarketChartView(', 'ChartUnmappedNotice');
  assert.match(notice, /tr\(lang, 'chartUnmappedTitle'\)/);
  assert.match(notice, /tr\(lang, 'chartUnmappedBodyNoInstrument'\)/);
  assert.match(notice, /tr\(lang, 'chartUnmappedHint'\)/);
});

test('a real, non-empty instrument always resolves to a real chart, even when it is not in the curated map (product fix: "BTC" and any other typed code must open a chart, never a blocking notice)', () => {
  // Both the map and the resolver are plain JS (no JSX) - sliced verbatim from the real source
  // and evaluated directly, rather than re-derived, so this proves the actual shipped logic.
  const src = sliceBetween('const TV_SYMBOL_BY_INSTRUMENT = {', '// Session timeframe', 'the symbol resolver and its map');
  const tradingViewSymbolFor = new Function(src + '\nreturn tradingViewSymbolFor;')();
  assert.equal(tradingViewSymbolFor('BTC'), 'BINANCE:BTCUSDT');
  assert.equal(tradingViewSymbolFor('btcusdt'), 'BINANCE:BTCUSDT');
  assert.equal(tradingViewSymbolFor('gold'), 'OANDA:XAUUSD');
  // Not in the curated map at all - still resolves to a real, non-null symbol (the trader's own
  // typed code, uppercased) instead of a blocking notice.
  assert.equal(tradingViewSymbolFor('US30'), 'US30');
  assert.equal(tradingViewSymbolFor('nas100'), 'NAS100');
  // Only a genuinely empty/absent instrument is unresolvable.
  assert.equal(tradingViewSymbolFor(null), null);
  assert.equal(tradingViewSymbolFor(''), null);
  assert.equal(tradingViewSymbolFor('   '), null);
});

test('all four i18n dictionaries (fa, ar, en, es) declare the new view label and chart states', () => {
  const keys = [
    'viewChart', 'chartLoadingText', 'chartLoadErrorTitle', 'chartLoadErrorBody',
    'chartUnmappedTitle', 'chartUnmappedBodyNoInstrument', 'chartUnmappedHint', 'tvAttribution'
  ];
  ['fa:', 'ar:', 'en:', 'es:'].forEach((langTag) => {
    const idx = src.indexOf('\n  ' + langTag);
    assert.ok(idx > -1, `could not find the ${langTag} copy block`);
    const nextIdx = src.indexOf('\n  }', idx);
    const langBlock = src.slice(idx, nextIdx);
    keys.forEach((key) => assert.match(langBlock, new RegExp(key + ':'), `${langTag} copy block is missing ${key}`));
  });
});

test('fa/ar Persian and Arabic labels are the required literal strings; en/es are real, distinct translations, not copies of English', () => {
  assert.match(src, /viewChart: 'چارت بازار'/);
  assert.match(src, /viewChart: 'مخطط السوق'/);
  assert.match(src, /viewChart: 'Market chart'/);
  assert.match(src, /viewChart: 'Gráfico de mercado'/);
});
