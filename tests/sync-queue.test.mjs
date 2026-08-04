import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = process.cwd();
const source = () => readFile(path.join(root, 'public', 'pages', 'shared', 'sync-queue.js'), 'utf8');

// A fake localStorage (this project's standard test-sandbox convention) plus a synchronously-
// invoking setTimeout, so scheduleFlush()'s timer fires deterministically within the test
// instead of on a real clock - the module is written specifically so this is the only path
// flush() ever runs from (see the comment on scheduleFlush in sync-queue.js).
function queueSandbox() {
  const store = {};
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  };
  const listeners = {};
  const window = {
    addEventListener: (type, fn) => { listeners[type] = fn; },
    TradeJournalSyncQueue: undefined
  };
  const document = { hidden: false, addEventListener() {} };
  const sandbox = {
    window, document, localStorage,
    setTimeout: (fn) => { fn(); return 0; }, clearTimeout() {},
    Math, JSON, console, Date
  };
  return { sandbox, store };
}

async function load() {
  const { sandbox, store } = queueSandbox();
  vm.runInNewContext(await source(), sandbox, { filename: 'sync-queue.js' });
  return { queue: sandbox.window.TradeJournalSyncQueue, store, sandbox };
}

function outbox(store) {
  try { return JSON.parse(store['tradejournal:sync-queue:v1'] || '[]'); } catch (_) { return []; }
}

test('enqueue writes to the outbox and a registered sender receives it on flush; success removes it exactly once', async () => {
  const { queue, store } = await load();
  const sent = [];
  queue.enqueue('sessions', 'session-1', { hello: 'world' });
  assert.equal(outbox(store).length, 1, 'the write is queued before any sender exists');

  queue.registerModule('sessions', async (entry) => { sent.push(entry); });
  await queue.flush();

  assert.equal(sent.length, 1);
  assert.equal(sent[0].recordId, 'session-1');
  assert.deepEqual(sent[0].payload, { hello: 'world' });
  assert.equal(outbox(store).length, 0, 'a successfully sent entry is removed from the outbox');

  await queue.flush();
  assert.equal(sent.length, 1, 're-flushing after success must not resend the same entry');
});

test('a failing sender leaves the entry queued with backoff, not removed and not resent immediately', async () => {
  const { queue, store } = await load();
  let calls = 0;
  queue.registerModule('sessions', async () => { calls += 1; throw new Error('offline'); });
  queue.enqueue('sessions', 'session-2', { a: 1 });

  await queue.flush();
  assert.equal(calls, 1);
  const after1 = outbox(store);
  assert.equal(after1.length, 1, 'a failed send keeps the entry queued');
  assert.equal(after1[0].attempts, 1);
  assert.ok(after1[0].nextAttemptAt > Date.now(), 'backoff pushes the next attempt into the future');

  await queue.flush();
  assert.equal(calls, 1, 'flushing again before the backoff window elapses must not retry yet');
});

test('once connectivity returns (a later flush after backoff), the queued entry is finally delivered exactly once', async () => {
  const { queue, store } = await load();
  let shouldFail = true;
  const delivered = [];
  queue.registerModule('sessions', async (entry) => { if (shouldFail) throw new Error('offline'); delivered.push(entry); });
  queue.enqueue('sessions', 'session-3', { a: 1 });
  await queue.flush();
  assert.equal(delivered.length, 0);

  shouldFail = false;
  const entry = outbox(store)[0];
  entry.nextAttemptAt = 0; // simulate the backoff window having elapsed
  store['tradejournal:sync-queue:v1'] = JSON.stringify([entry]);
  await queue.flush();

  assert.equal(delivered.length, 1);
  assert.equal(outbox(store).length, 0);
});

test('pendingCount reports the outbox size, optionally filtered by module', async () => {
  const { queue } = await load();
  queue.enqueue('sessions', 's-1', {});
  queue.enqueue('patterns', 'p-1', {});
  assert.equal(queue.pendingCount(), 2);
  assert.equal(queue.pendingCount('sessions'), 1);
  assert.equal(queue.pendingCount('patterns'), 1);
  assert.equal(queue.pendingCount('trades'), 0);
});
