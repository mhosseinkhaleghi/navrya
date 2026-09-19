import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Phase 5, browser side: the client stamps every analysis with WHICH profile (and revision) it ran
// under, re-normalizes the server's mandatory-concept coverage defensively, carries the profile into the
// scenarios it produces, and the Analysis Map AI node reads the same trained profile. Same vm harness as
// tests/session-analysis-client.test.mjs.
const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = (file) => readFile(shared(file), 'utf8');
const src = async (file) => (await readFile(path.join(root, 'navrya-src', file), 'utf8')).replace(/\r\n/g, '\n');
const json = (value) => JSON.parse(JSON.stringify(value)); // cross-realm objects compare structurally, not by prototype

async function loadClient(overrides) {
  const sandbox = { window: {}, console, Date, Math, JSON, Array, Object, Number, String, Boolean, Promise };
  vm.createContext(sandbox);
  vm.runInContext(await source('session-analysis-schema.js'), sandbox, { filename: 'session-analysis-schema.js' });
  vm.runInContext(await source('analysis-image-prep.js'), sandbox, { filename: 'analysis-image-prep.js' });
  Object.assign(sandbox.window, overrides || {});
  if (overrides && overrides.fetch) sandbox.fetch = overrides.fetch;
  vm.runInContext(await source('session-analysis-client.js'), sandbox, { filename: 'session-analysis-client.js' });
  return { client: sandbox.window.TradeJournalSessionAnalysisClient, schema: sandbox.window.TradeJournalSessionAnalysisSchema };
}

const rawData = (extra) => ({ thesis: { headline: 'h', summary: '' }, stateMetrics: [], whatChanged: [], blocks: [], scenarios: [], scenarioEvaluations: [], watchItems: [], unknowns: [], whatWouldChangeView: '', confidence: { level: 'medium', reasons: [] }, memoryUpdate: {}, ...extra });
const context = (profile) => ({
  profile, primaryStyle: { id: 'price_action' }, secondaryStyles: [], focuses: [], customFocuses: [], customMethodNotes: '', requiredInputs: [],
  concepts: [{ id: 'c1', title: 'Swept liquidity levels', priority: 'mandatory' }], understanding: 'Reads structure first.'
});
const stubbed = (capture, data) => ({
  fetch: async (url, options) => { capture.body = JSON.parse(options.body); return { ok: true, json: async () => ({ data, provider: 'openai', model: 'gpt-5.6-luna', usage: null }) }; },
  TradeJournalAISettingsStore: { capabilitiesFor: () => ({ supportsVision: false }), getKey: () => '' }
});
const session = () => ({ id: 's1', entries: [{ id: 'e1', type: 'chart', scenarios: [] }] });

// ---- the schema normalizer ---------------------------------------------------------------------------------

test('normalizeAnalysisResult stamps analysisProfileRef from the meta the client passes (never from model output), and is null without a profile id', async () => {
  const { schema } = await loadClient();
  const withRef = schema.normalizeAnalysisResult({ ...rawData(), analysisProfileRef: { id: 'MODEL-FORGED', name: 'forged' } }, { analysisProfileRef: { id: 'ap-1', name: 'My SMC', revision: '3.0.abc' } });
  assert.deepEqual(json(withRef.analysisProfileRef), { id: 'ap-1', name: 'My SMC', revision: '3.0.abc' }, 'only the client-supplied meta counts - a model cannot claim a profile');
  for (const meta of [undefined, {}, { analysisProfileRef: null }, { analysisProfileRef: { name: 'no id' } }, { analysisProfileRef: 'x' }]) {
    assert.equal(schema.normalizeAnalysisResult(rawData(), meta).analysisProfileRef, null);
  }
  const long = schema.normalizeAnalysisResult(rawData(), { analysisProfileRef: { id: 'i'.repeat(200), name: 'n'.repeat(300), revision: 'r'.repeat(90) } }).analysisProfileRef;
  assert.deepEqual([long.id.length, long.name.length, long.revision.length], [64, 100, 40]);
});

