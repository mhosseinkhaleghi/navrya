import { RealtimeAgent, RealtimeSession, OpenAIRealtimeWebRTC } from '@openai/agents-realtime';

// Journey E (Realtime Voice) - the ONLY module in this app that talks to OpenAI's Realtime API.
// This is a pure transport adapter: connect/disconnect, mic capture, finalized-transcript
// detection, exact-text playback, mute, interrupt, and a small state machine. It owns NO
// business rules - it never decides what NAVRYA should do or say. Every finalized user turn is
// handed to the caller via onFinalTranscript(text); the caller (chatDockView.jsx) is the one
// that feeds it into the exact same core.sendChat()/submit() path a typed message already goes
// through (Context Engine, Action Registry, Workflow Engine, Proactive Engine, Knowledge Base -
// the "one brain" requirement). Once that resolves, the caller calls speak(replyText) to have
// this session read the NAVRYA-approved reply back - the Realtime model is never allowed to
// improvise its own answer. See docs/ai/voice-architecture.md for the full rationale.
//
// Grounded directly against the installed @openai/agents-realtime package's own .d.ts files
// (not assumed API shape): RealtimeSession's `history_updated`/`transport_event` events, the
// `conversation.item.input_audio_transcription.completed` raw event (item_id/transcript), and
// `session.transport.requestResponse({instructions})` -> a one-off `response.create` with an
// instruction override, for speaking an exact given sentence without letting the model reason
// about what to say.

export var VOICE_STATES = {
  IDLE: 'idle',
  REQUESTING_PERMISSION: 'requesting_permission',
  CONNECTING: 'connecting',
  LISTENING: 'listening',
  USER_SPEAKING: 'user_speaking',
  PROCESSING: 'processing',
  ASSISTANT_SPEAKING: 'assistant_speaking',
  INTERRUPTED: 'interrupted',
  RECONNECTING: 'reconnecting',
  ERROR: 'error'
};

var TRANSPORT_TRANSCRIPTION_COMPLETED = 'conversation.item.input_audio_transcription.completed';
var TRANSPORT_SPEECH_STARTED = 'input_audio_buffer.speech_started';
var TRANSPORT_SPEECH_STOPPED = 'input_audio_buffer.speech_stopped';

var lastDebugState = null;
function setDebugState(patch) { lastDebugState = Object.assign({ at: new Date().toISOString() }, patch); }
// Dev diagnostic only - never exposes the ephemeral token or raw audio, only state/ids, mirroring
// chat-dock-core.js's own debugLastTurn() convention.
function debugState() { return lastDebugState; }

function transportErrorCode(error) {
  if (error && error.name) return error.name;
  if (error && error.message) return String(error.message).slice(0, 120);
  return 'VOICE_UNKNOWN_ERROR';
}

