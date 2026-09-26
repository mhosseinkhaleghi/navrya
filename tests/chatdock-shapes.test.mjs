import assert from 'node:assert/strict';
import test from 'node:test';

import { reduceShape, initialShape, IDLE_TO_SEED_MS, PEEK_HOLD_MS } from '../public/pages/shared/navrya/components/assistant/dockShape.js';

// ChatDock capsule design, plate III "one body, four shapes": seed -> capsule -> peek -> scroll (the
// side is a placement of the scroll). The state machine is pure, so the flow diagram at the bottom of
// the plate is checked here move by move.

const run = (state, ...types) => types.reduce((s, type) => reduceShape(s, typeof type === 'string' ? { type } : type), state);

test('the dock starts as the capsule, unpinned unless the user pinned it before', () => {
  assert.deepEqual(initialShape(), { shape: 'capsule', unseen: 0, pinned: false });
  assert.equal(initialShape({ pinned: true }).pinned, true);
});

test('timings are the design\'s: 8 seconds of idleness fold the capsule to the seed; a peek is held for a while', () => {
  assert.equal(IDLE_TO_SEED_MS, 8000);
  assert.ok(PEEK_HOLD_MS >= 8000 && PEEK_HOLD_MS <= 20000);
});

test('the flow: seed <-> capsule <-> peek -> scroll, exactly the plate\'s arrows', () => {
  let s = initialShape();
  s = run(s, 'collapse');
  assert.equal(s.shape, 'seed', 'click on the page / 8 s of idleness');
  s = run(s, 'open');
  assert.equal(s.shape, 'capsule', 'click on the seed or Ctrl K');
  s = run(s, 'reply');
  assert.equal(s.shape, 'peek', 'a reply arrives while the conversation is closed');
  s = run(s, 'expand');
  assert.equal(s.shape, 'scroll', 'click on the peek or the up key');
  s = run(s, 'fold');
  assert.equal(s.shape, 'capsule', 'the header\'s collapse');
  s = run(s, 'reply', 'peekTimeout');
  assert.equal(s.shape, 'capsule', 'an ignored peek folds itself away');
});

test('a reply that lands while the dock is the seed is counted, not shown; opening then shows it as a peek', () => {
  let s = run(initialShape(), 'collapse', 'reply', 'reply');
  assert.deepEqual(s, { shape: 'seed', unseen: 2, pinned: false });
  s = run(s, 'open');
  assert.deepEqual(s, { shape: 'peek', unseen: 0, pinned: false }, 'the pill "reply ready - view" opens straight onto the reply');
  assert.equal(run(initialShape(), 'collapse', 'open').shape, 'capsule', 'with nothing new the seed opens to the plain capsule');
});

test('a seed can never stay collapsed under a caret or a live voice session', () => {
  assert.equal(run(initialShape(), 'collapse', 'focus').shape, 'capsule');
  assert.equal(run(initialShape(), 'collapse', 'voice').shape, 'capsule');
  assert.equal(run(initialShape(), 'voice').shape, 'capsule', 'no-op elsewhere');
});

test('only a capsule or a peek folds to the seed - never the open conversation', () => {
  assert.equal(run(initialShape(), 'reply', 'collapse').shape, 'seed');
  assert.equal(run(initialShape(), 'reply', 'expand', 'collapse').shape, 'scroll');
});

test('an open conversation stays open when another reply lands, and a peek is replaced in place', () => {
  assert.equal(run(initialShape(), 'reply', 'expand', 'reply').shape, 'scroll');
  assert.equal(run(initialShape(), 'reply', 'reply').shape, 'peek');
});

test('close returns to the capsule from anywhere except the seed; pin opens the scroll and remembers; unpin keeps the shape', () => {
  assert.equal(run(initialShape(), 'reply', 'close').shape, 'capsule');
  assert.equal(run(initialShape(), 'reply', 'expand', 'close').shape, 'capsule');
  assert.equal(run(initialShape(), 'collapse', 'close').shape, 'seed');
  const pinned = run(initialShape(), 'pin');
  assert.deepEqual(pinned, { shape: 'scroll', unseen: 0, pinned: true });
  assert.deepEqual(run(pinned, 'unpin'), { shape: 'scroll', unseen: 0, pinned: false });
});

test('unknown events and a missing state are harmless', () => {
  const s = initialShape();
  assert.equal(reduceShape(s, { type: 'nonsense' }), s);
  assert.equal(reduceShape(s, null), s);
  assert.equal(reduceShape(undefined, { type: 'reply' }).shape, 'peek');
});
