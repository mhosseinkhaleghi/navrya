import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test, { after, afterEach } from 'node:test';

// Slice R1 (request ownership/cancellation), server side. Addresses audit findings C2/C3 and the
// "abandoned-cost" section: today, once the browser has genuinely moved on (New Chat, a
// conversation switch, a closed tab), an in-flight `/api/ai/chat`/`/api/mental-health/chat` call
// still runs all the way to the provider's own ~90s timeout for nothing - no signal from the
// client ever reaches the actual upstream fetch. Fixed by composing (never replacing) each
// provider caller's own existing timeout AbortController with an externally-supplied signal via
// the platform's own AbortSignal.any() - see composedSignal()/callProvider()/dockChat()/
// mentalHealthChat()'s own comments in server/pattern-ai-server.mjs.
//
// Same real server.listen(...) side effect every other server/pattern-ai-server.mjs test file
// already notes; closed in `after` so this file's process can exit.
const serverModule = await import('../server/pattern-ai-server.mjs');
const { callProvider, callOpenAI, callAnthropic, callGemini, callOpenAICompatible, dockChat, mentalHealthChat } = serverModule;
const server = serverModule.default;

after(() => { server.close(); });

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const HEALTH_EVENT_URL = '/internal/ai-health-event';
const ADMIN_MODEL_OVERRIDES_URL = '/internal/admin-ai-model-overrides';
const neutralHealthEventResponse = { ok: true, json: async () => ({}) };

// A fetch stub that never resolves on its own and records the real `signal` it was given - the
// only way to actually prove a real fetch() call receives (and reacts to) the composed signal
// without a live network call. `fetch()`'s own real behavior on an aborted signal (reject with a
// DOMException/Error named 'AbortError') is standard platform behavior this stub does not need to
// reimplement - node's real global fetch does this itself once the signal it was given aborts,
// exactly as it would for a genuine network call.
function neverResolvingFetchCapturingSignal(captured) {
  return function (url, options) {
    if (String(url).includes(HEALTH_EVENT_URL)) return neutralHealthEventResponse;
    // callProvider() resolves its non-secret Admin model fallback before the real provider call.
    // Keep this fixture focused on the provider fetch that must observe the external abort.
    if (String(url).includes(ADMIN_MODEL_OVERRIDES_URL)) return { ok: true, json: async () => ({}) };
    captured.signal = options && options.signal;
    return new Promise((_resolve, reject) => {
      if (captured.signal) {
        captured.signal.addEventListener('abort', () => {
          const reason = captured.signal.reason;
          reject(reason instanceof Error ? reason : Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));
        });
      }
    });
  };
}

const PROVIDERS = [
  { name: 'openai', fn: (payload, key, model, signal) => callOpenAI(payload, key, model, signal), payload: { input: [], text: { format: { schema: { required: [] } } } } },
  { name: 'anthropic', fn: (payload, key, model, signal) => callAnthropic(payload, key, model, signal), payload: { input: [{ role: 'system', content: [{ type: 'input_text', text: 's' }] }, { role: 'user', content: [{ type: 'input_text', text: 'u' }] }], text: { format: { name: 'x', schema: { required: [] } } } } },
  { name: 'gemini', fn: (payload, key, model, signal) => callGemini(payload, key, model, signal), payload: { input: [{ role: 'user', content: [{ type: 'input_text', text: 'u' }] }], text: { format: { schema: { required: [] } } } } },
  { name: 'kimi (OpenAI-compatible)', fn: (payload, key, model, signal) => callOpenAICompatible('kimi', payload, key, model, signal), payload: { input: [{ role: 'user', content: [{ type: 'input_text', text: 'u' }] }], text: { format: { schema: { required: [] } } } } }
];

for (const provider of PROVIDERS) {
  test(`${provider.name}: an externally-aborted signal actually cancels the real upstream fetch, mid-flight, without waiting for its own ~90s timeout`, async () => {
    const captured = {};
    globalThis.fetch = neverResolvingFetchCapturingSignal(captured);
    const external = new AbortController();
    const callPromise = provider.fn(provider.payload, 'k', undefined, external.signal);
    // Give the fetch a real turn of the event loop to actually start and hand its options (and
    // therefore its signal) to the stub above before aborting - a synchronous abort before the
    // call even starts would prove nothing about mid-flight cancellation specifically.
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(captured.signal, 'the real fetch() call must have been reached with a signal');
    assert.equal(captured.signal.aborted, false, 'must not already be aborted before the external controller fires');
    external.abort();
    await assert.rejects(callPromise, (error) => error.name === 'AbortError' || /aborted/i.test(error.message));
    assert.equal(captured.signal.aborted, true, 'the actual signal handed to fetch() must reflect the external abort');
  });

  test(`${provider.name}: a real, already-successful call is completely unaffected by an externalSignal that never fires`, async () => {
    globalThis.fetch = async (url) => {
      if (String(url).includes(HEALTH_EVENT_URL)) return neutralHealthEventResponse;
      if (provider.name === 'openai') return { ok: true, json: async () => ({ output_text: JSON.stringify({}), usage: null }) };
      if (provider.name.startsWith('anthropic')) return { ok: true, json: async () => ({ content: [{ type: 'tool_use', input: {} }], usage: null }) };
      if (provider.name === 'gemini') return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }) };
      return { ok: true, json: async () => ({ choices: [{ message: { content: '{}' } }] }) };
    };
    const external = new AbortController(); // never aborted - the normal, overwhelmingly common case
    const result = await provider.fn(provider.payload, 'k', undefined, external.signal);
    assert.ok(result && typeof result === 'object' && 'data' in result, 'a normal call must still resolve exactly as before this feature existed');
  });
}

