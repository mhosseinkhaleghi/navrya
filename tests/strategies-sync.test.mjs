import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Phase 2 of the local-first-to-server-authoritative migration (see ARCHITECTURE.md's Global
// Data Sync section / the Phase 2 report) replaced Strategy Education's entire local-first-cache-
// plus-offline-outbox mechanism with server-replica.js's in-memory replica, the same way
// tests/patterns-sync.test.mjs's own header comment describes for Patterns. This file replaces
// the old static-source-assertion tests (which asserted the retired sync-queue wiring) with real
// dynamic coverage.
const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = (file) => readFile(shared(file), 'utf8');

function memoryStorage(seed) {
  const values = new Map(Object.entries(seed || {}));
  return { getItem: (key) => (values.has(key) ? values.get(key) : null), setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key), key: (index) => Array.from(values.keys())[index] || null, get length() { return values.size; } };
}
function flush() { return new Promise((resolve) => setImmediate(resolve)); }

class FakeFileReader {
  readAsDataURL() { this.result = 'data:image/png;base64,AA=='; if (this.onload) this.onload(); }
}

async function loadStrategies({ localStorage, fetchImpl, currentUserId, imageStoreSaveImage }) {
  if (currentUserId) localStorage.setItem('tradejournal:auth-token', currentUserId);
  const fetchCalls = [];
  const fetchFn = async (url, options) => { fetchCalls.push([url, options]); return fetchImpl ? fetchImpl(url, options) : { ok: false, status: 500 }; };
  const sandbox = {
    window: {}, localStorage, fetch: fetchFn, FileReader: FakeFileReader,
    document: { body: { appendChild() {} }, documentElement: { lang: 'en' }, createElement: () => ({ setAttribute() {} }) },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options && options.detail; } },
    setTimeout: (fn) => fn()
  };
  sandbox.window = Object.assign(sandbox.window, {
    localStorage, dispatchEvent() {}, addEventListener() {},
    TradeJournalStrategyEducationTypes: { numericPaths: [] },
    TradeJournalDevUserSwitcher: { currentUserId: () => currentUserId || null },
    TradeJournalImageStore: imageStoreSaveImage ? { saveImage: imageStoreSaveImage, deleteImage: async () => {}, loadImageUrl: async () => 'blob:local' } : undefined
  });
  vm.runInNewContext(await source('server-replica.js'), sandbox, { filename: 'server-replica.js' });
  vm.runInNewContext(await source('strategy-education-store.js'), sandbox, { filename: 'strategy-education-store.js' });
  return { store: sandbox.window.TradeJournalStrategyEducationStore, replica: sandbox.window.TradeJournalServerReplica, fetchCalls, localStorage };
}

test('registers a strategies list domain with server-replica.js and hydrates it at load time', async () => {
  const localStorage = memoryStorage();
  const { replica, fetchCalls } = await loadStrategies({ localStorage, currentUserId: 'user-1', fetchImpl: async () => ({ ok: true, json: async () => ({ strategies: [] }) }) });
  assert.ok(replica.domain('strategies'));
  await flush();
  assert.ok(fetchCalls.some((call) => call[0] === '/api/sync/strategies' && (!call[1] || !call[1].method)));
});

test('a brand-new account with nothing on the server starts genuinely empty', async () => {
  const localStorage = memoryStorage();
  const { store } = await loadStrategies({ localStorage, currentUserId: 'user-1', fetchImpl: async () => ({ ok: true, json: async () => ({ strategies: [] }) }) });
  await flush();
  assert.equal(store.listSync().length, 0);
});

