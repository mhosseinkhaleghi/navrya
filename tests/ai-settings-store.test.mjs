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
// Constraints section) moved every settings field off localStorage onto
// window.TradeJournalUserPreferences (BYOK keys are a separate, still-local, in-memory-only
// mechanism - see the store's own file-top comment), so this helper now needs
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

test('defaults to openai and a per-provider default model', async () => {
  const store = await settingsSandbox();
  const settings = store.settings();
  assert.equal(settings.provider, 'openai');
  // Objects built inside the vm sandbox have a different realm's Object.prototype, so compare
  // field-by-field rather than via assert.deepEqual (mirrors ai-usage-store.test.mjs's identical
  // cross-realm caveat).
  ['openai', 'anthropic', 'kimi', 'deepseek'].forEach((id) => {
    assert.equal(settings.budgetByProvider[id], null, id + ' must default to no budget');
  });
  assert.equal(store.activeModel(), settings.modelByProvider.openai);
});

// Phase 8f (security hardening pass): raw BYO API keys are never written to localStorage under
// any circumstance any more - the whole opt-in "remember this key" mechanism (and its
// setPersistApiKey API) was removed rather than migrated, since there is no encrypted
// server-side facility to move it to and inventing ad-hoc encryption is worse than not
// persisting the credential at all. A key now lives only in the store's in-memory sessionKeys
// map for the lifetime of the page.
test('a BYO API key is in-memory-only, always - it never reaches localStorage under any circumstance', async () => {
  const localStorage = memoryStorage();
  const store = await settingsSandbox(localStorage);
  store.setKey('openai', 'sk-secret-123');
  assert.equal(store.getKey('openai'), 'sk-secret-123', 'the key is usable within the session');
  assert.equal(localStorage.getItem('tradejournal:ai-byok:v1'), null, 'nothing was ever written to storage');
  assert.equal(localStorage.getItem('tradejournal:ai-persist-key-by-provider:v1'), null, 'the legacy persist-flag key was never written either');
  assert.equal(store.setPersistApiKey, undefined, 'the persistence opt-in API no longer exists at all');
});

test('a fresh page load never restores a key from storage, even if a legacy value is present from before this mechanism was removed', async () => {
  const localStorage = memoryStorage();
  localStorage.setItem('tradejournal:ai-persist-key-by-provider:v1', JSON.stringify({ openai: true }));
  localStorage.setItem('tradejournal:ai-byok:v1', JSON.stringify({ openai: 'stale-legacy-key' }));
  const store = await settingsSandbox(localStorage);
  assert.equal(store.getKey('openai'), '', 'a legacy persisted key must never be implicitly read back into memory');
  assert.equal(localStorage.getItem('tradejournal:ai-byok:v1'), null, 'the legacy raw-key entry must be purged from storage on load, not just ignored');
  assert.equal(localStorage.getItem('tradejournal:ai-persist-key-by-provider:v1'), null, 'the legacy persist-flag entry must be purged from storage on load too');
});

test('clearKey removes a key from memory', async () => {
  const store = await settingsSandbox();
  store.setKey('kimi', 'kimi-key');
  store.clearKey('kimi');
  assert.equal(store.getKey('kimi'), '');
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

// Phase 8c: settings round-trip through window.TradeJournalUserPreferences
// (POST /api/sync/preferences), not localStorage. BYOK keys are a wholly separate, in-memory-only
// mechanism (see the store's own file-top comment) and are never part of this object at all.
test("saveSettings() applies optimistically and synchronously, then POSTs the settings fields to /api/sync/preferences under the 'aiSettings' key", async () => {
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
  assert.equal(post.value.persistApiKeyByProvider, undefined, 'the removed BYOK mechanism must never resurface anywhere in the posted settings object');
});

test('no localStorage key is ever written for the migrated ai-settings fields any more', async () => {
  const localStorage = memoryStorage();
  const store = await settingsSandbox(localStorage);
  store.saveSettings({ provider: 'kimi' });
  assert.equal(localStorage.getItem('tradejournal:ai-settings:v1'), null, "Phase 1's guard key may still exist defensively for pre-migration browsers, but nothing writes it any more");
});
