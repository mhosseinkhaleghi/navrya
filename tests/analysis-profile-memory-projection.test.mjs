import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import {
  AWAITING_REVIEW, AWAITING_TEACHING, buildMemoryProjection, compareProjection, pendingReview, revisionOf, summarizeLedger, summarizeSources
} from '../navrya-src/analysisProfileMemoryProjection.js';

// The Memory Sync projection (navrya-src/analysisProfileMemoryProjection.js), run against the REAL Analysis Profile store and the REAL
// analysis context, so the approval boundary is proven end to end: an added source, a raw note and an unaccepted chat proposal are
// awaiting teaching/review and never memory; content becomes memory only through applyLearning() (the approval funnel), which changes
// the profile revision - the synchronisation identity - and the NEXT sync includes it.

const root = process.cwd();
const shared = (file) => readFile(path.join(root, 'public', 'pages', 'shared', file), 'utf8');

// A tiny in-memory backend for the profile list and its three child tables, behind the store's own fetch calls.
function backend() {
  const db = { events: [], sources: [], messages: [] };
  let counter = 0;
  const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  const fetchFn = async (url, options) => {
    const method = (options && options.method) || 'GET';
    const body = options && options.body ? JSON.parse(options.body) : undefined;
    if (url === '/api/sync/analysis-profiles') return method === 'POST' ? json(200, body) : json(200, { analysisProfiles: [] });
    const child = /^\/api\/sync\/analysis-profiles\/([^/]+)\/(events|sources|messages)$/.exec(url);
    if (child) {
      const table = db[child[2]];
      if (method === 'GET') return json(200, { [child[2]]: table.slice() });
      if (method === 'POST') {
        const created = { id: child[2] + '-' + (counter += 1), createdAt: new Date(Date.UTC(2026, 8, 1, 0, counter)).toISOString(), status: 'queued', ...body };
        table.push(created);
        return json(201, created);
      }
    }
    return json(404, {});
  };
  return { db, fetchFn };
}

async function load() {
  const { db, fetchFn } = backend();
  const sandbox = {
    window: { __NAVRYA_AUTH__: { authenticated: true, userId: 'user-1', user: { id: 'user-1' }, csrfToken: 't' } }, fetch: fetchFn,
    document: { body: { appendChild() {} }, documentElement: { lang: 'en' }, createElement: () => ({ setAttribute() {} }) },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options && options.detail; } }, setTimeout: (fn) => fn(), URL
  };
  Object.assign(sandbox.window, { dispatchEvent() {}, addEventListener() {} });
  vm.createContext(sandbox);
  for (const file of ['server-replica.js', 'analysis-style-registry.js', 'analysis-focus-registry.js', 'analysis-profile-store.js', 'analysis-context.js']) {
    vm.runInContext(await shared(file), sandbox, { filename: file });
  }
  const w = sandbox.window;
  const store = w.TradeJournalAnalysisProfileStore;
  const registries = { styles: w.TradeJournalAnalysisStyleRegistry, focuses: w.TradeJournalAnalysisFocusRegistry };
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  const profile = store.create({ name: 'Structure trader', primaryStyleId: 'price_action', focusIds: ['market_structure'] });
  await flush();
  // What "Sync memory" reads: the canonical profile, its context, the ledger, the sources and the chat.
  async function project(extra) {
    await store.settleEvents();
    return buildMemoryProjection({
      profile: store.get(profile.id), context: w.TradeJournalAnalysisContext.getAnalysisContext(profile.id),
      events: await store.listEvents(profile.id), sources: await store.listSources(profile.id), messages: await store.listMessages(profile.id),
      ...registries, lang: 'en', ...(extra || {})
    });
  }
  return { store, db, profile, project, flush, w, registries };
}

const conceptNodes = (projection) => projection.graph.nodes.filter((node) => node.kind === 'concept').map((node) => node.label);

// ---- what reaches the engine graph ------------------------------------------------------------------------

test('the engine graph holds the lens, the focus areas and only the ENABLED concepts the context sends to the engine', async () => {
  const { store, profile, project, flush } = await load();
  store.update(profile.id, { concepts: [
    store.helpers.makeConcept({ title: 'Swept level', priority: 'mandatory' }),
    { ...store.helpers.makeConcept({ title: 'Switched off', priority: 'preferred' }), enabled: false }
  ] });
  await flush();
  const projection = await project();
  assert.deepEqual(conceptNodes(projection), ['Swept level']);
  assert.equal(projection.engine.concepts.enabled, 1);
  assert.equal(projection.engine.concepts.mandatory, 1);
  assert.equal(projection.graph.nodes.some((node) => node.label === 'Switched off'), false);
  assert.ok(projection.graph.nodes.some((node) => node.kind === 'primary-style'));
  assert.ok(projection.graph.nodes.some((node) => node.kind === 'focus'));
});

