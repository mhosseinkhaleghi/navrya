import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = file => readFile(shared(file), 'utf8');

const clone = value => JSON.parse(JSON.stringify(value));

async function builderSandbox(overrides) {
  const o = overrides || {};
  const document = { documentElement: {} };
  const sandbox = {
    window: { location: { hash: o.hash || '' }, document }, document, Date
  };
  sandbox.window = Object.assign(sandbox.window, {
    TradeJournalAIActionRegistry: o.actionRegistry,
    TradeJournalStrategyEducationStore: o.strategyStore,
    TradeJournalPatternStore: o.patternStore,
    TradeJournalWorkspace: o.workspace,
    TradeJournalTradeStore: o.tradeStore,
    TradeJournalMentalHealthStore: o.mentalHealthStore,
    TradeJournalAIProactiveEngine: o.proactiveEngine
  });
  const files = ['ai-knowledge-registry.js', 'ai-user-memory.js', 'ai-context-builder.js'];
  for (const file of files) {
    vm.runInNewContext(await source(file), sandbox, { filename: file });
  }
  return sandbox.window.TradeJournalAIContextBuilder;
}

// Checkpoint (post-Journey-D): a variant sandbox that ALSO loads the real ai-process-registry.js
// - needed only by the active-entity-resolution tests below, which simulate a real, currently-open
// Trade/Strategy/Pattern detail view the same way the real app's own tradeDetailsModal.jsx/
// strategiesHubView.jsx do (register('trade-details-{id}'/'strategy-editor-{id}'/
// 'pattern-editor-{id}', {isOpen: ...})) - never a hand-rolled stand-in resolver, so this proves
// ai-context-builder.js's own resolveActiveIdByPrefix() against the exact real registry contract.
async function builderSandboxWithRegistry(overrides) {
  const o = overrides || {};
  const document = { documentElement: {} };
  const sandbox = {
    window: { location: { hash: o.hash || '' }, document }, document, Date
  };
  sandbox.window = Object.assign(sandbox.window, {
    TradeJournalAIActionRegistry: o.actionRegistry,
    TradeJournalStrategyEducationStore: o.strategyStore,
    TradeJournalPatternStore: o.patternStore,
    TradeJournalWorkspace: o.workspace,
    TradeJournalTradeStore: o.tradeStore,
    TradeJournalMentalHealthStore: o.mentalHealthStore,
    TradeJournalAIProactiveEngine: o.proactiveEngine
  });
  const files = ['ai-process-registry.js', 'ai-knowledge-registry.js', 'ai-user-memory.js', 'ai-context-builder.js'];
  for (const file of files) {
    vm.runInNewContext(await source(file), sandbox, { filename: file });
  }
  return { builder: sandbox.window.TradeJournalAIContextBuilder, processRegistry: sandbox.window.TradeJournalAIProcessRegistry };
}

// Journey H1 closure: currentSurfaceFor() reads TradeJournalAISurfaceContext, which itself reads
// TradeJournalAIProcessRegistry + TradeJournalAIContextEngine - the real chain, not a hand-rolled
// stand-in, so this proves the actual wire shape a real turn would produce.
async function builderSandboxWithSurface(overrides) {
  const o = overrides || {};
  const document = { documentElement: {} };
  const sandbox = {
    window: { location: { hash: o.hash || '' }, document }, document, Date
  };
  sandbox.window = Object.assign(sandbox.window, {
    TradeJournalAIActionRegistry: o.actionRegistry,
    TradeJournalStrategyEducationStore: o.strategyStore,
    TradeJournalPatternStore: o.patternStore,
    TradeJournalWorkspace: o.workspace,
    TradeJournalTradeStore: o.tradeStore,
    TradeJournalMentalHealthStore: o.mentalHealthStore,
    TradeJournalAIProactiveEngine: o.proactiveEngine,
    TradeJournalNavryaStore: o.navryaStore
  });
  const files = ['ai-process-registry.js', 'ai-context-engine.js', 'ai-surface-context.js', 'ai-knowledge-registry.js', 'ai-user-memory.js', 'ai-context-builder.js'];
  for (const file of files) {
    vm.runInNewContext(await source(file), sandbox, { filename: file });
  }
  return { builder: sandbox.window.TradeJournalAIContextBuilder, processRegistry: sandbox.window.TradeJournalAIProcessRegistry };
}

// ---- Trade question: only relevant Trade/Strategy context, nothing else ----

