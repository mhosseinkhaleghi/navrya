import assert from 'node:assert/strict';
import test from 'node:test';
import { createSpeechActivityDetector } from '../navrya-src/geminiSpeechActivityDetector.js';

// A quiet, generic config used by most tests below - explicit numbers rather than the real
// production defaults, so a future retune of the real defaults doesn't silently change what these
// tests are actually proving.
function detector(overrides) {
  return createSpeechActivityDetector(Object.assign({
    minSpeechMs: 100, minSilenceMs: 500, floorMarginRatio: 2, floorAdaptRate: 0.1,
    minFloor: 0.01, bargeInCooldownMs: 1000, initialFloor: 0.01
  }, overrides || {}));
}

test('a single loud frame (a cough/click/door) never flips to speaking or fires a barge-in - minSpeechMs requires sustained energy first', () => {
  const d = detector();
  const r1 = d.process(0.5, 0); // one loud frame at t=0
  assert.equal(r1.speaking, false);
  assert.equal(r1.becameSpeaking, false);
  assert.equal(r1.bargeIn, false);
  const r2 = d.process(0.01, 20); // immediately quiet again
  assert.equal(r2.speaking, false, 'a single transient spike must never be mistaken for real speech');
});

test('sustained above-floor energy for at least minSpeechMs commits to speaking and fires exactly one barge-in', () => {
  const d = detector();
  d.process(0.5, 0);
  d.process(0.5, 50);
  const r = d.process(0.5, 110); // 110ms of continuous loud energy >= minSpeechMs(100)
  assert.equal(r.speaking, true);
  assert.equal(r.becameSpeaking, true);
  assert.equal(r.bargeIn, true, 'genuinely sustained speech must trigger exactly one barge-in the moment it is confirmed');
  const r2 = d.process(0.5, 160); // still speaking - must not report becameSpeaking/bargeIn again
  assert.equal(r2.becameSpeaking, false);
  assert.equal(r2.bargeIn, false, 'a barge-in fires once per confirmed speech onset, never again while already speaking');
});

test('a broken run of above-floor frames (loud, quiet, loud again) never accumulates toward minSpeechMs across the gap', () => {
  const d = detector();
  d.process(0.5, 0);
  d.process(0.5, 60); // 60ms of loud energy - not yet enough
  d.process(0.01, 80); // one quiet frame breaks the run
  const r = d.process(0.5, 90); // loud again, but the timer must have reset at t=90, not continued from t=0
  assert.equal(r.speaking, false, 'the above-floor run restarts after any quiet frame - a choppy, broken signal must not falsely accumulate into a confirmed speech onset');
});

test('a short pause/hesitation under minSilenceMs never ends a confirmed speaking turn', () => {
  const d = detector();
  d.process(0.5, 0);
  d.process(0.5, 110); // now speaking (minSpeechMs=100)
  const r = d.process(0.01, 400); // 290ms of quiet - under minSilenceMs(500)
  assert.equal(r.speaking, true, 'a natural pause/breath shorter than minSilenceMs must never be reported as the user having stopped');
  assert.equal(r.becameQuiet, false);
});

test('continuous quiet for at least minSilenceMs after speech reports becameQuiet exactly once', () => {
  const d = detector();
  d.process(0.5, 0);
  d.process(0.5, 110); // speaking confirmed
  d.process(0.01, 300); // quiet, but not long enough yet
  const r = d.process(0.01, 650); // 540ms since the last above-floor frame (110) - past minSilenceMs(500)
  assert.equal(r.speaking, false);
  assert.equal(r.becameQuiet, true);
  const r2 = d.process(0.01, 700); // still quiet - must not report becameQuiet again
  assert.equal(r2.becameQuiet, false, 'becameQuiet fires once per transition, never repeatedly while already quiet');
});

test('speech resuming mid-pause (before minSilenceMs elapses) resets the silence clock, so a longer overall pause afterward is measured from the NEW last-speech moment', () => {
  const d = detector();
  d.process(0.5, 0);
  d.process(0.5, 110); // speaking
  d.process(0.01, 300); // 190ms quiet - under minSilenceMs(500), still speaking
  d.process(0.5, 320); // speech resumes - lastAboveFloorAt must update to 320
  const stillSpeaking = d.process(0.01, 700); // 380ms since t=320 - still under 500ms
  assert.equal(stillSpeaking.speaking, true, 'resumed speech must reset the silence clock from its own last moment, not the original speech start');
  const nowQuiet = d.process(0.01, 830); // 510ms since t=320
  assert.equal(nowQuiet.speaking, false);
  assert.equal(nowQuiet.becameQuiet, true);
});

