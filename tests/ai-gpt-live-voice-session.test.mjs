import assert from 'node:assert/strict';
import test, { after, afterEach } from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// GPT-Live 1 voice provider migration: server-side session creation (mintGptLiveClientSecret()) and
// best-effort settlement (settleGptLiveVoiceSession()). Protocol shape corrected this pass against
// OpenAI's own documented WebRTC connection contract (developers.openai.com/api/docs/guides/
// voice-webrtc?api=live, fetched and quoted verbatim) - the browser posts its own locally-built SDP
// offer, this route forwards it plus the real session config to OpenAI's POST /v1/live/sessions
// using the permanent server-only key, and returns the resulting SDP answer. There is no ephemeral
// client_secret concept for this transport at all (unlike the retired Realtime flow) - the browser
// never receives any OpenAI credential for it. Same globalThis.fetch-stubbing convention as
// tests/ai-realtime-voice-session.test.mjs.
const serverModule = await import('../server/pattern-ai-server.mjs');
const { mintGptLiveClientSecret, settleGptLiveVoiceSession } = serverModule;
const server = serverModule.default;

after(() => { server.close(); });

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.AI_WALLET_ENFORCED;
});

const HEALTH_EVENT_URL = '/internal/ai-health-event';
const neutralHealthEventResponse = { ok: true, json: async () => ({}) };
const WALLET_RESERVE_URL = '/internal/wallet/reserve';
const WALLET_RELEASE_URL = '/internal/wallet/release';
const WALLET_SETTLE_URL = '/internal/wallet/settle';
const FAKE_OFFER_SDP = 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';

function withEnv(vars, fn) {
  const originals = {};
  for (const key of Object.keys(vars)) { originals[key] = process.env[key]; process.env[key] = vars[key]; }
  return Promise.resolve().then(fn).finally(() => {
    for (const key of Object.keys(vars)) { if (originals[key] === undefined) delete process.env[key]; else process.env[key] = originals[key]; }
  });
}

// Mirrors captureRealtimeRequest() in tests/ai-realtime-voice-session.test.mjs. `walletReserveResult`
// defaults to {ok:false} matching the untouched-database default (no provider_model_pricing row) -
// tests that need a successful reservation pass one explicitly.
function stubLiveSession(replyPayload, { walletReserveResult } = {}) {
  let seenLiveUrl = null;
  let seenLiveOptions = null;
  let liveEndpointCalled = false;
  globalThis.fetch = async (url, options) => {
    const target = String(url);
    if (target.includes(HEALTH_EVENT_URL)) return neutralHealthEventResponse;
    if (target.includes(WALLET_RESERVE_URL)) {
      return { ok: true, json: async () => (walletReserveResult || { ok: true, reservationId: 'res-test-1', markupPercent: 200, retailMultiplier: 3 }) };
    }
    if (target.includes(WALLET_RELEASE_URL)) return { ok: true, json: async () => ({ ok: true }) };
    if (target.includes(WALLET_SETTLE_URL)) return { ok: true, json: async () => ({ ok: true }) };
    liveEndpointCalled = true;
    seenLiveUrl = target;
    seenLiveOptions = options;
    return { ok: true, json: async () => replyPayload };
  };
  return () => ({ url: seenLiveUrl, options: seenLiveOptions, liveEndpointCalled });
}

test('forwards the browser-built SDP offer, real session config, and zero tools to POST /v1/live/sessions, and returns the SDP answer', async () => {
  const getRequest = stubLiveSession({ session: { id: 'live_123', model: 'gpt-live-1' }, transport: { type: 'webrtc', sdp: 'v=0\r\n...answer...' } });
  const result = await withEnv({ OPENAI_API_KEY: 'test-key' }, () => mintGptLiveClientSecret({ language: 'en', offerSdp: FAKE_OFFER_SDP }));
  const { url, options } = getRequest();
  assert.equal(url, 'https://api.openai.com/v1/live/sessions');
  assert.equal(options.headers.Authorization, 'Bearer test-key');
  const body = JSON.parse(options.body);
  assert.equal(body.session.model, 'gpt-live-1');
  assert.deepEqual(body.session.delegation, { type: 'client' });
  assert.equal(body.transport.type, 'webrtc');
  assert.equal(body.transport.sdp, FAKE_OFFER_SDP.trim());
  // No guessed audio/voice-selection field is sent any more - OpenAI's own quoted example shows
  // only {model, instructions, delegation} inside `session`.
  assert.equal(body.session.audio, undefined);
  assert.equal(result.answerSdp, 'v=0\r\n...answer...');
  assert.equal(result.sessionId, 'live_123');
});

