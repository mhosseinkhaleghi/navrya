import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = file => readFile(shared(file), 'utf8');

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key), key: index => Array.from(values.keys())[index] || null, get length() { return values.size; } };
}

// Phase 8c of the local-first-to-server-authoritative migration (see ARCHITECTURE.md's Known
// Constraints section) moved every field except persistApiKeyByProvider (still local - see the
// store's own file-top comment for why: it's being deleted outright in Phase 8f, not migrated)
// off localStorage onto window.TradeJournalUserPreferences, so this helper now needs
// server-replica.js + user-preferences.js loaded, a real auth token, and a minimal fetch mock -
// same convention as tests/psychology-regression.test.mjs's own Phase 8b fix.
async function settingsSandbox(localStorage, fetchImpl) {
  localStorage = localStorage || memoryStorage();
  // Cookie-based sessions (ADR-0001): server-replica.js's hasCurrentUser() gate now reads
  // window.__NAVRYA_AUTH__ instead of a localStorage credential.
  const sandbox = {
    window: { __NAVRYA_AUTH__: { authenticated: true, userId: 'test-user', user: { id: 'test-user' }, csrfToken: 'test-csrf' } }, localStorage,
    fetch: fetchImpl || (async (url, options) => (options && options.method === 'POST') ? { ok: true, json: async () => JSON.parse(options.body) } : { ok: true, json: async () => ({ preferences: [] }) }),
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options && options.detail; } }
  };
  sandbox.window = Object.assign(sandbox.window, { localStorage, dispatchEvent() {}, addEventListener() {}, fetch: sandbox.fetch });
  vm.runInNewContext(await source('server-replica.js'), sandbox, { filename: 'server-replica.js' });
  vm.runInNewContext(await source('user-preferences.js'), sandbox, { filename: 'user-preferences.js' });
  vm.runInNewContext(await source('ai-settings-store.js'), sandbox, { filename: 'ai-settings-store.js' });
  await new Promise((resolve) => setImmediate(resolve)); // let hydrate() settle before the caller reads/writes
  return sandbox.window.TradeJournalAISettingsStore;
}

test('defaults to openai, a per-provider default model, and no persisted key for any provider', async () => {
  const store = await settingsSandbox();
  const settings = store.settings();
  assert.equal(settings.provider, 'openai');
  // Objects built inside the vm sandbox have a different realm's Object.prototype, so compare
  // field-by-field rather than via assert.deepEqual (mirrors ai-usage-store.test.mjs's identical
  // cross-realm caveat).
  ['openai', 'anthropic', 'kimi', 'deepseek'].forEach((id) => {
    assert.equal(settings.persistApiKeyByProvider[id], false, id + ' must default to not remembering its key');
    assert.equal(settings.budgetByProvider[id], null, id + ' must default to no budget');
  });
  assert.equal(store.activeModel(), settings.modelByProvider.openai);
});

test('A0: a BYO API key is in-memory-only by default - it never reaches localStorage until persistence is explicitly opted in', async () => {
  const localStorage = memoryStorage();
  const store = await settingsSandbox(localStorage);
  store.setKey('openai', 'sk-secret-123');
  assert.equal(store.getKey('openai'), 'sk-secret-123', 'the key is usable within the session');
  assert.equal(localStorage.getItem('tradejournal:ai-byok:v1'), null, 'nothing was ever written to storage');
  assert.equal(localStorage.getItem('tradejournal:ai-persist-key-by-provider:v1'), null, 'no provider was ever opted into remembering its key, so nothing is written to the local persist-flag key either');
});

test('turning persistApiKey on for one provider writes only that provider\'s in-memory key to the separate BYOK key, and off clears it - other providers are unaffected', async () => {
  const localStorage = memoryStorage();
  const store = await settingsSandbox(localStorage);
  store.setKey('anthropic', 'claude-key-1');
  store.setKey('openai', 'gpt-key-1');
  store.setPersistApiKey('anthropic', true);
  const persisted = JSON.parse(localStorage.getItem('tradejournal:ai-byok:v1'));
  assert.equal(persisted.anthropic, 'claude-key-1');
  assert.equal(persisted.openai, undefined, 'openai was never opted in, so its key must never reach storage');
  assert.equal(JSON.parse(localStorage.getItem('tradejournal:ai-persist-key-by-provider:v1')).anthropic, true);

  store.setKey('anthropic', 'claude-key-2');
  assert.equal(JSON.parse(localStorage.getItem('tradejournal:ai-byok:v1')).anthropic, 'claude-key-2', 'once opted in, further edits keep syncing to storage');

  store.setPersistApiKey('anthropic', false);
  assert.deepEqual(JSON.parse(localStorage.getItem('tradejournal:ai-byok:v1')), {}, 'turning persistence off clears that provider\'s stored key, not just the flag');
  assert.equal(store.getKey('anthropic'), 'claude-key-2', 'the in-memory session key survives even though storage was cleared');
});