test('the noise floor adapts toward sustained quiet-frame energy, never while actively speaking', () => {
  const d = detector({ floorAdaptRate: 0.5, initialFloor: 0.01 });
  const before = d.process(0.02, 0).floor;
  const afterQuiet = d.process(0.02, 20).floor;
  assert.ok(afterQuiet > before, 'the floor must move toward a sustained higher ambient quiet level, not stay frozen at its initial value');
  d.process(0.6, 40);
  const speakingFloor = d.process(0.6, 200).floor; // now confirmed speaking (loud)
  const stillSpeakingFloor = d.process(0.6, 260).floor;
  assert.equal(stillSpeakingFloor, speakingFloor, 'the floor must never move while the detector considers the signal active speech, even if the loud energy value itself would otherwise pull it upward');
});

test('the floor never adapts below minFloor\'s own implied speaking threshold - a genuinely silent room does not desensitize the detector to near-zero', () => {
  const d = detector({ minFloor: 0.02, floorMarginRatio: 2, floorAdaptRate: 0.9, initialFloor: 0.01 });
  // Feed near-silence for a while - the floor variable itself may drift down, but minFloor still
  // sets a hard lower bound on the EFFECTIVE speaking threshold (see speakingThreshold's own
  // Math.max(floor, minFloor) * ratio).
  for (let t = 0; t < 500; t += 20) d.process(0.0001, t);
  const r = d.process(0.03, 520); // just above minFloor(0.02) but would clear a near-zero floor easily
  // 0.03 > minFloor(0.02) * ratio(2) = 0.04? No - 0.03 < 0.04, so this must NOT count as speech.
  assert.equal(r.speaking, false, 'a supposedly "loud" frame that is still below the minFloor-implied threshold must never be mistaken for real speech in a very quiet room');
});

test('a barge-in cooldown prevents a second barge-in from firing for a new speech episode that starts shortly after the first, even once that episode is itself genuinely confirmed as speaking', () => {
  const d = detector({ bargeInCooldownMs: 1000 });
  d.process(0.5, 0);
  const first = d.process(0.5, 110); // first barge-in fires, lastBargeInAt=110
  assert.equal(first.bargeIn, true);
  d.process(0.01, 650); // 540ms quiet since t=110 (>= minSilenceMs 500) - speaking ends
  d.process(0.5, 700); // a new loud onset begins
  const second = d.process(0.5, 800); // 100ms sustained (>= minSpeechMs) - a genuinely new, confirmed speech episode
  assert.equal(second.becameSpeaking, true, 'speaking state itself must still be tracked correctly even during the cooldown');
  // 800 - 110 = 690ms since the first barge-in - still inside the 1000ms cooldown window.
  assert.equal(second.bargeIn, false, 'a new speech episode confirmed while still inside the cooldown window must not fire a second barge-in for what may just be a burst of choppy noise');
});

test('a genuine, later barge-in (its own speech episode confirmed only after the cooldown has fully elapsed since the last real barge-in) fires normally', () => {
  const d = detector({ bargeInCooldownMs: 1000 });
  d.process(0.5, 0);
  d.process(0.5, 110); // first barge-in fires, lastBargeInAt=110
  d.process(0.01, 650); // speaking ends
  d.process(0.5, 700);
  d.process(0.5, 800); // second episode confirmed at t=800 - still suppressed (proven by the test above); lastBargeInAt stays 110
  d.process(0.01, 1350); // 550ms quiet since t=800 - speaking ends again
  d.process(0.5, 1400); // a third, later loud onset begins
  const later = d.process(0.5, 1500); // confirmed at t=1500 - 1500-110=1390ms since the last REAL barge-in, past the 1000ms cooldown
  assert.equal(later.becameSpeaking, true);
  assert.equal(later.bargeIn, true, 'a real, later interruption must not be permanently silenced by one earlier cooldown - the cooldown clock only resets on an actually-fired barge-in, not on every intervening speech episode');
});

test('reset() clears speaking/timing state for a fresh capture session, and only clears the learned floor when explicitly asked to', () => {
  const d = detector({ floorAdaptRate: 0.5 });
  d.process(0.02, 0);
  d.process(0.02, 20); // floor has now adapted upward from its initial 0.01
  const adaptedFloor = d.currentFloor();
  assert.notEqual(adaptedFloor, 0.01);
  d.process(0.5, 40);
  d.process(0.5, 150); // now speaking
  assert.equal(d.isSpeaking(), true);
  d.reset();
  assert.equal(d.isSpeaking(), false, 'reset() must clear an in-progress speaking state for a fresh session');
  assert.equal(d.currentFloor(), adaptedFloor, 'reset() alone must preserve the learned ambient floor - the room\'s own noise level does not change just because Voice was interrupted');
  d.reset({ resetFloor: true });
  assert.equal(d.currentFloor(), 0.01, 'reset({resetFloor:true}) must restore the configured initial floor for a genuinely new session');
});
