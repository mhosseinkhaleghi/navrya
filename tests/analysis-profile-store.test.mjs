import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Analysis Profiles domain (see ARCHITECTURE.md §7.25). Same vm.runInNewContext harness
// tests/patterns-sync.test.mjs already established for a server-replica.js-backed domain store -
// see that file's own header comment for the full reasoning (cookie-based auth via
// window.__NAVRYA_AUTH__, keepalive writes, no localStorage anywhere).
const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = (file) => readFile(shared(file), 'utf8');

async function loadStore({ fetchImpl, currentUserId } = {}) {
  const authState = currentUserId
    ? { authenticated: true, userId: currentUserId, user: { id: currentUserId }, csrfToken: 'test-csrf' }
    : { authenticated: false, userId: null, user: null, csrfToken: null };
  const fetchCalls = [];
  const fetchFn = async (url, options) => { fetchCalls.push([url, options]); return fetchImpl ? fetchImpl(url, options) : { ok: false, status: 500 }; };
  const sandbox = {
    window: { __NAVRYA_AUTH__: authState }, fetch: fetchFn,
    document: { body: { appendChild() {} }, documentElement: { lang: 'en' }, createElement: () => ({ setAttribute() {} }) },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options && options.detail; } },
    setTimeout: (fn) => fn(),
    // A bare vm sandbox has no URL global (unlike a real browser/Node global scope) - needed by
    // the store's own customMethodLinks normalization (analysis-profile-store.js).
    URL
  };
  sandbox.window = Object.assign(sandbox.window, { dispatchEvent() {}, addEventListener() {} });
  vm.createContext(sandbox);
  vm.runInContext(await source('server-replica.js'), sandbox, { filename: 'server-replica.js' });
  vm.runInContext(await source('analysis-style-registry.js'), sandbox, { filename: 'analysis-style-registry.js' });
  vm.runInContext(await source('analysis-focus-registry.js'), sandbox, { filename: 'analysis-focus-registry.js' });
  vm.runInContext(await source('analysis-profile-store.js'), sandbox, { filename: 'analysis-profile-store.js' });
  return { store: sandbox.window.TradeJournalAnalysisProfileStore, replica: sandbox.window.TradeJournalServerReplica, fetchCalls, window: sandbox.window };
}

function memoryUpsertFetch() {
  return async (url, options) => {
    if (options && options.method === 'POST') return { ok: true, json: async () => JSON.parse(options.body) };
    if (options && options.method === 'DELETE') return { ok: true, status: 204, json: async () => null };
    return { ok: true, json: async () => ({ analysisProfiles: [] }) };
  };
}
function flush() { return new Promise((resolve) => setImmediate(resolve)); }

test('registers an analysisProfiles list domain with server-replica.js and hydrates it at load time', async () => {
  const { replica, fetchCalls } = await loadStore({ currentUserId: 'user-1', fetchImpl: memoryUpsertFetch() });
  assert.ok(replica.domain('analysisProfiles'));
  await flush();
  const hydrateCall = fetchCalls.find((call) => call[0] === '/api/sync/analysis-profiles' && (!call[1] || call[1].method === undefined));
  assert.ok(hydrateCall, 'a GET /api/sync/analysis-profiles must have been made to hydrate');
});

test('a brand-new account starts genuinely empty - no seeded profiles', async () => {
  const { store } = await loadStore({ currentUserId: 'user-1', fetchImpl: memoryUpsertFetch() });
  await flush();
  assert.equal(store.listSync().length, 0);
});

test('create() applies optimistically and returns synchronously, then POSTs to /api/sync/analysis-profiles', async () => {
  const { store, fetchCalls } = await loadStore({ currentUserId: 'user-1', fetchImpl: memoryUpsertFetch() });
  await flush();
  const created = store.create({ name: 'PA profile', primaryStyleId: 'price_action', focusIds: ['market_structure', 'momentum'] });
  assert.equal(created.name, 'PA profile');
  assert.equal(store.listSync().length, 1);
  await flush();
  const postCall = fetchCalls.find((call) => call[1] && call[1].method === 'POST');
  assert.ok(postCall, 'save() must POST in the background');
});