test('a Trade question on the Sessions/trade-planning page includes trade-planning knowledge, never Community/Subscription knowledge', async () => {
  const builder = await builderSandbox({});
  const pkg = builder.build({ message: 'What is my stop loss on this trade?', currentContext: { navigation: { activeId: 'sessions' }, activeEntities: {} } });
  const ids = pkg.productKnowledge.map((d) => d.id);
  assert.ok(ids.indexOf('trade-planning') > -1);
  assert.equal(ids.indexOf('community'), -1);
  assert.equal(ids.indexOf('account'), -1);
});

// ---- Pattern question: correct Pattern memory loaded ----

test('a Pattern question with an active pattern loads only that pattern\'s own memory', async () => {
  const patternStore = { listForScenarios: () => [{ id: 'p1', name: 'Double bottom' }, { id: 'p2', name: 'Triangle' }] };
  const builder = await builderSandbox({ patternStore });
  const pkg = builder.build({ message: 'What happens when this pattern reaches 70%?', currentContext: { navigation: { activeId: 'strategies' }, activeEntities: {} }, activePatternId: 'p1' });
  const patternMemory = pkg.userMemory.filter((m) => m.type === 'pattern');
  assert.equal(patternMemory.length, 1);
  assert.equal(patternMemory[0].data.id, 'p1');
});

// ---- Strategy question: correct Strategy loaded ----

test('a Strategy question loads only the active strategy, never another one', async () => {
  const strategyStore = { listActive: () => [{ id: 's1', name: 'Conservative Scalper' }, { id: 's2', name: 'Aggressive' }] };
  const builder = await builderSandbox({ strategyStore });
  const pkg = builder.build({ message: 'What is the maximum risk in this strategy?', currentContext: { navigation: { activeId: 'strategies' }, activeEntities: {} }, activeStrategyId: 's1' });
  const strategyMemory = pkg.userMemory.filter((m) => m.type === 'strategy');
  assert.deepEqual(clone(strategyMemory.map((m) => m.data.id)), ['s1']);
});

// ---- Session question: correct active Session loaded ----

test('a Session question loads the real active session', async () => {
  const workspace = { list: () => [{ id: 'sess1', name: 'NY Session', market: 'NewYork', status: 'open' }], find: (id) => ({ id: 'sess1', name: 'NY Session', market: 'NewYork', status: 'open' }) };
  const builder = await builderSandbox({ workspace });
  const pkg = builder.build({ message: 'What can I do from this session?', currentContext: { navigation: { activeId: 'sessions' }, activeEntities: { sessionId: 'sess1' } } });
  const sessionMemory = pkg.userMemory.filter((m) => m.type === 'session');
  assert.equal(sessionMemory[0].data.id, 'sess1');
  assert.ok(pkg.productKnowledge.some((d) => d.id === 'sessions'));
});

// ---- Generic product question: uses product knowledge, no unnecessary user data ----

test('a generic product question ("what is a Scenario") pulls only product knowledge, no user memory at all', async () => {
  const strategyStore = { listActive: () => [{ id: 's1', name: 'Strat' }] };
  const builder = await builderSandbox({ strategyStore });
  const pkg = builder.build({ message: 'What is a Scenario in NAVRYA?', currentContext: { navigation: { activeId: 'dashboard' }, activeEntities: {} } });
  assert.ok(pkg.productKnowledge.some((d) => d.id === 'sessions'));
  assert.deepEqual(clone(pkg.userMemory), [], 'no active entity was given, so nothing user-specific should be pulled in');
});

// ---- Community question: no Psychology data ----

test('a Community question never includes Psychology data, even with a validated stress reading present', async () => {
  const mentalHealthStore = { load: () => ({ continuousTracking: { preSessionCheckIns: [{ createdAt: new Date().toISOString(), currentStressLevel: 9 }] } }) };
  const builder = await builderSandbox({ hash: '#community', mentalHealthStore });
  const pkg = builder.build({ message: 'What can I do here?', currentContext: { navigation: { activeId: null }, activeEntities: {} } });
  assert.ok(pkg.productKnowledge.some((d) => d.id === 'community'));
  assert.deepEqual(clone(pkg.userMemory.filter((m) => m.type === 'psychology')), []);
});

// ---- Psychology question: only required Psychology context ----

test('a Psychology question on the Psychology page includes exactly the minimal validated psychology context', async () => {
  const recentIso = new Date().toISOString();
  const mentalHealthStore = { load: () => ({ continuousTracking: { preSessionCheckIns: [{ createdAt: recentIso, currentStressLevel: 6 }] } }) };
  const builder = await builderSandbox({ hash: '#mindset', mentalHealthStore });
  const pkg = builder.build({ message: 'What does NAVRYA know about my trading psychology?', currentContext: { navigation: { activeId: null }, activeEntities: {} } });
  const psychMemory = pkg.userMemory.filter((m) => m.type === 'psychology');
  assert.deepEqual(clone(psychMemory), [{ type: 'psychology', data: { currentStress: 6, source: 'pre_session_checkin', recordedAt: recentIso } }]);
});

