import assert from 'node:assert/strict';
import test, { after, afterEach } from 'node:test';

// Journey E (Realtime Voice) E0: server-side ephemeral-credential minting. Same
// globalThis.fetch-stubbing convention as tests/ai-dock-chat-quality.test.mjs - proves the real
// exported mintRealtimeClientSecret() against a stubbed OpenAI /v1/realtime/client_secrets
// response, never a reimplementation of its logic.
const serverModule = await import('../server/pattern-ai-server.mjs');
const { callProvider, mintRealtimeClientSecret, mintGeminiLiveToken, speakWithGemini, adminTestGeminiVoice, __resetVoiceConfigCacheForTests, __resetAdminKeyCacheForTests, __resetAdminModelOverrideCacheForTests } = serverModule;
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

// ElevenLabs voice-provider follow-up (character/gender redesign): every test above forces the
// admin-config bridge to fail (neutralVoiceProviderConfigResponse), so only the emergency-env and
// null tiers were ever actually exercised - the real admin-managed (character, gender) resolution
// path had no coverage at all. These two prove it end to end.
test('reports ttsProvider:"elevenlabs" when a real admin character+gender config resolves, and stays isolated to that exact combination', async () => {
  __resetVoiceConfigCacheForTests();
  captureRealtimeRequest({ value: 'ek_test', expires_at: 1, session: { model: 'gpt-realtime-2.1' } });
  globalThis.fetch = async (url, options) => {
    const urlString = String(url);
    if (urlString.includes(HEALTH_EVENT_URL)) return neutralHealthEventResponse;
    if (urlString.includes(VOICE_PROVIDER_CONFIG_URL)) {
      return {
        ok: true,
        json: async () => ({
          version: 1,
          characters: { 'hunter:male': { enabled: true, provider: 'elevenlabs', apiKey: 'sk-admin-secret', voiceId: 'v-hunter-male', modelId: 'eleven_v3', voiceSettings: {} } }
        })
      };
    }
    return { ok: true, json: async () => ({ value: 'ek_test', expires_at: 1, session: { model: 'gpt-realtime-2.1' } }) };
  };
  const configured = await withEnv({ OPENAI_API_KEY: 'test-key', ELEVENLABS_EMERGENCY_ENV_FALLBACK: 'false' }, () =>
    mintRealtimeClientSecret({ language: 'en', character: 'hunter', gender: 'male' }));
  assert.equal(configured.ttsProvider, 'elevenlabs');
  assert.deepEqual(configured.elevenLabs, { voiceId: 'v-hunter-male', modelId: 'eleven_v3' });
  assert.doesNotMatch(JSON.stringify(configured), /sk-admin-secret/, 'the admin-managed API key must never reach the browser response');

  // A DIFFERENT character/gender combination the admin never configured must fall straight
  // through to OpenAI - one enabled entry must never leak into an unrelated combination.
  __resetVoiceConfigCacheForTests();
  const unconfigured = await withEnv({ OPENAI_API_KEY: 'test-key', ELEVENLABS_EMERGENCY_ENV_FALLBACK: 'false' }, () =>
    mintRealtimeClientSecret({ language: 'en', character: 'commander', gender: 'female' }));
  assert.equal(unconfigured.ttsProvider, 'openai');
  assert.equal(unconfigured.elevenLabs, null);
});

