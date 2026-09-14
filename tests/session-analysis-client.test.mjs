import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Adaptive AI Session Analysis - session-analysis-client.js is the orchestration seam between the
// Session UI and the AI gateway; loaded here the same vm.runInContext way every other
// public/pages/shared browser-global file is tested in this repo, with its real dependencies
// (session-analysis-schema.js, analysis-image-prep.js) loaded alongside it and everything else
// stubbed.
const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = (file) => readFile(shared(file), 'utf8');

async function loadClient(overrides) {
  const sandbox = { window: {}, console, Date, Math, JSON, Array, Object, Number, String, Boolean, Promise };
  vm.createContext(sandbox);
  vm.runInContext(await source('session-analysis-schema.js'), sandbox, { filename: 'session-analysis-schema.js' });
  vm.runInContext(await source('analysis-image-prep.js'), sandbox, { filename: 'analysis-image-prep.js' });
  Object.assign(sandbox.window, overrides || {});
  if (overrides && overrides.fetch) sandbox.fetch = overrides.fetch;
  vm.runInContext(await source('session-analysis-client.js'), sandbox, { filename: 'session-analysis-client.js' });
  return { client: sandbox.window.TradeJournalSessionAnalysisClient, sandbox };
}

function makeScenario(patch) {
  return Object.assign({
    id: 'sc1', title: 'Bullish continuation', description: '', evidence: '', trigger: '',
    invalidationTagIds: [], invalidationNote: '', probabilityHistory: [{ value: 60, loggedAt: '2026-08-31T00:00:00.000Z' }],
    occurred: false, pattern: null
  }, patch || {});
}

test('registers window.TradeJournalSessionAnalysisClient', async () => {
  const { client } = await loadClient();
  assert.ok(client);
  assert.equal(typeof client.analyzeSession, 'function');
});

test('isScenarioActive: a real invalidationTagIds entry marks a scenario inactive (fixes the pre-existing confirmedInvalidationTagIds typo)', async () => {
  const { client } = await loadClient();
  assert.equal(client.isScenarioActive(makeScenario()), true);
  assert.equal(client.isScenarioActive(makeScenario({ invalidationTagIds: ['broke support'] })), false);
  assert.equal(client.isScenarioActive(makeScenario({ occurred: true })), false);
});

test('gatherActiveScenarios only returns genuinely active scenarios, capped at the given limit', async () => {
  const { client } = await loadClient();
  const session = {
    entries: [
      { scenarios: [makeScenario({ id: 'a' }), makeScenario({ id: 'b', occurred: true })] },
      { scenarios: [makeScenario({ id: 'c', invalidationTagIds: ['x'] }), makeScenario({ id: 'd' })] }
    ]
  };
  const active = client.gatherActiveScenarios(session, 5);
  // Array.from() called from this (outer) realm re-materializes the sandbox-realm array/elements
  // into a native one, so a plain deepEqual against a same-realm literal is meaningful again -
  // otherwise node:assert/strict's cross-realm prototype check fails even on structurally
  // identical values (same reason the schema/image-prep tests avoid deepEqual against raw
  // sandbox output).
  assert.deepEqual(Array.from(active.map((s) => s.id)).sort(), ['a', 'd']);
});

test('scenarioAlreadyAdded finds a real persisted match by analysisId + generatedScenarioKey, not by title/text', async () => {
  const { client } = await loadClient();
  const entry = { scenarios: [{ aiSource: { analysisId: 'a1', generatedScenarioKey: 'k1' } }] };
  assert.equal(client.scenarioAlreadyAdded(entry, 'a1', 'k1'), true);
  assert.equal(client.scenarioAlreadyAdded(entry, 'a1', 'k2'), false, 'a different key from the same analysis is a different scenario');
  assert.equal(client.scenarioAlreadyAdded(entry, 'a2', 'k1'), false, 'the same key from a different analysis must not count as already added');
});

