import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Market Engineer Character Interaction Policy: end-to-end integration through the REAL
// ai-i18n.js / character-interaction-policy.js / chat-dock-core.js / ai-proactive-engine.js.
// Mirrors tests/hunter-character-client-integration.test.mjs and
// tests/commander-character-client-integration.test.mjs's conventions; the risk-conflict scenario
// is the one tests/ai-proactive-workflow.test.mjs already drives (Scenario A), run once per
// character so any change to a Risk DECISION would show up as a difference between characters.
const root = process.cwd();
const source = (file) => readFile(path.join(root, 'public', 'pages', 'shared', file), 'utf8');

const ADDRESS_TERMS = ['رفیق', 'قربان', 'سيدي', 'Señor', 'compa', ' sir', 'Sir,', 'Sir.'];

// ---------------------------------------------------------------------------------------------
// Voice opening (real ai-i18n.js, generalized <key>_<character> lookup)
// ---------------------------------------------------------------------------------------------

async function loadOrchestrator({ character, language, voiceOpeningContext, withPolicy = true }) {
  const document = { documentElement: { lang: language } };
  const sandbox = {
    window: {}, document, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    Date
  };
  sandbox.window = Object.assign(sandbox.window, {
    document, localStorage: sandbox.localStorage, addEventListener() {}, dispatchEvent() {},
    TradeJournalPanelLayer: character ? { character } : undefined,
    TradeJournalAIJourneyEngine: { nextBestStep: () => null, dedupeKeyFor: (id) => 'journey:' + id, executeStep: () => {}, voiceOpeningContext: () => voiceOpeningContext },
    TradeJournalAICompanionProfile: { hasSeenWalkthrough: () => true, initiativePreference: () => 'normal', setWalkthroughSeen() {}, dismissStep() {}, skipOptionalStep() {}, setCurrentGoal() {} }
  });
  const files = withPolicy ? ['ai-i18n.js', 'character-interaction-policy.js'] : ['ai-i18n.js'];
  for (const file of files) vm.runInNewContext(await source(file), sandbox, { filename: file });
  vm.runInNewContext(await source('ai-companion-orchestrator.js'), sandbox, { filename: 'ai-companion-orchestrator.js' });
  return { orchestrator: sandbox.window.TradeJournalAICompanionOrchestrator, i18n: sandbox.window.TradeJournalAII18n };
}

const CONTEXTS = {
  activeSession: { blocked: false, openTradeId: null, reflectionDueTradeId: null, openSessionId: 's1', hasSeenWalkthrough: true },
  activeTrade: { blocked: false, openTradeId: 't1', reflectionDueTradeId: null, openSessionId: null, hasSeenWalkthrough: true },
  dueReflection: { blocked: false, openTradeId: null, reflectionDueTradeId: 't2', openSessionId: null, hasSeenWalkthrough: true },
  freshWelcome: { blocked: false, openTradeId: null, reflectionDueTradeId: null, openSessionId: null, hasSeenWalkthrough: false },
  returningNeutral: { blocked: false, openTradeId: null, reflectionDueTradeId: null, openSessionId: null, hasSeenWalkthrough: true }
};

test('Voice start: Engineer gets its own real Persian opening for every deterministic opening kind, with NO address term', async () => {
  const expected = {
    activeSession: 'اوکی، Session هنوز بازه. ببینیم کدوم متغیر بعدی مهمه؟',
    activeTrade: 'یه Position هنوز بازه. اول وضعیتش رو چک کنیم؟',
    dueReflection: 'یه Reflection عقب‌افتاده داریم. قبل از Setup بعدی، دیتا رو کامل کنیم؟',
    freshWelcome: 'خوش اومدی. بیا سیستم رو از پایه تنظیم کنیم.',
    returningNeutral: 'خب، امروز چی رو می‌خوای بسازیم یا بررسی کنیم؟'
  };
  for (const [kind, context] of Object.entries(CONTEXTS)) {
    const { orchestrator } = await loadOrchestrator({ character: 'engineer', language: 'fa', voiceOpeningContext: context });
    const opening = orchestrator.voiceOpening();
    assert.equal(opening.kind, kind);
    assert.equal(opening.text, expected[kind], kind);
    for (const term of ADDRESS_TERMS) assert.ok(!opening.text.includes(term), `${kind}: "${opening.text}" must not contain "${term}"`);
  }
});

