import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isValidTimeZone, resolveTimezone, dayKeyInTimeZone, computeDisciplineStreak,
  qualifyingDaysFromCompletions, legacyQualifyingDaysFromSessions, legacyHasAnyAnalysis,
  firstValidChartInstrumentSession, evaluateNewAchievements, DISCIPLINE_MILESTONES, LEGACY_BACKFILL_CUTOFF_ISO,
  weeklyConsistency, findAnalysisDebtSession, hasFollowThroughSession, FOLLOW_THROUGH_ACHIEVEMENT_KEY
} from '../server/community/ai-discipline.mjs';
import { SERVER_ONLY_ACHIEVEMENT_POINTS } from '../server/community/xp-config.mjs';

test('DISCIPLINE_MILESTONES declares exactly the seven required thresholds in order', () => {
  assert.deepEqual(DISCIPLINE_MILESTONES.map((m) => m.days), [3, 7, 14, 30, 90, 180, 365]);
  assert.deepEqual(DISCIPLINE_MILESTONES.map((m) => m.key), [
    'session_ai_discipline_3d', 'session_ai_discipline_7d', 'session_ai_discipline_14d', 'session_ai_discipline_30d',
    'session_ai_discipline_90d', 'session_ai_discipline_180d', 'session_ai_discipline_365d'
  ]);
});

test('isValidTimeZone/resolveTimezone accept a real IANA zone and fall back to UTC for anything else', () => {
  assert.equal(isValidTimeZone('America/New_York'), true);
  assert.equal(isValidTimeZone('Asia/Tehran'), true);
  assert.equal(isValidTimeZone('Not/ARealZone'), false);
  assert.equal(isValidTimeZone(''), false);
  assert.equal(isValidTimeZone(null), false);
  assert.equal(isValidTimeZone(undefined), false);
  assert.equal(resolveTimezone('Asia/Tehran'), 'Asia/Tehran');
  assert.equal(resolveTimezone('Not/ARealZone'), 'UTC');
  assert.equal(resolveTimezone(null), 'UTC');
});

test('dayKeyInTimeZone buckets a UTC instant into the correct local calendar day, and falls back to UTC for an invalid zone', () => {
  // 2026-07-10T20:59:00Z is 16:59 EDT (America/New_York, UTC-4 in July) - still the 10th locally.
  assert.equal(dayKeyInTimeZone('2026-07-10T20:59:00.000Z', 'America/New_York'), '2026-07-10');
  // 2026-07-11T01:30:00Z is 21:30 EDT on the 10th - a midnight-crossing UTC boundary that must
  // NOT roll the local day forward.
  assert.equal(dayKeyInTimeZone('2026-07-11T01:30:00.000Z', 'America/New_York'), '2026-07-10');
  // Tehran (UTC+3:30) rolls the day forward well before UTC midnight.
  assert.equal(dayKeyInTimeZone('2026-01-01T21:00:00.000Z', 'Asia/Tehran'), '2026-01-02');
  assert.equal(
    dayKeyInTimeZone('2026-01-01T00:00:00.000Z', 'Not/ARealZone'),
    dayKeyInTimeZone('2026-01-01T00:00:00.000Z', 'UTC'),
    'an invalid timezone must fall back to UTC bucketing rather than throw'
  );
});

test('qualifyingDaysFromCompletions only counts a completion whose Session was created on the SAME local day', () => {
  const sessionsById = {
    same: { id: 'same', createdAt: '2026-03-05T10:00:00.000Z' },
    // Created the day before, analyzed just after UTC midnight the next day - the classic
    // "analysis after midnight for a Session created before midnight" case that must NOT qualify.
    crossesMidnight: { id: 'crossesMidnight', createdAt: '2026-03-05T23:50:00.000Z' }
  };
  const completions = [
    { sessionId: 'same', occurredAt: '2026-03-05T14:00:00.000Z' },
    { sessionId: 'crossesMidnight', occurredAt: '2026-03-06T00:10:00.000Z' },
    { sessionId: 'missingSession', occurredAt: '2026-03-05T14:00:00.000Z' }
  ];
  const days = qualifyingDaysFromCompletions(completions, sessionsById, 'UTC');
  assert.deepEqual(days, ['2026-03-05']);
});