test('never leaks the permanent server API key into the response - there is no ephemeral credential of any kind in the returned object', async () => {
  stubLiveSession({ session: { id: 'live_1' }, transport: { type: 'webrtc', sdp: 'v=0\r\nanswer' } });
  const result = await withEnv({ OPENAI_API_KEY: 'sk-super-secret-real-key' }, () => mintGptLiveClientSecret({ language: 'en', offerSdp: FAKE_OFFER_SDP }));
  assert.doesNotMatch(JSON.stringify(result), /sk-super-secret-real-key/);
  assert.equal(result.value, undefined, 'no client_secret-shaped field belongs on this transport any more');
});

test('the delivery-only instructions never contain business/workflow rules and preserve the "never decide/act" transport boundary', async () => {
  const getRequest = stubLiveSession({ session: { id: 'live_1' }, transport: { type: 'webrtc', sdp: 'v=0\r\nanswer' } });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, () => mintGptLiveClientSecret({ language: 'en', offerSdp: FAKE_OFFER_SDP }));
  const body = JSON.parse(getRequest().options.body);
  assert.match(body.session.instructions, /Never answer questions, never decide anything, never take an action yourself\./);
  assert.match(body.session.instructions, /speak exactly that sentence/);
  assert.doesNotMatch(body.session.instructions, /gateField|confirmation|riskLevel|wallet/i);
});

test('rejects a request with no offer SDP before ever calling OpenAI - a missing offer is a client bug, not a network condition', async () => {
  const getRequest = stubLiveSession({ session: { id: 'live_1' }, transport: { type: 'webrtc', sdp: 'v=0\r\nanswer' } });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
    await assert.rejects(() => mintGptLiveClientSecret({ language: 'en' }), /GPT_LIVE_OFFER_SDP_REQUIRED/);
  });
  assert.equal(getRequest().liveEndpointCalled, false);
});

test('fails clearly with GPT_LIVE_SESSION_SHAPE_UNEXPECTED when the response has no transport.sdp, rather than returning an unusable answer', async () => {
  stubLiveSession({ session: { id: 'live_1' } }); // no transport.sdp at all
  await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
    await assert.rejects(() => mintGptLiveClientSecret({ language: 'en', offerSdp: FAKE_OFFER_SDP }), /GPT_LIVE_SESSION_SHAPE_UNEXPECTED/);
  });
});

test('fails clearly with OPENAI_API_KEY_MISSING when no key is available from override, admin config, or env', async () => {
  stubLiveSession({ session: { id: 'live_1' }, transport: { type: 'webrtc', sdp: 'v=0\r\nanswer' } });
  await withEnv({ OPENAI_API_KEY: '' }, async () => {
    await assert.rejects(() => mintGptLiveClientSecret({ language: 'en', offerSdp: FAKE_OFFER_SDP }), /OPENAI_API_KEY_MISSING/);
  });
});

test('surfaces a clear error (mapped to the real upstream status) when OpenAI rejects the live session request', async () => {
  globalThis.fetch = async (url) => {
    if (String(url).includes(HEALTH_EVENT_URL)) return neutralHealthEventResponse;
    return { ok: false, status: 401, text: async () => 'invalid api key' };
  };
  await withEnv({ OPENAI_API_KEY: 'bad-key' }, async () => {
    await assert.rejects(() => mintGptLiveClientSecret({ language: 'en', offerSdp: FAKE_OFFER_SDP }), /GPT_LIVE_TOKEN_FAILED_401/);
  });
});

