import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = file => readFile(shared(file), 'utf8');

// Loads the real ai-i18n.js, ai-settings-store.js and ai-process-registry.js modules alongside
// chat-dock-core.js in one sandbox, then stubs only the pieces the module deliberately treats
// as external integration points (trade store/UI, mental-health store/AI, fetch) - the same
// approach the retired global-ai-dock.test.mjs used, now against the DOM-free core the NAVRYA
// ChatDock (navrya-src/chatDockView.jsx) calls into.
async function coreSandbox(overrides) {
  const document = { documentElement: { lang: 'en' } };
  const sandbox = {
    window: {}, document, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    fetch: overrides.fetch || (async () => { throw new Error('fetch must not be called in this test'); }),
    Set, Math, JSON, console, Date
  };
  sandbox.window = Object.assign(sandbox.window, {
    document, localStorage: sandbox.localStorage, fetch: sandbox.fetch,
    TradeJournalMentalHealthStore: overrides.mentalHealthStore,
    TradeJournalMentalHealthAI: overrides.mentalHealthAI,
    TradeJournalAIUsage: overrides.aiUsage || { record() {} }
  });
  for (const file of ['ai-i18n.js', 'ai-settings-store.js', 'ai-process-registry.js']) {
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