test('multiple qualifying sessions/completions on the same day count as exactly one qualifying day (no duplicate day awards)', () => {
  const sessionsById = {
    a: { id: 'a', createdAt: '2026-03-05T01:00:00.000Z' },
    b: { id: 'b', createdAt: '2026-03-05T20:00:00.000Z' }
  };
  const completions = [
    { sessionId: 'a', occurredAt: '2026-03-05T02:00:00.000Z' },
    { sessionId: 'b', occurredAt: '2026-03-05T21:00:00.000Z' }
  ];
  const days = qualifyingDaysFromCompletions(completions, sessionsById, 'UTC');
  const streak = computeDisciplineStreak(days, 'UTC', new Date('2026-03-05T23:00:00.000Z'));
  assert.deepEqual(streak.qualifyingDayKeys, ['2026-03-05']);
  assert.equal(streak.longestStreak, 1);
});

test('computeDisciplineStreak: a real gap breaks the run, longestStreak survives, currentStreak reflects only the live tail', () => {
  const days = ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-10', '2026-01-11'];
  const streak = computeDisciplineStreak(days, 'UTC', new Date('2026-01-11T12:00:00.000Z'));
  assert.equal(streak.longestStreak, 3, 'the earlier 3-day run is still the longest ever achieved');
  assert.equal(streak.currentStreak, 2, 'the live tail is the 2-day run ending "today"');
});

test('computeDisciplineStreak: currentStreak resets to 0 once the last qualifying day is neither today nor yesterday, but longestStreak (and therefore unlocked milestones) never regresses', () => {
  const days = ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05', '2026-01-06', '2026-01-07'];
  const streak = computeDisciplineStreak(days, 'UTC', new Date('2026-02-01T12:00:00.000Z'));
  assert.equal(streak.longestStreak, 7);
  assert.equal(streak.currentStreak, 0, 'a broken streak shows 0 for UI purposes, but never removes what longestStreak already proves was achieved');
});

test('computeDisciplineStreak crosses every one of the seven real thresholds on one long, unbroken run', () => {
  const days = [];
  for (let i = 0; i < 365; i += 1) {
    const d = new Date(Date.UTC(2026, 0, 1) + i * 86400000);
    days.push(d.toISOString().slice(0, 10));
  }
  const streak = computeDisciplineStreak(days, 'UTC', new Date(Date.UTC(2027, 0, 1)));
  assert.equal(streak.longestStreak, 365);
  DISCIPLINE_MILESTONES.forEach((m) => assert.ok(streak.longestStreak >= m.days, m.key + ' must be considered crossed'));
});

test('legacyQualifyingDaysFromSessions only trusts pre-existing analysis timestamps strictly before the release cutoff', () => {
  const sessions = [
    {
      id: 'legacy', createdAt: '2026-01-01T10:00:00.000Z',
      aiSessionAnalysisResult: { updatedAt: '2026-01-01T11:00:00.000Z' }
    },
    {
      id: 'postCutoff', createdAt: '2026-09-19T10:00:00.000Z',
      entries: [{ type: 'chart', aiAnalysisResult: { generatedAt: '2026-09-19T11:00:00.000Z' } }]
    }
  ];
  const days = legacyQualifyingDaysFromSessions(sessions, 'UTC', LEGACY_BACKFILL_CUTOFF_ISO);
  assert.deepEqual(days, ['2026-01-01'], 'a post-cutoff aiAnalysisResult must never backfill a discipline day');
  assert.equal(legacyHasAnyAnalysis(sessions, LEGACY_BACKFILL_CUTOFF_ISO), true, 'the pre-cutoff session still counts for the one-time first_session_ai_analysis backfill');
  assert.equal(
    legacyHasAnyAnalysis([sessions[1]], LEGACY_BACKFILL_CUTOFF_ISO), false,
    'a post-cutoff-only history must never backfill the onboarding achievement either'
  );
});

