import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Context-aware conversational operation layer, section 9 (workflow switching): an unambiguous
// "never mind"/"cancel that"/"forget it" utterance abandons whatever workflow is currently in
// flight - ai-workflow-engine.js's own interpretCancelText() (a pure classifier) plus
// chat-dock-core.js's own deterministic, zero-network fast path that calls it. Same real-module VM
// sandbox convention as tests/companion-explain-mode.test.mjs / tests/trade-emotion-
// clarification.test.mjs: only fetch/DOM faked, chat-dock-core.js and its real dependencies run
// unmodified.

const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = (file) => readFile(shared(file), 'utf8');
const workflowEngineSrc = await source('ai-workflow-engine.js');

async function coreSandbox(options = {}) {
  const document = { documentElement: { lang: options.lang || 'en' } };
  const fetchCalls = [];
  // Every real network call this sandbox ever sees lands in fetchCalls, whether it uses the
  // default mock response or a caller-supplied one (options.respond) - a test asserting "zero
  // further network calls" after a cancellation must be able to see every call that really
  // happened, not just the ones the default mock bookkeeping would have recorded.
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

// A minimal, ordinary (non-gate) multi-field action - mirrors session.create's own shape (several
// required fields, no gateField) - to prove cancellation works for the general case, not only a
// gate-shaped one. isOpen() only reports true AFTER open() actually runs - matching every real
// action in this app (nothing is "open" merely because it is registered) - never pre-opened, which
// would make the very first turn look like a continuation of an already-open process instead of a
// fresh discovery turn.
function registerPlainAction(window) {
  let opened = false;
  window.TradeJournalAIActionRegistry.registerAction({
    id: 'demo.thing.create', domain: 'demo', riskLevel: 'low',
    requiredFields: ['name', 'size'], optionalFields: [],
    available: () => true,
    open: () => { opened = true; return { processId: 'demo-thing' }; },
    submit: () => undefined, resultContext: () => {}
  });
  window.TradeJournalAIProcessRegistry.register('demo-thing', { allowlist: ['name', 'size'], isOpen: () => opened });
}

// A gate-shaped action (F37) - mirrors trade.cancel's own shape - to prove the new general
// cancellation path also covers a gate-shaped workflow, on top of (not replacing) the pre-existing
// narrower yes/no gate-rejection fast path.
function registerGateAction(window) {
  let opened = false;
  window.TradeJournalAIActionRegistry.registerAction({
    id: 'demo.thing.remove', domain: 'demo', riskLevel: 'high',
    requiredFields: ['confirm'], optionalFields: [], gateField: 'confirm',
    normalizeField: (path, value) => (path === 'confirm' && (value === false || value === 'false') ? null : value),
    available: () => true,
    open: () => { opened = true; return { processId: 'demo-thing-remove' }; },
    submit: () => undefined, resultContext: () => {}
  });
  window.TradeJournalAIProcessRegistry.register('demo-thing-remove', { allowlist: [], isOpen: () => opened });
}

test('ai-workflow-engine.js exposes a pure interpretCancelText() classifier - anchored to the whole trimmed utterance, best-effort en/fa/ar/es coverage', () => {
  assert.match(workflowEngineSrc, /function interpretCancelText\(text\) \{/);
  assert.match(workflowEngineSrc, /interpretCancelText: interpretCancelText,/);
});

test('interpretCancelText() recognizes unambiguous EN/FA/AR/ES cancellation phrases, case-insensitively for EN/ES, but not a plain "no"/"don\'t" or an ordinary sentence that merely mentions a similar word', () => {
  const sandbox = { window: {} };
  vm.runInNewContext(workflowEngineSrc, sandbox, { filename: 'ai-workflow-engine.js' });
  const engine = sandbox.window.TradeJournalAIWorkflowEngine;
  const yes = ['never mind', 'Never Mind', 'forget it', 'cancel that', 'cancel this', 'cancel the form', 'بیخیال', 'بی‌خیال', 'ولش کن', 'کنسل کن', 'إلغاء ذلك', 'اتركه', 'olvídalo', 'olvidalo', 'déjalo', 'cancela eso'];
  const no = ['no', "don't", 'scratch that', 'no, make that 5 minutes', 'I forget things sometimes', ''];
  for (const t of yes) assert.equal(engine.interpretCancelText(t), true, `expected a cancel match for "${t}"`);
  for (const t of no) assert.equal(engine.interpretCancelText(t), false, `expected no cancel match for "${t}"`);
});

const respondDemoThingCreate = () => ({ reply: 'Starting the demo thing - what name?', action: { id: 'demo.thing.create', fields: [{ path: 'size', value: 'large' }] }, provider: 'openai', usage: { totalTokens: 5 } });
const respondDemoThingRemove = () => ({ reply: 'Are you sure?', action: { id: 'demo.thing.remove', fields: [] }, provider: 'openai', usage: { totalTokens: 1 } });

test('"never mind" mid an ordinary, non-gate workflow cancels it deterministically: zero network calls, workflow cleared, and a plain cancelled reply - never left to the model', async () => {
  const { window, fetchCalls } = await coreSandbox({ respond: respondDemoThingCreate });
  registerPlainAction(window);
  await window.TradeJournalChatDockCore.sendChat({ text: 'Create a demo thing.', therapistMode: false, transcript: [] });
  assert.ok(window.TradeJournalAIWorkflowEngine.current(), 'the workflow must actually be in flight before the cancel attempt means anything');
  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'Never mind.', therapistMode: false, transcript: [] });
  assert.equal(fetchCalls.length, 1, 'only the first (start) turn should have hit the network - the cancel itself must be zero-network');
  assert.equal(result.reply, 'Okay, cancelled. Nothing was saved.');
  assert.equal(window.TradeJournalAIWorkflowEngine.current(), null, 'the workflow must actually be cleared');
});