test('the context is the authority: a concept the profile lists as enabled but the context did not send is not in the graph', async () => {
  const { store, profile, w, flush, registries } = await load();
  store.update(profile.id, { concepts: [store.helpers.makeConcept({ title: 'Kept', priority: 'preferred' }), store.helpers.makeConcept({ title: 'Not sent', priority: 'preferred' })] });
  await flush();
  const live = store.get(profile.id);
  const context = JSON.parse(JSON.stringify(w.TradeJournalAnalysisContext.getAnalysisContext(profile.id)));
  context.concepts = context.concepts.filter((concept) => concept.title === 'Kept');
  const projection = buildMemoryProjection({ profile: live, context, ...registries, lang: 'en' });
  assert.deepEqual(conceptNodes(projection), ['Kept']);
});

test('with no context available the same rule applies (enabled concepts only) and the revision falls back to a signature - never an empty identity', async () => {
  const { store, profile, registries, flush } = await load();
  store.update(profile.id, { concepts: [store.helpers.makeConcept({ title: 'On', priority: 'preferred' }), { ...store.helpers.makeConcept({ title: 'Off', priority: 'preferred' }), enabled: false }] });
  await flush();
  const projection = buildMemoryProjection({ profile: store.get(profile.id), context: null, ...registries, lang: 'en' });
  assert.deepEqual(conceptNodes(projection), ['On']);
  assert.match(projection.revision, /^sig:/);
  assert.equal(revisionOf(store.get(profile.id), { profile: { revision: 'abc123' } }), 'abc123');
});

// ---- the approval boundary ---------------------------------------------------------------------------------

test('a source added but not taught is awaiting teaching: listed apart, never a graph node, never memory - the revision does not move', async () => {
  const { store, profile, project, flush } = await load();
  const before = await project();
  await store.addSource(profile.id, { kind: 'website', url: 'https://example.com/liquidity' });
  await store.addSource(profile.id, { kind: 'youtube', url: 'https://youtu.be/abc' });
  await flush();
  const after = await project();
  assert.equal(after.counts.awaitingTeaching, 2);
  assert.deepEqual(after.pending.map((item) => [item.kind, item.status, item.sourceKind]), [['source', AWAITING_TEACHING, 'website'], ['source', AWAITING_TEACHING, 'youtube']]);
  assert.equal(after.graph.nodes.length, before.graph.nodes.length, 'nothing was added to the memory graph');
  assert.equal(after.revision, before.revision, 'what the engine reads did not change');
  assert.equal(after.sources.awaiting, 2);
  assert.equal(after.sources.taught, 0);
  assert.equal(compareProjection(before, after).status, 'current');
});

test('a PDF whose stored file was removed can never be taught: it is awaiting teaching AND flagged blocked', () => {
  const items = pendingReview({ sources: [{ id: 'p1', kind: 'pdf', status: 'ready', fileName: 'book.pdf', fileAvailable: false }, { id: 'p2', kind: 'pdf', status: 'ready', fileName: 'ok.pdf', fileAvailable: true }] });
  assert.deepEqual(items.map((i) => [i.title, i.blocked]), [['book.pdf', true], ['ok.pdf', false]]);
});

test('a raw note saved without teaching is awaiting teaching - and stops being so once the same text is actually taught', async () => {
  const { store, profile, project, flush } = await load();
  await store.recordNote(profile.id, 'I wait for a sweep of the previous high before I look for shorts.');
  await flush();
  const noted = await project();
  assert.deepEqual(noted.pending.map((i) => [i.kind, i.status]), [['note', AWAITING_TEACHING]]);
  assert.equal(noted.engine.concepts.enabled, 0, 'a note is diary text, not a concept');

  const taught = pendingReview({ events: [
    { id: 'e1', kind: 'note', title: 'x', detail: 'same text' }, { id: 'e2', kind: 'ai_analyzed_note', title: 'x', detail: 'same text' },
    { id: 'e3', kind: 'note', title: 'y', detail: 'other text' }
  ] });
  assert.deepEqual(taught.map((i) => i.id), ['note:e3']);
});

