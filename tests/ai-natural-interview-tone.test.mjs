import assert from 'node:assert/strict';
import test, { after, afterEach } from 'node:test';

// Voice/Chat form-interview workflow upgrade, natural-interaction pass: real, behavioral coverage
// of the server-side system-prompt text itself (not just that the client threads
// formWriteConfirmation to the server, already covered by tests/chat-dock-core.test.mjs) - the same
// dockChat()/captureOpenAIRequest() convention tests/ai-dock-chat-quality.test.mjs and
// tests/companion-context-prompt.test.mjs already established.

const serverModule = await import('../server/pattern-ai-server.mjs');
const { dockChat } = serverModule;
const server = serverModule.default;

after(() => { server.close(); });

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const HEALTH_EVENT_URL = '/internal/ai-health-event';
const neutralHealthEventResponse = { ok: true, json: async () => ({}) };

function withEnv(vars, fn) {
  const originals = {};
  for (const key of Object.keys(vars)) { originals[key] = process.env[key]; process.env[key] = vars[key]; }
  return Promise.resolve().then(fn).finally(() => {
    for (const key of Object.keys(vars)) { if (originals[key] === undefined) delete process.env[key]; else process.env[key] = originals[key]; }
  });
}

function captureOpenAIRequest(replyPayload) {
  let seenBody = null;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes(HEALTH_EVENT_URL)) return neutralHealthEventResponse;
    seenBody = JSON.parse(options.body);
    return { ok: true, json: async () => ({ output_text: JSON.stringify(replyPayload), usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } }) };
  };
  return () => seenBody;
}

// --- defect 1: the form-suggestion prompt is preference-aware, never a blanket "must approve" ---

test('formWriteConfirmation absent/\'direct\': the activeProcess prompt says values are entered directly, and never says the user must approve a value first', async () => {
  const getBody = captureOpenAIRequest({ reply: 'ok', suggestions: [] });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
    await dockChat({ provider: 'openai', message: 'New York', language: 'en', activeProcess: { id: 'session-create', allowlist: ['city'] } });
  });
  const systemText = getBody().input[0].content[0].text;
  assert.match(systemText, /entered directly into the real, visible form/i);
  assert.doesNotMatch(systemText, /must approve it before it applies/i);
});

test('formWriteConfirmation: \'ask_each\': the activeProcess prompt asks for one short yes/no confirmation per value instead', async () => {
  const getBody = captureOpenAIRequest({ reply: 'ok', suggestions: [] });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
    await dockChat({ provider: 'openai', message: 'New York', language: 'en', activeProcess: { id: 'session-create', allowlist: ['city'] }, formWriteConfirmation: 'ask_each' });
  });
  const systemText = getBody().input[0].content[0].text;
  assert.match(systemText, /confirm every value before it is entered/i);
  assert.match(systemText, /short, natural yes\/no confirmation/i);
});

// --- the deterministic next-question contract ---

test('activeProcess.nextQuestion, when supplied, tells the model exactly which field to ask about next, using its real label/options', async () => {
  const getBody = captureOpenAIRequest({ reply: 'ok', suggestions: [] });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
    await dockChat({
      provider: 'openai', message: 'hi', language: 'en',
      activeProcess: {
        id: 'session-create', allowlist: ['city', 'timeframe'],
        nextQuestion: { path: 'city', label: 'City', options: [{ value: 'New York', label: 'New York' }] }
      }
    });
  });
  const systemText = getBody().input[0].content[0].text;
  assert.match(systemText, /next question to ask.*is the field "city"/i);
  assert.match(systemText, /labeled "City"/);
  assert.match(systemText, /New York/);
});

test('no activeProcess.nextQuestion supplied: the prompt never fabricates one - the instruction is simply absent', async () => {
  const getBody = captureOpenAIRequest({ reply: 'ok', suggestions: [] });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
    await dockChat({ provider: 'openai', message: 'hi', language: 'en', activeProcess: { id: 'session-create', allowlist: ['city'] } });
  });
  const systemText = getBody().input[0].content[0].text;
  assert.doesNotMatch(systemText, /next question to ask/i);
});

// --- natural interview tone ---

