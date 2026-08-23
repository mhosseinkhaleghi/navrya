import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Phase 2 of the local-first-to-server-authoritative migration (see ARCHITECTURE.md's Global
// Data Sync section / the Phase 2 report) replaced Trade Store's local-first-cache-plus-offline-
// outbox mechanism with server-replica.js's in-memory replica, the same way
// tests/patterns-sync.test.mjs/tests/strategies-sync.test.mjs's own header comments describe for
// their domains. This file replaces the old dynamic sync-queue-based tests with coverage against
// the new replica mechanism.
const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = (file) => readFile(shared(file), 'utf8');

function flush() { return new Promise((resolve) => setImmediate(resolve)); }

function memoryStorage(seed) {
  const values = new Map(Object.entries(seed || {}));
  return { getItem: (key) => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key), key: (index) => Array.from(values.keys())[index] || null, get length() { return values.size; } };
}

class FakeFileReader {
  readAsDataURL() { this.result = 'data:image/png;base64,AA=='; if (this.onload) this.onload(); }
}

async function loadTradeStore({ localStorage, fetchImpl, currentUserId, patternStore }) {
  const fetchCalls = [];
  const fetchFn = async (url, options) => { fetchCalls.push([url, options]); return fetchImpl ? fetchImpl(url, options) : { ok: false, status: 500 }; };
  // Cookie-based sessions (ADR-0001): server-replica.js's hasCurrentUser() gate now reads
  // window.__NAVRYA_AUTH__ instead of a localStorage credential.
  const authState = currentUserId
    ? { authenticated: true, userId: currentUserId, user: { id: currentUserId }, csrfToken: 'test-csrf' }
    : { authenticated: false, userId: null, user: null, csrfToken: null };
  const sandbox = {
    window: { __NAVRYA_AUTH__: authState }, localStorage,
    document: { body: { dataset: {} } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options && options.detail; } },
    FileReader: FakeFileReader, fetch: fetchFn
  };
  sandbox.window = Object.assign(sandbox.window, {
    localStorage, dispatchEvent() {}, addEventListener() {},
    TradeJournalTradeTypes: { timeframes: ['1m', '5m'] }, TradeJournalPanelLayer: { character: 'hunter' },
    TradeJournalDevUserSwitcher: { currentUserId: () => currentUserId || null },
    TradeJournalPatternStore: patternStore
  });
  vm.runInNewContext(await source('server-replica.js'), sandbox, { filename: 'server-replica.js' });
  vm.runInNewContext(await source('trade-store.js'), sandbox, { filename: 'trade-store.js' });
  return { store: sandbox.window.TradeJournalTradeStore, replica: sandbox.window.TradeJournalServerReplica, fetchCalls, localStorage };
}

test('registers a trades list domain with server-replica.js and hydrates it at load time', async () => {
  const localStorage = memoryStorage();
  const { replica, fetchCalls } = await loadTradeStore({ localStorage, currentUserId: 'user-1', fetchImpl: async () => ({ ok: true, json: async () => ({ trades: [] }) }) });
  assert.ok(replica.domain('trades'));
  await flush();
  assert.ok(fetchCalls.some((call) => call[0] === '/api/sync/trades' && (!call[1] || !call[1].method)));
});

test('a brand-new account with nothing on the server starts genuinely empty', async () => {
  const localStorage = memoryStorage();
  const { store } = await loadTradeStore({ localStorage, currentUserId: 'user-1', fetchImpl: async () => ({ ok: true, json: async () => ({ trades: [] }) }) });
  await flush();
  assert.equal(store.listSync().length, 0);
});

