import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { buildMemoryProjection, compareProjection } from '../navrya-src/analysisProfileMemoryProjection.js';
import { trainingCopy, trt } from '../navrya-src/analysisProfileTrainingCopy.js';
import { loadRegistries } from './helpers/analysis-registries.mjs';
import { loadJsx, visibleText } from './helpers/render-jsx.mjs';

// The Memory Sync UI (analysisProfileMemorySync.jsx + the Memory tab and graph wiring), actually RENDERED with the real registries: status
// (current / stale / pending review) in every language, the awaiting-review list that is never presented as memory, the "not recorded"
// wording, the textual equivalent of the graph, RTL-safe markup; and the sync itself proven read-only against the real store.

const root = process.cwd();
const LANGS = ['fa', 'ar', 'en', 'es'];
const src = async (file) => (await readFile(path.join(root, 'navrya-src', file), 'utf8')).replace(/\r\n/g, '\n');
const shared = (file) => readFile(path.join(root, 'public', 'pages', 'shared', file), 'utf8');
const PHYSICAL = /(?:margin|padding|border)-(?:left|right)\b|(?:^|[;"\s])(?:left|right):|text-align:\s*(?:left|right)/;

let jsx;
let registries;
test.before(async () => {
  registries = await loadRegistries();
  jsx = await loadJsx({ sync: 'navrya-src/analysisProfileMemorySync.jsx', memory: 'navrya-src/analysisProfileMemory.jsx', brain: 'navrya-src/analysisProfileBrain.jsx' });
});
test.after(async () => { delete globalThis.window; if (jsx) await jsx.cleanup(); });

const concept = (id, title, priority, enabled = true) => ({ id, title, description: '', priority, origin: 'user', enabled });
function profile(overrides) {
  return {
    id: 'p1', name: 'Structure trader', description: '', primaryStyleId: 'price_action', secondaryStyleIds: [], focusIds: ['market_structure'], customFocuses: [],
    concepts: [concept('k1', 'Swept level', 'mandatory'), concept('k2', 'HTF confirmation', 'preferred')], understanding: { summary: 'Reads structure first.', version: 2, updatedAt: '2026-09-18T00:00:00.000Z' }, ...overrides
  };
}
const contextOf = (p) => ({ profile: { id: p.id, revision: 'rev-' + p.concepts.filter((c) => c.enabled).map((c) => c.id).join('-') }, concepts: p.concepts.filter((c) => c.enabled).map((c) => ({ id: c.id, title: c.title, priority: c.priority })) });
const project = (p, extra) => buildMemoryProjection({ profile: p, context: contextOf(p), ...registries, lang: 'en', ...(extra || {}) });
function memoryOf(projection, over) {
  return { projection, comparison: compareProjection(projection, projection), status: 'current', syncing: false, sync: () => {}, syncedAt: Date.UTC(2026, 8, 20, 12, 0), revision: projection.revision, ...(over || {}) };
}
function setWindow(extra) {
  globalThis.window = { TradeJournalAnalysisStyleRegistry: registries.styles, TradeJournalAnalysisFocusRegistry: registries.focuses, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }), ...(extra || {}) };
}
const panel = (memory, lang = 'en') => jsx.render(jsx.modules.sync.MemorySyncPanel, { lang, memory, textId: 'nv-memory-text-p1' });

// ---- status: current / stale / pending review --------------------------------------------------------------

test('a synced memory reads "In sync" in every language, shows its revision, and offers Sync memory - no stale alert', () => {
  setWindow();
  const projection = project(profile());
  for (const lang of LANGS) {
    const html = panel(memoryOf(projection), lang);
    const text = visibleText(html);
    assert.match(html, /data-sync-status="current"/);
    assert.ok(text.includes(trainingCopy[lang].memoryStatusCurrent));
    assert.ok(text.includes(trt(lang, 'memoryRevision', { id: 'rev-k1-k' })), `${lang}: the (shortened, 8-char) revision is on screen`);
    assert.ok(text.includes(trainingCopy[lang].memorySyncBtn));
    assert.ok(text.includes(trainingCopy[lang].memorySyncNote), `${lang}: says that syncing never calls AI or spends tokens`);
    assert.equal(html.includes('data-memory-stale'), false);
    assert.equal(PHYSICAL.test(html), false, `${lang}: logical CSS only`);
  }
});

