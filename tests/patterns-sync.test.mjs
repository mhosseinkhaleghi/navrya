import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Phase 2 of the local-first-to-server-authoritative migration (see ARCHITECTURE.md's Global
// Data Sync section / the Phase 2 report) replaced Patterns' entire local-first-cache-plus-
// offline-outbox mechanism (localStorage + sync-queue.js + a one-time migrateOrAdopt() flag) with
// server-replica.js's in-memory replica: hydrate on boot, optimistic write with rollback on
// failure, no localStorage anywhere. This file replaces the old static-source-assertion tests
// (which asserted the retired sync-queue wiring) with real dynamic coverage - unlike
// session-workspace-logic.js, pattern-registry-store.js has no DOM/MutationObserver/setInterval
// dependency and is fully vm-sandbox-testable (already proven in tests/user-scope-guard.test.mjs).
const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = (file) => readFile(shared(file), 'utf8');

function memoryStorage(seed) {
  const values = new Map(Object.entries(seed || {}));
  return { getItem: (key) => (values.has(key) ? values.get(key) : null), setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key), key: (index) => Array.from(values.keys())[index] || null, get length() { return values.size; } };
}

// Minimal fake matching what fileDataUrl()/addScreenshots() actually calls: readAsDataURL() then
// an onload firing synchronously with a fixed result - a real FileReader is unavailable in Node.
class FakeFileReader {
  readAsDataURL() { this.result = 'data:image/png;base64,AA=='; if (this.onload) this.onload(); }
}

async function loadPatterns({ localStorage, fetchImpl, currentUserId }) {
  // Cookie-based sessions (ADR-0001): server-replica.js's hasCurrentUser() gate now reads
  // window.__NAVRYA_AUTH__ instead of a localStorage credential.
  const authState = currentUserId
    ? { authenticated: true, userId: currentUserId, user: { id: currentUserId }, csrfToken: 'test-csrf' }
    : { authenticated: false, userId: null, user: null, csrfToken: null };
  const fetchCalls = [];
  const fetchFn = async (url, options) => { fetchCalls.push([url, options]); return fetchImpl ? fetchImpl(url, options) : { ok: false, status: 500 }; };
  const sandbox = {
    window: { __NAVRYA_AUTH__: authState }, localStorage, fetch: fetchFn, FileReader: FakeFileReader,
    document: { body: { appendChild() {} }, documentElement: { lang: 'en' }, createElement: () => ({ setAttribute() {} }) },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options && options.detail; } },
    setTimeout: (fn) => fn()
  };
  sandbox.window = Object.assign(sandbox.window, { localStorage, dispatchEvent() {}, addEventListener() {}, TradeJournalDevUserSwitcher: { currentUserId: () => currentUserId || null } });
  vm.runInNewContext(await source('server-replica.js'), sandbox, { filename: 'server-replica.js' });
  vm.runInNewContext(await source('instrument-catalog.types.js'), sandbox, { filename: 'instrument-catalog.types.js' });
  vm.runInNewContext(await source('pattern-registry-store.js'), sandbox, { filename: 'pattern-registry-store.js' });
  return { store: sandbox.window.TradeJournalPatternStore, replica: sandbox.window.TradeJournalServerReplica, fetchCalls, localStorage };
}

function flush() { return new Promise((resolve) => setImmediate(resolve)); }

test('registers a patterns list domain with server-replica.js and hydrates it at load time (fire-and-forget, not awaited)', async () => {
  const localStorage = memoryStorage();
  const { replica, fetchCalls } = await loadPatterns({ localStorage, currentUserId: 'user-1', fetchImpl: async () => ({ ok: true, json: async () => ({ patterns: [] }) }) });
  assert.ok(replica.domain('patterns'), 'the patterns domain must be registered');
  await flush();
  const hydrateCall = fetchCalls.find((call) => call[0] === '/api/sync/patterns' && (!call[1] || call[1].method === undefined));
  assert.ok(hydrateCall, 'a GET /api/sync/patterns must have been made to hydrate');
});

test('hydrate() populates listSync() from the server GET response, normalized', async () => {
  const localStorage = memoryStorage();
  const serverPattern = { id: 'pattern-1', name: 'Real pattern', stages: [] };
  const { store } = await loadPatterns({ localStorage, currentUserId: 'user-1', fetchImpl: async () => ({ ok: true, json: async () => ({ patterns: [serverPattern] }) }) });
  await flush();
  const list = store.listSync();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'pattern-1');
  assert.equal(list[0].name, 'Real pattern');
});

