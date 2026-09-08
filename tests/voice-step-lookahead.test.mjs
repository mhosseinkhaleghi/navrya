import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Voice step-lookahead (previously deferred forward-looking step synchronization): the model's
// own reply text and its structured field extraction are decided together in ONE network call,
// but only a field actually extracted THIS turn ever drives ai-process-registry.js's own reactive
// goToStep() (through applyValue()). A reply that ASKS about a not-yet-answered field previously
// left the real multi-step form exactly where it already was - one whole turn behind the
// conversation, so a user watching the screen while listening/reading would hear a question about
// a field their screen had not moved to yet. payload.nextFieldPath (server/pattern-ai-server.mjs)
// plus ai-process-registry.js's own prepareForPath() close this gap: chat-dock-core.js now awaits
// prepareForPath() BEFORE returning this turn's reply, so the real form has already moved (or has
// honestly given up trying) by the time chatDockView.jsx ever shows/speaks the question.
//
// Same real-module VM sandbox convention as tests/workflow-finish-intent.test.mjs - only fetch/DOM
// faked, chat-dock-core.js and its real dependencies (including ai-process-registry.js and
// ai-ui-revision-guard.js) run unmodified.

const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = (file) => readFile(shared(file), 'utf8');

async function coreSandbox(options = {}) {
  const document = { documentElement: { lang: options.lang || 'en' } };
  const fetchCalls = [];
  const respond = options.respond || (() => (options.response || { reply: 'ok', suggestions: [], provider: 'openai', model: 'gpt-test', usage: { totalTokens: 8 }, action: { id: null } }));
  const fetchFn = async (url, opts) => {
    fetchCalls.push([url, opts ? JSON.parse(opts.body) : null]);
    return { ok: true, json: async () => respond(fetchCalls.length) };
  };
  const sandbox = {
    window: {}, document, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    fetch: fetchFn,
    Set, Math, JSON, console, Date, Promise, setTimeout, clearTimeout,
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } }
  };
  sandbox.window = Object.assign(sandbox.window, {
    document, localStorage: sandbox.localStorage, fetch: sandbox.fetch,
    TradeJournalAIUsage: { record() {} },
    TradeJournalAiChatHistoryStore: null,
    TradeJournalNavryaStore: null,
    TradeJournalNavryaLiveSession: null,
    TradeJournalTradeStore: null,
    TradeJournalStrategyEducationStore: null,
    TradeJournalMentalHealthStore: null,
    TradeJournalMentalHealthSafety: null,
    TradeJournalAIUserMemory: null
  });
  const files = ['ai-i18n.js', 'ai-settings-store.js', 'ai-process-registry.js', 'ai-ui-revision-guard.js', 'ai-deterministic-extraction.js', 'ai-context-engine.js', 'ai-action-registry.js', 'ai-workflow-engine.js'];
  for (const file of files) vm.runInNewContext(await source(file), sandbox, { filename: file });
  vm.runInNewContext(await source('chat-dock-core.js'), sandbox, { filename: 'chat-dock-core.js' });
  return { window: sandbox.window, fetchCalls };
}

// Mirrors trade.wizard's own real shape - two required fields (open on step 1), one real
// step-2 field (primaryTimeframe) declared via stepForPath/goToStep, exactly like the real
// registration in navrya-src/tradeLogModal.jsx.
function registerWizardAction(window, goToStepCalls) {
  let opened = false;
  let step = 1;
  window.TradeJournalAIActionRegistry.registerAction({
    id: 'demo.wizard.create', domain: 'demo', riskLevel: 'medium',
    requiredFields: ['direction', 'instrument'], optionalFields: ['primaryTimeframe'],
    available: () => true,
    open: () => { opened = true; return { processId: 'demo-wizard' }; },
    submit: async () => ({ id: 'demo-1' }), resultContext: () => {}
  });
  window.TradeJournalAIProcessRegistry.register('demo-wizard', {
    allowlist: ['direction', 'instrument', 'primaryTimeframe'], layer: 'foreground', isOpen: () => opened,
    activeStep: () => step,
    stepForPath: (path) => (path === 'primaryTimeframe' ? 2 : path === 'direction' || path === 'instrument' ? 1 : null),
    goToStep: (n) => { goToStepCalls.push(n); step = n; }
  });
}

const respondAskingAboutTimeframe = () => ({
  reply: 'Got it - direction long, XAUUSD. What timeframe did you trade?',
  action: { id: 'demo.wizard.create', fields: [{ path: 'direction', value: 'long' }, { path: 'instrument', value: 'XAUUSD' }] },
  nextFieldPath: 'primaryTimeframe',
  provider: 'openai', usage: { totalTokens: 5 }
});
const respondWithNoNextField = () => ({
  reply: 'Got it - direction long, XAUUSD.',
  action: { id: 'demo.wizard.create', fields: [{ path: 'direction', value: 'long' }, { path: 'instrument', value: 'XAUUSD' }] },
  nextFieldPath: null,
  provider: 'openai', usage: { totalTokens: 5 }
});

