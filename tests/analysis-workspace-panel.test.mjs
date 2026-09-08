import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  boardKey, DEFAULT_BOARD, DEFAULT_REGIONS, regionOf, resetLayout,
  moveBefore, moveToColumnEnd, moveWithinColumn
} from '../navrya-src/analysisWorkspaceBoard.js';
import { buildGenerationPrompt, parseGeneration, titleFromPrompt, UNAVAILABLE_MARKER } from '../navrya-src/analysisWorkspacePanelBuilder.js';
import {
  panelKey, newPanelId, isCustomPanelId, byteLength, savePanel, deletePanel,
  MAX_SOURCE_BYTES, MAX_VALUE_BYTES, MAX_PROMPT_CHARS
} from '../navrya-src/analysisWorkspacePanelStore.js';

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
// Drag-to-rearrange. The board is one flat ordering shared by both columns, so these are the
// semantics that make a cross-column drag work at all.
// ---------------------------------------------------------------------------
function boardOf(board, regions) { return { board: board, regions: regions || {}, hidden: {}, custom: {} }; }
function columns(state) {
  const out = { main: [], rail: [] };
  state.board.forEach((id) => out[regionOf(state, id)].push(id));
  return out;
}

test('dragging a panel onto another panel in the SAME column reorders it there', () => {
  const before = boardOf(DEFAULT_BOARD.slice());
  const after = moveBefore(before, 'similar', 'dashboard');
  assert.deepEqual(columns(after).rail, ['similar', 'dashboard', 'prevSummary']);
  assert.deepEqual(columns(after).main, ['cockpit', 'entry'], 'the other column must not move');
});

test('dragging a panel onto a panel in the OTHER column moves it across and places it there', () => {
  const after = moveBefore(boardOf(DEFAULT_BOARD.slice()), 'dashboard', 'entry');
  assert.equal(regionOf(after, 'dashboard'), 'main', 'the dragged panel adopts the target column');
  assert.deepEqual(columns(after).main, ['cockpit', 'dashboard', 'entry']);
  assert.deepEqual(columns(after).rail, ['prevSummary', 'similar']);
});

test('dropping on a column appends to the end of that column, and can refill a column emptied of every panel', () => {
  let state = boardOf(DEFAULT_BOARD.slice());
  // Empty the rail entirely, the way a trader dragging all three panels out would.
  ['dashboard', 'prevSummary', 'similar'].forEach((id) => { state = moveToColumnEnd(state, id, 'main'); });
  assert.deepEqual(columns(state).rail, [], 'rail is now empty');
  state = moveToColumnEnd(state, 'similar', 'rail');
  assert.deepEqual(columns(state).rail, ['similar'], 'a panel can be dropped back into the emptied column');
  assert.equal(columns(state).main.indexOf('similar'), -1);
});

test('a drag that cannot mean anything is a no-op, never a corrupted board', () => {
  const before = boardOf(DEFAULT_BOARD.slice());
  assert.equal(moveBefore(before, null, 'entry'), before, 'no panel being dragged');
  assert.equal(moveBefore(before, 'entry', 'entry'), before, 'dropped on itself');
  assert.equal(moveBefore(before, 'ghost', 'entry'), before, 'panel is not on the board');
  assert.equal(moveBefore(before, 'entry', 'ghost'), before, 'target is not on the board');
  assert.equal(moveToColumnEnd(before, 'entry', 'nonsense'), before, 'unknown region');
  assert.equal(moveToColumnEnd(before, 'ghost', 'rail'), before, 'panel is not on the board');
  assert.deepEqual(before.board, DEFAULT_BOARD, 'the input state was never mutated');
});

test('the button path (move up/down) still only reorders within a column and stops at the ends', () => {
  const before = boardOf(DEFAULT_BOARD.slice());
  const down = moveWithinColumn(before, 'dashboard', 1);
  assert.deepEqual(columns(down).rail, ['prevSummary', 'dashboard', 'similar']);
  assert.deepEqual(columns(down).main, ['cockpit', 'entry']);
  assert.equal(moveWithinColumn(before, 'dashboard', -1), before, 'already first in its column');
  assert.equal(moveWithinColumn(before, 'similar', 1), before, 'already last in its column');
  assert.deepEqual(moveWithinColumn(before, 'similar', -1).board.filter((x) => x !== 'cockpit' && x !== 'entry'), ['dashboard', 'similar', 'prevSummary']);
});

