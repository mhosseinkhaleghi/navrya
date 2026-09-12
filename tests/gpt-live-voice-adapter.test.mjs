import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// GPT-Live 1 voice provider migration. Same static-source-regression convention as
// tests/gemini-live-voice-adapter.test.mjs (this file/chatDockView.jsx have no DOM/render harness
// in this repo) - proves the real wiring exists in the real source, never a reimplementation.
// Protocol shape corrected this pass against OpenAI's own documented WebRTC connection contract -
// see navrya-src/gptLiveVoice.js's own header comment for the full correction record.
const root = process.cwd();
const adapter = await readFile(path.join(root, 'navrya-src', 'gptLiveVoice.js'), 'utf8');
const dock = await readFile(path.join(root, 'navrya-src', 'chatDockView.jsx'), 'utf8');
const settingsStore = await readFile(path.join(root, 'public', 'pages', 'shared', 'ai-settings-store.js'), 'utf8');
const server = await readFile(path.join(root, 'server', 'pattern-ai-server.mjs'), 'utf8');

test('GPT-Live 1 is a transport variant of the existing openai provider, never a second reasoning-provider identity in PROVIDER_CATALOG', () => {
  assert.doesNotMatch(settingsStore, /id:\s*'gpt-live'/, 'gpt-live-1 has no structured-output support and must never become a PROVIDER_CATALOG entry');
  assert.doesNotMatch(settingsStore, /setVoiceEngine/, 'there is no user-facing voice-engine choice any more - GPT-Live is the only OpenAI Voice Mode transport');
});