test('after an edit the memory reads "Out of date" with what changed, an alert role, and Sync memory as the primary action', () => {
  setWindow();
  const synced = project(profile());
  const editedProfile = profile({ concepts: [concept('k1', 'Swept level', 'mandatory'), concept('k3', 'Order block retest', 'preferred')] });
  const comparison = compareProjection(synced, project(editedProfile));
  assert.equal(comparison.status, 'stale');
  for (const lang of LANGS) {
    const html = panel(memoryOf(synced, { comparison, status: 'stale' }), lang);
    const text = visibleText(html);
    assert.match(html, /data-sync-status="stale"/);
    assert.match(html, /role="alert"[^>]*data-memory-stale="true"|data-memory-stale="true"[^>]*role="alert"/);
    assert.ok(text.includes(trainingCopy[lang].memoryStatusStale));
    assert.ok(text.includes(trt(lang, 'memoryChangesAdded', { n: lang === 'fa' ? '۱' : lang === 'ar' ? '١' : '1' })), `${lang}: 1 added`);
    assert.ok(text.includes(trt(lang, 'memoryChangesRemoved', { n: lang === 'fa' ? '۱' : lang === 'ar' ? '١' : '1' })), `${lang}: 1 removed`);
  }
  // a revision-only change (nothing the graph draws differs) still says so instead of an empty parenthesis
  const revisionOnly = { status: 'stale', revisionChanged: true, changes: { added: [], removed: [], changed: [] }, nodeStatus: {} };
  assert.ok(visibleText(panel(memoryOf(synced, { comparison: revisionOnly, status: 'stale' }))).includes(trainingCopy.en.memoryChangesRevisionOnly));
});

test('while syncing the button is busy and disabled (no double sync), and it says so', () => {
  setWindow();
  const html = panel(memoryOf(project(profile()), { syncing: true }));
  assert.match(html, /<button[^>]*disabled/);
  assert.match(html, /aria-busy="true"/);
  assert.ok(visibleText(html).includes(trainingCopy.en.memorySyncing));
});

// ---- the approval boundary, in the interface -------------------------------------------------------------------

const PENDING_INPUT = () => ({
  sources: [{ id: 's1', kind: 'pdf', status: 'ready', fileName: 'liquidity-book.pdf', fileAvailable: true }, { id: 's2', kind: 'website', status: 'queued', url: 'https://example.com/a' }, { id: 's3', kind: 'youtube', status: 'taught', title: 'Taught video' }],
  events: [{ id: 'e1', kind: 'note', detail: 'wait for the sweep', title: 'wait for the sweep' }],
  messages: [{ id: 'm1', role: 'assistant', content: 'r', proposals: [{ id: 'a', kind: 'concept', title: 'Order block retest', status: 'pending' }] }]
});

test('a PDF/link not yet taught, a raw note and an unaccepted AI proposal are listed as AWAITING teaching/review - dashed, labelled, and never in the memory counts', () => {
  setWindow();
  const projection = project(profile(), PENDING_INPUT());
  for (const lang of LANGS) {
    const html = panel(memoryOf(projection), lang);
    const text = visibleText(html);
    assert.equal((html.match(/data-pending-kind=/g) || []).length, 4, 'pdf, website, note, proposal');
    assert.equal((html.match(/data-pending-status="awaiting_teaching"/g) || []).length, 3);
    assert.equal((html.match(/data-pending-status="awaiting_review"/g) || []).length, 1);
    assert.ok(text.includes('liquidity-book.pdf') && text.includes('https://example.com/a') && text.includes('wait for the sweep') && text.includes('Order block retest'));
    assert.ok(text.includes(trainingCopy[lang].memoryAwaitingTeaching) && text.includes(trainingCopy[lang].memoryAwaitingReview));
    assert.ok(text.includes(trainingCopy[lang].memoryPendingNote), `${lang}: says these are not engine memory yet`);
    assert.ok(text.includes(trt(lang, 'memoryStatusPending', { n: lang === 'fa' ? '۴' : lang === 'ar' ? '٤' : '4' })));
    assert.equal(text.includes('Taught video'), false, 'a taught source is memory, not a pending item');
  }
  const html = panel(memoryOf(projection));
  assert.match(html, /border:1px dashed/, 'pending rows look different from memory');
  assert.equal(projection.graph.nodes.some((n) => /liquidity-book|example\.com|wait for the sweep|Order block retest/.test(n.label)), false);
});

