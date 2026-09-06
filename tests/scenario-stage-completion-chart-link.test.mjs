import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Slice U2-e (execution brief section 9 item 5): "actual pattern-stage completion" and "chart
// related-scenario link" - the two still-missing pieces of item 5 after U1-f's own "startable
// Fate operation" closed the third. Same convention as tests/session-actions.test.mjs: navrya-src
// has no DOM test harness in this project - the real proof is real-browser verification. These
// are static-source regression guards.

const root = process.cwd();
const characterAppSrc = await readFile(path.join(root, 'navrya-src', 'character-app.jsx'), 'utf8');
const liveSessionSrc = await readFile(path.join(root, 'navrya-src', 'liveSessionView.jsx'), 'utf8');

function actionBlock(id) {
  const re = new RegExp(`id: '${id.replace(/\./g, '\\.')}'[\\s\\S]*?resultContext: \\(\\) => \\{\\}\\s*\\}\\);`);
  const match = re.exec(characterAppSrc);
  assert.ok(match, `could not find the real ${id} registration`);
  return match[0];
}

// --- pattern-stage completion ---

test('session.scenario.edit declares completedStage/incompleteStage as optional fields, and its own description explains they identify one of the linked Pattern\'s real stages by exact text, only from an explicit statement', () => {
  const block = actionBlock('session.scenario.edit');
  assert.match(block, /optionalFields: \['scenarioTitle', 'title', 'description', 'evidence', 'problem', 'trigger', 'patternName', 'probability', 'invalidationNote', 'invalidationTags', 'completedStage', 'incompleteStage'\]/);
  assert.match(block, /completedStage\/incompleteStage identify one of this Scenario\\'s linked Pattern\\'s own real stages by its exact text - only when the user explicitly says that stage happened\/did not happen, never inferred\./);
});

test('the live-session-scenario-{id} registration allowlist includes completedStage/incompleteStage', () => {
  assert.match(liveSessionSrc, /allowlist: \['title', 'description', 'evidence', 'problem', 'trigger', 'positionType', 'entryPrices', 'stopLoss', 'takeProfit', 'patternName', 'probability', 'invalidationNote', 'invalidationTags', 'completedStage', 'incompleteStage', 'confirmDelete'\]/);
});

test('completedStage/incompleteStage resolve the target stage by an EXACT, case-insensitive text match against the scenario\'s own linked pattern.stages only - zero or ambiguous matches never guessed (F53)', () => {
  const idx = liveSessionSrc.indexOf("if (path === 'completedStage' || path === 'incompleteStage')");
  assert.ok(idx > -1);
  const block = liveSessionSrc.slice(idx, idx + 700);
  assert.match(block, /String\(s\.text \|\| ''\)\.trim\(\)\.toLowerCase\(\) === wantedText\)/);
  assert.match(block, /if \(matches\.length !== 1\) return; \/\/ zero or ambiguous - never guess \(F53\)/);
});

test('completedStage/incompleteStage are idempotent, not a raw toggle - onToggleStageRef.current() only fires when the stage\'s CURRENT completion state actually differs from what was asked for, so saying "mark it complete" twice never silently flips it back', () => {
  const idx = liveSessionSrc.indexOf("if (path === 'completedStage' || path === 'incompleteStage')");
  const block = liveSessionSrc.slice(idx, idx + 900);
  assert.match(block, /const isComplete = \(scenarioRef\.current\.pattern\.completedStageIds \|\| \[\]\)\.indexOf\(matches\[0\]\.id\) > -1;/);
  assert.match(block, /if \(isComplete !== wantComplete\) onToggleStageRef\.current\(matches\[0\]\);/);
});

test('onToggleStage is read through a ref kept current every render (onToggleStageRef), matching this file\'s own established anti-stale-closure convention for props read inside the registration effect - never the stale prop the mount-time closure captured', () => {
  assert.match(liveSessionSrc, /const onToggleStageRef = React\.useRef\(onToggleStage\);\s*\n\s*onToggleStageRef\.current = onToggleStage;/);
});

test('setStageCompletion() (the underlying real mutation) sets an EXPLICIT desired state, not a toggle - the exact same completedStageIds array mutation toggleStage() already makes, called with an explicit boolean instead', () => {
  const idx = liveSessionSrc.indexOf('function setStageCompletion(');
  assert.ok(idx > -1);
  const body = liveSessionSrc.slice(idx, idx + 700);
  assert.match(body, /if \(completed && at === -1\) ids\.push\(stage\.id\);/);
  assert.match(body, /else if \(!completed && at > -1\) ids\.splice\(at, 1\);/);
  assert.match(body, /target\.pattern\.completedStageIds = ids;/);
});

// --- chart related-scenario link ---

test('session.chartEntry.create declares relatedScenarios as an optional field, and its own description explains it links to EXISTING Scenarios of the current Session by exact title(s), replacing rather than adding', () => {
  const block = actionBlock('session.chartEntry.create');
  assert.match(block, /requiredFields: \[\], optionalFields: \['timeframe', 'market', 'date', 'note', 'relatedScenarios'\]/);
  assert.match(block, /relatedScenarios links this entry to one or more EXISTING Scenarios of the current Session by their exact title\(s\)/);
});

test('the live-session-chart-entry registration allowlist includes relatedScenarios', () => {
  assert.match(liveSessionSrc, /allowlist: \['note', 'timeframe', 'market', 'date', 'relatedScenarios'\],/);
});

test('relatedScenarios resolves each given title by an EXACT, case-insensitive match against the REAL, freshly re-derived flatScenarios(session) list (never the one captured at mount) - unmatched titles are silently dropped, never guessed (F53)', () => {
  const idx = liveSessionSrc.indexOf("else if (path === 'relatedScenarios')");
  assert.ok(idx > -1);
  const block = liveSessionSrc.slice(idx, idx + 700);
  assert.match(block, /const freshScenarios = flatScenarios\(sessionRef\.current\);/);
  assert.match(block, /String\(sc\.title \|\| ''\)\.trim\(\)\.toLowerCase\(\) === title\)/);
  assert.match(block, /matches\.length === 1 \? matches\[0\]\.scenario\.id : null;/);
  assert.match(block, /if \(ids\.length\) setRelated\(ids\);/);
});

test('sessionRef is kept current every render, so relatedScenarios never resolves against the scenario list captured at the mount-once registration effect\'s own first render', () => {
  assert.match(liveSessionSrc, /const sessionRef = React\.useRef\(session\);\s*\n\s*sessionRef\.current = session;/);
});