test('a brand-new account with nothing on the server starts genuinely empty - no seeding', async () => {
  const localStorage = memoryStorage();
  const { store } = await loadPatterns({ localStorage, currentUserId: 'user-1', fetchImpl: async () => ({ ok: true, json: async () => ({ patterns: [] }) }) });
  await flush();
  assert.deepEqual(store.listSync(), []);
});

test('save() applies optimistically and returns synchronously, then POSTs the same record to /api/sync/patterns in the background', async () => {
  const localStorage = memoryStorage();
  let resolvePost;
  const postPromise = new Promise((resolve) => { resolvePost = resolve; });
  const { store, fetchCalls } = await loadPatterns({
    localStorage, currentUserId: 'user-1',
    fetchImpl: async (url, options) => {
      if (options && options.method === 'POST') { resolvePost(); return { ok: true, json: async () => JSON.parse(options.body) }; }
      return { ok: true, json: async () => ({ patterns: [] }) };
    }
  });
  await flush();
  // A plain object, not store.create()'s own return value - create() itself also calls
  // replica().upsert() (and therefore POSTs), so reusing its result here would make the
  // assertions below ambiguous about which of the two POSTs they're actually checking.
  const draft = { id: 'pattern-1', name: '', description: '', completionThreshold: 70, stages: [], referenceScreenshots: [], usageCount: 0, chatHistory: [], isPublic: false, active: true, createdAt: 'x', updatedAt: 'x' };
  const returned = store.save(Object.assign(draft, { name: 'My pattern' }));
  assert.equal(returned.name, 'My pattern', 'save() returns synchronously, not a Promise');
  assert.equal(store.listSync().length, 1, 'the optimistic write already applied before the network call resolves');
  await postPromise;
  const post = fetchCalls.find((call) => call[1] && call[1].method === 'POST');
  assert.ok(post, 'a POST to /api/sync/patterns must have been sent');
  assert.equal(post[0], '/api/sync/patterns');
  assert.equal(JSON.parse(post[1].body).name, 'My pattern');
});

test('a failed save() rolls the in-memory list back to what it was before the optimistic write', async () => {
  const localStorage = memoryStorage();
  const { store } = await loadPatterns({
    localStorage, currentUserId: 'user-1',
    fetchImpl: async (url, options) => (options && options.method === 'POST') ? { ok: false, status: 500 } : { ok: true, json: async () => ({ patterns: [] }) }
  });
  await flush();
  store.save(store.create(['XAUUSD']));
  assert.equal(store.listSync().length, 1);
  await flush();
  assert.equal(store.listSync().length, 0, 'a failed write must roll back, not leave a record the server never actually saved');
});

test('remove() DELETEs the real record and the in-memory list no longer contains it once the request settles', async () => {
  const localStorage = memoryStorage();
  const { store } = await loadPatterns({
    localStorage, currentUserId: 'user-1',
    fetchImpl: async (url, options) => {
      if (options && options.method === 'DELETE') return { ok: true, status: 204 }; // matches the real server's res.status(204).end() - no JSON body
      return { ok: true, json: async () => ({ patterns: [{ id: 'pattern-1', name: 'X', stages: [] }] }) };
    }
  });
  await flush();
  assert.equal(store.listSync().length, 1);
  await store.remove('pattern-1');
  assert.equal(store.listSync().length, 0);
});

test("addScreenshots() uploads via POST /api/sync/patterns/images and stores the server's own url", async () => {
  const localStorage = memoryStorage();
  const { store } = await loadPatterns({
    localStorage, currentUserId: 'user-1',
    fetchImpl: async (url, options) => {
      if (url === '/api/sync/patterns/images') return { ok: true, json: async () => ({ url: '/uploads/pattern/real-file.png' }) };
      if (options && options.method === 'POST') return { ok: true, json: async () => JSON.parse(options.body) };
      return { ok: true, json: async () => ({ patterns: [] }) };
    }
  });
  await flush();
  const pattern = store.save(store.create(['XAUUSD']));
  const file = { name: 'chart.png', type: 'image/png', size: 1000 };
  const added = await store.addScreenshots(pattern.id, [file]);
  assert.equal(added[0].imageUrl, '/uploads/pattern/real-file.png');
  assert.equal(added[0].dataUrl, undefined, 'a successful upload must not also embed the raw dataUrl');
});

