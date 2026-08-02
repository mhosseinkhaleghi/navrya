(function () {
  'use strict';
  var DAY_MS = 86400000;
  var DEFAULT_CADENCE_DAYS = 7;
  var REASSESSMENT_DAYS = 30;

  // No-op by default: this feature only computes what's due; it never sends anything on its own.
  // A future push/desktop-notification layer plugs in here without touching dueItems() below.
  window.TradeJournalNotificationProvider = window.TradeJournalNotificationProvider || { notify: function () {} };

  function dueItems(profile, now) {
    now = now || new Date();
    var items = [];
    var snapshots = profile.progressTracking.weeklySnapshots;
    var lastCheckIn = snapshots.length ? new Date(snapshots[snapshots.length - 1].weekStart).getTime() : new Date(profile.createdAt).getTime();
    if (now.getTime() - lastCheckIn >= DEFAULT_CADENCE_DAYS * DAY_MS) {
      items.push({ type: 'weekly_snapshot', dueSince: new Date(lastCheckIn + DEFAULT_CADENCE_DAYS * DAY_MS).toISOString() });
    }
    if (!profile.intake.completed) {
      items.push({ type: 'baseline_assessment', dueSince: profile.createdAt });
    } else {
      var assessed = new Date(profile.intake.completedAt).getTime();
      if (now.getTime() - assessed >= REASSESSMENT_DAYS * DAY_MS) items.push({ type: 'baseline_reassessment', dueSince: new Date(assessed + REASSESSMENT_DAYS * DAY_MS).toISOString() });
    }
    return items;
  }

  window.TradeJournalMentalHealthScheduler = { dueItems: dueItems, defaultCadenceDays: DEFAULT_CADENCE_DAYS, reassessmentDays: REASSESSMENT_DAYS };
}());
