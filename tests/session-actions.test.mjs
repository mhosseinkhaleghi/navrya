import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Journey F, F19/F20: session.chartEntry.create, session.movementEntry.create,
// session.scenario.create, session.scenario.edit. Same convention as
// tests/strategy-actions.test.mjs and tests/pattern-*-action.test.mjs: navrya-src has no DOM test
// harness in this project - the real proof is real-browser verification (see docs/ai/
// action-coverage-matrix.md's F19/F20 notes). These are static-source regression guards.

const root = process.cwd();
const characterAppSrc = await readFile(path.join(root, 'navrya-src', 'character-app.jsx'), 'utf8');
const liveSessionSrc = await readFile(path.join(root, 'navrya-src', 'liveSessionView.jsx'), 'utf8');
const chatDockCoreSrc = await readFile(path.join(root, 'public', 'pages', 'shared', 'chat-dock-core.js'), 'utf8');
const contextEngineSrc = await readFile(path.join(root, 'public', 'pages', 'shared', 'ai-context-engine.js'), 'utf8');
const preSessionCheckInSrc = await readFile(path.join(root, 'navrya-src', 'preSessionCheckInModal.jsx'), 'utf8');

function actionBlock(id) {
  const re = new RegExp(`id: '${id.replace(/\./g, '\\.')}'[\\s\\S]*?resultContext: \\(\\) => \\{\\}\\s*\\}\\);`);
  const match = re.exec(characterAppSrc);
  assert.ok(match, `could not find the real ${id} registration`);
  return match[0];
}

test('session.chartEntry.create requires an active Session, declares entityAlreadyPersisted (a real modal the user must explicitly close), and never claims it can auto-attach an image', () => {
  const block = actionBlock('session.chartEntry.create');
  assert.match(block, /domain: 'sessions'/);
  assert.match(block, /entityAlreadyPersisted: true/);
  assert.match(block, /requiredFields: \[\], optionalFields: \['timeframe', 'market', 'date', 'note'\]/);
  assert.match(block, /available: \(context\) => !!\(context && context\.activeEntities && context\.activeEntities\.sessionId\)/);
  assert.match(block, /can never auto-complete or fabricate an image/);
});

test('session.chartEntry.create\'s open() drives the real live session hub (hub.addChartEntry()) via the shared pollFor() helper, waiting for the real live-session-chart-entry process to register before resolving', () => {
  const block = actionBlock('session.chartEntry.create');
  assert.match(block, /window\.TradeJournalNavryaLiveSessionHub/);
  assert.match(block, /hub\.addChartEntry\(\)/);
  assert.match(block, /registry\.query\('live-session-chart-entry'\)\.open/);
});

test('session.movementEntry.create deliberately does NOT declare entityAlreadyPersisted, unlike chartEntry/scenario.create siblings - a passive, ambient "currently selected entry" registration would otherwise block all later action discovery', () => {
  const block = actionBlock('session.movementEntry.create');
  assert.doesNotMatch(block, /entityAlreadyPersisted/);
  assert.match(block, /requiredFields: \[\], optionalFields: \['note'\]/);
  assert.match(block, /hub\.addMovementEntry\(\)/);
  assert.match(block, /var processId = 'live-session-entry-' \+ created\.id/);
});

test('session.movementEntry.create\'s open() reuses the currently-selected Entry when it is already a still-empty Movement Entry, instead of unconditionally creating a new one - found via real F21 browser testing of the two-turn "open, then separately supply the note" pattern, which otherwise created a second, redundant entry and left the first one\'s note empty', () => {
  const block = actionBlock('session.movementEntry.create');
  assert.match(block, /var existing = entryId && session \? \(session\.entries \|\| \[\]\)\.find\(\(e\) => e\.id === entryId\) : null;/);
  assert.match(block, /var reuse = existing && existing\.type === 'movement' && !existing\.movementNote;/);
  assert.match(block, /var created = reuse \? existing : hub\.addMovementEntry\(\);/);
});

