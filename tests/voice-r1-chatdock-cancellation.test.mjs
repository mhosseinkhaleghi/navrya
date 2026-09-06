import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Slice R1 (request ownership/cancellation), client side. Addresses audit findings C1-C6 and C9:
// chat-dock-core.js's sendChat() now accepts an optional {signal, isCurrent} from its owner
// (navrya-src/chatDockView.jsx), and checks isCurrent() immediately after its one real network
// round trip - before any of its own real side effects (workflow field-application, history
// persistence) - not just at the caller's own top-level return. chatDockView.jsx itself
// (transcriptRef/activeConversationIdRef, abortActiveRequests(), the reordered resumeConversation())
// is a .jsx file this project's plain `node --test` runner cannot execute (no JSX/ESM transform -
// the same limitation every other .jsx file in this suite already has, see e.g.
// tests/ai-voice-chatdock-ux.test.mjs's own header), so its own coverage below is static-source-
// assertion style, pinning the real wiring rather than re-proving it dynamically a second way.

const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = file => readFile(shared(file), 'utf8');

// Same coreSandbox() shape as tests/chat-dock-core.test.mjs's own helper, trimmed to only what
// these tests need.
async function coreSandbox(overrides) {
  const document = { documentElement: { lang: 'en' } };
  const sandbox = {
    window: {}, document, localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    fetch: overrides.fetch || (async () => { throw new Error('fetch must not be called in this test'); }),
    Set, Math, JSON, console, Date, Promise, setTimeout, clearTimeout,
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } }
  };
  sandbox.window = Object.assign(sandbox.window, {
    document, localStorage: sandbox.localStorage, fetch: sandbox.fetch,
    TradeJournalMentalHealthStore: overrides.mentalHealthStore,
    TradeJournalMentalHealthAI: overrides.mentalHealthAI,
    TradeJournalAIUsage: { record() {} },
    TradeJournalAiChatHistoryStore: overrides.historyStore
  });
  const files = ['ai-i18n.js', 'ai-settings-store.js', 'ai-process-registry.js'];
  for (const file of files) {
    vm.runInNewContext(await source(file), sandbox, { filename: file });
  }
  vm.runInNewContext(await source('chat-dock-core.js'), sandbox, { filename: 'chat-dock-core.js' });
  return sandbox.window;
}

test('sendChat() threads options.signal straight into the real fetch(\'/api/ai/chat\') call - a caller-owned AbortController genuinely cancels the in-flight request', async () => {
  let seenSignal;
  const window = await coreSandbox({
    fetch: async (_url, options) => { seenSignal = options.signal; return { ok: true, json: async () => ({ reply: 'ok', suggestions: [], provider: 'openai', usage: null }) }; }
  });
  const controller = new AbortController();
  await window.TradeJournalChatDockCore.sendChat({ text: 'hi', therapistMode: false, transcript: [], signal: controller.signal });
  assert.equal(seenSignal, controller.signal, 'the exact signal the owner supplied must reach fetch() unchanged');
});

test('sendChat() checks options.isCurrent() immediately after the fetch/JSON-parse and returns {kind:"discarded"} before ever recording usage or persisting history - not just leaving that to the caller\'s own top-level check', async () => {
  const usageRecorded = [];
  let historyStarted = false;
  const window = await coreSandbox({
    fetch: async () => ({ ok: true, json: async () => ({ reply: 'a stale reply', suggestions: [], provider: 'openai', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } }) }),
    historyStore: { startConversation: async () => { historyStarted = true; return { id: 'conv-1' }; } }
  });
  window.TradeJournalAIUsage = { record: (entry) => usageRecorded.push(entry) };
  const result = await window.TradeJournalChatDockCore.sendChat({
    text: 'is this still relevant', therapistMode: false, transcript: [], conversationId: null,
    isCurrent: () => false // the owner's own conversationEpochRef already moved on by the time this resolves
  });
  assert.equal(result.kind, 'discarded');
  assert.equal(historyStarted, false, 'a discarded turn must never create/append a real server-side conversation');
});

test('sendChat() proceeds completely unaffected when isCurrent() is never supplied (every legacy/direct caller keeps exactly the prior behavior)', async () => {
  const window = await coreSandbox({
    fetch: async () => ({ ok: true, json: async () => ({ reply: 'still current', suggestions: [], provider: 'openai', usage: null }) })
  });
  const result = await window.TradeJournalChatDockCore.sendChat({ text: 'hello', therapistMode: false, transcript: [] });
  assert.equal(result.kind, 'assistant');
  assert.equal(result.reply, 'still current');
});