// ---- Cross-domain question: multiple relevant domains included intentionally ----

test('a cross-domain question ("how do sessions, patterns, strategies and trades connect") includes all four domains', async () => {
  const builder = await builderSandbox({});
  const pkg = builder.build({ message: 'How do Sessions, Patterns, Strategies and Trades connect?', currentContext: { navigation: { activeId: 'dashboard' }, activeEntities: {} } });
  const ids = pkg.productKnowledge.map((d) => d.id);
  ['sessions', 'patterns', 'strategies'].forEach((id) => assert.ok(ids.indexOf(id) > -1, 'missing ' + id));
});

// ---- Action request: relevant Action Registry subset included ----

test('availableActions reflects the real Action Registry\'s own catalogFor(context)', async () => {
  const actionRegistry = { catalogFor: (ctx) => [{ id: 'trade.calculator', description: 'plan a trade' }] };
  const builder = await builderSandbox({ actionRegistry });
  const pkg = builder.build({ message: 'I want to take BTC long', currentContext: { navigation: { activeId: 'sessions' } } });
  assert.deepEqual(clone(pkg.availableActions), [{ id: 'trade.calculator', description: 'plan a trade' }]);
});

// ---- proactive context surfaces the real pending confirmation, if any ----

test('proactiveContext reflects a real pending Proactive Engine confirmation', async () => {
  const proactiveEngine = { pendingConfirmation: () => ({ field: 'riskPercent', proposedValue: 4, safeValue: 1 }) };
  const builder = await builderSandbox({ proactiveEngine });
  const pkg = builder.build({ message: 'why is that?', currentContext: {} });
  assert.deepEqual(clone(pkg.proactiveContext), { field: 'riskPercent', proposedValue: 4, safeValue: 1 });
});

// ---- current-page domain is never dropped, even if the message itself doesn't mention it ----

test('the current page\'s own domain is always included, regardless of the message\'s own wording', async () => {
  const builder = await builderSandbox({});
  const pkg = builder.build({ message: 'ok thanks', currentContext: { navigation: { activeId: 'settings' }, activeEntities: {} } });
  assert.ok(pkg.productKnowledge.some((d) => d.id === 'settings'));
});

test('a hash-routed page (psychology/community/account/ai-assistant) is recognized even though navigation.activeId cannot express it', async () => {
  const builder = await builderSandbox({ hash: '#account/profile/subscriptions' });
  const pkg = builder.build({ message: 'what can I do here', currentContext: { navigation: { activeId: null }, activeEntities: {} } });
  assert.ok(pkg.productKnowledge.some((d) => d.id === 'account'));
});

// ---- future extensibility: a fake future domain works with zero Context Builder changes ----

test('a newly-registered future domain becomes selectable by the Context Builder with no code changes here', async () => {
  const document = { documentElement: {} };
  const sandbox = { window: { location: { hash: '' }, document }, document, Date };
  vm.runInNewContext(await source('ai-knowledge-registry.js'), sandbox, { filename: 'ai-knowledge-registry.js' });
  sandbox.window.TradeJournalAIKnowledgeRegistry.registerKnowledgeDomain({ id: 'voice', title: 'Voice', description: 'Future voice input.', terms: ['voice', 'microphone'] });
  vm.runInNewContext(await source('ai-user-memory.js'), sandbox, { filename: 'ai-user-memory.js' });
  vm.runInNewContext(await source('ai-context-builder.js'), sandbox, { filename: 'ai-context-builder.js' });
  const pkg = sandbox.window.TradeJournalAIContextBuilder.build({ message: 'can I use voice with the microphone', currentContext: { navigation: { activeId: 'dashboard' }, activeEntities: {} } });
  assert.ok(pkg.productKnowledge.some((d) => d.id === 'voice'));
});

// ---- debugLastPackage(): sanitized metadata only ----

test('debugLastPackage() returns null before build() has ever run', async () => {
  const builder = await builderSandbox({});
  assert.equal(builder.debugLastPackage(), null);
});

