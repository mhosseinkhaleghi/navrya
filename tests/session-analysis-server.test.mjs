import assert from 'node:assert/strict';
import test, { after, afterEach } from 'node:test';

// Adaptive AI Session Analysis - server/pattern-ai-server.mjs's analyzeSession()/
// visualizeScenario(). Same "import once, stub globalThis.fetch" convention tests/ai-gateway.test.mjs
// already uses for callProvider() - analyzeSession() calls that SAME callProvider() internally, so
// this stubs the underlying provider HTTP call, never a mocked "callProvider" seam of its own.
const serverModule = await import('../server/pattern-ai-server.mjs');
const {
  analyzeSession, visualizeScenario, visualizeAnalysis, buildAnalysisVisualizationPrompt,
  buildSessionAnalysisSystemPrompt, sessionAnalysisOutputBudget, sessionAnalysisReasoningEffort,
  validateSessionAnalysisResult, sessionAnalysisFormat, SESSION_ANALYSIS_OUTPUT_BUDGET, SESSION_ANALYSIS_VISION_SUPPORT
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

// Session / Analysis Desk AI upgrade, section 2: the old prohibition on evaluating scenario
// probability/status during an UPDATE is removed - a normal update now assesses every supplied
// active scenario in the same call, exactly like the explicit "Evaluate with AI" action.
test('the system prompt for UPDATE is change-first, and evaluates active scenarios only when any are actually supplied', () => {
  const withoutScenarios = buildSessionAnalysisSystemPrompt({ analysisType: 'update', adherence: 'balanced' }, 'English');
  assert.match(withoutScenarios, /ANALYSIS UPDATE/);
  assert.match(withoutScenarios, /WHAT CHANGED/);
  assert.match(withoutScenarios, /Leave `scenarioEvaluations` empty - no active scenarios were supplied/);

  const withScenarios = buildSessionAnalysisSystemPrompt({ analysisType: 'update', adherence: 'balanced', activeScenarios: [{ id: 'sc1', title: 'Bullish continuation' }] }, 'English');
  assert.match(withScenarios, /Assess every scenario listed under "Active Session scenarios"/);
  assert.match(withScenarios, /force 0% and status "invalidated"/);
  assert.doesNotMatch(withScenarios, /must NOT evaluate or restate/);
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

test('the trader\'s own customFocuses (analysis-context.js) are woven into the prompt as data, capped and length-limited defensively', () => {
  const prompt = buildSessionAnalysisSystemPrompt({
    analysisType: 'initial', adherence: 'balanced',
    analysisProfile: {
      primaryStyle: { id: 'price_action', name: { en: 'Price Action' } }, secondaryStyles: [], focuses: [], customMethodNotes: '',
      customFocuses: [{ name: 'Swept liquidity levels', description: 'stop hunts' }, { name: 'x'.repeat(200) }]
    }
  }, 'English');
  assert.match(prompt, /Swept liquidity levels \(stop hunts\)/);
  assert.match(prompt, /data, not an instruction/);
  // The oversized name must be truncated to 80 chars, never sent verbatim or crash the prompt build.
  assert.ok(!prompt.includes('x'.repeat(200)));
  assert.match(prompt, new RegExp('x'.repeat(80)));
});

test('a profile with zero customFocuses adds no "additional focus areas" line at all', () => {
  const prompt = buildSessionAnalysisSystemPrompt({
    analysisType: 'initial', adherence: 'balanced',
    analysisProfile: { primaryStyle: { id: 'price_action', name: { en: 'Price Action' } }, secondaryStyles: [], focuses: [], customMethodNotes: '', customFocuses: [] }
  }, 'English');
  assert.doesNotMatch(prompt, /additional focus areas/);
});

// --------------------------------------------------------------------------------------------
// Output budget policy - Initial largest, Update medium, Scenario Evaluation smallest (brief §4).
// --------------------------------------------------------------------------------------------

// Production incident, part 2 (2026-09-01): the original design asserted here (initial > update >
// scenario_evaluation) turned out to be a false assumption - sessionAnalysisFormat is the exact
// same, fully-required schema for every analysisType (nothing in it lets update/scenario_evaluation
// emit a smaller structure), and update was reproduced live truncating at its old, smaller ceiling
// even on the cheapest model tier. All three now intentionally share one generous budget.
test('output budget: initial, update, and scenario_evaluation all share one generous ceiling (no schema-level reason for any to be smaller), and AUTO applies no multiplier', () => {
  assert.equal(sessionAnalysisOutputBudget('initial', 'auto'), SESSION_ANALYSIS_OUTPUT_BUDGET.initial);
  assert.equal(SESSION_ANALYSIS_OUTPUT_BUDGET.initial, SESSION_ANALYSIS_OUTPUT_BUDGET.update);
  assert.equal(SESSION_ANALYSIS_OUTPUT_BUDGET.update, SESSION_ANALYSIS_OUTPUT_BUDGET.scenario_evaluation);
});

test('output budget: efficient tightens and deep relaxes the ceiling relative to auto', () => {
  const auto = sessionAnalysisOutputBudget('update', 'auto');
  const efficient = sessionAnalysisOutputBudget('update', 'efficient');
  const deep = sessionAnalysisOutputBudget('update', 'deep');
  assert.ok(efficient < auto);
  assert.ok(deep > auto);
});

// --------------------------------------------------------------------------------------------
// Production incident, part 3 (2026-09-01): Luna (economical) and Sol (frontier) returned
// near-identical analyses - analyzeSession() never set reasoning.effort at all, so every GPT-5.6
// tier got OpenAI's own baseline effort regardless of which one the trader actually picked.
// --------------------------------------------------------------------------------------------

test('sessionAnalysisReasoningEffort maps each real GPT-5.6 tier to a distinct effort, and the bare gpt-5.6 alias to frontier (it resolves server-side to Sol)', () => {
  assert.equal(sessionAnalysisReasoningEffort('openai', 'gpt-5.6-sol'), 'high');
  assert.equal(sessionAnalysisReasoningEffort('openai', 'gpt-5.6-terra'), 'medium');
  assert.equal(sessionAnalysisReasoningEffort('openai', 'gpt-5.6-luna'), 'low');
  assert.equal(sessionAnalysisReasoningEffort('openai', 'gpt-5.6'), 'high');
});

test('sessionAnalysisReasoningEffort returns null for a model/provider it has not confirmed supports the field, rather than guessing', () => {
  assert.equal(sessionAnalysisReasoningEffort('openai', 'gpt-4.1'), null);
  assert.equal(sessionAnalysisReasoningEffort('openai', 'gpt-4o'), null);
  assert.equal(sessionAnalysisReasoningEffort('anthropic', 'claude-sonnet-4-5'), null);
});

test('output budget: a higher reasoning effort widens the ceiling too, so the extra reasoning tokens it spends do not crowd out the visible JSON answer out of the same shared budget', () => {
  const noEffort = sessionAnalysisOutputBudget('initial', 'auto');
  const low = sessionAnalysisOutputBudget('initial', 'auto', 'low');
  const high = sessionAnalysisOutputBudget('initial', 'auto', 'high');
  assert.equal(noEffort, SESSION_ANALYSIS_OUTPUT_BUDGET.initial);
  assert.ok(low < noEffort, 'economical tier (low effort) should use LESS budget than the unset-effort baseline');
  assert.ok(high > noEffort, 'frontier tier (high effort) should use MORE budget than the unset-effort baseline, to make room for its own extra reasoning tokens');
});

test('analyzeSession sends a real reasoning.effort field (and a correspondingly wider max_output_tokens) for the frontier GPT-5.6 tier', async () => {
  let sentBody = null;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes(HEALTH_EVENT_URL)) return neutralHealthEventResponse;
    sentBody = JSON.parse(init.body);
    return { ok: true, json: async () => ({ output_text: JSON.stringify({ thesis: { headline: 'h', summary: '' }, stateMetrics: [], whatChanged: [], blocks: [], scenarios: [], scenarioEvaluations: [], watchItems: [], unknowns: [], unresolvedItems: [], whatWouldChangeView: '', confidence: { level: 'medium', reasons: [] }, requestResponse: { requested: '', analyzed: '', answer: '', limitation: '' }, noteFeedback: [], timeframeAnalyses: [], timeframeSynthesis: '', memoryUpdate: { currentThesis: '', marketState: '', keyZones: [], importantObservations: [], recentChanges: [], watchItems: [], unresolvedQuestions: [], compactNarrative: '' } }) }) };
  };
  await analyzeSession(Object.assign(validAnalysisBody(), { model: 'gpt-5.6-sol' }));
  assert.equal(sentBody.reasoning.effort, 'high');
  assert.ok(sentBody.max_output_tokens > SESSION_ANALYSIS_OUTPUT_BUDGET.initial, 'the frontier tier must get more than the baseline budget, not the same one Luna gets');
});

test('analyzeSession sends a lower reasoning.effort (and a correspondingly narrower budget) for the economical Luna tier', async () => {
  let sentBody = null;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes(HEALTH_EVENT_URL)) return neutralHealthEventResponse;
    sentBody = JSON.parse(init.body);
    return { ok: true, json: async () => ({ output_text: JSON.stringify({ thesis: { headline: 'h', summary: '' }, stateMetrics: [], whatChanged: [], blocks: [], scenarios: [], scenarioEvaluations: [], watchItems: [], unknowns: [], unresolvedItems: [], whatWouldChangeView: '', confidence: { level: 'medium', reasons: [] }, requestResponse: { requested: '', analyzed: '', answer: '', limitation: '' }, noteFeedback: [], timeframeAnalyses: [], timeframeSynthesis: '', memoryUpdate: { currentThesis: '', marketState: '', keyZones: [], importantObservations: [], recentChanges: [], watchItems: [], unresolvedQuestions: [], compactNarrative: '' } }) }) };
  };
  await analyzeSession(Object.assign(validAnalysisBody(), { model: 'gpt-5.6-luna' }));
  assert.equal(sentBody.reasoning.effort, 'low');
  assert.ok(sentBody.max_output_tokens < SESSION_ANALYSIS_OUTPUT_BUDGET.initial);
});