test('buildScenarioDraftFromAi maps the AI proposal onto the exact existing Scenario field shape (title/description/trigger/invalidationNote/executionPlan), fully filled - never leaving problem/actionPlan blank', async () => {
  const { client } = await loadClient();
  const aiScenario = {
    localKey: 'k1', title: 'Breakout continuation', summary: 'Price breaks and holds above 65000', probability: 72,
    trigger: 'Close above 65000', invalidation: 'Close below 64500', direction: 'long',
    evidenceFor: ['strong volume'], evidenceAgainst: ['thin liquidity above 65000'],
    confirmations: ['higher low forms', 'break of the last swing high'],
    confidence: 'medium', kind: 'breakout', role: 'primary'
  };
  const entry = { id: 'e1', scenarios: [] };
  const draft = client.buildScenarioDraftFromAi(aiScenario, { newId: 'sc-new', entry, analysisId: 'a1', provider: 'openai', model: 'gpt-5.6' });
  assert.equal(draft.id, 'sc-new');
  assert.equal(draft.entryId, 'e1');
  assert.equal(draft.title, 'Breakout continuation');
  assert.equal(draft.trigger, 'Close above 65000');
  assert.equal(draft.invalidationNote, 'Close below 64500');
  assert.equal(draft.executionPlan.positionType, 'Long');
  // Production feedback: "everything should be filled" - problem (the scenario's own weakness/
  // risk field) comes from evidenceAgainst, and executionPlan.actionPlan (execution guidance) from
  // confirmations - both were previously left as empty strings forever.
  assert.match(draft.problem, /thin liquidity above 65000/);
  assert.match(draft.executionPlan.actionPlan, /higher low forms/);
  assert.match(draft.executionPlan.actionPlan, /break of the last swing high/);
  assert.equal(draft.probabilityHistory.length, 1);
  assert.equal(draft.probabilityHistory[0].value, 72);
  assert.equal(draft.occurred, false);
  assert.equal(draft.pattern, null, 'the AI must never create a Pattern Registry record on its own (brief §21)');
  assert.equal(draft.aiSource.generatedScenarioKey, 'k1');
  assert.equal(draft.aiSource.analysisId, 'a1');
});

test('applyScenarioEvaluationPatch appends to probabilityHistory rather than overwriting it (brief §40 test 19)', async () => {
  const { client } = await loadClient();
  const scenario = makeScenario({ probabilityHistory: [{ value: 50, loggedAt: '2026-08-30T00:00:00.000Z' }] });
  const patch = client.applyScenarioEvaluationPatch(scenario, {
    status: 'strengthened', newProbability: 78, whatHappened: 'retest held', confirmedBy: ['retest'], contradictedBy: [], remainsUnresolved: [], triggerOccurred: true, invalidationOccurred: false
  });
  assert.equal(patch.probabilityHistory.length, 2, 'the prior entry must still be present');
  assert.equal(patch.probabilityHistory[0].value, 50);
  assert.equal(patch.probabilityHistory[1].value, 78);
  assert.equal(patch.status, 'strengthened');
  assert.equal(patch.occurred, false, 'only a confirmed status marks the scenario occurred');
});

test('applyScenarioEvaluationPatch marks occurred=true only when status becomes confirmed', async () => {
  const { client } = await loadClient();
  const scenario = makeScenario();
  const patch = client.applyScenarioEvaluationPatch(scenario, { status: 'confirmed', newProbability: 95, whatHappened: '', confirmedBy: [], contradictedBy: [], remainsUnresolved: [], triggerOccurred: true, invalidationOccurred: false });
  assert.equal(patch.occurred, true);
});

test('analyzeSession makes zero network calls and returns MODEL_VISION_UNSUPPORTED when the chosen model cannot see the chart image (brief §40 test 13)', async () => {
  let fetchCalls = 0;
  const { client } = await loadClient({
    fetch: async () => { fetchCalls += 1; return { ok: true, json: async () => ({}) }; },
    TradeJournalAISettingsStore: { capabilitiesFor: () => ({ supportsVision: false }), getKey: () => '' }
  });
  const session = { id: 's1', entries: [{ id: 'e1', type: 'chart', hasImage: true, imageUrl: '/uploads/session/x.png', scenarios: [] }] };
  const outcome = await client.analyzeSession({ session, entry: session.entries[0], provider: 'deepseek', model: 'deepseek-chat' });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.error, 'MODEL_VISION_UNSUPPORTED');
  assert.equal(fetchCalls, 0, 'a vision-unsupported rejection must never reach the network');
});

