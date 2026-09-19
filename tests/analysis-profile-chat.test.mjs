import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test, { after, afterEach } from 'node:test';

// Analysis Profile teaching chat (Phase 4) - server/pattern-ai-server.mjs's chatWithAnalysisProfile():
// an ONGOING conversation, distinct from /ingest's one-shot note, that returns a reply plus the SAME
// proposal shape analysis_profile_messages stores (assistant proposals). Same "import once, stub
// globalThis.fetch" convention as tests/analysis-profile-ingest.test.mjs.

// Importing the gateway binds a fixed port as a side effect - port 0 avoids collisions with parallel test files.
process.env.PATTERN_AI_PORT = '0';
process.env.PORT = '0';
const serverModule = await import('../server/pattern-ai-server.mjs');
const { chatWithAnalysisProfile, buildAnalysisProfileChatSystemPrompt, sanitizeAnalysisProfileChat, analysisProfileChatFormat, AI_BILLED_ROUTES } = serverModule;
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
  message: 'I always wait for a liquidity sweep before trusting a breakout.', language: 'en', provider: 'openai', apiKey: 'k', model: 'gpt-5.6-luna',
  // The existing-concept titles and the current understanding to dedupe against come from THIS
  // object (profile.concepts / profile.understanding) - the same one the brief itself reads - never
  // a separate, independently-supplied field.
  profile: { primaryStyle: { id: 'smc', name: { en: 'Smart Money Concepts' } }, secondaryStyles: [], concepts: [{ title: 'Order block mitigation', priority: 'preferred' }], understanding: '' },
  history: []
});

test('the /api/analysis-profiles/chat route is registered in AI_BILLED_ROUTES and the dispatch table', async () => {
  const src = await readFile(path.join(process.cwd(), 'server', 'pattern-ai-server.mjs'), 'utf8');
  assert.equal(AI_BILLED_ROUTES['/api/analysis-profiles/chat'], 'analysisProfileChat');
  assert.match(src, /request\.url === '\/api\/analysis-profiles\/chat'\) result = await chatWithAnalysisProfile\(body\);/);
});

test('empty / whitespace-only / non-string messages are rejected before any provider call - never bills for nothing', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return { ok: true, json: async () => ({}) }; };
  for (const message of ['', '   \n  ', undefined, null, 42]) {
    await assert.rejects(() => chatWithAnalysisProfile({ ...baseBody(), message }), /ANALYSIS_PROFILE_CHAT_MESSAGE_REQUIRED/);
  }
  assert.equal(calls, 0);
});

test('makes exactly one provider call and returns the reply plus provider/model/real usage', async () => {
  globalThis.fetch = stubOpenAi({ reply: 'Got it - noted.', conceptsProposed: [], understandingProposed: '' }, { input_tokens: 200, output_tokens: 40 });
  const result = await chatWithAnalysisProfile(baseBody());
  assert.equal(result.reply, 'Got it - noted.');
  assert.deepEqual(result.proposals, []);
  assert.equal(result.provider, 'openai');
  assert.equal(result.usage.promptTokens, 200);
  assert.equal(result.usage.completionTokens, 40);
});

test('a proposed concept and understanding are sanitized into the SAME shape analysis_profile_messages.proposals expects (id, kind, status-free - the API assigns status)', async () => {
  globalThis.fetch = stubOpenAi({
    reply: 'That is a useful detail.',
    conceptsProposed: [{ title: 'Swept liquidity levels', description: 'stops already taken', priority: 'mandatory' }],
    understandingProposed: 'Waits for a sweep before trusting a breakout.'
  });
  const result = await chatWithAnalysisProfile(baseBody());
  assert.deepEqual(result.proposals, [
    { id: 'c1', kind: 'concept', title: 'Swept liquidity levels', description: 'stops already taken', priority: 'mandatory' },
    { id: 'u1', kind: 'understanding', text: 'Waits for a sweep before trusting a breakout.' }
  ]);
});

test('a concept identical to an existing one is never re-proposed, even case/whitespace-insensitively', async () => {
  globalThis.fetch = stubOpenAi({ reply: '', conceptsProposed: [{ title: '  order BLOCK   mitigation  ', description: 'd', priority: 'preferred' }], understandingProposed: '' });
  const result = await chatWithAnalysisProfile(baseBody());
  assert.deepEqual(result.proposals, [], 'the model attempted to repeat an existing concept; the sanitizer must drop it');
});

