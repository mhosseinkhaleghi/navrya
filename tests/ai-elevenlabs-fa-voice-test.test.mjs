import assert from 'node:assert/strict';
import test, { after, afterEach } from 'node:test';

// Hardened, general ElevenLabs voice-provider TTS path (replaces the old isolated, fa-only,
// env-var-only /api/ai/voice/test-tts-fa - see pattern-ai-server.mjs's own
// adminTestVoiceProviderTts()/speakWithVoiceProvider() header comments for what changed).
// Every test here forces the DB-backed admin-config bridge (voiceProviderConfig(), an internal
// HTTP call to the Community API) to resolve to "no admin config yet" by having the stubbed
// fetch answer that URL with a non-ok response - this exercises the SAME degrade-to-emergency-env
// path a real Community-API-unreachable moment would hit, and keeps every test in this file
// deterministic (the module-level cache settles to "empty" once and stays that way).
const serverModule = await import('../server/pattern-ai-server.mjs');
const { adminTestVoiceProviderTts, speakWithVoiceProvider, pcm16ToWav } = serverModule;
const server = serverModule.default;

after(() => { server.close(); });

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

function withEnv(vars, fn) {
  const originals = {};
  for (const key of Object.keys(vars)) { originals[key] = process.env[key]; process.env[key] = vars[key]; }
  return Promise.resolve().then(fn).finally(() => {
    for (const key of Object.keys(vars)) { if (originals[key] === undefined) delete process.env[key]; else process.env[key] = originals[key]; }
  });
}

const EMERGENCY_ENV = {
  ELEVENLABS_EMERGENCY_ENV_FALLBACK: 'true',
  ELEVENLABS_API_KEY: 'test-elevenlabs-key',
  ELEVENLABS_VOICE_ID_FA: 'buzGl6hokx2gx74EYLO0',
  ELEVENLABS_MODEL_ID_FA: 'eleven_v3',
  ELEVENLABS_LANGUAGE_CODE_FA: 'fa'
};
const ADMIN_SESSION = { valid: true, userId: 'u-admin', role: 'admin' };
const NON_ADMIN_SESSION = { valid: true, userId: 'u-regular', role: 'user' };

// Handles BOTH the internal admin-config bridge call (always "not configured yet" here, forcing
// the emergency-env-fallback tier) and the real ElevenLabs TTS call.
function stubUpstream({ ttsBuffer, ttsStatus = 200, ttsHeaders = {} } = {}) {
  let seenTtsUrl = null;
  let seenTtsOptions = null;
  globalThis.fetch = async (url, options) => {
    const urlString = String(url);
    // Real production behavior: a successful/failed TTS call also fires an un-awaited, fire-and-
    // forget POST to /internal/voice-tts-usage-event (reportVoiceTtsUsage()) - this stub must
    // handle it (never let it fall through and get mistaken for the TTS call itself below) but
    // never treat it as "the" request under test.
    if (urlString.includes('/internal/voice-provider-config') || urlString.includes('/internal/voice-tts-usage-event')) return { ok: false };
    if (!urlString.startsWith('https://api.elevenlabs.io')) return { ok: false };
    seenTtsUrl = urlString;
    seenTtsOptions = options;
    if (ttsStatus !== 200) return { ok: false, status: ttsStatus, text: async () => 'x'.repeat(400) };
    return {
      ok: true,
      arrayBuffer: async () => ttsBuffer.buffer.slice(ttsBuffer.byteOffset, ttsBuffer.byteOffset + ttsBuffer.byteLength),
      headers: { get: (name) => ttsHeaders[name.toLowerCase()] || null }
    };
  };
  return () => ({ url: seenTtsUrl, options: seenTtsOptions });
}

// --- adminTestVoiceProviderTts (admin-only hardened test endpoint) ---

test('rejects a non-admin session with ADMIN_REQUIRED, never calling ElevenLabs', async () => {
  let called = false;
  globalThis.fetch = async (url) => { if (String(url).includes('elevenlabs')) called = true; return { ok: false }; };
  await withEnv(EMERGENCY_ENV, async () => {
    await assert.rejects(() => adminTestVoiceProviderTts({ language: 'fa', text: 'سلام' }, NON_ADMIN_SESSION), /ADMIN_REQUIRED/);
    await assert.rejects(() => adminTestVoiceProviderTts({ language: 'fa', text: 'سلام' }, null), /ADMIN_REQUIRED/);
  });
  assert.equal(called, false);
});

