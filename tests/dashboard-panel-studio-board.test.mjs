import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// dashboardView.jsx has no JSX transform in this runner (see tests/dashboard-board-sync.test.mjs's
// own header comment for the established reason), so the Panel Studio's additive board wiring is
// verified against the real source text, the same convention that file already uses. This file
// specifically guards the brief's "dashboard apply integration preserves existing board behavior"
// requirement: legacy {title,desc} panels must stay byte-for-byte reachable, never auto-converted.

const root = process.cwd();
let text;

test.before(async () => {
  text = await readFile(path.join(root, 'navrya-src', 'dashboardView.jsx'), 'utf8');
});

test('resolveCustomEntry additively supports the artifact shape while the legacy {title,desc} branch is untouched', () => {
  assert.match(text, /if \(entry\.kind === 'artifact'\) \{\s*\n\s*return \{ title: entry\.title, icon: 'sparkle', span: 4, desc: '', kind: 'artifact', artifactId: entry\.artifactId, revisionId: entry\.revisionId \};/);
  assert.match(text, /return \{ title: entry\.title, icon: 'sparkle', span: 4, desc: entry\.desc \};/, 'the original legacy return shape must still exist verbatim');
});

test('addCustomPanel (legacy prose-note path) is completely unchanged - no kind field, no migration', () => {
  const fn = /export function addCustomPanel\(character, title, desc\) \{[\s\S]*?\n\}/.exec(text);
  assert.ok(fn, 'addCustomPanel not found');
  assert.doesNotMatch(fn[0], /kind/, 'addCustomPanel must never write a kind field - it only ever produces the legacy {title,desc} shape');
  assert.match(fn[0], /custom: \{ \.\.\.state\.custom, \[id\]: \{ title: String\(title \|\| ''\)\.slice\(0, 60\), desc: String\(desc \|\| ''\) \} \}/);
});

test('addArtifactPanel reuses the same board slot id when the artifact is already on the board, instead of duplicating it', () => {
  const fn = /export function addArtifactPanel\(character, artifactId, title, revisionId\) \{[\s\S]*?\n\}/.exec(text);
  assert.ok(fn, 'addArtifactPanel not found');
  assert.match(fn[0], /state\.custom\[k\]\.kind === 'artifact' && state\.custom\[k\]\.artifactId === artifactId/);
  assert.match(fn[0], /const id = existingId \|\|/);
  assert.match(fn[0], /kind: 'artifact', artifactId, revisionId/);
  // The board entry stores identifiers only - never the actual source - keeping the preference
  // object small regardless of how large the real revision source is.
  assert.doesNotMatch(fn[0], /source/i);
});

test('panelBody dispatches an artifact custom entry to ArtifactPanelSlot, and the legacy note-card fallback is untouched for every other custom entry', () => {
  const fn = /function panelBody\(id, ctx\) \{[\s\S]*?\n\}/.exec(text);
  assert.ok(fn, 'panelBody not found');
  assert.match(fn[0], /if \(entry\.kind === 'artifact'\) return <ArtifactPanelSlot entry=\{entry\} character=\{character\} \/>;/);
  assert.match(fn[0], /<p style=\{\{ margin: 0, font: 'var\(--type-body\)', color: 'var\(--text-muted\)' \}\}>\{entry\.desc\}<\/p>/);
});

test('ArtifactPanelSlot fetches through the canonical Panel Studio API, never injects raw HTML, and never persists the fetched source anywhere itself', () => {
  const fn = /function ArtifactPanelSlot\(\{ entry, character \}\) \{[\s\S]*?\n\}/.exec(text);
  assert.ok(fn, 'ArtifactPanelSlot not found');
  assert.match(fn[0], /fetch\('\/api\/sync\/panel-studio\/artifacts\/' \+ entry\.artifactId/);
  assert.doesNotMatch(fn[0], /dangerouslySetInnerHTML/);
  assert.doesNotMatch(fn[0], /\beval\(/);
  assert.doesNotMatch(fn[0], /localStorage|setPref\(/, 'a dashboard render must never write board/preference state as a side effect of merely displaying a panel');
  // pulse/snapshotRef come from useDashboardBridgeSnapshot(character) - the same live-refresh hook
  // the Studio's own preview column uses - not a hardcoded pulse={0}/one-shot ref, so an applied
  // board panel's data updates on real trade/pattern/psychology-education changes instead of
  // freezing at first mount.
  assert.match(fn[0], /const \{ snapshotRef, pulse \} = useDashboardBridgeSnapshot\(character\);/);
  assert.match(fn[0], /<SandboxedDashboardPanel source=\{record\.source\} snapshotRef=\{snapshotRef\} title=\{entry\.title\} pulse=\{pulse\} \/>/);
});

test('dashboardView.jsx imports the sandbox runtime from its own independent module, never from analysisWorkspacePanelRuntime.jsx', () => {
  assert.match(text, /import \{ SandboxedDashboardPanel, useDashboardBridgeSnapshot \} from '\.\/dashboardPanelSandbox\.jsx';/);
  assert.doesNotMatch(text, /analysisWorkspacePanelRuntime/);
});