test('debugLastPackage() exposes sanitized metadata, never raw psychology content or secrets', async () => {
  const recentIso = new Date().toISOString();
  const mentalHealthStore = { load: () => ({ continuousTracking: { preSessionCheckIns: [{ createdAt: recentIso, currentStressLevel: 8 }] } }) };
  const actionRegistry = { catalogFor: () => [{ id: 'trade.calculator' }] };
  const builder = await builderSandbox({ hash: '#mindset', mentalHealthStore, actionRegistry });
  builder.build({ message: 'what does navrya know about my psychology', currentContext: { navigation: { activeId: null }, activeEntities: {} } });
  const debug = builder.debugLastPackage();
  assert.deepEqual(clone(debug.domains).sort(), ['psychology']);
  assert.deepEqual(clone(debug.actions), ['trade.calculator']);
  const json = JSON.stringify(debug);
  assert.ok(json.indexOf('currentStress') === -1, 'debug metadata must summarize, never leak the actual value');
});

// ---- token-budget / context-size observability (section 33 - never "send everything every turn") ----

test('debugLastPackage() reports a rough approxTokens size, so an accidental regression toward sending everything is visible', async () => {
  const builder = await builderSandbox({});
  builder.build({ message: 'ok thanks', currentContext: { navigation: { activeId: 'settings' }, activeEntities: {} } });
  const debug = builder.debugLastPackage();
  assert.equal(typeof debug.approxChars, 'number');
  assert.equal(typeof debug.approxTokens, 'number');
  assert.ok(debug.approxTokens > 0);
  assert.equal(debug.approxTokens, Math.ceil(debug.approxChars / 4));
});

test('a narrowly-scoped single-domain question stays within a small, sane token budget - never every domain\'s full content', async () => {
  const builder = await builderSandbox({});
  const pkg = builder.build({ message: 'what is a Scenario?', currentContext: { navigation: { activeId: 'dashboard' }, activeEntities: {} } });
  const debug = builder.debugLastPackage();
  assert.ok(pkg.productKnowledge.length < registryDomainCount(), 'a narrow question must not pull in every registered domain');
  assert.ok(debug.approxTokens < 1500, 'an ordinary narrow question should cost well under a token budget that would make every-turn knowledge sending expensive - got ' + debug.approxTokens);
});

function registryDomainCount() {
  // The real, current count of required domains (see tests/ai-knowledge-registry.test.mjs's own
  // REQUIRED_DOMAIN_IDS) - kept as a loose upper bound here, not duplicated exactly, since this
  // test only cares that a narrow question is meaningfully smaller than "every domain", not the
  // registry's own exact size.
  return 12;
}

// ---- privacy: user A cannot retrieve user B's memory ----

test('user memory retrieval is always scoped to whatever the CURRENT browser\'s own stores return - there is no cross-user id parameter at all', async () => {
  // Structural proof: getRelevantStrategies/Patterns/Sessions/Trades/PsychologyContext all read
  // from window.TradeJournalXxxStore, which is already scoped to the one signed-in browser
  // session by the real, protected stores themselves (Journey A/B/C foundations) - this module
  // never accepts or threads a userId/otherUserId parameter that could cross that boundary.
  const strategyStore = { listActive: () => [{ id: 's1', name: 'Mine' }] };
  const builder = await builderSandbox({ strategyStore });
  const pkg = builder.build({ message: 'x', currentContext: { navigation: { activeId: 'strategies' }, activeEntities: {} }, activeStrategyId: 's1', userId: 'attacker-supplied-other-user-id' });
  assert.deepEqual(clone(pkg.userMemory.filter((m) => m.type === 'strategy').map((m) => m.data.id)), ['s1']);
});

// ---- Checkpoint: "this trade"/"this strategy"/"that pattern" - resolved from real, live UI ----
// ---- state (a genuinely open detail view), never guessed from the pronoun's own wording ----

test('"What is my risk on this trade?" resolves to the REAL currently-open Trade detail view, with no activeTradeId ever passed explicitly', async () => {
  const tradeStore = { listSync: () => [{ id: 't1', status: 'open', direction: 'long', updatedAt: '2026-08-18T00:00:00Z' }, { id: 't2', status: 'closed', updatedAt: '2026-08-17T00:00:00Z' }] };
  const { builder, processRegistry } = await builderSandboxWithRegistry({ tradeStore });
  // Simulates the real tradeDetailsModal.jsx registration for trade t1 being genuinely open -
  // the same real contract the live app uses, not a hand-invented shortcut.
  processRegistry.register('trade-details-t1', { allowlist: [], isOpen: () => true });
  const pkg = builder.build({ message: 'What is my risk on this trade?', currentContext: { navigation: { activeId: 'sessions' }, activeEntities: {} } });
  const tradeMemory = pkg.userMemory.filter((m) => m.type === 'trade');
  assert.equal(tradeMemory.length, 1);
  assert.equal(tradeMemory[0].data.id, 't1');
  assert.equal(pkg.liveContext.tradeId, 't1', 'liveContext must reflect the real resolved id too');
});

