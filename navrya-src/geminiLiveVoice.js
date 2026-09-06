import { VOICE_STATES } from './aiVoiceRealtime.js';

const LIVE_SOCKET_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';
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
  let lastSpeechAt = 0;
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
    processor = audioContext.createScriptProcessor(2048, 1, 1);
    processor.onaudioprocess = (event) => {
      if (muted || !socket || socket.readyState !== WebSocket.OPEN) return;
      const result = pcm16(event.inputBuffer.getChannelData(0), audioContext.sampleRate);
      if (result.energy > 0.025) {
        lastSpeechAt = Date.now();
        if (state === VOICE_STATES.ASSISTANT_SPEAKING) onBargeIn();
        if (state === VOICE_STATES.LISTENING || state === VOICE_STATES.INTERRUPTED) setState(VOICE_STATES.USER_SPEAKING);
      } else if (state === VOICE_STATES.USER_SPEAKING && Date.now() - lastSpeechAt > 850) {
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
      const url = `${LIVE_SOCKET_URL}?access_token=${encodeURIComponent(creds.token)}`;
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
    try {
      if (!isReconnect) setState(VOICE_STATES.CONNECTING);
      const creds = await Promise.race([fetchSession(language), deadline]);
      if (myEpoch !== connectionEpoch) return;
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      await Promise.race([audioContext.resume(), deadline]);
      if (myEpoch !== connectionEpoch) return;
      wireMicrophone();
      await openSocket(creds, myEpoch, deadline);
      if (myEpoch !== connectionEpoch) return;
      reconnectAttempt = 0;
    } catch (error) {
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
    teardown();
    muted = false;
    onMuteChange(false);
    setState(VOICE_STATES.IDLE);
  }
  function mute(next) { muted = !!next; onMuteChange(muted); }
  function interrupt() {
    // Slice R2, audit finding T5 (parity with aiVoiceRealtime.js): invalidate the active speak()
    // call first - a pending fetchSpeakAudio() call has nothing else to cancel it, and would
    // otherwise still start playback once it resolves.
    activeSpeakToken = null;
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
    return Promise.resolve(fetchSpeakAudio(language, text)).then((result) => {
      if (token !== activeSpeakToken) return; // interrupted before playback began
      return playPcm(result.audioBase64);
    }).then(() => {
      if (state === VOICE_STATES.ASSISTANT_SPEAKING) setState(VOICE_STATES.LISTENING);
    }).catch((error) => { if (token === activeSpeakToken) reportFailure(error, 'tts'); });
  }
  function playAudioUrl(url) {
    if (!url) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const element = new Audio(url);
      element.onended = () => resolve();
      element.onerror = () => reject(new Error('published audio playback failed'));
      element.play().catch(reject);
    });
  }
  return {
    connect, disconnect, mute, interrupt, speak, playAudioUrl, finishUserTurn, supportsManualFinish, markPlaybackEnded,
    setLanguage: (value) => { language = normalizeLanguage(value); }, setEagerness: () => false,
    state: () => state, isMuted: () => muted, getMediaStream: () => mediaStream
  };
}
