import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { buildFixtureBundleRows, buildSurfaceHelpFixtureRow } from './helpers/conversation-scenario-fixtures.mjs';

// Journey H2, Gate 2: a fake localStorage pre-seeded with a published-bundle - ai-conversation-
// router.js's own IIFE reads this synchronously at load time (matching a real warm-reload
// browser), so this is how a test gives the router real scenario data without a network call.
function bundleLocalStorage(scenarios) {
  const store = { 'tradejournal:conversation-scenarios-bundle:v1': JSON.stringify({ scenarios, version: 'v-test' }) };
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; }
  };
}

const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = file => readFile(shared(file), 'utf8');

// Values that transited through the vm-sandboxed ai-workflow-engine.js (workflow.known/missing,
// the `known` object handed to a fake action's submit()) carry that realm's own Object.prototype,
// so assert.deepEqual (node:assert/strict's deepStrictEqual, prototype-sensitive) reports "same
// structure but not reference-equal" even when every field matches - the same caveat
// tests/ai-process-registry.test.mjs's own comments call out.
const clone = value => JSON.parse(JSON.stringify(value));

// Loads the real ai-i18n.js, ai-settings-store.js and ai-process-registry.js modules alongside
// chat-dock-core.js in one sandbox, then stubs only the pieces the module deliberately treats
// as external integration points (trade store/UI, mental-health store/AI, fetch) - the same
// approach the retired global-ai-dock.test.mjs used, now against the DOM-free core the NAVRYA
// ChatDock (navrya-src/chatDockView.jsx) calls into.
// Journey A ("start a session via chat") wiring loads the three new engine modules alongside
// ai-process-registry.js as real modules (not stubs) - the same coreSandbox() every existing test
// below already relies on, so those tests keep proving nothing regresses for pages/flows that
// never touch action discovery at all.
async function coreSandbox(overrides) {
  const document = { documentElement: { lang: 'en' } };
  const sandbox = {
    window: {}, document, localStorage: overrides.localStorage || { getItem: () => null, setItem() {}, removeItem() {} },
    fetch: overrides.fetch || (async () => { throw new Error('fetch must not be called in this test'); }),
    Set, Math, JSON, console, Date, Promise, setTimeout, clearTimeout,
    CustomEvent: overrides.CustomEvent || class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } }
  };
  sandbox.window = Object.assign(sandbox.window, {
    document, localStorage: sandbox.localStorage, fetch: sandbox.fetch,
    TradeJournalMentalHealthStore: overrides.mentalHealthStore,
    TradeJournalMentalHealthAI: overrides.mentalHealthAI,
    TradeJournalMentalHealthSafety: overrides.mentalHealthSafety,
    TradeJournalTradeStore: overrides.tradeStore,
    TradeJournalStrategyEducationStore: overrides.strategyStore,
    TradeJournalPatternStore: overrides.patternStore,
    TradeJournalWorkspace: overrides.workspace,
    TradeJournalAIUsage: overrides.aiUsage || { record() {} },
    TradeJournalAiChatHistoryStore: overrides.historyStore,
    TradeJournalNavryaStore: overrides.navryaStore
  });
  const files = ['ai-i18n.js', 'ai-settings-store.js', 'ai-process-registry.js'];
  // Journey C's proactive-engine.js/signal-router.js load alongside the Journey B engine trio -
  // both are pure no-ops for any test that never registers a 'trade.calculator' action or never
  // supplies TradeJournalStrategyEducationStore/TradeJournalMentalHealthStore/matching text, so
  // every existing Journey A/B test below keeps proving exactly what it always proved.
  // Latency pass: ai-deterministic-extraction.js is what chat-dock-core.js's own single-
  // missing-field slot-fill fast path calls through resolveSlotFillValue() - loaded alongside the
  // rest of the Journey A/B trio so every withWorkflowEngine test exercises the real fast path,
  // not a silent always-null stand-in that would make it look like it always falls through.
  if (overrides.withWorkflowEngine) files.push('ai-context-engine.js', 'ai-action-registry.js', 'ai-workflow-engine.js', 'ai-proactive-engine.js', 'ai-signal-router.js', 'ai-deterministic-extraction.js', 'ai-voice-text.js');
  // Journey D: the three Knowledge Base modules, loaded independently of withWorkflowEngine (a
  // page can have one without the other in principle, and every existing test above that doesn't
  // set this flag keeps proving the exact pre-Journey-D request shape, with no productContext key
  // at all - see the two new "backward compatible" tests below).
  if (overrides.withKnowledgeBase) {
    if (files.indexOf('ai-context-engine.js') === -1) files.push('ai-context-engine.js');
    files.push('ai-knowledge-registry.js', 'ai-user-memory.js', 'ai-context-builder.js');
  }
  // Journey H2, Gate 1/2: the deterministic Conversation Router - a page without this script tag
  // (or an older cached bundle) must keep today's exact behavior, so every test above that doesn't
  // set this flag proves the router is never even consulted. ai-conversation-matcher.js is the
  // real shared matching engine ai-conversation-router.js now delegates to (Gate 2) - always
  // loaded alongside it, matching the real script-tag order on every character page.
  if (overrides.withConversationRouter) files.push('ai-surface-context.js', 'ai-conversation-matcher.js', 'ai-conversation-router.js');
  for (const file of files) {
    vm.runInNewContext(await source(file), sandbox, { filename: file });
  }
  vm.runInNewContext(await source('chat-dock-core.js'), sandbox, { filename: 'chat-dock-core.js' });
  return sandbox.window;
}

test('providerLabel resolves the real i18n label, not a raw fallback key', async () => {
  const window = await coreSandbox({});
  assert.equal(window.TradeJournalChatDockCore.providerLabel('openai'), 'ChatGPT');
});

test('A6 OFF (default): sending a message never touches TradeJournalMentalHealthStore and goes through /api/ai/chat instead', async () => {
  const usageRecorded = [];
  let fetchCall = null;
  const mentalHealthStore = { addMessage() { throw new Error('therapist mode is off - addMessage must never be called'); }, load() { throw new Error('load must never be called either'); } };
  const window = await coreSandbox({
    mentalHealthStore,
    fetch: async (url, options) => { fetchCall = { url, body: JSON.parse(options.body) }; return { ok: true, json: async () => ({ reply: 'general help', suggestions: [], provider: 'openai', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } }) }; },
    aiUsage: { record: entry => usageRecorded.push(entry) }
  });

  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'how do I read this chart?', therapistMode: false, transcript: [] });

  assert.ok(fetchCall, 'the OFF-mode gateway must be called');
  assert.equal(fetchCall.url, '/api/ai/chat');
  assert.equal(fetchCall.body.message, 'how do I read this chart?');
  assert.equal(fetchCall.body.provider, 'openai');
  assert.equal(usageRecorded.length, 1, 'the core must record usage itself since this call bypasses the decorated AI clients');
  assert.equal(usageRecorded[0].provider, 'openai');
  assert.equal(usageRecorded[0].usage.totalTokens, 2);
  assert.equal(result.kind, 'assistant');
  assert.equal(result.reply, 'general help');
});

test('A6 ON: therapist mode routes through TradeJournalMentalHealthAI.chat(), appends to the profile chat history, and never calls the OFF-mode gateway', async () => {
  const addMessageCalls = [];
  const mentalHealthStore = {
    load: () => ({ chatHistory: [] }),
    addMessage: (profile, role, content) => { addMessageCalls.push([role, content]); return profile; }
  };
  const mentalHealthAI = { chat: async (_profile, message) => ({ flagged: false, reply: 'noted: ' + message, suggestions: [] }) };
  const window = await coreSandbox({ mentalHealthStore, mentalHealthAI, fetch: async () => { throw new Error('the OFF-mode gateway must not be called while therapist mode is on'); } });

  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'I feel anxious about this trade', therapistMode: true, transcript: [] });

  assert.deepEqual(addMessageCalls, [['user', 'I feel anxious about this trade'], ['assistant', 'noted: I feel anxious about this trade']], 'both turns must be appended to the mental-health profile\'s own chat history via its existing store');
  assert.equal(result.kind, 'assistant');
  assert.equal(result.reply, 'noted: I feel anxious about this trade');
});

test('A6 ON: a flagged message stops at the safety gate - the assistant turn is never appended and the caller gets a safety result instead of a reply', async () => {
  const addMessageCalls = [];
  const mentalHealthStore = { load: () => ({ chatHistory: [] }), addMessage: (profile, role, content) => { addMessageCalls.push([role, content]); return profile; } };
  const mentalHealthAI = { chat: async () => ({ flagged: true, reply: '', suggestions: [] }) };
  const window = await coreSandbox({ mentalHealthStore, mentalHealthAI });

  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'a message the safety gate flags', therapistMode: true, transcript: [] });

  assert.deepEqual(addMessageCalls, [['user', 'a message the safety gate flags']], 'only the user turn is recorded - checkText() runs unconditionally inside chat() before any reply is produced');
  // result is an object literal built inside the vm sandbox (a different Object.prototype from
  // this outer realm), so compare the field directly rather than deepEqual against an
  // outer-realm literal.
  assert.equal(result.kind, 'safety');
});

test('A6 OFF: a flagged message never reaches the provider, and never depends on trading-context relevance', async () => {
  const checkTextCalls = [];
  const mentalHealthSafety = { checkText: (text) => { checkTextCalls.push(text); return { flagged: true, category: 'self_harm' }; } };
  const window = await coreSandbox({
    mentalHealthSafety,
    fetch: async () => { throw new Error('/api/ai/chat must never be called for a safety-flagged message'); }
  });

  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'a message with no trading context at all', therapistMode: false, transcript: [] });

  assert.deepEqual(checkTextCalls, ['a message with no trading context at all']);
  assert.equal(result.kind, 'safety');
});

test('A6 OFF: a flagged message never starts or mutates a workflow, even when the text also matches an offered action', async () => {
  const mentalHealthSafety = { checkText: () => ({ flagged: true, category: 'self_harm' }) };
  const window = await coreSandbox({
    withWorkflowEngine: true,
    mentalHealthSafety,
    fetch: async () => { throw new Error('/api/ai/chat must never be called for a safety-flagged message'); }
  });
  window.TradeJournalAIActionRegistry.registerAction({ id: 'session.create', description: 'start a session', requiredFields: ['city'], available: () => true, open: () => ({ processId: 'session-create' }) });

  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'start a session, but I also want to hurt myself', therapistMode: false, transcript: [] });

  assert.equal(result.kind, 'safety');
  assert.equal(window.TradeJournalAIWorkflowEngine.current(), null, 'no workflow may be started for a safety-flagged turn, regardless of what else the text contains');
});

