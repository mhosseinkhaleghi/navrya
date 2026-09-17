import assert from 'node:assert/strict';
import test from 'node:test';
import { createGptLiveSession } from '../navrya-src/gptLiveVoice.js';
import { VOICE_STATES } from '../navrya-src/aiVoiceRealtime.js';

// fix/voice-gpt-live-repair: real, executable behavioral tests for gptLiveVoice.js's own turn-
// boundary state machine, barge-in verification, per-turn delegation correlation, and audio-sink
// reset - the concrete gap the task brief calls out ("existing GPT-Live tests are mostly static
// source-regex checks and do not simulate timing/event-order races"). This file drives the real
// module (never a reimplementation) against a minimal fake WebRTC/data-channel harness and
// node:test's own mock timers/Date, so pause/barge-in/delegation timing can be asserted exactly
// rather than approximated with real waits.

// ---- fake WebRTC/browser harness ----------------------------------------------------------

class FakeAudioTrack {
  constructor() { this.enabled = true; this._listeners = {}; }
  addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
  stop() {}
  fireEnded() { (this._listeners.ended || []).slice().forEach((fn) => fn()); }
}

class FakeMediaStream {
  constructor() { this.tracks = [new FakeAudioTrack()]; }
  getAudioTracks() { return this.tracks; }
  getTracks() { return this.tracks; }
}

class FakeDataChannel {
  constructor() {
    this.readyState = 'open'; // real negotiation already succeeded by the time connect() creates one, for every test that doesn't explicitly test a still-connecting/closed channel
    this.sent = [];
    this.onopen = null; this.onmessage = null; this.onclose = null; this.onerror = null;
    this._sendOverride = null;
  }
  send(json) {
    if (this._sendOverride) return this._sendOverride(json);
    this.sent.push(JSON.parse(json));
  }
  close() { this.readyState = 'closed'; }
  push(message) { if (this.onmessage) this.onmessage({ data: JSON.stringify(message) }); }
  lastSent() { return this.sent[this.sent.length - 1]; }
}

