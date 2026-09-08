import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const adapter = await readFile(path.join(root, 'navrya-src', 'geminiLiveVoice.js'), 'utf8');
const dock = await readFile(path.join(root, 'navrya-src', 'chatDockView.jsx'), 'utf8');

test('Gemini Voice uses a constrained short-lived Live token, never a browser-exposed permanent API key', () => {
  assert.match(adapter, /BidiGenerateContentConstrained/);
  assert.match(adapter, /access_token=\$\{encodeURIComponent\(creds\.token\)\}/);
  assert.doesNotMatch(adapter, /GEMINI_API_KEY/);
  assert.match(dock, /fetch\('\/api\/ai\/gemini-live\/session', \{/);
  assert.match(dock, /async function fetchGeminiLiveSession\(language, options\) \{[\s\S]*?body: JSON\.stringify\(\{ language \}\)/);
  assert.match(dock, /async function fetchGeminiSpeak\(language, text, options\) \{[\s\S]*?body: JSON\.stringify\(\{ language, text, character: voiceCharacter\(\), gender: voiceGenderPreference\(\) \}\)/);
  assert.doesNotMatch(dock, /apiKey: settingsStore\.getKey\('gemini'\)/);
});

// Provider Ownership addendum, section 1: "finalized voice turns always use OpenAI chat" was the
// old, now-removed behavior - a real, confirmed silent-provider-mismatch bug (a user's own
// configured Gemini/Anthropic/Kimi/DeepSeek reasoning provider was silently overridden to OpenAI
// for every Voice-originated turn). Gemini Live is still selected only for Gemini as the
// TRANSPORT, but reasoning now follows the same active provider a typed turn already uses.
test('Gemini Live is selected only for Gemini as the transport; voice-originated reasoning follows the same active provider a typed turn already uses, never hardcoded to OpenAI', () => {
  assert.doesNotMatch(dock, /provider: source === 'voice' \? 'openai' : undefined/);
  assert.match(dock, /const useGeminiLive = providerId === 'gemini';/);
  assert.match(dock, /const createTransport = useGeminiLive \? createGeminiLiveSession : createVoiceSession;/);
  assert.match(dock, /fetchSession: useGeminiLive \? fetchGeminiLiveSession : fetchRealtimeSession,/);
  assert.match(dock, /fetchSpeakAudio: useGeminiLive \? fetchGeminiSpeak : fetchVoiceProviderSpeak,/);
});

test('Gemini Voice sends 16 kHz PCM transcription and routes only final text through the existing ChatDock coordinator', () => {
  assert.match(adapter, /const INPUT_SAMPLE_RATE = 16000;/);
  assert.match(adapter, /const LIVE_TRANSCRIPTION_LOCALES = Object\.freeze\(\{ fa: 'fa-IR', ar: 'ar-EG', en: 'en-US', es: 'es-ES' \}\);/);
  assert.match(adapter, /function normalizeLanguage\(value\) \{[\s\S]*?return Object\.prototype\.hasOwnProperty\.call\(LIVE_TRANSCRIPTION_LOCALES, value\) \? value : 'en';/);
  assert.match(adapter, /setLanguage: \(value\) => \{ language = normalizeLanguage\(value\); \}/);
  assert.match(adapter, /mimeType: 'audio\/pcm;rate=16000'/);
  assert.match(adapter, /inputAudioTranscription: \{ languageCodes: \[LIVE_TRANSCRIPTION_LOCALES\[language\]\], mode: 'SMART' \}/);
  assert.match(adapter, /content\.inputTranscription/);
  assert.match(adapter, /onFinalTranscript\(text\)/);
  assert.match(dock, /onFinalTranscript: onVoiceTranscript/);
});

test('Gemini TTS receives only an injected approved reply and emits the same playback lifecycle events as the existing controller path', () => {
  assert.match(adapter, /const fetchSpeakAudio = options\.fetchSpeakAudio;/);
  assert.doesNotMatch(adapter, /\/api\/ai\/gemini-live\/speak/);
  assert.match(adapter, /onOutputAudioBufferEvent\('output_audio_buffer.started', null\)/);
  assert.match(adapter, /output_audio_buffer\.stopped/);
  assert.match(adapter, /function finishUserTurn\(\)[\s\S]*?audioStreamEnd here either/);
});

// Slice R2 (transport repair), audit finding T12: verified against the Gemini Live API's own
// documentation - manual turn-ending (activityEnd) is only honored when the whole session is
// switched to manual VAD (realtimeInputConfig.automaticActivityDetection.disabled), a materially
// different architecture this slice does not adopt. finishUserTurn() now honestly reports no real
// capability instead of performing a no-op state change that looks like it worked.
test('finishUserTurn() honestly reports no real capability via supportsManualFinish(), rather than faking a turn-finish with a no-op state change', () => {
  assert.match(adapter, /function finishUserTurn\(\) \{[\s\S]*?return false;\s*\n\s*\}/);
  assert.match(adapter, /function supportsManualFinish\(\) \{ return false; \}/);
  assert.match(adapter, /connect, disconnect, mute, interrupt, speak, playAudioUrl, finishUserTurn, supportsManualFinish, markPlaybackEnded,/);
});

test('a configuration or Live connection error is never mislabeled as microphone denial', () => {
  const chatDock = path.join(root, 'public', 'pages', 'shared', 'navrya', 'components', 'assistant', 'ChatDock.jsx');
  const consolePath = path.join(root, 'public', 'pages', 'shared', 'navrya', 'components', 'assistant', 'VoiceConsole.jsx');
  return Promise.all([readFile(chatDock, 'utf8'), readFile(consolePath, 'utf8')]).then(([chatDockSource, consoleSource]) => {
    assert.match(chatDockSource, /voicePermissionDenied \? voiceLabels\.captionDenied : \(voiceErrorLabel \|\| voiceLabels\.error\)/);
    assert.match(consoleSource, /denied \? 'MIC DENIED' : \(PHASE_CODE\[voiceState\] \|\| ''\)/);
    assert.match(adapter, /error\.code \|\| \(error\.name && error\.name !== 'Error'/);
  });
});

test('Gemini errors can explicitly end Voice and always release failed transport resources before retrying', () => {
  const chatDock = path.join(root, 'public', 'pages', 'shared', 'navrya', 'components', 'assistant', 'ChatDock.jsx');
  const consolePath = path.join(root, 'public', 'pages', 'shared', 'navrya', 'components', 'assistant', 'VoiceConsole.jsx');
  return Promise.all([readFile(chatDock, 'utf8'), readFile(consolePath, 'utf8')]).then(([chatDockSource, consoleSource]) => {
    assert.match(adapter, /function failAndCleanup\(error, stage\) \{[\s\S]*?teardown\(\);[\s\S]*?reportFailure\(error, stage\);/);
    assert.match(adapter, /async function connect\(connectOptions\) \{[\s\S]*?teardown\(\);[\s\S]*?intentionalClose = false;/);
    // Slice R2, audit finding T7: an unexpected post-setup close no longer goes straight to
    // terminal failAndCleanup() - it now enters the same bounded reconnect loop a dropped OpenAI
    // Realtime connection already gets (scheduleReconnect(), asserted separately below).
    assert.match(adapter, /socket\.onclose = \(\) => \{[\s\S]*?if \(!settled\) \{\s*\n\s*fail\(error\);\s*\n\s*\} else \{[\s\S]*?scheduleReconnect\(myEpoch\);/);
    // Slice R2, audit finding T9: a post-setup message.error is no longer silently dropped -
    // failAndCleanup() runs even when `settled` is already true.
    assert.match(adapter, /if \(message\.error\) \{[\s\S]*?GEMINI_LIVE_SETUP_FAILED_[\s\S]*?if \(!settled\) \{ fail\(error\); \} else \{ failAndCleanup\(error, failureStage\(error\)\); \}/);
    assert.match(dock, /onVoiceEnd=\{endVoice\}/);
    assert.match(chatDockSource, /onVoiceEnd=\{onVoiceEnd\}/);
    assert.match(consoleSource, /<DeniedCard strings=\{strings\} onRetry=\{onVoiceToggle\} onEnd=\{onVoiceEnd\}/);
    assert.match(consoleSource, /aria-label=\{strings\.close\} title=\{strings\.close\} onClick=\{onVoiceEnd\}/);
  });
});

// Slice R2, audit finding T7: Gemini Live previously had no automatic reconnect/connection-epoch
// mechanism at all - any post-setup close (network hiccup, server-side close) ended the session
// in terminal ERROR, unlike the OpenAI Realtime adapter's own bounded 5-attempt reconnect.
test('Gemini Live now has the same bounded exponential-backoff reconnect contract as the OpenAI Realtime adapter, with its own connectionEpoch to abandon a superseded attempt', () => {
  assert.match(adapter, /let connectionEpoch = 0;/);
  assert.match(adapter, /const RECONNECT_BASE_DELAY_MS = 500;/);
  assert.match(adapter, /const RECONNECT_MAX_DELAY_MS = 8000;/);
  assert.match(adapter, /const RECONNECT_MAX_ATTEMPTS = 5;/);
  const fn = adapter.slice(adapter.indexOf('function scheduleReconnect(myEpoch)'), adapter.indexOf('async function connect(connectOptions)'));
  assert.match(fn, /if \(myEpoch !== connectionEpoch\) return;/);
  assert.match(fn, /if \(reconnectAttempt >= RECONNECT_MAX_ATTEMPTS\) \{/);
  assert.match(fn, /onError\(\{ code: 'VOICE_RECONNECT_EXHAUSTED', stage: 'reconnect' \}\);/);
  assert.match(fn, /connect\(\{ isReconnect: true \}\)/);
});

// Slice R2, audit finding T8: the old 15s timer was scoped only to socket setup - permission,
// token fetch and AudioContext resume all ran before it with no deadline at all. One shared
// deadline now covers the whole sequence, mirroring aiVoiceRealtime.js's own connect().
test('connect() races the whole startup sequence (mic, token mint, AudioContext resume, socket setup) against one shared CONNECT_TIMEOUT_MS deadline, not just socket setup alone', () => {
  const connectFn = adapter.slice(adapter.indexOf('async function connect(connectOptions)'), adapter.indexOf('function disconnect()'));
  assert.match(connectFn, /const deadline = new Promise/);
  assert.match(connectFn, /await Promise\.race\(\[micPromise, deadline\]\)/);
  assert.match(connectFn, /await Promise\.race\(\[fetchSession\(language, \{ signal: mintAbortController && mintAbortController\.signal \}\), deadline\]\)/);
  assert.match(connectFn, /await Promise\.race\(\[audioContext\.resume\(\), deadline\]\)/);
  assert.match(connectFn, /await openSocket\(creds, myEpoch, deadline\);/);
  assert.match(adapter, /const CONNECT_TIMEOUT_MS = 15000;/);
});

// Slice R2, audit findings T13/T14: verified against the Gemini Live API's own documentation and
// a confirmed upstream gap (googleapis/js-genai#1429) - every inputTranscription message is only
// ever a fragment, never the full accumulated turn, and the documented `finished` flag is not
// reliably sent. The old code treated each raw message as an already-complete, potentially
// duplicate utterance (a 30s text-based dedup Set) - that dedup is gone entirely, replaced by
// per-utterance fragment accumulation with two flush triggers.
test('inputTranscription fragments are accumulated into a buffer and flushed as one finalized transcript - immediately on the documented finished flag, or after a short quiet window otherwise', () => {
  assert.match(adapter, /let pendingTranscript = '';/);
  assert.match(adapter, /let transcriptFlushTimer = null;/);
  const flushFn = adapter.slice(adapter.indexOf('function flushTranscript()'), adapter.indexOf('function playPcm'));
  assert.match(flushFn, /const text = pendingTranscript\.trim\(\);/);
  assert.match(flushFn, /pendingTranscript = '';/);
  assert.match(flushFn, /onFinalTranscript\(text\);/);
  const onmessageFn = adapter.slice(adapter.indexOf('socket.onmessage = async'), adapter.indexOf('socket.onerror'));
  assert.match(onmessageFn, /pendingTranscript \+= fragment;/);
  assert.match(onmessageFn, /if \(content\.inputTranscription\.finished\) \{ flushTranscript\(\); \} else \{ transcriptFlushTimer = setTimeout\(flushTranscript, TRANSCRIPT_FRAGMENT_QUIET_MS\); \}/);
  assert.doesNotMatch(adapter, /handledTranscripts/, 'the old text-based dedup Set must be gone - per-utterance accumulation makes it unnecessary and it wrongly conflated two separate identical utterances (audit finding T13)');
});

// Slice R2, audit finding T2-equivalent for Gemini: a mic grant that resolves after a newer
// connect()/disconnect() has already run must never be left as a live orphaned track.
test('a late mic grant for Gemini is stopped immediately if a newer connect()/disconnect() has already superseded it, both via the raw promise continuation and the post-race epoch check', () => {
  const connectFn = adapter.slice(adapter.indexOf('async function connect(connectOptions)'), adapter.indexOf('function disconnect()'));
  assert.match(connectFn, /micPromise\.then\(\(stream\) => \{ if \(myEpoch !== connectionEpoch\) \{ try \{ stream\.getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\); \} catch \(_\) \{\} \} \}, \(\) => \{\}\);/);
  assert.match(connectFn, /if \(myEpoch !== connectionEpoch\) \{\s*\n\s*try \{ grantedStream\.getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\); \} catch \(_\) \{\}\s*\n\s*return;\s*\n\s*\}\s*\n\s*mediaStream = grantedStream;/);
});

// Natural Listening addendum, Section 2/3: wireMicrophone() previously used one fixed energy
// threshold (0.025) with no minimum-duration requirement at all - a single loud frame of
// background noise while the assistant was speaking immediately flipped state and fired
// onBargeIn(), with no cooldown against repeated interrupts. Replaced with the pure, independently
// unit-tested geminiSpeechActivityDetector.js module (see its own dedicated test file) - this test
// proves the WIRING: a fresh detector per real connection, decisions driven by its
// becameSpeaking/becameQuiet/bargeIn outputs (never a bare energy comparison inline any more), and
// the unconditional realtimeInput send (local detection must never gate what reaches the server).
test('wireMicrophone() drives USER_SPEAKING/LISTENING/onBargeIn from a fresh geminiSpeechActivityDetector() per connection, not an inline fixed-threshold comparison, and still sends every frame to the server regardless of local detector state', () => {
  assert.match(adapter, /import \{ createSpeechActivityDetector \} from '\.\/geminiSpeechActivityDetector\.js';/);
  const fn = adapter.slice(adapter.indexOf('function wireMicrophone'), adapter.indexOf('function flushTranscript'));
  assert.doesNotMatch(fn, /0\.025/, 'the old fixed energy threshold must be fully removed from this file - all threshold/hysteresis logic now lives in geminiSpeechActivityDetector.js');
  assert.match(fn, /const speechDetector = createSpeechActivityDetector\(\);/, 'a fresh detector per wireMicrophone() call (i.e. per real connection) - never a stale cross-session singleton');
  assert.match(fn, /const activity = speechDetector\.process\(result\.energy, Date\.now\(\)\);/);
  assert.match(fn, /if \(activity\.becameSpeaking\) \{/);
  assert.match(fn, /if \(activity\.bargeIn && state === VOICE_STATES\.ASSISTANT_SPEAKING\) onBargeIn\(\);/);
  assert.match(fn, /if \(state === VOICE_STATES\.LISTENING \|\| state === VOICE_STATES\.INTERRUPTED\) setState\(VOICE_STATES\.USER_SPEAKING\);/);
  assert.match(fn, /\} else if \(activity\.becameQuiet && state === VOICE_STATES\.USER_SPEAKING\) \{/);
  // The realtimeInput send must be unconditional - reachable on every code path through this
  // callback, never nested inside either branch above (local detection is UI/barge-in only, and
  // must never gate what audio actually reaches Gemini's own server-side transcription/VAD).
  const sendIndex = fn.indexOf('send({ realtimeInput:');
  assert.ok(sendIndex > fn.indexOf('becameQuiet'), 'the send call must be textually after both branches, not embedded inside either');
});

// Slice R2, audit finding T6 parity: Gemini's own PCM playback previously had NO watchdog
// whatsoever - a source whose 'onended' never fires (a genuinely stuck AudioBufferSourceNode)
// would hang the playback queue forever, unlike every playback path in aiVoiceRealtime.js.
test('playPcm has a deadline derived from the buffer\'s own known duration - a precise, non-guessed bound, not a generic stall detector, since AudioBufferSourceNode has no periodic progress event to watch', () => {
  const fn = adapter.slice(adapter.indexOf('function playPcm'), adapter.indexOf('function openSocket'));
  assert.match(fn, /const timeoutMs = Math\.ceil\(buffer\.duration \* 1000\) \+ 3000;/);
  assert.match(fn, /const timer = setTimeout\(\(\) => settle\(false\), timeoutMs\);/);
  assert.match(fn, /clearTimeout\(timer\);/);
});

// Slice R2, audit finding T5 parity for Gemini: a pending fetchSpeakAudio() call previously had no
// way to notice an interrupt() that happened while it was still in flight.
test('speak() mints a fresh activeSpeakToken per call, and interrupt() clears it first so a pending fetchSpeakAudio() call never starts playback after being interrupted', () => {
  const speakFn = adapter.slice(adapter.indexOf('function speak(text)'), adapter.indexOf('function playAudioUrl'));
  assert.match(speakFn, /const token = \{\};\s*\n\s*activeSpeakToken = token;/);
  assert.match(speakFn, /if \(token !== activeSpeakToken\) \{[\s\S]*?return; \/\/ interrupted before playback began\s*\n\s*\}\s*\n\s*lastSpeakLatencyRecord = [\s\S]*?return playPcm\(result\.audioBase64\);/, 'an interrupted call must return before ever reaching playPcm()');
  const interruptFn = adapter.slice(adapter.indexOf('function interrupt()'), adapter.indexOf('function finishUserTurn()'));
  assert.match(interruptFn, /activeSpeakToken = null;/);
});

// Voice Mode hardening, audit finding T11: playAudioUrl() previously created a completely unowned
// local Audio element - never registered in the one slot (`playbackStop`) interrupt()/teardown()
// already know how to stop, never setting ASSISTANT_SPEAKING, and never emitting the
// output_audio_buffer.* events PlaybackController relies on for captions/settlement. A barge-in
// or End Voice could therefore never actually stop a playing published clip, and it never fell
// back to TTS on a genuine decode/network failure either.
test('playAudioUrl() gives published audio the same ownership contract as playPcm(): ASSISTANT_SPEAKING state, output_audio_buffer.* events, and a real stop function registered in the shared playbackStop slot', () => {
  const fn = adapter.slice(adapter.indexOf('function playAudioUrl(url)'), adapter.indexOf('return {\n    connect, disconnect,'));
  assert.match(fn, /setState\(VOICE_STATES\.ASSISTANT_SPEAKING\);/);
  assert.match(fn, /onOutputAudioBufferEvent\('output_audio_buffer\.started', null\);/);
  assert.match(fn, /onOutputAudioBufferEvent\(ok \? 'output_audio_buffer\.stopped' : 'output_audio_buffer\.cleared', null\);/);
  assert.match(fn, /playbackStop = stopNow;/);
  assert.match(fn, /function stopNow\(\) \{ try \{ element\.pause\(\); element\.currentTime = 0; \} catch \(_\) \{\} settle\(true\); \}/);
  // A genuine decode/network failure must still reject (triggering PlaybackController's own
  // exactly-once TTS fallback for this entry) - only a deliberate interrupt/teardown-driven stop
  // settles as "ok" (no fallback).
  assert.match(fn, /function onPlaybackError\(\) \{ settle\(false\); \}/);
  assert.match(fn, /if \(ok\) resolve\(\); else reject\(new Error\('published audio playback failed'\)\);/);
});

test('playAudioUrl() has the same two-stage first-audio/stall watchdog as aiVoiceRealtime.js\'s own armPlaybackWatchdog, since an arbitrary published URL has no known duration the way playPcm()\'s already-decoded buffer does', () => {
  assert.match(adapter, /const FIRST_AUDIO_DEADLINE_MS = 12000;/);
  assert.match(adapter, /const PLAYBACK_STALL_DEADLINE_MS = 60000;/);
  const fn = adapter.slice(adapter.indexOf('function playAudioUrl(url)'), adapter.indexOf('return {\n    connect, disconnect,'));
  assert.match(fn, /let timer = setTimeout\(\(\) => settle\(false\), FIRST_AUDIO_DEADLINE_MS\);/);
  assert.match(fn, /function onProgress\(\) \{ clearTimeout\(timer\); timer = setTimeout\(\(\) => settle\(false\), PLAYBACK_STALL_DEADLINE_MS\); \}/);
});

// Voice Mode hardening, section 6: activeSpeakToken/connectionEpoch already stopped a stale
// mint/TTS RESULT from ever being adopted, but the real underlying network request (token mint,
// or fetchSpeakAudio) kept running to completion regardless - wasted cost/work for a
// connection/audio nobody would ever use. connectAbortController/speakAbortController give
// disconnect()/interrupt() something real to actually cancel, mirroring aiVoiceRealtime.js's own
// identical fix exactly.
test('connect() mints a real AbortController for the token mint, assigns it to connectAbortController, and clears it (comparing identity, never unconditionally) on both the success and failure paths', () => {
  const connectFn = adapter.slice(adapter.indexOf('async function connect(connectOptions)'), adapter.indexOf('function disconnect()'));
  assert.match(connectFn, /let mintAbortController = null;/);
  assert.match(connectFn, /mintAbortController = \(typeof AbortController !== 'undefined'\) \? new AbortController\(\) : null;/);
  assert.match(connectFn, /connectAbortController = mintAbortController;/);
  assert.match(connectFn, /fetchSession\(language, \{ signal: mintAbortController && mintAbortController\.signal \}\)/);
  // Both the success continuation and the catch block compare identity before clearing - a newer,
  // still in-flight connect() attempt's own controller must never be cleared by an older attempt
  // settling late.
  const clears = connectFn.match(/if \(connectAbortController === mintAbortController\) connectAbortController = null;/g) || [];
  assert.equal(clears.length, 2, 'expected exactly two identity-checked clears: one on the success path, one in the catch block');
});

test('speak() mints a real AbortController for the TTS fetch, assigns it to speakAbortController, and threads its signal into fetchSpeakAudio', () => {
  const fn = adapter.slice(adapter.indexOf('function speak(text)'), adapter.indexOf('function playAudioUrl(url)'));
  assert.match(fn, /const abortController = \(typeof AbortController !== 'undefined'\) \? new AbortController\(\) : null;/);
  assert.match(fn, /speakAbortController = abortController;/);
  assert.match(fn, /fetchSpeakAudio\(language, text, \{ signal: abortController && abortController\.signal \}\)/);
});

// Provider Ownership addendum, section 4/6: docs/ai/voice-architecture.md documents that Gemini's
// TTS REST endpoint (:generateContent, not a genuine incremental audio stream - see that doc's own
// investigation section) returns one complete audio buffer, so "time from fetch start to fetch
// resolved" is effectively "time to first audible sound" on this path - the one latency component
// actually worth instrumenting here, per Section 6's "measure latency components separately."
test('speak() records a sanitized per-call latency breakdown (textLength/fetchMs/interrupted only, never the transcript itself), exposed via the adapter\'s own lastSpeakLatency() getter', () => {
  const fn = adapter.slice(adapter.indexOf('function speak(text)'), adapter.indexOf('function playAudioUrl(url)'));
  assert.match(fn, /const fetchStartedAt = nowMs\(\);/);
  assert.match(fn, /const textLength = text\.length;/);
  assert.match(fn, /const fetchMs = Math\.round\(\(nowMs\(\) - fetchStartedAt\) \* 100\) \/ 100;/);
  assert.match(fn, /lastSpeakLatencyRecord = \{ textLength: textLength, fetchMs: fetchMs, interrupted: true, at: new Date\(\)\.toISOString\(\) \};/, 'an interrupted-before-playback call must still record its own real fetch latency, distinctly flagged');
  assert.match(fn, /lastSpeakLatencyRecord = \{ textLength: textLength, fetchMs: fetchMs, interrupted: false, at: new Date\(\)\.toISOString\(\) \};/);
  assert.match(fn, /lastSpeakLatencyRecord = \{ textLength: textLength, fetchMs: fetchMs, interrupted: true, error: errorCode\(error\), at: new Date\(\)\.toISOString\(\) \};/, 'a failed fetch must also record its own real elapsed time before reporting the failure');
  assert.doesNotMatch(fn, /lastSpeakLatencyRecord = \{[^}]*text:/, 'the record must never carry the spoken text itself - length only, same privacy posture as every other debug diagnostic');
  assert.match(adapter, /lastSpeakLatency: \(\) => lastSpeakLatencyRecord/, 'must be exposed on the returned session API, not left as a private, unreachable variable');
});

test('interrupt() and disconnect() both actually abort a still-in-flight token mint or TTS fetch via connectAbortController/speakAbortController, not merely rely on the pre-existing activeSpeakToken/connectionEpoch result-discard checks', () => {
  const interruptFn = adapter.slice(adapter.indexOf('function interrupt()'), adapter.indexOf('function finishUserTurn()'));
  assert.match(interruptFn, /if \(speakAbortController\) \{ try \{ speakAbortController\.abort\(\); \} catch \(_\) \{\} speakAbortController = null; \}/);
  const disconnectFn = adapter.slice(adapter.indexOf('function disconnect()'), adapter.indexOf('function mute(next)'));
  assert.match(disconnectFn, /if \(connectAbortController\) \{ try \{ connectAbortController\.abort\(\); \} catch \(_\) \{\} connectAbortController = null; \}/);
  assert.match(disconnectFn, /if \(speakAbortController\) \{ try \{ speakAbortController\.abort\(\); \} catch \(_\) \{\} speakAbortController = null; \}/);
});

test('interrupt() and teardown() (disconnect) both reach a currently-playing published clip through the same stopPlayback()/playbackStop mechanism playPcm() already uses - no second, unstoppable audio path', () => {
  const interruptFn = adapter.slice(adapter.indexOf('function interrupt()'), adapter.indexOf('function finishUserTurn()'));
  assert.match(interruptFn, /stopPlayback\(false\);/);
  const teardownFn = adapter.slice(adapter.indexOf('function teardown()'), adapter.indexOf('function reportFailure'));
  assert.match(teardownFn, /stopPlayback\(false\);/);
  const stopPlaybackFn = adapter.slice(adapter.indexOf('function stopPlayback(natural)'), adapter.indexOf('function clearReconnectTimer'));
  assert.match(stopPlaybackFn, /if \(stop\) stop\(!!natural\);/);
});