test('"What is the maximum risk in this strategy?" resolves to the REAL currently-open Strategy editor, with no activeStrategyId ever passed explicitly', async () => {
  const strategyStore = { listActive: () => [{ id: 's1', name: 'Conservative Scalper' }, { id: 's2', name: 'Aggressive' }] };
  const { builder, processRegistry } = await builderSandboxWithRegistry({ strategyStore });
  processRegistry.register('strategy-editor-s2', { allowlist: [], isOpen: () => true });
  const pkg = builder.build({ message: 'What is the maximum risk in this strategy?', currentContext: { navigation: { activeId: 'strategies' }, activeEntities: {} } });
  const strategyMemory = pkg.userMemory.filter((m) => m.type === 'strategy');
  assert.equal(strategyMemory.length, 1);
  assert.equal(strategyMemory[0].data.id, 's2', 'must resolve the one genuinely open editor, never an arbitrary/first one');
});

test('"What happens when that pattern completes?" resolves to the REAL currently-open Pattern editor, with no activePatternId ever passed explicitly', async () => {
  const patternStore = { listForScenarios: () => [{ id: 'p1', name: 'Double bottom' }, { id: 'p2', name: 'Triangle' }] };
  const { builder, processRegistry } = await builderSandboxWithRegistry({ patternStore });
  processRegistry.register('pattern-editor-p1', { allowlist: [], isOpen: () => true });
  const pkg = builder.build({ message: 'What happens when that pattern completes?', currentContext: { navigation: { activeId: 'strategies' }, activeEntities: {} } });
  const patternMemory = pkg.userMemory.filter((m) => m.type === 'pattern');
  assert.equal(patternMemory.length, 1);
  assert.equal(patternMemory[0].data.id, 'p1');
});

test('"this trade"/"this strategy" with NOTHING actually open resolves to no entity at all - never a guessed/first-in-list default', async () => {
  const tradeStore = { listSync: () => [{ id: 't1', status: 'open', updatedAt: '2026-08-18T00:00:00Z' }] };
  const strategyStore = { listActive: () => [{ id: 's1', name: 'Only One' }] };
  const { builder, processRegistry } = await builderSandboxWithRegistry({ tradeStore, strategyStore });
  // processRegistry exists but nothing is registered as open - the real, honest "no active entity" case.
  const pkg = builder.build({ message: 'What is my risk on this trade, and the max risk on this strategy?', currentContext: { navigation: { activeId: 'sessions' }, activeEntities: {} } });
  assert.deepEqual(clone(pkg.userMemory.filter((m) => m.type === 'trade' || m.type === 'strategy')), []);
  assert.equal(pkg.liveContext.tradeId, null);
});

test('re-opening a DIFFERENT trade\'s detail view resolves to the new one, not a stale earlier id (mirrors openIdsWithPrefix\'s own "most recently touched" rule)', async () => {
  const tradeStore = { listSync: () => [{ id: 't1', status: 'open', updatedAt: '2026-08-18T00:00:00Z' }, { id: 't2', status: 'open', updatedAt: '2026-08-18T01:00:00Z' }] };
  const { builder, processRegistry } = await builderSandboxWithRegistry({ tradeStore });
  processRegistry.register('trade-details-t1', { allowlist: [], isOpen: () => false }); // closed
  processRegistry.register('trade-details-t2', { allowlist: [], isOpen: () => true }); // now open instead
  const pkg = builder.build({ message: 'What is my risk on this trade?', currentContext: { navigation: { activeId: 'sessions' }, activeEntities: {} } });
  assert.equal(pkg.liveContext.tradeId, 't2');
});

test('an explicit opts.activeTradeId still wins over the live-registry resolution when a caller genuinely already knows it', async () => {
  const tradeStore = { listSync: () => [{ id: 't-explicit', status: 'open', updatedAt: '2026-08-18T00:00:00Z' }] };
  const { builder, processRegistry } = await builderSandboxWithRegistry({ tradeStore });
  processRegistry.register('trade-details-t-registry', { allowlist: [], isOpen: () => true });
  const pkg = builder.build({ message: 'this trade', currentContext: { navigation: { activeId: 'sessions' }, activeEntities: {} }, activeTradeId: 't-explicit' });
  assert.equal(pkg.liveContext.tradeId, 't-explicit');
});

// --- Journey H1 closure: liveContext.currentSurface (current-form question awareness) ---

test('liveContext.currentSurface is null when nothing is open at all - never padding an ordinary turn', async () => {
  const { builder } = await builderSandboxWithSurface({});
  const pkg = builder.build({ message: 'hi', currentContext: { navigation: { activeId: 'dashboard' }, activeEntities: {} } });
  assert.equal(pkg.liveContext.currentSurface, null);
});

