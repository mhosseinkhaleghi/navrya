import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// The pure math behind the Analysis Profile Report (public/pages/shared/analysis-profile-usage.js), run in a
// bare vm sandbox: it reads nothing itself, so every number is provable from the fixture handed in. The tests
// that matter most are the calendar-day ones - this codebase has already had a DST / west-of-UTC bucketing
// incident, and a Report that puts an evening analysis on the wrong weekday or in the wrong week is a wrong Report.
const root = process.cwd();
async function load() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(await readFile(path.join(root, 'public', 'pages', 'shared', 'analysis-profile-usage.js'), 'utf8'), sandbox, { filename: 'analysis-profile-usage.js' });
  return sandbox.window.TradeJournalAnalysisProfileUsage;
}
const j = (value) => JSON.parse(JSON.stringify(value)); // cross-realm objects compare structurally

const NOW = '2026-03-15T12:00:00.000Z';
const run = (id, occurredAt, extra) => ({ analysisId: id, sessionId: 's1', entryId: 'e1', analysisType: 'initial', occurredAt, activeMarketSession: 'London', conceptCoverage: null, ...extra });
const scenario = (id, profileId, extra) => ({ id, aiSource: profileId ? { source: 'ai_analysis', analysisProfileId: profileId } : { source: 'ai_analysis' }, occurred: false, invalidationTagIds: [], probabilityHistory: [{ value: 60, loggedAt: '2026-03-01T00:00:00.000Z' }], ...extra });
const session = (scenarios, extra) => ({ id: 's1', instrument: 'XAUUSD', timeframe: '15m', entries: [{ id: 'e1', timeframe: '5m', scenarios }], ...extra });
const trade = (id, scenarioId, extra) => ({ id, status: 'closed', outcome: 'win', rr: 2, source: { scenarioId }, ...extra });

test('registers window.TradeJournalAnalysisProfileUsage with compute() and its helpers', async () => {
  const usage = await load();
  assert.equal(typeof usage.compute, 'function');
  for (const name of ['dayNumber', 'weekdayIndex', 'weeksAgo', 'scenarioOutcome', 'resolvedAtMs', 'safeZone']) assert.equal(typeof usage.helpers[name], 'function', name);
});

// ---- honesty on nothing --------------------------------------------------------------------------------------------

test('with no data every measurement is null or a true zero count - never a fabricated 0% that reads as "measured and nothing happened"', async () => {
  const usage = await load();
  for (const input of [undefined, null, {}, { profileId: 'p', analyses: [], sessions: [], trades: [], events: [] }]) {
    const r = j(usage.compute({ now: NOW, ...(input || {}) }));
    assert.equal(r.empty, true);
    assert.equal(r.trackingSince, null);
    assert.equal(r.analyses.total, 0);
    assert.equal(r.scenarios.accuracy, null, 'accuracy with nothing resolved is null, not 0');
    assert.equal(r.scenarios.smallSample, false);
    assert.equal(r.adherence.appliedRate, null);
    assert.equal(r.adherence.checkedRate, null);
    assert.equal(r.trades.winRate, null);
    assert.equal(r.trades.avgR, null);
    assert.deepEqual(r.funnel.map((f) => f.v), [0, 0, 0, 0]);
    assert.equal(r.heatmap.placed, 0);
    assert.deepEqual(r.topInstruments, []);
  }
});

// ---- analyses ----------------------------------------------------------------------------------------------------------

test('counts the runs, splits them by type, and reports the earliest as where tracking began (rows with an unusable timestamp are ignored, not counted)', async () => {
  const usage = await load();
  const r = j(usage.compute({ profileId: 'p', now: NOW, analyses: [
    run('a2', '2026-03-05T10:00:00Z', { analysisType: 'update' }), run('a1', '2026-03-01T10:00:00Z'), run('a3', '2026-03-06T10:00:00Z', { analysisType: 'scenario_evaluation' }),
    run('a4', '2026-03-07T10:00:00Z', { analysisType: 'weird' }), run('bad', 'not a date'), run('bad2', null)
  ] }));
  assert.equal(r.analyses.total, 4);
  assert.deepEqual(r.analyses.byType, { initial: 1, update: 1, scenario_evaluation: 1, other: 1 });
  assert.equal(r.trackingSince, '2026-03-01T10:00:00.000Z');
  assert.equal(r.empty, false);
});

