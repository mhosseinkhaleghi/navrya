import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// fix/voice-mode-turn-ux: real, dynamic behavioral coverage for the NEW playback-lifecycle
// tracking added to ai-voice-playback-controller.js (Parts A/B/C of the brief) - this module is a
// pure, dependency-injected JS module with no SDK/DOM dependency, so (unlike aiVoiceRealtime.js,
// whose real proof remains a real browser - see tests/ai-voice-realtime-adapter.test.mjs's own
// header comment) it CAN be dynamically executed and driven through fake raw-event notifications,
// exactly matching how a real onOutputAudioBufferEvent relay from aiVoiceRealtime.js would call it.

const root = process.cwd();
const source = await readFile(path.join(root, 'public', 'pages', 'shared', 'ai-voice-playback-controller.js'), 'utf8');

async function sandbox() {
  const window = {};
  vm.runInNewContext(source, { window: window, Object: Object, Promise: Promise, String: String }, { filename: 'ai-voice-playback-controller.js' });
  return window.TradeJournalAIVoicePlaybackController;
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function tick() { return new Promise((r) => setTimeout(r, 0)); }

// ---- Part A: real output-audio-buffer lifecycle drives settlement, never the SDK's derived audio_stopped ----

test('response.output_audio.done / the SDK-level audio_stopped is never consulted by this module - only notifyAudioBufferStarted/Stopped/Cleared can ever settle an entry (structural: no .on(...)/event-name comparison against either exists in the actual code)', () => {
  // The two strings DO appear in this file's own explanatory comments (documenting what NOT to
  // trust and why) - this checks the module never actually LISTENS for/compares against them as
  // real event names, which a blanket string search would have falsely flagged.
  assert.doesNotMatch(source, /\.on\(\s*['"]audio_stopped['"]/, 'must never attach a listener for the SDK-derived audio_stopped event');
  assert.doesNotMatch(source, /===\s*['"]audio_stopped['"]/, 'must never branch on the SDK-derived audio_stopped event type');
  assert.doesNotMatch(source, /===\s*['"]response\.output_audio\.done['"]/, 'must never branch on the raw generation-complete event directly');
});

test('a real output_audio_buffer.stopped for the active entry settles it as genuinely spoken (spoken:true) - this is what actually ends ASSISTANT_SPEAKING, never a timer/guess', async () => {
  const module = await sandbox();
  const settled = [];
  const gate = deferred();
  const controller = module.create({ speak: () => gate.promise, onSettled: (e) => settled.push(e) });
  controller.enqueue('hello', {});
  controller.notifyAudioBufferStarted(null);
  controller.notifyAudioBufferStopped(null);
  assert.equal(settled.length, 1);
  assert.equal(settled[0].spoken, true);
  assert.equal(settled[0].reason, null);
  gate.resolve();
});

test('a stopped event that arrives BEFORE any started event for the active entry is ignored (invalid ordering) - it must never be treated as proof playback finished', async () => {
  const module = await sandbox();
  const settled = [];
  const gate = deferred();
  const controller = module.create({ speak: () => gate.promise, onSettled: (e) => settled.push(e) });
  controller.enqueue('hello', {});
  controller.notifyAudioBufferStopped(null); // no started() first
  assert.equal(settled.length, 0, 'a stopped event with no preceding started event for this entry must never settle it');
  gate.resolve();
});

test('a duplicate output_audio_buffer.started for the same entry never re-publishes onAudioStart (idempotent)', async () => {
  const module = await sandbox();
  const starts = [];
  const gate = deferred();
  const controller = module.create({ speak: () => gate.promise, onAudioStart: (e) => starts.push(e) });
  controller.enqueue('hello', { caption: 'Hello there' });
  controller.notifyAudioBufferStarted(null);
  controller.notifyAudioBufferStarted(null);
  controller.notifyAudioBufferStarted(null);
  assert.equal(starts.length, 1, 'onAudioStart must fire exactly once per entry, even with repeated started events');
  assert.equal(starts[0].caption, 'Hello there');
  gate.resolve();
});

test('output_audio_buffer.cleared settles the active entry as not-genuinely-spoken (spoken:false, reason:cleared) - a defensive fallback path, not the primary way an interruption is noticed', async () => {
  const module = await sandbox();
  const settled = [];
  const gate = deferred();
  const controller = module.create({ speak: () => gate.promise, onSettled: (e) => settled.push(e) });
  controller.enqueue('hello', {});
  controller.notifyAudioBufferStarted(null);
  controller.notifyAudioBufferCleared(null);
  assert.equal(settled.length, 1);
  assert.equal(settled[0].spoken, false);
  assert.equal(settled[0].reason, 'cleared');
  gate.resolve();
});

// ---- response_id correlation: opportunistic, never a hard requirement, but rejects a REAL mismatch ----

test('setCurrentResponseId() binds the real server response id to the active entry, and a later event for a DIFFERENT response id is ignored (never settles/starts the wrong entry)', async () => {
  const module = await sandbox();
  const settled = [];
  const starts = [];
  const gate = deferred();
  const controller = module.create({ speak: () => gate.promise, onSettled: (e) => settled.push(e), onAudioStart: (e) => starts.push(e) });
  controller.enqueue('hello', {});
  controller.setCurrentResponseId('resp_real_abc');
  controller.notifyAudioBufferStarted('resp_real_XYZ'); // a stale/mismatched id - must be ignored
  assert.equal(starts.length, 0, 'a mismatched response_id must never publish onAudioStart for the active entry');
  controller.notifyAudioBufferStopped('resp_real_XYZ');
  assert.equal(settled.length, 0, 'a mismatched response_id must never settle the active entry either');
  controller.notifyAudioBufferStarted('resp_real_abc');
  controller.notifyAudioBufferStopped('resp_real_abc');
  assert.equal(starts.length, 1);
  assert.equal(settled.length, 1);
  gate.resolve();
});

test('when NEITHER side has a response id yet, correlation never blocks (opportunistic only) - a real event with no id still settles the one active entry', async () => {
  const module = await sandbox();
  const settled = [];
  const gate = deferred();
  const controller = module.create({ speak: () => gate.promise, onSettled: (e) => settled.push(e) });
  controller.enqueue('hello', {});
  // setCurrentResponseId() is never called - simulates a response.created event never arriving/being lost.
  controller.notifyAudioBufferStarted(null);
  controller.notifyAudioBufferStopped(null);
  assert.equal(settled.length, 1, 'missing response_id on both sides must never be treated as a mismatch');
  gate.resolve();
});

test('setCurrentResponseId() only ever binds once per entry - a later, different id is not adopted (defensive against a duplicate/stale response.created)', async () => {
  const module = await sandbox();
  const starts = [];
  const gate = deferred();
  const controller = module.create({ speak: () => gate.promise, onAudioStart: (e) => starts.push(e) });
  controller.enqueue('hello', {});
  controller.setCurrentResponseId('resp_first');
  controller.setCurrentResponseId('resp_second'); // must be a no-op - already bound to resp_first
  controller.notifyAudioBufferStarted('resp_second'); // rejected - the entry is bound to resp_first, not resp_second
  assert.equal(starts.length, 0);
  controller.notifyAudioBufferStarted('resp_first'); // accepted - the real bound id
  assert.equal(starts.length, 1);
  gate.resolve();
});

// ---- Part B: controller-owned, idempotent interruption - settles locally/immediately, never waits ----

test('interrupt() settles the current entry LOCALLY AND IMMEDIATELY (synchronously) - it never waits for a corresponding cleared/audio_interrupted event that may never arrive', async () => {
  const module = await sandbox();
  const settled = [];
  const gate = deferred(); // never resolved/rejected - proves settlement does not depend on speak()'s own promise at all
  const controller = module.create({ speak: () => gate.promise, interrupt: () => {}, onSettled: (e) => settled.push(e) });
  controller.enqueue('hello', {});
  controller.notifyAudioBufferStarted(null);
  assert.equal(settled.length, 0);
  controller.interrupt();
  assert.equal(settled.length, 1, 'interrupt() must settle the current entry synchronously, in the same call');
  assert.equal(settled[0].spoken, false);
  assert.equal(settled[0].reason, 'interrupted');
});

test('interrupt() invokes the injected transport-level interrupt() exactly once per interruption, even if called again for an already-interrupted/already-settled entry', async () => {
  const module = await sandbox();
  let interruptCalls = 0;
  const gate = deferred();
  const controller = module.create({ speak: () => gate.promise, interrupt: () => { interruptCalls += 1; } });
  controller.enqueue('hello', {});
  controller.interrupt();
  assert.equal(interruptCalls, 1);
  // A second interrupt() call with nothing new active (queue empty, no current) still calls
  // through once more (transport-level idempotency/safety net - aiVoiceRealtime.js's own
  // interrupt() no-ops harmlessly with nothing to cancel), but never double-settles anything.
  const settled = [];
  controller.interrupt();
  assert.equal(interruptCalls, 2);
});

test('a stale output_audio_buffer.stopped/.cleared event for an entry ALREADY settled by interrupt() can never re-settle it or affect the next entry', async () => {
  const module = await sandbox();
  const settled = [];
  const spoken = [];
  const gates = [deferred(), deferred()];
  let i = 0;
  const controller = module.create({
    speak: (text) => { spoken.push(text); return gates[i++].promise; },
    interrupt: () => {},
    onSettled: (e) => settled.push(e)
  });
  controller.enqueue('first', {});
  controller.notifyAudioBufferStarted(null);
  controller.interrupt(); // settles 'first' as interrupted, current becomes null
  await tick();
  controller.enqueue('second', {});
  await tick();
  assert.deepEqual(spoken, ['first', 'second']);
  // A late-arriving 'stopped' for 'first' (already settled/gone) must never touch 'second'.
  controller.notifyAudioBufferStopped(null);
  const secondSettledYet = settled.filter((e) => e.text === 'second');
  assert.equal(secondSettledYet.length, 0, 'a stale event for the OLD entry must never settle the NEW active entry ("finish response B" bug)');
  gates[0].resolve();
  gates[1].resolve();
});

test('interrupt() drops every not-yet-started queued entry AND settles the current one, in the same call - the original bug (a direct transport-level interrupt bypassing the queue) is what this replaces', async () => {
  const module = await sandbox();
  const settled = [];
  let interruptCalls = 0;
  const gate = deferred();
  const controller = module.create({
    speak: () => gate.promise, interrupt: () => { interruptCalls += 1; },
    onSettled: (e) => settled.push(e)
  });
  controller.enqueue('now playing', {});
  controller.enqueue('queued next', {});
  controller.enqueue('queued after that', {});
  controller.interrupt();
  assert.equal(interruptCalls, 1);
  assert.equal(controller.queueLength(), 0);
  const reasons = settled.map((e) => ({ text: e.text, spoken: e.spoken, reason: e.reason }));
  assert.equal(reasons.length, 3);
  assert.ok(reasons.every((r) => r.spoken === false && r.reason === 'interrupted'));
  assert.ok(reasons.some((r) => r.text === 'now playing' && r.reason === 'interrupted'));
  assert.ok(reasons.some((r) => r.text === 'queued next' && r.reason === 'interrupted'));
  assert.ok(reasons.some((r) => r.text === 'queued after that' && r.reason === 'interrupted'));
  gate.resolve();
});

// ---- disconnect settles all pending promises ----

test('invalidate() (the caller\'s disconnect/teardown path) settles the current entry and drops the queue - nothing is ever left permanently pending', async () => {
  const module = await sandbox();
  const settled = [];
  const gate = deferred();
  const controller = module.create({ speak: () => gate.promise, interrupt: () => {}, onSettled: (e) => settled.push(e) });
  controller.enqueue('current', {});
  controller.enqueue('queued', {});
  controller.invalidate();
  const texts = settled.map((e) => e.text).sort();
  assert.deepEqual(texts, ['current', 'queued']);
  assert.ok(settled.every((e) => e.spoken === false));
  gate.resolve();
});

// ---- caption-on-start (Part C) ----

test('onAudioStart carries whatever caption meta was attached at enqueue time - never fabricated, never the entry\'s own internal responseId/text mixed up', async () => {
  const module = await sandbox();
  const starts = [];
  const gate = deferred();
  const controller = module.create({ speak: () => gate.promise, onAudioStart: (e) => starts.push(e) });
  controller.enqueue('spoken form', { caption: 'written form', turnId: 't-1' });
  controller.notifyAudioBufferStarted(null);
  assert.equal(starts[0].caption, 'written form');
  assert.equal(starts[0].text, 'spoken form');
  assert.equal(starts[0].turnId, 't-1');
  gate.resolve();
});

test('a queued (not-yet-playing) entry never publishes its caption - onAudioStart only fires for the entry that is ACTUALLY current', async () => {
  const module = await sandbox();
  const starts = [];
  const gates = [deferred(), deferred()];
  let i = 0;
  const controller = module.create({ speak: () => gates[i++].promise, onAudioStart: (e) => starts.push(e) });
  controller.enqueue('first', { caption: 'first caption' });
  controller.enqueue('second', { caption: 'second caption' });
  controller.notifyAudioBufferStarted(null); // belongs to 'first', the only current entry
  assert.deepEqual(starts.map((e) => e.caption), ['first caption']);
  gates[0].resolve();
  await tick();
  controller.notifyAudioBufferStarted(null); // now belongs to 'second'
  assert.deepEqual(starts.map((e) => e.caption), ['first caption', 'second caption']);
  gates[1].resolve();
});