test('analyzeSession never sends a reasoning field at all for a model it has not confirmed supports it (e.g. gpt-4.1), rather than guessing an effort value', async () => {
  let sentBody = null;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes(HEALTH_EVENT_URL)) return neutralHealthEventResponse;
    sentBody = JSON.parse(init.body);
    return { ok: true, json: async () => ({ output_text: JSON.stringify({ thesis: { headline: 'h', summary: '' }, stateMetrics: [], whatChanged: [], blocks: [], scenarios: [], scenarioEvaluations: [], watchItems: [], unknowns: [], unresolvedItems: [], whatWouldChangeView: '', confidence: { level: 'medium', reasons: [] }, requestResponse: { requested: '', analyzed: '', answer: '', limitation: '' }, noteFeedback: [], timeframeAnalyses: [], timeframeSynthesis: '', memoryUpdate: { currentThesis: '', marketState: '', keyZones: [], importantObservations: [], recentChanges: [], watchItems: [], unresolvedQuestions: [], compactNarrative: '' } }) }) };
  };
  await analyzeSession(Object.assign(validAnalysisBody(), { model: 'gpt-4.1' }));
  assert.equal('reasoning' in sentBody, false);
  assert.equal(sentBody.max_output_tokens, SESSION_ANALYSIS_OUTPUT_BUDGET.initial);
});

