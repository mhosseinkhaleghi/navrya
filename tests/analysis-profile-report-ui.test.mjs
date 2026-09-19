import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Analysis Profile "Report" tab (ARCHITECTURE.md §7.25, Phase 5). Same static-source convention as
// tests/analysis-profile-training-ui.test.mjs for the .jsx file as a whole (no JSX transform in
// `node --test`), but loadProfileUsage()/buildProfileReport() are plain functions with no JSX in
// their bodies - real logic worth running, not just reading - so they are extracted and executed in
// a bare vm sandbox, the same technique tests/analysis-profile-memory-fields.test.mjs already uses
// for this domain's other pure helpers.

const root = process.cwd();
const read = async (file) => (await readFile(path.join(root, 'navrya-src', file), 'utf8')).replace(/\r\n/g, '\n');

// vm-sandboxed objects are cross-realm - assert.deepEqual (strict) also compares prototypes, so
// re-serialize through JSON before comparing, same fix tests/analysis-profile-memory-fields.test.mjs applies.
const plain = (value) => JSON.parse(JSON.stringify(value));

function fnBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start > -1, `could not find function ${name}`);
  const next = source.slice(start + 10).search(/\n  (?:async )?function \w+\(|\nexport function |\nfunction /);
  const body = source.slice(start, next > -1 ? start + 10 + next : source.length);
  return body.replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/\s.*$/gm, '');
}

async function loadPureHelpers() {
  const source = await read('analysisProfileReport.jsx');
  const code = fnBody(source, 'loadProfileUsage') + '\n' + fnBody(source, 'buildProfileReport') +
    '\nglobalThis.__report = { loadProfileUsage, buildProfileReport };';
  const sandbox = { Promise, console };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'analysisProfileReport.pure.js' });
  return sandbox.__report;
}

// ---- loadProfileUsage ------------------------------------------------------------------------------

test('loadProfileUsage() rejects up front when the store is unavailable, without touching any store method', async () => {
  const { loadProfileUsage } = await loadPureHelpers();
  await assert.rejects(loadProfileUsage(null, 'p1', true), /ANALYSIS_PROFILE_STORE_UNAVAILABLE/);
});

test('loadProfileUsage() settles the ledger before reading it, and returns both the runs and the events together', async () => {
  const { loadProfileUsage } = await loadPureHelpers();
  const calls = [];
  const store = {
    settleEvents: async () => { calls.push('settle'); },
    listEvents: async (id) => { calls.push('list:' + id); return [{ id: 'ev-1' }]; },
    getUsage: async (id) => { calls.push('usage:' + id); return [{ id: 'run-1' }]; }
  };
  const result = await loadProfileUsage(store, 'p1', true);
  assert.deepEqual(plain(result), { analyses: [{ id: 'run-1' }], events: [{ id: 'ev-1' }] });
  assert.equal(calls.indexOf('settle') < calls.indexOf('list:p1'), true, 'settleEvents() must run before listEvents()');
});

test('loadProfileUsage() skips the ledger entirely when withEvents is false (the Overview summary never needs the token history)', async () => {
  const { loadProfileUsage } = await loadPureHelpers();
  let settleCalled = false, listCalled = false;
  const store = { settleEvents: async () => { settleCalled = true; }, listEvents: async () => { listCalled = true; return []; }, getUsage: async () => [{ id: 'run-1' }] };
  const result = await loadProfileUsage(store, 'p1', false);
  assert.deepEqual(plain(result), { analyses: [{ id: 'run-1' }], events: [] });
  assert.equal(settleCalled, false);
  assert.equal(listCalled, false);
});

test('loadProfileUsage() propagates a getUsage() rejection (e.g. a real AnalysisProfileError) rather than swallowing it', async () => {
  const { loadProfileUsage } = await loadPureHelpers();
  const store = { settleEvents: async () => {}, listEvents: async () => [], getUsage: async () => { throw new Error('ANALYSIS_PROFILE_NOT_FOUND'); } };
  await assert.rejects(loadProfileUsage(store, 'missing', true), /ANALYSIS_PROFILE_NOT_FOUND/);
});

