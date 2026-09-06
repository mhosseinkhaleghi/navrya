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
  assert.match(dock, /async function fetchGeminiLiveSession\(language\) \{[\s\S]*?body: JSON\.stringify\(\{ language \}\)/);
  assert.match(dock, /async function fetchGeminiSpeak\(language, text\) \{[\s\S]*?body: JSON\.stringify\(\{ language, text, character: voiceCharacter\(\), gender: voiceGenderPreference\(\) \}\)/);
  assert.doesNotMatch(dock, /apiKey: settingsStore\.getKey\('gemini'\)/);
});

test('Gemini Live is selected only for Gemini, while finalized voice turns always use OpenAI chat', () => {
  assert.match(dock, /provider: source === 'voice' \? 'openai' : undefined/);
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
  assert.match(connectFn, /await Promise\.race\(\[fetchSession\(language\), deadline\]\)/);
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
  assert.match(speakFn, /if \(token !== activeSpeakToken\) return; \/\/ interrupted before playback began/);
  const interruptFn = adapter.slice(adapter.indexOf('function interrupt()'), adapter.indexOf('function finishUserTurn()'));
  assert.match(interruptFn, /activeSpeakToken = null;/);
});
