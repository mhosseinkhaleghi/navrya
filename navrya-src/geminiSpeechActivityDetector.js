// Natural Listening addendum (Section 2/3): a calibrated, hysteretic local speech-activity
// detector for Gemini Live's own microphone capture path (geminiLiveVoice.js). Deliberately a
// pure, dependency-free module - no AudioContext/Web Audio API reference anywhere in this file -
// so its actual decision logic can be unit tested with plain synthetic energy/timestamp sequences
// (tests/gemini-speech-activity-detector.test.mjs), the same way this codebase already tests
// interpretConfirmationText()/interpretCancelText() as pure functions rather than only via
// static-source pattern matching. The audio pipeline (ScriptProcessorNode today, an
// AudioWorkletNode where supported) only ever changes how a raw per-frame energy number is
// DELIVERED to process() below - never how it is interpreted.
//
// What this replaces: geminiLiveVoice.js's own capture callback used one fixed energy threshold
// (0.025) with no minimum-duration requirement at all - a single loud frame (a cough, a door, a
// keyboard click) while the assistant was speaking flipped state to USER_SPEAKING and fired
// onBargeIn() immediately, and there was no protection against several such frames re-triggering
// several interrupts in quick succession. This module addresses exactly those gaps:
//
// - never commit to "speaking" (or fire a barge-in) on a single above-floor frame - requires
//   MIN_SPEECH_MS of CONTINUOUS above-floor energy first (time-based, not a frame count, so it
//   stays correct across whatever buffer size/sample rate a given browser/device actually uses)
// - never end a user's turn for a short pause/hesitation/breath - requires MIN_SILENCE_MS of
//   continuous quiet before reporting speech has stopped (this only ever changes local UI/barge-in
//   state - Gemini Live's own server-side VAD and finalized transcript remain the sole authority
//   on when the user's turn actually ended and what was said; see geminiLiveVoice.js's own
//   docstring)
// - an ADAPTIVE noise floor (a slow-moving average of recent quiet energy) instead of one fixed,
//   arbitrary number - a quiet room and a noisy room get genuinely different floors, and the floor
//   deliberately never adapts while actively speaking (a sustained loud voice must never drag the
//   floor upward and desensitize the detector mid-utterance)
// - HYSTERESIS: the "become speaking" threshold sits meaningfully above the floor
//   (FLOOR_MARGIN_RATIO); the "become quiet" threshold is the floor itself - avoids rapid on/off
//   flicker for energy hovering right at one single cutoff value
// - a BARGE_IN_COOLDOWN_MS after a genuine barge-in fires, before another can fire - protects
//   against a burst of loud, choppy noise re-triggering repeated interrupts of the same reply
//
// These defaults are principled but NOT validated against a real microphone/speaker/room in this
// sandboxed session (no real-device testing was possible here - see docs/ai/voice-architecture.md
// and the addendum's own final report for this honestly-reported limitation). MIN_SILENCE_MS
// deliberately keeps the exact pre-existing value (850ms) rather than re-tuning a number that was
// already informally accepted in production, since the addendum's own priority order places
// "no accidental interruption" above "low latency" - changing an already-working number without a
// real device to validate against would be a guess in either direction.
export const MIN_SPEECH_MS = 120;
export const MIN_SILENCE_MS = 850;
export const FLOOR_MARGIN_RATIO = 2.5;
export const FLOOR_ADAPT_RATE = 0.03;
export const MIN_FLOOR = 0.008;
export const BARGE_IN_COOLDOWN_MS = 1500;
export const INITIAL_FLOOR = 0.01;

export function createSpeechActivityDetector(config) {
  config = config || {};
  const minSpeechMs = config.minSpeechMs != null ? config.minSpeechMs : MIN_SPEECH_MS;
  const minSilenceMs = config.minSilenceMs != null ? config.minSilenceMs : MIN_SILENCE_MS;
  const floorMarginRatio = config.floorMarginRatio != null ? config.floorMarginRatio : FLOOR_MARGIN_RATIO;
  const floorAdaptRate = config.floorAdaptRate != null ? config.floorAdaptRate : FLOOR_ADAPT_RATE;
  const minFloor = config.minFloor != null ? config.minFloor : MIN_FLOOR;
  const bargeInCooldownMs = config.bargeInCooldownMs != null ? config.bargeInCooldownMs : BARGE_IN_COOLDOWN_MS;

  let floor = config.initialFloor != null ? config.initialFloor : INITIAL_FLOOR;
  let speaking = false;
  let aboveFloorSinceMs = null; // timestamp the CURRENT unbroken above-floor run started, or null
  let lastAboveFloorAt = -Infinity; // timestamp of the most recent above-floor frame at all
  let lastBargeInAt = -Infinity;

  // energy: this frame's RMS amplitude (same units geminiLiveVoice.js's own pcm16() already
  // computes). now: a monotonic timestamp (ms) - the caller's clock, never read internally, so
  // this stays trivially testable with synthetic sequences and never depends on wall-clock time.
  function process(energy, now) {
    const speakingThreshold = Math.max(floor, minFloor) * floorMarginRatio;
    const aboveThreshold = energy > speakingThreshold;
    const result = { speaking: speaking, bargeIn: false, becameSpeaking: false, becameQuiet: false, floor: floor };

    if (aboveThreshold) {
      if (aboveFloorSinceMs === null) aboveFloorSinceMs = now;
      lastAboveFloorAt = now;
      if (!speaking && (now - aboveFloorSinceMs) >= minSpeechMs) {
        speaking = true;
        result.becameSpeaking = true;
        if ((now - lastBargeInAt) >= bargeInCooldownMs) {
          result.bargeIn = true;
          lastBargeInAt = now;
        }
      }
    } else {
      aboveFloorSinceMs = null;
      // Never adapt the floor while actively speaking - only ever learn from genuinely quiet
      // frames, so a sustained loud voice can't drag the floor up and desensitize mid-utterance.
      if (!speaking) floor = floor + (energy - floor) * floorAdaptRate;
      if (speaking && (now - lastAboveFloorAt) >= minSilenceMs) {
        speaking = false;
        result.becameQuiet = true;
      }
    }
    result.speaking = speaking;
    result.floor = floor;
    return result;
  }

  // For a genuinely new turn/connection (e.g. after interrupt()/disconnect()) - never carries a
  // stale "already speaking" or "recently barged-in" state into a fresh capture session. The
  // learned floor is deliberately preserved across reset() (the room's own noise level doesn't
  // change just because Voice was interrupted), but is exposed as its own explicit resetFloor
  // option for a genuinely new session where an old floor would be meaningless.
  function reset(options) {
    speaking = false;
    aboveFloorSinceMs = null;
    lastAboveFloorAt = -Infinity;
    lastBargeInAt = -Infinity;
    if (options && options.resetFloor) floor = config.initialFloor != null ? config.initialFloor : INITIAL_FLOOR;
  }

  return { process: process, reset: reset, isSpeaking: () => speaking, currentFloor: () => floor };
}
