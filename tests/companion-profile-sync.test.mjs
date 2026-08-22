import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Journey G (AI Companion & Journey Orchestration) - mirrors tests/mental-health-sync.test.mjs's
// own dynamic vm-sandbox convention for ai-companion-profile.js, the client store this feature's
// one small persisted document funnels through (see that file's own header comment).
const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = (file) => readFile(shared(file), 'utf8');

function memoryStorage(seed) {
  const values = new Map(Object.entries(seed || {}));
  return { getItem: (key) => (values.has(key) ? values.get(key) : null), setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key), key: (index) => Array.from(values.keys())[index] || null, get length() { return values.size; } };
}
function flush() { return new Promise((resolve) => setImmediate(resolve)); }

async function loadCompanionProfile({ localStorage, fetchImpl, currentUserId }) {
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
    localStorage, dispatchEvent: (event) => events.push(event), setTimeout: (fn) => fn(), addEventListener: () => {},
    TradeJournalSyncQueue: { registerModule: (name, fn) => { senders[name] = fn; }, enqueue: (...args) => enqueueCalls.push(args) },
    TradeJournalDevUserSwitcher: { currentUserId: () => currentUserId || null }
  });
  vm.runInNewContext(await source('ai-companion-profile.js'), sandbox, { filename: 'ai-companion-profile.js' });
  return { store: sandbox.window.TradeJournalAICompanionProfile, senders, enqueueCalls, fetchCalls, events, localStorage };
}

test('registers a companion-state sender that POSTs the whole document to /api/sync/companion-state', async () => {
  const { senders, fetchCalls } = await loadCompanionProfile({ localStorage: memoryStorage(), currentUserId: 'user-1', fetchImpl: async () => ({ ok: true }) });
  assert.ok(senders['companion-state'], 'a companion-state sender must be registered');
  await senders['companion-state']({ recordId: 'state', payload: { version: 1 } });
  const call = fetchCalls[fetchCalls.length - 1];
  assert.equal(call[0], '/api/sync/companion-state');
  assert.equal(call[1].method, 'POST');
});

test('every mutation (setWalkthroughSeen/dismissStep/snoozeStep/skipOptionalStep/setPreference/setCurrentGoal) funnels through write() and enqueues once each', async () => {
  const { store, enqueueCalls } = await loadCompanionProfile({ localStorage: memoryStorage(), currentUserId: null });
  store.setWalkthroughSeen();
  store.dismissStep('journey:pattern_create');
  store.snoozeStep('trade_plan', new Date().toISOString());
  store.skipOptionalStep('intake');
  store.setPreference('initiativePreference', 'high');
  store.setCurrentGoal('strategies');
  const calls = enqueueCalls.filter((call) => call[0] === 'companion-state');
  assert.equal(calls.length, 6);
  calls.forEach((call) => assert.equal(call[1], 'state', 'the record id is a fixed constant - there is only ever one companion-state document'));
});

test('never persists a derivable fact - only walkthrough/dismiss/snooze/skip/goal/preferences are ever written', async () => {
  const { store } = await loadCompanionProfile({ localStorage: memoryStorage(), currentUserId: null });
  store.setWalkthroughSeen();
  const stored = store.load();
  // _ownerUserId (Item 4 of the Journey G follow-up) is the one exception - it is not a Journey
  // fact at all, purely a local anti-leak bookkeeping tag (see load()'s own comment) - listed here
  // deliberately rather than silently excluded, so this test stays an exhaustive allowlist.
  assert.deepEqual(Object.keys(stored).sort(), ['_ownerUserId', 'currentGoal', 'dismissedSteps', 'lastUpdatedAt', 'preferences', 'skippedOptional', 'snoozedSteps', 'version', 'walkthroughSeenAt'].sort());
});

test('initiativePreference defaults to normal and is validated against the known three values', async () => {
  const seeded = memoryStorage({ 'tradejournal:companion-state:v1': JSON.stringify({ preferences: { initiativePreference: 'invalid-value' } }) });
  const { store } = await loadCompanionProfile({ localStorage: seeded, currentUserId: null });
  assert.equal(store.initiativePreference(), 'normal');
});