test('rejects an unsupported language before any network call', async () => {
  await withEnv(EMERGENCY_ENV, async () => {
    await assert.rejects(() => adminTestVoiceProviderTts({ language: 'de', text: 'hi' }, ADMIN_SESSION), /UNSUPPORTED_LANGUAGE/);
  });
});

test('rejects empty or oversized text without ever calling ElevenLabs', async () => {
  let called = false;
  globalThis.fetch = async (url) => { if (String(url).includes('elevenlabs')) called = true; return { ok: false }; };
  await withEnv(EMERGENCY_ENV, async () => {
    await assert.rejects(() => adminTestVoiceProviderTts({ language: 'fa', text: '' }, ADMIN_SESSION), /TEXT_REQUIRED/);
    await assert.rejects(() => adminTestVoiceProviderTts({ language: 'fa', text: 'a'.repeat(501) }, ADMIN_SESSION), /TEXT_TOO_LONG/);
  });
  assert.equal(called, false);
});

test('with no admin config and emergency fallback OFF, rejects with ELEVENLABS_NOT_CONFIGURED and never calls ElevenLabs', async () => {
  let called = false;
  globalThis.fetch = async (url) => { if (String(url).includes('elevenlabs')) called = true; return { ok: false }; };
  await withEnv({ ELEVENLABS_EMERGENCY_ENV_FALLBACK: 'false' }, async () => {
    await assert.rejects(() => adminTestVoiceProviderTts({ language: 'fa', text: 'سلام' }, ADMIN_SESSION), /ELEVENLABS_NOT_CONFIGURED/);
  });
  assert.equal(called, false);
});

test('with emergency fallback enabled, an admin call reaches the real ElevenLabs endpoint with xi-api-key (never Authorization)', async () => {
  const getRequest = stubUpstream({ ttsBuffer: Buffer.from([1, 2, 3, 4]) });
  await withEnv(EMERGENCY_ENV, () => adminTestVoiceProviderTts({ language: 'fa', text: 'سلام، این یک آزمایش است.' }, ADMIN_SESSION));
  const { url, options } = getRequest();
  assert.equal(url, 'https://api.elevenlabs.io/v1/text-to-speech/buzGl6hokx2gx74EYLO0?output_format=mp3_44100_128');
  assert.equal(options.headers['xi-api-key'], 'test-elevenlabs-key');
  assert.equal(options.headers.Authorization, undefined);
  const body = JSON.parse(options.body);
  assert.equal(body.text, 'سلام، این یک آزمایش است.');
  assert.equal(body.model_id, 'eleven_v3');
  assert.equal(body.language_code, 'fa');
});

test('reports creditsConsumed:true and never leaks the raw API key into the response envelope', async () => {
  stubUpstream({ ttsBuffer: Buffer.from([1, 2, 3, 4]) });
  const result = await withEnv(EMERGENCY_ENV, () => adminTestVoiceProviderTts({ language: 'fa', text: 'سلام' }, ADMIN_SESSION));
  assert.equal(result.ok, true);
  assert.equal(result.creditsConsumed, true);
  assert.doesNotMatch(JSON.stringify(result), /test-elevenlabs-key/);
});

test('surfaces only a sanitized ELEVENLABS_<code> error, never the raw upstream body text', async () => {
  stubUpstream({ ttsStatus: 401 });
  await withEnv(EMERGENCY_ENV, async () => {
    await assert.rejects(() => adminTestVoiceProviderTts({ language: 'fa', text: 'سلام' }, ADMIN_SESSION), (error) => {
      assert.equal(error.message, 'ELEVENLABS_INVALID_CREDENTIAL');
      assert.doesNotMatch(error.message, /x{10,}/); // the stubbed 400-char raw body must never appear
      return true;
    });
  });
});

test('a 403 is reported as RESTRICTED_SCOPE, distinct from a 401 INVALID_CREDENTIAL', async () => {
  stubUpstream({ ttsStatus: 403 });
  await withEnv(EMERGENCY_ENV, async () => {
    await assert.rejects(() => adminTestVoiceProviderTts({ language: 'fa', text: 'سلام' }, ADMIN_SESSION), /ELEVENLABS_RESTRICTED_SCOPE/);
  });
});