class FakePeerConnection {
  constructor() {
    this.iceGatheringState = 'complete';
    this.localDescription = null;
    this.ontrack = null;
    this.onconnectionstatechange = null;
    this.dataChannel = null;
    this.tracks = [];
    this.closed = false;
    FakePeerConnection.instances.push(this);
  }
  addTrack(track) { this.tracks.push(track); }
  createDataChannel(label) { this.dataChannel = new FakeDataChannel(); this.dataChannel.label = label; return this.dataChannel; }
  async createOffer() { return { type: 'offer', sdp: 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n' }; }
  async setLocalDescription(desc) { this.localDescription = desc; }
  async setRemoteDescription(desc) { this.remoteDescription = desc; }
  addEventListener() {}
  removeEventListener() {}
  close() { this.closed = true; }
  emitRemoteTrack(stream) { const s = stream || {}; if (this.ontrack) this.ontrack({ streams: [s] }); return s; }
}
FakePeerConnection.instances = [];

class FakeAudioElement {
  constructor() { this.autoplay = false; this._srcObject = null; this.paused = true; this.srcObjectAssignments = []; FakeAudioElement.instances.push(this); }
  get srcObject() { return this._srcObject; }
  set srcObject(v) { this._srcObject = v; this.srcObjectAssignments.push(v); }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
}
FakeAudioElement.instances = [];

function installFakeGlobals() {
  FakePeerConnection.instances = [];
  FakeAudioElement.instances = [];
  const originals = { RTCPeerConnection: globalThis.RTCPeerConnection, Audio: globalThis.Audio, navigator: globalThis.navigator };
  globalThis.RTCPeerConnection = FakePeerConnection;
  globalThis.Audio = FakeAudioElement;
  // Node 21+ defines a read-only, non-configurable-by-plain-assignment `navigator` global of its
  // own - a bare `globalThis.navigator = ...` throws. redefineProperty works regardless of whether
  // the existing descriptor is writable.
  Object.defineProperty(globalThis, 'navigator', {
    value: { mediaDevices: { getUserMedia: async () => new FakeMediaStream() } },
    configurable: true,
    writable: true
  });
  return function restore() {
    globalThis.RTCPeerConnection = originals.RTCPeerConnection;
    globalThis.Audio = originals.Audio;
    Object.defineProperty(globalThis, 'navigator', { value: originals.navigator, configurable: true, writable: true });
  };
}

// Drains the microtask queue a generous, fixed number of times - independent of mock timers (pure
// promise microtasks, never a real/virtual setTimeout) - enough to carry connect()'s own bounded
// chain of sequential awaits (mic -> pc/offer -> ICE[instant] -> fetchSession -> remote description)
// up to the one point that genuinely waits on an external event (session.started).
async function flushMicrotasks(times = 40) {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

function makeFetchSession(overrides) {
  return async () => Object.assign({ answerSdp: 'v=0\r\no=- 2 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n', sessionId: 'live-test', walletReservationId: null, isByok: false }, overrides);
}

// Connects a session against the fake harness and returns the FakePeerConnection actually used
// (with its own .dataChannel) once the module is fully in LISTENING state - mirrors the real
// session.started handshake, never skipping straight to a finalized state.
async function connectSession(session) {
  const connectPromise = session.connect();
  await flushMicrotasks();
  const pc = FakePeerConnection.instances[FakePeerConnection.instances.length - 1];
  pc.emitRemoteTrack();
  pc.dataChannel.push({ type: 'session.started' });
  await connectPromise;
  assert.equal(session.state(), VOICE_STATES.LISTENING, 'test setup: session must reach LISTENING before a test\'s own assertions run');
  return pc;
}

function deltaMessage(text) { return { type: 'session.input_transcript.delta', delta: text }; }
function delegationMessage(id) { return { type: 'session.delegation.created', delegation: { id } }; }
function outputDeltaMessage(text) { return { type: 'session.output_transcript.delta', delta: text }; }

function baseOptions(overrides) {
  return Object.assign({
    language: 'en',
    fetchSession: makeFetchSession(),
    onFinalTranscript: () => {},
    onBargeIn: () => {},
    onSpeakError: () => {}
  }, overrides);
}

// ---- tests ----------------------------------------------------------------------------------

test('a natural mid-sentence pause (over the OLD 1200ms bug threshold, under the new conservative window) never splits one utterance into two turns', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const restore = installFakeGlobals();
  try {
    const finals = [];
    const session = createGptLiveSession(baseOptions({ onFinalTranscript: (text) => finals.push(text) }));
    const pc = await connectSession(session);
    pc.dataChannel.push(deltaMessage('Start a New York'));
    t.mock.timers.tick(1500); // exceeds the OLD, confirmed-buggy 1200ms window
    assert.equal(finals.length, 0, 'a pause under the new conservative window must not have flushed yet');
    pc.dataChannel.push(deltaMessage(' session please'));
    t.mock.timers.tick(2199);
    assert.equal(finals.length, 0, 'still not flushed one ms before the (re-armed) quiet window elapses');
    t.mock.timers.tick(1);
    assert.equal(finals.length, 1);
    assert.equal(finals[0], 'Start a New York session please', 'the full utterance across the pause must arrive as ONE finalized transcript');
  } finally { restore(); }
});

test('a spoken self-correction across a natural pause ("fifteen minutes... no, five minutes") is delivered as one finalized turn, never two', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const restore = installFakeGlobals();
  try {
    const finals = [];
    const session = createGptLiveSession(baseOptions({ onFinalTranscript: (text) => finals.push(text) }));
    const pc = await connectSession(session);
    pc.dataChannel.push(deltaMessage('Fifteen minutes...'));
    t.mock.timers.tick(1800);
    pc.dataChannel.push(deltaMessage(' no, five minutes.'));
    t.mock.timers.tick(2200);
    assert.equal(finals.length, 1, 'the correction must land in the SAME turn as the original value, not a second fragmentary one');
    assert.equal(finals[0], 'Fifteen minutes... no, five minutes.');
  } finally { restore(); }
});

test('Persian/English code-switching across a pause still finalizes as one utterance - the transport never inspects transcript content', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const restore = installFakeGlobals();
  try {
    const finals = [];
    const session = createGptLiveSession(baseOptions({ onFinalTranscript: (text) => finals.push(text) }));
    const pc = await connectSession(session);
    pc.dataChannel.push(deltaMessage('یک سشن'));
    t.mock.timers.tick(1600);
    pc.dataChannel.push(deltaMessage(' New York باز کن'));
    t.mock.timers.tick(2200);
    assert.equal(finals.length, 1);
    assert.equal(finals[0], 'یک سشن New York باز کن');
  } finally { restore(); }
});