test('a same-breath field correction ("no, make that 5 minutes") never cancels an ordinary in-progress workflow - the new fast path uses a different, narrower vocabulary than plain "no"', async () => {
  const { window } = await coreSandbox({ respond: respondDemoThingCreate });
  registerPlainAction(window);
  await window.TradeJournalChatDockCore.sendChat({ text: 'Create a demo thing.', therapistMode: false, transcript: [] });
  await window.TradeJournalChatDockCore.sendChat({ text: 'no, make that 5 minutes', therapistMode: false, transcript: [] });
  assert.ok(window.TradeJournalAIWorkflowEngine.current(), 'the workflow must still be alive - this must fall through to ordinary handling, not the new cancel path');
});

test('"never mind" also cancels a GATE-shaped workflow (F37) - the new general path covers gate actions too, on top of (not instead of) the pre-existing narrower yes/no gate-rejection fast path', async () => {
  const { window, fetchCalls } = await coreSandbox({ respond: respondDemoThingRemove });
  registerGateAction(window);
  await window.TradeJournalChatDockCore.sendChat({ text: 'Remove the demo thing.', therapistMode: false, transcript: [] });
  assert.ok(window.TradeJournalAIWorkflowEngine.current());
  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'forget it', therapistMode: false, transcript: [] });
  assert.equal(fetchCalls.length, 1);
  assert.equal(result.reply, 'Okay, cancelled. Nothing was saved.');
  assert.equal(window.TradeJournalAIWorkflowEngine.current(), null);
});

test('"never mind" with NO workflow currently in flight is a complete no-op for this fast path - falls straight through to the ordinary AI turn, exactly as before this feature', async () => {
  const { window, fetchCalls } = await coreSandbox();
  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'Never mind.', therapistMode: false, transcript: [] });
  assert.equal(fetchCalls.length, 1, 'with nothing to cancel, the message must reach the ordinary network turn');
  assert.equal(result.kind, 'assistant');
});

test('the Persian aiWorkflowCancelled reply is used for a Persian-language document, distinct from aiDockConfirmationCancelled\'s own delete/publish/send-specific wording', async () => {
  const { window } = await coreSandbox({ lang: 'fa', respond: respondDemoThingCreate });
  registerPlainAction(window);
  await window.TradeJournalChatDockCore.sendChat({ text: 'Create a demo thing.', therapistMode: false, transcript: [] });
  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'بیخیال', therapistMode: false, transcript: [] });
  assert.equal(result.reply, 'باشه، لغو شد. چیزی ذخیره نشد.');
});