test('normalizeAnalysisResult keeps the server-rebuilt conceptCoverage, defaulting every unknown status to "unaddressed" - never silently promoted to applied', async () => {
  const { schema } = await loadClient();
  const result = schema.normalizeAnalysisResult(rawData({ conceptCoverage: [
    { conceptId: 'c1', title: 'Swept liquidity levels', status: 'applied', evidence: 'Asia low swept' },
    { conceptId: 'c2', title: 'Elliott impulse count', status: 'definitely_applied', evidence: 'x' },
    { conceptId: 'c3', title: 'Weekly open', status: 'not_visible' },
    { conceptId: 'c4', title: '   ', status: 'applied' }, null, 'x'
  ] }), {});
  assert.deepEqual(json(result.conceptCoverage), [
    { conceptId: 'c1', title: 'Swept liquidity levels', status: 'applied', evidence: 'Asia low swept' },
    { conceptId: 'c2', title: 'Elliott impulse count', status: 'unaddressed', evidence: 'x' },
    { conceptId: 'c3', title: 'Weekly open', status: 'not_visible', evidence: '' }
  ]);
});

test('a legacy / no-profile result normalizes with the new fields empty: conceptCoverage [] and analysisProfileRef null', async () => {
  const { schema } = await loadClient();
  const legacy = schema.normalizeAnalysisResult(rawData(), {});
  assert.deepEqual(json(legacy.conceptCoverage), []);
  assert.equal(legacy.analysisProfileRef, null);
  assert.deepEqual(json(schema.normalizeAnalysisResult(rawData({ conceptCoverage: 'nope' }), {}).conceptCoverage), []);
});

test('coverage is capped at 40 rows and each row\'s text is bounded', async () => {
  const { schema } = await loadClient();
  const many = Array.from({ length: 90 }, (_, i) => ({ conceptId: 'c' + i, title: 'T' + i, status: 'applied', evidence: 'e'.repeat(900) }));
  const out = schema.normalizeAnalysisResult(rawData({ conceptCoverage: many }), {}).conceptCoverage;
  assert.equal(out.length, 40);
  assert.equal(out[0].evidence.length, 400);
});

// ---- the client: request body + result stamping ----------------------------------------------------------------------

test('analyzeSession sends the profile id and revision as its CLAIM in the request body, and stamps the returned result with the same ref', async () => {
  const capture = {};
  const { client } = await loadClient(stubbed(capture, rawData({ conceptCoverage: [{ conceptId: 'c1', title: 'Swept liquidity levels', status: 'applied', evidence: 'seen' }] })));
  const outcome = await client.analyzeSession({ session: session(), entry: session().entries[0], provider: 'openai', model: 'gpt-5.6-luna', analysisType: 'initial', profileId: 'ap-1',
    analysisContext: context({ id: 'ap-1', name: 'My SMC', registryVersion: 1, revision: 'abc123' }), adherence: 'balanced' });
  assert.equal(capture.body.analysisProfileId, 'ap-1');
  assert.equal(capture.body.analysisProfileRevision, 'abc123');
  assert.deepEqual(json(outcome.result.analysisProfileRef), { id: 'ap-1', name: 'My SMC', revision: 'abc123' });
  assert.equal(outcome.result.conceptCoverage[0].status, 'applied');
});

test('an analysis run with NO profile sends null attribution and produces a result with no ref and no coverage', async () => {
  const capture = {};
  const { client } = await loadClient(stubbed(capture, rawData()));
  const outcome = await client.analyzeSession({ session: session(), entry: session().entries[0], provider: 'openai', model: 'gpt-5.6-luna', analysisType: 'initial' });
  assert.equal(capture.body.analysisProfileId, null);
  assert.equal(capture.body.analysisProfileRevision, null);
  assert.equal(outcome.result.analysisProfileRef, null);
  assert.deepEqual(json(outcome.result.conceptCoverage), []);
});

