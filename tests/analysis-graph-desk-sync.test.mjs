import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { createMemoryRepo } from '../server/db/repo.memory.mjs';

// Map <-> Desk synchronization hardening (see liveSessionView.jsx's own "MAP <-> DESK
// SYNCHRONIZATION CONTRACT" comment, right above its graph mutators, for the full architecture).
//
// What this file proves, and how:
// 1. The REAL propagation mechanism exists and is exactly-once (source-text - React component
//    behavior can't be exercised in this runner; no JSX transform, no jsdom, matching every
//    other navrya-src/*.jsx test in this suite - see tests/trading-sessions-sync.test.mjs's own
//    header comment for the established reasoning).
// 2. The underlying data-layer guarantee a "remount always sees canonical truth" claim actually
//    rests on: a REAL repo.memory.mjs round-trip (not React) proving Desk-field writes
//    (entries/scenarios) and Map-field writes (analysisGraph) never clobber each other, and a
//    completely independent, cache-free read (the same thing a freshly mounted component's own
//    find()/get() would do) always reflects the latest state regardless of which surface wrote
//    it last.

const root = process.cwd();
const src = (...parts) => path.join(root, 'navrya-src', ...parts);

// ---------------------------------------------------------------------------
// 1. The real propagation mechanism: single listener, exactly-once registration/cleanup.
// ---------------------------------------------------------------------------