// ---- scenarios: attribution, outcome, accuracy -----------------------------------------------------------------------------

test('only scenarios stamped with THIS profile count - another profile\'s, an unstamped AI scenario and a hand-made one are all excluded', async () => {
  const usage = await load();
  const r = j(usage.compute({ profileId: 'p1', now: NOW, sessions: [session([
    scenario('mine', 'p1'), scenario('theirs', 'p2'), scenario('unstamped', null), { id: 'manual', occurred: true }
  ])] }));
  assert.equal(r.scenarios.added, 1);
});

test('outcome classification: occurred/confirmed -> confirmed; invalidated status or an invalidation tag -> invalidated; anything else is still open', async () => {
  const usage = await load();
  const { scenarioOutcome } = usage.helpers;
  assert.equal(scenarioOutcome({ occurred: true }), 'confirmed');
  assert.equal(scenarioOutcome({ status: 'confirmed' }), 'confirmed');
  assert.equal(scenarioOutcome({ status: 'invalidated' }), 'invalidated');
  assert.equal(scenarioOutcome({ invalidationTagIds: ['broke support'] }), 'invalidated');
  assert.equal(scenarioOutcome({ status: 'pending' }), 'open');
  assert.equal(scenarioOutcome({ status: 'active', invalidationTagIds: [] }), 'open');
  assert.equal(scenarioOutcome({ occurred: true, invalidationTagIds: ['x'] }), 'confirmed', 'a scenario that actually occurred is confirmed even if it was once tagged');
});

test('accuracy = confirmed / (confirmed + invalidated): scenarios still OPEN are counted as neither', async () => {
  const usage = await load();
  const many = [
    ...Array.from({ length: 3 }, (_, i) => scenario('c' + i, 'p', { occurred: true })),
    scenario('i0', 'p', { status: 'invalidated' }),
    ...Array.from({ length: 6 }, (_, i) => scenario('o' + i, 'p'))
  ];
  const r = j(usage.compute({ profileId: 'p', now: NOW, sessions: [session(many)] }));
  assert.deepEqual([r.scenarios.added, r.scenarios.confirmed, r.scenarios.invalidated, r.scenarios.open, r.scenarios.resolved], [10, 3, 1, 6, 4]);
  assert.equal(r.scenarios.accuracy, 75, '3 / (3 + 1) - the six open ones do not dilute it');
  assert.deepEqual(r.funnel.map((f) => [f.key, f.v]), [['analyses', 0], ['scenarios', 10], ['resolved', 4], ['confirmed', 3]]);
});

test('a sample of fewer than 10 resolved scenarios is flagged small, exactly at the threshold it is not, and nothing resolved is not "small" (it is null)', async () => {
  const usage = await load();
  const resolved = (n) => Array.from({ length: n }, (_, i) => scenario('r' + i, 'p', { occurred: true }));
  const at = (n) => j(usage.compute({ profileId: 'p', now: NOW, sessions: [session(resolved(n))] })).scenarios;
  assert.equal(at(9).smallSample, true);
  assert.equal(at(10).smallSample, false);
  assert.equal(at(0).smallSample, false);
  assert.equal(at(0).accuracy, null);
  assert.equal(at(9).smallSampleThreshold, 10);
});

// ---- calendar-day arithmetic (the DST / west-of-UTC incident class) ------------------------------------------------------------