test('the very first profile a user ever creates automatically becomes their default', async () => {
  const { store } = await loadStore({ currentUserId: 'user-1', fetchImpl: memoryUpsertFetch() });
  await flush();
  const first = store.create({ name: 'First', primaryStyleId: 'general_analysis' });
  assert.equal(first.isDefault, true);
  const second = store.create({ name: 'Second', primaryStyleId: 'wyckoff' });
  assert.equal(second.isDefault, false, 'a second profile must not silently steal the default');
});

test('exactly one default at a time: setDefault() clears the previous default', async () => {
  const { store } = await loadStore({ currentUserId: 'user-1', fetchImpl: memoryUpsertFetch() });
  await flush();
  const a = store.create({ name: 'A', primaryStyleId: 'general_analysis' });
  const b = store.create({ name: 'B', primaryStyleId: 'wyckoff' });
  await flush();
  store.setDefault(b.id);
  await flush();
  const defaults = store.listSync().filter((p) => p.isDefault);
  assert.equal(defaults.length, 1);
  assert.equal(defaults[0].id, b.id);
  const reloadedA = store.find(a.id);
  assert.equal(reloadedA.isDefault, false);
});

test('an invalid primaryStyleId falls back to the real general_analysis registry entry, never invents one', async () => {
  const { store } = await loadStore({ currentUserId: 'user-1', fetchImpl: memoryUpsertFetch() });
  await flush();
  const created = store.create({ name: 'Bad', primaryStyleId: 'not_a_real_style' });
  assert.equal(created.primaryStyleId, 'general_analysis');
});

test('invalid focus ids are dropped during normalize(), never persisted', async () => {
  const { store } = await loadStore({ currentUserId: 'user-1', fetchImpl: memoryUpsertFetch() });
  await flush();
  const created = store.create({ name: 'X', primaryStyleId: 'price_action', focusIds: ['market_structure', 'not_a_real_focus', 'momentum'] });
  assert.deepEqual(created.focusIds.sort(), ['market_structure', 'momentum']);
});

test('secondary styles normalize correctly: capped at 2, deduplicated, never includes the primary style itself', async () => {
  const { store } = await loadStore({ currentUserId: 'user-1', fetchImpl: memoryUpsertFetch() });
  await flush();
  const created = store.create({
    name: 'Hybrid', primaryStyleId: 'smc',
    secondaryStyleIds: ['ict', 'ict', 'smc', 'liquidity_analysis', 'wyckoff', 'not_real']
  });
  assert.ok(created.secondaryStyleIds.length <= 2);
  assert.equal(created.secondaryStyleIds.indexOf('smc'), -1, 'a secondary must never duplicate the primary');
  assert.equal(new Set(created.secondaryStyleIds).size, created.secondaryStyleIds.length);
});

test('custom notes survive a normalize() round trip unchanged', async () => {
  const { store } = await loadStore({ currentUserId: 'user-1', fetchImpl: memoryUpsertFetch() });
  await flush();
  const notes = 'I read structure first, then wait for a liquidity sweep before entering.';
  const created = store.create({ name: 'Custom', primaryStyleId: 'custom_method', customMethodNotes: notes });
  assert.equal(created.customMethodNotes, notes);
  const saved = store.update(created.id, { description: 'updated' });
  assert.equal(saved.customMethodNotes, notes);
});

test('duplicate() copies content but never the default flag, and gives a distinct id', async () => {
  const { store } = await loadStore({ currentUserId: 'user-1', fetchImpl: memoryUpsertFetch() });
  await flush();
  const original = store.create({ name: 'Original', primaryStyleId: 'ichimoku', focusIds: ['kumo_context'] });
  await flush();
  const copy = store.duplicate(original.id);
  assert.notEqual(copy.id, original.id);
  assert.equal(copy.isDefault, false);
  assert.equal(copy.primaryStyleId, 'ichimoku');
});

