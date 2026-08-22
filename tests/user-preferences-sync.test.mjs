import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Phase 8a of the local-first-to-server-authoritative migration (see ARCHITECTURE.md's Known
// Constraints section): user-preferences.js is the generic, reusable client-side primitive every
// Phase 8 sub-module reads/writes preferences through - modeled as a list domain (one "record"
// per preference key) so it reuses server-replica.js's exact existing contract, the same
// dynamic-vm-sandbox convention every other migrated domain's own *-sync.test.mjs already uses.
const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = (file) => readFile(shared(file), 'utf8');

function memoryStorage(seed) {
  const values = new Map(Object.entries(seed || {}));
  return { getItem: (key) => (values.has(key) ? values.get(key) : null), setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key), key: (index) => Array.from(values.keys())[index] || null, get length() { return values.size; } };
}
function flush() { return new Promise((resolve) => setImmediate(resolve)); }

async function loadPreferences({ localStorage, fetchImpl, currentUserId }) {
  if (currentUserId) localStorage.setItem('tradejournal:auth-token', currentUserId);
  const fetchCalls = [];
  const fetchFn = async (url, options) => { fetchCalls.push([url, options]); return fetchImpl ? fetchImpl(url, options) : { ok: false, status: 500 }; };
  const sandbox = {
    window: {}, localStorage, fetch: fetchFn,
    document: { body: { appendChild() {} }, documentElement: { lang: 'en' }, createElement: () => ({ setAttribute() {} }) },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options && options.detail; } }
  };
  sandbox.window = Object.assign(sandbox.window, { localStorage, dispatchEvent() {}, addEventListener() {} });
  vm.runInNewContext(await source('server-replica.js'), sandbox, { filename: 'server-replica.js' });
  vm.runInNewContext(await source('user-preferences.js'), sandbox, { filename: 'user-preferences.js' });
  return { prefs: sandbox.window.TradeJournalUserPreferences, replica: sandbox.window.TradeJournalServerReplica, fetchCalls, localStorage };
}

test('registers a preferences list domain with server-replica.js and hydrates it at load time', async () => {
  const localStorage = memoryStorage();
  const { replica, fetchCalls } = await loadPreferences({ localStorage, currentUserId: 'user-1', fetchImpl: async () => ({ ok: true, json: async () => ({ preferences: [] }) }) });
  assert.ok(replica.domain('preferences'), 'the preferences domain must be registered');
  await flush();
  const hydrateCall = fetchCalls.find((call) => call[0] === '/api/sync/preferences' && (!call[1] || call[1].method === undefined));
  assert.ok(hydrateCall, 'a GET /api/sync/preferences must have been made to hydrate');
});

test('getPref() returns the caller-supplied fallback before hydration and when no override exists on the server', async () => {
  const localStorage = memoryStorage();
  const { prefs } = await loadPreferences({ localStorage, currentUserId: 'user-1', fetchImpl: async () => ({ ok: true, json: async () => ({ preferences: [] }) }) });
  assert.equal(prefs.getPref('similarityThreshold', 70), 70, 'not yet hydrated - falls back');
  await flush();
  assert.equal(prefs.getPref('similarityThreshold', 70), 70, 'hydrated, but the server genuinely has no override for this key');
});

test('getPref() returns the real server value once hydrated, not the fallback', async () => {
  const localStorage = memoryStorage();
  const { prefs } = await loadPreferences({ localStorage, currentUserId: 'user-1', fetchImpl: async () => ({ ok: true, json: async () => ({ preferences: [{ id: 'similarityThreshold', value: 85, updatedAt: 'x' }] }) }) });
  await flush();
  assert.equal(prefs.getPref('similarityThreshold', 70), 85);
});

test('setPref() applies optimistically and synchronously, then POSTs {id, value} to /api/sync/preferences in the background', async () => {
  const localStorage = memoryStorage();
  let resolvePost;
  const postPromise = new Promise((resolve) => { resolvePost = resolve; });
  const { prefs, fetchCalls } = await loadPreferences({
    localStorage, currentUserId: 'user-1',
    fetchImpl: async (url, options) => {
      if (options && options.method === 'POST') { resolvePost(); return { ok: true, json: async () => JSON.parse(options.body) }; }
      return { ok: true, json: async () => ({ preferences: [] }) };
    }
  });
  await flush();
  prefs.setPref('similarityThreshold', 90);
  assert.equal(prefs.getPref('similarityThreshold', 70), 90, 'the optimistic write already applied before the network call resolves');
  await postPromise;
  const post = fetchCalls.find((call) => call[1] && call[1].method === 'POST');
  assert.ok(post, 'a POST to /api/sync/preferences must have been sent');
  assert.equal(post[0], '/api/sync/preferences');
  assert.deepEqual(JSON.parse(post[1].body), { id: 'similarityThreshold', value: 90 });
});