test('contextual opening priority is unchanged: the same deterministic kind fires for every character - only the copy differs', async () => {
  for (const [kind, context] of Object.entries(CONTEXTS)) {
    const kinds = [];
    for (const character of ['hunter', 'commander', 'engineer', 'sage']) {
      const { orchestrator } = await loadOrchestrator({ character, language: 'fa', voiceOpeningContext: context });
      kinds.push(orchestrator.voiceOpening().kind);
    }
    assert.deepEqual(kinds, [kind, kind, kind, kind]);
  }
});

test('Persian quality: Engineer openings are short spoken lines - no bureaucratic Persian, no military/hunting vocabulary, no feelings-as-bugs framing', async () => {
  for (const [kind, context] of Object.entries(CONTEXTS)) {
    const { orchestrator } = await loadOrchestrator({ character: 'engineer', language: 'fa', voiceOpeningContext: context });
    const text = orchestrator.voiceOpening().text;
    assert.ok(text.length <= 75, `${kind} stays a short spoken line`);
    for (const word of ['لطفاً', 'نمایید', 'می‌گردد', 'دشمن', 'حمله', 'شکار', 'ردپا', 'ماموریت', 'احساس']) assert.ok(!text.includes(word), `${kind}: "${text}" must not contain "${word}"`);
  }
});

test('all four languages carry a complete Engineer opening set (5 kinds), with no Hunter/Commander address term in any of them', async () => {
  const baseKeys = ['voiceOpeningFreshWelcome', 'voiceOpeningReturningNeutral', 'voiceOpeningActiveSession', 'voiceOpeningActiveTrade', 'voiceOpeningDueReflection'];
  for (const language of ['fa', 'en', 'ar', 'es']) {
    const { i18n } = await loadOrchestrator({ character: 'engineer', language, voiceOpeningContext: CONTEXTS.activeSession });
    for (const character of ['hunter', 'commander', 'engineer']) {
      for (const base of baseKeys) {
        assert.equal(typeof i18n.messages[language][`${base}_${character}`], 'string', `${language}/${base}_${character}`);
      }
    }
    for (const base of baseKeys) {
      const text = i18n.messages[language][`${base}_engineer`];
      for (const term of ADDRESS_TERMS) assert.ok(!text.includes(term), `${language}/${base}_engineer "${text}" must not contain "${term}"`);
    }
  }
});

test('Hunter, Commander and Sage openings are unchanged by the Engineer gate', async () => {
  const expected = {
    hunter: 'خب رفیق، سشن هنوز بازه. ادامه‌ش بدیم؟',
    commander: 'قربان، سشن هنوز بازه. ادامه‌ش بدیم؟',
    sage: 'سلام. سشن بازت هنوز فعاله. می‌خوای از همون‌جا ادامه بدیم؟'
  };
  for (const [character, text] of Object.entries(expected)) {
    const { orchestrator } = await loadOrchestrator({ character, language: 'fa', voiceOpeningContext: CONTEXTS.activeSession });
    assert.equal(orchestrator.voiceOpening().text, text, character);
  }
});

test('Engineer opening still resolves when character-interaction-policy.js is not loaded (inline fallback), and Sage never picks up an engineer key', async () => {
  const noPolicy = await loadOrchestrator({ character: 'engineer', language: 'en', voiceOpeningContext: CONTEXTS.activeTrade, withPolicy: false });
  assert.equal(noPolicy.orchestrator.voiceOpening().text, 'A position is still open. Check its status first?');
  const sage = await loadOrchestrator({ character: 'sage', language: 'en', voiceOpeningContext: CONTEXTS.activeTrade, withPolicy: false });
  assert.equal(sage.orchestrator.voiceOpening().text, 'Hi. You have an open trade. Want to review it first?');
});

// ---------------------------------------------------------------------------------------------
// Risk warning / override (real chat-dock-core.js + real proactive engine)
// ---------------------------------------------------------------------------------------------

const CONSERVATIVE_STRATEGY = { id: 's1', name: 'Conservative Scalper', riskManagement: { maxRiskPerTradePercent: 1, maxConcurrentTrades: 2 } };