// --------------------------------------------------------------------------------------------
// Server-side result validation (brief §38) - a defense-in-depth gate beyond assertRequiredKeys().
//
// PRODUCTION INCIDENT (2026-08-31): this originally THREW (-> a raw 500) for any of these
// conditions, discarding an otherwise-good, already-paid-for analysis for something the client's
// own normalizeAnalysisResult() is specifically designed to heal gracefully. Now it only ever
// repairs the offending value in place; the only thing still enforced by removal (never a
// whole-response throw) is a scenario evaluation targeting a real, asked-about scenario id.
// --------------------------------------------------------------------------------------------

test('validateSessionAnalysisResult repairs an unrecognized block type to "custom" rather than rejecting the whole analysis', () => {
  const data = validateSessionAnalysisResult({ blocks: [{ id: 'b1', type: 'not_a_real_block_type', title: 'x' }], scenarios: [], scenarioEvaluations: [] }, {});
  assert.equal(data.blocks[0].type, 'custom');
  assert.equal(data.blocks[0].title, 'x', 'the rest of the block must be preserved, not discarded');
});

test('validateSessionAnalysisResult clamps a scenario probability outside [0,100] rather than rejecting the whole analysis', () => {
  const data = validateSessionAnalysisResult({ blocks: [], scenarios: [{ localKey: 's1', probability: 250 }], scenarioEvaluations: [] }, {});
  assert.equal(data.scenarios[0].probability, 100);
  assert.equal(data.scenarios[0].localKey, 's1');
});

test('validateSessionAnalysisResult drops (not rejects the whole analysis for) a scenario evaluation targeting an id NAVRYA never asked about - never trust a model-invented scenario id', () => {
  const body = { scenarioTargets: ['real-scenario-1'] };
  const data = validateSessionAnalysisResult({ analysisType: 'scenario_evaluation', blocks: [], scenarios: [], scenarioEvaluations: [{ scenarioId: 'invented-id' }, { scenarioId: 'real-scenario-1' }] }, body);
  assert.equal(data.scenarioEvaluations.length, 1);
  assert.equal(data.scenarioEvaluations[0].scenarioId, 'real-scenario-1');
});

