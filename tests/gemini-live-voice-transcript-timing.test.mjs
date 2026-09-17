import assert from 'node:assert/strict';
import test from 'node:test';
import { createGeminiLiveSession } from '../navrya-src/geminiLiveVoice.js';
import { VOICE_STATES } from '../navrya-src/aiVoiceRealtime.js';

// fix/voice-gpt-live-repair - Gemini audit (task requirement: "Audit Gemini for the same 'do not
// cut speech' guarantee, especially its fragment fallback timer and duplicate/late-flush
// behavior"). geminiLiveVoice.js's own header comment already documents the same root cause
// gptLiveVoice.js had: Gemini's server-sent `inputTranscription.finished` flag "is not reliably
// sent by the server" (a confirmed, still-open upstream gap, googleapis/js-genai#1429), so
// TRANSCRIPT_FRAGMENT_QUIET_MS is the real, load-bearing fallback boundary in practice - not a
// rare edge case. A first version of this file proved, with a real executable test, that the
// original 700ms window reproduced the identical "cuts a natural pause into two turns" defect
// gptLiveVoice.js had (that file's own pre-fix value was 1200ms - Gemini's was even shorter) -
// TRANSCRIPT_FRAGMENT_QUIET_MS was then raised to match, and these tests now guard that fixed
// behavior (see the constant's own comment in navrya-src/geminiLiveVoice.js for the full record).
//
// Scope, per the task's own instruction not to perform unrelated large refactors here: this ONLY
// probes the input-transcript quiet-window question. Gemini's barge-in is a SEPARATE, already-safe
// mechanism (geminiSpeechActivityDetector.js's own calibrated acoustic energy detector, entirely
// decoupled from this text-fragment timer - see wireMicrophone()'s own comment - it never fires
// onBargeIn() from a transcript delta the way the old gptLiveVoice.js bug did), so items 2-5 of the
// GPT-Live repair (barge-in verification, delegation correlation, audio-sink reset) simply do not
// apply to this transport at all and are not re-investigated here.

class FakeAudioTrack { stop() {} addEventListener() {} }
class FakeMediaStream { getAudioTracks() { return [new FakeAudioTrack()]; } getTracks() { return [new FakeAudioTrack()]; } }
class FakeAudioNode { connect() {} disconnect() {} }
class FakeAudioContext {
  constructor() { this.sampleRate = 16000; this.destination = {}; }
  createMediaStreamSource() { return new FakeAudioNode(); }
  createScriptProcessor() { const node = new FakeAudioNode(); node.onaudioprocess = null; return node; }
  resume() { return Promise.resolve(); }
  close() { return Promise.resolve(); }
}
class FakeWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = FakeWebSocket.OPEN;
    this.onopen = null; this.onmessage = null; this.onerror = null; this.onclose = null;
    this.sent = [];
    FakeWebSocket.instances.push(this);
  }
  send(json) { this.sent.push(JSON.parse(json)); }
  close() { this.readyState = FakeWebSocket.CLOSED; }
  push(message) { if (this.onmessage) this.onmessage({ data: JSON.stringify(message) }); }
}
FakeWebSocket.OPEN = 1;
FakeWebSocket.CLOSED = 3;
FakeWebSocket.instances = [];

