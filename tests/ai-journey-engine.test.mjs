import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Journey G (AI Companion & Journey Orchestration) - the deterministic engine's own suite,
// mirroring tests/ai-proactive-workflow.test.mjs's sandbox-wiring convention: real
// ai-companion-profile.js/ai-journey-steps.js/ai-journey-engine.js, driven through a fake
// localStorage and fake product stores, with `fetch` throwing if ever called - the single
// strongest way to assert "zero model calls for Journey evaluation" (§38 of the brief).
const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = (file) => readFile(shared(file), 'utf8');

function memoryStorage(seed) {
  const values = new Map(Object.entries(seed || {}));
  return { getItem: (key) => (values.has(key) ? values.get(key) : null), setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
}

async function buildSandbox(overrides = {}) {
  const document = { documentElement: { lang: overrides.lang || 'en' } };
  const localStorage = overrides.localStorage || memoryStorage();
  const sandbox = {
    window: {}, document, localStorage,
    fetch: overrides.fetch || (async () => { throw new Error('ai-journey-engine.js must never call fetch on its own'); }),
    Set, Math, JSON, console, Date, Promise, Array, Object, Number, String,
    setTimeout: (fn) => fn(), clearTimeout() {},
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } }
  };
  sandbox.window = Object.assign(sandbox.window, {
    document, localStorage, fetch: sandbox.fetch,
    setTimeout: (fn) => fn(), clearTimeout() {},
    addEventListener() {}, dispatchEvent() {},
    TradeJournalSyncQueue: { registerModule() {}, enqueue() {} },
    TradeJournalDevUserSwitcher: { currentUserId: () => null },
    TradeJournalMentalHealthStore: overrides.mentalHealthStore || { load: () => ({ intake: { completed: false } }) },
    TradeJournalPatternStore: overrides.patternStore || { listSync: () => [] },
    TradeJournalStrategyEducationStore: overrides.strategyStore || { listSync: () => [] },
    TradeJournalTradeStore: overrides.tradeStore || { listSync: () => [] },
    TradeJournalAIWorkflowEngine: overrides.workflowEngine || { current: () => null },
    TradeJournalAIProactiveEngine: overrides.proactiveEngine || { pendingConfirmation: () => null },
    TradeJournalAIActionRegistry: overrides.actionRegistry || { get: () => null }
  });
  for (const file of ['ai-i18n.js', 'ai-companion-profile.js', 'ai-journey-steps.js', 'ai-journey-engine.js']) {
    vm.runInNewContext(await source(file), sandbox, { filename: file });
  }
  return sandbox.window;
}

test('a completely fresh user is offered the optional Intake first, ahead of Pattern creation', async () => {
  const w = await buildSandbox();
  const step = w.TradeJournalAIJourneyEngine.nextBestStep();
  assert.equal(step.id, 'intake');
  assert.equal(step.optional, true);
  assert.equal(w.TradeJournalAIJourneyEngine.evaluate().phase, 'KNOW_YOURSELF');
});

test('skipping the Intake moves straight to Pattern creation - never blocks it', async () => {
  const w = await buildSandbox();
  w.TradeJournalAICompanionProfile.skipOptionalStep('intake');
  const step = w.TradeJournalAIJourneyEngine.nextBestStep();
  assert.equal(step.id, 'pattern_create');
});