test('session.scenario.create\'s description carries no hedging/self-doubting clause about its own precondition - found via real F20 browser testing: a hedging clause like "only available if X, otherwise guide them" made the model decline to select the action even when available() had already gated it into the catalog correctly, with the real precondition already satisfied', () => {
  const block = actionBlock('session.scenario.create');
  assert.doesNotMatch(block, /if the user has not selected\/added an Entry yet/);
  assert.doesNotMatch(block, /guide them to do that first instead of guessing/);
});

test('session.scenario.create requires title, is only available once BOTH an active Session and an active Entry are resolved', () => {
  const block = actionBlock('session.scenario.create');
  assert.doesNotMatch(block, /entityAlreadyPersisted/);
  assert.match(block, /requiredFields: \['title'\], optionalFields: \['description', 'evidence', 'problem', 'trigger', 'patternName', 'probability', 'invalidationNote', 'invalidationTags'\]/);
  assert.match(block, /available: \(context\) => !!\(context && context\.activeEntities && context\.activeEntities\.sessionId && context\.activeEntities\.entryId\)/);
});

// 2026-08-28 bug report: probability was previously deliberately never AI-fillable at all
// ("Never invents a probability value") - explicitly reversed per the user's own request
// ("درصد احتمال باید از طریق ویس قابل کنترل باشه"). Still never inferred/guessed - only the
// exact value the user explicitly states, the same "never guess" rule every other numeric
// AI-fillable field in this app already follows.
test('session.scenario.create/edit both allow an explicit probability value, but their own description still forbids inferring/guessing one from confidence or tone', () => {
  for (const id of ['session.scenario.create', 'session.scenario.edit']) {
    const block = actionBlock(id);
    assert.match(block, /optionalFields:[^\n]*'probability'/, `${id} must list probability as AI-fillable`);
    assert.match(block, /probability is 0-100 and must only be the exact percentage the user explicitly states - never inferred/);
  }
});

test('session.scenario.create\'s open() resolves null (never guesses an Entry) when context.activeEntities.entryId is missing, and otherwise drives hub.addScenarioToEntry(entryId)', () => {
  const block = actionBlock('session.scenario.create');
  assert.match(block, /if \(!entryId\) \{ resolve\(null\); return; \}/);
  assert.match(block, /hub\.addScenarioToEntry\(entryId\)/);
  assert.match(block, /var processId = 'live-session-scenario-' \+ created\.id/);
});

test('session.scenario.edit resolves an EXISTING, named scenario by exact, case-insensitive title match scoped to the current active Session\'s own scenarios only, resolving null (never guessing) on zero or ambiguous matches - F53', () => {
  const block = actionBlock('session.scenario.edit');
  assert.match(block, /if \(!sessionId\) \{ resolve\(null\); return; \}/);
  assert.match(block, /if \(matches\.length !== 1\) \{ resolve\(null\); return; \}/);
  assert.match(block, /String\(sc\.title \|\| ''\)\.trim\(\)\.toLowerCase\(\) === wanted\.toLowerCase\(\)/);
});

// 2026-08-28 bug report: continuing to fill a Scenario across SEPARATE turns ("create a
// scenario" ... then, later, "set the title to X") never worked - a just-created scenario still
// carries its untouched default title, so there was nothing for scenarioTitle to resolve by, and
// the model correctly refused to guess (exactly as the old description told it to), leaving the
// user with no way to continue via voice. scenarioTitle is now optional - omitted, it resolves
// the currently-open scenario via context.activeEntities.scenarioId.
test('session.scenario.edit has no required fields - scenarioTitle is optional, resolving the CURRENTLY-OPEN scenario (context.activeEntities.scenarioId) when omitted, so a follow-up turn can keep filling a just-created scenario that has no distinguishing name yet', () => {
  const block = actionBlock('session.scenario.edit');
  assert.match(block, /requiredFields: \[\], optionalFields: \['scenarioTitle', 'title', 'description', 'evidence', 'problem', 'trigger', 'patternName', 'probability', 'invalidationNote', 'invalidationTags'\]/);
  assert.match(block, /var activeScenarioId = context && context\.activeEntities && context\.activeEntities\.scenarioId;/);
  assert.match(block, /if \(!activeScenarioId\) \{ resolve\(null\); return; \}/, 'no name given AND nothing currently open must still never guess');
  assert.match(block, /target = flat\.find\(\(sc\) => sc\.id === activeScenarioId\);/);
});

