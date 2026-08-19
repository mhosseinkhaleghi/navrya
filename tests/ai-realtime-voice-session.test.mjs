import assert from 'node:assert/strict';
import test, { after, afterEach } from 'node:test';

// Journey E (Realtime Voice) E0: server-side ephemeral-credential minting. Same
// globalThis.fetch-stubbing convention as tests/ai-dock-chat-quality.test.mjs - proves the real
// exported mintRealtimeClientSecret() against a stubbed OpenAI /v1/realtime/client_secrets
// response, never a reimplementation of its logic.
const serverModule = await import('../server/pattern-ai-server.mjs');
const { mintRealtimeClientSecret } = serverModule;
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

function captureRealtimeRequest(replyPayload) {
  let seenUrl = null;
  let seenOptions = null;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes(HEALTH_EVENT_URL)) return neutralHealthEventResponse;
    seenUrl = String(url);
    seenOptions = options;
    return { ok: true, json: async () => replyPayload };
  };
  return () => ({ url: seenUrl, options: seenOptions });
}

test('mints a client secret against the current /v1/realtime/client_secrets endpoint (not the removed /v1/realtime/sessions beta path)', async () => {
  const getRequest = captureRealtimeRequest({ value: 'ek_test123', expires_at: 1234567890, session: { model: 'gpt-realtime-2.1' } });
  const result = await withEnv({ OPENAI_API_KEY: 'test-key' }, () =>
    mintRealtimeClientSecret({ language: 'en' }));
  const { url, options } = getRequest();
  assert.equal(url, 'https://api.openai.com/v1/realtime/client_secrets');
  assert.equal(options.headers.Authorization, 'Bearer test-key');
  assert.equal(result.value, 'ek_test123');
  assert.equal(result.expiresAt, 1234567890);
});

test('never leaks the permanent server API key into the response, only the short-lived value', async () => {
  captureRealtimeRequest({ value: 'ek_test123', expires_at: 1234567890, session: { model: 'gpt-realtime-2.1' } });
  const result = await withEnv({ OPENAI_API_KEY: 'sk-super-secret-real-key' }, () =>
    mintRealtimeClientSecret({ language: 'en' }));
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /sk-super-secret-real-key/);
});

test('grants the Realtime session zero tools and decouples turn-detection from auto-response (create_response/interrupt_response both false) - NAVRYA must approve every spoken reply', async () => {
  const getRequest = captureRealtimeRequest({ value: 'ek_test', expires_at: 1, session: {} });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, () => mintRealtimeClientSecret({ language: 'en' }));
  const { options } = getRequest();
  const body = JSON.parse(options.body);
  assert.deepEqual(body.session.tools, []);
  assert.equal(body.session.audio.input.turn_detection.create_response, false);
  assert.equal(body.session.audio.input.turn_detection.interrupt_response, false);
});

// Found via real E1 multi-turn voice testing: a short utterance like "five minutes" was
// occasionally mis-transcribed as a different plausible value ("fifteen minutes") rather than
// gibberish - dangerous because a wrong-but-valid value sails through extraction uncaught.
test('the transcription config includes a domain-vocabulary hint (NAVRYA\'s own real city/timeframe values) to bias recognition toward what a user actually says', async () => {
  const getRequest = captureRealtimeRequest({ value: 'ek_test', expires_at: 1, session: {} });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, () => mintRealtimeClientSecret({ language: 'en' }));
  const body = JSON.parse(getRequest().options.body);
  const transcription = body.session.audio.input.transcription;
  assert.match(transcription.prompt, /NAVRYA/);
  assert.match(transcription.prompt, /five minutes/i);
  assert.ok(Array.isArray(transcription.keywords) && transcription.keywords.length > 0);
  assert.ok(transcription.keywords.includes('New York'));
  assert.ok(transcription.keywords.includes('5m'));
});

test('passes the requested language into the input transcription config, defaulting to English for an unsupported value', async () => {
  const getRequest = captureRealtimeRequest({ value: 'ek_test', expires_at: 1, session: {} });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, () => mintRealtimeClientSecret({ language: 'fa' }));
  const bodyFa = JSON.parse(getRequest().options.body);
  assert.deepEqual(bodyFa.session.audio.input.transcription.languages, ['fa']);

  const getRequest2 = captureRealtimeRequest({ value: 'ek_test', expires_at: 1, session: {} });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, () => mintRealtimeClientSecret({ language: 'klingon' }));
  const bodyDefault = JSON.parse(getRequest2().options.body);
  assert.deepEqual(bodyDefault.session.audio.input.transcription.languages, ['en']);
});

test('fails clearly with OPENAI_API_KEY_MISSING when no key is available from override, admin config, or env', async () => {
  captureRealtimeRequest({ value: 'ek_test', expires_at: 1, session: {} });
  await withEnv({ OPENAI_API_KEY: '' }, async () => {
    await assert.rejects(() => mintRealtimeClientSecret({ language: 'en' }), /OPENAI_API_KEY_MISSING/);
  });
});

test('surfaces a clear error when OpenAI rejects the token request', async () => {
  globalThis.fetch = async (url) => {
    if (String(url).includes(HEALTH_EVENT_URL)) return neutralHealthEventResponse;
    return { ok: false, status: 401, text: async () => 'invalid api key' };
  };
  await withEnv({ OPENAI_API_KEY: 'bad-key' }, async () => {
    await assert.rejects(() => mintRealtimeClientSecret({ language: 'en' }), /REALTIME_TOKEN_FAILED_401/);
  });
});