test('save() applies optimistically and returns synchronously, then POSTs the record in the background', async () => {
  const localStorage = memoryStorage();
  const { store, fetchCalls } = await loadStrategies({
    localStorage, currentUserId: 'user-1',
    fetchImpl: async (url, options) => (options && options.method === 'POST') ? { ok: true, json: async () => JSON.parse(options.body) } : { ok: true, json: async () => ({ strategies: [] }) }
  });
  await flush();
  const draft = { id: 'strategy-1', name: 'My strategy' };
  const returned = store.save(draft);
  assert.equal(returned.name, 'My strategy', 'save() returns synchronously');
  assert.equal(store.listSync().length, 1);
  await flush();
  const post = fetchCalls.find((call) => call[1] && call[1].method === 'POST');
  assert.equal(JSON.parse(post[1].body).name, 'My strategy');
});

test('a failed save() rolls back the optimistic write', async () => {
  const localStorage = memoryStorage();
  const { store } = await loadStrategies({
    localStorage, currentUserId: 'user-1',
    fetchImpl: async (url, options) => (options && options.method === 'POST') ? { ok: false, status: 500 } : { ok: true, json: async () => ({ strategies: [] }) }
  });
  await flush();
  store.save({ id: 'strategy-1', name: 'X' });
  await flush();
  assert.equal(store.listSync().length, 0);
});

test('remove() DELETEs the real record and orphans any linked trades (Trade Store is not migrated in this pass, so this still reads/writes localStorage directly)', async () => {
  const localStorage = memoryStorage({ 'tradejournal:trades:v1': JSON.stringify([{ id: 'trade-1', linkedStrategyId: 'strategy-1' }]) });
  const { store } = await loadStrategies({
    localStorage, currentUserId: 'user-1',
    fetchImpl: async (url, options) => {
      if (options && options.method === 'DELETE') return { ok: true, status: 204 };
      return { ok: true, json: async () => ({ strategies: [{ id: 'strategy-1', name: 'X' }] }) };
    }
  });
  await flush();
  assert.equal(store.listSync().length, 1);
  await store.remove('strategy-1');
  assert.equal(store.listSync().length, 0);
  const trades = JSON.parse(localStorage.getItem('tradejournal:trades:v1'));
  assert.equal(trades[0].linkedStrategyId, null, 'the linked trade must be orphaned even though Trades itself is unaffected by this migration');
});

test("addAttachments(): an image-type file uploads directly to /api/sync/strategies/images and stores fileUrl - no IndexedDB, no blobId", async () => {
  const localStorage = memoryStorage();
  const { store } = await loadStrategies({
    localStorage, currentUserId: 'user-1',
    fetchImpl: async (url, options) => {
      if (url === '/api/sync/strategies/images') return { ok: true, json: async () => ({ url: '/uploads/strategy/real.png' }) };
      if (options && options.method === 'POST') return { ok: true, json: async () => JSON.parse(options.body) };
      return { ok: true, json: async () => ({ strategies: [] }) };
    }
  });
  await flush();
  const strategy = store.save({ id: 'strategy-1', name: 'X' });
  const file = { name: 'chart.png', type: 'image/png', size: 1000 };
  const updated = await store.addAttachments(strategy.id, 'positionManagement', [file]);
  const added = updated.positionManagement.attachments[0];
  assert.equal(added.fileUrl, '/uploads/strategy/real.png');
  assert.equal(added.blobId, undefined);
  assert.equal(added.dataUrl, undefined);
});

test('addAttachments(): a non-image file (pdf) stays local-only via IndexedDB, unaffected by this migration', async () => {
  const localStorage = memoryStorage();
  let savedCategory = 'not-called';
  const { store } = await loadStrategies({
    localStorage, currentUserId: 'user-1',
    imageStoreSaveImage: async (id, file, category) => { savedCategory = category; },
    fetchImpl: async (url, options) => (options && options.method === 'POST') ? { ok: true, json: async () => JSON.parse(options.body) } : { ok: true, json: async () => ({ strategies: [] }) }
  });
  await flush();
  const strategy = store.save({ id: 'strategy-1', name: 'X' });
  const file = { name: 'plan.pdf', type: 'application/pdf', size: 1000 };
  const updated = await store.addAttachments(strategy.id, 'overallFramework', [file]);
  const added = updated.overallFramework.attachments[0];
  assert.ok(added.blobId, 'a non-image attachment still uses the local blob store');
  assert.equal(savedCategory, undefined, 'no category is passed for a non-image save - nothing should be enqueued for server sync');
});

