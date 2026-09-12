import { VOICE_STATES } from './aiVoiceRealtime.js';
import { createSpeechActivityDetector } from './geminiSpeechActivityDetector.js';

// Keep the browser on NAVRYA's own origin. Direct browser -> Google WebSocket connections are
// not dependable from every production network/region, while the server can reach Gemini
// consistently. The gateway validates the user's session and the one-use token lease before it
// opens the upstream socket; the wire protocol below remains byte-for-byte Gemini Live.
const LIVE_SOCKET_PATH = '/api/ai/gemini-live/socket';
const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
const LIVE_TRANSCRIPTION_LOCALES = Object.freeze({ fa: 'fa-IR', ar: 'ar-EG', en: 'en-US', es: 'es-ES' });

// Slice R2 (transport repair), audit finding T8: bounds the WHOLE startup sequence (mic + token
// mint + AudioContext resume + socket setup combined), not just socket setup alone - mirroring
// aiVoiceRealtime.js's own CONNECT_TIMEOUT_MS via the same Promise.race pattern.
const CONNECT_TIMEOUT_MS = 15000;
// Slice R2, audit finding T7: bounded exponential backoff with jitter for an UNEXPECTED close
// (network hiccup, server-side close) - never for a user-initiated disconnect() (see
// intentionalClose below). Identical constants/formula to aiVoiceRealtime.js's own reconnect
// policy - one bounded-retry contract for both transports, per the brief's own "apply equivalent
// bounded Gemini recovery" instruction.
const RECONNECT_BASE_DELAY_MS = 500;
const RECONNECT_MAX_DELAY_MS = 8000;
const RECONNECT_MAX_ATTEMPTS = 5;
// Slice R2, audit findings T13/T14: verified against the Gemini Live API's own documented
// behavior (ai.google.dev/api/live) and a confirmed, still-open upstream gap
// (googleapis/js-genai#1429) - every inputTranscription message is only ever a FRAGMENT of the
// current utterance, never the full accumulated text, and the documented per-fragment `finished`
// flag is not reliably sent by the server. `finished:true` is honored immediately when the server
// does send it; otherwise, a short quiet window with no new fragment is the resilient fallback
// boundary - see flushTranscript()'s own comment.
const TRANSCRIPT_FRAGMENT_QUIET_MS = 700;
// Voice Mode hardening, audit finding T11 (published-audio ownership): mirrors
// aiVoiceRealtime.js's own FIRST_AUDIO_DEADLINE_MS/PLAYBACK_STALL_DEADLINE_MS exactly - a
// two-stage deadline (nothing-ever-started vs a genuine mid-playback stall) for playAudioUrl()
// below, which - unlike playPcm()'s own already-decoded buffer with a known exact duration - has
// no a-priori duration to compute a tighter bound from.
const FIRST_AUDIO_DEADLINE_MS = 12000;
const PLAYBACK_STALL_DEADLINE_MS = 60000;

function normalizeLanguage(value) {
  return Object.prototype.hasOwnProperty.call(LIVE_TRANSCRIPTION_LOCALES, value) ? value : 'en';
}