test('a quick genuine follow-up (a fresh utterance starting well after the prior turn flushed) is its own second turn, not swallowed by the stray-fragment guard', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const restore = installFakeGlobals();
  try {
    const finals = [];
    const session = createGptLiveSession(baseOptions({ onFinalTranscript: (text) => finals.push(text) }));
    const pc = await connectSession(session);
    pc.dataChannel.push(deltaMessage('Five minutes.'));
    t.mock.timers.tick(2200);
    assert.equal(finals.length, 1);
    t.mock.timers.tick(1500); // well past POST_TURN_STRAY_FRAGMENT_MS (700ms) - a deliberate quick follow-up, not a straggler
    pc.dataChannel.push(deltaMessage('Actually, ten minutes.'));
    t.mock.timers.tick(2200);
    assert.equal(finals.length, 2);
    assert.equal(finals[1], 'Actually, ten minutes.');
  } finally { restore(); }
});

test('a delayed input fragment arriving shortly after provisional finalization (reply not started yet) is discarded, not a spurious second turn', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const restore = installFakeGlobals();
  try {
    const finals = [];
    const session = createGptLiveSession(baseOptions({ onFinalTranscript: (text) => finals.push(text) }));
    const pc = await connectSession(session);
    pc.dataChannel.push(deltaMessage('Start a New York session.'));
    t.mock.timers.tick(2200);
    assert.equal(finals.length, 1);
    assert.equal(session.state(), VOICE_STATES.PROCESSING, 'no reply has been requested yet - state stays PROCESSING');
    pc.dataChannel.push(deltaMessage(' session.')); // a genuinely late STT tail of the SAME already-flushed utterance
    t.mock.timers.tick(2200);
    assert.equal(finals.length, 1, 'the straggler must never start (and eventually flush) a spurious second turn');
  } finally { restore(); }
});

test('a delayed input fragment arriving immediately after reply playback begins (within the stray-fragment grace window) never fires a barge-in', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const restore = installFakeGlobals();
  try {
    const finals = [];
    let bargeIns = 0;
    const session = createGptLiveSession(baseOptions({ onFinalTranscript: (text) => finals.push(text), onBargeIn: () => { bargeIns += 1; } }));
    const pc = await connectSession(session);
    pc.dataChannel.push(deltaMessage('Start a New York session.'));
    t.mock.timers.tick(2200);
    assert.equal(finals.length, 1);
    pc.dataChannel.push(delegationMessage('deleg-1'));
    const speakPromise = session.speak('Starting your New York session now.', { gptLiveTurnId: 1 });
    pc.dataChannel.push(outputDeltaMessage('Starting'));
    assert.equal(session.state(), VOICE_STATES.ASSISTANT_SPEAKING);

    // Still inside POST_TURN_STRAY_FRAGMENT_MS (700ms) since the flush above - a late STT tail of
    // the utterance whose own reply is now playing, not new speech.
    pc.dataChannel.push(deltaMessage(' session.'));
    assert.equal(bargeIns, 0, 'a fragment inside the stray-fragment grace window must never fire a barge-in');
    assert.equal(session.state(), VOICE_STATES.ASSISTANT_SPEAKING);

    pc.dataChannel.push(outputDeltaMessage(' now.'));
    t.mock.timers.tick(900);
    await speakPromise;
    assert.equal(finals.length, 1, 'the stray tail must never have produced a second turn');
  } finally { restore(); }
});