test('an existing user with real completed Pattern/Strategy/Session/Trade data is never sent through onboarding again', async () => {
  const w = await buildSandbox({
    mentalHealthStore: { load: () => ({ intake: { completed: true }, continuousTracking: { postTradeReflections: [] } }) },
    patternStore: { listSync: () => [{ id: 'p1', name: 'Sweep', description: 'x', stages: [{}, {}, {}] }], scenarioReport: () => ({ hasData: false, scenarios: [] }) },
    strategyStore: { listSync: () => [{ id: 's1', positionManagement: { entryRules: 'a', stopLossRules: 'b', exitTargetRules: 'c', positionSizingRules: 'd' }, riskManagement: { maxRiskPerTradePercent: 1, dailyDrawdownLimitPercent: 3, totalDrawdownLimitPercent: 6 }, overallFramework: { description: 'x'.repeat(45) } }] },
    tradeStore: { listSync: () => [{ id: 't1', status: 'closed', entryPrice: 1, stopLoss: 2, takeProfits: [{ price: 3 }], direction: 'long' }] },
    localStorage: memoryStorage({ 'tradejournal:sessions:v1:shared': JSON.stringify([{ id: 'sess1', market: 'London', timeframe: '15m', date: '2026-01-01', entries: [{ id: 'e1', scenarios: [{ id: 'sc1', executionPlan: { entryPrices: [1], stopLoss: 2, takeProfit: 3 } }] }] }]) })
  });
  const snapshot = w.TradeJournalAIJourneyEngine.evaluate();
  // Array.from(...) (this file's own, host-realm Array) sidesteps a cross-vm-realm identity
  // mismatch node:assert/strict's deepEqual is otherwise strict about, even when the printed
  // contents are identical - snapshot.completedMilestones was built inside the vm sandbox.
  assert.deepEqual(Array.from(snapshot.completedMilestones).sort(), ['intake', 'pattern_create', 'scenario_plan', 'session_create', 'strategy_create', 'trade_plan'].sort());
  const step = w.TradeJournalAIJourneyEngine.nextBestStep();
  assert.ok(!step || step.id !== 'pattern_create', 'must not re-offer a completed foundational milestone');
});

test('an active open Trade outranks every onboarding step, even for an otherwise-fresh user', async () => {
  const w = await buildSandbox({ tradeStore: { listSync: () => [{ id: 't-open', status: 'open' }] } });
  const step = w.TradeJournalAIJourneyEngine.nextBestStep();
  assert.equal(step.id, 'open_trade_attention');
});

test('a due Post-Trade Reflection outranks onboarding when no Trade is open', async () => {
  const w = await buildSandbox({ tradeStore: { listSync: () => [{ id: 't-closed', status: 'closed' }] } });
  const step = w.TradeJournalAIJourneyEngine.nextBestStep();
  assert.equal(step.id, 'post_trade_reflection');
});

test('a pending Proactive Engine confirmation or an in-flight Workflow blocks the Companion entirely - safety always wins', async () => {
  const w1 = await buildSandbox({ proactiveEngine: { pendingConfirmation: () => ({ ruleId: 'strategy-risk-limit' }) } });
  assert.equal(w1.TradeJournalAIJourneyEngine.nextBestStep(), null);
  const w2 = await buildSandbox({ workflowEngine: { current: () => ({ workflowId: 'wf-1' }) } });
  assert.equal(w2.TradeJournalAIJourneyEngine.nextBestStep(), null);
});

test('an explicit currentGoal boosts a matching-domain step ahead of a higher base-priority one', async () => {
  const w = await buildSandbox({
    mentalHealthStore: { load: () => ({ intake: { completed: true } }) } // removes the priority-80 intake step from contention
  });
  w.TradeJournalAICompanionProfile.setCurrentGoal('strategies');
  const step = w.TradeJournalAIJourneyEngine.nextBestStep();
  assert.equal(step.id, 'strategy_create', 'the boosted strategies-domain step must outrank the plain pattern_create step');
});

// --- Item 3 of the Journey G follow-up: currentGoal is a real, bounded priority preference ---

