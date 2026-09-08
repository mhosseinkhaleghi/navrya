import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// "Finish NAVRYA Voice Mode" brief, section 7.1/7.2: an explicitSubmitOnly action (trade.wizard,
// trade.emotion.log, and any future action with the same shape) never auto-submits merely because
// nothing required is currently missing - ai-workflow-engine.js's own finishExplicitly()/
// interpretFinishText() (pure classifier + explicit-completion operation) plus chat-dock-core.js's
// own deterministic, zero-network fast path that calls them. Same real-module VM sandbox
// convention as tests/workflow-cancel-intent.test.mjs - only fetch/DOM faked, chat-dock-core.js
// and its real dependencies run unmodified.

const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = (file) => readFile(shared(file), 'utf8');
// Objects built inside the vm sandbox (submitCalls/resultContextCalls entries) carry that realm's
// own Object.prototype, so assert.deepEqual reports "same structure but not reference-equal" even
// when every field matches - see tests/ai-workflow-engine.test.mjs's own identical comment.
const clone = (value) => JSON.parse(JSON.stringify(value));

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
  const files = ['ai-i18n.js', 'ai-settings-store.js', 'ai-process-registry.js', 'ai-deterministic-extraction.js', 'ai-context-engine.js', 'ai-action-registry.js', 'ai-workflow-engine.js'];
  for (const file of files) vm.runInNewContext(await source(file), sandbox, { filename: file });
  vm.runInNewContext(await source('chat-dock-core.js'), sandbox, { filename: 'chat-dock-core.js' });
  return { window: sandbox.window, fetchCalls };
}

// Mirrors trade.wizard's own real shape: two required fields (enough to "open"), one real
// optional field a human filling the same form would still be offered, explicitSubmitOnly so
// completion never happens just because the required set is satisfied.
function registerExplicitSubmitAction(window, submitCalls, resultContextCalls) {
  let opened = false;
  window.TradeJournalAIActionRegistry.registerAction({
    id: 'demo.wizard.create', domain: 'demo', riskLevel: 'medium',
    requiredFields: ['direction', 'instrument'], optionalFields: ['primaryTimeframe'], explicitSubmitOnly: true,
    available: () => true,
    open: () => { opened = true; return { processId: 'demo-wizard' }; },
    submit: async (known) => { submitCalls.push(known); return { id: 'demo-1' }; },
    resultContext: (result) => resultContextCalls.push(result)
  });
  window.TradeJournalAIProcessRegistry.register('demo-wizard', { allowlist: ['direction', 'instrument', 'primaryTimeframe'], isOpen: () => opened });
}

// An ordinary auto-submitting action (no explicitSubmitOnly) - proves the new finish fast path
// never fires for it (session.create's own normal shape).
function registerPlainAction(window, submitCalls) {
  let opened = false;
  window.TradeJournalAIActionRegistry.registerAction({
    id: 'demo.thing.create', domain: 'demo', riskLevel: 'low',
    requiredFields: ['name'], optionalFields: [],
    available: () => true,
    open: () => { opened = true; return { processId: 'demo-thing' }; },
    submit: async (known) => { submitCalls.push(known); return { id: 'thing-1' }; },
    resultContext: () => {}
  });
  window.TradeJournalAIProcessRegistry.register('demo-thing', { allowlist: ['name'], isOpen: () => opened });
}

const respondWizardBothRequired = () => ({ reply: 'Got it - direction long, XAUUSD. Anything else before I save it?', action: { id: 'demo.wizard.create', fields: [{ path: 'direction', value: 'long' }, { path: 'instrument', value: 'XAUUSD' }] }, provider: 'openai', usage: { totalTokens: 5 } });
const respondWizardOnlyDirection = () => ({ reply: 'What instrument?', action: { id: 'demo.wizard.create', fields: [{ path: 'direction', value: 'long' }] }, provider: 'openai', usage: { totalTokens: 5 } });
const respondPlainThingCreate = () => ({ reply: 'Starting the demo thing - what name?', action: { id: 'demo.thing.create', fields: [] }, provider: 'openai', usage: { totalTokens: 5 } });