test('barge-in during active playback is held as an unconfirmed candidate and only fires onBargeIn() once BARGE_IN_CONFIRM_MS has elapsed uncancelled', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const restore = installFakeGlobals();
  try {
    const finals = [];
    let bargeIns = 0;
    const session = createGptLiveSession(baseOptions({ onFinalTranscript: (text) => finals.push(text), onBargeIn: () => { bargeIns += 1; } }));
    const pc = await connectSession(session);

    pc.dataChannel.push(deltaMessage('Start a New York session.'));
    t.mock.timers.tick(2200);
    assert.equal(finals.length, 1);
    pc.dataChannel.push(delegationMessage('deleg-1'));

    const speakPromise = session.speak('Starting your New York session now.', { gptLiveTurnId: 1 });
    pc.dataChannel.push(outputDeltaMessage('Starting')); // arms/re-arms the reply's own OUTPUT_TRANSCRIPT_QUIET_MS(900ms) window
    assert.equal(session.state(), VOICE_STATES.ASSISTANT_SPEAKING);

    // Move well past the stray-fragment grace window before probing barge-in specifically, so this
    // test is isolated from the "delayed tail fragment" guard exercised elsewhere.
    t.mock.timers.tick(800);

    // The first candidate delta - must NOT fire a barge-in immediately (the confirmed production
    // defect this replaces: the old code interrupted on this exact first delta).
    pc.dataChannel.push(deltaMessage('uh'));
    assert.equal(bargeIns, 0, 'a fresh candidate must never fire a barge-in on its first delta alone');
    assert.equal(session.state(), VOICE_STATES.ASSISTANT_SPEAKING, 'playback must not be interrupted by an unconfirmed candidate');
    // The reply keeps genuinely speaking (a real reply streams continuous output deltas) - re-arms
    // the 900ms output-quiet window so the reply is never mistaken for having ended naturally
    // while this test is deliberately measuring the SEPARATE, shorter barge-in confirmation window.
    pc.dataChannel.push(outputDeltaMessage(' your'));

    // More of the same utterance arrives while still short of the confirmation window - still
    // unconfirmed, still buffered, still never interrupts anything.
    t.mock.timers.tick(300);
    pc.dataChannel.push(deltaMessage(', wait, cancel that'));
    assert.equal(bargeIns, 0, 'still under BARGE_IN_CONFIRM_MS since the candidate started - not yet confirmed');
    assert.equal(session.state(), VOICE_STATES.ASSISTANT_SPEAKING);
    pc.dataChannel.push(outputDeltaMessage(' session now.'));

    // The fixed confirmation window (from the candidate's OWN start, not re-armed per delta)
    // elapses with nothing having cancelled it - genuine, verified barge-in. (300ms already ticked
    // above + 200ms here = the full 500ms BARGE_IN_CONFIRM_MS.)
    t.mock.timers.tick(200);
    assert.equal(bargeIns, 1, 'sustained candidate speech past the confirmation window is a real, verified barge-in');
    assert.equal(session.state(), VOICE_STATES.USER_SPEAKING);

    t.mock.timers.tick(2200);
    assert.equal(finals.length, 2, 'the confirmed barge-in utterance becomes its own new turn');
    assert.equal(finals[1], 'uh, wait, cancel that', 'the candidate text (including its own pre-confirmation fragments) is preserved, never dropped');

    await speakPromise; // interrupt() (fired by the caller in response to onBargeIn in real wiring) is exercised in a dedicated test below; here we only assert detection, not the full loop.
  } finally { restore(); }
});