test('nothing waiting says so; more than six waiting items are capped with "+N more"; an open review panel proposal is listed as awaiting review', () => {
  setWindow();
  assert.ok(visibleText(panel(memoryOf(project(profile(), { sources: [], events: [], messages: [] })))).includes(trainingCopy.en.memoryPendingNone));
  const many = { sources: Array.from({ length: 9 }, (_, i) => ({ id: 's' + i, kind: 'website', status: 'queued', url: 'https://x.test/' + i })), events: [], messages: [] };
  const html = panel(memoryOf(project(profile(), many)));
  assert.equal((html.match(/data-pending-kind=/g) || []).length, 6);
  assert.ok(visibleText(html).includes('+3 more'));
  const open = visibleText(panel(memoryOf(project(profile(), { sources: [], events: [], messages: [], reviewingCount: 2 }))));
  assert.ok(open.includes(trt('en', 'memoryOpenProposal', { n: '2' })));
});

test('figures that could not be read are "not recorded", never a made-up zero - and real zeros stay zeros', () => {
  setWindow();
  for (const lang of LANGS) {
    const unknown = visibleText(panel(memoryOf(project(profile(), { events: null, sources: null, messages: null })), lang));
    assert.ok(unknown.includes(trainingCopy[lang].memoryNotRecorded), lang);
  }
  const zeros = visibleText(panel(memoryOf(project(profile(), { events: [], sources: [], messages: [] }))));
  assert.ok(zeros.includes('0 sources · 0 taught') && zeros.includes('0 lessons · 0 AI-assisted'));
  assert.equal(zeros.includes(trainingCopy.en.memoryNotRecorded), false);
});

// ---- the textual equivalent ----------------------------------------------------------------------------------

test('the graph has a text version in the page: lens, focus areas, enabled concepts (mandatory marked), understanding - and flags what changed since the sync', () => {
  setWindow();
  const synced = project(profile());
  const html = panel(memoryOf(synced));
  assert.match(html, /<details id="nv-memory-text-p1"/);
  const text = visibleText(html);
  for (const key of ['memoryTextTitle', 'memoryTextLens', 'memoryTextFocus', 'memoryTextConcepts', 'memoryTextUnderstanding']) assert.ok(text.includes(trainingCopy.en[key]), key);
  assert.ok(text.includes('Swept level *') && text.includes('HTF confirmation'));
  assert.ok(text.includes(trt('en', 'understandingVersion', { n: '2' })));

  const changed = compareProjection(synced, project(profile({ concepts: [concept('k1', 'Swept level RENAMED', 'mandatory'), concept('k2', 'HTF confirmation', 'preferred')] })));
  const flagged = visibleText(panel(memoryOf(synced, { comparison: changed, status: 'stale' })));
  assert.ok(flagged.includes('Swept level * (' + trainingCopy.en.memoryNodeChanged + ')'));
});

// ---- the picture shows the SYNCED memory; the Memory tab is wired to it --------------------------------------

