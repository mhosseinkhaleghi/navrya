import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Journey E ChatDock Voice-UX repair. Same convention as tests/pattern-create-action.test.mjs and
// tests/ai-voice-realtime-adapter.test.mjs: ChatDock.jsx/DockButton.jsx/chatDockView.jsx are
// JSX with no DOM test harness in this project - these are static-source regression guards for
// exactly the bugs found and fixed via real browser testing during this pass (the decoy
// "Voice mode" button that did nothing, the collapsed single "listening" boolean hiding every
// real VOICE_STATES value, the status pill overflowing and hiding the text input, and
// debugState().muted going stale). Real-browser verification (real WebRTC connection, real
// synthesized speech, real audio-element playback diagnostics) is the actual proof these work -
// see the final report for that pass's results.

const root = process.cwd();
const chatDockSrc = await readFile(path.join(root, 'public', 'pages', 'shared', 'navrya', 'components', 'assistant', 'ChatDock.jsx'), 'utf8');
const dockButtonSrc = await readFile(path.join(root, 'public', 'pages', 'shared', 'navrya', 'components', 'assistant', 'DockButton.jsx'), 'utf8');
const dockViewSrc = await readFile(path.join(root, 'navrya-src', 'chatDockView.jsx'), 'utf8');
const voiceSrc = await readFile(path.join(root, 'navrya-src', 'aiVoiceRealtime.js'), 'utf8');
const i18nSrc = await readFile(path.join(root, 'public', 'pages', 'shared', 'ai-i18n.js'), 'utf8');

test('the old decoy "Voice mode" button is gone - the primary submit button is always a plain, always-enabled-when-ready Send control, never a fake voice affordance', () => {
  assert.doesNotMatch(chatDockSrc, /icon=\{ready \? 'arrow-up' : 'waveform'\}/, 'the old icon-swap decoy must not come back');
  assert.doesNotMatch(chatDockSrc, /label=\{ready \? sendLabel : voiceLabel\}/, 'the old label-swap decoy must not come back');
  assert.match(chatDockSrc, /<DockButton icon="arrow-up" tone="primary" disabled=\{!ready\} label=\{sendLabel\} onClick=\{submit\} \/>/);
});

