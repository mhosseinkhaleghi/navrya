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

test('the mic stream is only requested via getUserMedia at connect() time (no auto-enable on load), and disconnect() always stops its tracks', () => {
  const connectIndex = source.indexOf('async function connect()');
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

test('a voice-originated turn goes through the exact same submit()/core.sendChat() path a typed message uses - no parallel voice-only conversation logic', () => {
  // {0,600}, not {0,200}: the latency pass (docs/ai/latency-architecture.md) added a
  // transcript-to-reply timing stamp between the function opening and the real submitRef.current()
  // call this test cares about - still the same single real call, just a few lines further down.
  // Journey G UX correction: submitRef.current()'s options now also carry
  // awaitingCompanionOpeningReply (read-and-cleared from a ref right above this same call) - still
  // the one real submit() call, an additive field, never a second/parallel path.
  assert.match(dockViewSource, /function onVoiceTranscript\(transcriptText\)[\s\S]{0,600}submitRef\.current\(transcriptText, \{ source: 'voice', awaitingCompanionOpeningReply: wasAwaitingCompanionOpeningReply \}\)/);
  assert.match(dockViewSource, /onFinalTranscript:\s*onVoiceTranscript/);
});

// Found via real E1 multi-turn browser testing: two finalized transcripts arriving close
// together each independently raced core.sendChat()'s own read of workflow/activeProcess state,
// producing duplicate session.create action turns instead of the second one filling the form the
// first had just opened.
test('voice turns are serialized through a queue - never processed concurrently ("one utterance -> one Copilot turn")', () => {
  assert.match(dockViewSource, /const voiceTurnQueue = React\.useRef\(Promise\.resolve\(\)\)/);
  assert.match(dockViewSource, /voiceTurnQueue\.current = voiceTurnQueue\.current[\s\S]{0,40}\.then\(/);
});

test('speak() is only ever called with what NAVRYA\'s own deterministic turn produced (voiceReply/reply from the submit() result, then the Persian Voice Quality gate\'s own deterministic ai-voice-text.js post-processing - see ai-voice-chatdock-ux.test.mjs), never anything the Realtime model decided on its own, and is awaited so the queue waits for it to actually finish', () => {
  assert.match(dockViewSource, /const rawToSpeak = result && \(result\.voiceReply \|\| result\.reply\)/);
  assert.match(dockViewSource, /const toSpeak = rawToSpeak && voiceText \? voiceText\.toSpokenText\(rawToSpeak, i18n\.language\(\)\) : rawToSpeak;/);
  assert.match(dockViewSource, /await voiceRef\.current\.speak\(toSpeak\)/);
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

test('the voice session\'s language is re-synced from the live i18n.language() immediately before every connect() - not only once at mount, which would miss a language switch made before the mic is first pressed', () => {
  const toggleVoiceBody = dockViewSource.slice(dockViewSource.indexOf('function toggleVoice'), dockViewSource.indexOf('function applySuggestion'));
  const setLanguageIndex = toggleVoiceBody.indexOf('voiceRef.current.setLanguage(i18n.language())');
  const connectIndex = toggleVoiceBody.indexOf('voiceRef.current.connect()');
  assert.ok(setLanguageIndex > -1 && connectIndex > -1 && setLanguageIndex < connectIndex, 'setLanguage() must run before connect() inside toggleVoice()');
});
