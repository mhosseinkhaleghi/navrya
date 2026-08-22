import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Phase 2 of the local-first-to-server-authoritative migration (see ARCHITECTURE.md's Global
// Data Sync section / the Phase 2 report) replaced the Mental Health Profile's local-first-cache-
// plus-offline-outbox mechanism with server-replica.js's in-memory document replica, the same way
// tests/patterns-sync.test.mjs/tests/strategies-sync.test.mjs/tests/trades-sync.test.mjs's own
// header comments describe for their domains. There is no more periodic "online event"
// reconciliation at all in this architecture (nothing persists locally to reconcile against) - the
// old "steady-state reconciliation keeps whichever copy has the newer lastUpdatedAt" tests are
// retired along with that mechanism, not ported.
const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = (file) => readFile(shared(file), 'utf8');

function memoryStorage(seed) {
  const values = new Map(Object.entries(seed || {}));
  return { getItem: (key) => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key), key: (index) => Array.from(values.keys())[index] || null, get length() { return values.size; } };
}
function flush() { return new Promise((resolve) => setImmediate(resolve)); }

async function loadMentalHealthStore({ localStorage, fetchImpl, currentUserId }) {
  if (currentUserId) localStorage.setItem('tradejournal:auth-token', currentUserId);
  const fetchCalls = [];
  const fetchFn = async (url, options) => { fetchCalls.push([url, options]); return fetchImpl ? fetchImpl(url, options) : { ok: false, status: 500 }; };
  const sandbox = {
    window: {}, localStorage,
    document: { documentElement: { lang: 'en' }, body: { appendChild() {} }, createElement: () => ({ setAttribute() {} }) },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options && options.detail; } },
    fetch: fetchFn
  };
  sandbox.window = Object.assign(sandbox.window, { localStorage, dispatchEvent() {}, addEventListener() {} });
  vm.runInNewContext(await source('server-replica.js'), sandbox, { filename: 'server-replica.js' });
  vm.runInNewContext(await source('mental-health-store.js'), sandbox, { filename: 'mental-health-store.js' });
  return { store: sandbox.window.TradeJournalMentalHealthStore, replica: sandbox.window.TradeJournalServerReplica, fetchCalls, localStorage };
}

test('registers a mental-health document domain with server-replica.js and hydrates it at load time', async () => {
  const localStorage = memoryStorage();
  const { replica, fetchCalls } = await loadMentalHealthStore({ localStorage, currentUserId: 'user-1', fetchImpl: async () => ({ ok: true, json: async () => ({ profile: null }) }) });
  assert.ok(replica.domain('mental-health'));
  await flush();
  assert.ok(fetchCalls.some((call) => call[0] === '/api/sync/mental-health' && (!call[1] || !call[1].method)));
});

test('a brand-new account with no server profile yet gets real, honest v2 defaults - never an error, never a fabricated intake', async () => {
  const localStorage = memoryStorage();
  const { store } = await loadMentalHealthStore({ localStorage, currentUserId: 'user-1', fetchImpl: async () => ({ ok: true, json: async () => ({ profile: null }) }) });
  await flush();
  const profile = store.load();
  assert.equal(profile.version, 2);
  assert.equal(profile.intake.completed, false);
  assert.equal(profile.userId, 'local-trader', 'the internal userId tag stays untouched by this migration - real ownership comes only from the server session, per ARCHITECTURE.md\'s own documented decision');
});

test('hydrate() populates load() from the server GET response', async () => {
  const localStorage = memoryStorage();
  const serverProfile = { userId: 'local-trader', version: 2, intake: { completed: true, demographics: { age: 30 } } };
  const { store } = await loadMentalHealthStore({ localStorage, currentUserId: 'user-1', fetchImpl: async () => ({ ok: true, json: async () => ({ profile: serverProfile }) }) });
  await flush();
  const profile = store.load();
  assert.equal(profile.intake.completed, true);
  assert.equal(profile.intake.demographics.age, 30);
});

test('save() applies optimistically and returns synchronously, then POSTs the whole document in the background', async () => {
  const localStorage = memoryStorage();
  const { store, fetchCalls } = await loadMentalHealthStore({
    localStorage, currentUserId: 'user-1',
    fetchImpl: async (url, options) => (options && options.method === 'POST') ? { ok: true, json: async () => JSON.parse(options.body) } : { ok: true, json: async () => ({ profile: null }) }
  });
  await flush();
  const profile = store.load();
  profile.intake.completed = true;
  const returned = store.save(profile);
  assert.equal(returned.intake.completed, true, 'save() returns synchronously');
  assert.equal(store.load().intake.completed, true, 'the optimistic write already applied before the network call resolves');
  await flush();
  const post = fetchCalls.find((call) => call[1] && call[1].method === 'POST');
  assert.equal(post[0], '/api/sync/mental-health');
  assert.equal(JSON.parse(post[1].body).intake.completed, true);
});