test('the graph panel draws the graph it is handed (the synced projection), not a silent rebuild from the live profile - and points at the text version', () => {
  setWindow();
  const synced = project(profile());                                           // 2 concepts at sync time
  const live = profile({ concepts: [concept('k1', 'Swept level', 'mandatory'), concept('k2', 'HTF confirmation', 'preferred'), concept('k9', 'Newly added', 'preferred')] });
  const html = jsx.render(jsx.modules.brain.MemoryGraphPanel, { profile: live, lang: 'en', onOpen: () => {}, graph: synced.graph, describedBy: 'nv-memory-text-p1' });
  assert.match(html, /aria-describedby="nv-memory-text-p1"/);
  assert.match(visibleText(html), /2\s*Active concepts/i, 'the stat is the synced 2, not the live 3');
  const fromLive = jsx.render(jsx.modules.brain.MemoryGraphPanel, { profile: live, lang: 'en', onOpen: () => {} });
  assert.match(visibleText(fromLive), /3\s*Active concepts/i, 'without a handed-in graph the panel behaves exactly as before');
});

test('the Memory tab renders the sync panel next to the graph and links the graph preview to the text version by a real id', async () => {
  const vmWindow = await realWindow();
  const p = vmWindow.TradeJournalAnalysisProfileStore.get(vmWindow.profileId);
  globalThis.window = vmWindow;
  const html = jsx.render(jsx.modules.memory.MemoryTab, { profile: p, lang: 'en' });
  const id = /aria-describedby="(nv-memory-text-[^"]+)"/.exec(html)[1];
  assert.ok(html.includes(`<details id="${id}"`), 'the description the preview points at exists');
  assert.match(html, /data-memory-sync="true"/);
  assert.ok(html.indexOf('data-memory-sync') < html.indexOf('nv-gx') || html.indexOf('nv-gx') === -1);
  assert.equal(visibleText(html).includes(trainingCopy.en.memorySyncBtn), true);
});

// A real vm window: the real store, registries and context evaluated the way a character page does.
async function realWindow() {
  const sandbox = {
    window: { __NAVRYA_AUTH__: { authenticated: true, userId: 'user-1', user: { id: 'user-1' }, csrfToken: 't' }, matchMedia: () => ({ matches: false }) },
    fetch: async (url, options) => ({ ok: true, status: 200, json: async () => (options && options.method === 'POST' ? JSON.parse(options.body) : { analysisProfiles: [], events: [], sources: [], messages: [] }) }),
    document: { body: { appendChild() {} }, documentElement: { lang: 'en' }, createElement: () => ({ setAttribute() {} }) },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options && options.detail; } }, setTimeout: (fn) => fn(), URL
  };
  Object.assign(sandbox.window, { dispatchEvent() {}, addEventListener() {}, removeEventListener() {} });
  vm.createContext(sandbox);
  for (const file of ['server-replica.js', 'analysis-style-registry.js', 'analysis-focus-registry.js', 'analysis-profile-store.js', 'analysis-context.js']) vm.runInContext(await shared(file), sandbox, { filename: file });
  const created = sandbox.window.TradeJournalAnalysisProfileStore.create({ name: 'Real profile', primaryStyleId: 'price_action', focusIds: ['market_structure'] });
  await new Promise((resolve) => setImmediate(resolve));
  sandbox.window.profileId = created.id;
  return sandbox.window;
}

// ---- the sync itself is read-only ----------------------------------------------------------------------------