async function coreSandbox({ character, language, fetch, withPolicy = true }) {
  const document = { documentElement: { lang: language } };
  const sandbox = {
    window: {}, document, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, fetch,
    Set, Math, JSON, console, Date, Promise, setTimeout, clearTimeout,
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } }
  };
  const strategy = CONSERVATIVE_STRATEGY;
  sandbox.window = Object.assign(sandbox.window, {
    document, localStorage: sandbox.localStorage, fetch,
    TradeJournalPanelLayer: { character },
    TradeJournalAIUsage: { record() {} },
    TradeJournalTradeStore: { listSync: () => [] },
    TradeJournalStrategyEducationStore: { find: (id) => (id === strategy.id ? strategy : null), listActive: () => [strategy] }
  });
  const files = ['ai-i18n.js', 'ai-settings-store.js', 'ai-process-registry.js', 'ai-trade-actions.js', 'ai-proactive-engine.js', 'ai-signal-router.js', 'ai-deterministic-extraction.js', 'ai-context-engine.js', 'ai-action-registry.js', 'ai-workflow-engine.js'];
  if (withPolicy) files.splice(1, 0, 'character-interaction-policy.js');
  for (const file of files) vm.runInNewContext(await source(file), sandbox, { filename: file });
  vm.runInNewContext(await source('chat-dock-core.js'), sandbox, { filename: 'chat-dock-core.js' });
  sandbox.window.TradeJournalAIWorkflowEngine.setSubmitGraceMs(20);
  return sandbox.window;
}

// Mirrors tests/ai-proactive-workflow.test.mjs's own registerFakeTradeCalculator() (the real client
// wiring: tradeCalculatorModal.jsx's registration + character-app.jsx's trade.calculator action).
function registerFakeTradeCalculator(window, spies) {
  let processOpen = false;
  const state = {};
  window.TradeJournalAIProcessRegistry.register('trade-calculator', {
    allowlist: ['direction', 'entryPrice', 'stopLoss', 'riskPercent', 'leverage', 'marginMode', 'takeProfits', 'linkedStrategyId', 'linkedPatternIds', 'sourceSessionId', 'sourceScenarioId', 'pendingEmotionSignal', 'riskOverride'],
    isOpen: () => processOpen,
    applyValue: (p, v) => { spies.applied.push([p, v]); state[p] = v; },
    submit: () => ({ id: 'trade-1' })
  });
  window.TradeJournalAIActionRegistry.registerAction({
    id: 'trade.calculator', domain: 'trades',
    requiredFields: ['direction', 'entryPrice', 'stopLoss', 'riskPercent', 'takeProfits'],
    optionalFields: ['leverage', 'marginMode', 'linkedStrategyId', 'linkedPatternIds'],
    available: () => true,
    open: () => { processOpen = true; },
    normalizeField: (p, v) => window.TradeJournalAITradeActions.normalizeField(p, v, { strategies: [CONSERVATIVE_STRATEGY] }),
    submit: () => window.TradeJournalAIProcessRegistry.submit('trade-calculator'),
    resultContext: () => {}
  });
}

function scriptedFetch(responses) {
  let i = 0;
  const calls = { count: 0 };
  const fn = async () => {
    calls.count += 1;
    const r = responses[i]; i += 1;
    if (!r) throw new Error('scriptedFetch exhausted');
    return { ok: true, json: async () => Object.assign({ reply: r.reply || '...', provider: 'openai', model: 'test', usage: { totalTokens: 1 } }, r) };
  };
  fn.calls = calls;
  return fn;
}

const OPENING = { action: { id: 'trade.calculator', fields: [
  { path: 'direction', value: 'long' }, { path: 'entryPrice', value: '66000' }, { path: 'stopLoss', value: '65000' },
  { path: 'takeProfits', value: '70000' }, { path: 'riskPercent', value: '1' }, { path: 'linkedStrategyId', value: 'Conservative Scalper' }
] } };
const RAISE_RISK = { suggestions: [{ path: 'riskPercent', value: '4', mode: 'replace' }] };

async function riskConflict({ character, language = 'en', withPolicy = true }) {
  const spies = { applied: [] };
  const fetch = scriptedFetch([OPENING, RAISE_RISK]);
  const window = await coreSandbox({ character, language, fetch, withPolicy });
  registerFakeTradeCalculator(window, spies);
  await window.TradeJournalChatDockCore.sendChat({ text: 'Take BTC long, entry 66000, stop 65000, target 70000, risk 1%, strategy Conservative Scalper.', therapistMode: false, transcript: [] });
  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'Actually increase risk to 4%.', therapistMode: false, transcript: [] });
  const applied = spies.applied.filter((e) => e[0] === 'riskPercent').pop();
  const pending = window.TradeJournalAIProactiveEngine.pendingConfirmation();
  // JSON round-trip: objects built inside a vm context carry that context's own prototypes, which
  // deepStrictEqual (rightly) treats as different from another context's - same convention as
  // tests/ai-proactive-workflow.test.mjs's clone().
  const clone = (value) => JSON.parse(JSON.stringify(value));
  return {
    result, appliedRisk: applied && applied[1], modelCalls: fetch.calls.count,
    pending: pending && clone({ ruleId: pending.ruleId, field: pending.field, proposedValue: pending.proposedValue, safeValue: pending.safeValue, strategyLimit: pending.strategyLimit }),
    findings: clone(result.proactive.map((f) => ({ id: f.id, severity: f.severity, message: f.message, evidence: f.evidence })))
  };
}