test('weekday is read in the trader\'s time zone: Sunday evening in Los Angeles is already Monday in UTC, and must be counted as SUNDAY', async () => {
  const usage = await load();
  const { weekdayIndex } = usage.helpers;
  const instant = Date.parse('2026-03-09T03:30:00Z'); // Mon 03:30 UTC == Sun Mar 8 20:30 PDT
  assert.equal(weekdayIndex(instant, 'UTC'), 0, 'Monday in UTC');
  assert.equal(weekdayIndex(instant, 'America/Los_Angeles'), 6, 'Sunday where the trader actually is');
  assert.equal(weekdayIndex(Date.parse('2026-03-09T03:30:00Z'), 'Asia/Tehran'), 0, 'east of UTC: Monday');
  assert.equal(weekdayIndex(Date.parse('2026-03-08T21:00:00Z'), 'Asia/Tehran'), 0, 'Sunday 21:00 UTC is already Monday 00:30 in Tehran');
});

test('calendar days are whole integers across a DST switch (a 23-hour day must not shift the count)', async () => {
  const usage = await load();
  const { dayNumber } = usage.helpers;
  // US DST began Sun 2026-03-08: that local day is only 23 hours long.
  const zone = 'America/Los_Angeles';
  assert.equal(dayNumber(Date.parse('2026-03-09T20:00:00Z'), zone) - dayNumber(Date.parse('2026-03-07T20:00:00Z'), zone), 2);
  assert.equal(dayNumber(Date.parse('2026-03-08T12:00:00Z'), zone) - dayNumber(Date.parse('2026-03-07T12:00:00Z'), zone), 1);
  // ...and the same across the autumn switch (a 25-hour day, 2026-11-01).
  assert.equal(dayNumber(Date.parse('2026-11-02T20:00:00Z'), zone) - dayNumber(Date.parse('2026-10-31T20:00:00Z'), zone), 2);
});

test('the week bucket uses calendar days in the trader\'s zone - naive milliseconds/7 days puts the same instant in the WRONG week', async () => {
  const usage = await load();
  const { weeksAgo } = usage.helpers;
  const zone = 'America/Los_Angeles';
  const now = Date.parse('2026-03-15T06:00:00Z');   // Sat Mar 14, 23:00 PDT
  const instant = Date.parse('2026-03-08T07:30:00Z'); // Sat Mar  7, 23:30 PST - exactly 7 calendar days earlier locally
  assert.equal(Math.floor((now - instant) / (7 * 86400000)), 0, 'the naive ms arithmetic says "this week" (it is 6d 22.5h)');
  assert.equal(weeksAgo(instant, now, zone), 1, 'but it is 7 calendar days ago where the trader lives: last week');
});

test('an unknown / malformed time zone falls back to UTC instead of throwing inside the report', async () => {
  const usage = await load();
  assert.equal(usage.helpers.safeZone('Not/AZone'), 'UTC');
  assert.equal(usage.helpers.safeZone(undefined), 'UTC');
  assert.equal(usage.helpers.safeZone('Asia/Tehran'), 'Asia/Tehran');
  const r = j(usage.compute({ profileId: 'p', now: NOW, timeZone: 'Definitely/Broken', analyses: [run('a', '2026-03-05T10:00:00Z')] }));
  assert.equal(r.timeZone, 'UTC');
  assert.equal(r.heatmap.placed, 1);
});

// ---- the weekly accuracy trend ------------------------------------------------------------------------------------------------

test('the 12-week trend buckets resolved scenarios by the week they were resolved, ignores anything older or in the future, and reports which weeks had data', async () => {
  const usage = await load();
  const at = (loggedAt, extra) => ({ probabilityHistory: [{ value: 0, loggedAt }], ...extra });
  const r = j(usage.compute({ profileId: 'p', now: NOW, timeZone: 'UTC', sessions: [session([
    scenario('this-w-ok', 'p', at('2026-03-14T10:00:00Z', { occurred: true })),          // 1 day ago: week 0 (current)
    scenario('this-w-bad', 'p', at('2026-03-13T10:00:00Z', { status: 'invalidated' })),
    scenario('w3-ok', 'p', at('2026-02-22T10:00:00Z', { occurred: true })),              // 21 days ago: week 3
    scenario('ancient', 'p', at('2025-01-01T00:00:00Z', { occurred: true })),            // far outside the 12 weeks
    scenario('future', 'p', at('2026-04-30T00:00:00Z', { occurred: true })),             // after `now`: ignored, not bucketed
    scenario('open', 'p', at('2026-03-14T10:00:00Z'))                                    // still open: not a data point
  ])] }));
  assert.equal(r.accuracyTrend.length, 12);
  assert.equal(r.weeklyResolved[11], 2, 'the current week holds the two resolved this week');
  assert.equal(r.accuracyTrend[11], 50, '1 confirmed of 2');
  assert.equal(r.weeklyResolved[8], 1, '21 days ago -> week index 8');
  assert.equal(r.accuracyTrend[8], 100);
  assert.equal(r.weeklyResolved.reduce((a, b) => a + b, 0), 3, 'ancient, future and open scenarios are not data points');
});