test('validateSessionAnalysisResult accepts a scenario evaluation for a real requested scenario id', () => {
  const body = { scenarioTargets: ['real-scenario-1'] };
  const data = validateSessionAnalysisResult({ analysisType: 'scenario_evaluation', blocks: [], scenarios: [], scenarioEvaluations: [{ scenarioId: 'real-scenario-1' }] }, body);
  assert.equal(data.scenarioEvaluations.length, 1);
  assert.equal(data.scenarioEvaluations[0].scenarioId, 'real-scenario-1');
});

// Session / Analysis Desk AI upgrade, section 2 fix: a normal initial/update analysis validates
// scenarioEvaluations against the real `activeScenarios` ids sent as context, never
// `scenarioTargets` (that field is only ever populated for the separate scenario_evaluation
// request type) - validating against the wrong field would silently discard every evaluation a
// normal analysis ever returns.
test('validateSessionAnalysisResult validates a normal update/initial scenario evaluation against activeScenarios, not scenarioTargets', () => {
  const body = { activeScenarios: [{ id: 'real-scenario-1' }] };
  const data = validateSessionAnalysisResult({ analysisType: 'update', blocks: [], scenarios: [], scenarioEvaluations: [{ scenarioId: 'invented-id' }, { scenarioId: 'real-scenario-1' }] }, body);
  assert.equal(data.scenarioEvaluations.length, 1);
  assert.equal(data.scenarioEvaluations[0].scenarioId, 'real-scenario-1');
});

test('validateSessionAnalysisResult deterministically forces an invalidated scenario evaluation to exactly 0%, regardless of what numeric value the model itself returned', () => {
  const body = { activeScenarios: [{ id: 'sc1' }] };
  const data = validateSessionAnalysisResult({ analysisType: 'update', blocks: [], scenarios: [], scenarioEvaluations: [{ scenarioId: 'sc1', status: 'weakened', invalidationOccurred: true, newProbability: 35 }] }, body);
  assert.equal(data.scenarioEvaluations[0].newProbability, 0);
  assert.equal(data.scenarioEvaluations[0].status, 'invalidated');
});

test('validateSessionAnalysisResult calibrates a still-viable scenario proposal/evaluation probability, never leaving a meaningless single-digit percentage', () => {
  const proposals = validateSessionAnalysisResult({ blocks: [], scenarios: [{ localKey: 's1', probability: 3 }], scenarioEvaluations: [] }, {});
  assert.equal(proposals.scenarios[0].probability, 10);
  const body = { activeScenarios: [{ id: 'sc1' }] };
  const evaluations = validateSessionAnalysisResult({ analysisType: 'update', blocks: [], scenarios: [], scenarioEvaluations: [{ scenarioId: 'sc1', status: 'weakened', newProbability: 2 }] }, body);
  assert.equal(evaluations.scenarioEvaluations[0].newProbability, 10);
});

test('validateSessionAnalysisResult drops a noteFeedback item whose noteRef was never actually sent, and keeps one that matches exactly', () => {
  const body = { pendingNoteRefs: [{ entryId: 'e1', field: 'note', revision: 'rev1' }] };
  const data = validateSessionAnalysisResult({
    blocks: [], scenarios: [], scenarioEvaluations: [],
    noteFeedback: [
      { noteRef: { entryId: 'e1', field: 'note', revision: 'rev1' }, verdict: 'supported' },
      { noteRef: { entryId: 'e1', field: 'note', revision: 'HALLUCINATED' }, verdict: 'supported' }
    ]
  }, body);
  assert.equal(data.noteFeedback.length, 1);
  assert.equal(data.noteFeedback[0].noteRef.revision, 'rev1');
});

test('validateSessionAnalysisResult drops a timeframeAnalyses entry referencing an image id that was never supplied', () => {
  const body = { images: [{ id: 'img1', timeframe: '5m', dataUrl: 'data:image/png;base64,AAAA' }] };
  const data = validateSessionAnalysisResult({
    blocks: [], scenarios: [], scenarioEvaluations: [],
    timeframeAnalyses: [{ imageId: 'img1', timeframe: '5m' }, { imageId: 'HALLUCINATED', timeframe: '1h' }]
  }, body);
  assert.equal(data.timeframeAnalyses.length, 1);
  assert.equal(data.timeframeAnalyses[0].imageId, 'img1');
});