// ---- buildProfileReport ----------------------------------------------------------------------------

test('buildProfileReport() returns null when the usage module is missing, and never calls compute()', async () => {
  const { buildProfileReport } = await loadPureHelpers();
  assert.equal(buildProfileReport(null, {}), null);
});

test('buildProfileReport() returns null (rather than throwing) when compute() itself throws', async () => {
  const { buildProfileReport } = await loadPureHelpers();
  const usage = { compute() { throw new Error('boom'); } };
  assert.equal(buildProfileReport(usage, { profileId: 'p1' }), null);
});

test('buildProfileReport() forwards its input to compute() unchanged and returns its result', async () => {
  const { buildProfileReport } = await loadPureHelpers();
  let seen = null;
  const usage = { compute(input) { seen = input; return { empty: false, marker: 42 }; } };
  const input = { profileId: 'p1', analyses: [], sessions: [], trades: [], events: [], concepts: [], timeZone: 'UTC', now: 1000 };
  assert.deepEqual(buildProfileReport(usage, input), { empty: false, marker: 42 });
  assert.equal(seen, input);
});

// ---- wiring / structure (static source) --------------------------------------------------------------

test('useProfileUsage() is the only thing that resolves "error" from a "ready" state with no report - loading is never mistaken for a failure', async () => {
  const source = await read('analysisProfileReport.jsx');
  const hook = fnBody(source, 'useProfileUsage');
  assert.match(hook, /status: state\.status === 'ready' && !report \? 'error' : state\.status/);
});

test('ProfileReport is the only component that shows the loading/retry states - ProfileReportView (used by both ProfileReport and any future embed) only ever draws an already-computed report', async () => {
  const source = await read('analysisProfileReport.jsx');
  const view = fnBody(source, 'ProfileReportView');
  assert.doesNotMatch(view, /rptLoading|rptLoadFailed|rptRetry/, 'ProfileReportView must not know about the loading/error states');
  const wrapper = fnBody(source, 'ProfileReport');
  assert.match(wrapper, /rptLoading/);
  assert.match(wrapper, /rptLoadFailed/);
  assert.match(wrapper, /ProfileReportView/);
});

test('the funnel is scenarios -> resolved -> confirmed (each a real subset of the last) - analyses is deliberately a KPI tile, not a funnel stage, since one analysis can add several scenarios', async () => {
  const source = await read('analysisProfileReport.jsx');
  const funnel = fnBody(source, 'FunnelPanel');
  assert.match(funnel, /STAGE_KEYS\[f\.key\]/);
  assert.doesNotMatch(funnel, /rptStageAnalyses/);
  const stageKeys = source.match(/const STAGE_KEYS = \{([^}]*)\};/)[1];
  assert.doesNotMatch(stageKeys, /analyses:/);
});

test('heat cells are scaled against the grid\'s own maximum, not a hardcoded ceiling, so a busy profile does not paint every cell at full intensity', async () => {
  const source = await read('analysisProfileReport.jsx');
  const heat = fnBody(source, 'HeatPanel');
  assert.match(heat, /heatCellEl\(v, lang, heat\.max\)/);
});

test('the per-concept adherence bars only show concepts the profile still has - a coverage row for a deleted concept id is silently dropped, never rendered with its raw id as a label', async () => {
  const source = await read('analysisProfileReport.jsx');
  const panel = fnBody(source, 'ConceptPanel');
  assert.match(panel, /report\.adherence\.perConcept\.filter\(\(row\) => titles\[row\.conceptId\]\)/);
});

