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

test('session.scenario.create requires title, is only available once BOTH an active Session and an active Entry are resolved, and never lists a probability field as AI-fillable', () => {
  const block = actionBlock('session.scenario.create');
  assert.doesNotMatch(block, /entityAlreadyPersisted/);
  assert.match(block, /requiredFields: \['title'\], optionalFields: \['description', 'evidence', 'problem', 'trigger', 'patternName'\]/);
  assert.match(block, /available: \(context\) => !!\(context && context\.activeEntities && context\.activeEntities\.sessionId && context\.activeEntities\.entryId\)/);
  assert.doesNotMatch(block, /optionalFields:[^\n]*probability/i);
  assert.match(block, /Never invents a probability value/);
});

test('session.scenario.create\'s open() resolves null (never guesses an Entry) when context.activeEntities.entryId is missing, and otherwise drives hub.addScenarioToEntry(entryId)', () => {
  const block = actionBlock('session.scenario.create');
  assert.match(block, /if \(!entryId\) \{ resolve\(null\); return; \}/);
  assert.match(block, /hub\.addScenarioToEntry\(entryId\)/);
  assert.match(block, /var processId = 'live-session-scenario-' \+ created\.id/);
});

test('session.scenario.edit resolves an EXISTING scenario by exact, case-insensitive title match scoped to the current active Session\'s own scenarios only, resolving null (never guessing) on zero or ambiguous matches - F53', () => {
  const block = actionBlock('session.scenario.edit');
  assert.match(block, /requiredFields: \['scenarioTitle'\]/);
  assert.match(block, /if \(!sessionId \|\| !wanted\) \{ resolve\(null\); return; \}/);
  assert.match(block, /if \(matches\.length !== 1\) \{ resolve\(null\); return; \}/);
  assert.match(block, /String\(x\.scenario\.title \|\| ''\)\.trim\(\)\.toLowerCase\(\) === wanted\.toLowerCase\(\)/);
});

test('session.scenario.edit\'s description distinguishes scenarioTitle (resolution-only) from title (a rename), and tells the model to ask rather than guess when no existing Scenario has been named - F53', () => {
  const block = actionBlock('session.scenario.edit');
  assert.match(block, /it is never a rename/);
  assert.match(block, /ask them first instead of guessing/);
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