test('validateSessionAnalysisResult still throws for a genuinely non-object response (nothing usable to repair)', () => {
  assert.throws(() => validateSessionAnalysisResult(null, {}), /SCHEMA_VALIDATION_FAILED/);
});

// --------------------------------------------------------------------------------------------
// analyzeSession() end to end (provider call stubbed).
// --------------------------------------------------------------------------------------------

test('analyzeSession returns the normalized provider data plus provider/model/usage, never fabricating usage the provider omitted (brief §40 test 11)', async () => {
  globalThis.fetch = minimalOpenAiStub({ thesis: { headline: 'h', summary: 's' }, stateMetrics: [], whatChanged: [], blocks: [], scenarios: [], scenarioEvaluations: [], watchItems: [], unknowns: [], unresolvedItems: [], whatWouldChangeView: '', confidence: { level: 'medium', reasons: [] }, requestResponse: { requested: '', analyzed: '', answer: '', limitation: '' }, noteFeedback: [], timeframeAnalyses: [], timeframeSynthesis: '', memoryUpdate: { currentThesis: '', marketState: '', keyZones: [], importantObservations: [], recentChanges: [], watchItems: [], unresolvedQuestions: [], compactNarrative: '' } }, null);
  const result = await analyzeSession(validAnalysisBody());
  assert.equal(result.provider, 'openai');
  assert.equal(result.data.thesis.headline, 'h');
  // callOpenAI() (unchanged by this feature) always returns the full usage envelope shape with
  // every unreported field left null, rather than a bare null - see its own comment ("never
  // estimated/fabricated"). analyzeSession() must pass this through completely unmodified.
  assert.deepEqual(result.usage, { promptTokens: null, completionTokens: null, totalTokens: null, cachedInputTokens: null, cacheWriteInputTokens: null, reasoningTokens: null, raw: null });
});

// Production incident: analyzeSession()'s own payload.timeoutMs (an internal-only signal for
// callOpenAI's AbortController, added alongside max_output_tokens - see that budget's own
// comment) was briefly forwarded straight into the real OpenAI Responses API request body via
// Object.assign({}, payload, {model}), which OpenAI rejected outright with "Unknown parameter:
// 'timeoutMs'." - confirmed live. Unlike max_output_tokens (a real Responses API field),
// timeoutMs must never leave this process.
test('analyzeSession never leaks its internal payload.timeoutMs into the real request body sent to the provider', async () => {
  let sentBody = null;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes(HEALTH_EVENT_URL)) return neutralHealthEventResponse;
    sentBody = JSON.parse(init.body);
    return { ok: true, json: async () => ({ output_text: JSON.stringify({ thesis: { headline: 'h', summary: '' }, stateMetrics: [], whatChanged: [], blocks: [], scenarios: [], scenarioEvaluations: [], watchItems: [], unknowns: [], unresolvedItems: [], whatWouldChangeView: '', confidence: { level: 'medium', reasons: [] }, requestResponse: { requested: '', analyzed: '', answer: '', limitation: '' }, noteFeedback: [], timeframeAnalyses: [], timeframeSynthesis: '', memoryUpdate: { currentThesis: '', marketState: '', keyZones: [], importantObservations: [], recentChanges: [], watchItems: [], unresolvedQuestions: [], compactNarrative: '' } }) }) };
  };
  await analyzeSession(validAnalysisBody());
  assert.ok(sentBody, 'the provider request must actually have been made');
  assert.equal('timeoutMs' in sentBody, false);
  assert.ok(Number.isFinite(sentBody.max_output_tokens), 'max_output_tokens, the one real budget field, must still be forwarded');
});