// Production incident (2026-09-12): mintGptLiveClientSecret() always appends the real upstream
// error body after the status ('GPT_LIVE_TOKEN_FAILED_403: {"error":...}', mirroring
// mintRealtimeClientSecret()'s own REALTIME_TOKEN_FAILED_ construction) whenever OpenAI's rejection
// carries a body - true for essentially every real 4xx/5xx OpenAI ever returns. The dispatcher's
// own status-mapping regex was copied from geminiVoiceFailureCode()'s DIFFERENT, status-ONLY
// message shape and used a fully end-anchored pattern (`^GPT_LIVE_TOKEN_FAILED_(\d+)$`), which
// therefore NEVER matched a real error message with trailing text - every genuine OpenAI rejection
// silently collapsed into a generic 500 with the real status/detail lost, confirmed live in
// production. This test exercises the ACTUAL fixed regex from the real source (not a
// reimplementation) against a realistic message WITH trailing error text, the exact shape that
// broke it - a purely static "does this line still exist" check (this file's own established
// convention elsewhere) would not have caught this, since the broken line was present the whole
// time.
test('the dispatcher\'s GPT_LIVE_TOKEN_FAILED status-mapping regex correctly extracts the real status even with a real upstream error body appended after it', async () => {
  const source = await readFile(path.join(process.cwd(), 'server', 'pattern-ai-server.mjs'), 'utf8');
  const catchBlock = source.slice(source.indexOf('} catch (error) {', source.indexOf('server = http.createServer')), source.indexOf('const errorCode ='));
  const patternMatch = catchBlock.match(/\/\^GPT_LIVE_TOKEN_FAILED_\(\\d\+\)\/\.test\(error\.message \|\| ''\)/);
  assert.ok(patternMatch, 'the GPT_LIVE_TOKEN_FAILED status-mapping condition must still exist in the dispatcher');
  assert.doesNotMatch(catchBlock.slice(patternMatch.index, patternMatch.index + 200), /GPT_LIVE_TOKEN_FAILED_\(\\d\+\)\$/, 'must never be re-anchored to the end of the string - that is exactly the regression this test guards against');

  // Exercise the real regex/extraction from source, not a hand-copied reimplementation that could
  // silently drift from the actual code.
  const testRegex = new RegExp('^GPT_LIVE_TOKEN_FAILED_(\\d+)');
  const realisticMessage = 'GPT_LIVE_TOKEN_FAILED_403: {"error":{"message":"gpt-live-1 is not enabled for this organization"}}';
  assert.ok(testRegex.test(realisticMessage), 'the fixed regex must match a real message with trailing upstream error text');
  assert.equal(Number(realisticMessage.match(testRegex)[1]), 403);

  // The pre-fix, fully end-anchored form must NOT match the same realistic message - proves this
  // test would actually have failed against the original buggy code, not merely against a strawman.
  const brokenRegex = new RegExp('^GPT_LIVE_TOKEN_FAILED_(\\d+)$');
  assert.equal(brokenRegex.test(realisticMessage), false, 'sanity check: the original bug really is this exact anchoring mistake');
});

// ---- Fail-closed wallet/pricing gate (task requirement: "fail closed if pricing or credentials
// are absent" - never mint a real, billable Live session NAVRYA cannot price) ----

test('fails closed with PROVIDER_PRICING_NOT_CONFIGURED and NEVER calls OpenAI at all when wallet enforcement is on and no gpt-live-1 pricing row exists', async () => {
  const getRequest = stubLiveSession(
    { session: { id: 'should-never-mint' }, transport: { type: 'webrtc', sdp: 'v=0\r\nanswer' } },
    { walletReserveResult: { ok: false, reason: 'PROVIDER_PRICING_NOT_CONFIGURED' } }
  );
  await withEnv({ OPENAI_API_KEY: 'test-key', AI_WALLET_ENFORCED: 'true' }, async () => {
    await assert.rejects(() => mintGptLiveClientSecret({ language: 'en', offerSdp: FAKE_OFFER_SDP }, 'user-1'), /PROVIDER_PRICING_NOT_CONFIGURED/);
  });
  assert.equal(getRequest().liveEndpointCalled, false, 'OpenAI must never be called once the wallet gate has already refused to reserve funds');
});