test('save() applies optimistically and returns synchronously, then POSTs the record in the background', async () => {
  const localStorage = memoryStorage();
  const { store, fetchCalls } = await loadTradeStore({
    localStorage, currentUserId: 'user-1',
    fetchImpl: async (url, options) => (options && options.method === 'POST') ? { ok: true, json: async () => JSON.parse(options.body) } : { ok: true, json: async () => ({ trades: [] }) }
  });
  await flush();
  const draft = store.createDraft({ status: 'hunting' });
  const saved = store.save(draft);
  assert.equal(saved.id, draft.id, 'save() returns synchronously');
  assert.equal(store.listSync().length, 1, 'the optimistic write already applied before the network call resolves');
  await flush();
  const post = fetchCalls.find((call) => call[1] && call[1].method === 'POST');
  assert.equal(post[0], '/api/sync/trades');
  assert.equal(JSON.parse(post[1].body).id, draft.id);
});

test('a failed save() rolls back the optimistic write', async () => {
  const localStorage = memoryStorage();
  const { store } = await loadTradeStore({
    localStorage, currentUserId: 'user-1',
    fetchImpl: async (url, options) => (options && options.method === 'POST') ? { ok: false, status: 500 } : { ok: true, json: async () => ({ trades: [] }) }
  });
  await flush();
  store.save(store.createDraft({ status: 'hunting' }));
  await flush();
  assert.equal(store.listSync().length, 0);
});

test('remove() DELETEs the real record', async () => {
  const localStorage = memoryStorage();
  const { store } = await loadTradeStore({
    localStorage, currentUserId: 'user-1',
    fetchImpl: async (url, options) => {
      if (options && options.method === 'DELETE') return { ok: true, status: 204 };
      return { ok: true, json: async () => ({ trades: [{ id: 'trade-1', status: 'hunting' }] }) };
    }
  });
  await flush();
  assert.equal(store.listSync().length, 1);
  store.remove('trade-1');
  await flush();
  assert.equal(store.listSync().length, 0);
});

test('save() still records Pattern Registry usage deltas exactly as before - recordUsage() itself is unaffected, Patterns already migrated onto the same replica infrastructure', async () => {
  const recordUsageCalls = [];
  const localStorage = memoryStorage();
  const { store } = await loadTradeStore({
    localStorage, currentUserId: 'user-1',
    fetchImpl: async (url, options) => (options && options.method === 'POST') ? { ok: true, json: async () => JSON.parse(options.body) } : { ok: true, json: async () => ({ trades: [] }) },
    patternStore: { recordUsage: (id, delta) => recordUsageCalls.push([id, delta]) }
  });
  await flush();
  const trade = store.save(store.createDraft({ status: 'hunting', linkedPatternIds: ['pattern-1'] }));
  assert.ok(recordUsageCalls.some((call) => call[0] === 'pattern-1' && call[1] === 1));
  store.save(Object.assign(trade, { linkedPatternIds: [] }));
  assert.ok(recordUsageCalls.some((call) => call[0] === 'pattern-1' && call[1] === -1));
});

test("addScreenshots() uploads via POST /api/sync/trades/images and stores imageUrl - no IndexedDB, no blobId", async () => {
  const localStorage = memoryStorage();
  const { store } = await loadTradeStore({
    localStorage, currentUserId: 'user-1',
    fetchImpl: async (url, options) => {
      if (url === '/api/sync/trades/images') return { ok: true, json: async () => ({ url: '/uploads/trade/real.png' }) };
      if (options && options.method === 'POST') return { ok: true, json: async () => JSON.parse(options.body) };
      return { ok: true, json: async () => ({ trades: [] }) };
    }
  });
  await flush();
  const trade = store.save(store.createDraft({ status: 'open' }));
  const updated = await store.addScreenshots(trade.id, [{ type: 'image/png', size: 10, name: 'a.png' }]);
  assert.equal(updated.screenshots[0].imageUrl, '/uploads/trade/real.png');
  assert.equal(updated.screenshots[0].blobId, undefined);
});