test('a reply that asks about a specific, not-yet-answered field moves the real form to that field\'s step BEFORE sendChat() resolves - the reply is never returned ahead of the screen it describes', async () => {
  const goToStepCalls = [];
  const { window } = await coreSandbox({ respond: respondAskingAboutTimeframe });
  registerWizardAction(window, goToStepCalls);
  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'Log a trade, long XAUUSD.', therapistMode: false, transcript: [] });
  // By the time sendChat() has already returned, the real form must already be showing step 2 -
  // never left on step 1 while the reply is already asking about a step-2 field.
  assert.deepEqual(goToStepCalls, [2]);
  assert.equal(window.TradeJournalAIProcessRegistry.query('demo-wizard').step, 2);
  assert.equal(result.reply, 'Got it - direction long, XAUUSD. What timeframe did you trade?');
});

test('nextFieldPath: null never moves the step - a reply that is not asking about one specific field leaves the form exactly where it is', async () => {
  const goToStepCalls = [];
  const { window } = await coreSandbox({ respond: respondWithNoNextField });
  registerWizardAction(window, goToStepCalls);
  await window.TradeJournalChatDockCore.sendChat({ text: 'Log a trade, long XAUUSD.', therapistMode: false, transcript: [] });
  assert.deepEqual(goToStepCalls, []);
  assert.equal(window.TradeJournalAIProcessRegistry.query('demo-wizard').step, 1);
});

test('nextFieldPath pointing at a field belonging to the step already showing is a harmless no-op - goToStep is never called for a step that is already current', async () => {
  const goToStepCalls = [];
  const respondAskingAboutDirection = () => ({
    reply: 'Which direction - long or short?', action: { id: 'demo.wizard.create', fields: [] },
    nextFieldPath: 'direction', provider: 'openai', usage: { totalTokens: 5 }
  });
  const { window } = await coreSandbox({ respond: respondAskingAboutDirection });
  registerWizardAction(window, goToStepCalls);
  await window.TradeJournalChatDockCore.sendChat({ text: 'Log a trade.', therapistMode: false, transcript: [] });
  assert.deepEqual(goToStepCalls, [], 'direction already belongs to step 1, which is already showing - nothing to move');
});

test('a nextFieldPath the target registration has no step opinion about (stepForPath returns null) is a harmless no-op', async () => {
  const goToStepCalls = [];
  const respondAskingAboutAccount = () => ({
    reply: 'Which account is this for?', action: { id: 'demo.wizard.create', fields: [{ path: 'direction', value: 'long' }, { path: 'instrument', value: 'XAUUSD' }] },
    nextFieldPath: 'accountId', provider: 'openai', usage: { totalTokens: 5 }
  });
  const { window } = await coreSandbox({ respond: respondAskingAboutAccount });
  registerWizardAction(window, goToStepCalls);
  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'Log a trade, long XAUUSD.', therapistMode: false, transcript: [] });
  assert.deepEqual(goToStepCalls, [], 'accountId lives in the persistent header, not one specific step - stepForPath correctly has no opinion');
  assert.equal(result.reply, 'Which account is this for?');
});

test('a real failure inside prepareForPath (a broken goToStep that throws) never breaks the actual reply - best-effort, the question is still asked even without the guaranteed visual lead time', async () => {
  const { window } = await coreSandbox({ respond: respondAskingAboutTimeframe });
  let opened = false;
  const step = 1;
  window.TradeJournalAIActionRegistry.registerAction({
    id: 'demo.wizard.create', domain: 'demo', riskLevel: 'medium',
    requiredFields: ['direction', 'instrument'], optionalFields: ['primaryTimeframe'],
    available: () => true, open: () => { opened = true; return { processId: 'demo-wizard' }; },
    submit: async () => ({ id: 'demo-1' }), resultContext: () => {}
  });
  window.TradeJournalAIProcessRegistry.register('demo-wizard', {
    allowlist: ['direction', 'instrument', 'primaryTimeframe'], layer: 'foreground', isOpen: () => opened,
    activeStep: () => step,
    stepForPath: (path) => (path === 'primaryTimeframe' ? 2 : 1),
    goToStep: () => { throw new Error('a real bug in this form\'s own goToStep()'); }
  });
  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'Log a trade, long XAUUSD.', therapistMode: false, transcript: [] });
  assert.equal(result.reply, 'Got it - direction long, XAUUSD. What timeframe did you trade?', 'the reply must still be delivered even though the step-lookahead itself failed');
});

test('a reply for a plain, non-multi-step action (no stepForPath/goToStep declared at all) is completely unaffected, even if nextFieldPath is somehow set', async () => {
  const submitCalls = [];
  let opened = false;
  const { window, fetchCalls } = await coreSandbox({
    respond: () => ({ reply: 'Starting the demo thing - what name?', action: { id: 'demo.thing.create', fields: [] }, nextFieldPath: 'name', provider: 'openai', usage: { totalTokens: 5 } })
  });
  window.TradeJournalAIActionRegistry.registerAction({
    id: 'demo.thing.create', domain: 'demo', riskLevel: 'low', requiredFields: ['name'], optionalFields: [],
    available: () => true, open: () => { opened = true; return { processId: 'demo-thing' }; },
    submit: async (known) => { submitCalls.push(known); return { id: 'thing-1' }; }, resultContext: () => {}
  });
  window.TradeJournalAIProcessRegistry.register('demo-thing', { allowlist: ['name'], isOpen: () => opened });
  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'Create a demo thing.', therapistMode: false, transcript: [] });
  assert.equal(fetchCalls.length, 1);
  assert.equal(result.reply, 'Starting the demo thing - what name?');
});