test('GPT-Live is now unconditional for the openai provider - no Realtime fallback branch remains reachable', () => {
  assert.match(dock, /const useGptLive = providerId === 'openai';/);
  // Checks actual CALL syntax, not bare mentions - this file's own comments legitimately name
  // createVoiceSession()/fetchRealtimeSession() to document that they are no longer used.
  assert.doesNotMatch(dock, /createVoiceSession\(\{|= createVoiceSession;|: createVoiceSession[,)]/, 'chatDockView.jsx must never instantiate the retired OpenAI Realtime transport');
  assert.doesNotMatch(dock, /\basync function fetchRealtimeSession\(|\basync function fetchVoiceProviderSpeak\(/, 'the retired Realtime session-mint and ElevenLabs-substitution fetch helpers must not exist in the live wiring any more');
  assert.match(dock, /import \{ VOICE_STATES \} from '\.\/aiVoiceRealtime\.js';/, 'only the shared VOICE_STATES enum may still be imported from the retired Realtime adapter module');
});

test('real WebRTC transport, not a guessed WebSocket/base64-audio one: mic track added directly, remote audio played via a real <audio> element, no manual PCM encode/decode', () => {
  assert.match(adapter, /new RTCPeerConnection\(\)/);
  assert.match(adapter, /pc\.addTrack\(track, mediaStream\)/);
  assert.match(adapter, /pc\.ontrack = /);
  assert.match(adapter, /audioElement\.srcObject = event\.streams\[0\]/);
  assert.doesNotMatch(adapter, /new WebSocket\(/, 'the browser connects via WebRTC, not a WebSocket, for this transport');
  // Checks actual CODE usage (a function definition, or the event name as a real JSON `type`
  // comparison/literal), not this file's own header comment explaining why those wrongly-assumed
  // WebSocket-only events/helpers from an earlier pass are no longer used.
  assert.doesNotMatch(adapter, /function base64FromBytes|function bytesFromBase64|function audioBufferFromPcm/, 'no manual PCM encode/decode helpers may exist any more - audio is real WebRTC media');
  assert.doesNotMatch(adapter, /type: 'session\.input_audio\.append'|message\.type === 'session\.input_audio\.append'|type: 'session\.output_audio\.delta'|message\.type === 'session\.output_audio\.delta'/, 'this module must never send/handle the WebSocket-only audio-chunk events as real code');
});

test('the session-creation contract matches OpenAI\'s own quoted example: the browser posts its own SDP offer, the server returns the SDP answer, and there is no ephemeral client_secret step', () => {
  assert.match(adapter, /const offer = await pc\.createOffer\(\);/);
  assert.match(adapter, /await pc\.setLocalDescription\(offer\);/);
  assert.match(adapter, /fetchSession\(language, pc\.localDescription\.sdp, /);
  assert.match(adapter, /await pc\.setRemoteDescription\(\{ type: 'answer', sdp: answerSdp \}\);/);
  assert.doesNotMatch(adapter, /client_secret/, 'GPT-Live\'s WebRTC session-creation flow has no ephemeral-credential concept - the server is the only party that ever talks to OpenAI');
});

test('ICE gathering is genuinely awaited before the offer is posted - standard WebRTC correctness, not a GPT-Live-specific guess', () => {
  assert.match(adapter, /function waitForIceGatheringComplete\(/);
  assert.match(adapter, /await waitForIceGatheringComplete\(pc, deadline\);/);
  assert.match(adapter, /pc\.localDescription\.sdp/, 'the offer actually posted must be the post-gathering localDescription, not the bare createOffer() result');
});

test('the module holds zero tools and never itself decides/answers/acts - client delegation is the mechanism, never a locally-hardcoded trust', () => {
  assert.doesNotMatch(adapter, /workflowEngine|actionRegistry|proactiveEngine|ai-workflow-engine|ai-proactive-engine/i, 'this transport must never import/call anything from the Action Registry/Workflow Engine/Proactive Engine directly');
  assert.match(server, /delegation: \{ type: 'client' \}/);
  assert.match(server, /tools: \[\]/);
});

test('session.delegation.created is the one trigger that flushes the accumulated transcript into exactly one onFinalTranscript() call, mirroring the finalized-transcript contract every other transport already has', () => {
  assert.match(adapter, /message\.type === 'session\.delegation\.created' && message\.delegation/);
  assert.match(adapter, /function flushTranscript\(\) \{[\s\S]*?onFinalTranscript\(text\);/);
  assert.match(dock, /fetchSession: useGeminiLive \? fetchGeminiLiveSession : fetchGptLiveSession,/);
  assert.match(dock, /onFinalTranscript: onVoiceTranscript,/);
});

test('speak() wraps the approved reply in an explicit verbatim/no-paraphrase instruction before sending it as commentary - a real mitigation for OpenAI\'s own documented paraphrasing behavior, not a silent trust of the model', () => {
  assert.match(adapter, /Speak exactly the following sentence, verbatim, in the same language it is written in, with no paraphrasing, no additions, and no omissions:/);
  assert.match(adapter, /type: 'session\.commentary\.append', delegation_id: currentDelegationId, content:/);
  // Only ever reached with a real delegation to reply to - never speaks unprompted.
  assert.match(adapter, /if \(!text \|\| !dc \|\| dc\.readyState !== 'open' \|\| !currentDelegationId\) return Promise\.resolve\(\);/);
});

test('the documented ~500-token commentary limit is respected via a deliberately conservative character approximation, never an unbounded send', () => {
  assert.match(adapter, /const COMMENTARY_MAX_CHARS = \d+;/);
  assert.match(adapter, /verbatim\.length > COMMENTARY_MAX_CHARS \? verbatim\.slice\(0, COMMENTARY_MAX_CHARS\) : verbatim/);
});

test('no ElevenLabs substitution path exists for this transport - GPT-Live always speaks in its own native voice', () => {
  assert.doesNotMatch(adapter, /elevenlabs\.io|api\.elevenlabs|ELEVENLABS_API_KEY|\/api\/ai\/voice\/speak/i, 'no real ElevenLabs endpoint/credential/route may be wired into this transport');
  assert.match(adapter, /function playAudioUrl\(\) \{ return Promise\.resolve\(\); \}/);
  assert.match(dock, /fetchSpeakAudio: useGeminiLive \? fetchGeminiSpeak : undefined,/);
});

test('server-only secret handling: the permanent OPENAI_API_KEY never reaches the browser, and the mint route is server-side only', () => {
  assert.doesNotMatch(adapter, /OPENAI_API_KEY/);
  assert.match(server, /async function mintGptLiveClientSecret\(body, userId\) \{/);
  assert.match(server, /if \(!key\) key = process\.env\.OPENAI_API_KEY \|\| '';/);
  assert.match(server, /const answerSdp = data\.transport && typeof data\.transport\.sdp === 'string' \? data\.transport\.sdp : '';/);
  assert.match(server, /if \(!answerSdp\) throw new Error\('GPT_LIVE_SESSION_SHAPE_UNEXPECTED'\);/);
});

test('the fail-closed wallet/pricing gate runs BEFORE the OpenAI fetch, never after - a request NAVRYA cannot bill never reaches OpenAI at all', () => {
  const fnStart = server.indexOf('async function mintGptLiveClientSecret');
  const fnBody = server.slice(fnStart, server.indexOf('\n}\n', fnStart));
  const reserveIndex = fnBody.indexOf('reserveWalletFundsForCall(');
  const fetchIndex = fnBody.indexOf('fetch(GPT_LIVE_SESSIONS_UPSTREAM');
  assert.ok(reserveIndex > -1 && fetchIndex > -1 && reserveIndex < fetchIndex, 'the wallet reservation must be attempted strictly before the real OpenAI call');
});

test('a BYOK caller (their own apiKey in the request body) is never gated by the wallet check', () => {
  assert.match(server, /const isByok = !!key;/);
  assert.match(server, /if \(!isByok && aiWalletEnforced\(\)\) \{/);
});

test('never a silent fallback: the capability gate for Voice transports is unchanged, and gpt-live-1 selection failures classify into an honest, actionable stage', () => {
  assert.match(dock, /const VOICE_TRANSPORT_SUPPORTED_PROVIDERS = \{ openai: true, gemini: true \};/, 'VOICE_TRANSPORT_SUPPORTED_PROVIDERS is unchanged - gpt-live is the only openai transport, already covered');
  assert.match(dock, /pricing_not_configured: 'voiceDockErrorPricingNotConfigured'/);
  assert.match(server, /error\.message === 'PROVIDER_PRICING_NOT_CONFIGURED' \|\| error\.message === 'FEATURE_NOT_ENTITLED' \|\| error\.message === 'WALLET_SERVICE_UNAVAILABLE' \? 503/);
});

test('reasoning never gets a provider override for the gpt-live transport either - the already-fixed "voice forced to openai" bug must never be reintroduced', () => {
  assert.doesNotMatch(dock, /provider: source === 'voice' \? 'openai' : undefined/);
  assert.match(dock, /voiceTransport: providerId === 'gemini' \? 'gemini' : 'gpt-live'/);
});

test('graceful close: session.close is sent and the real session.closed confirmation (carrying authoritative usage.seconds) is awaited before settling and tearing down', () => {
  assert.match(adapter, /send\(\{ type: 'session\.close' \}\);/);
  assert.match(adapter, /function waitForSessionClosed\(/);
  assert.match(adapter, /message\.type === 'session\.closed'/);
  assert.match(adapter, /usage\.seconds/);
  assert.match(adapter, /reportSettlement\(/);
});

test('finishUserTurn() honestly reports no real capability via supportsManualFinish(), matching the other continuous-streaming transport (Gemini) rather than faking a turn-finish', () => {
  assert.match(adapter, /function finishUserTurn\(\) \{[\s\S]*?return false;\s*\n\s*\}/);
  assert.match(adapter, /function supportsManualFinish\(\) \{ return false; \}/);
  assert.match(adapter, /connect, disconnect, mute, interrupt, speak, playAudioUrl, finishUserTurn, supportsManualFinish, markPlaybackEnded,/);
});

test('interrupt() guarantees immediate local silence by pausing real playback (never resuming it until the next genuinely new speak() call), and mute() truly disables the outgoing mic track', () => {
  assert.match(adapter, /function interrupt\(\) \{[\s\S]*?pauseLocalAudio\(\);/);
  // Checks for an actual CALL statement (resumeLocalAudio();), not this function's own explanatory
  // comment naming resumeLocalAudio() to document why it is deliberately NOT called here.
  const interruptBody = adapter.slice(adapter.indexOf('function interrupt() {'), adapter.indexOf('\n  function finishUserTurn'));
  assert.doesNotMatch(interruptBody, /\n\s*resumeLocalAudio\(\);/, 'interrupt() must never immediately resume playback it just paused - that would defeat "Stop reply" on a continuous live stream');
  assert.match(adapter, /function speak\(text\) \{[\s\S]*?resumeLocalAudio\(\);/);
  assert.match(adapter, /track\.enabled = !muted/);
});

test('debugState() (dev diagnostic) never exposes the transcript text or any credential, matching the existing privacy contract', () => {
  assert.match(adapter, /debugState: \(\) => \(\{ state, language, sessionActive: !!pc, connectionEpoch \}\)/);
  assert.doesNotMatch(adapter, /debugState[\s\S]{0,120}pendingTranscript/);
});
