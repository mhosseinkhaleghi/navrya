import assert from 'node:assert/strict';
import test, { after, afterEach } from 'node:test';

// Isolated, flag-gated Persian voice-output test (ElevenLabs). Same globalThis.fetch-stubbing
// convention as tests/ai-realtime-voice-session.test.mjs - proves the real exported
// testElevenLabsFaTts() against a stubbed ElevenLabs response, never a reimplementation of its
// logic. This endpoint is deliberately NOT part of the multi-provider chat gateway (callProvider,
// dockChat, mintRealtimeClientSecret) - these tests only exercise its own isolated code path.
const serverModule = await import('../server/pattern-ai-server.mjs');
const { testElevenLabsFaTts, pcm16ToWav } = serverModule;
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

const ENABLED_ENV = {
  ELEVENLABS_FA_ENABLED: 'true',
  ELEVENLABS_API_KEY: 'test-elevenlabs-key',
  ELEVENLABS_VOICE_ID_FA: 'buzGl6hokx2gx74EYLO0',
  ELEVENLABS_MODEL_ID_FA: 'eleven_v3',
  ELEVENLABS_LANGUAGE_CODE_FA: 'fa',
  ELEVENLABS_OUTPUT_FORMAT: 'pcm_24000'
};

function stubElevenLabsAudio(pcmBytes) {
  let seenUrl = null;
  let seenOptions = null;
  globalThis.fetch = async (url, options) => {
    seenUrl = String(url);
    seenOptions = options;
    return {
      ok: true,
      arrayBuffer: async () => pcmBytes.buffer.slice(pcmBytes.byteOffset, pcmBytes.byteOffset + pcmBytes.byteLength)
    };
  };
  return () => ({ url: seenUrl, options: seenOptions });
}

test('is fully off by default: with ELEVENLABS_FA_ENABLED unset, the endpoint always rejects with ELEVENLABS_FA_TEST_DISABLED and never makes a network call', async () => {
  let called = false;
  globalThis.fetch = async () => { called = true; return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) }; };
  await withEnv({ ELEVENLABS_FA_ENABLED: '', ELEVENLABS_API_KEY: 'k', ELEVENLABS_VOICE_ID_FA: 'v' }, async () => {
    await assert.rejects(() => testElevenLabsFaTts({ text: 'سلام' }), /ELEVENLABS_FA_TEST_DISABLED/);
  });
  assert.equal(called, false);
});

test('stays off for any value other than the literal string "true" (defensive against a stray env typo re-enabling it)', async () => {
  await withEnv({ ELEVENLABS_FA_ENABLED: 'yes', ELEVENLABS_API_KEY: 'k', ELEVENLABS_VOICE_ID_FA: 'v' }, async () => {
    await assert.rejects(() => testElevenLabsFaTts({ text: 'سلام' }), /ELEVENLABS_FA_TEST_DISABLED/);
  });
});

test('fails clearly with ELEVENLABS_API_KEY_MISSING when enabled but no key is configured', async () => {
  await withEnv({ ELEVENLABS_FA_ENABLED: 'true', ELEVENLABS_API_KEY: '', ELEVENLABS_VOICE_ID_FA: 'v' }, async () => {
    await assert.rejects(() => testElevenLabsFaTts({ text: 'سلام' }), /ELEVENLABS_API_KEY_MISSING/);
  });
});

test('fails clearly with ELEVENLABS_VOICE_ID_FA_MISSING when a key is set but no voice id is configured', async () => {
  await withEnv({ ELEVENLABS_FA_ENABLED: 'true', ELEVENLABS_API_KEY: 'k', ELEVENLABS_VOICE_ID_FA: '' }, async () => {
    await assert.rejects(() => testElevenLabsFaTts({ text: 'سلام' }), /ELEVENLABS_VOICE_ID_FA_MISSING/);
  });
});

test('rejects empty or missing text without ever calling ElevenLabs', async () => {
  let called = false;
  globalThis.fetch = async () => { called = true; return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) }; };
  await withEnv(ENABLED_ENV, async () => {
    await assert.rejects(() => testElevenLabsFaTts({}), /TEXT_REQUIRED/);
    await assert.rejects(() => testElevenLabsFaTts({ text: '   ' }), /TEXT_REQUIRED/);
  });
  assert.equal(called, false);
});

