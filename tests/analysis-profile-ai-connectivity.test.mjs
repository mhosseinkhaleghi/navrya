import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Analysis Profile AI connectivity (public/pages/shared/analysis-profile-ai.js): the request base URL is resolved when
// each request is made (not captured when the script is evaluated), a failed response keeps its HTTP status and is
// classified as a gateway error vs a proxy failure, and readiness() describes how the next call will be served without
// ever exposing a credential. Same vm harness as tests/analysis-profile-ai-client.test.mjs.

const root = process.cwd();
const source = (file) => readFile(path.join(root, 'public', 'pages', 'shared', file), 'utf8');

async function loadClient({ fetchImpl, windowExtras } = {}) {
  const sandbox = {
    window: Object.assign({ setTimeout: (fn) => fn(), clearTimeout: () => {} }, windowExtras || {}),
    AbortController, console,
    fetch: fetchImpl || (async () => ({ ok: true, json: async () => ({ suggestions: [], provider: 'openai', usage: null }) }))
  };
  vm.createContext(sandbox);
  for (const file of ['analysis-style-registry.js', 'analysis-focus-registry.js', 'analysis-profile-ai.js']) {
    vm.runInContext(await source(file), sandbox, { filename: file });
  }
  return { client: sandbox.window.TradeJournalAnalysisProfileAI, window: sandbox.window };
}

// ---- base URL, resolved at request time ---------------------------------------------------------

test('a base URL configured AFTER the client script ran is used by the next request - it is not frozen at load', async () => {
  const urls = [];
  const { client, window } = await loadClient({ fetchImpl: async (url) => { urls.push(url); return { ok: true, json: async () => ({ suggestions: [], provider: 'openai', usage: null }) }; } });
  assert.equal(window.TradeJournalPatternAIConfig, undefined, 'the config did not exist when the script was evaluated');

  await client.suggestFocuses({ primaryStyleId: 'price_action' });
  window.TradeJournalPatternAIConfig = { baseUrl: 'https://ai.example.test/' };
  await client.suggestFocuses({ primaryStyleId: 'price_action' });
  window.TradeJournalPatternAIConfig = { baseUrl: 'https://other.example.test' };
  await client.suggestFocuses({ primaryStyleId: 'price_action' });

  assert.deepEqual(urls, [
    '/api/analysis-profiles/suggest',
    'https://ai.example.test/api/analysis-profiles/suggest',
    'https://other.example.test/api/analysis-profiles/suggest'
  ]);
});

test('every one of the five routes goes through the same request-time base URL (suggest, ingest, chat, preview, read-source)', async () => {
  const urls = [];
  const { client, window } = await loadClient({
    windowExtras: { TradeJournalPatternAIConfig: { baseUrl: 'https://ai.example.test' } },
    fetchImpl: async (url) => { urls.push(url); return { ok: true, json: async () => ({ suggestions: [], conceptsProposed: [], observations: [], reply: 'r', proposals: [], type: 'website', url: 'https://x.test', title: 't', digest: 'd' }) }; }
  });
  await client.suggestFocuses({ primaryStyleId: 'price_action' });
  await client.ingestLearning({ text: 'a note' });
  await client.chat({ message: 'hello', profileContext: {} });
  await client.preview({ profileContext: {} });
  await client.readSource({ url: 'https://x.test' });
  window.TradeJournalPatternAIConfig.baseUrl = '';
  await client.chat({ message: 'again', profileContext: {} });
  assert.deepEqual(urls.slice(0, 5).map((u) => u.replace('https://ai.example.test', '')), [
    '/api/analysis-profiles/suggest', '/api/analysis-profiles/ingest', '/api/analysis-profiles/chat', '/api/analysis-profiles/preview', '/api/analysis-profiles/read-source'
  ]);
  assert.ok(urls.slice(0, 5).every((u) => u.startsWith('https://ai.example.test/')));
  assert.equal(urls[5], '/api/analysis-profiles/chat', 'clearing the base URL later falls back to same-origin on the very next request');
});