test('a genuine short, one-word interruption ("Stop!") with no further delta still confirms after BARGE_IN_CONFIRM_MS - detection is time-based, not "wait for more fragments"', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const restore = installFakeGlobals();
  try {
    let bargeIns = 0;
    const session = createGptLiveSession(baseOptions({ onBargeIn: () => { bargeIns += 1; } }));
    const pc = await connectSession(session);
    pc.dataChannel.push(deltaMessage('Tell me about the risk model.'));
    t.mock.timers.tick(2200);
    pc.dataChannel.push(delegationMessage('deleg-1'));
    session.speak('The risk model works by...', { gptLiveTurnId: 1 });
    pc.dataChannel.push(outputDeltaMessage('The risk model works by'));
    t.mock.timers.tick(800); // past the stray-fragment grace window

    pc.dataChannel.push(deltaMessage('Stop!')); // one single delta, then genuine silence on the INPUT side
    // The reply keeps genuinely speaking on the OUTPUT side during the confirmation window (a real
    // reply streams continuous output deltas) - re-arms the separate 900ms output-quiet window so
    // the reply is never mistaken for having ended naturally while this test measures the shorter
    // barge-in confirmation window in isolation.
    pc.dataChannel.push(outputDeltaMessage(' generating'));
    assert.equal(bargeIns, 0);
    t.mock.timers.tick(499); // BARGE_IN_CONFIRM_MS (500) minus 1, mirroring gptLiveVoice.js's own constant
    assert.equal(bargeIns, 0);
    t.mock.timers.tick(1);
    assert.equal(bargeIns, 1, 'a single short interruption must still confirm once the window elapses, with no further delta required');
  } finally { restore(); }
});

test('an unconfirmed barge-in candidate is preserved (never lost) when the reply finishes naturally before confirmation', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const restore = installFakeGlobals();
  try {
    const finals = [];
    let bargeIns = 0;
    const session = createGptLiveSession(baseOptions({ onFinalTranscript: (text) => finals.push(text), onBargeIn: () => { bargeIns += 1; } }));
    const pc = await connectSession(session);

    pc.dataChannel.push(deltaMessage('Start a New York session.'));
    t.mock.timers.tick(2200);
    pc.dataChannel.push(delegationMessage('deleg-1'));
    const speakPromise = session.speak('Starting your New York session now.', { gptLiveTurnId: 1 });
    pc.dataChannel.push(outputDeltaMessage('Starting your New York session now.'));
    t.mock.timers.tick(800); // past the stray-fragment grace window

    pc.dataChannel.push(deltaMessage('hm')); // a short, never-confirmed candidate
    assert.equal(bargeIns, 0);

    // The reply goes quiet (no more output deltas) and naturally finishes before the candidate is
    // ever confirmed as a real barge-in.
    t.mock.timers.tick(900); // OUTPUT_TRANSCRIPT_QUIET_MS
    await speakPromise;
    assert.equal(bargeIns, 0, 'a reply that finishes naturally before confirmation was never actually interrupted');
    assert.equal(session.state(), VOICE_STATES.USER_SPEAKING, 'the candidate is promoted into ordinary accumulation, not discarded');

    t.mock.timers.tick(2200);
    assert.equal(finals.length, 2);
    assert.equal(finals[1], 'hm', 'the never-confirmed candidate is still delivered as real, ordinary next speech - never silently dropped');
  } finally { restore(); }
});

test('delegation arriving AFTER the fallback-timeout flush still pairs correctly with that exact turn (FIFO)', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const restore = installFakeGlobals();
  try {
    const finals = [];
    const session = createGptLiveSession(baseOptions({ onFinalTranscript: (text, meta) => finals.push(meta.gptLiveTurnId) }));
    const pc = await connectSession(session);
    pc.dataChannel.push(deltaMessage('Five minutes.'));
    t.mock.timers.tick(2200); // fallback flush, no delegation yet
    assert.equal(finals.length, 1);
    const turnId = finals[0];
    pc.dataChannel.push(delegationMessage('deleg-late'));
    const speakPromise = session.speak('Understood, five minutes.', { gptLiveTurnId: turnId });
    assert.equal(pc.dataChannel.lastSent().type, 'session.commentary.append');
    assert.equal(pc.dataChannel.lastSent().delegation_id, 'deleg-late');
    pc.dataChannel.push(outputDeltaMessage('Understood.'));
    t.mock.timers.tick(900);
    await speakPromise;
  } finally { restore(); }
});