test('resetConversationState() releases a mid-flight workflow and a pending Proactive Engine confirmation - what "New Chat" calls so neither leaks into the next conversation', async () => {
  const window = await coreSandbox({ withWorkflowEngine: true });
  window.TradeJournalAIActionRegistry.registerAction({ id: 'session.create', description: 'start a session', requiredFields: ['city', 'timeframe'], available: () => true, open: () => ({ processId: 'session-create' }) });
  window.TradeJournalAIWorkflowEngine.start('session.create', {}, []);
  window.TradeJournalAIProactiveEngine.stageConfirmation({ ruleId: 'R1', actionId: 'trade.calculator', processId: 'trade-calculator', field: 'riskPercent', proposedValue: 4, safeValue: 1 });

  assert.ok(window.TradeJournalAIWorkflowEngine.current(), 'sanity check: a workflow is genuinely in flight before reset');
  assert.ok(window.TradeJournalAIProactiveEngine.pendingConfirmation(), 'sanity check: a confirmation is genuinely pending before reset');

  window.TradeJournalChatDockCore.resetConversationState();

  assert.equal(window.TradeJournalAIWorkflowEngine.current(), null, 'the old conversation\'s workflow must not survive into a new one');
  assert.equal(window.TradeJournalAIProactiveEngine.pendingConfirmation(), null, 'the old conversation\'s pending confirmation must not survive into a new one');
});

test('analyzeScreenshot posts to /api/trades/extract-fields and records usage', async () => {
  const usageRecorded = [];
  let fetchCall = null;
  const window = await coreSandbox({
    fetch: async (url, options) => { fetchCall = { url, body: JSON.parse(options.body) }; return { ok: true, json: async () => ({ direction: 'long', entryPrice: 100, provider: 'openai', usage: { totalTokens: 5 } }) }; },
    aiUsage: { record: entry => usageRecorded.push(entry) }
  });

  const extraction = await window.TradeJournalChatDockCore.analyzeScreenshot('data:image/png;base64,xyz');

  assert.equal(fetchCall.url, '/api/trades/extract-fields');
  assert.deepEqual(fetchCall.body.images, ['data:image/png;base64,xyz']);
  assert.equal(extraction.entryPrice, 100);
  assert.equal(usageRecorded.length, 1);
});

// --- Real, multiple, resumable conversations (ai-chat-history-store.js) ---

test('sendChat() with no conversationId starts a brand-new server conversation and returns its id', async () => {
  const startCalls = [];
  const historyStore = {
    startConversation: async (provider, question, answer, tokens) => { startCalls.push([provider, question, answer, tokens]); return { id: 'new-conv-1' }; },
    appendExchange: async () => { throw new Error('appendExchange must not be called for a fresh conversation'); }
  };
  const window = await coreSandbox({
    historyStore,
    fetch: async () => ({ ok: true, json: async () => ({ reply: 'hello there', suggestions: [], provider: 'openai', usage: { promptTokens: 3, completionTokens: 4, totalTokens: 7 } }) })
  });

  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'first question', therapistMode: false, transcript: [], conversationId: null });

  assert.equal(startCalls.length, 1);
  assert.deepEqual(startCalls[0], ['openai', 'first question', 'hello there', 7]);
  assert.equal(result.conversationId, 'new-conv-1', 'the caller must learn the newly-created conversation id to thread through subsequent messages');
});

test('sendChat() with an existing conversationId appends to it instead of creating a new one, and returns the same id back', async () => {
  const appendCalls = [];
  const historyStore = {
    startConversation: async () => { throw new Error('startConversation must not be called when a conversation is already active'); },
    appendExchange: async (id, question, answer, tokens) => { appendCalls.push([id, question, answer, tokens]); return { id }; }
  };
  const window = await coreSandbox({
    historyStore,
    fetch: async () => ({ ok: true, json: async () => ({ reply: 'a follow-up reply', suggestions: [], provider: 'openai', usage: { totalTokens: 9 } }) })
  });

  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'a follow-up question', therapistMode: false, transcript: [{ role: 'user', content: 'first question' }, { role: 'assistant', content: 'hello there' }], conversationId: 'conv-1' });

  assert.equal(appendCalls.length, 1);
  assert.deepEqual(appendCalls[0], ['conv-1', 'a follow-up question', 'a follow-up reply', 9]);
  assert.equal(result.conversationId, 'conv-1', 'must keep threading the same conversation id, not mint a new one');
});

test('a history-sync failure (startConversation/appendExchange rejecting) never breaks the actual reply the user is waiting on', async () => {
  const historyStore = {
    startConversation: async () => { throw new Error('history service unreachable'); },
    appendExchange: async () => { throw new Error('history service unreachable'); }
  };
  const window = await coreSandbox({
    historyStore,
    fetch: async () => ({ ok: true, json: async () => ({ reply: 'the real reply', suggestions: [], provider: 'openai', usage: { totalTokens: 1 } }) })
  });

  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'anything', therapistMode: false, transcript: [], conversationId: null });
  assert.equal(result.reply, 'the real reply', 'the gateway reply must still be returned even though history sync failed');
  assert.equal(result.conversationId, null, 'no conversation id was ever obtained, since the create attempt failed');
});

// --- Journey A: action discovery + workflow engine ("start a New York session") ---

// Registers a fake session.create action + its 'session-create' process registration, mirroring
// exactly the real wiring (navrya-src/character-app.jsx's registerAction, NewSessionDialog.jsx's
// registry.register) without any React/DOM involved - chat-dock-core.js only ever talks to these
// two window globals, never to the components themselves.
function registerFakeSessionCreate(window, spies) {
  let processOpen = false;
  window.TradeJournalAIProcessRegistry.register('session-create', {
    allowlist: ['city', 'timeframe'],
    isOpen: () => processOpen,
    applyValue: (path, value) => spies.applied.push([path, value])
  });
  window.TradeJournalAIActionRegistry.registerAction({
    id: 'session.create', requiredFields: ['city', 'timeframe'], optionalFields: [],
    open: () => { spies.opened += 1; processOpen = true; },
    submit: async (known) => { spies.submitted = known; return { id: 'session-1' }; },
    resultContext: (result) => { spies.resultContext = result; }
  });
  return { open: () => { processOpen = true; }, close: () => { processOpen = false; } };
}

test('when nothing is loaded/registered, sendChat never sends availableActions and behaves exactly like before (backward compatible)', async () => {
  let fetchCall = null;
  const window = await coreSandbox({
    fetch: async (url, options) => { fetchCall = { url, body: JSON.parse(options.body) }; return { ok: true, json: async () => ({ reply: 'plain answer', suggestions: [], provider: 'openai', usage: { totalTokens: 1 } }) }; }
  });
  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'start a New York session', therapistMode: false, transcript: [] });
  assert.equal(fetchCall.body.availableActions, undefined);
  assert.equal(result.kind, 'assistant');
});

test('turn 1: with nothing open, sendChat offers availableActions, and an action match starts + live-applies the workflow instead of returning suggestions for manual approval', async () => {
  const spies = { applied: [], opened: 0, submitted: null, resultContext: null };
  let fetchCall = null;
  const window = await coreSandbox({
    withWorkflowEngine: true,
    fetch: async (url, options) => {
      fetchCall = { url, body: JSON.parse(options.body) };
      return { ok: true, json: async () => ({ reply: 'Starting your New York session - what timeframe?', action: { id: 'session.create', fields: [{ path: 'city', value: 'New York' }] }, provider: 'openai', usage: { totalTokens: 5 } }) };
    }
  });
  registerFakeSessionCreate(window, spies);

  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'Start a New York session', therapistMode: false, transcript: [] });

  assert.ok(Array.isArray(fetchCall.body.availableActions) && fetchCall.body.availableActions.some((a) => a.id === 'session.create'), 'availableActions must be offered when nothing is open and no workflow is in flight');
  assert.equal(fetchCall.body.activeProcess, null, 'nothing was open yet at request time');
  assert.equal(spies.opened, 1, 'the action\'s own open() must be called exactly once to start the workflow');
  assert.deepEqual(clone(spies.applied), [['city', 'New York']], 'the extracted field must be live-applied via TradeJournalAIProcessRegistry.applyValue, not held back');
  assert.equal(result.kind, 'workflow');
  assert.deepEqual(clone(result.workflow.known), { city: 'New York' });
  assert.deepEqual(clone(result.workflow.missing), ['timeframe'], 'still missing timeframe, so submit must not have run yet');
  assert.equal(spies.submitted, null);
});

// Voice Mode performance pass, task requirement: "'Yes, create a BTC trade' must be processed as
// a full intent, not reduced to generic 'yes'." Proven here rather than reimplemented - the
// mechanism already exists structurally: the Journey C pending-confirmation fast path
// (chat-dock-core.js's own proactiveEngine.pendingConfirmation() check, right at the top of
// sendChat(), before anything else) only ever intercepts text when something is ACTUALLY pending;
// with nothing pending, a leading "Yes, ..." is never stripped or specially handled - the FULL,
// untruncated sentence reaches the model via availableActions exactly like any other opener, so a
// compound "Yes, <do the thing>" opener is not reducible to a bare "yes" at all - there is no bare
// "yes" branch for it to fall into in the first place.
test('a compound "Yes, <start something>" opener, with no confirmation pending, reaches the model as the full, untruncated sentence and correctly triggers real action-discovery - never intercepted or reduced to a generic yes/no', async () => {
  const spies = { applied: [], opened: 0, submitted: null, resultContext: null };
  let fetchCall = null;
  const window = await coreSandbox({
    withWorkflowEngine: true,
    fetch: async (url, options) => {
      fetchCall = { url, body: JSON.parse(options.body) };
      return { ok: true, json: async () => ({ reply: 'Starting your New York session - what timeframe?', action: { id: 'session.create', fields: [{ path: 'city', value: 'New York' }] }, provider: 'openai', usage: { totalTokens: 5 } }) };
    }
  });
  registerFakeSessionCreate(window, spies);

  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'Yes, start a New York session', therapistMode: false, transcript: [] });

  assert.equal(fetchCall.body.message, 'Yes, start a New York session', 'the full sentence, including the leading "Yes,", must reach the model unmodified - never truncated to a bare confirmation word');
  assert.ok(Array.isArray(fetchCall.body.availableActions) && fetchCall.body.availableActions.some((a) => a.id === 'session.create'), 'availableActions must still be offered - a leading "Yes," with nothing pending must not suppress normal action-discovery');
  assert.equal(result.kind, 'workflow', 'the compound opener must start a real workflow, not fall through as an unresolved bare confirmation');
  assert.equal(spies.opened, 1);
});

