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

// ---- Session / Analysis Desk AI upgrade ------------------------------------------------------

test('noteRevision is deterministic and changes when the note text changes', async () => {
  const schema = await loadSchema();
  assert.equal(schema.noteRevision('liquidity grab below 100'), schema.noteRevision('liquidity grab below 100'));
  assert.notEqual(schema.noteRevision('liquidity grab below 100'), schema.noteRevision('liquidity grab below 101'));
});

test('calibratedActiveProbability floors a still-viable value at 10 and never rounds off a legitimate precise estimate', async () => {
  const schema = await loadSchema();
  assert.equal(schema.calibratedActiveProbability(2), 10, 'a meaningless single-digit % must be floored, never left as 2%');
  assert.equal(schema.calibratedActiveProbability(4), 10);
  assert.equal(schema.calibratedActiveProbability(78), 78, 'a precise model estimate must not be forced onto a multiple of 5');
  assert.equal(schema.calibratedActiveProbability(500), 100);
  assert.equal(schema.calibratedActiveProbability(undefined), 50);
});

test('normalizeUnresolvedItem: a structured item keeps its id/status/action, a legacy plain string degrades to an open item with no id continuity', async () => {
  const schema = await loadSchema();
  const structured = schema.normalizeUnresolvedItem({ id: 'u1', status: 'partially_resolved', description: 'Needs a 1m confirmation', whyItMatters: 'entry timing', missingEvidence: '1m chart', action: 'Upload a 1-minute chart' });
  assert.equal(structured.id, 'u1');
  assert.equal(structured.status, 'partially_resolved');
  assert.equal(structured.action, 'Upload a 1-minute chart');
  assert.equal(structured.legacy, false);
  const legacy = schema.normalizeUnresolvedItem('Unclear whether volume confirms the breakout');
  assert.equal(legacy.status, 'open');
  assert.equal(legacy.description, 'Unclear whether volume confirms the breakout');
  assert.equal(legacy.legacy, true);
});

test('normalizeAnalysisResult continues to support legacy stored string unknowns safely by mapping them into unresolvedItems', async () => {
  const schema = await loadSchema();
  const result = schema.normalizeAnalysisResult({ unknowns: ['Volume unclear', 'No higher-timeframe context'] }, {});
  assert.equal(result.unresolvedItems.length, 2);
  assert.equal(result.unresolvedItems[0].description, 'Volume unclear');
  assert.equal(result.unresolvedItems[0].status, 'open');
  assert.equal(result.unknowns.length, 2, 'the raw legacy field itself is still preserved untouched');
});

test('normalizeAnalysisResult prefers a fresh structured unresolvedItems response over legacy unknowns when both are present', async () => {
  const schema = await loadSchema();
  const result = schema.normalizeAnalysisResult({
    unknowns: ['ignored legacy text'],
    unresolvedItems: [{ id: 'u1', status: 'resolved', description: 'Confirmed on the 1m chart', action: '' }]
  }, {});
  assert.equal(result.unresolvedItems.length, 1);
  assert.equal(result.unresolvedItems[0].id, 'u1');
  assert.equal(result.unresolvedItems[0].status, 'resolved');
});

test('normalizeNoteFeedback defaults a missing verdict to insufficient_evidence and keeps the exact noteRef triple', async () => {
  const schema = await loadSchema();
  const feedback = schema.normalizeNoteFeedback({ noteRef: { entryId: 'e1', field: 'note', revision: 'abc' }, evidence: 'price held the level' });
  assert.equal(feedback.verdict, 'insufficient_evidence');
  assert.equal(feedback.noteRef.entryId, 'e1');
  assert.equal(feedback.noteRef.field, 'note');
  assert.equal(feedback.noteRef.revision, 'abc');
});

test('normalizeRequestResponse defaults every field to an empty string so the card can hide an all-empty section', async () => {
  const schema = await loadSchema();
  const empty = schema.normalizeRequestResponse(null);
  assert.equal(empty.requested, '');
  assert.equal(empty.answer, '');
  const filled = schema.normalizeRequestResponse({ requested: 'liquidity zones', analyzed: 'the visible chart', answer: 'a sweep sits above 65200', limitation: 'no volume profile supplied' });
  assert.equal(filled.answer, 'a sweep sits above 65200');
});

test('normalizeTimeframeAnalysis defaults trend/momentum safely and caps keyEvidence', async () => {
  const schema = await loadSchema();
  const tf = schema.normalizeTimeframeAnalysis({ imageId: 'img1', timeframe: '15m', trend: 'bogus', momentum: 'bogus', keyEvidence: ['a', 'b', 'c', 'd', 'e', 'f'] });
  assert.equal(tf.imageId, 'img1');
  assert.equal(tf.trend, 'unclear');
  assert.equal(tf.momentum, 'unclear');
  assert.equal(tf.keyEvidence.length, 5);
});

test('isScenarioActiveState treats status===invalidated or a latest probability of 0 as inactive', async () => {
  const schema = await loadSchema();
  const base = { occurred: false, invalidationTagIds: [], probabilityHistory: [{ value: 40 }] };
  assert.equal(schema.isScenarioActiveState(base), true);
  assert.equal(schema.isScenarioActiveState({ ...base, status: 'invalidated' }), false);
  assert.equal(schema.isScenarioActiveState({ ...base, probabilityHistory: [{ value: 0 }] }), false);
  assert.equal(schema.isScenarioActiveState({ ...base, probabilityHistory: [] }), true, 'no history yet defaults to the initial 50, still active');
});

