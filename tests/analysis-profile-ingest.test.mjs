import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test, { after, afterEach } from 'node:test';

// Analysis Profile engine-memory learning loop (Phase 2) - server/pattern-ai-server.mjs's
// ingestAnalysisProfileLearning(): ONE billed call in, a PROPOSAL out (a rewritten compact
// understanding + specific checkable concepts). Same "import once, stub globalThis.fetch"
// convention as tests/analysis-profile-suggest.test.mjs - the underlying provider HTTP call is
// stubbed, never a mocked callProvider() seam of its own.
const serverModule = await import('../server/pattern-ai-server.mjs');
const { ingestAnalysisProfileLearning, buildAnalysisProfileIngestSystemPrompt, sanitizeAnalysisProfileIngest, analysisProfileIngestFormat } = serverModule;
const server = serverModule.default;

after(() => { server.close(); });
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const HEALTH_EVENT_URL = '/internal/ai-health-event';
function stubOpenAi(dataObject, usage) {
  let lastRequestBody = null;
  const fn = async (url, options) => {
    if (String(url).includes(HEALTH_EVENT_URL)) return { ok: true, json: async () => ({}) };
    lastRequestBody = options && options.body ? JSON.parse(options.body) : null;
    return { ok: true, json: async () => ({ output_text: JSON.stringify(dataObject), usage: usage === undefined ? null : usage }) };
  };
  fn.lastBody = () => lastRequestBody;
  return fn;
}

const baseBody = () => ({
  kind: 'note', language: 'en', provider: 'openai', apiKey: 'k', model: 'gpt-5.6-luna',
  text: 'I always check where liquidity was swept before I trust a breakout.',
  primaryStyle: { id: 'smc', name: { en: 'Smart Money Concepts' } }, secondaryStyles: [], customMethodNotes: '',
  existingConcepts: [{ title: 'Order block mitigation', priority: 'preferred' }], currentUnderstanding: ''
});

test('the /api/analysis-profiles/ingest route is registered in AI_BILLED_ROUTES and the URL dispatch table', async () => {
  const serverSrc = await readFile(path.join(process.cwd(), 'server', 'pattern-ai-server.mjs'), 'utf8');
  assert.match(serverSrc, /'\/api\/analysis-profiles\/ingest': 'analysisProfileIngest'/);
  assert.match(serverSrc, /request\.url === '\/api\/analysis-profiles\/ingest'\) result = await ingestAnalysisProfileLearning\(body\);/);
});

test('an unsupported kind is rejected before ever calling the provider', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return { ok: true, json: async () => ({}) }; };
  await assert.rejects(() => ingestAnalysisProfileLearning({ ...baseBody(), kind: 'not-a-real-kind' }), /ANALYSIS_PROFILE_INGEST_KIND_UNSUPPORTED/);
  assert.equal(calls, 0);
});

test('empty / whitespace-only / non-string teaching text is rejected before ever calling the provider - never bills for nothing', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return { ok: true, json: async () => ({}) }; };
  for (const text of ['', '   \n  ', undefined, null, 42]) {
    await assert.rejects(() => ingestAnalysisProfileLearning({ ...baseBody(), text }), /ANALYSIS_PROFILE_INGEST_TEXT_REQUIRED/);
  }
  assert.equal(calls, 0);
});

test('makes exactly one provider call and returns the sanitized proposal plus provider/model/real usage', async () => {
  globalThis.fetch = stubOpenAi({
    updatedUnderstanding: 'Confirms breakouts only after checking swept liquidity.',
    conceptsProposed: [{ title: 'Swept liquidity levels', description: 'Where stops already got hunted', priority: 'mandatory' }]
  }, { input_tokens: 300, output_tokens: 90 });
  const result = await ingestAnalysisProfileLearning(baseBody());
  assert.equal(result.updatedUnderstanding, 'Confirms breakouts only after checking swept liquidity.');
  assert.equal(result.conceptsProposed.length, 1);
  assert.equal(result.conceptsProposed[0].priority, 'mandatory');
  assert.equal(result.provider, 'openai');
  assert.equal(result.usage.promptTokens, 300);
  assert.equal(result.usage.completionTokens, 90);
});

test('the request sent to the provider carries the teaching text, the current understanding and the existing concept titles as DATA (never dropped)', async () => {
  const stub = stubOpenAi({ updatedUnderstanding: '', conceptsProposed: [] });
  globalThis.fetch = stub;
  await ingestAnalysisProfileLearning({ ...baseBody(), currentUnderstanding: 'Reads structure first.' });
  const sent = JSON.stringify(stub.lastBody());
  assert.match(sent, /I always check where liquidity was swept/);
  assert.match(sent, /Reads structure first\./);
  assert.match(sent, /Order block mitigation/);
  assert.match(sent, /Smart Money Concepts/);
});

