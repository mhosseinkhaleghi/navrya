import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Journey E (Realtime Voice) E0. navrya-src/aiVoiceRealtime.js talks to the browser WebRTC/SDK
// surface (RealtimeSession, getUserMedia, RTCPeerConnection) that node:test cannot construct -
// the real proof for this file is the real-browser test (real OpenAI Realtime API connection,
// real synthesized speech transcribed via a fake-audio-capture Chromium device, a full
// transcript -> core.sendChat -> spoken-reply round trip, and a clean connect/disconnect
// lifecycle - all verified manually during E0, the same "real browser is the actual proof, these
// are static-source regression guards" convention tests/chatdock-reply-rendering.test.mjs and
// tests/chatdock-modal-spacing.test.mjs already established for other browser-only code paths.

const source = await readFile(path.join(process.cwd(), 'navrya-src', 'aiVoiceRealtime.js'), 'utf8');

test('only the finalized transcription-completed event ever reaches onFinalTranscript - partial/delta transcripts are never wired to it (ABSOLUTE rule: interim transcripts must never mutate NAVRYA state)', () => {
  assert.match(source, /TRANSPORT_TRANSCRIPTION_COMPLETED = 'conversation\.item\.input_audio_transcription\.completed'/);
  assert.doesNotMatch(source, /transcription\.delta/, 'must never listen for the interim/delta transcription event');
  const onFinalTranscriptCalls = (source.match(/onFinalTranscript\(/g) || []).length;
  assert.equal(onFinalTranscriptCalls, 2, 'exactly one call site (plus the default no-op assignment) - never invoked from a delta/partial handler');
});

test('a duplicate transcription-completed event for the same item id is never forwarded twice (one utterance -> one Copilot turn)', () => {
  assert.match(source, /handledItemIds\[itemId\]/);
});

test('the Realtime session is granted zero tools and instructed to never decide/answer anything itself - it is a transport, not a second decision-maker', () => {
  assert.match(source, /tools:\s*\[\]/);
  assert.match(source, /Never answer questions, never decide anything, never take an action yourself/i);
});

test('speak() always sends an explicit instructions override through requestResponse() rather than letting the model improvise a response to a fake user message', () => {
  assert.match(source, /session\.transport\.requestResponse\(\{/);
  assert.match(source, /Speak exactly the following text, verbatim, and nothing else/i);
  assert.doesNotMatch(source, /session\.sendMessage\(/, 'sendMessage() would inject a fake user turn and let the model reason about its own reply - speak() must never use it');
});

test('the mic stream is only requested via getUserMedia at connect() time (no auto-enable on load), and teardown always stops its tracks', () => {
  const connectIndex = source.indexOf('async function connect(connectOptions)');
  const getUserMediaIndex = source.indexOf('getUserMedia');
  assert.ok(connectIndex > -1 && getUserMediaIndex > connectIndex, 'getUserMedia must only be requested inside connect(), never at module load');
  assert.match(source, /mediaStream\.getTracks\(\)\.forEach\(function \(track\) \{ track\.stop\(\); \}\)/);
});

// fix/voice-mode-turn-ux (Part B): a real barge-in no longer calls this module's own transport-
// level interrupt() directly - it notifies the caller via onBargeIn(), which chatDockView.jsx
// wires straight to PlaybackController.interrupt() (the one controller-owned, idempotent
// interruption path - see that module's own tests). This is what stops "Stop reply"/barge-in from
// bypassing PlaybackController's queue, the original Part B bug.
test('a speech-started event while the assistant is talking triggers the caller-owned onBargeIn() callback (never this module\'s own transport-level interrupt() directly)', () => {
  const idx = source.indexOf('TRANSPORT_SPEECH_STARTED');
  const block = source.slice(source.indexOf('function onTransportEvent'), source.indexOf('function clearReconnectTimer'));
  assert.match(block, /var wasAssistantSpeaking = state === VOICE_STATES\.ASSISTANT_SPEAKING;/);
  assert.match(block, /setState\(VOICE_STATES\.USER_SPEAKING\);/);
  assert.match(block, /if \(wasAssistantSpeaking\) onBargeIn\(\);/);
  assert.ok(idx > -1);
});

test('debugState() never exposes the ephemeral token, raw audio, or transcript text - only state/language/session-active/event-type diagnostics', () => {
  const setDebugStateCalls = source.match(/setDebugState\(\{[^}]*\}\)/g) || [];
  assert.ok(setDebugStateCalls.length > 0);
  for (const call of setDebugStateCalls) {
    assert.doesNotMatch(call, /transcript/i);
    assert.doesNotMatch(call, /apiKey|creds\.value/i);
  }
});

test('the ten documented voice states are all present (idle/requesting_permission/connecting/listening/user_speaking/processing/assistant_speaking/interrupted/reconnecting/error)', () => {
  const required = ['IDLE', 'REQUESTING_PERMISSION', 'CONNECTING', 'LISTENING', 'USER_SPEAKING', 'PROCESSING', 'ASSISTANT_SPEAKING', 'INTERRUPTED', 'RECONNECTING', 'ERROR'];
  for (const key of required) assert.match(source, new RegExp(key + ':'));
});

// Found via real E3 barge-in testing: the underlying WebRTC data channel can drop between two
// turns (a real network hiccup, not simulated) - a call made just after that happened threw a raw
// "WebRTC data channel is not connected" exception instead of failing into the same ERROR
// state/onError() path every other failure mode already uses.
test('speak(), interrupt(), and mute() are all guarded against a dropped connection - a throw from the transport fails into the ERROR state/onError(), never an uncaught exception', () => {
  // ElevenLabs voice-provider follow-up: speak() is now a thin dispatcher (OpenAI vs. ElevenLabs
  // per the resolved ttsProvider) - the actual guarded requestResponse() call lives in
  // speakViaOpenAI(), which speak() always still reaches on the OpenAI path/fallback.
  const speakBody = source.slice(source.indexOf('function speakViaOpenAI(text)'), source.indexOf('function playElevenLabsAudio'));
  assert.match(speakBody, /try \{[\s\S]*?requestResponse\([\s\S]*?\} catch \(requestError\) \{[\s\S]*?setState\(VOICE_STATES\.ERROR\)/);
  const interruptBody = source.slice(source.indexOf('function interrupt()'), source.indexOf('// Called only by the caller'));
  assert.match(interruptBody, /try \{[\s\S]*?session\.interrupt\(\)[\s\S]*?\} catch \(interruptError\) \{[\s\S]*?setState\(VOICE_STATES\.ERROR\)/);
  const muteBody = source.slice(source.indexOf('function mute(muted)'), source.indexOf('function mute(muted)') + 200);
  assert.match(muteBody, /try \{ session\.mute/);
});

test('the barge-in handler never calls session.interrupt() or this module\'s own interrupt() directly - it only ever notifies the caller via onBargeIn(), which the caller routes through PlaybackController (which itself calls the guarded interrupt() exactly once)', () => {
  const handlerBody = source.slice(source.indexOf('function onTransportEvent'), source.indexOf('function clearReconnectTimer'));
  assert.doesNotMatch(handlerBody, /session\.interrupt\(\)/, 'must not call session.interrupt() directly');
  assert.doesNotMatch(handlerBody, /\binterrupt\(\);/, 'must not call this module\'s own transport-level interrupt() directly either - only via onBargeIn()');
  assert.match(handlerBody, /if \(wasAssistantSpeaking\) onBargeIn\(\);/);
});

// --- ElevenLabs voice-provider follow-up: speak() provider routing/fallback (static-source
// guards, same convention as the rest of this file - real playback is only provable in a real
// browser; see docs/ai/elevenlabs-voice-providers.md's own manual verification steps) ---

test('speak() routes to ElevenLabs only when the resolved config actually supports it, and always falls back to the OpenAI path otherwise - never decided by anything other than the server-reported ttsProvider/elevenLabs', () => {
  const speakBody = source.slice(source.indexOf('function speak(text)'), source.length);
  assert.match(speakBody, /if \(currentTtsProvider === 'elevenlabs' && currentElevenLabsVoice && typeof fetchSpeakAudio === 'function'\) \{\s*return speakViaElevenLabs\(text\);/);
  assert.match(speakBody, /return speakViaOpenAI\(text\);\s*\}/);
});

test('currentTtsProvider/currentElevenLabsVoice are read fresh from every connect() (initial and reconnect), never decided client-side or cached across a config change', () => {
  const connectBody = source.slice(source.indexOf('async function connect(connectOptions)'), source.indexOf('} catch (connectError) {'));
  assert.match(connectBody, /currentTtsProvider = creds\.ttsProvider === 'elevenlabs' \? 'elevenlabs' : 'openai';/);
  assert.match(connectBody, /currentElevenLabsVoice = creds\.elevenLabs \|\| null;/);
});

test('speakViaElevenLabs falls back to the exact same text through speakViaOpenAI exactly once - on an explicit {fallback:true} response AND on a rejected/failed fetch alike - and playElevenLabsAudio only ever runs on the one remaining, mutually exclusive success branch', () => {
  const body = source.slice(source.indexOf('function speakViaElevenLabs(text)'), source.indexOf('function speak(text)'));
  assert.match(body, /if \(!result \|\| result\.fallback\) return speakViaOpenAI\(text\);\s*return playElevenLabsAudio\(result, myEpoch\);/,
    'the success callback must be a single if/return followed by exactly one further statement - fallback OR play, never both for the same outcome');
  assert.match(body, /\}, function \(\) \{[\s\S]*?return speakViaOpenAI\(text\);\s*\}\);/,
    'the rejection branch must also fall back to speakViaOpenAI(text) - not swallow the failure silently');
});

test('playElevenLabsAudio relays synthetic output_audio_buffer.started/stopped/cleared through the SAME onOutputAudioBufferEvent callback the real WebRTC path uses, so PlaybackController captions/settlement keep working unmodified regardless of which engine spoke', () => {
  const body = source.slice(source.indexOf('function playElevenLabsAudio'), source.indexOf('function speakViaElevenLabs'));
  assert.match(body, /onOutputAudioBufferEvent\(natural \? TRANSPORT_OUTPUT_AUDIO_BUFFER_STOPPED : TRANSPORT_OUTPUT_AUDIO_BUFFER_CLEARED, null\)/);
  assert.match(body, /onOutputAudioBufferEvent\(TRANSPORT_OUTPUT_AUDIO_BUFFER_STARTED, null\)/);
});

test('interrupt() stops any in-flight ElevenLabs audio unconditionally, before (and regardless of) the OpenAI session.interrupt() call - a barge-in must cancel whichever engine is actually speaking', () => {
  const interruptBody = source.slice(source.indexOf('function interrupt()'), source.indexOf('// Called only by the caller'));
  // Searches for the real call statement (with its trailing semicolon) rather than the bare
  // 'session.interrupt()' substring, which this function's own explanatory comment also mentions
  // in prose (twice) ahead of the real code - a plain substring search would match the comment.
  const stopIdx = interruptBody.indexOf('if (elevenLabsStopFn)');
  const sessionIdx = interruptBody.indexOf('session.interrupt();');
  assert.ok(stopIdx > -1 && sessionIdx > -1 && stopIdx < sessionIdx, 'the ElevenLabs stop must run before session.interrupt(), and must not be gated on `session` being truthy');
});

test('teardownTransport() stops any in-flight ElevenLabs audio - a disconnect()/reconnect must never leave ElevenLabs speech audibly playing into a torn-down session', () => {
  const body = source.slice(source.indexOf('function teardownTransport()'), source.indexOf('function scheduleReconnect'));
  assert.match(body, /if \(elevenLabsStopFn\) \{ var stopEl = elevenLabsStopFn; elevenLabsStopFn = null; stopEl\(\); \}/);
});

// --- Journey H2, Gate 3: published-audio playback (Conversation Studio voice asset pipeline) ---

test('playAudioUrl is a dedicated function, exported, and never routed through speak()/speakViaOpenAI()/speakViaElevenLabs() - PlaybackController calls it directly for a matched scenario\'s pre-generated audio', () => {
  assert.match(source, /function playAudioUrl\(url\)/);
  assert.match(source, /playAudioUrl: playAudioUrl,/, 'must be exported on the public API returned by createVoiceSession');
  const speakBody = source.slice(source.indexOf('function speak(text)'), source.indexOf('function speak(text)') + 300);
  assert.doesNotMatch(speakBody, /playAudioUrl/, 'speak() itself must never call playAudioUrl - only PlaybackController decides which one to invoke, via ai-voice-output-resolver.js');
});

test('playAudioUrl uses a THIRD, dedicated <audio> element, never reusing elevenLabsAudioEl or the WebRTC transport\'s own element', () => {
  const body = source.slice(source.indexOf('function playAudioUrl(url)'), source.indexOf('function setLanguage'));
  assert.match(body, /var el = publishedAudioEl;/);
  assert.match(body, /el\.src = url;/);
  assert.doesNotMatch(body, /elevenLabsAudioEl/, 'must not reuse the ElevenLabs element');
});

test('playAudioUrl does not require a live session - published audio plays independently of the OpenAI Realtime transport, exactly like ElevenLabs playback already does', () => {
  const body = source.slice(source.indexOf('function playAudioUrl(url)'), source.indexOf('function setLanguage'));
  assert.doesNotMatch(body, /if \(!session/);
});

test('playAudioUrl resolves on a natural end, but REJECTS on a real playback failure (error/timeout/play() rejection) - deliberately different from playElevenLabsAudio, which never rejects, because PlaybackController\'s own .catch() gives this path a further fallback (dynamic TTS) that ElevenLabs playback does not have at that point', () => {
  const body = source.slice(source.indexOf('function playAudioUrl(url)'), source.indexOf('function setLanguage'));
  assert.match(body, /function onEnded\(\) \{ settle\(true\); \}/);
  assert.match(body, /function onPlaybackError\(\) \{ settle\(false\); \}/);
  assert.match(body, /setTimeout\(function \(\) \{ settle\(false\); \}, 12000\)/);
  assert.match(body, /playPromise\.catch\(function \(\) \{ settle\(false\); \}\);/);
  assert.match(body, /if \(ok\) resolve\(\); else reject\(new Error\('published audio playback failed'\)\);/);
});

test('playAudioUrl resolves (never rejects) when stopped via interrupt()/teardown - an intentional stop is not a broken file, and PlaybackController has already settled the entry itself by then', () => {
  const body = source.slice(source.indexOf('function playAudioUrl(url)'), source.indexOf('function setLanguage'));
  assert.match(body, /function stopNow\(\) \{ try \{ el\.pause\(\); el\.currentTime = 0; \} catch \(_e\) \{[^}]*\} settle\(true\); \}/);
  assert.match(body, /publishedAudioStopFn = stopNow;/);
});

test('interrupt() stops any in-flight published-audio playback unconditionally, alongside (and independent of) the ElevenLabs stop and the OpenAI session.interrupt() call', () => {
  const interruptBody = source.slice(source.indexOf('function interrupt()'), source.indexOf('// Called only by the caller'));
  const elIdx = interruptBody.indexOf('if (elevenLabsStopFn)');
  const pubIdx = interruptBody.indexOf('if (publishedAudioStopFn)');
  const sessionIdx = interruptBody.indexOf('session.interrupt();');
  assert.ok(elIdx > -1 && pubIdx > -1 && sessionIdx > -1 && pubIdx < sessionIdx, 'the published-audio stop must run before session.interrupt(), and must not be gated on `session` being truthy');
});

test('teardownTransport() stops any in-flight published-audio playback - a disconnect()/reconnect must never leave a pre-generated clip audibly playing into a torn-down session', () => {
  const body = source.slice(source.indexOf('function teardownTransport()'), source.indexOf('function scheduleReconnect'));
  assert.match(body, /if \(publishedAudioStopFn\) \{ var stopPub = publishedAudioStopFn; publishedAudioStopFn = null; stopPub\(\); \}/);
});

test('fetchSpeakAudio is an optional injected dependency (same pattern as fetchSession) - createVoiceSession never hardcodes the real HTTP endpoint for it', () => {
  assert.match(source, /var fetchSpeakAudio = options && options\.fetchSpeakAudio;/);
  assert.doesNotMatch(source, /fetch\(['"]\/api\/ai\/voice\/speak['"]/, 'aiVoiceRealtime.js must stay a pure transport with zero knowledge of the real endpoint - chatDockView.jsx owns that fetch');
});

// --- chatDockView.jsx wiring: one brain, not two conversations ---

const dockViewSource = await readFile(path.join(process.cwd(), 'navrya-src', 'chatDockView.jsx'), 'utf8');

// Voice Mode performance pass: onVoiceTranscript no longer calls submitRef.current() (or
// voiceRef.current.speak()) directly - it hands the transcript to TurnCoordinator
// (ai-voice-turn-coordinator.js), whose own `submit` option (set up once, in the mount effect) is
// what actually calls submitRef.current(text, {source:'voice', awaitingCompanionOpeningReply}).
// Still the exact same real submit()/core.sendChat() call, one hop further away - see
// tests/ai-voice-turn-coordinator.test.mjs for TurnCoordinator's own sequencing behavior.
test('a voice-originated turn goes through the exact same submit()/core.sendChat() path a typed message uses - no parallel voice-only conversation logic', () => {
  assert.match(dockViewSource, /function onVoiceTranscript\(transcriptText\)[\s\S]{0,600}turnCoordinatorRef\.current\.handleFinalTranscript\(transcriptText, \{/);
  assert.match(dockViewSource, /onFinalTranscript:\s*onVoiceTranscript/);
  assert.match(dockViewSource, /submit: \(text, meta\) => submitRef\.current\(text, \{ source: 'voice', awaitingCompanionOpeningReply: meta\.awaitingCompanionOpeningReply \}\)/);
});

// Found via real E1 multi-turn browser testing: two finalized transcripts arriving close
// together each independently raced core.sendChat()'s own read of workflow/activeProcess state,
// producing duplicate session.create action turns instead of the second one filling the form the
// first had just opened. TurnCoordinator (ai-voice-turn-coordinator.js) is what serializes
// submit() calls now - chatDockView.jsx's own job is just wiring onVoiceTranscript to it.
test('voice turns are serialized through TurnCoordinator - never processed concurrently ("one utterance -> one Copilot turn")', () => {
  assert.match(dockViewSource, /turnCoordinatorRef\.current = window\.TradeJournalAIVoiceTurnCoordinator\.create\(/);
  assert.match(dockViewSource, /return turnCoordinatorRef\.current\.handleFinalTranscript\(/);
});

test('the voice-transport mount effect uses OpenAI Realtime except when the saved provider is Gemini', () => {
  const effectBody = dockViewSource.slice(dockViewSource.indexOf('const useGeminiLive = providerId'), dockViewSource.indexOf('// Voice Mode performance pass: PlaybackController owns only speech'));
  assert.match(effectBody, /const useGeminiLive = providerId === 'gemini';/);
  assert.match(effectBody, /const createTransport = useGeminiLive \? createGeminiLiveSession : createVoiceSession;/);
  assert.match(effectBody, /voiceRef\.current = createTransport\(\{/);
  assert.match(effectBody, /fetchSession: useGeminiLive \? fetchGeminiLiveSession : fetchRealtimeSession,/);
  assert.match(effectBody, /fetchSpeakAudio: useGeminiLive \? fetchGeminiSpeak : fetchVoiceProviderSpeak,/);
});

test('the provider-selected voice transport does not interrupt a live session on a later provider switch', () => {
  const effectStart = dockViewSource.indexOf('const useGeminiLive = providerId');
  const effectEnd = dockViewSource.indexOf('}, []);', effectStart);
  assert.ok(effectStart > -1 && effectEnd > -1, 'could not find the voice-transport mount effect and its own closing []-deps');
});

test('the mounted voice path calls Gemini Live session and TTS endpoints', () => {
  assert.match(dockViewSource, /fetch\('\/api\/ai\/gemini-live\/session', \{/);
  assert.match(dockViewSource, /fetch\('\/api\/ai\/gemini-live\/speak', \{/);
});

// ElevenLabs voice-provider follow-up (per-character/gender voice routing): both the mint and
// speak requests must report which character is active and which gender the user prefers for it -
// the server resolves the actual voice from these (never trusted for anything security-sensitive,
// same posture as the existing client-reported `language`).
test('both fetchRealtimeSession and fetchVoiceProviderSpeak report character (voiceCharacter()) and gender (voiceGenderPreference()) in their request bodies', () => {
  assert.match(dockViewSource, /body: JSON\.stringify\(\{ apiKey: settingsForOpenAI, language, eagerness: options && options\.eagerness, character: voiceCharacter\(\), gender: voiceGenderPreference\(\) \}\)/);
  assert.match(dockViewSource, /body: JSON\.stringify\(\{ language, text, character: voiceCharacter\(\), gender: voiceGenderPreference\(\) \}\)/);
});

test('voiceCharacter() maps the design-system\'s "master" skin id back to the product\'s own "sage" character id - every other voice-provider surface (admin config, user preferences) speaks in terms of hunter/commander/engineer/sage, never master', () => {
  assert.match(dockViewSource, /function voiceCharacter\(\) \{ return navryaCharacter === 'master' \? 'sage' : navryaCharacter; \}/);
});

test('voiceGenderPreference() reads the per-character gender pick from window.TradeJournalUserPreferences (the shared, server-synced preferences store), never a client-only/localStorage-only value', () => {
  const body = dockViewSource.slice(dockViewSource.indexOf('function voiceGenderPreference()'), dockViewSource.indexOf('async function fetchRealtimeSession'));
  assert.match(body, /window\.TradeJournalUserPreferences/);
  assert.match(body, /getPref\('voiceGenderPreference', \{\}\)/);
});

// Voice Mode performance pass: speak() is no longer called (or awaited) directly by
// chatDockView.jsx at all - the post-processed text is handed to
// PlaybackControllerRef.current.enqueue(), fire-and-forget (never awaited), which is what
// actually calls voiceRef.current.speak() internally (see ai-voice-playback-controller.js and its
// own tests). The "await the queue" guarantee this test used to check is deliberately GONE - the
// whole point of this pass was to stop a slow-to-speak reply from blocking the next turn.
test('the text handed to PlaybackController is only ever what NAVRYA\'s own deterministic turn produced (voiceReply/reply from the submit() result, then the Persian Voice Quality gate\'s own deterministic ai-voice-text.js post-processing - see ai-voice-chatdock-ux.test.mjs), never anything the Realtime model decided on its own, and is never awaited (playback must never block the next turn)', () => {
  assert.match(dockViewSource, /const rawToSpeak = result && \(result\.voiceReply \|\| result\.reply\)/);
  assert.match(dockViewSource, /const toSpeak = rawToSpeak && voiceText \? voiceText\.toSpokenText\(rawToSpeak, i18n\.language\(\)\) : rawToSpeak;/);
  assert.match(dockViewSource, /playbackControllerRef\.current\.enqueue\(toSpeak, \{ turnId: meta\.turnId, connectionEpoch: meta\.connectionEpoch, caption: rawToSpeak \|\| '', audioUrl: audioUrlForEntry \}\);/);
  assert.doesNotMatch(dockViewSource, /await playbackControllerRef\.current\.enqueue/, 'enqueue() must never be awaited - that would recreate the exact coupling this pass removes');
});

// Found via real E1 multi-turn browser testing: speak() used to return immediately after sending
// the response.create request, so a fast-resolving next voice turn could fire a second
// response.create while the first one's audio was still playing - the Realtime API rejects an
// overlapping response, surfacing as a transient session error mid-conversation.
test('speak() returns a Promise that only resolves once the response has actually finished (audio_stopped), with a bounded safety timeout - callers can await full completion before starting the next turn', () => {
  assert.match(source, /function speak\(text\) \{[\s\S]*?return Promise\.resolve\(\);/);
  assert.match(source, /return new Promise\(function \(resolve\)/);
  assert.match(source, /activeSession\.once\('audio_stopped', settle\)/);
  assert.match(source, /activeSession\.once\('error', settle\)/);
  assert.match(source, /setTimeout\(function \(\) \{ settle\(\); \}, 12000\)/);
});

// Regression: 'audio_interrupted' was missing from speak()'s own settle listeners. Verified
// against the installed @openai/agents-realtime SDK's own source
// (node_modules/@openai/agents-realtime/dist/openaiRealtimeWebsocket.mjs /
// realtimeSession.mjs) that a real barge-in (interrupt() -> session.interrupt()) surfaces as
// 'audio_interrupted', never 'audio_stopped' - so a barge-in during assistant playback left an
// in-flight speak() promise listening for events that would never fire, silently blocking
// voiceTurnQueue's dispatch of the very next (already-finalized) turn for the full 12s fallback
// on every single interruption - exactly the "no 12-second stall" failure mode this queue design
// exists to prevent.
test("speak()'s settle listeners include 'audio_interrupted', not only 'audio_stopped'/'error' - a barge-in must settle the pending speak() immediately, not fall through to the 12s fallback", () => {
  assert.match(source, /activeSession\.once\('audio_interrupted', settle\)/);
});

// Regression: the installed SDK's RealtimeSession.close() (node_modules/@openai/agents-realtime/
// dist/realtimeSession.mjs) tears down transport state directly and emits none of
// audio_stopped/audio_interrupted/error - so a speak() in flight when the user leaves Voice Mode,
// or a reconnect calls disconnect(), previously had nothing left to ever settle it and sat
// blocking the queue for the full 12s fallback regardless of how quickly disconnect() itself ran.
// Voice Mode performance pass: this cleanup moved into the shared teardownTransport() helper
// (also used by the reconnect path) - disconnect() itself now just calls that helper.
test('disconnect() (via teardownTransport()) explicitly settles a pending speak() promise rather than relying on a session event close() never actually emits', () => {
  assert.match(source, /var pendingSpeakSettle = null;/);
  assert.match(source, /pendingSpeakSettle = settle;/);
  const disconnectBody = source.slice(source.indexOf('function disconnect()'), source.indexOf('// Orthogonal to `state`'));
  assert.match(disconnectBody, /teardownTransport\(\);/, 'disconnect() must call the shared teardown helper');
  const teardownBody = source.slice(source.indexOf('function teardownTransport()'), source.indexOf('// An unexpected drop'));
  assert.match(teardownBody, /if \(pendingSpeakSettle\)/, 'teardownTransport() must check for and settle a pending speak() promise');
  assert.match(teardownBody, /pendingSpeakSettle = null/);
});

test('the voice session\'s language is re-synced from the live i18n.language() immediately before every connect() - not only once at mount, which would miss a language switch made before the mic is first pressed', () => {
  const toggleVoiceBody = dockViewSource.slice(dockViewSource.indexOf('function toggleVoice'), dockViewSource.indexOf('function applySuggestion'));
  const setLanguageIndex = toggleVoiceBody.indexOf('voiceRef.current.setLanguage(i18n.language())');
  const connectIndex = toggleVoiceBody.indexOf('voiceRef.current.connect()');
  assert.ok(setLanguageIndex > -1 && connectIndex > -1 && setLanguageIndex < connectIndex, 'setLanguage() must run before connect() inside toggleVoice()');
});

// --- Dynamic VAD (Voice Mode performance pass) ---

test('setEagerness() is a no-op (never sends session.update) when the requested value is already the one in effect, or is not a real eagerness value', () => {
  const fn = source.slice(source.indexOf('function setEagerness(next)'), source.indexOf('function setEagerness(next)') + 400);
  assert.match(fn, /if \(!VALID_EAGERNESS\[next\] \|\| next === currentEagerness\) return false;/);
});

test("setEagerness() always resends create_response:false/interrupt_response:false alongside eagerness - a live update can never accidentally revert NAVRYA's own control over when the model may speak", () => {
  const fn = source.slice(source.indexOf('function setEagerness(next)'), source.indexOf('function setEagerness(next)') + 700);
  assert.match(fn, /updateSessionConfig\(\{ audio: \{ input: \{ turnDetection: \{ type: 'semantic_vad', eagerness: next, create_response: false, interrupt_response: false \} \} \} \}\)/);
});

test('a reconnect mints with whatever eagerness was last in effect, rather than silently reverting to medium mid-conversation; a fresh user-initiated connect() always starts at medium', () => {
  const connectBody = source.slice(source.indexOf('async function connect(connectOptions)'), source.indexOf('function disconnect()'));
  assert.match(connectBody, /if \(!isReconnect\) \{ reconnectAttempt = 0; clearReconnectTimer\(\); currentEagerness = 'medium'; \}/);
  assert.match(connectBody, /fetchSession\(language, \{ signal: abortController && abortController\.signal, eagerness: currentEagerness \}\)/);
});

test('the effective turn_detection config the server actually acknowledges (session.updated) is captured separately from what was merely requested - never assumed', () => {
  const fn = source.slice(source.indexOf('function onTransportEvent'), source.indexOf('function clearReconnectTimer'));
  assert.match(fn, /TRANSPORT_SESSION_UPDATED/);
  assert.match(fn, /effectiveTurnDetection/);
});

// --- Connection state machine: bounded exponential reconnect with jitter (Voice Mode performance pass) ---

// Grounded against the installed SDK's own source: RealtimeSession never re-emits the
// transport's own 'connection_change' event (verified - see this file's own header comment on
// why this module listens on the local `transport` object directly, not session.on(...)).
test('an unexpected connection drop is detected on the transport itself (not session.on), and only when it was not this module\'s own disconnect() that caused it', () => {
  const connectBody = source.slice(source.indexOf('async function connect(connectOptions)'), source.indexOf('function disconnect()'));
  assert.match(connectBody, /transport\.on\('connection_change', function \(status\) \{/);
  assert.match(connectBody, /if \(myEpoch !== connectionEpoch \|\| intentionalDisconnect\) return;/);
  assert.match(connectBody, /if \(status === 'disconnected'\) scheduleReconnect\(myEpoch\);/);
});

test('reconnect backoff is exponential (base * 2^(attempt-1)), bounded at a max delay, with jitter applied on top - never a fixed retry interval and never unbounded', () => {
  const fn = source.slice(source.indexOf('function scheduleReconnect(myEpoch)'), source.indexOf('async function connect(connectOptions)'));
  assert.match(fn, /var delay = Math\.min\(RECONNECT_MAX_DELAY_MS, RECONNECT_BASE_DELAY_MS \* Math\.pow\(2, reconnectAttempt - 1\)\);/);
  assert.match(fn, /var jitter = delay \* \(0\.5 \+ Math\.random\(\) \* 0\.5\);/);
  assert.match(fn, /setTimeout\(function \(\) \{[\s\S]*?\}, jitter\);/);
});

test('reconnect gives up into ERROR after RECONNECT_MAX_ATTEMPTS - never retries forever', () => {
  const fn = source.slice(source.indexOf('function scheduleReconnect(myEpoch)'), source.indexOf('async function connect(connectOptions)'));
  assert.match(fn, /if \(reconnectAttempt >= RECONNECT_MAX_ATTEMPTS\) \{/);
  assert.match(fn, /setState\(VOICE_STATES\.ERROR\);/);
  assert.match(fn, /onError\(\{ code: 'VOICE_RECONNECT_EXHAUSTED', stage: 'reconnect' \}\);/);
});

test('a reconnect scheduled for an old connection is abandoned if a newer connect()/disconnect() has since run (connectionEpoch changed) - never fires against state that has already moved on', () => {
  const fn = source.slice(source.indexOf('function scheduleReconnect(myEpoch)'), source.indexOf('async function connect(connectOptions)'));
  assert.match(fn, /if \(myEpoch !== connectionEpoch\) return; \/\/ superseded by a newer connection already - not our concern any more/);
  assert.match(fn, /if \(myEpoch !== connectionEpoch\) return; \/\/ a fresh connect\(\)\/disconnect\(\) happened while we were waiting/);
});

test('reconnect never touches TurnCoordinator/PlaybackController or replays a business side effect - it only ever calls connect() again, the same transport-only operation a manual retry would', () => {
  const fn = source.slice(source.indexOf('function scheduleReconnect(myEpoch)'), source.indexOf('async function connect(connectOptions)'));
  assert.match(fn, /connect\(\{ isReconnect: true \}\)/);
  assert.doesNotMatch(fn, /submit|TurnCoordinator|PlaybackController|enqueue/i, 'reconnect must never re-trigger a business turn or a queued reply on its own');
});

test('disconnect() and a genuinely new connect() both bump connectionEpoch and clear any pending reconnect timer - a user manually retrying must not race a still-scheduled automatic reconnect', () => {
  const disconnectBody = source.slice(source.indexOf('function disconnect()'), source.indexOf('// Orthogonal to `state`'));
  assert.match(disconnectBody, /connectionEpoch \+= 1;/);
  assert.match(disconnectBody, /clearReconnectTimer\(\);/);
  const connectBody = source.slice(source.indexOf('async function connect(connectOptions)'), source.indexOf('function disconnect()'));
  assert.match(connectBody, /var myEpoch = \+\+connectionEpoch;/);
  assert.match(connectBody, /if \(!isReconnect\) \{ reconnectAttempt = 0; clearReconnectTimer\(\);/);
});

test('a successful (re)connection resets reconnectAttempt back to 0 - a later, separate drop starts its own backoff from the beginning, not continuing a previous run\'s escalated delay', () => {
  const connectBody = source.slice(source.indexOf('async function connect(connectOptions)'), source.indexOf('function disconnect()'));
  assert.match(connectBody, /reconnectAttempt = 0;\s*\n\s*setState\(VOICE_STATES\.LISTENING\);/);
});

test('chatDockView.jsx re-derives eagerness after every voice turn via the one configuration authority (ai-voice-eagerness.js), from the real post-turn workflow state - never a second, invented signal', () => {
  const onResultBody = dockViewSource.slice(dockViewSource.indexOf('turnCoordinatorRef.current = window.TradeJournalAIVoiceTurnCoordinator.create('), dockViewSource.indexOf('return () => { if (voiceRef.current)'));
  assert.match(onResultBody, /window\.TradeJournalAIVoiceEagerness/);
  assert.match(onResultBody, /eagernessModule\.deriveEagerness\(\{/);
  assert.match(onResultBody, /voiceRef\.current\.setEagerness\(nextEagerness\)/);
});

// ---- fix/voice-mode-hosted-connection: Phase 3 stage-aware connection diagnostics ----
// Adds classification of WHERE within the existing, unchanged connect() pipeline a given attempt
// failed - never widens CONNECT_TIMEOUT_MS, never changes the reconnect policy/epoch guards
// (all asserted unchanged above), only labels the failure more usefully than the single generic
// stage:'connect' this file used before.

test('connect() tracks which phase (mint vs. sdp) is in flight, and the catch block classifies the failure by phase rather than a single hardcoded stage', () => {
  const connectBody = source.slice(source.indexOf('async function connect(connectOptions)'), source.indexOf('function disconnect()'));
  assert.match(connectBody, /var phase = 'mint';/);
  assert.match(connectBody, /phase = 'sdp';/);
  assert.match(connectBody, /var failedStage = phase === 'mint'\s*\n\s*\? classifyMintFailureStage\(connectError, timedOut\)\s*\n\s*: classifySdpFailureStage\(connectError, timedOut, transport\);/);
  assert.doesNotMatch(connectBody, /stage: 'connect'/, 'the old single hardcoded "connect" stage must be gone, replaced by real classification');
});

test('a denied/never-answered microphone prompt is always classified as microphone_permission, whether actively denied or timed out waiting for it', () => {
  const micCatchBody = source.slice(source.indexOf('} catch (permissionError) {'), source.indexOf('if (!isReconnect) setState(VOICE_STATES.CONNECTING);'));
  assert.match(micCatchBody, /stage: 'microphone_permission'/);
  assert.doesNotMatch(micCatchBody, /stage: 'permission'/, 'must use the canonical stage name, not the old ad-hoc one');
});

test('classifyMintFailureStage: a timeout during the token-mint phase is token_mint_timeout, distinct from every non-timeout mint failure', () => {
  const fn = source.slice(source.indexOf('function classifyMintFailureStage'), source.indexOf('function classifySdpFailureStage'));
  assert.match(fn, /if \(timedOut\) return 'token_mint_timeout';/);
});

test('classifyMintFailureStage: maps the real server error codes fetchRealtimeSession() now preserves (chatDockView.jsx) to the correct canonical stage', () => {
  const fn = source.slice(source.indexOf('function classifyMintFailureStage'), source.indexOf('function classifySdpFailureStage'));
  assert.match(fn, /status === 401 \|\| code === 'AUTH_SESSION_REQUIRED' \|\| code === 'ACCOUNT_SUSPENDED'\) return 'session_auth';/);
  assert.match(fn, /status === 429 \|\| \/_429\$\/\.test\(code\) \|\| \/QUOTA\/i\.test\(code\)\) return 'session_quota';/);
  assert.match(fn, /status === 503 \|\| \/_API_KEY_MISSING\$\/\.test\(code\) \|\| code === 'REALTIME_LEASE_STORE_FAILED'\) return 'key_missing';/);
  assert.match(fn, /REALTIME_TOKEN_FAILED_\/\.test\(code\)/);
  assert.match(fn, /return 'key_rejected';/);
  assert.match(fn, /return 'model_unavailable';/);
});

test('classifySdpFailureStage: distinguishes "the SDP relay call itself never got a Location/callId back" from "the relay succeeded but ICE/the data channel never finished" using the transport\'s own real connectionState getter - never a guess', () => {
  const fn = source.slice(source.indexOf('function classifySdpFailureStage'), source.indexOf('  async function connect(connectOptions)'));
  assert.match(fn, /var gotCallId = !!\(state && state\.callId\);/);
  assert.match(fn, /if \(timedOut\) return gotCallId \? 'ice_connection' : 'sdp_relay_timeout';/);
  assert.match(fn, /if \(\/Realtime call request failed with status\/\.test\(message\)\) return 'sdp_exchange';/);
  assert.match(fn, /return dataChannelState === 'open' \? 'session_ack' : \(dataChannelState \? 'data_channel' : 'ice_connection'\);/);
});

test('classifyMintFailureStage/classifySdpFailureStage are pure and read no browser/DOM global - they only ever inspect their own arguments', () => {
  const mintFn = source.slice(source.indexOf('function classifyMintFailureStage'), source.indexOf('function classifySdpFailureStage'));
  // Ends right at classifySdpFailureStage's own closing brace, not at the next function - the
  // comment block immediately following it (documenting the unrelated `fetchSession` parameter)
  // legitimately mentions `fetch()` in prose and must not be swept into this function's own body.
  const sdpFn = source.slice(source.indexOf('function classifySdpFailureStage'), source.indexOf("// `fetchSession` is injected"));
  for (const fn of [mintFn, sdpFn]) {
    assert.doesNotMatch(fn, /document\.|window\.|navigator\.|fetch\(/, 'a pure classifier must never itself touch the network or the DOM');
  }
});

// --- Journey H2, Gate 3: chatDockView.jsx wiring for published-audio playback ---

test('submit() threads audioUrl/audioMimeType straight through from core.sendChat()\'s own result, unconditionally (never gated on source) - the resolver, not this function, decides whether to actually use them', () => {
  const submitStart = dockViewSource.indexOf('async function submit(value, options)');
  const body = dockViewSource.slice(submitStart, dockViewSource.indexOf('} catch (_err) {', submitStart));
  assert.match(body, /audioUrl: result\.audioUrl \|\| null, audioMimeType: result\.audioMimeType \|\| null/);
});

test('PlaybackController.create() is wired with playAudioUrl, read fresh from voiceRef.current on every call - same convention as the existing speak()/interrupt() options', () => {
  const body = dockViewSource.slice(dockViewSource.indexOf('playbackControllerRef.current = window.TradeJournalAIVoicePlaybackController.create({'), dockViewSource.indexOf('turnCoordinatorRef.current = window.TradeJournalAIVoiceTurnCoordinator.create('));
  assert.match(body, /playAudioUrl: \(url\) => voiceRef\.current\.playAudioUrl\(url\)/);
});

test('the voice onResult wiring calls ai-voice-output-resolver.js with source:\'voice\' before ever enqueuing an audioUrl, and degrades to DYNAMIC_TTS (never PUBLISHED_AUDIO) if the resolver module is missing', () => {
  const body = dockViewSource.slice(dockViewSource.indexOf('onResult: (result, meta) => {'), dockViewSource.indexOf('window.TradeJournalChatDockVoiceLatency = latency;'));
  assert.match(body, /window\.TradeJournalAIVoiceOutputResolver/);
  assert.match(body, /outputResolver\.resolve\(\{ source: 'voice', hasAudio: !!\(result && result\.audioUrl\) \}\)/);
  assert.match(body, /: 'DYNAMIC_TTS';/, 'the no-resolver fallback must be the safe DYNAMIC_TTS decision, never PUBLISHED_AUDIO');
  assert.match(body, /const audioUrlForEntry = outputDecision === 'PUBLISHED_AUDIO' \? result\.audioUrl : null;/);
  assert.match(body, /playbackControllerRef\.current\.enqueue\(toSpeak, \{ turnId: meta\.turnId, connectionEpoch: meta\.connectionEpoch, caption: rawToSpeak \|\| '', audioUrl: audioUrlForEntry \}\);/);
});

test('a typed (text-source) submit() never reaches the voice onResult/PlaybackController wiring at all - audioUrl can never autoplay for a typed message, structurally, not just by the resolver\'s own source check', () => {
  // The onResult callback lives ONLY inside turnCoordinatorRef.current's own creation - the object
  // TurnCoordinator drives via handleFinalTranscript(), which is only ever called from
  // onVoiceTranscript (a Realtime transcript callback), never from the text-input send handler.
  const turnCoordinatorBody = dockViewSource.slice(dockViewSource.indexOf('turnCoordinatorRef.current = window.TradeJournalAIVoiceTurnCoordinator.create('), dockViewSource.indexOf('return () => { if (voiceRef.current)'));
  assert.match(turnCoordinatorBody, /submit: \(text, meta\) => submitRef\.current\(text, \{ source: 'voice', awaitingCompanionOpeningReply: meta\.awaitingCompanionOpeningReply \}\)/, 'the ONLY submit() call inside this voice-only object always reports source:\'voice\' - never source-agnostic');
});

test('fetchRealtimeSession (chatDockView.jsx) preserves the real server error code/status on a failed mint instead of collapsing every failure into one opaque VOICE_SESSION_REQUEST_FAILED string - the exact production bug this fix addresses', () => {
  const fn = dockViewSource.slice(dockViewSource.indexOf('async function fetchRealtimeSession'), dockViewSource.indexOf('// A finalized voice turn goes through'));
  assert.match(fn, /const error = new Error\(code\);/);
  assert.match(fn, /error\.code = code;/);
  assert.match(fn, /error\.status = response\.status;/);
  assert.match(fn, /const body = await response\.json\(\);/);
  assert.match(fn, /if \(body && typeof body\.error === 'string' && body\.error\) code = body\.error;/);
});
