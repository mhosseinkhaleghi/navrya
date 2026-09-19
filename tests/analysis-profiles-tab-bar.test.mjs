import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Analysis Profiles tab bug: opening the "Analysis Profiles" pill used to return the tab with NO
// hero and NO Patterns/Strategies/Positions/Analysis Profiles pill bar (PositionsView and IndexView
// both render it), so the list screen was detached from its own tab strip. Static-source style, the
// same convention as tests/analysis-profile-onboarding.test.mjs (no JSX transform in `node --test`).
const root = process.cwd();
// Checked-out sources may be CRLF (core.autocrlf on Windows) - normalize so the block slicing below
// never depends on the checkout's line endings.
const readSource = async (file) => (await readFile(path.join(root, 'navrya-src', file), 'utf8')).replace(/\r\n/g, '\n');
const hubSrc = await readSource('strategiesHubView.jsx');
const viewSrc = await readSource('analysisProfilesView.jsx');

function analysisProfilesBranch() {
  const start = hubSrc.indexOf("if (tab === 'analysis-profiles') {");
  assert.ok(start > -1, 'the hub must still have a dedicated analysis-profiles render branch');
  const end = hubSrc.indexOf('if (!item) {', start);
  assert.ok(end > start, 'could not bound the analysis-profiles branch');
  return hubSrc.slice(start, end);
}

test('the hub renders the shared TopTabBar for the Analysis Profiles tab, wired to the same tab state as every other tab', () => {
  const branch = analysisProfilesBranch();
  assert.match(branch, /<TopTabBar[\s\S]*?tab=\{tab\} setTab=\{setTab\}/, 'the pill bar must be bound to the hub\'s own tab/setTab');
  assert.match(branch, /analysisProfilesCount=/, 'the pill bar must carry the Analysis Profiles count');
  assert.match(branch, /tradesCount=/, 'the pill bar must carry the Positions count too, otherwise its badge would read 0');
});

test('the hub gives the tab the same hero block Patterns/Strategies/Positions show, and keeps the hub class name', () => {
  const branch = analysisProfilesBranch();
  assert.match(branch, /tr\(lang, 'eyebrow'\)/);
  assert.match(branch, /<h1[^>]*>\{tr\(lang, 'title'\)\}<\/h1>/);
  assert.match(branch, /className="navrya-strategies-hub"/);
});

test('the hero and pill bar are handed to AnalysisProfilesTab as an opaque header node (the domain stays unaware of the hub\'s tab model)', () => {
  const branch = analysisProfilesBranch();
  assert.match(branch, /<AnalysisProfilesTab[^>]*header=\{header\}/);
  assert.match(viewSrc, /export function AnalysisProfilesTab\(\{ lang, header \}\)/);
  assert.doesNotMatch(viewSrc, /TopTabBar/, 'analysisProfilesView.jsx must not import or know about the hub\'s TopTabBar');
});

test('the header only appears on the LIST screen - the detail screen keeps its own "Back to list" like a Pattern detail', () => {
  const detailReturn = viewSrc.slice(viewSrc.indexOf('if (openProfile) {'), viewSrc.indexOf('return (\n    <div style={{ display: \'flex\', flexDirection: \'column\', gap: 20 }}>'));
  assert.ok(detailReturn.length > 0, 'could not locate the detail-state return block');
  assert.doesNotMatch(detailReturn, /\{header\}/, 'the detail screen must not render the list header');
  const listReturn = viewSrc.slice(viewSrc.indexOf('return (\n    <div style={{ display: \'flex\', flexDirection: \'column\', gap: 20 }}>'));
  assert.match(listReturn, /\{header\}/, 'the list screen must render the header above its own title row');
});
