import assert from 'node:assert/strict';
import test, { after, afterEach } from 'node:test';

// Adaptive AI Session Analysis - server/pattern-ai-server.mjs's analyzeSession()/
// visualizeScenario(). Same "import once, stub globalThis.fetch" convention tests/ai-gateway.test.mjs
// already uses for callProvider() - analyzeSession() calls that SAME callProvider() internally, so
// this stubs the underlying provider HTTP call, never a mocked "callProvider" seam of its own.
const serverModule = await import('../server/pattern-ai-server.mjs');
const {
  analyzeSession, visualizeScenario, buildSessionAnalysisSystemPrompt, sessionAnalysisOutputBudget,
  validateSessionAnalysisResult, SESSION_ANALYSIS_OUTPUT_BUDGET, SESSION_ANALYSIS_VISION_SUPPORT
} = serverModule;
const server = serverModule.default;

after(() => { server.close(); });
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const HEALTH_EVENT_URL = '/internal/ai-health-event';
const neutralHealthEventResponse = { ok: true, json: async () => ({}) };

function minimalOpenAiStub(dataObject, usage) {
  return async (url) => {
    if (String(url).includes(HEALTH_EVENT_URL)) return neutralHealthEventResponse;
    return { ok: true, json: async () => ({ output_text: JSON.stringify(dataObject), usage: usage === undefined ? null : usage }) };
  };
}

const validAnalysisBody = () => ({
  provider: 'openai', apiKey: 'k', model: 'gpt-5.6-luna', language: 'en', analysisType: 'initial',
  userView: '', analysisProfile: null, sessionMemory: null, historicalContext: null, patternContext: [], activeScenarios: [], images: []
});

// --------------------------------------------------------------------------------------------
// System prompt: Initial vs Update vs Scenario Evaluation must genuinely differ (brief §40 test 1).
// --------------------------------------------------------------------------------------------

test('the system prompt for INITIAL differs from UPDATE and emphasizes depth/historical context', () => {
  const initial = buildSessionAnalysisSystemPrompt({ analysisType: 'initial', adherence: 'balanced' }, 'English');
  assert.match(initial, /INITIAL analysis/);
  assert.match(initial, /historical Session context/);
  assert.doesNotMatch(initial, /WHAT CHANGED/);
});

test('the system prompt for UPDATE is change-first and explicitly forbids mutating scenario probability/status', () => {
  const update = buildSessionAnalysisSystemPrompt({ analysisType: 'update', adherence: 'balanced' }, 'English');
  assert.match(update, /ANALYSIS UPDATE/);
  assert.match(update, /WHAT CHANGED/);
  assert.match(update, /must NOT evaluate or restate its probability\/status/);
});

test('the system prompt for SCENARIO_EVALUATION scopes the model to only the named scenario(s)', () => {
  const evaluation = buildSessionAnalysisSystemPrompt({ analysisType: 'scenario_evaluation', adherence: 'balanced' }, 'English');
  assert.match(evaluation, /SCENARIO EVALUATION/);
  assert.match(evaluation, /ONLY the specific scenario/);
});

test('the Analysis Style/focus areas/adherence, when supplied, are woven into the prompt', () => {
  const prompt = buildSessionAnalysisSystemPrompt({
    analysisType: 'initial', adherence: 'strict',
    analysisProfile: { primaryStyle: { id: 'price_action', name: { en: 'Price Action' }, analysisPrinciples: ['Structure before indicators'] }, secondaryStyles: [], focuses: [{ id: 'momentum', name: { en: 'Momentum' } }], customMethodNotes: '' }
  }, 'English');
  assert.match(prompt, /Price Action/);
  assert.match(prompt, /Structure before indicators/);
  assert.match(prompt, /Momentum/);
  assert.match(prompt, /STRICT/);
});

// --------------------------------------------------------------------------------------------
// Output budget policy - Initial largest, Update medium, Scenario Evaluation smallest (brief §4).
// --------------------------------------------------------------------------------------------

