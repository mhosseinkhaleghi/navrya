import express from 'express';
import { ApiError, asyncHandler } from './errors.mjs';
import { ONCE_PER_USER_TYPES, DOMAIN_BY_TYPE, levelForXp } from './xp-rules.mjs';
import { ACHIEVEMENTS } from './achievement-rules.mjs';
import { evaluateGate } from './mastery-rules.mjs';
import { getEffectiveXpConfig } from './xp-config.mjs';

// ONCE_PER_USER_TYPES and DOMAIN_BY_TYPE stay static imports on purpose - which domain a type
// belongs to, and which types are one-time-ever, are structural decisions (Section 11's admin
// panel lets an admin retune every NUMBER - points, caps, mastery thresholds - never invent new
// domains/structure). Everything with an editable NUMBER comes from getEffectiveXpConfig(repo)
// instead, per-request, merging these same xp-rules.mjs/mastery-rules.mjs/achievement-rules.mjs
// defaults with any admin override (server/community/xp-config.mjs).

const PROFILE_ROLES = ['trader', 'mentor', 'teacher'];

// "Useful activity" types that count toward a login/activity streak (ARCHITECTURE.md Section
// 11.12). Weekly Review isn't in this list - that whole Reports domain is deferred (Section
// 11.9), so streak eligibility uses the closest real substitutes: closing a session with a real
// summary, a reviewed/reflected-on trade, a weekly psychology check-in, or completing a
// Pattern/Strategy.
const STREAK_ELIGIBLE_TYPES = [
  'session_closed_with_summary', 'trade_closed_with_pnl', 'trade_post_review_completed',
  'psych_post_trade_reflection', 'psych_weekly_checkin', 'pattern_created', 'strategy_created'
];

function profileView(user, extra) {
  return {
    id: user.id, displayName: user.displayName, email: user.email, emailVerified: user.emailVerified,
    phone: user.phone, phoneVerified: user.phoneVerified, profileRole: user.profileRole, kycStatus: user.kycStatus,
    avatarDataUrl: user.avatarDataUrl, xpTotal: user.xpTotal, level: levelForXp(user.xpTotal),
    createdAt: user.createdAt, hoursOnline: (extra && extra.hoursOnline) || 0
  };
}

// day/week boundaries computed in UTC - a documented simplification, same spirit as this app's
// existing UTC-based trading-session-detection known constraint (ARCHITECTURE.md Section 10).
function periodStart(period) {
  const now = new Date();
  if (period === 'week') {
    const daysSinceMonday = (now.getUTCDay() + 6) % 7;
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysSinceMonday));
  }
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// One repo lookup per sourceType, always scoped by (userId, id) so a record belonging to another
// user simply doesn't come back - "exists" and "owned by this caller" collapse into one check.
const SOURCE_VERIFIERS = {
  session: (repo, userId, id) => repo.tradingSessions.get(userId, id),
  pattern: (repo, userId, id) => repo.patterns.get(userId, id),
  strategy: (repo, userId, id) => repo.strategies.get(userId, id),
  trade: (repo, userId, id) => repo.trades.get(userId, id)
};

// Per-type extra state assertions beyond plain existence/ownership. Deliberately small: deep
// nested-field validation (e.g. recomputing a session scenario's completeness percentage
// server-side) is out of scope for this pass - the client's computed signal is trusted at that
// granularity, the same trust level this codebase already extends to lots of derived UI state.
const STATE_CHECKS = {
  session_closed_with_summary: (record) => record.status === 'closed' && !!(record.fateSummary && record.fateSummary.note),
  trade_closed_with_pnl: (record) => record.status === 'closed' && record.exitPrice != null && record.pnl != null
};