test('currentGoal can be set, changed, and cleared, and the engine reflects each change immediately', async () => {
  const w = await buildSandbox({ mentalHealthStore: { load: () => ({ intake: { completed: true } }) } });
  assert.equal(w.TradeJournalAIJourneyEngine.nextBestStep().id, 'pattern_create', 'no goal set yet - plain priority order');
  w.TradeJournalAICompanionProfile.setCurrentGoal('strategies');
  assert.equal(w.TradeJournalAIJourneyEngine.nextBestStep().id, 'strategy_create', 'set');
  w.TradeJournalAICompanionProfile.setCurrentGoal('trades');
  assert.equal(w.TradeJournalAIJourneyEngine.nextBestStep().id, 'trade_plan', 'changed to a different domain');
  w.TradeJournalAICompanionProfile.setCurrentGoal(null);
  assert.equal(w.TradeJournalAIJourneyEngine.nextBestStep().id, 'pattern_create', 'cleared - back to plain priority order');
  assert.equal(w.TradeJournalAICompanionProfile.currentGoal(), null);
});

test('currentGoal never outranks an active open Trade or a due Reflection, even when the goal targets that exact same domain', async () => {
  const withOpenTrade = await buildSandbox({ tradeStore: { listSync: () => [{ id: 't-open', status: 'open' }] } });
  withOpenTrade.TradeJournalAICompanionProfile.setCurrentGoal('trades'); // same domain as open_trade_attention itself
  assert.equal(withOpenTrade.TradeJournalAIJourneyEngine.nextBestStep().id, 'open_trade_attention');

  const withDueReflection = await buildSandbox({ tradeStore: { listSync: () => [{ id: 't-closed', status: 'closed' }] } });
  withDueReflection.TradeJournalAICompanionProfile.setCurrentGoal('psychology'); // same domain as post_trade_reflection itself
  assert.equal(withDueReflection.TradeJournalAIJourneyEngine.nextBestStep().id, 'post_trade_reflection');
});

test('currentGoal never blocks safety - a pending confirmation or an active workflow still silences the Companion entirely', async () => {
  const w = await buildSandbox({ proactiveEngine: { pendingConfirmation: () => ({ ruleId: 'strategy-risk-limit' }) } });
  w.TradeJournalAICompanionProfile.setCurrentGoal('strategies');
  assert.equal(w.TradeJournalAIJourneyEngine.nextBestStep(), null);
});

test('currentGoal never marks a milestone complete, and only ever boosts a step that genuinely already exists in the registry', async () => {
  const w = await buildSandbox(); // fresh user - nothing complete yet
  const before = Array.from(w.TradeJournalAIJourneyEngine.milestones().completed);
  w.TradeJournalAICompanionProfile.setCurrentGoal('trades');
  const after = Array.from(w.TradeJournalAIJourneyEngine.milestones().completed);
  assert.deepEqual(after, before, 'setting a goal must never itself complete anything');
  // The boost lands on trade_plan specifically because it is a real, already-registered step for
  // the 'trades' domain (ai-journey-steps.js) - never a fabricated/invented action.
  const step = w.TradeJournalAIJourneyEngine.nextBestStep();
  assert.equal(step.id, 'trade_plan');
  assert.equal(step.domain, 'trades');
});

test('a goal whose domain has no currently-eligible step changes nothing - it never invents or forces an unavailable action', async () => {
  const w = await buildSandbox({
    // Every foundational milestone except the psychology-domain one (intake) is already done,
    // so 'psychology' has no eligible step left to boost except intake itself.
    mentalHealthStore: { load: () => ({ intake: { completed: true }, continuousTracking: { postTradeReflections: [] } }) }
  });
  const withoutGoal = w.TradeJournalAIJourneyEngine.nextBestStep();
  w.TradeJournalAICompanionProfile.setCurrentGoal('psychology'); // intake already complete - nothing real to boost
  const withGoal = w.TradeJournalAIJourneyEngine.nextBestStep();
  assert.equal(withGoal && withGoal.id, withoutGoal && withoutGoal.id, 'no real psychology-domain step is available, so the goal has nothing to change');
});

