import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { boardKey, DEFAULT_BOARD, DEFAULT_REGIONS, regionOf } from '../navrya-src/analysisWorkspaceBoard.js';
import { buildGenerationPrompt, parseGeneration, titleFromPrompt, UNAVAILABLE_MARKER } from '../navrya-src/analysisWorkspacePanelBuilder.js';
import { panelKey, newPanelId, isCustomPanelId, byteLength, savePanel, MAX_SOURCE_BYTES } from '../navrya-src/analysisWorkspacePanelStore.js';

const root = process.cwd();
const CHARACTERS = ['hunter', 'engineer', 'commander', 'sage'];

// ---------------------------------------------------------------------------
// The bug this file exists to keep fixed: server/community/routes.preferences.mjs validates every
// preference id against its own regex, and a key that fails it is rejected with VALIDATION_FAILED -
// which server-replica.js turns into a rolled-back optimistic write plus a save-failed toast, i.e.
// a layout that silently never persists. The regex is READ OUT OF THE REAL SERVER FILE here rather
// than copied, so tightening it server-side fails this test instead of silently breaking the desk.
// ---------------------------------------------------------------------------
const preferencesSrc = await readFile(path.join(root, 'server', 'community', 'routes.preferences.mjs'), 'utf8');
const idPattern = /const PREFERENCE_ID = (\/.+\/);/.exec(preferencesSrc);
assert.ok(idPattern, 'could not find PREFERENCE_ID in server/community/routes.preferences.mjs');
// eslint-disable-next-line no-new-func
const PREFERENCE_ID = new Function('return ' + idPattern[1])();

test('the Analysis Workspace board key is accepted by the real server preference-id validator, for every character', () => {
  CHARACTERS.forEach((character) => {
    const key = boardKey(character);
    assert.ok(PREFERENCE_ID.test(key), `board key rejected by the server validator: ${key}`);
    assert.ok(key.length <= 64, `board key too long: ${key}`);
  });
});

test('every generated custom-panel preference key is accepted by the same validator, including the longest character name', () => {
  CHARACTERS.forEach((character) => {
    for (let i = 0; i < 50; i++) {
      const key = panelKey(character, newPanelId());
      assert.ok(PREFERENCE_ID.test(key), `panel key rejected by the server validator: ${key}`);
      assert.ok(key.length <= 64, `panel key too long (${key.length}): ${key}`);
    }
  });
});

test('a generated panel id is recognizable as custom and never collides with a built-in catalog id', () => {
  DEFAULT_BOARD.forEach((id) => assert.equal(isCustomPanelId(id), false, `${id} must not read as a custom panel id`));
  for (let i = 0; i < 50; i++) assert.equal(isCustomPanelId(newPanelId()), true);
});

// ---------------------------------------------------------------------------
// Board defaults - the default desk must still reproduce the pre-board layout exactly.
// ---------------------------------------------------------------------------
test('the default board reproduces the original two-column Timeline layout, in order', () => {
  assert.deepEqual(DEFAULT_BOARD, ['cockpit', 'entry', 'dashboard', 'prevSummary', 'similar']);
  assert.deepEqual(DEFAULT_BOARD.map((id) => DEFAULT_REGIONS[id]), ['main', 'main', 'rail', 'rail', 'rail']);
});

test('regionOf honors an explicit override, falls back to the panel default, and puts an unknown id in the wide column rather than dropping it', () => {
  const state = { regions: { dashboard: 'main', cockpit: 'nonsense' } };
  assert.equal(regionOf(state, 'dashboard'), 'main');
  assert.equal(regionOf(state, 'prevSummary'), 'rail');
  assert.equal(regionOf(state, 'cockpit'), 'main', 'an invalid stored region must not be trusted');
  assert.equal(regionOf(state, 'p123456789'), 'main');
});

// ---------------------------------------------------------------------------
// Generation prompt - every constraint in it is a real property of the sandbox, so each one is
// asserted rather than left to drift away from analysisWorkspacePanelRuntime.jsx.
// ---------------------------------------------------------------------------
test('the generation prompt states every real runtime constraint the sandbox actually enforces', () => {
  const prompt = buildGenerationPrompt({ prompt: 'a scenario table', lang: 'fa' });
  assert.match(prompt, /NO network access/i);
  assert.match(prompt, /fetch, XHR,\s*\n?\s*WebSocket/i);
  assert.match(prompt, /No frameworks or libraries are available/i);
  assert.match(prompt, /READ-ONLY/);
  assert.match(prompt, /NO price or candle data/i);
  assert.match(prompt, /NO news feed/i);
  ['getContext', 'getEntries', 'getScenarios', 'getPositions', 'getChart', 'onUpdate'].forEach((method) => {
    assert.match(prompt, new RegExp('navrya\\.' + method), `prompt does not document navrya.${method}`);
  });
  assert.match(prompt, /Never invent or placeholder a number/i);
  assert.match(prompt, /a scenario table$/);
});