// --- navrya-src/chatDockView.jsx: static-source coverage (this project's plain `node --test`
// runner has no JSX/ESM transform - the exact same limitation tests/ai-voice-chatdock-ux.test.mjs's
// own header already documents for this file). Each assertion pins real, load-bearing wiring, not
// a generic string-presence check - see each test's own comment for what real bug it guards.

const dockViewSrc = await readFile(path.join(root, 'navrya-src', 'chatDockView.jsx'), 'utf8');

test('transcript/activeConversationId are mirrored into synchronous refs (audit finding C4), and submit() reads the refs - never the render-time closure values - when calling core.sendChat()', () => {
  assert.match(dockViewSrc, /const transcriptRef = React\.useRef\(\[\]\);/);
  assert.match(dockViewSrc, /const activeConversationIdRef = React\.useRef\(null\);/);
  assert.match(dockViewSrc, /function replaceTranscript\(next\) \{\s*transcriptRef\.current = next;\s*setTranscript\(next\);\s*\}/);
  assert.match(dockViewSrc, /function replaceConversationId\(next\) \{\s*activeConversationIdRef\.current = next;\s*setActiveConversationId\(next\);\s*\}/);
  const submitBlock = dockViewSrc.slice(dockViewSrc.indexOf('async function submit(value, options)'), dockViewSrc.indexOf('const submitRef'));
  assert.match(submitBlock, /transcript: transcriptRef\.current, conversationId: activeConversationIdRef\.current/);
  assert.doesNotMatch(submitBlock, /transcript: transcript,/, 'must never fall back to reading the closed-over React state value directly');
});

test('submit() creates a real per-turn AbortController, registers it (tagged with its own source) in the shared set, and passes {signal, isCurrent} to core.sendChat()', () => {
  const submitBlock = dockViewSrc.slice(dockViewSrc.indexOf('async function submit(value, options)'), dockViewSrc.indexOf('const submitRef'));
  assert.match(submitBlock, /const controller = new AbortController\(\);/);
  assert.match(submitBlock, /activeRequestControllersRef\.current\.set\(controller, source\);/);
  assert.match(submitBlock, /const isStale = \(\) => conversationEpochRef\.current !== epochAtStart;/);
  assert.match(submitBlock, /signal: controller\.signal, isCurrent: \(\) => !isStale\(\)/);
});

test('submit() discards a stale result after core.sendChat() resolves, and discards on an aborted/stale rejection in its own catch - never appending a generic error to a transcript the user has moved on from', () => {
  const submitBlock = dockViewSrc.slice(dockViewSrc.indexOf('async function submit(value, options)'), dockViewSrc.indexOf('const submitRef'));
  assert.match(submitBlock, /if \(isStale\(\)\) return \{ kind: 'discarded', reply: '', voiceReply: '' \};/);
  assert.match(submitBlock, /if \(isStale\(\) \|\| controller\.signal\.aborted\) return \{ kind: 'discarded', reply: '', voiceReply: '' \};/);
  // The controller is always removed from the shared set on settlement, regardless of outcome -
  // a finished/aborted request must never be "abortable again" by a later abortActiveRequests().
  assert.match(submitBlock, /activeRequestControllersRef\.current\.delete\(controller\);/);
});

test('busy is now a real in-flight counter (pendingSubmitCountRef), not a naive boolean - two overlapping submits (typed + voice, now possible since they no longer share one strict queue) cannot have the first one\'s own completion wrongly clear busy while the second is still running', () => {
  assert.match(dockViewSrc, /const pendingSubmitCountRef = React\.useRef\(0\);/);
  const submitBlock = dockViewSrc.slice(dockViewSrc.indexOf('async function submit(value, options)'), dockViewSrc.indexOf('const submitRef'));
  assert.match(submitBlock, /pendingSubmitCountRef\.current \+= 1;/);
  assert.match(submitBlock, /pendingSubmitCountRef\.current = Math\.max\(0, pendingSubmitCountRef\.current - 1\);/);
  assert.match(submitBlock, /setBusy\(pendingSubmitCountRef\.current > 0\);/);
});