test('turn 2: once the process is open, the same workflow auto-applies this turn\'s suggestions (never returned for manual Apply/Discard) and auto-submits once nothing required is missing', async () => {
  const spies = { applied: [], opened: 0, submitted: null, resultContext: null };
  const window = await coreSandbox({
    withWorkflowEngine: true,
    fetch: async (url, options) => {
      const body = JSON.parse(options.body);
      if (!body.activeProcess) return { ok: true, json: async () => ({ reply: 'Starting your New York session - what timeframe?', action: { id: 'session.create', fields: [{ path: 'city', value: 'New York' }] }, provider: 'openai', usage: { totalTokens: 5 } }) };
      return { ok: true, json: async () => ({ reply: 'Got it - 5 minutes.', suggestions: [{ path: 'timeframe', value: '5m', mode: 'replace' }], provider: 'openai', usage: { totalTokens: 5 } }) };
    }
  });
  registerFakeSessionCreate(window, spies);
  window.TradeJournalAIWorkflowEngine.setSubmitGraceMs(20);
  const core = window.TradeJournalChatDockCore;

  const first = await core.sendChat({ text: 'Start a New York session', therapistMode: false, transcript: [] });
  assert.equal(first.kind, 'workflow');

  const second = await core.sendChat({ text: '5 minutes', therapistMode: false, transcript: [{ role: 'user', content: 'Start a New York session' }, { role: 'assistant', content: first.reply }] });

  assert.deepEqual(clone(spies.applied), [['city', 'New York'], ['timeframe', '5m']]);
  assert.equal(second.kind, 'workflow');
  assert.equal(second.workflow.status, 'pending-submit', 'the required set is complete, but a short grace window lets a same-breath correction still land before it actually submits');

  await new Promise((resolve) => setTimeout(resolve, 60));

  assert.equal(window.TradeJournalAIWorkflowEngine.current(), null, 'the workflow completes and clears once the grace window elapses');
  assert.deepEqual(clone(spies.submitted), { city: 'New York', timeframe: '5m' }, 'submit() must go through the action\'s own submit - the same real create path, no parallel one');
  assert.deepEqual(clone(spies.resultContext), { id: 'session-1' }, 'resultContext() must run with the real created record so the app can navigate to it');
});

test('when the model finds no matching action (action.id: null), it is treated as a plain answer with no workflow side effects', async () => {
  const spies = { applied: [], opened: 0, submitted: null, resultContext: null };
  const window = await coreSandbox({
    withWorkflowEngine: true,
    fetch: async () => ({ ok: true, json: async () => ({ reply: 'Sure, here is an answer.', action: null, provider: 'openai', usage: { totalTokens: 2 } }) })
  });
  registerFakeSessionCreate(window, spies);

  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'what is my average risk?', therapistMode: false, transcript: [] });

  assert.equal(result.kind, 'assistant');
  assert.equal(spies.opened, 0);
  assert.deepEqual(spies.applied, []);
});

// Found via real end-to-end testing: a user starts a session-create workflow, closes the dialog
// by hand before ever finishing it (never completing the required set, so no submit was ever
// scheduled to catch this), then later sends an entirely new, unrelated "start a session" request
// in the same chat. Without sendChat() pruning the abandoned workflow first, availableActions
// would never be offered again - the stale workflow would keep reporting itself as "already in
// progress" forever.
// Found while building Journey B ("start a trade from this Scenario"): liveSessionView.jsx
// registers each expanded Scenario card as its own open AI process ('live-session-scenario-' +
// id) purely so ai-context-engine.js can read it back as context - it was never meant to count as
// "a fillable form is open" the way NewSessionDialog/tradeCalculatorModal do. Without this
// exclusion, a user with a scenario expanded could never have a brand-new action discovered via
// chat at all - availableActions would stay suppressed the whole time, generically, for every
// action, not just trade.calculator.
test('an expanded live-session Scenario card does not block a brand-new action from being discovered via chat', async () => {
  let fetchCall = null;
  const window = await coreSandbox({
    withWorkflowEngine: true,
    fetch: async (url, options) => { fetchCall = { url, body: JSON.parse(options.body) }; return { ok: true, json: async () => ({ reply: 'plain answer', action: null, provider: 'openai', usage: { totalTokens: 1 } }) }; }
  });
  window.TradeJournalAIProcessRegistry.register('live-session-scenario-scenario-abc', { allowlist: [], isOpen: () => true });
  window.TradeJournalAIActionRegistry.registerAction({ id: 'session.create', available: () => true });

  await window.TradeJournalChatDockCore.sendChat({ text: 'start a session', therapistMode: false, transcript: [] });

  assert.ok(Array.isArray(fetchCall.body.availableActions) && fetchCall.body.availableActions.some((a) => a.id === 'session.create'), 'an expanded scenario card must never suppress action discovery');
  assert.equal(fetchCall.body.activeProcess, null, 'the scenario card must not be reported as an active form either - it would otherwise suppress availableActions server-side too (mutually exclusive per dockChatFormatFor())');
});

// Found via real F21 browser testing: session.scenario.create/session.scenario.edit/
// session.movementEntry.create deliberately have no entityAlreadyPersisted (see character-app.jsx's
// own comments), so once their one required field is known they enter a brief 'pending-submit'
// grace window (ai-workflow-engine.js's SUBMIT_GRACE_MS) before clearing. The exclusion test above
// proves their processId never counts as an open activeProcess - but before this fix, a currentWorkflow
// still in that grace window ALSO blocked the availableActions branch above (line ~191's own
// `!currentWorkflow` check), and could never reach the activeProcess-match continuation branch
// either (structurally impossible, since activeProcess is always null for these ids) - stranding
// any message sent during the grace window with neither branch, guaranteeing action:null regardless
// of what the user said. Real symptom: "Create a scenario called X" followed a few seconds later by
// an entirely unrelated "Create a Strategy called Y" silently failed to create the Strategy.
test('a Scenario/Entry-shaped workflow still in its own pending-submit grace window does not block a brand-new, unrelated action from being discovered on the very next turn', async () => {
  const spies = { strategySubmitted: null };
  const window = await coreSandbox({
    withWorkflowEngine: true,
    fetch: async (url, options) => {
      const body = JSON.parse(options.body);
      if (/scenario/i.test(body.message)) {
        return { ok: true, json: async () => ({ reply: 'Creating your scenario.', action: { id: 'session.scenario.create', fields: [{ path: 'title', value: 'X' }] }, provider: 'openai', usage: { totalTokens: 1 } }) };
      }
      return { ok: true, json: async () => ({ reply: 'Creating your strategy.', action: { id: 'strategy.create', fields: [{ path: 'name', value: 'Y' }] }, provider: 'openai', usage: { totalTokens: 1 } }) };
    }
  });
  let scenarioOpen = false;
  window.TradeJournalAIProcessRegistry.register('live-session-scenario-fake1', { allowlist: [], isOpen: () => scenarioOpen });
  window.TradeJournalAIActionRegistry.registerAction({
    id: 'session.scenario.create', requiredFields: ['title'], optionalFields: [],
    open: () => { scenarioOpen = true; return { processId: 'live-session-scenario-fake1' }; }, submit: async () => undefined, resultContext: () => {}
  });
  let strategyOpen = false;
  window.TradeJournalAIProcessRegistry.register('strategy-editor-fake2', { allowlist: ['name'], isOpen: () => strategyOpen });
  window.TradeJournalAIActionRegistry.registerAction({
    id: 'strategy.create', requiredFields: ['name'], optionalFields: [],
    open: () => { strategyOpen = true; return { processId: 'strategy-editor-fake2' }; }, submit: async (known) => { spies.strategySubmitted = known; return { id: 'strategy-1' }; }, resultContext: () => {}
  });
  // Long enough that turn 2 (sent immediately after, no real time elapses in a unit test) always
  // still finds it pending - cleared via cancel() below regardless, so no timer outlives this test.
  window.TradeJournalAIWorkflowEngine.setSubmitGraceMs(30000);
  const core = window.TradeJournalChatDockCore;

  let first, second;
  try {
    first = await core.sendChat({ text: 'Create a scenario called X', therapistMode: false, transcript: [] });
    assert.equal(first.kind, 'workflow');
    assert.equal(first.workflow.status, 'pending-submit', 'title was the only required field, so this workflow is already sitting in its own grace window');

    second = await core.sendChat({ text: 'Create a Strategy called Y', therapistMode: false, transcript: [] });
    assert.equal(second.kind, 'workflow', 'a fresh, unrelated action must still be discoverable while the Scenario workflow is mid-grace-window');
    assert.equal(second.workflow.actionId, 'strategy.create');
  } finally {
    // starting the second workflow replaces `current` without clearing the first workflow's own
    // real, outstanding pendingSubmitTimer (harmless in production - a browser tab stays alive and
    // the orphaned timer's own `if (current !== workflow) return` guard no-ops it a few seconds
    // later) - but a Node unit test process must not be left with a live timer, so both are cleared
    // directly via the exact same clearTimeout injected into the sandbox.
    if (first && first.workflow) clearTimeout(first.workflow.pendingSubmitTimer);
    if (second && second.workflow) clearTimeout(second.workflow.pendingSubmitTimer);
  }
});

