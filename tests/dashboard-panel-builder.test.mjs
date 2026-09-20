import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildGenerationPrompt, parseGeneration, titleFromPrompt, byteLength,
  UNAVAILABLE_MARKER, MAX_SOURCE_BYTES, MAX_PROMPT_CHARS
} from '../navrya-src/dashboardPanelBuilder.js';
import { DASHBOARD_PANEL_BIND_SCHEMA } from '../navrya-src/dashboardPanelBridgeDoc.js';
import { ALLOWED_TAGS, renderPanelSafely } from '../navrya-src/panelSafeRender.js';

// Every constraint asserted here is a real property of navrya-src/dashboardPanelSandbox.jsx +
// navrya-src/panelSafeRender.js (see tests/dashboard-panel-studio-sandbox.test.mjs and
// tests/panel-safe-render.test.mjs for the matching runtime-side assertions), so this prompt can
// never silently drift away from what the render surface actually enforces - the same technique
// tests/analysis-workspace-panel.test.mjs already uses for the Analysis Workspace target.
//
// v2: the model is told to write plain, static markup with data-navrya-bind/data-navrya-each
// attributes, never a <script> that calls a live bridge - see dashboardPanelBuilder.js's own header
// comment for why script execution and real data access can no longer coexist in this app at all.

