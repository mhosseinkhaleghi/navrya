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
  ['openai', 'anthropic', 'gemini', 'kimi', 'deepseek'].forEach((id) => {
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

test('the provider catalog is the single source of truth for voice support - OpenAI and Gemini support it', async () => {
  const store = await settingsSandbox();
  const catalog = store.providerCatalog();
  const byId = Object.fromEntries(catalog.map(p => [p.id, p]));
  assert.equal(byId.openai.supportsVoice, true);
  assert.equal(byId.anthropic.supportsVoice, false);
  assert.equal(byId.gemini.supportsVoice, true);
  assert.equal(byId.kimi.supportsVoice, false);
  assert.equal(byId.deepseek.supportsVoice, false);
});

test('Gemini is a visible, multimodal structured-output provider with the available default while Kimi remains paused in ordinary selectors', async () => {
  const store = await settingsSandbox();
  const gemini = store.providerCatalog().find((entry) => entry.id === 'gemini');
  assert.deepEqual(Array.from(gemini.models), ['gemini-3.1-pro-preview', 'gemini-2.5-flash', 'gemini-2.5-flash-lite']);
  assert.equal(gemini.supportsVision, true);
  assert.equal(gemini.supportsStructuredOutput, true);
  assert.equal(gemini.supportsReasoning, true);
  assert.equal(store.visibleProviderCatalog().some((entry) => entry.id === 'gemini'), true);
  assert.equal(store.visibleProviderCatalog().some((entry) => entry.id === 'kimi'), false);
  assert.equal(store.visibleProviderCatalog('kimi').some((entry) => entry.id === 'kimi'), true, 'a legacy Kimi selection must never be rendered as a different provider');
});

test('a saved Gemini 2.5 Pro choice migrates to the available 3.1 preview model on reload', async () => {
  const prefsStore = { aiSettings: { provider: 'gemini', modelByProvider: { gemini: 'gemini-2.5-pro' } } };
  const store = await settingsSandbox(memoryStorage(), async (_url, options) => {
    if (options && options.method === 'GET') return { ok: true, json: async () => ({ preferences: [{ id: 'aiSettings', value: prefsStore.aiSettings }] }) };
    return { ok: true, json: async () => ({}) };
  });
  assert.equal(store.settings().modelByProvider.gemini, 'gemini-3.1-pro-preview');
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

// GPT-5.6 family (2026-08-29): OpenAI's Sol/Terra/Luna explicit model ids, added directly to the
// one canonical openai catalog entry - never a second hardcoded model list. These tests cover the
// exact task requirements: catalog membership, the new default, and legacy-selection safety.
test("the openai catalog entry includes the exact GPT-5.6 Sol/Terra/Luna model ids", async () => {
  const store = await settingsSandbox();
  const catalog = store.providerCatalog();
  const openai = catalog.find((p) => p.id === 'openai');
  assert.ok(openai.models.indexOf('gpt-5.6-sol') > -1, 'gpt-5.6-sol must be in the catalog');
  assert.ok(openai.models.indexOf('gpt-5.6-terra') > -1, 'gpt-5.6-terra must be in the catalog');
  assert.ok(openai.models.indexOf('gpt-5.6-luna') > -1, 'gpt-5.6-luna must be in the catalog');
  // Legacy ids must never be removed - existing gpt-5.6/gpt-4.1/gpt-4o users must keep working.
  assert.ok(openai.models.indexOf('gpt-5.6') > -1, 'the legacy gpt-5.6 alias must remain selectable');
  assert.ok(openai.models.indexOf('gpt-4.1') > -1, 'gpt-4.1 must remain selectable');
  assert.ok(openai.models.indexOf('gpt-4o') > -1, 'gpt-4o must remain selectable');
});

// 2026-08-30: default flipped from Sol to Luna (the economical tier) for every account that has
// never explicitly picked a model - see the ai-settings-store.js file-top comment for why this is
// a pure reorder of models[0], safe for every existing user.
test('a brand-new user (no stored settings) defaults the OpenAI model to gpt-5.6-luna, the economical tier', async () => {
  const store = await settingsSandbox();
  const settings = store.settings();
  assert.equal(settings.modelByProvider.openai, 'gpt-5.6-luna');
  assert.equal(store.activeModel(), 'gpt-5.6-luna');
});

// "When the user reloads or comes back, whatever they picked must stay picked, never reset to the
// default" - an explicit Sol/Terra selection must survive a fresh load exactly like the pre-
// existing legacy-selection tests below, even though Luna is now the default for everyone else.
test('an existing user who explicitly selected GPT-5.6 Sol or Terra keeps that exact selection across a fresh load - it is never reset to the new Luna default', async () => {
  for (const chosenModel of ['gpt-5.6-sol', 'gpt-5.6-terra']) {
    const prefsStore = { aiSettings: { provider: 'openai', modelByProvider: { openai: chosenModel } } };
    const fetchImpl = async (url, options) => {
      if (options && options.method === 'POST') { const body = JSON.parse(options.body); prefsStore[body.id] = body.value; return { ok: true, json: async () => body }; }
      return { ok: true, json: async () => ({ preferences: Object.keys(prefsStore).map((id) => ({ id: id, value: prefsStore[id] })) }) };
    };
    const store = await settingsSandbox(memoryStorage(), fetchImpl);
    assert.equal(store.settings().modelByProvider.openai, chosenModel, chosenModel + ' must survive a fresh load unchanged, not revert to gpt-5.6-luna');
    assert.equal(store.activeModel(), chosenModel);
  }
});

// "Do not silently migrate an existing user from an old model to a more expensive model" - a
// legacy stored selection must survive the catalog reorder untouched, never be coerced to the
// new default.
test('an existing user with a legacy stored openai model selection (gpt-5.6) is preserved exactly, not migrated to gpt-5.6-luna', async () => {
  const prefsStore = { aiSettings: { provider: 'openai', modelByProvider: { openai: 'gpt-5.6' } } };
  const fetchImpl = async (url, options) => {
    if (options && options.method === 'POST') { const body = JSON.parse(options.body); prefsStore[body.id] = body.value; return { ok: true, json: async () => body }; }
    return { ok: true, json: async () => ({ preferences: Object.keys(prefsStore).map((id) => ({ id: id, value: prefsStore[id] })) }) };
  };
  const store = await settingsSandbox(memoryStorage(), fetchImpl);
  assert.equal(store.settings().modelByProvider.openai, 'gpt-5.6', 'the stored legacy selection must win over the new default');
  assert.equal(store.activeModel(), 'gpt-5.6');
});

test('the default is read exclusively from models[0], never from a separate hardcoded default field - reordering the array is what actually changes the default', async () => {
  const store = await settingsSandbox();
  const openai = store.providerCatalog().find((p) => p.id === 'openai');
  assert.equal(openai.models[0], 'gpt-5.6-luna', 'models[0] must be gpt-5.6-luna, since defaults() reads exactly this');
});

test('an existing user with a legacy stored gpt-4.1 or gpt-4o selection is also preserved exactly, and never becomes blank', async () => {
  for (const legacyModel of ['gpt-4.1', 'gpt-4o']) {
    const prefsStore = { aiSettings: { provider: 'openai', modelByProvider: { openai: legacyModel } } };
    const fetchImpl = async (url, options) => {
      if (options && options.method === 'POST') { const body = JSON.parse(options.body); prefsStore[body.id] = body.value; return { ok: true, json: async () => body }; }
      return { ok: true, json: async () => ({ preferences: Object.keys(prefsStore).map((id) => ({ id: id, value: prefsStore[id] })) }) };
    };
    const store = await settingsSandbox(memoryStorage(), fetchImpl);
    assert.equal(store.settings().modelByProvider.openai, legacyModel, legacyModel + ' must survive unchanged');
    assert.ok(store.activeModel(), legacyModel + ' must never resolve to a blank/falsy active model');
  }
});

test('presentation metadata (modelLabels/modelTiers) lives on the same canonical openai catalog entry, not a second model list, and legacy ids carry no metadata', async () => {
  const store = await settingsSandbox();
  const openai = store.providerCatalog().find((p) => p.id === 'openai');
  assert.equal(openai.modelLabels['gpt-5.6-sol'], 'GPT-5.6 Sol');
  assert.equal(openai.modelLabels['gpt-5.6-terra'], 'GPT-5.6 Terra');
  assert.equal(openai.modelLabels['gpt-5.6-luna'], 'GPT-5.6 Luna');
  assert.equal(openai.modelTiers['gpt-5.6-sol'], 'frontier');
  assert.equal(openai.modelTiers['gpt-5.6-terra'], 'balanced');
  assert.equal(openai.modelTiers['gpt-5.6-luna'], 'economical');
  assert.equal(openai.modelLabels['gpt-5.6'], undefined, 'the legacy alias deliberately carries no display metadata');
  assert.equal(openai.modelLabels['gpt-4.1'], undefined);
  assert.equal(openai.modelLabels['gpt-4o'], undefined);
});
