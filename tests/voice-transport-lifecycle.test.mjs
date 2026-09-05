import assert from 'node:assert/strict';
import test from 'node:test';

import { createVoiceSession, VOICE_STATES } from '../navrya-src/aiVoiceRealtime.js';
import { createGeminiLiveSession } from '../navrya-src/geminiLiveVoice.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

function liveStream(label) {
  const track = {
    enabled: true,
    readyState: 'live',
    stopCalls: 0,
    stop() { this.stopCalls += 1; this.readyState = 'ended'; }
  };
  return {
    label,
    track,
    getTracks: () => [track],
    getAudioTracks: () => [track]
  };
}

function emitter(target = {}) {
  const listeners = new Map();
  target.on = (type, listener) => {
    const values = listeners.get(type) || [];
    values.push({ listener, once: false });
    listeners.set(type, values);
  };
  target.once = (type, listener) => {
    const values = listeners.get(type) || [];
    values.push({ listener, once: true });
    listeners.set(type, values);
  };
  target.emit = (type, value) => {
    const values = (listeners.get(type) || []).slice();
    listeners.set(type, (listeners.get(type) || []).filter((entry) => !entry.once));
    for (const entry of values) entry.listener(value);
  };
  return target;
}

function mockAudioElement() {
  const listeners = new Map();
  return {
    autoplay: false,
    paused: true,
    src: '',
    srcObject: null,
    currentTime: 0,
    pauseCalls: 0,
    playCalls: 0,
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) { if (listeners.get(type) === listener) listeners.delete(type); },
    play() { this.paused = false; this.playCalls += 1; return Promise.resolve(); },
    pause() { this.paused = true; this.pauseCalls += 1; },
    emit(type) { if (listeners.has(type)) listeners.get(type)(); }
  };
}

function openAiHarness({ getUserMedia, connectSession, playbackTimeoutMs = 50 } = {}) {
  const transports = [];
  const sessions = [];
  const audioElements = [];
  let micCalls = 0;
  let mintCalls = 0;
  const runtime = {
    getUserMedia(constraints) {
      micCalls += 1;
      return getUserMedia ? getUserMedia(micCalls, constraints) : Promise.resolve(liveStream(`openai-${micCalls}`));
    },
    createAgent(config) { return config; },
    createTransport(config) {
      const transport = emitter({
        config,
        connectionState: { callId: 'call-id', dataChannel: { readyState: 'open' } },
        responseRequests: [],
        sentEvents: [],
        updateSessionConfig() {},
        requestResponse(value) { this.responseRequests.push(value); },
        sendEvent(value) { this.sentEvents.push(value); }
      });
      transports.push(transport);
      return transport;
    },
    createSession(agent, config) {
      const index = sessions.length;
      const session = emitter({
        agent,
        transport: config.transport,
        closeCalls: 0,
        interruptCalls: 0,
        mute() {},
        interrupt() { this.interruptCalls += 1; this.emit('audio_interrupted'); },
        close() { this.closeCalls += 1; },
        connect(args) { return connectSession ? connectSession(index, this, args) : Promise.resolve(); }
      });
      sessions.push(session);
      return session;
    },
    createAudioElement() {
      const element = mockAudioElement();
      audioElements.push(element);
      return element;
    },
    locationOrigin: 'https://navrya.test',
    playbackTimeoutMs
  };
  return {
    runtime,
    transports,
    sessions,
    audioElements,
    micCalls: () => micCalls,
    mintCalls: () => mintCalls,
    fetchSession: async () => {
      mintCalls += 1;
      return { value: `token-${mintCalls}`, model: 'gpt-realtime', voice: 'cedar' };
    }
  };
}