test('a fresh page load restores a persisted key into memory only for the provider whose persistApiKeyByProvider flag was already on', async () => {
  const localStorage = memoryStorage();
  localStorage.setItem('tradejournal:ai-persist-key-by-provider:v1', JSON.stringify({ openai: true, anthropic: false }));
  localStorage.setItem('tradejournal:ai-byok:v1', JSON.stringify({ openai: 'restored-key', anthropic: 'stale-key' }));
  const store = await settingsSandbox(localStorage);
  assert.equal(store.getKey('openai'), 'restored-key');
  assert.equal(store.getKey('anthropic'), '', 'anthropic was never opted in, so nothing is implicitly read back for it');
});

test('a fresh page load never restores a key when that provider\'s persistApiKeyByProvider flag is off, even if stale data is present in storage', async () => {
  const localStorage = memoryStorage();
  localStorage.setItem('tradejournal:ai-persist-key-by-provider:v1', JSON.stringify({ openai: false }));
  localStorage.setItem('tradejournal:ai-byok:v1', JSON.stringify({ openai: 'stale-key' }));
  const store = await settingsSandbox(localStorage);
  assert.equal(store.getKey('openai'), '', 'nothing is implicitly read back once persistence is off');
});

test('clearKey removes a key from both memory and storage', async () => {
  const localStorage = memoryStorage();
  const store = await settingsSandbox(localStorage);
  store.setKey('kimi', 'kimi-key');
  store.setPersistApiKey('kimi', true);
  store.clearKey('kimi');
  assert.equal(store.getKey('kimi'), '');
  assert.equal(JSON.parse(localStorage.getItem('tradejournal:ai-byok:v1')).kimi, undefined);
});

test('the provider catalog is the single source of truth for voice support - only openai supports it', async () => {
  const store = await settingsSandbox();
  const catalog = store.providerCatalog();
  const byId = Object.fromEntries(catalog.map(p => [p.id, p]));
  assert.equal(byId.openai.supportsVoice, true);
  assert.equal(byId.anthropic.supportsVoice, false);
  assert.equal(byId.kimi.supportsVoice, false);
  assert.equal(byId.deepseek.supportsVoice, false);
});

test('saveSettings merges modelByProvider instead of replacing the whole map', async () => {
  const store = await settingsSandbox();
  store.saveSettings({ modelByProvider: { anthropic: 'claude-opus-4-1' } });
  const settings = store.settings();
  assert.equal(settings.modelByProvider.anthropic, 'claude-opus-4-1');
  assert.ok(settings.modelByProvider.openai, 'other providers keep their default model, unaffected by the partial patch');
});

// Phase 8c: everything except persistApiKeyByProvider now round-trips through
// window.TradeJournalUserPreferences (POST /api/sync/preferences), not localStorage.
test("saveSettings() applies optimistically and synchronously, then POSTs the non-BYOK fields to /api/sync/preferences under the 'aiSettings' key, excluding persistApiKeyByProvider", async () => {
  const localStorage = memoryStorage();
  const posted = [];
  const store = await settingsSandbox(localStorage, async (url, options) => {
    if (options && options.method === 'POST') { posted.push(JSON.parse(options.body)); return { ok: true, json: async () => JSON.parse(options.body) }; }
    return { ok: true, json: async () => ({ preferences: [] }) };
  });
  store.saveSettings({ provider: 'anthropic', therapistModeDefault: true });
  assert.equal(store.settings().provider, 'anthropic', 'applied optimistically before any network round trip');
  await new Promise((resolve) => setImmediate(resolve));
  const post = posted.find((body) => body.id === 'aiSettings');
  assert.ok(post, 'a POST under the aiSettings preference key must have been sent');
  assert.equal(post.value.provider, 'anthropic');
  assert.equal(post.value.therapistModeDefault, true);
  assert.equal(post.value.persistApiKeyByProvider, undefined, 'the BYOK opt-in flags must never be sent to the server - Phase 8f deletes that mechanism entirely, not migrates it');
});

test('no localStorage key is ever written for the migrated ai-settings fields any more - only the still-local BYOK key and persist-flag key remain', async () => {
  const localStorage = memoryStorage();
  const store = await settingsSandbox(localStorage);
  store.saveSettings({ provider: 'kimi' });
  assert.equal(localStorage.getItem('tradejournal:ai-settings:v1'), null, "Phase 1's guard key may still exist defensively for pre-migration browsers, but nothing writes it any more");
});