test('there is exactly one real Voice toggle button, driven by onVoiceToggle/voiceState (not a boolean onMic prop)', () => {
  assert.doesNotMatch(chatDockSrc, /\bonMic\b/, 'the old collapsed onMic prop must be fully removed');
  assert.doesNotMatch(chatDockSrc, /\bmicLabel\b/);
  assert.doesNotMatch(chatDockSrc, /\bstopListeningLabel\b/);
  assert.match(chatDockSrc, /onVoiceToggle && \(/);
  const voiceButtonBlock = chatDockSrc.slice(chatDockSrc.indexOf('{onVoiceToggle && ('), chatDockSrc.indexOf('<DockButton icon="arrow-up"'));
  assert.match(voiceButtonBlock, /onClick=\{onVoiceToggle\}/);
});

test('every real VOICE_STATES value the adapter can report maps to a distinct icon/status label - never collapsed into one generic "listening" boolean', () => {
  const required = ['requesting_permission', 'connecting', 'listening', 'user_speaking', 'processing', 'assistant_speaking', 'interrupted', 'reconnecting'];
  for (const state of required) {
    assert.match(chatDockSrc, new RegExp(state + ':'), `VOICE_STATE_ICON or the status-label map must cover "${state}"`);
  }
  // ASSISTANT_SPEAKING gets its own distinct icon (not just "mic" again) - the one state where
  // it's NAVRYA making sound, not the user who can speak into the mic.
  assert.match(chatDockSrc, /assistant_speaking: 'volume-2'/);
});

test('the status pill is capped and truncates rather than being allowed to squeeze the text input to zero width - the exact bug found via real browser testing with the long permission-denied error message', () => {
  const pillFn = chatDockSrc.slice(chatDockSrc.indexOf('function VoiceStatusPill'), chatDockSrc.indexOf('export function ChatDock'));
  assert.match(pillFn, /maxWidth: 240/);
  assert.match(pillFn, /overflow: 'hidden'/);
  assert.match(pillFn, /textOverflow: 'ellipsis'/);
});

test('the mute control only ever renders once a real Voice session is live, never before - muting a session that does not exist yet has nothing to act on', () => {
  assert.match(chatDockSrc, /\{listening && onVoiceMuteToggle && \(/);
  const muteBlock = chatDockSrc.slice(chatDockSrc.indexOf('{listening && onVoiceMuteToggle && ('), chatDockSrc.indexOf('{onVoiceToggle && ('));
  assert.match(muteBlock, /icon=\{voiceMuted \? 'mic-off' : 'mic'\}/);
  assert.match(muteBlock, /onClick=\{onVoiceMuteToggle\}/);
});

test('DockButton supports a distinct danger styling (red border/tint) for the Voice ERROR state - never rendered as an indistinguishable normal "active" toggle', () => {
  assert.match(dockButtonSrc, /danger = false/);
  assert.match(dockButtonSrc, /var\(--danger,#e05a5a\)/);
  assert.match(chatDockSrc, /danger=\{voiceState === 'error'\}/);
});

test('chatDockView.jsx wires the real Voice control to the real Journey E adapter: toggleVoice (connect/disconnect) and a new toggleVoiceMute reading/flipping the adapter\'s own isMuted()', () => {
  assert.match(dockViewSrc, /onVoiceToggle=\{toggleVoice\} onVoiceMuteToggle=\{toggleVoiceMute\}/);
  assert.match(dockViewSrc, /function toggleVoiceMute\(\) \{[\s\S]*?voiceRef\.current\.mute\(!voiceRef\.current\.isMuted\(\)\);/);
});

test('a denied microphone permission gets its own distinct, clearer localized error message than every other Voice failure mode - stage:\'permission\' is checked explicitly', () => {
  assert.match(dockViewSrc, /voicePermissionDenied/);
  assert.match(dockViewSrc, /detail && detail\.stage === 'permission'/);
  assert.match(dockViewSrc, /voiceErrorLabel=\{voicePermissionDenied \? i18n\.t\('voiceDockErrorPermissionDenied'\) : i18n\.t\('voiceDockError'\)\}/);
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
  assert.match(voiceSrc, /new OpenAIRealtimeWebRTC\(\{ mediaStream: mediaStream, audioElement: audioEl \}\)/);
});

test('audioDiagnostics() reports playback/track metadata only (paused state, live track presence) - never the audio content itself', () => {
  const fn = voiceSrc.slice(voiceSrc.indexOf('function audioDiagnostics'), voiceSrc.indexOf('function onTransportEvent'));
  assert.match(fn, /hasAudioElement/);
  assert.match(fn, /audioPaused/);
  assert.match(fn, /audioTrackActive/);
  assert.doesNotMatch(fn, /transcript|apiKey/i);
});

test('disconnect() clears the audio element reference and resets mute back to false - a fresh connect() must never inherit stale audio/mute state from a previous session', () => {
  const disconnectFn = voiceSrc.slice(voiceSrc.indexOf('function disconnect()'), voiceSrc.indexOf('// Orthogonal to `state`'));
  assert.match(disconnectFn, /audioEl = null/);
  assert.match(disconnectFn, /isMuted = false/);
});

test('no browser SpeechSynthesis is ever used as a second, competing voice engine - the Realtime WebRTC audio-output path is the only spoken-audio path, per the explicit "do not add a second engine" requirement', () => {
  assert.doesNotMatch(voiceSrc, /speechSynthesis|SpeechSynthesisUtterance/i);
  assert.doesNotMatch(dockViewSrc, /speechSynthesis|SpeechSynthesisUtterance/i);
});

test('the Voice session is created exactly once per ChatDock mount (empty-deps effect) and torn down on unmount - no duplicate session/listeners on a remount', () => {
  const effectBlock = dockViewSrc.slice(dockViewSrc.indexOf('voiceRef.current = createVoiceSession({'), dockViewSrc.indexOf('function toggleVoice()'));
  assert.match(effectBlock, /return \(\) => \{ if \(voiceRef\.current\) voiceRef\.current\.disconnect\(\); \};/);
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

test('Persian and Arabic (RTL languages) are unaffected by the new voice keys - direction() still resolves them to rtl, English/Spanish stay ltr', () => {
  assert.match(i18nSrc, /direction: function \(\) \{ return language\(\) === 'fa' \|\| language\(\) === 'ar' \? 'rtl' : 'ltr'; \}/);
});