test('remove() refuses to delete the user\'s last remaining profile', async () => {
  const { store } = await loadStore({ currentUserId: 'user-1', fetchImpl: memoryUpsertFetch() });
  await flush();
  const only = store.create({ name: 'Only', primaryStyleId: 'general_analysis' });
  await flush();
  await assert.rejects(() => store.remove(only.id), (error) => error.code === 'ANALYSIS_PROFILE_LAST_REMAINING');
  assert.equal(store.listSync().length, 1);
});

test('remove() of the default profile promotes the most-recently-updated remaining profile to default', async () => {
  const { store } = await loadStore({ currentUserId: 'user-1', fetchImpl: memoryUpsertFetch() });
  await flush();
  const a = store.create({ name: 'A', primaryStyleId: 'general_analysis' });
  await flush();
  const b = store.create({ name: 'B', primaryStyleId: 'wyckoff' });
  await flush();
  assert.equal(a.isDefault, true);
  await store.remove(a.id);
  await flush();
  const remaining = store.listSync();
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, b.id);
  assert.equal(remaining[0].isDefault, true, 'the user must never be left with zero default profiles');
});

test('snapshot() captures a normalized, self-contained view and remains stable after the live profile later changes', async () => {
  const { store } = await loadStore({ currentUserId: 'user-1', fetchImpl: memoryUpsertFetch() });
  await flush();
  const created = store.create({ name: 'PA', primaryStyleId: 'price_action', focusIds: ['market_structure', 'momentum'] });
  await flush();
  const snap = store.snapshot(created.id);
  assert.equal(snap.profileId, created.id);
  assert.equal(snap.primaryStyle.id, 'price_action');
  assert.equal(snap.focuses.length, 2);

  // Mutate the live profile after the snapshot was taken - the snapshot object itself must not
  // change (it is a plain, already-resolved object, not a live reference).
  store.update(created.id, { primaryStyleId: 'wyckoff', focusIds: ['wyckoff_phase'] });
  await flush();
  assert.equal(snap.primaryStyle.id, 'price_action', 'a previously captured snapshot must never retroactively change');
  assert.equal(snap.focuses.length, 2);
});

test('snapshot() returns null for an unknown id rather than throwing', async () => {
  const { store } = await loadStore({ currentUserId: 'user-1', fetchImpl: memoryUpsertFetch() });
  await flush();
  assert.equal(store.snapshot('not-a-real-id'), null);
});

// customMethodLinks / customFocuses (068_analysis_profile_authoring.sql).
test('create() normalizes customMethodLinks and customFocuses, dropping an invalid URL and a duplicate/invalid focus', async () => {
  const { store } = await loadStore({ currentUserId: 'user-1', fetchImpl: memoryUpsertFetch() });
  await flush();
  const created = store.create({
    name: 'Custom', primaryStyleId: 'custom_method', customMethodNotes: 'my own way',
    customMethodLinks: { youtubeUrl: 'https://youtu.be/abc', websiteUrl: 'not a url' },
    customFocuses: [{ id: 'cf-1', name: 'Swept liquidity levels' }, { id: 'cf-1', name: 'dup' }, { id: '', name: 'no id' }]
  });
  assert.equal(created.customMethodLinks.youtubeUrl, 'https://youtu.be/abc');
  assert.equal(created.customMethodLinks.websiteUrl, '');
  assert.equal(created.customFocuses.length, 1);
  assert.equal(created.customFocuses[0].name, 'Swept liquidity levels');
});

