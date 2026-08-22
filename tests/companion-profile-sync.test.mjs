import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Journey G (AI Companion & Journey Orchestration). Phase 2 of the local-first-to-server-
// authoritative migration (see ARCHITECTURE.md's Global Data Sync section / the Phase 2 report)
// moved ai-companion-profile.js off localStorage onto server-replica.js's in-memory document
// replica, the same way tests/mental-health-sync.test.mjs's own header comment describes for
// Mental Health. There is no more sync-queue, no periodic reconciliation, and no
// user-scope-guard.js purge concept for this domain any more - a fresh in-memory replica per page
// load/module instance is never shared between accounts by construction.
const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = (file) => readFile(shared(file), 'utf8');

function memoryStorage(seed) {
  const values = new Map(Object.entries(seed || {}));
  return { getItem: (key) => (values.has(key) ? values.get(key) : null), setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key), key: (index) => Array.from(values.keys())[index] || null, get length() { return values.size; } };
}
function flush() { return new Promise((resolve) => setImmediate(resolve)); }

async function loadCompanionProfile({ localStorage, fetchImpl, currentUserId }) {
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
  vm.runInNewContext(await source('ai-companion-profile.js'), sandbox, { filename: 'ai-companion-profile.js' });
  return { store: sandbox.window.TradeJournalAICompanionProfile, replica: sandbox.window.TradeJournalServerReplica, fetchCalls, localStorage };
}

test('registers a companion-state document domain with server-replica.js and hydrates it at load time', async () => {
  const localStorage = memoryStorage();
  const { replica, fetchCalls } = await loadCompanionProfile({ localStorage, currentUserId: 'user-1', fetchImpl: async () => ({ ok: true, json: async () => ({ state: null }) }) });
  assert.ok(replica.domain('companion-state'));
  await flush();
  assert.ok(fetchCalls.some((call) => call[0] === '/api/sync/companion-state' && (!call[1] || !call[1].method)));
});

test('a brand-new account with nothing on the server gets real defaults', async () => {
  const localStorage = memoryStorage();
  const { store } = await loadCompanionProfile({ localStorage, currentUserId: 'user-1', fetchImpl: async () => ({ ok: true, json: async () => ({ state: null }) }) });
  await flush();
  assert.equal(store.hasSeenWalkthrough(), false);
  assert.equal(store.currentGoal(), null);
  assert.equal(store.initiativePreference(), 'normal');
});

test('every mutation (setWalkthroughSeen/dismissStep/snoozeStep/skipOptionalStep/setPreference/setCurrentGoal) applies immediately and pushes the whole document, correctly unwrapping routes.companion.mjs\'s own {state: saved} POST response shape', async () => {
  const localStorage = memoryStorage();
  const posted = [];
  const { store } = await loadCompanionProfile({
    localStorage, currentUserId: 'user-1',
    fetchImpl: async (url, options) => {
      if (options && options.method === 'POST') { const body = JSON.parse(options.body); posted.push(body); return { ok: true, json: async () => ({ state: body }) }; }
      return { ok: true, json: async () => ({ state: null }) };
    }
  });
  await flush();
  store.setWalkthroughSeen();
  store.dismissStep('journey:pattern_create');
  store.snoozeStep('trade_plan', new Date().toISOString());
  store.skipOptionalStep('intake');
  store.setPreference('initiativePreference', 'high');
  store.setCurrentGoal('strategies');
  await flush();
  assert.equal(posted.length, 6, 'each of the six mutations must push once');
  const state = store.load();
  assert.ok(state.walkthroughSeenAt);
  assert.ok(state.dismissedSteps['journey:pattern_create']);
  assert.ok(state.snoozedSteps.trade_plan);
  assert.ok(state.skippedOptional.includes('intake'));
  assert.equal(state.preferences.initiativePreference, 'high');
  assert.equal(state.currentGoal, 'strategies');
});

test('never persists a derivable fact - only walkthrough/dismiss/snooze/skip/goal/preferences are ever written', async () => {
  const localStorage = memoryStorage();
  const { store } = await loadCompanionProfile({ localStorage, currentUserId: 'user-1', fetchImpl: async (url, options) => (options && options.method === 'POST') ? { ok: true, json: async () => ({ state: JSON.parse(options.body) }) } : { ok: true, json: async () => ({ state: null }) } });
  await flush();
  store.setWalkthroughSeen();
  const stored = store.load();
  assert.deepEqual(Object.keys(stored).sort(), ['currentGoal', 'dismissedSteps', 'lastUpdatedAt', 'preferences', 'skippedOptional', 'snoozedSteps', 'version', 'walkthroughSeenAt'].sort());
});