test('OpenAI connect is single-flight and a disconnect invalidates a pending mic request without leaking its late stream or blocking retry', async () => {
  const firstPermission = deferred();
  const secondStream = liveStream('second');
  const harness = openAiHarness({
    getUserMedia: (call) => call === 1 ? firstPermission.promise : Promise.resolve(secondStream)
  });
  const states = [];
  const adapter = createVoiceSession({
    fetchSession: harness.fetchSession,
    onStateChange: (state) => states.push(state),
    runtime: harness.runtime
  });

  const firstConnect = adapter.connect();
  const duplicateConnect = adapter.connect();
  assert.strictEqual(duplicateConnect, firstConnect, 'concurrent callers must share one connection attempt');
  await flush();
  assert.equal(harness.micCalls(), 1);

  adapter.disconnect();
  const retry = adapter.connect();
  await retry;
  assert.equal(adapter.state(), VOICE_STATES.LISTENING);
  assert.equal(harness.micCalls(), 2, 'retry must not wait behind the invalidated permission prompt');

  const lateStream = liveStream('late-first');
  firstPermission.resolve(lateStream);
  await firstConnect;
  await flush();
  assert.equal(lateStream.track.stopCalls, 1, 'a stream granted to a stale attempt is stopped immediately');
  assert.strictEqual(adapter.getMediaStream(), secondStream);
  assert.equal(states.at(-1), VOICE_STATES.LISTENING);
  adapter.disconnect();
});

test('OpenAI stale session/transport events cannot mutate the replacement connection and fatal session errors fully clean up for retry', async () => {
  const transcripts = [];
  const errors = [];
  const harness = openAiHarness();
  const adapter = createVoiceSession({
    fetchSession: harness.fetchSession,
    onFinalTranscript: (text) => transcripts.push(text),
    onError: (error) => errors.push(error),
    runtime: harness.runtime
  });

  await adapter.connect();
  const firstSession = harness.sessions[0];
  const firstTransport = harness.transports[0];
  const firstStream = adapter.getMediaStream();
  firstSession.emit('error', { error: new Error('fatal session failure') });
  assert.equal(adapter.state(), VOICE_STATES.ERROR);
  assert.equal(firstSession.closeCalls, 1);
  assert.equal(firstStream.track.stopCalls, 1);
  assert.equal(adapter.getMediaStream(), null);

  await adapter.connect();
  assert.equal(adapter.state(), VOICE_STATES.LISTENING);
  firstSession.emit('transport_event', {
    type: 'conversation.item.input_audio_transcription.completed',
    item_id: 'stale-turn',
    transcript: 'must not run'
  });
  firstTransport.emit('connection_change', 'disconnected');
  await flush();
  assert.deepEqual(transcripts, []);
  assert.equal(adapter.state(), VOICE_STATES.LISTENING);
  assert.equal(harness.sessions.length, 2, 'a stale disconnect must not schedule another connection');
  assert.equal(errors.length, 1);
  adapter.disconnect();
});

test('OpenAI speak waits for the real output buffer stop, refuses to begin over user speech, and its watchdog stops the original audio', async () => {
  const harness = openAiHarness({ playbackTimeoutMs: 5 });
  const adapter = createVoiceSession({ fetchSession: harness.fetchSession, runtime: harness.runtime });
  await adapter.connect();
  const session = harness.sessions[0];
  const transport = harness.transports[0];

  let settled = false;
  const speaking = adapter.speak('approved reply').then(() => { settled = true; });
  session.emit('audio_stopped');
  await flush();
  assert.equal(settled, false, 'SDK generation completion is not browser playback completion');
  session.emit('transport_event', { type: 'output_audio_buffer.stopped', response_id: 'response-1' });
  await speaking;
  assert.equal(settled, true);

  session.emit('transport_event', { type: 'input_audio_buffer.speech_started', item_id: 'speech-1' });
  const requestsBefore = transport.responseRequests.length;
  await adapter.speak('stale reply');
  assert.equal(transport.responseRequests.length, requestsBefore, 'assistant audio must never start over USER_SPEAKING');

  session.emit('transport_event', { type: 'input_audio_buffer.speech_stopped', item_id: 'speech-1' });
  await adapter.speak('watchdog reply');
  assert.ok(session.interruptCalls >= 1, 'watchdog must cancel the provider response');
  assert.ok(harness.audioElements[0].pauseCalls >= 1, 'watchdog must stop the actual audio element');
  adapter.disconnect();
});