async function verifySourceAndState(repo, userId, type, sourceType, sourceId) {
  // trade_post_review_completed / psych_post_trade_reflection are both real, but the "review"
  // itself lives in the Mental Health profile (PostTradeReflection), not on the Trade record -
  // verify both: the trade is real/owned, and a matching reflection actually exists.
  if (type === 'trade_post_review_completed' || type === 'psych_post_trade_reflection') {
    if (!sourceId) throw new ApiError(400, 'MISSING_SOURCE_ID');
    const trade = await repo.trades.get(userId, sourceId);
    if (!trade) throw new ApiError(404, 'SOURCE_NOT_FOUND');
    const profile = await repo.mentalHealthProfile.get(userId);
    const reflections = (profile && profile.continuousTracking && profile.continuousTracking.postTradeReflections) || [];
    if (!reflections.some((entry) => entry.tradeId === sourceId)) throw new ApiError(409, 'REFLECTION_NOT_FOUND');
    return;
  }
  if (!sourceType || !SOURCE_VERIFIERS[sourceType]) return; // nothing server-verifiable for this type
  if (!sourceId) throw new ApiError(400, 'MISSING_SOURCE_ID');
  const record = await SOURCE_VERIFIERS[sourceType](repo, userId, sourceId);
  if (!record) throw new ApiError(404, 'SOURCE_NOT_FOUND');
  const stateCheck = STATE_CHECKS[type];
  if (stateCheck && !stateCheck(record)) throw new ApiError(409, 'STATE_NOT_ELIGIBLE');
  // pattern_report_generated assumes a real 5-sample minimum (ARCHITECTURE.md Section 11.5) -
  // that gate doesn't exist in the Pattern Registry's own data model, so it's introduced here,
  // verified against the real, already-indexed trading_session_scenarios.pattern_tag_id column
  // (Section 7.18 Module 1 anticipated exactly this) rather than trusting the client's own count.
  if (type === 'pattern_report_generated') {
    const sampleCount = await repo.tradingSessions.countScenariosForPattern(userId, sourceId);
    if (sampleCount < 5) throw new ApiError(409, 'INSUFFICIENT_SAMPLES');
  }
}

function weekBucket(dateStr) {
  const days = Math.floor(new Date(dateStr + 'T00:00:00Z').getTime() / 86400000);
  return Math.floor(days / 7); // 7-day buckets from the Unix epoch - a documented simplification, not calendar ISO weeks
}

// Opportunistic streak check (same "recompute on read, award via the normal idempotent path"
// shape as the existing five_day_login_streak achievement check below). Streak dedupe keys are
// scoped to a specific run/window, so a later, fresh qualifying streak can pay again - unlike a
// one-time achievement, this is allowed to repeat over time (ARCHITECTURE.md Section 11.12).
async function checkStreaks(repo, userId, cfg) {
  const days = await repo.xpEvents.usefulActivityDays(userId, STREAK_ELIGIBLE_TYPES);
  const uniqueSorted = Array.from(new Set(days.map((d) => (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10)))).sort();
  if (!uniqueSorted.length) return;

  const runs = [];
  let prevTime = null;
  uniqueSorted.forEach((dateStr) => {
    const time = new Date(dateStr + 'T00:00:00Z').getTime();
    if (prevTime != null && time - prevTime === 86400000) { runs[runs.length - 1].end = dateStr; runs[runs.length - 1].length += 1; }
    else runs.push({ start: dateStr, end: dateStr, length: 1 });
    prevTime = time;
  });
  const longestRun = runs.reduce((run, candidate) => (candidate.length > run.length ? candidate : run), runs[0]);

  const awards = [];
  if (longestRun.length >= 3) { const run = runs.find((r) => r.length >= 3); awards.push({ type: 'streak_3day', dedupeKey: 'streak.3day:' + run.start }); }
  if (longestRun.length >= 5) { const run = runs.find((r) => r.length >= 5); awards.push({ type: 'streak_5day', dedupeKey: 'streak.5day:' + run.start }); }
  if (longestRun.length >= 7) { const run = runs.find((r) => r.length >= 7); awards.push({ type: 'streak_7day', dedupeKey: 'streak.7day:' + run.start }); }
  if (uniqueSorted.length >= 30) awards.push({ type: 'streak_30day', dedupeKey: 'streak.30day:' + Math.floor(uniqueSorted.length / 30) });
  const distinctWeeks = new Set(uniqueSorted.map(weekBucket)).size;
  if (distinctWeeks >= 4) awards.push({ type: 'streak_4week', dedupeKey: 'streak.4week:' + Math.floor(distinctWeeks / 4) });

  for (const award of awards) {
    await repo.xpEvents.record({
      userId, type: award.type, domain: null, points: cfg.points[award.type],
      sourceType: null, sourceId: null, dedupeKey: award.dedupeKey, meta: {}
    });
  }
}

