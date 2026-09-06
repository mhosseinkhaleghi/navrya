import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Slice U2-a (execution brief section 9 item 4, "real stage add/edit/remove with stable IDs and
// deletion consent"): pattern.stage.add/pattern.stage.edit/pattern.stage.remove. Same convention
// as tests/pattern-create-action.test.mjs/tests/destructive-actions.test.mjs: navrya-src has no
// DOM test harness in this project - the real proof is real-browser verification. These are
// static-source regression guards.
//
// Scope note (honestly recorded, not silently dropped): stage REORDER is deliberately NOT
// implemented this slice. Repository audit found the legacy vanilla-DOM pattern-registry.js's own
// up/down reorder buttons are provably dead code - panel-system.js's render() unconditionally
// defers the 'strategies' panel to window.TradeJournalNavryaCanvas (the React app) today, and the
// React PatternDetailsTab (strategiesHubView.jsx) never grew a reorder control of its own. There
// is no live, human-clickable "move this stage up/down" operation anywhere in the current product
// to wrap - adding a voice-only reorder would be inventing new product behavior, not exposing
// existing behavior, which every other slice in this effort has deliberately avoided.

const root = process.cwd();
const characterAppSrc = await readFile(path.join(root, 'navrya-src', 'character-app.jsx'), 'utf8');
const strategiesHubSrc = await readFile(path.join(root, 'navrya-src', 'strategiesHubView.jsx'), 'utf8');

function actionBlock(id) {
  const re = new RegExp(`id: '${id.replace(/\./g, '\\.')}'[\\s\\S]*?resultContext: \\(\\) => \\{\\}\\s*\\}\\);`);
  const match = re.exec(characterAppSrc);
  assert.ok(match, `could not find the real ${id} registration`);
  return match[0];
}

// --- pattern.stage.add ---

test('pattern.stage.add requires stageText, is only available while a real Pattern is currently open (context.activeEntities.patternId - never a spoken patternName), and never declares entityAlreadyPersisted (the mutation completes inside open(), same shape as session.movementEntry.create, so it needs no chat-dock-core.js exclusion-list entry)', () => {
  const block = actionBlock('pattern.stage.add');
  assert.match(block, /domain: 'patterns'/);
  assert.doesNotMatch(block, /entityAlreadyPersisted/);
  assert.match(block, /requiredFields: \['stageText'\], optionalFields: \[\]/);
  assert.match(block, /available: \(context\) => !!\(context && context\.activeEntities && context\.activeEntities\.patternId\)/);
});

test('pattern.stage.add\'s open() resolves null (never invents a stage) when stageText is missing or the Pattern context is missing, and otherwise drives hub.addStage(patternId, text) via the shared pollFor() helper', () => {
  const block = actionBlock('pattern.stage.add');
  assert.match(block, /if \(!patternId\) \{ resolve\(null\); return; \}/);
  assert.match(block, /if \(!text\) \{ resolve\(null\); return; \}/);
  assert.match(block, /window\.TradeJournalNavryaPatternHub/);
  assert.match(block, /hub\.addStage\(patternId, text\)/);
  assert.match(block, /resolve\(updated \? \{ processId: 'pattern-editor-' \+ patternId \} : null\)/);
});

// --- pattern.stage.edit ---

test('pattern.stage.edit requires BOTH stageText (resolution-only - which existing stage) and newText (the replacement), and is only available while a real Pattern is currently open', () => {
  const block = actionBlock('pattern.stage.edit');
  assert.match(block, /domain: 'patterns'/);
  assert.match(block, /requiredFields: \['stageText', 'newText'\], optionalFields: \[\]/);
  assert.match(block, /available: \(context\) => !!\(context && context\.activeEntities && context\.activeEntities\.patternId\)/);
  assert.match(block, /it is never a new stage/);
});

test('pattern.stage.edit resolves the target stage by an EXACT, case-insensitive text match against the currently open Pattern\'s own stages only - zero or ambiguous matches resolve null, never guessed (F53)', () => {
  const block = actionBlock('pattern.stage.edit');
  assert.match(block, /String\(s\.text \|\| ''\)\.trim\(\)\.toLowerCase\(\) === wanted\.toLowerCase\(\)/);
  assert.match(block, /if \(matches\.length !== 1\) \{ resolve\(null\); return; \}/);
});

test('pattern.stage.edit\'s open() drives hub.renameStage(patternId, matchedStageId, replacement) - the matched stage\'s own real, stable id, never a freshly-fabricated one', () => {
  const block = actionBlock('pattern.stage.edit');
  assert.match(block, /hub\.renameStage\(patternId, matches\[0\]\.id, replacement\)/);
});

// --- pattern.stage.remove (deletion consent) ---

test('pattern.stage.remove requires stageText AND the confirm gate, declares gateField/normalizeField exactly like its pattern.delete/strategy.delete siblings (Slice W1\'s shared contract), and is high riskLevel', () => {
  const block = actionBlock('pattern.stage.remove');
  assert.match(block, /domain: 'patterns'/);
  assert.match(block, /riskLevel: 'high'/);
  assert.match(block, /requiredFields: \['stageText', 'confirm'\], optionalFields: \[\]/);
  assert.match(block, /normalizeField: normalizeGateField\('confirm'\)/);
  assert.match(block, /gateField: 'confirm',/);
  assert.match(block, /available: \(context\) => !!resolveActivePatternId\(context\)/);
});

test('pattern.stage.remove\'s open() never mutates/deletes - it only resolves the exact target stage (zero/ambiguous matches resolve null, never guessed) and remembers it in a module-level pending var; only submit(), gated on confirm, may actually remove it', () => {
  const block = actionBlock('pattern.stage.remove');
  const openFn = /open: \([^)]*\) => new Promise\(\(resolve\) => \{([\s\S]*?)\n {8}\}\),/.exec(block);
  assert.ok(openFn, 'could not find pattern.stage.remove\'s open()');
  assert.doesNotMatch(openFn[1], /\.removeStage\(|\.remove\(/, 'open() must never mutate/delete - only submit() may');
  assert.match(openFn[1], /if \(matches\.length !== 1\) \{ resolve\(null\); return; \}/);
  assert.match(openFn[1], /pendingStageRemoveTarget = \{ patternId: patternId, stageId: matches\[0\]\.id \};/);
  assert.match(openFn[1], /resolve\(\{ processId: 'pattern-editor-' \+ patternId \}\);/);
});

test('pattern.stage.remove\'s submit() gates strictly on known.confirm (=== true or the string "true"), re-verifies the CURRENT active Pattern still matches the originally resolved one before mutating (F37 section 6: switched-target safety), then calls the real hub.removeStage() - never a hidden/reimplemented delete path', () => {
  const block = actionBlock('pattern.stage.remove');
  assert.match(block, /if \(known\.confirm !== true && known\.confirm !== 'true'\) return undefined;/);
  assert.match(block, /var currentActive = resolveActivePatternId\(context\);/);
  assert.match(block, /if \(currentActive && currentActive !== target\.patternId\) return undefined;/);
  assert.match(block, /hub\.removeStage\(target\.patternId, target\.stageId\)/);
});

test('pattern.stage.remove never declares a fillable field for password, API key, admin role, or billing', () => {
  const block = actionBlock('pattern.stage.remove');
  const fieldsMatch = /requiredFields: \[([^\]]*)\], optionalFields: \[([^\]]*)\]/.exec(block);
  assert.ok(fieldsMatch);
  assert.doesNotMatch(fieldsMatch[1] + fieldsMatch[2], /password|apiKey|admin|billing/i);
});

