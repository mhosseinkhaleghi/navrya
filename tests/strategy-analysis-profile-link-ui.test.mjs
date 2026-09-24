import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { extractFunction } from './helpers/extract-function.mjs';

// Strategy -> Analysis Profile link, through the REAL UI save sequence. tests/strategy-analysis-profile-link
// .test.mjs proves the store round trip; this proves what the Details tab actually does with it: the
// Select's onChange runs StrategyDetailsTab.setLinkedProfile(), which saves and then hands a record to the
// hub's onSave() - and the hub's onSave() re-saves whatever it is given. The shipped bug handed it the
// PRE-change snapshot (strategyRef.current), so the second save overwrote the new link with the old value.
//
// Both functions contain no JSX, so their real source is extracted from navrya-src/strategiesHubView.jsx and
// executed against the real strategy-education-store.js: the test runs the code that ships, not a copy of it.

const root = process.cwd();
const shared = (file) => readFile(path.join(root, 'public', 'pages', 'shared', file), 'utf8');

async function loadStore() {
  const sandbox = {
    window: { __NAVRYA_AUTH__: { authenticated: true, userId: 'user-1', user: { id: 'user-1' }, csrfToken: 't' } },
    fetch: async (url, options) => (options && options.method === 'POST' ? { ok: true, json: async () => JSON.parse(options.body) } : { ok: true, json: async () => ({ strategies: [] }) }),
    document: { body: { appendChild() {} }, documentElement: { lang: 'en' }, createElement: () => ({ setAttribute() {} }) },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options && options.detail; } },
    setTimeout: (fn) => fn()
  };
  Object.assign(sandbox.window, { dispatchEvent() {}, addEventListener() {} });
  vm.createContext(sandbox);
  for (const file of ['server-replica.js', 'strategy-education.types.js', 'strategy-education-store.js']) {
    vm.runInContext(await shared(file), sandbox, { filename: file });
  }
  return { store: sandbox.window.TradeJournalStrategyEducationStore, window: sandbox.window };
}

async function hubSource() {
  return (await readFile(path.join(root, 'navrya-src', 'strategiesHubView.jsx'), 'utf8')).replace(/\r\n/g, '\n');
}

// Builds the closure the Details tab and the hub really share: strategyRef, onSave, setLinkedProfile.
// `setLinkedProfileText` is a parameter so the negative control can run the pre-fix body in the same harness.
async function buildHarness(setLinkedProfileText) {
  const { store, window } = await loadStore();
  const source = await hubSource();
  const hubOnSave = extractFunction(source, 'onSave').replace('function onSave(', 'function hubOnSave(');
  const setLinkedProfile = setLinkedProfileText || extractFunction(source, 'setLinkedProfile');
  const calls = { onSave: [], rerenders: 0, savedAt: 0 };
  const strategy = store.create({ name: 'Trend strategy' });
  const context = {
    window, openKind: 'strategy',
    rerender: () => { calls.rerenders += 1; },
    setSavedAt: () => { calls.savedAt += 1; },
    Date, strategyRef: { current: store.find(strategy.id) },
    spy: (record) => calls.onSave.push(record)
  };
  vm.createContext(context);
  // onSave in the component tree is the hub's function; the spy only records what it was handed.
  vm.runInContext(`${hubOnSave}\nfunction onSave(updated) { spy(updated); return hubOnSave(updated); }\n${setLinkedProfile}`, context);
  return {
    store, strategy, calls, context,
    // What the hub does on every re-render: the Details tab's strategy prop (and so strategyRef) is re-read from the store.
    rerenderFromStore: () => { context.strategyRef.current = store.find(strategy.id); },
    link: (id) => vm.runInContext(`setLinkedProfile(${JSON.stringify(id)})`, context)
  };
}

test('selecting a profile persists it: the hub onSave re-save must not overwrite the new link with the old one', async () => {
  const h = await buildHarness();
  assert.equal(h.store.find(h.strategy.id).linkedAnalysisProfileId, null, 'a new strategy starts unlinked');

  h.link('profile-1');

  assert.equal(h.store.find(h.strategy.id).linkedAnalysisProfileId, 'profile-1');
  assert.equal(h.calls.onSave.length, 1, 'the hub is told once');
  assert.equal(h.calls.onSave[0].linkedAnalysisProfileId, 'profile-1', 'and is handed the SAVED record, not the pre-change snapshot');
  assert.equal(h.calls.rerenders, 1);
  assert.equal(h.calls.savedAt, 1);
});

test('switching to another profile, then clearing it, both persist - and clearing stores a real null, never the string "null"', async () => {
  const h = await buildHarness();
  h.link('profile-1');
  h.rerenderFromStore();

  h.link('profile-2');
  assert.equal(h.store.find(h.strategy.id).linkedAnalysisProfileId, 'profile-2');
  h.rerenderFromStore();

  h.link('');
  const cleared = h.store.find(h.strategy.id).linkedAnalysisProfileId;
  assert.equal(cleared, null);
  assert.notEqual(cleared, 'null');
  assert.equal(h.calls.onSave.at(-1).linkedAnalysisProfileId, null);
});

test('the link survives the next unrelated Details edit made from the same tab instance (strategyRef stays current)', async () => {
  const h = await buildHarness();
  h.link('profile-1');
  // No re-render in between: the Details tab's next handler (set(path, value)) still reads strategyRef.current.
  const next = h.store.setPath(h.context.strategyRef.current, 'name', 'Renamed');
  vm.runInContext('onSave(strategyRef.current)', h.context);
  assert.equal(next.name, 'Renamed');
  assert.equal(h.store.find(h.strategy.id).linkedAnalysisProfileId, 'profile-1', 'a stale ref would have re-saved the old, unlinked snapshot');
});

test('negative control: the pre-fix body (onSave(strategyRef.current)) really does lose the link in this same harness', async () => {
  const preFix = `function setLinkedProfile(id) {
    window.TradeJournalStrategyEducationStore.save(Object.assign({}, strategyRef.current, { linkedAnalysisProfileId: id || null }));
    onSave(strategyRef.current); setSavedAt(Date.now());
  }`;
  const h = await buildHarness(preFix);
  h.link('profile-1');
  assert.equal(h.store.find(h.strategy.id).linkedAnalysisProfileId, null, 'the harness must reproduce the reported bug, or it proves nothing');
});

test('the Select still routes through setLinkedProfile and the setter stays out of the generic set()/setPath() coercion', async () => {
  const source = await hubSource();
  assert.match(source, /<Select icon="strategies" value=\{strategy\.linkedAnalysisProfileId \|\| ''\} options=\{analysisProfileOptions\} onChange=\{setLinkedProfile\} \/>/);
  const body = extractFunction(source, 'setLinkedProfile');
  assert.doesNotMatch(body, /setPath\(/);
  assert.match(body, /const saved = window\.TradeJournalStrategyEducationStore\.save\(/);
  assert.match(body, /onSave\(saved\)/);
  assert.doesNotMatch(body, /onSave\(strategyRef\.current\)/);
});