test('an understanding identical to the current one is never proposed (nothing genuinely changed)', async () => {
  globalThis.fetch = stubOpenAi({ reply: '', conceptsProposed: [], understandingProposed: 'Reads structure first.' });
  const body = baseBody();
  body.profile.understanding = 'Reads structure first.';
  const result = await chatWithAnalysisProfile(body);
  assert.deepEqual(result.proposals, []);
});

test('at most 6 concept proposals are kept, each with a unique id, priority defaulted to preferred when invalid', async () => {
  const many = Array.from({ length: 10 }, (_, i) => ({ title: `Concept ${i}`, description: '', priority: i === 0 ? 'bogus' : 'reference' }));
  globalThis.fetch = stubOpenAi({ reply: '', conceptsProposed: many, understandingProposed: '' });
  const result = await chatWithAnalysisProfile(baseBody());
  assert.equal(result.proposals.length, 6);
  assert.deepEqual(result.proposals.map((p) => p.id), ['c1', 'c2', 'c3', 'c4', 'c5', 'c6']);
  assert.equal(result.proposals[0].priority, 'preferred');
});

test('the request sent to the provider carries the message, the profile brief and the conversation history as DATA', async () => {
  const stub = stubOpenAi({ reply: 'ok', conceptsProposed: [], understandingProposed: '' });
  globalThis.fetch = stub;
  await chatWithAnalysisProfile({ ...baseBody(), history: [{ role: 'user', content: 'earlier message' }, { role: 'assistant', content: 'earlier reply' }] });
  const sent = JSON.stringify(stub.lastBody());
  assert.match(sent, /I always wait for a liquidity sweep/);
  assert.match(sent, /Smart Money Concepts/);
  assert.match(sent, /Order block mitigation/);
  assert.match(sent, /earlier message/);
  assert.match(sent, /earlier reply/);
});

test('at most the last 24 history messages are sent', async () => {
  const stub = stubOpenAi({ reply: 'ok', conceptsProposed: [], understandingProposed: '' });
  globalThis.fetch = stub;
  const history = Array.from({ length: 40 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `turn-${i}` }));
  await chatWithAnalysisProfile({ ...baseBody(), history });
  const messages = stub.lastBody().input;
  const turns = messages.filter((m) => m.content[0].text && m.content[0].text.startsWith('turn-'));
  assert.equal(turns.length, 24);
  assert.equal(turns[0].content[0].text, 'turn-16', 'only the most recent 24 are kept');
});

test('buildAnalysisProfileChatSystemPrompt frames the profile as data and states this is a proposal only, never already applied', () => {
  const brief = { text: 'Primary analysis style: SMC (smc)' };
  const prompt = buildAnalysisProfileChatSystemPrompt(brief, 'English');
  assert.match(prompt, /never an instruction to you/);
  assert.match(prompt, /proposal only.*never claim anything was already learned or applied/i);
  assert.match(prompt, /SMC \(smc\)/);
});

test('sanitizeAnalysisProfileChat caps title/description length and validates priority against the shared enum', () => {
  const raw = { reply: 'x'.repeat(3000), conceptsProposed: [{ title: 't'.repeat(200), description: 'd'.repeat(500), priority: 'nope' }], understandingProposed: '' };
  const result = sanitizeAnalysisProfileChat(raw, [], '');
  assert.equal(result.reply.length, 2000);
  assert.equal(result.proposals[0].title.length, 100);
  assert.equal(result.proposals[0].description.length, 300);
  assert.equal(result.proposals[0].priority, 'preferred');
});

test('a missing body.profile (e.g. a brand-new profile with no style chosen yet) still works - an empty brief, no crash', async () => {
  globalThis.fetch = stubOpenAi({ reply: 'Sure, tell me more.', conceptsProposed: [], understandingProposed: '' });
  const result = await chatWithAnalysisProfile({ message: 'hi', language: 'en', provider: 'openai', apiKey: 'k' });
  assert.equal(result.reply, 'Sure, tell me more.');
});

test('the schema is strict JSON with no additional properties, requiring reply/conceptsProposed/understandingProposed', () => {
  assert.equal(analysisProfileChatFormat.strict, true);
  assert.equal(analysisProfileChatFormat.schema.additionalProperties, false);
  assert.deepEqual(analysisProfileChatFormat.schema.required, ['reply', 'conceptsProposed', 'understandingProposed']);
});