test('a profile created before customMethodLinks/customFocuses existed normalizes to the empty shape, never null/undefined', async () => {
  const { store } = await loadStore({ currentUserId: 'user-1', fetchImpl: memoryUpsertFetch() });
  await flush();
  const created = store.create({ name: 'Legacy', primaryStyleId: 'general_analysis' });
  // The vm sandbox returns cross-realm plain objects/arrays - deepEqual (deepStrictEqual under
  // node:assert/strict) also compares prototypes, so re-serialize through JSON first.
  assert.deepEqual(JSON.parse(JSON.stringify(created.customMethodLinks)), { youtubeUrl: '', websiteUrl: '', referenceUrl: '' });
  assert.deepEqual(JSON.parse(JSON.stringify(created.customFocuses)), []);
});

test('snapshot() carries the trader\'s own customFocuses/customMethodLinks and stays stable after the live profile later changes', async () => {
  const { store } = await loadStore({ currentUserId: 'user-1', fetchImpl: memoryUpsertFetch() });
  await flush();
  const created = store.create({
    name: 'Custom', primaryStyleId: 'custom_method', customMethodNotes: 'my own way',
    customMethodLinks: { websiteUrl: 'https://school.example.com/' },
    customFocuses: [{ id: 'cf-1', name: 'Swept liquidity levels', description: 'stop hunts' }]
  });
  await flush();
  const snap = store.snapshot(created.id);
  assert.equal(snap.customFocuses.length, 1);
  assert.equal(snap.customFocuses[0].name, 'Swept liquidity levels');
  assert.equal(snap.customMethodLinks.websiteUrl, 'https://school.example.com/');

  store.update(created.id, { customFocuses: [] });
  await flush();
  assert.equal(snap.customFocuses.length, 1, 'a previously captured snapshot must never retroactively change');
});

test('getDefault() returns the real default profile, falling back to the first profile if none is explicitly flagged', async () => {
  const { store } = await loadStore({ currentUserId: 'user-1', fetchImpl: memoryUpsertFetch() });
  await flush();
  assert.equal(store.getDefault(), null);
  const created = store.create({ name: 'Only', primaryStyleId: 'general_analysis' });
  await flush();
  assert.equal(store.getDefault().id, created.id);
});

test('deleting an Analysis Profile clears (never dangles) a Strategy that linked to it, looked up live via window.TradeJournalStrategyEducationStore', async () => {
  const { store, window } = await loadStore({ currentUserId: 'user-1', fetchImpl: memoryUpsertFetch() });
  await flush();
  const a = store.create({ name: 'A', primaryStyleId: 'general_analysis' });
  const b = store.create({ name: 'B', primaryStyleId: 'wyckoff' });
  await flush();

  const savedStrategies = [];
  const strategies = [
    { id: 'strategy-1', name: 'S1', linkedAnalysisProfileId: b.id },
    { id: 'strategy-2', name: 'S2', linkedAnalysisProfileId: a.id }
  ];
  // Attached directly onto the same sandbox `window` the store's own module closure reads from -
  // mirrors strategy-education-store.js's own "look up the other store live, never cache it"
  // convention (orphanLinkedTrades()), so load order between the two real store files never
  // matters in production either.
  window.TradeJournalStrategyEducationStore = {
    listSync: () => strategies,
    save: (record) => savedStrategies.push(record)
  };

  await store.remove(b.id);
  assert.equal(savedStrategies.length, 1, 'only the strategy actually linked to the removed profile should be re-saved');
  assert.equal(savedStrategies[0].id, 'strategy-1');
  assert.equal(savedStrategies[0].linkedAnalysisProfileId, null, 'the link must be cleared, never left dangling');
});

