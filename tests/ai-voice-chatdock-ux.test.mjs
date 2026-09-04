import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Journey E ChatDock Voice-UX repair, plus the Voice Mode console redesign (matches
// NavryaVoiceMode.dc.html): ChatDock.jsx/VoiceConsole.jsx/DockButton.jsx/chatDockView.jsx are
// JSX with no DOM test harness in this project - these are static-source regression guards for
// the bugs found and fixed via real browser testing, and for the "no decoy controls" rule that
// redesign pass carried forward under the new component shape (a live voice session now fully
// replaces the row with VoiceConsole/VoiceMiniBar rather than coexisting with the plain status
// pill the original repair pass added). Real-browser verification (real WebRTC connection, real
// synthesized speech, real audio-element playback diagnostics, real AnalyserNode-driven waveform)
// is the actual proof these work - see the final report for each pass's results.

const root = process.cwd();
const chatDockSrc = await readFile(path.join(root, 'public', 'pages', 'shared', 'navrya', 'components', 'assistant', 'ChatDock.jsx'), 'utf8');
const voiceConsoleSrc = await readFile(path.join(root, 'public', 'pages', 'shared', 'navrya', 'components', 'assistant', 'VoiceConsole.jsx'), 'utf8');
const dockButtonSrc = await readFile(path.join(root, 'public', 'pages', 'shared', 'navrya', 'components', 'assistant', 'DockButton.jsx'), 'utf8');
const dockViewSrc = await readFile(path.join(root, 'navrya-src', 'chatDockView.jsx'), 'utf8');
const voiceSrc = await readFile(path.join(root, 'navrya-src', 'aiVoiceRealtime.js'), 'utf8');
const i18nSrc = await readFile(path.join(root, 'public', 'pages', 'shared', 'ai-i18n.js'), 'utf8');

test('the primary dock button is a real dual-purpose control, never a decoy: icon and onClick both switch together between Send and Voice-start (never just the icon)', () => {
  assert.match(chatDockSrc, /icon=\{showSend \? 'arrow-up' : 'audio-lines'\}/);
  assert.match(chatDockSrc, /onClick=\{mainAction\}/);
  const mainActionFn = chatDockSrc.slice(chatDockSrc.indexOf('const mainAction'), chatDockSrc.indexOf('const list ='));
  assert.match(mainActionFn, /if \(showSend\) submit\(\); else if \(onVoiceToggle\) onVoiceToggle\(\);/);
});

test('a live voice session replaces the plain typing row entirely with VoiceConsole/VoiceMiniBar, rather than coexisting with it - matches the confirmed design (voice mode is a distinct mode, not simultaneous with typing)', () => {
  assert.match(chatDockSrc, /\{idle && \(/);
  assert.match(chatDockSrc, /\{!idle && voiceMinimized && \(\s*<VoiceMiniBar/);
  assert.match(chatDockSrc, /\{!idle && !voiceMinimized && \(\s*<VoiceConsole/);
});

test('every real VOICE_STATES value the adapter can report is covered by a distinct status treatment - never collapsed into one generic "listening" boolean', () => {
  const required = ['requesting_permission', 'connecting', 'listening', 'user_speaking', 'processing', 'assistant_speaking', 'interrupted', 'reconnecting'];
  for (const state of required) {
    assert.match(chatDockSrc, new RegExp(state + ':'), `VOICE_STATE_DOT or the phase label/caption maps must cover "${state}"`);
  }
  // ASSISTANT_SPEAKING gets its own distinct tone (gold-warm), never the same colour as the
  // user's own mic being live (char-accent) - the one state where it's NAVRYA making the sound.
  assert.match(chatDockSrc, /assistant_speaking: 'var\(--gold-warm\)'/);
});

test('the plain text input only ever renders inside the idle row - a live voice session can never show both the text input and the voice console/mini bar at once (the original "status text squeezes the input" bug is now structurally impossible)', () => {
  const inputCount = (chatDockSrc.match(/<input\b/g) || []).length;
  assert.equal(inputCount, 1, 'exactly one <input>, inside the idle-only row');
  assert.doesNotMatch(voiceConsoleSrc, /<input\b/, 'VoiceConsole/VoiceMiniBar must never render a text input - voice mode fully replaces the typing row');
  assert.match(voiceConsoleSrc, /flexWrap: 'wrap'/, 'the phase label/caption row must still wrap rather than overflow, the same overflow-safety property the old capped status pill protected');
});

test('the mute control lives in the voice console (only ever rendered while a real session is live, since VoiceConsole/VoiceMiniBar are only rendered while non-idle) and reads/flips the real voiceMuted state', () => {
  assert.match(voiceConsoleSrc, /aria-label=\{voiceMuted \? strings\.unmute : strings\.mute\} onClick=\{onVoiceMuteToggle\}/);
  assert.match(voiceConsoleSrc, /name=\{voiceMuted \? 'mic-off' : 'mic'\}/);
});

test('DockButton still supports its distinct danger styling (red border/tint) for other ghost-tone controls, and the Voice ERROR state is now shown via VoiceConsole\'s own dedicated denied/error card (--danger colour + a triangle-alert icon), never as an indistinguishable normal "active" toggle', () => {
  assert.match(dockButtonSrc, /danger = false/);
  assert.match(dockButtonSrc, /var\(--danger,#e05a5a\)/);
  assert.match(voiceConsoleSrc, /var\(--danger\)/);
  assert.match(voiceConsoleSrc, /triangle-alert/);
});

test('chatDockView.jsx keeps retry and end-session distinct: toggleVoice retries an error, while endVoice always disconnects, and mute reads/flips the adapter\'s own isMuted()', () => {
  assert.match(dockViewSrc, /onVoiceToggle=\{toggleVoice\} onVoiceEnd=\{endVoice\} onVoiceMuteToggle=\{toggleVoiceMute\}/);
  assert.match(dockViewSrc, /function endVoice\(\) \{[\s\S]*?voiceRef\.current\.disconnect\(\);/);
  assert.match(dockViewSrc, /function toggleVoiceMute\(\) \{[\s\S]*?voiceRef\.current\.mute\(!voiceRef\.current\.isMuted\(\)\);/);
});

// fix/voice-mode-hosted-connection (Phase 3): a denied microphone permission is still its own
// distinct, clearer localized error message - now derived from the sanitized stage
// aiVoiceRealtime.js's connect() reports (stage:'microphone_permission', one of the twelve
// canonical Voice Mode diagnostic stages) rather than a dedicated boolean the dock set directly.
// Every other connection-failure stage (session_auth/session_quota/key_missing/key_rejected/
// model_unavailable/token_mint_timeout/sdp_exchange/sdp_relay_timeout/ice_connection/
// data_channel/session_ack) now also gets its own distinct localized message - see
// VOICE_ERROR_STAGE_I18N_KEY/voiceErrorMessageForStage below.
test('a denied microphone permission gets its own distinct, clearer localized error message than every other Voice failure mode - stage:\'microphone_permission\' is checked explicitly', () => {
  assert.match(dockViewSrc, /voicePermissionDenied = voiceErrorStage === 'microphone_permission'/);
  assert.match(dockViewSrc, /setVoiceErrorStage\(\(detail && detail\.stage\) \|\| null\)/);
  assert.match(dockViewSrc, /voiceErrorLabel=\{voiceErrorMessageForStage\(i18n, voiceErrorStage\)\}/);
});

test('every one of the twelve canonical Voice Mode connection-diagnostic stages resolves to a real, distinct i18n key, with a safe fallback to the pre-existing generic message for anything unrecognized', () => {
  const stages = [
    'microphone_permission', 'session_auth', 'session_quota', 'key_missing', 'key_rejected',
    'model_unavailable', 'token_mint_timeout', 'sdp_exchange', 'sdp_relay_timeout',
    'ice_connection', 'data_channel', 'session_ack'
  ];
  for (const stage of stages) {
    assert.match(dockViewSrc, new RegExp(`${stage}: 'voiceDockError`), `stage '${stage}' must map to a real voiceDockError* i18n key`);
  }
  assert.match(dockViewSrc, /VOICE_ERROR_STAGE_I18N_KEY\[stage\] \|\| 'voiceDockError'/);
});

test('every new stage-specific Voice error message exists in all four supported languages (fa/ar/en/es), never falling back to English or a missing key', () => {
  const keys = [
    'voiceDockErrorSessionAuth', 'voiceDockErrorSessionQuota', 'voiceDockErrorKeyMissing',
    'voiceDockErrorKeyRejected', 'voiceDockErrorModelUnavailable', 'voiceDockErrorMintTimeout',
    'voiceDockErrorSdpExchange', 'voiceDockErrorSdpTimeout', 'voiceDockErrorIceConnection',
    'voiceDockErrorDataChannel', 'voiceDockErrorSessionAck'
  ];
  for (const key of keys) {
    const occurrences = (i18nSrc.match(new RegExp(`${key}:`, 'g')) || []).length;
    assert.equal(occurrences, 4, `${key} must be declared exactly once in each of the four language blocks (fa/ar/en/es), found ${occurrences}`);
  }
});

test('mute state is tracked via the adapter\'s own onMuteChange callback (React state stays a mirror of the real adapter, never a second independent source of truth)', () => {
  assert.match(dockViewSrc, /onMuteChange: setVoiceMuted/);
  assert.match(voiceSrc, /onMuteChange\(isMuted\)/);
});

test('debugState()\'s own muted field is refreshed by BOTH a real state transition and a mute()/unmute() call - found via real browser testing: it used to only refresh from setState(), leaving it stale (still reporting muted:false) right after a mute() call that changed nothing about `state` itself', () => {
  const muteFn = voiceSrc.slice(voiceSrc.indexOf('function mute(muted)'), voiceSrc.indexOf('function mute(muted)') + 300);
  assert.match(muteFn, /refreshDebugState\(\)/);
  const setStateFn = voiceSrc.slice(voiceSrc.indexOf('function setState(next)'), voiceSrc.indexOf('function setState(next)') + 200);
  assert.match(setStateFn, /refreshDebugState\(\)/);
  // Exactly one real object-literal call site building the diagnostic - both paths share it.
  const literalCalls = (voiceSrc.match(/setDebugState\(\{[^}]*\}\)/g) || []).length;
  assert.equal(literalCalls, 1);
});

test('a real, inspectable <audio> element is handed to the transport (not left for the SDK to create invisibly) - the only way to OBJECTIVELY prove assistant audio is actually playing, not just that the state machine says so', () => {
  assert.match(voiceSrc, /audioEl = document\.createElement\('audio'\)/);
  assert.match(voiceSrc, /audioEl\.autoplay = true/);
  assert.match(voiceSrc, /mediaStream: mediaStream, audioElement: audioEl/);
});

// fix/voice-mode-hosted-connection: production evidence showed the browser posting the SDP offer
// directly to https://api.openai.com/v1/realtime/calls (net::ERR_FAILED, no response at all -
// docs/ai/voice-mode-performance-gap-matrix.md), because OpenAIRealtimeWebRTC defaults to that
// upstream whenever no `baseUrl` is given (verified against the installed SDK's own source,
// node_modules/@openai/agents-realtime/dist/openaiRealtimeWebRtc.mjs). The fix must be an
// ABSOLUTE same-origin URL, never a bare relative path - the SDK's own connect() does
// `new URL(baseUrl)`, which throws immediately on a relative string.
test('the WebRTC transport is constructed with an absolute, same-origin baseUrl pointing at NAVRYA\'s own SDP relay - the browser must never be given the bare OpenAI upstream to call directly', () => {
  assert.match(voiceSrc, /new OpenAIRealtimeWebRTC\(\{[\s\S]{0,200}baseUrl:\s*new URL\('\/api\/ai\/realtime\/call', window\.location\.origin\)\.href/);
  assert.doesNotMatch(voiceSrc, /new OpenAIRealtimeWebRTC\(\{\s*mediaStream: mediaStream, audioElement: audioEl\s*\}\)/, 'must not construct the transport with no baseUrl at all - that is exactly the direct-to-OpenAI production bug this fixes');
});

test('audioDiagnostics() reports playback/track metadata only (paused state, live track presence) - never the audio content itself', () => {
  const fn = voiceSrc.slice(voiceSrc.indexOf('function audioDiagnostics'), voiceSrc.indexOf('function onTransportEvent'));
  assert.match(fn, /hasAudioElement/);
  assert.match(fn, /audioPaused/);
  assert.match(fn, /audioTrackActive/);
  assert.doesNotMatch(fn, /transcript|apiKey/i);
});

test('getMediaStream() is a purely additive, read-only accessor for the same stream already captured at connect() time - it changes nothing about the transport itself, only lets the UI build its own AnalyserNode for a real, audio-reactive waveform', () => {
  assert.match(voiceSrc, /getMediaStream: function \(\) \{ return mediaStream; \}/);
});

// Voice Mode performance pass: audioEl cleanup moved into the shared teardownTransport() helper
// (also used by the reconnect path, which needs the identical cleanup without touching `state`
// or the reconnect timer the way the public disconnect() does) - disconnect() itself still calls
// it, and still resets mute (a disconnect concern specifically, not shared with a mid-reconnect
// teardown, which must keep whatever mute the user had set for when the reconnect succeeds).
test('disconnect() tears down the audio element via teardownTransport() and resets mute back to false - a fresh connect() must never inherit stale audio/mute state from a previous session', () => {
  const disconnectFn = voiceSrc.slice(voiceSrc.indexOf('function disconnect()'), voiceSrc.indexOf('// Orthogonal to `state`'));
  assert.match(disconnectFn, /teardownTransport\(\);/);
  assert.match(disconnectFn, /isMuted = false/);
  const teardownFn = voiceSrc.slice(voiceSrc.indexOf('function teardownTransport()'), voiceSrc.indexOf('// An unexpected drop'));
  assert.match(teardownFn, /audioEl = null/);
});

test('no browser SpeechSynthesis is ever used as a second, competing voice engine - the Realtime WebRTC audio-output path is the only spoken-audio path, per the explicit "do not add a second engine" requirement', () => {
  assert.doesNotMatch(voiceSrc, /speechSynthesis|SpeechSynthesisUtterance/i);
  assert.doesNotMatch(dockViewSrc, /speechSynthesis|SpeechSynthesisUtterance/i);
});

// Regression (2026-09-04, live production incident): the Voice transport is NOT unconditionally
// Gemini - it briefly was, hardcoded, taking real OpenAI Realtime ("ChatGPT voice") out of reach
// for every non-Gemini user in production. The mount effect itself never re-runs when the active
// chat provider changes ([] deps, so an active session is never torn down mid-conversation by a
// provider switch) - but WHICH transport it constructs at that one mount still depends on
// providerId (Gemini only for providerId === 'gemini', OpenAI Realtime for everyone else).
test('the Voice transport (OpenAI Realtime for non-Gemini providers, Gemini Live only for providerId===\'gemini\') is chosen once at mount and torn down cleanly - never re-selected on a later chat-provider switch', () => {
  const effectBlock = dockViewSrc.slice(dockViewSrc.indexOf('// Text-provider selection must never disconnect'), dockViewSrc.indexOf('function toggleVoice()'));
  assert.match(effectBlock, /const useGeminiLive = providerId === 'gemini';/);
  assert.match(effectBlock, /const createTransport = useGeminiLive \? createGeminiLiveSession : createVoiceSession;/);
  assert.match(effectBlock, /voiceRef\.current = createTransport\(\{/);
  assert.match(effectBlock, /fetchSession: useGeminiLive \? fetchGeminiLiveSession : fetchRealtimeSession,/);
  assert.match(effectBlock, /fetchSpeakAudio: useGeminiLive \? fetchGeminiSpeak : fetchVoiceProviderSpeak,/);
  assert.match(effectBlock, /playbackControllerRef\.current = window\.TradeJournalAIVoicePlaybackController\.create\(/);
  assert.match(effectBlock, /turnCoordinatorRef\.current = window\.TradeJournalAIVoiceTurnCoordinator\.create\(/);
  assert.match(effectBlock, /return \(\) => \{ if \(voiceRef\.current\) voiceRef\.current\.disconnect\(\); if \(playbackControllerRef\.current\) playbackControllerRef\.current\.invalidate\(\); \};/);
  assert.match(effectBlock, /\}, \[\]\);/);
});

test('every one of the new voiceDock* keys exists, with a real (non-empty, non-key-name) value, in all four supported languages', () => {
  const keys = [
    'voiceDockStart', 'voiceDockStop', 'voiceDockRequestingPermission', 'voiceDockConnecting',
    'voiceDockListening', 'voiceDockUserSpeaking', 'voiceDockProcessing', 'voiceDockSpeaking',
    'voiceDockReconnecting', 'voiceDockError', 'voiceDockErrorPermissionDenied',
    'voiceDockMute', 'voiceDockUnmute', 'voiceDockMuted'
  ];
  const langBlocks = {
    fa: /fa: \{([\s\S]*?)\r?\n    \},\r?\n    ar:/, ar: /ar: \{([\s\S]*?)\r?\n    \},\r?\n    en:/,
    en: /en: \{([\s\S]*?)\r?\n    \},\r?\n    es:/, es: /es: \{([\s\S]*?)\r?\n    \}\r?\n  \};/
  };
  for (const lang of Object.keys(langBlocks)) {
    const match = langBlocks[lang].exec(i18nSrc);
    assert.ok(match, `could not isolate the ${lang} messages block`);
    const block = match[1];
    for (const key of keys) {
      const keyMatch = new RegExp(key + ": '([^']+)'").exec(block);
      assert.ok(keyMatch, `${lang} is missing ${key}`);
      assert.ok(keyMatch[1].trim().length > 0, `${lang}.${key} must not be empty`);
    }
  }
});

test('every one of the new voiceConsole* keys (the console\'s own chrome: captions, heard/reply labels, keyboard hints, mic-denied card) exists, with a real value, in all four supported languages', () => {
  const keys = [
    'voiceConsoleAnalysing', 'voiceConsoleCaptionConnecting', 'voiceConsoleCaptionListening', 'voiceConsoleCaptionUserSpeaking',
    'voiceConsoleCaptionProcessing', 'voiceConsoleCaptionSpeaking', 'voiceConsoleCaptionMuted', 'voiceConsoleCaptionDenied',
    'voiceConsoleListeningPlaceholder', 'voiceConsoleHeardLabel', 'voiceConsoleReplyLabel', 'voiceConsoleType', 'voiceConsoleStopReply',
    // fix/voice-mode-turn-ux (Part D, "End message"):
    'voiceConsoleEndMessage', 'voiceConsoleEndingMessage',
    'voiceConsoleCaptionsOn', 'voiceConsoleCaptionsOff', 'voiceConsoleMinimize', 'voiceConsoleExpand', 'voiceConsoleClose',
    'voiceConsoleDeniedTitle', 'voiceConsoleDeniedBody', 'voiceConsoleRetry'
  ];
  const langBlocks = {
    fa: /fa: \{([\s\S]*?)\r?\n    \},\r?\n    ar:/, ar: /ar: \{([\s\S]*?)\r?\n    \},\r?\n    en:/,
    en: /en: \{([\s\S]*?)\r?\n    \},\r?\n    es:/, es: /es: \{([\s\S]*?)\r?\n    \}\r?\n  \};/
  };
  for (const lang of Object.keys(langBlocks)) {
    const match = langBlocks[lang].exec(i18nSrc);
    assert.ok(match, `could not isolate the ${lang} messages block`);
    const block = match[1];
    for (const key of keys) {
      const keyMatch = new RegExp(key + ": '([^']+)'").exec(block);
      assert.ok(keyMatch, `${lang} is missing ${key}`);
      assert.ok(keyMatch[1].trim().length > 0, `${lang}.${key} must not be empty`);
    }
  }
});

test('Persian and Arabic (RTL languages) are unaffected by the new voice keys - direction() still resolves them to rtl, English/Spanish stay ltr', () => {
  assert.match(i18nSrc, /direction: function \(\) \{ return language\(\) === 'fa' \|\| language\(\) === 'ar' \? 'rtl' : 'ltr'; \}/);
});

// ---- Persian Voice Quality gate ----

// Voice Mode performance pass: this logic moved from inside onVoiceTranscript's own
// voiceTurnQueue callback into TurnCoordinator's onResult callback (still in chatDockView.jsx,
// still built from the exact same submit() result) - the post-processing/caption/speak-request
// behavior itself is unchanged, only where it's wired.
// fix/voice-mode-turn-ux (Part C): the caption is no longer set directly at business-result time -
// it is carried on the PlaybackController entry itself (`caption: rawToSpeak`) and published by
// PlaybackController's own onAudioStart callback exactly when THAT entry's real audio genuinely
// starts playing (see the onAudioStart test below) - never merely when a later turn's business
// result becomes ready, which could otherwise overwrite a still-playing/still-queued earlier
// reply's caption before its own audio has even started.
test('the deterministic ai-voice-text.js post-processing pass runs on whatever is actually spoken, right before it is handed to PlaybackController - the caption is carried on the entry, not set directly here', () => {
  const block = dockViewSrc.slice(dockViewSrc.indexOf('turnCoordinatorRef.current = window.TradeJournalAIVoiceTurnCoordinator.create('), dockViewSrc.indexOf('return () => { if (voiceRef.current)'));
  assert.match(block, /const rawToSpeak = result && \(result\.voiceReply \|\| result\.reply\);/);
  assert.match(block, /const toSpeak = rawToSpeak && voiceText \? voiceText\.toSpokenText\(rawToSpeak, i18n\.language\(\)\) : rawToSpeak;/);
  assert.doesNotMatch(block, /setVoiceReplyCaption\(rawToSpeak \|\| ''\);/, 'the caption must not be set directly here any more - see PlaybackController\'s own onAudioStart wiring instead');
  assert.match(block, /playbackControllerRef\.current\.enqueue\(toSpeak, \{ turnId: meta\.turnId, connectionEpoch: meta\.connectionEpoch, caption: rawToSpeak \|\| '', audioUrl: audioUrlForEntry \}\);/, 'the post-processed text is spoken; the RAW text is carried as the entry\'s own caption (gate section 12: only what is spoken may differ)');
});

test('PlaybackController.onAudioStart publishes the caption exactly when an entry\'s own real audio starts playing - never at enqueue/business-result time', () => {
  const block = dockViewSrc.slice(dockViewSrc.indexOf('playbackControllerRef.current = window.TradeJournalAIVoicePlaybackController.create('), dockViewSrc.indexOf('turnCoordinatorRef.current = window.TradeJournalAIVoiceTurnCoordinator.create('));
  assert.match(block, /onAudioStart: \(entry\) => \{ if \(entry\.caption\) setVoiceReplyCaption\(entry\.caption\); \}/);
});

test('ai-voice-text.js is loaded as a purely additive, optional dependency - a page without it keeps speaking the exact raw text as before this gate', () => {
  assert.match(dockViewSrc, /const voiceText = window\.TradeJournalAIVoiceText;/);
  assert.doesNotMatch(dockViewSrc, /if \(!i18n \|\| !core \|\| !settingsStore \|\| !voiceText\)/, 'voiceText must never be a hard mount-blocking dependency');
});
