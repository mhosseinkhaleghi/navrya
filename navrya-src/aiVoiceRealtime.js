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
// fix/voice-mode-turn-ux: the raw WebRTC output-buffer lifecycle - grounded directly against the
// installed SDK's own source (node_modules/@openai/agents-realtime/dist/openaiRealtimeBase.mjs):
// the high-level `audio_stopped` RealtimeSession event is derived ONLY from the raw
// `response.output_audio.done` message (generation-complete, not playback-complete - WebRTC may
// still have buffered audio audibly playing after it). These three raw events are the real
// browser-side playback lifecycle instead, and (verified against openaiRealtimeEvents.mjs's own
// zod schemas) are NOT specially handled by the SDK - they flow through unmodified via
// RealtimeSession's own `'*'` -> `transport_event` relay, which is what onTransportEvent below
// already listens to. `output_audio_buffer.started`/`.stopped` use `.passthrough()` schemas (a
// `response_id` MAY be present if the server sends one); `.cleared` is a strict schema with no
// such field at all - never assume it exists on any of the three.
var TRANSPORT_OUTPUT_AUDIO_BUFFER_STARTED = 'output_audio_buffer.started';
var TRANSPORT_OUTPUT_AUDIO_BUFFER_STOPPED = 'output_audio_buffer.stopped';
var TRANSPORT_OUTPUT_AUDIO_BUFFER_CLEARED = 'output_audio_buffer.cleared';
// Raw response-lifecycle/manual-turn-finish events (fix/voice-mode-turn-ux) - also plain
// transport_event passthroughs, never specially parsed by the SDK.
var TRANSPORT_RESPONSE_CREATED = 'response.created';
var TRANSPORT_INPUT_AUDIO_BUFFER_COMMITTED = 'input_audio_buffer.committed';

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
// fix/voice-mode-turn-ux (Part D, "End message"): bounds a manual input_audio_buffer.commit round
// trip (client commit -> server input_audio_buffer.committed ack). Deliberately much shorter than
// CONNECT_TIMEOUT_MS/the 12s speak() fallback - this is a same-connection, already-open-data-
// channel client/server ack, not a fresh negotiation or a full model generation.
var MANUAL_FINISH_TIMEOUT_MS = 6000;

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