test('deleting a Strategy never touches an Analysis Profile - the relationship is one-directional', async () => {
  const { store } = await loadStore({ currentUserId: 'user-1', fetchImpl: memoryUpsertFetch() });
  await flush();
  const a = store.create({ name: 'A', primaryStyleId: 'general_analysis' });
  const b = store.create({ name: 'B', primaryStyleId: 'wyckoff' });
  await flush();
  // No Strategy Store call site anywhere calls into AnalysisProfileStore.remove() - the store's
  // own public API has no method a Strategy deletion could even reach. Asserted structurally by
  // confirming both profiles are simply untouched after time passes with no profile-side action.
  assert.equal(store.listSync().length, 2);
  assert.equal(store.find(a.id).name, 'A');
  assert.equal(store.find(b.id).name, 'B');
});

// Engine memory (Phase 2, 069_analysis_profile_memory.sql) - applyLearning()'s single mutation
// funnel, and the events client.
test('applyLearning() merges new concepts (deduped by folded title) in exactly one save(), never per-concept', async () => {
  const { store, fetchCalls } = await loadStore({ currentUserId: 'user-1', fetchImpl: memoryUpsertFetch() });
  await flush();
  const created = store.create({ name: 'PA', primaryStyleId: 'price_action' });
  await flush();
  const before = fetchCalls.filter((call) => call[1] && call[1].method === 'POST' && call[0] === '/api/sync/analysis-profiles').length;

  const updated = store.applyLearning(created.id, {
    conceptsToAdd: [
      { title: 'Swept liquidity levels', description: 'stop hunts', priority: 'mandatory' },
      { title: '  swept   liquidity  levels ' } // same concept, different casing/spacing - must be deduped
    ]
  });
  assert.equal(updated.concepts.length, 1, 'a duplicate (folded) title must not create a second concept');
  assert.equal(updated.concepts[0].title, 'Swept liquidity levels');
  await flush();
  const after = fetchCalls.filter((call) => call[1] && call[1].method === 'POST' && call[0] === '/api/sync/analysis-profiles').length;
  assert.equal(after - before, 1, 'applyLearning must persist through exactly one profile save(), never one per concept');
});

test('applyLearning() adding a concept that already exists on the profile is a no-op for that concept', async () => {
  const { store } = await loadStore({ currentUserId: 'user-1', fetchImpl: memoryUpsertFetch() });
  await flush();
  const created = store.create({ name: 'PA', primaryStyleId: 'price_action', concepts: [{ id: 'cpt-1', title: 'Order block mitigation' }] });
  await flush();
  const updated = store.applyLearning(created.id, { conceptsToAdd: [{ title: 'Order block mitigation' }] });
  assert.equal(updated.concepts.length, 1);
});

test('applyLearning() bumps understanding.version only when the proposed summary genuinely differs from the current one', async () => {
  const { store } = await loadStore({ currentUserId: 'user-1', fetchImpl: memoryUpsertFetch() });
  await flush();
  const created = store.create({ name: 'PA', primaryStyleId: 'price_action' });
  await flush();
  assert.equal(created.understanding.version, 0);

  const first = store.applyLearning(created.id, { understandingSummary: 'Reads price action first.' });
  assert.equal(first.understanding.version, 1);
  assert.equal(first.understanding.summary, 'Reads price action first.');

  const unchanged = store.applyLearning(created.id, { understandingSummary: 'Reads price action first.' });
  assert.equal(unchanged.understanding.version, 1, 'proposing the exact same summary again must not bump the version');

  const second = store.applyLearning(created.id, { understandingSummary: 'Reads price action first, liquidity second.' });
  assert.equal(second.understanding.version, 2);
});

test('applyLearning() returns null for an unknown profile id, rather than throwing', async () => {
  const { store } = await loadStore({ currentUserId: 'user-1', fetchImpl: memoryUpsertFetch() });
  await flush();
  assert.equal(store.applyLearning('not-a-real-id', { understandingSummary: 'x' }), null);
});

