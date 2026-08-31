import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Adaptive AI Session Analysis - pure, DOM-free normalization/memory/fingerprint/depth logic
// (public/pages/shared/session-analysis-schema.js). Same vm.runInContext technique
// tests/analysis-style-registry.test.mjs already uses for a plain window-global domain file.
const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = (file) => readFile(shared(file), 'utf8');

async function loadSchema() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(await source('session-analysis-schema.js'), sandbox, { filename: 'session-analysis-schema.js' });
  return sandbox.window.TradeJournalSessionAnalysisSchema;
}

test('registers window.TradeJournalSessionAnalysisSchema', async () => {
  const schema = await loadSchema();
  assert.ok(schema);
  assert.equal(typeof schema.normalizeAnalysisResult, 'function');
});

test('normalizeAnalysisResult defaults every field so a bare-minimum raw response never crashes a renderer', async () => {
  const schema = await loadSchema();
  const result = schema.normalizeAnalysisResult({}, { analysisType: 'initial', provider: 'openai', model: 'gpt-5.6' });
  assert.equal(result.thesis.headline, '');
  // .length checks, not deepEqual against a same-realm [] literal - node:assert/strict's
  // deepStrictEqual fails on structurally-identical-but-cross-realm arrays coming out of the vm
  // sandbox (a different Array.prototype than this test file's own).
  assert.equal(result.stateMetrics.length, 0);
  assert.equal(result.blocks.length, 0);
  assert.equal(result.scenarios.length, 0);
  assert.equal(result.scenarioEvaluations.length, 0);
  assert.equal(result.confidence.level, 'medium');
  assert.equal(result.memoryUpdate.currentThesis, '');
});

test('an unrecognized block type renders through the safe "custom" fallback rather than being dropped (brief §40 test 15)', async () => {
  const schema = await loadSchema();
  const result = schema.normalizeAnalysisResult({
    blocks: [{ id: 'b1', type: 'totally_unknown_type_from_a_future_model', title: 'Something new', summary: 'x' }]
  }, {});
  assert.equal(result.blocks.length, 1);
  assert.equal(result.blocks[0].type, 'custom');
  assert.equal(result.blocks[0].title, 'Something new');
});

test('an unrecognized scenario kind/direction/role/confidence falls back to a safe default, never throws', async () => {
  const schema = await loadSchema();
  const result = schema.normalizeAnalysisResult({
    scenarios: [{ localKey: 's1', title: 'X', role: 'bogus', kind: 'bogus', direction: 'bogus', confidence: 'bogus', probability: 500 }]
  }, {});
  const scenario = result.scenarios[0];
  assert.equal(scenario.role, 'primary');
  assert.equal(scenario.kind, 'custom');
  assert.equal(scenario.direction, 'neutral');
  assert.equal(scenario.confidence, 'medium');
  assert.equal(scenario.probability, 100, 'probability must be clamped into [0,100], never left out of range');
});

test('blocks/scenarios/scenarioEvaluations arrays are capped at the schema maxItems even if the raw payload has more', async () => {
  const schema = await loadSchema();
  const manyBlocks = Array.from({ length: 20 }, (_, i) => ({ id: 'b' + i, type: 'observation', title: 't' + i }));
  const manyScenarios = Array.from({ length: 10 }, (_, i) => ({ localKey: 's' + i, title: 't' + i }));
  const result = schema.normalizeAnalysisResult({ blocks: manyBlocks, scenarios: manyScenarios }, {});
  assert.equal(result.blocks.length, 8);
  assert.equal(result.scenarios.length, 3);
});

test('buildSessionMemory is a deterministic pure function - identical inputs produce identical output (brief §40 test 4)', async () => {
  const schema = await loadSchema();
  const result = schema.normalizeAnalysisResult({
    thesis: { headline: 'Buyers in control', summary: '' },
    memoryUpdate: { currentThesis: 'Bullish', marketState: 'trending', keyZones: [{ range: '100-101', label: 'decision zone' }], importantObservations: ['obs1'], recentChanges: [], watchItems: ['watch1'], unresolvedQuestions: [], compactNarrative: 'narrative' }
  }, { analysisId: 'a1', analysisType: 'initial', generatedAt: '2026-08-31T00:00:00.000Z', entryId: 'e1' });
  const liveState = { activeScenarioRefs: ['sc1'], importantPatternRefs: ['p1'] };
  const memoryA = schema.buildSessionMemory(null, result, liveState);
  const memoryB = schema.buildSessionMemory(null, result, liveState);
  assert.deepEqual(memoryA, memoryB);
  assert.equal(memoryA.eventCount, 1);
  assert.equal(memoryA.currentThesis, 'Bullish');
  assert.deepEqual(memoryA.activeScenarioRefs, ['sc1']);
});