test('Later dismisses a step by its dedupe key until a genuinely new milestone version appears', async () => {
  const w = await buildSandbox({ mentalHealthStore: { load: () => ({ intake: { completed: true } }) } });
  const first = w.TradeJournalAIJourneyEngine.nextBestStep();
  assert.equal(first.id, 'pattern_create');
  w.TradeJournalAICompanionProfile.dismissStep(first.dedupeKey);
  const after = w.TradeJournalAIJourneyEngine.nextBestStep();
  assert.notEqual(after && after.id, 'pattern_create', 'a dismissed step must not immediately reappear');
});

test('Snooze suppresses a step only until its own snoozeUntil elapses', async () => {
  const w = await buildSandbox({ mentalHealthStore: { load: () => ({ intake: { completed: true } }) } });
  w.TradeJournalAICompanionProfile.snoozeStep('pattern_create', new Date(Date.now() + 60000).toISOString());
  assert.notEqual((w.TradeJournalAIJourneyEngine.nextBestStep() || {}).id, 'pattern_create');
  w.TradeJournalAICompanionProfile.snoozeStep('pattern_create', new Date(Date.now() - 1000).toISOString());
  assert.equal(w.TradeJournalAIJourneyEngine.nextBestStep().id, 'pattern_create');
});

test('Low initiative preference suppresses onboarding/education steps but never the contextual, real-lifecycle ones', async () => {
  const w = await buildSandbox({ tradeStore: { listSync: () => [{ id: 't-open', status: 'open' }] } });
  w.TradeJournalAICompanionProfile.setPreference('initiativePreference', 'low');
  assert.equal(w.TradeJournalAIJourneyEngine.nextBestStep().id, 'open_trade_attention', 'the important lifecycle step must still show at low initiative');
  const w2 = await buildSandbox();
  w2.TradeJournalAICompanionProfile.setPreference('initiativePreference', 'low');
  assert.equal(w2.TradeJournalAIJourneyEngine.nextBestStep(), null, 'a plain onboarding step must not be proactively offered at low initiative');
});

// Item 2 of the Journey G follow-up: Low/Normal/High must be OBSERVABLY different, not three
// settings that all behave like 'normal'. A fixture where every foundational milestone is already
// complete and the only remaining eligible step is pattern_report (tier: 'progression') isolates
// exactly the Normal-vs-High distinction from everything else (currentGoal, cooldown, contextual
// priority) that could otherwise mask it.
function allFoundationalCompleteFixture() {
  return {
    mentalHealthStore: { load: () => ({ intake: { completed: true }, continuousTracking: { postTradeReflections: [{ tradeId: 't1' }] } }) },
    patternStore: {
      listSync: () => [{ id: 'p1', name: 'Sweep', description: 'x', stages: [{}, {}, {}] }],
      scenarioReport: () => ({ hasData: true, scenarios: [1, 2, 3, 4, 5] })
    },
    strategyStore: { listSync: () => [{ id: 's1', positionManagement: { entryRules: 'a', stopLossRules: 'b', exitTargetRules: 'c', positionSizingRules: 'd' }, riskManagement: { maxRiskPerTradePercent: 1, dailyDrawdownLimitPercent: 3, totalDrawdownLimitPercent: 6 }, overallFramework: { description: 'x'.repeat(45) } }] },
    tradeStore: { listSync: () => [{ id: 't1', status: 'closed', entryPrice: 1, stopLoss: 2, takeProfits: [{ price: 3 }], direction: 'long' }] },
    localStorage: memoryStorage({ 'tradejournal:sessions:v1:shared': JSON.stringify([{ id: 'sess1', market: 'London', timeframe: '15m', date: '2026-01-01', status: 'closed', entries: [{ id: 'e1', scenarios: [{ id: 'sc1', executionPlan: { entryPrices: [1], stopLoss: 2, takeProfit: 3 } }] }] }]) })
  };
}