test('the one-time activation adopts the server state outright when present', async () => {
  const localStorage = memoryStorage({ 'tradejournal:companion-state:v1': JSON.stringify({ lastUpdatedAt: '2026-06-01T00:00:00.000Z', currentGoal: 'local-goal' }) });
  const serverState = { lastUpdatedAt: '2020-01-01T00:00:00.000Z', currentGoal: 'server-goal' };
  const { localStorage: after } = await loadCompanionProfile({
    localStorage, currentUserId: 'user-1',
    fetchImpl: async () => ({ ok: true, json: async () => ({ state: serverState }) })
  });
  await flush();
  const stored = JSON.parse(after.getItem('tradejournal:companion-state:v1'));
  assert.equal(stored.currentGoal, 'server-goal', 'first-activation adopts the server copy outright, even though it is chronologically older');
  assert.ok(after.getItem('tradejournal:companion-state-migrated:v1:user-1'));
});

test('the one-time activation pushes nothing when both local and server are a genuinely fresh default - no meaningless first push', async () => {
  const localStorage = memoryStorage();
  const { enqueueCalls } = await loadCompanionProfile({
    localStorage, currentUserId: 'user-1',
    fetchImpl: async () => ({ ok: true, json: async () => ({ state: null }) })
  });
  await flush();
  const pushed = enqueueCalls.find((call) => call[0] === 'companion-state');
  assert.equal(pushed, undefined);
});

test('once already activated, reconciliation keeps whichever copy has the newer lastUpdatedAt, not always the server', async () => {
  const newerLocal = memoryStorage({
    'tradejournal:companion-state:v1': JSON.stringify({ lastUpdatedAt: '2026-06-05T00:00:00.000Z', currentGoal: 'local-newer' }),
    'tradejournal:companion-state-migrated:v1:user-1': '2026-01-01T00:00:00.000Z'
  });
  await loadCompanionProfile({
    localStorage: newerLocal, currentUserId: 'user-1',
    fetchImpl: async () => ({ ok: true, json: async () => ({ state: { lastUpdatedAt: '2026-01-01T00:00:00.000Z', currentGoal: 'server-older' } }) })
  });
  await flush();
  const stillLocal = JSON.parse(newerLocal.getItem('tradejournal:companion-state:v1'));
  assert.equal(stillLocal.currentGoal, 'local-newer', 'a newer local edit must survive a reconcile against an older server copy - the already-migrated flag routes this through reconcile(), not the adopt-outright first-activation path');
});

// ============================================================================
// Item 4 of the Journey G follow-up: the complete local-first/sync contract, proven end to end
// with the REAL sync-queue.js (not the stubbed registerModule/enqueue used above) - the exact
// client flow is: a mutation writes to localStorage synchronously first (never blocked on
// network) -> enqueues onto the shared outbox -> the outbox's own sender POSTs to
// /api/sync/companion-state, retried with backoff on failure -> a later successful send removes
// it from the outbox; reconciliation (first-activation adopt/push, or the `online`-event
// reconcile-by-lastUpdatedAt) is a separate, independent read path layered on top.
// ============================================================================
function combinedSandbox({ localStorage, currentUserId, fetchImpl }) {
  const sandbox = {
    window: {}, localStorage,
    document: { documentElement: { lang: 'en' }, hidden: false, addEventListener() {} },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options && options.detail; } },
    setTimeout: (fn) => { fn(); return 0; }, clearTimeout() {},
    fetch: fetchImpl,
    Math, JSON, console, Date
  };
  sandbox.window = Object.assign(sandbox.window, {
    localStorage, dispatchEvent: () => {}, addEventListener() {}, setTimeout: sandbox.setTimeout, fetch: fetchImpl,
    TradeJournalDevUserSwitcher: { currentUserId: () => currentUserId || null }
  });
  return sandbox;
}
async function loadCombined(options) {
  const sandbox = combinedSandbox(options);
  vm.runInNewContext(await source('sync-queue.js'), sandbox, { filename: 'sync-queue.js' });
  vm.runInNewContext(await source('ai-companion-profile.js'), sandbox, { filename: 'ai-companion-profile.js' });
  return { queue: sandbox.window.TradeJournalSyncQueue, store: sandbox.window.TradeJournalAICompanionProfile, sandbox };
}