test('addScreenshots() falls back to an embedded dataUrl when the upload fails', async () => {
  const localStorage = memoryStorage();
  const { store } = await loadTradeStore({
    localStorage, currentUserId: 'user-1',
    fetchImpl: async (url, options) => {
      if (url === '/api/sync/trades/images') return { ok: false, status: 500 };
      if (options && options.method === 'POST') return { ok: true, json: async () => JSON.parse(options.body) };
      return { ok: true, json: async () => ({ trades: [] }) };
    }
  });
  await flush();
  const trade = store.save(store.createDraft({ status: 'open' }));
  const updated = await store.addScreenshots(trade.id, [{ type: 'image/png', size: 10, name: 'a.png' }]);
  assert.equal(updated.screenshots[0].imageUrl, undefined);
  assert.equal(updated.screenshots[0].dataUrl, 'data:image/png;base64,AA==');
});

test('screenshotUrl() prefers imageUrl over dataUrl', async () => {
  const localStorage = memoryStorage();
  const { store } = await loadTradeStore({ localStorage, currentUserId: 'user-1', fetchImpl: async () => ({ ok: true, json: async () => ({ trades: [] }) }) });
  await flush();
  assert.equal(await store.screenshotUrl({ imageUrl: '/uploads/x.png', dataUrl: 'data:...' }), '/uploads/x.png');
});

test('no localStorage key is ever written for trades any more - Phase 2 removed the write-through cache entirely (trade-settings is unaffected - a Group B preference, still local-only for this pass)', async () => {
  const localStorage = memoryStorage();
  const { store } = await loadTradeStore({ localStorage, currentUserId: 'user-1', fetchImpl: async (url, options) => (options && options.method === 'POST') ? { ok: true, json: async () => JSON.parse(options.body) } : { ok: true, json: async () => ({ trades: [] }) } });
  await flush();
  store.save(store.createDraft({ status: 'hunting' }));
  assert.equal(localStorage.getItem('tradejournal:trades:v1'), null);
});

test('cross-account isolation: user A\'s trade is invisible to user B on the same browser', async () => {
  const localStorage = memoryStorage();
  const a = await loadTradeStore({ localStorage, currentUserId: 'user-A', fetchImpl: async (url, options) => (options && options.method === 'POST') ? { ok: true, json: async () => JSON.parse(options.body) } : { ok: true, json: async () => ({ trades: [] }) } });
  await flush();
  a.store.save(a.store.createDraft({ status: 'hunting' }));
  assert.equal(a.store.listSync().length, 1);

  const b = await loadTradeStore({ localStorage, currentUserId: 'user-B', fetchImpl: async () => ({ ok: true, json: async () => ({ trades: [] }) }) });
  await flush();
  assert.equal(b.store.listSync().length, 0);
});

// --- Strategy Education's orphanLinkedTrades() cross-domain behavior. Both Strategy Education
// AND Trade Store are migrated (Phase 2) - orphanLinkedTrades() was found and fixed as part of
// the Trade Store migration to go through the real window.TradeJournalTradeStore public API
// (tradeStore.save(), which already applies optimistically and pushes to the server itself)
// instead of reading/writing tradejournal:trades:v1 directly, which no longer exists as a
// localStorage key - the old direct-localStorage version would have silently become a no-op the
// moment Trade Store stopped writing that key, a real regression caught here, not left for a bug
// report. There is no sync-queue involved in this path at all any more. ---

