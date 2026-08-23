import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = process.cwd();
const source = await readFile(path.join(root, 'public', 'pages', 'shared', 'ai-voice-playback-controller.js'), 'utf8');

async function sandbox() {
  const window = {};
  vm.runInNewContext(source, { window: window, Object: Object, Promise: Promise }, { filename: 'ai-voice-playback-controller.js' });
  return window.TradeJournalAIVoicePlaybackController;
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test('enqueue() returns immediately without waiting for speech to start or finish - the whole point of splitting playback out of the business queue', async () => {
  const module = await sandbox();
  const gate = deferred();
  const controller = module.create({ speak: () => gate.promise });
  const before = Date.now();
  controller.enqueue('hello', {});
  const after = Date.now();
  assert.ok(after - before < 20, 'enqueue() must be synchronous/near-instant, never await speak() itself');
  gate.resolve();
});

test('two enqueued entries speak strictly one at a time, in arrival order - never two overlapping speak() calls (the Realtime API rejects an overlapping response.create)', async () => {
  const module = await sandbox();
  const started = [];
  const gates = [deferred(), deferred()];
  let i = 0;
  const controller = module.create({ speak: (text) => { const g = gates[i++]; started.push(text); return g.promise; } });
  controller.enqueue('one', {});
  controller.enqueue('two', {});
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(started, ['one'], 'the second entry must not start speaking until the first finishes');
  gates[0].resolve();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(started, ['one', 'two']);
  gates[1].resolve();
});

test('interrupt() stops current playback via the injected interrupt() and drops every not-yet-started queued entry, reporting each as skipped', async () => {
  const module = await sandbox();
  const settled = [];
  let interruptCalled = false;
  const gate = deferred();
  const controller = module.create({
    speak: () => gate.promise,
    interrupt: () => { interruptCalled = true; },
    onSettled: (entry) => settled.push(entry)
  });
  controller.enqueue('now playing', {});
  controller.enqueue('queued next', {});
  controller.enqueue('queued after that', {});
  await new Promise((r) => setTimeout(r, 0));
  controller.interrupt();
  assert.equal(interruptCalled, true);
  assert.equal(controller.queueLength(), 0);
  const skipped = settled.filter((e) => e.skipped).map((e) => e.text);
  assert.deepEqual(skipped, ['queued next', 'queued after that'], 'only the two not-yet-started entries are dropped - the currently-playing one is handled by the real interrupt(), not by this drop path');
  gate.resolve();
});

// The core isolation guarantee: New Chat (or any other "the user has moved on" moment) must never
// let an already-queued reply from the OLD conversation be spoken into the new one.
test('invalidate() bumps the epoch and drops every queued entry from the old epoch without ever speaking it, but the controller keeps working normally afterward', async () => {
  const module = await sandbox();
  const spoken = [];
  const settled = [];
  let interruptCalled = false;
  const gate = deferred();
  const controller = module.create({
    speak: (text) => { spoken.push(text); return text === 'currently playing' ? gate.promise : Promise.resolve(); },
    interrupt: () => { interruptCalled = true; },
    onSettled: (entry) => settled.push(entry)
  });
  controller.enqueue('currently playing', {});
  controller.enqueue('stale reply from the old conversation', {});
  controller.invalidate();
  assert.equal(interruptCalled, true, 'invalidate() must also interrupt whatever is currently playing');
  assert.equal(controller.queueLength(), 0, 'the queued-but-not-started entry must be dropped immediately');
  gate.resolve();
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(!spoken.includes('stale reply from the old conversation'), 'a stale-epoch entry must never actually be spoken');

  // The controller must keep working normally after invalidation - only the OLD generation's
  // entries are ever dropped, not the mechanism itself.
  controller.enqueue('a real, current reply', {});
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(spoken.includes('a real, current reply'));
});

test('an entry enqueued BEFORE invalidate() but not yet started by the time invalidate() runs is skipped as stale-epoch, never spoken', async () => {
  const module = await sandbox();
  const spoken = [];
  const settled = [];
  const gate = deferred();
  const controller = module.create({
    speak: (text) => { spoken.push(text); return text === 'first' ? gate.promise : Promise.resolve(); },
    interrupt: () => {},
    onSettled: (entry) => settled.push(entry)
  });
  controller.enqueue('first', {}); // starts immediately, occupies `current`
  controller.enqueue('second - about to become stale', {});
  await new Promise((r) => setTimeout(r, 0));
  controller.invalidate(); // bumps epoch; 'first' is interrupted (current), 'second' is dropped from the queue
  gate.resolve();
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(!spoken.includes('second - about to become stale'), 'a stale-epoch entry must never actually be spoken');
});

test('isSpeaking() and queueLength() reflect real state', async () => {
  const module = await sandbox();
  const gate = deferred();
  const controller = module.create({ speak: () => gate.promise });
  assert.equal(controller.isSpeaking(), false);
  assert.equal(controller.queueLength(), 0);
  controller.enqueue('a', {});
  controller.enqueue('b', {});
  assert.equal(controller.isSpeaking(), true);
  assert.equal(controller.queueLength(), 1);
  gate.resolve();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(controller.queueLength(), 0);
});

test('a speak() rejection settles that entry and still lets the queue continue with the next one', async () => {
  const module = await sandbox();
  const settled = [];
  const controller = module.create({
    speak: (text) => (text === 'fails' ? Promise.reject(new Error('transport dropped')) : Promise.resolve()),
    onSettled: (entry) => settled.push(entry)
  });
  controller.enqueue('fails', {});
  controller.enqueue('succeeds', {});
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(settled[0].spoken, false);
  assert.equal(settled[0].reason, 'error');
  assert.equal(settled[1].spoken, true);
});

test('an empty/falsy text is a no-op - never enqueued, never calls speak()', async () => {
  const module = await sandbox();
  let speakCalled = false;
  const controller = module.create({ speak: () => { speakCalled = true; return Promise.resolve(); } });
  controller.enqueue('', {});
  controller.enqueue(null, {});
  assert.equal(speakCalled, false);
  assert.equal(controller.queueLength(), 0);
});
