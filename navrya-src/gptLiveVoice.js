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
// PROTOCOL CORRECTION (earlier pass): an earlier version of this module guessed a WebSocket
// connection with manually base64-encoded PCM audio chunks, by analogy to the Gemini Live adapter.
// That guess was wrong for the browser case. OpenAI's own documentation, fetched and quoted
// verbatim in that pass (developers.openai.com/api/docs/models/gpt-live-1 and
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
// (session.input_audio.append / session.output_audio.delta) that earlier version wrongly assumed
// applied here too; those are very likely WebSocket-only (server-side/telephony) concepts, per the
// model page's own sentence above, and are not used by this module at all.
//
// Session creation itself was also corrected: GPT-Live's POST /v1/live/sessions takes the
// browser's own locally-built SDP OFFER directly in the SAME request as the session config
// (`{session: {...}, transport: {type:'webrtc', sdp: offer}}`) and returns the SDP ANSWER directly
// in the response - there is no separate ephemeral-client-secret step the way the (now retired)
// Realtime transport used. server/pattern-ai-server.mjs's mintGptLiveClientSecret() is the only
// party that ever talks to OpenAI for this; the browser never receives an OpenAI credential of any
// kind for this transport.
//
// TURN-BOUNDARY / BARGE-IN / DELEGATION-CORRELATION REPAIR (this pass, feat/voice-gpt-live-repair):
// three confirmed production defects fixed together, since all three live in the same event-
// handling code and interact with each other:
//   1. A fixed 1200ms quiet window on session.input_transcript.delta cut natural pauses, fillers,
//      self-correction, and code-switching into multiple turns. INPUT_TRANSCRIPT_QUIET_MS is
//      increased to a more conservative default (see its own comment) and a SEPARATE, much
//      shorter POST_TURN_STRAY_FRAGMENT_MS window now absorbs a late STT straggler for an
//      utterance that has ALREADY been flushed, instead of that straggler silently starting a
//      spurious second, fragmentary turn (see the input_transcript.delta handler below).
//   2. ANY delta arriving while ASSISTANT_SPEAKING was treated as a new barge-in, immediately
//      interrupting the fresh reply and discarding the input buffer - a delayed tail fragment of
//      the SAME utterance whose reply was already playing could cancel that answer. Fixed with a
//      confirmation window (BARGE_IN_CONFIRM_MS): candidate speech during playback is buffered but
//      never flushed/never interrupts anything until it is sustained past both the stray-fragment
//      grace window and the confirmation window - see bargeInCandidate below.
//   3. A single mutable currentDelegationId meant a reply could arrive before its own turn's
//      delegation.created, silently producing written text with no speech, or (in principle) a
//      later turn reusing a stale id. Replaced with per-turn delivery correlation
//      (delegationByTurnId, keyed by a turnId assigned at flush time and threaded back out via
//      onFinalTranscript's second argument) - see speak(text, entry) below.
//   4. GPT interruption paused local playback of a continuous, unpaused-at-the-transport-level
//      remote WebRTC stream; OpenAI's own stop instruction is best-effort only (no confirmed
//      client-cancel event exists), so audio for the interrupted reply could still be arriving
//      when the NEXT reply's playback resumes. resetAudioSink() now forces the <audio> element to
//      re-attach the remote MediaStream (discarding any internally buffered/queued frames) before
//      resuming playback for a genuinely new reply that follows an interrupt - see
//      audioSinkNeedsRebuild below.
// None of this invents an undocumented provider event: every mechanism above is client-side
// bookkeeping layered on top of the exact event vocabulary already confirmed in this file (no
// fabricated "turn complete"/"cancel" event). Network access to re-fetch OpenAI's own
// documentation was unavailable in this session (sandboxed, no outbound web access) - the design
// below builds strictly on the facts already verified and quoted verbatim in this file during the
// prior pass, plus the same file's own "STILL UNVERIFIED" list below, unchanged and re-affirmed.
//
// STILL UNVERIFIED AGAINST A REAL LIVE-API ACCOUNT (flagged here, not silently assumed): the exact
// data-channel label (DATA_CHANNEL_LABEL below is inferred from OpenAI's own adjacent Realtime
// WebRTC example on the same guide page, not confirmed GPT-Live-specific); whether an explicit
// client-sent interrupt/cancel event exists at all (no such event is documented - see interrupt()'s
// own comment for how this module handles "Stop reply" without one); the exact character budget
// behind commentary.append's documented "500 tokens" limit (COMMENTARY_MAX_CHARS below is a
// deliberately conservative character approximation, never a real token count, since this module
// cannot tokenize client-side); whether session.input_transcript.delta/session.output_transcript.
// delta carry any server-assigned correlation id at all (not shown in any quoted excerpt gathered
// so far) - this pass's own turn/delegation correlation is therefore entirely client-side FIFO
// bookkeeping (see PAIRING below), never a guessed server-provided field; and the exact real-world
// timing of GPT-Live's own incremental transcript delivery (INPUT_TRANSCRIPT_QUIET_MS,
// POST_TURN_STRAY_FRAGMENT_MS, and BARGE_IN_CONFIRM_MS below are reasoned defaults, not tuned
// against real audio - no live account was available in this sandboxed session, matching this
// codebase's own established convention for other untuned Voice timing constants, e.g.
// geminiSpeechActivityDetector.js's MIN_SILENCE_MS). Every place relying on one of these fails
// loudly/degrades safely on an unexpected response/event shape rather than silently guessing
// further.
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
// TURN-BOUNDARY REPAIR: no documented event marks "the user's utterance is complete" either, and
// session.delegation.created cannot be relied on to fire for every turn (OpenAI's own delegation
// guide: "delegation decisions remain under the model's discretion", no documented way to force it
// on every turn). This is the CONSERVATIVE, CANCELLABLE fallback - re-armed on every new delta, so
// a real pause never gets "part way" counted against it. Confirmed production defect this pass:
// the previous value (1200ms) was measured cutting natural pauses, fillers, self-correction
// ("fifteen minutes... no, five minutes"), and Persian/English code-switching into separate turns.
// Increased to a more conservative default - a REASONED increase (a genuine pause tolerant enough
// for a real mid-sentence hesitation across all four supported languages), not empirically re-
// tuned against real GPT-Live audio in this sandboxed session (no live account available - see
// this file's own header comment). Real-device/real-account validation of this exact value remains
// an open item.
const INPUT_TRANSCRIPT_QUIET_MS = 2200;
// TURN-BOUNDARY REPAIR: a SEPARATE, deliberately much shorter window than
// INPUT_TRANSCRIPT_QUIET_MS above - the two measure different things. INPUT_TRANSCRIPT_QUIET_MS is
// how long to tolerate a human pause before deciding an utterance is finished.
// POST_TURN_STRAY_FRAGMENT_MS is how late a single already-in-flight STT delta for an utterance
// that has ALREADY been flushed can still trickle in over the data channel (pure processing/
// delivery lag, not pause tolerance) - confirmed possible ("STT delta delivery itself trails the
// real audio by some margin"). A delta arriving inside this window after the last flush is treated
// as that flushed utterance's own late tail, never a new turn and never a barge-in (see the
// input_transcript.delta handler below) - this is what protects "delayed input fragments after
// provisional finalization and after reply playback begins" specifically. Kept short and distinct
// from INPUT_TRANSCRIPT_QUIET_MS so a genuine quick follow-up utterance is not itself swallowed by
// this same guard; 700ms mirrors geminiLiveVoice.js's own TRANSCRIPT_FRAGMENT_QUIET_MS, a
// reasonable independent cross-check that this is the right order of magnitude for STT delivery
// lag specifically (as opposed to human pause tolerance) in this codebase.
const POST_TURN_STRAY_FRAGMENT_MS = 700;
// TURN-BOUNDARY REPAIR (barge-in safety): confirmed production defect - ANY input_transcript.delta
// arriving while ASSISTANT_SPEAKING used to fire a barge-in immediately and discard the input
// buffer, so a single delayed/stray fragment could cancel a freshly generated answer. Candidate
// speech arriving during playback (past POST_TURN_STRAY_FRAGMENT_MS above) is now buffered but not
// yet trusted; only once it is SUSTAINED for this long is it treated as genuine new user speech
// that actually interrupts playback - "only verified new user speech may interrupt active
// playback." Deliberately larger than geminiSpeechActivityDetector.js's own MIN_SPEECH_MS (120ms):
// that constant analyzes raw audio energy directly (near-instant signal); this one waits on
// incremental TEXT deltas, a coarser, higher-latency signal, so a longer confirmation window is
// the honest equivalent. Not tuned against real delta-arrival cadence in this sandboxed session.
const BARGE_IN_CONFIRM_MS = 500;
// speak() safety timeout (mirrors aiVoiceRealtime.js's own 12s speak() stall fix / Gemini's
// watchdogs): commentary.append has no documented completion ack either, so a lost or never-sent
// reply must never wedge the shared PlaybackController queue forever.
const SPEAK_SAFETY_TIMEOUT_MS = 20000;
// DELEGATION-CORRELATION REPAIR: bounded wait for a same-turn delegation.created that has not
// arrived yet by the time that turn's own reply is already ready to speak - confirmed possible per
// OpenAI's own delegation guide (delegation firing is "under the model's discretion", with no
// documented ordering or firing guarantee relative to when NAVRYA's own backend finishes
// responding). Well under SPEAK_SAFETY_TIMEOUT_MS so the existing overall stall guard still applies
// on top; if this elapses with no delegation ever pairing to the turn, speak() reports an honest,
// narrow error (onSpeakError) rather than silently resolving as if nothing needed to happen - the
// confirmed production defect ("produce written text but no speech") this replaces.
const SPEAK_DELEGATION_WAIT_MS = 4000;
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
export function createGptLiveSession(options) {
  options = options || {};
  let language = options.language || 'en';
  let state = VOICE_STATES.IDLE;
  let muted = false;
  let mediaStream = null;
  let pc = null;
  let dc = null;
  let audioElement = null;
  // TURN-BOUNDARY REPAIR item 4: the remote track's own MediaStream, cached from pc.ontrack so
  // resetAudioSink() can re-attach it on demand (see that function's own comment) - a fresh
  // RTCPeerConnection only ever fires ontrack once per connection, so this is stable for the whole
  // lifetime of one connect().
  let remoteStream = null;
  // Set by interrupt() (any reason: barge-in, "Stop reply", teardown) - consumed by the next
  // speak() call, which re-attaches the <audio> element's srcObject before resuming playback so no
  // frame still arriving for the just-interrupted reply (OpenAI's own stop instruction is best-
  // effort only - see interrupt()'s own comment) can be heard as if it belonged to the new one.
  let audioSinkNeedsRebuild = false;
  let intentionalClose = false;
  let connectionEpoch = 0;
  let reconnectAttempt = 0;
  let reconnectTimer = null;
  let eventCounter = 0;
  function nextEventId() { eventCounter += 1; return 'navrya_' + eventCounter + '_' + Date.now(); }

  // Accumulated fragments for the utterance currently in progress - flushed to exactly one
  // onFinalTranscript() call once the turn-boundary logic below (either session.delegation.created,
  // or the conservative INPUT_TRANSCRIPT_QUIET_MS fallback) decides the utterance is complete.
  let pendingTranscript = '';
  // TURN-BOUNDARY / DELEGATION-CORRELATION REPAIR - PAIRING: every flushed turn gets a local,
  // immutable, monotonically increasing turnId (never reused, never tied to any server-provided
  // id - none is confirmed to exist on these events, see this file's own header comment). Three
  // client-side structures do the actual pairing between a flushed turn and its eventual
  // delegation.created, entirely via FIFO ordering (this transport only ever has one active
  // conversation/utterance stream at a time, the same assumption every other part of this module
  // already makes):
  //   - delegationByTurnId: turnId -> delegationId, once known (either paired immediately, when
  //     delegation.created is what triggered the flush, or paired later via the queues below).
  //   - unpairedFlushedTurnIds: turnIds flushed by the fallback timer with no delegation yet -
  //     FIFO-claimed, oldest first, by the next delegation.created that arrives.
  //   - pendingUnclaimedDelegationIds: the mirror case - a delegation.created arrived with nothing
  //     yet accumulated and no unpaired flush waiting (the model reacted before any transcript
  //     fragment even reached this module) - FIFO-claimed, oldest first, by the next flush.
  let flushedTurnSeq = 0;
  const delegationByTurnId = new Map();
  const unpairedFlushedTurnIds = [];
  const pendingUnclaimedDelegationIds = [];
  // A speak() call for a turn whose delegation has not yet arrived registers itself here so
  // pairDelegation() can wake it the instant pairing happens, instead of only ever polling.
  const pendingDelegationWaiters = new Map();
  // Set at the top of every flushTranscript() call - see POST_TURN_STRAY_FRAGMENT_MS's own comment
  // for what this guards against.
  let lastFlushedAtMs = null;
  // TURN-BOUNDARY REPAIR item 2: unconfirmed candidate speech arriving while ASSISTANT_SPEAKING
  // (past the stray-fragment grace window) - { text }, or null when nothing is being evaluated.
  // Never merged into pendingTranscript, never flushed, and never fires onBargeIn() until
  // confirmed - see confirmBargeIn()/bargeInConfirmTimer below for how, and
  // promoteBargeInCandidateAsOrdinarySpeech() for the two places an UNconfirmed one resolves
  // instead (the reply ends naturally, or an explicit interrupt()/"Stop reply" happens first).
  let bargeInCandidate = null;
  // Armed the moment a candidate is created (the FIRST delta past the stray-fragment grace window
  // while ASSISTANT_SPEAKING) - a single, fixed, time-based confirmation window from that moment,
  // not re-armed per subsequent delta. Time-based (not "wait for N more fragments") so a short,
  // genuine one-word interruption ("Stop!") is confirmed exactly as reliably as a longer one - see
  // BARGE_IN_CONFIRM_MS's own comment.
  let bargeInConfirmTimer = null;
  // Live caption buffer for the CURRENT reply's own output_transcript.delta fragments - reset each
  // time a new speak() call actually begins sending commentary (see speak()'s own comment), never
  // accumulated across turns.
  let pendingOutputTranscript = '';

  // Same activeSpeakToken idiom aiVoiceRealtime.js/geminiLiveVoice.js already use: an output-
  // transcript delta arriving after its own speak() call was superseded (interrupt()/a newer
  // speak()/disconnect()) is silently ignored, never resolved/spoken-over as if it belonged to the
  // current turn. Only ever set once a speak() call actually starts sending commentary (not while
  // still waiting on a delegation) - see speak()'s own comment for why that timing matters.
  let activeSpeakToken = null;
  let pendingSpeakSettle = null;
  let outputTranscriptQuietTimer = null;
  let inputTranscriptQuietTimer = null;
  let speaking = false;
  let walletReservationId = null;
  // Cost-visibility fix: echoed from mintGptLiveClientSecret()'s own result (server-side, never
  // inferred client-side), and threaded back to fetchSettle() so settleGptLiveVoiceSession()
  // (server/pattern-ai-server.mjs) can tell "no reservation because wallet enforcement was off" (a
  // real NAVRYA-funded call - usage should still be recorded) apart from "no reservation because
  // this was BYOK" (the user's own key/cost - correctly never recorded) - see that function's own
  // comment.
  let isByokSession = false;
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
  // DELEGATION-CORRELATION REPAIR: optional, additive (like every other capability-gated callback
  // in this file) - fired when a turn's own reply could not actually be spoken because no
  // delegation ever paired with it inside SPEAK_DELEGATION_WAIT_MS (see speak()'s own comment).
  // Deliberately NOT routed through onError()/VOICE_STATES.ERROR: a single missed reply is a
  // narrow, per-turn event, not a connection failure - forcing the whole session into ERROR over
  // one unlucky turn would be a real UX regression (Voice becoming unusable after one edge case)
  // the task's own "no regressions in UI behavior" constraint forbids. A caller that never passes
  // this simply never learns about it beyond the transcript already having been submitted through
  // the ordinary text pipeline - which is why this is additive, not a required contract change.
  const onSpeakError = options.onSpeakError || function () {};
  // Live caption fix: purely additive/optional, like every other capability-gated callback in this
  // file - a caller that never passes these (both existing transports today) keeps their exact
  // prior behavior. Unlike the (retired) Realtime transport, which VoiceConsole.jsx's own header
  // comment documents as only ever exposing a *finalized* transcript, GPT-Live's input_transcript.
  // delta/output_transcript.delta genuinely stream live, real fragments - discarding that content
  // (the previous behavior: these events were read only for their arrival timing, never their
  // text) left the UI with no accurate way to show what was actually being heard/said while a turn
  // was still in progress. Fired with the CURRENT accumulated buffer on every delta (never a single
  // word), so the caller can render a live, growing caption without doing its own accumulation.
  const onInputTranscript = options.onInputTranscript || function () {};
  const onOutputTranscript = options.onOutputTranscript || function () {};
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
  function clearBargeInConfirmTimer() { if (bargeInConfirmTimer) { clearTimeout(bargeInConfirmTimer); bargeInConfirmTimer = null; } }

  // TURN-BOUNDARY REPAIR item 2: fires once BARGE_IN_CONFIRM_MS has elapsed with the candidate
  // never having been cancelled first (by the reply ending naturally, or an explicit interrupt) -
  // "only verified new user speech may interrupt active playback." Starts a FRESH utterance buffer
  // from exactly the candidate's own accumulated text (never appends to whatever was pending
  // before the interruption), matching the same "the user's real intent is what they say next"
  // posture ai-deterministic-extraction.js's own lastRegexMatch() self-correction fix established.
  function confirmBargeIn() {
    if (!bargeInCandidate) return;
    clearBargeInConfirmTimer();
    const text = bargeInCandidate.text;
    bargeInCandidate = null;
    onBargeIn();
    pendingTranscript = text;
    setState(VOICE_STATES.USER_SPEAKING);
    armInputTranscriptQuietCheck(connectionEpoch);
  }
  // An UNconfirmed candidate is never lost - promoted into ordinary accumulation (never flushed
  // immediately, never treated as an interruption of anything, since by the time this runs there
  // is either no reply left to interrupt, or the caller is already tearing playback down for an
  // unrelated reason) rather than discarded. Called from armOutputTranscriptQuietCheck()'s own
  // natural-end path and from interrupt()'s own explicit-stop path.
  function promoteBargeInCandidateAsOrdinarySpeech() {
    if (!bargeInCandidate) return;
    clearBargeInConfirmTimer();
    const text = bargeInCandidate.text;
    bargeInCandidate = null;
    pendingTranscript = text;
    setState(VOICE_STATES.USER_SPEAKING);
    onInputTranscript(pendingTranscript);
    armInputTranscriptQuietCheck(connectionEpoch);
  }

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
  // TURN-BOUNDARY REPAIR item 4: forces the <audio> element to drop any frames it may still be
  // holding/rendering-queued from a just-interrupted reply (OpenAI's own stop instruction is best-
  // effort only - real audio for the interrupted turn can still be arriving on the same continuous
  // WebRTC track when the next reply begins). Re-attaching srcObject on a live MediaStream is a
  // standard, well-established technique for resetting a media sink's internal buffer without
  // tearing down the underlying RTCPeerConnection/track at all - the far simpler alternative of
  // constructing a whole new <audio> element was deliberately not used, since it would also need
  // re-wiring autoplay/ontrack-equivalent state for no extra benefit.
  function resetAudioSink() {
    if (!audioElement || !remoteStream) return;
    try { audioElement.srcObject = null; audioElement.srcObject = remoteStream; } catch (_) {}
  }

  function reportSettlement(usageSeconds) {
    // Cost-visibility fix: this used to skip calling fetchSettle entirely whenever
    // walletReservationId was empty - true both for BYOK (correctly nothing to report) AND for
    // "wallet enforcement was off at mint time" (a real NAVRYA-funded call whose usage still needs
    // recording - see settleGptLiveVoiceSession()'s own comment). Only BYOK is skipped now; the
    // isByok flag (not the presence of a reservationId) is what the server needs to tell the two
    // apart, since both leave walletReservationId null.
    if (isByokSession || typeof fetchSettle !== 'function') { walletReservationId = null; isByokSession = false; connectedAtMs = null; return; }
    // Prefer OpenAI's own authoritative usage.seconds (from the real session.closed/
    // session.usage.updated events) - only fall back to a locally-computed wall-clock estimate
    // when neither ever arrived (a lost event, or a connection that dropped before either could).
    const elapsedSeconds = usageSeconds != null
      ? Math.max(0, Number(usageSeconds) || 0)
      : Math.max(0, connectedAtMs ? Math.round((Date.now() - connectedAtMs) / 1000) : 0);
    const reservationId = walletReservationId;
    walletReservationId = null;
    isByokSession = false;
    connectedAtMs = null;
    // isByok is always false here (the BYOK case already returned above) - sent explicitly anyway
    // as defense-in-depth, since settleGptLiveVoiceSession() (server-side) is what actually decides
    // whether to record usage, never trusting the mere presence/absence of a reservationId alone.
    Promise.resolve(fetchSettle({ reservationId, elapsedSeconds, isByok: false })).catch(() => {}); // fire-and-forget, never blocks teardown
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
    pendingOutputTranscript = '';
    // TURN-BOUNDARY / DELEGATION-CORRELATION REPAIR: settleSpeak() above already resolves whichever
    // phase the one active speak() call (if any) was in - PlaybackController only ever has one
    // entry in flight at a time, so these are always empty in ordinary operation by this point;
    // cleared here defensively so nothing from this connection can leak into the next one.
    delegationByTurnId.clear();
    unpairedFlushedTurnIds.length = 0;
    pendingUnclaimedDelegationIds.length = 0;
    pendingDelegationWaiters.clear();
    lastFlushedAtMs = null;
    clearBargeInConfirmTimer();
    bargeInCandidate = null;
    audioSinkNeedsRebuild = false;
    remoteStream = null;
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
    // stage instead. Production incident: WALLET_INSUFFICIENT_BALANCE used to fold into the same
    // generic pricing_not_configured message as a genuinely missing pricing row, which made "the
    // row is missing" and "the row exists but this account can't afford the hold" indistinguishable
    // from the error text alone - kept as its own distinct stage now so the right fix (top up the
    // wallet, not touch pricing config) is the one actually suggested.
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

  // Lifecycle hardening: a real RTCDataChannel can throw synchronously from send() (a genuine
  // send race - e.g. the channel closes between the readyState check above and the call itself,
  // a real, if narrow, window on some browsers). Uncaught, this would previously propagate straight
  // out of interrupt()/speak() (the latter only safe because it happens to run inside a Promise
  // executor, which swallows a synchronous throw into a rejection - interrupt() has no such
  // protection and is called directly by callers that do not expect it to throw). Converted into
  // the same honest `false` this function already returns for "not connected", matching the
  // try/catch convention every other real-world-failure-prone call in this file already uses.
  function send(message) {
    if (!dc || dc.readyState !== 'open') return false;
    try {
      dc.send(JSON.stringify(Object.assign({ event_id: nextEventId() }, message)));
      return true;
    } catch (_err) {
      return false;
    }
  }

  // DELEGATION-CORRELATION REPAIR - PAIRING: the one place a turnId and a delegationId are ever
  // bound together, from whichever direction discovers the pairing first (see the queues declared
  // above). Wakes a speak() call already waiting on this exact turnId, if one exists.
  function pairDelegation(turnId, delegationId) {
    delegationByTurnId.set(turnId, delegationId);
    const waiter = pendingDelegationWaiters.get(turnId);
    if (waiter) { pendingDelegationWaiters.delete(turnId); waiter(delegationId); }
  }

  // Flushes whatever is accumulated in pendingTranscript as ONE finalized utterance. Called either
  // directly by the session.delegation.created handler (delegationIdForThisFlush provided - an
  // unambiguous 1:1 pairing, since that event is literally what triggered this flush) or by the
  // conservative INPUT_TRANSCRIPT_QUIET_MS fallback timer (no delegation yet - queued for later
  // pairing). Returns the assigned turnId (or null if there was nothing to flush).
  function flushTranscript(delegationIdForThisFlush) {
    clearInputTranscriptQuietTimer();
    const text = pendingTranscript.trim();
    pendingTranscript = '';
    if (!text) return null;
    const turnId = ++flushedTurnSeq;
    lastFlushedAtMs = Date.now();
    const resolvedDelegationId = delegationIdForThisFlush || pendingUnclaimedDelegationIds.shift() || null;
    if (resolvedDelegationId) pairDelegation(turnId, resolvedDelegationId);
    else unpairedFlushedTurnIds.push(turnId);
    setState(VOICE_STATES.PROCESSING);
    onFinalTranscript(text, { gptLiveTurnId: turnId });
    return turnId;
  }

  function armOutputTranscriptQuietCheck(token) {
    clearOutputTranscriptQuietTimer();
    outputTranscriptQuietTimer = setTimeout(() => {
      if (token !== activeSpeakToken) return; // superseded - interrupt()/a newer speak() already handled its own cleanup
      stopSpeaking('output_audio_buffer.stopped');
      if (state === VOICE_STATES.ASSISTANT_SPEAKING) setState(VOICE_STATES.LISTENING);
      settleSpeak();
      // TURN-BOUNDARY REPAIR item 2: the reply ended naturally before any pending candidate was
      // ever confirmed - it was never actually an interruption (nothing is playing to interrupt
      // any more), just ordinary next speech that happened to start slightly before the reply
      // finished. Promote it into normal accumulation rather than losing it or leaving it stranded.
      promoteBargeInCandidateAsOrdinarySpeech();
    }, OUTPUT_TRANSCRIPT_QUIET_MS);
  }

  // Primary turn-completion trigger - (re)armed on every session.input_transcript.delta accepted
  // into pendingTranscript. As long as fragments keep arriving the timer keeps getting pushed back,
  // so a normal continuous utterance (including a natural mid-sentence pause) is never cut short;
  // once they stop for INPUT_TRANSCRIPT_QUIET_MS, whatever is buffered is treated as a complete
  // utterance and handed to NAVRYA's own backend via flushTranscript().
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
      const now = Date.now();
      // TURN-BOUNDARY REPAIR: a delta arriving this soon after the last flush is presumed to be a
      // late STT tail fragment of THAT SAME already-submitted utterance (see
      // POST_TURN_STRAY_FRAGMENT_MS's own comment) - covers both "after provisional finalization"
      // (state is PROCESSING here, reply not started yet) and "after reply playback begins" (state
      // is ASSISTANT_SPEAKING). Discarded outright: never starts a spurious second turn, never
      // counts toward barge-in confirmation.
      if (lastFlushedAtMs != null && (now - lastFlushedAtMs) < POST_TURN_STRAY_FRAGMENT_MS) return;

      if (state === VOICE_STATES.ASSISTANT_SPEAKING) {
        // TURN-BOUNDARY REPAIR item 2: candidate speech during active playback is buffered
        // separately and never merged into pendingTranscript/flushed/reported as a barge-in until
        // confirmBargeIn() actually fires, BARGE_IN_CONFIRM_MS after the candidate started -
        // "never submit a partial transcript merely because of a short pause", and "a late delta
        // belonging to the prior utterance must never cancel that utterance's newly generated
        // answer." Not re-armed per delta (a fixed window from first detection, not "wait for
        // silence again") so a short, genuine one-word interruption is confirmed exactly as
        // reliably as a longer one.
        if (!bargeInCandidate) { bargeInCandidate = { text: '' }; bargeInConfirmTimer = setTimeout(confirmBargeIn, BARGE_IN_CONFIRM_MS); }
        bargeInCandidate.text += message.delta;
        onInputTranscript(bargeInCandidate.text);
        return;
      }

      // Defense-in-depth: a candidate can be left pending by an explicit interrupt() call that
      // didn't go through the confirmation path above (see that function's own promotion logic) -
      // normally already handled there or by armOutputTranscriptQuietCheck()'s own promotion, this
      // is a safety net so a leftover candidate is never silently dropped by the next delta either.
      if (bargeInCandidate) { pendingTranscript += bargeInCandidate.text; bargeInCandidate = null; }
      pendingTranscript += message.delta;
      if (state === VOICE_STATES.LISTENING) setState(VOICE_STATES.USER_SPEAKING);
      onInputTranscript(pendingTranscript);
      armInputTranscriptQuietCheck(connectionEpoch);
      return;
    }
    if (message.type === 'session.delegation.created' && message.delegation) {
      const delegationId = message.delegation.id || null;
      if (!delegationId) return;
      if (unpairedFlushedTurnIds.length) {
        // Pairs with the OLDEST still-unclaimed fallback-timeout flush (FIFO - see this module's
        // own PAIRING comment for the sequential-conversation assumption this rests on).
        pairDelegation(unpairedFlushedTurnIds.shift(), delegationId);
        return;
      }
      if (pendingTranscript.trim()) {
        // Bonus early-flush path: this delegation is what triggers this exact flush, so the
        // pairing is unambiguous by construction - never the sole turn-completion trigger any
        // more (armInputTranscriptQuietCheck's own fallback above is), but still the fastest path
        // when the model happens to fire it promptly.
        flushTranscript(delegationId);
        return;
      }
      // Nothing accumulated yet and no fallback-flushed turn is awaiting pairing - the model
      // reacted before any transcript fragment reached this module at all. Queue it for whichever
      // turn flushes next, rather than silently discarding a delegation this transport will need
      // in order to ever speak that turn's reply.
      pendingUnclaimedDelegationIds.push(delegationId);
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
      pendingOutputTranscript += message.delta;
      onOutputTranscript(pendingOutputTranscript);
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
      pc.ontrack = (event) => {
        if (myEpoch !== connectionEpoch || !event.streams || !event.streams[0]) return;
        remoteStream = event.streams[0];
        if (audioElement) audioElement.srcObject = remoteStream;
      };
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
      isByokSession = !!(sessionResult && sessionResult.isByok);
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

  // Real user report (close/"X" button silently "not working" while GPT-Live was still audibly
  // speaking): the graceful-close handshake below (session.close -> await session.closed, up to
  // GRACEFUL_CLOSE_TIMEOUT_MS/4000ms) is real and deliberate - it is what lets reportSettlement()
  // bill the wallet against the server's own authoritative usage.seconds instead of a local guess -
  // but the actual <audio> element was only ever paused inside teardown(), which only runs once
  // that whole wait resolves. Clicking "X" DID flip voiceState to IDLE immediately (closing the
  // console), so the control was never truly inert - but GPT-Live's own voice kept playing audibly
  // for up to 4 more seconds after the panel disappeared, which reads exactly like "the close
  // button doesn't work" to anyone still hearing it. interrupt() ("Stop reply") already documents
  // and honors the real guarantee this module can make ("pausing the real <audio> element is the
  // one thing this module can guarantee synchronously, regardless of whether the model itself ever
  // honors any server-side stop request") - disconnect() now gives that exact same immediate,
  // synchronous silence, while the billing-accurate graceful close/teardown below is unchanged.
  function disconnect() {
    intentionalClose = true;
    connectionEpoch += 1;
    clearReconnectTimer();
    reconnectAttempt = 0;
    pauseLocalAudio();
    stopSpeaking('output_audio_buffer.cleared');
    settleSpeak();
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
    // An interrupt (a confirmed barge-in, or an explicit "Stop reply") is itself a genuine turn
    // boundary - the user has moved on from the utterance that was just flushed, so its own
    // POST_TURN_STRAY_FRAGMENT_MS grace no longer applies to whatever they say next; without this,
    // a fast reaction after an explicit "Stop reply" click could have its own first fragment(s)
    // wrongly discarded as a straggler of the abandoned utterance.
    lastFlushedAtMs = null;
    // TURN-BOUNDARY REPAIR item 4: the next speak() call must not resume playback straight from
    // wherever this <audio> element's internal buffer was left - see resetAudioSink()'s own
    // comment for why a live WebRTC stream still needs this even though pausing is not a "seek".
    audioSinkNeedsRebuild = true;
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
    // TURN-BOUNDARY REPAIR item 2: an explicit interrupt (confirmBargeIn() already cleared its own
    // candidate before calling onBargeIn(), which is what led here for a real barge-in - so this
    // only ever actually finds something pending for the OTHER case, an explicit "Stop reply"
    // button press landing while a not-yet-confirmed candidate is still buffered) is promoted into
    // ordinary accumulation now rather than left stranded with no timer of its own armed.
    const hadCandidate = !!bargeInCandidate;
    promoteBargeInCandidateAsOrdinarySpeech();
    if (state !== VOICE_STATES.ERROR) setState(hadCandidate ? VOICE_STATES.USER_SPEAKING : VOICE_STATES.LISTENING);
  }

  function finishUserTurn() {
    // No documented client message ends just the current turn early under continuous, real-media,
    // server-managed turn detection - honestly reports no real capability, same posture as
    // geminiLiveVoice.js's own finishUserTurn()/supportsManualFinish().
    return false;
  }
  function supportsManualFinish() { return false; }
  function markPlaybackEnded() { if (state === VOICE_STATES.ASSISTANT_SPEAKING) setState(VOICE_STATES.LISTENING); }
  // Live caption fix: unlike the retired Realtime transport (VoiceConsole.jsx's own header
  // comment: only a *finalized* transcript is ever exposed), this transport genuinely streams live
  // input/output transcript fragments (onInputTranscript/onOutputTranscript above) - same
  // capability-accessor convention as supportsManualFinish() so chatDockView.jsx can tell adapters
  // apart without hardcoding a transport name. Mirrored by Gemini's own adapter reporting false (or
  // simply not implementing this accessor at all, which chatDockView.jsx's own defensive read
  // treats identically) so its console keeps today's exact "reveal only once finalized" look.
  function supportsLiveCaption() { return true; }

  // Speaks NAVRYA's own already-approved text back, verbatim - never GPT-Live's own paraphrase of
  // it (see this file's header comment for the documented "commentary causes paraphrasing" risk
  // this wrapper mitigates, not eliminates). `entry` is the caller's own playback-queue entry (see
  // ai-voice-playback-controller.js's enqueue()) - only its gptLiveTurnId field is read here, when
  // present, to look up the turn's own correlated delegation (see DELEGATION-CORRELATION REPAIR
  // above). Resolves once the output-transcript stream actually goes quiet
  // (OUTPUT_TRANSCRIPT_QUIET_MS's own heuristic), SPEAK_SAFETY_TIMEOUT_MS elapses, or (while still
  // waiting on a delegation) SPEAK_DELEGATION_WAIT_MS elapses with none ever pairing - whichever
  // comes first. Always eventually resolves (never rejects) so PlaybackController's own queue can
  // never wedge on this call - a missing delegation is reported through onSpeakError, not a thrown/
  // rejected promise, matching every other failure mode in this function.
  function speak(text, entry) {
    if (!text || !dc || dc.readyState !== 'open') return Promise.resolve();
    const turnId = entry && entry.gptLiveTurnId != null ? entry.gptLiveTurnId : null;

    return new Promise((resolve) => {
      let settled = false;
      let safetyTimer = null;
      let delegationWaitTimer = null;
      function settleOnceOuter() {
        if (settled) return;
        settled = true;
        if (safetyTimer) clearTimeout(safetyTimer);
        if (delegationWaitTimer) clearTimeout(delegationWaitTimer);
        if (turnId != null) pendingDelegationWaiters.delete(turnId);
        pendingSpeakSettle = null;
        resolve();
      }
      // Wired for the WHOLE lifetime of this call, at every phase (waiting on a delegation, or
      // already sending commentary) - interrupt()/teardown() only ever need this one slot to
      // cancel this call cleanly no matter how far it has gotten, exactly like before this pass.
      pendingSpeakSettle = settleOnceOuter;

      function sendCommentaryAndAwaitSettle(delegationId) {
        if (settled || !dc || dc.readyState !== 'open') { settleOnceOuter(); return; }
        // Only set once commentary is actually about to be sent - not while still waiting on a
        // delegation - so a stray output_transcript.delta can never be mis-attributed to a call
        // that has not sent anything yet (see activeSpeakToken's own declaration comment).
        const token = {};
        activeSpeakToken = token;
        pendingOutputTranscript = '';
        if (audioSinkNeedsRebuild) { resetAudioSink(); audioSinkNeedsRebuild = false; }
        resumeLocalAudio();
        const verbatim = 'Speak exactly the following sentence, verbatim, in the same language it is written in, with no paraphrasing, no additions, and no omissions: ' + text;
        send({ type: 'session.commentary.append', delegation_id: delegationId, content: verbatim.length > COMMENTARY_MAX_CHARS ? verbatim.slice(0, COMMENTARY_MAX_CHARS) : verbatim });
        safetyTimer = setTimeout(settleOnceOuter, SPEAK_SAFETY_TIMEOUT_MS);
      }

      if (turnId == null) {
        // Unprompted/system-initiated speech (the Companion opening, an AI-analysis narration) -
        // never tied to a flushed user utterance, so there is no per-turn delegation to correlate
        // against at all. Sent with delegation_id:null rather than silently refusing to speak at
        // all (the previous behavior, via the old unconditional `!currentDelegationId` guard) -
        // the "officially supported optional delegation behavior" case, distinct from a real user
        // turn whose delegation is merely late (handled below).
        sendCommentaryAndAwaitSettle(null);
        return;
      }
      const existing = delegationByTurnId.get(turnId);
      if (existing !== undefined) { sendCommentaryAndAwaitSettle(existing); return; }
      // A real user turn whose reply is ready before this exact turn's own delegation.created has
      // arrived - confirmed possible (see this file's own header comment). Wait a bounded amount
      // rather than either silently dropping the reply (the confirmed production defect this
      // fixes) or reusing a stale delegation from a different turn.
      delegationWaitTimer = setTimeout(() => {
        pendingDelegationWaiters.delete(turnId);
        if (settled) return;
        onSpeakError({ code: 'GPT_LIVE_DELEGATION_MISSING', turnId: turnId });
        settleOnceOuter();
      }, SPEAK_DELEGATION_WAIT_MS);
      pendingDelegationWaiters.set(turnId, (delegationId) => {
        if (delegationWaitTimer) { clearTimeout(delegationWaitTimer); delegationWaitTimer = null; }
        sendCommentaryAndAwaitSettle(delegationId);
      });
    });
  }

  // No ElevenLabs-substitution path exists for this transport (GPT-Live always speaks in its own
  // native voice over the live WebRTC connection) - kept as a resolved no-op purely so
  // PlaybackController's generic wiring (navrya-src/chatDockView.jsx) never has to branch by
  // transport to know whether this method exists at all, exactly like every other transport's own
  // contract.
  function playAudioUrl() { return Promise.resolve(); }

  return {
    connect, disconnect, mute, interrupt, speak, playAudioUrl, finishUserTurn, supportsManualFinish, markPlaybackEnded, supportsLiveCaption,
    setLanguage: (value) => { language = value || 'en'; }, setEagerness: () => false,
    state: () => state, isMuted: () => muted, getMediaStream: () => mediaStream,
    // Provider Ownership addendum, section 1's own convention: reasoning already follows the real
    // active provider unchanged (chatDockView.jsx never overrides it), so this just reports the
    // truth for the same debug-transparency purpose the other two adapters' own provider() getter
    // already serves.
    provider: () => 'openai',
    // Dev diagnostic only - state/language/session-active/recent-event *types*, never the
    // transcript text or any credential, matching aiVoiceRealtime.js's own debugState() privacy
    // contract. Extended this pass with non-content turn-boundary bookkeeping counts (testable
    // structure, still zero transcript/credential exposure) so the new state machine is inspectable
    // the same honest way the rest of this module's diagnostics already are.
    debugState: () => ({
      state, language, sessionActive: !!pc, connectionEpoch,
      hasBargeInCandidate: !!bargeInCandidate,
      unpairedFlushedTurnCount: unpairedFlushedTurnIds.length,
      pendingUnclaimedDelegationCount: pendingUnclaimedDelegationIds.length,
      pendingDelegationWaitCount: pendingDelegationWaiters.size
    })
  };
}