test('buildSessionMemory increments eventCount from the previous memory rather than resetting it', async () => {
  const schema = await loadSchema();
  const result = schema.normalizeAnalysisResult({ memoryUpdate: { currentThesis: 't', compactNarrative: 'n' } }, { analysisId: 'a2', analysisType: 'update', generatedAt: '2026-08-31T01:00:00.000Z' });
  const previousMemory = { eventCount: 4, version: 1 };
  const memory = schema.buildSessionMemory(previousMemory, result, {});
  assert.equal(memory.eventCount, 5);
});

test('buildAnalysisFingerprint is deterministic and identical inputs produce the identical fingerprint (brief §40 test 6)', async () => {
  const schema = await loadSchema();
  const parts = { sessionId: 's1', entryId: 'e1', imageIdentity: 'img1', provider: 'openai', model: 'gpt-5.6', analysisType: 'initial', profileId: 'p1', profileVersion: 2, memoryVersion: 0, depth: 'auto' };
  assert.equal(schema.buildAnalysisFingerprint(parts), schema.buildAnalysisFingerprint({ ...parts }));
});

test('a different model produces a different fingerprint (brief §40 test 8)', async () => {
  const schema = await loadSchema();
  const base = { sessionId: 's1', entryId: 'e1', imageIdentity: 'img1', provider: 'openai', model: 'gpt-5.6', analysisType: 'initial' };
  assert.notEqual(schema.buildAnalysisFingerprint(base), schema.buildAnalysisFingerprint({ ...base, model: 'claude-sonnet-4-5' }));
});

test('a different Analysis Profile version produces a different fingerprint (brief §40 test 9)', async () => {
  const schema = await loadSchema();
  const base = { sessionId: 's1', entryId: 'e1', provider: 'openai', model: 'gpt-5.6', profileId: 'p1', profileVersion: 1 };
  assert.notEqual(schema.buildAnalysisFingerprint(base), schema.buildAnalysisFingerprint({ ...base, profileVersion: 2 }));
});

test('a different Session Memory version produces a different fingerprint (brief §40 test 7)', async () => {
  const schema = await loadSchema();
  const base = { sessionId: 's1', entryId: 'e1', provider: 'openai', model: 'gpt-5.6', memoryVersion: 3 };
  assert.notEqual(schema.buildAnalysisFingerprint(base), schema.buildAnalysisFingerprint({ ...base, memoryVersion: 4 }));
});

test('resolveAnalysisDepth: an explicit user choice always wins over any signal', async () => {
  const schema = await loadSchema();
  assert.equal(schema.resolveAnalysisDepth('deep', { remainingBudget: 1 }), 'deep');
  assert.equal(schema.resolveAnalysisDepth('efficient', { remainingBudget: 999999 }), 'efficient');
});

test('resolveAnalysisDepth: AUTO downgrades to efficient only when a real remaining-budget signal is low, never a fabricated one', async () => {
  const schema = await loadSchema();
  assert.equal(schema.resolveAnalysisDepth(undefined, {}), 'auto', 'no signal at all must stay auto, never guess efficient');
  assert.equal(schema.resolveAnalysisDepth(undefined, { remainingBudget: 100 }), 'efficient');
  assert.equal(schema.resolveAnalysisDepth(undefined, { remainingBudget: 500000 }), 'auto');
});

test('analysisTypeForSession: no prior memory means INITIAL, an existing memory with events means UPDATE', async () => {
  const schema = await loadSchema();
  assert.equal(schema.analysisTypeForSession({}), 'initial');
  assert.equal(schema.analysisTypeForSession({ aiSessionAnalysisResult: { memory: { eventCount: 0 } } }), 'initial');
  assert.equal(schema.analysisTypeForSession({ aiSessionAnalysisResult: { memory: { eventCount: 2 } } }), 'update');
});