test('app remains usable while the Community backend is offline - a mutation succeeds and is cached locally even though every fetch call rejects', async () => {
  const localStorage = memoryStorage();
  const { store } = await loadCombined({
    localStorage, currentUserId: 'user-1',
    fetchImpl: async () => { throw new Error('network unreachable'); }
  });
  const saved = store.setCurrentGoal('strategies');
  assert.equal(saved.currentGoal, 'strategies', 'the local write itself never throws or blocks on the network');
  assert.equal(store.currentGoal(), 'strategies', 'reading it back works purely from the local cache');
});

test('dismiss/snooze/preferences/currentGoal all survive a simulated reload (a fresh module load reading the same localStorage)', async () => {
  const localStorage = memoryStorage();
  const first = await loadCombined({ localStorage, currentUserId: 'user-1', fetchImpl: async () => ({ ok: true, json: async () => ({ state: null }) }) });
  first.store.setCurrentGoal('trades');
  first.store.dismissStep('journey:pattern_create');
  first.store.snoozeStep('trade_plan', '2099-01-01T00:00:00.000Z');
  first.store.setPreference('initiativePreference', 'high');

  // A real page reload re-executes every <script> fresh - simulated here by loading the module a
  // second time against the SAME underlying localStorage.
  const second = await loadCombined({ localStorage, currentUserId: 'user-1', fetchImpl: async () => ({ ok: true, json: async () => ({ state: null }) }) });
  assert.equal(second.store.currentGoal(), 'trades');
  assert.ok(second.store.isDismissed('journey:pattern_create'));
  assert.ok(second.store.isSnoozed('trade_plan'));
  assert.equal(second.store.initiativePreference(), 'high');
});

test('a pending sync retries and succeeds once the backend returns - the real outbox, not a stub', async () => {
  const localStorage = memoryStorage();
  let online = false;
  const delivered = [];
  const { store, queue } = await loadCombined({
    localStorage, currentUserId: 'user-1',
    fetchImpl: async (url, options) => {
      if (!online) throw new Error('offline');
      delivered.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ state: JSON.parse(options.body) }) };
    }
  });
  store.setCurrentGoal('sessions'); // enqueues; the immediate send attempt (online=false) is still in flight
  // Same sequencing as tests/sync-queue.test.mjs's own "once connectivity returns" test: await the
  // natural failure cycle to fully settle first (records attempts/backoff for real), THEN
  // manipulate nextAttemptAt and flush again - editing it before the first failure has been
  // recorded would just be overwritten by that failure's own writeAll().
  await queue.flush();
  assert.equal(queue.pendingCount('companion-state'), 1, 'a failed send leaves the write queued, never dropped');
  assert.equal(delivered.length, 0);

  online = true;
  const raw = JSON.parse(localStorage.getItem('tradejournal:sync-queue:v1'));
  raw[0].nextAttemptAt = 0; // simulate the backoff window having elapsed
  localStorage.setItem('tradejournal:sync-queue:v1', JSON.stringify(raw));
  await queue.flush();

  assert.equal(delivered.length, 1, 'the retried send succeeds once the backend is reachable again');
  assert.equal(delivered[0].currentGoal, 'sessions');
  assert.equal(queue.pendingCount('companion-state'), 0, 'a delivered entry leaves the outbox');
});

