// AI Analysis Discipline - the Level 1 "Start of the Path" onboarding pair
// (first_session_ai_analysis, first_chart_instrument_added) and the 7-rung AI Analysis
// Discipline streak ladder (session_ai_discipline_3d..365d). Every achievement this module
// grants is server-only (never client-submittable through POST /me/achievements/:key/unlock -
// see routes.profile.mjs) and is evaluated opportunistically on read, the same "recompute on
// read, award via the existing idempotent achievements.unlock() path" shape checkStreaks() and
// the level_5_reached/five_day_login_streak checks already use in this same file's caller.
//
// A qualifying discipline day requires a real session_ai_analysis_completions row (written only
// by routes.internal.mjs's POST /internal/session-analysis-completions, itself only reachable
// from server/pattern-ai-server.mjs after a genuine provider call succeeded - see that route's
// own header comment) whose session was ALSO created on that same calendar day, in the user's
// own stable IANA timezone. Nothing here ever trusts activityLog, a client-submitted evidence
// blob, or a bare client-persisted entry.aiAnalysisResult value as ongoing proof.

export const DISCIPLINE_MILESTONES = [
  { key: 'session_ai_discipline_3d', days: 3 },
  { key: 'session_ai_discipline_7d', days: 7 },
  { key: 'session_ai_discipline_14d', days: 14 },
  { key: 'session_ai_discipline_30d', days: 30 },
  { key: 'session_ai_discipline_90d', days: 90 },
  { key: 'session_ai_discipline_180d', days: 180 },
  { key: 'session_ai_discipline_365d', days: 365 }
];

export const ONBOARDING_ACHIEVEMENT_KEYS = ['first_session_ai_analysis', 'first_chart_instrument_added'];

// Follow-up creative addition #4: a single, one-time "Reflection Quality" achievement - rewards a
// trader who actually engages with the AI's own feedback loop over multiple analyses (an earlier
// open/partially_resolved unresolved item later reported resolved), never a ladder, never
// P&L/profit-adjacent. Low-stakes by design (same trust level as ten_sessions_with_lesson's own
// fateSummary.note check) - reads already-persisted, already-trusted session memory, not the
// security-critical completions ledger, since gaming it nets nothing more than one small bonus.
export const FOLLOW_THROUGH_ACHIEVEMENT_KEY = 'session_analysis_follow_through';

// Follow-up creative addition #1: a Session sitting open this long with zero real AI analysis
// completions is "analysis debt" - a distinct, gentler nudge from the discipline streak itself
// (a broken streak already implies debt; this also flags a FIRST-time straggler before any streak
// exists at all).
const ANALYSIS_DEBT_THRESHOLD_MS = 24 * 60 * 60 * 1000;

// Follow-up creative addition #3: how many of the most recent qualifying days to expose for a
// GitHub-style history heatmap - bounds the GET /me/ai-discipline response instead of returning a
// user's entire lifetime history.
export const HEATMAP_MAX_DAYS = 120;

// Pre-existing trading_sessions.aiSessionAnalysisResult / trading_session_entries.aiAnalysisResult
// data predates this ledger and was never backed by a signed completion receipt - trusted ONLY
// for the one-time first_session_ai_analysis backfill, and ONLY for a Session whose own
// server-set created_at is strictly before this instant (legacyHasAnyAnalysis). The decision is
// deliberately never made from a timestamp inside the analysis payload: that field is client-
// writable through the generic session-sync upsert, so a cutoff check on it would be forgeable.
// Every Session created at or after this instant, and every discipline-streak day, must come
// from the real ledger (brief: "New results after release must use the authoritative completion
// path").
export const LEGACY_BACKFILL_CUTOFF_ISO = '2026-09-18T00:00:00.000Z';

export function isValidTimeZone(timezone) {
  if (!timezone || typeof timezone !== 'string') return false;
  try {
    // eslint-disable-next-line no-new
    new Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch (_) {
    return false;
  }
}

// Resolves a candidate browser timezone to a value safe to persist - never stores an invalid or
// missing zone (brief: "Fall back safely to UTC if unavailable or invalid").
export function resolveTimezone(candidateTimezone) {
  return isValidTimeZone(candidateTimezone) ? candidateTimezone : 'UTC';
}

const dayKeyFormatters = new Map();
function dayKeyFormatter(timezone) {
  if (!dayKeyFormatters.has(timezone)) {
    // en-CA formats as YYYY-MM-DD, which is exactly the calendar-day key this module needs and
    // sorts correctly as a plain string.
    dayKeyFormatters.set(timezone, new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }));
  }
  return dayKeyFormatters.get(timezone);
}

