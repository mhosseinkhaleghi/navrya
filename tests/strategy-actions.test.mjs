import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Journey F, F15: strategy.create/strategy.edit. Same convention as
// tests/pattern-create-action.test.mjs and tests/pattern-edit-action.test.mjs: navrya-src has no
// DOM test harness in this project - the real proof is real-browser verification (see the F15
// final report). These are static-source regression guards.

const root = process.cwd();
const characterAppSrc = await readFile(path.join(root, 'navrya-src', 'character-app.jsx'), 'utf8');
const hubSrc = await readFile(path.join(root, 'navrya-src', 'strategiesHubView.jsx'), 'utf8');

function strategyCreateBlock() {
  const match = /id: 'strategy\.create'[\s\S]*?resultContext: \(\) => \{\}\s*\}\);/.exec(characterAppSrc);
  assert.ok(match, 'could not find the real strategy.create registration');
  return match[0];
}
function strategyEditBlock() {
  const match = /id: 'strategy\.edit'[\s\S]*?resultContext: \(\) => \{\}\s*\}\);/.exec(characterAppSrc);
  assert.ok(match, 'could not find the real strategy.edit registration');
  return match[0];
}

test('strategy.create is registered with the right domain, required field, and the full real Strategy field allowlist as optional fields', () => {
  const block = strategyCreateBlock();
  assert.match(block, /domain: 'strategies'/);
  assert.match(block, /requiredFields: \['name'\]/);
  assert.match(block, /optionalFields: STRATEGY_FIELDS/);
  assert.match(block, /'create a strategy'/);
  assert.match(block, /'new strategy'/);
});

// Found via real F15 browser testing: without this, a follow-up turn ("Set max risk to 1%.")
// arriving a beat after the ~3s submit-grace-window had already cleared the workflow (since
// 'name' was the only required field, and submit() is already a no-op - the real Strategy
// persisted the instant open() created it) fell back to fresh action-discovery and lost the
// field. See ai-workflow-engine.js's own applyKnownFields() comment and
// tests/ai-workflow-engine.test.mjs's dedicated entityAlreadyPersisted tests.
test('strategy.create and strategy.edit both declare entityAlreadyPersisted - their submit() is already a no-op, the real entity already exists the instant open() creates/resolves it', () => {
  assert.match(strategyCreateBlock(), /entityAlreadyPersisted: true/);
  assert.match(strategyEditBlock(), /entityAlreadyPersisted: true/);
});

test('STRATEGY_FIELDS matches the real Strategy allowlist (strategy-education.types.js\'s own textPaths/numericPaths) - risk fields included so the compound "create + set max risk + set max concurrent trades + add entry rule" command can work in one turn', () => {
  const declMatch = /var STRATEGY_FIELDS = \[([\s\S]*?)\];/.exec(characterAppSrc);
  assert.ok(declMatch);
  const decl = declMatch[1];
  const required = [
    'positionManagement.entryRules', 'positionManagement.stopLossRules', 'positionManagement.exitTargetRules', 'positionManagement.positionSizingRules',
    'riskManagement.maxRiskPerTradePercent', 'riskManagement.maxConcurrentTrades', 'riskManagement.dailyDrawdownLimitPercent',
    'riskManagement.totalDrawdownLimitPercent', 'riskManagement.maxProfitCapPerTrade', 'overallFramework.description'
  ];
  for (const field of required) assert.match(decl, new RegExp(field.replace(/\./g, '\\.')));
});

test('strategy.create\'s open() drives the real StrategiesHub hub (hub.createNew()) via the shared pollFor() helper, waiting for the real strategy-editor-{id} process to register before resolving - same two-stage race fix as pattern.create', () => {
  const block = strategyCreateBlock();
  assert.match(block, /window\.TradeJournalNavryaStrategyHub/);
  assert.match(block, /hub\.createNew\(\)/);
  assert.match(block, /var processId = 'strategy-editor-' \+ created\.id/);
  assert.match(block, /registry\.query\(processId\)\.open/);
});

