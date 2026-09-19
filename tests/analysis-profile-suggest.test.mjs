import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test, { after, afterEach } from 'node:test';

// Analysis Profile onboarding Step 2's "Suggest more with AI" (regenerate) - server/pattern-ai-
// server.mjs's suggestAnalysisProfile(). Same "import once, stub globalThis.fetch" convention
// tests/session-analysis-server.test.mjs already uses - this stubs the underlying provider HTTP
// call, never a mocked callProvider() seam of its own.
const serverModule = await import('../server/pattern-ai-server.mjs');
const { suggestAnalysisProfile, buildAnalysisProfileSuggestSystemPrompt, sanitizeAnalysisProfileSuggestions } = serverModule;
const server = serverModule.default;

after(() => { server.close(); });
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const HEALTH_EVENT_URL = '/internal/ai-health-event';
const neutralHealthEventResponse = { ok: true, json: async () => ({}) };
function stubOpenAi(dataObject, usage) {
  return async (url) => {
    if (String(url).includes(HEALTH_EVENT_URL)) return neutralHealthEventResponse;
    return { ok: true, json: async () => ({ output_text: JSON.stringify(dataObject), usage: usage === undefined ? null : usage }) };
  };
}

const baseBody = () => ({
  kind: 'focuses', language: 'en', provider: 'openai', apiKey: 'k', model: 'gpt-5.6-luna',
  primaryStyle: { id: 'price_action', name: { en: 'Price Action' } }, secondaryStyles: [], customMethodNotes: '',
  alreadySelected: [], alreadySuggested: []
});

test('the /api/analysis-profiles/suggest route is registered in AI_BILLED_ROUTES and the URL dispatch table', async () => {
  const serverSrc = await readFile(path.join(process.cwd(), 'server', 'pattern-ai-server.mjs'), 'utf8');
  assert.match(serverSrc, /'\/api\/analysis-profiles\/suggest': 'analysisProfileSuggest'/);
  assert.match(serverSrc, /request\.url === '\/api\/analysis-profiles\/suggest'\) result = await suggestAnalysisProfile\(body\);/);
});

test('an unsupported kind is rejected before ever calling the provider', async () => {
  let calls = 0;
  globalThis.fetch = async (...args) => { calls += 1; return stubOpenAi({ suggestions: [] })(...args); };
  await assert.rejects(() => suggestAnalysisProfile({ ...baseBody(), kind: 'not-a-real-kind' }), /ANALYSIS_PROFILE_SUGGEST_KIND_UNSUPPORTED/);
  assert.equal(calls, 0);
});

test('the system prompt weaves in the primary/secondary styles and forbids repeating a selected/suggested item', () => {
  const prompt = buildAnalysisProfileSuggestSystemPrompt({}, 'English');
  assert.match(prompt, /never/i);
  assert.match(prompt, /proposal only/i);
});

test('makes exactly one provider call and returns the sanitized suggestions plus provider/model/usage', async () => {
  globalThis.fetch = stubOpenAi({ suggestions: [{ name: 'Swept liquidity levels', description: 'Where stops already got hunted' }] }, { input_tokens: 100, output_tokens: 20 });
  const result = await suggestAnalysisProfile(baseBody());
  assert.equal(result.suggestions.length, 1);
  assert.equal(result.suggestions[0].name, 'Swept liquidity levels');
  assert.equal(result.provider, 'openai');
  assert.equal(result.usage.promptTokens, 100);
  assert.equal(result.usage.completionTokens, 20);
});

test('server-side sanitizer drops a suggestion colliding (case/whitespace-insensitive) with an already-selected or already-suggested name - never trusts the model alone', () => {
  const cleaned = sanitizeAnalysisProfileSuggestions(
    [{ name: '  Swept   Liquidity Levels  ', description: 'x' }, { name: 'Order block mitigation', description: 'y' }, { name: 'Order block mitigation', description: 'dup within the same response' }],
    ['swept liquidity levels']
  );
  assert.equal(cleaned.length, 1, 'the pre-existing selection and the in-response duplicate must both be dropped');
  assert.equal(cleaned[0].name, 'Order block mitigation');
});

test('server-side sanitizer drops a blank name and caps at 8 suggestions even if the model returns more', () => {
  const raw = Array.from({ length: 12 }, (_, i) => ({ name: 'Focus ' + i, description: 'd' }));
  raw.push({ name: '   ', description: 'blank name must be dropped' });
  const cleaned = sanitizeAnalysisProfileSuggestions(raw, []);
  assert.equal(cleaned.length, 8);
  assert.ok(cleaned.every((s) => s.name.trim().length > 0));
});

test('an oversized name/description is truncated defensively, never crashes or is stored verbatim', () => {
  const cleaned = sanitizeAnalysisProfileSuggestions([{ name: 'x'.repeat(500), description: 'y'.repeat(500) }], []);
  assert.equal(cleaned[0].name.length, 80);
  assert.equal(cleaned[0].description.length, 240);
});

test('a full round trip through suggestAnalysisProfile also applies the sanitizer (regression: the handler must call it, not just return raw model output)', async () => {
  globalThis.fetch = stubOpenAi({ suggestions: [{ name: 'Momentum', description: 'already selected' }, { name: 'New idea', description: 'genuinely new' }] });
  const result = await suggestAnalysisProfile({ ...baseBody(), alreadySelected: ['Momentum'] });
  assert.equal(result.suggestions.length, 1);
  assert.equal(result.suggestions[0].name, 'New idea');
});