function errorCode(error) {
  return error && (error.code || (error.name && error.name !== 'Error' ? error.name : '') || error.message) || 'GEMINI_LIVE_FAILED';
}
function microphoneStage(error) {
  if (error && error.name === 'NotAllowedError') return 'microphone_permission';
  if (error && (error.name === 'NotFoundError' || error.name === 'NotReadableError')) return 'microphone_unavailable';
  return 'microphone_failed';
}
function base64FromBytes(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  return btoa(binary);
}
function bytesFromBase64(value) {
  const binary = atob(String(value || ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
function pcm16(samples, sourceRate) {
  const ratio = sourceRate / INPUT_SAMPLE_RATE;
  const length = Math.max(1, Math.round(samples.length / ratio));
  const bytes = new Uint8Array(length * 2);
  const view = new DataView(bytes.buffer);
  let energy = 0;
  for (let index = 0; index < length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[Math.min(samples.length - 1, Math.floor(index * ratio))] || 0));
    energy += sample * sample;
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return { bytes, energy: Math.sqrt(energy / length) };
}
function audioBufferFromPcm(context, bytes) {
  const frames = Math.floor(bytes.length / 2);
  const buffer = context.createBuffer(1, frames, OUTPUT_SAMPLE_RATE);
  const output = buffer.getChannelData(0);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index < frames; index += 1) output[index] = view.getInt16(index * 2, true) / 0x8000;
  return buffer;
}
function socketMessageText(value) {
  if (typeof value === 'string') return Promise.resolve(value);
  if (value instanceof ArrayBuffer) return Promise.resolve(new TextDecoder().decode(value));
  if (typeof Blob !== 'undefined' && value instanceof Blob) return value.text();
  return Promise.reject(new Error('GEMINI_LIVE_MESSAGE_INVALID'));
}

// Gemini Live supplies final transcription. Gemini TTS speaks only NAVRYA's already-approved
// reply, preserving the existing single decision and action path for voice and typed input.
export function createGeminiLiveSession(options) {
  options = options || {};
  let language = normalizeLanguage(options.language);
  let state = VOICE_STATES.IDLE;
  let muted = false;
  let mediaStream = null;
  let audioContext = null;
  let micNode = null;
  let processor = null;
  let socket = null;
  let activeSource = null;
  let playbackStop = null;
  let intentionalClose = false;
  // Slice R2, audit finding T7: bumped once per genuine new connect() attempt (mirrors
  // aiVoiceRealtime.js's own connectionEpoch) - a listener/timer registered against a specific
  // socket/attempt closes over the epoch active when it was registered and checks it before
  // mutating state, so a superseded attempt can never clobber current state.
  let connectionEpoch = 0;
  let reconnectAttempt = 0;
  let reconnectTimer = null;
  // Slice R2, audit findings T13/T14: fragments accumulated for the utterance currently in
  // progress - see flushTranscript()'s own comment for the full boundary-detection contract.
  let pendingTranscript = '';
  let transcriptFlushTimer = null;
  // Slice R2, audit finding T5 (parity with aiVoiceRealtime.js's own fix): identifies the
  // CURRENTLY active speak() call across its own async fetch gap, so interrupt() can cancel it
  // even before playback (and thus playbackStop) exists yet.
  let activeSpeakToken = null;
  // Voice Mode hardening, section 6: real AbortControllers for the token mint and TTS fetches -
  // activeSpeakToken/connectionEpoch already stop a stale RESULT from ever being adopted (see
  // interrupt()'s and connect()'s own comments); these additionally stop the actual network
  // request/server-side work itself for a mint/TTS call nobody will ever use, mirroring
  // aiVoiceRealtime.js's own connectAbortController/speakAbortController.
  let connectAbortController = null;
  let speakAbortController = null;
  // Provider Ownership addendum, section 6/4: this is the confirmed non-streaming TTS path (see
  // docs/ai/voice-architecture.md's "Gemini TTS streaming investigation" - the REST
  // :generateContent endpoint returns one complete audio buffer, never incremental chunks), so
  // "time from fetch start to fetch resolved" IS effectively "time to first audible sound" here -
  // nothing plays before that promise settles. Recorded per-call (overwritten every speak()),
  // never persisted, sanitized to duration/length only - same privacy posture as every other
  // debug* diagnostic in this file/aiVoiceRealtime.js.
  let lastSpeakLatencyRecord = null;
  function nowMs() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

  const onStateChange = options.onStateChange || function () {};
  const onFinalTranscript = options.onFinalTranscript || function () {};
  const onMuteChange = options.onMuteChange || function () {};
  const onError = options.onError || function () {};
  const onOutputAudioBufferEvent = options.onOutputAudioBufferEvent || function () {};
  const onBargeIn = options.onBargeIn || function () {};
  const fetchSession = options.fetchSession;
  const fetchSpeakAudio = options.fetchSpeakAudio;

  function setState(next) { state = next; onStateChange(next); }
  function stopPlayback(natural) {
    const stop = playbackStop;
    playbackStop = null;
    if (activeSource) { try { activeSource.stop(); } catch (_) {} activeSource = null; }
    if (stop) stop(!!natural);
  }
  function clearReconnectTimer() { if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; } }
  function clearTranscriptFlushTimer() { if (transcriptFlushTimer) { clearTimeout(transcriptFlushTimer); transcriptFlushTimer = null; } }
  // "Finish NAVRYA Voice Mode" brief, section 5.4: a genuinely dead microphone track (device
  // unplugged, permission revoked mid-session, exclusive access taken by another app) fires a
  // real, native 'ended' event on the MediaStreamTrack itself - distinct from every teardown path
  // this file already handles (disconnect()/reconnect all go through teardown(), which stops
  // tracks itself and never reaches this listener again once torn down). myEpoch guards against a
  // track from an already-superseded connect() attempt reporting through late.
  function wireMicTrackLifecycle(stream, myEpoch) {
    const tracks = stream && typeof stream.getAudioTracks === 'function' ? stream.getAudioTracks() : [];
    tracks.forEach((track) => {
      track.addEventListener('ended', () => {
        if (myEpoch !== connectionEpoch) return; // this connection generation is already gone - not our concern any more
        if (state === VOICE_STATES.IDLE || state === VOICE_STATES.ERROR) return; // already ended/failed through some other path
        teardown();
        connectionEpoch += 1; // invalidate every in-flight/scheduled listener and reconnect from this now-dead generation, same as a real disconnect()
        clearReconnectTimer();
        reportFailure(Object.assign(new Error('microphone track ended'), { code: 'MICROPHONE_TRACK_ENDED' }), 'microphone_lost');
      });
    });
  }
  function teardown() {
    stopPlayback(false);
    clearTranscriptFlushTimer();
    pendingTranscript = '';
    if (processor) { try { processor.disconnect(); } catch (_) {} processor.onaudioprocess = null; processor = null; }
    if (micNode) { try { micNode.disconnect(); } catch (_) {} micNode = null; }
    if (mediaStream) { mediaStream.getTracks().forEach((track) => track.stop()); mediaStream = null; }
    if (socket) {
      const closingSocket = socket;
      socket = null;
      closingSocket.onopen = closingSocket.onmessage = closingSocket.onerror = closingSocket.onclose = null;
      try { closingSocket.close(); } catch (_) {}
    }
    if (audioContext) { audioContext.close().catch(() => {}); audioContext = null; }
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
    if (code === 'PROVIDER_TIMEOUT' || code === 'GEMINI_LIVE_CONNECT_TIMEOUT') return 'token_mint_timeout';
    return 'live_connection';
  }
  // Slice R2, audit finding T1-equivalent for Gemini: these stages never benefit from a retry -
  // mirrors aiVoiceRealtime.js's own TERMINAL_CONNECT_STAGES so both transports treat the same
  // failure classes as non-retryable.
  const TERMINAL_FAILURE_STAGES = { session_auth: true, key_missing: true, key_rejected: true, model_unavailable: true };
  function send(message) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  }
  function wireMicrophone() {
    micNode = audioContext.createMediaStreamSource(mediaStream);
    // Natural Listening addendum, Section 2/3: a fresh detector per real connection (this
    // function only ever runs once per successful connect() - see that function's own call
    // site) - a reconnect or a brand-new session must never inherit a stale "already speaking"
    // or "recently barged-in" state from a torn-down prior capture. See
    // geminiSpeechActivityDetector.js's own top-of-file comment for the full rationale (calibrated
    // adaptive floor, hysteresis, minimum speech/silence durations, barge-in cooldown) - this
    // replaces the old fixed energy threshold with no minimum-duration requirement at all, which
    // could flip to USER_SPEAKING (and fire onBargeIn on every single frame of an overlap) off a
    // single loud frame of background noise.
    const speechDetector = createSpeechActivityDetector();
    processor = audioContext.createScriptProcessor(2048, 1, 1);
    processor.onaudioprocess = (event) => {
      if (muted || !socket || socket.readyState !== WebSocket.OPEN) return;
      const result = pcm16(event.inputBuffer.getChannelData(0), audioContext.sampleRate);
      const activity = speechDetector.process(result.energy, Date.now());
      if (activity.becameSpeaking) {
        // Local detection controls UI/barge-in state only - it never invents or edits the
        // transcript; Gemini Live's own server-side VAD and finalized transcript (see
        // flushTranscript() below) remain the sole authority on when the user's turn actually
        // ended and what was said.
        if (activity.bargeIn && state === VOICE_STATES.ASSISTANT_SPEAKING) onBargeIn();
        if (state === VOICE_STATES.LISTENING || state === VOICE_STATES.INTERRUPTED) setState(VOICE_STATES.USER_SPEAKING);
      } else if (activity.becameQuiet && state === VOICE_STATES.USER_SPEAKING) {
        setState(VOICE_STATES.LISTENING);
      }
      send({ realtimeInput: { audio: { data: base64FromBytes(result.bytes), mimeType: 'audio/pcm;rate=16000' } } });
    };
    micNode.connect(processor);
    processor.connect(audioContext.destination);
  }
  // Slice R2, audit findings T13/T14: flushes whatever fragments have accumulated for the
  // utterance in progress as ONE finalized transcript - called either immediately (the server's
  // own documented `finished:true`, when it actually sends it) or after TRANSCRIPT_FRAGMENT_QUIET_MS
  // of silence on the transcription stream itself (the resilient fallback for the confirmed gap
  // where `finished` is not always sent). Replaces the old per-message dedup Set entirely: since
  // each utterance now goes through its own accumulate-then-flush cycle, two genuinely separate
  // utterances with identical text (e.g. two separate "yes" answers) are never conflated, and a
  // multi-fragment utterance is no longer split into several garbled onFinalTranscript() calls.
  function flushTranscript() {
    clearTranscriptFlushTimer();
    const text = pendingTranscript.trim();
    pendingTranscript = '';
    if (!text) return;
    setState(VOICE_STATES.PROCESSING);
    onFinalTranscript(text);
  }
  function playPcm(audioBase64) {
    return new Promise((resolve, reject) => {
      try {
        const buffer = audioBufferFromPcm(audioContext, bytesFromBase64(audioBase64));
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        activeSource = source;
        let settled = false;
        // Slice R2, audit finding T6 (parity for Gemini's own PCM path, which previously had NO
        // watchdog at all): the buffer's own known duration gives an exact, non-guessed deadline -
        // more precise than a generic stall detector, and still a genuine last resort (natural
        // 'onended' is the real settlement path; this only recovers a truly stuck source).
        const timeoutMs = Math.ceil(buffer.duration * 1000) + 3000;
        const timer = setTimeout(() => settle(false), timeoutMs);
        function settle(natural) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (activeSource === source) activeSource = null;
          playbackStop = null;
          onOutputAudioBufferEvent(natural ? 'output_audio_buffer.stopped' : 'output_audio_buffer.cleared', null);
          resolve();
        }
        playbackStop = settle;
        source.onended = () => settle(true);
        onOutputAudioBufferEvent('output_audio_buffer.started', null);
        source.start();
      } catch (error) { reject(error); }
    });
  }
  // Slice R2, audit finding T8: the deadline argument is the SAME shared Promise the outer
  // connect() races the whole startup sequence against - openSocket() no longer owns its own
  // separate 15s timer scoped just to socket setup.
  function openSocket(creds, myEpoch, deadline) {
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${protocol}//${window.location.host}${LIVE_SOCKET_PATH}?access_token=${encodeURIComponent(creds.token)}`;
      socket = new WebSocket(url);
      socket.binaryType = 'arraybuffer';
      let settled = false;
      function fail(error) {
        if (settled) return;
        settled = true;
        reject(error);
      }
      deadline.catch(fail);
      socket.onopen = () => {
        send({ setup: {
          model: `models/${creds.model}`,
          generationConfig: { responseModalities: ['TEXT'] },
          inputAudioTranscription: { languageCodes: [LIVE_TRANSCRIPTION_LOCALES[language]], mode: 'SMART' }
        } });
      };
      socket.onmessage = async (event) => {
        let message;
        try { message = JSON.parse(await socketMessageText(event.data)); } catch (_) { return; }
        if (myEpoch !== connectionEpoch) return; // a stale socket from a superseded attempt
        if (message.error) {
          const error = new Error(`GEMINI_LIVE_SETUP_FAILED_${message.error.code || 'UNKNOWN'}`);
          error.code = error.message;
          // Slice R2, audit finding T9: the old code only ever handled this branch pre-settle -
          // a post-setup server error (message.error arriving after setupComplete) was silently
          // dropped unless a close event happened to follow it too. Every error is now handled,
          // whichever side of `settled` it lands on.
          if (!settled) { fail(error); } else { failAndCleanup(error, failureStage(error)); }
          return;
        }
        if (message.setupComplete) {
          if (settled) return;
          settled = true;
          setState(VOICE_STATES.LISTENING);
          resolve();
          return;
        }
        const content = message.serverContent || {};
        const fragment = content.inputTranscription && typeof content.inputTranscription.text === 'string' ? content.inputTranscription.text : '';
        if (fragment) {
          pendingTranscript += fragment;
          clearTranscriptFlushTimer();
          if (content.inputTranscription.finished) { flushTranscript(); } else { transcriptFlushTimer = setTimeout(flushTranscript, TRANSCRIPT_FRAGMENT_QUIET_MS); }
        }
      };
      socket.onerror = () => fail(new Error('GEMINI_LIVE_SOCKET_FAILED'));
      socket.onclose = () => {
        if (myEpoch !== connectionEpoch) return; // superseded - a fresh connect()/disconnect() already ran
        if (intentionalClose || state === VOICE_STATES.IDLE || state === VOICE_STATES.ERROR) return;
        const error = new Error('GEMINI_LIVE_SOCKET_CLOSED');
        if (!settled) {
          fail(error);
        } else {
          // Slice R2, audit finding T7: an unexpected post-setup close previously went straight to
          // terminal failAndCleanup() - now it enters the same bounded reconnect loop
          // aiVoiceRealtime.js's own transport drop handling already gets.
          scheduleReconnect(myEpoch);
        }
      };
    });
  }
  // Slice R2, audit finding T7: mirrors aiVoiceRealtime.js's own scheduleReconnect() - bounded
  // exponential backoff with jitter, abandoned if a newer connect()/disconnect() has since run,
  // never retrying a business side effect (only ever calls connect() again).
  function scheduleReconnect(myEpoch) {
    if (myEpoch !== connectionEpoch) return; // superseded by a newer connection already - not our concern any more
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
      if (myEpoch !== connectionEpoch) return; // a fresh connect()/disconnect() happened while we were waiting
      connect({ isReconnect: true }).catch(() => {}); // connect() itself already reports failure via onError/setState
    }, jitter);
  }
  async function connect(connectOptions) {
    const isReconnect = !!(connectOptions && connectOptions.isReconnect);
    // Retrying after an error must not reuse a microphone/socket/context from the failed attempt.
    teardown();
    intentionalClose = false;
    if (!isReconnect) { reconnectAttempt = 0; clearReconnectTimer(); }
    const myEpoch = ++connectionEpoch;
    // Slice R2, audit finding T8: ONE overall deadline for the whole attempt (mic + token mint +
    // AudioContext resume + socket setup combined) - mirrors aiVoiceRealtime.js's own connect().
    let timedOut = false;
    const deadline = new Promise((_resolve, reject) => {
      setTimeout(() => {
        timedOut = true;
        reject(Object.assign(new Error('GEMINI_LIVE_CONNECT_TIMEOUT'), { name: 'GEMINI_LIVE_CONNECT_TIMEOUT' }));
      }, CONNECT_TIMEOUT_MS);
    });
    deadline.catch(() => {});
    setState(isReconnect ? VOICE_STATES.RECONNECTING : VOICE_STATES.REQUESTING_PERMISSION);
    const micPromise = navigator.mediaDevices.getUserMedia({ audio: true });
    // Slice R2, audit finding T2-equivalent for Gemini: a grant that resolves after the deadline
    // already rejected (or after a newer connect()/disconnect() ran) must never be left as a live
    // orphaned track - stop it the moment it arrives, regardless of which path won the race below.
    micPromise.then((stream) => { if (myEpoch !== connectionEpoch) { try { stream.getTracks().forEach((track) => track.stop()); } catch (_) {} } }, () => {});
    let grantedStream;
    try {
      grantedStream = await Promise.race([micPromise, deadline]);
    } catch (error) {
      if (myEpoch !== connectionEpoch) return;
      reportFailure(error, timedOut ? 'token_mint_timeout' : microphoneStage(error));
      throw error;
    }
    if (myEpoch !== connectionEpoch) {
      try { grantedStream.getTracks().forEach((track) => track.stop()); } catch (_) {}
      return;
    }
    mediaStream = grantedStream;
    // "Finish NAVRYA Voice Mode" brief, section 5.4: same reasoning as aiVoiceRealtime.js's own
    // wireMicTrackLifecycle() - a genuinely dead mic track (device unplugged, permission revoked,
    // exclusive access lost) mid-session had nothing listening for it before this pass, leaving
    // the UI stuck showing whatever state it was already in with no error and no recovery path.
    wireMicTrackLifecycle(mediaStream, myEpoch);
    // Voice Mode hardening, section 6: a real AbortController for the token mint - declared OUTSIDE
    // the try block below (not `const` inside it) specifically so the catch block can still
    // compare against it for cleanup; a try-scoped `const`/`let` is not visible in its own catch.
    // disconnect() aborts connectAbortController directly (see that function's own comment),
    // stopping the actual network request for a mint nobody will use, not merely discarding an
    // already-completed response via the pre-existing connectionEpoch check a few lines below.
    let mintAbortController = null;
    try {
      if (!isReconnect) setState(VOICE_STATES.CONNECTING);
      mintAbortController = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      connectAbortController = mintAbortController;
      const creds = await Promise.race([fetchSession(language, { signal: mintAbortController && mintAbortController.signal }), deadline]);
      if (connectAbortController === mintAbortController) connectAbortController = null;
      if (myEpoch !== connectionEpoch) return;
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      await Promise.race([audioContext.resume(), deadline]);
      if (myEpoch !== connectionEpoch) return;
      wireMicrophone();
      await openSocket(creds, myEpoch, deadline);
      if (myEpoch !== connectionEpoch) return;
      reconnectAttempt = 0;
    } catch (error) {
      // This attempt is over one way or another - clear only if it is still OUR OWN reference; a
      // newer connect() that has since started (myEpoch !== connectionEpoch below) already
      // installed its own controller here, which must never be cleared by this older attempt
      // settling late.
      if (connectAbortController === mintAbortController) connectAbortController = null;
      if (myEpoch !== connectionEpoch) return;
      const stage = timedOut ? 'token_mint_timeout' : failureStage(error);
      // Slice R2, audit finding T1-equivalent for Gemini: a reconnect attempt that itself fails
      // continues the SAME bounded retry loop (mirrors aiVoiceRealtime.js's own fix) rather than
      // ending in terminal ERROR after only one retry, unless the failure is terminal-class or
      // attempts are exhausted.
      if (isReconnect && !TERMINAL_FAILURE_STAGES[stage] && reconnectAttempt < RECONNECT_MAX_ATTEMPTS) {
        scheduleReconnect(myEpoch);
        return;
      }
      failAndCleanup(error, stage);
      throw error;
    }
  }
  function disconnect() {
    intentionalClose = true;
    connectionEpoch += 1; // invalidate every in-flight/scheduled listener and reconnect from this connection generation
    clearReconnectTimer();
    reconnectAttempt = 0;
    // Voice Mode hardening, section 6: actually abort a still-in-flight token mint or TTS fetch,
    // not merely let it complete and have its result discarded by the epoch/token checks above -
    // a no-op when nothing is currently pending.
    if (connectAbortController) { try { connectAbortController.abort(); } catch (_) {} connectAbortController = null; }
    if (speakAbortController) { try { speakAbortController.abort(); } catch (_) {} speakAbortController = null; }
    teardown();
    muted = false;
    onMuteChange(false);
    setState(VOICE_STATES.IDLE);
  }
  function mute(next) { muted = !!next; onMuteChange(muted); }
  function interrupt() {
    // Bugfix (2026-09-10): mirror aiVoiceRealtime.js's own `if (!session) return;` guard, which
    // this function never had. PlaybackController.invalidate() (ai-voice-playback-controller.js)
    // always calls through to this adapter's interrupt() "for safety/idempotency" even when
    // nothing is locally playing/queued - documented there as relying on the transport's own
    // interrupt() to "already no-op harmlessly if there is genuinely nothing to cancel". That was
    // true for OpenAI (session is null post-disconnect) but NOT here: with no connection guard at
    // all, `state !== ERROR` was the only condition, and disconnect() leaves state IDLE (not
    // ERROR) - so endVoice()/the mic-toggle-off path (both call disconnect() then
    // playbackController.invalidate()) resurrected state straight back to LISTENING immediately
    // after the transport had already been torn down. Confirmed live: pressing the Voice console's
    // own X (or Esc, or the mic toggle) from a Gemini ERROR/any state silently flipped back to a
    // phantom "Listening" display instead of actually closing Voice Mode - the exact reported bug.
    // `socket` is nulled by teardown() (called from disconnect()/failAndCleanup()/scheduleReconnect
    // between attempts), so this is false whenever there is genuinely no live connection to
    // interrupt, without disturbing the real barge-in/"Stop reply" path (always socket-connected).
    if (!socket) return;
    // Slice R2, audit finding T5 (parity with aiVoiceRealtime.js): invalidate the active speak()
    // call first - a pending fetchSpeakAudio() call has nothing else to cancel it, and would
    // otherwise still start playback once it resolves.
    activeSpeakToken = null;
    // Voice Mode hardening, section 6: also actually abort the underlying TTS fetch when one is in
    // flight - activeSpeakToken above already stops its RESULT from ever being adopted; this
    // additionally stops the real network request/server-side synthesis work.
    if (speakAbortController) { try { speakAbortController.abort(); } catch (_) {} speakAbortController = null; }
    stopPlayback(false);
    if (state !== VOICE_STATES.ERROR) setState(VOICE_STATES.LISTENING);
  }
  function finishUserTurn() {
    // Slice R2, audit finding T12: Gemini Live's automatic-VAD session (this module's only
    // supported mode) has no client message that ends just the current turn early - the
    // documented mechanism (activityEnd) is only honored by the server when
    // realtimeInputConfig.automaticActivityDetection.disabled is set at setup time (verified
    // against ai.google.dev's Live API docs), which would replace this module's entire
    // turn-detection model with manual, client-driven VAD - a materially different, riskier
    // architecture change reserved for a future slice, not silently adopted here. Do not send
    // audioStreamEnd here either: that declares the entire stream finished and would break the
    // next turn in a multi-turn NAVRYA conversation. Honestly reports no real capability (see
    // supportsManualFinish()) rather than performing a no-op state change that looks like it
    // worked.
    return false;
  }
  // Slice R2, audit finding T12: lets the caller (chatDockView.jsx/VoiceConsole.jsx) hide or
  // disable the shared "End message" control for this adapter instead of presenting a button that
  // does nothing meaningful - see finishUserTurn()'s own comment for why.
  function supportsManualFinish() { return false; }
  function markPlaybackEnded() { if (state === VOICE_STATES.ASSISTANT_SPEAKING) setState(VOICE_STATES.LISTENING); }
  function speak(text) {
    if (!text || !fetchSpeakAudio) return Promise.resolve();
    setState(VOICE_STATES.ASSISTANT_SPEAKING);
    const token = {};
    activeSpeakToken = token;
    // "Finish NAVRYA Voice Mode" brief, section 5.2: activeSpeakToken alone only catches an
    // explicit interrupt()/disconnect() (the only two places that ever null it) - an UNEXPECTED
    // disconnect+automatic reconnect (scheduleReconnect()/connect()) bumps connectionEpoch but
    // never touches activeSpeakToken at all (confirmed against connect()/teardown()/
    // scheduleReconnect() - none of them reference it). Without this second check, a TTS fetch
    // already in flight when the socket unexpectedly drops would still find token ===
    // activeSpeakToken once it resolves post-reconnect, and would play the OLD utterance's audio
    // through whatever audioContext/activeSource the NEW connection generation now owns - exactly
    // the "played through a replacement connection" failure this section forbids. Captured once,
    // up front, and re-checked at the same point activeSpeakToken already is.
    const myConnectionEpoch = connectionEpoch;
    // Voice Mode hardening, section 6: a real AbortController for the TTS fetch - interrupt()/
    // disconnect() abort it directly, stopping the actual network request/server-side synthesis
    // work for audio nobody will ever hear, on top of the pre-existing activeSpeakToken check.
    const abortController = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    speakAbortController = abortController;
    const fetchStartedAt = nowMs();
    const textLength = text.length;
    return Promise.resolve(fetchSpeakAudio(language, text, { signal: abortController && abortController.signal })).then((result) => {
      const fetchMs = Math.round((nowMs() - fetchStartedAt) * 100) / 100;
      if (speakAbortController === abortController) speakAbortController = null;
      if (token !== activeSpeakToken || myConnectionEpoch !== connectionEpoch) {
        lastSpeakLatencyRecord = { textLength: textLength, fetchMs: fetchMs, interrupted: true, at: new Date().toISOString() };
        return; // interrupted before playback began, or superseded by a reconnect mid-fetch
      }
      lastSpeakLatencyRecord = { textLength: textLength, fetchMs: fetchMs, interrupted: false, at: new Date().toISOString() };
      return playPcm(result.audioBase64);
    }).then(() => {
      if (myConnectionEpoch === connectionEpoch && state === VOICE_STATES.ASSISTANT_SPEAKING) setState(VOICE_STATES.LISTENING);
    }).catch((error) => {
      const fetchMs = Math.round((nowMs() - fetchStartedAt) * 100) / 100;
      if (speakAbortController === abortController) speakAbortController = null;
      lastSpeakLatencyRecord = { textLength: textLength, fetchMs: fetchMs, interrupted: true, error: errorCode(error), at: new Date().toISOString() };
      if (token === activeSpeakToken && myConnectionEpoch === connectionEpoch) reportFailure(error, 'tts');
    });
  }
  // Voice Mode hardening, audit finding T11: this used to create a completely unowned local Audio
  // element - not registered in `playbackStop` (the one slot interrupt()/teardown() already know
  // how to stop), never setting ASSISTANT_SPEAKING, and never emitting the output_audio_buffer.*
  // events PlaybackController relies on for captions/settlement. A barge-in or End Voice could
  // therefore never actually stop a playing published clip. Rewritten to give published audio the
  // exact same ownership contract playPcm() already has: registered in the shared `playbackStop`
  // slot, real state/caption/interrupt/disconnect parity, and a two-stage watchdog (mirroring
  // aiVoiceRealtime.js's own armPlaybackWatchdog) since - unlike playPcm()'s already-decoded
  // buffer with a known exact duration - an arbitrary published URL has none to compute from.
  function playAudioUrl(url) {
    if (!url) return Promise.resolve();
    setState(VOICE_STATES.ASSISTANT_SPEAKING);
    const element = new Audio(url);
    return new Promise((resolve, reject) => {
      let settled = false;
      let timer = setTimeout(() => settle(false), FIRST_AUDIO_DEADLINE_MS);
      function onProgress() { clearTimeout(timer); timer = setTimeout(() => settle(false), PLAYBACK_STALL_DEADLINE_MS); }
      function settle(ok) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        element.removeEventListener('ended', onEnded);
        element.removeEventListener('error', onPlaybackError);
        element.removeEventListener('timeupdate', onProgress);
        element.removeEventListener('playing', onProgress);
        if (playbackStop === stopNow) playbackStop = null;
        onOutputAudioBufferEvent(ok ? 'output_audio_buffer.stopped' : 'output_audio_buffer.cleared', null);
        if (ok) resolve(); else reject(new Error('published audio playback failed'));
      }
      function onEnded() { settle(true); }
      function onPlaybackError() { settle(false); }
      // Called only by stopPlayback() (interrupt()/teardown()), which always passes a fixed
      // argument regardless of real reason - a deliberate stop always counts as "ok" here (no
      // further fallback should ever be triggered merely because the owner chose to stop this
      // clip), the same convention aiVoiceRealtime.js's own publishedAudioStopFn/elevenLabsStopFn
      // already use (both ignore their call argument and hardcode a successful settle).
      function stopNow() { try { element.pause(); element.currentTime = 0; } catch (_) {} settle(true); }
      element.addEventListener('ended', onEnded);
      element.addEventListener('error', onPlaybackError);
      element.addEventListener('timeupdate', onProgress);
      element.addEventListener('playing', onProgress);
      playbackStop = stopNow;
      onOutputAudioBufferEvent('output_audio_buffer.started', null);
      element.play().catch(() => settle(false));
    });
  }
  return {
    connect, disconnect, mute, interrupt, speak, playAudioUrl, finishUserTurn, supportsManualFinish, markPlaybackEnded,
    setLanguage: (value) => { language = normalizeLanguage(value); }, setEagerness: () => false,
    state: () => state, isMuted: () => muted, getMediaStream: () => mediaStream,
    // Provider Ownership addendum, section 1: this transport IS Gemini Live - listening/speaking
    // are always 'gemini' whenever it is genuinely connected, and reasoning follows the same
    // active provider (chatDockView.jsx no longer overrides it to 'openai'), so all three are
    // structurally the same value for the whole lifetime of a connected session.
    provider: () => 'gemini',
    // Provider Ownership addendum, section 6: the most recent speak() call's own latency
    // breakdown (fetchMs - see speak()'s own comment on why that is effectively "time to first
    // audio" on this confirmed non-streaming path). null until the first speak() call resolves.
    lastSpeakLatency: () => lastSpeakLatencyRecord
  };
}