async function buildMasterySnapshot(repo, userId, xpTotal) {
  const [sessions, domainBreakdown, reviewedTrades, reflections, tradePlans, patternsWithThreeStages,
    completeStrategyIds, patternOutcomeCounts] = await Promise.all([
    repo.tradingSessions.listByUser(userId),
    repo.xpEvents.domainBreakdown(userId),
    repo.xpEvents.countByType(userId, 'trade_post_review_completed'),
    repo.xpEvents.countByType(userId, 'psych_post_trade_reflection'),
    repo.xpEvents.countByType(userId, 'trade_plan_created'),
    repo.xpEvents.countByType(userId, 'pattern_created'),
    repo.xpEvents.sourceIdsWithAllTypes(userId, ['strategy_position_management_completed', 'strategy_risk_management_completed', 'strategy_overall_framework_completed']),
    repo.xpEvents.sourceCountsForType(userId, 'pattern_outcome_recorded')
  ]);
  return {
    closedSessions: sessions.filter((session) => session.status === 'closed').length,
    reviewedTrades, reflections, tradePlans, patternsWithThreeStages,
    completeStrategies: completeStrategyIds.length,
    validPatternsWithTwoResolutions: patternOutcomeCounts.filter((row) => row.count >= 2).length,
    patternResolutions: patternOutcomeCounts.reduce((sum, row) => sum + row.count, 0),
    domainBreakdown, xpTotal
  };
}