test('a quiet week carries the previous week\'s rate forward rather than dropping to 0%, and the leading quiet weeks are 0', async () => {
  const usage = await load();
  const r = j(usage.compute({ profileId: 'p', now: NOW, timeZone: 'UTC', sessions: [session([
    scenario('w5', 'p', { occurred: true, probabilityHistory: [{ value: 0, loggedAt: '2026-02-10T10:00:00Z' }] })
  ])] }));
  const idx = r.weeklyResolved.findIndex((n) => n === 1);
  assert.ok(idx > 0);
  assert.deepEqual(r.accuracyTrend.slice(0, idx), Array(idx).fill(0));
  assert.deepEqual(r.accuracyTrend.slice(idx), Array(12 - idx).fill(100), 'every later quiet week carries 100 forward');
});

test('resolvedAtMs prefers the last AI evaluation, then the evaluation history, then the last logged probability; null when nothing is timestamped', async () => {
  const usage = await load();
  const { resolvedAtMs } = usage.helpers;
  assert.equal(resolvedAtMs({ lastEvaluation: { evaluatedAt: '2026-03-10T00:00:00Z' }, evaluationHistory: [{ evaluatedAt: '2026-03-01T00:00:00Z' }], probabilityHistory: [{ loggedAt: '2026-02-01T00:00:00Z' }] }), Date.parse('2026-03-10T00:00:00Z'));
  assert.equal(resolvedAtMs({ evaluationHistory: [{ evaluatedAt: '2026-03-01T00:00:00Z' }, { evaluatedAt: '2026-03-02T00:00:00Z' }], probabilityHistory: [{ loggedAt: '2026-02-01T00:00:00Z' }] }), Date.parse('2026-03-02T00:00:00Z'));
  assert.equal(resolvedAtMs({ probabilityHistory: [{ loggedAt: '2026-02-01T00:00:00Z' }, { loggedAt: '2026-02-05T00:00:00Z' }] }), Date.parse('2026-02-05T00:00:00Z'));
  assert.equal(resolvedAtMs({}), null);
});

// ---- mandatory-concept adherence -------------------------------------------------------------------------------------------------

test('adherence separates "applied" from "checked": a concept honestly not visible was CHECKED but not applied; only unaddressed is the engine skipping it', async () => {
  const usage = await load();
  const cov = (a, b) => [{ conceptId: 'c1', status: a }, { conceptId: 'c2', status: b }];
  const r = j(usage.compute({ profileId: 'p', now: NOW, concepts: [{ id: 'c1', title: 'Swept liquidity levels' }], analyses: [
    run('a1', '2026-03-01T00:00:00Z', { conceptCoverage: cov('applied', 'not_visible') }),
    run('a2', '2026-03-02T00:00:00Z', { conceptCoverage: cov('applied', 'unaddressed') }),
    run('a3', '2026-03-03T00:00:00Z', { conceptCoverage: cov('not_applicable', 'applied') }),
    run('a4', '2026-03-04T00:00:00Z') // no mandatory concepts that run: contributes nothing, and is not a "0% adherence" run
  ] }));
  const a = r.adherence;
  assert.deepEqual([a.runsWithCoverage, a.slots, a.applied, a.notVisible, a.notApplicable, a.unaddressed], [3, 6, 3, 1, 1, 1]);
  assert.equal(a.appliedRate, 50, '3 of 6 slots applied');
  assert.equal(a.checkedRate, 83, '5 of 6 slots were reported on; 1 was skipped');
  const byId = Object.fromEntries(a.perConcept.map((c) => [c.conceptId, c]));
  assert.equal(byId.c1.title, 'Swept liquidity levels');
  assert.equal(byId.c2.title, 'c2', 'a concept no longer in the profile falls back to its id, never a blank');
  assert.deepEqual([byId.c1.total, byId.c1.applied, byId.c1.appliedRate], [3, 2, 67]);
  assert.deepEqual([byId.c2.total, byId.c2.applied, byId.c2.unaddressed, byId.c2.checkedRate], [3, 1, 1, 67]);
});