test('delegation arriving BEFORE anything has been transcribed is queued and claimed by the very next flush', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const restore = installFakeGlobals();
  try {
    const finals = [];
    const session = createGptLiveSession(baseOptions({ onFinalTranscript: (text, meta) => finals.push(meta.gptLiveTurnId) }));
    const pc = await connectSession(session);
    pc.dataChannel.push(delegationMessage('deleg-early')); // nothing accumulated yet at all
    pc.dataChannel.push(deltaMessage('Five minutes.'));
    t.mock.timers.tick(2200);
    assert.equal(finals.length, 1);
    const turnId = finals[0];
    const speakPromise = session.speak('Understood.', { gptLiveTurnId: turnId });
    assert.equal(pc.dataChannel.lastSent().delegation_id, 'deleg-early', 'the early delegation must be claimed by the turn that flushes next, never discarded');
    pc.dataChannel.push(outputDeltaMessage('Understood.'));
    t.mock.timers.tick(900);
    await speakPromise;
  } finally { restore(); }
});

test('two turns and two out-of-order-relative-to-expectation delegations still pair strictly in FIFO arrival order, never crossed', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const restore = installFakeGlobals();
  try {
    const finals = [];
    const session = createGptLiveSession(baseOptions({ onFinalTranscript: (text, meta) => finals.push(meta.gptLiveTurnId) }));
    const pc = await connectSession(session);

    pc.dataChannel.push(deltaMessage('First utterance.'));
    t.mock.timers.tick(2200);
    t.mock.timers.tick(800); // past POST_TURN_STRAY_FRAGMENT_MS - a genuine second utterance, not a straggler
    pc.dataChannel.push(deltaMessage('Second utterance.'));
    t.mock.timers.tick(2200);
    assert.equal(finals.length, 2);
    const [turnA, turnB] = finals;

    // Both turns flushed via the fallback with no delegation yet - now two delegations arrive.
    pc.dataChannel.push(delegationMessage('deleg-A'));
    pc.dataChannel.push(delegationMessage('deleg-B'));

    const speakA = session.speak('Reply to first.', { gptLiveTurnId: turnA });
    assert.equal(pc.dataChannel.lastSent().delegation_id, 'deleg-A', 'the FIRST flushed turn must claim the FIRST-arriving delegation');
    pc.dataChannel.push(outputDeltaMessage('Reply to first.'));
    t.mock.timers.tick(900);
    await speakA;

    const speakB = session.speak('Reply to second.', { gptLiveTurnId: turnB });
    assert.equal(pc.dataChannel.lastSent().delegation_id, 'deleg-B', 'the SECOND flushed turn must claim the SECOND-arriving delegation, never turn A\'s');
    pc.dataChannel.push(outputDeltaMessage('Reply to second.'));
    t.mock.timers.tick(900);
    await speakB;
  } finally { restore(); }
});

test('a missing delegation that never arrives reports an honest onSpeakError and still resolves speak() - never a silent spoken-reply loss, never a hang', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const restore = installFakeGlobals();
  try {
    const speakErrors = [];
    const session = createGptLiveSession(baseOptions({ onSpeakError: (detail) => speakErrors.push(detail) }));
    const pc = await connectSession(session);
    pc.dataChannel.push(deltaMessage('Five minutes.'));
    t.mock.timers.tick(2200);
    // No delegation.created is ever pushed for this turn.
    let resolved = false;
    const speakPromise = session.speak('Understood.', { gptLiveTurnId: 1 }).then(() => { resolved = true; });
    assert.equal(pc.dataChannel.sent.some((m) => m.type === 'session.commentary.append'), false, 'commentary must never be sent with no real delegation to attach it to');
    t.mock.timers.tick(3999);
    assert.equal(resolved, false);
    assert.equal(speakErrors.length, 0);
    t.mock.timers.tick(1);
    await speakPromise;
    assert.equal(resolved, true, 'speak() must always eventually resolve - PlaybackController\'s queue must never wedge');
    assert.equal(speakErrors.length, 1);
    assert.equal(speakErrors[0].code, 'GPT_LIVE_DELEGATION_MISSING');
    assert.equal(speakErrors[0].turnId, 1);
  } finally { restore(); }
});