// Mounted at /api/users, alongside routes.users.mjs's protectedRouter (after devUserAuth, same
// as every other protected route). Every path here has two segments after /users
// (/me/profile, /me/xp-events, ...), so none of them can ever collide with routes.users.mjs's
// single-segment GET /:id - Express simply never matches a two-segment path against that
// pattern, so mount order relative to it doesn't matter.
export function router(repo) {
  const app = express.Router();

  app.get('/me/profile', asyncHandler(async (req, res) => {
    try {
      const cfg = await getEffectiveXpConfig(repo);
      await checkStreaks(repo, req.currentUser.id, cfg);
    } catch (_) { /* best-effort, never block profile load */ }
    const fresh = (await repo.users.get(req.currentUser.id)) || req.currentUser;
    const hoursOnline = await repo.sessions.hoursOnlineFor(fresh.id);
    res.json(profileView(fresh, { hoursOnline }));
  }));

  app.patch('/me/profile', asyncHandler(async (req, res) => {
    const body = req.body || {};
    const patch = {};
    if ('displayName' in body) {
      const trimmed = String(body.displayName || '').trim();
      if (!trimmed) throw new ApiError(400, 'VALIDATION_FAILED');
      patch.displayName = trimmed;
    }
    if ('email' in body) patch.email = body.email ? String(body.email).trim() : null;
    if ('phone' in body) patch.phone = body.phone ? String(body.phone).trim() : null;
    if ('profileRole' in body) {
      if (!PROFILE_ROLES.includes(body.profileRole)) throw new ApiError(400, 'VALIDATION_FAILED');
      patch.profileRole = body.profileRole;
    }
    if ('avatarDataUrl' in body) patch.avatarDataUrl = body.avatarDataUrl || null;
    // kycStatus/xpTotal/role are never read from the body at all here - not merely stripped,
    // never looked at - and repo.users.updateProfile()'s own SQL/patch handling structurally
    // cannot write those columns either way. Two independent layers, not one.
    const updated = await repo.users.updateProfile(req.currentUser.id, patch);
    const hoursOnline = await repo.sessions.hoursOnlineFor(updated.id);
    res.json(profileView(updated, { hoursOnline }));
  }));

  app.get('/me/xp-events', asyncHandler(async (req, res) => {
    res.json(await repo.xpEvents.listForUser(req.currentUser.id));
  }));

  // Phase 8c of the local-first-to-server-authoritative migration (see ARCHITECTURE.md's Known
  // Constraints section) - the user-facing read side of the SAME ai_usage_events table
  // POST /api/users/usage-report (routes.users.mjs) already writes to on every real AI call.
  // Reconciliation, not a second usage ledger: repo.usageEvents.summaryForUser() is a pure
  // aggregation query over those existing rows.
  app.get('/me/usage', asyncHandler(async (req, res) => {
    res.json(await repo.usageEvents.summaryForUser(req.currentUser.id));
  }));

  // Real, per-model $ cost/charge for the signed-in user's own AI usage (task D.1) - gateway-
  // origin only (aggregateByModelForUser's default), so this is authoritative real cost, never
  // the client's own untrusted self-reported token counts from /me/usage above.
  app.get('/me/ai-usage-by-model', asyncHandler(async (req, res) => {
    const days = req.query.days ? Math.min(365, Math.max(1, Number(req.query.days) || 30)) : null;
    const since = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString() : undefined;
    const byModel = await repo.usageEvents.aggregateByModelForUser(req.currentUser.id, { since });
    res.json({ byModel, days });
  }));

  // The client sends only the event's identity (type, sourceType/sourceId, dedupeKey) - never a
  // points value. Every award is looked up from POINTS_BY_TYPE, re-verified against the real
  // owning record when one exists, deduplicated, and capped, all server-side.
  app.post('/me/xp-events', asyncHandler(async (req, res) => {
    const body = req.body || {};
    const type = String(body.type || '');
    const sourceType = body.sourceType ? String(body.sourceType) : null;
    const sourceId = body.sourceId ? String(body.sourceId) : null;
    const dedupeKey = body.dedupeKey ? String(body.dedupeKey) : null;
    const userId = req.currentUser.id;
    const cfg = await getEffectiveXpConfig(repo);
    if (!(type in cfg.points)) throw new ApiError(400, 'INVALID_XP_TYPE');

    await verifySourceAndState(repo, userId, type, sourceType, sourceId);

    if (ONCE_PER_USER_TYPES.includes(type) && await repo.xpEvents.hasType(userId, type)) {
      return res.json({ skipped: true, reason: 'already_awarded' });
    }

    let points = cfg.points[type];
    const domain = DOMAIN_BY_TYPE[type] || null;

    if (cfg.sourceCaps[type] != null) {
      if (!sourceId) throw new ApiError(400, 'MISSING_SOURCE_ID');
      const count = await repo.xpEvents.countForSource(userId, type, sourceId);
      if (count >= cfg.sourceCaps[type]) return res.json({ skipped: true, reason: 'source_cap' });
    }

    if (cfg.periodCaps[type]) {
      const cap = cfg.periodCaps[type];
      const count = await repo.xpEvents.countForPeriod(userId, type, periodStart(cap.period));
      if (count >= cap.max) return res.json({ skipped: true, reason: 'period_cap' });
    }

    // Daily caps only apply to recurring, domain-tagged events - one-time bonuses are exempt
    // (ARCHITECTURE.md Section 11.15); achievement/streak awards never reach this route at all.
    if (!ONCE_PER_USER_TYPES.includes(type) && domain) {
      const domainCap = cfg.domainCaps[domain];
      if (domainCap != null) {
        const domainToday = await repo.xpEvents.domainTotalToday(userId, domain);
        if (domainToday >= domainCap) return res.json({ skipped: true, reason: 'domain_daily_cap' });
        points = Math.min(points, domainCap - domainToday);
      }
      const recurringToday = await repo.xpEvents.recurringTotalToday(userId, ONCE_PER_USER_TYPES);
      if (recurringToday >= cfg.recurringCap) return res.json({ skipped: true, reason: 'recurring_daily_cap' });
      points = Math.min(points, cfg.recurringCap - recurringToday);
    }

    if (sourceType && cfg.sourceTotalCaps[sourceType] != null && sourceId) {
      const sourceTotal = await repo.xpEvents.sourceTotal(userId, sourceType, sourceId);
      const headroom = cfg.sourceTotalCaps[sourceType] - sourceTotal;
      if (headroom <= 0) return res.json({ skipped: true, reason: 'source_total_cap' });
      points = Math.min(points, headroom);
    }

    if (points <= 0) return res.json({ skipped: true, reason: 'no_headroom' });

    const result = await repo.xpEvents.record({ userId, type, domain, points, sourceType, sourceId, dedupeKey, meta: body.meta || {} });
    if (result.duplicate) return res.json({ skipped: true, reason: 'duplicate' });
    res.status(201).json({ event: result.event, xpTotal: result.user.xpTotal, level: levelForXp(result.user.xpTotal) });
  }));

  // Server-computed mastery gate (ARCHITECTURE.md Section 11.13/11.18) - never trust a
  // client-side recomputation of "am I allowed to level up".
  app.get('/me/mastery', asyncHandler(async (req, res) => {
    const userId = req.currentUser.id;
    const cfg = await getEffectiveXpConfig(repo);
    const user = await repo.users.get(userId);
    const xpLevel = levelForXp(user.xpTotal);
    const snapshot = await buildMasterySnapshot(repo, userId, user.xpTotal);
    const gate = evaluateGate(xpLevel, snapshot, cfg.masteryRequirements);
    res.json({ xpLevel, gatedLevel: gate.gatedLevel, blockers: gate.blockers });
  }));

  app.get('/me/achievements', asyncHandler(async (req, res) => {
    const userId = req.currentUser.id;
    const cfg = await getEffectiveXpConfig(repo);
    const existing = await repo.achievements.listForUser(userId);
    const unlockedKeys = new Set(existing.map((a) => a.achievementKey));
    let grantedAny = false;

    if (!unlockedKeys.has('level_5_reached') && levelForXp(req.currentUser.xpTotal) >= 5) {
      await repo.achievements.unlock({ userId, achievementKey: 'level_5_reached', evidence: { xpTotal: req.currentUser.xpTotal } });
      const points = cfg.achievementPoints.level_5_reached;
      if (points > 0) await repo.xpEvents.record({ userId, type: 'achievement:level_5_reached', points, meta: { xpTotal: req.currentUser.xpTotal } });
      grantedAny = true;
    }
    if (!unlockedKeys.has('five_day_login_streak')) {
      const streak = await repo.sessions.consecutiveLoginDays(userId);
      if (streak >= 5) {
        await repo.achievements.unlock({ userId, achievementKey: 'five_day_login_streak', evidence: { consecutiveDays: streak } });
        await repo.xpEvents.record({ userId, type: 'achievement:five_day_login_streak', points: cfg.achievementPoints.five_day_login_streak, meta: { consecutiveDays: streak } });
        grantedAny = true;
      }
    }

    res.json(grantedAny ? await repo.achievements.listForUser(userId) : existing);
  }));

  app.post('/me/achievements/:key/unlock', asyncHandler(async (req, res) => {
    const key = req.params.key;
    const rule = ACHIEVEMENTS[key];
    if (!rule) throw new ApiError(400, 'INVALID_ACHIEVEMENT');
    const evidence = (req.body && req.body.evidence) || {};
    if (!rule.minEvidence(evidence)) throw new ApiError(400, 'INSUFFICIENT_EVIDENCE');
    const cfg = await getEffectiveXpConfig(repo);
    const points = cfg.achievementPoints[key] ?? rule.points;
    const result = await repo.achievements.unlock({ userId: req.currentUser.id, achievementKey: key, evidence });
    if (result.created && points > 0) {
      await repo.xpEvents.record({ userId: req.currentUser.id, type: 'achievement:' + key, points, meta: { achievementKey: key } });
    }
    res.status(result.created ? 201 : 200).json(result.achievement);
  }));

  app.get('/me/subscriptions', asyncHandler(async (req, res) => {
    const purchases = await repo.purchases.listByBuyer(req.currentUser.id);
    const withListings = await Promise.all(purchases.map(async (purchase) => ({ purchase, listing: await repo.listings.get(purchase.listingId) })));
    res.json(
      withListings
        .filter((row) => row.listing && row.listing.type === 'subscription')
        .map((row) => ({ ...row.purchase, listing: row.listing }))
    );
  }));

  return app;
}
