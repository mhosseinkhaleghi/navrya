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
});

test('Gemini Voice sends 16 kHz PCM transcription and routes only final text through the existing ChatDock coordinator', () => {
  assert.match(adapter, /const INPUT_SAMPLE_RATE = 16000;/);
  assert.match(adapter, /mimeType: 'audio\/pcm;rate=16000'/);
  assert.match(adapter, /content\.inputTranscription/);
  assert.match(adapter, /onFinalTranscript\(text\)/);
  assert.match(dock, /onFinalTranscript: onVoiceTranscript/);
});

test('Gemini TTS receives only an injected approved reply and emits the same playback lifecycle events as the existing controller path', () => {
  assert.match(adapter, /const fetchSpeakAudio = options\.fetchSpeakAudio;/);
  assert.doesNotMatch(adapter, /\/api\/ai\/gemini-live\/speak/);
  assert.match(adapter, /onOutputAudioBufferEvent\('output_audio_buffer.started', null\)/);
  assert.match(adapter, /output_audio_buffer\.stopped/);
  assert.match(adapter, /function finishUserTurn\(\)[\s\S]*?Do not send audioStreamEnd/);
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
    assert.match(adapter, /async function connect\(\) \{[\s\S]*?teardown\(\);[\s\S]*?intentionalClose = false;/);
    assert.match(adapter, /socket\.onclose = \(\) => \{[\s\S]*?if \(!settled\) fail\(error\);[\s\S]*?else failAndCleanup\(error, 'live_connection'\);/);
    assert.match(dock, /onVoiceEnd=\{endVoice\}/);
    assert.match(chatDockSource, /onVoiceEnd=\{onVoiceEnd\}/);
    assert.match(consoleSource, /<DeniedCard strings=\{strings\} onRetry=\{onVoiceToggle\} onEnd=\{onVoiceEnd\}/);
    assert.match(consoleSource, /aria-label=\{strings\.close\} title=\{strings\.close\} onClick=\{onVoiceEnd\}/);
  });
});