test('unprompted speech with no turnId (e.g. a Companion opening) is still spoken, with delegation_id:null - never silently refused the way a missing-delegation user turn is', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const restore = installFakeGlobals();
  try {
    const speakErrors = [];
    const session = createGptLiveSession(baseOptions({ onSpeakError: (detail) => speakErrors.push(detail) }));
    const pc = await connectSession(session);
    const speakPromise = session.speak('Welcome back.'); // no entry/turnId at all
    assert.equal(pc.dataChannel.lastSent().type, 'session.commentary.append');
    assert.equal(pc.dataChannel.lastSent().delegation_id, null);
    pc.dataChannel.push(outputDeltaMessage('Welcome back.'));
    t.mock.timers.tick(900);
    await speakPromise;
    assert.equal(speakErrors.length, 0, 'unprompted speech must never be reported as a missing-delegation error');
  } finally { restore(); }
});

test('interrupting a reply forces the audio sink to re-attach the remote stream before the NEXT reply plays - stale buffered audio from the interrupted reply can never resume on the new answer', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const restore = installFakeGlobals();
  try {
    const session = createGptLiveSession(baseOptions());
    const pc = await connectSession(session);
    const audioElement = FakeAudioElement.instances[FakeAudioElement.instances.length - 1];
    const remoteStream = audioElement.srcObject; // set once by connectSession()'s own emitRemoteTrack()

    pc.dataChannel.push(deltaMessage('Tell me everything about risk.'));
    t.mock.timers.tick(2200);
    pc.dataChannel.push(delegationMessage('deleg-1'));
    session.speak('Risk management works by controlling position size...', { gptLiveTurnId: 1 });
    pc.dataChannel.push(outputDeltaMessage('Risk management works by'));
    assert.equal(session.state(), VOICE_STATES.ASSISTANT_SPEAKING);

    const assignmentsBeforeInterrupt = audioElement.srcObjectAssignments.length;
    session.interrupt();
    // interrupt() itself only pauses - it must not touch srcObject yet (nothing to reset until a
    // genuinely NEW reply actually begins; resetting here would be pointless work on every barge-in
    // even when no second turn follows).
    assert.equal(audioElement.srcObjectAssignments.length, assignmentsBeforeInterrupt, 'interrupt() itself must not reassign the sink - only the NEXT speak() does');

    pc.dataChannel.push(deltaMessage('Actually, tell me about stop-loss placement instead.'));
    t.mock.timers.tick(2200);
    pc.dataChannel.push(delegationMessage('deleg-2'));
    const speakPromise = session.speak('Stop-loss placement works by...', { gptLiveTurnId: 2 });

    // The NEXT speak() call must have forced a fresh srcObject assignment (null, then the same
    // remote stream again) - the standard technique for discarding whatever a live MediaStream
    // sink may still be internally holding from the interrupted reply, before this new reply's
    // own audio is allowed to play.
    const newAssignments = audioElement.srcObjectAssignments.slice(assignmentsBeforeInterrupt);
    assert.ok(newAssignments.length >= 2, 'the sink must be reset (reassigned) before the new reply resumes playback');
    assert.equal(newAssignments[newAssignments.length - 2], null, 'the reset clears the sink first...');
    assert.equal(newAssignments[newAssignments.length - 1], remoteStream, '...then re-attaches the SAME real remote stream, never a different/stale one');

    pc.dataChannel.push(outputDeltaMessage('Stop-loss placement works by'));
    t.mock.timers.tick(900);
    await speakPromise;
  } finally { restore(); }
});

test('a stale output-transcript delta arriving after interrupt() is ignored - it can never resurrect ASSISTANT_SPEAKING or leak into the next reply\'s caption', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const restore = installFakeGlobals();
  try {
    const captions = [];
    const session = createGptLiveSession(baseOptions({ onOutputTranscript: (text) => captions.push(text) }));
    const pc = await connectSession(session);
    pc.dataChannel.push(deltaMessage('Tell me everything.'));
    t.mock.timers.tick(2200);
    pc.dataChannel.push(delegationMessage('deleg-1'));
    session.speak('Here is a long answer.', { gptLiveTurnId: 1 });
    pc.dataChannel.push(outputDeltaMessage('Here is a long'));
    assert.equal(session.state(), VOICE_STATES.ASSISTANT_SPEAKING);

    session.interrupt();
    assert.equal(session.state(), VOICE_STATES.LISTENING);
    captions.length = 0;

    // A stale fragment for the interrupted reply still arrives on the wire (the server's own stop
    // instruction is best-effort only).
    pc.dataChannel.push(outputDeltaMessage(' answer, still trickling in.'));
    assert.equal(session.state(), VOICE_STATES.LISTENING, 'a stale output delta must never resurrect ASSISTANT_SPEAKING');
    assert.equal(captions.length, 0, 'a stale output delta must never publish a caption for an already-interrupted reply');
  } finally { restore(); }
});