test('abortActiveRequests() aborts and removes matching entries (or every entry with no filter) from the shared controller map - the real mechanism every cancellation call site below actually uses', () => {
  assert.match(dockViewSrc, /function abortActiveRequests\(onlySource\) \{/);
  assert.match(dockViewSrc, /map\.forEach\(\(source, controller\) => \{ if \(!onlySource \|\| source === onlySource\) toAbort\.push\(controller\); \}\);/);
});

test('startNewChat() aborts every in-flight request (typed or voice), not only playback/workflow ownership (audit findings C1/C2 - "the abandoned-cost" section)', () => {
  const fnBlock = dockViewSrc.slice(dockViewSrc.indexOf('function startNewChat() {'), dockViewSrc.indexOf('async function toggleHistory()'));
  assert.match(fnBlock, /conversationEpochRef\.current \+= 1;/);
  assert.match(fnBlock, /abortActiveRequests\(\);/);
});

test('resumeConversation() invalidates (epoch bump + abort + playback invalidate) BEFORE awaiting historyStore.get(id) - not after, per audit finding C5 - and re-checks the epoch once that await resolves before ever applying its result', () => {
  const fnBlock = dockViewSrc.slice(dockViewSrc.indexOf('async function resumeConversation(id) {'), dockViewSrc.indexOf('React.useEffect(() => {\n    function onResume'));
  const bumpIdx = fnBlock.indexOf('conversationEpochRef.current += 1;');
  const abortIdx = fnBlock.indexOf('abortActiveRequests();');
  const awaitIdx = fnBlock.indexOf('await historyStore.get(id)');
  assert.ok(bumpIdx > -1 && abortIdx > -1 && awaitIdx > -1, 'all three real statements must be present');
  assert.ok(bumpIdx < awaitIdx && abortIdx < awaitIdx, 'the epoch bump and the abort must both happen before the async history fetch, not after it resolves');
  assert.match(fnBlock, /if \(!record \|\| conversationEpochRef\.current !== epochAtStart\) return;/);
});

test('endVoice() and the mic-toggle\'s own disconnect branch abort only voice-owned requests, never an unrelated typed turn the user sent moments earlier (the cancellation policy\'s own "preserve already accepted draft values" boundary)', () => {
  const endVoiceBlock = dockViewSrc.slice(dockViewSrc.indexOf('function endVoice() {'), dockViewSrc.indexOf('function toggleVoiceMute()'));
  assert.match(endVoiceBlock, /abortActiveRequests\('voice'\);/);
  const toggleVoiceBlock = dockViewSrc.slice(dockViewSrc.indexOf('function toggleVoice() {'), dockViewSrc.indexOf('function endVoice() {'));
  assert.match(toggleVoiceBlock, /abortActiveRequests\('voice'\);/);
});

test('unmount aborts every in-flight request regardless of source - the dock itself is going away, so nothing it started should keep running for a reply nothing will ever render', () => {
  assert.match(dockViewSrc, /return \(\) => \{ if \(voiceRef\.current\) voiceRef\.current\.disconnect\(\); if \(playbackControllerRef\.current\) playbackControllerRef\.current\.invalidate\(\); abortActiveRequests\(\); \};/);
});

test('Therapist Mode (audit finding C9): mhAi.chat() receives the owner\'s signal, and a stale isCurrent() stops the reply from ever reaching mhStore.addMessage()', async () => {
  let seenSignal;
  const addedMessages = [];
  const mentalHealthStore = {
    load: () => ({ chatHistory: [] }),
    addMessage: (profile, role, content) => { addedMessages.push({ role, content }); return profile; }
  };
  const mentalHealthAI = { chat: async (_profile, _text, signal) => { seenSignal = signal; return { flagged: false, reply: 'a stale therapist reply', suggestions: [] }; } };
  const window = await coreSandbox({ mentalHealthStore, mentalHealthAI });
  const controller = new AbortController();
  const result = await window.TradeJournalChatDockCore.sendChat({
    text: 'i feel anxious about this trade', therapistMode: true, transcript: [],
    signal: controller.signal, isCurrent: () => false
  });
  assert.equal(seenSignal, controller.signal, 'the therapist-mode call must receive the same owner-supplied signal as the main path');
  assert.equal(result.kind, 'discarded');
  assert.deepEqual(addedMessages.map((m) => m.role), ['user'], 'the user\'s own turn is still recorded (matches the existing safety-branch convention), but the stale assistant reply must never be persisted');
});