function geminiHarness({ getUserMedia, fetchSession, playbackTimeoutMs = 50 } = {}) {
  const sockets = [];
  const contexts = [];
  const captureNodes = [];
  const audioElements = [];
  let micCalls = 0;
  let tokenCalls = 0;

  class MockSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.bufferedAmount = 0;
      this.sent = [];
      this.closeCalls = 0;
    }
    send(value) { this.sent.push(JSON.parse(value)); }
    close() { this.closeCalls += 1; this.readyState = 3; }
    open() { this.readyState = 1; if (this.onopen) this.onopen(); }
    message(value) { if (this.onmessage) this.onmessage({ data: JSON.stringify(value) }); }
  }

  function makeContext() {
    const context = {
      sampleRate: 48000,
      destination: {},
      closed: false,
      audioWorklet: { modules: [], async addModule(url) { this.modules.push(String(url)); } },
      async resume() {},
      async close() { this.closed = true; },
      createMediaStreamSource() { return { connect() {}, disconnect() {} }; },
      createBuffer() { return { getChannelData: () => new Float32Array(8) }; },
      createBufferSource() {
        return { connect() {}, start() {}, stopCalls: 0, stop() { this.stopCalls += 1; if (this.onended) this.onended(); } };
      }
    };
    contexts.push(context);
    return context;
  }

  const runtime = {
    getUserMedia(constraints) {
      micCalls += 1;
      return getUserMedia ? getUserMedia(micCalls, constraints) : Promise.resolve(liveStream(`gemini-${micCalls}`));
    },
    createWebSocket(url) { const socket = new MockSocket(url); sockets.push(socket); return socket; },
    webSocketOpenState: 1,
    createAudioContext: makeContext,
    createAudioWorkletNode() {
      const node = { port: { onmessage: null }, connect() {}, disconnect() {} };
      captureNodes.push(node);
      return node;
    },
    createAudioElement() { const element = mockAudioElement(); audioElements.push(element); return element; },
    playbackTimeoutMs
  };
  return {
    runtime,
    sockets,
    contexts,
    captureNodes,
    audioElements,
    micCalls: () => micCalls,
    tokenCalls: () => tokenCalls,
    fetchSession: async (...args) => {
      tokenCalls += 1;
      if (fetchSession) return fetchSession(tokenCalls, ...args);
      return { token: `gemini-token-${tokenCalls}`, model: 'gemini-live' };
    }
  };
}

async function finishGeminiConnect(connectPromise, harness, index = harness.sockets.length - 1) {
  for (let tries = 0; tries < 10 && !harness.sockets[index]; tries += 1) await flush();
  const socket = harness.sockets[index];
  assert.ok(socket, 'socket was created');
  socket.open();
  socket.message({ setupComplete: {} });
  await connectPromise;
  return socket;
}

test('Gemini deduplicates only by provider turn/message id, so two distinct "yes" turns both reach the coordinator', async () => {
  const harness = geminiHarness();
  const turns = [];
  const adapter = createGeminiLiveSession({
    fetchSession: harness.fetchSession,
    onFinalTranscript: (text, meta) => turns.push({ text, id: meta.providerTurnId }),
    runtime: harness.runtime
  });
  const socket = await finishGeminiConnect(adapter.connect(), harness, 0);

  socket.message({ messageId: 'provider-turn-1', serverContent: { inputTranscription: { text: 'yes' } } });
  socket.message({ messageId: 'provider-turn-2', serverContent: { inputTranscription: { text: 'yes' } } });
  socket.message({ messageId: 'provider-turn-2', serverContent: { inputTranscription: { text: 'yes' } } });
  await flush();
  assert.deepEqual(turns, [
    { text: 'yes', id: 'provider-turn-1' },
    { text: 'yes', id: 'provider-turn-2' }
  ]);
  adapter.disconnect();
});