test('Risk warning: Engineer frames the conflict as FACT -> CONSTRAINT -> DIFFERENCE -> OPTIONS, with the engine\'s own message text untouched in the middle', async () => {
  const { result, findings } = await riskConflict({ character: 'engineer', language: 'en' });
  assert.equal(result.kind, 'proactive-warning');
  const message = findings.find((f) => f.id === 'strategy-risk-limit').message;
  const reply = result.reply;
  const opener = reply.indexOf('We have a mismatch.');
  const fact = reply.indexOf(message);
  const difference = reply.indexOf('That is 3 points above the limit.');
  const question = reply.indexOf('Fix it, or knowingly confirm the exception?');
  assert.ok(opener === 0, 'opener first');
  assert.ok(fact > opener && difference > fact && question > difference, `order opener < fact < difference < options, got: ${reply}`);
  assert.match(message, /1%/);
  assert.match(message, /4%/);
  assert.ok(reply.endsWith('Fix it, or knowingly confirm the exception?'));
});

test('Risk warning in Persian: spoken "mismatch" opener, the real numbers, a real difference, and an options question - no "رفیق"/"قربان"', async () => {
  const { result } = await riskConflict({ character: 'engineer', language: 'fa' });
  assert.ok(result.reply.startsWith('یه mismatch داریم.'));
  assert.match(result.reply, /یعنی 3 واحد درصد بالاتر از محدوده\./);
  assert.ok(result.reply.endsWith('اصلاح کنیم یا استثنا رو آگاهانه تأیید می‌کنی؟'));
  for (const term of ADDRESS_TERMS) assert.ok(!result.reply.includes(term), `reply must not contain "${term}": ${result.reply}`);
});

test('Risk override: every character reaches the identical Risk DECISION - same blocked value, same finding, same staged confirmation, one model call per turn - only the wording differs', async () => {
  const runs = {};
  for (const character of ['hunter', 'commander', 'engineer', 'sage']) runs[character] = await riskConflict({ character, language: 'en' });
  const reference = runs.sage;
  assert.equal(reference.appliedRisk, 1, 'the conflicting 4% is never applied for anyone');
  for (const character of ['hunter', 'commander', 'engineer']) {
    const run = runs[character];
    assert.equal(run.appliedRisk, reference.appliedRisk, character);
    assert.deepEqual(run.findings, reference.findings, `${character}: same deterministic findings`);
    assert.deepEqual(run.pending, reference.pending, `${character}: same staged override confirmation`);
    assert.equal(run.result.kind, reference.result.kind, character);
    assert.equal(run.modelCalls, reference.modelCalls, `${character}: no extra model call`);
    assert.notEqual(run.result.reply, reference.result.reply, `${character}: wording differs`);
  }
  assert.equal(reference.pending.field, 'riskPercent');
  assert.equal(reference.pending.proposedValue, 4);
  assert.equal(reference.pending.safeValue, 1);
});

test('Hunter and Commander risk framing is unchanged by the Engineer gate and gets no difference line; Sage keeps the original generic sentence', async () => {
  const hunter = (await riskConflict({ character: 'hunter' })).result.reply;
  assert.ok(hunter.startsWith('Hold on a sec.'));
  assert.ok(hunter.endsWith('Want to stick with the plan, or knowingly push past it?'));
  const commander = (await riskConflict({ character: 'commander' })).result.reply;
  assert.ok(commander.startsWith('Hold on, sir.'));
  assert.ok(commander.endsWith('Two options: fall back to the cap, or knowingly confirm this exception.'));
  for (const reply of [hunter, commander]) assert.doesNotMatch(reply, /That is \d/);
  const sage = (await riskConflict({ character: 'sage' })).result.reply;
  assert.ok(sage.endsWith('Do you want to keep the current value, or deliberately override it?'));
  assert.doesNotMatch(sage, /mismatch|Hold on|That is \d/);
});

test('without character-interaction-policy.js loaded, Engineer degrades to the original generic risk reply - it never inherits Hunter or Commander wording', async () => {
  const { result } = await riskConflict({ character: 'engineer', language: 'en', withPolicy: false });
  assert.doesNotMatch(result.reply, /Hold on|mismatch|That is \d|رفیق|قربان/);
  assert.ok(result.reply.endsWith('Do you want to keep the current value, or deliberately override it?'));
});