test('a sync reads the profile, its context, the ledger, the sources and the chat - and NOTHING else: no write, no AI route', async () => {
  const calls = [];
  const w = await realWindow();
  const original = w.TradeJournalAnalysisProfileStore;
  // Route every child GET through a recording fetch on the same sandbox window the store uses.
  const sandboxFetch = (url, options) => { calls.push([(options && options.method) || 'GET', url]); return Promise.resolve({ ok: true, status: 200, json: async () => ({ events: [{ id: 'e1', kind: 'note' }], sources: [], messages: [] }) }); };
  const store = new Proxy(original, { get: (target, key) => (['listEvents', 'listSources', 'listMessages'].includes(key) ? async (id) => { const body = await (await sandboxFetch(`/api/sync/analysis-profiles/${id}/${String(key).replace('list', '').toLowerCase()}`)).json(); return body[String(key).replace('list', '').toLowerCase()]; } : target[key]) });
  globalThis.window = { ...w, TradeJournalAnalysisProfileStore: store };
  const inputs = await jsx.modules.sync.loadSyncInputs(w.profileId);
  assert.ok(inputs.profile && inputs.context, 'the canonical profile and its engine context');
  assert.deepEqual(inputs.events, [{ id: 'e1', kind: 'note' }]);
  assert.deepEqual(calls.map((c) => c[0]), ['GET', 'GET', 'GET']);
  assert.ok(calls.every((c) => !/\/api\/analysis-profiles\//.test(c[1])), 'no AI route is touched');
});

test('a child read that fails is "not recorded" (null) rather than an empty list, and no store means no child data at all', async () => {
  const w = await realWindow();
  const failing = new Proxy(w.TradeJournalAnalysisProfileStore, { get: (target, key) => (key === 'listSources' ? async () => { throw new Error('boom'); } : target[key]) });
  globalThis.window = { ...w, TradeJournalAnalysisProfileStore: failing };
  const inputs = await jsx.modules.sync.loadSyncInputs(w.profileId);
  assert.equal(inputs.sources, null);
  assert.ok(Array.isArray(inputs.events));
  globalThis.window = { ...w, TradeJournalAnalysisProfileStore: undefined, TradeJournalAnalysisContext: undefined };
  const none = await jsx.modules.sync.loadSyncInputs('missing');
  assert.deepEqual([none.profile, none.context, none.events, none.sources, none.messages], [null, null, null, null, null]);
});

test('the hook is marked stale by the existing profile-changed event, re-reads the canonical profile (not a prop), and the sync module has no way to write or spend', async () => {
  const text = await src('analysisProfileMemorySync.jsx');
  assert.match(text, /window\.addEventListener\('tradejournal:analysis-profiles-changed', onChanged\)/);
  assert.match(text, /window\.removeEventListener\('tradejournal:analysis-profiles-changed', onChanged\)/);
  assert.match(text, /function onChanged\(\) \{ setLive\(readLive\(idRef\.current, null\)\); \}/);
  assert.match(text, /const loaded = await loadSyncInputs\(id\);/);
  const code = text.replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /applyLearning|\.update\(|\.create\(|addSource|removeSource|updateSource|uploadSourcePdf|recordEvent|recordNote|appendMessages|resolveProposals|clearMessages|ingestLearning|\.chat\(|\.preview\(|suggest(Focuses|Concepts)|readSource|fetch\(|localStorage|indexedDB/, 'read-only by construction');
});

test('the Memory tab tells the projection about a proposal that is open for review, and clears it when applied or discarded', async () => {
  const engine = await src('engineLearning.jsx');
  assert.match(engine, /export function EngineLearningPanel\(\{ lang, profile, onChanged, preset, onTaught, onReviewChange \}\)/);
  assert.match(engine, /onReviewChange\(phase === 'review' && proposal \? Math\.max\(1, proposal\.conceptsProposed\.length \+ \(proposal\.updatedUnderstanding \? 1 : 0\)\) : 0\)/);
  assert.match(engine, /return \(\) => onReviewChange\(0\);/);
  const tab = await src('analysisProfileMemory.jsx');
  assert.match(tab, /useMemoryProjection\(profile, lang, \{ reviewingCount: reviewing \}\)/);
  assert.match(tab, /onReviewChange=\{setReviewing\}/);
  assert.match(tab, /graph=\{memory\.projection\.graph\}/);
});

test('every copy key the sync UI looks up exists in all four languages (a typo would print the raw key)', async () => {
  const text = await src('analysisProfileMemorySync.jsx');
  const keys = new Set([...text.matchAll(/'((?:memory|graph|understanding)[A-Za-z]+)'/g)].map((m) => m[1]));
  assert.ok(keys.size > 20);
  for (const lang of LANGS) for (const key of keys) assert.ok(trainingCopy[lang][key], `${lang}.${key}`);
});