// A minimal fake repo satisfying exactly the surface evaluateNewAchievements() calls, with full
// control over each session's own createdAt/completion occurredAt - sidesteps repo.memory.mjs's
// real-clock-only createdAt semantics (both backends always stamp a brand-new session's
// createdAt as real "now", so a genuine multi-day run cannot be fabricated through the real repo
// inside one fast test run - see tests/ai-discipline-achievements-api.test.mjs's own comment).
function fakeRepo({ completions, sessions }) {
  const achievementRows = [];
  const xpRecords = [];
  return {
    repo: {
      sessionAiAnalysisCompletions: { listForUser: async () => completions },
      tradingSessions: { listByUser: async () => sessions },
      achievements: {
        async unlock({ userId, achievementKey, evidence }) {
          if (achievementRows.some((a) => a.achievementKey === achievementKey)) return { created: false, achievement: null };
          const row = { userId, achievementKey, evidence, unlockedAt: new Date().toISOString() };
          achievementRows.push(row);
          return { created: true, achievement: row };
        }
      },
      xpEvents: { async record(evt) { xpRecords.push(evt); return { event: evt, user: { xpTotal: 0 } }; } }
    },
    achievementRows, xpRecords
  };
}

function daySession(id, dayIndex) {
  const createdAt = new Date(Date.UTC(2026, 0, 1) + dayIndex * 86400000).toISOString();
  return { id, createdAt, instrument: 'XAUUSD', entries: [] };
}

test('evaluateNewAchievements unlocks every crossed milestone idempotently on one long, unbroken 40-day run, and awards each milestone\'s XP exactly once', async () => {
  const sessions = [];
  const completions = [];
  for (let i = 0; i < 40; i += 1) {
    const id = 'sess-' + i;
    const session = daySession(id, i);
    sessions.push(session);
    completions.push({ sessionId: id, occurredAt: session.createdAt, analysisId: 'analysis-' + i });
  }
  const { repo, achievementRows, xpRecords } = fakeRepo({ completions, sessions });
  const cfg = { achievementPoints: SERVER_ONLY_ACHIEVEMENT_POINTS };
  const unlockedKeys = new Set();

  const result = await evaluateNewAchievements(repo, 'user-1', { unlockedKeys, cfg, timezone: 'UTC' });
  assert.equal(result.grantedAny, true);
  assert.equal(result.streak.longestStreak, 40);
  const unlockedMilestoneKeys = achievementRows.filter((a) => a.achievementKey.startsWith('session_ai_discipline_')).map((a) => a.achievementKey);
  assert.deepEqual(new Set(unlockedMilestoneKeys), new Set(['session_ai_discipline_3d', 'session_ai_discipline_7d', 'session_ai_discipline_14d', 'session_ai_discipline_30d']));
  assert.ok(!unlockedMilestoneKeys.includes('session_ai_discipline_90d'), '40 days must not cross the 90-day milestone');
  const expectedXp = [3, 7, 14, 30].reduce((sum, days) => sum + SERVER_ONLY_ACHIEVEMENT_POINTS['session_ai_discipline_' + days + 'd'], 0)
    + SERVER_ONLY_ACHIEVEMENT_POINTS.first_session_ai_analysis; // also crossed on this same run
  const totalXpAwarded = xpRecords.reduce((sum, evt) => sum + evt.points, 0);
  assert.equal(totalXpAwarded, expectedXp);

  // A second opportunistic recompute (same shape as a later GET /me/achievements poll) over the
  // exact same evidence must never re-grant or re-award anything already unlocked.
  const rowCountBefore = achievementRows.length;
  const xpCountBefore = xpRecords.length;
  const second = await evaluateNewAchievements(repo, 'user-1', { unlockedKeys, cfg, timezone: 'UTC' });
  assert.equal(second.grantedAny, false);
  assert.equal(achievementRows.length, rowCountBefore);
  assert.equal(xpRecords.length, xpCountBefore);
});

