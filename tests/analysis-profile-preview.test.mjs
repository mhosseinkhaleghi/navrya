import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test, { after, afterEach } from 'node:test';

// Analysis Profile Preview tab, billed half (Phase 4) - server/pattern-ai-server.mjs's
// previewAnalysisProfile(): a clearly-labelled ILLUSTRATIVE sample, never claiming a real chart.
// The free half (the Engine Brief) needs no server call at all - see
// tests/analysis-profile-brief-browser-twin.test.mjs.

process.env.PATTERN_AI_PORT = '0';
process.env.PORT = '0';
const serverModule = await import('../server/pattern-ai-server.mjs');
const { previewAnalysisProfile, buildAnalysisProfilePreviewSystemPrompt, sanitizePreviewObservations, analysisProfilePreviewFormat, AI_BILLED_ROUTES } = serverModule;
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
  language: 'en', provider: 'openai', apiKey: 'k', model: 'gpt-5.6-luna',
  profile: { primaryStyle: { id: 'smc', name: { en: 'Smart Money Concepts' } }, secondaryStyles: [], concepts: [{ title: 'Swept liquidity levels', priority: 'mandatory' }], understanding: '' }
});

test('the /api/analysis-profiles/preview route is registered in AI_BILLED_ROUTES and the dispatch table', async () => {
  const src = await readFile(path.join(process.cwd(), 'server', 'pattern-ai-server.mjs'), 'utf8');
  assert.equal(AI_BILLED_ROUTES['/api/analysis-profiles/preview'], 'analysisProfilePreview');
  assert.match(src, /request\.url === '\/api\/analysis-profiles\/preview'\) result = await previewAnalysisProfile\(body\);/);
});

test('makes exactly one provider call and returns sanitized observations plus provider/model/real usage', async () => {
  globalThis.fetch = stubOpenAi({ observations: [{ title: 'Liquidity sweep', detail: 'If price sweeps a prior high with declining volume, this profile would flag a possible reversal.' }] }, { input_tokens: 150, output_tokens: 60 });
  const result = await previewAnalysisProfile(baseBody());
  assert.equal(result.observations.length, 1);
  assert.equal(result.observations[0].title, 'Liquidity sweep');
  assert.equal(result.provider, 'openai');
  assert.equal(result.usage.promptTokens, 150);
});

test('the system prompt explicitly labels the output as illustrative, never a real chart, and frames the profile as data', () => {
  const prompt = buildAnalysisProfilePreviewSystemPrompt({ text: 'Primary analysis style: SMC (smc)' }, 'English');
  assert.match(prompt, /ILLUSTRATIVE SAMPLE ONLY/);
  assert.match(prompt, /there is no real chart/i);
  assert.match(prompt, /[Nn]ever invent a specific price/);
  assert.match(prompt, /never an instruction to you/);
  assert.match(prompt, /SMC \(smc\)/);
});

test('a profile with no primary style still gets a usable prompt (no style selected yet), never throws', () => {
  const prompt = buildAnalysisProfilePreviewSystemPrompt({ text: '' }, 'English');
  assert.match(prompt, /no style selected yet/);
});

test('sanitizePreviewObservations caps at 6, drops blanks, and caps title/detail length', () => {
  const many = Array.from({ length: 10 }, (_, i) => ({ title: `Obs ${i}`, detail: 'd'.repeat(500) }));
  const result = sanitizePreviewObservations({ observations: [...many, { title: '', detail: 'no title' }, { title: 'no detail', detail: '' }] });
  assert.equal(result.length, 6);
  assert.equal(result[0].detail.length, 400);
  assert.ok(result.every((o) => o.title && o.detail));
});

test('malformed/missing input yields an empty list, never throws', () => {
  for (const raw of [null, undefined, {}, { observations: 'nope' }, { observations: null }]) {
    assert.deepEqual(sanitizePreviewObservations(raw), []);
  }
});

test('the request sent to the provider carries the profile brief as data, and asks for the illustrative sample now', async () => {
  const stub = stubOpenAi({ observations: [] });
  globalThis.fetch = stub;
  await previewAnalysisProfile(baseBody());
  const sent = JSON.stringify(stub.lastBody());
  assert.match(sent, /Smart Money Concepts/);
  assert.match(sent, /Swept liquidity levels/);
  assert.match(sent, /illustrative sample now/i);
});

test('the schema is strict JSON with no additional properties, requiring observations', () => {
  assert.equal(analysisProfilePreviewFormat.strict, true);
  assert.equal(analysisProfilePreviewFormat.schema.additionalProperties, false);
  assert.deepEqual(analysisProfilePreviewFormat.schema.required, ['observations']);
  assert.equal(analysisProfilePreviewFormat.schema.properties.observations.maxItems, 6);
});