// --- strategiesHubView.jsx: the hub methods ---

test('StrategiesHub exposes addStage/renameStage/removeStage on the same real window hook pattern.create/pattern.edit already use (TradeJournalNavryaPatternHub) - not a second, parallel mutation path', () => {
  assert.match(strategiesHubSrc, /window\.TradeJournalNavryaPatternHub = \{ createNew: createNewPattern, openExisting: openExistingPattern, addStage: addPatternStage, renameStage: renamePatternStage, removeStage: removePatternStage \};/);
});

test('addPatternStage/renamePatternStage/removePatternStage all call the exact same real store.save() PatternDetailsTab\'s own manual addStage()/patchStage()/deleteStage() already use (never a second, parallel persistence path), and rerender() the Hub so the open Pattern reflects the change immediately', () => {
  for (const fn of ['addPatternStage', 'renamePatternStage', 'removePatternStage']) {
    const idx = strategiesHubSrc.indexOf('function ' + fn + '(');
    assert.ok(idx > -1, `could not find ${fn}()`);
    const body = strategiesHubSrc.slice(idx, idx + 500);
    assert.match(body, /if \(!pattern\) return null;/, `${fn} must resolve the real Pattern by id and refuse a missing one`);
    assert.match(body, /store2\.save\(Object\.assign\(\{\}, pattern, \{ stages: (stages|pattern\.stages\.concat\(\[newStage\]\)) \}\)\);/, `${fn} must persist through the real store.save()`);
    assert.match(body, /rerender\(\);/, `${fn} must rerender the Hub so the change is visible immediately`);
  }
});

test('addPatternStage creates the new stage through the real store.createStage(text, order) - the same real id/order shape the manual "Add stage" button already uses, never a hand-rolled stage object', () => {
  const idx = strategiesHubSrc.indexOf('function addPatternStage(');
  const body = strategiesHubSrc.slice(idx, idx + 400);
  assert.match(body, /store2\.createStage\(text, pattern\.stages\.length \+ 1\)/);
});

test('renamePatternStage/removePatternStage both target the stage by its own real, stable id - never by array index, which would silently retarget the wrong stage after a prior add/remove shifted positions', () => {
  const renameIdx = strategiesHubSrc.indexOf('function renamePatternStage(');
  const renameBody = strategiesHubSrc.slice(renameIdx, renameIdx + 400);
  assert.match(renameBody, /s\.id === stageId/);
  const removeIdx = strategiesHubSrc.indexOf('function removePatternStage(');
  const removeBody = strategiesHubSrc.slice(removeIdx, removeIdx + 400);
  assert.match(removeBody, /s\.id !== stageId/);
});