test('analyzeSession resolves from cache with zero network calls when the fingerprint matches (brief §40 test 6, §42.O)', async () => {
  let fetchCalls = 0;
  const { client, sandbox } = await loadClient({
    fetch: async () => { fetchCalls += 1; return { ok: true, json: async () => ({}) }; },
    TradeJournalAISettingsStore: { capabilitiesFor: () => ({ supportsVision: true }), getKey: () => '' }
  });
  const schema = sandbox.window.TradeJournalSessionAnalysisSchema;
  const entry = { id: 'e1', type: 'chart', imageUrl: '/uploads/session/x.png', scenarios: [] };
  const session = { id: 's1', entries: [entry] };
  const fingerprint = schema.buildAnalysisFingerprint({ sessionId: 's1', entryId: 'e1', imageIdentity: '/uploads/session/x.png', provider: 'openai', model: 'gpt-5.6-luna', analysisType: 'initial', profileId: null, profileVersion: 0, memoryVersion: 0, depth: 'auto' });
  entry.aiAnalysisResult = { fingerprint, thesis: { headline: 'cached', summary: '' } };
  const outcome = await client.analyzeSession({ session, entry, provider: 'openai', model: 'gpt-5.6-luna', analysisType: 'initial' });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.cached, true);
  assert.equal(outcome.result.thesis.headline, 'cached');
  assert.equal(fetchCalls, 0, 'a cache hit must never reach the network');
});

test('computeAnalysisPatches derives entry + session patches, and Session Memory eventCount grows across calls', async () => {
  const { client, sandbox } = await loadClient();
  const schema = sandbox.window.TradeJournalSessionAnalysisSchema;
  const session = { id: 's1', entries: [{ id: 'e1', scenarios: [] }] };
  const result1 = schema.normalizeAnalysisResult({ thesis: { headline: 'first', summary: '' } }, { analysisId: 'a1', entryId: 'e1', analysisType: 'initial', generatedAt: '2026-08-31T00:00:00.000Z' });
  const patches1 = client.computeAnalysisPatches(session, result1);
  assert.equal(patches1.entryPatch.aiAnalysisResult.thesis.headline, 'first');
  assert.equal(patches1.sessionPatch.aiSessionAnalysisResult.memory.eventCount, 1);

  session.aiSessionAnalysisResult = patches1.sessionPatch.aiSessionAnalysisResult;
  const result2 = schema.normalizeAnalysisResult({ thesis: { headline: 'second', summary: '' } }, { analysisId: 'a2', entryId: 'e1', analysisType: 'update', generatedAt: '2026-08-31T01:00:00.000Z' });
  const patches2 = client.computeAnalysisPatches(session, result2);
  assert.equal(patches2.sessionPatch.aiSessionAnalysisResult.memory.eventCount, 2);
});

test('findCachedVisualization only matches when the fingerprint is identical', async () => {
  const { client } = await loadClient();
  const scenario = { aiVisualization: { status: 'ready', fingerprint: 'viz|e1|sc1|a1|img1' } };
  assert.ok(client.findCachedVisualization(scenario, 'viz|e1|sc1|a1|img1'));
  assert.equal(client.findCachedVisualization(scenario, 'viz|e1|sc1|a1|img2'), null);
});

// Production bug (2026-09-01): a proposed AI scenario's own generated image "disappeared again"
// after the card/popup that made the call was closed and reopened - runVisualizeAiScenario()
// (liveSessionView.jsx) already persisted it correctly onto the real, added Scenario, but nothing
// displaying result.scenarios[] (keyed by localKey - a real Scenario has no such field) ever
// cross-referenced that real Scenario, only ephemeral per-mount React state.
test('hydrateScenarioVisualizations finds the real, already-added Scenario for a proposal (matched by aiSource.analysisId + generatedScenarioKey) and returns its persisted aiVisualization', async () => {
  const { client } = await loadClient();
  const result = { analysisId: 'a1', scenarios: [{ localKey: 'k1' }, { localKey: 'k2' }] };
  const entry = {
    scenarios: [
      { id: 'real-sc-1', aiSource: { analysisId: 'a1', generatedScenarioKey: 'k1' }, aiVisualization: { status: 'ready', imageDataUrl: '/uploads/session/x.png' } },
      // k2's real scenario was added but never visualized - must not appear in the map at all.
      { id: 'real-sc-2', aiSource: { analysisId: 'a1', generatedScenarioKey: 'k2' } },
      // A scenario from a DIFFERENT, earlier analysis must never be matched by key alone.
      { id: 'real-sc-3', aiSource: { analysisId: 'a0', generatedScenarioKey: 'k1' }, aiVisualization: { status: 'ready', imageDataUrl: '/uploads/session/wrong.png' } }
    ]
  };
  const map = client.hydrateScenarioVisualizations(entry, result);
  assert.equal(map.k1.imageDataUrl, '/uploads/session/x.png');
  assert.equal('k2' in map, false);
});

