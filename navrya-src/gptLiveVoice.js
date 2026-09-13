import { VOICE_STATES } from './aiVoiceRealtime.js';

// GPT-Live 1 - NAVRYA's sole OpenAI Voice Mode transport (OpenAI Realtime is retired; see
// docs/ai/voice-architecture.md's GPT-Live section for the full retirement record). Same "one
// brain, not two conversations" contract every other transport already has: this module is pure
// transport. It never imports or calls anything from the Action Registry/Workflow Engine/
// Proactive Engine, holds zero tools of its own, and never decides/answers/acts. Client delegation
// (`delegation: {type:'client'}`, set server-side at mint time - see
// server/pattern-ai-server.mjs's mintGptLiveClientSecret()) is the mechanism that keeps GPT-Live
// from ever reasoning on its own.
//
// PROTOCOL CORRECTION (this pass): an earlier version of this module guessed a WebSocket
// connection with manually base64-encoded PCM audio chunks, by analogy to the Gemini Live adapter.
// That guess was wrong for the browser case. OpenAI's own documentation, fetched and quoted
// verbatim this pass (developers.openai.com/api/docs/models/gpt-live-1 and
// .../guides/voice-webrtc?api=live), states plainly: "WebRTC for browser voice applications. Media
// tracks carry audio; a data channel carries JSON events." Browser audio is therefore real,
// continuous WebRTC media (mic track sent via RTCPeerConnection.addTrack, remote audio received
// via RTCPeerConnection.ontrack and played through a plain <audio> element) - never a discrete
// base64-JSON chunk stream, and there is no audio sample rate for this module to pick or guess at
// all (WebRTC's own SDP negotiation handles codec/rate). Only JSON control/event messages
// (delegation notifications, transcript fragments, commentary/instruction commands, session
// lifecycle) travel over the data channel, in the same event vocabulary OpenAI's delegation guide
// documents (session.delegation.created, session.commentary.append, session.input_transcript.
// delta, ...) - confirmed to be transport-shape-independent JSON, unlike the audio-carrying events
// (session.input_audio.append / session.output_audio.delta) this module's own earlier version
// wrongly assumed applied here too; those are very likely WebSocket-only (server-side/telephony)
// concepts, per the model page's own sentence above, and are not used by this module at all.
//
// Session creation itself was also corrected: GPT-Live's POST /v1/live/sessions takes the
// browser's own locally-built SDP OFFER directly in the SAME request as the session config
// (`{session: {...}, transport: {type:'webrtc', sdp: offer}}`) and returns the SDP ANSWER directly
// in the response - there is no separate ephemeral-client-secret step the way the (now retired)
// Realtime transport used. server/pattern-ai-server.mjs's mintGptLiveClientSecret() is the only
// party that ever talks to OpenAI for this; the browser never receives an OpenAI credential of any
// kind for this transport.
//
// STILL UNVERIFIED AGAINST A REAL LIVE-API ACCOUNT (flagged here, not silently assumed): the exact
// data-channel label (DATA_CHANNEL_LABEL below is inferred from OpenAI's own adjacent Realtime
// WebRTC example on the same guide page, not confirmed GPT-Live-specific), whether an explicit
// client-sent interrupt/cancel event exists at all (no such event is documented - see interrupt()'s
// own comment for how this module handles "Stop reply" without one), and the exact character
// budget behind commentary.append's documented "500 tokens" limit (COMMENTARY_MAX_CHARS below is a
// deliberately conservative character approximation, never a real token count, since this module
// cannot tokenize client-side). Every place relying on one of these fails loudly on an unexpected
// response/event shape rather than silently guessing further.
const DATA_CHANNEL_LABEL = 'oai-events';
const CONNECT_TIMEOUT_MS = 15000;
// Same bounded-exponential-backoff-with-jitter contract as aiVoiceRealtime.js/geminiLiveVoice.js -
// one shared reconnect policy across every transport, never a bespoke one per file. A WebRTC
// reconnect always rebuilds the whole RTCPeerConnection/data channel/local SDP offer from scratch -
// there is no "resume" primitive for a dropped peer connection.
const RECONNECT_BASE_DELAY_MS = 500;
const RECONNECT_MAX_DELAY_MS = 8000;
const RECONNECT_MAX_ATTEMPTS = 5;
// No terminal "this reply is done speaking" event is documented (the confirmed session-lifecycle
// events are session.started/session.closed/session.usage.updated only - no response.done/
// session.done/"stopped"/"interrupted" event was found in OpenAI's own session-management guide) -
// a short quiet window with no new session.output_transcript.delta is the closest honest analog to
// the other transports' own real playback-boundary signal, applied to the one event stream this
// transport actually confirms exists for a spoken reply.
const OUTPUT_TRANSCRIPT_QUIET_MS = 900;
// Symmetric fix for the INPUT side (see this file's own "TURN-COMPLETION CORRECTION" header
// comment): no documented event marks "the user's utterance is complete" either, and
// session.delegation.created cannot be relied on to fire for every turn. A slightly longer window
// than OUTPUT_TRANSCRIPT_QUIET_MS - people pause mid-sentence while speaking more than a model
// pauses mid-reply, and STT delta delivery itself trails the real audio by some margin - before
// treating the accumulated buffer as a finished utterance and handing it to flushTranscript().
const INPUT_TRANSCRIPT_QUIET_MS = 1200;
// speak() safety timeout (mirrors aiVoiceRealtime.js's own 12s speak() stall fix / Gemini's
// watchdogs): commentary.append has no documented completion ack either, so a lost or never-sent
// reply must never wedge the shared PlaybackController queue forever.
const SPEAK_SAFETY_TIMEOUT_MS = 20000;
// commentary.append is documented as accepting a plain string "limited to 500 tokens per append" -
// a real token count this module cannot compute client-side. Deliberately conservative (assumes as
// few as ~2 characters per token, safe for non-Latin scripts too) rather than guessing a generous
// ratio that could silently exceed the real server-side limit.
const COMMENTARY_MAX_CHARS = 1000;
// Bounds how long disconnect() waits for the documented graceful-close confirmation
// (session.closed, carrying the real usage.seconds) before giving up and tearing down anyway with
// a locally-estimated duration instead - never blocks Voice-end indefinitely on a slow/lost event.
const GRACEFUL_CLOSE_TIMEOUT_MS = 4000;

