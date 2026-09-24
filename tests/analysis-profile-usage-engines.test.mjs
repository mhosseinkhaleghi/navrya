import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// The engine / provider-model breakdown of the Analysis Profile Report (analysis-profile-usage.js -> compute().engines), run in a bare vm
// sandbox. What must hold: a run belongs to exactly one engine (provider + model as recorded), a scenario is attributed to an engine ONLY
// through the exact analysisId of the run that proposed it, accuracy exists only where scenarios are resolved, and nothing here ever
// calls an engine "successful" just because it ran.
const root = process.cwd();
async function load() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(await readFile(path.join(root, 'public', 'pages', 'shared', 'analysis-profile-usage.js'), 'utf8'), sandbox, { filename: 'analysis-profile-usage.js' });
  return sandbox.window.TradeJournalAnalysisProfileUsage;
}
const j = (value) => JSON.parse(JSON.stringify(value)); // cross-realm objects compare structurally

const NOW = '2026-03-15T12:00:00.000Z';
const run = (analysisId, provider, model, extra) => ({ analysisId, sessionId: 's1', entryId: 'e1', analysisType: 'initial', occurredAt: '2026-03-02T10:00:00Z', provider, model, activeMarketSession: 'London', conceptCoverage: null, ...extra });
const scenario = (id, analysisId, extra) => ({ id, aiSource: { source: 'ai_analysis', analysisId, analysisProfileId: 'p1' }, occurred: false, invalidationTagIds: [], probabilityHistory: [{ value: 60, loggedAt: '2026-03-03T00:00:00.000Z' }], ...extra });
const confirmed = { occurred: true, status: 'confirmed' };
const invalidated = { status: 'invalidated' };
const session = (scenarios) => ({ id: 's1', instrument: 'XAUUSD', timeframe: '15m', entries: [{ id: 'e1', timeframe: '5m', scenarios }] });
const engineOf = (result, provider, model) => result.engines.list.find((e) => e.provider === provider && e.model === model);

test('runs are grouped per provider + model as recorded, most-used first, with a per-engine analysis-type split and run share', async () => {
  const usage = await load();
  const r = j(usage.compute({ profileId: 'p1', now: NOW, analyses: [
    run('a1', 'openai', 'gpt-x'), run('a2', 'openai', 'gpt-x', { analysisType: 'update' }), run('a3', 'anthropic', 'claude-y', { analysisType: 'scenario_evaluation' }),
    run('a4', 'openai', 'gpt-x'), run('a5', 'gemini', 'gem-z', { analysisType: 'weird' })
  ] }));
  assert.deepEqual(r.engines.list.map((e) => [e.provider, e.model, e.runs]), [['openai', 'gpt-x', 3], ['anthropic', 'claude-y', 1], ['gemini', 'gem-z', 1]]);
  assert.deepEqual(engineOf(r, 'openai', 'gpt-x').byType, { initial: 2, update: 1, scenario_evaluation: 0, other: 0 });
  assert.deepEqual(engineOf(r, 'gemini', 'gem-z').byType, { initial: 0, update: 0, scenario_evaluation: 0, other: 1 });
  assert.deepEqual(r.engines.list.map((e) => e.runShare), [60, 20, 20]);
  assert.equal(r.engines.list.reduce((sum, e) => sum + e.runs, 0), r.analyses.total, 'every counted run lands in exactly one engine');
});

test('provider comparison ignores case and stray spaces; the same model under two providers stays two engines', async () => {
  const usage = await load();
  const r = j(usage.compute({ profileId: 'p1', now: NOW, analyses: [
    run('a1', 'OpenAI', ' gpt-x '), run('a2', 'openai', 'gpt-x'), run('a3', 'openrouter', 'gpt-x')
  ] }));
  assert.equal(r.engines.list.length, 2);
  assert.equal(engineOf(r, 'OpenAI', 'gpt-x').runs, 2);
  assert.equal(engineOf(r, 'openrouter', 'gpt-x').runs, 1);
});

test('a run whose provider or model was not recorded is its own "not recorded" engine with null fields - never a guessed engine', async () => {
  const usage = await load();
  const r = j(usage.compute({ profileId: 'p1', now: NOW, analyses: [run('a1', '', ''), run('a2', undefined, null), run('a3', 'openai', ''), run('a4', 'openai', 'gpt-x')] }));
  const unknown = r.engines.list.find((e) => e.provider === null && e.model === null);
  assert.equal(unknown.runs, 2);
  const noModel = r.engines.list.find((e) => e.provider === 'openai' && e.model === null);
  assert.equal(noModel.runs, 1);
  assert.equal(r.engines.list.length, 3);
});

