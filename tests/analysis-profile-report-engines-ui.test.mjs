import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { buildMaturity } from '../navrya-src/analysisProfileMaturity.js';
import { trainingCopy, trt } from '../navrya-src/analysisProfileTrainingCopy.js';
import { loadJsx, visibleText } from './helpers/render-jsx.mjs';

// The Analysis Profile Report's Engine usage and Learning-and-knowledge panels, actually RENDERED: numbers come from the real
// analysis-profile-usage.js (compute) so the panels are proven against the real report shape, in every language.

const root = process.cwd();
const LANGS = ['fa', 'ar', 'en', 'es'];
const read = async (file) => (await readFile(path.join(root, 'navrya-src', file), 'utf8')).replace(/\r\n/g, '\n');
const j = (value) => JSON.parse(JSON.stringify(value));
const PHYSICAL = /(?:margin|padding|border)-(?:left|right)\b|(?:^|[;"\s])(?:left|right):|text-align:\s*(?:left|right)/;
// The report draws its numbers with reportCharts.digits: Persian digits for fa, plain digits everywhere else (the same as the Patterns report).
const d = (lang, n) => (lang === 'fa' ? String(n).replace(/[0-9]/g, (x) => '۰۱۲۳۴۵۶۷۸۹'[+x]) : String(n));
// Panel's four ornament corners are deliberately symmetrical decoration (all four are always drawn), not directional layout.
const withoutOrnaments = (html) => html.replace(/<span aria-hidden="true" style="position:absolute;width:12px;height:12px;pointer-events:none;[^"]*"><\/span>/g, '');
// One engine card's markup, from its <li> to its </li>.
const cardOf = (html, key) => { const at = html.indexOf(`data-engine-key="${key}"`); return html.slice(html.lastIndexOf('<li', at), html.indexOf('</li>', at) + 5); };

let jsx;
let usage;
test.before(async () => {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(await readFile(path.join(root, 'public', 'pages', 'shared', 'analysis-profile-usage.js'), 'utf8'), sandbox, { filename: 'analysis-profile-usage.js' });
  usage = sandbox.window.TradeJournalAnalysisProfileUsage;
  jsx = await loadJsx({ report: 'navrya-src/analysisProfileReport.jsx' });
});
test.after(async () => { delete globalThis.window; if (jsx) await jsx.cleanup(); });

const NOW = '2026-03-15T12:00:00.000Z';
const run = (analysisId, provider, model, extra) => ({ analysisId, sessionId: 's1', entryId: 'e1', analysisType: 'initial', occurredAt: '2026-03-02T10:00:00Z', provider, model, activeMarketSession: 'London', conceptCoverage: null, ...extra });
const scenario = (id, analysisId, extra) => ({ id, aiSource: { source: 'ai_analysis', analysisId, analysisProfileId: 'p1' }, occurred: false, invalidationTagIds: [], probabilityHistory: [{ value: 60, loggedAt: '2026-03-03T00:00:00.000Z' }], ...extra });
const confirmed = { occurred: true, status: 'confirmed' };
const invalidated = { status: 'invalidated' };
const session = (scenarios) => ({ id: 's1', instrument: 'XAUUSD', timeframe: '15m', entries: [{ id: 'e1', timeframe: '5m', scenarios }] });
const profile = { id: 'p1', name: 'Structure trader', concepts: [{ id: 'k1', title: 'Swept level', priority: 'mandatory', origin: 'user', enabled: true }, { id: 'k2', title: 'HTF confirmation', priority: 'preferred', origin: 'ai', enabled: true }], understanding: { summary: 'Reads structure first.', version: 2, updatedAt: '2026-03-01T00:00:00.000Z' } };

function compute(input) { return j(usage.compute({ profileId: 'p1', now: NOW, timeZone: 'UTC', concepts: profile.concepts, ...input })); }
// gpt-x ran 3 times (2 scenarios, 1 confirmed + 1 invalidated); claude-y ran once and proposed a scenario that is still open.
function twoEngines() {
  return compute({
    analyses: [run('a1', 'openai', 'gpt-x'), run('a2', 'openai', 'gpt-x', { analysisType: 'update' }), run('a3', 'openai', 'gpt-x', { occurredAt: '2026-03-09T09:00:00Z' }), run('a4', 'anthropic', 'claude-y', { analysisType: 'scenario_evaluation' })],
    sessions: [session([scenario('s-a', 'a1', confirmed), scenario('s-b', 'a2', invalidated), scenario('s-c', 'a4')])]
  });
}
const maturityOf = (report, over) => j(buildMaturity({ profile, sources: [{ id: 's1', kind: 'pdf', status: 'taught' }, { id: 's2', kind: 'website', status: 'queued' }], events: [{ id: 'e1', kind: 'taught_source', createdAt: '2026-03-04T00:00:00.000Z', tokenUsage: { promptTokens: 5, completionTokens: 5 } }], report, ...over }));
const view = (report, lang, extra) => { globalThis.window = { matchMedia: () => ({ matches: false }), ...(extra || {}) }; return jsx.render(jsx.modules.report.ProfileReportView, { report, profile, lang, ...(extra && extra.props) }); };
const cards = (html) => html.match(/data-engine-card="true"/g) || [];

// ---- Engine usage ----------------------------------------------------------------------------------------------------------

test('one card per provider + model, most-used first, with its run count and the honest note that runs are not quality', () => {
  const report = twoEngines();
  for (const lang of LANGS) {
    const html = view(report, lang);
    const text = visibleText(html);
    assert.equal(cards(html).length, 2, lang);
    assert.ok(html.indexOf('data-engine-key="openai/gpt-x"') < html.indexOf('data-engine-key="anthropic/claude-y"'), 'most-used first');
    assert.ok(text.includes('gpt-x') && text.includes('claude-y') && text.includes('openai') && text.includes('anthropic'));
    assert.ok(text.includes(trainingCopy[lang].rptEngineTitle));
    assert.ok(text.includes(trainingCopy[lang].rptEngineNote), `${lang}: says runs are usage, not quality`);
    assert.ok(text.includes(trt(lang, 'rptEngineAside', { n: d(lang, 2), runs: d(lang, 4) })), lang);
  }
});

test('accuracy is shown only for the engine whose scenarios are resolved; an engine that merely ran says so instead of "0%"', () => {
  const html = view(twoEngines(), 'en');
  const gpt = cardOf(html, 'openai/gpt-x');
  const claude = cardOf(html, 'anthropic/claude-y');
  assert.match(gpt, /data-engine-accuracy="50"/);
  assert.ok(visibleText(gpt).includes('50%') && visibleText(gpt).includes('2 resolved'));
  assert.match(claude, /data-engine-accuracy="none"/);
  assert.ok(visibleText(claude).includes(trainingCopy.en.rptEngineNoResolved));
  assert.equal(/data-engine-accuracy="0"/.test(html), false);
  assert.doesNotMatch(visibleText(html), /success/i, 'an engine is never called successful');
});

test('every engine card counts run types and scenarios from the recorded rows, with digits in the reader\'s script', () => {
  const report = twoEngines();
  const fa = view(report, 'fa');
  const gpt = visibleText(cardOf(fa, 'openai/gpt-x'));
  assert.ok(gpt.includes('۳'), 'three runs in Persian digits');
  assert.ok(gpt.includes(trainingCopy.fa.rptEngineTypeInitial) && gpt.includes(trainingCopy.fa.rptEngineTypeUpdate));
  assert.ok(gpt.includes('۵۰٪'), 'accuracy with the Persian percent sign');
  assert.equal(/\d/.test(gpt.replace(/gpt-x/g, '').replace(/openai/g, '')), false, 'no Latin digits left in the Persian card');
});

test('an engine whose provider or model was not recorded says "not recorded" - it is not invented', () => {
  const report = compute({ analyses: [run('a1', '', ''), run('a2', 'openai', '')] });
  for (const lang of LANGS) {
    const text = visibleText(view(report, lang));
    assert.ok(text.includes(trainingCopy[lang].rptNotRecorded), lang);
  }
});

test('scenarios that cannot be traced to a recorded run are named as unassigned, with their count; nothing is said when all are traceable', () => {
  const orphaned = compute({ analyses: [run('a1', 'openai', 'gpt-x')], sessions: [session([scenario('s-a', 'a1', confirmed), scenario('s-b', 'gone', confirmed), scenario('s-c', undefined)])] });
  for (const lang of LANGS) {
    const html = view(orphaned, lang);
    assert.match(html, /data-engine-unmatched="2"/);
    assert.ok(visibleText(html).includes(trt(lang, 'rptEngineUnmatched', { n: d(lang, 2) })), lang);
  }
  assert.equal(/data-engine-unmatched/.test(view(twoEngines(), 'en')), false);
});

test('a small resolved sample on one engine carries the small-sample warning with the real threshold', () => {
  const report = compute({ analyses: [run('a1', 'openai', 'gpt-x')], sessions: [session([scenario('s-a', 'a1', confirmed)])] });
  assert.ok(visibleText(view(report, 'en')).includes(trt('en', 'rptSmallSampleNote', { n: '10' })));
});

test('the provider shows the catalog label the AI settings use, and the raw id when the catalog is missing or does not know it', () => {
  const report = compute({ analyses: [run('a1', 'openai', 'gpt-x')] });
  const withCatalog = visibleText(view(report, 'en', { TradeJournalAISettingsStore: { providerCatalog: () => [{ id: 'openai', label: 'OpenAI Platform' }] } }));
  assert.ok(withCatalog.includes('OpenAI Platform'));
  assert.ok(visibleText(view(report, 'en', { TradeJournalAISettingsStore: { providerCatalog: () => [{ id: 'other', label: 'Nope' }] } })).includes('openai'));
  assert.ok(visibleText(view(report, 'en', { TradeJournalAISettingsStore: { providerCatalog: () => { throw new Error('boom'); } } })).includes('openai'));
  assert.ok(visibleText(view(report, 'en')).includes('openai'));
});

test('the model name is isolated left-to-right inside an RTL page (bdi), so it neither flips nor scrambles the surrounding Persian', () => {
  const html = view(twoEngines(), 'fa');
  assert.match(html, /<bdi dir="ltr">gpt-x<\/bdi>/);
  assert.match(html, /<bdi dir="ltr">openai<\/bdi>/);
});

// ---- Learning and knowledge ---------------------------------------------------------------------------------------------------

test('the maturity panel shows counts and a milestone checklist with each state written out - and no score', () => {
  const report = twoEngines();
  const maturity = maturityOf(report);
  for (const lang of LANGS) {
    const html = view(report, lang, { props: { maturity } });
    const text = visibleText(html);
    assert.match(html, /data-report-panel="maturity"/);
    assert.ok(text.includes(trainingCopy[lang].rptMatTitle) && text.includes(trainingCopy[lang].rptMatNote));
    assert.equal((html.match(/data-milestone="/g) || []).length, 8);
    assert.ok(text.includes(trainingCopy[lang].rptMsDone));
    assert.ok(text.includes(trainingCopy[lang].rptMsTodo), 'a missing milestone is written as "not yet"');
    assert.ok(text.includes(trt(lang, 'rptMatSourcesValue', { taught: d(lang, 1), total: d(lang, 2) })), `${lang}: 1 taught of 2 sources`);
    assert.equal(PHYSICAL.test(withoutOrnaments(html)), false, `${lang}: logical CSS only in the whole report`);
  }
  const en = visibleText(view(report, 'en', { props: { maturity } }));
  assert.doesNotMatch(en, /maturity score|level \d|grade/i);
});

test('milestone states are reached / missing / unknown in the markup, and an unknown one says "not recorded" and is reported as not counted', () => {
  const report = twoEngines();
  const html = view(report, 'en', { props: { maturity: maturityOf(report, { sources: null }) } });
  assert.match(html, /data-milestone="source"[^>]*data-milestone-state="unknown"/);
  assert.match(html, /data-milestone="concepts"[^>]*data-milestone-state="reached"/);
  assert.match(html, /data-milestone="coverage"[^>]*data-milestone-state="missing"/);
  const text = visibleText(html);
  assert.ok(text.includes(trt('en', 'rptMatUnknown', { n: '1' })));
  const sources = html.slice(html.indexOf('data-maturity-stat="sources"'));
  assert.ok(visibleText(sources.slice(0, 300)).includes(trainingCopy.en.rptNotRecorded), 'the sources figure is "not recorded", not 0');
});

test('an untaught profile gets the short empty state (with the next step) instead of a wall of zeros', () => {
  const report = twoEngines();
  const empty = { id: 'p1', concepts: [], understanding: { summary: '', version: 0 } };
  const maturity = j(buildMaturity({ profile: empty, sources: [], events: [], report }));
  for (const lang of LANGS) {
    globalThis.window = { matchMedia: () => ({ matches: false }) };
    const html = jsx.render(jsx.modules.report.ProfileReportView, { report, profile: empty, lang, maturity });
    assert.ok(visibleText(html).includes(trainingCopy[lang].rptMatEmpty), lang);
    assert.equal(/data-milestone="/.test(html), false, 'no checklist over an empty profile');
  }
});

test('where the concepts came from is drawn only for origins that exist; without a maturity object the panel is simply not drawn', () => {
  const report = twoEngines();
  const html = view(report, 'en', { props: { maturity: maturityOf(report) } });
  const origins = visibleText(html.slice(html.indexOf('data-maturity-origins'), html.indexOf('data-maturity-milestones')));
  assert.ok(origins.includes('You') && origins.includes('AI suggestions'));
  assert.equal(origins.includes('Chat') || origins.includes('Sources'), false);
  assert.equal(/data-report-panel="maturity"/.test(view(report, 'en')), false);
});

// ---- structure: equal-height, responsive, RTL-safe ------------------------------------------------------------------------------

test('paired panels stretch to one height and the trend row wraps instead of squeezing on a narrow screen', () => {
  const report = twoEngines();
  const html = view(report, 'en', { props: { maturity: maturityOf(report) } });
  assert.doesNotMatch(html, /grid-template-columns:minmax\(0,2\.1fr\) minmax\(0,1fr\)/, 'the fixed two-column trend grid is gone');
  assert.match(html, /flex-wrap:wrap[^"]*"[^>]*><div[^>]*data-report-panel="trend"|data-report-panel="trend"[^>]*flex:2\.1 1 380px/);
  assert.equal((html.match(/align-items:stretch/g) || []).length >= 3, true, 'paired grids and the engine list stretch their cells');
  assert.equal(/align-items:start/.test(html.slice(html.indexOf('data-report-panel="heat"') - 400, html.indexOf('data-report-panel="markets"') + 400)), false, 'heat / markets no longer top-align at different heights');
  for (const panel of ['engines', 'trend', 'outcome', 'concepts', 'maturity', 'heat', 'markets', 'rdist']) assert.match(html, new RegExp(`data-report-panel="${panel}"`), panel);
});

test('an engine card pins its scenarios footer to the bottom of an equal-height row', () => {
  const html = view(twoEngines(), 'en');
  assert.equal((html.match(/data-engine-scenarios="true" style="[^"]*margin-block-start:auto/g) || []).length, 2);
  assert.equal((html.match(/<li style="list-style:none;display:flex;min-width:0">/g) || []).length, 2);
});

test('the heat map label column can shrink and the day columns cannot overflow (minmax, not a fixed 88px + 1fr)', async () => {
  const source = await read('analysisProfileReport.jsx');
  assert.match(source, /gridTemplateColumns: 'minmax\(56px,88px\) repeat\(7,minmax\(0,1fr\)\)'/);
  assert.doesNotMatch(source, /'88px repeat\(7,1fr\)'/);
});

// ---- data wiring ------------------------------------------------------------------------------------------------------------------

test('loadProfileSources is null - "not recorded" - whenever the sources cannot be read, and the list when they can', async () => {
  const source = await read('analysisProfileReport.jsx');
  const start = source.indexOf('export function loadProfileSources');
  const end = source.indexOf('// buildProfileReport hands');
  const code = source.slice(start, end).replace('export function', 'function') + '\nglobalThis.__fn = loadProfileSources;';
  const sandbox = { Promise, Array };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  const fn = sandbox.__fn;
  assert.equal(await fn(null, 'p1'), null);
  assert.equal(await fn({}, 'p1'), null);
  assert.equal(await fn({ listSources: async () => { throw new Error('offline'); } }, 'p1'), null);
  assert.equal(await fn({ listSources: async () => 'not a list' }, 'p1'), null);
  assert.deepEqual(j(await fn({ listSources: async (id) => [{ id: 's-' + id }] }, 'p1')), [{ id: 's-p1' }]);
  assert.deepEqual(j(await fn({ listSources: async () => [] }, 'p1')), [], 'a real empty list is an empty list, not null');
});

test('the hook reads sources only for the full Report (the Overview line never needs them) and builds the maturity from the same loaded ledger', async () => {
  const source = await read('analysisProfileReport.jsx');
  assert.match(source, /withEvents \? loadProfileSources\(profileStore\(\), profile\.id\) : Promise\.resolve\(null\)/);
  assert.match(source, /report && withEvents \? buildMaturity\(\{ profile, sources: state\.sources, events: state\.events, report \}\) : null/);
  assert.match(source, /const \{ status, report, maturity, reload \} = useProfileUsage\(profile\);/);
  assert.match(source, /<ProfileReportView report=\{report\} profile=\{profile\} lang=\{lang\} maturity=\{maturity\} \/>/);
  assert.equal((source.replace(/^\s*\/\/.*$/gm, '').match(/usage\.compute\(/g) || []).length, 1, 'still one compute() call');
});

test('every report copy key the new panels look up exists in all four languages', async () => {
  const source = await read('analysisProfileReport.jsx');
  const keys = new Set([...source.matchAll(/'(rpt[A-Za-z0-9]+)'/g)].map((m) => m[1]));
  for (const copy of ['rptMsConcepts', 'rptMsMandatory', 'rptMsUnderstanding', 'rptMsSource', 'rptMsLesson', 'rptMsAnalysis', 'rptMsCoverage', 'rptMsResolved']) keys.add(copy);
  assert.ok(keys.size > 60);
  for (const lang of LANGS) for (const key of keys) assert.ok(trainingCopy[lang][key], `${lang}.${key}`);
});