test('Gemini starts mic permission and token mint in parallel; disconnect invalidates permission and a new connect is not blocked', async () => {
  const firstPermission = deferred();
  const secondStream = liveStream('gemini-second');
  const harness = geminiHarness({
    getUserMedia: (call) => call === 1 ? firstPermission.promise : Promise.resolve(secondStream)
  });
  const adapter = createGeminiLiveSession({ fetchSession: harness.fetchSession, runtime: harness.runtime });

  const first = adapter.connect();
  await flush();
  assert.equal(harness.micCalls(), 1);
  assert.equal(harness.tokenCalls(), 1, 'token mint starts without waiting for permission');
  adapter.disconnect();

  const retry = adapter.connect();
  const secondSocket = await finishGeminiConnect(retry, harness, 0);
  assert.equal(adapter.state(), VOICE_STATES.LISTENING);
  assert.equal(secondSocket.readyState, 1);

  const lateStream = liveStream('gemini-late');
  firstPermission.resolve(lateStream);
  await first;
  await flush();
  assert.equal(lateStream.track.stopCalls, 1);
  assert.strictEqual(adapter.getMediaStream(), secondStream);
  adapter.disconnect();
});

test('Gemini stale socket messages do not produce turns, End message sends a real end-of-turn event, and disconnect stops published audio', async () => {
  const harness = geminiHarness();
  const turns = [];
  const adapter = createGeminiLiveSession({
    fetchSession: harness.fetchSession,
    onFinalTranscript: (text) => turns.push(text),
    runtime: harness.runtime
  });

  const firstSocket = await finishGeminiConnect(adapter.connect(), harness, 0);
  const staleMessage = firstSocket.onmessage;
  adapter.disconnect();
  const secondSocket = await finishGeminiConnect(adapter.connect(), harness, 1);
  await staleMessage({ data: JSON.stringify({ messageId: 'stale', serverContent: { inputTranscription: { text: 'stale turn' } } }) });
  assert.deepEqual(turns, []);
  assert.equal(adapter.state(), VOICE_STATES.LISTENING);

  const capture = harness.captureNodes[1];
  capture.port.onmessage({ data: { pcm: new Uint8Array([1, 0]).buffer, energy: 0.2 } });
  assert.equal(adapter.state(), VOICE_STATES.USER_SPEAKING);
  assert.equal(adapter.finishUserTurn(), true);
  assert.deepEqual(secondSocket.sent.at(-1), { realtimeInput: { audioStreamEnd: true } });

  const published = adapter.playAudioUrl('/approved.wav');
  await flush();
  adapter.disconnect();
  await published;
  assert.ok(harness.audioElements[0].pauseCalls >= 1);
});

test('Gemini microphone capture uses AudioWorklet batching/backpressure and never ScriptProcessor', async () => {
  const harness = geminiHarness();
  const adapter = createGeminiLiveSession({ fetchSession: harness.fetchSession, runtime: harness.runtime });
  const socket = await finishGeminiConnect(adapter.connect(), harness, 0);
  assert.equal(harness.contexts[0].audioWorklet.modules.length, 1);
  assert.equal(harness.captureNodes.length, 1);

  socket.bufferedAmount = 1024 * 1024;
  const sentBefore = socket.sent.length;
  harness.captureNodes[0].port.onmessage({ data: { pcm: new Uint8Array([1, 0]).buffer, energy: 0.2 } });
  assert.equal(socket.sent.length, sentBefore, 'capture is dropped while socket backpressure is high');
  socket.bufferedAmount = 0;
  harness.captureNodes[0].port.onmessage({ data: { pcm: new Uint8Array([1, 0]).buffer, energy: 0.2 } });
  assert.equal(socket.sent.at(-1).realtimeInput.audio.mimeType, 'audio/pcm;rate=16000');
  adapter.disconnect();
});
