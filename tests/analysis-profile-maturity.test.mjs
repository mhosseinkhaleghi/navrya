import assert from 'node:assert/strict';
import test from 'node:test';
import { MILESTONES, buildMaturity, summarizeConcepts } from '../navrya-src/analysisProfileMaturity.js';

// The pure model behind the Report's "Learning and knowledge" panel. It describes what a profile has been taught; it never scores.
// Every figure is derived from the canonical profile, the learning ledger and the source list, and a figure whose data could not be
// read is null - never an invented zero, and never a milestone silently counted as missed.

const concept = (id, priority, extra) => ({ id, title: id, description: '', priority, origin: 'user', enabled: true, ...extra });
const profile = (over) => ({ id: 'p1', concepts: [], understanding: { summary: '', version: 0, updatedAt: null }, ...over });
const report = (over) => ({ analyses: { total: 0 }, adherence: { runsWithCoverage: 0 }, scenarios: { resolved: 0 }, ...over });
const stateOf = (m, key) => m.milestones.find((x) => x.key === key).done;

test('only ENABLED concepts count as taught knowledge (a disabled one never reaches the engine), split by priority and origin', () => {
  const s = summarizeConcepts([
    concept('a', 'mandatory'), concept('b', 'preferred', { origin: 'ai' }), concept('c', 'reference', { origin: 'source' }),
    concept('d', 'mandatory', { origin: 'chat' }), concept('off', 'mandatory', { enabled: false, origin: 'ai' })
  ]);
  assert.deepEqual([s.total, s.enabled, s.disabled], [5, 4, 1]);
  assert.deepEqual([s.mandatory, s.preferred, s.reference], [2, 1, 1]);
  assert.deepEqual(s.byOrigin, { user: 1, ai: 1, source: 1, chat: 1 });
});

test('unknown priorities/origins and junk entries are ignored rather than throwing or being miscounted', () => {
  const s = summarizeConcepts([null, undefined, concept('a', 'weird', { origin: 'martian' }), concept('b', 'mandatory')]);
  assert.deepEqual([s.total, s.enabled, s.mandatory], [2, 2, 1], 'junk entries are dropped, real concepts counted');
  assert.deepEqual(s.byOrigin, { user: 1, ai: 0, source: 0, chat: 0 });
  assert.deepEqual(summarizeConcepts(undefined), { total: 0, enabled: 0, disabled: 0, mandatory: 0, preferred: 0, reference: 0, byOrigin: { user: 0, ai: 0, source: 0, chat: 0 } });
});

test('a brand-new profile is untaught: nothing reached, nothing measured - the panel shows its empty state, not a wall of zeros', () => {
  const m = buildMaturity({ profile: profile(), sources: [], events: [], report: report() });
  assert.equal(m.untaught, true);
  assert.equal(m.reached, 0);
  assert.equal(m.of, MILESTONES.length);
  assert.ok(m.milestones.every((x) => x.done === false), 'all known and all missing');
  assert.equal(m.unknown, 0);
});

test('each milestone turns on from exactly its own evidence', () => {
  const taught = buildMaturity({
    profile: profile({ concepts: [concept('a', 'mandatory')], understanding: { summary: 'Reads structure first.', version: 3, updatedAt: '2026-09-01T00:00:00Z' } }),
    sources: [{ id: 's1', kind: 'pdf', status: 'taught' }], events: [{ id: 'e1', kind: 'taught_source', createdAt: '2026-09-02T00:00:00Z' }],
    report: report({ analyses: { total: 4 }, adherence: { runsWithCoverage: 2 }, scenarios: { resolved: 1 } })
  });
  assert.equal(taught.untaught, false);
  for (const key of MILESTONES) assert.equal(stateOf(taught, key), true, key);
  assert.equal(taught.reached, MILESTONES.length);

  const partial = buildMaturity({ profile: profile({ concepts: [concept('a', 'preferred')] }), sources: [], events: [], report: report({ analyses: { total: 2 } }) });
  assert.deepEqual(partial.milestones.map((x) => [x.key, x.done]), [
    ['concepts', true], ['mandatory', false], ['understanding', false], ['source', false], ['lesson', false], ['analysis', true], ['coverage', false], ['resolved', false]
  ]);
  assert.equal(partial.reached, 2);
});

test('a disabled mandatory concept does not satisfy the mandatory milestone; a source that was only added or read is not a taught source', () => {
  const m = buildMaturity({
    profile: profile({ concepts: [concept('a', 'mandatory', { enabled: false }), concept('b', 'preferred')] }),
    sources: [{ id: 's1', kind: 'website', status: 'ready' }, { id: 's2', kind: 'youtube', status: 'queued' }, { id: 's3', kind: 'pdf', status: 'failed' }], events: [], report: report()
  });
  assert.equal(stateOf(m, 'mandatory'), false);
  assert.equal(stateOf(m, 'source'), false);
  assert.deepEqual([m.sources.taught, m.sources.awaiting, m.sources.failed], [0, 2, 1]);
});

