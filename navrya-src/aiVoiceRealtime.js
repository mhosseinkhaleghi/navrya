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
//
// Voice Mode performance pass (feature/voice-mode-performance): connectionEpoch and real bounded-
// backoff reconnect were added. Grounded against the installed SDK's own source (not assumed):
// RealtimeSession never re-emits the transport's own 'connection_change' event (verified - its
// #setEventListeners() only forwards raw server-sent realtime events with a `.type` field via a
// '*' listener, plus a fixed, explicit list of named transport events that does NOT include
// 'connection_change' - see node_modules/@openai/agents-realtime/dist/realtimeSession.mjs), so an
// unexpected WebRTC drop is only observable by listening directly on the local `transport` object
// this module already constructs, not through `session.on(...)`.

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
var TRANSPORT_SESSION_UPDATED = 'session.updated';

// Bounds the whole connect() attempt (mic + token mint + SDP/ICE + session ack combined) - a
// hung negotiation must fail loudly and free the UI/state machine, never spin forever. This SDK
// version's session.connect() accepts no AbortSignal of its own (verified against its .mjs
// source), so this is enforced via Promise.race, not a native cancel - a timed-out attempt is
// still cleaned up (best-effort close) exactly like any other failed connect().
var CONNECT_TIMEOUT_MS = 15000;
// Bounded exponential backoff with jitter for an UNEXPECTED connection drop (network hiccup,
// server-side close) - never for a user-initiated disconnect() (see intentionalDisconnect below).
// Jitter (50-100% of the computed delay) avoids every open tab retrying in lockstep after a
// shared network blip. Never retries a business side effect - reconnect only re-establishes the
// transport; TurnCoordinator/PlaybackController own turn/playback state and are never touched
// from here (see ai-voice-turn-coordinator.js/ai-voice-playback-controller.js).
var RECONNECT_BASE_DELAY_MS = 500;
var RECONNECT_MAX_DELAY_MS = 8000;
var RECONNECT_MAX_ATTEMPTS = 5;

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

// Phase 3 (fix/voice-mode-hosted-connection): classifies a connect()-time failure into one of
// NAVRYA's canonical, sanitized Voice Mode diagnostic stages so the UI can show something more
// useful than one generic "Voice failed" message - never by widening CONNECT_TIMEOUT_MS or the
// reconnect policy (both untouched), only by labeling WHERE within the existing, unchanged
// pipeline a given attempt actually failed. Pure functions, no side effects, so they can be
// exercised by static source assertion the same way the rest of this file already is (see this
// file's own header comment on why a real browser is this module's actual proof).
//
// `error.code`/`error.status` come from chatDockView.jsx's fetchRealtimeSession(), which now
// preserves the server's own sanitized error code/HTTP status instead of collapsing every mint
// failure into one opaque string (see that file's own comment on the bug this fixes).
function classifyMintFailureStage(error, timedOut) {
  if (timedOut) return 'token_mint_timeout';
  var code = String((error && (error.code || error.message)) || '');
  var status = error && error.status;
  if (status === 401 || code === 'AUTH_SESSION_REQUIRED' || code === 'ACCOUNT_SUSPENDED') return 'session_auth';
  if (status === 429 || /_429$/.test(code) || /QUOTA/i.test(code)) return 'session_quota';
  if (status === 503 || /_API_KEY_MISSING$/.test(code) || code === 'REALTIME_LEASE_STORE_FAILED') return 'key_missing';
  if (/REALTIME_TOKEN_FAILED_/.test(code)) {
    if (/model/i.test(code)) return 'model_unavailable';
    if (/_401|_403/.test(code)) return 'key_rejected';
    return 'key_rejected';
  }
  return 'sdp_exchange'; // unclassified mint-side failure - closest real bucket to "never even started the exchange"
}