test('ai-workflow-engine.js exposes finishExplicitly() and a pure interpretFinishText() classifier', async () => {
  const src = await source('ai-workflow-engine.js');
  assert.match(src, /function finishExplicitly\(context\) \{/);
  assert.match(src, /function interpretFinishText\(text\) \{/);
  assert.match(src, /finishExplicitly: finishExplicitly,/);
  assert.match(src, /interpretFinishText: interpretFinishText,/);
});

test('"save it" completes an explicitSubmitOnly workflow once nothing is genuinely missing: zero further network calls, real submit() called, workflow cleared, and a plain "saving it" reply - never left waiting on a grace window or the model', async () => {
  const submitCalls = [];
  const resultContextCalls = [];
  const { window, fetchCalls } = await coreSandbox({ respond: respondWizardBothRequired });
  registerExplicitSubmitAction(window, submitCalls, resultContextCalls);
  await window.TradeJournalChatDockCore.sendChat({ text: 'Log a trade, long XAUUSD.', therapistMode: false, transcript: [] });
  assert.ok(window.TradeJournalAIWorkflowEngine.current(), 'the workflow must be in flight, still collecting (never auto-submitted) with both required fields already known');
  assert.equal(window.TradeJournalAIWorkflowEngine.current().status, 'collecting', 'required fields alone must never have armed a grace-window submit for an explicitSubmitOnly action');

  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'Save it.', therapistMode: false, transcript: [] });
  assert.equal(fetchCalls.length, 1, 'only the first (start) turn should have hit the network - the explicit finish itself must be zero-network');
  assert.equal(result.reply, 'Okay, saving it now.');
  await new Promise((resolve) => setTimeout(resolve, 10)); // finishExplicitly() itself is fire-and-forget from chat-dock-core.js's own perspective
  assert.deepEqual(clone(submitCalls), [{ direction: 'long', instrument: 'XAUUSD' }]);
  assert.deepEqual(clone(resultContextCalls), [{ id: 'demo-1' }]);
  assert.equal(window.TradeJournalAIWorkflowEngine.current(), null, 'the workflow must actually be cleared once the real submit succeeds');
});

test('"save it" said before a genuinely required field is known falls straight through to ordinary handling - never force-submits an incomplete record', async () => {
  const submitCalls = [];
  const resultContextCalls = [];
  const { window, fetchCalls } = await coreSandbox({ respond: respondWizardOnlyDirection });
  registerExplicitSubmitAction(window, submitCalls, resultContextCalls);
  await window.TradeJournalChatDockCore.sendChat({ text: 'Log a trade, long.', therapistMode: false, transcript: [] });
  assert.ok(window.TradeJournalAIWorkflowEngine.current());
  assert.deepEqual(window.TradeJournalAIWorkflowEngine.current().missing, ['instrument']);

  await window.TradeJournalChatDockCore.sendChat({ text: 'Save it.', therapistMode: false, transcript: [] });
  assert.equal(fetchCalls.length, 2, 'with a genuinely required field still missing, "Save it." must reach the ordinary network turn like any other message, not the finish fast path');
  assert.equal(submitCalls.length, 0);
  assert.ok(window.TradeJournalAIWorkflowEngine.current(), 'the workflow must still be alive, still asking for the missing field');
});

test('"save it" is a complete no-op for this fast path on an ordinary auto-submitting action (no explicitSubmitOnly) - falls through to the model exactly as before this feature', async () => {
  const submitCalls = [];
  const { window, fetchCalls } = await coreSandbox({ respond: respondPlainThingCreate });
  registerPlainAction(window, submitCalls);
  await window.TradeJournalChatDockCore.sendChat({ text: 'Create a demo thing.', therapistMode: false, transcript: [] });
  await window.TradeJournalChatDockCore.sendChat({ text: 'Save it.', therapistMode: false, transcript: [] });
  assert.equal(fetchCalls.length, 2, '"Save it." is not itself a recognized field/command for this ordinary action, so it must reach the network exactly like any other message');
});

test('"save it" with NO workflow currently in flight is a complete no-op for this fast path - falls straight through to the ordinary AI turn', async () => {
  const { window, fetchCalls } = await coreSandbox();
  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'Save it.', therapistMode: false, transcript: [] });
  assert.equal(fetchCalls.length, 1, 'with nothing in flight, the message must reach the ordinary network turn');
  assert.equal(result.kind, 'assistant');
});

test('the Persian aiWorkflowFinishing reply is used for a Persian-language document', async () => {
  const submitCalls = [];
  const resultContextCalls = [];
  const { window } = await coreSandbox({ lang: 'fa', respond: respondWizardBothRequired });
  registerExplicitSubmitAction(window, submitCalls, resultContextCalls);
  await window.TradeJournalChatDockCore.sendChat({ text: 'یک معامله لانگ روی طلا ثبت کن.', therapistMode: false, transcript: [] });
  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'ذخیره کن', therapistMode: false, transcript: [] });
  assert.equal(result.reply, 'باشه، دارم ذخیره‌اش می‌کنم.');
});