test('output budget: initial > update > scenario_evaluation, and AUTO applies no multiplier', () => {
  assert.equal(sessionAnalysisOutputBudget('initial', 'auto'), SESSION_ANALYSIS_OUTPUT_BUDGET.initial);
  assert.ok(SESSION_ANALYSIS_OUTPUT_BUDGET.initial > SESSION_ANALYSIS_OUTPUT_BUDGET.update);
  assert.ok(SESSION_ANALYSIS_OUTPUT_BUDGET.update > SESSION_ANALYSIS_OUTPUT_BUDGET.scenario_evaluation);
});

test('output budget: efficient tightens and deep relaxes the ceiling relative to auto', () => {
  const auto = sessionAnalysisOutputBudget('update', 'auto');
  const efficient = sessionAnalysisOutputBudget('update', 'efficient');
  const deep = sessionAnalysisOutputBudget('update', 'deep');
  assert.ok(efficient < auto);
  assert.ok(deep > auto);
});

// --------------------------------------------------------------------------------------------
// Server-side result validation (brief §38) - a defense-in-depth gate beyond assertRequiredKeys().
// --------------------------------------------------------------------------------------------

test('validateSessionAnalysisResult rejects an unrecognized block type', () => {
  assert.throws(() => validateSessionAnalysisResult({ blocks: [{ type: 'not_a_real_block_type' }], scenarios: [], scenarioEvaluations: [] }, {}), /SCHEMA_VALIDATION_FAILED/);
});

test('validateSessionAnalysisResult rejects a scenario probability outside [0,100]', () => {
  assert.throws(() => validateSessionAnalysisResult({ blocks: [], scenarios: [{ probability: 250 }], scenarioEvaluations: [] }, {}), /SCHEMA_VALIDATION_FAILED/);
});

test('validateSessionAnalysisResult rejects a scenario evaluation for an id NAVRYA never asked about (brief §40 test 20 spirit - never trust a model-invented scenario id)', () => {
  const body = { scenarioTargets: ['real-scenario-1'] };
  assert.throws(
    () => validateSessionAnalysisResult({ blocks: [], scenarios: [], scenarioEvaluations: [{ scenarioId: 'invented-id' }] }, body),
    /SCHEMA_VALIDATION_FAILED/
  );
});

test('validateSessionAnalysisResult accepts a scenario evaluation for a real requested scenario id', () => {
  const body = { scenarioTargets: ['real-scenario-1'] };
  const data = { blocks: [], scenarios: [], scenarioEvaluations: [{ scenarioId: 'real-scenario-1' }] };
  assert.deepEqual(validateSessionAnalysisResult(data, body), data);
});

// --------------------------------------------------------------------------------------------
// analyzeSession() end to end (provider call stubbed).
// --------------------------------------------------------------------------------------------

test('analyzeSession returns the normalized provider data plus provider/model/usage, never fabricating usage the provider omitted (brief §40 test 11)', async () => {
  globalThis.fetch = minimalOpenAiStub({ thesis: { headline: 'h', summary: 's' }, stateMetrics: [], whatChanged: [], blocks: [], scenarios: [], scenarioEvaluations: [], watchItems: [], unknowns: [], whatWouldChangeView: '', confidence: { level: 'medium', reasons: [] }, memoryUpdate: { currentThesis: '', marketState: '', keyZones: [], importantObservations: [], recentChanges: [], watchItems: [], unresolvedQuestions: [], compactNarrative: '' } }, null);
  const result = await analyzeSession(validAnalysisBody());
  assert.equal(result.provider, 'openai');
  assert.equal(result.data.thesis.headline, 'h');
  // callOpenAI() (unchanged by this feature) always returns the full usage envelope shape with
  // every unreported field left null, rather than a bare null - see its own comment ("never
  // estimated/fabricated"). analyzeSession() must pass this through completely unmodified.
  assert.deepEqual(result.usage, { promptTokens: null, completionTokens: null, totalTokens: null, cachedInputTokens: null, cacheWriteInputTokens: null, reasoningTokens: null, raw: null });
});