test('applyScenarioEvaluationPatch deterministically zeroes an invalidated scenario, appends the audit trail, and never overwrites history', async () => {
  const schema = await loadSchema();
  const scenario = { probabilityHistory: [{ value: 65, loggedAt: '2026-09-01T00:00:00.000Z' }], occurred: false };
  const patch = schema.applyScenarioEvaluationPatch(scenario, {
    status: 'weakened', invalidationOccurred: true, newProbability: 30, whatHappened: 'broke below invalidation', confirmedBy: [], contradictedBy: ['closed below the line'], remainsUnresolved: []
  }, { sourceEntryId: 'e1', analysisId: 'a1', provider: 'openai', model: 'gpt-5.6' });
  assert.equal(patch.status, 'invalidated', 'invalidationOccurred forces the status regardless of the model-reported status');
  assert.equal(patch.probabilityHistory.length, 2);
  assert.equal(patch.probabilityHistory[0].value, 65, 'the prior entry is preserved, never overwritten');
  assert.equal(patch.probabilityHistory[1].value, 0, 'an invalidated scenario must deterministically become 0%, never the model-reported 30');
  assert.equal(patch.occurred, false);
  assert.equal(patch.evaluationHistory.length, 1);
  assert.equal(patch.evaluationHistory[0].previousProbability, 65);
  assert.equal(patch.evaluationHistory[0].newProbability, 0);
  assert.equal(patch.evaluationHistory[0].delta, -65);
  assert.equal(patch.evaluationHistory[0].sourceEntryId, 'e1');
  assert.equal(patch.evaluationHistory[0].analysisId, 'a1');
  assert.equal(patch.lastEvaluation.provider, 'openai');
});

test('applyScenarioEvaluationPatch calibrates a still-viable evaluation (never a meaningless single-digit %) while preserving a legitimate precise value', async () => {
  const schema = await loadSchema();
  const scenario = { probabilityHistory: [{ value: 50, loggedAt: '2026-09-01T00:00:00.000Z' }], occurred: false };
  const tiny = schema.applyScenarioEvaluationPatch(scenario, { status: 'weakened', newProbability: 3, whatHappened: '', confirmedBy: [], contradictedBy: [], remainsUnresolved: [] });
  assert.equal(tiny.probabilityHistory[1].value, 10, 'a still-active scenario must never persist a meaningless 3%');
  const precise = schema.applyScenarioEvaluationPatch(scenario, { status: 'strengthened', newProbability: 78, whatHappened: '', confirmedBy: [], contradictedBy: [], remainsUnresolved: [] });
  assert.equal(precise.probabilityHistory[1].value, 78);
});

test('buildAnalysisFingerprint changes when the user instruction, a pending note revision, active scenario state, or the unresolved revision changes', async () => {
  const schema = await loadSchema();
  const base = { sessionId: 's1', entryId: 'e1', provider: 'openai', model: 'gpt-5.6' };
  assert.notEqual(schema.buildAnalysisFingerprint(base), schema.buildAnalysisFingerprint({ ...base, userInstruction: 'check liquidity zones' }));
  assert.notEqual(schema.buildAnalysisFingerprint(base), schema.buildAnalysisFingerprint({ ...base, pendingNoteRevisions: ['e1:note:abc'] }));
  assert.notEqual(schema.buildAnalysisFingerprint(base), schema.buildAnalysisFingerprint({ ...base, activeScenarioState: ['sc1:pending:60'] }));
  assert.notEqual(schema.buildAnalysisFingerprint(base), schema.buildAnalysisFingerprint({ ...base, unresolvedRevision: 'u1:open' }));
});

test('buildAnalysisFingerprint changes when the ordered multi-image identities/timeframes change, and a plain single-image caller keeps the exact pre-existing fingerprint shape', async () => {
  const schema = await loadSchema();
  const singleOld = schema.buildAnalysisFingerprint({ sessionId: 's1', entryId: 'e1', imageIdentity: 'img1', provider: 'openai', model: 'gpt-5.6' });
  const singleNew = schema.buildAnalysisFingerprint({ sessionId: 's1', entryId: 'e1', imageIdentity: 'img1', imageIdentities: undefined, provider: 'openai', model: 'gpt-5.6' });
  assert.equal(singleOld, singleNew, 'omitting imageIdentities must fall back to the single imageIdentity, unchanged');
  const multiA = schema.buildAnalysisFingerprint({ sessionId: 's1', entryId: 'e1', imageIdentities: ['img1:5m', 'img2:1h'], provider: 'openai', model: 'gpt-5.6' });
  const multiB = schema.buildAnalysisFingerprint({ sessionId: 's1', entryId: 'e1', imageIdentities: ['img1:5m', 'img2:4h'], provider: 'openai', model: 'gpt-5.6' });
  assert.notEqual(multiA, multiB, 'a changed timeframe label on one of the images must change the fingerprint');
});