test("addScreenshots() falls back to embedding the raw dataUrl when the upload fails - never silently drops the image, and it still reaches the server via the pattern's own save()", async () => {
  const localStorage = memoryStorage();
  const { store } = await loadPatterns({
    localStorage, currentUserId: 'user-1',
    fetchImpl: async (url, options) => {
      if (url === '/api/sync/patterns/images') return { ok: false, status: 500 };
      if (options && options.method === 'POST') return { ok: true, json: async () => JSON.parse(options.body) };
      return { ok: true, json: async () => ({ patterns: [] }) };
    }
  });
  await flush();
  const pattern = store.save(store.create(['XAUUSD']));
  const file = { name: 'chart.png', type: 'image/png', size: 1000 };
  const added = await store.addScreenshots(pattern.id, [file]);
  assert.equal(added[0].imageUrl, undefined);
  assert.equal(added[0].dataUrl, 'data:image/png;base64,AA==');
});

test('screenshotUrl() prefers a real server imageUrl over a locally-embedded dataUrl', async () => {
  const localStorage = memoryStorage();
  const { store } = await loadPatterns({ localStorage, currentUserId: 'user-1', fetchImpl: async () => ({ ok: true, json: async () => ({ patterns: [] }) }) });
  await flush();
  assert.equal(await store.screenshotUrl({ imageUrl: '/uploads/x.png', dataUrl: 'data:...' }), '/uploads/x.png');
  assert.equal(await store.screenshotUrl({ dataUrl: 'data:...' }), 'data:...');
});

test('cross-account isolation: user A\'s pattern is invisible to user B on the same browser - a fresh replica per page load, never a shared cache', async () => {
  const localStorage = memoryStorage();
  const userAFetch = async (url, options) => {
    if (options && options.method === 'POST') return { ok: true, json: async () => JSON.parse(options.body) };
    return { ok: true, json: async () => ({ patterns: [] }) }; // user A's own account has nothing on the server yet either
  };
  const a = await loadPatterns({ localStorage, currentUserId: 'user-A', fetchImpl: userAFetch });
  await flush();
  a.store.save(a.store.create(['XAUUSD']));
  assert.equal(a.store.listSync().length, 1, 'user A\'s own write applied to their own in-memory replica');

  // A real account switch is a full page/iframe reload (a fresh vm context here, matching a fresh
  // script execution) with a different auth token - user B's own server naturally has none of
  // user A's patterns, since Patterns is server-authoritative per-account (routes.patterns.mjs
  // scopes every query by req.currentUser.id).
  const b = await loadPatterns({ localStorage, currentUserId: 'user-B', fetchImpl: async () => ({ ok: true, json: async () => ({ patterns: [] }) }) });
  await flush();
  assert.equal(b.store.listSync().length, 0, 'user B must never see user A\'s pattern - there is no shared cache left for it to leak through');
});

test('no localStorage key is ever written for patterns any more - Phase 2 removed the write-through cache entirely', async () => {
  const localStorage = memoryStorage();
  const { store } = await loadPatterns({ localStorage, currentUserId: 'user-1', fetchImpl: async () => ({ ok: true, json: async () => ({ patterns: [] }) }) });
  await flush();
  store.save(store.create(['XAUUSD']));
  assert.equal(localStorage.getItem('tradejournal:patterns:v1'), null, 'Phase 1\'s guard key may still exist defensively for pre-Phase-2 browsers, but nothing writes it any more');
});

// ---- Instrument Catalog domain: mandatory instrument + listForInstrument() scoping ----

test('create() persists nothing and returns null when no instrument is supplied - a brand-new pattern can no longer be created blank-then-filled-in for this field', async () => {
  const localStorage = memoryStorage();
  const { store } = await loadPatterns({ localStorage, currentUserId: 'user-1', fetchImpl: async () => ({ ok: true, json: async () => ({ patterns: [] }) }) });
  await flush();
  assert.equal(store.create(), null);
  assert.equal(store.create([]), null);
  assert.equal(store.listSync().length, 0);
});