// Journey F, F22 (trade.cancel): found via real browser testing - a workflow still 'collecting'
// (not yet pending-submit) whose process is excluded from activeProcess hits the identical dead
// branch, not just one in its grace window. trade.cancel deliberately requires a `confirm` field
// that only arrives on a separate, later turn ("Cancel this trade." -> "are you sure?" -> "Yes,
// cancel it.") - unlike the scenario above, this workflow is NEVER given a submit grace window at
// all (missing: ['confirm'] the whole time), so it would stay 'collecting' forever without the
// broader (any-status) exclusion.
test('a workflow still "collecting" (not pending-submit) whose process is excluded from activeProcess (e.g. trade-details-{id}) still does not block a fresh, later turn from re-discovering the same action and supplying the missing required field', async () => {
  const window = await coreSandbox({
    withWorkflowEngine: true,
    fetch: async (url, options) => {
      const body = JSON.parse(options.body);
      if (/cancel this trade/i.test(body.message)) {
        return { ok: true, json: async () => ({ reply: 'Are you sure?', action: { id: 'trade.cancel', fields: [] }, provider: 'openai', usage: { totalTokens: 1 } }) };
      }
      return { ok: true, json: async () => ({ reply: 'Confirmed.', action: { id: 'trade.cancel', fields: [{ path: 'confirm', value: true }] }, provider: 'openai', usage: { totalTokens: 1 } }) };
    }
  });
  window.TradeJournalAIProcessRegistry.register('trade-details-fake1', { allowlist: [], isOpen: () => true });
  let cancelled = null;
  window.TradeJournalAIActionRegistry.registerAction({
    id: 'trade.cancel', requiredFields: ['confirm'], optionalFields: [],
    open: () => ({ processId: 'trade-details-fake1' }),
    submit: async (known) => { if (known.confirm !== true) return undefined; cancelled = true; return { id: 'trade-1', status: 'cancelled' }; },
    resultContext: () => {}
  });
  window.TradeJournalAIWorkflowEngine.setSubmitGraceMs(20);
  const core = window.TradeJournalChatDockCore;

  const first = await core.sendChat({ text: 'Cancel this trade.', therapistMode: false, transcript: [] });
  assert.equal(first.kind, 'workflow');
  assert.equal(first.workflow.status, 'collecting', 'confirm is still missing - this workflow never enters a submit grace window at all');

  const second = await core.sendChat({ text: 'Yes, cancel it.', therapistMode: false, transcript: [] });
  assert.equal(second.kind, 'workflow', 'a fresh turn must still re-discover trade.cancel while the prior one is still collecting, not go dark');
  assert.equal(second.workflow.actionId, 'trade.cancel');
  assert.equal(second.workflow.status, 'pending-submit', 'confirm is now known, so this workflow reaches its own grace window');

  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(cancelled, true, 'the second turn\'s confirm:true must actually reach submit() once the grace window elapses');
});

// Production repair pass, section 11: found via the real, required 20-turn browser script -
// completing a Trade via chat auto-opens its own real Trade Details view (character-app.jsx's
// trade.calculator resultContext, pre-existing, unchanged), which registers itself
// ('trade-details-{id}', tradeDetailsModal.jsx) purely so ai-context-builder.js can resolve "this
// trade" - it has no fillable field of its own (allowlist: []). Before this fix, that silently
// blocked every later action-discovery turn (e.g. "take me to Strategies") for the rest of the
// session the instant a trade was created - a background/context-only registration suppressing
// unrelated, brand-new action discovery, exactly the failure mode this section warns about.
test('a Trade Details view left open by an auto-navigate after Trade creation does not block a later, unrelated action from being discovered', async () => {
  let fetchCall = null;
  const window = await coreSandbox({
    withWorkflowEngine: true,
    fetch: async (url, options) => { fetchCall = { url, body: JSON.parse(options.body) }; return { ok: true, json: async () => ({ reply: 'plain answer', action: null, provider: 'openai', usage: { totalTokens: 1 } }) }; }
  });
  window.TradeJournalAIProcessRegistry.register('trade-details-trade-1', { allowlist: [], isOpen: () => true });
  window.TradeJournalAIActionRegistry.registerAction({ id: 'navigate.to', available: () => true });

  await window.TradeJournalChatDockCore.sendChat({ text: 'take me to strategies', therapistMode: false, transcript: [] });

  assert.ok(Array.isArray(fetchCall.body.availableActions) && fetchCall.body.availableActions.some((a) => a.id === 'navigate.to'), 'an open Trade Details view must never suppress action discovery - it has nothing fillable to protect');
  assert.equal(fetchCall.body.activeProcess, null);
});

// General principle proven directly: ANY empty-allowlist registration is excluded, not only the
// two id prefixes exercised above - a future context-only registration gets this for free.
test('any registration with an empty allowlist is excluded from blocking discovery, regardless of its id prefix', async () => {
  let fetchCall = null;
  const window = await coreSandbox({
    withWorkflowEngine: true,
    fetch: async (url, options) => { fetchCall = { url, body: JSON.parse(options.body) }; return { ok: true, json: async () => ({ reply: 'plain answer', action: null, provider: 'openai', usage: { totalTokens: 1 } }) }; }
  });
  window.TradeJournalAIProcessRegistry.register('some-future-context-only-view-x1', { allowlist: [], isOpen: () => true });
  window.TradeJournalAIActionRegistry.registerAction({ id: 'session.create', available: () => true });

  await window.TradeJournalChatDockCore.sendChat({ text: 'start a session', therapistMode: false, transcript: [] });

  assert.ok(Array.isArray(fetchCall.body.availableActions) && fetchCall.body.availableActions.some((a) => a.id === 'session.create'));
});

// A registered process that IS a real fillable form (a non-empty allowlist, not a scenario card)
// must keep blocking discovery exactly as Journey A already established.
test('any other open process (a real dialog/modal) still blocks discovery exactly as before', async () => {
  let fetchCall = null;
  const window = await coreSandbox({
    withWorkflowEngine: true,
    fetch: async (url, options) => { fetchCall = { url, body: JSON.parse(options.body) }; return { ok: true, json: async () => ({ reply: 'plain answer', suggestions: [], provider: 'openai', usage: { totalTokens: 1 } }) }; }
  });
  window.TradeJournalAIProcessRegistry.register('session-create', { allowlist: ['city'], isOpen: () => true });
  window.TradeJournalAIActionRegistry.registerAction({ id: 'trade.calculator', available: () => true });

  await window.TradeJournalChatDockCore.sendChat({ text: 'take BTC long', therapistMode: false, transcript: [] });

  assert.equal(fetchCall.body.availableActions, undefined, 'a genuinely open form must still suppress discovery of a brand-new action');
  assert.deepEqual(fetchCall.body.activeProcess, { id: 'session-create', allowlist: ['city'] });
});

// Journey F, F27-31: pattern-editor-{id}/strategy-editor-{id}/messages-thread-reply/
// community-comment-{id}/marketplace-rate-{id} are real, non-empty-allowlist forms (unlike
// trade-details-{id} above) - but they are ALSO passively open the whole time an unrelated page
// state says so (a Pattern tab showing, a thread open, ...), not because of a deliberate "fill
// this out" gesture. Found via real browser testing: with a Pattern's Details tab simply open (no
// pattern-editing workflow in flight), "Publish this pattern to Marketplace." never reached
// action-discovery at all. Unlike the empty-allowlist case, these must still normally suppress
// discovery for the "any other open process" test above - the exception is scoped to these
// specific ids/prefixes, exercised only when NO workflow is already continuing through them.
test('a passively-open Pattern/Strategy editor does not block discovery of an unrelated action (e.g. marketplace.publish) when no pattern/strategy-editing workflow is in flight', async () => {
  let fetchCall = null;
  const window = await coreSandbox({
    withWorkflowEngine: true,
    fetch: async (url, options) => { fetchCall = { url, body: JSON.parse(options.body) }; return { ok: true, json: async () => ({ reply: 'plain answer', action: null, provider: 'openai', usage: { totalTokens: 1 } }) }; }
  });
  window.TradeJournalAIProcessRegistry.register('pattern-editor-p1', { allowlist: ['name', 'description'], isOpen: () => true });
  window.TradeJournalAIActionRegistry.registerAction({ id: 'marketplace.publish', available: () => true });

  await window.TradeJournalChatDockCore.sendChat({ text: 'publish this pattern to marketplace', therapistMode: false, transcript: [] });

  assert.ok(Array.isArray(fetchCall.body.availableActions) && fetchCall.body.availableActions.some((a) => a.id === 'marketplace.publish'), 'a passively-open Pattern editor must never suppress discovery of an unrelated action');
  assert.equal(fetchCall.body.activeProcess, null);
});

test('the same passively-open Pattern editor still supports normal field-continuation once a pattern.edit-shaped workflow is genuinely targeting it', async () => {
  let fetchCall = null;
  const window = await coreSandbox({
    withWorkflowEngine: true,
    fetch: async (url, options) => { fetchCall = { url, body: JSON.parse(options.body) }; return { ok: true, json: async () => ({ reply: 'ok', suggestions: [], provider: 'openai', usage: { totalTokens: 1 } }) }; }
  });
  window.TradeJournalAIProcessRegistry.register('pattern-editor-p1', { allowlist: ['name', 'description'], isOpen: () => true, applyValue() {} });
  // start() stashes open() lazily; give the fake action a real open() so processId resolves to
  // pattern-editor-p1 (mirrors the real pattern.edit's own resolveActivePatternId-based open()).
  window.TradeJournalAIActionRegistry.registerAction({ id: 'pattern.edit', available: () => true, open: () => ({ processId: 'pattern-editor-p1' }), submit: () => undefined, resultContext() {} });
  window.TradeJournalAIWorkflowEngine.start('pattern.edit', {});
  // Resolves the lazily-stashed open() result into workflow.processId, exactly as a real first
  // turn's own sendChat() -> start() -> applyKnownFields() sequence already does before returning.
  await window.TradeJournalAIWorkflowEngine.applyKnownFields([], {});

  await window.TradeJournalChatDockCore.sendChat({ text: 'change the description to X', therapistMode: false, transcript: [] });

  assert.deepEqual(fetchCall.body.activeProcess, { id: 'pattern-editor-p1', allowlist: ['name', 'description'] }, 'a workflow genuinely continuing through this process must still reach it as activeProcess');
  assert.equal(fetchCall.body.availableActions, undefined);
});

test('an abandoned workflow (its target UI closed by the user before ever completing) does not block a later, genuinely new request from being recognized', async () => {
  const spies = { applied: [], opened: 0, submitted: null, resultContext: null };
  let fetchCall = null;
  const window = await coreSandbox({
    withWorkflowEngine: true,
    fetch: async (url, options) => {
      fetchCall = { url, body: JSON.parse(options.body) };
      return { ok: true, json: async () => ({ reply: 'Starting your New York session - what timeframe?', action: { id: 'session.create', fields: [{ path: 'city', value: 'New York' }] }, provider: 'openai', usage: { totalTokens: 5 } }) };
    }
  });
  const dialog = registerFakeSessionCreate(window, spies);
  const core = window.TradeJournalChatDockCore;

  const first = await core.sendChat({ text: 'Start a New York session', therapistMode: false, transcript: [] });
  assert.equal(first.kind, 'workflow');
  assert.deepEqual(first.workflow.missing, ['timeframe'], 'still mid-conversation, never completed');

  dialog.close(); // the user closes the dialog by hand, abandoning the workflow unfinished

  const second = await core.sendChat({ text: 'Start a New York session', therapistMode: false, transcript: [] });
  assert.ok(Array.isArray(fetchCall.body.availableActions) && fetchCall.body.availableActions.some((a) => a.id === 'session.create'), 'the abandoned workflow must not suppress availableActions on this new, unrelated request');
  assert.equal(second.kind, 'workflow');
  assert.equal(spies.opened, 2, 'the action\'s open() runs again for the new request - a real second attempt, not silently ignored');
});