test('analyzeSession gives Gemini the accepted compact schema in exactly one provider call', async () => {
  let providerCalls = 0;
  let sentBody = null;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes(HEALTH_EVENT_URL)) return neutralHealthEventResponse;
    providerCalls += 1;
    sentBody = JSON.parse(init.body);
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ thesis: { headline: 'h', summary: '' }, stateMetrics: [], whatChanged: [], blocks: [], scenarios: [], scenarioEvaluations: [], watchItems: [], unknowns: [], unresolvedItems: [], whatWouldChangeView: '', confidence: { level: 'medium', reasons: [] }, requestResponse: { requested: '', analyzed: '', answer: '', limitation: '' }, noteFeedback: [], timeframeAnalyses: [], timeframeSynthesis: '', memoryUpdate: { currentThesis: '', marketState: '', keyZones: [], importantObservations: [], recentChanges: [], watchItems: [], unresolvedQuestions: [], compactNarrative: '' } }) }] } }], usageMetadata: {} }) };
  };
  await analyzeSession(Object.assign(validAnalysisBody(), { provider: 'gemini', model: 'gemini-3.1-pro-preview' }));
  assert.equal(providerCalls, 1, 'schema compaction must not add a retry or a second billable analysis call');
  const schema = sentBody.generationConfig.responseSchema;
  assert.ok(schema.properties.blocks.items.properties.title, 'the complete response shape remains present');
  assert.equal(schema.properties.blocks.maxItems, undefined, 'only provider-rejected constraints are omitted');
  assert.equal(schema.properties.blocks.items.properties.type.enum, undefined);
  assert.deepEqual(schema.required, sessionAnalysisFormat.schema.required);
});

test('analyzeSession rejects MODEL_VISION_UNSUPPORTED before ever calling the provider, when images are supplied for a non-vision provider (brief §40 test 13)', async () => {
  let calls = 0;
  globalThis.fetch = async (url) => { calls += 1; if (String(url).includes(HEALTH_EVENT_URL)) return neutralHealthEventResponse; return { ok: true, json: async () => ({}) }; };
  const body = Object.assign(validAnalysisBody(), { provider: 'deepseek', model: 'deepseek-chat', images: ['data:image/png;base64,AAAA'] });
  await assert.rejects(() => analyzeSession(body), /MODEL_VISION_UNSUPPORTED/);
  assert.equal(calls, 0, 'no provider/health call may happen once the vision check rejects');
});

// Section 3 - each supplied image is labelled with its own id/timeframe immediately before its
// own image content block, and a legacy plain-string image still works unchanged.
test('analyzeSession labels every supplied image with its own id/timeframe before its image content, in order', async () => {
  let sentBody = null;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes(HEALTH_EVENT_URL)) return neutralHealthEventResponse;
    sentBody = JSON.parse(init.body);
    return { ok: true, json: async () => ({ output_text: JSON.stringify({ thesis: { headline: 'h', summary: '' }, stateMetrics: [], whatChanged: [], blocks: [], scenarios: [], scenarioEvaluations: [], watchItems: [], unknowns: [], unresolvedItems: [], whatWouldChangeView: '', confidence: { level: 'medium', reasons: [] }, requestResponse: { requested: '', analyzed: '', answer: '', limitation: '' }, noteFeedback: [], timeframeAnalyses: [{ imageId: 'img1', timeframe: '5m', trend: 'up', momentum: 'steady', keyEvidence: [], uncertainty: '' }], timeframeSynthesis: 'aligned', memoryUpdate: { currentThesis: '', marketState: '', keyZones: [], importantObservations: [], recentChanges: [], watchItems: [], unresolvedQuestions: [], compactNarrative: '' } }) }) };
  };
  const body = Object.assign(validAnalysisBody(), {
    images: [{ id: 'img1', timeframe: '5m', dataUrl: 'data:image/png;base64,AAAA' }, { id: 'img2', timeframe: '1h', dataUrl: 'data:image/png;base64,BBBB' }]
  });
  const result = await analyzeSession(body);
  const content = sentBody.input[1].content;
  assert.match(content[1].text, /Image img1.*5m/);
  assert.equal(content[2].image_url, 'data:image/png;base64,AAAA');
  assert.match(content[3].text, /Image img2.*1h/);
  assert.equal(content[4].image_url, 'data:image/png;base64,BBBB');
  assert.equal(result.data.timeframeAnalyses.length, 1);
  assert.equal(result.data.timeframeAnalyses[0].imageId, 'img1');
  assert.equal(result.data.timeframeSynthesis, 'aligned');
});

test('analyzeSession still accepts the legacy plain-string images array (backward compatibility)', async () => {
  globalThis.fetch = minimalOpenAiStub({ thesis: { headline: 'h', summary: '' }, stateMetrics: [], whatChanged: [], blocks: [], scenarios: [], scenarioEvaluations: [], watchItems: [], unknowns: [], unresolvedItems: [], whatWouldChangeView: '', confidence: { level: 'medium', reasons: [] }, requestResponse: { requested: '', analyzed: '', answer: '', limitation: '' }, noteFeedback: [], timeframeAnalyses: [], timeframeSynthesis: '', memoryUpdate: { currentThesis: '', marketState: '', keyZones: [], importantObservations: [], recentChanges: [], watchItems: [], unresolvedQuestions: [], compactNarrative: '' } }, null);
  const body = Object.assign(validAnalysisBody(), { images: ['data:image/png;base64,AAAA'] });
  const result = await analyzeSession(body);
  assert.equal(result.data.thesis.headline, 'h');
});