test('the prompt asks for output in the trader\'s own language', () => {
  assert.match(buildGenerationPrompt({ prompt: 'x', lang: 'fa' }), /user-visible text in Persian/);
  assert.match(buildGenerationPrompt({ prompt: 'x', lang: 'ar' }), /user-visible text in Arabic/);
  assert.match(buildGenerationPrompt({ prompt: 'x', lang: 'es' }), /user-visible text in Spanish/);
  assert.match(buildGenerationPrompt({ prompt: 'x', lang: 'en' }), /user-visible text in English/);
  assert.match(buildGenerationPrompt({ prompt: 'x', lang: 'zz' }), /user-visible text in English/, 'unknown language falls back to English');
});

test('the honesty rule is in the prompt, and a revision carries the previous source instead of asking for a blind rewrite', () => {
  const fresh = buildGenerationPrompt({ prompt: 'show me live news', lang: 'en' });
  assert.match(fresh, /HONESTY RULE/);
  assert.match(fresh, new RegExp(UNAVAILABLE_MARKER));
  assert.doesNotMatch(fresh, /REVISION/);

  const revision = buildGenerationPrompt({ prompt: 'make it bigger', lang: 'en', previousSource: '<div id="old">x</div>' });
  assert.match(revision, /This is a REVISION/);
  assert.match(revision, /<div id="old">x<\/div>/);
  assert.match(revision, /complete updated fragment \(not a diff\)/);
});

// ---------------------------------------------------------------------------
// Reply parsing - the guardrail that decides whether something gets installed on a live desk.
// ---------------------------------------------------------------------------
test('an honest refusal is never mistaken for panel source', () => {
  const parsed = parseGeneration(UNAVAILABLE_MARKER + ' No live news feed exists in this app.');
  assert.equal(parsed.ok, false);
  assert.equal(parsed.reason, 'unavailable');
  assert.equal(parsed.message, 'No live news feed exists in this app.');
});

test('a refusal is still caught when the model wraps it in a sentence or a fence', () => {
  const parsed = parseGeneration('```\n' + UNAVAILABLE_MARKER + ' needs raw candles\n```');
  assert.equal(parsed.reason, 'unavailable');
  assert.equal(parsed.message, 'needs raw candles');
});

test('a markdown fence around the whole reply is stripped, but markup inside the fragment is untouched', () => {
  const parsed = parseGeneration('```html\n<div class="x"><script>navrya.getEntries()</script></div>\n```');
  assert.equal(parsed.ok, true);
  assert.equal(parsed.source, '<div class="x"><script>navrya.getEntries()</script></div>');
});

test('prose with no markup is refused rather than injected into the sandbox as a bare paragraph', () => {
  assert.deepEqual(parseGeneration('Sure! Here is how you could build that panel.'), { ok: false, reason: 'empty' });
  assert.deepEqual(parseGeneration(''), { ok: false, reason: 'empty' });
  assert.deepEqual(parseGeneration(null), { ok: false, reason: 'empty' });
});

test('titleFromPrompt keeps short prompts verbatim and truncates long ones', () => {
  assert.equal(titleFromPrompt('  scenario   table '), 'scenario table');
  const long = titleFromPrompt('x'.repeat(80));
  assert.ok(long.length <= 43, `title too long: ${long.length}`);
  assert.match(long, /…$/);
});

// ---------------------------------------------------------------------------
// Size ceiling - the server rejects any preference value over 16KB, so an oversize generation is
// refused up front with a real reason instead of being written and rolled back.
// ---------------------------------------------------------------------------
test('the store refuses an oversize generation before writing anything, and reports the real size', () => {
  const before = global.window;
  global.window = { TradeJournalUserPreferences: { setPref() { throw new Error('must not write an oversize panel'); } } };
  try {
    const result = savePanel('sage', { id: newPanelId(), title: 't', prompt: 'p', source: 'x'.repeat(MAX_SOURCE_BYTES + 1) });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'too-large');
    assert.equal(result.limit, MAX_SOURCE_BYTES);
    assert.ok(result.bytes > MAX_SOURCE_BYTES);
  } finally { global.window = before; }
});

