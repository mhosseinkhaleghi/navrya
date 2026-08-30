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
  // The chart branch of the ternary itself is a no-op (null) - MarketChartView is rendered
  // separately below (see the "never destroyed on Timeline/Report switch" test), not inline here.
  assert.match(render, /\) : view === 'chart' \? null : \(/);
  assert.match(render, /<ReportView session=\{session\} lang=\{lang\} indexById=\{indexById\} \/>/);
});

test('the Market chart widget is mounted once (lazily) and never destroyed on a Timeline/Report switch - only CSS display toggles, so drawings on the live TradingView iframe survive', () => {
  // Lazy: the flag only ever flips true once the trader has actually opened Market chart.
  assert.match(src, /const chartEverOpenedRef = React\.useRef\(false\);/);
  assert.match(src, /if \(view === 'chart'\) chartEverOpenedRef\.current = true;/);

  // Once true, MarketChartView is rendered unconditionally (never unmounted again for the rest
  // of this Live Session visit) and only ever hidden/shown via CSS display, never remounted.
  const persistBlock = sliceBetween('{chartEverOpenedRef.current && (', '{chartModalOpen', 'the chartEverOpenedRef persistence block');
  assert.match(persistBlock, /style=\{\{ display: view === 'chart' \? 'block' : 'none' \}\}/);
  assert.match(persistBlock, /<MarketChartView\s*\n\s*session=\{session\} lang=\{lang\}\s*\n\s*onAddChart=\{\(file\) => withPreSessionCheckIn\(\(\) => \{ setChartModalInitialFile\(file\); setChartModalOpen\(true\); \}\)\}\s*\n\s*onLogMove=\{\(file\) => withPreSessionCheckIn\(\(\) => \{ const entry = addEntry\('movement'\); if \(file\) attachImage\(entry, file\); \}\)\}/);
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
  const view = sliceBetween('function MarketChartView({ session, lang, onAddChart, onLogMove }) {', 'function ReportView(', 'MarketChartView');
  assert.match(view, /const symbol = tradingViewSymbolFor\(session\.instrument\);/);
  assert.match(view, /if \(!symbol\) return <ChartUnmappedNotice lang=\{lang\} \/>;/);
  // The only session.market use inside this component is display text (city/timeframe/date line),
  // never symbol resolution - guarded by the assertion above that the symbol always comes from
  // tradingViewSymbolFor(session.instrument) alone.
  assert.doesNotMatch(view, /tradingViewSymbolFor\(session\.market/);
});

test('both Add chart and Log movement capture a screenshot via the browser\'s own tab-capture API through one shared pipeline before calling their respective handler with the file - never blocking on failure/denial', () => {
  const view = sliceBetween('function MarketChartView({ session, lang, onAddChart, onLogMove }) {', 'function ReportView(', 'MarketChartView');
  // One shared capture function - not two independent copies - used by both buttons.
  assert.match(view, /async function captureChartScreenshot\(\) \{/);
  assert.match(view, /async function handleAddChartClick\(\) \{\s*\n\s*const file = await captureChartScreenshot\(\);\s*\n\s*onAddChart\(file\);\s*\n\s*\}/);
  assert.match(view, /async function handleLogMoveClick\(\) \{\s*\n\s*const file = await captureChartScreenshot\(\);\s*\n\s*onLogMove\(file\);\s*\n\s*\}/);
  assert.match(view, /<Button variant="secondary" size="sm" icon=\{capturing \? 'LoaderCircle' : 'Activity'\} disabled=\{capturing\} title=\{tr\(lang, 'chartCaptureHint'\)\} onClick=\{handleLogMoveClick\}>\{tr\(lang, 'addMove'\)\}<\/Button>/);
  assert.match(view, /<Button variant="primary" size="sm" icon=\{capturing \? 'LoaderCircle' : 'ImagePlus'\} disabled=\{capturing\} title=\{tr\(lang, 'chartCaptureHint'\)\} onClick=\{handleAddChartClick\}>\{tr\(lang, 'addChart'\)\}<\/Button>/);
  // getDisplayMedia is a native browser API - no npm package, no TradingView involvement at all.
  assert.match(view, /navigator\.mediaDevices\.getDisplayMedia\(\{/);
  assert.match(view, /preferCurrentTab: true/);
  // A stale/stopped stream ('ended', e.g. the trader used the browser's own "Stop sharing")
  // triggers a fresh prompt on the next click rather than silently failing forever.
  assert.match(view, /track\.addEventListener\('ended', \(\) => \{ if \(captureStreamRef\.current === stream\) captureStreamRef\.current = null; \}\);/);
  // The granted stream is reused (never re-requested) while its track is still live.
  assert.match(view, /if \(existing && existing\.getVideoTracks\(\)\[0\] && existing\.getVideoTracks\(\)\[0\]\.readyState === 'live'\) return existing;/);
  // Every failure path (unsupported/denied/no-frame) still resolves by returning null, never
  // leaving the trader stuck without a way to log the chart/movement.
  assert.match(view, /setCaptureError\(tr\(lang, 'chartCaptureUnsupported'\)\);/);
  assert.match(view, /setCaptureError\(tr\(lang, 'chartCaptureFailed'\)\);/);
  assert.match(view, /setCaptureError\(tr\(lang, 'chartCapturePermissionDenied'\)\);/);
  // The captured frame is cropped to the real chart element's own bounding rect, never the
  // whole captured tab verbatim.
  assert.match(view, /const rect = el \? el\.getBoundingClientRect\(\) : null;/);
});

test('the chart is scrolled fully into view before capture, and the crop is clamped to the real visible viewport - a real bug found live: a chart panel taller than the viewport (pushed down by CommandBar/PulseBand) left the off-screen portion of a naive crop blank, since getDisplayMedia only ever captures what is actually on screen', () => {
  const view = sliceBetween('function MarketChartView({ session, lang, onAddChart, onLogMove }) {', 'function ReportView(', 'MarketChartView');
  assert.match(view, /chartElRef\.current\.scrollIntoView\(\{ block: 'nearest' \}\);/);
  assert.match(view, /await new Promise\(\(resolve\) => setTimeout\(resolve, 120\)\);/);
  // Every dimension is clamped against window.innerWidth/innerHeight, never the element's own
  // (possibly-larger-than-the-viewport) full bounding rect used verbatim.
  assert.match(view, /const visLeft = rect \? Math\.max\(0, rect\.left\) : 0;/);
  assert.match(view, /const visTop = rect \? Math\.max\(0, rect\.top\) : 0;/);
  assert.match(view, /const visWidth = rect \? Math\.min\(window\.innerWidth, rect\.left \+ rect\.width\) - visLeft : 0;/);
  assert.match(view, /const visHeight = rect \? Math\.min\(window\.innerHeight, rect\.top \+ rect\.height\) - visTop : 0;/);
  assert.match(view, /if \(visWidth > 0 && visHeight > 0\) \{/);
});

test('the granted capture stream is released when the trader leaves the Live Session, and the chart element has a dedicated ref for cropping', () => {
  const view = sliceBetween('function MarketChartView({ session, lang, onAddChart, onLogMove }) {', 'function ReportView(', 'MarketChartView');
  assert.match(view, /const captureStreamRef = React\.useRef\(null\);/);
  assert.match(view, /if \(stream\) stream\.getTracks\(\)\.forEach\(\(t\) => t\.stop\(\)\);/);
  assert.match(view, /<div ref=\{chartElRef\}>\s*<TradingViewAdvancedChart symbol=\{symbol\} interval=\{interval\} lang=\{lang\} fill=\{isFullscreen\} \/>\s*<\/div>/);
});

test('grabStreamFrame prefers the native ImageCapture API (Chromium) and falls back to a <video>+canvas grab for other engines - no npm package', () => {
  const helper = sliceBetween('function grabStreamFrame(stream) {', 'function MarketChartView(', 'grabStreamFrame');
  assert.match(helper, /if \(typeof ImageCapture !== 'undefined'\) \{/);
  assert.match(helper, /new ImageCapture\(track\)\.grabFrame\(\);/);
  assert.match(helper, /const video = document\.createElement\('video'\);/);
  assert.match(helper, /video\.srcObject = stream;/);
});

test('MarketChartView provides a real fullscreen toggle using the standard Fullscreen API, scoped to just the chart panel', () => {
  const view = sliceBetween('function MarketChartView({ session, lang, onAddChart, onLogMove }) {', 'function ReportView(', 'MarketChartView');
  assert.match(view, /const wrapRef = React\.useRef\(null\);/);
  assert.match(view, /const \[isFullscreen, setIsFullscreen\] = React\.useState\(false\);/);
  assert.match(view, /document\.addEventListener\('fullscreenchange', onChange\);/);
  assert.match(view, /if \(document\.fullscreenElement\) \{ document\.exitFullscreen\(\); return; \}/);
  assert.match(view, /el\.requestFullscreen\(\)/);
  assert.match(view, /<Icon name=\{isFullscreen \? 'Minimize2' : 'Maximize2'\} size=\{16\} \/>/);
  assert.match(view, /title=\{tr\(lang, isFullscreen \? 'exitFullscreenChart' : 'enterFullscreenChart'\)\}/);
  // The widget itself is told to fill the fullscreen box instead of its normal clamped height.
  assert.match(view, /<TradingViewAdvancedChart symbol=\{symbol\} interval=\{interval\} lang=\{lang\} fill=\{isFullscreen\} \/>/);
});

test('TradingViewAdvancedChart grows to fill the screen only when fill is set, otherwise keeps its normal clamped height', () => {
  const widget = sliceBetween('function TradingViewAdvancedChart(', 'function ChartUnmappedNotice(', 'TradingViewAdvancedChart');
  assert.match(widget, /height: fill \? 'calc\(100vh - 84px\)' : 'clamp\(360px, 64vh, 680px\)'/);
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
    'chartUnmappedTitle', 'chartUnmappedBodyNoInstrument', 'chartUnmappedHint', 'tvAttribution',
    'enterFullscreenChart', 'exitFullscreenChart', 'chartCaptureHint', 'chartCapturePermissionDenied',
    'chartCaptureUnsupported', 'chartCaptureFailed'
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

test('ChartEntryModal accepts an optional initialFile (the captured screenshot) and pre-fills the preview from it, without changing behavior for a plain manual "Add chart" (no initialFile)', () => {
  const modal = sliceBetween('function ChartEntryModal({ session, lang, onClose, onSubmit, initialFile }) {', 'function Ring(', 'ChartEntryModal');
  assert.match(modal, /const \[file, setFile\] = React\.useState\(initialFile \|\| null\);/);
  assert.match(modal, /const \[previewUrl, setPreviewUrl\] = React\.useState\(\(\) => \(initialFile \? URL\.createObjectURL\(initialFile\) : ''\)\);/);
});

test('LiveSessionView wires the captured screenshot from Market chart into ChartEntryModal, and resets it on close/submit so a later plain Timeline "Add chart" never reuses a stale file', () => {
  assert.match(src, /const \[chartModalInitialFile, setChartModalInitialFile\] = React\.useState\(null\);/);
  // Market chart's onAddChart(file) - not Timeline's own onClick={() => withPreSessionCheckIn(() => setChartModalOpen(true))} calls - is the only path that sets it.
  assert.match(src, /onAddChart=\{\(file\) => withPreSessionCheckIn\(\(\) => \{ setChartModalInitialFile\(file\); setChartModalOpen\(true\); \}\)\}/);
  assert.match(src, /<ChartEntryModal\s*\n\s*session=\{session\} lang=\{lang\} initialFile=\{chartModalInitialFile\}\s*\n\s*onClose=\{\(\) => \{ setChartModalOpen\(false\); setChartModalInitialFile\(null\); \}\}/);
  assert.match(src, /setChartModalOpen\(false\); setChartModalInitialFile\(null\); setFilter\('all'\); setQ\(''\);/);
  // Timeline's own three "Add chart" trigger points are untouched - still the plain boolean open,
  // never passing a file.
  assert.match(src, /onClick=\{\(\) => withPreSessionCheckIn\(\(\) => setChartModalOpen\(true\)\)\}>\{tr\(lang, 'addChart'\)\}<\/Button>/);
});

test('LiveSessionView also attaches the captured screenshot to a Log movement entry created from Market chart, via the existing attachImage() function - Timeline\'s own plain Log movement button is untouched', () => {
  // Market chart's onLogMove(file) creates the movement entry first (so it always exists, capture
  // failure or not), then attaches the file only when one was actually captured.
  assert.match(src, /onLogMove=\{\(file\) => withPreSessionCheckIn\(\(\) => \{ const entry = addEntry\('movement'\); if \(file\) attachImage\(entry, file\); \}\)\}/);
  // Timeline's own plain Log movement button is untouched - still no file involved at all.
  assert.match(src, /onClick=\{\(\) => withPreSessionCheckIn\(\(\) => addEntry\('movement'\)\)\}>\{tr\(lang, 'addMove'\)\}<\/Button>/);
});