test('initiativePreference defaults to normal and is validated against the known three values', async () => {
  const localStorage = memoryStorage();
  const { store } = await loadCompanionProfile({ localStorage, currentUserId: 'user-1', fetchImpl: async () => ({ ok: true, json: async () => ({ state: { preferences: { initiativePreference: 'invalid-value' } } }) }) });
  await flush();
  assert.equal(store.initiativePreference(), 'normal');
});

test('a failed write rolls back the optimistic change', async () => {
  const localStorage = memoryStorage();
  const { store } = await loadCompanionProfile({
    localStorage, currentUserId: 'user-1',
    fetchImpl: async (url, options) => (options && options.method === 'POST') ? { ok: false, status: 500 } : { ok: true, json: async () => ({ state: null }) }
  });
  await flush();
  store.setCurrentGoal('strategies');
  assert.equal(store.currentGoal(), 'strategies', 'applied optimistically');
  await flush();
  assert.equal(store.currentGoal(), null, 'rolled back once the server rejected it');
});

test('no localStorage key is ever written for Companion state any more - Phase 2 removed the write-through cache entirely', async () => {
  const localStorage = memoryStorage();
  const { store } = await loadCompanionProfile({ localStorage, currentUserId: 'user-1', fetchImpl: async (url, options) => (options && options.method === 'POST') ? { ok: true, json: async () => ({ state: JSON.parse(options.body) }) } : { ok: true, json: async () => ({ state: null }) } });
  await flush();
  store.setCurrentGoal('strategies');
  assert.equal(localStorage.getItem('tradejournal:companion-state:v1'), null);
});

test('cross-account isolation: user A\'s Companion goal/dismissals are invisible to user B on the same browser - structural now, no purge mechanism needed for a migrated domain', async () => {
  const localStorage = memoryStorage();
  const a = await loadCompanionProfile({
    localStorage, currentUserId: 'user-A',
    fetchImpl: async (url, options) => (options && options.method === 'POST') ? { ok: true, json: async () => ({ state: JSON.parse(options.body) }) } : { ok: true, json: async () => ({ state: null }) }
  });
  await flush();
  a.store.setCurrentGoal('strategies');
  a.store.dismissStep('journey:pattern_create');
  a.store.setPreference('initiativePreference', 'high');
  assert.equal(a.store.currentGoal(), 'strategies');

  const b = await loadCompanionProfile({ localStorage, currentUserId: 'user-B', fetchImpl: async () => ({ ok: true, json: async () => ({ state: null }) }) });
  await flush();
  assert.equal(b.store.currentGoal(), null, 'user B must never see user A\'s goal');
  assert.equal(b.store.isDismissed('journey:pattern_create'), false, 'user B must never see user A\'s dismissals');
  assert.equal(b.store.initiativePreference(), 'normal', 'user B must see the real default, not user A\'s preference');
});

test('the local-first Companion Profile API is entirely synchronous - no read/write returns a Promise', async () => {
  const localStorage = memoryStorage();
  const { store } = await loadCompanionProfile({ localStorage, currentUserId: 'user-1', fetchImpl: async (url, options) => (options && options.method === 'POST') ? { ok: true, json: async () => ({ state: JSON.parse(options.body) }) } : { ok: true, json: async () => ({ state: null }) } });
  await flush();
  const calls = [
    () => store.load(), () => store.get(), () => store.preferences(), () => store.initiativePreference(),
    () => store.hasSeenWalkthrough(), () => store.currentGoal(), () => store.isDismissed('x'), () => store.isSnoozed('x'), () => store.isSkipped('x'),
    () => store.setWalkthroughSeen(), () => store.setCurrentGoal('trades'), () => store.dismissStep('journey:x'),
    () => store.snoozeStep('x', '2099-01-01T00:00:00.000Z'), () => store.skipOptionalStep('x'), () => store.setPreference('initiativePreference', 'low')
  ];
  calls.forEach((fn) => { const result = fn(); assert.ok(!(result instanceof Promise), fn.toString() + ' must not return a Promise'); });
});

test('server-replica.js loads before ai-companion-profile.js on all four character pages', async () => {
  for (const character of ['hunter', 'engineer', 'commander', 'sage']) {
    const html = await readFile(path.join(root, 'public', 'pages', character, 'index.html'), 'utf8');
    const replicaIndex = html.indexOf('<script src="../shared/server-replica.js">');
    const storeIndex = html.indexOf('<script src="../shared/ai-companion-profile.js">');
    assert.ok(replicaIndex > -1 && replicaIndex < storeIndex, character + ': server-replica.js loads before ai-companion-profile.js');
  }
});
