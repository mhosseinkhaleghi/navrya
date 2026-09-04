import { VOICE_STATES } from './aiVoiceRealtime.js';

const LIVE_SOCKET_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';
const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
const LIVE_TRANSCRIPTION_LOCALES = Object.freeze({ fa: 'fa-IR', ar: 'ar-EG', en: 'en-US', es: 'es-ES' });

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
  let handledTranscripts = new Set();
  let lastSpeechAt = 0;

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
  function teardown() {
    stopPlayback(false);
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
  function playPcm(audioBase64) {
    return new Promise((resolve, reject) => {
      try {
        const buffer = audioBufferFromPcm(audioContext, bytesFromBase64(audioBase64));
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        activeSource = source;
        let settled = false;
        function settle(natural) {
          if (settled) return;
          settled = true;
          if (activeSource === source) activeSource = null;
          playbackStop = null;
          onOutputAudioBufferEvent(natural ? 'output_audio_buffer.stopped' : 'output_audio_buffer.cleared', null);
          natural ? resolve() : resolve();
        }
        playbackStop = settle;
        source.onended = () => settle(true);
        onOutputAudioBufferEvent('output_audio_buffer.started', null);
        source.start();
      } catch (error) { reject(error); }
    });
  }
  function openSocket(creds) {
    return new Promise((resolve, reject) => {
      const url = `${LIVE_SOCKET_URL}?access_token=${encodeURIComponent(creds.token)}`;
      socket = new WebSocket(url);
      socket.binaryType = 'arraybuffer';
      let settled = false;
      function fail(error) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(error);
      }
      const timeout = setTimeout(() => fail(new Error('GEMINI_LIVE_CONNECT_TIMEOUT')), 15000);
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
        if (message.error) {
          const error = new Error(`GEMINI_LIVE_SETUP_FAILED_${message.error.code || 'UNKNOWN'}`);
          error.code = error.message;
          fail(error);
          return;
        }
        if (message.setupComplete) {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          setState(VOICE_STATES.LISTENING);
          resolve();
          return;
        }
        const content = message.serverContent || {};
        const text = content.inputTranscription && String(content.inputTranscription.text || '').trim();
        if (text && !handledTranscripts.has(text)) {
          handledTranscripts.add(text);
          setTimeout(() => handledTranscripts.delete(text), 30000);
          setState(VOICE_STATES.PROCESSING);
          onFinalTranscript(text);
        }
      };
      socket.onerror = () => fail(new Error('GEMINI_LIVE_SOCKET_FAILED'));
      socket.onclose = () => {
        clearTimeout(timeout);
        if (intentionalClose || state === VOICE_STATES.IDLE || state === VOICE_STATES.ERROR) return;
        const error = new Error('GEMINI_LIVE_SOCKET_CLOSED');
        if (!settled) fail(error);
        else failAndCleanup(error, 'live_connection');
      };
    });
  }
  async function connect() {
    // Retrying after an error must not reuse a microphone/socket/context from the failed attempt.
    teardown();
    intentionalClose = false;
    setState(VOICE_STATES.REQUESTING_PERMISSION);
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      reportFailure(error, microphoneStage(error));
      throw error;
    }
    try {
      setState(VOICE_STATES.CONNECTING);
      const creds = await fetchSession(language);
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      await audioContext.resume();
      wireMicrophone();
      await openSocket(creds);
    } catch (error) {
      failAndCleanup(error, failureStage(error));
      throw error;
    }
  }
  function disconnect() {
    intentionalClose = true;
    teardown();
    muted = false;
    onMuteChange(false);
    setState(VOICE_STATES.IDLE);
  }
  function mute(next) { muted = !!next; onMuteChange(muted); }
  function interrupt() { stopPlayback(false); if (state !== VOICE_STATES.ERROR) setState(VOICE_STATES.LISTENING); }
  function finishUserTurn() {
    // Gemini Live transcribes a continuous microphone stream and determines the turn boundary.
    // Do not send audioStreamEnd here: that declares the entire stream finished and would break
    // the next turn in a multi-turn NAVRYA conversation.
    if (state === VOICE_STATES.USER_SPEAKING) setState(VOICE_STATES.PROCESSING);
    return true;
  }
  function markPlaybackEnded() { if (state === VOICE_STATES.ASSISTANT_SPEAKING) setState(VOICE_STATES.LISTENING); }
  function speak(text) {
    if (!text || !fetchSpeakAudio) return Promise.resolve();
    setState(VOICE_STATES.ASSISTANT_SPEAKING);
    return Promise.resolve(fetchSpeakAudio(language, text)).then((result) => playPcm(result.audioBase64)).then(() => {
      if (state === VOICE_STATES.ASSISTANT_SPEAKING) setState(VOICE_STATES.LISTENING);
    }).catch((error) => { reportFailure(error, 'tts'); });
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
  return { connect, disconnect, mute, interrupt, speak, playAudioUrl, finishUserTurn, markPlaybackEnded, setLanguage: (value) => { language = normalizeLanguage(value); }, setEagerness: () => false, state: () => state, isMuted: () => muted, getMediaStream: () => mediaStream };
}