test('callProvider composes and threads externalSignal to whichever real provider caller it dispatches to', async () => {
  const captured = {};
  globalThis.fetch = neverResolvingFetchCapturingSignal(captured);
  const external = new AbortController();
  const callPromise = callProvider('openai', 'k', undefined, { input: [], text: { format: { schema: { required: [] } } } }, 'test.source', external.signal);
  await new Promise((resolve) => setTimeout(resolve, 0));
  external.abort();
  await assert.rejects(callPromise);
  assert.equal(captured.signal.aborted, true);
});

test('dockChat threads its own externalSignal parameter through to callProvider, so a New-Chat-triggered client disconnect can actually cancel the real /api/ai/chat provider call in flight', async () => {
  const captured = {};
  globalThis.fetch = neverResolvingFetchCapturingSignal(captured);
  const external = new AbortController();
  // apiKey supplied directly (matching how every other test in this file resolves a key) so
  // callProvider()'s own key resolution never needs the adminKeys() internal bridge, which is a
  // SEPARATE fetch() call (also caught by this same stub otherwise) with its own real, unrelated
  // AbortSignal.timeout(3000) - without this, that unrelated internal call's own signal would be
  // the one this test observes aborting after 3s, not the real provider call's composed signal at
  // all, silently proving nothing about this feature.
  const dockChatPromise = dockChat({ text: 'hello', chatHistory: [], provider: 'openai', apiKey: 'k' }, external.signal);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(captured.signal, 'dockChat must reach a real provider fetch call carrying a signal');
  external.abort();
  await assert.rejects(dockChatPromise);
  assert.equal(captured.signal.aborted, true, 'the abort must reach all the way down to the real fetch() call dockChat() ultimately makes');
});

test('mentalHealthChat threads its own externalSignal parameter through to callProvider - the same real cancellation path as dockChat, for the one other route this slice covers', async () => {
  const captured = {};
  globalThis.fetch = neverResolvingFetchCapturingSignal(captured);
  const external = new AbortController();
  // apiKey supplied directly - see dockChat's own equivalent test above for why this matters.
  const mentalHealthChatPromise = mentalHealthChat({ language: 'en', message: 'hello', chatHistory: [], context: {}, provider: 'openai', apiKey: 'k' }, external.signal);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(captured.signal, 'mentalHealthChat must reach a real provider fetch call carrying a signal');
  external.abort();
  await assert.rejects(mentalHealthChatPromise);
  assert.equal(captured.signal.aborted, true);
});

// The raw HTTP dispatcher itself (the request.on('close')/`responded` wiring that turns a real
// browser disconnect into the externalSignal every test above already proves works once supplied)
// is thin, request-lifecycle glue this suite cannot exercise as a genuine socket-level integration
// test without also mocking session/quota/wallet verification end to end - the exported-function
// tests above already prove the real, meaningful behavior (an external signal genuinely cancels
// the upstream call). This is a static regression guard for that glue's own presence and scope,
// not a substitute for it - see the tests above for the actual behavior proof.
test('the raw HTTP dispatcher wires a real per-request disconnect signal into dockChat/mentalHealthChat only - every other route on this gateway is untouched', async () => {
  const src = await readFile(path.join(process.cwd(), 'server', 'pattern-ai-server.mjs'), 'utf8');
  assert.match(src, /let responded = false;/);
  assert.match(src, /const clientDisconnectController = new AbortController\(\);/);
  assert.match(src, /request\.on\('close', \(\) => \{ if \(!responded\) clientDisconnectController\.abort\(\); \}\);/);
  assert.match(src, /await dockChat\(body, clientDisconnectController\.signal\)/);
  assert.match(src, /await mentalHealthChat\(body, clientDisconnectController\.signal\)/);
  assert.match(src, /finally \{[\s\S]*?responded = true;[\s\S]*?\}/);
  // Every OTHER route dispatch in this same block must still call its handler with exactly one
  // argument (body) - confirms the signal was deliberately NOT threaded into any route beyond the
  // two this slice covers.
  const dispatchBlock = src.slice(src.indexOf("if (request.url === '/api/patterns/generate-stages')"), src.indexOf("else return json(response, 404, { error: 'NOT_FOUND' });"));
  const untouchedRoutes = [
    'generateStages(body)', 'trainingChat(body)', 'summarizeStrategyEducation(body)', 'strategyEducationChat(body)',
    'strategyFromEvent(body)', 'analyzeTrade(body)', 'psychologyAnalysis(body)', 'extractTradeFields(body)',
    'mentalHealthEducationCard(body)', 'analyzeSession(body)', 'visualizeScenario(body)', 'visualizeAnalysis(body)', 'testConnection(body)'
  ];
  for (const call of untouchedRoutes) {
    assert.ok(dispatchBlock.includes('await ' + call), `${call} must remain unchanged - only dockChat/mentalHealthChat take the new signal this slice`);
  }
});
