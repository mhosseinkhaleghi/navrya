// Mastery-gate requirements (ARCHITECTURE.md Section 11.13/11.18). XP alone is never sufficient
// to level up - each level also needs a handful of real, server-computed activity requirements,
// so a user can't buy a level with volume alone. Server-only by design (unlike xp-rules.mjs,
// there is no client copy to keep in sync): the gate is always computed here and returned via
// GET /api/users/me/mastery, never trusted from a client-side recomputation.
//
// Level 1 has no gate (every essential capability is unlocked from day one). Domain keys match
// xp-rules.mjs's DOMAIN_BY_TYPE values (session/pattern/strategy/trade/psychology/community) -
// 'session' covers ARCHITECTURE.md's "Preparation/Planning" domain, 'psychology' covers its
// "Psychology & review/Reflection" domain.
//
// Honesty constraint: the original spec also lists Weekly/Monthly Review counts per level, but
// that whole Reports domain (ARCHITECTURE.md Section 11.9) has no existing product surface and
// is explicitly deferred - those specific sub-requirements are omitted here rather than faked,
// the same "insufficient data over fabrication" standard this codebase already applies elsewhere
// (Admin Financial tab, Pattern/Strategy reports).
export const LEVEL_REQUIREMENTS = {
  2: { closedSessions: 2, reviewedTrades: 3, reflections: 2, tradePlans: 1 },
  3: { closedSessions: 5, reviewedTrades: 10, patternsWithThreeStages: 1, reflections: 5 },
  4: { closedSessions: 10, reviewedTrades: 20, completeStrategies: 1, domainXpMin: { psychology: 100 } },
  5: { closedSessions: 20, reviewedTrades: 35, validPatternsWithTwoResolutions: 3 },
  6: { closedSessions: 35, reviewedTrades: 60, patternResolutions: 10, domainMaxPercent: 60 },
  7: {
    closedSessions: 60, reviewedTrades: 100, patternResolutions: 20,
    domainMinPercent: { psychology: 15, session: 15 }, domainMaxPercent: 50
  }
};

function pushIfShort(blockers, requirement, have, need) {
  if (have < need) blockers.push({ requirement, have, need });
}

// Pure function over a pre-built snapshot (mirrors achievement-rules.mjs's minEvidence()
// pattern: this file never reaches into the repo directly, so it stays trivially unit-testable).
// `requirementsTable` defaults to the static LEVEL_REQUIREMENTS above but callers can pass the
// admin-override-merged table from xp-config.mjs instead (routes.profile.mjs does, so an admin's
// edited thresholds actually gate leveling up, not just this module's own hardcoded defaults).
export function blockersForLevel(level, snapshot, requirementsTable) {
  const req = (requirementsTable || LEVEL_REQUIREMENTS)[level];
  if (!req) return [];
  const blockers = [];
  if (req.closedSessions) pushIfShort(blockers, 'closedSessions', snapshot.closedSessions, req.closedSessions);
  if (req.reviewedTrades) pushIfShort(blockers, 'reviewedTrades', snapshot.reviewedTrades, req.reviewedTrades);
  if (req.reflections) pushIfShort(blockers, 'reflections', snapshot.reflections, req.reflections);
  if (req.tradePlans) pushIfShort(blockers, 'tradePlans', snapshot.tradePlans, req.tradePlans);
  if (req.patternsWithThreeStages) pushIfShort(blockers, 'patternsWithThreeStages', snapshot.patternsWithThreeStages, req.patternsWithThreeStages);
  if (req.completeStrategies) pushIfShort(blockers, 'completeStrategies', snapshot.completeStrategies, req.completeStrategies);
  if (req.validPatternsWithTwoResolutions) pushIfShort(blockers, 'validPatternsWithTwoResolutions', snapshot.validPatternsWithTwoResolutions, req.validPatternsWithTwoResolutions);
  if (req.patternResolutions) pushIfShort(blockers, 'patternResolutions', snapshot.patternResolutions, req.patternResolutions);
  if (req.domainXpMin) {
    Object.keys(req.domainXpMin).forEach((domain) => {
      pushIfShort(blockers, 'domainXpMin:' + domain, (snapshot.domainBreakdown || {})[domain] || 0, req.domainXpMin[domain]);
    });
  }
  const xpTotal = snapshot.xpTotal || 0;
  if (req.domainMaxPercent != null && xpTotal > 0) {
    const breakdown = snapshot.domainBreakdown || {};
    Object.keys(breakdown).forEach((domain) => {
      const percent = (breakdown[domain] / xpTotal) * 100;
      if (percent > req.domainMaxPercent) blockers.push({ requirement: 'domainMaxPercent:' + domain, have: Math.round(percent), need: req.domainMaxPercent });
    });
  }
  if (req.domainMinPercent && xpTotal > 0) {
    const breakdown = snapshot.domainBreakdown || {};
    Object.keys(req.domainMinPercent).forEach((domain) => {
      const percent = ((breakdown[domain] || 0) / xpTotal) * 100;
      if (percent < req.domainMinPercent[domain]) blockers.push({ requirement: 'domainMinPercent:' + domain, have: Math.round(percent), need: req.domainMinPercent[domain] });
    });
  }
  return blockers;
}

// Walks level 2..xpLevel, stopping at the first level whose requirements aren't all met yet -
// the "gate" a user's displayed level is clamped to even though their raw XP already qualifies
// for something higher.
export function evaluateGate(xpLevel, snapshot, requirementsTable) {
  let gated = 1;
  for (let level = 2; level <= xpLevel; level += 1) {
    const blockers = blockersForLevel(level, snapshot, requirementsTable);
    if (blockers.length) return { gatedLevel: gated, blockers };
    gated = level;
  }
  return { gatedLevel: gated, blockers: [] };
}