test('hydrateScenarioVisualizations returns an empty map when the entry or result is missing (never throws)', async () => {
  const { client } = await loadClient();
  assert.deepEqual(Object.keys(client.hydrateScenarioVisualizations(null, { scenarios: [] })), []);
  assert.deepEqual(Object.keys(client.hydrateScenarioVisualizations({ scenarios: [] }, null)), []);
});

// Production incident: a generated image's raw base64 was previously embedded directly on the
// visualization object - the next whole-session save then hung indefinitely trying to push a
// multi-MB inline blob. visualizeScenario()/visualizeAnalysis() now upload the generated image
// through the same /api/sync/sessions/images endpoint an entry's own original chart already uses,
// and persist only the small returned URL - see uploadGeneratedImage()'s own comment.
function mockVisualizeFetch(visualizeUrlFragment) {
  return async (url) => {
    if (String(url).includes('/api/sync/sessions/images')) {
      return { ok: true, json: async () => ({ url: '/uploads/session/generated-x.png' }) };
    }
    if (String(url).includes(visualizeUrlFragment)) {
      return { ok: true, json: async () => ({ data: { imageDataUrl: 'data:image/png;base64,AAAA' }, provider: 'openai', model: 'gpt-image-2', usage: null }) };
    }
    throw new Error('unexpected fetch: ' + url);
  };
}

test('visualizeScenario uploads the generated image (never persists raw base64) and is cached - a second call with the same fingerprint makes no network request (brief §40 test 22)', async () => {
  let fetchCalls = 0;
  const { client } = await loadClient({
    fetch: async (url) => { fetchCalls += 1; return mockVisualizeFetch('/api/sessions/visualize-scenario')(url); },
    TradeJournalAISettingsStore: { capabilitiesFor: () => ({ supportsVision: true }), getKey: () => '' },
    TradeJournalAnalysisImagePrep: { prepareForTransport: async () => 'data:image/png;base64,BBBB' }
  });
  const entry = { id: 'e1', imageUrl: '/uploads/session/x.png' };
  const scenario = { localKey: 'k1', visualizationBrief: { primaryPath: [], alternativePath: [], triggerZone: '', invalidationZone: '', targetZones: [], narrative: '' } };
  const first = await client.visualizeScenario({ entry, scenario, analysisId: 'a1', visualizationBrief: scenario.visualizationBrief });
  assert.equal(first.ok, true);
  assert.equal(first.visualization.imageDataUrl, '/uploads/session/generated-x.png');
  assert.equal(fetchCalls, 2, 'one call to visualize-scenario, one to upload the generated image');
  scenario.aiVisualization = first.visualization;
  const second = await client.visualizeScenario({ entry, scenario, analysisId: 'a1', visualizationBrief: scenario.visualizationBrief });
  assert.equal(second.ok, true);
  assert.equal(second.cached, true);
  assert.equal(fetchCalls, 2, 'a cached visualization must never trigger a second paid call');
});