// The calendar-day key (YYYY-MM-DD) `instant` falls on, in `timezone`. Falls back to UTC for an
// invalid/unavailable zone rather than throwing - this is a read-path helper and must never block
// a caller over a bad stored value.
export function dayKeyInTimeZone(instant, timezone) {
  const zone = isValidTimeZone(timezone) ? timezone : 'UTC';
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return dayKeyFormatter(zone).format(date);
  } catch (_) {
    return dayKeyFormatter('UTC').format(date);
  }
}

function dayKeyToUtcMs(dayKey) {
  return new Date(dayKey + 'T00:00:00Z').getTime();
}

// Calendar arithmetic on a YYYY-MM-DD key, done in UTC where there is no DST. Never derive a
// neighbouring LOCAL day by re-formatting a shifted instant in the user's timezone: a key's own
// UTC midnight is a different local day in any zone west of UTC (2026-03-10T00:00Z is still the
// evening of 2026-03-09 in America/New_York), which silently shifts the answer by a whole day.
function addDaysToDayKey(dayKey, days) {
  return new Date(dayKeyToUtcMs(dayKey) + days * 86400000).toISOString().slice(0, 10);
}

// Runs of consecutive calendar days by day-key string - DST-safe since each key is already a
// resolved local calendar date, diffed as whole UTC-midnight days (same approach routes.profile.mjs's
// own checkStreaks() uses for the separate, broader generic streak system).
function computeRuns(sortedDayKeys) {
  const runs = [];
  let prevMs = null;
  sortedDayKeys.forEach((dayKey) => {
    const ms = dayKeyToUtcMs(dayKey);
    if (prevMs != null && ms - prevMs === 86400000) {
      runs[runs.length - 1].end = dayKey;
      runs[runs.length - 1].length += 1;
    } else {
      runs.push({ start: dayKey, end: dayKey, length: 1 });
    }
    prevMs = ms;
  });
  return runs;
}

// Pure streak computation over a set of qualifying day-keys. longestStreak drives permanent
// milestone unlocking (once a run of N ever existed, it stays crossed forever - "a broken streak
// never removes XP, achievements, or levels"); currentStreak is the UI-facing "toward the next
// milestone" number, which resets to 0 once the most recent qualifying day is neither today nor
// yesterday (in `timezone`) - a genuinely broken streak, even though nothing already unlocked is
// revoked. `nowInstant` lets a test pin "today" without mocking the system clock.
export function computeDisciplineStreak(qualifyingDayKeys, timezone, nowInstant) {
  const unique = Array.from(new Set((qualifyingDayKeys || []).filter(Boolean))).sort();
  if (!unique.length) return { qualifyingDayKeys: [], longestStreak: 0, currentStreak: 0, lastQualifyingDay: null };
  const runs = computeRuns(unique);
  const longestStreak = runs.reduce((max, run) => Math.max(max, run.length), 0);
  const lastQualifyingDay = unique[unique.length - 1];
  const lastRun = runs[runs.length - 1];
  const todayKey = dayKeyInTimeZone(nowInstant || new Date(), timezone);
  const yesterdayKey = addDaysToDayKey(todayKey, -1);
  const isActive = lastQualifyingDay === todayKey || lastQualifyingDay === yesterdayKey;
  return { qualifyingDayKeys: unique, longestStreak, currentStreak: isActive ? lastRun.length : 0, lastQualifyingDay };
}

// A ledger completion only counts for its own calendar day when the SAME session it names was
// ALSO created on that day, in `timezone` - "the Session and analysis must be the same Session"
// and "an analysis after midnight for a Session created before midnight does not qualify for
// either day" (brief). sessionsById must contain every session a completion could reference.
export function qualifyingDaysFromCompletions(completions, sessionsById, timezone) {
  const days = [];
  (completions || []).forEach((completion) => {
    const session = sessionsById[completion.sessionId];
    if (!session || !session.createdAt) return;
    const sessionDay = dayKeyInTimeZone(session.createdAt, timezone);
    const analysisDay = dayKeyInTimeZone(completion.occurredAt, timezone);
    if (sessionDay && sessionDay === analysisDay) days.push(sessionDay);
  });
  return days;
}