// --- Journey D: the Knowledge Base / Context Builder wired into the actual request ---

test('when ai-context-builder.js is not loaded at all, sendChat never sends a productContext key (backward compatible)', async () => {
  let fetchCall = null;
  const window = await coreSandbox({
    withWorkflowEngine: true, // engine trio loaded, Knowledge Base modules deliberately NOT
    fetch: async (url, options) => { fetchCall = { url, body: JSON.parse(options.body) }; return { ok: true, json: async () => ({ reply: 'plain answer', suggestions: [], provider: 'openai', usage: { totalTokens: 1 } }) }; }
  });
  await window.TradeJournalChatDockCore.sendChat({ text: 'what is a Scenario?', therapistMode: false, transcript: [] });
  assert.equal(fetchCall.body.productContext, undefined);
});

test('with the Knowledge Base loaded, sendChat sends a trimmed productContext reflecting the current page\'s own domain', async () => {
  let fetchCall = null;
  const navryaStore = { getState: () => ({ activeId: 'settings' }) };
  const window = await coreSandbox({
    withKnowledgeBase: true, navryaStore,
    fetch: async (url, options) => { fetchCall = { url, body: JSON.parse(options.body) }; return { ok: true, json: async () => ({ reply: 'plain answer', suggestions: [], provider: 'openai', usage: { totalTokens: 1 } }) }; }
  });
  await window.TradeJournalChatDockCore.sendChat({ text: 'what can I change here?', therapistMode: false, transcript: [] });
  const sent = fetchCall.body.productContext;
  assert.ok(sent, 'productContext must be sent once the Knowledge Base is loaded');
  assert.ok(sent.domains.some((d) => d.id === 'settings'), 'the current page\'s own domain must always be included');
  // Trimmed to only what a product answer needs - never the dev-only verifiedAgainst/routes/
  // entities/terms bookkeeping the server has no use for.
  const settingsDomain = sent.domains.find((d) => d.id === 'settings');
  assert.deepEqual(Object.keys(settingsDomain).sort(), ['capabilities', 'description', 'id', 'notes', 'relationships', 'title', 'workflows']);
});

// --- Journey D: "navigate.to" - Knowledge -> Planner -> a real registered Action, never ---
// --- arbitrary DOM mutation. Mirrors the real character-app.jsx registration (a fake process ---
// --- registered with isOpen() tied to the workflow's own lifetime, never permanently open - see ---
// --- that file's own comment on why a permanently-open registration would silently disable ---
// --- Journey A/B's own action discovery forever after the first navigation). ---
function registerFakeNavigateTo(window, spies) {
  const targets = { dashboard: () => spies.navigated.push('dashboard'), settings: () => spies.navigated.push('settings') };
  window.TradeJournalAIProcessRegistry.register('navigate-to', {
    allowlist: ['domainId'],
    isOpen: () => { const wf = window.TradeJournalAIWorkflowEngine.current(); return !!(wf && wf.actionId === 'navigate.to'); }
  });
  window.TradeJournalAIActionRegistry.registerAction({
    id: 'navigate.to', requiredFields: ['domainId'], optionalFields: [],
    normalizeField: (path, value) => (path === 'domainId' && targets[value]) ? value : null,
    submit: (known) => { targets[known.domainId](); return { navigated: true, domainId: known.domainId }; }
  });
}

test('navigate.to actually invokes the real navigation target once domainId is known, then clears - Knowledge -> Planner -> a registered Action, never arbitrary DOM mutation', async () => {
  const spies = { navigated: [] };
  const window = await coreSandbox({
    withWorkflowEngine: true,
    fetch: async () => ({ ok: true, json: async () => ({ reply: 'Taking you to the Dashboard.', action: { id: 'navigate.to', fields: [{ path: 'domainId', value: 'dashboard' }] }, provider: 'openai', usage: { totalTokens: 3 } }) })
  });
  registerFakeNavigateTo(window, spies);
  window.TradeJournalAIWorkflowEngine.setSubmitGraceMs(10);

  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'take me to the dashboard', therapistMode: false, transcript: [] });
  assert.equal(result.kind, 'workflow');

  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.deepEqual(spies.navigated, ['dashboard']);
  assert.equal(window.TradeJournalAIWorkflowEngine.current(), null, 'the workflow completes and clears once the grace window elapses');
});

test('navigate.to\'s own fake process is never permanently "open" - a later, unrelated action is still discoverable afterward', async () => {
  const spies = { navigated: [] };
  let secondFetchBody = null;
  const window = await coreSandbox({
    withWorkflowEngine: true,
    fetch: async (url, options) => {
      const body = JSON.parse(options.body);
      if (!secondFetchBody && body.message === 'start a session') { secondFetchBody = body; return { ok: true, json: async () => ({ reply: 'ok', action: null, provider: 'openai', usage: { totalTokens: 1 } }) }; }
      return { ok: true, json: async () => ({ reply: 'Taking you to Settings.', action: { id: 'navigate.to', fields: [{ path: 'domainId', value: 'settings' }] }, provider: 'openai', usage: { totalTokens: 3 } }) };
    }
  });
  registerFakeNavigateTo(window, spies);
  window.TradeJournalAIActionRegistry.registerAction({ id: 'session.create', available: () => true });
  window.TradeJournalAIWorkflowEngine.setSubmitGraceMs(10);

  await window.TradeJournalChatDockCore.sendChat({ text: 'take me to settings', therapistMode: false, transcript: [] });
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.deepEqual(spies.navigated, ['settings']);

  await window.TradeJournalChatDockCore.sendChat({ text: 'start a session', therapistMode: false, transcript: [] });
  assert.ok(secondFetchBody, 'a later, unrelated request must actually reach the availableActions branch');
  assert.ok(Array.isArray(secondFetchBody.availableActions) && secondFetchBody.availableActions.some((a) => a.id === 'session.create'), 'session.create must still be offered - navigate.to\'s own process must not still be reporting itself open');
});

test('a productContext build() failure never breaks the actual chat turn - purely additive, never load-bearing', async () => {
  let fetchCall = null;
  const window = await coreSandbox({
    withKnowledgeBase: true,
    fetch: async (url, options) => { fetchCall = { url, body: JSON.parse(options.body) }; return { ok: true, json: async () => ({ reply: 'still works', suggestions: [], provider: 'openai', usage: { totalTokens: 1 } }) }; }
  });
  window.TradeJournalAIContextBuilder.build = () => { throw new Error('boom'); };
  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'anything', therapistMode: false, transcript: [] });
  assert.equal(result.reply, 'still works');
  assert.equal(fetchCall.body.productContext, undefined);
});

// --- Production repair pass, section 12: debugLastTurn() dev diagnostic ---

test('debugLastTurn() is null before any turn has ever run', async () => {
  const window = await coreSandbox({});
  assert.equal(window.TradeJournalChatDockCore.debugLastTurn(), null);
});

test('debugLastTurn() reports a real workflow start - action id, availableActions offered, and the field paths actually applied (never the values)', async () => {
  const spies = { applied: [], opened: 0, submitted: null, resultContext: null };
  const window = await coreSandbox({
    withWorkflowEngine: true,
    fetch: async () => ({ ok: true, json: async () => ({ reply: 'Starting your New York session - what timeframe?', action: { id: 'session.create', fields: [{ path: 'city', value: 'New York' }] }, provider: 'openai', usage: { totalTokens: 5 } }) })
  });
  registerFakeSessionCreate(window, spies);

  await window.TradeJournalChatDockCore.sendChat({ text: 'Start a New York session', therapistMode: false, transcript: [] });
  const debug = window.TradeJournalChatDockCore.debugLastTurn();

  assert.equal(debug.activeProcessBefore, null);
  assert.deepEqual(clone(debug.availableActionIds), ['session.create']);
  assert.equal(debug.modelActionId, 'session.create');
  assert.equal(debug.workflowStarted, true);
  assert.equal(debug.workflowContinued, false);
  assert.deepEqual(clone(debug.fieldsAppliedPaths), ['city']);
  assert.equal(debug.processAfterOpen, 'session-create');
  const json = JSON.stringify(debug);
  assert.ok(json.indexOf('New York') === -1, 'must report the field PATH, never the actual value');
});

test('debugLastTurn() reports action.id: null turns as neither started nor continued', async () => {
  const spies = { applied: [], opened: 0, submitted: null, resultContext: null };
  const window = await coreSandbox({
    withWorkflowEngine: true,
    fetch: async () => ({ ok: true, json: async () => ({ reply: 'Sure, here is an answer.', action: null, provider: 'openai', usage: { totalTokens: 2 } }) })
  });
  registerFakeSessionCreate(window, spies);

  await window.TradeJournalChatDockCore.sendChat({ text: 'what is my average risk?', therapistMode: false, transcript: [] });
  const debug = window.TradeJournalChatDockCore.debugLastTurn();

  assert.equal(debug.modelActionId, null);
  assert.equal(debug.workflowStarted, false);
  assert.equal(debug.workflowContinued, false);
});

test('debugLastTurn() marks a therapist-mode turn distinctly, rather than showing stale action-discovery data', async () => {
  const mentalHealthStore = { load: () => ({ chatHistory: [] }), addMessage: (profile) => profile };
  const mentalHealthAI = { chat: async () => ({ flagged: false, reply: 'ok', suggestions: [] }) };
  const window = await coreSandbox({ mentalHealthStore, mentalHealthAI });
  await window.TradeJournalChatDockCore.sendChat({ text: 'I feel anxious', therapistMode: true, transcript: [] });
  assert.equal(window.TradeJournalChatDockCore.debugLastTurn().path, 'therapist');
});

// --- Latency pass: deterministic single-missing-field slot fast path (sections 4-6, 33) ---
// H1's own required proof: a genuinely deterministic continuation must reach zero AI calls, not
// merely a faster one - every test below uses coreSandbox()'s own DEFAULT fetch stub (which
// throws if ever called at all - see coreSandbox()'s own `fetch: overrides.fetch || (async () =>
// { throw ... })`), so a test passing at all IS the proof fetch was never reached.