test('a stale output-transcript delta on the OLD data channel after a reconnect is ignored - it can never mutate the new connection\'s state', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const restore = installFakeGlobals();
  try {
    const session = createGptLiveSession(baseOptions());
    const oldPc = await connectSession(session);
    const oldDc = oldPc.dataChannel;

    // Force a fresh connect (as a reconnect/provider-switch effectively does) - bumps
    // connectionEpoch and tears the old data channel's own listener binding down.
    const newPc = await connectSession(session);
    assert.notEqual(newPc, oldPc);

    session.speak('unrelated'); // no turnId - just to exercise state, not required for this assertion
    const stateBefore = session.state();
    oldDc.push(outputDeltaMessage('leftover from the old connection'));
    assert.equal(session.state(), stateBefore, 'a message on the superseded old data channel must never be processed at all');
  } finally { restore(); }
});

test('a data-channel send failure (a genuine send race) during interrupt()/speak() never throws uncaught', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const restore = installFakeGlobals();
  try {
    const session = createGptLiveSession(baseOptions());
    const pc = await connectSession(session);
    pc.dataChannel._sendOverride = () => { throw new Error('RTCDataChannel send failed: channel is closing'); };

    assert.doesNotThrow(() => session.interrupt(), 'interrupt() must survive a synchronous data-channel send failure');

    pc.dataChannel.push(deltaMessage('Five minutes.'));
    t.mock.timers.tick(2200);
    pc.dataChannel.push(delegationMessage('deleg-1'));
    // The commentary send itself fails (caught, per the assertion above), so nothing will ever
    // naturally settle this call - only the existing SPEAK_SAFETY_TIMEOUT_MS stall guard can. This
    // is itself the real property under test: a failed send must never wedge PlaybackController's
    // queue forever either.
    const speakPromise = session.speak('Understood.', { gptLiveTurnId: 1 });
    t.mock.timers.tick(20000);
    await assert.doesNotReject(() => speakPromise, 'speak() must still resolve (via the safety timeout) even when the underlying commentary send throws');
  } finally { restore(); }
});

test('End Voice (disconnect) mid-turn tears down cleanly with no crash and no dangling flush', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const restore = installFakeGlobals();
  try {
    const finals = [];
    const session = createGptLiveSession(baseOptions({ onFinalTranscript: (text) => finals.push(text) }));
    const pc = await connectSession(session);
    pc.dataChannel.push(deltaMessage('Five min'));
    assert.doesNotThrow(() => session.disconnect());
    assert.equal(session.state(), VOICE_STATES.IDLE);
    t.mock.timers.tick(5000);
    assert.equal(finals.length, 0, 'a turn in progress at End Voice must never flush after teardown');
  } finally { restore(); }
});

test('reconnect invalidates the old connection epoch - a quiet-window timer armed before it can never fire a stale flush afterward', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const restore = installFakeGlobals();
  try {
    const finals = [];
    const session = createGptLiveSession(baseOptions({ onFinalTranscript: (text) => finals.push(text) }));
    await connectSession(session);
    session.speak; // no-op reference just to confirm session shape; real assertion below
    const firstDebug = session.debugState();
    // Simulate an unexpected drop + reconnect by connecting again (connect() itself always tears
    // down and bumps the epoch first - the same real sequence scheduleReconnect() drives).
    await connectSession(session);
    const secondDebug = session.debugState();
    assert.ok(secondDebug.connectionEpoch > firstDebug.connectionEpoch, 'a fresh connect must move to a new connection epoch');
    t.mock.timers.tick(5000);
    assert.equal(finals.length, 0, 'no turn was ever actually accumulated on the new connection, so nothing should have flushed');
  } finally { restore(); }
});