test('a raw note saved without teaching is not a taught lesson', () => {
  const m = buildMaturity({ profile: profile(), sources: [], events: [{ id: 'e1', kind: 'note', title: 'x' }], report: report() });
  assert.equal(stateOf(m, 'lesson'), false);
  assert.equal(m.lessons.total, 1);
  assert.equal(m.lessons.taught, 0);
});

test('data that could not be read is null ("not recorded") - the milestone is neither reached nor missed, and it is not counted either way', () => {
  const m = buildMaturity({ profile: profile({ concepts: [concept('a', 'mandatory')] }), sources: null, events: undefined, report: null });
  assert.equal(stateOf(m, 'source'), null);
  assert.equal(stateOf(m, 'lesson'), null);
  for (const key of ['analysis', 'coverage', 'resolved']) assert.equal(stateOf(m, key), null, key);
  assert.equal(m.unknown, 5);
  assert.equal(m.reached, 2, 'concepts + mandatory, which come from the profile itself');
  assert.equal(m.sources.available, false);
  assert.equal(m.sources.taught, null);
  assert.equal(m.lessons.available, false);
  assert.equal(m.lessons.taught, null);
  assert.equal(m.untaught, false, 'a profile that has concepts is not "untaught" just because other data is unreadable');
});

test('an empty profile is only declared untaught when the sources AND the ledger were readable - an unreadable one is "not recorded", never a guessed emptiness', () => {
  const empty = buildMaturity({ profile: profile(), sources: [], events: [], report: report() });
  assert.equal(empty.untaught, true);
  for (const [sources, events] of [[null, []], [[], null], [null, null], [undefined, undefined]]) {
    const unreadable = buildMaturity({ profile: profile(), sources, events, report: report() });
    assert.equal(unreadable.untaught, false, JSON.stringify([sources, events]));
  }
  const both = buildMaturity({ profile: profile(), sources: null, events: null, report: report() });
  assert.equal(both.unknown, 2, 'the two unreadable milestones stay unknown, not missed');
});

test('there is no score: no percentage, level, grade or rating field anywhere in the model', () => {
  const m = buildMaturity({ profile: profile({ concepts: [concept('a', 'mandatory')] }), sources: [], events: [], report: report() });
  assert.doesNotMatch(JSON.stringify(m), /score|level|grade|rating|percent|maturityRate/i);
  assert.deepEqual(Object.keys(m).sort(), ['concepts', 'lessons', 'milestones', 'of', 'reached', 'sources', 'understanding', 'unknown', 'untaught']);
});

test('understanding is "written" only when the summary has real text; the version is carried as a number', () => {
  assert.equal(buildMaturity({ profile: profile({ understanding: { summary: '   ', version: 4 } }) }).understanding.has, false);
  const written = buildMaturity({ profile: profile({ understanding: { summary: 'x', version: '2', updatedAt: '2026-01-01T00:00:00Z' } }) }).understanding;
  assert.deepEqual([written.has, written.version, written.updatedAt], [true, 2, '2026-01-01T00:00:00Z']);
});

test('the ledger and source classification is the Memory Sync projection\'s own, so "taught" means the same thing in both places', async () => {
  const { summarizeLedger, summarizeSources } = await import('../navrya-src/analysisProfileMemoryProjection.js');
  const events = [{ id: 'e1', kind: 'taught_source', tokenUsage: { promptTokens: 5, completionTokens: 5 }, createdAt: '2026-09-02T00:00:00Z' }, { id: 'e2', kind: 'note' }];
  const sources = [{ id: 's1', kind: 'pdf', status: 'taught' }, { id: 's2', kind: 'website', status: 'queued' }];
  const m = buildMaturity({ profile: profile(), sources, events, report: report() });
  assert.deepEqual(JSON.parse(JSON.stringify(m.lessons)), JSON.parse(JSON.stringify(summarizeLedger(events))));
  assert.deepEqual(JSON.parse(JSON.stringify(m.sources)), JSON.parse(JSON.stringify(summarizeSources(sources))));
});

test('buildMaturity never mutates its input and tolerates being called with nothing', () => {
  const input = { profile: profile({ concepts: [concept('a', 'mandatory')] }), sources: [{ id: 's', kind: 'pdf', status: 'taught' }], events: [{ id: 'e', kind: 'note' }], report: report() };
  const before = JSON.stringify(input);
  buildMaturity(input);
  assert.equal(JSON.stringify(input), before);
  assert.equal(buildMaturity().untaught, false, 'no data at all is unknown, not a verified emptiness');
  assert.equal(buildMaturity({}).of, MILESTONES.length);
});