test('a workflow with exactly one missing field, answered with a short, unambiguous bare value, resolves with zero AI calls (fetch is never called)', async () => {
  const spies = { applied: [], opened: 0, submitted: null, resultContext: null };
  const window = await coreSandbox({ withWorkflowEngine: true }); // no fetch override - default throws if called
  registerFakeSessionCreate(window, spies);
  window.TradeJournalAIWorkflowEngine.start('session.create', {}, [{ path: 'city', value: 'New York' }]);
  await window.TradeJournalAIWorkflowEngine.applyKnownFields([{ path: 'city', value: 'New York' }], {});

  const result = await window.TradeJournalChatDockCore.sendChat({ text: '5 minutes', therapistMode: false, transcript: [] });

  assert.equal(result.kind, 'workflow');
  assert.deepEqual(clone(spies.applied), [['city', 'New York'], ['timeframe', '5m']]);
  const debug = window.TradeJournalChatDockCore.debugLastTurn();
  assert.equal(debug.path, 'slot-fill');
  assert.equal(debug.field, 'timeframe');
});

test('a numeric-field slot fast path (e.g. a bare "65500" answering an exitPrice-shaped field) is language-agnostic - no label word or EN/FA text required, since a bare digit string is unambiguous in any of the four supported languages', async () => {
  const spies = { applied: [] };
  const window = await coreSandbox({ withWorkflowEngine: true });
  window.TradeJournalAIProcessRegistry.register('trade-close-position', { allowlist: ['exitPrice'], isOpen: () => true, applyValue: (path, value) => spies.applied.push([path, value]) });
  window.TradeJournalAIActionRegistry.registerAction({ id: 'trade.close', requiredFields: ['exitPrice'], optionalFields: [], open: () => ({ processId: 'trade-close-position' }), submit: async () => ({}), resultContext: () => {} });
  window.TradeJournalAIWorkflowEngine.start('trade.close', {}, []);
  await window.TradeJournalAIWorkflowEngine.applyKnownFields([], {});

  const result = await window.TradeJournalChatDockCore.sendChat({ text: '65500', therapistMode: false, transcript: [] });

  assert.equal(result.kind, 'workflow');
  assert.deepEqual(clone(spies.applied), [['exitPrice', 65500]]);
});

test('ambiguous text with no confident extractable value for the one missing field falls straight through to the normal AI path - never guessed locally', async () => {
  const spies = { applied: [], opened: 0, submitted: null, resultContext: null };
  let fetchCalled = false;
  const window = await coreSandbox({
    withWorkflowEngine: true,
    fetch: async () => { fetchCalled = true; return { ok: true, json: async () => ({ reply: 'ok', suggestions: [], provider: 'openai', usage: { totalTokens: 1 } }) }; }
  });
  registerFakeSessionCreate(window, spies);
  window.TradeJournalAIWorkflowEngine.start('session.create', {}, [{ path: 'city', value: 'New York' }]);
  await window.TradeJournalAIWorkflowEngine.applyKnownFields([{ path: 'city', value: 'New York' }], {});

  await window.TradeJournalChatDockCore.sendChat({ text: 'Change it', therapistMode: false, transcript: [] });

  assert.equal(fetchCalled, true, 'a message with no confidently-extractable value must still reach the model, never be guessed at');
});

test('a message longer than the conservative length cap falls through to the AI path even if it happens to contain a valid-looking token, since something else could plausibly be riding along with it', async () => {
  const spies = { applied: [], opened: 0, submitted: null, resultContext: null };
  let fetchCalled = false;
  const window = await coreSandbox({
    withWorkflowEngine: true,
    fetch: async () => { fetchCalled = true; return { ok: true, json: async () => ({ reply: 'ok', suggestions: [{ path: 'timeframe', value: '5m', mode: 'replace' }], provider: 'openai', usage: { totalTokens: 1 } }) }; }
  });
  registerFakeSessionCreate(window, spies);
  window.TradeJournalAIWorkflowEngine.start('session.create', {}, [{ path: 'city', value: 'New York' }]);
  await window.TradeJournalAIWorkflowEngine.applyKnownFields([{ path: 'city', value: 'New York' }], {});

  await window.TradeJournalChatDockCore.sendChat({ text: 'Sorry, let\'s actually go with 5 minutes instead please', therapistMode: false, transcript: [] });

  assert.equal(fetchCalled, true, 'a longer message must not be bare-matched, even though it contains a recognizable timeframe token');
});

test('a fully-known workflow (nothing left missing) is never mistaken for a one-missing-field slot fast path target - falls through to normal handling', async () => {
  const spies = { applied: [], opened: 0, submitted: null, resultContext: null };
  let fetchCalled = false;
  const window = await coreSandbox({
    withWorkflowEngine: true,
    fetch: async () => { fetchCalled = true; return { ok: true, json: async () => ({ reply: 'ok', suggestions: [], provider: 'openai', usage: { totalTokens: 1 } }) }; }
  });
  registerFakeSessionCreate(window, spies);
  window.TradeJournalAIWorkflowEngine.setSubmitGraceMs(20000); // long enough that the workflow is still 'pending-submit', not yet cleared, when the next message arrives
  window.TradeJournalAIWorkflowEngine.start('session.create', {}, [{ path: 'city', value: 'New York' }]);
  await window.TradeJournalAIWorkflowEngine.applyKnownFields([{ path: 'city', value: 'New York' }, { path: 'timeframe', value: '5m' }], {});
  assert.deepEqual(window.TradeJournalAIWorkflowEngine.current().missing, [], 'both required fields are already known going into the next turn');

  await window.TradeJournalChatDockCore.sendChat({ text: 'ok', therapistMode: false, transcript: [] });

  assert.equal(fetchCalled, true, 'nothing is missing, so there is no single field left for the slot fast path to even consider');
});

// --- Latency pass, section 15: destructive/consequential confirmations skip the correction grace
// window entirely (an explicit yes/no has nothing left to "correct"), other actions are unaffected ---

test('confirming a gate-field-only workflow (F37\'s existing fast path) completes with zero grace delay - submit() runs immediately, not after the normal SUBMIT_GRACE_MS window', async () => {
  const spies = { submitted: null };
  const window = await coreSandbox({ withWorkflowEngine: true });
  window.TradeJournalAIProcessRegistry.register('pattern-delete-confirm', { allowlist: ['confirm'], isOpen: () => true });
  window.TradeJournalAIActionRegistry.registerAction({
    id: 'pattern.delete', requiredFields: ['confirm'], optionalFields: [],
    open: () => ({ processId: 'pattern-delete-confirm' }),
    submit: async (known) => { spies.submitted = known; return { deleted: true }; }, resultContext: () => {}
  });
  window.TradeJournalAIWorkflowEngine.setSubmitGraceMs(5000); // the normal, much longer grace window every other action keeps
  window.TradeJournalAIWorkflowEngine.start('pattern.delete', {}, []);
  await window.TradeJournalAIWorkflowEngine.applyKnownFields([], {});

  await window.TradeJournalChatDockCore.sendChat({ text: 'Yes.', therapistMode: false, transcript: [] });
  // A single macrotask tick, not a real sleep - a 0ms setTimeout still needs one tick to actually
  // fire (it is not synchronous), but this is nowhere close to enough time for the OLD 5000ms
  // grace to have elapsed - so this still proves zero-grace scheduling, not merely "eventually".
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(clone(spies.submitted), { confirm: true }, 'submit() must have already run - zero grace for an explicit gate-field confirmation');
  assert.equal(window.TradeJournalAIWorkflowEngine.current(), null, 'the workflow must already be cleared, not sitting in pending-submit');
  // The engine's own grace setting must be restored afterward - a later, ordinary (non-gate)
  // workflow in the same page session must keep its real correction window.
  assert.equal(window.TradeJournalAIWorkflowEngine.getSubmitGraceMs(), 5000);
});

// --- Persian Voice Quality gate, section 22/23: the zero-network fast paths above must not
// speak the same flat, formal string for every event - a Voice turn now gets a field-aware,
// natural Persian acknowledgement (via ai-voice-text.js's spokenSlotFilled/spokenConfirmation),
// while the WRITTEN reply shown in the transcript is completely unaffected (section 12). EN/AR/ES
// get exactly the same behavior as before this gate (voiceReply: null, so chatDockView.jsx's own
// `toSpeak = result.voiceReply || result.reply` falls back to the unchanged generic text).

test('Persian slot-fill: the written reply stays the existing generic aiDockSlotFilled string, but voiceReply is a natural, field-aware Persian acknowledgement', async () => {
  const spies = { applied: [] };
  const window = await coreSandbox({ withWorkflowEngine: true });
  window.document.documentElement.lang = 'fa';
  registerFakeSessionCreate(window, spies);
  window.TradeJournalAIWorkflowEngine.start('session.create', {}, [{ path: 'city', value: 'New York' }]);
  await window.TradeJournalAIWorkflowEngine.applyKnownFields([{ path: 'city', value: 'New York' }], {});

  const result = await window.TradeJournalChatDockCore.sendChat({ text: '5 minutes', therapistMode: false, transcript: [] });

  assert.equal(result.kind, 'workflow');
  // chat-dock-core.js itself only decides the PHRASING (field-aware vs. generic) - the actual
  // spoken-number spelling ("5m" -> "پنج دقیقه") is chatDockView.jsx's own toSpokenText() pass,
  // applied just before speak() (see tests/ai-voice-text.test.mjs's own
  // "spokenSlotFilled composes with number normalization downstream" test for that full chain).
  assert.equal(result.reply, '5m ثبت شد.', 'the written reply keeps the existing generic, polished phrasing - never made colloquial');
  assert.equal(result.voiceReply, 'اوکی، شد 5m.', 'the spoken form is field-aware phrasing distinct from the generic written reply');
});

test('English slot-fill: voiceReply is null (unchanged from before this gate) - chatDockView.jsx falls back to the same written reply for speech', async () => {
  const spies = { applied: [] };
  const window = await coreSandbox({ withWorkflowEngine: true }); // document.documentElement.lang defaults to 'en'
  registerFakeSessionCreate(window, spies);
  window.TradeJournalAIWorkflowEngine.start('session.create', {}, [{ path: 'city', value: 'New York' }]);
  await window.TradeJournalAIWorkflowEngine.applyKnownFields([{ path: 'city', value: 'New York' }], {});

  const result = await window.TradeJournalChatDockCore.sendChat({ text: '5 minutes', therapistMode: false, transcript: [] });

  assert.equal(result.reply, 'Set to 5m.');
  assert.equal(result.voiceReply, null);
});