test('evaluateNewAchievements: a gap that breaks the streak never revokes an already-crossed milestone on a later recompute', async () => {
  // Days 0-6 (7-day run), then a gap, then day 20 alone - longestStreak stays 7 forever.
  const sessions = [];
  const completions = [];
  [0, 1, 2, 3, 4, 5, 6, 20].forEach((i, idx) => {
    const id = 'sess-' + idx;
    const session = daySession(id, i);
    sessions.push(session);
    completions.push({ sessionId: id, occurredAt: session.createdAt, analysisId: 'analysis-' + idx });
  });
  const { repo, achievementRows } = fakeRepo({ completions, sessions });
  const cfg = { achievementPoints: SERVER_ONLY_ACHIEVEMENT_POINTS };
  const unlockedKeys = new Set();
  await evaluateNewAchievements(repo, 'user-2', { unlockedKeys, cfg, timezone: 'UTC' });
  const keys = achievementRows.map((a) => a.achievementKey);
  assert.ok(keys.includes('session_ai_discipline_3d') && keys.includes('session_ai_discipline_7d'));
  assert.ok(!keys.includes('session_ai_discipline_14d'));
});

// Follow-up creative addition #2 - weekly consistency
test('weeklyConsistency counts qualifying days within the trailing 7-day window (inclusive of today), never more', () => {
  const today = new Date('2026-03-10T12:00:00.000Z');
  const days = ['2026-03-04', '2026-03-05', '2026-03-08', '2026-03-10', '2026-02-01'];
  const result = weeklyConsistency(days, 'UTC', today);
  assert.equal(result.totalDays, 7);
  // Window is 2026-03-04..2026-03-10 inclusive (7 days): 03-04, 03-05, 03-08, and 03-10 all fall
  // inside it (4 matches) - 2026-02-01 is well outside the window and must not count.
  assert.equal(result.qualifiedDays, 4);
});

test('weeklyConsistency reports 0 of 7 when there is no qualifying activity at all', () => {
  assert.deepEqual(weeklyConsistency([], 'UTC', new Date('2026-03-10T00:00:00.000Z')), { qualifiedDays: 0, totalDays: 7 });
});

// Follow-up creative addition #1 - analysis debt
test('findAnalysisDebtSession flags the oldest open Session with zero completions, older than 24h, and ignores closed Sessions', () => {
  const now = new Date('2026-01-05T00:00:00.000Z');
  const sessions = [
    { id: 'old-open-no-analysis', status: 'open', createdAt: '2026-01-01T00:00:00.000Z', name: 'Gold Watch', market: 'London', instrument: 'XAUUSD' },
    { id: 'recent-open-no-analysis', status: 'open', createdAt: '2026-01-04T23:00:00.000Z' },
    { id: 'old-open-analyzed', status: 'open', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'old-closed-no-analysis', status: 'closed', createdAt: '2026-01-01T00:00:00.000Z' }
  ];
  const completions = [{ sessionId: 'old-open-analyzed', occurredAt: '2026-01-01T05:00:00.000Z' }];
  const debt = findAnalysisDebtSession(sessions, completions, now);
  assert.equal(debt.sessionId, 'old-open-no-analysis');
  assert.equal(debt.name, 'Gold Watch');
  assert.ok(debt.ageHours >= 24 * 4 - 1);
});

