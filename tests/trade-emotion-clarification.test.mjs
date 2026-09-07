import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Context-aware conversational operation layer, sections 4 and 5: the pending-clarification
// contract (ai-clarification-state.js) and contextual trade-emotion routing end to end through
// the real chat-dock-core.js sendChat() pipeline. Same real-module VM sandbox convention as
// tests/companion-explain-mode.test.mjs: only fetch/DOM/the Trade Store faked, chat-dock-core.js
// and its real dependencies run unmodified.

const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = (file) => readFile(shared(file), 'utf8');

function trade(id, instrument, direction) { return { id, status: 'open', direction: direction || 'long', instrument, entryPrice: 100, stopLoss: 90, riskPercent: 1, outcome: null, linkedStrategyId: null }; }

async function coreSandbox(options = {}) {
  const openTrades = options.openTrades || [];
  const document = { documentElement: { lang: 'en' } };
  const fetchCalls = [];
  const fetchFn = options.fetch || (async (url, opts) => {
    fetchCalls.push([url, opts ? JSON.parse(opts.body) : null]);
    return { ok: true, json: async () => (options.response || { reply: 'ok', suggestions: [], provider: 'openai', model: 'gpt-test', usage: { totalTokens: 8 } }) };
  });
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
    TradeJournalTradeStore: { listSync: () => openTrades, find: (id) => openTrades.find((t) => t.id === id) || null },
    TradeJournalStrategyEducationStore: { find: () => null },
    TradeJournalMentalHealthStore: null,
    TradeJournalMentalHealthSafety: null,
    TradeJournalAIUserMemory: { getRelevantTrades: (q, ctx) => openTrades.filter((t) => !ctx || !ctx.status || t.status === ctx.status).slice(0, (ctx && ctx.recentCount) || 5) }
  });
  const files = ['ai-i18n.js', 'ai-settings-store.js', 'ai-process-registry.js', 'ai-trade-actions.js', 'ai-proactive-engine.js', 'ai-signal-router.js', 'ai-clarification-state.js', 'ai-deterministic-extraction.js', 'ai-context-engine.js', 'ai-action-registry.js', 'ai-workflow-engine.js'];
  for (const file of files) vm.runInNewContext(await source(file), sandbox, { filename: file });
  vm.runInNewContext(await source('chat-dock-core.js'), sandbox, { filename: 'chat-dock-core.js' });
  return { window: sandbox.window, fetchCalls };
}

function registerTradeEmotionLog(window, capture) {
  window.TradeJournalAIActionRegistry.registerAction({
    id: 'trade.emotion.log', domain: 'trades', riskLevel: 'low',
    requiredFields: [], optionalFields: ['note', 'stressLevel', 'dominantEmotions', 'pinnedTradeId'],
    available: () => true,
    open: (context, initialFields) => {
      const pinned = (initialFields || []).find((f) => f && f.path === 'pinnedTradeId');
      if (capture) capture.openedWith = pinned ? pinned.value : null;
      return { processId: 'trade-emotion-log' };
    },
    submit: () => undefined, resultContext: () => {}
  });
  window.TradeJournalAIProcessRegistry.register('trade-emotion-log', { allowlist: ['note', 'stressLevel', 'dominantEmotions'], isOpen: () => true });
}

test('a bare "I feel stressed" with ZERO open trades never intercepts the turn - falls through to the real network call exactly as before this feature', async () => {
  const { window, fetchCalls } = await coreSandbox({ openTrades: [] });
  registerTradeEmotionLog(window);
  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'I feel stressed.', therapistMode: false, transcript: [] });
  assert.equal(fetchCalls.length, 1, 'no open trades means nothing to ask about - the ordinary AI turn must still happen');
  assert.equal(result.kind, 'assistant');
});