// `transportInstance.connectionState` (a real, already-public getter on OpenAIRealtimeWebRTC) is
// the only signal this module has for distinguishing "the SDP relay call itself failed/hung"
// from "the relay succeeded (we got a real Location/callId back) but ICE/the data channel never
// finished" - verified directly against the installed SDK's own source
// (node_modules/@openai/agents-realtime/dist/openaiRealtimeWebRtc.mjs): `callId` is set
// immediately after a successful SDP POST, strictly before setRemoteDescription/ICE begins. This
// is a best-effort heuristic, not a precise ICE/DTLS state machine - documented as such rather
// than overclaiming granularity the SDK does not expose.
function classifySdpFailureStage(error, timedOut, transportInstance) {
  var message = String((error && error.message) || '');
  var state = transportInstance && transportInstance.connectionState;
  var gotCallId = !!(state && state.callId);
  var dataChannelState = state && state.dataChannel && state.dataChannel.readyState;
  if (timedOut) return gotCallId ? 'ice_connection' : 'sdp_relay_timeout';
  if (/Realtime call request failed with status/.test(message)) return 'sdp_exchange';
  if (gotCallId) return dataChannelState === 'open' ? 'session_ack' : (dataChannelState ? 'data_channel' : 'ice_connection');
  return 'sdp_exchange';
}

