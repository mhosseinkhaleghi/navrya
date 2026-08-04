import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Unlike session-workspace-logic.js/pattern-registry-store.js/strategy-education-store.js
// (static source assertions only - see tests/trading-sessions-sync.test.mjs's header comment),
// trade-store.js is already proven vm-sandbox-testable by tests/trade-regression.test.mjs (it
// never touches the DOM directly, only reads document.body.dataset), so this file exercises the
// Module 4 sync wiring dynamically against a real vm context instead of regexing source text.
const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = (file) => readFile(shared(file), 'utf8');

// migrateOrAdopt() is fired via the sandbox's synchronous setTimeout stub, but its own body is
// still a real fetch().then() chain (a microtask) - a macrotask tick reliably lets it settle
// before assertions run, the same way a real 'online' event handler's async work would.
function flush() { return new Promise((resolve) => setImmediate(resolve)); }

function memoryStorage(seed) {
  const values = new Map(Object.entries(seed || {}));
  return { getItem: (key) => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key), key: (index) => Array.from(values.keys())[index] || null, get length() { return values.size; } };
}

async function loadTradeStore({ localStorage, fetchImpl, currentUserId, saveImageImpl }) {
  const senders = {};
  const enqueueCalls = [];
  const fetchCalls = [];
  const fetchFn = async (url, options) => { fetchCalls.push([url, options]); return fetchImpl ? fetchImpl(url, options) : { ok: false, status: 500 }; };
  const sandbox = {
    window: {}, localStorage,
    document: { body: { dataset: {} } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options && options.detail; } },
    FileReader: class {}, fetch: fetchFn
  };
  sandbox.window = Object.assign(sandbox.window, {
    localStorage, dispatchEvent() {}, setTimeout: (fn) => fn(), addEventListener() {},
    TradeJournalTradeTypes: { timeframes: ['1m', '5m'] }, TradeJournalPanelLayer: { character: 'hunter' },
    TradeJournalSyncQueue: { registerModule: (name, fn) => { senders[name] = fn; }, enqueue: (...args) => enqueueCalls.push(args) },
    TradeJournalDevUserSwitcher: { currentUserId: () => currentUserId || null },
    TradeJournalImageStore: saveImageImpl ? { saveImage: saveImageImpl } : undefined
  });
  vm.runInNewContext(await source('trade-store.js'), sandbox, { filename: 'trade-store.js' });
  return { store: sandbox.window.TradeJournalTradeStore, senders, enqueueCalls, fetchCalls, localStorage };
}

test('registers a trades sender that POSTs upserts to /api/sync/trades and DELETEs on the delete action', async () => {
  const { senders, fetchCalls } = await loadTradeStore({ localStorage: memoryStorage(), currentUserId: 'user-1', fetchImpl: async () => ({ ok: true }) });
  assert.ok(senders.trades, 'a trades sender must be registered');
  await senders.trades({ action: undefined, recordId: 'trade-1', payload: { id: 'trade-1' } });
  assert.equal(fetchCalls[fetchCalls.length - 1][0], '/api/sync/trades');
  assert.equal(fetchCalls[fetchCalls.length - 1][1].method, 'POST');
  await senders.trades({ action: 'delete', recordId: 'trade-1' });
  const del = fetchCalls[fetchCalls.length - 1];
  assert.equal(del[0], '/api/sync/trades/trade-1');
  assert.equal(del[1].method, 'DELETE');
});

test('save() and remove() each enqueue to the sync queue right after their own write()', async () => {
  const { store, enqueueCalls } = await loadTradeStore({ localStorage: memoryStorage(), currentUserId: null });
  const trade = store.save(store.createDraft({ status: 'hunting' }));
  const saveCall = enqueueCalls.find((call) => call[0] === 'trades' && call[1] === trade.id && call[2] === trade);
  assert.ok(saveCall, 'save() must enqueue the exact saved trade under the trades module');
  store.remove(trade.id);
  const deleteCall = enqueueCalls.find((call) => call[0] === 'trades' && call[1] === trade.id && call[3] === 'delete');
  assert.ok(deleteCall, 'remove() must enqueue a delete action for the removed trade id');
});

test("addScreenshots() passes 'trade' as the image-store category - every trade screenshot is already image-only by validation, unlike Strategy Education's mixed attachments", async () => {
  const saveImageCalls = [];
  const { store } = await loadTradeStore({
    localStorage: memoryStorage(), currentUserId: null,
    saveImageImpl: async (id, file, category) => { saveImageCalls.push([id, file, category]); }
  });
  const trade = store.save(store.createDraft({ status: 'open' }));
  await store.addScreenshots(trade.id, [{ type: 'image/png', size: 10, name: 'a.png' }]);
  assert.equal(saveImageCalls.length, 1);
  assert.equal(saveImageCalls[0][2], 'trade');
});

