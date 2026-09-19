import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// analysis-context.js - the documented future-AI boundary for the Analysis Profiles domain (see
// ARCHITECTURE.md §7.25). Loaded with its two real registry dependencies + a fake
// window.TradeJournalAnalysisProfileStore (this file must never depend on the real store's own
// server-replica.js wiring, only on the store's public get() contract).
const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = (file) => readFile(shared(file), 'utf8');

async function loadContext(profiles) {
  const byId = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
  const sandbox = {
    window: { TradeJournalAnalysisProfileStore: { get: (id) => byId[id] || null } },
    JSON, Object, Array
  };
  vm.createContext(sandbox);
  vm.runInContext(await source('analysis-style-registry.js'), sandbox, { filename: 'analysis-style-registry.js' });
  vm.runInContext(await source('analysis-focus-registry.js'), sandbox, { filename: 'analysis-focus-registry.js' });
  vm.runInContext(await source('analysis-context.js'), sandbox, { filename: 'analysis-context.js' });
  return sandbox.window.TradeJournalAnalysisContext;
}

function baseProfile(overrides) {
  return Object.assign({
    id: 'p1', name: 'PA', description: '', primaryStyleId: 'price_action', secondaryStyleIds: [],
    focusIds: ['market_structure'], customMethodNotes: '', customFocuses: [], registryVersion: 1
  }, overrides || {});
}

test('getAnalysisContext returns null for an unknown profile id, rather than throwing', async () => {
  const context = await loadContext([]);
  assert.equal(context.getAnalysisContext('not-real'), null);
});

test('getAnalysisContext resolves the primary/secondary styles and focuses, and passes customFocuses through verbatim', async () => {
  const context = await loadContext([baseProfile({ customFocuses: [{ id: 'cf-1', name: 'Swept liquidity levels', description: 'stop hunts' }] })]);
  const result = context.getAnalysisContext('p1');
  assert.equal(result.primaryStyle.id, 'price_action');
  assert.equal(result.focuses.length, 1);
  assert.equal(result.customFocuses.length, 1);
  assert.equal(result.customFocuses[0].name, 'Swept liquidity levels');
});

test('profile.revision is present and is a stable, non-empty string', async () => {
  const context = await loadContext([baseProfile()]);
  const result = context.getAnalysisContext('p1');
  assert.equal(typeof result.profile.revision, 'string');
  assert.ok(result.profile.revision.length > 0);
});

test('profile.revision is deterministic for the same content, called twice', async () => {
  const context = await loadContext([baseProfile()]);
  const first = context.getAnalysisContext('p1').profile.revision;
  const second = context.getAnalysisContext('p1').profile.revision;
  assert.equal(first, second);
});

test('profile.revision changes when the trader edits focusIds, customFocuses, primaryStyleId, secondaryStyleIds, or customMethodNotes - the exact content a chart analysis actually reads', async () => {
  const base = baseProfile();
  const baseline = (await loadContext([base])).getAnalysisContext('p1').profile.revision;

  const cases = [
    { ...base, focusIds: ['market_structure', 'momentum'] },
    { ...base, customFocuses: [{ id: 'cf-1', name: 'New focus' }] },
    { ...base, primaryStyleId: 'wyckoff' },
    { ...base, secondaryStyleIds: ['ichimoku'] },
    { ...base, customMethodNotes: 'a note that changes the read' }
  ];
  for (const edited of cases) {
    const revision = (await loadContext([edited])).getAnalysisContext('p1').profile.revision;
    assert.notEqual(revision, baseline, `revision must change for: ${JSON.stringify(edited)}`);
  }
});

test('profile.revision does NOT change for a field the model never sees (name, description, isDefault) - avoids re-billing every unrelated edit', async () => {
  const base = baseProfile();
  const baseline = (await loadContext([base])).getAnalysisContext('p1').profile.revision;
  const renamed = (await loadContext([{ ...base, name: 'A totally different display name', description: 'different description too', isDefault: true }])).getAnalysisContext('p1').profile.revision;
  assert.equal(renamed, baseline);
});

test('profile.revision is order-independent for array fields (focusIds/secondaryStyleIds/customFocuses reordered without content change stays a genuinely open question, but key order within an object must never matter)', async () => {
  const a = baseProfile({ customFocuses: [{ id: 'cf-1', name: 'Focus', description: 'd', origin: 'user', createdAt: '2026-01-01T00:00:00.000Z' }] });
  const b = { ...a, customFocuses: [{ createdAt: '2026-01-01T00:00:00.000Z', origin: 'user', description: 'd', name: 'Focus', id: 'cf-1' }] };
  const revisionA = (await loadContext([a])).getAnalysisContext('p1').profile.revision;
  const revisionB = (await loadContext([b])).getAnalysisContext('p1').profile.revision;
  assert.equal(revisionA, revisionB, 'key order inside an object must never change the computed revision');
});