test('an unaccepted chat proposal is awaiting review; an applied or dismissed one is not; none of them is memory', async () => {
  const { db, profile, project, store } = await load();
  db.messages.push(
    { id: 'm1', role: 'assistant', content: 'r', proposals: [
      { id: 'a', kind: 'concept', title: 'Order block retest', status: 'pending' }, { id: 'b', kind: 'concept', title: 'Applied one', status: 'applied' },
      { id: 'c', kind: 'understanding', text: 'Reads higher timeframes first.', status: 'dismissed' }
    ] },
    { id: 'm2', role: 'user', content: 'q', proposals: [{ id: 'z', kind: 'concept', title: 'ignored: a user message carries no proposals', status: 'pending' }] }
  );
  const projection = await project();
  assert.deepEqual(projection.pending.map((i) => [i.kind, i.status, i.title]), [['proposal', AWAITING_REVIEW, 'Order block retest']]);
  assert.equal(projection.counts.awaitingReview, 1);
  assert.deepEqual(conceptNodes(projection), []);
  assert.equal(store.get(profile.id).concepts.length, 0);
});

test('an AI proposal open in the review panel right now is awaiting review too (reported by the panel, never guessed)', async () => {
  const { project } = await load();
  const projection = await project({ reviewingCount: 3 });
  assert.deepEqual(projection.pending.map((i) => [i.kind, i.status, i.open, i.count]), [['proposal', AWAITING_REVIEW, true, 3]]);
  assert.equal((await project({ reviewingCount: 0 })).pending.length, 0);
});

test('accepting through the existing applyLearning() funnel is what makes it memory: the revision changes, the projection is stale, and the NEXT sync includes it', async () => {
  const { store, profile, project, flush } = await load();
  await store.recordNote(profile.id, 'Mandatory: the sweep must be on a higher timeframe.');
  await flush();
  const synced = await project();
  assert.equal(synced.engine.concepts.enabled, 0);
  assert.equal(synced.counts.awaitingTeaching, 1);

  // The trader accepts an AI proposal in the teaching panel: ONE applyLearning() call.
  store.applyLearning(profile.id, {
    conceptsToAdd: [{ title: 'Higher-timeframe sweep', description: '', priority: 'mandatory', origin: 'ai' }],
    understandingSummary: 'Reads the sweep on the higher timeframe first.', eventKind: 'taught_note', eventTitle: 'Mandatory', eventDetail: 'Mandatory: the sweep must be on a higher timeframe.'
  });
  await flush();

  const live = await project();
  const comparison = compareProjection(synced, live);
  assert.equal(comparison.status, 'stale');
  assert.equal(comparison.revisionChanged, true);
  assert.notEqual(live.revision, synced.revision);
  assert.equal(comparison.changes.added.length, 2, 'the new concept and the understanding node');
  assert.ok(comparison.changes.added.some((id) => id.startsWith('concept:')));
  assert.ok(comparison.changes.added.includes('understanding'));
  assert.equal(comparison.nodeStatus.understanding, 'new');

  // The next sync IS the live projection: it holds the concept, and the note that was taught is no longer awaiting anything.
  assert.deepEqual(conceptNodes(live), ['Higher-timeframe sweep']);
  assert.equal(live.engine.concepts.mandatory, 1);
  assert.equal(live.engine.understanding.version, 1);
  assert.equal(live.counts.awaitingTeaching, 0);
  assert.equal(compareProjection(live, await project()).status, 'current');
});

test('a manual edit is memory too, and switching a concept off removes it from the graph at the next sync', async () => {
  const { store, profile, project, flush } = await load();
  store.update(profile.id, { concepts: [store.helpers.makeConcept({ title: 'Manual concept', priority: 'reference' })] });
  await flush();
  const on = await project();
  assert.deepEqual(conceptNodes(on), ['Manual concept']);
  const stored = JSON.parse(JSON.stringify(store.get(profile.id).concepts));
  stored[0].enabled = false;
  store.update(profile.id, { concepts: stored });
  await flush();
  const off = await project();
  const comparison = compareProjection(on, off);
  assert.equal(comparison.status, 'stale');
  assert.deepEqual(comparison.changes.removed, on.graph.nodes.filter((n) => n.kind === 'concept').map((n) => n.id));
  assert.deepEqual(conceptNodes(off), []);
});

// ---- comparing and summarising --------------------------------------------------------------------------------

