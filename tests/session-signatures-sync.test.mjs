import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Phase 8a of the local-first-to-server-authoritative migration (see ARCHITECTURE.md's Known
// Constraints section): session-signature-store.js moved off localStorage onto
// server-replica.js's in-memory list replica, the same dynamic-vm-sandbox convention every other
// migrated domain's own *-sync.test.mjs already uses. The legacy-per-character-key backfill scan
// (backfillFromLegacy) still reads raw localStorage directly, on purpose - see the store's own
// header comment - so this file's sandbox still seeds a fake localStorage for that one path.
const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = (file) => readFile(shared(file), 'utf8');

function memoryStorage(seed) {
  const values = new Map(Object.entries(seed || {}));
  return { getItem: (key) => (values.has(key) ? values.get(key) : null), setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key), key: (index) => Array.from(values.keys())[index] || null, get length() { return values.size; } };
}
function flush() { return new Promise((resolve) => setImmediate(resolve)); }

async function loadSignatures({ localStorage, fetchImpl, currentUserId, tradeStore, workspace }) {
  // Cookie-based sessions (ADR-0001): server-replica.js's hasCurrentUser() gate now reads
  // window.__NAVRYA_AUTH__ instead of a localStorage credential.
  const authState = currentUserId
    ? { authenticated: true, userId: currentUserId, user: { id: currentUserId }, csrfToken: 'test-csrf' }
    : { authenticated: false, userId: null, user: null, csrfToken: null };
  const fetchCalls = [];
  const fetchFn = async (url, options) => { fetchCalls.push([url, options]); return fetchImpl ? fetchImpl(url, options) : { ok: false, status: 500 }; };
  const sandbox = {
    window: { __NAVRYA_AUTH__: authState }, localStorage, fetch: fetchFn, Set,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options && options.detail; } },
    setTimeout: (fn) => fn()
  };
  sandbox.window = Object.assign(sandbox.window, {
    localStorage, dispatchEvent() {},
    TradeJournalTradeStore: tradeStore || { listSync: () => [] },
    TradeJournalWorkspace: workspace
  });
  vm.runInNewContext(await source('server-replica.js'), sandbox, { filename: 'server-replica.js' });
  vm.runInNewContext(await source('session-signature-store.js'), sandbox, { filename: 'session-signature-store.js' });
  await flush(); // let hydrate() + the module's own auto-run backfill() settle
  return { store: sandbox.window.TradeJournalSessionSignatureStore, replica: sandbox.window.TradeJournalServerReplica, fetchCalls, localStorage };
}

test('registers a session-signatures list domain with server-replica.js and hydrates it at load time', async () => {
  const localStorage = memoryStorage();
  const { replica, fetchCalls } = await loadSignatures({ localStorage, currentUserId: 'user-1', fetchImpl: async () => ({ ok: true, json: async () => ({ signatures: [] }) }) });
  assert.ok(replica.domain('session-signatures'));
  const hydrateCall = fetchCalls.find((call) => call[0] === '/api/sync/session-signatures' && (!call[1] || call[1].method === undefined));
  assert.ok(hydrateCall, 'a GET /api/sync/session-signatures must have been made to hydrate');
});

test('a brand-new account with nothing on the server starts genuinely empty', async () => {
  const localStorage = memoryStorage();
  const { store } = await loadSignatures({ localStorage, currentUserId: 'user-1', fetchImpl: async () => ({ ok: true, json: async () => ({ signatures: [] }) }) });
  assert.deepEqual(store.listSync(), []);
});

test('hydrate() populates listSync() from the server GET response', async () => {
  const localStorage = memoryStorage();
  const serverSignature = { id: 'sig-1', sessionId: 'session-1', character: 'hunter', market: 'London', timeframe: '5m', date: '2026-01-01', movementSequence: [], patternIds: [], strategyIds: [], scenarioOutcomes: [], tradeSummary: {}, fateSummaryText: 'won' };
  const { store } = await loadSignatures({ localStorage, currentUserId: 'user-1', fetchImpl: async () => ({ ok: true, json: async () => ({ signatures: [serverSignature] }) }) });
  const list = store.listSync();
  assert.equal(list.length, 1);
  assert.equal(list[0].sessionId, 'session-1');
});

test('captureClosedSession() only ever fires for a session that is actually closed with a real fateSummary', async () => {
  const localStorage = memoryStorage();
  const { store } = await loadSignatures({ localStorage, currentUserId: 'user-1', fetchImpl: async (url, options) => (options && options.method === 'POST') ? { ok: true, json: async () => JSON.parse(options.body) } : { ok: true, json: async () => ({ signatures: [] }) } });
  assert.equal(store.captureClosedSession({ id: 's1', status: 'open', entries: [] }, 'hunter'), null, 'open session - never captured');
  assert.equal(store.captureClosedSession({ id: 's1', status: 'closed', entries: [] }, 'hunter'), null, 'no fateSummary - never captured');
  const captured = store.captureClosedSession({ id: 's1', status: 'closed', fateSummary: { note: 'won' }, entries: [] }, 'hunter');
  assert.ok(captured);
  assert.equal(captured.sessionId, 's1');
  assert.equal(store.listSync().length, 1, 'applied optimistically and synchronously');
});

test('save()/upsert() looks up the existing row by sessionId and reuses its real id, rather than creating a duplicate for the same session', async () => {
  const localStorage = memoryStorage();
  const { store } = await loadSignatures({ localStorage, currentUserId: 'user-1', fetchImpl: async (url, options) => (options && options.method === 'POST') ? { ok: true, json: async () => JSON.parse(options.body) } : { ok: true, json: async () => ({ signatures: [] }) } });
  const first = store.captureClosedSession({ id: 's1', status: 'closed', fateSummary: { note: 'first pass' }, entries: [] }, 'hunter');
  const second = store.captureClosedSession({ id: 's1', status: 'closed', fateSummary: { note: 'second pass' }, entries: [] }, 'hunter');
  assert.equal(second.id, first.id, 'the same sessionId must reuse the same signature id');
  assert.equal(store.listSync().length, 1, 're-capturing the same session must never create a second row');
  assert.equal(store.listSync()[0].fateSummaryText, 'second pass');
});