// `fetchSession` is injected (async (language, {signal}) => {value, model, voice, language}) so
// this module has zero knowledge of the real HTTP endpoint - the caller owns that (and the
// per-request personal API key / provider settings), keeping this file a pure transport with
// nothing to mock beyond a function call in tests. The optional `signal` lets the caller's own
// fetch() be aborted if CONNECT_TIMEOUT_MS elapses before minting finishes.
export function createVoiceSession(options) {
  var onStateChange = (options && options.onStateChange) || function () {};
  var onFinalTranscript = (options && options.onFinalTranscript) || function () {};
  var onError = (options && options.onError) || function () {};
  var onMuteChange = (options && options.onMuteChange) || function () {};
  var fetchSession = options && options.fetchSession;
  var language = (options && options.language) || 'en';

  var state = VOICE_STATES.IDLE;
  var session = null;
  var transport = null;
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
  // The active speak()'s own settle function, if one is currently pending - see speak()'s own
  // comment on why this exists alongside its session-event listeners: RealtimeSession.close()
  // (called from disconnect() below) tears down transport state directly and emits none of
  // audio_stopped/audio_interrupted/error (verified against the installed SDK's own source, not
  // assumed), so a speak() in flight when the user leaves Voice Mode or a reconnect tears the
  // session down would otherwise sit unsettled for the full 12s fallback with nothing left to
  // resolve it either. disconnect() below settles it directly instead of relying on an event that
  // this SDK version never sends for a close().
  var pendingSpeakSettle = null;
  // Bounded ring buffer of recent raw event *types* only (never audio/transcript content) -
  // purely a dev diagnostic surfaced through debugState(), same privacy posture as
  // chat-dock-core.js's own debugLastTurn() (paths/ids, never values).
  var recentEventTypes = [];

  // connectionEpoch: bumped once per genuine new connection attempt (every connect() call,
  // reconnect or not). Listeners registered against a specific session/transport instance close
  // over the epoch value active when THEY were registered (`myEpoch` inside connect()) and check
  // it before mutating state - so an event from a session that's since been superseded (a fresh
  // connect() ran, or disconnect() tore it down) can never mutate current state, even if the old
  // session's own listeners somehow still fire (a defensive second layer on top of the fact that
  // a torn-down `session`/`transport` should simply stop emitting at all).
  var connectionEpoch = 0;
  // True only while OUR OWN disconnect() is tearing things down - distinguishes a deliberate stop
  // from an unexpected drop the transport's own 'connection_change' reports, so only the latter
  // ever triggers a reconnect attempt.
  var intentionalDisconnect = false;
  var reconnectAttempt = 0;
  var reconnectTimer = null;
  // Dynamic VAD (Voice Mode performance pass): the eagerness this session was minted with (or
  // last successfully pushed via setEagerness()) - tracked so setEagerness() can skip sending a
  // session.update when the caller asks for the exact value already in effect (task requirement:
  // "avoid unnecessary session updates"). 'medium' matches the server's own mint-time default
  // (see server/pattern-ai-server.mjs's mintRealtimeClientSecret) for a session that hasn't had
  // any eagerness hint applied yet.
  var currentEagerness = 'medium';

  // Shared by setState() and mute() below - found via real browser testing: debugState() only
  // ever refreshed from inside setState(), so muting (which changes nothing about `state` itself)
  // left the diagnostic's own `muted` field silently stale at whatever it was during the last real
  // state transition, even though the real UI's own onMuteChange()-driven display was already
  // correct. debugState() must reflect the CURRENT mute status any time either one changes.
  function refreshDebugState() {
    setDebugState({
      state: state, language: language, sessionActive: !!session, muted: isMuted,
      connectionEpoch: connectionEpoch, reconnectAttempt: reconnectAttempt,
      recentEventTypes: recentEventTypes.slice(-12), audio: audioDiagnostics()
    });
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
      return;
    }
    if (event.type === TRANSPORT_SESSION_UPDATED) {
      // Dynamic VAD (Voice Mode performance pass): the effective turn_detection config the
      // server actually applied - verified from the real acknowledgement, never assumed from
      // what was requested. Diagnostic-only (dev debugState()), same privacy posture as every
      // other field here (config shape, never audio/transcript content).
      var effective = event.session && event.session.turn_detection;
      if (effective) setDebugState(Object.assign({}, lastDebugState, { effectiveTurnDetection: { type: effective.type, eagerness: effective.eagerness || null } }));
    }
  }

  function clearReconnectTimer() { if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; } }

  // Tears down the transport/session/media without touching `state` or the reconnect timer - the
  // two real callers (the public disconnect() and a reconnect about to retry) each drive `state`
  // and reconnectTimer themselves, since they mean different things (IDLE + no future retry vs.
  // RECONNECTING + a scheduled retry).
  function teardownTransport() {
    if (session) { try { session.close(); } catch (_e) { /* already closed */ } session = null; }
    transport = null;
    if (mediaStream) { mediaStream.getTracks().forEach(function (track) { track.stop(); }); mediaStream = null; }
    audioEl = null;
    handledItemIds = Object.create(null);
    // See pendingSpeakSettle's own comment above - close() itself never settles an in-flight
    // speak() promise, so do it explicitly here rather than leave the caller's playback queue
    // blocked on the 12s fallback for a session that no longer exists.
    if (pendingSpeakSettle) { var settleNow = pendingSpeakSettle; pendingSpeakSettle = null; settleNow(); }
  }

  // An unexpected drop (network hiccup, server-side close) - never a call this module made
  // itself (see intentionalDisconnect). Schedules a bounded, jittered, exponentially-backed-off
  // reconnect attempt, or gives up into ERROR once RECONNECT_MAX_ATTEMPTS is exhausted.
  function scheduleReconnect(myEpoch) {
    if (myEpoch !== connectionEpoch) return; // superseded by a newer connection already - not our concern any more
    teardownTransport();
    if (reconnectAttempt >= RECONNECT_MAX_ATTEMPTS) {
      setState(VOICE_STATES.ERROR);
      onError({ code: 'VOICE_RECONNECT_EXHAUSTED', stage: 'reconnect' });
      return;
    }
    reconnectAttempt += 1;
    var delay = Math.min(RECONNECT_MAX_DELAY_MS, RECONNECT_BASE_DELAY_MS * Math.pow(2, reconnectAttempt - 1));
    var jitter = delay * (0.5 + Math.random() * 0.5);
    setState(VOICE_STATES.RECONNECTING);
    reconnectTimer = setTimeout(function () {
      reconnectTimer = null;
      if (myEpoch !== connectionEpoch) return; // a fresh connect()/disconnect() happened while we were waiting
      connect({ isReconnect: true }).catch(function () { /* connect() itself already reports failure via onError/setState */ });
    }, jitter);
  }

  async function connect(connectOptions) {
    var isReconnect = !!(connectOptions && connectOptions.isReconnect);
    if (session) return;
    if (typeof fetchSession !== 'function') throw new Error('VOICE_MISCONFIGURED');
    intentionalDisconnect = false;
    // Dynamic VAD: a fresh, user-initiated connect() has no turn context yet, so it always mints
    // at the server's own default ('medium') - a reconnect instead preserves whatever eagerness
    // was last in effect, so a network hiccup mid-confirmation doesn't silently revert the
    // session back to a slower-to-decide default right when a quick yes/no is expected.
    if (!isReconnect) { reconnectAttempt = 0; clearReconnectTimer(); currentEagerness = 'medium'; }
    var myEpoch = ++connectionEpoch;
    var abortController = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timedOut = false;
    // ONE overall deadline for the whole attempt (mic + token mint + SDP/ICE + session ack
    // combined), not a fresh timer per phase - each Promise.race below shares this exact same
    // promise, so time already spent on an earlier phase counts against the phases after it
    // rather than each phase getting its own full CONNECT_TIMEOUT_MS budget.
    var deadline = new Promise(function (_resolve, reject) {
      setTimeout(function () {
        timedOut = true;
        if (abortController) abortController.abort();
        reject(Object.assign(new Error('VOICE_CONNECT_TIMEOUT'), { name: 'VOICE_CONNECT_TIMEOUT' }));
      }, CONNECT_TIMEOUT_MS);
    });
    deadline.catch(function () {}); // Promise.race below attaches its own handler on the winning path; this only guards the case where the race that WOULD have consumed it is never reached (an early return above a later race call)

    setState(isReconnect ? VOICE_STATES.RECONNECTING : VOICE_STATES.REQUESTING_PERMISSION);
    // Mic readiness and connection setup run in parallel where safe (task requirement): the
    // ephemeral-secret mint is independent of microphone permission until both are actually
    // needed to build the transport, so kick both off immediately rather than sequentially.
    var micPromise = navigator.mediaDevices.getUserMedia({ audio: true });
    var credsPromise = Promise.resolve().then(function () { return fetchSession(language, { signal: abortController && abortController.signal, eagerness: currentEagerness }); });
    // A rejection on either promise is otherwise "unhandled" the moment we stop awaiting the
    // OTHER one below (e.g. mic denied while the token mint is still in flight) - Node/browsers
    // both warn loudly about that; this keeps the real error (thrown further down) as the one
    // that surfaces, without silently swallowing a real problem.
    micPromise.catch(function () {});
    credsPromise.catch(function () {});

    try {
      mediaStream = await Promise.race([micPromise, deadline]);
    } catch (permissionError) {
      if (myEpoch !== connectionEpoch) return; // superseded mid-flight (disconnect()/a newer connect() already ran)
      setState(VOICE_STATES.ERROR);
      // 'microphone_permission' whether the browser prompt was actively denied or simply never
      // answered before the shared deadline elapsed - both are the same real diagnostic bucket
      // from the user's point of view ("Voice never got mic access").
      onError({ code: transportErrorCode(permissionError), stage: 'microphone_permission' });
      throw permissionError;
    }
    if (!isReconnect) setState(VOICE_STATES.CONNECTING);
    // Tracks which phase of the remaining pipeline is currently in flight, purely for
    // classifyMintFailureStage()/classifySdpFailureStage() below if the shared catch block is
    // reached - never read anywhere else, never affects control flow, timing, or the epoch guards
    // already in place on every await below.
    var phase = 'mint';
    try {
      var creds = await Promise.race([credsPromise, deadline]);
      if (myEpoch !== connectionEpoch) return; // superseded while the mint was in flight
      phase = 'sdp';
      var agent = new RealtimeAgent({
        name: 'navrya-voice-transport',
        instructions: 'You are a transcription and voice-playback transport only, embedded inside a trading journal app called NAVRYA. Never answer questions, never decide anything, never take an action yourself. Only transcribe what the user says. When a separate system message asks you to speak an exact given sentence back, speak exactly that sentence, in the same language it is written in, and nothing else.',
        tools: [],
        voice: creds.voice
      });
      audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      // fix/voice-mode-hosted-connection: without an explicit baseUrl, this SDK version's
      // OpenAIRealtimeWebRTC posts the SDP offer straight from the browser to
      // `https://api.openai.com/v1/realtime/calls` (see its own constructor:
      // `this.#url = options.baseUrl ?? 'https://api.openai.com/v1/realtime/calls'` in
      // node_modules/@openai/agents-realtime/dist/openaiRealtimeWebRtc.mjs) - a real, observed
      // production failure (net::ERR_FAILED, no response at all; see
      // docs/ai/voice-mode-performance-gap-matrix.md). `connect()` itself then does
      // `new URL(baseUrl)` on whatever is passed here, so a bare relative path like
      // '/api/ai/realtime/call' would throw immediately ("Invalid URL") - this must be an
      // absolute, same-origin URL. The relay endpoint (server/pattern-ai-server.mjs's
      // handleRealtimeCallRelay) forwards the exact same SDP + ephemeral Bearer credential to the
      // exact same OpenAI upstream; nothing about the SDP/ICE/negotiation semantics changes here.
      transport = new OpenAIRealtimeWebRTC({
        mediaStream: mediaStream, audioElement: audioEl,
        baseUrl: new URL('/api/ai/realtime/call', window.location.origin).href
      });
      // Direct transport-level listener, not session.on(...) - RealtimeSession never re-emits
      // 'connection_change' (see this file's own header comment). Only ever acts while this is
      // still the current connection (myEpoch check) and only for an UNEXPECTED drop, never one
      // this module's own disconnect() caused (intentionalDisconnect).
      transport.on('connection_change', function (status) {
        if (myEpoch !== connectionEpoch || intentionalDisconnect) return;
        if (status === 'disconnected') scheduleReconnect(myEpoch);
      });
      session = new RealtimeSession(agent, { model: creds.model, transport: transport });
      session.on('transport_event', onTransportEvent);
      session.on('audio_start', function () { if (myEpoch === connectionEpoch) setState(VOICE_STATES.ASSISTANT_SPEAKING); });
      session.on('audio_stopped', function () { if (myEpoch === connectionEpoch) setState(VOICE_STATES.LISTENING); });
      session.on('audio_interrupted', function () { if (myEpoch === connectionEpoch) setState(VOICE_STATES.INTERRUPTED); });
      session.on('error', function (e) {
        if (myEpoch !== connectionEpoch) return;
        setState(VOICE_STATES.ERROR);
        onError({ code: transportErrorCode(e && e.error), stage: 'session' });
      });
      // Bounds the SDP/ICE/session-ack phase against the same overall deadline - this SDK
      // version's session.connect() has no AbortSignal of its own (verified against its source),
      // so a timeout here stops US from waiting, not the underlying negotiation; the catch block
      // below still tears everything down exactly like any other failed connect().
      await Promise.race([session.connect({ apiKey: creds.value }), deadline]);
      if (myEpoch !== connectionEpoch) return; // superseded while SDP/ICE was in flight
      reconnectAttempt = 0;
      setState(VOICE_STATES.LISTENING);
    } catch (connectError) {
      if (myEpoch !== connectionEpoch) return; // a newer connect()/disconnect() already superseded this attempt
      var failedStage = phase === 'mint'
        ? classifyMintFailureStage(connectError, timedOut)
        : classifySdpFailureStage(connectError, timedOut, transport);
      teardownTransport();
      setState(VOICE_STATES.ERROR);
      onError({ code: transportErrorCode(connectError), stage: failedStage });
      throw connectError;
    }
  }

  function disconnect() {
    intentionalDisconnect = true;
    connectionEpoch += 1; // invalidate every in-flight/scheduled listener and reconnect from this connection generation
    clearReconnectTimer();
    reconnectAttempt = 0;
    teardownTransport();
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

  var VALID_EAGERNESS = { low: true, medium: true, high: true, auto: true };
  // Dynamic VAD (Voice Mode performance pass): live-updates turn_detection.eagerness on the
  // already-connected session via session.update, rather than reconnecting. One configuration
  // authority (ai-voice-eagerness.js's deriveEagerness() is the only place that decides the
  // VALUE; this is the only place that ever sends it to the API) - and a no-op if the requested
  // value is already in effect, per the task's own "avoid unnecessary session updates"
  // requirement. create_response/interrupt_response are resent as `false` on every call (never
  // only eagerness alone) so a live update can never accidentally revert the "NAVRYA always
  // decides before the model may speak" contract (see this file's own header comment) to
  // whatever the SDK's own default would otherwise be.
  function setEagerness(next) {
    if (!VALID_EAGERNESS[next] || next === currentEagerness) return false;
    currentEagerness = next;
    if (!session) return false; // not connected yet - the NEXT connect()/reconnect will mint with this value instead (see connect()'s own isReconnect branch)
    try {
      session.transport.updateSessionConfig({ audio: { input: { turnDetection: { type: 'semantic_vad', eagerness: next, create_response: false, interrupt_response: false } } } });
      return true;
    } catch (_e) {
      return false; // best-effort - a dropped connection here fails silently rather than surfacing a user-facing error for a pure latency tuning knob
    }
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
  // Returns a Promise that resolves once this response is done occupying the session - either it
  // actually finished being spoken ('audio_stopped'), or playback was cut short for any reason
  // ('audio_interrupted' - barge-in via interrupt() above, or the SDK's own handling of a
  // disconnect/session replacement mid-speech - or 'error') - not just once the request was sent.
  // Found necessary via real E1 multi-turn testing: the caller serializes voice turns through a
  // queue precisely so two turns are never in flight at once, but speak() itself used to return
  // immediately, so a fast-resolving next turn's own speak() call could fire a second
  // response.create while the first one's audio was still playing - the Realtime API rejects an
  // overlapping response, which surfaced as a transient session error mid-conversation.
  //
  // 'audio_interrupted' was originally missing from this list - only 'audio_stopped'/'error' were
  // watched. A real barge-in (input_audio_buffer.speech_started while ASSISTANT_SPEAKING, above)
  // calls interrupt() -> session.interrupt(), which the SDK surfaces as 'audio_interrupted', not
  // 'audio_stopped' - so an in-flight speak() promise never saw ANY of the events it was actually
  // listening for and sat unsettled for the full 12s fallback on every single barge-in, silently
  // blocking the queue from dispatching the very next (already-finalized, already-waiting) turn
  // for up to 12 real seconds - exactly the failure mode this queue design exists to prevent. The
  // 12s timer remains only as a true last-resort diagnostic safety net for a genuinely lost/
  // never-fired event, not the normal way an interruption gets noticed.
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
        if (pendingSpeakSettle === settle) pendingSpeakSettle = null;
        resolve();
      }
      pendingSpeakSettle = settle;
      activeSession.once('audio_stopped', settle);
      activeSession.once('audio_interrupted', settle);
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
    // Voice Mode performance pass: read-only accessors for the epoch/reconnect bookkeeping above,
    // so the caller (PlaybackController/TurnCoordinator wiring in chatDockView.jsx) can tag its
    // own turns/playback requests and refuse a result tied to a connection that's since been
    // replaced.
    connectionEpoch: function () { return connectionEpoch; },
    reconnectAttempt: function () { return reconnectAttempt; },
    // Dynamic VAD: setEagerness() requests a change (live session.update if connected, applied at
    // the next mint otherwise); currentEagerness() reports what was last REQUESTED, not
    // necessarily server-confirmed - the real, server-acknowledged value is verified separately
    // via the 'session.updated' handling in onTransportEvent() above (debugState().
    // effectiveTurnDetection), never assumed from what was merely sent.
    setEagerness: setEagerness,
    currentEagerness: function () { return currentEagerness; },
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