test('editing the profile changes the revision, which changes the cache fingerprint AND the attribution stamp of the next run', async () => {
  const captures = [];
  const { client } = await loadClient({
    fetch: async (url, options) => { captures.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ data: rawData(), provider: 'openai', model: 'gpt-5.6-luna', usage: null }) }; },
    TradeJournalAISettingsStore: { capabilitiesFor: () => ({ supportsVision: false }), getKey: () => '' }
  });
  const run = (revision) => client.analyzeSession({ session: session(), entry: session().entries[0], provider: 'openai', model: 'gpt-5.6-luna', analysisType: 'initial', profileId: 'ap-1',
    analysisContext: context({ id: 'ap-1', name: 'P', registryVersion: 1, revision }), adherence: 'balanced', forceRegenerate: true });
  const before = await run('rev-1');
  const after = await run('rev-2');
  assert.deepEqual([captures[0].analysisProfileRevision, captures[1].analysisProfileRevision], ['rev-1', 'rev-2']);
  assert.notEqual(before.result.fingerprint, after.result.fingerprint);
  assert.deepEqual([before.result.analysisProfileRef.revision, after.result.analysisProfileRef.revision], ['rev-1', 'rev-2']);
});

// ---- scenario provenance -------------------------------------------------------------------------------------------------

test('a scenario created from an analysis records which profile produced it in aiSource.analysisProfileId (null when there was none)', async () => {
  const { client } = await loadClient();
  const aiScenario = { localKey: 'k1', title: 'Bullish', summary: '', evidenceFor: [], evidenceAgainst: [], confirmations: [], probability: 60, direction: 'long', kind: 'directional', role: 'primary', confidence: 'medium', visualizationBrief: '' };
  const entry = { id: 'e1', scenarios: [] };
  const stamped = client.buildScenarioDraftFromAi(aiScenario, { newId: 'sc-1', entry, analysisId: 'a1', provider: 'openai', model: 'm', analysisProfileId: 'ap-1' });
  assert.equal(stamped.aiSource.analysisProfileId, 'ap-1');
  const plain = client.buildScenarioDraftFromAi(aiScenario, { newId: 'sc-2', entry, analysisId: 'a1', provider: 'openai', model: 'm' });
  assert.equal(plain.aiSource.analysisProfileId, null);
});

test('all three add-scenario call sites pass the analysis result\'s profile id into addAiScenario, and addAiScenario forwards it to the draft builder', async () => {
  const live = await src('liveSessionView.jsx');
  const modal = await src('sessionAiAnalysisModal.jsx');
  assert.match(live, /onAddAiScenario\(aiScenario, \{ entry, analysisId: result\.analysisId, provider: result\.provider, model: result\.model, analysisProfileId: result\.analysisProfileRef \? result\.analysisProfileRef\.id : null \}\)/);
  assert.match(live, /analysisId: latest\.analysisId, provider: latest\.provider, model: latest\.model, analysisProfileId: latest\.analysisProfileRef \? latest\.analysisProfileRef\.id : null/);
  assert.match(modal, /analysisProfileId: analysisResult\.analysisProfileRef \? analysisResult\.analysisProfileRef\.id : null/);
  assert.match(live, /analysisProfileId: ctx\.analysisProfileId \|\| null/);
});

// ---- the Analysis Map AI node reads the SAME trained profile -----------------------------------------------------------------

async function loadGraphContext() {
  const sandbox = { window: {}, console, Date, Math, JSON };
  vm.createContext(sandbox);
  vm.runInContext(await source('analysis-graph-ai-context.js'), sandbox, { filename: 'analysis-graph-ai-context.js' });
  return sandbox.window.TradeJournalAnalysisGraphAiContext || Object.values(sandbox.window).find((v) => v && typeof v.pickAnalysisProfileForAi === 'function');
}

test('the Analysis Map AI node\'s profile picker carries the trained fields (customFocuses, concepts, understanding) - it used to ignore everything the trader taught', async () => {
  const graph = await loadGraphContext();
  const picked = json(graph.pickAnalysisProfileForAi(context({ id: 'ap-1' })));
  assert.deepEqual(picked.concepts, [{ id: 'c1', title: 'Swept liquidity levels', priority: 'mandatory' }]);
  assert.equal(picked.understanding, 'Reads structure first.');
  assert.deepEqual(picked.customFocuses, []);
  assert.equal(graph.pickAnalysisProfileForAi(null), null);
});