test('visualizeScenario fails outright (VISUALIZATION_SAVE_FAILED) rather than silently keeping the raw base64 when the image upload fails', async () => {
  const { client } = await loadClient({
    fetch: async (url) => {
      if (String(url).includes('/api/sync/sessions/images')) return { ok: false, status: 413 };
      return { ok: true, json: async () => ({ data: { imageDataUrl: 'data:image/png;base64,AAAA' }, provider: 'openai', model: 'gpt-image-2', usage: null }) };
    },
    TradeJournalAISettingsStore: { capabilitiesFor: () => ({ supportsVision: true }), getKey: () => '' },
    TradeJournalAnalysisImagePrep: { prepareForTransport: async () => 'data:image/png;base64,BBBB' }
  });
  const entry = { id: 'e1', imageUrl: '/uploads/session/x.png' };
  const scenario = { localKey: 'k1', visualizationBrief: {} };
  const result = await client.visualizeScenario({ entry, scenario, analysisId: 'a1', visualizationBrief: scenario.visualizationBrief });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'VISUALIZATION_SAVE_FAILED');
});

// Analysis Map (2026-08-31 follow-up) - same tool as Scenario Map above, drawing the whole
// analysis (every key zone + the primary scenario's path) instead of one scenario at a time.
// Caches on entry.aiAnalysisResult.wholeVisualization rather than scenario.aiVisualization, since
// there is no single scenario to attach a whole-analysis overlay to.

test('buildAnalysisSnapshot gathers zones from every key_zones-type block (not just the first) and only the PRIMARY-role scenario\'s own visualizationBrief', async () => {
  const { client } = await loadClient();
  const analysisResult = {
    thesis: { headline: 'Sellers in control' },
    blocks: [
      { type: 'key_zones', zones: [{ range: '100-105', label: 'Support' }] },
      { type: 'observation', zones: [] },
      { type: 'key_zones', zones: [{ range: '110-115', label: 'Resistance' }] }
    ],
    scenarios: [
      { role: 'alternative', localKey: 'alt', visualizationBrief: { primaryPath: ['X'] } },
      { role: 'primary', localKey: 'p1', visualizationBrief: { primaryPath: ['A', 'B'], triggerZone: 'below 100' } }
    ]
  };
  const snapshot = client.buildAnalysisSnapshot(analysisResult);
  assert.equal(snapshot.thesisHeadline, 'Sellers in control');
  assert.equal(snapshot.keyZones.length, 2);
  // vm.runInContext realm: Array.from() re-materializes into the native realm before comparing,
  // since node:assert/strict's deepEqual fails on structurally-identical-but-cross-realm arrays.
  assert.deepEqual(Array.from(snapshot.keyZones, (z) => z.range), ['100-105', '110-115']);
  assert.equal(snapshot.primaryScenario.triggerZone, 'below 100');
  assert.deepEqual(Array.from(snapshot.primaryScenario.primaryPath), ['A', 'B']);
});

test('findCachedAnalysisVisualization only matches when the fingerprint is identical', async () => {
  const { client } = await loadClient();
  const entry = { id: 'e1', aiAnalysisResult: { wholeVisualization: { status: 'ready', fingerprint: 'viz-analysis|e1|a1|img1' } } };
  assert.ok(client.findCachedAnalysisVisualization(entry, 'viz-analysis|e1|a1|img1'));
  assert.equal(client.findCachedAnalysisVisualization(entry, 'viz-analysis|e1|a1|img2'), null);
});

test('visualizeAnalysis uploads the generated image (never persists raw base64) and is cached - a second call with the same fingerprint makes no network request', async () => {
  let fetchCalls = 0;
  const { client } = await loadClient({
    fetch: async (url) => { fetchCalls += 1; return mockVisualizeFetch('/api/sessions/visualize-analysis')(url); },
    TradeJournalAISettingsStore: { capabilitiesFor: () => ({ supportsVision: true }), getKey: () => '' },
    TradeJournalAnalysisImagePrep: { prepareForTransport: async () => 'data:image/png;base64,BBBB' }
  });
  const entry = { id: 'e1', imageUrl: '/uploads/session/x.png' };
  const analysisResult = { analysisId: 'a1', thesis: { headline: 'h' }, blocks: [], scenarios: [] };
  const first = await client.visualizeAnalysis({ entry, analysisResult });
  assert.equal(first.ok, true);
  assert.equal(first.visualization.imageDataUrl, '/uploads/session/generated-x.png');
  assert.equal(fetchCalls, 2, 'one call to visualize-analysis, one to upload the generated image');
  entry.aiAnalysisResult = { wholeVisualization: first.visualization };
  const second = await client.visualizeAnalysis({ entry, analysisResult });
  assert.equal(second.ok, true);
  assert.equal(second.cached, true);
  assert.equal(fetchCalls, 2, 'a cached visualization must never trigger a second paid call');
});

