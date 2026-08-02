(function () {
  'use strict';
  // Feeds the admin Users tab's "online now"/"last login"/"hours online" columns. Loaded on
  // every character page (covers the dashboards, Community, and the Mental Health profile,
  // since all three are hash-routes inside the same character iframe/document) - deliberately
  // NOT loaded on the standalone admin page itself, which is its own audience.
  function beat() {
    var switcher = window.TradeJournalDevUserSwitcher;
    var id = switcher && switcher.currentUserId();
    if (!id) return;
    fetch('/api/users/heartbeat', { method: 'POST', headers: { 'x-dev-user-id': id } }).catch(function () {});
  }
  window.setInterval(beat, 45000);
  window.setTimeout(beat, 0);
  window.TradeJournalHeartbeat = { beat: beat };
}());
