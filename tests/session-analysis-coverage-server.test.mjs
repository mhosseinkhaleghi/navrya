import assert from 'node:assert/strict';
import test, { after, afterEach } from 'node:test';

// Verifiable mandatory-concept coverage on the REAL Session analysis path (Phase 5): analyzeSession()
// through every provider caller with a stubbed HTTP layer. This schema has had three production
// incidents (Gemini rejecting it, an unknown parameter leaking to OpenAI, truncation), so the tests here are
// deliberately about the wire: what is actually sent to each provider, and what happens when a provider
// leaves the new field out.

process.env.PATTERN_AI_PORT = '0';
process.env.PORT = '0';
const serverModule = await import('../server/pattern-ai-server.mjs');
const { analyzeSession, buildSessionAnalysisSystemPrompt, sessionAnalysisFormat, sessionAnalysisOutputBudget, SESSION_ANALYSIS_OUTPUT_BUDGET } = serverModule;
after(() => { serverModule.default.close(); });
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const HEALTH_EVENT_URL = '/internal/ai-health-event';
const neutralHealth = { ok: true, json: async () => ({}) };

const baseResult = () => ({
  thesis: { headline: 'h', summary: '' }, stateMetrics: [], whatChanged: [], blocks: [], scenarios: [], scenarioEvaluations: [], watchItems: [],
  unknowns: [], unresolvedItems: [], whatWouldChangeView: '', confidence: { level: 'medium', reasons: [] },
  requestResponse: { requested: '', analyzed: '', answer: '', limitation: '' }, noteFeedback: [], timeframeAnalyses: [], timeframeSynthesis: '',
  memoryUpdate: { currentThesis: '', marketState: '', keyZones: [], importantObservations: [], recentChanges: [], watchItems: [], unresolvedQuestions: [], compactNarrative: '' }
});
const style = { id: 'smc', name: { en: 'Smart Money Concepts' } };
const withMandatory = () => ({
  primaryStyle: style, secondaryStyles: [], focuses: [], customFocuses: [], customMethodNotes: '', understanding: '', requiredInputs: [],
  concepts: [{ id: 'c1', title: 'Swept liquidity levels', description: 'stops taken', priority: 'mandatory' }, { id: 'c2', title: 'Elliott impulse count', priority: 'mandatory' }, { id: 'c3', title: 'Weekly open', priority: 'reference' }]
});
const withoutMandatory = () => ({ ...withMandatory(), concepts: [{ id: 'c3', title: 'Weekly open', priority: 'reference' }] });
const body = (provider, profile, extra) => ({
  provider, apiKey: 'k', model: provider === 'openai' ? 'gpt-5.6-luna' : provider === 'anthropic' ? 'claude-sonnet-5' : provider === 'gemini' ? 'gemini-3.1-pro' : 'kimi-k2',
  language: 'en', analysisType: 'initial', userView: '', analysisProfile: profile, adherence: 'balanced', sessionMemory: null, historicalContext: null,
  patternContext: [], activeScenarios: [], images: [], ...extra
});

// Records the LAST provider request and answers in each provider's own response shape.
function stubProvider(rawData) {
  const state = { last: null };
  globalThis.fetch = async (url, init) => {
    if (String(url).includes(HEALTH_EVENT_URL)) return neutralHealth;
    const u = String(url);
    state.last = { url: u, body: JSON.parse(init.body) };
    if (u.includes('api.anthropic.com')) return { ok: true, json: async () => ({ content: [{ type: 'tool_use', input: rawData }], usage: { input_tokens: 5, output_tokens: 5 } }) };
    if (u.includes('generativelanguage.googleapis.com')) return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(rawData) }] } }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 5 } }) };
    if (u.includes('openai.com')) return { ok: true, json: async () => ({ output_text: JSON.stringify(rawData), usage: { input_tokens: 5, output_tokens: 5 } }) };
    return { ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(rawData) } }], usage: { prompt_tokens: 5, completion_tokens: 5 } }) };
  };
  return state;
}
const goodCoverage = () => [
  { conceptTitle: 'Swept liquidity levels', status: 'applied', evidence: 'Asia low swept' },
  { conceptTitle: 'Elliott impulse count', status: 'not_visible', evidence: 'too few candles' }
];

// ---- OpenAI --------------------------------------------------------------------------------------------------

test('OpenAI: the request schema gains conceptCoverage (required, strict), and NO NAVRYA-only control flag leaks into the request body', async () => {
  const state = stubProvider({ ...baseResult(), conceptCoverage: goodCoverage() });
  await analyzeSession(body('openai', withMandatory()));
  const sent = state.last.body;
  assert.ok(sent.text.format.schema.properties.conceptCoverage, 'the schema must carry the coverage property');
  assert.ok(sent.text.format.schema.required.includes('conceptCoverage'));
  assert.equal(sent.text.format.strict, true);
  // The regression the review of callOpenAI found: an unknown parameter makes OpenAI reject the WHOLE call.
  for (const flag of ['optionalSchemaKeys', 'timeoutMs', 'compactGeminiSchemaConstraints', 'compactGeminiLargeEnums']) {
    assert.equal(flag in sent, false, `${flag} is a NAVRYA-only transport control and must never be sent to OpenAI`);
  }
});