test('a failed setPref() rolls back to the previous value', async () => {
  const localStorage = memoryStorage();
  const { prefs } = await loadPreferences({
    localStorage, currentUserId: 'user-1',
    fetchImpl: async (url, options) => (options && options.method === 'POST') ? { ok: false, status: 500 } : { ok: true, json: async () => ({ preferences: [{ id: 'similarityThreshold', value: 70, updatedAt: 'x' }] }) }
  });
  await flush();
  prefs.setPref('similarityThreshold', 90);
  assert.equal(prefs.getPref('similarityThreshold', 70), 90);
  await flush();
  assert.equal(prefs.getPref('similarityThreshold', 70), 70, 'a failed write must roll back to the last real server value');
});

test('changing one preference never touches a different key - a per-record upsert, not a whole-document write', async () => {
  const localStorage = memoryStorage();
  const { prefs } = await loadPreferences({
    localStorage, currentUserId: 'user-1',
    fetchImpl: async (url, options) => (options && options.method === 'POST') ? { ok: true, json: async () => JSON.parse(options.body) } : { ok: true, json: async () => ({ preferences: [{ id: 'language', value: 'fa', updatedAt: 'x' }] }) }
  });
  await flush();
  prefs.setPref('similarityThreshold', 90);
  assert.equal(prefs.getPref('language', 'en'), 'fa', 'an unrelated key must survive a different key being written');
});

test('resetPref() DELETEs the override and getPref() falls back to the caller-supplied default again', async () => {
  const localStorage = memoryStorage();
  const { prefs, fetchCalls } = await loadPreferences({
    localStorage, currentUserId: 'user-1',
    fetchImpl: async (url, options) => {
      if (options && options.method === 'DELETE') return { ok: true, status: 204 };
      return { ok: true, json: async () => ({ preferences: [{ id: 'similarityThreshold', value: 90, updatedAt: 'x' }] }) };
    }
  });
  await flush();
  assert.equal(prefs.getPref('similarityThreshold', 70), 90);
  prefs.resetPref('similarityThreshold');
  assert.equal(prefs.getPref('similarityThreshold', 70), 70, 'removed optimistically and synchronously');
  await flush();
  const del = fetchCalls.find((call) => call[1] && call[1].method === 'DELETE');
  assert.ok(del);
  assert.equal(del[0], '/api/sync/preferences/similarityThreshold');
});

test('cross-account isolation: user A\'s preferences are invisible to user B on the same browser - a fresh replica per page load, never a shared cache', async () => {
  const localStorage = memoryStorage();
  const a = await loadPreferences({
    localStorage, currentUserId: 'user-A',
    fetchImpl: async (url, options) => (options && options.method === 'POST') ? { ok: true, json: async () => JSON.parse(options.body) } : { ok: true, json: async () => ({ preferences: [] }) }
  });
  await flush();
  a.prefs.setPref('similarityThreshold', 20);
  assert.equal(a.prefs.getPref('similarityThreshold', 70), 20);

  const b = await loadPreferences({ localStorage, currentUserId: 'user-B', fetchImpl: async () => ({ ok: true, json: async () => ({ preferences: [] }) }) });
  await flush();
  assert.equal(b.prefs.getPref('similarityThreshold', 70), 70, "user B must never see user A's preference value - falls back to the real default");
});

test('isHydrated() reflects the domain\'s own real hydration state', async () => {
  const localStorage = memoryStorage();
  const { prefs } = await loadPreferences({ localStorage, currentUserId: 'user-1', fetchImpl: async () => ({ ok: true, json: async () => ({ preferences: [] }) }) });
  assert.equal(prefs.isHydrated(), false);
  await flush();
  assert.equal(prefs.isHydrated(), true);
});

test('no localStorage key is ever written for preferences - this module never touches localStorage except the one shared credential read server-replica.js itself owns', async () => {
  const localStorage = memoryStorage();
  const { prefs } = await loadPreferences({ localStorage, currentUserId: 'user-1', fetchImpl: async () => ({ ok: true, json: async () => ({ preferences: [] }) }) });
  await flush();
  prefs.setPref('similarityThreshold', 90);
  assert.equal(localStorage.getItem('tradejournal:session-similarity-threshold:v1'), null, 'the old raw key must never be written by the new module');
});

test('server-replica.js loads before user-preferences.js on all four character pages', async () => {
  for (const character of ['hunter', 'engineer', 'commander', 'sage']) {
    const html = await readFile(path.join(root, 'public', 'pages', character, 'index.html'), 'utf8');
    const replicaIndex = html.indexOf('<script src="../shared/server-replica.js">');
    const prefsIndex = html.indexOf('<script src="../shared/user-preferences.js">');
    assert.ok(replicaIndex > -1, character + ': server-replica.js present');
    assert.ok(prefsIndex > -1, character + ': user-preferences.js present');
    assert.ok(replicaIndex < prefsIndex, character + ': server-replica.js loads before user-preferences.js');
  }
});