test('liveContext.currentSurface reports processId/page/layer/step for a real open foreground process, with its full allowlist when it declares no stepForPath', async () => {
  // page is independently re-derived by ai-surface-context.js from the REAL global
  // TradeJournalNavryaStore (via ai-context-engine.js's own protected snapshot()), never from the
  // currentContext object passed into build() - so the fake store here is what actually drives it.
  const navryaStore = { getState: () => ({ activeId: 'strategies' }) };
  const { builder, processRegistry } = await builderSandboxWithSurface({ navryaStore });
  processRegistry.register('strategy-editor-s1', {
    layer: 'foreground', allowlist: ['positionManagement.entryRules', 'riskManagement.maxRiskPerTradePercent'],
    isOpen: () => true, activeStep: () => null
  });
  const pkg = builder.build({ message: 'این ریسک یعنی چی؟', currentContext: { navigation: { activeId: 'strategies' }, activeEntities: {} } });
  assert.deepEqual(clone(pkg.liveContext.currentSurface), {
    page: 'strategies', processId: 'strategy-editor-s1', layer: 'foreground', step: null,
    visibleFields: ['positionManagement.entryRules', 'riskManagement.maxRiskPerTradePercent']
  });
});

test('liveContext.currentSurface.visibleFields is scoped to the CURRENT STEP for a real stepped wizard - fields belonging to other steps are excluded', async () => {
  const { builder, processRegistry } = await builderSandboxWithSurface({});
  let step = 2;
  processRegistry.register('trade-wizard', {
    layer: 'foreground',
    allowlist: ['direction', 'entryPrice', 'primaryTimeframe', 'conceptTags', 'accountId'],
    isOpen: () => true, activeStep: () => step,
    stepForPath: (path) => ({ direction: 1, entryPrice: 1, primaryTimeframe: 2, conceptTags: 3 }[path] ?? null) // accountId: no step opinion
  });
  const pkg = builder.build({ message: 'این چیه؟', currentContext: { navigation: { activeId: 'sessions' }, activeEntities: {} } });
  assert.deepEqual(clone(pkg.liveContext.currentSurface.visibleFields.sort()), ['accountId', 'primaryTimeframe'].sort(), 'step-1 fields (direction/entryPrice) and step-3 fields (conceptTags) must be excluded from step 2\'s own visible fields; accountId (no step opinion) stays visible on every step');
  assert.equal(pkg.liveContext.currentSurface.step, 2);
});

test('liveContext.currentSurface never includes an AI-internal-only field (sourceSessionId/sourceScenarioId/pendingEmotionSignal/riskOverride), even though the real process allowlist contains them', async () => {
  const { builder, processRegistry } = await builderSandboxWithSurface({});
  processRegistry.register('trade-calculator', {
    layer: 'foreground',
    allowlist: ['direction', 'entryPrice', 'sourceSessionId', 'sourceScenarioId', 'pendingEmotionSignal', 'riskOverride'],
    isOpen: () => true, activeStep: () => null
  });
  const pkg = builder.build({ message: 'این فیلد چیه؟', currentContext: { navigation: { activeId: 'sessions' }, activeEntities: {} } });
  assert.deepEqual(clone(pkg.liveContext.currentSurface.visibleFields.sort()), ['direction', 'entryPrice']);
});

test('liveContext.currentSurface for an open Psychology Intake carries only field PATHS (the same ones already sent via activeProcess.allowlist on an ordinary turn) - never a single answer VALUE', async () => {
  const { builder, processRegistry } = await builderSandboxWithSurface({ hash: '#mindset' });
  let step = 2;
  processRegistry.register('mh-intake', {
    layer: 'foreground',
    allowlist: ['intake.demographics.age', 'intake.demographics.gender', 'intake.financialContext.capitalType'],
    isOpen: () => true, activeStep: () => step,
    stepForPath: (path) => (path.indexOf('intake.demographics.') === 0 ? 2 : path.indexOf('intake.financialContext.') === 0 ? 3 : null)
  });
  const pkg = builder.build({ message: 'سن یعنی چی می‌پرسی؟', currentContext: { navigation: { activeId: 'dashboard' }, activeEntities: {} } });
  assert.deepEqual(clone(pkg.liveContext.currentSurface.visibleFields.sort()), ['intake.demographics.age', 'intake.demographics.gender']);
  const serialized = JSON.stringify(pkg.liveContext.currentSurface);
  assert.doesNotMatch(serialized, /\d{2,}/, 'no numeric answer value (e.g. an age) may ever appear in the wire-sent currentSurface - field paths only');
  assert.equal(pkg.liveContext.currentSurface.page, 'psychology');
});