test('scenarios are attributed to an engine ONLY through the exact analysisId of the run that proposed them', async () => {
  const usage = await load();
  const r = j(usage.compute({ profileId: 'p1', now: NOW,
    analyses: [run('a1', 'openai', 'gpt-x'), run('a2', 'anthropic', 'claude-y')],
    sessions: [session([scenario('s-a', 'a1', confirmed), scenario('s-b', 'a1', invalidated), scenario('s-c', 'a2', confirmed), scenario('s-d', 'a2')])] }));
  const gpt = engineOf(r, 'openai', 'gpt-x').scenarios;
  const claude = engineOf(r, 'anthropic', 'claude-y').scenarios;
  assert.deepEqual([gpt.added, gpt.confirmed, gpt.invalidated, gpt.open, gpt.resolved, gpt.accuracy], [2, 1, 1, 0, 2, 50]);
  assert.deepEqual([claude.added, claude.confirmed, claude.invalidated, claude.open, claude.resolved, claude.accuracy], [2, 1, 0, 1, 1, 100]);
  assert.equal(r.engines.matchedScenarios, 4);
  assert.equal(r.engines.unmatchedScenarios, 0);
});

test('a scenario whose run is not among the recorded rows (or carries no analysisId) is UNMATCHED - counted in the totals, never spread over an engine', async () => {
  const usage = await load();
  const r = j(usage.compute({ profileId: 'p1', now: NOW,
    analyses: [run('a1', 'openai', 'gpt-x'), run('a2', 'anthropic', 'claude-y')],
    sessions: [session([scenario('kept', 'a1', confirmed), scenario('orphan', 'missing-run', confirmed), scenario('no-id', undefined, invalidated), scenario('blank', '  ')])] }));
  assert.equal(r.scenarios.added, 4, 'the profile-level totals still include them');
  assert.equal(r.engines.matchedScenarios, 1);
  assert.equal(r.engines.unmatchedScenarios, 3);
  assert.equal(engineOf(r, 'openai', 'gpt-x').scenarios.added, 1);
  assert.equal(engineOf(r, 'anthropic', 'claude-y').scenarios.added, 0);
  const engineTotal = r.engines.list.reduce((sum, e) => sum + e.scenarios.added, 0);
  assert.equal(engineTotal + r.engines.unmatchedScenarios, r.scenarios.added, 'matched + unmatched = every attributed scenario');
});

test('a look-alike analysisId is not the same run (exact match, not prefix or substring)', async () => {
  const usage = await load();
  const r = j(usage.compute({ profileId: 'p1', now: NOW, analyses: [run('s1:abc', 'openai', 'gpt-x')], sessions: [session([scenario('x1', 's1:abc-2', confirmed), scenario('x2', 's1:ab', confirmed), scenario('x3', 'S1:ABC', confirmed)])] }));
  assert.equal(r.engines.matchedScenarios, 0);
  assert.equal(r.engines.unmatchedScenarios, 3);
});

test('an engine that only RAN has accuracy null and resolved 0 - "it ran" is never reported as "it worked"; no success field exists anywhere', async () => {
  const usage = await load();
  const r = j(usage.compute({ profileId: 'p1', now: NOW,
    analyses: [run('a1', 'openai', 'gpt-x'), run('a2', 'anthropic', 'claude-y')],
    sessions: [session([scenario('open-1', 'a1'), scenario('open-2', 'a1')])] }));
  const gpt = engineOf(r, 'openai', 'gpt-x');
  assert.equal(gpt.scenarios.accuracy, null);
  assert.equal(gpt.scenarios.resolved, 0);
  assert.equal(gpt.scenarios.open, 2);
  assert.equal(gpt.scenarios.smallSample, false);
  assert.equal(engineOf(r, 'anthropic', 'claude-y').scenarios.accuracy, null, 'no scenarios at all is null too, not 0%');
  assert.doesNotMatch(JSON.stringify(r.engines), /success|succeeded|reliab|score|rank|best/i);
});