test('Normal initiative never surfaces a purely "progression"-tier step (pattern_report) - it stays quiet once all foundational milestones are complete', async () => {
  const w = await buildSandbox(allFoundationalCompleteFixture());
  w.TradeJournalAICompanionProfile.setPreference('initiativePreference', 'normal');
  assert.equal(w.TradeJournalAIJourneyEngine.nextBestStep(), null);
});

test('High initiative additionally surfaces the same progression-tier step Normal suppresses - the one real, observable Normal-vs-High difference in this gate', async () => {
  const w = await buildSandbox(allFoundationalCompleteFixture());
  w.TradeJournalAICompanionProfile.setPreference('initiativePreference', 'high');
  const step = w.TradeJournalAIJourneyEngine.nextBestStep();
  assert.equal(step && step.id, 'pattern_report');
});

test('Low/Normal/High all still show a real, active-lifecycle contextual step identically - initiative never touches safety-adjacent urgency', async () => {
  for (const initiative of ['low', 'normal', 'high']) {
    const w = await buildSandbox({ tradeStore: { listSync: () => [{ id: 't-open', status: 'open' }] } });
    w.TradeJournalAICompanionProfile.setPreference('initiativePreference', initiative);
    assert.equal(w.TradeJournalAIJourneyEngine.nextBestStep().id, 'open_trade_attention', initiative);
  }
});

test('companionContext() never carries raw Mental Health content - only a phase/step/stance/preference summary', async () => {
  const w = await buildSandbox({
    mentalHealthStore: {
      load: () => ({
        intake: { completed: true, demographics: { age: 41 } },
        redFlags: { active: [{ id: 'flag-1', type: 'borrowed_money', evidence: 'sensitive free text' }] },
        chatHistory: [{ role: 'user', content: 'something private' }]
      })
    }
  });
  const ctx = w.TradeJournalAIJourneyEngine.companionContext();
  const serialized = JSON.stringify(ctx);
  assert.ok(!serialized.includes('sensitive free text'));
  assert.ok(!serialized.includes('something private'));
  assert.ok(!serialized.includes('borrowed_money'));
  assert.ok(!('redFlags' in ctx) && !('chatHistory' in ctx) && !('demographics' in ctx));
  assert.deepEqual(Object.keys(ctx).sort(), ['communicationPreferences', 'completedMilestones', 'nextBestStep', 'phase', 'responseStance'].sort());
});

test('debugLastSnapshot() is sanitized metadata only (phase/stepId/reason), never raw store content', async () => {
  const w = await buildSandbox({ mentalHealthStore: { load: () => ({ intake: { completed: false, demographics: { age: 41 } } }) } });
  w.TradeJournalAIJourneyEngine.evaluate();
  const debug = w.TradeJournalAIJourneyEngine.debugLastSnapshot();
  assert.ok(debug.phase && debug.nextStepId);
  assert.ok(!JSON.stringify(debug).includes('41'));
});

test('evaluating the Journey Engine never calls fetch - zero network/model calls for a plain evaluation', async () => {
  // The sandbox's own fetch rejects immediately if ever called (see buildSandbox) - reaching
  // these assertions at all is the proof that none of these four read paths ever touched it.
  const w = await buildSandbox();
  assert.ok(w.TradeJournalAIJourneyEngine.evaluate());
  w.TradeJournalAIJourneyEngine.nextBestStep();
  w.TradeJournalAIJourneyEngine.explainNextStep();
  assert.ok(w.TradeJournalAIJourneyEngine.companionContext());
});