test('SESSION_ANALYSIS_VISION_SUPPORT matches the gateway\'s own per-provider vision gate (Gemini and Kimi vision-capable, DeepSeek not)', () => {
  assert.equal(SESSION_ANALYSIS_VISION_SUPPORT.openai, true);
  assert.equal(SESSION_ANALYSIS_VISION_SUPPORT.anthropic, true);
  assert.equal(SESSION_ANALYSIS_VISION_SUPPORT.gemini, true);
  assert.equal(SESSION_ANALYSIS_VISION_SUPPORT.kimi, true);
  assert.equal(SESSION_ANALYSIS_VISION_SUPPORT.deepseek, false);
});

test('analyzeSession defaults to INITIAL for a missing/invalid analysisType rather than throwing', async () => {
  globalThis.fetch = minimalOpenAiStub({ thesis: { headline: 'h', summary: '' }, stateMetrics: [], whatChanged: [], blocks: [], scenarios: [], scenarioEvaluations: [], watchItems: [], unknowns: [], unresolvedItems: [], whatWouldChangeView: '', confidence: { level: 'medium', reasons: [] }, requestResponse: { requested: '', analyzed: '', answer: '', limitation: '' }, noteFeedback: [], timeframeAnalyses: [], timeframeSynthesis: '', memoryUpdate: { currentThesis: '', marketState: '', keyZones: [], importantObservations: [], recentChanges: [], watchItems: [], unresolvedQuestions: [], compactNarrative: '' } });
  const body = Object.assign(validAnalysisBody(), { analysisType: 'not_a_real_type' });
  const result = await analyzeSession(body);
  assert.equal(result.data.analysisType, 'initial');
});

// --------------------------------------------------------------------------------------------
// Truncated model output (production incident): a real, detailed chart image pushed a reasoning
// model's combined reasoning + JSON-answer tokens past max_output_tokens, cutting the response off
// mid-JSON-string. Before this fix that reached the client as a raw, uninterpreted
// "Unterminated string in JSON at position ..." SyntaxError mapped to a bare 500. It must now
// surface as a distinct, honest ANALYSIS_OUTPUT_TRUNCATED regardless of which of the two ways a
// provider signals it: an explicit status flag, or (fallback) text that simply fails to parse.
// --------------------------------------------------------------------------------------------

test('analyzeSession surfaces ANALYSIS_OUTPUT_TRUNCATED (not a raw JSON.parse crash) when the Responses API explicitly flags status:incomplete/max_output_tokens', async () => {
  globalThis.fetch = async (url) => {
    if (String(url).includes(HEALTH_EVENT_URL)) return neutralHealthEventResponse;
    return { ok: true, json: async () => ({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output_text: '{"thesis":{"headline":"cut off mid-strin' }) };
  };
  await assert.rejects(() => analyzeSession(validAnalysisBody()), /ANALYSIS_OUTPUT_TRUNCATED/);
});

test('analyzeSession surfaces ANALYSIS_OUTPUT_TRUNCATED (not a raw JSON.parse crash) when the response text is simply cut off mid-string with no explicit status flag', async () => {
  globalThis.fetch = async (url) => {
    if (String(url).includes(HEALTH_EVENT_URL)) return neutralHealthEventResponse;
    return { ok: true, json: async () => ({ output_text: '{"thesis":{"headline":"BTC nearing a decision zone after a multi-wave declin' }) };
  };
  await assert.rejects(() => analyzeSession(validAnalysisBody()), /ANALYSIS_OUTPUT_TRUNCATED/);
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

test('visualizeScenario calls the OpenAI images/edits endpoint against gpt-image-2 and returns the imageDataUrl with the REAL usage the provider reported, never fabricated', async () => {
  let calledUrl = null;
  let sentModel = null;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes(HEALTH_EVENT_URL)) return neutralHealthEventResponse;
    calledUrl = String(url);
    sentModel = init && init.body && init.body.get ? init.body.get('model') : null;
    return { ok: true, json: async () => ({ data: [{ b64_json: 'ZmFrZS1pbWFnZQ==' }], usage: { input_tokens: 120, input_tokens_details: { cached_tokens: 20 }, output_tokens: 300, total_tokens: 420 } }) };
  };
  const result = await visualizeScenario({ chartImage: 'data:image/png;base64,AAAA', visualizationBrief: { narrative: 'test', primaryPath: ['A', 'B'] }, language: 'en', apiKey: 'k' });
  assert.match(calledUrl, /images\/edits/);
  assert.equal(sentModel, 'gpt-image-2');
  assert.match(result.data.imageDataUrl, /^data:image\/png;base64,/);
  assert.equal(result.provider, 'openai');
  assert.equal(result.model, 'gpt-image-2');
  assert.equal(result.usage.promptTokens, 120);
  assert.equal(result.usage.completionTokens, 300);
  assert.equal(result.usage.totalTokens, 420);
  assert.equal(result.usage.cachedInputTokens, 20);
});