test('the client source keeps no module-level copy of the base URL', async () => {
  const text = await source('analysis-profile-ai.js');
  assert.doesNotMatch(text, /var baseUrl\b/);
  assert.match(text, /function apiBase\(\)/);
  assert.match(text, /fetch\(apiBase\(\) \+ path/);
});

// ---- failed responses: status kept, gateway vs proxy ----------------------------------------------

async function failWith(response) {
  const { client } = await loadClient({ fetchImpl: async () => response });
  try { await client.chat({ message: 'hi', profileContext: {} }); } catch (error) { return error; }
  assert.fail('the call should have rejected');
}

test('a gateway failure keeps its stable code and its HTTP status', async () => {
  const error = await failWith({ ok: false, status: 402, json: async () => ({ error: 'WALLET_INSUFFICIENT_BALANCE' }) });
  assert.equal(error.name, 'AnalysisProfileAIError');
  assert.equal(error.code, 'WALLET_INSUFFICIENT_BALANCE');
  assert.equal(error.status, 402);
});

test('an error status with no gateway code is a PROXY failure when it looks like one (5xx, 404, 405) and a plain request failure otherwise', async () => {
  const noBody = async () => { throw new SyntaxError('Unexpected token < in JSON'); };
  for (const status of [502, 503, 504, 500, 404, 405]) {
    const error = await failWith({ ok: false, status, json: noBody });
    assert.equal(error.code, 'ANALYSIS_PROFILE_AI_PROXY_ERROR', 'status ' + status);
    assert.equal(error.status, status);
  }
  const bad = await failWith({ ok: false, status: 400, json: noBody });
  assert.equal(bad.code, 'ANALYSIS_PROFILE_AI_REQUEST_FAILED');
  assert.equal(bad.status, 400);
  const emptyJson = await failWith({ ok: false, status: 502, json: async () => ({}) });
  assert.equal(emptyJson.code, 'ANALYSIS_PROFILE_AI_PROXY_ERROR', 'a JSON body without an error code did not come from the gateway either');
});

test('a gateway 504 that carries PROVIDER_TIMEOUT stays a provider timeout - only a code-less 504 is a proxy failure', async () => {
  const error = await failWith({ ok: false, status: 504, json: async () => ({ error: 'PROVIDER_TIMEOUT' }) });
  assert.equal(error.code, 'PROVIDER_TIMEOUT');
});

test('a fetch that never produced a response is a network error (no status); an aborted one is a timeout', async () => {
  const network = await (async () => {
    const { client } = await loadClient({ fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
    try { await client.chat({ message: 'hi', profileContext: {} }); } catch (error) { return error; }
    return null;
  })();
  assert.equal(network.code, 'ANALYSIS_PROFILE_AI_NETWORK_ERROR');
  assert.equal(network.status, undefined);

  const timeout = await (async () => {
    const { client } = await loadClient({ fetchImpl: async () => { const abort = new Error('aborted'); abort.name = 'AbortError'; throw abort; } });
    try { await client.chat({ message: 'hi', profileContext: {} }); } catch (error) { return error; }
    return null;
  })();
  assert.equal(timeout.code, 'ANALYSIS_PROFILE_AI_TIMEOUT');
});

// ---- readiness: non-secret, honest -----------------------------------------------------------------

const settingsStore = (overrides) => Object.assign({
  activeProvider: () => 'anthropic', activeModel: () => 'claude-sonnet-4-5', getKey: () => '',
  providerCatalog: () => [{ id: 'openai', label: 'OpenAI' }, { id: 'anthropic', label: 'Claude' }]
}, overrides || {});

test('readiness() is platform-managed with no personal key, BYOK with one - and names the selected provider/model', async () => {
  const platform = await loadClient({ windowExtras: { TradeJournalAISettingsStore: settingsStore() } });
  assert.deepEqual(JSON.parse(JSON.stringify(platform.client.readiness())), { mode: 'platform', provider: 'anthropic', providerLabel: 'Claude', model: 'claude-sonnet-4-5' });

  const byok = await loadClient({ windowExtras: { TradeJournalAISettingsStore: settingsStore({ getKey: (provider) => (provider === 'anthropic' ? 'sk-ant-SECRET-VALUE' : '') }) } });
  const ready = JSON.parse(JSON.stringify(byok.client.readiness()));
  assert.equal(ready.mode, 'byok');
  assert.equal(ready.providerLabel, 'Claude');
  assert.equal(ready.model, 'claude-sonnet-4-5');
});

test('readiness() never returns, embeds or reveals the key - only that one exists', async () => {
  const SECRET = 'sk-ant-api03-THIS-MUST-NEVER-APPEAR';
  const { client } = await loadClient({ windowExtras: { TradeJournalAISettingsStore: settingsStore({ getKey: () => SECRET }) } });
  const ready = client.readiness();
  assert.equal(JSON.stringify(ready).includes('SECRET') || JSON.stringify(ready).includes('sk-ant'), false);
  assert.deepEqual(Object.keys(ready).sort(), ['mode', 'model', 'provider', 'providerLabel']);
  const text = await source('analysis-profile-ai.js');
  assert.doesNotMatch(text.slice(text.indexOf('function readiness')), /console\./, 'the readiness path logs nothing');
});

test('readiness() degrades to platform-managed when the settings store is missing or throws - it never throws itself', async () => {
  const none = await loadClient();
  assert.equal(none.client.readiness().mode, 'platform');
  const broken = await loadClient({ windowExtras: { TradeJournalAISettingsStore: { activeProvider: () => { throw new Error('boom'); } } } });
  assert.equal(broken.client.readiness().mode, 'platform');
});

test('a personal key is still sent with a billed request (BYOK behaviour is unchanged) but never with read-source', async () => {
  const bodies = [];
  const { client } = await loadClient({
    windowExtras: { TradeJournalAISettingsStore: settingsStore({ getKey: () => 'sk-test-key' }) },
    fetchImpl: async (url, options) => { bodies.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ reply: 'r', proposals: [], type: 'website', url: 'https://x.test', title: 't', digest: 'd' }) }; }
  });
  await client.chat({ message: 'hi', profileContext: {} });
  await client.readSource({ url: 'https://x.test' });
  assert.equal(bodies[0].apiKey, 'sk-test-key');
  assert.equal(bodies[1].apiKey, undefined);
});