test('a failed save() rolls back the optimistic write', async () => {
  const localStorage = memoryStorage();
  const { store } = await loadSignatures({ localStorage, currentUserId: 'user-1', fetchImpl: async (url, options) => (options && options.method === 'POST') ? { ok: false, status: 500 } : { ok: true, json: async () => ({ signatures: [] }) } });
  store.captureClosedSession({ id: 's1', status: 'closed', fateSummary: { note: 'x' }, entries: [] }, 'hunter');
  assert.equal(store.listSync().length, 1);
  await flush();
  assert.equal(store.listSync().length, 0, 'a failed write must roll back, not leave a signature the server never actually saved');
});

test('backfill() finds a closed session with a real fateSummary sitting only in a legacy per-character key, skips an unfinished one, and is idempotent on a second run', async () => {
  const localStorage = memoryStorage();
  localStorage.setItem('tradejournal:sessions:v1:hunter', JSON.stringify([
    { id: 'closed-1', status: 'closed', market: 'London', timeframe: '5m', fateSummary: { note: 'Continuation won' }, entries: [] },
    { id: 'open-1', status: 'open', market: 'London', timeframe: '5m', entries: [] },
    { id: 'closed-no-fate', status: 'closed', market: 'London', timeframe: '5m', entries: [] }
  ]));
  const { store } = await loadSignatures({ localStorage, currentUserId: 'user-1', fetchImpl: async (url, options) => (options && options.method === 'POST') ? { ok: true, json: async () => JSON.parse(options.body) } : { ok: true, json: async () => ({ signatures: [] }) } });
  assert.equal(store.listSync().length, 1, 'the module\'s own auto-run backfill() at load time already found the one real closed session');
  assert.equal(store.listSync()[0].sessionId, 'closed-1');
  assert.equal(await store.backfill(), 0, 'idempotent - already known, not re-added');
  assert.equal(store.listSync().length, 1);
});

test('backfill() also scans the live sessions bucket through window.TradeJournalWorkspace.list(), once the replica is ready', async () => {
  const localStorage = memoryStorage();
  const liveSessions = [
    { id: 'live-closed-1', character: 'hunter', status: 'closed', market: 'Tokyo', timeframe: '15m', fateSummary: { note: 'live capture' }, entries: [] },
    { id: 'live-open-1', character: 'hunter', status: 'open', entries: [] }
  ];
  const { store } = await loadSignatures({
    localStorage, currentUserId: 'user-1', workspace: { list: () => liveSessions },
    fetchImpl: async (url, options) => (options && options.method === 'POST') ? { ok: true, json: async () => JSON.parse(options.body) } : { ok: true, json: async () => ({ signatures: [] }) }
  });
  const found = store.listSync().find((row) => row.sessionId === 'live-closed-1');
  assert.ok(found, 'the live-open session must be skipped, the live-closed one with a real fateSummary must be found');
  assert.equal(store.listSync().some((row) => row.sessionId === 'live-open-1'), false);
});

test('cross-account isolation: user A\'s signature is invisible to user B on the same browser - a fresh replica per page load, never a shared cache', async () => {
  const localStorage = memoryStorage();
  const a = await loadSignatures({ localStorage, currentUserId: 'user-A', fetchImpl: async (url, options) => (options && options.method === 'POST') ? { ok: true, json: async () => JSON.parse(options.body) } : { ok: true, json: async () => ({ signatures: [] }) } });
  a.store.captureClosedSession({ id: 's1', status: 'closed', fateSummary: { note: 'x' }, entries: [] }, 'hunter');
  assert.equal(a.store.listSync().length, 1);

  const b = await loadSignatures({ localStorage, currentUserId: 'user-B', fetchImpl: async () => ({ ok: true, json: async () => ({ signatures: [] }) }) });
  assert.equal(b.store.listSync().length, 0, "user B must never see user A's signature");
});

test('no localStorage key is ever written for session signatures any more - only the documented legacy per-character read remains', async () => {
  const localStorage = memoryStorage();
  const { store } = await loadSignatures({ localStorage, currentUserId: 'user-1', fetchImpl: async (url, options) => (options && options.method === 'POST') ? { ok: true, json: async () => JSON.parse(options.body) } : { ok: true, json: async () => ({ signatures: [] }) } });
  store.captureClosedSession({ id: 's1', status: 'closed', fateSummary: { note: 'x' }, entries: [] }, 'hunter');
  assert.equal(localStorage.getItem('tradejournal:session-signatures:v1'), null, 'Phase 1\'s guard key may still exist defensively for pre-migration browsers, but nothing writes it any more');
});

test('server-replica.js loads before session-signature-store.js on all four character pages', async () => {
  for (const character of ['hunter', 'engineer', 'commander', 'sage']) {
    const html = await readFile(path.join(root, 'public', 'pages', character, 'index.html'), 'utf8');
    const replicaIndex = html.indexOf('<script src="../shared/server-replica.js">');
    const storeIndex = html.indexOf('<script src="../shared/session-signature-store.js">');
    assert.ok(replicaIndex > -1, character + ': server-replica.js present');
    assert.ok(storeIndex > -1, character + ': session-signature-store.js present');
    assert.ok(replicaIndex < storeIndex, character + ': server-replica.js loads before session-signature-store.js');
  }
});
