import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();

// Production repair pass (Bug A): found via real browser measurement that
// ResizeObserverEntry.contentRect reports the CONTENT box (excludes the row's own padding), so
// ChatDock.jsx's popover-gap math under-measured the input row by ~18-20px and visibly
// overlapped it - confirmed via getBoundingClientRect() before/after. Separately, Modal.jsx (and
// every hand-rolled dialog backdrop that copies its pattern) had no awareness of the fixed
// ChatDock's own reserved bottom space, so a sufficiently tall dialog's own footer buttons landed
// underneath the higher-z-index dock and became genuinely unclickable - confirmed via a real
// document.elementFromPoint() hit-test at the button's own center returning the dock's own node.
// This codebase has no DOM/React test harness for pixel-level layout (the actual before/after
// proof is the real-browser measurement, not a unit test) - these are lightweight static-source
// guards against silently reintroducing either regression, the same convention already
// established for the panel-system.js React-unmount fix (tests/panel-system-unmount.test.mjs).

test('ChatDock.jsx measures the input row via the real border-box height (offsetHeight), never the content-box-only ResizeObserver contentRect', async () => {
  const source = await readFile(path.join(root, 'public', 'pages', 'shared', 'navrya', 'components', 'assistant', 'ChatDock.jsx'), 'utf8');
  assert.match(source, /setRowHeight\(el\.offsetHeight\)/, 'must read the row\'s real border-box height off the DOM node');
  assert.doesNotMatch(source, /contentRect\.height/, 'must not go back to measuring the content-box-only ResizeObserver entry');
});

test('ChatDock.jsx publishes its own real reserved bottom footprint as a CSS custom property other fixed UI can read', async () => {
  const source = await readFile(path.join(root, 'public', 'pages', 'shared', 'navrya', 'components', 'assistant', 'ChatDock.jsx'), 'utf8');
  assert.match(source, /setProperty\('--navrya-chat-dock-reserved'/, 'must publish the reserved-space CSS variable');
  assert.match(source, /removeProperty\('--navrya-chat-dock-reserved'\)/, 'must clear it again on unmount');
});

test('Modal.jsx (and every dialog that hand-rolls its z-index:100 backdrop pattern touched by this repair) reserves the ChatDock\'s published bottom space', async () => {
  const files = [
    path.join('public', 'pages', 'shared', 'navrya', 'components', 'feedback', 'Modal.jsx'),
    path.join('navrya-src', 'tradeCalculatorModal.jsx'),
    path.join('navrya-src', 'tradeDetailsModal.jsx')
  ];
  for (const file of files) {
    const source = await readFile(path.join(root, file), 'utf8');
    assert.match(source, /var\(--navrya-chat-dock-reserved,\s*0px\)/, file + ' must reserve the dock\'s own space with a safe 0px default for pages with no ChatDock mounted');
  }
});
