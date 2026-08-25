import assert from 'node:assert/strict';
import test, { after, afterEach } from 'node:test';

// Journey E (Realtime Voice) E0: server-side ephemeral-credential minting. Same
// globalThis.fetch-stubbing convention as tests/ai-dock-chat-quality.test.mjs - proves the real
// exported mintRealtimeClientSecret() against a stubbed OpenAI /v1/realtime/client_secrets
// response, never a reimplementation of its logic.
const serverModule = await import('../server/pattern-ai-server.mjs');
const { mintRealtimeClientSecret, __resetVoiceConfigCacheForTests } = serverModule;
const server = serverModule.default;

after(() => { server.close(); });

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const HEALTH_EVENT_URL = '/internal/ai-health-event';
const neutralHealthEventResponse = { ok: true, json: async () => ({}) };
// ElevenLabs voice-provider follow-up: mintRealtimeClientSecret() now also resolves
// resolveElevenLabsForLanguage() (to report ttsProvider in its own response), which calls
// voiceProviderConfig() - one more internal bridge URL every test below must look straight
// through, the same way it already does for the health-event beacon.
const VOICE_PROVIDER_CONFIG_URL = '/internal/voice-provider-config';
const neutralVoiceProviderConfigResponse = { ok: false };

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
    if (String(url).includes(VOICE_PROVIDER_CONFIG_URL)) return neutralVoiceProviderConfigResponse;
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

test('reports ttsProvider:"openai" (and no elevenLabs block) when no admin config/emergency fallback resolves anything - OpenAI remains the sole conversation brain AND sole voice regardless', async () => {
  captureRealtimeRequest({ value: 'ek_test', expires_at: 1, session: { model: 'gpt-realtime-2.1' } });
  const result = await withEnv({ OPENAI_API_KEY: 'test-key', ELEVENLABS_EMERGENCY_ENV_FALLBACK: 'false' }, () =>
    mintRealtimeClientSecret({ language: 'fa' }));
  assert.equal(result.ttsProvider, 'openai');
  assert.equal(result.elevenLabs, null);
});

test('reports ttsProvider:"elevenlabs" (with only voiceId/modelId, never the API key) when the emergency env fallback resolves for Persian', async () => {
  captureRealtimeRequest({ value: 'ek_test', expires_at: 1, session: { model: 'gpt-realtime-2.1' } });
  const result = await withEnv({
    OPENAI_API_KEY: 'test-key', ELEVENLABS_EMERGENCY_ENV_FALLBACK: 'true',
    ELEVENLABS_API_KEY: 'sk-elevenlabs-secret', ELEVENLABS_VOICE_ID_FA: 'buzGl6hokx2gx74EYLO0'
  }, () => mintRealtimeClientSecret({ language: 'fa' }));
  assert.equal(result.ttsProvider, 'elevenlabs');
  assert.deepEqual(result.elevenLabs, { voiceId: 'buzGl6hokx2gx74EYLO0', modelId: 'eleven_v3' });
  assert.doesNotMatch(JSON.stringify(result), /sk-elevenlabs-secret/);
});

test('a resolveElevenLabsForLanguage() failure (e.g. the internal bridge being unreachable) never breaks minting the Realtime credential itself - falls back to ttsProvider:"openai"', async () => {
  __resetVoiceConfigCacheForTests(); // force a real refetch instead of racing an earlier test's still-warm cache
  let seenUrl = null;
  globalThis.fetch = async (url) => {
    seenUrl = String(url);
    if (String(url).includes('/internal/voice-provider-config')) throw new Error('ECONNREFUSED');
    if (String(url).includes('/internal/ai-health-event')) return { ok: true, json: async () => ({}) };
    return { ok: true, json: async () => ({ value: 'ek_test', expires_at: 1, session: { model: 'gpt-realtime-2.1' } }) };
  };
  const result = await withEnv({ OPENAI_API_KEY: 'test-key', ELEVENLABS_EMERGENCY_ENV_FALLBACK: 'false' }, () =>
    mintRealtimeClientSecret({ language: 'fa' }));
  assert.equal(result.value, 'ek_test', 'the actual Realtime credential must still mint successfully');
  assert.equal(result.ttsProvider, 'openai');
  assert.ok(seenUrl, 'sanity check: the stub was actually reached');
});

test('grants the Realtime session zero tools and decouples turn-detection from auto-response (create_response/interrupt_response both false) - NAVRYA must approve every spoken reply', async () => {
  const getRequest = captureRealtimeRequest({ value: 'ek_test', expires_at: 1, session: {} });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, () => mintRealtimeClientSecret({ language: 'en' }));
  const { options } = getRequest();
  const body = JSON.parse(options.body);
  assert.deepEqual(body.session.tools, []);
  assert.equal(body.session.audio.input.turn_detection.type, 'semantic_vad');
  assert.equal(body.session.audio.input.turn_detection.create_response, false);
  assert.equal(body.session.audio.input.turn_detection.interrupt_response, false);
});