function installFakeGlobals() {
  FakeWebSocket.instances = [];
  const originals = { AudioContext: globalThis.AudioContext, WebSocket: globalThis.WebSocket, navigator: globalThis.navigator, window: globalThis.window };
  globalThis.AudioContext = FakeAudioContext;
  globalThis.WebSocket = FakeWebSocket;
  Object.defineProperty(globalThis, 'navigator', { value: { mediaDevices: { getUserMedia: async () => new FakeMediaStream() } }, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'window', { value: { AudioContext: FakeAudioContext, location: { protocol: 'https:', host: 'test.local' } }, configurable: true, writable: true });
  return function restore() {
    globalThis.AudioContext = originals.AudioContext;
    globalThis.WebSocket = originals.WebSocket;
    Object.defineProperty(globalThis, 'navigator', { value: originals.navigator, configurable: true, writable: true });
    Object.defineProperty(globalThis, 'window', { value: originals.window, configurable: true, writable: true });
  };
}

async function flushMicrotasks(times = 40) { for (let i = 0; i < times; i++) await Promise.resolve(); }

async function connectSession(session) {
  const connectPromise = session.connect();
  await flushMicrotasks();
  const socket = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
  socket.push({ setupComplete: true });
  await connectPromise;
  assert.equal(session.state(), VOICE_STATES.LISTENING, 'test setup: session must reach LISTENING');
  return socket;
}

function fragmentMessage(text, finished) {
  return { serverContent: { inputTranscription: { text, finished: !!finished } } };
}

function baseOptions(overrides) {
  return Object.assign({
    language: 'en',
    fetchSession: async () => ({ token: 'test-token', model: 'gemini-test-model' }),
    onFinalTranscript: () => {}
  }, overrides);
}

// A focused, real, executable test proved the pre-fix 700ms window reproduced gptLiveVoice.js's
// own identical defect class (a single ordinary mid-sentence pause split one utterance into two
// finalized turns) before TRANSCRIPT_FRAGMENT_QUIET_MS was raised - see that constant's own
// comment in navrya-src/geminiLiveVoice.js for the full record. These tests guard the fixed
// behavior against regressing back to the short window.

test('a natural mid-sentence pause (well past the OLD, confirmed-too-aggressive 700ms window) no longer splits one utterance into two turns', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const restore = installFakeGlobals();
  try {
    const finals = [];
    const session = createGeminiLiveSession(baseOptions({ onFinalTranscript: (text) => finals.push(text) }));
    const socket = await connectSession(session);

    // openSocket()'s own onmessage handler is async (it awaits socketMessageText(event.data) even
    // for a plain string, per that function's own Promise.resolve(value) branch) - a microtask
    // flush is required after each push() for the handler to actually run before advancing timers.
    socket.push(fragmentMessage('Start a New York', false));
    await flushMicrotasks();
    t.mock.timers.tick(900); // past the OLD 700ms window; still well short of the new one
    assert.equal(finals.length, 0, 'a pause under the new conservative window must not have flushed yet');
    socket.push(fragmentMessage(' session please', false));
    await flushMicrotasks();
    t.mock.timers.tick(2199);
    assert.equal(finals.length, 0, 'still not flushed one ms before the (re-armed) quiet window elapses');
    t.mock.timers.tick(1);

    assert.equal(finals.length, 1, 'the full utterance across the pause must arrive as ONE finalized transcript');
    assert.equal(finals[0], 'Start a New York session please');
  } finally { restore(); }
});

test('the documented finished:true flag, when the server does send it, still flushes immediately - never waits out the fallback window', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const restore = installFakeGlobals();
  try {
    const finals = [];
    const session = createGeminiLiveSession(baseOptions({ onFinalTranscript: (text) => finals.push(text) }));
    const socket = await connectSession(session);
    socket.push(fragmentMessage('Five minutes.', true));
    await flushMicrotasks();
    assert.equal(finals.length, 1, 'finished:true must flush immediately, not after the fallback quiet window');
    assert.equal(finals[0], 'Five minutes.');
  } finally { restore(); }
});

test('a duplicate/late fragment after a finished:true flush starts its own new turn, never merges into or duplicates the just-finalized one', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const restore = installFakeGlobals();
  try {
    const finals = [];
    const session = createGeminiLiveSession(baseOptions({ onFinalTranscript: (text) => finals.push(text) }));
    const socket = await connectSession(session);
    socket.push(fragmentMessage('Five minutes.', true));
    await flushMicrotasks();
    assert.equal(finals.length, 1);
    socket.push(fragmentMessage('Ten minutes.', true));
    await flushMicrotasks();
    assert.equal(finals.length, 2, 'a second, genuinely separate finished utterance must produce its own second turn');
    assert.equal(finals[1], 'Ten minutes.');
  } finally { restore(); }
});