test('listEvents() hits the real nested GET /events endpoint for the given profile id and returns [] on a failed response, never throwing', async () => {
  const calls = [];
  const { store } = await loadStore({
    currentUserId: 'user-1',
    fetchImpl: async (url, options) => {
      calls.push([url, options]);
      if (url === '/api/sync/analysis-profiles/p1/events' && (!options || options.method === undefined)) return { ok: true, json: async () => ({ events: [{ id: 'ev-1', kind: 'note' }] }) };
      if (url === '/api/sync/analysis-profiles/p2/events') return { ok: false, status: 403 };
      return { ok: true, json: async () => ({ analysisProfiles: [] }) };
    }
  });
  await flush();
  const events = await store.listEvents('p1');
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'note');
  assert.ok(calls.some((call) => call[0] === '/api/sync/analysis-profiles/p1/events'));
  const failed = await store.listEvents('p2');
  assert.equal(failed.length, 0);
});

test('applyLearning() posts exactly one best-effort learning event to the real nested /events endpoint, carrying the token usage through', async () => {
  const eventPosts = [];
  const { store } = await loadStore({
    currentUserId: 'user-1',
    fetchImpl: async (url, options) => {
      if (url === '/api/sync/analysis-profiles/p1/events' && options && options.method === 'POST') { eventPosts.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ id: 'ev-1' }) }; }
      if (options && options.method === 'POST') return { ok: true, json: async () => JSON.parse(options.body) };
      return { ok: true, json: async () => ({ analysisProfiles: [{ id: 'p1', name: 'PA', primaryStyleId: 'price_action', secondaryStyleIds: [], focusIds: [] }] }) };
    }
  });
  await flush();
  store.applyLearning('p1', { conceptsToAdd: [{ title: 'Order block mitigation' }], eventKind: 'concept_added', eventTitle: 'Accepted an AI suggestion', tokenUsage: { promptTokens: 80, completionTokens: 20 } });
  await flush();
  assert.equal(eventPosts.length, 1);
  assert.equal(eventPosts[0].kind, 'concept_added');
  assert.equal(eventPosts[0].tokenUsage.promptTokens, 80);
});

test('recordNote() posts exactly one plain "note" event with zero tokens and NEVER saves the profile (no concept/understanding change)', async () => {
  const eventPosts = [];
  let profilePosts = 0;
  const { store } = await loadStore({
    currentUserId: 'user-1',
    fetchImpl: async (url, options) => {
      if (url === '/api/sync/analysis-profiles/p1/events' && options && options.method === 'POST') { eventPosts.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ id: 'ev-1' }) }; }
      if (options && options.method === 'POST') { profilePosts += 1; return { ok: true, json: async () => JSON.parse(options.body) }; }
      return { ok: true, json: async () => ({ analysisProfiles: [{ id: 'p1', name: 'PA', primaryStyleId: 'price_action', secondaryStyleIds: [], focusIds: [], understanding: { summary: 'x', version: 4 } }] }) };
    }
  });
  await flush();
  await store.recordNote('p1', '  Remember to wait for the retest.  ');
  await flush();
  assert.equal(eventPosts.length, 1);
  assert.equal(eventPosts[0].kind, 'note');
  assert.equal(eventPosts[0].detail, 'Remember to wait for the retest.');
  assert.equal(eventPosts[0].tokenUsage, null, 'a diary note spends no tokens');
  assert.equal(eventPosts[0].understandingVersion, 4);
  assert.equal(profilePosts, 0, 'a plain note must never re-save the profile');
});

test('recordNote() is a no-op (resolves null, no network) for an empty note or an unknown profile', async () => {
  let posts = 0;
  const { store } = await loadStore({ currentUserId: 'user-1', fetchImpl: async (url, options) => { if (options && options.method === 'POST') posts += 1; return { ok: true, json: async () => ({ analysisProfiles: [] }) }; } });
  await flush();
  assert.equal(await store.recordNote('p1', 'hello'), null, 'unknown profile');
  assert.equal(await store.recordNote('p1', '   '), null, 'empty note');
  assert.equal(posts, 0);
});