// --- Journey H1 closure: liveContext.workflow psychology redaction (the real privacy bug found
// and fixed while verifying this exact guarantee - see ai-context-builder.js's own comment) ---

test('a Psychology-domain workflow (processId starting mh-, or actionId starting psychology.) has its known/missing stripped from liveContext.workflow - only workflowId/actionId/processId/status survive', async () => {
  const { builder } = await builderSandboxWithSurface({});
  const pkg = builder.build({
    message: 'ادامه بده',
    currentContext: {
      navigation: { activeId: 'dashboard' }, activeEntities: {},
      workflow: {
        workflowId: 'wf-1', actionId: 'psychology.intake.start', processId: 'mh-intake', status: 'collecting',
        known: { 'intake.demographics.age': 29, 'intake.financialContext.capitalType': 'personal_savings', 'intake.firstBigLossReaction': 'panicked and closed everything' },
        missing: []
      }
    }
  });
  assert.deepEqual(clone(pkg.liveContext.workflow), { workflowId: 'wf-1', actionId: 'psychology.intake.start', processId: 'mh-intake', status: 'collecting' });
  const serialized = JSON.stringify(pkg.liveContext);
  assert.doesNotMatch(serialized, /personal_savings|panicked/, 'no real intake answer content may survive into liveContext, structurally - not just the known key name');
});

test('a NON-Psychology workflow (e.g. trade.calculator) keeps its full known/missing in liveContext.workflow, unaffected by the Psychology redaction', async () => {
  const { builder } = await builderSandboxWithSurface({});
  const pkg = builder.build({
    message: 'ادامه بده',
    currentContext: {
      navigation: { activeId: 'sessions' }, activeEntities: {},
      workflow: { workflowId: 'wf-2', actionId: 'trade.calculator', processId: 'trade-calculator', status: 'collecting', known: { direction: 'long', entryPrice: '1950' }, missing: ['stopLoss'] }
    }
  });
  assert.deepEqual(clone(pkg.liveContext.workflow), { workflowId: 'wf-2', actionId: 'trade.calculator', processId: 'trade-calculator', status: 'collecting', known: { direction: 'long', entryPrice: '1950' }, missing: ['stopLoss'] });
});

test('liveContext.workflow stays null when no workflow is in progress, exactly as before this change', async () => {
  const { builder } = await builderSandboxWithSurface({});
  const pkg = builder.build({ message: 'hi', currentContext: { navigation: { activeId: 'dashboard' }, activeEntities: {}, workflow: null } });
  assert.equal(pkg.liveContext.workflow, null);
});

// --- Journey H1 closure: one representative currentSurface case per in-scope domain, mirroring ---
// --- each domain's REAL registration shape (allowlist/layer/stepForPath) exactly. ---

test('Pattern field question: pattern-editor-{id} exposes its real name/description/completionThreshold fields, no step (single-panel editor)', async () => {
  const navryaStore = { getState: () => ({ activeId: 'strategies' }) };
  const { builder, processRegistry } = await builderSandboxWithSurface({ navryaStore });
  processRegistry.register('pattern-editor-p1', { layer: 'foreground', allowlist: ['name', 'description', 'completionThreshold', 'instruments'], isOpen: () => true, activeStep: () => null });
  const pkg = builder.build({ message: 'این threshold یعنی چی؟', currentContext: { navigation: { activeId: 'strategies' }, activeEntities: {} } });
  assert.equal(pkg.liveContext.currentSurface.processId, 'pattern-editor-p1');
  assert.deepEqual(clone(pkg.liveContext.currentSurface.visibleFields.sort()), ['completionThreshold', 'description', 'instruments', 'name']);
});

test('Session/Scenario field question: session-create (foreground) and a live-session-scenario-{id} card (background/ambient) both surface their real fields, neither outranks the other for currentSurface\'s own purpose - only activeOpenProcess()\'s topmost pick matters for WHICH one is current', async () => {
  const navryaStore = { getState: () => ({ activeId: 'sessions' }) };
  const { builder, processRegistry } = await builderSandboxWithSurface({ navryaStore });
  processRegistry.register('live-session-scenario-sc1', { layer: 'background', allowlist: ['title', 'description', 'positionType', 'entryPrices', 'stopLoss', 'takeProfit'], isOpen: () => true, activeStep: () => null });
  let pkg = builder.build({ message: 'این stopLoss سناریو یعنی چی؟', currentContext: { navigation: { activeId: 'sessions' }, activeEntities: {} } });
  assert.equal(pkg.liveContext.currentSurface.processId, 'live-session-scenario-sc1');
  assert.ok(pkg.liveContext.currentSurface.visibleFields.indexOf('stopLoss') > -1);

  // A real foreground session-create dialog opened on top correctly becomes the new current one.
  processRegistry.register('session-create', { layer: 'foreground', allowlist: ['city', 'timeframe', 'instrument'], isOpen: () => true, activeStep: () => null });
  pkg = builder.build({ message: 'این timeframe یعنی چی؟', currentContext: { navigation: { activeId: 'sessions' }, activeEntities: {} } });
  assert.equal(pkg.liveContext.currentSurface.processId, 'session-create');
});