function sessionHasPersistedAnalysis(session) {
  if (session.aiSessionAnalysisResult) return true;
  return (session.entries || []).some((entry) => entry && entry.aiAnalysisResult);
}

// One-time backfill for genuinely pre-existing usage, decided ONLY from server-controlled facts:
// the Session's own created_at (a DB default the client can never write, immutable) must predate
// the release cutoff AND the Session must already carry a persisted analysis. It deliberately
// never reads a timestamp out of the analysis payload - that is client-writable through the
// generic session-sync upsert, so a cutoff test on it would be forgeable by writing an older
// date. This grants only the one-time first_session_ai_analysis bonus. The discipline streak is
// never backfilled: same-day linkage of pre-ledger data cannot be established safely, so streak
// days come exclusively from real ledger completions.
export function legacyHasAnyAnalysis(sessions, cutoffIso) {
  const cutoffMs = new Date(cutoffIso || LEGACY_BACKFILL_CUTOFF_ISO).getTime();
  return (sessions || []).some((session) => {
    if (!session.createdAt) return false;
    const createdMs = new Date(session.createdAt).getTime();
    return Number.isFinite(createdMs) && createdMs < cutoffMs && sessionHasPersistedAnalysis(session);
  });
}

// The first valid chart entry (a real image plus a real, non-blank note) on a Session that
// already carries a non-empty instrument - deliberately never the dormant analysisSymbols
// domain (no real trader-facing flow exists for it - see routes.analysis-symbols.mjs's own
// callers), and never restricted to the session's own creation order.
export function firstValidChartInstrumentSession(sessions) {
  return (sessions || []).find((session) => {
    if (!session.instrument || !String(session.instrument).trim()) return false;
    return (session.entries || []).some((entry) => entry && entry.type === 'chart' && entry.hasImage && entry.note && String(entry.note).trim());
  }) || null;
}

// Follow-up creative addition #2: how many of the last 7 calendar days (in `timezone`, inclusive
// of today) already qualify - a rolling weekly consistency signal, distinct from the streak's own
// "must be unbroken" requirement, so a trader who deliberately rests one day still sees an honest
// "5 of 7" rather than a discouraging blank state.
export function weeklyConsistency(qualifyingDayKeys, timezone, nowInstant) {
  const qualifying = new Set(qualifyingDayKeys || []);
  const todayKey = dayKeyInTimeZone(nowInstant || new Date(), timezone);
  let qualifiedDays = 0;
  for (let i = 0; i < 7; i += 1) {
    if (qualifying.has(addDaysToDayKey(todayKey, -i))) qualifiedDays += 1;
  }
  return { qualifiedDays, totalDays: 7 };
}

// Follow-up creative addition #1: the oldest still-open Session with zero real AI analysis
// completions ever recorded against it, more than 24h old. Never flags a closed Session (already
// done, nothing to nudge) and never looks at P&L/instrument/anything profit-adjacent - purely
// "you started this, you have not analyzed it yet."
export function findAnalysisDebtSession(sessions, completions, nowInstant) {
  const analyzedSessionIds = new Set((completions || []).map((c) => c.sessionId));
  const nowMs = (nowInstant instanceof Date ? nowInstant : new Date(nowInstant || Date.now())).getTime();
  const candidates = (sessions || [])
    .filter((s) => s.status === 'open' && s.createdAt && !analyzedSessionIds.has(s.id))
    .filter((s) => nowMs - new Date(s.createdAt).getTime() >= ANALYSIS_DEBT_THRESHOLD_MS)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  if (!candidates.length) return null;
  const oldest = candidates[0];
  const ageHours = Math.floor((nowMs - new Date(oldest.createdAt).getTime()) / (60 * 60 * 1000));
  return { sessionId: oldest.id, name: oldest.name || null, market: oldest.market || null, instrument: oldest.instrument || null, ageHours };
}