test('a failed save() rolls back the optimistic write to the last known-good document', async () => {
  const localStorage = memoryStorage();
  const { store } = await loadMentalHealthStore({
    localStorage, currentUserId: 'user-1',
    fetchImpl: async (url, options) => (options && options.method === 'POST') ? { ok: false, status: 500 } : { ok: true, json: async () => ({ profile: null }) }
  });
  await flush();
  const profile = store.load();
  profile.intake.completed = true;
  store.save(profile);
  assert.equal(store.load().intake.completed, true, 'applied optimistically');
  await flush();
  assert.equal(store.load().intake.completed, false, 'rolled back once the server rejected it');
});

test('every mutation (addMessage/addRedFlag/commitDraftTrigger/...) funnels through write(), applying immediately and pushing the whole document', async () => {
  const localStorage = memoryStorage();
  const { store, fetchCalls } = await loadMentalHealthStore({
    localStorage, currentUserId: 'user-1',
    fetchImpl: async (url, options) => (options && options.method === 'POST') ? { ok: true, json: async () => JSON.parse(options.body) } : { ok: true, json: async () => ({ profile: null }) }
  });
  await flush();
  store.addMessage(store.load(), 'user', 'hello');
  store.addRedFlag(store.load(), 'revenge_trading', 'two trades in five minutes');
  await flush();
  const profile = store.load();
  assert.equal(profile.chatHistory.length, 1);
  assert.equal(profile.redFlags.active.length, 1);
  const posts = fetchCalls.filter((call) => call[1] && call[1].method === 'POST');
  assert.ok(posts.length >= 2, 'addMessage() and addRedFlag() must each push the updated document');
});

test('no localStorage key is ever written for the Mental Health Profile any more - Phase 2 removed the write-through cache entirely', async () => {
  const localStorage = memoryStorage();
  const { store } = await loadMentalHealthStore({ localStorage, currentUserId: 'user-1', fetchImpl: async (url, options) => (options && options.method === 'POST') ? { ok: true, json: async () => JSON.parse(options.body) } : { ok: true, json: async () => ({ profile: null }) } });
  await flush();
  store.save(store.load());
  assert.equal(localStorage.getItem('tradejournal:mental-health-profile:v2'), null);
  assert.equal(localStorage.getItem('tradejournal:mental-health-profile:v1'), null);
});

test('cross-account isolation: user A\'s intake/profile content is invisible to user B on the same browser', async () => {
  const localStorage = memoryStorage();
  const a = await loadMentalHealthStore({ localStorage, currentUserId: 'user-A', fetchImpl: async (url, options) => (options && options.method === 'POST') ? { ok: true, json: async () => JSON.parse(options.body) } : { ok: true, json: async () => ({ profile: null }) } });
  await flush();
  const profileA = a.store.load();
  profileA.intake.completed = true;
  profileA.intake.demographics.age = 42;
  a.store.save(profileA);
  assert.equal(a.store.load().intake.demographics.age, 42);

  const b = await loadMentalHealthStore({ localStorage, currentUserId: 'user-B', fetchImpl: async () => ({ ok: true, json: async () => ({ profile: null }) }) });
  await flush();
  const profileB = b.store.load();
  assert.equal(profileB.intake.completed, false, 'a fresh account must never inherit the previous user\'s completed intake');
  assert.equal(profileB.intake.demographics.age, null);
});

test('a v1 profile shape returned by the server (src.baseline without src.intake) still migrates additively via normalize() - unaffected by this migration, since that logic lives inside normalize() itself, not in any localStorage fallback path', async () => {
  const localStorage = memoryStorage();
  const v1Shaped = { userId: 'local-trader', baseline: { tradingExperienceYears: 5, completed: true, assessmentDate: '2024-01-01T00:00:00.000Z' } };
  const { store } = await loadMentalHealthStore({ localStorage, currentUserId: 'user-1', fetchImpl: async () => ({ ok: true, json: async () => ({ profile: v1Shaped }) }) });
  await flush();
  const profile = store.load();
  assert.equal(profile.intake.completed, true);
  assert.equal(profile.intake.tradingHistory.yearsTrading, 5);
  assert.equal(profile.baseline.tradingExperienceYears, 5, 'baseline itself is left untouched');
});

test('server-replica.js loads before mental-health-store.js on all four character pages', async () => {
  for (const character of ['hunter', 'engineer', 'commander', 'sage']) {
    const html = await readFile(path.join(root, 'public', 'pages', character, 'index.html'), 'utf8');
    const replicaIndex = html.indexOf('<script src="../shared/server-replica.js">');
    const storeIndex = html.indexOf('<script src="../shared/mental-health-store.js">');
    assert.ok(replicaIndex > -1 && replicaIndex < storeIndex, character + ': server-replica.js loads before mental-health-store.js');
  }
});