test('analyzeSession rejects MODEL_VISION_UNSUPPORTED before ever calling the provider, when images are supplied for a non-vision provider (brief §40 test 13)', async () => {
  let calls = 0;
  globalThis.fetch = async (url) => { calls += 1; if (String(url).includes(HEALTH_EVENT_URL)) return neutralHealthEventResponse; return { ok: true, json: async () => ({}) }; };
  const body = Object.assign(validAnalysisBody(), { provider: 'deepseek', model: 'deepseek-chat', images: ['data:image/png;base64,AAAA'] });
  await assert.rejects(() => analyzeSession(body), /MODEL_VISION_UNSUPPORTED/);
  assert.equal(calls, 0, 'no provider/health call may happen once the vision check rejects');
});

test('SESSION_ANALYSIS_VISION_SUPPORT matches the gateway\'s own per-provider vision gate (kimi vision-capable, deepseek not)', () => {
  assert.equal(SESSION_ANALYSIS_VISION_SUPPORT.openai, true);
  assert.equal(SESSION_ANALYSIS_VISION_SUPPORT.anthropic, true);
  assert.equal(SESSION_ANALYSIS_VISION_SUPPORT.kimi, true);
  assert.equal(SESSION_ANALYSIS_VISION_SUPPORT.deepseek, false);
});

test('analyzeSession defaults to INITIAL for a missing/invalid analysisType rather than throwing', async () => {
  globalThis.fetch = minimalOpenAiStub({ thesis: { headline: 'h', summary: '' }, stateMetrics: [], whatChanged: [], blocks: [], scenarios: [], scenarioEvaluations: [], watchItems: [], unknowns: [], whatWouldChangeView: '', confidence: { level: 'medium', reasons: [] }, memoryUpdate: { currentThesis: '', marketState: '', keyZones: [], importantObservations: [], recentChanges: [], watchItems: [], unresolvedQuestions: [], compactNarrative: '' } });
  const body = Object.assign(validAnalysisBody(), { analysisType: 'not_a_real_type' });
  const result = await analyzeSession(body);
  assert.equal(result.data.analysisType, 'initial');
});

// --------------------------------------------------------------------------------------------
// visualizeScenario() - explicit, OpenAI-only, never automatic; usage always null.
// --------------------------------------------------------------------------------------------

test('visualizeScenario rejects CHART_IMAGE_REQUIRED with no provider call at all when no chart image is supplied', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return { ok: true, json: async () => ({}) }; };
  await assert.rejects(() => visualizeScenario({ visualizationBrief: {}, language: 'en' }), /CHART_IMAGE_REQUIRED/);
  assert.equal(calls, 0);
});

test('visualizeScenario calls the OpenAI images/edits endpoint and returns an imageDataUrl with usage always null (brief §35)', async () => {
  let calledUrl = null;
  globalThis.fetch = async (url) => {
    if (String(url).includes(HEALTH_EVENT_URL)) return neutralHealthEventResponse;
    calledUrl = String(url);
    return { ok: true, json: async () => ({ data: [{ b64_json: 'ZmFrZS1pbWFnZQ==' }] }) };
  };
  const result = await visualizeScenario({ chartImage: 'data:image/png;base64,AAAA', visualizationBrief: { narrative: 'test', primaryPath: ['A', 'B'] }, language: 'en', apiKey: 'k' });
  assert.match(calledUrl, /images\/edits/);
  assert.match(result.data.imageDataUrl, /^data:image\/png;base64,/);
  assert.equal(result.provider, 'openai');
  assert.equal(result.model, 'gpt-image-1');
  assert.equal(result.usage, null);
});
