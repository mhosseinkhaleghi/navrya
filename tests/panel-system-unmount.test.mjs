import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();

// Found via real browser regression testing (Journey D): Element.remove() alone does not run a
// React 18 createRoot() root's own unmount lifecycle - none of a switched-away view's useEffect
// cleanup functions ever fired, which meant settingsView.jsx's own TradingDefaultsSection AI
// process registration (isOpen: () => mountedRef.current) never actually closed after the first
// Settings visit, permanently blocking chat-based action discovery (Journey A/B/C) for the rest
// of the page session. panel-system.js's own render() now unmounts the previous view's stashed
// React root before detaching it; these are lightweight static-source guards (this codebase has
// no DOM/React test harness for panel-system.js's own real browser behavior - see the actual
// real-browser regression pass for the live, end-to-end proof) against silently reintroducing the
// bug, e.g. by "simplifying" render() back to a bare .remove() call.

test('panel-system.js unmounts the previous panel\'s React root before detaching it, not just Element.remove()', async () => {
  const source = await readFile(path.join(root, 'public', 'pages', 'shared', 'panel-system.js'), 'utf8');
  assert.match(source, /panelPage\._reactRoot/, 'render() must read the stashed React root off the outgoing panelPage');
  assert.match(source, /panelPage\._reactRoot\.unmount\s*\(\s*\)/, 'render() must actually call .unmount() on it');
  // The unmount call must happen before the node is detached, not after - detaching first would
  // leave nothing for a later unmount to act on in a way that still runs cleanup correctly.
  const unmountAt = source.indexOf('.unmount()');
  const removeAt = source.indexOf('panelPage.remove()');
  assert.ok(unmountAt > -1 && removeAt > -1 && unmountAt < removeAt, 'unmount() must run before panelPage.remove()');
});

test('each of the three panel-system.js-mounted views (dashboard/strategies/settings) stashes its own createRoot() root as _reactRoot', async () => {
  const files = ['dashboardView.jsx', 'strategiesHubView.jsx', 'settingsView.jsx'];
  for (const file of files) {
    const source = await readFile(path.join(root, 'navrya-src', file), 'utf8');
    assert.match(source, /container\._reactRoot\s*=\s*root/, file + ' must stash its createRoot() root onto the returned container');
  }
});