test('UsageSummary fetches with events:false (the Overview line never needs the token ledger) and both it and the Report read the SAME pure module and store, never duplicating the math', async () => {
  const source = await read('analysisProfileReport.jsx');
  const summary = fnBody(source, 'UsageSummary');
  assert.match(summary, /useProfileUsage\(profile, \{ events: false \}\)/);
  // Both ProfileReport and UsageSummary call the SAME useProfileUsage() hook - `usage.compute(` must appear exactly once in real code
  // (excluding prose comments), proving there is no second, slightly different math path for the Overview line vs. the full Report.
  const code = source.replace(/^\s*\/\/.*$/gm, '');
  assert.equal((code.match(/usage\.compute\(/g) || []).length, 1, 'usage.compute() must be called from exactly one place');
});

test('every chart primitive the report uses comes from reportCharts.jsx (the same module the Patterns report imports) - no second copy grew here', async () => {
  const source = await read('analysisProfileReport.jsx');
  assert.match(source, /from '\.\/reportCharts\.jsx'/);
  for (const name of ['digits', 'percentSign', 'donutChart', 'trendSvg', 'funnelSvg', 'rDistSvg', 'heatCellEl', 'barFillEl', 'movingAverage', 'KpiTile']) {
    assert.match(source, new RegExp(`\\b${name}\\b`), `analysisProfileReport.jsx must use ${name} from reportCharts.jsx`);
  }
  const strategiesHub = await read('strategiesHubView.jsx');
  assert.match(strategiesHub, /from '\.\/reportCharts\.jsx'/, 'strategiesHubView.jsx must import the same module, not its own copy');
});

// ---- wiring into analysisProfilesView.jsx ------------------------------------------------------------

test('the Overview tab renders the real UsageSummary and the Report tab renders the real ProfileReport - neither the old "insufficient data" placeholder rows nor the removed sessionUsageUnavailable copy key survive', async () => {
  const view = await read('analysisProfilesView.jsx');
  assert.match(view, /import \{ ProfileReport, UsageSummary \} from '\.\/analysisProfileReport\.jsx';/);
  assert.match(view, /<UsageSummary key=\{profile\.id\} profile=\{profile\} lang=\{lang\} onOpenReport=\{\(\) => setDtab\('report'\)\} \/>/);
  assert.match(view, /<ProfileReport key=\{profile\.id\} profile=\{profile\} lang=\{lang\} \/>/);
  assert.doesNotMatch(view, /sessionUsageUnavailable/, 'the obsolete placeholder copy key must be fully removed, not just unused');
  assert.doesNotMatch(view, /reportSessionUsage|reportMarkets|reportTimeframes/, 'the old placeholder report rows must be gone now that real charts exist');
});

test('the Report tab still shows the plain configuration facts (created/updated/default/styles/focus count/linked strategies) alongside the new charts', async () => {
  const view = await read('analysisProfilesView.jsx');
  for (const key of ['reportCreated', 'reportUpdated', 'reportDefault', 'reportPrimary', 'reportSecondary', 'reportFocusCount', 'reportLinkedStrategies']) {
    assert.match(view, new RegExp(`tr\\(lang, '${key}'\\)`), `configuration row for ${key} must still be rendered`);
  }
  assert.match(view, /trt\(lang, 'rptConfigTitle'\)/);
});

// ---- script tag on every character page --------------------------------------------------------------

test('every character page loads analysis-profile-usage.js as a deferred script, right after analysis-profile-brief.js', async () => {
  for (const character of ['hunter', 'commander', 'engineer', 'sage']) {
    const html = await readFile(path.join(root, 'public', 'pages', character, 'index.html'), 'utf8');
    assert.match(
      html,
      /<script defer src="\.\.\/shared\/analysis-profile-brief\.js"><\/script>\r?\n\s*<script defer src="\.\.\/shared\/analysis-profile-usage\.js"><\/script>/,
      `${character}/index.html must load analysis-profile-usage.js right after analysis-profile-brief.js`
    );
  }
});
