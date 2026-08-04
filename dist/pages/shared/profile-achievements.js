(function () {
  'use strict';
  // Achievement definitions - one canonical client-side place, mirrors
  // mental-health-collector.js's discipline: every unlock always carries real evidence (trade/
  // purchase/listing IDs or a real count), never granted speculatively. check(snapshot) returns
  // evidence (truthy) when earned, or null otherwise. `snapshot` is a small, pre-aggregated
  // object built by account-profile-store.js from the real stores (TradeJournalTradeStore, the
  // community store, the mental health store, character session stores) - this file never
  // reaches into global stores directly, so it stays trivially unit-testable in isolation.
  function idOf(record) { return record && record.id; }

  // labelKey is the suffix used to look up 'ach' + labelKey + 'Title'/'Desc' in
  // account-profile-i18n.js - the single place achievement display text is translated. Kept on
  // the definition itself (not a second parallel map in account-profile-ui.js) so
  // account-profile-store.js's nextGoal() (below) and the achievements tab UI both read the same
  // source instead of drifting.
  var DEFINITIONS = [
    { key: 'first_trade_closed', points: 10, labelKey: 'FirstTradeClosed', check: function (s) {
      var ids = (s.closedTrades || []).map(idOf);
      return ids.length >= 1 ? { tradeIds: ids.slice(0, 1) } : null;
    } },
    { key: 'ten_trades_closed', points: 30, labelKey: 'TenTradesClosed', check: function (s) {
      var ids = (s.closedTrades || []).map(idOf);
      return ids.length >= 10 ? { tradeIds: ids.slice(0, 10) } : null;
    } },
    { key: 'fifty_trades_closed', points: 75, labelKey: 'FiftyTradesClosed', check: function (s) {
      var ids = (s.closedTrades || []).map(idOf);
      return ids.length >= 50 ? { tradeIds: ids.slice(0, 50) } : null;
    } },
    { key: 'first_session_completed', points: 15, labelKey: 'FirstSessionCompleted', check: function (s) {
      return (s.completedSessionIds || []).length >= 1 ? { sessionIds: s.completedSessionIds.slice(0, 1) } : null;
    } },
    { key: 'first_listing_published', points: 25, labelKey: 'FirstListingPublished', check: function (s) {
      return (s.ownedListingIds || []).length >= 1 ? { listingIds: s.ownedListingIds.slice(0, 1) } : null;
    } },
    { key: 'intake_completed', points: 20, labelKey: 'IntakeCompleted', check: function (s) {
      return s.intakeCompleted ? { intakeCompleted: true } : null;
    } },
    { key: 'bias_checklist_completed', points: 15, labelKey: 'BiasChecklistCompleted', check: function (s) {
      return (s.biasChecklistCompletedCount || 0) >= 1 ? { count: s.biasChecklistCompletedCount } : null;
    } },
    { key: 'first_purchase', points: 10, labelKey: 'FirstPurchase', check: function (s) {
      return (s.purchaseIds || []).length >= 1 ? { purchaseIds: s.purchaseIds.slice(0, 1) } : null;
    } },
    { key: 'ten_sessions_closed', points: 25, labelKey: 'TenSessionsClosed', check: function (s) {
      var ids = s.completedSessionIds || [];
      return ids.length >= 10 ? { sessionIds: ids.slice(0, 10) } : null;
    } },
    { key: 'twenty_five_sessions_closed', points: 50, labelKey: 'TwentyFiveSessionsClosed', check: function (s) {
      var ids = s.completedSessionIds || [];
      return ids.length >= 25 ? { sessionIds: ids.slice(0, 25) } : null;
    } },
    { key: 'fifty_sessions_closed', points: 100, labelKey: 'FiftySessionsClosed', check: function (s) {
      var ids = s.completedSessionIds || [];
      return ids.length >= 50 ? { sessionIds: ids.slice(0, 50) } : null;
    } },
    { key: 'ten_sessions_with_lesson', points: 40, labelKey: 'TenSessionsWithLesson', check: function (s) {
      var ids = s.sessionIdsWithLesson || [];
      return ids.length >= 10 ? { sessionIds: ids.slice(0, 10) } : null;
    } },
    // Granted server-side only (xp_total and cross-day login history aren't fully visible to
    // one browser tab) - listed here only so points/labels live in the one canonical place.
    // `serverOnly` means checkAll() never calls check() for these two.
    { key: 'level_5_reached', points: 0, labelKey: 'Level5Reached', serverOnly: true },
    { key: 'five_day_login_streak', points: 40, labelKey: 'FiveDayLoginStreak', serverOnly: true }
  ];

  function checkAll(snapshot) {
    var results = [];
    DEFINITIONS.forEach(function (def) {
      if (def.serverOnly) return;
      var evidence = def.check(snapshot || {});
      if (evidence) results.push({ key: def.key, points: def.points, evidence: evidence });
    });
    return results;
  }

  window.TradeJournalProfileAchievements = { definitions: DEFINITIONS, checkAll: checkAll };
}());
