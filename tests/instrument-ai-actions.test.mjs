import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Instrument Catalog domain: static-source regression guards for the real session.create/
// trade.calculator AI action registrations in navrya-src/character-app.jsx and the real
// PrevSummaryPanel fix in navrya-src/liveSessionView.jsx - navrya-src has no DOM test harness
// (see tests/pattern-create-action.test.mjs's own comment), so real-browser verification is the
// actual proof; these guard the exact source shape the earlier browser verification checked.

const root = process.cwd();
const characterAppSrc = await readFile(path.join(root, 'navrya-src', 'character-app.jsx'), 'utf8');
const liveSessionSrc = await readFile(path.join(root, 'navrya-src', 'liveSessionView.jsx'), 'utf8');

function actionBlock(id) {
  const re = new RegExp(`id: '${id.replace(/\./g, '\\.')}'[\\s\\S]*?resultContext: \\(\\w*\\) => (?:\\{\\}|[\\s\\S]*?\\})\\s*\\}\\);`);
  const match = re.exec(characterAppSrc);
  assert.ok(match, `could not find the real ${id} registration`);
  return match[0];
}

test('session.create requires instrument (alongside city/timeframe) and resolves it strictly against the Instrument Catalog, never a guess', () => {
  const block = actionBlock('session.create');
  assert.match(block, /requiredFields: \['city', 'timeframe', 'instrument'\]/);
  assert.match(block, /path === 'instrument'/);
  assert.match(block, /tradeHelpers\.resolveInstrument\(value, catalogStore/);
});

test('trade.calculator requires instrument (moved off optionalFields) and prefills it from a source Session\'s own instrument in open()', () => {
  const block = actionBlock('trade.calculator');
  assert.match(block, /requiredFields: \['direction', 'entryPrice', 'stopLoss', 'riskPercent', 'takeProfits', 'instrument'\]/);
  assert.doesNotMatch(block, /optionalFields: \[[^\]]*'instrument'/, 'instrument must not still be listed as optional');
  assert.match(block, /sourceSession\.instrument/);
  assert.match(block, /registry\.applyValue\('trade-calculator', 'instrument', sourceSession\.instrument, 'replace'\)/);
});

test('pattern.create requires instruments and resolves the whole list strictly against the catalog before ever creating anything', () => {
  const block = actionBlock('pattern.create');
  assert.match(block, /requiredFields: \['instruments'\]/);
  assert.match(block, /helpers\.resolveInstruments\(instrumentsField\.value, catalog\)/);
  assert.match(block, /if \(!instruments\.length\) \{ resolve\(null\); return; \}/);
});

test("PrevSummaryPanel picks the true chronological previous session with the SAME instrument only - fail closed, never another session just because it's next in the list", () => {
  const match = /function PrevSummaryPanel\(\{ session, lang \}\) \{([\s\S]*?)\n\}/.exec(liveSessionSrc);
  assert.ok(match, 'could not find PrevSummaryPanel');
  const body = match[1];
  assert.match(body, /s\.instrument === session\.instrument/);
  assert.match(body, /sessionsAdapter\.sessionTimestamp\(s\) < currentTime/);
  assert.match(body, /session\.instrument\s*\n?\s*\?/, 'no instrument on the live session must short-circuit to no candidates');
});

test('the live session workspace header (CommandBar) displays the real instrument, distinct from market/city, never a guessed value for a legacy/unclassified session', () => {
  assert.match(liveSessionSrc, /\{session\.instrument \|\| tr\(lang, 'instrumentUnassigned'\)\}/);
});