test('session.scenario.edit\'s description distinguishes scenarioTitle (resolution-only, for a DIFFERENT already-named scenario) from title (a rename), and explains the currently-open scenario resolves automatically without one', () => {
  const block = actionBlock('session.scenario.edit');
  assert.match(block, /leave scenarioTitle unset for that, it resolves automatically/);
  assert.match(block, /Only set scenarioTitle to open a DIFFERENT, already-named Scenario/);
});

test('session.scenario.edit\'s open() drives the real hub (hub.openScenario), scoped to session.entries flattened from window.TradeJournalWorkspace.find(sessionId) - never a second, parallel Session read path', () => {
  const block = actionBlock('session.scenario.edit');
  assert.match(block, /window\.TradeJournalWorkspace \? window\.TradeJournalWorkspace\.find\(sessionId\)/);
  assert.match(block, /hub\.openScenario\(target\.id\)/);
});

test('session.chartEntry.create/movementEntry.create/scenario.create/scenario.edit never touch API keys, auth tokens, or admin credentials', () => {
  for (const id of ['session.chartEntry.create', 'session.movementEntry.create', 'session.scenario.create', 'session.scenario.edit']) {
    assert.doesNotMatch(actionBlock(id), /apiKey|authToken|credential|admin/i);
  }
});