test('deleting a strategy orphans linked trades through the real Trade Store API, pushing the updated record to the server - a trade never linked to the deleted strategy is left untouched', async () => {
  const postedTrades = [];
  const localStorage = memoryStorage();
  const sandbox = {
    window: { __NAVRYA_AUTH__: { authenticated: true, userId: 'test-user', user: { id: 'test-user' }, csrfToken: 'test-csrf' } }, localStorage,
    document: { documentElement: { lang: 'en' }, body: { dataset: {} } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options && options.detail; } },
    FileReader: class {},
    fetch: async (url, options) => {
      if (options && options.method === 'DELETE') return { ok: true, status: 204 };
      if (url === '/api/sync/trades' && options && options.method === 'POST') { postedTrades.push(JSON.parse(options.body)); return { ok: true, json: async () => JSON.parse(options.body) }; }
      if (options && options.method === 'POST') return { ok: true, json: async () => JSON.parse(options.body) }; // strategies POST
      if (url === '/api/sync/trades') return { ok: true, json: async () => ({ trades: [{ id: 'trade-orphan', status: 'open', linkedStrategyId: 'strategy-to-delete' }, { id: 'trade-other', status: 'closed', linkedStrategyId: null }] }) };
      return { ok: true, json: async () => ({ strategies: [] }) };
    }
  };
  sandbox.window = Object.assign(sandbox.window, {
    localStorage, dispatchEvent() {}, addEventListener() {},
    TradeJournalStrategyEducationTypes: { numericPaths: [] },
    TradeJournalTradeTypes: { timeframes: ['1m', '5m'] }, TradeJournalPanelLayer: { character: 'hunter' },
    TradeJournalDevUserSwitcher: { currentUserId: () => 'test-user' }
  });
  vm.runInNewContext(await source('server-replica.js'), sandbox, { filename: 'server-replica.js' });
  vm.runInNewContext(await source('trade-store.js'), sandbox, { filename: 'trade-store.js' });
  vm.runInNewContext(await source('strategy-education-store.js'), sandbox, { filename: 'strategy-education-store.js' });
  await flush(); // let both domains' hydrate() settle first, matching the real app's own boot-gate ordering
  const strategyStore = sandbox.window.TradeJournalStrategyEducationStore;
  const tradeStore = sandbox.window.TradeJournalTradeStore;
  const strategy = strategyStore.create({ id: 'strategy-to-delete', name: 'Doomed strategy' });
  await strategyStore.remove(strategy.id);
  await flush();

  assert.equal(tradeStore.find('trade-orphan').linkedStrategyId, null, 'the orphaned trade\'s own in-memory record must be nulled out');
  const orphanPost = postedTrades.find((trade) => trade.id === 'trade-orphan');
  assert.ok(orphanPost, 'the orphaned trade must be pushed to the server via the real Trade Store save path');
  assert.equal(orphanPost.linkedStrategyId, null);
  assert.equal(postedTrades.some((trade) => trade.id === 'trade-other'), false, 'a trade that was never linked to the deleted strategy must not be re-synced');
});

test('server-replica.js loads before trade-store.js on all four character pages', async () => {
  for (const character of ['hunter', 'engineer', 'commander', 'sage']) {
    const html = await readFile(path.join(root, 'public', 'pages', character, 'index.html'), 'utf8');
    const replicaIndex = html.indexOf('<script src="../shared/server-replica.js">');
    const storeIndex = html.indexOf('<script src="../shared/trade-store.js">');
    assert.ok(replicaIndex > -1 && replicaIndex < storeIndex, character + ': server-replica.js loads before trade-store.js');
  }
});

test('the statusHistory schema drift is fixed: entries use timestamp, not at', async () => {
  const text = await source('trade-store.js');
  assert.match(text, /function statusHistory\(item,status,timestamp\)\{var values=array\(item\);if\(!values\.length\|\|values\[values\.length-1\]\.status!==status\)values\.push\(\{status:status,timestamp:timestamp\|\|now\(\)\}\);return values;\}/);
  assert.doesNotMatch(text, /statusHistory:\[\{status:status,at:stamp\}\]/);
});

test('the aiPredictionLinks schema drift is fixed: the JSDoc declares correct, matching what analytics() reads', async () => {
  const types = await source('trade.types.js');
  assert.match(types, /aiPredictionLinks\?:\{id:string,patternId\?:string,correct:boolean\|null\}\[\]/);
  assert.doesNotMatch(types, /matched:boolean\|null/);
});