test('switching dev users on the same browser does not leak the previous user\'s Companion preferences/goal/dismissals', async () => {
  const localStorage = memoryStorage();
  const userA = await loadCombined({ localStorage, currentUserId: 'user-A', fetchImpl: async () => ({ ok: true, json: async () => ({ state: null }) }) });
  userA.store.setCurrentGoal('strategies');
  userA.store.dismissStep('journey:pattern_create');
  userA.store.setPreference('initiativePreference', 'high');
  assert.equal(userA.store.currentGoal(), 'strategies');

  // A real user switch is a full logout+re-login navigation (dev-user-switcher.js's "Log out"
  // button only clears the auth token, never localStorage - see ai-companion-profile.js's own
  // comment on load()) - simulated here as a fresh module load with a DIFFERENT live user id,
  // against the SAME localStorage user A's browser left behind, and no server data for B yet.
  const userB = await loadCombined({ localStorage, currentUserId: 'user-B', fetchImpl: async () => ({ ok: true, json: async () => ({ state: null }) }) });
  assert.equal(userB.store.currentGoal(), null, 'user B must never see user A\'s goal');
  assert.equal(userB.store.isDismissed('journey:pattern_create'), false, 'user B must never see user A\'s dismissals');
  assert.equal(userB.store.initiativePreference(), 'normal', 'user B must see the real default, not user A\'s preference');

  // User B's own new choice is correctly tagged to B, not silently merged with A's leftover cache.
  userB.store.setCurrentGoal('trades');
  assert.equal(userB.store.currentGoal(), 'trades');

  // Honest limitation, not a second bug: this app's local cache (like every other Section-7.18-
  // shaped module's) is a single shared localStorage key, not namespaced per user - B's own write
  // above physically overwrote the bytes A's browser was holding. Switching back to A must NEVER
  // silently show B's data as if it were A's own (leak prevention - proven below); recovering A's
  // OWN real data is the pre-existing, cross-device reconcile path already tested above
  // ("the one-time activation adopts the server state outright"), now exercised for A specifically.
  const backToA = await loadCombined({ localStorage, currentUserId: 'user-A', fetchImpl: async () => ({ ok: true, json: async () => ({ state: null }) }) });
  assert.notEqual(backToA.store.currentGoal(), 'trades', 'A must never see B\'s goal either - the leak-prevention guarantee is symmetric');
  assert.equal(backToA.store.currentGoal(), null, 'immediately after switching back, before any reconcile completes, A\'s local cache is honestly empty/default - never silently wrong');

  // The actual recovery path: once A's own real data is fetched from the server (already synced
  // there from A's very first write above, via the outbox this same test file already proves
  // works), the existing first-activation adopt path restores it correctly.
  const backToARestored = await loadCombined({
    localStorage: memoryStorage(), currentUserId: 'user-A',
    fetchImpl: async () => ({ ok: true, json: async () => ({ state: { lastUpdatedAt: '2026-01-01T00:00:00.000Z', currentGoal: 'strategies', dismissedSteps: {}, snoozedSteps: {}, skippedOptional: [], preferences: { initiativePreference: 'high' } } }) })
  });
  await flush(); // migrateOrAdopt()'s own fetch-then-apply chain is fire-and-forget - let it settle
  assert.equal(backToARestored.store.currentGoal(), 'strategies', 'A\'s own real data is recoverable via the existing server-reconcile path, just not preserved bit-for-bit in the shared local cache across an intervening user\'s session');
});

test('the local-first Companion Profile API is entirely synchronous - no read/write returns a Promise', async () => {
  const { store } = await loadCombined({ localStorage: memoryStorage(), currentUserId: 'user-1', fetchImpl: async () => ({ ok: true, json: async () => ({ state: null }) }) });
  const calls = [
    () => store.load(), () => store.get(), () => store.preferences(), () => store.initiativePreference(),
    () => store.hasSeenWalkthrough(), () => store.currentGoal(), () => store.isDismissed('x'), () => store.isSnoozed('x'), () => store.isSkipped('x'),
    () => store.setWalkthroughSeen(), () => store.setCurrentGoal('trades'), () => store.dismissStep('journey:x'),
    () => store.snoozeStep('x', '2099-01-01T00:00:00.000Z'), () => store.skipOptionalStep('x'), () => store.setPreference('initiativePreference', 'low')
  ];
  calls.forEach((fn) => { const result = fn(); assert.ok(!(result instanceof Promise), fn.toString() + ' must not return a Promise'); });
});

test('all four character pages load sync-queue.js and dev-user-switcher.js before ai-companion-profile.js', async () => {
  for (const character of ['hunter', 'engineer', 'commander', 'sage']) {
    const html = await readFile(path.join(root, 'public', 'pages', character, 'index.html'), 'utf8');
    const queueIndex = html.indexOf('sync-queue.js');
    const switcherIndex = html.indexOf('dev-user-switcher.js');
    const storeIndex = html.indexOf('ai-companion-profile.js');
    assert.ok(queueIndex > -1 && queueIndex < storeIndex, character + ': sync-queue.js before ai-companion-profile.js');
    assert.ok(switcherIndex > -1 && switcherIndex < storeIndex, character + ': dev-user-switcher.js before ai-companion-profile.js');
  }
});