test('listForInstrument(): a BTC-only pattern is excluded when querying XAU, and vice versa', async () => {
  const localStorage = memoryStorage();
  const { store } = await loadPatterns({ localStorage, currentUserId: 'user-1', fetchImpl: async () => ({ ok: true, json: async () => ({ patterns: [] }) }) });
  await flush();
  const xauPattern = store.save(Object.assign(store.create(['XAUUSD']), { name: 'Gold Sweep' }));
  const btcPattern = store.save(Object.assign(store.create(['BTCUSDT']), { name: 'BTC Sweep' }));
  const forXau = store.listForInstrument('XAUUSD').map((p) => p.id);
  const forBtc = store.listForInstrument('BTCUSDT').map((p) => p.id);
  assert.ok(forXau.includes(xauPattern.id) && !forXau.includes(btcPattern.id), 'XAU query includes the XAU pattern, excludes the BTC-only one');
  assert.ok(forBtc.includes(btcPattern.id) && !forBtc.includes(xauPattern.id), 'BTC query includes the BTC pattern, excludes the XAU-only one');
});

test('listForInstrument(): a multi-instrument pattern is included for every one of its instruments', async () => {
  const localStorage = memoryStorage();
  const { store } = await loadPatterns({ localStorage, currentUserId: 'user-1', fetchImpl: async () => ({ ok: true, json: async () => ({ patterns: [] }) }) });
  await flush();
  const pattern = store.save(Object.assign(store.create(['XAUUSD', 'BTCUSDT']), { name: 'Universal Sweep' }));
  assert.ok(store.listForInstrument('XAUUSD').some((p) => p.id === pattern.id));
  assert.ok(store.listForInstrument('BTCUSDT').some((p) => p.id === pattern.id));
  assert.equal(store.listForInstrument('EURUSD').some((p) => p.id === pattern.id), false, 'a third, unrelated instrument still excludes it');
});

test('listForInstrument(): an unassigned/legacy pattern (empty instruments array) is never selectable for any instrument', async () => {
  const localStorage = memoryStorage();
  const serverPattern = { id: 'legacy-pattern', name: 'Pre-migration pattern', stages: [] }; // no instruments field at all, as a real legacy record would have
  const { store } = await loadPatterns({ localStorage, currentUserId: 'user-1', fetchImpl: async () => ({ ok: true, json: async () => ({ patterns: [serverPattern] }) }) });
  await flush();
  assert.equal(store.find('legacy-pattern').instruments.length, 0, 'normalize() never invents a default instrument for a legacy record');
  assert.equal(store.listForInstrument('XAUUSD').some((p) => p.id === 'legacy-pattern'), false);
});

test('listForInstrument() returns nothing for an empty/invalid instrument argument, never the whole registry', async () => {
  const localStorage = memoryStorage();
  const { store } = await loadPatterns({ localStorage, currentUserId: 'user-1', fetchImpl: async () => ({ ok: true, json: async () => ({ patterns: [] }) }) });
  await flush();
  store.save(Object.assign(store.create(['XAUUSD']), { name: 'Gold Sweep' }));
  assert.equal(store.listForInstrument('').length, 0);
  assert.equal(store.listForInstrument(null).length, 0);
});

test('server-replica.js loads before pattern-registry-store.js on all four character pages', async () => {
  for (const character of ['hunter', 'engineer', 'commander', 'sage']) {
    const html = await readFile(path.join(root, 'public', 'pages', character, 'index.html'), 'utf8');
    const replicaIndex = html.indexOf('<script src="../shared/server-replica.js">');
    const storeIndex = html.indexOf('<script src="../shared/pattern-registry-store.js">');
    assert.ok(replicaIndex > -1, character + ': server-replica.js present');
    assert.ok(replicaIndex < storeIndex, character + ': server-replica.js loads before pattern-registry-store.js');
  }
});

// TradeJournalImageStore.saveImage()'s category-derived sync-queue module name is unrelated to
// Patterns any more (that module still serves Sessions/Strategies/Trades, none of which are
// migrated in this pass) - kept here as a pointer, not a duplicate assertion.
test("session-entry-flow.js's generalized image store (still used by Sessions/Strategies/Trades) is unaffected by Patterns' own Phase 2 migration", async () => {
  const text = await source('session-entry-flow.js');
  assert.match(text, /TradeJournalSyncQueue\.enqueue\(category\+'-images',id,\{dataUrl:dataUrl,category:category\}\)/);
});