test('strategy.edit is registered with strategyName as the sole required (resolution-only) field, and name plus the full real allowlist as optional', () => {
  const block = strategyEditBlock();
  assert.match(block, /domain: 'strategies'/);
  assert.match(block, /requiredFields: \['strategyName'\]/);
  assert.match(block, /optionalFields: \['name'\]\.concat\(STRATEGY_FIELDS, \['tab'\]\)/);
});

test('strategy.edit\'s description explicitly distinguishes editing a Strategy\'s own risk limit from a Trade\'s risk override, and tells the model to ask rather than guess when the Strategy is not yet named - F53', () => {
  const block = strategyEditBlock();
  assert.match(block, /never a rename/);
  assert.match(block, /ask them which Strategy first instead of guessing/);
  assert.match(block, /not the same as a Trade\\'s own risk override/);
});

test('strategy.edit\'s open() resolves nothing (never guesses) when strategyName is missing, or matches zero or more than one real Strategy - F53', () => {
  const block = strategyEditBlock();
  assert.match(block, /if \(!strategyName\) \{ resolve\(null\); return; \}/);
  assert.match(block, /if \(matches\.length !== 1\) \{ resolve\(null\); return; \}/);
});

test('strategy.edit resolves an existing Strategy by an exact, case-insensitive name match against the real StrategyEducationStore - never fuzzy/partial', () => {
  const block = strategyEditBlock();
  assert.match(block, /String\(s\.name \|\| ''\)\.trim\(\)\.toLowerCase\(\) === strategyName\.toLowerCase\(\)/);
});

test('strategy.edit\'s open() drives the same real hub (hub.openExisting), waiting for the real process to register before resolving', () => {
  const block = strategyEditBlock();
  assert.match(block, /hub\.openExisting\(target\.id, initialTab\)/);
  assert.match(block, /var processId = 'strategy-editor-' \+ target\.id/);
});

// Found via real F15 browser testing (F9's manual-edit-precedence scenario): AI sets maxRisk=1%,
// user manually edits it to 0.75%, AI later sets maxConcurrentTrades=2 -> without this fix, the
// FINAL maxRisk reverted to 1%, silently clobbering the manual edit. Root cause: the AI process
// registration effect runs once at mount and never re-runs, permanently capturing whichever
// set()/patch() existed at that render - `strategy`/`pattern` is re-derived fresh from the store
// on every render (a genuinely different object each time), so the stale mount-time closure's own
// save() re-wrote the WHOLE record from its own outdated snapshot. A ref, kept current every
// render, fixes it - the same pattern chatDockView.jsx's own submitRef already uses.
test('StrategyDetailsTab\'s set() reads/writes through a ref kept current every render, never the stale strategy prop the mount-time registration effect closed over', () => {
  assert.match(hubSrc, /const strategyRef = React\.useRef\(strategy\);/);
  assert.match(hubSrc, /strategyRef\.current = strategy;/);
  assert.match(hubSrc, /function set\(path, value\) \{ window\.TradeJournalStrategyEducationStore\.setPath\(strategyRef\.current, path, value\); onSave\(strategyRef\.current\);/);
});

test('PatternDetailsTab\'s patch() has the identical fix - the same stale-closure bug would affect Pattern too, even though it was only actually found via Strategy\'s own F9 test', () => {
  assert.match(hubSrc, /const patternRef = React\.useRef\(pattern\);/);
  assert.match(hubSrc, /patternRef\.current = pattern;/);
  assert.match(hubSrc, /function patch\(fields\) \{ Object\.assign\(patternRef\.current, fields\); onSave\(patternRef\.current\);/);
});

test('StrategiesHub exposes a real window hook (TradeJournalNavryaStrategyHub) that creates a Strategy through the same real StrategyEducationStore.create() the "New strategy" button already uses - not a second creation path, and is torn down on unmount like the Pattern hub', () => {
  assert.match(hubSrc, /function createNewStrategy\(\) \{ const s = window\.TradeJournalStrategyEducationStore\.create\(\);/);
  // Journey H1: gained an optional tabId (defaults to 'details', unchanged for every caller here)
  // so marketplace.publish can open straight into the real Share tab - see that action's own fix.
  assert.match(hubSrc, /function openExistingStrategy\(id, tabId\) \{ setTab\('strategies'\); openItem\('strategy', id, tabId \|\| 'details'\); \}/);
  assert.match(hubSrc, /window\.TradeJournalNavryaStrategyHub = \{ createNew: createNewStrategy, openExisting: openExistingStrategy \}/);
  assert.match(hubSrc, /delete window\.TradeJournalNavryaPatternHub; delete window\.TradeJournalNavryaStrategyHub;/);
});

test('the real strategy-editor-{id} registration\'s allowlist includes \'name\' on top of the store\'s own textPaths/numericPaths - the exact gap that would otherwise make strategy.create\'s own required field un-fillable, the same fix pattern.create needed for completionThreshold', () => {
  // F37 also appends a synthetic 'confirm' gate field alongside 'name' here (see
  // tests/destructive-actions.test.mjs) - this assertion only cares that 'name' is still present.
  assert.match(hubSrc, /\.concat\(strategyTypes\.numericPaths \|\| \[\]\)\.concat\(\['name', 'confirm'\]\)/);
});

test('strategy.create/strategy.edit never touch API keys, auth tokens, or admin credentials - domain stays "strategies", nothing settings/credential-shaped in the field allowlist', () => {
  const createBlock = strategyCreateBlock();
  const editBlock = strategyEditBlock();
  for (const block of [createBlock, editBlock]) {
    assert.doesNotMatch(block, /apiKey|authToken|credential|admin/i);
  }
});

// Slice V1 (visual step/AiMagicFill), audit item 5 ("Strategy defaultValue controls that can
// diverge after manual/AI changes"): TextField_/TextAreaField_ used a plain uncontrolled
// defaultValue, which React only ever reads once at mount - a later AI voice fill correctly
// updated the real React state (name/description/title, all wrapped in AiMagicFill at their own
// call sites) but the DOM element itself never re-synced. AiMagicFill's own typewriter overlay
// still played (a separate span, independent of this input), but once it faded, the real editable
// field underneath silently reverted to its stale mount-time text - not what the AI just set.
test('TextField_/TextAreaField_ are properly controlled (value, not defaultValue) with a local draft buffer that re-syncs whenever the external value prop changes - an AI fill must reach the real, visible input, not only the field\'s own React state', () => {
  const fieldsBlock = hubSrc.slice(hubSrc.indexOf('function TextField_('), hubSrc.indexOf('// Index view'));
  assert.doesNotMatch(fieldsBlock, /defaultValue/, 'no uncontrolled defaultValue anywhere in either component - the exact bug being fixed');
  assert.match(fieldsBlock, /const \[draft, setDraft\] = React\.useState\(value \|\| ''\);/);
  assert.match(fieldsBlock, /React\.useEffect\(\(\) => \{ setDraft\(value \|\| ''\); \}, \[value\]\);/);
  assert.match(fieldsBlock, /<input type="text" value=\{draft\}/);
  assert.match(fieldsBlock, /<textarea value=\{draft\}/);
  // Commit-on-blur (never on every keystroke) must stay exactly the existing human-facing
  // behavior - only re-expressed against the local draft instead of the DOM's own raw value.
  assert.match(fieldsBlock, /onBlur=\{\(\) => \{ if \(draft !== \(value \|\| ''\)\) onCommit\(draft\); \}\}/g);
});

test('the AI-fillable call sites (pattern name/description, Marketplace listing title/description) all wrap TextField_/TextAreaField_ with AiMagicFill, passing the same value prop the fixed controlled input now correctly re-syncs from', () => {
  assert.match(hubSrc, /<AiMagicFill active=\{nameFilled\} value=\{pattern\.name\}><TextField_ label=\{tr\(lang, 'nameLabel'\)\} value=\{pattern\.name\}/);
  assert.match(hubSrc, /<AiMagicFill active=\{descriptionFilled\} value=\{pattern\.description\}><TextAreaField_ label=\{tr\(lang, 'descLabel'\)\} value=\{pattern\.description\}/);
  assert.match(hubSrc, /<TextField_ label=\{tr\(lang, 'listingTitleLabel'\)\} value=\{title\}/);
  assert.match(hubSrc, /<TextAreaField_ label=\{tr\(lang, 'listingDescLabel'\)\} value=\{description\}/);
});
