import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Voice/Chat form-interview workflow upgrade, defect 3: mh-intake previously omitted the Extremes
// step, Scenarios A-E, and final progression/sealing entirely - Voice stopped after History. These
// are static-source regression guards (navrya-src has no DOM/React test harness in this project,
// matching every other *.jsx test file's own convention) proving the real fix is actually wired,
// through the real controlled component/state path, not a second psychology store.

const root = process.cwd();
const intakeModalSrc = await readFile(path.join(root, 'navrya-src', 'mentalHealthIntakeModal.jsx'), 'utf8');
const characterAppSrc = await readFile(path.join(root, 'navrya-src', 'character-app.jsx'), 'utf8');
const mentalHealthTypesSrc = await readFile(path.join(root, 'public', 'pages', 'shared', 'mental-health.types.js'), 'utf8');

function registrationBlock() {
  const start = intakeModalSrc.indexOf("registry.register('mh-intake', {");
  assert.notEqual(start, -1, 'missing the real mh-intake registration');
  const end = intakeModalSrc.indexOf('submit: () => finish()', start);
  assert.notEqual(end, -1);
  return intakeModalSrc.slice(start, end + 'submit: () => finish()'.length);
}

function actionBlock(id) {
  const start = characterAppSrc.indexOf("id: '" + id + "'");
  assert.notEqual(start, -1, `missing Action Registry entry ${id}`);
  const next = characterAppSrc.indexOf('window.TradeJournalAIActionRegistry.registerAction({', start + 1);
  return characterAppSrc.slice(start, next === -1 ? characterAppSrc.length : next);
}

test('mental-health.types.js\'s intakePaths now includes the Extremes step\'s five real numericPaths fields (largestWin/largestLoss amounts+percents, marginCallOrZeroedCount) - the confirmed pre-existing gap', () => {
  const idx = mentalHealthTypesSrc.indexOf('intakePaths:');
  const block = mentalHealthTypesSrc.slice(idx, mentalHealthTypesSrc.indexOf('],', idx));
  for (const path_ of [
    'intake.tradingHistory.largestWin.amount', 'intake.tradingHistory.largestWin.percent',
    'intake.tradingHistory.largestLoss.amount', 'intake.tradingHistory.largestLoss.percent',
    'intake.tradingHistory.marginCallOrZeroedCount'
  ]) {
    assert.ok(block.includes(path_), `intakePaths is missing ${path_}`);
  }
});