test('Persian gate confirmation (Yes./No.): voiceReply speaks the directive\'s own natural phrasing, written reply unchanged', async () => {
  const confirmWindow = await coreSandbox({ withWorkflowEngine: true });
  confirmWindow.document.documentElement.lang = 'fa';
  confirmWindow.TradeJournalAIProcessRegistry.register('pattern-delete-confirm', { allowlist: ['confirm'], isOpen: () => true });
  confirmWindow.TradeJournalAIActionRegistry.registerAction({
    id: 'pattern.delete', requiredFields: ['confirm'], optionalFields: [],
    open: () => ({ processId: 'pattern-delete-confirm' }), submit: async () => ({ deleted: true }), resultContext: () => {}
  });
  confirmWindow.TradeJournalAIWorkflowEngine.start('pattern.delete', {}, []);
  await confirmWindow.TradeJournalAIWorkflowEngine.applyKnownFields([], {});
  const confirmResult = await confirmWindow.TradeJournalChatDockCore.sendChat({ text: 'Yes.', therapistMode: false, transcript: [] });
  assert.equal(confirmResult.reply, 'تأیید شد.');
  assert.equal(confirmResult.voiceReply, 'باشه، تأیید شد.');

  const rejectWindow = await coreSandbox({ withWorkflowEngine: true });
  rejectWindow.document.documentElement.lang = 'fa';
  rejectWindow.TradeJournalAIProcessRegistry.register('pattern-delete-confirm', { allowlist: ['confirm'], isOpen: () => true });
  rejectWindow.TradeJournalAIActionRegistry.registerAction({
    id: 'pattern.delete', requiredFields: ['confirm'], optionalFields: [],
    open: () => ({ processId: 'pattern-delete-confirm' }), submit: async () => ({ deleted: true }), resultContext: () => {}
  });
  rejectWindow.TradeJournalAIWorkflowEngine.start('pattern.delete', {}, []);
  await rejectWindow.TradeJournalAIWorkflowEngine.applyKnownFields([], {});
  const rejectResult = await rejectWindow.TradeJournalChatDockCore.sendChat({ text: 'No.', therapistMode: false, transcript: [] });
  assert.equal(rejectResult.reply, 'باشه، لغو شد. چیزی حذف/منتشر/ارسال نشد.');
  assert.equal(rejectResult.voiceReply, 'باشه، لغوش کردم.');
});

// --- Latency pass, section 16: history persistence must never block the reply ---

test('appendExchange (an ongoing conversation) is fire-and-forget - sendChat() resolves without waiting for it, and a slow/never-resolving history call never delays or breaks the returned reply', async () => {
  let appendCalled = false;
  let resolveAppend;
  const historyStore = {
    appendExchange: (id, q, a, tokens) => { appendCalled = true; return new Promise((resolve) => { resolveAppend = resolve; }); },
    startConversation: async () => { throw new Error('must not be called - a conversationId is already supplied'); }
  };
  const window = await coreSandbox({
    historyStore,
    fetch: async () => ({ ok: true, json: async () => ({ reply: 'a real reply', suggestions: [], provider: 'openai', usage: { totalTokens: 1 } }) })
  });

  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'anything', therapistMode: false, transcript: [], conversationId: 'conv-1' });

  assert.equal(result.reply, 'a real reply', 'sendChat() must resolve with the real reply without ever awaiting appendExchange');
  assert.equal(appendCalled, true, 'the history call must still have been made - fire-and-forget, not skipped');
  assert.equal(result.conversationId, 'conv-1');
  // Never actually resolved above (resolveAppend was captured but never called) - proves sendChat()
  // truly did not await it, rather than merely resolving fast enough in practice.
  assert.equal(typeof resolveAppend, 'function');
});

// --- Latency pass, section 12: turn-type-aware reasoning/verbosity tuning is exercised through
// the same request body chat-dock-core.js actually sends (server-side coverage of the exact
// tiers themselves lives in tests/ai-dock-chat-quality.test.mjs) ---

test('debugLastLatency() reports a real AI call (turnType/provider/model/aiCallMade) after a normal network turn, and a zero-network record (aiCallMade:false) after a fast-path turn', async () => {
  const spies = { applied: [], opened: 0, submitted: null, resultContext: null };
  const window = await coreSandbox({
    withWorkflowEngine: true,
    fetch: async () => ({ ok: true, json: async () => ({ reply: 'ok', action: null, provider: 'openai', model: 'gpt-5.6', usage: { totalTokens: 3 }, serverTiming: { gatewayMs: 5, providerMs: 100, schemaBytes: 10, promptApproxChars: 40, historyMessages: 0 } }) })
  });
  registerFakeSessionCreate(window, spies);

  await window.TradeJournalChatDockCore.sendChat({ text: 'what is a Pattern?', therapistMode: false, transcript: [] });
  const networkLatency = window.TradeJournalChatDockCore.debugLastLatency();
  assert.equal(networkLatency.aiCallMade, true);
  assert.equal(networkLatency.provider, 'openai');

  window.TradeJournalAIWorkflowEngine.start('session.create', {}, [{ path: 'city', value: 'New York' }]);
  await window.TradeJournalAIWorkflowEngine.applyKnownFields([{ path: 'city', value: 'New York' }], {});
  await window.TradeJournalChatDockCore.sendChat({ text: '5 minutes', therapistMode: false, transcript: [] });
  const fastPathLatency = window.TradeJournalChatDockCore.debugLastLatency();
  assert.equal(fastPathLatency.aiCallMade, false);
  assert.equal(fastPathLatency.provider, null);
  assert.equal(fastPathLatency.providerMs, 0);
});

// Journey H2, Gate 1/2: the deterministic Conversation Router runs in the exact same "nothing
// already open" admission slot as action discovery (plus the new, narrower surface-help mode
// tested separately below) - these tests prove the real integration point inside sendChat()
// itself; the router's own matching/scoring logic is already covered independently by
// tests/ai-conversation-matcher.test.mjs and tests/ai-conversation-router.test.mjs.

test('a HIGH-confidence product-FAQ question resolves locally with zero AI calls (fetch is never called)', async () => {
  const window = await coreSandbox({ withConversationRouter: true, localStorage: bundleLocalStorage(buildFixtureBundleRows()) }); // no fetch override - default throws if called

  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'what is a session', therapistMode: false, transcript: [] });

  assert.equal(result.kind, 'assistant');
  assert.ok(result.reply.length > 0);
  assert.equal(result.voiceReply, result.reply);
  assert.deepEqual(clone(result.suggestions), []);
  assert.equal(result.activeProcess, null);
  const debug = window.TradeJournalChatDockCore.debugLastTurn();
  assert.equal(debug.path, 'conversation-router');
  assert.equal(debug.scenarioId, 'session.purpose');
});

// Journey H2 expressive/context follow-up (spec section 15): the ONE place a local scenario
// match is actually being delivered as a real turn is the exact place exposure gets recorded -
// spying on ai-conversation-router.js's own exported recordExposure() (rather than the network
// layer) isolates this file's own wiring from that function's internal fetch/localStorage
// mechanics, which are already covered independently in tests/ai-conversation-router.test.mjs.
test('sendChat() records exposure with the real scenarioKey/variantKey exactly once, right after a local router match resolves', async () => {
  const window = await coreSandbox({ withConversationRouter: true, localStorage: bundleLocalStorage(buildFixtureBundleRows()) });
  const calls = [];
  window.TradeJournalAIConversationRouter.recordExposure = (scenarioKey, variantKey) => { calls.push({ scenarioKey, variantKey }); };

  await window.TradeJournalChatDockCore.sendChat({ text: 'what is a session', therapistMode: false, transcript: [] });

  assert.deepEqual(calls, [{ scenarioKey: 'session.purpose', variantKey: 'standard' }]);
});

test('sendChat() never records exposure for a turn that falls through to the model - only a real local delivery counts', async () => {
  const window = await coreSandbox({
    withConversationRouter: true, localStorage: bundleLocalStorage(buildFixtureBundleRows()),
    fetch: async (url) => {
      if (String(url).indexOf('/api/ai/chat') !== -1) return { ok: true, json: async () => ({ reply: 'a real model answer', suggestions: [], provider: 'openai', usage: { totalTokens: 5 } }) };
      return { ok: true, json: async () => ({ version: 'v-test', scenarios: buildFixtureBundleRows() }) };
    }
  });
  const calls = [];
  window.TradeJournalAIConversationRouter.recordExposure = (scenarioKey, variantKey) => { calls.push({ scenarioKey, variantKey }); };

  await window.TradeJournalChatDockCore.sendChat({ text: 'why do I keep revenge trading after a loss?', therapistMode: false, transcript: [] });

  assert.deepEqual(calls, [], 'an LLM-fallback turn must never record a scenario exposure - it never matched a local scenario at all');
});

test('a genuinely ambiguous/open-ended question still reaches the model exactly once, whether or not the router is loaded', async () => {
  let chatFetchCalls = 0;
  const window = await coreSandbox({
    withConversationRouter: true, localStorage: bundleLocalStorage(buildFixtureBundleRows()),
    // A cache loaded from storage always forces one background bundle-refresh attempt on the
    // very next route() call (ai-conversation-router.js's own fetchedAt:0 convention) - a real,
    // separate, harmless network call to a different URL, unrelated to whether the model itself
    // gets called. Only /api/ai/chat counts toward the assertion this test actually cares about.
    fetch: async (url) => {
      if (String(url).indexOf('/api/ai/chat') !== -1) { chatFetchCalls++; return { ok: true, json: async () => ({ reply: 'a real model answer', suggestions: [], provider: 'openai', usage: { totalTokens: 5 } }) }; }
      return { ok: true, json: async () => ({ version: 'v-test', scenarios: buildFixtureBundleRows() }) };
    }
  });

  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'why do I keep revenge trading after a loss?', therapistMode: false, transcript: [] });

  assert.equal(chatFetchCalls, 1, 'a message the router cannot confidently resolve must still reach the model, exactly once');
  assert.equal(result.reply, 'a real model answer');
});