test('LiveSessionView has exactly one tradejournal:sessions-changed listener, registered and torn down inside one useEffect - no duplicate-listener risk across remounts', async () => {
  const liveSessionSrc = await readFile(src('liveSessionView.jsx'), 'utf8');
  const addCalls = [...liveSessionSrc.matchAll(/addEventListener\('tradejournal:sessions-changed'/g)];
  const removeCalls = [...liveSessionSrc.matchAll(/removeEventListener\('tradejournal:sessions-changed'/g)];
  assert.equal(addCalls.length, 1, 'exactly one addEventListener call for the canonical-change event');
  assert.equal(removeCalls.length, 1, 'exactly one matching removeEventListener (cleanup) call');
  // Same handler both times (both call sites pass `rerender`), and the effect returns the
  // cleanup function (a React useEffect's own contract for exactly-once-per-mount registration).
  const effectMatch = /React\.useEffect\(\(\) => \{[\s\S]*?addEventListener\('tradejournal:sessions-changed', rerender\);[\s\S]*?return \(\) => \{[\s\S]*?removeEventListener\('tradejournal:sessions-changed', rerender\);[\s\S]*?\}, \[rerender\]\);/.exec(liveSessionSrc);
  assert.ok(effectMatch, 'the listener must be registered/cleaned up inside one useEffect with a stable [rerender] dependency');
});

test('the canonical `session` value is re-read fresh (never cached) on every render, and passed to Desk (AnalysisWorkspaceBoard) and Map (AnalysisGraphView) from the SAME read - they can never observe two different session snapshots', async () => {
  const liveSessionSrc = await readFile(src('liveSessionView.jsx'), 'utf8');
  assert.match(liveSessionSrc, /window\.TradeJournalWorkspace\.find\(sessionId\)/, 'session must be read via the real canonical store, not a local cache');
  // Both consumers appear after the single `session` read, inside the same render/return - i.e.
  // one variable, two consumers, not two independent reads.
  const sessionReadIndex = liveSessionSrc.indexOf('window.TradeJournalWorkspace.find(sessionId)');
  const deskIndex = liveSessionSrc.indexOf('<AnalysisWorkspaceBoard');
  const mapIndex = liveSessionSrc.indexOf('<AnalysisGraphView');
  assert.ok(sessionReadIndex > -1 && deskIndex > sessionReadIndex && mapIndex > sessionReadIndex, 'both Desk and Map must be rendered after (and therefore from) the same session read');
  assert.match(liveSessionSrc, /<AnalysisWorkspaceBoard character=\{character\} lang=\{lang\} rtl=\{rtl\} \/>/);
  assert.match(liveSessionSrc, /<AnalysisGraphView\s*\n\s*session=\{session\}/);
});

test('every graph mutator writes onto the SAME session object persist() received (property assignment, e.g. `s.analysisGraph = g`) - never constructs a partial replacement object that could drop Desk\'s own entries/scenarios fields', async () => {
  const liveSessionSrc = await readFile(src('liveSessionView.jsx'), 'utf8');
  const graphMutatorNames = [
    'addGraphNode', 'addManualGraphNode', 'addProcessingGraphNode', 'removeGraphNode',
    'updateGraphNodeStage', 'updateGraphNodeContent', 'updateGraphNodeConfig',
    'updateGraphNodePosition', 'updateGraphViewport', 'addGraphEdge', 'removeGraphEdge', 'toggleGraphStageCollapsed'
  ];
  graphMutatorNames.forEach((fnName) => {
    const fnMatch = new RegExp('function ' + fnName + '\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}').exec(liveSessionSrc);
    assert.ok(fnMatch, `could not find ${fnName}()`);
    if (fnMatch[0].includes('persist(')) {
      assert.match(fnMatch[0], /s\.analysisGraph = g;/, `${fnName} must assign onto the persisted session object's own analysisGraph property`);
      // Never a full-object replacement like `persist((s) => ({ ...s, analysisGraph: g }))` or
      // `persist(() => ({ analysisGraph: g }))` - persist()'s own mutator(session) contract
      // mutates the real object in place; a returned replacement would silently be discarded by
      // persist() itself (mutator(session) ignores its own return value) - but text-asserting the
      // pattern is never even attempted here as documentation of the real invariant.
      assert.doesNotMatch(fnMatch[0], /persist\(\(\) => \(\{/, `${fnName} must not construct a fresh session-shaped object`);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. The real data-layer guarantee: cross-field consistency + remount-sees-truth, exercised
// against the actual repo.memory.mjs canonical store (not a simulation of one).
// ---------------------------------------------------------------------------

async function seedSession(repo, user) {
  await repo.instrumentCatalog.upsert(user.id, { id: 'instr-' + user.id, code: 'XAUUSD' });
  return repo.tradingSessions.upsert(user.id, {
    id: 's1', market: 'London', instrument: 'XAUUSD', timeframe: '15m', date: '2026-01-01',
    entries: [{ id: 'e1', type: 'chart', scenarios: [] }],
    analysisGraph: { version: 1, nodes: [], edges: [], groups: [], stages: [], viewport: { x: 0, y: 0, zoom: 1 }, workflowMeta: {}, template: null, updatedAt: null }
  });
}

test('Map -> canonical Session -> Desk: a Map-only write (analysisGraph) leaves Desk\'s own fields (entries/scenarios) completely untouched, and a fresh read (simulating Desk re-rendering) sees the Map\'s change', async () => {
  const repo = createMemoryRepo();
  const user = await repo.users.create({ displayName: 'Trader' });
  const initial = await seedSession(repo, user);
  assert.equal(initial.entries.length, 1);

  // A Map mutation: read fresh (what addGraphNode's own `session.analysisGraph` read does),
  // mutate only analysisGraph, write the WHOLE object back (persist()'s real contract).
  const beforeMapWrite = await repo.tradingSessions.get(user.id, 's1');
  beforeMapWrite.analysisGraph.nodes.push({ id: 'n1', type: 'sessionEntry', source: { type: 'sessionEntry', id: 'e1' } });
  await repo.tradingSessions.upsert(user.id, beforeMapWrite);

  // Desk's own fresh read (a "remount" of the Desk tab, or the next LiveSessionView render).
  const afterMapWrite = await repo.tradingSessions.get(user.id, 's1');
  assert.equal(afterMapWrite.entries.length, 1, 'Desk\'s own entries must be untouched by a Map-only write');
  assert.equal(afterMapWrite.entries[0].id, 'e1');
  assert.equal(afterMapWrite.analysisGraph.nodes.length, 1, 'Desk\'s fresh read must see the Map\'s new node');
});

test('Desk -> canonical Session -> Map: a Desk-only write (a new entry) leaves the Map\'s own analysisGraph completely untouched, and a fresh read (simulating Map re-rendering) sees the Desk\'s change', async () => {
  const repo = createMemoryRepo();
  const user = await repo.users.create({ displayName: 'Trader' });
  await seedSession(repo, user);

  const beforeMapNode = await repo.tradingSessions.get(user.id, 's1');
  beforeMapNode.analysisGraph.nodes.push({ id: 'n1', type: 'sessionEntry', source: { type: 'sessionEntry', id: 'e1' } });
  await repo.tradingSessions.upsert(user.id, beforeMapNode);

  // A Desk mutation (e.g. addEntry('movement')): read fresh, mutate only entries, write back.
  const beforeDeskWrite = await repo.tradingSessions.get(user.id, 's1');
  beforeDeskWrite.entries.push({ id: 'e2', type: 'movement', scenarios: [] });
  await repo.tradingSessions.upsert(user.id, beforeDeskWrite);

  // Map's own fresh read.
  const afterDeskWrite = await repo.tradingSessions.get(user.id, 's1');
  assert.equal(afterDeskWrite.analysisGraph.nodes.length, 1, 'Map\'s own graph nodes must be untouched by a Desk-only write');
  assert.equal(afterDeskWrite.entries.length, 2, 'Map\'s fresh read must see the Desk\'s new entry');
});

test('remount Map after a Desk mutation: a brand-new, reference-free read (get() called with no relationship to any prior object) reflects the Desk\'s change immediately - proves the sync contract does not depend on any shared in-memory reference surviving', async () => {
  const repo = createMemoryRepo();
  const user = await repo.users.create({ displayName: 'Trader' });
  await seedSession(repo, user);
  const desk1 = await repo.tradingSessions.get(user.id, 's1');
  desk1.entries.push({ id: 'e2', type: 'movement', scenarios: [] });
  await repo.tradingSessions.upsert(user.id, desk1);

  // Simulate Map fully unmounting and remounting: a completely independent get() call, sharing
  // no JS reference with anything above.
  const mapRemount = await repo.tradingSessions.get(user.id, 's1');
  assert.equal(mapRemount.entries.length, 2);
});

test('remount Desk after a Map mutation: same independent-read proof, the other direction', async () => {
  const repo = createMemoryRepo();
  const user = await repo.users.create({ displayName: 'Trader' });
  await seedSession(repo, user);
  const map1 = await repo.tradingSessions.get(user.id, 's1');
  map1.analysisGraph.nodes.push({ id: 'n1', type: 'sessionEntry', source: { type: 'sessionEntry', id: 'e1' } });
  await repo.tradingSessions.upsert(user.id, map1);

  const deskRemount = await repo.tradingSessions.get(user.id, 's1');
  assert.equal(deskRemount.analysisGraph.nodes.length, 1);
});

test('save() (session-workspace-logic.js) dispatches the canonical-change CustomEvent exactly once per call, for either a Desk or a Map mutation - no separate/second event for Map writes', async () => {
  const workspaceLogicSrc = await readFile(path.join(root, 'public', 'pages', 'shared', 'session-workspace-logic.js'), 'utf8');
  // save() is written as a single dense line (this file's established minified-vanilla-JS
  // style - see session-workspace-logic.js's own convention) - isolate that one line rather than
  // brace-matching, which a nested `function(){}` (the .catch() callback) would cut short on.
  const saveLine = workspaceLogicSrc.split('\n').find((line) => line.includes('function save(session){'));
  assert.ok(saveLine, 'could not find the save(session) line');
  const dispatches = [...saveLine.matchAll(/dispatchEvent\(new CustomEvent\('tradejournal:sessions-changed'/g)];
  assert.equal(dispatches.length, 1, 'exactly one dispatch inside save() itself - both Desk and Map mutations funnel through this ONE function (persist() -> window.TradeJournalWorkspace.save(session)), never a Map-specific event');
  // removeSession() (whole-session delete, a different concern entirely) also dispatches this
  // event - confirmed as a real, separate, legitimate second call site, not a duplicate save()
  // path Map/Desk mutations could accidentally hit.
  const removeLine = workspaceLogicSrc.split('\n').find((line) => line.includes('function removeSession(idValue){'));
  assert.ok(removeLine && removeLine.includes("dispatchEvent(new CustomEvent('tradejournal:sessions-changed'"));
});