test('findAnalysisDebtSession returns null when nothing qualifies (nothing old enough, or every open Session already has a completion)', () => {
  const now = new Date('2026-01-05T00:00:00.000Z');
  assert.equal(findAnalysisDebtSession([{ id: 's1', status: 'open', createdAt: '2026-01-04T23:30:00.000Z' }], [], now), null);
  assert.equal(findAnalysisDebtSession([{ id: 's2', status: 'open', createdAt: '2026-01-01T00:00:00.000Z' }], [{ sessionId: 's2', occurredAt: '2026-01-01T01:00:00.000Z' }], now), null);
  assert.equal(findAnalysisDebtSession([], [], now), null);
});

// Follow-up creative addition #4 - reflection quality / follow-through
test('hasFollowThroughSession requires a real "resolved" status inside a session\'s own AI memory, not merely any unresolvedItems entry', () => {
  const noMemory = { id: 's1' };
  const stillOpen = { id: 's2', aiSessionAnalysisResult: { memory: { unresolvedItems: [{ id: 'u1', status: 'open' }] } } };
  const resolved = { id: 's3', aiSessionAnalysisResult: { memory: { unresolvedItems: [{ id: 'u1', status: 'open' }, { id: 'u2', status: 'resolved' }] } } };
  assert.equal(hasFollowThroughSession([noMemory, stillOpen]), false);
  assert.equal(hasFollowThroughSession([noMemory, stillOpen, resolved]), true);
});

test('FOLLOW_THROUGH_ACHIEVEMENT_KEY unlocks once, is never part of the discipline ladder, and awards its configured XP exactly once', async () => {
  const sessions = [{ id: 's1', instrument: 'XAUUSD', entries: [], aiSessionAnalysisResult: { memory: { unresolvedItems: [{ id: 'u1', status: 'resolved' }] } } }];
  const { repo, achievementRows, xpRecords } = fakeRepo({ completions: [], sessions });
  const cfg = { achievementPoints: SERVER_ONLY_ACHIEVEMENT_POINTS };
  const unlockedKeys = new Set();
  const result = await evaluateNewAchievements(repo, 'user-3', { unlockedKeys, cfg, timezone: 'UTC' });
  assert.equal(result.grantedAny, true);
  assert.ok(achievementRows.some((a) => a.achievementKey === FOLLOW_THROUGH_ACHIEVEMENT_KEY));
  assert.ok(!DISCIPLINE_MILESTONES.some((m) => m.key === FOLLOW_THROUGH_ACHIEVEMENT_KEY));
  const awarded = xpRecords.filter((e) => e.type === 'achievement:' + FOLLOW_THROUGH_ACHIEVEMENT_KEY);
  assert.equal(awarded.length, 1);
  assert.equal(awarded[0].points, SERVER_ONLY_ACHIEVEMENT_POINTS.session_analysis_follow_through);

  // Re-running must never double-award.
  const before = xpRecords.length;
  await evaluateNewAchievements(repo, 'user-3', { unlockedKeys, cfg, timezone: 'UTC' });
  assert.equal(xpRecords.length, before);
});

test('firstValidChartInstrumentSession requires an image AND a real note AND a non-empty session instrument', () => {
  const noInstrument = { id: 's1', instrument: '', entries: [{ type: 'chart', hasImage: true, note: 'good setup' }] };
  const noNote = { id: 's2', instrument: 'BTCUSDT', entries: [{ type: 'chart', hasImage: true, note: '   ' }] };
  const noImage = { id: 's3', instrument: 'BTCUSDT', entries: [{ type: 'chart', hasImage: false, note: 'good setup' }] };
  const movementOnly = { id: 's4', instrument: 'BTCUSDT', entries: [{ type: 'movement', hasImage: true, note: 'good setup' }] };
  const valid = { id: 's5', instrument: 'BTCUSDT', entries: [{ type: 'chart', hasImage: true, note: 'good setup' }] };
  assert.equal(firstValidChartInstrumentSession([noInstrument, noNote, noImage, movementOnly]), null);
  assert.equal(firstValidChartInstrumentSession([noInstrument, valid]).id, 's5');
});