test('the router is never consulted while a real form is genuinely open - the exact same admission rule action discovery already uses', async () => {
  let chatFetchCalled = false;
  const window = await coreSandbox({
    withConversationRouter: true, localStorage: bundleLocalStorage(buildFixtureBundleRows()),
    // See the "genuinely ambiguous" test above for why only /api/ai/chat is counted - a cache
    // loaded from storage always attempts one incidental background bundle-refresh too, and
    // route() is still invoked here (in surface-help mode, since a real form is open), so that
    // refresh really does fire against this same mock.
    fetch: async (url) => {
      if (String(url).indexOf('/api/ai/chat') !== -1) { chatFetchCalled = true; return { ok: true, json: async () => ({ reply: 'plain answer', suggestions: [], provider: 'openai', usage: { totalTokens: 1 } }) }; }
      return { ok: true, json: async () => ({ version: 'v-test', scenarios: buildFixtureBundleRows() }) };
    }
  });
  window.TradeJournalAIProcessRegistry.register('session-create', { allowlist: ['city'], isOpen: () => true });

  // With nothing open, this exact text resolves HIGH-confidence locally (see the test above) -
  // with a real form open, it must fall straight through to the model instead, same as discovery.
  await window.TradeJournalChatDockCore.sendChat({ text: 'what is a session', therapistMode: false, transcript: [] });

  assert.equal(chatFetchCalled, true, 'a genuinely open form must suppress the router exactly as it suppresses action discovery');
});

// Journey H2, Gate 2: surface-help - a real form/editor is genuinely open, but the question is
// about THAT open form itself (a narrower, additive exception to the "nothing open" rule above).

test('a surface_help scenario resolves while its own real form is passively open, with zero AI calls, and the open form is left untouched', async () => {
  const window = await coreSandbox({
    withConversationRouter: true,
    localStorage: bundleLocalStorage(buildFixtureBundleRows().concat([buildSurfaceHelpFixtureRow()]))
  });
  window.TradeJournalAIProcessRegistry.register('strategy-editor-abc123', { allowlist: ['maxRiskPerTradePercent'], isOpen: () => true });

  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'what is risk management', therapistMode: false, transcript: [] });

  assert.equal(result.kind, 'assistant');
  assert.ok(result.reply.length > 0);
  assert.equal(result.activeProcess, null, 'the return shape never claims to have changed the real form - chatDockView.jsx only reads this for its own popover display');
  const debug = window.TradeJournalChatDockCore.debugLastTurn();
  assert.equal(debug.path, 'conversation-router');
  assert.equal(debug.scenarioId, 'strategy.risk_management.field_help');
  assert.equal(debug.resolutionKind, 'surface_help');
});

test('a surface_help scenario never resolves for a process outside its own allowedProcesses, and falls through to the model', async () => {
  let chatFetchCalled = false;
  const window = await coreSandbox({
    withConversationRouter: true,
    localStorage: bundleLocalStorage(buildFixtureBundleRows().concat([buildSurfaceHelpFixtureRow()])),
    fetch: async (url) => {
      if (String(url).indexOf('/api/ai/chat') !== -1) { chatFetchCalled = true; return { ok: true, json: async () => ({ reply: 'model answer', suggestions: [], provider: 'openai', usage: { totalTokens: 1 } }) }; }
      return { ok: true, json: async () => ({ version: 'v-test', scenarios: buildFixtureBundleRows() }) };
    }
  });
  window.TradeJournalAIProcessRegistry.register('pattern-editor-xyz', { allowlist: ['name'], isOpen: () => true });

  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'what is risk management', therapistMode: false, transcript: [] });

  assert.equal(chatFetchCalled, true);
  assert.equal(result.reply, 'model answer');
});

test('an active AI workflow targeting the EXACT same open process still blocks surface-help (a workflow always owns its own turn)', async () => {
  const window = await coreSandbox({
    withWorkflowEngine: true, withConversationRouter: true,
    localStorage: bundleLocalStorage(buildFixtureBundleRows().concat([buildSurfaceHelpFixtureRow()])),
    fetch: async () => ({ ok: true, json: async () => ({ reply: 'model answer', suggestions: [], provider: 'openai', usage: { totalTokens: 1 } }) })
  });
  window.TradeJournalAIProcessRegistry.register('strategy-editor-abc123', { allowlist: ['maxRiskPerTradePercent'], isOpen: () => true });
  window.TradeJournalAIActionRegistry.registerAction({
    id: 'strategy.edit', requiredFields: ['maxRiskPerTradePercent'], optionalFields: [],
    open: () => ({ processId: 'strategy-editor-abc123' }), submit: async () => ({}), resultContext: () => {}
  });
  window.TradeJournalAIWorkflowEngine.start('strategy.edit', {}, []);
  await window.TradeJournalAIWorkflowEngine.applyKnownFields([], {});

  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'what is risk management', therapistMode: false, transcript: [] });
  assert.equal(result.reply, 'model answer', 'a workflow actively mid-fill on this exact process must block surface-help too, not just generic discovery');
});

test('an active AI workflow targeting a DIFFERENT, unrelated process does not block surface-help for the passively-open one', async () => {
  const window = await coreSandbox({
    withWorkflowEngine: true, withConversationRouter: true,
    localStorage: bundleLocalStorage(buildFixtureBundleRows().concat([buildSurfaceHelpFixtureRow()]))
  });
  window.TradeJournalAIProcessRegistry.register('session-create', { allowlist: ['city'], isOpen: () => true });
  window.TradeJournalAIActionRegistry.registerAction({ id: 'session.create', requiredFields: ['city'], optionalFields: [], open: () => {}, submit: async () => ({}), resultContext: () => {} });
  window.TradeJournalAIWorkflowEngine.start('session.create', {}, []);
  // The real, passively-open Strategy editor is a SEPARATE process from the in-flight
  // session.create workflow above - registering it after start() mirrors a real page where both
  // can genuinely coexist.
  window.TradeJournalAIProcessRegistry.register('strategy-editor-abc123', { allowlist: ['maxRiskPerTradePercent'], isOpen: () => true });

  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'what is risk management', therapistMode: false, transcript: [] });
  const debug = window.TradeJournalChatDockCore.debugLastTurn();
  assert.equal(debug.path, 'conversation-router');
  assert.equal(debug.resolutionKind, 'surface_help');
});

// Journey H2, Gate 3: a HIGH-confidence local match with approved audio still makes zero
// /api/ai/chat calls (the H2.1/H2.2 invariant is unweakened), and the result carries the audio
// fields chatDockView.jsx's own resolver (tested independently in
// tests/ai-voice-output-resolver.test.mjs) later decides whether to actually use.
test('a HIGH-confidence match with approved audio still makes zero /api/ai/chat calls, and the result carries audioUrl/audioMimeType', async () => {
  const rows = buildFixtureBundleRows().map((row) => (row.scenarioKey === 'session.purpose'
    ? Object.assign({}, row, { audio: { en: { standard: { url: '/uploads/conversation-audio/x.mp3', mimeType: 'audio/mpeg' } } } })
    : row));
  const window = await coreSandbox({ withConversationRouter: true, localStorage: bundleLocalStorage(rows) }); // no fetch override - default throws if /api/ai/chat is ever called

  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'what is a session', therapistMode: false, transcript: [] });

  assert.equal(result.kind, 'assistant');
  assert.equal(result.audioUrl, '/uploads/conversation-audio/x.mp3');
  assert.equal(result.audioMimeType, 'audio/mpeg');
});

test('a HIGH-confidence match with no approved audio carries audioUrl: null, never throws', async () => {
  const window = await coreSandbox({ withConversationRouter: true, localStorage: bundleLocalStorage(buildFixtureBundleRows()) });
  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'what is a session', therapistMode: false, transcript: [] });
  assert.equal(result.audioUrl, null);
  assert.equal(result.audioMimeType, null);
});

// GPT-5.6 family (2026-08-29): end-to-end proof that the exact selected model string - not a
// provider name, not an alias - reaches the real /api/ai/chat request body, covering the task's
// explicit "Selecting Luna must send exactly gpt-5.6-luna, and Terra exactly gpt-5.6-terra".
// ai-settings-store.js only persists a saveSettings() patch through
// window.TradeJournalUserPreferences (Phase 8c) - coreSandbox() deliberately never loads the
// full server-replica.js/user-preferences.js/auth stack (irrelevant to what these two tests
// prove), so a minimal stub honoring the exact same getPref/setPref contract is wired in by
// hand, matching this file's own "stub only the pieces treated as external integration points"
// convention (see the coreSandbox() comment above).
function stubUserPreferences(window) {
  let stored = null;
  window.TradeJournalUserPreferences = {
    getPref: (key, fallback) => (key === 'aiSettings' && stored) ? stored : fallback,
    setPref: (key, value) => { if (key === 'aiSettings') stored = value; }
  };
}

test('selecting GPT-5.6 Luna sends exactly "gpt-5.6-luna" as the model in the /api/ai/chat request body', async () => {
  let fetchCall = null;
  const window = await coreSandbox({
    fetch: async (url, options) => { fetchCall = { url, body: JSON.parse(options.body) }; return { ok: true, json: async () => ({ reply: 'ok', suggestions: [], provider: 'openai', model: 'gpt-5.6-luna', usage: { totalTokens: 2 } }) }; }
  });
  stubUserPreferences(window);
  window.TradeJournalAISettingsStore.saveSettings({ provider: 'openai', modelByProvider: { openai: 'gpt-5.6-luna' } });

  await window.TradeJournalChatDockCore.sendChat({ text: 'hello', therapistMode: false, transcript: [] });

  assert.equal(fetchCall.url, '/api/ai/chat');
  assert.equal(fetchCall.body.provider, 'openai');
  assert.equal(fetchCall.body.model, 'gpt-5.6-luna', 'the exact API model id must be sent, never a display label or a rounded-off alias');
});

test('selecting GPT-5.6 Terra sends exactly "gpt-5.6-terra" as the model in the /api/ai/chat request body', async () => {
  let fetchCall = null;
  const window = await coreSandbox({
    fetch: async (url, options) => { fetchCall = { url, body: JSON.parse(options.body) }; return { ok: true, json: async () => ({ reply: 'ok', suggestions: [], provider: 'openai', model: 'gpt-5.6-terra', usage: { totalTokens: 2 } }) }; }
  });
  stubUserPreferences(window);
  window.TradeJournalAISettingsStore.saveSettings({ provider: 'openai', modelByProvider: { openai: 'gpt-5.6-terra' } });

  await window.TradeJournalChatDockCore.sendChat({ text: 'hello', therapistMode: false, transcript: [] });

  assert.equal(fetchCall.body.model, 'gpt-5.6-terra');
});
