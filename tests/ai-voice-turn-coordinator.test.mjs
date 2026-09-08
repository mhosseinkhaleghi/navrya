import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = process.cwd();
const source = await readFile(path.join(root, 'public', 'pages', 'shared', 'ai-voice-turn-coordinator.js'), 'utf8');

async function sandbox() {
  const window = {};
  vm.runInNewContext(source, { window: window, Object: Object, Promise: Promise }, { filename: 'ai-voice-turn-coordinator.js' });
  return window.TradeJournalAIVoiceTurnCoordinator;
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test('submit() calls are serialized relative to each other, in arrival order - one utterance -> one Copilot turn', async () => {
  const module = await sandbox();
  const started = [];
  const gates = [deferred(), deferred()];
  let callIndex = 0;
  const coordinator = module.create({
    submit: async (text) => { const i = callIndex++; started.push(text); await gates[i].promise; return { reply: text + '-done' }; },
    getEpoch: () => 0
  });
  const p1 = coordinator.handleFinalTranscript('turn one', {});
  const p2 = coordinator.handleFinalTranscript('turn two', {});
  // turn two's submit() must not even be CALLED until turn one's own submit() resolves.
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(started, ['turn one'], 'submit() for turn two must not start while turn one is still in flight');
  gates[0].resolve();
  await p1;
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(started, ['turn one', 'turn two'], 'turn two starts the moment turn one resolves');
  gates[1].resolve();
  await p2;
});

// The actual regression this pass fixes: the old chatDockView.jsx voiceTurnQueue chained
// submit()+speak() into ONE serial promise, so a second finalized transcript's own submit() could
// not start until the first turn's SPEECH had finished playing. TurnCoordinator only ever awaits
// the previous submit() - it has no concept of playback at all, so nothing about how long speech
// takes can ever delay the next turn's dispatch.
test('a slow, still-pending "playback" (represented here by a caller that does not resolve its own onResult handling until later) never delays the next turn\'s submit() - TurnCoordinator has no playback concept to block on', async () => {
  const module = await sandbox();
  const submitCalls = [];
  const coordinator = module.create({
    submit: async (text) => { submitCalls.push(text); return { reply: text }; },
    getEpoch: () => 0,
    onResult: () => { /* a real caller might enqueue slow playback here - TurnCoordinator does not know or care how long that takes */ }
  });
  await coordinator.handleFinalTranscript('first', {});
  await coordinator.handleFinalTranscript('second', {});
  assert.deepEqual(submitCalls, ['first', 'second']);
});

test('turnId is monotonically assigned, once per handleFinalTranscript() call, regardless of resolution order', async () => {
  const module = await sandbox();
  const seen = [];
  const coordinator = module.create({
    submit: async (text) => ({ reply: text }),
    getEpoch: () => 0,
    onResult: (result, meta) => seen.push(meta.turnId)
  });
  await coordinator.handleFinalTranscript('a', {});
  await coordinator.handleFinalTranscript('b', {});
  await coordinator.handleFinalTranscript('c', {});
  assert.deepEqual(seen, [1, 2, 3]);
});

// Epoch discard: if the conversation moved on (New Chat, a conversation switch) while a turn's own
// submit() was still in flight, the result must never reach the caller as a usable value - it
// would otherwise silently mutate a conversation it was never part of.
test('a turn whose conversationEpoch changed while submit() was in flight is reported as discarded, with a null result - never applied to the now-different conversation', async () => {
  const module = await sandbox();
  let epoch = 0;
  const results = [];
  const gate = deferred();
  const coordinator = module.create({
    submit: async (text) => { await gate.promise; return { reply: text }; },
    getEpoch: () => epoch,
    onResult: (result, meta) => results.push({ result, discarded: meta.discarded })
  });
  const p = coordinator.handleFinalTranscript('mid-flight turn', {});
  epoch = 1; // simulate New Chat firing while this turn's submit() is still awaiting the gate
  gate.resolve();
  await p;
  assert.equal(results.length, 1);
  assert.equal(results[0].result, null, 'a stale turn\'s result must never be handed back as usable');
  assert.equal(results[0].discarded, true);
});

test('a turn started and resolved entirely within the same epoch is reported as NOT discarded, with its real result', async () => {
  const module = await sandbox();
  const results = [];
  const coordinator = module.create({
    submit: async (text) => ({ reply: text + '!' }),
    getEpoch: () => 5,
    onResult: (result, meta) => results.push({ result, discarded: meta.discarded })
  });
  await coordinator.handleFinalTranscript('hello', {});
  assert.equal(results[0].discarded, false);
  assert.deepEqual(results[0].result, { reply: 'hello!' });
});

test('a submit() rejection (network failure, thrown error) is reported via onResult as a failed, discarded turn rather than left unhandled or breaking the queue for later turns', async () => {
  const module = await sandbox();
  const results = [];
  const coordinator = module.create({
    submit: async (text) => { if (text === 'boom') throw new Error('AI_REQUEST_FAILED'); return { reply: text }; },
    getEpoch: () => 0,
    onResult: (result, meta) => results.push({ result, ok: meta.ok })
  });
  await coordinator.handleFinalTranscript('boom', {});
  await coordinator.handleFinalTranscript('fine', {});
  assert.equal(results[0].result, null);
  assert.equal(results[0].ok, false);
  assert.deepEqual(results[1].result, { reply: 'fine' }, 'a later turn must still run normally after an earlier one failed');
});

// Voice Mode hardening, section 5: the actual confirmed bug. epochAtEnqueue was recorded but never
// re-checked before invoking submitFn() at the front of the queue - only AFTER submitFn() resolved
// (the pre-existing "in flight" tests above). A turn queued behind a still-in-flight PREVIOUS turn
// reaches the front of the queue well after New Chat/a conversation switch/End Voice/unmount/a
// provider switch bumped the epoch, and the old code still called submitFn() with the new epoch
// already current - starting a workflow, mutating a form, or otherwise treating this stale queued
// turn's text as genuine new-conversation input. These tests assert submitFn() is never CALLED at
// all for such a turn, not merely that its result is discarded after the fact.
test('New Chat while a first turn is active and a second is queued: the second turn\'s submitFn is never called once it reaches the front - only reported once, discarded, via onResult', async () => {
  const module = await sandbox();
  let epoch = 0;
  const submitCalls = [];
  const results = [];
  const gate = deferred();
  const coordinator = module.create({
    submit: async (text) => { submitCalls.push(text); await gate.promise; return { reply: text }; },
    getEpoch: () => epoch,
    onResult: (result, meta) => results.push({ result, discarded: meta.discarded })
  });
  const p1 = coordinator.handleFinalTranscript('first (this epoch)', {});
  const p2 = coordinator.handleFinalTranscript('second (queued, then stale)', {});
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(submitCalls, ['first (this epoch)'], 'only the first turn has started - the second is still queued behind it');
  epoch = 1; // New Chat (or conversation resume, End Voice, unmount, provider switch - any real epoch bump) fires while turn 1 is still in flight and turn 2 is still queued
  gate.resolve();
  await p1;
  await p2;
  assert.deepEqual(submitCalls, ['first (this epoch)'], 'submitFn() must NEVER be called for the second turn once its epoch is stale - not called-then-discarded, simply never called');
  assert.equal(results.length, 2);
  // Turn 1 itself STARTED inside epoch 0 (submitFn was genuinely called) but only RESOLVED after
  // the epoch changed - this is the pre-existing, unchanged "in flight" discard behavior a few
  // tests above (an in-flight request finishing after the user has moved on is still stale). The
  // real point of THIS test is submitCalls above: turn 2's submitFn is never invoked at all.
  assert.equal(results[0].discarded, true);
  assert.equal(results[0].result, null);
  assert.equal(results[1].discarded, true, 'the second turn is reported exactly once, as discarded, with a null result');
  assert.equal(results[1].result, null);
});

test('three queued turns with an epoch change in the middle: only the turn already committed to running when the epoch changed ever calls submitFn() - the other two never do', async () => {
  const module = await sandbox();
  let epoch = 0;
  const submitCalls = [];
  const results = [];
  const gate = deferred();
  const coordinator = module.create({
    submit: async (text) => { submitCalls.push(text); await gate.promise; return { reply: text }; },
    getEpoch: () => epoch,
    onResult: (result, meta) => results.push({ result, discarded: meta.discarded })
  });
  const p1 = coordinator.handleFinalTranscript('turn A', {});
  const p2 = coordinator.handleFinalTranscript('turn B', {});
  const p3 = coordinator.handleFinalTranscript('turn C', {});
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(submitCalls, ['turn A'], 'turn A has started (blocked on the gate); B and C are still queued behind it');
  epoch = 1; // the conversation moves on while B and C sit queued and A is still mid-flight
  gate.resolve();
  await p1;
  await p2;
  await p3;
  assert.deepEqual(submitCalls, ['turn A'], 'turns B and C must never call submitFn() at all once their epoch is stale by the time they reach the front');
  assert.equal(results.length, 3);
  assert.equal(results[0].discarded, true, 'turn A resolved after the epoch changed, so its result is correctly stale too - unchanged pre-existing behavior');
  assert.equal(results[0].result, null);
  assert.equal(results[1].discarded, true);
  assert.equal(results[1].result, null);
  assert.equal(results[2].discarded, true);
  assert.equal(results[2].result, null);
});

test('extraMeta passed to handleFinalTranscript is threaded through to both submit() and onResult()', async () => {
  const module = await sandbox();
  const submitMeta = [];
  const resultMeta = [];
  const coordinator = module.create({
    submit: async (text, meta) => { submitMeta.push(meta.awaitingCompanionOpeningReply); return {}; },
    getEpoch: () => 0,
    onResult: (result, meta) => resultMeta.push(meta.awaitingCompanionOpeningReply)
  });
  await coordinator.handleFinalTranscript('x', { awaitingCompanionOpeningReply: true });
  assert.deepEqual(submitMeta, [true]);
  assert.deepEqual(resultMeta, [true]);
});