test('OpenAI: a profile with NO mandatory concepts sends the ORIGINAL schema - identical provider traffic to before this feature existed', async () => {
  const state = stubProvider(baseResult());
  const result = await analyzeSession(body('openai', withoutMandatory()));
  assert.equal(JSON.stringify(state.last.body.text.format), JSON.stringify(sessionAnalysisFormat), 'the schema must be byte-identical to the base format');
  assert.equal('conceptCoverage' in state.last.body.text.format.schema.properties, false);
  assert.equal('optionalSchemaKeys' in state.last.body, false);
  assert.equal('conceptCoverage' in result.data, false, 'no coverage field at all on the result when there is nothing to cover');
});

test('the same holds with no profile at all', async () => {
  const state = stubProvider(baseResult());
  const result = await analyzeSession(body('openai', null));
  assert.equal(JSON.stringify(state.last.body.text.format), JSON.stringify(sessionAnalysisFormat));
  assert.equal('conceptCoverage' in result.data, false);
});

test('the returned result carries the server-rebuilt coverage: one row per mandatory concept, the request\'s ids, in order', async () => {
  stubProvider({ ...baseResult(), conceptCoverage: goodCoverage() });
  const result = await analyzeSession(body('openai', withMandatory()));
  assert.deepEqual(result.data.conceptCoverage, [
    { conceptId: 'c1', title: 'Swept liquidity levels', status: 'applied', evidence: 'Asia low swept' },
    { conceptId: 'c2', title: 'Elliott impulse count', status: 'not_visible', evidence: 'too few candles' }
  ]);
});

test('the model omitting a concept, garbling a status or inventing a concept never reaches the result as a claim: unaddressed / dropped', async () => {
  stubProvider({ ...baseResult(), conceptCoverage: [
    { conceptTitle: 'Swept liquidity levels', status: 'totally_done', evidence: 'x' }, { conceptTitle: 'Invented concept', status: 'applied', evidence: 'y' }
  ] });
  const result = await analyzeSession(body('openai', withMandatory()));
  assert.deepEqual(result.data.conceptCoverage.map((r) => [r.conceptId, r.status]), [['c1', 'unaddressed'], ['c2', 'unaddressed']]);
  assert.ok(!JSON.stringify(result.data).includes('Invented concept'));
});

test('the output budget is widened by exactly the coverage allowance, and only when there is something to cover', async () => {
  const withState = stubProvider({ ...baseResult(), conceptCoverage: goodCoverage() });
  await analyzeSession(body('openai', withMandatory()));
  const withBudget = withState.last.body.max_output_tokens;
  const plainState = stubProvider(baseResult());
  await analyzeSession(body('openai', withoutMandatory()));
  const plainBudget = plainState.last.body.max_output_tokens;
  assert.equal(withBudget - plainBudget, 2 * 90, 'two mandatory concepts -> 2 x COVERAGE_TOKENS_PER_CONCEPT extra output tokens');
  assert.equal(plainBudget, sessionAnalysisOutputBudget('initial', undefined, 'low'));
  assert.ok(plainBudget <= SESSION_ANALYSIS_OUTPUT_BUDGET.initial);
});

// ---- the prompt ----------------------------------------------------------------------------------------------

test('the Session prompt carries the coverage instruction only when there are mandatory concepts, AFTER the adherence line (so the brief stays directly followed by adherence)', () => {
  const withPrompt = buildSessionAnalysisSystemPrompt({ analysisType: 'initial', analysisProfile: withMandatory(), adherence: 'strict' }, 'English');
  assert.match(withPrompt, /Concept coverage: your JSON response MUST include a `conceptCoverage` array/);
  assert.ok(withPrompt.indexOf('The trader set adherence to STRICT') < withPrompt.indexOf('Concept coverage:'), 'the format instruction follows the adherence line');
  const without = buildSessionAnalysisSystemPrompt({ analysisType: 'initial', analysisProfile: withoutMandatory(), adherence: 'strict' }, 'English');
  assert.doesNotMatch(without, /Concept coverage:/);
  assert.doesNotMatch(buildSessionAnalysisSystemPrompt({ analysisType: 'initial', analysisProfile: null }, 'English'), /Concept coverage:/);
});

// ---- Anthropic (non-strict): omission must degrade, not fail ---------------------------------------------------------