test('the generation prompt states every real runtime constraint the dashboard render surface actually enforces', () => {
  const prompt = buildGenerationPrompt({ prompt: 'show my win rate', lang: 'en' });
  assert.match(prompt, /NO <script> tag of any kind/i);
  assert.match(prompt, /NO scripting of any kind/i);
  assert.match(prompt, /no\s+inline event handler \(onclick, onload/i);
  assert.match(prompt, /READ-ONLY|no way to write, log, edit or delete anything/i);
  assert.match(prompt, /NO price or candle data/i);
  assert.match(prompt, /NO news feed/i);
  assert.match(prompt, /identity, email, API keys, sessions, or wallet balance/i);
  // Every real scalar bind path from the shared schema must be documented, and no other path.
  DASHBOARD_PANEL_BIND_SCHEMA.scalars.forEach((path) => {
    assert.match(prompt, new RegExp('data-navrya-bind="' + path.replace('.', '\\.') + '"'), `prompt does not document ${path}`);
  });
  Object.keys(DASHBOARD_PANEL_BIND_SCHEMA.lists).forEach((path) => {
    assert.match(prompt, new RegExp('data-navrya-each="' + path.replace('.', '\\.') + '"'), `prompt does not document data-navrya-each="${path}"`);
  });
  // Every allowed tag is named so the model knows its real ceiling, and <script>/<a>/<form> are
  // never listed as available.
  Array.from(ALLOWED_TAGS).forEach((tag) => assert.match(prompt, new RegExp('\\b' + tag + '\\b')));
  ['script', 'a', 'form', 'iframe', 'meta', 'link'].forEach((tag) => {
    assert.doesNotMatch(prompt, new RegExp('Allowed elements only:[^\\n]*\\b' + tag + '\\b'));
  });
  assert.match(prompt, /Never invent or placeholder a number/i);
  assert.match(prompt, /show my win rate$/);
});

test('the prompt asks for output in the trader\'s own language, falling back to English', () => {
  assert.match(buildGenerationPrompt({ prompt: 'x', lang: 'fa' }), /user-visible text.*in Persian/);
  assert.match(buildGenerationPrompt({ prompt: 'x', lang: 'ar' }), /user-visible text.*in Arabic/);
  assert.match(buildGenerationPrompt({ prompt: 'x', lang: 'es' }), /user-visible text.*in Spanish/);
  assert.match(buildGenerationPrompt({ prompt: 'x', lang: 'en' }), /user-visible text.*in English/);
  assert.match(buildGenerationPrompt({ prompt: 'x', lang: 'zz' }), /user-visible text.*in English/, 'unknown language falls back to English');
});

test('the honesty rule is in the prompt, and a revision carries the previous source instead of asking for a blind rewrite', () => {
  const fresh = buildGenerationPrompt({ prompt: 'show me live prices', lang: 'en' });
  assert.match(fresh, /HONESTY RULE/);
  assert.match(fresh, new RegExp(UNAVAILABLE_MARKER));
  assert.doesNotMatch(fresh, /REVISION/);

  const revision = buildGenerationPrompt({ prompt: 'make it bigger', lang: 'en', previousSource: '<div id="old">x</div>' });
  assert.match(revision, /This is a REVISION/);
  assert.match(revision, /<div id="old">x<\/div>/);
  assert.match(revision, /complete updated fragment \(not a diff\)/);
});

test('an honest refusal is never mistaken for panel source', () => {
  const parsed = parseGeneration(UNAVAILABLE_MARKER + ' No wallet data exists in this sandbox.');
  assert.equal(parsed.ok, false);
  assert.equal(parsed.reason, 'unavailable');
  assert.equal(parsed.message, 'No wallet data exists in this sandbox.');
});

test('a refusal is still caught when the model wraps it in a fence', () => {
  const parsed = parseGeneration('```\n' + UNAVAILABLE_MARKER + ' needs raw candles\n```');
  assert.equal(parsed.reason, 'unavailable');
  assert.equal(parsed.message, 'needs raw candles');
});

test('a markdown fence around the whole reply is stripped, but markup inside the fragment is untouched by parseGeneration itself (sanitization happens later, at render time)', () => {
  const parsed = parseGeneration('```html\n<div class="x" data-navrya-bind="tradeSummary.openCount">0</div>\n```');
  assert.equal(parsed.ok, true);
  assert.equal(parsed.source, '<div class="x" data-navrya-bind="tradeSummary.openCount">0</div>');
});

test('prose with no markup is refused rather than injected into the sandbox as a bare paragraph', () => {
  assert.deepEqual(parseGeneration('Sure! Here is how you could build that panel.'), { ok: false, reason: 'empty' });
  assert.deepEqual(parseGeneration(''), { ok: false, reason: 'empty' });
  assert.deepEqual(parseGeneration(null), { ok: false, reason: 'empty' });
});

test('titleFromPrompt keeps short prompts verbatim and truncates long ones', () => {
  assert.equal(titleFromPrompt('  win rate   panel '), 'win rate panel');
  const long = titleFromPrompt('x'.repeat(80));
  assert.ok(long.length <= 43, `title too long: ${long.length}`);
  assert.match(long, /…$/);
});

test('byteLength measures UTF-8 bytes, not characters - a Persian panel must not slip past the ceiling', () => {
  assert.equal(byteLength('abc'), 3);
  assert.equal(byteLength('میز'), 6);
});

test('the exported size ceilings match migration 076\'s own CHECK constraints', () => {
  assert.equal(MAX_SOURCE_BYTES, 12 * 1024);
  assert.equal(MAX_PROMPT_CHARS, 400);
});

// ---------------------------------------------------------------------------
// The schema's own consistency: every path it declares must actually resolve against the real
// snapshot shape buildDashboardBridgeSnapshot() produces - a schema entry naming a field that
// snapshot builder doesn't produce would silently always render empty, never caught otherwise.
// ---------------------------------------------------------------------------
test('every scalar/list path in DASHBOARD_PANEL_BIND_SCHEMA resolves against a real, representative snapshot shape', () => {
  const snapshot = {
    version: 2,
    tradeSummary: { totalTrades: 7, openCount: 2 },
    openPositions: [{ id: 't1', instrument: 'EURUSD', side: 'long', status: 'open', entry: 1, stop: 1, target: 1 }],
    patternStats: [{ id: 'p1', title: 'Reversal', occurrenceRate: 0.4, detectionCount: 3 }],
    psychologyMirror: { tags: [{ tag: 'revenge', sampleSize: 5, winRate: 0.2 }] }
  };
  DASHBOARD_PANEL_BIND_SCHEMA.scalars.forEach((path) => {
    const html = renderPanelSafely('<span data-navrya-bind="' + path + '">x</span>', snapshot, DASHBOARD_PANEL_BIND_SCHEMA);
    assert.doesNotMatch(html, /<span data-navrya-bind="[^"]+"><\/span>/, `${path} resolved empty against a representative snapshot`);
  });
  Object.keys(DASHBOARD_PANEL_BIND_SCHEMA.lists).forEach((path) => {
    const fields = DASHBOARD_PANEL_BIND_SCHEMA.lists[path].itemFields;
    const rowMarkup = fields.map((f) => '<span data-navrya-bind="' + f + '">x</span>').join('');
    const html = renderPanelSafely('<div data-navrya-each="' + path + '">' + rowMarkup + '</div>', snapshot, DASHBOARD_PANEL_BIND_SCHEMA);
    assert.match(html, /<div data-navrya-each="[^"]+"><span/, `${path} produced no rows against a representative snapshot`);
  });
});