function errorCode(error) {
  return error && (error.code || (error.name && error.name !== 'Error' ? error.name : '') || error.message) || 'GPT_LIVE_FAILED';
}
function microphoneStage(error) {
  if (error && error.name === 'NotAllowedError') return 'microphone_permission';
  if (error && (error.name === 'NotFoundError' || error.name === 'NotReadableError')) return 'microphone_unavailable';
  return 'microphone_failed';
}

// GPT-Live handles the voice conversation (listening, speaking, full-duplex/interruption) while
// NAVRYA's existing backend (chat-dock-core.js's submit()/dockChat()) keeps owning every decision,
// action, confirmation gate, and reply - client delegation is what makes that split real rather
// than aspirational (see this file's own header comment).
//
// TURN-COMPLETION CORRECTION (production incident, 2026-09-13): the original implementation used
// session.delegation.created as the ONLY signal to flush the accumulated transcript and hand it to
// NAVRYA's backend. Live testing showed Voice could hear and speak but never actually filled a
// form, opened a trade, or ran any workflow step - the transcript never left this module. Re-
// checked against OpenAI's own delegation guide: for client delegation specifically, "delegation
// decisions remain under the model's discretion" and the guide states plainly there is no
// documented mechanism to force it to fire on every turn - it is not a deterministic "user
// finished speaking" event, and no amount of instruction wording can make it one. Fixed the same
// way OUTPUT_TRANSCRIPT_QUIET_MS already covers the symmetric "no completion event exists" gap on
// the reply side: a bounded quiet window with no new session.input_transcript.delta is now the
// PRIMARY, guaranteed trigger that flushes the buffer via flushTranscript() - delegation.created
// (kept below) is only a bonus early-flush path when the model happens to fire it, never the sole
// mechanism a real user's request depends on.
export function createGptLiveSession(options) {
  options = options || {};
  let language = options.language || 'en';
  let state = VOICE_STATES.IDLE;
  let muted = false;
  let mediaStream = null;
  let pc = null;
  let dc = null;
  let audioElement = null;
  let intentionalClose = false;
  let connectionEpoch = 0;
  let reconnectAttempt = 0;
  let reconnectTimer = null;
  let eventCounter = 0;
  function nextEventId() { eventCounter += 1; return 'navrya_' + eventCounter + '_' + Date.now(); }

  // Accumulated fragments for the utterance currently in progress - flushed to exactly one
  // onFinalTranscript() call the moment `session.delegation.created` arrives (the one documented
  // "backend needed now" signal - the closest analog to the other transports' own finalized-
  // transcript event).
  let pendingTranscript = '';
  let currentDelegationId = null;

  // Same activeSpeakToken idiom aiVoiceRealtime.js/geminiLiveVoice.js already use: an output-
  // transcript delta arriving after its own speak() call was superseded (interrupt()/a newer
  // speak()/disconnect()) is silently ignored, never resolved/spoken-over as if it belonged to the
  // current turn.
  let activeSpeakToken = null;
  let pendingSpeakSettle = null;
  let outputTranscriptQuietTimer = null;
  let inputTranscriptQuietTimer = null;
  let speaking = false;
  let walletReservationId = null;
  let connectedAtMs = null;
  // Best-effort running total from session.usage.updated, used only as a fallback if the real
  // session.closed confirmation (which carries its own authoritative usage.seconds) is lost - see
  // disconnect()'s own comment.
  let lastKnownUsageSeconds = null;
  let pendingCloseSettle = null;
  // Resolved the instant the confirmed session.started event arrives during connect(), or rejected
  // if the data channel fails/times out first - see that function's own comment for why the data
  // channel merely opening is not treated as sufficient confirmation on its own.
  let pendingStartSettle = null;
  let pendingStartReject = null;

  const onStateChange = options.onStateChange || function () {};
  const onFinalTranscript = options.onFinalTranscript || function () {};
  const onMuteChange = options.onMuteChange || function () {};
  const onError = options.onError || function () {};
  const onOutputAudioBufferEvent = options.onOutputAudioBufferEvent || function () {};
  const onBargeIn = options.onBargeIn || function () {};
  // fetchSession(language, offerSdp, {signal}) -> {answerSdp, sessionId, walletReservationId} -
  // the browser builds its OWN local SDP offer (see connect() below) before ever calling this; the
  // server never sees this module's internal state, only the offer text and personalization
  // fields already threaded through by chatDockView.jsx.
  const fetchSession = options.fetchSession;
  // Best-effort wallet settlement at Voice-end - see server/pattern-ai-server.mjs's
  // settleGptLiveVoiceSession()'s own comment for the full "never overcharge, only ever release on
  // a lost report" contract. Optional: a caller that doesn't inject this simply never settles
  // (nothing breaks - the reservation still ages out via the existing stale-reservation sweep).
  const fetchSettle = options.fetchSettle;

  function setState(next) { state = next; onStateChange(next); }
  function clearReconnectTimer() { if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; } }
  function clearOutputTranscriptQuietTimer() { if (outputTranscriptQuietTimer) { clearTimeout(outputTranscriptQuietTimer); outputTranscriptQuietTimer = null; } }
  function clearInputTranscriptQuietTimer() { if (inputTranscriptQuietTimer) { clearTimeout(inputTranscriptQuietTimer); inputTranscriptQuietTimer = null; } }

  function wireMicTrackLifecycle(stream, myEpoch) {
    const tracks = stream && typeof stream.getAudioTracks === 'function' ? stream.getAudioTracks() : [];
    tracks.forEach((track) => {
      track.addEventListener('ended', () => {
        if (myEpoch !== connectionEpoch) return;
        if (state === VOICE_STATES.IDLE || state === VOICE_STATES.ERROR) return;
        teardown();
        connectionEpoch += 1;
        clearReconnectTimer();
        reportFailure(Object.assign(new Error('microphone track ended'), { code: 'MICROPHONE_TRACK_ENDED' }), 'microphone_lost');
      });
    });
  }

  function settleSpeak() {
    const settle = pendingSpeakSettle;
    pendingSpeakSettle = null;
    if (settle) settle();
  }
  function stopSpeaking(reasonEvent) {
    clearOutputTranscriptQuietTimer();
    if (speaking) { speaking = false; if (reasonEvent) onOutputAudioBufferEvent(reasonEvent, null); }
  }
  // Local, immediate silence for the "Stop reply" affordance - pausing the real <audio> element is
  // the one thing this module can guarantee synchronously, regardless of whether the model itself
  // ever honors any server-side stop request (see interrupt()'s own comment).
  function pauseLocalAudio() { if (audioElement) { try { audioElement.pause(); } catch (_) {} } }
  function resumeLocalAudio() { if (audioElement) { try { audioElement.play().catch(() => {}); } catch (_) {} } }

  function reportSettlement(usageSeconds) {
    if (!walletReservationId || typeof fetchSettle !== 'function') { walletReservationId = null; connectedAtMs = null; return; }
    // Prefer OpenAI's own authoritative usage.seconds (from the real session.closed/
    // session.usage.updated events) - only fall back to a locally-computed wall-clock estimate
    // when neither ever arrived (a lost event, or a connection that dropped before either could).
    const elapsedSeconds = usageSeconds != null
      ? Math.max(0, Number(usageSeconds) || 0)
      : Math.max(0, connectedAtMs ? Math.round((Date.now() - connectedAtMs) / 1000) : 0);
    const reservationId = walletReservationId;
    walletReservationId = null;
    connectedAtMs = null;
    Promise.resolve(fetchSettle({ reservationId, elapsedSeconds })).catch(() => {}); // fire-and-forget, never blocks teardown
  }

  function teardown() {
    stopSpeaking(null);
    settleSpeak();
    if (pendingCloseSettle) { const settle = pendingCloseSettle; pendingCloseSettle = null; settle(null); }
    // A superseded connect() attempt's own session.started wait (see connect()'s own comment) must
    // never hang forever once this teardown discards the peer connection it was waiting on.
    if (pendingStartReject) { const reject = pendingStartReject; pendingStartSettle = null; pendingStartReject = null; reject(Object.assign(new Error('GPT_LIVE_CONNECT_SUPERSEDED'), { name: 'GPT_LIVE_CONNECT_SUPERSEDED' })); }
    clearInputTranscriptQuietTimer();
    pendingTranscript = '';
    currentDelegationId = null;
    lastKnownUsageSeconds = null;
    if (dc) { try { dc.onopen = dc.onmessage = dc.onclose = dc.onerror = null; dc.close(); } catch (_) {} dc = null; }
    if (pc) { try { pc.ontrack = pc.onconnectionstatechange = null; pc.close(); } catch (_) {} pc = null; }
    if (audioElement) { try { pauseLocalAudio(); audioElement.srcObject = null; } catch (_) {} audioElement = null; }
    if (mediaStream) { mediaStream.getTracks().forEach((track) => track.stop()); mediaStream = null; }
  }
  function reportFailure(error, stage) {
    setState(VOICE_STATES.ERROR);
    onError({ code: errorCode(error), stage });
  }
  function failAndCleanup(error, stage) {
    if (state === VOICE_STATES.ERROR) return;
    teardown();
    reportFailure(error, stage);
  }
  function failureStage(error) {
    const code = String(errorCode(error));
    const status = error && error.status;
    if (status === 401 || code === 'AUTH_SESSION_REQUIRED' || code === 'ACCOUNT_SUSPENDED') return 'session_auth';
    if (status === 429 || /_429$/.test(code)) return 'session_quota';
    if (/_API_KEY_MISSING$/.test(code)) return 'key_missing';
    if (/TOKEN_FAILED_(401|403)/.test(code)) return 'key_rejected';
    if (/TOKEN_FAILED_404/.test(code)) return 'model_unavailable';
    if (code === 'PROVIDER_TIMEOUT' || code === 'GPT_LIVE_CONNECT_TIMEOUT') return 'token_mint_timeout';
    // Fail-closed wallet/pricing outcomes from mintGptLiveClientSecret()'s own gate (see that
    // function's comment) - never a silent fallback to another provider, an honest, actionable
    // stage instead. Production incident (2026-09-12): WALLET_INSUFFICIENT_BALANCE used to fold
    // into the same generic pricing_not_configured message as a genuinely missing pricing row,
    // which made "the row is missing" and "the row exists but this account can't afford the hold"
    // indistinguishable from the error text alone - kept as its own distinct stage now so the
    // right fix (top up the wallet, not touch pricing config) is the one actually suggested.
    if (code === 'WALLET_INSUFFICIENT_BALANCE') return 'insufficient_balance';
    if (code === 'PROVIDER_PRICING_NOT_CONFIGURED' || code === 'FEATURE_NOT_ENTITLED' || code === 'WALLET_SERVICE_UNAVAILABLE') return 'pricing_not_configured';
    // Real WebRTC negotiation failure classes, reusing the exact stage vocabulary Realtime's own
    // (retired) SDP relay already established (docs/ai/voice-architecture.md, ai-i18n.js) - now
    // genuinely applicable again since GPT-Live is also a real WebRTC transport.
    if (code === 'GPT_LIVE_ICE_GATHERING_TIMEOUT') return 'sdp_relay_timeout';
    if (code === 'GPT_LIVE_SESSION_SHAPE_UNEXPECTED' || code === 'GPT_LIVE_ANSWER_REJECTED') return 'sdp_exchange';
    if (code === 'GPT_LIVE_DATA_CHANNEL_FAILED') return 'data_channel';
    if (code === 'GPT_LIVE_SESSION_START_TIMEOUT') return 'session_ack';
    return 'live_connection';
  }
  const TERMINAL_FAILURE_STAGES = { session_auth: true, key_missing: true, key_rejected: true, model_unavailable: true, pricing_not_configured: true };

  function send(message) {
    if (!dc || dc.readyState !== 'open') return false;
    dc.send(JSON.stringify(Object.assign({ event_id: nextEventId() }, message)));
    return true;
  }

  function flushTranscript() {
    clearInputTranscriptQuietTimer();
    const text = pendingTranscript.trim();
    pendingTranscript = '';
    if (!text) return;
    setState(VOICE_STATES.PROCESSING);
    onFinalTranscript(text);
  }

  function armOutputTranscriptQuietCheck(token) {
    clearOutputTranscriptQuietTimer();
    outputTranscriptQuietTimer = setTimeout(() => {
      if (token !== activeSpeakToken) return; // superseded - interrupt()/a newer speak() already handled its own cleanup
      stopSpeaking('output_audio_buffer.stopped');
      if (state === VOICE_STATES.ASSISTANT_SPEAKING) setState(VOICE_STATES.LISTENING);
      settleSpeak();
    }, OUTPUT_TRANSCRIPT_QUIET_MS);
  }

  // Primary turn-completion trigger (see this file's own "TURN-COMPLETION CORRECTION" header
  // comment) - (re)armed on every session.input_transcript.delta. As long as fragments keep
  // arriving the timer keeps getting pushed back, so a normal continuous utterance is never cut
  // short; once they stop for INPUT_TRANSCRIPT_QUIET_MS, whatever is buffered is treated as a
  // complete utterance and handed to NAVRYA's own backend via flushTranscript().
  function armInputTranscriptQuietCheck(myEpoch) {
    clearInputTranscriptQuietTimer();
    inputTranscriptQuietTimer = setTimeout(() => {
      if (myEpoch !== connectionEpoch) return; // superseded - a reconnect/disconnect already tore this down
      flushTranscript();
    }, INPUT_TRANSCRIPT_QUIET_MS);
  }

  function handleDataChannelMessage(raw) {
    let message;
    try { message = JSON.parse(raw); } catch (_) { return; }
    if (message.type === 'error' || message.error) {
      const detail = message.error || message;
      const error = new Error(`GPT_LIVE_SESSION_ERROR_${(detail && detail.code) || 'UNKNOWN'}`);
      error.code = error.message;
      failAndCleanup(error, failureStage(error));
      return;
    }
    // Session lifecycle, confirmed verbatim from OpenAI's own "Managing sessions" guide: "Sessions
    // are created, started with a session.started event, and closed to collect usage metrics" -
    // session.closed "confirms finalization even when the reason is a connection loss or safety
    // termination" and carries a real usage.seconds. session.usage.updated reports interim
    // snapshots while still connected.
    // Confirmed session-ready acknowledgement - see connect()'s own comment for why this, not the
    // data channel merely opening, is what actually resolves the connect attempt.
    if (message.type === 'session.started') {
      if (pendingStartSettle) { const settle = pendingStartSettle; pendingStartSettle = null; pendingStartReject = null; settle(); }
      return;
    }
    if (message.type === 'session.usage.updated' && message.usage && message.usage.seconds != null) {
      lastKnownUsageSeconds = Number(message.usage.seconds) || lastKnownUsageSeconds;
      return;
    }
    if (message.type === 'session.closed') {
      const usageSeconds = message.usage && message.usage.seconds != null ? Number(message.usage.seconds) : lastKnownUsageSeconds;
      if (pendingCloseSettle) { const settle = pendingCloseSettle; pendingCloseSettle = null; settle(usageSeconds); }
      return;
    }
    if (message.type === 'session.input_transcript.delta' && typeof message.delta === 'string') {
      // Full-duplex barge-in heuristic (conservative, event-driven - no fabricated "interrupted"
      // event assumed, since none is documented for this transport): new user speech arriving
      // while a reply is still audibly playing is treated as the user interrupting it. Starts a
      // FRESH utterance buffer rather than appending to whatever was pending before the
      // interruption - matches the same "the user's real intent is what they say next" posture
      // ai-deterministic-extraction.js's own lastRegexMatch() self-correction fix already
      // established for text/voice self-corrections.
      if (state === VOICE_STATES.ASSISTANT_SPEAKING) {
        onBargeIn();
        pendingTranscript = '';
      }
      pendingTranscript += message.delta;
      if (state === VOICE_STATES.LISTENING || state === VOICE_STATES.ASSISTANT_SPEAKING) setState(VOICE_STATES.USER_SPEAKING);
      armInputTranscriptQuietCheck(connectionEpoch);
      return;
    }
    if (message.type === 'session.delegation.created' && message.delegation) {
      // Bonus early-flush path only, never the sole trigger - see this file's own "TURN-COMPLETION
      // CORRECTION" header comment for why armInputTranscriptQuietCheck() above is what a real
      // user's request actually depends on now.
      currentDelegationId = message.delegation.id || null;
      flushTranscript();
      return;
    }
    if (message.type === 'session.output_transcript.delta' && typeof message.delta === 'string') {
      // No terminal event exists for "this reply's audio just finished" (see this file's own
      // OUTPUT_TRANSCRIPT_QUIET_MS comment) - this transcript stream is the one confirmed signal
      // correlating to real spoken output, used as the honest, documented proxy for it. A delta
      // arriving with no active speak() token (client delegation should never let this happen -
      // GPT-Live only ever speaks in response to our own commentary.append - but a stray/
      // unexpected message must never silently flip playback state on a guess) is ignored.
      if (activeSpeakToken == null) return;
      if (!speaking) { speaking = true; setState(VOICE_STATES.ASSISTANT_SPEAKING); onOutputAudioBufferEvent('output_audio_buffer.started', null); }
      armOutputTranscriptQuietCheck(activeSpeakToken);
    }
  }

  // A failure while still waiting for the connect-time session.started confirmation rejects that
  // specific wait (pendingStartReject); a failure any time afterward goes through the ordinary
  // failAndCleanup()/reconnect path instead - the same real distinction aiVoiceRealtime.js's own
  // connect()-phase-vs-live-session-phase error handling already makes.
  function reportDataChannelFailure(myEpoch, error) {
    if (myEpoch !== connectionEpoch) return;
    if (pendingStartReject) { const reject = pendingStartReject; pendingStartSettle = null; pendingStartReject = null; reject(error); return; }
    failAndCleanup(error, failureStage(error));
  }
  function wireDataChannel(channel, myEpoch) {
    channel.onopen = () => {};
    channel.onmessage = (event) => { if (myEpoch === connectionEpoch) handleDataChannelMessage(event.data); };
    channel.onerror = () => reportDataChannelFailure(myEpoch, new Error('GPT_LIVE_DATA_CHANNEL_FAILED'));
    channel.onclose = () => {
      if (myEpoch !== connectionEpoch) return;
      if (pendingStartReject) { reportDataChannelFailure(myEpoch, new Error('GPT_LIVE_DATA_CHANNEL_FAILED')); return; }
      if (intentionalClose || state === VOICE_STATES.IDLE || state === VOICE_STATES.ERROR) return;
      scheduleReconnect(myEpoch);
    };
  }

  // Standard, transport-agnostic WebRTC correctness (not a GPT-Live-specific guess): a fresh
  // RTCPeerConnection's local offer has no ICE candidates attached to it yet immediately after
  // createOffer()/setLocalDescription() - they are added to pc.localDescription asynchronously as
  // gathering completes. Since this app sends one complete SDP offer and expects one complete SDP
  // answer back (no separate trickle-ICE channel to the far end), the offer actually posted must
  // be pc.localDescription.sdp AFTER gathering finishes, not the bare offer.sdp from createOffer().
  function waitForIceGatheringComplete(peerConnection, deadline) {
    if (peerConnection.iceGatheringState === 'complete') return Promise.resolve();
    return Promise.race([
      new Promise((resolve) => {
        function check() {
          if (peerConnection.iceGatheringState === 'complete') { peerConnection.removeEventListener('icegatheringstatechange', check); resolve(); }
        }
        peerConnection.addEventListener('icegatheringstatechange', check);
      }),
      deadline
    ]);
  }

  async function connect(connectOptions) {
    const isReconnect = !!(connectOptions && connectOptions.isReconnect);
    teardown();
    intentionalClose = false;
    if (!isReconnect) { reconnectAttempt = 0; clearReconnectTimer(); }
    const myEpoch = ++connectionEpoch;
    let timedOut = false;
    const deadline = new Promise((_resolve, reject) => {
      setTimeout(() => { timedOut = true; reject(Object.assign(new Error('GPT_LIVE_CONNECT_TIMEOUT'), { name: 'GPT_LIVE_CONNECT_TIMEOUT' })); }, CONNECT_TIMEOUT_MS);
    });
    deadline.catch(() => {});
    setState(isReconnect ? VOICE_STATES.RECONNECTING : VOICE_STATES.REQUESTING_PERMISSION);
    const micPromise = navigator.mediaDevices.getUserMedia({ audio: true });
    micPromise.then((stream) => { if (myEpoch !== connectionEpoch) { try { stream.getTracks().forEach((track) => track.stop()); } catch (_) {} } }, () => {});
    let grantedStream;
    try {
      grantedStream = await Promise.race([micPromise, deadline]);
    } catch (error) {
      if (myEpoch !== connectionEpoch) return;
      reportFailure(error, timedOut ? 'token_mint_timeout' : microphoneStage(error));
      throw error;
    }
    if (myEpoch !== connectionEpoch) { try { grantedStream.getTracks().forEach((track) => track.stop()); } catch (_) {} return; }
    mediaStream = grantedStream;
    wireMicTrackLifecycle(mediaStream, myEpoch);
    let mintAbortController = null;
    try {
      if (!isReconnect) setState(VOICE_STATES.CONNECTING);
      pc = new RTCPeerConnection();
      mediaStream.getAudioTracks().forEach((track) => pc.addTrack(track, mediaStream));
      audioElement = (typeof Audio !== 'undefined') ? new Audio() : (document.createElement ? document.createElement('audio') : null);
      if (audioElement) audioElement.autoplay = true;
      pc.ontrack = (event) => { if (myEpoch === connectionEpoch && audioElement && event.streams && event.streams[0]) audioElement.srcObject = event.streams[0]; };
      dc = pc.createDataChannel(DATA_CHANNEL_LABEL);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceGatheringComplete(pc, deadline);
      if (myEpoch !== connectionEpoch) return;
      if (pc.iceGatheringState !== 'complete') throw Object.assign(new Error('GPT_LIVE_ICE_GATHERING_TIMEOUT'), { name: 'GPT_LIVE_ICE_GATHERING_TIMEOUT' });

      mintAbortController = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      const sessionResult = await Promise.race([fetchSession(language, pc.localDescription.sdp, { signal: mintAbortController && mintAbortController.signal }), deadline]);
      if (myEpoch !== connectionEpoch) return;
      walletReservationId = sessionResult && sessionResult.walletReservationId ? sessionResult.walletReservationId : null;
      const answerSdp = sessionResult && sessionResult.answerSdp;
      if (!answerSdp) throw Object.assign(new Error('GPT_LIVE_ANSWER_REJECTED'), { code: 'GPT_LIVE_ANSWER_REJECTED' });
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
      if (myEpoch !== connectionEpoch) return;

      // Wired ONCE, for the whole lifetime of this connection - handleDataChannelMessage() already
      // resolves pendingStartSettle the instant a real session.started arrives, so every other
      // message type is handled uniformly whether it happens to arrive before or after that point.
      wireDataChannel(dc, myEpoch);
      // Resolve only on the confirmed session.started event over the data channel (see this
      // file's own header comment) - the data channel merely opening is not treated as sufficient
      // confirmation on its own, since the real "session config accepted" acknowledgement is the
      // JSON event, not the transport-level open.
      await new Promise((resolve, reject) => {
        pendingStartSettle = resolve;
        pendingStartReject = reject;
        deadline.catch(() => { if (pendingStartReject === reject) { pendingStartSettle = null; pendingStartReject = null; reject(Object.assign(new Error('GPT_LIVE_SESSION_START_TIMEOUT'), { name: 'GPT_LIVE_SESSION_START_TIMEOUT' })); } });
      });
      if (myEpoch !== connectionEpoch) return;
      reconnectAttempt = 0;
      connectedAtMs = Date.now();
      setState(VOICE_STATES.LISTENING);
    } catch (error) {
      if (mintAbortController) { try { mintAbortController.abort(); } catch (_) {} }
      if (myEpoch !== connectionEpoch) return;
      const stage = timedOut ? 'token_mint_timeout' : failureStage(error);
      if (isReconnect && !TERMINAL_FAILURE_STAGES[stage] && reconnectAttempt < RECONNECT_MAX_ATTEMPTS) {
        scheduleReconnect(myEpoch);
        return;
      }
      failAndCleanup(error, stage);
      throw error;
    }
  }

  function scheduleReconnect(myEpoch) {
    if (myEpoch !== connectionEpoch) return;
    teardown();
    if (reconnectAttempt >= RECONNECT_MAX_ATTEMPTS) {
      setState(VOICE_STATES.ERROR);
      onError({ code: 'VOICE_RECONNECT_EXHAUSTED', stage: 'reconnect' });
      return;
    }
    reconnectAttempt += 1;
    const delay = Math.min(RECONNECT_MAX_DELAY_MS, RECONNECT_BASE_DELAY_MS * Math.pow(2, reconnectAttempt - 1));
    const jitter = delay * (0.5 + Math.random() * 0.5);
    setState(VOICE_STATES.RECONNECTING);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (myEpoch !== connectionEpoch) return;
      connect({ isReconnect: true }).catch(() => {});
    }, jitter);
  }

  // Graceful close per OpenAI's own documented procedure ("Install the session.closed listener
  // before sending session.close... Send closure command and halt new submissions... Await
  // finalization event while keeping transports alive"): sends session.close, waits (bounded) for
  // the real session.closed confirmation - which carries the authoritative usage.seconds this
  // module settles the wallet reservation against - before tearing anything down. Falls back to a
  // locally-estimated duration only if that confirmation never arrives in time.
  function waitForSessionClosed(timeoutMs) {
    return new Promise((resolve) => {
      const wrapped = (usageSeconds) => { clearTimeout(timer); resolve(usageSeconds); };
      pendingCloseSettle = wrapped;
      const timer = setTimeout(() => { if (pendingCloseSettle === wrapped) { pendingCloseSettle = null; resolve(null); } }, timeoutMs);
    });
  }

  function disconnect() {
    intentionalClose = true;
    connectionEpoch += 1;
    clearReconnectTimer();
    reconnectAttempt = 0;
    const hadDataChannel = !!(dc && dc.readyState === 'open');
    if (hadDataChannel) {
      send({ type: 'session.close' });
      waitForSessionClosed(GRACEFUL_CLOSE_TIMEOUT_MS).then((usageSeconds) => {
        reportSettlement(usageSeconds != null ? usageSeconds : lastKnownUsageSeconds);
        teardown();
      });
    } else {
      reportSettlement(lastKnownUsageSeconds);
      teardown();
    }
    muted = false;
    onMuteChange(false);
    setState(VOICE_STATES.IDLE);
  }

  function mute(next) {
    muted = !!next;
    if (mediaStream) mediaStream.getAudioTracks().forEach((track) => { track.enabled = !muted; });
    onMuteChange(muted);
  }

  function interrupt() {
    if (!pc) return;
    activeSpeakToken = null; // any output-transcript delta still arriving for the old turn is now silently ignored (handleDataChannelMessage's own token check)
    // Deliberately stays paused - GPT-Live only ever speaks in response to our own
    // commentary.append (client delegation, zero autonomous initiative - see this file's header
    // comment), so nothing further arrives on this live stream until the NEXT speak() call for a
    // genuinely new turn, which is the one place this module resumes local playback again. Calling
    // resumeLocalAudio() here immediately after pausing would defeat "Stop reply" entirely for a
    // continuous, non-queued live stream (there is no discrete buffer to "clear" the way the other
    // two transports' own chunk/file-based playback has - pausing IS the clear).
    pauseLocalAudio();
    stopSpeaking('output_audio_buffer.cleared');
    settleSpeak();
    // Best-effort - no confirmed client-sent interrupt/cancel event exists for this transport (see
    // this file's own header comment); the local pause above is what actually guarantees "Stop
    // reply" is heard immediately, regardless of whether the server honors this instruction.
    send({ type: 'session.instructions.append', delegation_id: null, content: 'Stop speaking immediately.' });
    if (state !== VOICE_STATES.ERROR) setState(VOICE_STATES.LISTENING);
  }

  function finishUserTurn() {
    // No documented client message ends just the current turn early under continuous, real-media,
    // server-managed turn detection - honestly reports no real capability, same posture as
    // geminiLiveVoice.js's own finishUserTurn()/supportsManualFinish().
    return false;
  }
  function supportsManualFinish() { return false; }
  function markPlaybackEnded() { if (state === VOICE_STATES.ASSISTANT_SPEAKING) setState(VOICE_STATES.LISTENING); }

  // Speaks NAVRYA's own already-approved text back, verbatim - never GPT-Live's own paraphrase of
  // it (see this file's header comment for the documented "commentary causes paraphrasing" risk
  // this wrapper mitigates, not eliminates). Resolves once the output-transcript stream actually
  // goes quiet (OUTPUT_TRANSCRIPT_QUIET_MS's own heuristic) or SPEAK_SAFETY_TIMEOUT_MS elapses,
  // whichever comes first - the same "speak() waits for the reply to actually finish, but can never
  // wedge the shared PlaybackController queue forever" contract the other two transports already
  // guarantee.
  function speak(text) {
    if (!text || !dc || dc.readyState !== 'open' || !currentDelegationId) return Promise.resolve();
    const token = {};
    activeSpeakToken = token;
    // A prior interrupt() left local playback deliberately paused (see that function's own
    // comment) - resume it now, at the one place a genuinely new turn actually begins, so this
    // reply is audible.
    resumeLocalAudio();
    const verbatim = 'Speak exactly the following sentence, verbatim, in the same language it is written in, with no paraphrasing, no additions, and no omissions: ' + text;
    send({ type: 'session.commentary.append', delegation_id: currentDelegationId, content: verbatim.length > COMMENTARY_MAX_CHARS ? verbatim.slice(0, COMMENTARY_MAX_CHARS) : verbatim });
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => { if (!settled) { settled = true; pendingSpeakSettle = null; resolve(); } }, SPEAK_SAFETY_TIMEOUT_MS);
      pendingSpeakSettle = () => { if (settled) return; settled = true; clearTimeout(timer); resolve(); };
    });
  }

  // No ElevenLabs-substitution path exists for this transport (GPT-Live always speaks in its own
  // native voice over the live WebRTC connection) - kept as a resolved no-op purely so
  // PlaybackController's generic wiring (navrya-src/chatDockView.jsx) never has to branch by
  // transport to know whether this method exists at all, exactly like every other transport's own
  // contract.
  function playAudioUrl() { return Promise.resolve(); }

  return {
    connect, disconnect, mute, interrupt, speak, playAudioUrl, finishUserTurn, supportsManualFinish, markPlaybackEnded,
    setLanguage: (value) => { language = value || 'en'; }, setEagerness: () => false,
    state: () => state, isMuted: () => muted, getMediaStream: () => mediaStream,
    // Provider Ownership addendum, section 1's own convention: reasoning already follows the real
    // active provider unchanged (chatDockView.jsx never overrides it), so this just reports the
    // truth for the same debug-transparency purpose the other two adapters' own provider() getter
    // already serves.
    provider: () => 'openai',
    // Dev diagnostic only - state/language/session-active/recent-event *types*, never the
    // transcript text or any credential, matching aiVoiceRealtime.js's own debugState() privacy
    // contract.
    debugState: () => ({ state, language, sessionActive: !!pc, connectionEpoch })
  };
}