test('the activeProcess prompt asks for a warm, grounded reaction, with the exact DO/DON\'T calibration example (react to what was said, never invent an assumption like gender/family from marital status)', async () => {
  const getBody = captureOpenAIRequest({ reply: 'ok', suggestions: [] });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
    await dockChat({ provider: 'openai', message: 'x', language: 'en', activeProcess: { id: 'mh-intake', allowlist: ['intake.demographics.maritalStatus'] } });
  });
  const systemText = getBody().input[0].content[0].text;
  assert.match(systemText, /warm, attentive person actually listening/i);
  assert.match(systemText, /Got it, married - thanks for sharing/);
  assert.match(systemText, /family man/i, 'the explicit DON\'T example must be present, so the model sees the exact assumption to avoid');
  assert.match(systemText, /never invent a conclusion, a label for the person, or a fact they did not state/i);
});

test('a psychology-domain process (mh-/psychology- prefixed) gets the stricter non-diagnostic, never-cheerful-about-distress clause', async () => {
  const getBody = captureOpenAIRequest({ reply: 'ok', suggestions: [] });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
    await dockChat({ provider: 'openai', message: 'x', language: 'en', activeProcess: { id: 'mh-intake', allowlist: ['intake.financialContext.borrowedMoneyForTrading'] } });
  });
  const systemText = getBody().input[0].content[0].text;
  assert.match(systemText, /plainly non-diagnostic, never clinical/i);
  assert.match(systemText, /never sound cheerful, amused, or congratulatory about anything that could indicate financial distress, debt, a large loss, revenge trading/i);
});

test('an ordinary (non-psychology) process does NOT get the psychology-specific safety clause - it stays scoped, not padded onto every form', async () => {
  const getBody = captureOpenAIRequest({ reply: 'ok', suggestions: [] });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
    await dockChat({ provider: 'openai', message: 'New York', language: 'en', activeProcess: { id: 'session-create', allowlist: ['city'] } });
  });
  const systemText = getBody().input[0].content[0].text;
  assert.match(systemText, /warm, attentive person actually listening/i, 'the general warm-tone instruction still applies to every form');
  assert.doesNotMatch(systemText, /plainly non-diagnostic/i);
  assert.doesNotMatch(systemText, /revenge trading/i);
});

test('psychology.mood-log and other psychology- (not just mh-) prefixed processIds also get the stricter clause', async () => {
  const getBody = captureOpenAIRequest({ reply: 'ok', suggestions: [] });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
    await dockChat({ provider: 'openai', message: 'x', language: 'en', activeProcess: { id: 'psychology-mood-log', allowlist: ['mood'] } });
  });
  const systemText = getBody().input[0].content[0].text;
  assert.match(systemText, /plainly non-diagnostic/i);
});

// --- analysis Q&A grounding (the confirmed missing piece behind "Q&A uses real analysis context") ---

test('a sessionAnalysis entry in productContext.userMemory adds the analysis Q&A grounding instruction - answer from the real data, preserve uncertainty, never personalized financial advice', async () => {
  const getBody = captureOpenAIRequest({ reply: 'ok', action: null });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
    await dockChat({
      provider: 'openai', message: 'what does that zone mean?', language: 'en',
      productContext: { userMemory: [{ type: 'sessionAnalysis', data: { thesisHeadline: 'Coiling under resistance' } }] }
    });
  });
  const systemText = getBody().input[0].content[0].text;
  assert.match(systemText, /real, already-generated analysis/i);
  assert.match(systemText, /preserving whatever uncertainty it already expresses/i);
  assert.match(systemText, /never turn an explanation into personalized financial advice/i);
});

test('no sessionAnalysis entry present: the analysis Q&A grounding instruction is absent, never padding an unrelated turn', async () => {
  const getBody = captureOpenAIRequest({ reply: 'ok', action: null });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
    await dockChat({ provider: 'openai', message: 'hi', language: 'en' });
  });
  const systemText = getBody().input[0].content[0].text;
  assert.doesNotMatch(systemText, /real, already-generated analysis/i);
});

test('a productContext with only ordinary (non-sessionAnalysis) userMemory entries does not trigger the analysis Q&A instruction', async () => {
  const getBody = captureOpenAIRequest({ reply: 'ok', action: null });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
    await dockChat({
      provider: 'openai', message: 'hi', language: 'en',
      productContext: { userMemory: [{ type: 'session', data: { id: 's1', name: 'NY' } }] }
    });
  });
  const systemText = getBody().input[0].content[0].text;
  assert.doesNotMatch(systemText, /real, already-generated analysis/i);
});
