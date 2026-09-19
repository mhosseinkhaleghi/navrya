import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Analysis Profile teaching chat (Phase 4): the browser store's message methods and the AI client's
// chat()/preview(). Same vm-sandbox convention as tests/analysis-profile-knowledge-ui.test.mjs.
const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = (file) => readFile(shared(file), 'utf8');

// ---- store: message methods over a stubbed fetch --------------------------------------------------

async function loadStore(handler) {
  const calls = [];
  const fetchFn = async (url, options) => {
    calls.push({ url, method: (options && options.method) || 'GET', body: options && options.body ? JSON.parse(options.body) : undefined });
    return handler(url, options || {}, calls);
  };
  const sandbox = {
    window: { __NAVRYA_AUTH__: { authenticated: true, userId: 'user-1', user: { id: 'user-1' }, csrfToken: 't' } }, fetch: fetchFn,
    document: { body: { appendChild() {} }, documentElement: { lang: 'en' }, createElement: () => ({ setAttribute() {} }) },
    CustomEvent: class { constructor(type) { this.type = type; } }, setTimeout: (fn) => fn(), URL
  };
  Object.assign(sandbox.window, { dispatchEvent() {}, addEventListener() {} });
  vm.createContext(sandbox);
  for (const file of ['server-replica.js', 'analysis-style-registry.js', 'analysis-focus-registry.js', 'analysis-profile-store.js']) {
    vm.runInContext(await source(file), sandbox, { filename: file });
  }
  return { store: sandbox.window.TradeJournalAnalysisProfileStore, calls };
}
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('the store exposes the message methods', async () => {
  const { store } = await loadStore(() => json(200, { analysisProfiles: [] }));
  for (const name of ['listMessages', 'appendMessages', 'resolveProposals', 'clearMessages']) assert.equal(typeof store[name], 'function', name);
});

test('the message methods call the nested owner-scoped routes with the right verbs and bodies, and wait for the profile write to land first', async () => {
  const { store, calls } = await loadStore((url, options) => {
    if (options.method === 'DELETE') return { ok: true, status: 204, json: async () => null };
    if (url.endsWith('/messages') && (!options.method || options.method === 'GET')) return json(200, { messages: [{ id: 'm1' }] });
    if (options.method === 'POST' && url.endsWith('/api/sync/analysis-profiles')) return json(200, JSON.parse(options.body));
    return json(options.method === 'POST' ? 201 : 200, { id: 'm1', ...(options.body ? JSON.parse(options.body) : {}) });
  });
  await flush();
  const profile = store.create({ name: 'P', primaryStyleId: 'price_action' });
  await flush();
  assert.deepEqual((await store.listMessages(profile.id)).map((m) => m.id), ['m1']);
  await store.appendMessages(profile.id, [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }]);
  await store.resolveProposals(profile.id, 'm1', { p1: 'applied' });
  await store.clearMessages(profile.id);
  const base = '/api/sync/analysis-profiles/' + profile.id + '/messages';
  const seen = calls.filter((c) => c.url.startsWith(base)).map((c) => `${c.method} ${c.url.slice(base.length) || '/'}`);
  assert.deepEqual(seen, ['GET /', 'POST /', 'PATCH /m1', 'DELETE /']);
});

test('appendMessages posts the turn under a "messages" array, and resolveProposals posts the statuses object', async () => {
  const { store, calls } = await loadStore((url, options) => (options.method === 'POST' && url.endsWith('/api/sync/analysis-profiles') ? json(200, JSON.parse(options.body)) : json(options.method === 'POST' || options.method === 'PATCH' ? 201 : 200, { messages: [] })));
  await flush();
  const profile = store.create({ name: 'P', primaryStyleId: 'price_action' });
  await flush();
  const turn = [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'yo', proposals: [{ id: 'p1', kind: 'concept', title: 'x' }] }];
  await store.appendMessages(profile.id, turn);
  const post = calls.find((c) => c.method === 'POST' && c.url.endsWith('/messages'));
  assert.deepEqual(post.body, { messages: turn });
  await store.resolveProposals(profile.id, 'm1', { p1: 'applied' });
  const patch = calls.find((c) => c.method === 'PATCH');
  assert.deepEqual(patch.body, { statuses: { p1: 'applied' } });
});

test('a message request that fails rejects with an AnalysisProfileError carrying the server\'s stable code', async () => {
  const { store } = await loadStore((url, options) => (url.includes('/messages') ? json(400, { error: 'VALIDATION_FAILED' }) : json(200, options.body ? JSON.parse(options.body) : { analysisProfiles: [] })));
  await flush();
  const profile = store.create({ name: 'P', primaryStyleId: 'price_action' });
  await assert.rejects(() => store.appendMessages(profile.id, [{ role: 'user', content: 'x' }]), (error) => error.code === 'VALIDATION_FAILED' && error.name === 'AnalysisProfileError');
});

// ---- AI client: chat() / preview() forward the FULL resolved profile, not just the style half ------

