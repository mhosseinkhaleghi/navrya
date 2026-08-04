import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// mental-health-store.js has no DOM references at all (confirmed - it's pure localStorage/
// window logic), the same property that makes trade-store.js vm-sandbox-testable (see
// tests/trades-sync.test.mjs's header comment) - so this file exercises the Module 5 sync
// wiring dynamically too, instead of regexing source text.
const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = (file) => readFile(shared(file), 'utf8');

function memoryStorage(seed) {
  const values = new Map(Object.entries(seed || {}));
  return { getItem: (key) => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key), key: (index) => Array.from(values.keys())[index] || null, get length() { return values.size; } };
}

function flush() { return new Promise((resolve) => setImmediate(resolve)); }

async function loadMentalHealthStore({ localStorage, fetchImpl, currentUserId }) {
  const senders = {};
  const enqueueCalls = [];
  const fetchCalls = [];
  const fetchFn = async (url, options) => { fetchCalls.push([url, options]); return fetchImpl ? fetchImpl(url, options) : { ok: false, status: 500 }; };
  const events = [];
  const sandbox = {
    window: {}, localStorage,
    document: { documentElement: { lang: 'en' } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options && options.detail; } },
    fetch: fetchFn
  };
  sandbox.window = Object.assign(sandbox.window, {
    localStorage, dispatchEvent: (event) => events.push(event), setTimeout: (fn) => fn(), addEventListener() {},
    TradeJournalSyncQueue: { registerModule: (name, fn) => { senders[name] = fn; }, enqueue: (...args) => enqueueCalls.push(args) },
    TradeJournalDevUserSwitcher: { currentUserId: () => currentUserId || null }
  });
  vm.runInNewContext(await source('mental-health-store.js'), sandbox, { filename: 'mental-health-store.js' });
  return { store: sandbox.window.TradeJournalMentalHealthStore, senders, enqueueCalls, fetchCalls, events, localStorage };
}

test('registers a mental-health sender that POSTs the whole profile document to /api/sync/mental-health', async () => {
  const { senders, fetchCalls } = await loadMentalHealthStore({ localStorage: memoryStorage(), currentUserId: 'user-1', fetchImpl: async () => ({ ok: true }) });
  assert.ok(senders['mental-health'], 'a mental-health sender must be registered');
  await senders['mental-health']({ recordId: 'profile', payload: { userId: 'local-trader' } });
  const call = fetchCalls[fetchCalls.length - 1];
  assert.equal(call[0], '/api/sync/mental-health');
  assert.equal(call[1].method, 'POST');
});

test('every mutation (save/addMessage/addRedFlag) funnels through write() and enqueues under the mental-health module with a fixed profile record id', async () => {
  const { store, enqueueCalls } = await loadMentalHealthStore({ localStorage: memoryStorage(), currentUserId: null });
  store.save(store.load());
  store.addMessage(store.load(), 'user', 'hello');
  store.addRedFlag(store.load(), 'revenge_trading', 'two trades in five minutes');
  const calls = enqueueCalls.filter((call) => call[0] === 'mental-health');
  assert.ok(calls.length >= 3, 'save(), addMessage(), and addRedFlag() must each enqueue once, since they all funnel through write()');
  calls.forEach((call) => assert.equal(call[1], 'profile', 'the record id is a fixed constant - there is only ever one profile document'));
});

test('the one-time activation adopts the server profile outright when present, regardless of local timestamps', async () => {
  const localStorage = memoryStorage({ 'tradejournal:mental-health-profile:v2': JSON.stringify({ userId: 'local-trader', lastUpdatedAt: '2026-06-01T00:00:00.000Z', baseline: { initialStressLevel: 1 } }) });
  const serverProfile = { userId: 'local-trader', lastUpdatedAt: '2020-01-01T00:00:00.000Z', baseline: { initialStressLevel: 9 } };
  const { localStorage: after } = await loadMentalHealthStore({
    localStorage, currentUserId: 'user-1',
    fetchImpl: async () => ({ ok: true, json: async () => ({ profile: serverProfile }) })
  });
  await flush();
  const stored = JSON.parse(after.getItem('tradejournal:mental-health-profile:v2'));
  assert.equal(stored.baseline.initialStressLevel, 9, 'first-activation adopts the server profile outright, even though it is chronologically older than the local one');
  assert.ok(after.getItem('tradejournal:mental-health-migrated:v1:user-1'), 'the migration flag must be set after a successful check');
});