test('a bare "I feel stressed" with exactly ONE open trade asks a real consent question, zero network calls, and stages a pending clarification', async () => {
  const { window, fetchCalls } = await coreSandbox({ openTrades: [trade('t1', 'XAUUSD')] });
  registerTradeEmotionLog(window);
  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'I feel stressed.', therapistMode: false, transcript: [], conversationId: 'c1' });
  assert.equal(fetchCalls.length, 0, 'staging a clarification must never cost a network round trip');
  assert.equal(result.kind, 'assistant');
  assert.match(result.reply, /XAUUSD/);
  assert.equal(window.TradeJournalAIWorkflowEngine.current(), null, 'no workflow starts until the user actually consents');
});

test('answering "yes" to a single-candidate consent clarification starts the real trade.emotion.log workflow with that trade pinned, zero network calls', async () => {
  const capture = {};
  const { window, fetchCalls } = await coreSandbox({ openTrades: [trade('t1', 'XAUUSD')] });
  registerTradeEmotionLog(window, capture);
  await window.TradeJournalChatDockCore.sendChat({ text: 'I feel stressed.', therapistMode: false, transcript: [], conversationId: 'c1' });
  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'yes', therapistMode: false, transcript: [], conversationId: 'c1' });
  assert.equal(fetchCalls.length, 0);
  assert.equal(result.kind, 'workflow');
  const current = window.TradeJournalAIWorkflowEngine.current();
  assert.ok(current, 'the real workflow must actually be started');
  assert.equal(current.actionId, 'trade.emotion.log');
  await current.pendingOpen; // let open()'s own resolution settle before checking what it captured
  assert.equal(capture.openedWith, 't1', 'the resolved trade must actually be pinned into open()');
});

test('answering "no" to a consent clarification clears it and starts nothing - no trade emotion entry is ever created', async () => {
  const { window, fetchCalls } = await coreSandbox({ openTrades: [trade('t1', 'XAUUSD')] });
  registerTradeEmotionLog(window);
  await window.TradeJournalChatDockCore.sendChat({ text: 'I feel stressed.', therapistMode: false, transcript: [], conversationId: 'c1' });
  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'no', therapistMode: false, transcript: [], conversationId: 'c1' });
  assert.equal(fetchCalls.length, 0);
  assert.equal(result.kind, 'assistant');
  assert.equal(window.TradeJournalAIWorkflowEngine.current(), null);
});

test('MULTIPLE open trades with a bare "I feel stressed" asks which trade, listing every real candidate - never guesses one', async () => {
  const { window, fetchCalls } = await coreSandbox({ openTrades: [trade('t1', 'XAUUSD'), trade('t2', 'EURUSD')] });
  registerTradeEmotionLog(window);
  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'I feel stressed.', therapistMode: false, transcript: [], conversationId: 'c1' });
  assert.equal(fetchCalls.length, 0);
  assert.match(result.reply, /XAUUSD/);
  assert.match(result.reply, /EURUSD/);
});

test('naming the exact trade by its own instrument in the follow-up reply resolves the multi-candidate clarification and starts the workflow pinned to that one', async () => {
  const capture = {};
  const { window } = await coreSandbox({ openTrades: [trade('t1', 'XAUUSD'), trade('t2', 'EURUSD')] });
  registerTradeEmotionLog(window, capture);
  await window.TradeJournalChatDockCore.sendChat({ text: 'I feel stressed.', therapistMode: false, transcript: [], conversationId: 'c1' });
  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'the XAUUSD one', therapistMode: false, transcript: [], conversationId: 'c1' });
  assert.equal(result.kind, 'workflow');
  const current = window.TradeJournalAIWorkflowEngine.current();
  await current.pendingOpen;
  assert.equal(capture.openedWith, 't1');
});

test('an ordinal reply ("the second one") to a multi-candidate clarification resolves the correct entity by position', async () => {
  const capture = {};
  const { window } = await coreSandbox({ openTrades: [trade('t1', 'XAUUSD'), trade('t2', 'EURUSD')] });
  registerTradeEmotionLog(window, capture);
  await window.TradeJournalChatDockCore.sendChat({ text: 'I feel stressed.', therapistMode: false, transcript: [], conversationId: 'c1' });
  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'the second one', therapistMode: false, transcript: [], conversationId: 'c1' });
  assert.equal(result.kind, 'workflow');
  const current = window.TradeJournalAIWorkflowEngine.current();
  await current.pendingOpen;
  assert.equal(capture.openedWith, 't2');
});