async function loadClient({ fetchImpl } = {}) {
  const sandbox = { window: { setTimeout: (fn) => fn(), clearTimeout: () => {} }, AbortController, console, fetch: fetchImpl || (async () => ({ ok: false, status: 500, json: async () => ({}) })) };
  vm.createContext(sandbox);
  for (const file of ['analysis-style-registry.js', 'analysis-focus-registry.js', 'analysis-profile-ai.js']) {
    vm.runInContext(await source(file), sandbox, { filename: file });
  }
  return sandbox.window.TradeJournalAnalysisProfileAI;
}
const fullContext = () => ({
  primaryStyle: { id: 'smc', name: { en: 'Smart Money Concepts' } }, secondaryStyles: [], focuses: [{ id: 'trend' }],
  customFocuses: [{ name: 'Session opens' }], customMethodNotes: 'notes', concepts: [{ title: 'Swept liquidity', priority: 'mandatory' }],
  understanding: 'Reads structure first.', requiredInputs: ['ohlc_chart']
});

test('chat() refuses an empty message before any network call, and posts the message + full profile context + trimmed history', async () => {
  let calls = 0; let captured;
  const client = await loadClient({ fetchImpl: async (url, options) => { calls += 1; captured = JSON.parse(options.body); return { ok: true, json: async () => ({ reply: 'ok', proposals: [] }) }; } });
  await assert.rejects(() => client.chat({ message: '   ', profileContext: fullContext() }), (error) => error.code === 'ANALYSIS_PROFILE_CHAT_MESSAGE_REQUIRED');
  assert.equal(calls, 0);
  const history = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `turn-${i}`, proposals: ['never sent to the model'] }));
  const result = await client.chat({ message: 'I wait for a sweep.', language: 'fa', profileContext: fullContext(), history });
  assert.equal(captured.url, undefined);
  assert.equal(captured.message, 'I wait for a sweep.');
  assert.equal(captured.language, 'fa');
  assert.deepEqual(captured.profile, fullContext(), 'the full resolved profile (focuses, customFocuses, concepts, understanding) must be forwarded, not just the style half');
  assert.equal(captured.history.length, 24, 'history is capped client-side too');
  assert.equal(captured.history[0].content, 'turn-6');
  assert.equal('proposals' in captured.history[0], false, 'only role/content are ever sent back to the model');
  assert.equal(result.reply, 'ok');
});

test('chat() with no profileContext sends an empty profile object rather than throwing (a brand-new profile with no style yet)', async () => {
  let captured;
  const client = await loadClient({ fetchImpl: async (url, options) => { captured = JSON.parse(options.body); return { ok: true, json: async () => ({ reply: '', proposals: [] }) }; } });
  await client.chat({ message: 'hi' });
  assert.deepEqual(captured.profile, {});
});

test('preview() posts the full profile context and returns sanitized observations', async () => {
  let captured;
  const client = await loadClient({ fetchImpl: async (url, options) => { captured = { url, body: JSON.parse(options.body) }; return { ok: true, json: async () => ({ observations: [{ title: 'x', detail: 'y' }], provider: 'openai', usage: { input_tokens: 1 } }) }; } });
  const result = await client.preview({ language: 'ar', profileContext: fullContext() });
  assert.equal(captured.url, '/api/analysis-profiles/preview');
  assert.deepEqual(captured.body.profile, fullContext());
  assert.equal(captured.body.language, 'ar');
  assert.deepEqual(result.observations, [{ title: 'x', detail: 'y' }]);
});

test('chat and preview carry the BYOK provider context exactly like suggest/ingest, since both are billed routes', async () => {
  let capturedChat, capturedPreview;
  const settings = { activeProvider: () => 'openai', getKey: () => 'sk-secret', activeModel: () => 'gpt-x' };
  const sandbox = { window: { setTimeout: (fn) => fn(), clearTimeout: () => {}, TradeJournalAISettingsStore: settings }, AbortController, console };
  sandbox.fetch = async (url, options) => { const body = JSON.parse(options.body); if (url.endsWith('/chat')) capturedChat = body; else capturedPreview = body; return { ok: true, json: async () => ({ reply: '', proposals: [], observations: [] }) }; };
  vm.createContext(sandbox);
  for (const file of ['analysis-style-registry.js', 'analysis-focus-registry.js', 'analysis-profile-ai.js']) vm.runInContext(await source(file), sandbox, { filename: file });
  const client = sandbox.window.TradeJournalAnalysisProfileAI;
  await client.chat({ message: 'hi', profileContext: fullContext() });
  await client.preview({ profileContext: fullContext() });
  assert.equal(capturedChat.apiKey, 'sk-secret');
  assert.equal(capturedPreview.apiKey, 'sk-secret');
});

test('every character page loads analysis-profile-ai.js after analysis-context.js, so chat()/preview() can be given a real getAnalysisContext() result', async () => {
  for (const character of ['hunter', 'commander', 'engineer', 'sage']) {
    const html = await readFile(path.join(root, 'public', 'pages', character, 'index.html'), 'utf8');
    const contextIndex = html.indexOf('analysis-context.js');
    const clientIndex = html.indexOf('analysis-profile-ai.js');
    assert.ok(contextIndex > -1 && clientIndex > contextIndex, `${character}/index.html must load analysis-context.js before analysis-profile-ai.js`);
  }
});
