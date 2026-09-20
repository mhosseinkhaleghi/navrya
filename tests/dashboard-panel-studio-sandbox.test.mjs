import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// navrya-src/*.jsx has no JSX transform in this runner, so the security properties are asserted
// against the real source text - the same convention tests/analysis-workspace-panel.test.mjs and
// tests/live-session-market-chart.test.mjs already use. This is a deliberately independent module
// from analysisWorkspacePanelRuntime.jsx (see that file's own header comment on why it is never
// touched), so this test proves the NEW sandbox is independently secure rather than merely
// copy-pasted correctly once.

const root = process.cwd();
let runtimeSrc;
let runtimeCode; // comments stripped, so a "must never appear" assertion checks the implementation, not its own documentation

test.before(async () => {
  runtimeSrc = await readFile(path.join(root, 'navrya-src', 'dashboardPanelSandbox.jsx'), 'utf8');
  runtimeCode = runtimeSrc.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
});

test('a generated dashboard panel is sandboxed with no same-origin access, and its code is never evaluated in the app realm', () => {
  const attrs = runtimeCode.match(/sandbox="[^"]*"/g) || [];
  assert.ok(attrs.length, 'no sandbox attribute found at all');
  attrs.forEach((attr) => assert.equal(attr, 'sandbox="allow-scripts"'));
  assert.doesNotMatch(runtimeCode, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(runtimeCode, /\beval\(/);
  assert.doesNotMatch(runtimeCode, /new Function\(/);
});

test('the panel document blocks every network egress path, so dashboard activity data cannot be exfiltrated', () => {
  const csp = /Content-Security-Policy" content="([^"]+)"/.exec(runtimeSrc);
  assert.ok(csp, 'no CSP found in the panel document');
  const policy = csp[1].replace(/\\'/g, "'");
  assert.match(policy, /default-src 'none'/);
  assert.doesNotMatch(policy, /connect-src/, 'connect-src must stay unset so it inherits default-src none');
  assert.doesNotMatch(policy, /https?:/);
  assert.doesNotMatch(policy, /unsafe-eval/);
});

test('the bridge authenticates the child by window identity, not by an origin string a sandboxed frame cannot provide', () => {
  assert.match(runtimeSrc, /event\.source !== frame\.contentWindow/);
});

test('the bridge exposes getters only - there is no method through which a panel could write to the dashboard', () => {
  const methods = /export const BRIDGE_METHODS = \[([^\]]+)\]/.exec(runtimeSrc);
  assert.ok(methods, 'BRIDGE_METHODS not found');
  const list = methods[1].split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean);
  assert.deepEqual(list, ['tradeSummary', 'openPositions', 'patternStats', 'psychologyMirror']);
  list.forEach((m) => assert.doesNotMatch(m, /^(set|save|add|update|delete|remove|log)/i));
  assert.match(runtimeSrc, /error: ok \? undefined : 'UNKNOWN_METHOD'/);
});

test('the snapshot handed to a panel carries dashboard activity facts only - never identity, wallet, or image data', () => {
  const snapshot = /export function buildDashboardBridgeSnapshot\(character\) \{[\s\S]*?\n\}/.exec(runtimeSrc);
  assert.ok(snapshot, 'buildDashboardBridgeSnapshot not found');
  [/email/i, /userId/i, /token/i, /apiKey/i, /wallet/i, /balance/i, /imageBlobId/i, /preview/i].forEach((re) => {
    assert.doesNotMatch(snapshot[0], re, `buildDashboardBridgeSnapshot must not expose ${re}`);
  });
});

test('this module never imports from, and is not imported by, analysisWorkspacePanelRuntime.jsx - a fully independent sandbox', async () => {
  assert.doesNotMatch(runtimeSrc, /^\s*import .*analysisWorkspacePanelRuntime/m);
  const analysisRuntimeSrc = await readFile(path.join(root, 'navrya-src', 'analysisWorkspacePanelRuntime.jsx'), 'utf8');
  assert.doesNotMatch(analysisRuntimeSrc, /dashboardPanelSandbox/, 'the untouched existing sandbox must remain completely unaware of the new one');
});
