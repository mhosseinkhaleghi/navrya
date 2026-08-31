import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Analysis Profiles domain (see ARCHITECTURE.md §7.25, brief §15 "Strategy Integration"). Proves
// strategy-education-store.js's own half of the optional Strategy -> Analysis Profile link:
// linkedAnalysisProfileId round-trips through create()/save()/normalize() correctly, defaults to
// null (never implicitly auto-selected), and can be explicitly cleared. The reverse direction
// (deleting an Analysis Profile clears any Strategy that linked to it) is covered in
// tests/analysis-profile-store.test.mjs, since that cleanup lives in analysis-profile-store.js's
// own orphanLinkedStrategies(), not here - same file split as the real orphanLinkedTrades()
// precedent this feature mirrors.
const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = (file) => readFile(shared(file), 'utf8');

async function loadStrategyStore({ fetchImpl, currentUserId } = {}) {
  const authState = currentUserId
    ? { authenticated: true, userId: currentUserId, user: { id: currentUserId }, csrfToken: 'test-csrf' }
    : { authenticated: false, userId: null, user: null, csrfToken: null };
  const fetchFn = async (url, options) => (fetchImpl ? fetchImpl(url, options) : { ok: false, status: 500 });
  const sandbox = {
    window: { __NAVRYA_AUTH__: authState }, fetch: fetchFn,
    document: { body: { appendChild() {} }, documentElement: { lang: 'en' }, createElement: () => ({ setAttribute() {} }) },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options && options.detail; } },
    setTimeout: (fn) => fn()
  };
  sandbox.window = Object.assign(sandbox.window, { dispatchEvent() {}, addEventListener() {} });
  vm.createContext(sandbox);
  vm.runInContext(await source('server-replica.js'), sandbox, { filename: 'server-replica.js' });
  vm.runInContext(await source('strategy-education.types.js'), sandbox, { filename: 'strategy-education.types.js' });
  vm.runInContext(await source('strategy-education-store.js'), sandbox, { filename: 'strategy-education-store.js' });
  return { store: sandbox.window.TradeJournalStrategyEducationStore, window: sandbox.window };
}

function memoryUpsertFetch() {
  return async (url, options) => {
    if (options && options.method === 'POST') return { ok: true, json: async () => JSON.parse(options.body) };
    return { ok: true, json: async () => ({ strategies: [] }) };
  };
}
function flush() { return new Promise((resolve) => setImmediate(resolve)); }

test('a brand-new Strategy has no Analysis Profile linked - never implicitly auto-selected', async () => {
  const { store } = await loadStrategyStore({ currentUserId: 'user-1', fetchImpl: memoryUpsertFetch() });
  await flush();
  const strategy = store.create({ name: 'My Strategy' });
  assert.equal(strategy.linkedAnalysisProfileId, null);
});

test('a Strategy can link to an Analysis Profile id, and it survives a save() round trip', async () => {
  const { store } = await loadStrategyStore({ currentUserId: 'user-1', fetchImpl: memoryUpsertFetch() });
  await flush();
  const strategy = store.create({ name: 'My Strategy' });
  const linked = store.save(Object.assign({}, strategy, { linkedAnalysisProfileId: 'analysis-profile-abc' }));
  assert.equal(linked.linkedAnalysisProfileId, 'analysis-profile-abc');
  const reloaded = store.find(strategy.id);
  assert.equal(reloaded.linkedAnalysisProfileId, 'analysis-profile-abc');
});

test('a Strategy can clear its linked Analysis Profile back to null', async () => {
  const { store } = await loadStrategyStore({ currentUserId: 'user-1', fetchImpl: memoryUpsertFetch() });
  await flush();
  const strategy = store.create({ name: 'My Strategy' });
  store.save(Object.assign({}, strategy, { linkedAnalysisProfileId: 'analysis-profile-abc' }));
  const cleared = store.save(Object.assign({}, store.find(strategy.id), { linkedAnalysisProfileId: null }));
  assert.equal(cleared.linkedAnalysisProfileId, null);
});

test('normalize() never coerces a real linked id into a numeric/text-path style value - it passes through untouched', async () => {
  const { store } = await loadStrategyStore({ currentUserId: 'user-1', fetchImpl: memoryUpsertFetch() });
  await flush();
  const strategy = store.create({ name: 'My Strategy', linkedAnalysisProfileId: 'analysis-profile-xyz' });
  assert.equal(strategy.linkedAnalysisProfileId, 'analysis-profile-xyz');
});

test('linkedAnalysisProfileId is deliberately absent from textPaths/numericPaths - never AI-fillable through the generic allowlist', async () => {
  const text = await source('strategy-education.types.js');
  const typesMatch = text.match(/window\.TradeJournalStrategyEducationTypes = \{[\s\S]*?\};/);
  assert.ok(typesMatch);
  assert.doesNotMatch(typesMatch[0], /linkedAnalysisProfileId/, 'the field must never be added to the AI-fillable path allowlists');
});