test('SCENARIOS is exported from mentalHealthIntakeModal.jsx (for character-app.jsx\'s scenario-choice normalizer) and defines all five real scenarios A-E', () => {
  assert.match(intakeModalSrc, /export const SCENARIOS = \[/);
  for (const id of ['A_stop_loss', 'B_revenge', 'C_fomo', 'D_patience', 'E_identity']) {
    assert.match(intakeModalSrc, new RegExp(`id: '${id}'`));
  }
});

test('the mh-intake registration allowlist includes every real scenario response path, generated from the SAME SCENARIOS table the step->component map already uses - never a second, hand-typed list', () => {
  const block = registrationBlock();
  assert.match(block, /allowlist: allowlist,/);
  assert.match(intakeModalSrc, /const allowlist = \(types\.intakePaths \|\| \[\]\)\.concat\(scenarioInterviewPaths\);/);
  assert.match(intakeModalSrc, /const scenarioInterviewPaths = React\.useMemo\(\(\) => SCENARIOS\.reduce\(\(acc, s\) => \{/);
  assert.match(intakeModalSrc, /acc\.push\('psychology\.scenario\.' \+ s\.id \+ '\.choice'\);/);
  assert.match(intakeModalSrc, /if \(s\.slider\) acc\.push\('psychology\.scenario\.' \+ s\.id \+ '\.sliderValue'\);/);
  assert.match(intakeModalSrc, /if \(s\.hasFreeText\) acc\.push\('psychology\.scenario\.' \+ s\.id \+ '\.freeText'\);/);
});

test('applyValue() writes a scenario response through the REAL controlled setDraft state (ScenarioStep\'s own patch() shape) - never a second, parallel psychology store', () => {
  const block = registrationBlock();
  assert.match(block, /if \(path\.indexOf\('psychology\.scenario\.'\) === 0\)/);
  assert.match(block, /setDraft\(\(prev\) => \(\{ \.\.\.prev, scenarioResponses: \{ \.\.\.prev\.scenarioResponses, \[scenarioId\]: \{ \.\.\.\(prev\.scenarioResponses\[scenarioId\] \|\| \{\}\), \[field\]: value \} \} \}\)\);/);
});

test('the mh-intake registration declares a real submit() reaching finish() - the exact same real Seal function the footer\'s "Seal profile" button already calls', () => {
  const block = registrationBlock();
  assert.match(block, /submit: \(\) => finish\(\)/);
});

test('stepForPath routes Extremes (step 5) fields as a MORE SPECIFIC prefix than step 4\'s whole-section group, and scenario steps 8-12 are generated from the real SCENARIOS array - never a hand-typed scenario-id-to-step map', () => {
  assert.match(intakeModalSrc, /const scenarioStepGroups = \{\};/);
  assert.match(intakeModalSrc, /SCENARIOS\.forEach\(\(s, idx\) => \{ scenarioStepGroups\[8 \+ idx\] = \['psychology\.scenario\.' \+ s\.id \+ '\.'\]; \}\);/);
  assert.match(intakeModalSrc, /5: \['intake\.tradingHistory\.largestWin\.', 'intake\.tradingHistory\.largestLoss\.', 'intake\.tradingHistory\.marginCallOrZeroedCount'\],/);
  assert.match(intakeModalSrc, /13: \['seal'\]/);
});

test('ExtremesStep now wires the same magic-fill animation (useAiFieldFill/AiMagicFill) every other intake step already has - previously wrapped in nothing', () => {
  const start = intakeModalSrc.indexOf('function ExtremesStep(');
  const end = intakeModalSrc.indexOf('function MotivationStep(');
  const block = intakeModalSrc.slice(start, end);
  assert.match(block, /useAiFieldFill\('mh-intake', 'intake\.tradingHistory\.largestWin\.amount'\)/);
  assert.match(block, /useAiFieldFill\('mh-intake', 'intake\.tradingHistory\.marginCallOrZeroedCount'\)/);
  assert.match(block, /<AiMagicFill active=\{winAmountFilled\}>/);
  assert.match(block, /<AiMagicFill active=\{marginFilled\}>/);
});

test('ScenarioStep wires magic-fill for choice/sliderValue/freeText, scoped to the real per-scenario field path', () => {
  const start = intakeModalSrc.indexOf('function ScenarioStep(');
  const end = intakeModalSrc.indexOf('function SummaryTile(');
  const block = intakeModalSrc.slice(start, end);
  assert.match(block, /useAiFieldFill\('mh-intake', 'psychology\.scenario\.' \+ scenario\.id \+ '\.choice'\)/);
  assert.match(block, /useAiFieldFill\('mh-intake', 'psychology\.scenario\.' \+ scenario\.id \+ '\.sliderValue'\)/);
  assert.match(block, /useAiFieldFill\('mh-intake', 'psychology\.scenario\.' \+ scenario\.id \+ '\.freeText'\)/);
});

test('psychology.intake.start declares a real `seal` gate (requiredFields/gateField), never entityAlreadyPersisted any more - a real, explicit final action, never auto-fired just because every step happens to be answered', () => {
  const block = actionBlock('psychology.intake.start');
  assert.match(block, /requiredFields: \['seal'\], optionalFields: \[\]/);
  assert.match(block, /gateField: 'seal'/);
  assert.doesNotMatch(block, /entityAlreadyPersisted/);
  assert.match(block, /submit: \(known\) => \{\s*\n\s*if \(known\.seal !== true && known\.seal !== 'true'\) return undefined;\s*\n\s*return window\.TradeJournalAIProcessRegistry && window\.TradeJournalAIProcessRegistry\.submit\('mh-intake'\);/);
});

test('psychology.intake.start\'s normalizeField handles the seal gate, and dispatches scenario choice paths to a real per-scenario normalizer (never a flat, wrong-option-set normalizer)', () => {
  const block = actionBlock('psychology.intake.start');
  assert.match(block, /if \(path === 'seal'\) return normalizeGateField\('seal'\)\(path, value\);/);
  assert.match(block, /path\.indexOf\('psychology\.scenario\.'\) === 0/);
  assert.match(block, /if \(scenarioField === 'choice'\) return normalizeScenarioChoice\(scenarioId, value\);/);
});

test('normalizeScenarioChoice looks up the real per-scenario option set from SCENARIOS, with its own real i18n prefix', () => {
  assert.match(characterAppSrc, /function normalizeScenarioChoice\(scenarioId, value\) \{/);
  assert.match(characterAppSrc, /var scenario = SCENARIOS\.find\(\(s\) => s\.id === scenarioId\);/);
  assert.match(characterAppSrc, /return normalizeIntakeChoice\(scenario\.choices, 'mhScenarioChoice_' \+ scenarioId \+ '_', value\);/);
});