// fix/voice-mode-turn-ux (Part D req #12): a manual input_audio_buffer.commit can lose a genuine
// race against the server's own semantic-VAD auto-commit for the exact same turn (the user
// stopped talking a moment before the click; the server already committed and started
// transcribing by the time our own commit request arrives, so it targets an already-empty
// buffer). OpenAI's Realtime API surfaces this as a real error event - matched here by pattern
// (code/message/type mentioning both "commit" and "empty"), since no live API access was
// available in this pass to capture the exact literal error code - documented as a best-effort
// heuristic rather than an assumed-exact string match, the same posture classifySdpFailureStage()
// above already takes for a different SDK-shape uncertainty.
function looksLikeEmptyBufferCommitError(error) {
  var text = String((error && (error.code || error.type || error.message)) || '').toLowerCase();
  return text.indexOf('commit') !== -1 && text.indexOf('empty') !== -1;
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
  // ElevenLabs voice-provider follow-up: injected the same way fetchSession is (this module keeps
  // zero knowledge of the real HTTP endpoint - see this file's own header comment) - async
  // (language, text) => {fallback:true, reason} | {fallback:false, audioBase64, mimeType}. Optional:
  // a caller that never supplies this simply always uses the existing OpenAI speak path, exactly
  // the previous behavior.
  var fetchSpeakAudio = options && options.fetchSpeakAudio;
  var language = (options && options.language) || 'en';
  // fix/voice-mode-turn-ux: this module still owns NO business/playback-queue logic of its own
  // (unchanged architecture, see this file's own header comment) - these three are pure relays so
  // the caller's PlaybackController (public/pages/shared/ai-voice-playback-controller.js) can be
  // the one place a real interruption is decided and real-audio-lifecycle state is tracked.
  // `onOutputAudioBufferEvent(type, responseId)` relays the three raw output_audio_buffer.* events
  // verbatim; `onResponseCreated(responseId)` relays the real server response id (opportunistic -
  // see PlaybackController's own comment on why this is never the sole correlation mechanism);
  // `onBargeIn()` fires when a real barge-in is detected (speech started while the assistant was
  // genuinely speaking) - the caller is expected to route this straight into
  // PlaybackController.interrupt(), never call this module's own transport-level interrupt()
  // directly (that direct-call bypass was the original Part B bug).
  var onOutputAudioBufferEvent = (options && options.onOutputAudioBufferEvent) || function () {};
  var onResponseCreated = (options && options.onResponseCreated) || function () {};
  var onBargeIn = (options && options.onBargeIn) || function () {};

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

  // ElevenLabs voice-provider follow-up: which engine speaks assistant replies for the CURRENT
  // session, decided server-side (server/pattern-ai-server.mjs's mintRealtimeClientSecret()) and
  // read fresh from creds.ttsProvider/creds.elevenLabs at the end of every connect() (initial and
  // reconnect alike) - never decided client-side. OpenAI remains the sole conversation brain
  // (VAD/STT/reasoning) regardless of this value; it only changes which transport speak() uses to
  // render NAVRYA's already-decided reply text to audio (see this file's own header comment).
  var currentTtsProvider = 'openai';
  var currentElevenLabsVoice = null; // {voiceId, modelId} or null - never the API key itself
  // A plain <audio> element, deliberately NOT the WebRTC transport's own `audioEl` (that one is
  // owned by OpenAIRealtimeWebRTC and only ever carries realtime model audio) - ElevenLabs speech
  // is fetched as a same-origin HTTP response (POST /api/ai/voice/speak) and played back through
  // this separate element instead. Lazily created on first use, reused across turns/reconnects,
  // torn down alongside everything else in teardownTransport().
  var elevenLabsAudioEl = null;
  // Non-null only while ElevenLabs audio is actually playing right now - the ONE thing interrupt()
  // needs to stop immediately on a real barge-in/"Stop reply", since this audio is entirely outside
  // the OpenAI session's own transport-level interrupt() and would otherwise keep playing straight
  // through a cancellation. Cleared the instant it's used or the entry settles for any other reason.
  var elevenLabsStopFn = null;

  // Journey H2, Gate 3 (Conversation Studio voice asset pipeline): a THIRD, dedicated <audio>
  // element for pre-generated, admin-approved published audio - deliberately never sharing
  // elevenLabsAudioEl above, even though both play same-origin audio outside the WebRTC transport.
  // Keeping them separate means a stale ElevenLabs teardown can never race a published-audio
  // playback's own src/currentTime, and diagnostics (audioDiagnostics()) can tell the two apart.
  var publishedAudioEl = null;
  // Same role as elevenLabsStopFn, for whichever published-audio playback is active right now -
  // interrupt()/teardownTransport() stop both unconditionally, regardless of which one (if either)
  // is actually playing.
  var publishedAudioStopFn = null;

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

  // fix/voice-mode-turn-ux (Part D, "End message"): the item id VAD's own speech_started most
  // recently reported - the one real, live signal finishUserTurn() uses to know a genuine active
  // user utterance actually exists to finish. Not required to equal whatever item id the eventual
  // input_audio_buffer.committed response reports (see that handler's own comment - the two can
  // legitimately differ).
  var activeSpeechItemId = null;
  // Non-null only while a manual finishUserTurn() commit is awaiting its server ack/transcript.
  // {clientEventId, committedItemId, timeoutTimer} - see finishUserTurn()/clearPendingManualFinish()
  // below for the full state machine.
  var pendingManualFinish = null;
  var manualFinishCounter = 0;
  // True only while THIS module has temporarily disabled the outbound mic track for a manual
  // finish in flight (Part D req #16) - deliberately never the same flag as `isMuted` (the user's
  // own real, visible preference), and always restored to `!isMuted` (whatever that preference
  // currently is, even if the user toggled it during the hold) once cleared.
  var micHeldForManualFinish = false;
  // Grace window after a manual finish was last cleared (success OR the race path below) during
  // which a late-arriving empty-buffer-commit error is still recognized as belonging to that same
  // activation - see the 'error' listener's own comment for why this is needed in addition to
  // checking pendingManualFinish itself (the transcription-completed path can legitimately clear
  // pendingManualFinish BEFORE this module's own now-superfluous commit request's error response
  // arrives, since only one user turn is ever in flight and finishUserTurn() is the only place in
  // this codebase that ever sends input_audio_buffer.commit at all).
  var lastManualFinishClearedAt = 0;

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

  // fix/voice-mode-turn-ux (Part A): the ONE place `state` is ever moved OUT of ASSISTANT_SPEAKING/
  // INTERRUPTED back to LISTENING - called by the caller's PlaybackController the moment it has
  // genuinely settled the currently-speaking entry (a real output_audio_buffer.stopped/.cleared, an
  // interrupt, an error, or - last resort - its own bounded watchdog fallback; see that module's
  // own comment). Guarded so a delayed/stale settlement can never clobber a state the user has
  // since, for real, moved on to (USER_SPEAKING from a fresh barge-in, PROCESSING from a manual
  // finish, RECONNECTING/ERROR from a real connection problem) - task requirement: a stale event
  // must never overwrite USER_SPEAKING or PROCESSING.
  function markPlaybackEnded() {
    if (state === VOICE_STATES.ASSISTANT_SPEAKING || state === VOICE_STATES.INTERRUPTED) setState(VOICE_STATES.LISTENING);
  }

  function holdMicForManualFinish() {
    if (micHeldForManualFinish || !mediaStream) return;
    micHeldForManualFinish = true;
    mediaStream.getAudioTracks().forEach(function (track) { track.enabled = false; });
  }
  // Always restores to `!isMuted` - the user's REAL, current mute preference at the moment this
  // runs, even if they toggled mute while the hold was active (mute()'s own session.mute() call
  // already won in the meantime, exactly as it should; this is a safety re-assertion, never a
  // second source of truth for mute state).
  function releaseMicHold() {
    if (!micHeldForManualFinish) return;
    micHeldForManualFinish = false;
    if (mediaStream) mediaStream.getAudioTracks().forEach(function (track) { track.enabled = !isMuted; });
  }

  function clearPendingManualFinish() {
    if (!pendingManualFinish) return;
    if (pendingManualFinish.timeoutTimer) clearTimeout(pendingManualFinish.timeoutTimer);
    pendingManualFinish = null;
    lastManualFinishClearedAt = Date.now();
    releaseMicHold();
  }
  var EMPTY_BUFFER_COMMIT_ERROR_GRACE_MS = 2000;

  function onTransportEvent(event) {
    if (!event || typeof event.type !== 'string') return;
    recentEventTypes.push(event.type);
    if (recentEventTypes.length > 12) recentEventTypes.shift();
    if (event.type === TRANSPORT_TRANSCRIPTION_COMPLETED) {
      var itemId = event.item_id;
      var transcript = String(event.transcript || '').trim();
      // fix/voice-mode-turn-ux (Part D): a manual finishUserTurn() is resolved the instant ANY
      // finalized transcription arrives while one is pending - this app only ever has one user
      // turn in flight at a time (TurnCoordinator/PlaybackController both serialize strictly), so
      // there is no other transcript this could legitimately belong to. Resolved unconditionally
      // (not gated on matching pendingManualFinish.committedItemId to this event's itemId) since a
      // real committed item id is only ever a best-effort correlation aid, never a hard
      // requirement - see finishUserTurn()'s own comment. Existing dedup (handledItemIds) below is
      // completely untouched either way.
      if (pendingManualFinish) clearPendingManualFinish();
      if (!transcript || (itemId && handledItemIds[itemId])) return;
      if (itemId) handledItemIds[itemId] = true;
      activeSpeechItemId = null;
      // ABSOLUTE rule (Journey E spec): only a finalized transcript may ever reach NAVRYA's
      // state. Interim/delta transcripts are never listened to here at all.
      setState(VOICE_STATES.PROCESSING);
      onFinalTranscript(transcript, { itemId: itemId || null });
      return;
    }
    if (event.type === TRANSPORT_SPEECH_STARTED) {
      activeSpeechItemId = event.item_id || null;
      // State moves to USER_SPEAKING FIRST, before onBargeIn() runs - onBargeIn() synchronously
      // drives the caller's PlaybackController.interrupt(), which synchronously settles the
      // currently-speaking entry and (via markPlaybackEnded()) would otherwise try to move state
      // back to LISTENING; doing this in the other order would mean brand-new USER_SPEAKING gets
      // transiently written, then immediately overwritten by that settlement's own LISTENING
      // transition, before finally being overwritten again by this function's own USER_SPEAKING -
      // the end result is the same, but reordering avoids that confusing double-write entirely
      // (markPlaybackEnded()'s own guard already can't fire once state genuinely is USER_SPEAKING).
      var wasAssistantSpeaking = state === VOICE_STATES.ASSISTANT_SPEAKING;
      setState(VOICE_STATES.USER_SPEAKING);
      // Routes through the caller's own PlaybackController - never this module's own transport-
      // level interrupt() directly (that direct call bypassing the queue was the original Part B
      // bug). The caller (chatDockView.jsx) wires onBargeIn straight to
      // playbackController.interrupt(), which itself calls back into this module's interrupt()
      // exactly once, settles the current entry locally/immediately, and drops the queue.
      if (wasAssistantSpeaking) onBargeIn();
      return;
    }
    if (event.type === TRANSPORT_SPEECH_STOPPED) {
      if (state === VOICE_STATES.USER_SPEAKING) setState(VOICE_STATES.LISTENING);
      return;
    }
    if (event.type === TRANSPORT_OUTPUT_AUDIO_BUFFER_STARTED || event.type === TRANSPORT_OUTPUT_AUDIO_BUFFER_STOPPED || event.type === TRANSPORT_OUTPUT_AUDIO_BUFFER_CLEARED) {
      // Pure relay - PlaybackController (public/pages/shared/ai-voice-playback-controller.js) is
      // the one place that decides what a real output-audio-buffer lifecycle event means for
      // playback/caption/state. `response_id` is read defensively (verified against the SDK's own
      // schemas: present on started/stopped only via passthrough, never on cleared) - see this
      // file's own header comment.
      onOutputAudioBufferEvent(event.type, event.response_id || null);
      return;
    }
    if (event.type === TRANSPORT_RESPONSE_CREATED) {
      var createdResponseId = event.response && event.response.id;
      if (createdResponseId) onResponseCreated(createdResponseId);
      return;
    }
    if (event.type === TRANSPORT_INPUT_AUDIO_BUFFER_COMMITTED) {
      // fix/voice-mode-turn-ux (Part D req #9): bind whatever item id the server actually reports
      // to the pending manual finish, WITHOUT requiring it to equal activeSpeechItemId (the
      // provisional id speech_started reported) - grounded in the installed SDK's own
      // input_audio_buffer.committed schema, which carries no field correlating it back to a
      // specific client-sent commit event id at all; the server's item id is simply authoritative.
      // Only ever binds once per pending manual finish (a second/duplicate committed event, or one
      // with no pending manual finish at all, is a harmless no-op here).
      if (pendingManualFinish && !pendingManualFinish.committedItemId) {
        pendingManualFinish.committedItemId = event.item_id || null;
      }
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
    // fix/voice-mode-turn-ux (Part D req #14): a manual finish awaiting its server ack can never
    // meaningfully resolve once the transport it was sent over is gone - clear it (and release any
    // mic hold) BEFORE the tracks it might still reference are stopped below, on every real
    // teardown path (a genuine disconnect() and a reconnect about to retry both call this).
    clearPendingManualFinish();
    activeSpeechItemId = null;
    if (session) { try { session.close(); } catch (_e) { /* already closed */ } session = null; }
    transport = null;
    if (mediaStream) { mediaStream.getTracks().forEach(function (track) { track.stop(); }); mediaStream = null; }
    audioEl = null;
    // ElevenLabs voice-provider follow-up: a torn-down session (disconnect(), or a reconnect about
    // to retry) must never leave ElevenLabs audio audibly playing on into it - that audio lives
    // entirely outside session.close() above (it was never part of the WebRTC transport), so it
    // needs its own explicit stop here. elevenLabsStopFn (non-null only while actually playing)
    // both halts playback and settles the in-flight speak() promise; pendingSpeakSettle below is
    // still the fallback for the (impossible once this runs, but defensive) case it was already null.
    if (elevenLabsStopFn) { var stopEl = elevenLabsStopFn; elevenLabsStopFn = null; stopEl(); }
    // Journey H2, Gate 3: same requirement, same shape, for published-audio playback - a
    // torn-down session must never leave a pre-generated clip audibly playing into it either.
    if (publishedAudioStopFn) { var stopPub = publishedAudioStopFn; publishedAudioStopFn = null; stopPub(); }
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
      // ElevenLabs voice-provider follow-up: read fresh from every mint (initial connect AND
      // reconnect) - an admin can change/disable a language's config between the two, and the
      // reconnected session must speak according to whatever is configured NOW, not whatever was
      // true when the dock first mounted.
      currentTtsProvider = creds.ttsProvider === 'elevenlabs' ? 'elevenlabs' : 'openai';
      currentElevenLabsVoice = creds.elevenLabs || null;
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
      // fix/voice-mode-turn-ux (Part A): neither 'audio_start' nor 'audio_stopped' drives `state`
      // any more - both are derived by the SDK from response-generation-lifecycle events
      // (response.output_audio.done for audio_stopped - verified against
      // node_modules/@openai/agents-realtime/dist/openaiRealtimeBase.mjs), not from real WebRTC
      // playback-buffer state. speak() below still sets ASSISTANT_SPEAKING immediately at call
      // time (an intentional, optimistic "about to speak" signal); the real exit back to LISTENING
      // now only ever happens through markPlaybackEnded(), driven by the caller's PlaybackController
      // once it has observed a genuine output_audio_buffer.stopped/.cleared (see onTransportEvent's
      // own TRANSPORT_OUTPUT_AUDIO_BUFFER_* handling) or settled the entry for any other real
      // reason (interrupt/error/its own bounded watchdog). 'audio_interrupted' is kept only as a
      // defensive, already-guarded call into the SAME function - by the time this SDK-level event
      // could arrive, PlaybackController's own synchronous interrupt() path has almost always
      // already settled things (see that module's own comment on why it never waits for this
      // event); this is a harmless no-op in the ordinary case, not a second source of truth.
      session.on('audio_interrupted', function () { if (myEpoch === connectionEpoch) markPlaybackEnded(); });
      session.on('error', function (e) {
        if (myEpoch !== connectionEpoch) return;
        // fix/voice-mode-turn-ux (Part D req #12): a manual finishUserTurn() commit losing a real
        // race against the server's own VAD auto-commit for the same turn surfaces as exactly this
        // kind of error. finishUserTurn() is the only place in this codebase that ever sends
        // input_audio_buffer.commit, so this specific error shape is - by construction - always a
        // response to a manual finish attempt; it is only ever swallowed as recoverable, though,
        // when there is real evidence the auto path is already handling this same turn: either a
        // committed ack is already bound to the still-pending manual finish, or a manual finish was
        // resolved (via that same real transcript arriving) within the last
        // EMPTY_BUFFER_COMMIT_ERROR_GRACE_MS - not merely because a manual finish was attempted at
        // some unbounded point in the past. Any other error shape always falls through to the
        // existing, unchanged generic session-error handling below - never silently swallowed.
        var withinManualFinishGrace = (Date.now() - lastManualFinishClearedAt) < EMPTY_BUFFER_COMMIT_ERROR_GRACE_MS;
        var manualFinishRaceEvidence = (pendingManualFinish && pendingManualFinish.committedItemId) || withinManualFinishGrace;
        if (manualFinishRaceEvidence && looksLikeEmptyBufferCommitError(e && e.error)) {
          // Deliberately never touches `state` here - if the real auto-committed transcript is (or
          // already has been) delivered through the normal onFinalTranscript pipeline, that path
          // alone already owns every state transition from here on (still PROCESSING while it's in
          // flight, or further along already); forcing LISTENING here could wrongly clobber a
          // turn that is genuinely still being handled. The bounded finishUserTurn() timeout is
          // what recovers state if, despite this evidence, no transcript genuinely ever arrives.
          clearPendingManualFinish();
          return;
        }
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
  //
  // fix/voice-mode-turn-ux (Part B): this is now PURELY the transport-level action (send
  // response.cancel + output_audio_buffer.clear, via the installed SDK's own session.interrupt())
  // - it no longer touches `state` itself. The caller's PlaybackController is the one place a real
  // interruption is decided and the currently-speaking entry is settled; this function is only
  // ever invoked as PlaybackController's own injected `interrupt` callback (see chatDockView.jsx's
  // wiring), never called directly by anything else in this module or its caller any more - the
  // direct-call bypass that used to leave PlaybackController's own queue/current entry untouched
  // was the original bug this fix addresses. markPlaybackEnded() (driven by PlaybackController's
  // own onSettled, itself already synchronous with this call) is what moves `state` back to
  // LISTENING when appropriate.
  function interrupt() {
    // ElevenLabs voice-provider follow-up: stop first, unconditionally - this audio is entirely
    // outside the OpenAI session below, so session.interrupt() alone would never touch it, and a
    // barge-in must cancel whichever engine is actually speaking (mission requirement: "Barge-in
    // must immediately cancel/stop/settle"). A no-op when nothing ElevenLabs is currently playing,
    // exactly like session.interrupt() itself already safely no-ops when nothing is active.
    if (elevenLabsStopFn) { var stopEl = elevenLabsStopFn; elevenLabsStopFn = null; stopEl(); }
    // Journey H2, Gate 3: published-audio playback is likewise entirely outside the OpenAI
    // session below - a barge-in during a pre-generated clip must stop it exactly as immediately
    // as it would ElevenLabs or the Realtime model's own speech. No-ops when nothing is playing.
    if (publishedAudioStopFn) { var stopPub = publishedAudioStopFn; publishedAudioStopFn = null; stopPub(); }
    if (!session) return;
    try {
      session.interrupt();
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
  // ('audio_interrupted' - a barge-in or "Stop reply", both now routed through PlaybackController
  // which calls this module's own guarded interrupt() -> session.interrupt(), or the SDK's own
  // handling of a disconnect/session replacement mid-speech - or 'error') - not just once the
  // request was sent. fix/voice-mode-turn-ux: this remains a genuine safety-net fallback only -
  // PlaybackController's own generation-tracked settlement (driven by real
  // output_audio_buffer.stopped/.cleared or its own synchronous interrupt()) is the PRIMARY
  // settlement path now; see that module's own comment.
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
  // ElevenLabs voice-provider follow-up: the OpenAI Realtime path, unchanged in every particular
  // (same instructions template, same 12s last-resort watchdog, same audio_stopped/audio_interrupted/
  // error settlement) - only renamed and split out of speak() so it can also serve as the
  // exactly-once fallback target from speakViaElevenLabs() below (mission requirement: a fallback
  // must use "the same text, only once, never duplicated").
  function speakViaOpenAI(text) {
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

  // ElevenLabs voice-provider follow-up: plays a same-origin-fetched audio response through a
  // plain <audio> element (never the WebRTC transport). Relays synthetic output_audio_buffer.*
  // events through the exact same onOutputAudioBufferEvent callback the real WebRTC path uses
  // (event.type strings match verbatim) - PlaybackController
  // (public/pages/shared/ai-voice-playback-controller.js) does not know or care which transport
  // produced them, so captions (onAudioStart, fired from .started) and settlement (from .stopped/
  // .cleared) both keep working unmodified. `responseId` is always null here (there is no OpenAI
  // response for this turn at all) - notifyAudioBufferStarted/Stopped/Cleared already treat a null
  // id as "always matches" (opportunistic correlation only, see that module's own comment).
  function playElevenLabsAudio(result, myEpoch) {
    if (!elevenLabsAudioEl) elevenLabsAudioEl = document.createElement('audio');
    var el = elevenLabsAudioEl;
    el.src = 'data:' + (result.mimeType || 'audio/mpeg') + ';base64,' + result.audioBase64;
    return new Promise(function (resolve) {
      var settled = false;
      // Same 12s last-resort safety net as speakViaOpenAI's own watchdog - a genuinely stuck/never-
      // firing 'ended'/'error' event must never block the playback queue forever.
      var timer = setTimeout(function () { settle(false); }, 12000);
      function settle(natural) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        el.removeEventListener('ended', onEnded);
        el.removeEventListener('error', onPlaybackError);
        if (pendingSpeakSettle === settleFromTeardown) pendingSpeakSettle = null;
        if (elevenLabsStopFn === stopNow) elevenLabsStopFn = null;
        if (myEpoch === connectionEpoch) {
          onOutputAudioBufferEvent(natural ? TRANSPORT_OUTPUT_AUDIO_BUFFER_STOPPED : TRANSPORT_OUTPUT_AUDIO_BUFFER_CLEARED, null);
        }
        resolve();
      }
      function onEnded() { settle(true); }
      // A real decode/network error mid-playback still must not leave the entry unsettled - not a
      // fatal Voice Mode error (the reply text itself is already correct; only its audio failed),
      // so this resolves the same as a natural stop rather than routing through onError()/ERROR state.
      function onPlaybackError() { settle(true); }
      function stopNow() { try { el.pause(); el.currentTime = 0; } catch (_e) { /* best-effort */ } settle(false); }
      el.addEventListener('ended', onEnded);
      el.addEventListener('error', onPlaybackError);
      // disconnect()/teardownTransport() settles an in-flight entry directly (see that function's
      // own comment) - registered as the SAME stop function interrupt()/teardown call, so a
      // mid-playback teardown both silences the audio and settles this promise in one call.
      function settleFromTeardown() { stopNow(); }
      pendingSpeakSettle = settleFromTeardown;
      elevenLabsStopFn = stopNow;
      var playPromise = el.play();
      var reportStarted = function () { if (myEpoch === connectionEpoch && elevenLabsStopFn === stopNow) onOutputAudioBufferEvent(TRANSPORT_OUTPUT_AUDIO_BUFFER_STARTED, null); };
      if (playPromise && typeof playPromise.then === 'function') {
        // A play() rejection (e.g. browser autoplay policy) still must not leave this unsettled -
        // treated as a finished (non-fatal) turn, same posture as onPlaybackError above.
        playPromise.then(reportStarted).catch(function () { settle(true); });
      } else {
        reportStarted();
      }
    });
  }

  // ElevenLabs voice-provider follow-up: fetches this turn's audio from the server-side adapter
  // (POST /api/ai/voice/speak, injected via fetchSpeakAudio - key stays server-side always) and
  // plays it, falling back to the existing OpenAI voice path EXACTLY ONCE, with the SAME text, on
  // any non-success outcome (`{fallback:true}` from the endpoint itself - never an HTTP error for
  // an ordinary fallback condition, see that route's own comment - or a network/parse failure on
  // the request). Never both engines speak the same reply (mission: "Never two audio outputs for
  // one response").
  function speakViaElevenLabs(text) {
    setState(VOICE_STATES.ASSISTANT_SPEAKING);
    var myEpoch = connectionEpoch;
    return Promise.resolve().then(function () {
      return fetchSpeakAudio(language, text);
    }).then(function (result) {
      if (myEpoch !== connectionEpoch) return; // superseded mid-fetch - never play stale audio into a torn-down/superseded session
      if (!result || result.fallback) return speakViaOpenAI(text);
      return playElevenLabsAudio(result, myEpoch);
    }, function () {
      // The fetch/parse itself failed (network error, non-2xx, malformed JSON) - same exactly-once
      // fallback contract as an explicit {fallback:true} response.
      if (myEpoch !== connectionEpoch) return;
      return speakViaOpenAI(text);
    });
  }

  function speak(text) {
    if (!session || !text) return Promise.resolve();
    if (currentTtsProvider === 'elevenlabs' && currentElevenLabsVoice && typeof fetchSpeakAudio === 'function') {
      return speakViaElevenLabs(text);
    }
    return speakViaOpenAI(text);
  }

  // Journey H2, Gate 3 (Conversation Studio voice asset pipeline): plays a single pre-generated,
  // admin-approved audio file for a Voice turn that matched a static scenario with approved audio.
  // Called DIRECTLY by the caller's PlaybackController (ai-voice-playback-controller.js) instead of
  // speak() - never through it, and never reached at all unless PlaybackController's own entry
  // actually carries an audioUrl. Deliberately does not require a live `session` (unlike speak()'s
  // own guard) - published audio plays independently of the OpenAI Realtime transport, exactly like
  // ElevenLabs playback already does.
  //
  // Unlike playElevenLabsAudio() above, this never relays synthetic output_audio_buffer.* events -
  // PlaybackController already fires its own onAudioStart optimistically for an audioUrl entry (see
  // that module's own comment) since there is no separate raw event a static file could ever emit;
  // this function's only job is to actually play the audio and report success/failure back through
  // its returned Promise.
  //
  // Settlement contract (deliberately DIFFERENT from playElevenLabsAudio, which never rejects): a
  // natural 'ended' resolves; a real playback failure (missing/corrupt file, decode error, a 12s
  // stall, or a rejected play() - e.g. an autoplay-policy block) REJECTS. PlaybackController's own
  // .catch() is what falls back to the normal dynamic TTS engine for this exact, already-known text
  // (spec section 30/31) - this function itself never re-runs any business logic, it only ever
  // changes how the one already-decided reply gets spoken. A mid-playback stop from
  // interrupt()/teardownTransport() always resolves instead - by the time that settles,
  // PlaybackController has already synchronously settled the entry itself (interrupted/skipped), so
  // this promise's own outcome is moot either way (see that module's settleOnce() idempotency
  // guard) - resolving simply avoids a pointless, unwanted fallback-to-TTS attempt on an
  // intentional stop, which is not a broken file.
  function playAudioUrl(url) {
    if (!url) return Promise.resolve();
    setState(VOICE_STATES.ASSISTANT_SPEAKING);
    if (!publishedAudioEl) publishedAudioEl = document.createElement('audio');
    var el = publishedAudioEl;
    el.src = url;
    return new Promise(function (resolve, reject) {
      var settled = false;
      // Same 12s last-resort safety net as every other playback path in this file - a genuinely
      // stuck/never-firing 'ended'/'error' event must never block the playback queue forever.
      var timer = setTimeout(function () { settle(false); }, 12000);
      function settle(ok) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        el.removeEventListener('ended', onEnded);
        el.removeEventListener('error', onPlaybackError);
        if (publishedAudioStopFn === stopNow) publishedAudioStopFn = null;
        if (ok) resolve(); else reject(new Error('published audio playback failed'));
      }
      function onEnded() { settle(true); }
      function onPlaybackError() { settle(false); }
      function stopNow() { try { el.pause(); el.currentTime = 0; } catch (_e) { /* best-effort */ } settle(true); }
      el.addEventListener('ended', onEnded);
      el.addEventListener('error', onPlaybackError);
      publishedAudioStopFn = stopNow;
      var playPromise = el.play();
      if (playPromise && typeof playPromise.then === 'function') {
        // A play() rejection (e.g. browser autoplay policy) is a genuine failure here - unlike
        // playElevenLabsAudio's own posture (nothing further to fall back to at that point), this
        // path DOES have a further fallback available (PlaybackController's own .catch()), so it
        // must reject rather than silently treat a never-started clip as a finished turn.
        playPromise.catch(function () { settle(false); });
      }
    });
  }

  function setLanguage(nextLanguage) { language = nextLanguage || 'en'; }

  // fix/voice-mode-turn-ux (Part D): "End message" - finalizes ONLY the user's current spoken
  // utterance early (a manual input_audio_buffer.commit), never the whole Voice session/
  // conversation. Sends exactly one raw client event through the already-open transport and
  // nothing else - no response.create (NAVRYA's own TurnCoordinator/business pipeline, reached the
  // normal way once the resulting transcript arrives via TRANSPORT_TRANSCRIPTION_COMPLETED above,
  // remains the sole source of the assistant's actual reply). The session's own
  // semantic_vad/create_response:false/interrupt_response:false configuration (server/pattern-ai-
  // server.mjs's mintRealtimeClientSecret(), untouched by this function) is completely unaffected -
  // this only ever asks the server to close out the CURRENT buffer early, exactly what the server
  // itself would eventually do on its own via VAD silence detection.
  function finishUserTurn() {
    if (!session) return false;
    if (state !== VOICE_STATES.USER_SPEAKING) return false;
    if (pendingManualFinish) return false; // already in flight - no double-submit
    if (!activeSpeechItemId) return false; // no real active utterance to finish
    var myEpoch = connectionEpoch;
    manualFinishCounter += 1;
    var clientEventId = 'manual-commit-' + myEpoch + '-' + manualFinishCounter + '-' + Date.now();
    try {
      session.transport.sendEvent({ type: 'input_audio_buffer.commit', event_id: clientEventId });
    } catch (sendError) {
      onError({ code: transportErrorCode(sendError), stage: 'manual_finish' });
      return false;
    }
    pendingManualFinish = { clientEventId: clientEventId, committedItemId: null, timeoutTimer: null };
    holdMicForManualFinish();
    // Immediately signals "ending current message" (task requirement) and structurally prevents a
    // repeated click - the precondition check above already rejects a second finishUserTurn() call
    // while pendingManualFinish/state !== USER_SPEAKING.
    setState(VOICE_STATES.PROCESSING);
    pendingManualFinish.timeoutTimer = setTimeout(function () {
      if (myEpoch !== connectionEpoch || !pendingManualFinish) return;
      clearPendingManualFinish();
      if (state === VOICE_STATES.PROCESSING) setState(VOICE_STATES.LISTENING);
      onError({ code: 'VOICE_MANUAL_FINISH_TIMEOUT', stage: 'manual_finish' });
    }, MANUAL_FINISH_TIMEOUT_MS);
    return true;
  }

  // Clears any in-flight manual finish without waiting for its own timeout - used by the caller on
  // New Chat/conversation switch (chatDockView.jsx), on top of the automatic clearing this module
  // already does on its own reconnect/disconnect/epoch-change paths (see teardownTransport()).
  function cancelManualFinish() { clearPendingManualFinish(); }

  return {
    connect: connect,
    disconnect: disconnect,
    mute: mute,
    interrupt: interrupt,
    speak: speak,
    // Journey H2, Gate 3: exported for chatDockView.jsx to pass straight into
    // PlaybackController.create({ playAudioUrl: voiceRef.current.playAudioUrl, ... }) - see
    // playAudioUrl()'s own comment for the full contract.
    playAudioUrl: playAudioUrl,
    setLanguage: setLanguage,
    // fix/voice-mode-turn-ux: called by the caller's PlaybackController.onSettled (Part A/B) once
    // it has genuinely settled the currently-speaking entry, for any reason - moves `state` back
    // to LISTENING only if it is still ASSISTANT_SPEAKING/INTERRUPTED (see this function's own
    // comment on why a stale settlement must never clobber a real, newer state).
    markPlaybackEnded: markPlaybackEnded,
    // fix/voice-mode-turn-ux (Part D, "End message"): finishes only the current user utterance -
    // see finishUserTurn()'s own comment for the full precondition/state-machine contract.
    finishUserTurn: finishUserTurn,
    cancelManualFinish: cancelManualFinish,
    hasPendingManualFinish: function () { return !!pendingManualFinish; },
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
