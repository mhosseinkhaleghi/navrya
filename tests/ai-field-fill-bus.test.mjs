import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = file => readFile(shared(file), 'utf8');

async function busSandbox() {
  const sandbox = { window: {} };
  vm.runInNewContext(await source('ai-field-fill-bus.js'), sandbox, { filename: 'ai-field-fill-bus.js' });
  return sandbox.window.TradeJournalAIFieldFillBus;
}

test('on() + emit() delivers the event to a matching (processId, path) subscriber', async () => {
  const bus = await busSandbox();
  const received = [];
  bus.on('trade-wizard', 'entryPrice', (evt) => received.push(evt));
  bus.emit('trade-wizard', 'entryPrice', { value: '1950', mode: 'replace' });
  assert.equal(received.length, 1);
  assert.equal(received[0].processId, 'trade-wizard');
  assert.equal(received[0].path, 'entryPrice');
  assert.equal(received[0].value, '1950');
  assert.equal(received[0].mode, 'replace');
  assert.equal(typeof received[0].timestamp, 'number');
});

test('emit() never delivers to a subscriber on a different processId or a different path', async () => {
  const bus = await busSandbox();
  const received = [];
  bus.on('trade-wizard', 'entryPrice', (evt) => received.push(evt));
  bus.emit('trade-wizard', 'stopLoss', { value: '1900' });
  bus.emit('mh-intake', 'entryPrice', { value: '1950' });
  assert.deepEqual(received, []);
});

test('emit() with no subscribers at all is a silent no-op', async () => {
  const bus = await busSandbox();
  assert.doesNotThrow(() => bus.emit('nothing-subscribed', 'anyPath', { value: 1 }));
});

test('the unsubscribe function returned by on() stops further delivery', async () => {
  const bus = await busSandbox();
  const received = [];
  const off = bus.on('trade-wizard', 'entryPrice', (evt) => received.push(evt));
  bus.emit('trade-wizard', 'entryPrice', { value: 'first' });
  off();
  bus.emit('trade-wizard', 'entryPrice', { value: 'second' });
  assert.equal(received.length, 1);
  assert.equal(received[0].value, 'first');
});

test('multiple subscribers on the same (processId, path) all receive the event', async () => {
  const bus = await busSandbox();
  const a = [];
  const b = [];
  bus.on('trade-wizard', 'entryPrice', (evt) => a.push(evt));
  bus.on('trade-wizard', 'entryPrice', (evt) => b.push(evt));
  bus.emit('trade-wizard', 'entryPrice', { value: '1950' });
  assert.equal(a.length, 1);
  assert.equal(b.length, 1);
});

test('a throwing handler never prevents a later handler for the same event from running', async () => {
  const bus = await busSandbox();
  const received = [];
  bus.on('trade-wizard', 'entryPrice', () => { throw new Error('boom'); });
  bus.on('trade-wizard', 'entryPrice', (evt) => received.push(evt));
  assert.doesNotThrow(() => bus.emit('trade-wizard', 'entryPrice', { value: '1950' }));
  assert.equal(received.length, 1);
});

test('a handler that unsubscribes itself mid-dispatch does not skip a still-pending sibling handler', async () => {
  const bus = await busSandbox();
  const received = [];
  let offA;
  offA = bus.on('trade-wizard', 'entryPrice', () => { received.push('a'); offA(); });
  bus.on('trade-wizard', 'entryPrice', () => received.push('b'));
  bus.emit('trade-wizard', 'entryPrice', { value: '1950' });
  assert.deepEqual(received.sort(), ['a', 'b']);
});

// Slice V1 (visual step/AiMagicFill), audit item 5: two genuinely distinct, rapid emits (e.g. a
// voice correction landing within the same millisecond as the value it corrects) must never be
// mistaken for the same event - a plain timestamp could theoretically collide; this eventId never
// does, by construction (a monotonic counter, not derived from time or value at all).
test('every emit() carries a real, monotonically-increasing eventId - two rapid emits for the same (processId, path) never share one, even with identical value/mode/timestamp', async () => {
  const bus = await busSandbox();
  const received = [];
  bus.on('trade-wizard', 'entryPrice', (evt) => received.push(evt));
  bus.emit('trade-wizard', 'entryPrice', { value: '1950' });
  bus.emit('trade-wizard', 'entryPrice', { value: '1950' }); // identical value, deliberately
  assert.equal(received.length, 2);
  assert.equal(typeof received[0].eventId, 'number');
  assert.equal(typeof received[1].eventId, 'number');
  assert.notEqual(received[0].eventId, received[1].eventId);
  assert.ok(received[1].eventId > received[0].eventId, 'eventId must be monotonically increasing');
});