// ---- trades --------------------------------------------------------------------------------------------------------------------------

test('only CLOSED trades linked (through source.scenarioId) to this profile\'s stamped scenarios count for win rate and R; open and unrelated trades do not', async () => {
  const usage = await load();
  const r = j(usage.compute({ profileId: 'p', now: NOW, sessions: [session([scenario('s-a', 'p'), scenario('s-b', 'p'), scenario('s-other', 'q')])], trades: [
    trade('t1', 's-a', { outcome: 'win', rr: 2 }), trade('t2', 's-a', { outcome: 'loss', rr: -1 }), trade('t3', 's-b', { outcome: 'win', rr: 3 }),
    trade('t4', 's-b', { status: 'open', outcome: null, rr: 9 }),           // open: not counted
    trade('t5', 's-other', { outcome: 'win', rr: 5 }),                       // another profile's scenario
    trade('t6', null, { outcome: 'win', rr: 5 }), { id: 't7', status: 'closed', outcome: 'win', rr: 5 } // unlinked
  ] }));
  assert.deepEqual([r.trades.linked, r.trades.closed, r.trades.wins], [4, 3, 2]);
  assert.equal(r.trades.winRate, 67);
  assert.equal(r.trades.avgR, 1.3, '(2 + -1 + 3) / 3, rounded to one decimal');
  assert.equal(r.trades.rDistribution.counted, 3);
  const bucket = (rr) => r.trades.rDistribution.buckets.find((b) => b.r === rr).count;
  assert.deepEqual([bucket(2), bucket(-1), bucket(3)], [1, 1, 1]);
});

test('a closed trade with no R value counts toward win rate but not toward average R; no closed trades means null, not 0', async () => {
  const usage = await load();
  const r = j(usage.compute({ profileId: 'p', now: NOW, sessions: [session([scenario('s', 'p')])], trades: [trade('t1', 's', { outcome: 'win', rr: null }), trade('t2', 's', { outcome: 'win', rr: 'n/a' })] }));
  assert.equal(r.trades.winRate, 100);
  assert.equal(r.trades.avgR, null);
  assert.equal(r.trades.rDistribution.counted, 0);
  const none = j(usage.compute({ profileId: 'p', now: NOW, sessions: [session([scenario('s', 'p')])], trades: [] }));
  assert.equal(none.trades.winRate, null);
});

// ---- heatmap / instruments / timeframes / tokens ---------------------------------------------------------------------------------------

