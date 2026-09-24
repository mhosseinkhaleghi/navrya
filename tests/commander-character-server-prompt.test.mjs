import assert from 'node:assert/strict';
import test, { after, afterEach } from 'node:test';

// Commander Character Interaction Policy: server-side gear resolution, extending
// server/pattern-ai-server.mjs's existing CHARACTER_GEAR_INSTRUCTION/characterDeliveryGear -
// mirrors tests/hunter-character-server-prompt.test.mjs's own conventions.
// The AI server binds its port on import; every test process that imports it must use an ephemeral
// port (the convention tests/ai-gateway-auth.test.mjs and 15 others follow) or parallel test files
// collide on the default 8787 (EADDRINUSE crashes the later file).
process.env.PATTERN_AI_PORT = '0';
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

test('Commander on a plain text turn gets its own NORMAL-gear identity instruction - character style is no longer voice-only for Commander either', async () => {
  const getBody = captureOpenAIRequest({ reply: 'ok' });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
    await dockChat({ provider: 'openai', message: 'hi', language: 'en', character: 'commander' });
  });
  const systemText = getBody().input[0].content[0].text;
  assert.match(systemText, /speaking as Commander/);
  assert.match(systemText, /the user remains the command authority/i);
  assert.match(systemText, /preserve every fact, number, safety warning, and required confirmation/);
});

test('Commander + an open, non-gate form field gets the FOCUSED/tactical gear', async () => {
  const getBody = captureOpenAIRequest({ reply: 'ok', suggestions: [] });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
    await dockChat({
      provider: 'openai', message: 'New York', language: 'en', character: 'commander',
      activeProcess: { id: 'session-create', allowlist: ['city'], nextQuestion: { path: 'city', label: 'City', role: 'editable' } }
    });
  });
  const systemText = getBody().input[0].content[0].text;
  assert.match(systemText, /fast, tactical mode/i);
});

test('Commander + a gate field as the next question gets the NEUTRAL gear - no military vocabulary, no urgency', async () => {
  const getBody = captureOpenAIRequest({ reply: 'ok', suggestions: [] });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
    await dockChat({
      provider: 'openai', message: 'yes', language: 'en', character: 'commander',
      activeProcess: { id: 'strategy-delete-confirm', allowlist: ['confirm'], nextQuestion: { path: 'confirm', label: 'Confirm delete', role: 'gate' } }
    });
  });
  const systemText = getBody().input[0].content[0].text;
  assert.match(systemText, /this is a confirmation step/i);
  assert.match(systemText, /drop all character flavor/i);
  assert.doesNotMatch(systemText, /trusted right-hand field commander/i);
});

test('Commander + a psychology-domain process gets the HUMAN_MOMENT/After-Action gear', async () => {
  const getBody = captureOpenAIRequest({ reply: 'ok', suggestions: [] });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
    await dockChat({
      provider: 'openai', message: 'x', language: 'en', character: 'commander',
      activeProcess: { id: 'mh-intake', allowlist: ['intake.demographics.maritalStatus'] }
    });
  });
  const systemText = getBody().input[0].content[0].text;
  assert.match(systemText, /After-Action moment/i);
  assert.doesNotMatch(systemText, /fast, tactical mode/i);
});

test('Hunter is completely unaffected by the Commander gate - identical gear text as before', async () => {
  const getBody = captureOpenAIRequest({ reply: 'ok' });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
    await dockChat({ provider: 'openai', message: 'hi', language: 'en', character: 'hunter' });
  });
  const systemText = getBody().input[0].content[0].text;
  assert.match(systemText, /speaking as Hunter/);
  assert.match(systemText, /fast, observant field partner/i);
});

test('Sage remains voice-only and unaffected by the Commander gate', async () => {
  for (const character of ['sage']) {
    const getBody = captureOpenAIRequest({ reply: 'ok' });
    await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
      await dockChat({ provider: 'openai', message: 'hi', language: 'en', character });
    });
    const systemText = getBody().input[0].content[0].text;
    assert.doesNotMatch(systemText, /speaking as/, character);
  }
});

test('Sage on a VOICE turn still gets its own original one-line style, unchanged by the Commander gate', async () => {
  const getBody = captureOpenAIRequest({ reply: 'ok', voiceReply: 'ok' });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
    await dockChat({ provider: 'openai', message: 'hi', language: 'en', character: 'sage', source: 'voice' });
  });
  const systemText = getBody().input[0].content[0].text;
  assert.match(systemText, /You are speaking as the Market Master/);
});