test('PARITY: every trained-profile field pickAdherenceProfile sends is also sent by the graph picker (only adherence and requiredInputs may differ) - so the two can never drift apart again', async () => {
  const graph = await loadGraphContext();
  const { client } = await loadClient();
  const ctx = context({ id: 'ap-1' });
  const sessionKeys = Object.keys(json(client.pickAdherenceProfile(ctx, 'balanced')));
  const graphKeys = Object.keys(json(graph.pickAnalysisProfileForAi(ctx)));
  const allowedToDiffer = new Set(['adherence', 'requiredInputs']);
  const missing = sessionKeys.filter((key) => !allowedToDiffer.has(key) && !graphKeys.includes(key));
  assert.deepEqual(missing, [], `the graph AI picker is missing profile fields the Session analysis sends: ${missing.join(', ')}`);
});

// ---- the UI: modal chip + result-card checklist ---------------------------------------------------------------------------

test('the Session AI modal shows a training chip built from the SAME context the request sends (mandatory concept count + engine understanding version), and every language has both copy keys', async () => {
  const modal = await src('sessionAiAnalysisModal.jsx');
  assert.match(modal, /const trainingChip = React\.useMemo\(/);
  assert.match(modal, /liveAnalysisContext\.concepts \|\| \[\]\)\.filter\(\(c\) => c\.priority === 'mandatory'\)\.length/);
  assert.match(modal, /store\.find\(profileId\)/);
  assert.match(modal, /\{trainingChip && \(/);
  for (const lang of ['fa', 'ar', 'en', 'es']) {
    assert.match(modal, new RegExp(`  ${lang}: \\{[\\s\\S]*?trainedMandatory: '[^']*\\{n\\}[^']*', trainedUnderstanding: '[^']*\\{n\\}[^']*'`), `${lang} must define both chip strings with the {n} placeholder`);
  }
});

test('the chip is honest: it never appears for a profile with nothing trained, and never claims concepts that are not mandatory', async () => {
  const modal = await src('sessionAiAnalysisModal.jsx');
  const memo = modal.slice(modal.indexOf('const trainingChip'), modal.indexOf('}, [liveAnalysisContext, profileId, activeLang]);'));
  assert.match(memo, /if \(!liveAnalysisContext\) return '';/);
  assert.match(memo, /if \(mandatory\) parts\.push/);
  assert.match(memo, /if \(version\) parts\.push/);
});

test('the result card renders a ConceptCoverageBlock from result.conceptCoverage, before the note feedback, and shows a skipped concept as "Not checked" in the danger tone - never as applied', async () => {
  const card = await src('sessionAnalysisCard.jsx');
  assert.match(card, /<ConceptCoverageBlock coverage=\{result\.conceptCoverage\} lang=\{activeLang\} \/>/);
  assert.ok(card.indexOf('<ConceptCoverageBlock coverage') < card.indexOf('<NoteFeedbackBlock noteFeedback={result.noteFeedback}'));
  assert.match(card, /const COVERAGE_TONE = \{ applied: 'success', not_visible: 'neutral', not_applicable: 'neutral', unaddressed: 'danger' \};/);
  assert.match(card, /if \(!coverage \|\| !coverage\.length\) return null;/, 'no coverage (no mandatory concepts, or a legacy result) renders nothing');
  for (const lang of ['fa', 'ar', 'en', 'es']) {
    for (const key of ['coverageTitle', 'coverageSummary', 'coverage_applied', 'coverage_not_visible', 'coverage_not_applicable', 'coverage_unaddressed', 'coverageUnaddressedHint', 'coverageEvidence']) {
      assert.match(card, new RegExp(`  ${lang}: \\{[\\s\\S]*?${key}: '[^']+'`), `${lang} must define ${key}`);
    }
  }
  assert.match(card, /coverageSummary: '\{applied\} of \{total\}/, 'the summary counts APPLIED concepts only');
});

test('the card copy uses the SAME status names the server and the ledger use (applied / not_visible / not_applicable / unaddressed)', async () => {
  const card = await src('sessionAnalysisCard.jsx');
  const { COVERAGE_STATUSES, COVERAGE_UNADDRESSED } = await import('../server/ai/analysis-profile-coverage.mjs');
  for (const status of [...COVERAGE_STATUSES, COVERAGE_UNADDRESSED]) assert.match(card, new RegExp(`coverage_${status}: '`), `the card must label ${status}`);
});