test('an unrecognized character/gender in the request body falls back to the documented defaults (hunter/male) rather than throwing or silently matching every config', async () => {
  __resetVoiceConfigCacheForTests();
  globalThis.fetch = async (url) => {
    const urlString = String(url);
    if (urlString.includes(HEALTH_EVENT_URL)) return neutralHealthEventResponse;
    if (urlString.includes(VOICE_PROVIDER_CONFIG_URL)) {
      return {
        ok: true,
        json: async () => ({
          version: 1,
          characters: { 'hunter:male': { enabled: true, provider: 'elevenlabs', apiKey: 'sk-admin-secret', voiceId: 'v-default', modelId: 'eleven_v3', voiceSettings: {} } }
        })
      };
    }
    return { ok: true, json: async () => ({ value: 'ek_test', expires_at: 1, session: { model: 'gpt-realtime-2.1' } }) };
  };
  const result = await withEnv({ OPENAI_API_KEY: 'test-key', ELEVENLABS_EMERGENCY_ENV_FALLBACK: 'false' }, () =>
    mintRealtimeClientSecret({ language: 'en', character: 'not-a-real-character', gender: 'unspecified' }));
  assert.equal(result.ttsProvider, 'elevenlabs');
  assert.deepEqual(result.elevenLabs, { voiceId: 'v-default', modelId: 'eleven_v3' });
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

test('the Realtime session preserves the transport-only safety boundary while adding both character delivery and Persian-only native delivery guidance', async () => {
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
    assert.match(body.session.instructions, /Never answer questions, never decide anything, never take an action yourself\./);
    assert.match(body.session.instructions, /Deliver this exact text as The Hunter/);
    assert.doesNotMatch(body.session.instructions, /fluent, contemporary Iranian Persian speech/);
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

test('OpenAI Realtime selects a distinct valid voice and delivery direction for each role', async () => {
  const expected = {
    hunter: 'cedar', commander: 'ash', engineer: 'verse', sage: 'sage'
  };
  for (const [character, voice] of Object.entries(expected)) {
    const getRequest = captureRealtimeRequest({ value: 'ek_test', expires_at: 1, session: {} });
    const result = await withEnv({ OPENAI_API_KEY: 'test-key' }, () => mintRealtimeClientSecret({ language: 'en', character, gender: 'male' }));
    const body = JSON.parse(getRequest().options.body);
    assert.equal(body.session.audio.output.voice, voice, character + ' voice');
    assert.equal(result.voice, voice, character + ' returned voice');
    assert.match(body.session.instructions, new RegExp('Deliver this exact text as ' + (character === 'engineer' ? 'the Market Engineer' : character === 'sage' ? 'the Market Sage' : 'The ' + character[0].toUpperCase() + character.slice(1))));
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

test('mints one-use constrained Gemini Live credentials and never returns the permanent Gemini key', async () => {
  let request = null;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes(HEALTH_EVENT_URL)) return neutralHealthEventResponse;
    request = { url: String(url), options };
    return { ok: true, json: async () => ({ name: 'auth_tokens/live-test', expireTime: '2026-09-03T00:30:00Z' }) };
  };
  const result = await mintGeminiLiveToken({ language: 'fa', apiKey: 'gemini-permanent-secret' });
  assert.equal(request.url, 'https://generativelanguage.googleapis.com/v1beta/auth_tokens');
  assert.equal(request.options.headers['x-goog-api-key'], 'gemini-permanent-secret');
  const body = JSON.parse(request.options.body);
  assert.equal(body.uses, 1);
  assert.equal(body.bidiGenerateContentSetup.model, 'models/gemini-3.5-transcribe-live');
  assert.deepEqual(body.bidiGenerateContentSetup.generationConfig.responseModalities, ['TEXT']);
  assert.equal(result.provider, 'gemini-live');
  assert.equal(result.token, 'auth_tokens/live-test');
  assert.doesNotMatch(JSON.stringify(result), /gemini-permanent-secret/);
});

test('Gemini Live resolves the admin-managed Gemini key before the environment fallback and never returns it to the browser', async () => {
  __resetAdminKeyCacheForTests();
  let request = null;
  globalThis.fetch = async (url, options) => {
    const target = String(url);
    if (target.includes('/internal/admin-ai-keys')) return { ok: true, json: async () => ({ gemini: 'admin-gemini-secret' }) };
    if (target.includes(HEALTH_EVENT_URL)) return neutralHealthEventResponse;
    request = { url: target, options };
    return { ok: true, json: async () => ({ name: 'auth_tokens/admin-key', expireTime: '2026-09-03T00:30:00Z' }) };
  };
  const result = await withEnv({ GEMINI_API_KEY: '' }, () => mintGeminiLiveToken({ language: 'en' }));
  assert.equal(request.url, 'https://generativelanguage.googleapis.com/v1beta/auth_tokens');
  assert.equal(request.options.headers['x-goog-api-key'], 'admin-gemini-secret');
  assert.doesNotMatch(JSON.stringify(result), /admin-gemini-secret/);
  __resetAdminKeyCacheForTests();
});

test('an Admin Gemini model override is the live fallback for model-less calls, but an explicit user model still wins', async () => {
  __resetAdminModelOverrideCacheForTests();
  const models = [];
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.includes('/internal/admin-ai-model-overrides')) return { ok: true, json: async () => ({ gemini: 'gemini-2.5-flash' }) };
    if (target.includes(HEALTH_EVENT_URL)) return neutralHealthEventResponse;
    models.push(target);
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }) };
  };
  const payload = { input: [{ role: 'user', content: [{ type: 'input_text', text: 'hello' }] }], text: { format: { schema: { required: [] } } } };
  await callProvider('gemini', 'gemini-test-key', '', payload, 'test.admin-model');
  assert.match(models[0], /models\/gemini-2\.5-flash:generateContent/);

  __resetAdminModelOverrideCacheForTests();
  models.length = 0;
  await callProvider('gemini', 'gemini-test-key', 'gemini-3.1-pro-preview', payload, 'test.explicit-model');
  assert.match(models[0], /models\/gemini-3\.1-pro-preview:generateContent/);
  __resetAdminModelOverrideCacheForTests();
});

