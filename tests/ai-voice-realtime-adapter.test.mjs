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

test('a speech-started event while the assistant is talking triggers a real interrupt() call (barge-in), not just a state label change', () => {
  const idx = source.indexOf('TRANSPORT_SPEECH_STARTED');
  const block = source.slice(source.indexOf('function onTransportEvent'), source.indexOf('async function connect'));
  assert.match(block, /if \(state === VOICE_STATES\.ASSISTANT_SPEAKING\) interrupt\(\);/);
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
  const speakBody = source.slice(source.indexOf('function speak(text)'), source.indexOf('function setLanguage'));
  assert.match(speakBody, /try \{[\s\S]*?requestResponse\([\s\S]*?\} catch \(requestError\) \{[\s\S]*?setState\(VOICE_STATES\.ERROR\)/);
  const interruptBody = source.slice(source.indexOf('function interrupt()'), source.indexOf('// Called only by the caller'));
  assert.match(interruptBody, /try \{[\s\S]*?session\.interrupt\(\)[\s\S]*?\} catch \(interruptError\) \{[\s\S]*?setState\(VOICE_STATES\.ERROR\)/);
  const muteBody = source.slice(source.indexOf('function mute(muted)'), source.indexOf('function mute(muted)') + 200);
  assert.match(muteBody, /try \{ session\.mute/);
});

test('the barge-in handler reuses the public, guarded interrupt() rather than calling session.interrupt() directly (a dropped connection at exactly that moment must fail the same safe way)', () => {
  const handlerBody = source.slice(source.indexOf('function onTransportEvent'), source.indexOf('async function connect'));
  assert.doesNotMatch(handlerBody, /session\.interrupt\(\)/, 'must not call session.interrupt() directly - only the guarded interrupt() wrapper');
  assert.match(handlerBody, /if \(state === VOICE_STATES\.ASSISTANT_SPEAKING\) interrupt\(\);/);
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

// Voice Mode performance pass: speak() is no longer called (or awaited) directly by
// chatDockView.jsx at all - the post-processed text is handed to
// PlaybackControllerRef.current.enqueue(), fire-and-forget (never awaited), which is what
// actually calls voiceRef.current.speak() internally (see ai-voice-playback-controller.js and its
// own tests). The "await the queue" guarantee this test used to check is deliberately GONE - the
// whole point of this pass was to stop a slow-to-speak reply from blocking the next turn.
test('the text handed to PlaybackController is only ever what NAVRYA\'s own deterministic turn produced (voiceReply/reply from the submit() result, then the Persian Voice Quality gate\'s own deterministic ai-voice-text.js post-processing - see ai-voice-chatdock-ux.test.mjs), never anything the Realtime model decided on its own, and is never awaited (playback must never block the next turn)', () => {
  assert.match(dockViewSource, /const rawToSpeak = result && \(result\.voiceReply \|\| result\.reply\)/);
  assert.match(dockViewSource, /const toSpeak = rawToSpeak && voiceText \? voiceText\.toSpokenText\(rawToSpeak, i18n\.language\(\)\) : rawToSpeak;/);
  assert.match(dockViewSource, /playbackControllerRef\.current\.enqueue\(toSpeak, \{ turnId: meta\.turnId, connectionEpoch: meta\.connectionEpoch \}\);/);
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