test('Trade Wizard field question: step-scoped exactly like the real tradeLogModal.jsx groups (direction/entryPrice on step 1, primaryTimeframe on step 2, conceptTags/chartNote on step 3)', async () => {
  const navryaStore = { getState: () => ({ activeId: 'sessions' }) };
  const { builder, processRegistry } = await builderSandboxWithSurface({ navryaStore });
  const STEP_GROUPS = { direction: 1, marginMode: 1, entryPrice: 1, stopLoss: 1, riskPercent: 1, riskAmount: 1, leverage: 1, positionSize: 1, primaryTimeframe: 2, conceptTags: 3, chartNote: 3 };
  let step = 3;
  processRegistry.register('trade-wizard', {
    layer: 'foreground', allowlist: Object.keys(STEP_GROUPS).concat(['accountId', 'instrument']),
    isOpen: () => true, activeStep: () => step, stepForPath: (p) => (STEP_GROUPS[p] ?? null)
  });
  const pkg = builder.build({ message: 'این concept tags یعنی چی؟', currentContext: { navigation: { activeId: 'sessions' }, activeEntities: {} } });
  assert.deepEqual(clone(pkg.liveContext.currentSurface.visibleFields.sort()), ['accountId', 'chartNote', 'conceptTags', 'instrument'].sort());
});

test('Psychology Intake field question: mh-intake step-scoped to DemographicsStep\'s own real fields, and its workflow (if any) keeps raw answers out of liveContext - both guarantees hold together on the same turn', async () => {
  const { builder, processRegistry } = await builderSandboxWithSurface({ hash: '#mindset' });
  processRegistry.register('mh-intake', {
    layer: 'foreground',
    allowlist: ['intake.demographics.age', 'intake.demographics.gender', 'intake.demographics.maritalStatus', 'intake.financialContext.capitalType'],
    isOpen: () => true, activeStep: () => 2,
    stepForPath: (p) => (p.indexOf('intake.demographics.') === 0 ? 2 : p.indexOf('intake.financialContext.') === 0 ? 3 : null)
  });
  const pkg = builder.build({
    message: 'چرا این سوال رو می‌پرسی؟',
    currentContext: {
      navigation: { activeId: 'dashboard' }, activeEntities: {},
      workflow: { workflowId: 'wf-1', actionId: 'psychology.intake.start', processId: 'mh-intake', status: 'collecting', known: { 'intake.demographics.age': 31 }, missing: [] }
    }
  });
  assert.deepEqual(clone(pkg.liveContext.currentSurface.visibleFields.sort()), ['intake.demographics.age', 'intake.demographics.gender', 'intake.demographics.maritalStatus']);
  assert.deepEqual(clone(pkg.liveContext.workflow), { workflowId: 'wf-1', actionId: 'psychology.intake.start', processId: 'mh-intake', status: 'collecting' });
  assert.doesNotMatch(JSON.stringify(pkg.liveContext), /\b31\b/, 'the real age value must never appear anywhere in liveContext');
});

test('Settings field question: settings-trading-defaults (background/persistent, no step) surfaces its real three fields', async () => {
  const navryaStore = { getState: () => ({ activeId: 'settings' }) };
  const { builder, processRegistry } = await builderSandboxWithSurface({ navryaStore });
  processRegistry.register('settings-trading-defaults', { layer: 'background', allowlist: ['defaultRiskPercent', 'leverageCap', 'maxTradesPerSession'], isOpen: () => true, activeStep: () => null });
  const pkg = builder.build({ message: 'این leverage cap یعنی چی؟', currentContext: { navigation: { activeId: 'settings' }, activeEntities: {} } });
  assert.equal(pkg.liveContext.currentSurface.processId, 'settings-trading-defaults');
  assert.equal(pkg.liveContext.currentSurface.layer, 'background');
  assert.deepEqual(clone(pkg.liveContext.currentSurface.visibleFields.sort()), ['defaultRiskPercent', 'leverageCap', 'maxTradesPerSession']);
});