test('all four character pages load the Journey G scripts after account-profile-store.js and before chat-dock-core.js', async () => {
  for (const character of ['hunter', 'engineer', 'commander', 'sage']) {
    const html = await readFile(path.join(root, 'public', 'pages', character, 'index.html'), 'utf8');
    const accountProfile = html.indexOf('account-profile-store.js');
    const companionProfile = html.indexOf('ai-companion-profile.js');
    const journeySteps = html.indexOf('ai-journey-steps.js');
    const journeyEngine = html.indexOf('ai-journey-engine.js');
    const orchestrator = html.indexOf('ai-companion-orchestrator.js');
    const chatDockCore = html.indexOf('chat-dock-core.js');
    assert.ok(accountProfile > -1 && accountProfile < companionProfile, character + ': companion profile after account-profile-store');
    assert.ok(companionProfile < journeySteps && journeySteps < journeyEngine && journeyEngine < orchestrator, character + ': Journey G script order');
    assert.ok(orchestrator < chatDockCore, character + ': Journey G loads before chat-dock-core.js, which reads TradeJournalAIJourneyEngine');
  }
});

// --- Item 3 of the Journey G follow-up: the real Settings UI surface for currentGoal ---

test('settingsView.jsx\'s CompanionGoalSelect offers exactly the 5 real domains ai-journey-steps.js actually uses, plus a "none" option, and calls the orchestrator (not the store directly) so cooldown resets on change', async () => {
  const settingsSrc = await readFile(path.join(root, 'navrya-src', 'settingsView.jsx'), 'utf8');
  const stepsSrc = await readFile(path.join(root, 'public', 'pages', 'shared', 'ai-journey-steps.js'), 'utf8');
  const realDomains = Array.from(new Set(Array.from(stepsSrc.matchAll(/domain: '([a-z]+)'/g)).map((m) => m[1])));
  assert.deepEqual(realDomains.sort(), ['patterns', 'psychology', 'sessions', 'strategies', 'trades'].sort());
  const optionValues = Array.from(settingsSrc.matchAll(/\{ value: '(patterns|strategies|sessions|trades|psychology)', label: t\('companionGoal\w+'\) \}/g)).map((m) => m[1]);
  assert.deepEqual(optionValues.sort(), realDomains.sort(), 'every offered goal must map to a domain a real step actually uses - never an invented capability');
  assert.match(settingsSrc, /orchestrator\.setCurrentGoal\(domainOrNull\)/);
});

test('every companionGoal* i18n key exists in all four settingsView.jsx language blocks (fa/ar/en/es)', async () => {
  const settingsSrc = await readFile(path.join(root, 'navrya-src', 'settingsView.jsx'), 'utf8');
  const keys = ['companionGoalLabel', 'companionGoalHint', 'companionGoalNone', 'companionGoalPatterns', 'companionGoalStrategies', 'companionGoalSessions', 'companionGoalTrades', 'companionGoalPsychology'];
  keys.forEach((key) => {
    const count = (settingsSrc.match(new RegExp(key + ':', 'g')) || []).length;
    assert.equal(count, 4, key + ' must appear exactly once per language block (fa/ar/en/es)');
  });
});

// ============================================================================
// Item 5 of the Journey G follow-up: milestone completion is never cached - every mutation below
// is applied to the SAME already-running engine instance's underlying fake stores (never a fresh
// sandbox/engine per step), proving ai-journey-engine.js recomputes fresh from real store state on
// every call, live, the same way it would after a real Pattern/Strategy/Trade/Reflection mutation
// in the real app.
// ============================================================================

test('Create the first Pattern -> the Pattern milestone becomes complete live; delete that only Pattern -> it becomes incomplete again, same engine instance throughout', async () => {
  let patterns = [];
  const w = await buildSandbox({
    mentalHealthStore: { load: () => ({ intake: { completed: true } }) }, // removes intake from contention
    patternStore: { listSync: () => patterns, scenarioReport: () => ({ hasData: false, scenarios: [] }) }
  });
  assert.equal(w.TradeJournalAIJourneyEngine.nextBestStep().id, 'pattern_create', 'before: no Pattern yet');
  assert.deepEqual(Array.from(w.TradeJournalAIJourneyEngine.milestones().completed), ['intake']); // intake was pre-completed above, specifically to remove it from priority contention

  patterns = [{ id: 'p1', name: 'Sweep', description: 'A liquidity sweep setup', stages: [{}, {}, {}] }]; // real create
  assert.ok(Array.from(w.TradeJournalAIJourneyEngine.milestones().completed).includes('pattern_create'), 'after creating: the milestone is complete');
  assert.notEqual(w.TradeJournalAIJourneyEngine.nextBestStep().id, 'pattern_create', 'pattern_create is no longer offered');

  patterns = []; // real delete of the only Pattern
  assert.ok(!Array.from(w.TradeJournalAIJourneyEngine.milestones().completed).includes('pattern_create'), 'after deleting: the milestone is incomplete again');
  assert.equal(w.TradeJournalAIJourneyEngine.nextBestStep().id, 'pattern_create', 'pattern_create is offered again, live');
});

