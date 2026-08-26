import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Instrument Catalog domain: session-signature-engine.js's compare() is the real similarity
// engine the React SimilarSessionsPanel calls into. This is its first dedicated test file - it
// previously only had one incidental empty-library check in trade-regression.test.mjs. Exact
// instrument equality must be a hard eligibility gate (fail closed), never a score component the
// way market/city is - a BTC session must never surface as "similar" to an XAU one just because
// their city matched.

const root = process.cwd();
const source = () => readFile(path.join(root, 'public', 'pages', 'shared', 'session-signature-engine.js'), 'utf8');

async function engineSandbox() {
  const sandbox = { window: {}, Promise, Set, Math };
  vm.runInNewContext(await source(), sandbox, { filename: 'session-signature-engine.js' });
  return sandbox.window.TradeJournalSessionSignatureEngine;
}

function signature(overrides) {
  return Object.assign({
    id: 'sig-' + Math.random(), sessionId: 'session-x', character: 'hunter', market: 'London',
    instrument: 'XAUUSD', timeframe: '5m', date: '2026-01-01', movementSequence: [], patternIds: [],
    strategyIds: [], scenarioOutcomes: [], tradeSummary: { count: 0, wins: 0, losses: 0, netPnl: null },
    fateSummaryText: ''
  }, overrides || {});
}

test('same city, different instrument => no match (city is never a substitute for instrument)', async () => {
  const engine = await engineSandbox();
  const live = signature({ sessionId: 'live', market: 'London', instrument: 'XAUUSD' });
  const other = signature({ sessionId: 'other', market: 'London', instrument: 'BTCUSDT' });
  assert.equal(engine.compare(live, [other]).length, 0);
});

test('same instrument, different city => eligible (city stays a secondary score component only)', async () => {
  const engine = await engineSandbox();
  const live = signature({ sessionId: 'live', market: 'London', instrument: 'XAUUSD' });
  const other = signature({ sessionId: 'other', market: 'Tokyo', instrument: 'XAUUSD' });
  const result = engine.compare(live, [other]);
  assert.equal(result.length, 1);
  assert.equal(result[0].sessionId, 'other');
});

test('the live session has no instrument yet => no match at all, regardless of what candidates exist', async () => {
  const engine = await engineSandbox();
  const live = signature({ sessionId: 'live', instrument: null });
  const other = signature({ sessionId: 'other', instrument: 'XAUUSD' });
  assert.equal(engine.compare(live, [other]).length, 0);
});

test('a candidate with no instrument is excluded even when the live session has one - fail closed per-candidate, not just when nothing has one', async () => {
  const engine = await engineSandbox();
  const live = signature({ sessionId: 'live', instrument: 'XAUUSD' });
  const unassigned = signature({ sessionId: 'legacy', instrument: null });
  const matching = signature({ sessionId: 'match', instrument: 'XAUUSD' });
  const result = engine.compare(live, [unassigned, matching]);
  assert.deepEqual(result.map((r) => r.sessionId), ['match']);
});

test('exact instrument match scores higher when movement/pattern/strategy overlap is also present, city stays a smaller component', async () => {
  const engine = await engineSandbox();
  const live = signature({
    sessionId: 'live', market: 'London', instrument: 'XAUUSD',
    movementSequence: [{ orderIndex: 0, direction: 'up', magnitude: 'large' }],
    patternIds: ['p1'], strategyIds: ['s1']
  });
  const sameCityAndSequence = signature({
    sessionId: 'a', market: 'London', instrument: 'XAUUSD',
    movementSequence: [{ orderIndex: 0, direction: 'up', magnitude: 'large' }],
    patternIds: ['p1'], strategyIds: ['s1']
  });
  const differentCity = signature({
    sessionId: 'b', market: 'Tokyo', instrument: 'XAUUSD',
    movementSequence: [{ orderIndex: 0, direction: 'up', magnitude: 'large' }],
    patternIds: ['p1'], strategyIds: ['s1']
  });
  const result = engine.compare(live, [sameCityAndSequence, differentCity]);
  const byId = Object.fromEntries(result.map((r) => [r.sessionId, r.similarity]));
  assert.ok(byId.a > byId.b, 'the same-city match scores strictly higher (market is a real, if secondary, score component)');
  assert.ok(byId.b > 0, 'the different-city match still scores meaningfully from the exact instrument match plus sequence/pattern/strategy overlap');
});

test('the current live session itself is excluded from its own candidate list even when its instrument matches', async () => {
  const engine = await engineSandbox();
  const live = signature({ sessionId: 'live-session', instrument: 'XAUUSD' });
  const self = signature({ sessionId: 'live-session', instrument: 'XAUUSD' });
  assert.equal(engine.compare(live, [self]).length, 0);
});

test('an empty candidate library returns no matches regardless of instrument', async () => {
  const engine = await engineSandbox();
  assert.equal(engine.compare(signature({ instrument: 'XAUUSD' }), []).length, 0);
});

test('instrument comparison is case-insensitive, matching every other field this engine already normalizes case for', async () => {
  const engine = await engineSandbox();
  const live = signature({ sessionId: 'live', instrument: 'xauusd' });
  const other = signature({ sessionId: 'other', instrument: 'XAUUSD' });
  assert.equal(engine.compare(live, [other]).length, 1);
});