test('liveSessionView.jsx exposes a real window hook (TradeJournalNavryaLiveSessionHub) driving the same real addEntry/addScenario/setChartModalOpen functions the human UI already uses - not a second Session-mutation path, via a ref kept current every render to avoid the F9-class stale-closure bug', () => {
  assert.match(liveSessionSrc, /const liveSessionHubRef = React\.useRef\(null\);/);
  assert.match(liveSessionSrc, /liveSessionHubRef\.current = \{ session, addEntry, addScenario, setChartModalOpen, withPreSessionCheckIn, selectEntry, setOpenScenarios \};/);
  assert.match(liveSessionSrc, /window\.TradeJournalNavryaLiveSessionHub = \{/);
  assert.match(liveSessionSrc, /addChartEntry: \(\) => \{ liveSessionHubRef\.current\.withPreSessionCheckIn/);
  assert.match(liveSessionSrc, /addMovementEntry: \(\) => \{/);
  assert.match(liveSessionSrc, /addScenarioToEntry: \(entryId\) => \{/);
  assert.match(liveSessionSrc, /openScenario: \(scenarioId\) => \{/);
  assert.match(liveSessionSrc, /return \(\) => \{ delete window\.TradeJournalNavryaLiveSessionHub; \};/);
});

test('addEntry/addScenario both return the created record (not void) so the hub can report the real new id back to the action registry', () => {
  const addEntryBody = /function addEntry\(kind\) \{([\s\S]*?)\n  function deleteEntry/.exec(liveSessionSrc);
  assert.ok(addEntryBody, 'could not find addEntry()');
  assert.match(addEntryBody[1], /return entry;/);
  const addScenarioBody = /function addScenario\(entry\) \{([\s\S]*?)\n  function updateScenario/.exec(liveSessionSrc);
  assert.ok(addScenarioBody, 'could not find addScenario()');
  assert.match(addScenarioBody[1], /return scenario;/);
});

test('ScenarioEditor\'s AI applyValue() reads onUpdate/scenario/registeredPatterns through refs kept current every render, never the stale closure captured when its useEffect first ran - found via real F21-close browser testing (manual UI edit, not code reading or store mutation): a human\'s manual edit to one field survived immediately, but was silently reverted by a LATER, unrelated AI field edit, because persist()\'s own mutator(session) mutated whatever `session` the frozen onUpdate closure had captured at mount, discarding everything that changed since - the same stale-closure bug class already fixed for StrategyDetailsTab/PatternDetailsTab, generalized to the one component that never got it', () => {
  assert.match(liveSessionSrc, /const onUpdateRef = React\.useRef\(onUpdate\);/);
  assert.match(liveSessionSrc, /onUpdateRef\.current = onUpdate;/);
  assert.match(liveSessionSrc, /const onSetSideRef = React\.useRef\(onSetSide\);/);
  assert.match(liveSessionSrc, /const scenarioRef = React\.useRef\(scenario\);/);
  assert.match(liveSessionSrc, /const registeredPatternsRef = React\.useRef\(registeredPatterns\);/);
  // applyValue() itself must call the refs, never the raw closed-over props directly.
  const applyValueBody = /registry\.register\('live-session-scenario-' \+ scenario\.id[\s\S]*?applyValue: \(path, value\) => \{([\s\S]*?)return undefined;/.exec(liveSessionSrc);
  assert.ok(applyValueBody, 'could not find the live-session-scenario- applyValue() body');
  assert.match(applyValueBody[1], /onUpdateRef\.current\(/);
  assert.match(applyValueBody[1], /onSetSideRef\.current\(/);
  assert.match(applyValueBody[1], /scenarioRef\.current\.executionPlan/);
  assert.match(applyValueBody[1], /registeredPatternsRef\.current\.filter/);
});

test('handlePatternChange reads onUpdate/scenario/registeredPatterns through the same refs, not the stale props closure - it is called from inside applyValue()\'s own frozen closure, so it would otherwise reintroduce the exact bug the refs above fix', () => {
  const fnBody = /function handlePatternChange\(patternId\) \{([\s\S]*?)\n  \}/.exec(liveSessionSrc);
  assert.ok(fnBody, 'could not find handlePatternChange');
  assert.match(fnBody[1], /onUpdateRef\.current\(/);
  assert.match(fnBody[1], /registeredPatternsRef\.current\.find/);
  assert.match(fnBody[1], /scenarioRef\.current/);
});

test('the live-session-scenario-{id} registration allowlist includes patternName, wired to resolve a real Pattern by exact name match via handlePatternChange - never a bare string write, preserving the existing snapshot semantics', () => {
  assert.match(liveSessionSrc, /path === 'patternName'/);
  assert.match(liveSessionSrc, /matches\.length === 1.*handlePatternChange\(matches\[0\]\.id\)/);
});

test('chat-dock-core.js excludes live-session-entry-{id} from activeProcess, mirroring the pre-existing live-session-scenario-{id} exclusion - both are passive/ambient "currently selected" registrations, never a deliberate open gesture, and would otherwise permanently block chat-dock-core.js\'s own !activeProcess && !currentWorkflow gate for offering availableActions', () => {
  assert.match(chatDockCoreSrc, /String\(activeProcess\.id\)\.indexOf\('live-session-entry-'\) === 0\) activeProcess = null;/);
  assert.match(chatDockCoreSrc, /String\(activeProcess\.id\)\.indexOf\('live-session-scenario-'\) === 0\) activeProcess = null;/);
});

test('ai-context-engine.js resolves activeEntryId() from the real live-session-entry-{id} registration, mirroring activeScenarioId() exactly, and snapshot().activeEntities includes entryId', () => {
  assert.match(contextEngineSrc, /function activeEntryId\(\)/);
  assert.match(contextEngineSrc, /active\.id\.indexOf\('live-session-entry-'\) !== 0\) return null;/);
  assert.match(contextEngineSrc, /entryId: sessionId \? activeEntryId\(\) : null/);
});

// --- Journey H1 closure: Session Entry / Scenario magic-fill coverage (the gap the H1 final ---
// --- report itself flagged - "no new animation wiring added there this pass"). Reuses the exact ---
// --- shared ai-field-fill-bus/useAiFieldFill/AiMagicFill architecture every other H1 domain ---
// --- already uses - no second animation system, no change to real controlled state/business logic. ---

test('liveSessionView.jsx imports the shared AiMagicFill/useAiFieldFill architecture - not a second, parallel animation mechanism', () => {
  assert.match(liveSessionSrc, /import \{ AiMagicFill \} from '\.\.\/public\/pages\/shared\/navrya\/components\/feedback\/AiMagicFill\.jsx';/);
  assert.match(liveSessionSrc, /import \{ useAiFieldFill \} from '\.\.\/public\/pages\/shared\/navrya\/hooks\/useAiFieldFill\.js';/);
});

test('every real, AI-fillable ScenarioEditor field (title/description/evidence/problem/trigger/positionType/entryPrices/stopLoss/takeProfit/probability/invalidationNote/invalidationTags) is wired to useAiFieldFill(\'live-session-scenario-\' + scenario.id, <path>), matching its own allowlist exactly', () => {
  for (const field of ['title', 'description', 'evidence', 'problem', 'trigger', 'positionType', 'entryPrices', 'stopLoss', 'takeProfit', 'patternName', 'probability', 'invalidationNote', 'invalidationTags']) {
    const re = new RegExp(`useAiFieldFill\\('live-session-scenario-' \\+ scenario\\.id, '${field}'\\)`);
    assert.match(liveSessionSrc, re, `ScenarioEditor must call useAiFieldFill for '${field}'`);
  }
});

test('every real, AI-fillable field is actually WRAPPED in <AiMagicFill active={...FieldFilled}> in the real JSX, not just subscribed to and unused', () => {
  for (const varName of ['titleFilled', 'descriptionFilled', 'evidenceFilled', 'problemFilled', 'triggerFilled', 'positionTypeFilled', 'entryPricesFilled', 'stopLossFilled', 'takeProfitFilled', 'patternNameFilled', 'probabilityFilled', 'invalidationNoteFilled', 'invalidationTagsFilled', 'noteFilled']) {
    const re = new RegExp(`<AiMagicFill active=\\{${varName}\\}>`);
    assert.match(liveSessionSrc, re, `${varName} must actually be passed to a real <AiMagicFill active={...}> in the rendered JSX`);
  }
});

// 2026-08-28 bug report: probability/invalidationNote/invalidationTags were never in the
// ScenarioEditor registration's own allowlist/applyValue at all - added now, same real write
// shape the manual controls already use (probabilityHistory append, invalidationTagIds
// append-dedup, invalidationNote replace).
test('the live-session-scenario-{id} registration allowlist includes probability/invalidationNote/invalidationTags, and applyValue() writes each through the SAME real mechanism the manual controls use', () => {
  assert.match(liveSessionSrc, /allowlist: \['title', 'description', 'evidence', 'problem', 'trigger', 'positionType', 'entryPrices', 'stopLoss', 'takeProfit', 'patternName', 'probability', 'invalidationNote', 'invalidationTags', 'confirmDelete'\]/);
  // probability: clamped 0-100, appended as a new probabilityHistory entry - never a bare
  // current-value overwrite (probabilityOf() itself reads the LATEST entry of a real log).
  assert.match(liveSessionSrc, /const clamped = Math\.max\(0, Math\.min\(100, n\)\);/);
  assert.match(liveSessionSrc, /probabilityHistory: \(scenarioRef\.current\.probabilityHistory \|\| \[\]\)\.concat\(\[\{ value: clamped, loggedAt: new Date\(\)\.toISOString\(\) \}\]\)/);
  // invalidationNote: a plain replace, same as title/description/evidence/problem/trigger.
  assert.match(liveSessionSrc, /if \(path === 'invalidationNote'\) \{ onUpdateRef\.current\(\{ invalidationNote: String\(value \?\? ''\) \}\); return; \}/);
  // invalidationTags: comma-split, trimmed, deduped against the real existing list, appended -
  // mirrors InvalidationTags' own addTag(), never a bare replace of the whole array.
  assert.match(liveSessionSrc, /const additions = String\(value \?\? ''\)\.split\(','\)\.map\(\(part\) => part\.trim\(\)\)\.filter\(\(part\) => part && existing\.indexOf\(part\) === -1\);/);
});

test('EntryDetailPanel\'s own AI-fillable field (note) is wired to useAiFieldFill(\'live-session-entry-\' + entry.id, \'note\'), matching its own allowlist exactly', () => {
  assert.match(liveSessionSrc, /useAiFieldFill\('live-session-entry-' \+ entry\.id, 'note'\)/);
});

test('confirmDelete (both ScenarioEditor and EntryDetailPanel) is deliberately NOT wired to useAiFieldFill - it is a synthetic, AI-only gate field with no corresponding visible control to animate, documented rather than given an invented UI element', () => {
  assert.doesNotMatch(liveSessionSrc, /useAiFieldFill\([^)]*'confirmDelete'\)/);
  assert.match(liveSessionSrc, /no visible confirmation control exists/, 'the exception must be documented in the real source, not silently absent');
});

test('manual field edits (onBlur/onChange/onCommit handlers) call the real onUpdate/onSetSide/onNote setters directly - never the AI field-fill bus, so a human typing can never trigger the AI-origin animation', () => {
  // The bus is only ever referenced through ai-process-registry.js's own applyValue() (the
  // AI-origin path) - a real CODE reference (window.TradeJournalAIFieldFillBus / a bare call)
  // here would mean liveSessionView.jsx started emitting on it directly, a second wiring path;
  // a code COMMENT merely naming the bus for context (as this file's own H1-closure comments do)
  // is fine and must not fail this check.
  assert.doesNotMatch(liveSessionSrc, /window\.TradeJournalAIFieldFillBus|TradeJournalAIFieldFillBus\.(emit|on)/, 'liveSessionView.jsx must never call the bus directly - only ai-process-registry.js\'s own applyValue() may emit on it');
  // Each manual handler still calls the real setter directly, e.g. onBlur={(e) => onNote(entry, ...)}.
  assert.match(liveSessionSrc, /onBlur=\{\(e\) => \{ if \(e\.target\.value !== \(note \|\| ''\)\) onNote\(entry, e\.target\.value\); \}\}/);
});

// --- 2026-08-28 bug report: the Pre-Session Check-In popup is now voice-fillable ---
// (preSessionCheckInModal.jsx - opened by app code directly, never through an action's own
// open(); session.preSessionCheckIn.fill exists only as retargetOrStart()'s standalone fallback)

test('session.preSessionCheckIn.fill only ever resolves the ALREADY-open popup - it can never summon it itself', () => {
  const block = actionBlock('session.preSessionCheckIn.fill');
  assert.match(block, /entityAlreadyPersisted: true/);
  assert.match(block, /requiredFields: \[\], optionalFields: \['sleepQuality', 'currentStressLevel', 'significantPersonalEvent'\]/);
  assert.match(block, /available: \(\) => \{ var registry = window\.TradeJournalAIProcessRegistry; return !!\(registry && registry\.query\('mh-pre-session-checkin'\)\.open\); \}/);
  assert.match(block, /open: \(\) => Promise\.resolve\(\{ processId: 'mh-pre-session-checkin' \}\)/);
});

test('preSessionCheckInModal.jsx registers as layer:\'foreground\' (a real, full-screen modal overlay)', () => {
  assert.match(preSessionCheckInSrc, /registry\.register\('mh-pre-session-checkin', \{\s*\n\s*layer: 'foreground',/);
});

test('preSessionCheckInModal.jsx calls retargetOrStart() on mount and restorePreviousProcessId() on unmount, so the SAME workflow interrupted by this popup resumes afterward instead of being abandoned', () => {
  assert.match(preSessionCheckInSrc, /workflowEngine\.retargetOrStart\('mh-pre-session-checkin', 'session\.preSessionCheckIn\.fill', contextEngine \? contextEngine\.snapshot\(\) : \{\}, \[\]\)/);
  assert.match(preSessionCheckInSrc, /if \(workflowEngine\) workflowEngine\.restorePreviousProcessId\(\);/);
});

test('preSessionCheckInModal.jsx wires all 3 of its own AI-fillable fields to useAiFieldFill and wraps each in a real <AiMagicFill>', () => {
  for (const [varName, fieldPath] of [['sleepFilled', 'sleepQuality'], ['stressFilled', 'currentStressLevel'], ['eventFilled', 'significantPersonalEvent']]) {
    assert.match(preSessionCheckInSrc, new RegExp(`const ${varName} = useAiFieldFill\\('mh-pre-session-checkin', '${fieldPath}'\\)`));
    assert.match(preSessionCheckInSrc, new RegExp(`<AiMagicFill active=\\{${varName}\\}>`));
  }
});