test('a normal panel is written under the key the server accepts, with the source intact', () => {
  const before = global.window;
  const written = [];
  global.window = { TradeJournalUserPreferences: { setPref(key, value) { written.push({ key, value }); } } };
  try {
    const id = newPanelId();
    const result = savePanel('commander', { id, title: 'Scenario table', prompt: 'a table', source: '<div>ok</div>' });
    assert.equal(result.ok, true);
    assert.equal(written.length, 1);
    assert.equal(written[0].key, panelKey('commander', id));
    assert.ok(PREFERENCE_ID.test(written[0].key));
    assert.equal(written[0].value.source, '<div>ok</div>');
    assert.equal(written[0].value.version, 1);
  } finally { global.window = before; }
});

test('byteLength measures UTF-8 bytes, not characters - a Persian panel must not slip past the ceiling', () => {
  assert.equal(byteLength('abc'), 3);
  assert.equal(byteLength('میز'), 6);
});

// ---------------------------------------------------------------------------
// The sandbox itself. navrya-src/*.jsx has no JSX transform in this runner (the documented
// limitation the other Live Session tests note), so the security properties are asserted against
// the real source text - the same convention tests/live-session-market-chart.test.mjs uses.
// ---------------------------------------------------------------------------
const runtimeSrc = await readFile(path.join(root, 'navrya-src', 'analysisWorkspacePanelRuntime.jsx'), 'utf8');

// The runtime's own comments spell out the dangerous APIs it deliberately does NOT use
// ("no eval()/new Function()/dangerouslySetInnerHTML path"), so the "must never appear" assertions
// below run against code with block and whole-line comments removed - otherwise they would be
// satisfied by the documentation instead of the implementation.
const runtimeCode = runtimeSrc.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

test('a generated panel is sandboxed with no same-origin access, and its code is never evaluated in the app realm', () => {
  // The real attribute, not prose: every sandbox= attribute in the file must be exactly
  // allow-scripts, and none of them may grant same-origin (which would hand a panel this
  // document's DOM, cookies and storage).
  const attrs = runtimeCode.match(/sandbox="[^"]*"/g) || [];
  assert.ok(attrs.length, 'no sandbox attribute found at all');
  attrs.forEach((attr) => assert.equal(attr, 'sandbox="allow-scripts"'));
  assert.doesNotMatch(runtimeCode, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(runtimeCode, /\beval\(/);
  assert.doesNotMatch(runtimeCode, /new Function\(/);
});

test('the panel document blocks every network egress path, so real session data cannot be exfiltrated', () => {
  const csp = /Content-Security-Policy" content="([^"]+)"/.exec(runtimeSrc);
  assert.ok(csp, 'no CSP found in the panel document');
  // The policy is written inside a single-quoted JS string, so its quotes are backslash-escaped in
  // the source - compare against the value the browser will actually receive.
  const policy = csp[1].replace(/\\'/g, "'");
  assert.match(policy, /default-src 'none'/);
  assert.doesNotMatch(policy, /connect-src/, 'connect-src must stay unset so it inherits default-src none');
  // Only inline script/style and data: images/fonts are permitted - no host is allowlisted at all.
  assert.doesNotMatch(policy, /https?:/);
  assert.doesNotMatch(policy, /unsafe-eval/);
});

test('the bridge authenticates the child by window identity, not by an origin string a sandboxed frame cannot provide', () => {
  assert.match(runtimeSrc, /event\.source !== frame\.contentWindow/);
});

test('the bridge exposes getters only - there is no method through which a panel could write to the session', () => {
  const methods = /export const BRIDGE_METHODS = \[([^\]]+)\]/.exec(runtimeSrc);
  assert.ok(methods, 'BRIDGE_METHODS not found');
  const list = methods[1].split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean);
  assert.deepEqual(list, ['context', 'entries', 'scenarios', 'positions', 'chart']);
  list.forEach((m) => assert.doesNotMatch(m, /^(set|save|add|update|delete|remove|log)/i));
  // An unknown method is refused rather than answered with whatever happens to be on the snapshot.
  assert.match(runtimeSrc, /error: ok \? undefined : 'UNKNOWN_METHOD'/);
});

test('the snapshot handed to a panel carries session facts only - never identity, wallet, or image data', () => {
  const snapshot = /export function buildSnapshot\(ws\) \{[\s\S]*?\n\}/.exec(runtimeSrc);
  assert.ok(snapshot, 'buildSnapshot not found');
  [/email/i, /userId/i, /token/i, /apiKey/i, /wallet/i, /balance/i, /imageBlobId/i, /preview/i].forEach((re) => {
    assert.doesNotMatch(snapshot[0], re, `buildSnapshot must not expose ${re}`);
  });
});