// --- speakWithVoiceProvider (the real live-Voice-Mode speech path) ---

test('never throws for an ordinary fallback condition - always resolves {fallback:true, reason} instead', async () => {
  globalThis.fetch = async () => ({ ok: false });
  const resultNoConfig = await withEnv({ ELEVENLABS_EMERGENCY_ENV_FALLBACK: 'false' }, () => speakWithVoiceProvider({ language: 'fa', text: 'سلام' }));
  assert.equal(resultNoConfig.fallback, true);
  assert.equal(resultNoConfig.reason, 'NOT_CONFIGURED');

  const resultBadLang = await speakWithVoiceProvider({ language: 'de', text: 'hi' });
  assert.equal(resultBadLang.fallback, true);
  assert.equal(resultBadLang.reason, 'UNSUPPORTED_LANGUAGE');

  const resultNoText = await speakWithVoiceProvider({ language: 'fa', text: '' });
  assert.equal(resultNoText.fallback, true);
  assert.equal(resultNoText.reason, 'TEXT_REQUIRED');
});

test('a real successful call resolves {fallback:false, audioBase64, mimeType}', async () => {
  stubUpstream({ ttsBuffer: Buffer.from([9, 9, 9, 9]), ttsHeaders: { 'content-type': 'audio/mpeg' } });
  const result = await withEnv(EMERGENCY_ENV, () => speakWithVoiceProvider({ language: 'fa', text: 'سلام' }));
  assert.equal(result.fallback, false);
  assert.equal(Buffer.from(result.audioBase64, 'base64').length, 4);
  assert.equal(result.mimeType, 'audio/mpeg');
});

test('an upstream failure resolves {fallback:true, reason:<sanitized code>} rather than throwing - the caller must always be able to fall back to OpenAI voice without a try/catch', async () => {
  stubUpstream({ ttsStatus: 500 });
  const result = await withEnv(EMERGENCY_ENV, () => speakWithVoiceProvider({ language: 'fa', text: 'سلام' }));
  assert.equal(result.fallback, true);
  assert.equal(result.reason, 'UPSTREAM_ERROR');
});

test('the circuit breaker opens after repeated failures and short-circuits to fallback without a further network call', async () => {
  // Persian is the only language with an emergency-env voice id wired at all (see
  // emergencyEnvVoiceIdFor() in pattern-ai-server.mjs) - three consecutive failures always push
  // the per-language failure counter up by exactly 3 regardless of its starting value (no success
  // happens between them in this test), so it reliably crosses CIRCUIT_FAILURE_THRESHOLD (3)
  // however many/few 'fa' calls earlier tests in this file already made.
  stubUpstream({ ttsStatus: 500 });
  await withEnv(EMERGENCY_ENV, async () => {
    await speakWithVoiceProvider({ language: 'fa', text: 'a' });
    await speakWithVoiceProvider({ language: 'fa', text: 'a' });
    await speakWithVoiceProvider({ language: 'fa', text: 'a' });
  });
  let calledAfterOpen = false;
  globalThis.fetch = async (url) => { if (String(url).startsWith('https://api.elevenlabs.io')) calledAfterOpen = true; return { ok: false }; };
  const result = await withEnv(EMERGENCY_ENV, () => speakWithVoiceProvider({ language: 'fa', text: 'a' }));
  assert.equal(result.fallback, true);
  assert.equal(result.reason, 'CIRCUIT_OPEN');
  assert.equal(calledAfterOpen, false, 'an open circuit must short-circuit before ever calling ElevenLabs again');
});

test('pcm16ToWav produces a correct 44-byte RIFF/WAVE header for arbitrary sample rate/channel inputs', () => {
  const pcm = Buffer.from([9, 9, 9, 9, 9, 9]);
  const wav = pcm16ToWav(pcm, 16000, 1);
  assert.equal(wav.length, 50);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.readUInt32LE(4), 36 + pcm.length);
  assert.equal(wav.toString('ascii', 12, 16), 'fmt ');
  assert.equal(wav.readUInt32LE(24), 16000);
  assert.equal(wav.toString('ascii', 36, 40), 'data');
  assert.equal(wav.readUInt32LE(40), pcm.length);
});