// ---- Session / Analysis Desk AI upgrade ------------------------------------------------------

test('gatherPendingNotes: an unreviewed note is sent once, a reviewed-and-unchanged note is omitted, and an edited note re-enters context', async () => {
  const { client, sandbox } = await loadClient();
  const schema = sandbox.window.TradeJournalSessionAnalysisSchema;
  const session = { entries: [{ id: 'e1', note: 'liquidity grab below 100' }, { id: 'e2', movementNote: 'spiked and reversed' }] };
  const fresh = client.gatherPendingNotes(session, null);
  assert.equal(fresh.length, 2);

  const revision = schema.noteRevision('liquidity grab below 100');
  const memory = { noteReceipts: [{ entryId: 'e1', field: 'note', revision }] };
  const afterReview = client.gatherPendingNotes(session, memory);
  assert.equal(afterReview.length, 1, 'the reviewed, unchanged note must be omitted');
  assert.equal(afterReview[0].entryId, 'e2');

  session.entries[0].note = 'liquidity grab below 100, now retested';
  const afterEdit = client.gatherPendingNotes(session, memory);
  assert.equal(afterEdit.length, 2, 'an edited note must become eligible again even though entryId+field was previously reviewed');
});

test('gatherOpenUnresolvedItems only returns open/partially_resolved items, never resolved/superseded ones', async () => {
  const { client } = await loadClient();
  const memory = { unresolvedItems: [{ id: 'u1', status: 'open' }, { id: 'u2', status: 'resolved' }, { id: 'u3', status: 'partially_resolved' }, { id: 'u4', status: 'superseded' }] };
  const open = client.gatherOpenUnresolvedItems(memory);
  assert.deepEqual(Array.from(open.map((i) => i.id)).sort(), ['u1', 'u3']);
});

test('gatherDeferredScenarios reports every eligible active scenario NOT included, never silently dropping them', async () => {
  const { client } = await loadClient();
  const session = { entries: [{ scenarios: [makeScenario({ id: 'a' }), makeScenario({ id: 'b' }), makeScenario({ id: 'c', occurred: true })] }] };
  const deferred = client.gatherDeferredScenarios(session, ['a']);
  assert.deepEqual(Array.from(deferred.map((d) => d.id)), ['b'], 'occurred scenario c is not active at all, and included scenario a must not reappear as deferred');
});

test('canonicalEntryImages normalizes a legacy single-image entry into a one-item array, and caps a real images[] array at 4', async () => {
  const { client } = await loadClient();
  const legacy = client.canonicalEntryImages({ id: 'e1', imageUrl: '/uploads/x.png', timeframe: '5m' });
  assert.equal(legacy.length, 1);
  assert.equal(legacy[0].id, 'e1:primary');
  assert.equal(legacy[0].timeframe, '5m');

  const multi = { id: 'e2', images: Array.from({ length: 6 }, (_, i) => ({ id: 'img' + i, imageUrl: '/u/' + i + '.png', timeframe: '5m' })) };
  const resolved = client.canonicalEntryImages(multi);
  assert.equal(resolved.length, 4, 'at most MAX_TIMEFRAME_IMAGES images are ever used for one analysis call');
});

test('computeAnalysisPatches folds every returned scenario evaluation into a real patch against its own persisted Scenario, using the exact same applyScenarioEvaluationPatch', async () => {
  const { client, sandbox } = await loadClient();
  const schema = sandbox.window.TradeJournalSessionAnalysisSchema;
  const scenario = makeScenario({ id: 'sc1' });
  const session = { id: 's1', entries: [{ id: 'e1', scenarios: [scenario] }] };
  const result = schema.normalizeAnalysisResult({
    thesis: { headline: 'update', summary: '' },
    scenarioEvaluations: [{ scenarioId: 'sc1', status: 'strengthened', newProbability: 72, whatHappened: 'retest held', confirmedBy: ['retest'], contradictedBy: [], remainsUnresolved: [], triggerOccurred: true, invalidationOccurred: false }]
  }, { analysisId: 'a1', entryId: 'e1', analysisType: 'update', provider: 'openai', model: 'gpt-5.6' });
  const patches = client.computeAnalysisPatches(session, result);
  assert.equal(patches.scenarioPatches.length, 1);
  assert.equal(patches.scenarioPatches[0].scenarioId, 'sc1');
  assert.equal(patches.scenarioPatches[0].entryId, 'e1');
  assert.equal(patches.scenarioPatches[0].patch.probabilityHistory.length, 2, 'must append, never overwrite');
  assert.equal(patches.scenarioPatches[0].patch.probabilityHistory[1].value, 72);
  assert.equal(patches.scenarioPatches[0].patch.evaluationHistory[0].analysisId, 'a1');
});