test('Create a complete Strategy -> the Strategy milestone becomes complete; remove its risk-management fields -> it becomes incomplete again, live', async () => {
  let strategies = [];
  const completeStrategy = () => ({
    id: 's1',
    positionManagement: { entryRules: 'a', stopLossRules: 'b', exitTargetRules: 'c', positionSizingRules: 'd' },
    riskManagement: { maxRiskPerTradePercent: 1, dailyDrawdownLimitPercent: 3, totalDrawdownLimitPercent: 6 },
    overallFramework: { description: 'x'.repeat(45) }
  });
  const w = await buildSandbox({
    mentalHealthStore: { load: () => ({ intake: { completed: true } }) },
    patternStore: { listSync: () => [{ id: 'p1', name: 'Sweep', description: 'x', stages: [{}, {}, {}] }], scenarioReport: () => ({ hasData: false, scenarios: [] }) },
    strategyStore: { listSync: () => strategies }
  });
  assert.equal(w.TradeJournalAIJourneyEngine.nextBestStep().id, 'strategy_create', 'before: no complete Strategy yet');

  strategies = [completeStrategy()];
  assert.ok(Array.from(w.TradeJournalAIJourneyEngine.milestones().completed).includes('strategy_create'), 'after: complete');
  assert.notEqual(w.TradeJournalAIJourneyEngine.nextBestStep().id, 'strategy_create');

  const stripped = completeStrategy();
  stripped.riskManagement = { maxRiskPerTradePercent: null, dailyDrawdownLimitPercent: null, totalDrawdownLimitPercent: null }; // real edit removing required risk fields
  strategies = [stripped];
  assert.ok(!Array.from(w.TradeJournalAIJourneyEngine.milestones().completed).includes('strategy_create'), 'removing the risk fields makes it incomplete again, live - the real completion rule (all three risk fields present) is re-evaluated, not cached');
  assert.equal(w.TradeJournalAIJourneyEngine.nextBestStep().id, 'strategy_create', 'offered again');
});

test('Open a Trade -> active-Trade priority appears live; close it -> that priority disappears live, same engine instance', async () => {
  let trades = [];
  const w = await buildSandbox({ tradeStore: { listSync: () => trades } });
  assert.notEqual((w.TradeJournalAIJourneyEngine.nextBestStep() || {}).id, 'open_trade_attention', 'before: no open Trade');

  trades = [{ id: 't1', status: 'open' }]; // real open
  assert.equal(w.TradeJournalAIJourneyEngine.nextBestStep().id, 'open_trade_attention', 'after opening: appears live');

  trades = [{ id: 't1', status: 'closed', exitPrice: 100, pnl: 5 }]; // real close (same trade)
  assert.notEqual(w.TradeJournalAIJourneyEngine.nextBestStep().id, 'open_trade_attention', 'after closing: disappears live');
});