test('compareProjection classifies added / removed / changed nodes, and the profile revision alone decides stale', async () => {
  const { store, profile, project, flush } = await load();
  store.update(profile.id, { concepts: [store.helpers.makeConcept({ title: 'Alpha', priority: 'preferred' }), store.helpers.makeConcept({ title: 'Beta', priority: 'preferred' })] });
  await flush();
  const a = await project();
  const list = JSON.parse(JSON.stringify(store.get(profile.id).concepts));
  list[0].title = 'Alpha renamed';                 // changed
  list.splice(1, 1);                                // removed
  list.push({ ...list[0], id: 'cpt-new', title: 'Gamma' });   // added
  store.update(profile.id, { concepts: list });
  await flush();
  const b = await project();
  const c = compareProjection(a, b);
  assert.equal(c.status, 'stale');
  assert.equal(c.changes.changed.length, 1);
  assert.equal(c.changes.removed.length, 1);
  assert.equal(c.changes.added.length, 1);
  assert.deepEqual(Object.values(c.nodeStatus).filter((s) => s === 'stale').length, 2, 'the changed and the removed node read as stale in the synced picture');
});

test('renaming the profile is not an engine change: the revision - the synchronisation identity - does not move, so the view stays current', async () => {
  const { store, profile, project, flush } = await load();
  const a = await project();
  store.update(profile.id, { name: 'A completely different name' });
  await flush();
  const b = await project();
  assert.equal(a.revision, b.revision);
  assert.equal(compareProjection(a, b).status, 'current');
});

test('the ledger and the sources are summarised honestly: counts from real records, and "not recorded" (null) when they could not be read', () => {
  const events = [
    { kind: 'taught_note', createdAt: '2026-09-01T10:00:00Z', tokenUsage: null }, { kind: 'ai_analyzed_note', createdAt: '2026-09-02T10:00:00Z', tokenUsage: { promptTokens: 100, completionTokens: 40 } },
    { kind: 'note', createdAt: '2026-09-03T10:00:00Z' }, { kind: 'concepts_ai_accepted', createdAt: '2026-08-30T10:00:00Z' }
  ];
  assert.deepEqual(summarizeLedger(events), { available: true, total: 4, aiAssisted: 1, taught: 2, tokens: 140, lastAt: '2026-09-03T10:00:00.000Z' });
  assert.deepEqual(summarizeLedger([]), { available: true, total: 0, aiAssisted: 0, taught: 0, tokens: 0, lastAt: null });
  assert.deepEqual(summarizeLedger(null), { available: false, total: null, aiAssisted: null, taught: null, tokens: null, lastAt: null });
  const sources = [{ kind: 'pdf', status: 'taught' }, { kind: 'website', status: 'ready' }, { kind: 'youtube', status: 'queued' }, { kind: 'website', status: 'failed' }];
  assert.deepEqual(summarizeSources(sources), { available: true, total: 4, taught: 1, awaiting: 2, failed: 1, byKind: { pdf: 1, website: 2, youtube: 1 } });
  assert.equal(summarizeSources(undefined).total, null);
});

test('the projection is pure and deterministic: same inputs give the same graph and positions, and no input is mutated', async () => {
  const { store, profile, project, flush, registries } = await load();
  store.update(profile.id, { concepts: [store.helpers.makeConcept({ title: 'One', priority: 'mandatory' }), store.helpers.makeConcept({ title: 'Two', priority: 'preferred' })] });
  await flush();
  const first = await project();
  const second = await project();
  assert.deepEqual(first.graph.nodes.map((n) => [n.id, n.x, n.y, n.z]), second.graph.nodes.map((n) => [n.id, n.x, n.y, n.z]));
  const events = Object.freeze([Object.freeze({ id: 'e', kind: 'note', title: 't', detail: 'd' })]);
  const sources = Object.freeze([Object.freeze({ id: 's', kind: 'website', status: 'ready', url: 'https://x.test' })]);
  assert.doesNotThrow(() => buildMemoryProjection({ profile: store.get(profile.id), context: null, events, sources, messages: Object.freeze([]), ...registries, lang: 'en' }));
});

test('the module reads no store, network or clock and calls no model - it is data in, data out', async () => {
  const text = await readFile(path.join(root, 'navrya-src', 'analysisProfileMemoryProjection.js'), 'utf8');
  assert.doesNotMatch(text.replace(/^\s*\/\/.*$/gm, ''), /\bwindow\b|\bfetch\(|\bDate\.now\(|TradeJournal|applyLearning\(|ingestLearning\(|\.chat\(|XMLHttpRequest/);
});