test('the admin Gemini Voice diagnostic validates Live and TTS, and returns only a short playable greeting to admins', async () => {
  __resetAdminKeyCacheForTests();
  const requests = [];
  globalThis.fetch = async (url, options) => {
    const target = String(url);
    if (target.includes('/internal/admin-ai-keys')) return { ok: true, json: async () => ({ gemini: 'admin-gemini-secret' }) };
    if (target.includes(HEALTH_EVENT_URL)) return neutralHealthEventResponse;
    requests.push({ target, options });
    if (target.includes('/auth_tokens')) return { ok: true, json: async () => ({ name: 'auth_tokens/admin-test', expireTime: '2026-09-06T00:30:00Z' }) };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { data: 'pcm-base64', mimeType: 'audio/L16;rate=24000' } }] } }] }) };
  };
  const result = await withEnv({ GEMINI_API_KEY: '' }, () => adminTestGeminiVoice({ role: 'admin' }));
  assert.deepEqual(requests.map((request) => request.target.includes('/auth_tokens') ? 'live' : 'tts'), ['live', 'tts']);
  assert.equal(result.ok, true);
  assert.equal(result.liveModel, 'gemini-3.5-transcribe-live');
  assert.equal(result.ttsModel, 'gemini-3.1-flash-tts-preview');
  assert.equal(result.greeting, 'I am the Hunter. Gemini Voice is ready. We will wait for the setup worth taking.');
  assert.equal(result.mimeType, 'audio/wav');
  assert.match(Buffer.from(result.audioBase64, 'base64').subarray(0, 12).toString('ascii'), /^RIFF.{4}WAVE$/s);
  assert.doesNotMatch(JSON.stringify(result), /admin-gemini-secret|auth_tokens\/admin-test/);
  await assert.rejects(() => adminTestGeminiVoice({ role: 'user' }), /ADMIN_REQUIRED/);
  __resetAdminKeyCacheForTests();
});

test('Gemini TTS reads the approved text server-side and returns only provider audio, never its API key', async () => {
  let request = null;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes(HEALTH_EVENT_URL)) return neutralHealthEventResponse;
    request = { url: String(url), options };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { data: 'pcm-base64', mimeType: 'audio/L16;rate=24000' } }] } }] }) };
  };
  const result = await speakWithGemini({ language: 'en', text: 'Approved NAVRYA reply.', character: 'sage', gender: 'female', apiKey: 'gemini-permanent-secret' });
  assert.match(request.url, /models\/gemini-3\.1-flash-tts-preview:generateContent$/);
  const body = JSON.parse(request.options.body);
  assert.deepEqual(body.generationConfig.responseModalities, ['AUDIO']);
  assert.match(body.contents[0].parts[0].text, /Approved NAVRYA reply\./);
  assert.match(body.contents[0].parts[0].text, /The Market Sage: an elder, seasoned market mentor/i);
  assert.match(body.contents[0].parts[0].text, /interface language for this reply is English/i);
  assert.match(body.contents[0].parts[0].text, /never the transcript's language, meaning, numbers, or safety content/i);
  assert.equal(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Sulafat');
  assert.equal(result.character, 'sage');
  assert.equal(result.voice, 'Sulafat');
  assert.equal(result.audioBase64, 'pcm-base64');
  assert.doesNotMatch(JSON.stringify(result), /gemini-permanent-secret/);
});

test('Gemini Voice reports Google’s unsupported-location response as a distinct safe error code', async () => {
  globalThis.fetch = async (url) => {
    if (String(url).includes(HEALTH_EVENT_URL)) return neutralHealthEventResponse;
    return { ok: false, status: 400, json: async () => ({ error: { message: 'User location is not supported for the API use.' } }) };
  };
  await assert.rejects(
    () => speakWithGemini({ language: 'en', text: 'NAVRYA check.', apiKey: 'gemini-permanent-secret' }),
    /GEMINI_TTS_LOCATION_UNSUPPORTED/
  );
});