test('a resolved engine is flagged small-sample below the threshold, exactly like the profile-level accuracy', async () => {
  const usage = await load();
  const many = Array.from({ length: 10 }, (_, i) => scenario('m' + i, 'a1', i < 7 ? confirmed : invalidated));
  const few = [scenario('f1', 'a2', confirmed), scenario('f2', 'a2', invalidated)];
  const r = j(usage.compute({ profileId: 'p1', now: NOW, analyses: [run('a1', 'openai', 'gpt-x'), run('a2', 'anthropic', 'claude-y')], sessions: [session([...many, ...few])] }));
  assert.equal(engineOf(r, 'openai', 'gpt-x').scenarios.accuracy, 70);
  assert.equal(engineOf(r, 'openai', 'gpt-x').scenarios.smallSample, false);
  assert.equal(engineOf(r, 'anthropic', 'claude-y').scenarios.accuracy, 50);
  assert.equal(engineOf(r, 'anthropic', 'claude-y').scenarios.smallSample, true);
});

test('first and last run times per engine come from the recorded rows; a row with an unusable time is ignored entirely', async () => {
  const usage = await load();
  const r = j(usage.compute({ profileId: 'p1', now: NOW, analyses: [
    run('a1', 'openai', 'gpt-x', { occurredAt: '2026-03-05T10:00:00Z' }), run('a2', 'openai', 'gpt-x', { occurredAt: '2026-03-01T08:00:00Z' }),
    run('a3', 'openai', 'gpt-x', { occurredAt: '2026-03-09T09:00:00Z' }), run('bad', 'openai', 'gpt-x', { occurredAt: 'nope' })
  ] }));
  const e = engineOf(r, 'openai', 'gpt-x');
  assert.equal(e.runs, 3);
  assert.equal(e.firstRunAt, '2026-03-01T08:00:00.000Z');
  assert.equal(e.lastRunAt, '2026-03-09T09:00:00.000Z');
});

test('the same analysisId recorded twice keeps the first engine (a scenario is never counted for two engines)', async () => {
  const usage = await load();
  const r = j(usage.compute({ profileId: 'p1', now: NOW, analyses: [
    run('dup', 'openai', 'gpt-x', { occurredAt: '2026-03-01T00:00:00Z' }), run('dup', 'anthropic', 'claude-y', { occurredAt: '2026-03-02T00:00:00Z' })
  ], sessions: [session([scenario('one', 'dup', confirmed)])] }));
  assert.equal(r.engines.list.reduce((sum, e) => sum + e.scenarios.added, 0), 1);
  assert.equal(engineOf(r, 'openai', 'gpt-x').scenarios.added, 1);
});

test('with no runs there are no engines and nothing to divide by - an empty list, not a fabricated engine', async () => {
  const usage = await load();
  for (const input of [undefined, {}, { profileId: 'p1', analyses: [], sessions: [session([scenario('x', 'a1', confirmed)])] }]) {
    const r = j(usage.compute({ now: NOW, ...(input || {}) }));
    assert.deepEqual(r.engines.list, []);
    assert.equal(r.engines.matchedScenarios, 0);
  }
  // scenarios whose runs are not recorded at all are still unmatched, so the Report can say so
  const orphaned = j(usage.compute({ now: NOW, profileId: 'p1', analyses: [], sessions: [session([scenario('x', 'a1', confirmed)])] }));
  assert.equal(orphaned.engines.unmatchedScenarios, 1);
});

test('existing truthful figures are untouched by the engine breakdown, and compute() still does not mutate its input', async () => {
  const usage = await load();
  const input = { profileId: 'p1', now: NOW, analyses: [run('a1', 'openai', 'gpt-x'), run('a2', 'openai', 'gpt-x', { analysisType: 'update' })], sessions: [session([scenario('c', 'a1', confirmed), scenario('i', 'a1', invalidated), scenario('o', 'a2')])] };
  const before = JSON.stringify(input);
  const r = j(usage.compute(input));
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(r.analyses.byType, { initial: 1, update: 1, scenario_evaluation: 0, other: 0 });
  assert.deepEqual([r.scenarios.added, r.scenarios.confirmed, r.scenarios.invalidated, r.scenarios.open, r.scenarios.accuracy], [3, 1, 1, 1, 50]);
  const e = engineOf(r, 'openai', 'gpt-x');
  assert.deepEqual([e.scenarios.added, e.scenarios.confirmed, e.scenarios.invalidated, e.scenarios.open], [r.scenarios.added, r.scenarios.confirmed, r.scenarios.invalidated, r.scenarios.open]);
});