test('the one-time activation pushes the local profile up when the server has none yet', async () => {
  const localStorage = memoryStorage({ 'tradejournal:mental-health-profile:v2': JSON.stringify({ userId: 'local-trader', baseline: { initialStressLevel: 4 } }) });
  const { enqueueCalls } = await loadMentalHealthStore({
    localStorage, currentUserId: 'user-1',
    fetchImpl: async () => ({ ok: true, json: async () => ({ profile: null }) })
  });
  await flush();
  const pushed = enqueueCalls.find((call) => call[0] === 'mental-health' && call[1] === 'profile');
  assert.ok(pushed, 'a genuinely empty server must receive the pre-existing local profile');
});

test('the one-time activation pushes nothing when there is no local profile and the server has none either - there is nothing meaningful to push', async () => {
  const localStorage = memoryStorage();
  const { enqueueCalls } = await loadMentalHealthStore({
    localStorage, currentUserId: 'user-1',
    fetchImpl: async () => ({ ok: true, json: async () => ({ profile: null }) })
  });
  await flush();
  const pushed = enqueueCalls.find((call) => call[0] === 'mental-health');
  assert.equal(pushed, undefined, 'a brand-new browser with no saved profile yet must not push an empty/placeholder document');
});

test('steady-state reconciliation (the online event) keeps whichever copy has the newer lastUpdatedAt, not always the server', async () => {
  const newerLocal = memoryStorage({
    'tradejournal:mental-health-profile:v2': JSON.stringify({ userId: 'local-trader', lastUpdatedAt: '2026-06-05T00:00:00.000Z', baseline: { initialStressLevel: 7 } }),
    'tradejournal:mental-health-migrated:v1:user-1': '2026-01-01T00:00:00.000Z'
  });
  await loadMentalHealthStore({
    localStorage: newerLocal, currentUserId: 'user-1',
    fetchImpl: async () => ({ ok: true, json: async () => ({ profile: { userId: 'local-trader', lastUpdatedAt: '2026-01-01T00:00:00.000Z', baseline: { initialStressLevel: 1 } } }) })
  });
  await flush();
  const stillLocal = JSON.parse(newerLocal.getItem('tradejournal:mental-health-profile:v2'));
  assert.equal(stillLocal.baseline.initialStressLevel, 7, 'a newer local edit must survive a reconcile against an older server copy');

  const olderLocal = memoryStorage({
    'tradejournal:mental-health-profile:v2': JSON.stringify({ userId: 'local-trader', lastUpdatedAt: '2020-01-01T00:00:00.000Z', baseline: { initialStressLevel: 7 } }),
    'tradejournal:mental-health-migrated:v1:user-1': '2026-01-01T00:00:00.000Z'
  });
  await loadMentalHealthStore({
    localStorage: olderLocal, currentUserId: 'user-1',
    fetchImpl: async () => ({ ok: true, json: async () => ({ profile: { userId: 'local-trader', lastUpdatedAt: '2026-06-05T00:00:00.000Z', baseline: { initialStressLevel: 9 } } }) })
  });
  await flush();
  const nowServer = JSON.parse(olderLocal.getItem('tradejournal:mental-health-profile:v2'));
  assert.equal(nowServer.baseline.initialStressLevel, 9, 'a newer server copy must replace a stale local one during reconcile');
});

test('all four character pages load sync-queue.js and dev-user-switcher.js before mental-health-store.js', async () => {
  for (const character of ['hunter', 'engineer', 'commander', 'sage']) {
    const html = await readFile(path.join(root, 'public', 'pages', character, 'index.html'), 'utf8');
    const queueIndex = html.indexOf('sync-queue.js');
    const switcherIndex = html.indexOf('dev-user-switcher.js');
    const storeIndex = html.indexOf('mental-health-store.js');
    assert.ok(queueIndex > -1 && queueIndex < storeIndex, character + ': sync-queue.js before mental-health-store.js');
    assert.ok(switcherIndex > -1 && switcherIndex < storeIndex, character + ': dev-user-switcher.js before mental-health-store.js');
  }
});