test('Completing a Post-Trade Reflection makes its priority disappear live, same engine instance', async () => {
  let reflections = [];
  const w = await buildSandbox({
    tradeStore: { listSync: () => [{ id: 't1', status: 'closed', exitPrice: 100, pnl: 5 }] },
    mentalHealthStore: { load: () => ({ intake: { completed: true }, continuousTracking: { postTradeReflections: reflections } }) }
  });
  assert.equal(w.TradeJournalAIJourneyEngine.nextBestStep().id, 'post_trade_reflection', 'before: due');

  reflections.push({ tradeId: 't1' }); // real reflection completed (mutates the same array the mock closes over)
  assert.notEqual(w.TradeJournalAIJourneyEngine.nextBestStep().id, 'post_trade_reflection', 'after: no longer due, live');
});

// ===============================================================================================
// Journey G UX correction: voiceOpeningContext() - the small, real-fact snapshot
// ai-companion-orchestrator.js's voiceOpening() reads to decide the spoken Voice greeting. Real
// engine, real readers - only the underlying stores/localStorage are faked, same convention as
// every other test in this file.
// ===============================================================================================
test('voiceOpeningContext(): blocked is true exactly when safetyOrWorkflowActive() would be - the identical gate nextBestStep() itself uses', async () => {
  const w1 = await buildSandbox({ workflowEngine: { current: () => ({ workflowId: 'wf-1' }) } });
  assert.equal(w1.TradeJournalAIJourneyEngine.voiceOpeningContext().blocked, true);
  const w2 = await buildSandbox({ proactiveEngine: { pendingConfirmation: () => ({ ruleId: 'x' }) } });
  assert.equal(w2.TradeJournalAIJourneyEngine.voiceOpeningContext().blocked, true);
  const w3 = await buildSandbox();
  assert.equal(w3.TradeJournalAIJourneyEngine.voiceOpeningContext().blocked, false);
});

test('voiceOpeningContext(): reports the real open Trade/due Reflection/open Session ids, never fabricated, and null when none are true', async () => {
  const fresh = await buildSandbox();
  var ctx = fresh.TradeJournalAIJourneyEngine.voiceOpeningContext();
  assert.equal(ctx.openTradeId, null);
  assert.equal(ctx.reflectionDueTradeId, null);
  assert.equal(ctx.openSessionId, null);

  const withTrade = await buildSandbox({ tradeStore: { listSync: () => [{ id: 't-open', status: 'open' }] } });
  assert.equal(withTrade.TradeJournalAIJourneyEngine.voiceOpeningContext().openTradeId, 't-open');

  const withReflectionDue = await buildSandbox({ tradeStore: { listSync: () => [{ id: 't-closed', status: 'closed' }] } });
  assert.equal(withReflectionDue.TradeJournalAIJourneyEngine.voiceOpeningContext().reflectionDueTradeId, 't-closed');

  const withOpenSession = await buildSandbox({
    localStorage: memoryStorage({ 'tradejournal:sessions:v1:shared': JSON.stringify([{ id: 'sess-open', status: 'open' }, { id: 'sess-closed', status: 'closed' }]) })
  });
  assert.equal(withOpenSession.TradeJournalAIJourneyEngine.voiceOpeningContext().openSessionId, 'sess-open');
});

test('voiceOpeningContext(): hasSeenWalkthrough reflects the real Companion Profile document, not a guess', async () => {
  const notSeen = await buildSandbox();
  assert.equal(notSeen.TradeJournalAIJourneyEngine.voiceOpeningContext().hasSeenWalkthrough, false);
  notSeen.TradeJournalAICompanionProfile.setWalkthroughSeen();
  assert.equal(notSeen.TradeJournalAIJourneyEngine.voiceOpeningContext().hasSeenWalkthrough, true);
});

test('voiceOpeningContext() never calls fetch - zero model/network calls, same guarantee as every other engine read', async () => {
  const w = await buildSandbox({ tradeStore: { listSync: () => [{ id: 't1', status: 'open' }] } });
  assert.ok(w.TradeJournalAIJourneyEngine.voiceOpeningContext()); // the sandbox's own fetch throws if this ever touches the network
});