// `fetchSession` is injected (async () => {value, model, voice, language}) so this module has
// zero knowledge of the real HTTP endpoint - the caller owns that (and the per-request personal
// API key / provider settings), keeping this file a pure transport with nothing to mock beyond a
// function call in tests.
export function createVoiceSession(options) {
  var onStateChange = (options && options.onStateChange) || function () {};
  var onFinalTranscript = (options && options.onFinalTranscript) || function () {};
  var onError = (options && options.onError) || function () {};
  var onMuteChange = (options && options.onMuteChange) || function () {};
  var fetchSession = options && options.fetchSession;
  var language = (options && options.language) || 'en';

  var state = VOICE_STATES.IDLE;
  var session = null;
  var mediaStream = null;
  // Tracks mute state - deliberately not named `muted` (mute()'s own parameter already is, see
  // its own comment on why that pre-existing name is kept as-is).
  var isMuted = false;
  // A real <audio> element this module owns and hands to the transport (OpenAIRealtimeWebRTC's
  // own `audioElement` option) instead of letting it create/manage an invisible one itself -
  // ChatDock UX repair: the only way to OBJECTIVELY prove assistant audio is actually playing
  // (not just that the state machine says ASSISTANT_SPEAKING) is to inspect a real element's own
  // .paused/.srcObject/track state - see audioDiagnostics() below.
  var audioEl = null;
  var handledItemIds = Object.create(null);
  // Bounded ring buffer of recent raw event *types* only (never audio/transcript content) -
  // purely a dev diagnostic surfaced through debugState(), same privacy posture as
  // chat-dock-core.js's own debugLastTurn() (paths/ids, never values).
  var recentEventTypes = [];

  // Shared by setState() and mute() below - found via real browser testing: debugState() only
  // ever refreshed from inside setState(), so muting (which changes nothing about `state` itself)
  // left the diagnostic's own `muted` field silently stale at whatever it was during the last real
  // state transition, even though the real UI's own onMuteChange()-driven display was already
  // correct. debugState() must reflect the CURRENT mute status any time either one changes.
  function refreshDebugState() {
    setDebugState({ state: state, language: language, sessionActive: !!session, muted: isMuted, recentEventTypes: recentEventTypes.slice(-12), audio: audioDiagnostics() });
  }

  function setState(next) {
    state = next;
    refreshDebugState();
    onStateChange(state);
  }

  // Objective, inspectable proof that assistant audio is actually playing - never the audio
  // content itself, only playback/track metadata (readyState/enabled/paused), matching this
  // file's existing privacy posture for every other diagnostic here.
  function audioDiagnostics() {
    var stream = audioEl && audioEl.srcObject;
    var tracks = stream && typeof stream.getAudioTracks === 'function' ? stream.getAudioTracks() : [];
    return {
      hasAudioElement: !!audioEl,
      audioPaused: audioEl ? audioEl.paused : null,
      audioTrackActive: tracks.some(function (track) { return track.readyState === 'live' && track.enabled; }),
      audioTrackCount: tracks.length
    };
  }

  function onTransportEvent(event) {
    if (!event || typeof event.type !== 'string') return;
    recentEventTypes.push(event.type);
    if (recentEventTypes.length > 12) recentEventTypes.shift();
    if (event.type === TRANSPORT_TRANSCRIPTION_COMPLETED) {
      var itemId = event.item_id;
      var transcript = String(event.transcript || '').trim();
      if (!transcript || (itemId && handledItemIds[itemId])) return;
      if (itemId) handledItemIds[itemId] = true;
      // ABSOLUTE rule (Journey E spec): only a finalized transcript may ever reach NAVRYA's
      // state. Interim/delta transcripts are never listened to here at all.
      setState(VOICE_STATES.PROCESSING);
      onFinalTranscript(transcript, { itemId: itemId || null });
      return;
    }
    if (event.type === TRANSPORT_SPEECH_STARTED) {
      // Reuses the guarded, public interrupt() below rather than calling the session directly,
      // so a connection dropped at exactly this moment fails the same safe way every other call does.
      if (state === VOICE_STATES.ASSISTANT_SPEAKING) interrupt();
      setState(VOICE_STATES.USER_SPEAKING);
      return;
    }
    if (event.type === TRANSPORT_SPEECH_STOPPED) {
      if (state === VOICE_STATES.USER_SPEAKING) setState(VOICE_STATES.LISTENING);
    }
  }

  async function connect() {
    if (session) return;
    if (typeof fetchSession !== 'function') throw new Error('VOICE_MISCONFIGURED');
    setState(VOICE_STATES.REQUESTING_PERMISSION);
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (permissionError) {
      setState(VOICE_STATES.ERROR);
      onError({ code: transportErrorCode(permissionError), stage: 'permission' });
      throw permissionError;
    }
    setState(VOICE_STATES.CONNECTING);
    try {
      var creds = await fetchSession(language);
      var agent = new RealtimeAgent({
        name: 'navrya-voice-transport',
        instructions: 'You are a transcription and voice-playback transport only, embedded inside a trading journal app called NAVRYA. Never answer questions, never decide anything, never take an action yourself. Only transcribe what the user says. When a separate system message asks you to speak an exact given sentence back, speak exactly that sentence, in the same language it is written in, and nothing else.',
        tools: [],
        voice: creds.voice
      });
      audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      var transport = new OpenAIRealtimeWebRTC({ mediaStream: mediaStream, audioElement: audioEl });
      session = new RealtimeSession(agent, { model: creds.model, transport: transport });
      session.on('transport_event', onTransportEvent);
      session.on('audio_start', function () { setState(VOICE_STATES.ASSISTANT_SPEAKING); });
      session.on('audio_stopped', function () { setState(VOICE_STATES.LISTENING); });
      session.on('audio_interrupted', function () { setState(VOICE_STATES.INTERRUPTED); });
      session.on('error', function (e) {
        setState(VOICE_STATES.ERROR);
        onError({ code: transportErrorCode(e && e.error), stage: 'session' });
      });
      await session.connect({ apiKey: creds.value });
      setState(VOICE_STATES.LISTENING);
    } catch (connectError) {
      disconnect();
      setState(VOICE_STATES.ERROR);
      onError({ code: transportErrorCode(connectError), stage: 'connect' });
      throw connectError;
    }
  }

  function disconnect() {
    if (session) { try { session.close(); } catch (_e) { /* already closed */ } session = null; }
    if (mediaStream) { mediaStream.getTracks().forEach(function (track) { track.stop(); }); mediaStream = null; }
    audioEl = null;
    handledItemIds = Object.create(null);
    isMuted = false;
    onMuteChange(isMuted);
    setState(VOICE_STATES.IDLE);
  }

  // Orthogonal to `state` - the user can mute while NAVRYA is speaking (to stop their own
  // background noise triggering a barge-in) just as easily as while listening, so this is its own
  // boolean rather than another VOICE_STATES entry the existing state machine's transitions would
  // have to account for on top of everything already ASSISTANT_SPEAKING/LISTENING mean.
  function mute(muted) {
    isMuted = !!muted;
    if (session) { try { session.mute(isMuted); } catch (_e) { /* connection already gone - nothing to mute */ } }
    refreshDebugState();
    onMuteChange(isMuted);
  }

  // Found via real E3 barge-in testing: the underlying WebRTC data channel can drop between two
  // turns (a real, if infrequent, network hiccup) - every session.* call below used to be
  // unguarded, so a call made just after that happened threw a raw, uncaught
  // "WebRTC data channel is not connected" exception instead of failing gracefully into the
  // existing ERROR state/onError() path every other failure mode already uses.
  function interrupt() {
    if (!session) return;
    try {
      session.interrupt();
      setState(VOICE_STATES.LISTENING);
    } catch (interruptError) {
      setState(VOICE_STATES.ERROR);
      onError({ code: transportErrorCode(interruptError), stage: 'interrupt' });
    }
  }

  // Called only by the caller, only once NAVRYA's own deterministic turn produced a reply -
  // never invoked in response to anything the Realtime model itself decided.
  //
  // Returns a Promise that resolves once this response has actually finished being spoken
  // (session 'audio_stopped'), not just once the request was sent - found necessary via real E1
  // multi-turn testing: the caller serializes voice turns through a queue (chatDockView.jsx's
  // voiceTurnQueue) precisely so two turns are never in flight at once, but speak() itself used
  // to return immediately, so a fast-resolving next turn's own speak() call could fire a second
  // response.create while the first one's audio was still playing - the Realtime API rejects an
  // overlapping response, which surfaced as a transient session error mid-conversation. A 12s
  // safety timeout resolves anyway (never lets a lost/late audio_stopped event wedge the queue).
  function speak(text) {
    if (!session || !text) return Promise.resolve();
    setState(VOICE_STATES.ASSISTANT_SPEAKING);
    try {
      session.transport.requestResponse({
        instructions: 'Speak exactly the following text, verbatim, and nothing else: ' + JSON.stringify(String(text))
      });
    } catch (requestError) {
      setState(VOICE_STATES.ERROR);
      onError({ code: transportErrorCode(requestError), stage: 'speak' });
      return Promise.resolve();
    }
    var activeSession = session;
    return new Promise(function (resolve) {
      var settled = false;
      var timer = setTimeout(function () { settle(); }, 12000);
      function settle() {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      }
      activeSession.once('audio_stopped', settle);
      activeSession.once('error', settle);
    });
  }

  function setLanguage(nextLanguage) { language = nextLanguage || 'en'; }

  return {
    connect: connect,
    disconnect: disconnect,
    mute: mute,
    interrupt: interrupt,
    speak: speak,
    setLanguage: setLanguage,
    state: function () { return state; },
    isMuted: function () { return isMuted; },
    audioDiagnostics: audioDiagnostics,
    // Purely additive, read-only access to the same mic stream already captured for WebRTC at
    // connect() time - lets the UI build its own AnalyserNode for a real, audio-reactive waveform
    // (VoiceConsole.jsx) without this transport module taking on any visualization concerns of its
    // own or changing anything about how the stream is used for the actual voice session.
    getMediaStream: function () { return mediaStream; }
  };
}

if (typeof window !== 'undefined') {
  window.TradeJournalAIVoiceRealtime = { STATES: VOICE_STATES, createSession: createVoiceSession, debugState: debugState };
}