test('Anthropic: the tool input_schema carries conceptCoverage, and a model that OMITS it does NOT fail the analysis - every mandatory concept is honestly unaddressed', async () => {
  const state = stubProvider(baseResult()); // no conceptCoverage in the tool output
  const result = await analyzeSession(body('anthropic', withMandatory()));
  const tool = state.last.body.tools[0];
  assert.ok(tool.input_schema.properties.conceptCoverage);
  assert.deepEqual(result.data.conceptCoverage.map((r) => r.status), ['unaddressed', 'unaddressed']);
});

test('Anthropic: the tolerance is ONLY for conceptCoverage - a missing REAL required key still fails with SCHEMA_VALIDATION_FAILED', async () => {
  const broken = baseResult();
  delete broken.thesis;
  stubProvider(broken);
  await assert.rejects(() => analyzeSession(body('anthropic', withMandatory())), /SCHEMA_VALIDATION_FAILED/);
});

test('Anthropic: a complete answer is honoured', async () => {
  stubProvider({ ...baseResult(), conceptCoverage: goodCoverage() });
  const result = await analyzeSession(body('anthropic', withMandatory()));
  assert.deepEqual(result.data.conceptCoverage.map((r) => r.status), ['applied', 'not_visible']);
});

// ---- Gemini (the schema with two prior incidents) -------------------------------------------------------------------

function walk(node, visit) {
  if (Array.isArray(node)) return node.forEach((n) => walk(n, visit));
  if (node && typeof node === 'object') { visit(node); Object.values(node).forEach((n) => walk(n, visit)); }
}

test('Gemini: the compacted response schema still contains conceptCoverage with its required item keys, and the compaction strips its enum/maxItems exactly as everywhere else', async () => {
  const state = stubProvider({ ...baseResult(), conceptCoverage: goodCoverage() });
  await analyzeSession(body('gemini', withMandatory()));
  const schema = state.last.body.generationConfig.responseSchema;
  const coverage = schema.properties.conceptCoverage;
  assert.ok(coverage, 'the coverage property must survive Gemini schema compaction');
  assert.deepEqual([...coverage.items.required].sort(), ['conceptTitle', 'evidence', 'status']);
  assert.ok(schema.required.includes('conceptCoverage'));
  walk(coverage, (node) => {
    assert.ok(!('enum' in node), 'Gemini rejects large/complex enum constraints - compaction must strip them from the new property too');
    assert.ok(!('maxItems' in node));
  });
  // The whole compacted schema must be free of the constraint keys the production incident proved Gemini rejects.
  walk(schema, (node) => { assert.ok(!('enum' in node) && !('maxItems' in node) && !('minItems' in node), 'no enum/maxItems/minItems anywhere in the compacted Gemini schema'); });
});

test('Gemini: omission degrades to unaddressed; a garbled status is dropped server-side even though Gemini could not enforce the enum', async () => {
  stubProvider(baseResult());
  const omitted = await analyzeSession(body('gemini', withMandatory()));
  assert.deepEqual(omitted.data.conceptCoverage.map((r) => r.status), ['unaddressed', 'unaddressed']);
  stubProvider({ ...baseResult(), conceptCoverage: [{ conceptTitle: 'Swept liquidity levels', status: 'maybe??', evidence: 'x' }, ...goodCoverage().slice(1)] });
  const garbled = await analyzeSession(body('gemini', withMandatory()));
  assert.deepEqual(garbled.data.conceptCoverage.map((r) => r.status), ['unaddressed', 'not_visible']);
});

test('Gemini: a profile with no mandatory concepts sends a schema with no conceptCoverage at all', async () => {
  const state = stubProvider(baseResult());
  await analyzeSession(body('gemini', withoutMandatory()));
  assert.equal('conceptCoverage' in state.last.body.generationConfig.responseSchema.properties, false);
});

// ---- Kimi / DeepSeek (json_object mode: no schema, only the instruction) ----------------------------------------------

test('Kimi: the JSON-only instruction lists conceptCoverage among the required keys, and the system prompt spells out the entry shape (their only description of it)', async () => {
  const state = stubProvider({ ...baseResult(), conceptCoverage: goodCoverage() });
  const result = await analyzeSession(body('kimi', withMandatory()));
  const messages = state.last.body.messages;
  const last = messages[messages.length - 1];
  const lastText = typeof last.content === 'string' ? last.content : last.content.map((p) => p.text || '').join('');
  assert.match(lastText, /exactly these keys: [^.]*conceptCoverage/);
  assert.match(messages[0].content, /`conceptTitle`.*`status`.*`evidence`/s);
  assert.deepEqual(result.data.conceptCoverage.map((r) => r.status), ['applied', 'not_visible']);
});

test('DeepSeek: omission of conceptCoverage is tolerated the same way', async () => {
  stubProvider(baseResult());
  const result = await analyzeSession(body('deepseek', withMandatory()));
  assert.deepEqual(result.data.conceptCoverage.map((r) => r.status), ['unaddressed', 'unaddressed']);
});