test('visualizeScenario reports an honest all-null usage envelope (never fabricated) when the provider omits usage entirely', async () => {
  globalThis.fetch = async (url) => {
    if (String(url).includes(HEALTH_EVENT_URL)) return neutralHealthEventResponse;
    return { ok: true, json: async () => ({ data: [{ b64_json: 'ZmFrZS1pbWFnZQ==' }] }) };
  };
  const result = await visualizeScenario({ chartImage: 'data:image/png;base64,AAAA', visualizationBrief: {}, language: 'en', apiKey: 'k' });
  assert.equal(result.usage.promptTokens, null);
  assert.equal(result.usage.completionTokens, null);
});

// --------------------------------------------------------------------------------------------
// visualizeAnalysis() (Analysis Map) - same shape as visualizeScenario() above, but drawing the
// WHOLE analysis (every key zone + the primary scenario's path) in one image instead of one
// scenario at a time.
// --------------------------------------------------------------------------------------------

test('buildAnalysisVisualizationPrompt gathers zones from every key_zones block (not just one) and the PRIMARY-role scenario\'s own path', () => {
  const snapshot = {
    thesisHeadline: 'Sellers in control',
    keyZones: [{ range: '100-105', label: 'Support' }, { range: '110-115', label: 'Resistance' }],
    primaryScenario: { primaryPath: ['A', 'B'], triggerZone: 'below 100', invalidationZone: 'above 115' }
  };
  const prompt = buildAnalysisVisualizationPrompt(snapshot, 'en');
  assert.match(prompt, /Sellers in control/);
  assert.match(prompt, /100-105/);
  assert.match(prompt, /110-115/);
  assert.match(prompt, /A -> B/);
  assert.match(prompt, /below 100/);
  assert.match(prompt, /above 115/);
  // Never redraws/invents chart data - the same hard constraint visualizeScenario's own prompt states.
  assert.match(prompt, /Do not alter, invent, remove, or redraw/);
});

test('visualizeAnalysis rejects CHART_IMAGE_REQUIRED with no provider call at all when no chart image is supplied', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return { ok: true, json: async () => ({}) }; };
  await assert.rejects(() => visualizeAnalysis({ analysisSnapshot: {}, language: 'en' }), /CHART_IMAGE_REQUIRED/);
  assert.equal(calls, 0);
});

test('visualizeAnalysis calls the OpenAI images/edits endpoint against gpt-image-2 and returns the imageDataUrl with the REAL usage the provider reported, same as visualizeScenario', async () => {
  let calledUrl = null;
  let sentModel = null;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes(HEALTH_EVENT_URL)) return neutralHealthEventResponse;
    calledUrl = String(url);
    sentModel = init && init.body && init.body.get ? init.body.get('model') : null;
    return { ok: true, json: async () => ({ data: [{ b64_json: 'ZmFrZS1pbWFnZQ==' }], usage: { input_tokens: 150, input_tokens_details: { cached_tokens: 0 }, output_tokens: 400, total_tokens: 550 } }) };
  };
  const result = await visualizeAnalysis({
    chartImage: 'data:image/png;base64,AAAA',
    analysisSnapshot: { thesisHeadline: 'h', keyZones: [{ range: '1-2', label: 'z' }], primaryScenario: null },
    language: 'en', apiKey: 'k'
  });
  assert.match(calledUrl, /images\/edits/);
  assert.equal(sentModel, 'gpt-image-2');
  assert.match(result.data.imageDataUrl, /^data:image\/png;base64,/);
  assert.equal(result.provider, 'openai');
  assert.equal(result.model, 'gpt-image-2');
  assert.equal(result.usage.promptTokens, 150);
  assert.equal(result.usage.completionTokens, 400);
});
