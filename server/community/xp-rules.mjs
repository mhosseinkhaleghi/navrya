// Server-side copy of public/pages/shared/profile-xp-rules.js's canonical XP/level/domain/cap
// definition. A browser file can't be imported by Node without a build step, so these two files
// are kept byte-identical by hand, enforced by tests/account-profile-xp-rules-sync.test.mjs. Edit
// both together, or that test fails loudly. This is the copy routes.profile.mjs actually validates
// against - the client's own numbers (and, as of the XP engine rewrite, its own `points` field
// entirely) are never trusted.
export const LEVEL_THRESHOLDS = [0, 100, 300, 700, 1500, 3000, 6000]; // index 0..6 = level 1..7

// session_closed/trade_closed are kept at their original values for historical rows already in
// user_xp_events (pre-engine data) but are no longer emitted by the client - session_closed_with_summary
// and trade_closed_with_pnl supersede them with real server-side ownership/state verification.
export const POINTS_BY_TYPE = {
  // Onboarding (all ONCE_PER_USER_TYPES)
  intake_completed: 15, profile_completed: 10, walkthrough_completed: 5,
  first_session_bonus: 10, first_trade_bonus: 10, first_pattern_bonus: 15, first_strategy_bonus: 20,
  // Session
  session_created: 2, session_chart_entry_added: 2, session_movement_entry_added: 2,
  session_scenario_created: 3, session_probability_updated: 1, session_pattern_linked: 2,
  session_execution_plan_recorded: 3, session_fate_recorded: 5, session_closed_with_summary: 8,
  session_closed: 10,
  // Pattern
  pattern_created: 10, pattern_screenshot_added: 2, pattern_used_in_scenario: 2,
  pattern_outcome_recorded: 3, pattern_report_generated: 10, pattern_revised_after_report: 5,
  pattern_published: 8, pattern_evidence_refreshed: 2,
  // Strategy
  strategy_created: 5, strategy_position_management_completed: 8, strategy_risk_management_completed: 8,
  strategy_overall_framework_completed: 6, strategy_attachment_added: 1, strategy_linked_to_trade: 2,
  strategy_detection_recorded: 2, strategy_detection_resolved: 3, strategy_revisited_after_trades: 10,
  strategy_rules_revised: 6, strategy_published: 10,
  // Trade
  trade_plan_created: 5, trade_calculation_valid: 2, trade_linked: 2, trade_opened_from_hunting: 2,
  trade_mid_emotion_logged: 3, trade_screenshot_added: 1, trade_closed_with_pnl: 4,
  trade_post_review_completed: 6, trade_closed: 5,
  // Psychology
  psych_checkin: 2, psych_post_trade_reflection: 4, psych_weekly_checkin: 8,
  psych_monthly_bias_checklist: 15, psych_thought_or_trigger: 5, psych_education_card_response: 2,
  // Community
  community_post_published: 3, listing_rated_with_review: 3, seller_rating_received: 2, listing_published: 20,
  // Streaks (own dedupe-by-period, never trusted from the client, exempt from daily caps)
  streak_3day: 10, streak_5day: 25, streak_7day: 40, streak_4week: 75, streak_30day: 100
};

export const ONCE_PER_USER_TYPES = [
  'intake_completed', 'profile_completed', 'walkthrough_completed',
  'first_session_bonus', 'first_trade_bonus', 'first_pattern_bonus', 'first_strategy_bonus'
]; // the server no-ops a repeat of these, never double-awards

// Every scorable type belongs to exactly one of the six XP domains (ARCHITECTURE.md Section 11.2).
// Streak types are deliberately absent - they're cross-cutting, not attributable to one domain,
// and excluded from domainBreakdown()/domain-balance math on purpose.
export const DOMAIN_BY_TYPE = {
  intake_completed: 'session', profile_completed: 'session', walkthrough_completed: 'session',
  first_session_bonus: 'session', first_trade_bonus: 'trade', first_pattern_bonus: 'pattern', first_strategy_bonus: 'strategy',
  session_created: 'session', session_chart_entry_added: 'session', session_movement_entry_added: 'session',
  session_scenario_created: 'session', session_probability_updated: 'session', session_pattern_linked: 'session',
  session_execution_plan_recorded: 'session', session_fate_recorded: 'session', session_closed_with_summary: 'session',
  session_closed: 'session',
  pattern_created: 'pattern', pattern_screenshot_added: 'pattern', pattern_used_in_scenario: 'pattern',
  pattern_outcome_recorded: 'pattern', pattern_report_generated: 'pattern', pattern_revised_after_report: 'pattern',
  pattern_published: 'pattern', pattern_evidence_refreshed: 'pattern',
  strategy_created: 'strategy', strategy_position_management_completed: 'strategy', strategy_risk_management_completed: 'strategy',
  strategy_overall_framework_completed: 'strategy', strategy_attachment_added: 'strategy', strategy_linked_to_trade: 'strategy',
  strategy_detection_recorded: 'strategy', strategy_detection_resolved: 'strategy', strategy_revisited_after_trades: 'strategy',
  strategy_rules_revised: 'strategy', strategy_published: 'strategy',
  trade_plan_created: 'trade', trade_calculation_valid: 'trade', trade_linked: 'trade', trade_opened_from_hunting: 'trade',
  trade_mid_emotion_logged: 'trade', trade_screenshot_added: 'trade', trade_closed_with_pnl: 'trade',
  trade_post_review_completed: 'trade', trade_closed: 'trade',
  psych_checkin: 'psychology', psych_post_trade_reflection: 'psychology', psych_weekly_checkin: 'psychology',
  psych_monthly_bias_checklist: 'psychology', psych_thought_or_trigger: 'psychology', psych_education_card_response: 'psychology',
  community_post_published: 'community', listing_rated_with_review: 'community', seller_rating_received: 'community',
  listing_published: 'community'
};

// Max count of a type's dedupe instances counted against one sourceId (e.g. at most 3
// chart-entry awards per session). Enforced server-side via repo.xpEvents.countForSource().
export const PER_SOURCE_MAX = {
  session_chart_entry_added: 3, session_movement_entry_added: 3, session_scenario_created: 3,
  session_probability_updated: 3, session_pattern_linked: 3, session_execution_plan_recorded: 2,
  pattern_screenshot_added: 3, strategy_attachment_added: 3, trade_screenshot_added: 2
};

// Max count of a type per rolling period (day/week), independent of sourceId.
export const PER_TYPE_PERIOD_CAP = {
  psych_checkin: { max: 2, period: 'day' },
  psych_thought_or_trigger: { max: 2, period: 'week' },
  psych_education_card_response: { max: 3, period: 'week' },
  community_post_published: { max: 2, period: 'week' }
};

export const DOMAIN_DAILY_CAP = { session: 35, trade: 40, psychology: 20, community: 5 };
export const RECURRING_DAILY_CAP_TOTAL = 80;

// Running sum of every event tagged with this sourceType+sourceId is clamped to this ceiling
// (e.g. all trade_* events tagged to one tradeId sum to at most 18 points, ever).
export const SOURCE_TOTAL_CAP = { trade: 18, session: 30 };

export function levelForXp(xp) {
  const value = Number(xp) || 0;
  let level = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) { if (value >= LEVEL_THRESHOLDS[i]) level = i + 1; }
  return level;
}

export function xpForNextLevel(xp) {
  const level = levelForXp(xp);
  return level >= LEVEL_THRESHOLDS.length ? null : LEVEL_THRESHOLDS[level];
}