test("the 'trade-images' sender patches the uploaded url onto the matching screenshot by blobId and re-enqueues the trade", async () => {
  const seededTrade = {
    id: 'trade-x', status: 'open', screenshots: [{ id: 'shot-1', blobId: 'blob-1', fileName: 'a.png', mimeType: 'image/png', uploadedAt: '2026-01-01T00:00:00.000Z' }]
  };
  const localStorage = memoryStorage({ 'tradejournal:trades:v1': JSON.stringify([seededTrade]) });
  const { senders, enqueueCalls } = await loadTradeStore({
    localStorage, currentUserId: 'user-1',
    fetchImpl: async () => ({ ok: true, json: async () => ({ url: '/uploads/trade/img-1.png' }) })
  });
  assert.ok(senders['trade-images'], "a 'trade-images' sender must be registered");
  await senders['trade-images']({ recordId: 'blob-1', payload: { dataUrl: 'data:image/png;base64,x' } });
  const stored = JSON.parse(localStorage.getItem('tradejournal:trades:v1'));
  assert.equal(stored[0].screenshots[0].imageUrl, '/uploads/trade/img-1.png', 'the uploaded url must be patched onto the matching local screenshot');
  const reEnqueued = enqueueCalls.find((call) => call[0] === 'trades' && call[1] === 'trade-x');
  assert.ok(reEnqueued, 'the parent trade must be re-enqueued so the server learns the new imageUrl');
});

test('the one-time activation checks the server before deciding whether to push local trades up (adopts server data if present, else pushes local up)', async () => {
  const localStorage = memoryStorage({ 'tradejournal:trades:v1': JSON.stringify([{ id: 'local-trade', status: 'hunting' }]) });
  const { localStorage: after } = await loadTradeStore({
    localStorage, currentUserId: 'user-1',
    fetchImpl: async () => ({ ok: true, json: async () => ({ trades: [{ id: 'server-trade', status: 'closed' }] }) })
  });
  await flush();
  const stored = JSON.parse(after.getItem('tradejournal:trades:v1'));
  assert.equal(stored.length, 1);
  assert.equal(stored[0].id, 'server-trade', 'server data must be adopted outright when present, not merged with pre-existing local data');
  assert.ok(after.getItem('tradejournal:trades-migrated:v1:user-1'), 'the migration flag must be set after a successful check');
});

test('the one-time activation pushes local trades up when the server has none yet', async () => {
  const localStorage = memoryStorage({ 'tradejournal:trades:v1': JSON.stringify([{ id: 'local-trade', status: 'hunting' }]) });
  const { enqueueCalls } = await loadTradeStore({
    localStorage, currentUserId: 'user-1',
    fetchImpl: async () => ({ ok: true, json: async () => ({ trades: [] }) })
  });
  await flush();
  const pushed = enqueueCalls.find((call) => call[0] === 'trades' && call[1] === 'local-trade');
  assert.ok(pushed, 'a genuinely empty server must receive the pre-existing local trade, not be left as a permanent gap');
});

test('deleting a strategy pushes each newly-orphaned trade onto the shared sync queue, so the server copy stops pointing at the deleted strategy id too', async () => {
  const localStorage = memoryStorage({
    'tradejournal:trades:v1': JSON.stringify([{ id: 'trade-orphan', status: 'open', linkedStrategyId: 'strategy-to-delete' }, { id: 'trade-other', status: 'closed', linkedStrategyId: null }])
  });
  const enqueueCalls = [];
  const sandbox = {
    window: {}, localStorage,
    document: { documentElement: { lang: 'en' } },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options && options.detail; } },
    FileReader: class {}, fetch: async () => { throw new Error('not used'); }, URL
  };
  sandbox.window = Object.assign(sandbox.window, {
    localStorage, dispatchEvent() {}, setTimeout: (fn) => fn(), addEventListener() {},
    TradeJournalStrategyEducationTypes: { numericPaths: [] },
    // No TradeJournalDevUserSwitcher on purpose - this test only cares about orphanLinkedTrades()'s
    // own enqueue call, not the full strategies sync stack, so migrateOrAdopt()/reconcileFromServer()
    // must bail out immediately (no currentUserId()) without making any fetch call.
    TradeJournalSyncQueue: { registerModule() {}, enqueue: (...args) => enqueueCalls.push(args) }
  });
  vm.runInNewContext(await source('strategy-education-store.js'), sandbox, { filename: 'strategy-education-store.js' });
  const store = sandbox.window.TradeJournalStrategyEducationStore;
  const strategy = store.create({ id: 'strategy-to-delete', name: 'Doomed strategy' });
  await store.remove(strategy.id);
  const orphanEnqueue = enqueueCalls.find((call) => call[0] === 'trades' && call[1] === 'trade-orphan');
  assert.ok(orphanEnqueue, 'the orphaned trade must be pushed onto the trades sync queue');
  assert.equal(orphanEnqueue[2].linkedStrategyId, null, 'the enqueued payload must reflect the nulled-out linkedStrategyId');
  const untouchedEnqueue = enqueueCalls.find((call) => call[0] === 'trades' && call[1] === 'trade-other');
  assert.equal(untouchedEnqueue, undefined, 'a trade that was never linked to the deleted strategy must not be re-synced');
});

test('all four character pages load sync-queue.js and dev-user-switcher.js before trade-store.js', async () => {
  for (const character of ['hunter', 'engineer', 'commander', 'sage']) {
    const html = await readFile(path.join(root, 'public', 'pages', character, 'index.html'), 'utf8');
    const queueIndex = html.indexOf('sync-queue.js');
    const switcherIndex = html.indexOf('dev-user-switcher.js');
    const storeIndex = html.indexOf('trade-store.js');
    assert.ok(queueIndex > -1 && queueIndex < storeIndex, character + ': sync-queue.js before trade-store.js');
    assert.ok(switcherIndex > -1 && switcherIndex < storeIndex, character + ': dev-user-switcher.js before trade-store.js');
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
