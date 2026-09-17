import assert from 'node:assert/strict';
import test, { after, afterEach } from 'node:test';

// Character Interaction Policy (Hunter gate): server-side delivery-gear resolution in
// server/pattern-ai-server.mjs (HUNTER_GEAR_INSTRUCTION/hunterDeliveryGear/voiceCharacterReplyStyle).
// Same directly-exported dockChat() convention as tests/ai-dock-chat-quality.test.mjs.
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

// --- Hunter now gets character-aware delivery on a plain TEXT turn too (previously voice-only) ---

test('a plain text turn (no source, no character) defaults to Hunter\'s NORMAL gear - previously this turn got NO character style at all', async () => {
  const getBody = captureOpenAIRequest({ reply: 'ok' });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
    await dockChat({ provider: 'openai', message: 'hi', language: 'en' });
  });
  const systemText = getBody().input[0].content[0].text;
  assert.match(systemText, /speaking as Hunter/);
  assert.match(systemText, /fast, observant field partner/i);
  assert.match(systemText, /preserve every fact, number, safety warning, and required confirmation/);
});

test('an explicit non-Hunter character on a text turn gets no style at all, exactly as before (voice-only for every character but Hunter)', async () => {
  const getBody = captureOpenAIRequest({ reply: 'ok' });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
    await dockChat({ provider: 'openai', message: 'hi', language: 'en', character: 'commander' });
  });
  const systemText = getBody().input[0].content[0].text;
  assert.doesNotMatch(systemText, /speaking as/);
});

test('an explicit non-Hunter character on a VOICE turn still gets its own original one-line style, unchanged', async () => {
  const getBody = captureOpenAIRequest({ reply: 'ok', voiceReply: 'ok' });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
    await dockChat({ provider: 'openai', message: 'hi', language: 'en', character: 'engineer', source: 'voice' });
  });
  const systemText = getBody().input[0].content[0].text;
  assert.match(systemText, /You are speaking as the Market Engineer/);
});

// --- delivery gear classification ---

test('Hunter + an open, non-gate form field (activeProcess.nextQuestion.role !== "gate") gets the FOCUSED gear', async () => {
  const getBody = captureOpenAIRequest({ reply: 'ok', suggestions: [] });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
    await dockChat({
      provider: 'openai', message: 'New York', language: 'en',
      activeProcess: { id: 'session-create', allowlist: ['city'], nextQuestion: { path: 'city', label: 'City', role: 'editable' } }
    });
  });
  const systemText = getBody().input[0].content[0].text;
  assert.match(systemText, /fast, focused interview mode/i);
});

test('Hunter + a gate field as the next question (a destructive/override confirmation) gets the NEUTRAL gear - no metaphor, no humor', async () => {
  const getBody = captureOpenAIRequest({ reply: 'ok', suggestions: [] });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
    await dockChat({
      provider: 'openai', message: 'yes', language: 'en',
      activeProcess: { id: 'pattern-delete-confirm', allowlist: ['confirm'], nextQuestion: { path: 'confirm', label: 'Confirm delete', role: 'gate' } }
    });
  });
  const systemText = getBody().input[0].content[0].text;
  assert.match(systemText, /this is a confirmation step/i);
  assert.match(systemText, /drop the character flavor entirely/i);
  assert.doesNotMatch(systemText, /fast, observant field partner/i);
});

test('Hunter + a psychology-domain process (mh-/psychology- prefixed) gets the HUMAN_MOMENT gear', async () => {
  const getBody = captureOpenAIRequest({ reply: 'ok', suggestions: [] });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
    await dockChat({
      provider: 'openai', message: 'x', language: 'en',
      activeProcess: { id: 'mh-intake', allowlist: ['intake.demographics.maritalStatus'] }
    });
  });
  const systemText = getBody().input[0].content[0].text;
  assert.match(systemText, /quieter, more human moment/i);
  assert.doesNotMatch(systemText, /fast, focused interview mode/i);
});

test('a fresh action-discovery turn (availableActions, no activeProcess) gets Hunter\'s NORMAL gear, same as plain Q&A', async () => {
  const getBody = captureOpenAIRequest({ reply: 'ok', action: null });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
    await dockChat({ provider: 'openai', message: 'start a new york session', language: 'en', availableActions: [{ id: 'session.create', requiredFields: ['city'], optionalFields: [] }] });
  });
  const systemText = getBody().input[0].content[0].text;
  assert.match(systemText, /fast, observant field partner/i);
});
