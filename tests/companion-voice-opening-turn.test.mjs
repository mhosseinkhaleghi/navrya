import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Journey G UX correction, item 10: chat-dock-core.js's own deterministic fast path for a reply
// to a just-delivered Voice Companion opening (options.awaitingCompanionOpeningReply). Mirrors
// tests/companion-explain-mode.test.mjs's real-module sandbox convention exactly -
// TradeJournalAICompanionOrchestrator is faked here (its own real interpretVoiceOpeningReply()/
// resolveVoiceOpeningChoice() logic is covered directly in tests/ai-companion-orchestrator.
// test.mjs) so this file only asserts chat-dock-core.js's OWN wiring: when the fast path fires,
// when it falls through, and that it never exceeds one ordinary AI call either way.
const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = (file) => readFile(shared(file), 'utf8');

async function coreSandbox(overrides = {}) {
  const document = { documentElement: { lang: 'en' } };
  const fetchCalls = [];
  const fetchFn = overrides.fetch || (async (url, options) => {
    fetchCalls.push([url, options ? JSON.parse(options.body) : null]);
    return { ok: true, json: async () => ({ reply: 'A Pattern is a repeatable market behavior.', provider: 'openai', model: 'gpt-test', usage: { totalTokens: 9 } }) };
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
    TradeJournalAiChatHistoryStore: null, TradeJournalNavryaStore: null, TradeJournalNavryaLiveSession: null,
    TradeJournalTradeStore: { listSync: () => [] }, TradeJournalStrategyEducationStore: { find: () => null },
    TradeJournalMentalHealthStore: null, TradeJournalMentalHealthSafety: null,
    TradeJournalAICompanionOrchestrator: overrides.companionOrchestrator || {
      interpretVoiceOpeningReply: () => null,
      resolveVoiceOpeningChoice: () => ({ text: '' })
    }
  });
  const files = ['ai-i18n.js', 'ai-settings-store.js', 'ai-process-registry.js', 'ai-trade-actions.js', 'ai-proactive-engine.js', 'ai-signal-router.js', 'ai-deterministic-extraction.js', 'ai-context-engine.js', 'ai-action-registry.js', 'ai-workflow-engine.js'];
  for (const file of files) vm.runInNewContext(await source(file), sandbox, { filename: file });
  vm.runInNewContext(await source('chat-dock-core.js'), sandbox, { filename: 'chat-dock-core.js' });
  return { window: sandbox.window, fetchCalls };
}

test('"start" resolves with ZERO network calls, calling resolveVoiceOpeningChoice exactly once, and returns its real ack text', async () => {
  const resolveCalls = [];
  const { window, fetchCalls } = await coreSandbox({
    companionOrchestrator: {
      interpretVoiceOpeningReply: (text) => (text === 'lets start' ? 'start' : null),
      resolveVoiceOpeningChoice: (choice) => { resolveCalls.push(choice); return { text: 'Great, lets get started.' }; }
    }
  });
  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'lets start', therapistMode: false, transcript: [], awaitingCompanionOpeningReply: true });
  assert.equal(fetchCalls.length, 0, 'zero model calls for a deterministically-classified Start');
  assert.deepEqual(resolveCalls, ['start']);
  assert.equal(result.reply, 'Great, lets get started.');
  assert.equal(result.voiceReply, 'Great, lets get started.');
  assert.equal(result.kind, 'workflow');
});

test('"later" resolves with ZERO network calls the same way', async () => {
  const resolveCalls = [];
  const { window, fetchCalls } = await coreSandbox({
    companionOrchestrator: {
      interpretVoiceOpeningReply: (text) => (text === 'not now' ? 'later' : null),
      resolveVoiceOpeningChoice: (choice) => { resolveCalls.push(choice); return { text: 'Okay, whenever you are ready.' }; }
    }
  });
  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'not now', therapistMode: false, transcript: [], awaitingCompanionOpeningReply: true });
  assert.equal(fetchCalls.length, 0);
  assert.deepEqual(resolveCalls, ['later']);
  assert.equal(result.reply, 'Okay, whenever you are ready.');
});

test('"explain" makes exactly ONE AI call, with companionIntent forced to explain - the user\'s own real spoken words are still sent as the message', async () => {
  const { window, fetchCalls } = await coreSandbox({
    companionOrchestrator: { interpretVoiceOpeningReply: (text) => (/what is navrya/i.test(text) ? 'explain' : null), resolveVoiceOpeningChoice: () => ({ text: '' }) }
  });
  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'what is NAVRYA?', therapistMode: false, transcript: [], awaitingCompanionOpeningReply: true });
  assert.equal(fetchCalls.length, 1, 'never exceeds one ordinary main AI call');
  assert.equal(fetchCalls[0][1].companionIntent, 'explain');
  assert.equal(fetchCalls[0][1].message, 'what is NAVRYA?');
  assert.equal(result.kind, 'assistant');
});

test('an ambiguous reply (interpretVoiceOpeningReply returns null) falls straight through to the one ordinary AI turn - never blocked, never a second call', async () => {
  const { window, fetchCalls } = await coreSandbox({
    companionOrchestrator: { interpretVoiceOpeningReply: () => null, resolveVoiceOpeningChoice: () => ({ text: '' }) }
  });
  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'tell me about my last trade', therapistMode: false, transcript: [], awaitingCompanionOpeningReply: true });
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0][1].companionIntent, undefined, 'no explain-only mode forced for a genuinely ambiguous reply');
  assert.equal(result.kind, 'assistant');
});

test('the deterministic classifier never runs at all when awaitingCompanionOpeningReply is not set - an ordinary "lets start" message goes through the normal one-call path unaffected', async () => {
  const resolveCalls = [];
  const { window, fetchCalls } = await coreSandbox({
    companionOrchestrator: {
      interpretVoiceOpeningReply: (text) => { resolveCalls.push('interpreted:' + text); return 'start'; }, // would match if ever consulted
      resolveVoiceOpeningChoice: () => ({ text: 'should never be used' })
    }
  });
  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'lets start', therapistMode: false, transcript: [] });
  assert.deepEqual(resolveCalls, [], 'interpretVoiceOpeningReply must never even be consulted outside the narrow awaiting-reply window');
  assert.equal(fetchCalls.length, 1, 'falls through to the one ordinary AI call instead');
  assert.equal(result.kind, 'assistant');
});

test('a Start/Later resolution is recorded via the same zero-network debug/latency path as every other deterministic fast path', async () => {
  const { window } = await coreSandbox({
    companionOrchestrator: { interpretVoiceOpeningReply: () => 'start', resolveVoiceOpeningChoice: () => ({ text: 'ok' }) }
  });
  await window.TradeJournalChatDockCore.sendChat({ text: 'go', therapistMode: false, transcript: [], awaitingCompanionOpeningReply: true });
  const debug = window.TradeJournalChatDockCore.debugLastTurn();
  assert.equal(debug.path, 'companion-opening-reply');
  assert.equal(debug.choice, 'start');
  const latency = window.TradeJournalChatDockCore.debugLastLatency();
  assert.equal(latency.aiCallMade, false);
  assert.equal(latency.turnType, 'COMPANION_OPENING_REPLY');
});