// Follow-up creative addition #4: has this user ever had a Session where the AI's own compact
// memory later reported a previously-tracked unresolved item as genuinely resolved - real
// engagement with the feedback loop across more than one analysis, not just running one.
export function hasFollowThroughSession(sessions) {
  return (sessions || []).some((session) => {
    const items = session.aiSessionAnalysisResult && session.aiSessionAnalysisResult.memory && session.aiSessionAnalysisResult.memory.unresolvedItems;
    return Array.isArray(items) && items.some((item) => item && item.status === 'resolved');
  });
}

// Resolves (and, on first use, persists) the one stable IANA timezone this user's discipline
// track is bucketed in. Never re-resolves once a row exists, so a later browser timezone change
// can never re-bucket past days.
export async function ensureDisciplineTimezone(repo, userId, candidateTimezone) {
  return repo.disciplineSettings.ensure(userId, resolveTimezone(candidateTimezone));
}

// The one orchestrator both GET /me/achievements (opportunistic unlock, same shape as
// level_5_reached/five_day_login_streak) and GET /me/ai-discipline (read-mostly progress display)
// call. Mutates `unlockedKeys` in place as it grants, and returns the resolved streak snapshot so
// a caller never has to recompute it a second time in the same request.
export async function evaluateNewAchievements(repo, userId, { unlockedKeys, cfg, timezone }) {
  const [completions, sessions] = await Promise.all([
    repo.sessionAiAnalysisCompletions.listForUser(userId),
    repo.tradingSessions.listByUser(userId)
  ]);
  const sessionsById = {};
  sessions.forEach((session) => { sessionsById[session.id] = session; });

  let grantedAny = false;
  async function grant(key, evidence) {
    if (unlockedKeys.has(key)) return;
    await repo.achievements.unlock({ userId, achievementKey: key, evidence });
    const points = cfg.achievementPoints[key];
    if (points > 0) {
      await repo.xpEvents.record({ userId, type: 'achievement:' + key, domain: null, points, sourceType: null, sourceId: null, dedupeKey: null, meta: { achievementKey: key } });
    }
    unlockedKeys.add(key);
    grantedAny = true;
  }

  // Onboarding 1: first real, persisted AI analysis for ANY owned Session - deliberately never
  // required to be the user's chronologically oldest Session (brief).
  if (!unlockedKeys.has('first_session_ai_analysis')) {
    if (completions.length) {
      const first = completions[0]; // listForUser() is occurredAt ASC
      await grant('first_session_ai_analysis', { sessionId: first.sessionId, analysisId: first.analysisId, source: 'ledger' });
    } else if (legacyHasAnyAnalysis(sessions)) {
      await grant('first_session_ai_analysis', { source: 'backfill' });
    }
  }

  // Onboarding 2: first valid chart entry (image + note) on a Session with a non-empty instrument.
  if (!unlockedKeys.has('first_chart_instrument_added')) {
    const match = firstValidChartInstrumentSession(sessions);
    if (match) await grant('first_chart_instrument_added', { sessionId: match.id });
  }

  // Follow-up #4: Reflection Quality - a single, one-time bonus (never part of the ladder).
  if (!unlockedKeys.has(FOLLOW_THROUGH_ACHIEVEMENT_KEY) && hasFollowThroughSession(sessions)) {
    await grant(FOLLOW_THROUGH_ACHIEVEMENT_KEY, {});
  }

  // AI Analysis Discipline ladder - qualifying days come ONLY from the real, gateway-recorded
  // ledger. Legacy (pre-ledger) session data never feeds the streak (see legacyHasAnyAnalysis).
  const qualifyingDays = qualifyingDaysFromCompletions(completions, sessionsById, timezone);
  const streak = computeDisciplineStreak(qualifyingDays, timezone);
  for (const milestone of DISCIPLINE_MILESTONES) {
    if (streak.longestStreak >= milestone.days) await grant(milestone.key, { streakDays: milestone.days, timezone });
  }

  // Follow-ups #1/#2: read-only insights for GET /me/ai-discipline, computed here so a caller
  // never has to re-fetch/re-derive sessions/completions/qualifying-days a second time.
  const analysisDebt = findAnalysisDebtSession(sessions, completions);
  const weekly = weeklyConsistency(qualifyingDays, timezone);

  return { grantedAny, streak, analysisDebt, weeklyConsistency: weekly };
}