// ---------------------------------------------------------------------------
// "Default layout" must reset the LAYOUT, never destroy work.
// ---------------------------------------------------------------------------
test('resetting the layout restores the default desk but keeps AI-authored panels, so they return to the library instead of being destroyed', () => {
  const state = {
    board: ['entry', 'p12345678', 'cockpit'],
    regions: { entry: 'rail', p12345678: 'main' },
    hidden: { similar: true },
    custom: { p12345678: { title: 'Scenario table', prompt: 'a table', version: 2 } }
  };
  const after = resetLayout(state);
  assert.deepEqual(after.board, DEFAULT_BOARD, 'the default five panels are back, in order');
  assert.deepEqual(after.regions, {}, 'custom placements are cleared');
  assert.deepEqual(after.hidden, {});
  assert.deepEqual(after.custom, state.custom, 'the generated panel survives, off the desk');
  // Off the board but still known -> it appears in the library, one click from the desk again.
  assert.equal(after.board.indexOf('p12345678'), -1);
  assert.ok(Object.prototype.hasOwnProperty.call(after.custom, 'p12345678'));
});

test('resetLayout tolerates a board with no custom panels at all', () => {
  assert.deepEqual(resetLayout({ board: [], regions: {}, hidden: {}, custom: {} }).custom, {});
  assert.deepEqual(resetLayout(undefined).custom, {});
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

// The bug this pair guards: the prompt is stored beside the source, and the ceiling that actually
// matters is the SERVER's 16KB per whole encoded value. A generous prompt cap in a 2-bytes-per-
// character language could push a perfectly legal source over that limit - and the refusal then
// blamed the source, telling the trader to simplify the panel when the prompt was the problem.
test('a maximum-size source plus a maximum-length Persian prompt still fits the server 16KB value limit', () => {
  const before = global.window;
  const written = [];
  global.window = { TradeJournalUserPreferences: { setPref(key, value) { written.push({ key, value }); } } };
  try {
    const result = savePanel('commander', {
      id: newPanelId(),
      title: 'ت'.repeat(200),
      prompt: 'ت'.repeat(MAX_PROMPT_CHARS * 3),
      source: '<div>' + 'x'.repeat(MAX_SOURCE_BYTES - 11) + '</div>'
    });
    assert.equal(result.ok, true, 'a legal panel at both ceilings must still save');
    assert.equal(written.length, 1);
    assert.ok(result.record.prompt.length <= MAX_PROMPT_CHARS, 'the prompt is budgeted, not stored whole');
    const encoded = byteLength(JSON.stringify(written[0].value));
    assert.ok(encoded <= MAX_VALUE_BYTES, `encoded record is ${encoded} bytes, over the ${MAX_VALUE_BYTES} server limit`);
  } finally { global.window = before; }
});

test('when the encoded record would exceed the server limit, the reported number is the one that actually failed', () => {
  const before = global.window;
  global.window = { TradeJournalUserPreferences: { setPref() { throw new Error('must not write an over-limit record'); } } };
  try {
    // Source under its own ceiling, but escaping-heavy enough to push the envelope over 16KB.
    const result = savePanel('sage', { id: newPanelId(), title: 't', prompt: 'p', source: '"\n'.repeat(MAX_SOURCE_BYTES / 2 - 20) });
    if (!result.ok) {
      assert.equal(result.reason, 'too-large');
      assert.ok(result.bytes > result.limit, 'the reported size must be the one that broke the limit');
      assert.ok(result.limit === MAX_VALUE_BYTES || result.limit === MAX_SOURCE_BYTES);
    }
  } finally { global.window = before; }
});

test('deleting a generated panel removes its own preference row, so a removed panel cannot leak 12KB of source forever', () => {
  const before = global.window;
  const reset = [];
  global.window = { TradeJournalUserPreferences: { resetPref(key) { reset.push(key); } } };
  try {
    deletePanel('hunter', 'p12345678');
    assert.deepEqual(reset, [panelKey('hunter', 'p12345678')]);
  } finally { global.window = before; }
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