// Dynamic VAD (Voice Mode performance pass): the initial mint accepts an eagerness hint (a
// reconnect preserving whatever aiVoiceRealtime.js's own currentEagerness last was - live
// mid-session changes go through a separate session.update the client sends directly, not this
// route). Defaults to 'medium' - the same fixed value every mint used before this pass - when
// omitted or invalid, never trusts an arbitrary client-supplied string verbatim.
test('mintRealtimeClientSecret defaults turn_detection.eagerness to medium when none is supplied, and reports it back to the caller', async () => {
  const getRequest = captureRealtimeRequest({ value: 'ek_test', expires_at: 1, session: {} });
  const result = await withEnv({ OPENAI_API_KEY: 'test-key' }, () => mintRealtimeClientSecret({ language: 'en' }));
  const body = JSON.parse(getRequest().options.body);
  assert.equal(body.session.audio.input.turn_detection.eagerness, 'medium');
  assert.equal(result.eagerness, 'medium');
});

test('mintRealtimeClientSecret honors a valid client-supplied eagerness hint', async () => {
  const getRequest = captureRealtimeRequest({ value: 'ek_test', expires_at: 1, session: {} });
  const result = await withEnv({ OPENAI_API_KEY: 'test-key' }, () => mintRealtimeClientSecret({ language: 'en', eagerness: 'high' }));
  const body = JSON.parse(getRequest().options.body);
  assert.equal(body.session.audio.input.turn_detection.eagerness, 'high');
  assert.equal(result.eagerness, 'high');
});

test('mintRealtimeClientSecret rejects an invalid/unrecognized eagerness value by falling back to medium, rather than forwarding an arbitrary client string straight to the OpenAI API', async () => {
  const getRequest = captureRealtimeRequest({ value: 'ek_test', expires_at: 1, session: {} });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, () => mintRealtimeClientSecret({ language: 'en', eagerness: 'ludicrous speed' }));
  const body = JSON.parse(getRequest().options.body);
  assert.equal(body.session.audio.input.turn_detection.eagerness, 'medium');
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

// ---- Persian Voice Quality gate ----

test('the Realtime session instructions gain a Persian-only audio-delivery addendum - AUDIO STYLE guidance, never a business-logic change - while English/Arabic/Spanish keep the exact original instructions unchanged', async () => {
  const getRequestFa = captureRealtimeRequest({ value: 'ek_test', expires_at: 1, session: {} });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, () => mintRealtimeClientSecret({ language: 'fa' }));
  const bodyFa = JSON.parse(getRequestFa().options.body);
  assert.match(bodyFa.session.instructions, /fluent, contemporary Iranian Persian speech/);
  assert.match(bodyFa.session.instructions, /never add, invent, or omit any claim or number/);
  // The base transport-only sentence is still there, unchanged - this is an ADDITION, not a
  // replacement of the "one brain" transcription/playback-only contract.
  assert.match(bodyFa.session.instructions, /Never answer questions, never decide anything, never take an action yourself\./);

  for (const language of ['en', 'ar', 'es']) {
    const getRequest = captureRealtimeRequest({ value: 'ek_test', expires_at: 1, session: {} });
    await withEnv({ OPENAI_API_KEY: 'test-key' }, () => mintRealtimeClientSecret({ language }));
    const body = JSON.parse(getRequest().options.body);
    assert.equal(
      body.session.instructions,
      'You are a transcription and voice-playback transport only, embedded inside a trading journal app called NAVRYA. Never answer questions, never decide anything, never take an action yourself. Only transcribe what the user says. When a separate system message asks you to speak an exact given sentence back, speak exactly that sentence, in the same language it is written in, and nothing else.',
      `${language} instructions must be byte-for-byte the original string, unchanged by this gate`
    );
  }
});

test('the per-language voice map resolves Persian to marin (the real, human-listened Cedar-vs-Marin A/B winner) while English/Arabic/Spanish stay on the original, unchanged cedar default', async () => {
  const expected = { fa: 'marin', ar: 'cedar', en: 'cedar', es: 'cedar' };
  for (const language of Object.keys(expected)) {
    const getRequest = captureRealtimeRequest({ value: 'ek_test', expires_at: 1, session: { model: 'gpt-realtime-2.1' } });
    const result = await withEnv({ OPENAI_API_KEY: 'test-key' }, () => mintRealtimeClientSecret({ language }));
    const body = JSON.parse(getRequest().options.body);
    assert.equal(body.session.audio.output.voice, expected[language], `${language} output voice`);
    assert.equal(result.voice, expected[language], `${language} returned voice field`);
  }
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