test('the heatmap places each run by its SERVER-stamped market session and its weekday in the trader\'s zone; a run with no session, or an unusable time, is counted as unplaced - never guessed into a cell', async () => {
  const usage = await load();
  const analyses = [
    run('a1', '2026-03-09T03:30:00Z', { activeMarketSession: 'New York' }),  // Mon UTC, Sun in LA
    run('a2', '2026-03-09T03:40:00Z', { activeMarketSession: 'New York' }),
    run('a3', '2026-03-11T09:00:00Z', { activeMarketSession: 'Tokyo' }),      // Wed
    run('a4', '2026-03-11T09:00:00Z', { activeMarketSession: '' }),           // legacy: no session stamped
    run('a5', '2026-03-11T09:00:00Z', { activeMarketSession: 'Mars' })
  ];
  const utc = j(usage.compute({ profileId: 'p', now: NOW, timeZone: 'UTC', analyses })).heatmap;
  const la = j(usage.compute({ profileId: 'p', now: NOW, timeZone: 'America/Los_Angeles', analyses })).heatmap;
  const ny = utc.sessions.indexOf('New York'); const tokyo = utc.sessions.indexOf('Tokyo');
  assert.equal(utc.table[ny][0], 2, 'Monday in UTC');
  assert.equal(la.table[ny][6], 2, 'the very same runs are Sunday in Los Angeles');
  assert.equal(la.table[ny][0], 0);
  assert.equal(utc.table[tokyo][2], 1);
  assert.deepEqual([utc.placed, utc.unplaced], [3, 2]);
  assert.equal(utc.max, 2);
  assert.deepEqual(utc.weekdays, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
});

test('top instruments and timeframes come from the sessions the runs belong to (entry timeframe wins over the session\'s), most-used first, ties broken alphabetically', async () => {
  const usage = await load();
  const sessions = [
    { id: 's1', instrument: 'XAUUSD', timeframe: '15m', entries: [{ id: 'e1', timeframe: '5m' }, { id: 'e2' }] },
    { id: 's2', instrument: 'EURUSD', timeframe: '1h', entries: [{ id: 'e1' }] }
  ];
  const r = j(usage.compute({ profileId: 'p', now: NOW, sessions, analyses: [
    run('a1', '2026-03-01T00:00:00Z', { sessionId: 's1', entryId: 'e1' }), run('a2', '2026-03-02T00:00:00Z', { sessionId: 's1', entryId: 'e2' }),
    run('a3', '2026-03-03T00:00:00Z', { sessionId: 's2', entryId: 'e1' }), run('a4', '2026-03-04T00:00:00Z', { sessionId: 'gone', entryId: 'x' })
  ] }));
  assert.deepEqual(r.topInstruments, [{ key: 'XAUUSD', count: 2 }, { key: 'EURUSD', count: 1 }], 'a run whose session no longer exists contributes nothing');
  assert.deepEqual(r.topTimeframes, [{ key: '15m', count: 1 }, { key: '1h', count: 1 }, { key: '5m', count: 1 }], 'e1 -> 5m (entry), e2 -> 15m (session fallback), s2 -> 1h; tied counts sort alphabetically');
});

test('training tokens are the real recorded usage: only events that actually spent tokens are counted as AI-assisted', async () => {
  const usage = await load();
  const r = j(usage.compute({ profileId: 'p', now: NOW, events: [
    { kind: 'ai_analyzed_note', tokenUsage: { promptTokens: 300, completionTokens: 90 } }, { kind: 'taught_note', tokenUsage: null },
    { kind: 'ai_analyzed_chat', tokenUsage: { promptTokens: 100 } }, { kind: 'note' }, { kind: 'x', tokenUsage: { promptTokens: 0, completionTokens: 0 } }, null
  ] }));
  assert.deepEqual(r.tokens, { total: 490, aiEvents: 2, events: 6 });
});

// ---- determinism ---------------------------------------------------------------------------------------------------------------------

test('compute() is deterministic for a fixed `now` and never mutates its input', async () => {
  const usage = await load();
  const input = { profileId: 'p', now: NOW, timeZone: 'America/Los_Angeles', concepts: [{ id: 'c1', title: 'A' }],
    analyses: [run('a1', '2026-03-09T03:30:00Z', { conceptCoverage: [{ conceptId: 'c1', status: 'applied' }] })],
    sessions: [session([scenario('s', 'p', { occurred: true })])], trades: [trade('t', 's')], events: [{ tokenUsage: { promptTokens: 5 } }] };
  const snapshot = JSON.stringify(input);
  const first = j(usage.compute(input));
  assert.deepEqual(j(usage.compute(input)), first);
  assert.equal(JSON.stringify(input), snapshot, 'the caller\'s data must never be modified by computing a report');
});
