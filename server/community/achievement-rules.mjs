// Server-side mirror of public/pages/shared/profile-achievements.js's point values, plus the
// minimum evidence shape each achievement requires before it's granted - the client's check()
// functions decide WHEN to submit an unlock, but the server never trusts that submission at
// face value; minEvidence() is the independent re-validation gate.
// level_5_reached / five_day_login_streak are intentionally absent here - they are granted only
// by GET /api/users/me/achievements's server-only checks, never through the client-submitted
// unlock route, so there is nothing for a client to submit evidence for.
export const ACHIEVEMENTS = {
  first_trade_closed: { points: 10, minEvidence: (e) => Array.isArray(e.tradeIds) && e.tradeIds.length >= 1 },
  ten_trades_closed: { points: 30, minEvidence: (e) => Array.isArray(e.tradeIds) && e.tradeIds.length >= 10 },
  fifty_trades_closed: { points: 75, minEvidence: (e) => Array.isArray(e.tradeIds) && e.tradeIds.length >= 50 },
  first_session_completed: { points: 15, minEvidence: (e) => Array.isArray(e.sessionIds) && e.sessionIds.length >= 1 },
  first_listing_published: { points: 25, minEvidence: (e) => Array.isArray(e.listingIds) && e.listingIds.length >= 1 },
  intake_completed: { points: 20, minEvidence: (e) => e.intakeCompleted === true },
  bias_checklist_completed: { points: 15, minEvidence: (e) => Number(e.count) >= 1 },
  first_purchase: { points: 10, minEvidence: (e) => Array.isArray(e.purchaseIds) && e.purchaseIds.length >= 1 },
  // Session milestone bonuses (ARCHITECTURE.md Section 11.4) - sit outside the per-Session XP
  // cap by design, same as every other achievement here.
  ten_sessions_closed: { points: 25, minEvidence: (e) => Array.isArray(e.sessionIds) && e.sessionIds.length >= 10 },
  twenty_five_sessions_closed: { points: 50, minEvidence: (e) => Array.isArray(e.sessionIds) && e.sessionIds.length >= 25 },
  fifty_sessions_closed: { points: 100, minEvidence: (e) => Array.isArray(e.sessionIds) && e.sessionIds.length >= 50 },
  ten_sessions_with_lesson: { points: 40, minEvidence: (e) => Array.isArray(e.sessionIds) && e.sessionIds.length >= 10 }
};