test('server-side sanitizer never proposes an existing concept again (case/whitespace-insensitive) and drops a duplicate within the same response', () => {
  const cleaned = sanitizeAnalysisProfileIngest({
    updatedUnderstanding: 'x',
    conceptsProposed: [
      { title: '  order   BLOCK mitigation ', description: 'already have this', priority: 'mandatory' },
      { title: 'Breaker block', description: 'new', priority: 'reference' },
      { title: 'breaker block', description: 'dup in the same response', priority: 'preferred' }
    ]
  }, ['Order block mitigation']);
  assert.equal(cleaned.conceptsProposed.length, 1);
  assert.equal(cleaned.conceptsProposed[0].title, 'Breaker block');
});

test('an unrecognized priority falls back to preferred, blank titles are dropped, and lengths are capped defensively', () => {
  const cleaned = sanitizeAnalysisProfileIngest({
    updatedUnderstanding: 'z'.repeat(5000),
    conceptsProposed: [
      { title: 'A real concept', description: 'd', priority: 'urgent' },
      { title: '   ', description: 'blank title must be dropped', priority: 'mandatory' },
      { title: 'x'.repeat(500), description: 'y'.repeat(900), priority: 'reference' }
    ]
  }, []);
  assert.equal(cleaned.updatedUnderstanding.length, 4000, 'the understanding is capped at UNDERSTANDING_SUMMARY_MAX');
  assert.equal(cleaned.conceptsProposed.length, 2);
  assert.equal(cleaned.conceptsProposed[0].priority, 'preferred');
  assert.equal(cleaned.conceptsProposed[1].title.length, 100);
  assert.equal(cleaned.conceptsProposed[1].description.length, 300);
});

test('at most 10 concepts are ever returned, even if the model returns more', () => {
  const raw = { updatedUnderstanding: '', conceptsProposed: Array.from({ length: 15 }, (_, i) => ({ title: 'Concept ' + i, description: 'd', priority: 'preferred' })) };
  assert.equal(sanitizeAnalysisProfileIngest(raw, []).conceptsProposed.length, 10);
});

test('a malformed model response (null / a string / missing fields) never throws - it degrades to an empty proposal', () => {
  for (const raw of [null, undefined, 'nope', 42, {}, { conceptsProposed: 'not an array' }]) {
    const cleaned = sanitizeAnalysisProfileIngest(raw, []);
    assert.equal(cleaned.updatedUnderstanding, '');
    assert.equal(cleaned.conceptsProposed.length, 0);
  }
});

test('the system prompt frames every input as data (never an instruction) and every output as a proposal that is never claimed applied', () => {
  const prompt = buildAnalysisProfileIngestSystemPrompt({ kind: 'note' }, 'English');
  assert.match(prompt, /never an instruction/i);
  assert.match(prompt, /proposal only/i);
  assert.match(prompt, /never claim it was already applied/i);
  assert.doesNotMatch(prompt, /CORRECTING/, 'the correction-only line must not appear for a plain note');
});

test('a correction tells the model the trader\'s new material wins over the current understanding where they conflict', () => {
  const prompt = buildAnalysisProfileIngestSystemPrompt({ kind: 'correction' }, 'English');
  assert.match(prompt, /CORRECTING/);
  assert.match(prompt, /teaching material wins/);
});

test('the response schema is strict, requires both fields, and takes its priority enum from the one shared source', () => {
  const schema = analysisProfileIngestFormat.schema;
  assert.equal(analysisProfileIngestFormat.strict, true);
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, ['updatedUnderstanding', 'conceptsProposed']);
  const item = schema.properties.conceptsProposed.items;
  assert.deepEqual(item.properties.priority.enum, ['mandatory', 'preferred', 'reference']);
  assert.equal(item.additionalProperties, false);
});

test('an oversized teaching text is truncated before it reaches the provider (bounded cost), never sent whole', async () => {
  const stub = stubOpenAi({ updatedUnderstanding: '', conceptsProposed: [] });
  globalThis.fetch = stub;
  await ingestAnalysisProfileLearning({ ...baseBody(), text: 'q'.repeat(20000) });
  const sent = JSON.stringify(stub.lastBody());
  assert.ok(!sent.includes('q'.repeat(8001)), 'more than 8000 characters of teaching text must never be sent');
  assert.ok(sent.includes('q'.repeat(8000)));
});