test('attachmentUrl() prefers fileUrl (the real server copy) over dataUrl, fixing a pre-existing gap where a successfully-synced image was never actually displayed from its server URL', async () => {
  const localStorage = memoryStorage();
  const { store } = await loadStrategies({ localStorage, currentUserId: 'user-1', fetchImpl: async () => ({ ok: true, json: async () => ({ strategies: [] }) }) });
  await flush();
  assert.equal(await store.attachmentUrl({ fileUrl: '/uploads/x.png', dataUrl: 'data:...' }), '/uploads/x.png');
  assert.equal(await store.attachmentUrl({ dataUrl: 'data:...' }), 'data:...');
});

test('getRiskDefaults()/getPositionGuide() preserve their exact contract: an explicit id is required, never an implicit global default', async () => {
  const localStorage = memoryStorage();
  const { store } = await loadStrategies({
    localStorage, currentUserId: 'user-1',
    fetchImpl: async () => ({ ok: true, json: async () => ({ strategies: [{ id: 'active-strategy', name: 'Active', active: true, riskManagement: { maxRiskPerTradePercent: 2 } }] }) })
  });
  await flush();
  assert.equal(store.listSync().length, 1);
  assert.equal(store.getRiskDefaults().maxRiskPerTradePercent, null, 'no id given must never silently pick the active strategy');
  assert.equal(store.getRiskDefaults('active-strategy').maxRiskPerTradePercent, 2, 'an explicit id must resolve the real strategy');
  assert.equal(store.getPositionGuide().entryRules, '');
});

test('no localStorage key is ever written for strategies any more - Phase 2 removed the write-through cache entirely', async () => {
  const localStorage = memoryStorage();
  const { store } = await loadStrategies({ localStorage, currentUserId: 'user-1', fetchImpl: async (url, options) => (options && options.method === 'POST') ? { ok: true, json: async () => JSON.parse(options.body) } : { ok: true, json: async () => ({ strategies: [] }) } });
  await flush();
  store.save({ id: 'strategy-1', name: 'X' });
  assert.equal(localStorage.getItem('tradejournal:strategies:v2'), null);
  assert.equal(localStorage.getItem('tradejournal:strategy-education:v1'), null);
});

test('cross-account isolation: user A\'s strategy is invisible to user B on the same browser', async () => {
  const localStorage = memoryStorage();
  const a = await loadStrategies({ localStorage, currentUserId: 'user-A', fetchImpl: async (url, options) => (options && options.method === 'POST') ? { ok: true, json: async () => JSON.parse(options.body) } : { ok: true, json: async () => ({ strategies: [] }) } });
  await flush();
  a.store.save({ id: 'strategy-1', name: 'A\'s private strategy' });
  assert.equal(a.store.listSync().length, 1);

  const b = await loadStrategies({ localStorage, currentUserId: 'user-B', fetchImpl: async () => ({ ok: true, json: async () => ({ strategies: [] }) }) });
  await flush();
  assert.equal(b.store.listSync().length, 0);
});

test('server-replica.js loads before strategy-education-store.js on all four character pages', async () => {
  for (const character of ['hunter', 'engineer', 'commander', 'sage']) {
    const html = await readFile(path.join(root, 'public', 'pages', character, 'index.html'), 'utf8');
    const replicaIndex = html.indexOf('<script src="../shared/server-replica.js">');
    const storeIndex = html.indexOf('<script src="../shared/strategy-education-store.js">');
    assert.ok(replicaIndex > -1 && replicaIndex < storeIndex, character + ': server-replica.js loads before strategy-education-store.js');
  }
});