test('computeAnalysisPatches persists compact note receipts (no raw text) and drops a noteFeedback item whose noteRef was never actually sent - re-derived from (session, previousMemory), not trusted from the caller', async () => {
  const { client, sandbox } = await loadClient();
  const schema = sandbox.window.TradeJournalSessionAnalysisSchema;
  const session = { id: 's1', entries: [{ id: 'e1', note: 'x' }] };
  const realRevision = schema.noteRevision('x');
  const result = schema.normalizeAnalysisResult({
    thesis: { headline: 't', summary: '' },
    noteFeedback: [
      { noteRef: { entryId: 'e1', field: 'note', revision: realRevision }, verdict: 'supported', evidence: 'held the level' },
      { noteRef: { entryId: 'e1', field: 'note', revision: 'HALLUCINATED' }, verdict: 'supported', evidence: 'fabricated' }
    ]
  }, { analysisId: 'a1', entryId: 'e1', analysisType: 'initial' });
  const patches = client.computeAnalysisPatches(session, result);
  const receipts = patches.sessionPatch.aiSessionAnalysisResult.memory.noteReceipts;
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].revision, realRevision);
  assert.equal(JSON.stringify(receipts[0]).includes('held the level'), false, 'a receipt must never carry the raw note/feedback text');
});

test('computeAnalysisPatches carries forward open unresolved items and folds this analysis\' own returned items by id', async () => {
  const { client, sandbox } = await loadClient();
  const schema = sandbox.window.TradeJournalSessionAnalysisSchema;
  const session = { id: 's1', aiSessionAnalysisResult: { memory: { unresolvedItems: [{ id: 'u1', status: 'open', description: 'needs 1m chart' }] } }, entries: [{ id: 'e1', scenarios: [] }] };
  const result = schema.normalizeAnalysisResult({
    thesis: { headline: 't', summary: '' },
    unresolvedItems: [{ id: 'u1', status: 'resolved', description: 'confirmed on the 1m chart' }, { id: 'u2', status: 'open', description: 'still needs volume confirmation' }]
  }, { analysisId: 'a2', entryId: 'e1', analysisType: 'update' });
  const patches = client.computeAnalysisPatches(session, result);
  const items = patches.sessionPatch.aiSessionAnalysisResult.memory.unresolvedItems;
  const byId = {}; items.forEach((i) => { byId[i.id] = i; });
  assert.equal(byId.u1.status, 'resolved');
  assert.equal(byId.u2.status, 'open');
});

test('visualizeAnalysis fails outright (VISUALIZATION_SAVE_FAILED) rather than silently keeping the raw base64 when the image upload fails', async () => {
  const { client } = await loadClient({
    fetch: async (url) => {
      if (String(url).includes('/api/sync/sessions/images')) return { ok: false, status: 413 };
      return { ok: true, json: async () => ({ data: { imageDataUrl: 'data:image/png;base64,AAAA' }, provider: 'openai', model: 'gpt-image-2', usage: null }) };
    },
    TradeJournalAISettingsStore: { capabilitiesFor: () => ({ supportsVision: true }), getKey: () => '' },
    TradeJournalAnalysisImagePrep: { prepareForTransport: async () => 'data:image/png;base64,BBBB' }
  });
  const entry = { id: 'e1', imageUrl: '/uploads/session/x.png' };
  const analysisResult = { analysisId: 'a1', thesis: { headline: 'h' }, blocks: [], scenarios: [] };
  const result = await client.visualizeAnalysis({ entry, analysisResult });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'VISUALIZATION_SAVE_FAILED');
});