test('rejects text over the 500-character cap without ever calling ElevenLabs, so the test surface cannot become an unbounded free-TTS proxy', async () => {
  let called = false;
  globalThis.fetch = async () => { called = true; return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) }; };
  await withEnv(ENABLED_ENV, async () => {
    await assert.rejects(() => testElevenLabsFaTts({ text: 'a'.repeat(501) }), /TEXT_TOO_LONG/);
  });
  assert.equal(called, false);
});

test('calls the real ElevenLabs text-to-speech endpoint with the configured voice/model/language/output-format and the xi-api-key header, never Authorization: Bearer', async () => {
  const pcm = Buffer.from([1, 2, 3, 4]);
  const getRequest = stubElevenLabsAudio(pcm);
  await withEnv(ENABLED_ENV, () => testElevenLabsFaTts({ text: 'سلام، این یک آزمایش است.' }));
  const { url, options } = getRequest();
  assert.equal(url, 'https://api.elevenlabs.io/v1/text-to-speech/buzGl6hokx2gx74EYLO0?output_format=pcm_24000');
  assert.equal(options.headers['xi-api-key'], 'test-elevenlabs-key');
  assert.equal(options.headers.Authorization, undefined);
  const body = JSON.parse(options.body);
  assert.equal(body.text, 'سلام، این یک آزمایش است.');
  assert.equal(body.model_id, 'eleven_v3');
  assert.equal(body.language_code, 'fa');
});

// Caught in review: an earlier draft defaulted to 'eleven_v3_conversational', which is not a
// real model id on the current /v1/text-to-speech endpoint. ELEVENLABS_MODEL_ID_FA is optional
// (unlike ELEVENLABS_VOICE_ID_FA, which has no default at all - see the dedicated test above),
// so the fallback value itself has to be correct for a deploy that never sets it explicitly.
test('defaults ELEVENLABS_MODEL_ID_FA to the real, current eleven_v3 model id when the env var is not set', async () => {
  const getRequest = stubElevenLabsAudio(Buffer.from([1, 2, 3, 4]));
  await withEnv(Object.assign({}, ENABLED_ENV, { ELEVENLABS_MODEL_ID_FA: '' }), () => testElevenLabsFaTts({ text: 'سلام' }));
  const body = JSON.parse(getRequest().options.body);
  assert.equal(body.model_id, 'eleven_v3');
});

test('never leaks the real ElevenLabs API key into the response envelope', async () => {
  stubElevenLabsAudio(Buffer.from([1, 2, 3, 4]));
  const result = await withEnv(ENABLED_ENV, () => testElevenLabsFaTts({ text: 'سلام' }));
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /test-elevenlabs-key/);
});

test('wraps the raw PCM response in a playable WAV envelope and reports the real sample rate parsed from ELEVENLABS_OUTPUT_FORMAT', async () => {
  const pcm = Buffer.from(Array.from({ length: 100 }, (_, i) => i % 256));
  stubElevenLabsAudio(pcm);
  const result = await withEnv(ENABLED_ENV, () => testElevenLabsFaTts({ text: 'سلام' }));
  assert.equal(result.ok, true);
  assert.equal(result.mimeType, 'audio/wav');
  assert.equal(result.sampleRate, 24000);
  const wav = Buffer.from(result.audioBase64, 'base64');
  assert.equal(wav.length, 44 + pcm.length);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wav.readUInt32LE(24), 24000, 'sample rate field in the WAV header');
  assert.equal(wav.readUInt16LE(22), 1, 'mono channel count');
  assert.equal(wav.readUInt16LE(34), 16, '16-bit depth');
  assert.deepEqual(wav.subarray(44), pcm, 'raw PCM payload is preserved byte-for-byte after the header');
});

test('surfaces a clear ELEVENLABS_<status> error when ElevenLabs rejects the request, truncating a long error body', async () => {
  globalThis.fetch = async () => ({ ok: false, status: 401, text: async () => 'invalid_api_key: ' + 'x'.repeat(400) });
  await withEnv(ENABLED_ENV, async () => {
    await assert.rejects(() => testElevenLabsFaTts({ text: 'سلام' }), /^Error: ELEVENLABS_401: invalid_api_key/);
  });
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