test('an explicit, unambiguous request naming the exact open trade - "log stress for my open XAUUSD trade" - skips the clarification question entirely and starts the workflow directly, zero network calls', async () => {
  const capture = {};
  const { window, fetchCalls } = await coreSandbox({ openTrades: [trade('t1', 'XAUUSD'), trade('t2', 'EURUSD')] });
  registerTradeEmotionLog(window, capture);
  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'Log stress seven and fear of hitting my stop for my open XAUUSD trade.', therapistMode: false, transcript: [], conversationId: 'c1' });
  assert.equal(fetchCalls.length, 0, 'an unambiguous target must never cost a wasted "which trade" round trip');
  assert.equal(result.kind, 'workflow');
  const current = window.TradeJournalAIWorkflowEngine.current();
  await current.pendingOpen;
  assert.equal(capture.openedWith, 't1');
});

test('the pre-existing UI-frustration false positive still applies with a real open trade available - "this app is stressing me out" never stages a clarification, falls through to the ordinary turn', async () => {
  const { window, fetchCalls } = await coreSandbox({ openTrades: [trade('t1', 'XAUUSD')] });
  registerTradeEmotionLog(window);
  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'This app is stressing me out.', therapistMode: false, transcript: [], conversationId: 'c1' });
  assert.equal(fetchCalls.length, 1);
  assert.equal(result.kind, 'assistant');
});

test('a clarification staged in one conversation is never answered by a reply sent in a DIFFERENT conversation - a genuinely new conversation invalidates it, the unrelated message falls through to the ordinary turn instead', async () => {
  const { window, fetchCalls } = await coreSandbox({ openTrades: [trade('t1', 'XAUUSD')] });
  registerTradeEmotionLog(window);
  await window.TradeJournalChatDockCore.sendChat({ text: 'I feel stressed.', therapistMode: false, transcript: [], conversationId: 'c1' });
  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'yes', therapistMode: false, transcript: [], conversationId: 'c2' });
  assert.equal(fetchCalls.length, 1, 'the conversation-2 "yes" is unrelated chat, not an answer to conversation-1\'s clarification - it must reach the real network path');
  assert.equal(window.TradeJournalAIWorkflowEngine.current(), null);
});

test('an ambiguous reply to a pending clarification leaves it untouched and falls through to the ordinary turn, mirroring Journey C\'s own pending-confirmation precedent exactly', async () => {
  const { window, fetchCalls } = await coreSandbox({ openTrades: [trade('t1', 'XAUUSD')] });
  registerTradeEmotionLog(window);
  await window.TradeJournalChatDockCore.sendChat({ text: 'I feel stressed.', therapistMode: false, transcript: [], conversationId: 'c1' });
  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'What does RSI mean?', therapistMode: false, transcript: [], conversationId: 'c1' });
  assert.equal(fetchCalls.length, 1, 'a genuinely unrelated question must still reach the real network path');
  // the clarification is still pending afterward - answering it later still works.
  const followUp = await window.TradeJournalChatDockCore.sendChat({ text: 'yes', therapistMode: false, transcript: [], conversationId: 'c1' });
  assert.equal(followUp.kind, 'workflow');
});

test('ai-clarification-state.js: a stale (expired) clarification is pruned automatically and never resolved against a later reply', async () => {
  const { window } = await coreSandbox({ openTrades: [] });
  const state = window.TradeJournalAIClarificationState;
  state.stage({ conversationId: 'c1', candidateEntities: [{ id: 't1', label: 'XAUUSD' }], kind: 'trade-emotion-consent', ttlMs: -1 });
  assert.equal(state.getValid(), null, 'a clarification staged already-expired must never be returned as valid');
});