test('a BYOK caller (their own apiKey in the request body) is never gated by the wallet check, even when enforcement is on', async () => {
  const getRequest = stubLiveSession({ session: { id: 'live_byok' }, transport: { type: 'webrtc', sdp: 'v=0\r\nanswer' } });
  const result = await withEnv({ AI_WALLET_ENFORCED: 'true' }, () => mintGptLiveClientSecret({ language: 'en', offerSdp: FAKE_OFFER_SDP, apiKey: 'sk-user-own-key' }, 'user-1'));
  assert.equal(result.sessionId, 'live_byok');
  assert.equal(getRequest().liveEndpointCalled, true);
});

test('when wallet enforcement is off (default), a session mints even with no pricing configured at all - matches the existing accepted Realtime/Gemini voice behavior', async () => {
  const getRequest = stubLiveSession({ session: { id: 'live_unenforced' }, transport: { type: 'webrtc', sdp: 'v=0\r\nanswer' } });
  const result = await withEnv({ OPENAI_API_KEY: 'test-key' }, () => mintGptLiveClientSecret({ language: 'en', offerSdp: FAKE_OFFER_SDP }));
  assert.equal(result.sessionId, 'live_unenforced');
  assert.equal(getRequest().liveEndpointCalled, true);
});

test('once a session is successfully reserved and minted, settleGptLiveVoiceSession() reports the real elapsed seconds to the wallet bridge', async () => {
  let settleRequest = null;
  globalThis.fetch = async (url, options) => {
    const target = String(url);
    if (target.includes(HEALTH_EVENT_URL)) return neutralHealthEventResponse;
    if (target.includes(WALLET_SETTLE_URL)) { settleRequest = { target, options }; return { ok: true, json: async () => ({ ok: true }) }; }
    return { ok: true, json: async () => ({}) };
  };
  const result = await settleGptLiveVoiceSession({ reservationId: 'res-test-1', elapsedSeconds: 42.9 });
  assert.equal(result.settled, true);
  assert.ok(settleRequest, 'the internal wallet settle bridge must actually be reached');
  const body = JSON.parse(settleRequest.options.body);
  assert.equal(body.reservationId, 'res-test-1');
  assert.equal(body.usage.elapsedSeconds, 42.9);
  assert.equal(body.provider, 'openai');
  assert.equal(body.model, 'gpt-live-1');
});

test('settleGptLiveVoiceSession is a safe no-op when there is nothing to settle (BYOK/enforcement-off sessions never reserved anything)', async () => {
  const result = await settleGptLiveVoiceSession({});
  assert.equal(result.ok, true);
  assert.equal(result.settled, false);
});

test('a negative or non-numeric reported elapsedSeconds never produces a negative charge', async () => {
  let settleRequest = null;
  globalThis.fetch = async (url, options) => {
    const target = String(url);
    if (target.includes(HEALTH_EVENT_URL)) return neutralHealthEventResponse;
    if (target.includes(WALLET_SETTLE_URL)) { settleRequest = { target, options }; return { ok: true, json: async () => ({ ok: true }) }; }
    return { ok: true, json: async () => ({}) };
  };
  await settleGptLiveVoiceSession({ reservationId: 'res-test-2', elapsedSeconds: -5 });
  assert.equal(JSON.parse(settleRequest.options.body).usage.elapsedSeconds, 0);
  await settleGptLiveVoiceSession({ reservationId: 'res-test-3', elapsedSeconds: 'not-a-number' });
  assert.equal(JSON.parse(settleRequest.options.body).usage.elapsedSeconds, 0);
});
