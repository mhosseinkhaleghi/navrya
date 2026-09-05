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

test('reset() starts a new generation immediately even when the previous submit promise never settles', async () => {
  const module = await sandbox();
  const stuck = deferred();
  const started = [];
  const results = [];
  const coordinator = module.create({
    submit: async (text) => {
      started.push(text);
      if (text === 'stuck') await stuck.promise;
      return { reply: text };
    },
    getEpoch: () => 0,
    onResult: (result, meta) => results.push({ result, text: meta.text, discarded: meta.discarded, generation: meta.generation })
  });

  coordinator.handleFinalTranscript('stuck', { text: 'stuck' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(started, ['stuck']);

  const nextGeneration = coordinator.reset('superseded-by-user-speech');
  const next = coordinator.handleFinalTranscript('fresh', { text: 'fresh' });
  await next;
  assert.deepEqual(started, ['stuck', 'fresh'], 'the fresh turn must dispatch without waiting for the abandoned promise');
  assert.equal(nextGeneration, 1);
  assert.equal(coordinator.generation(), 1);
  assert.deepEqual(results, [{ result: { reply: 'fresh' }, text: 'fresh', discarded: false, generation: 1 }]);

  stuck.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(results.length, 2);
  assert.equal(results[1].text, 'stuck');
  assert.equal(results[1].result, null, 'a late result from the abandoned generation must never become usable');
  assert.equal(results[1].discarded, true);
});

test('reset() discards turns queued behind an abandoned request without ever invoking their submit side effect', async () => {
  const module = await sandbox();
  const stuck = deferred();
  const started = [];
  const results = [];
  const coordinator = module.create({
    submit: async (text) => {
      started.push(text);
      if (text === 'stuck') await stuck.promise;
      return { reply: text };
    },
    getEpoch: () => 0,
    onResult: (result, meta) => results.push({ text: meta.label, result, reason: meta.reason })
  });

  coordinator.handleFinalTranscript('stuck', { label: 'stuck' });
  coordinator.handleFinalTranscript('never-run', { label: 'never-run' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  coordinator.reset('disconnect');
  stuck.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(started, ['stuck'], 'a queued turn from the reset generation must not call submit at all');
  assert.equal(results.length, 2);
  assert.ok(results.every((entry) => entry.result === null));
  assert.ok(results.every((entry) => entry.reason === 'disconnect'));
});

test('two rapid successful finals can consume synchronous canonical transcript/conversation state without overwriting history or minting a second conversation id', async () => {
  const module = await sandbox();
  const canonical = { transcript: [], conversationId: null };
  const calls = [];
  const coordinator = module.create({
    submit: async (text) => {
      calls.push({ text, transcript: canonical.transcript.map((item) => item.content), conversationId: canonical.conversationId });
      return { reply: text + '-reply', conversationId: canonical.conversationId || 'conversation-1' };
    },
    getEpoch: () => 0,
    onResult: (result, meta) => {
      canonical.transcript = canonical.transcript.concat([
        { role: 'user', content: meta.originalText },
        { role: 'assistant', content: result.reply }
      ]);
      canonical.conversationId = result.conversationId;
    }
  });

  const first = coordinator.handleFinalTranscript('yes', { originalText: 'yes' });
  const second = coordinator.handleFinalTranscript('yes', { originalText: 'yes' });
  await Promise.all([first, second]);

  assert.deepEqual(calls, [
    { text: 'yes', transcript: [], conversationId: null },
    { text: 'yes', transcript: ['yes', 'yes-reply'], conversationId: 'conversation-1' }
  ]);
  assert.deepEqual(canonical.transcript.map((item) => item.content), ['yes', 'yes-reply', 'yes', 'yes-reply']);
  assert.equal(canonical.conversationId, 'conversation-1');
});
