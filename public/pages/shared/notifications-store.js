(function () {
  'use strict';

  // The ONE canonical notification-summary client - both the main app sidebar (Community +
  // Support badges, navrya-src/character-app.jsx) and the Admin Panel sidebar (the shared
  // awaiting-staff Support badge, public/pages/admin/app.js) read through this single store,
  // never a second parallel counting path. Cookies/CSRF ride automatically (csrf-fetch-patch.js,
  // same-origin credentials) - no dev-user-id header needed, this domain is real-session-only.
  function handle(response) {
    return response.json().catch(function () { return {}; }).then(function (body) {
      if (!response.ok) {
        var error = new Error(body.error || 'NOTIFICATIONS_REQUEST_FAILED');
        error.status = response.status; error.code = body.error;
        throw error;
      }
      return body;
    });
  }

  // {communityUnread, supportUnread, supportAwaitingStaffCount}. supportAwaitingStaffCount is
  // null for a non-admin caller - see server/community/routes.notifications.mjs.
  function getSummary() { return fetch('/api/sync/notifications/summary').then(handle); }

  // Called when the Community page actually opens and its data has loaded - advances the
  // caller's own cursor so already-seen activity stops counting.
  function acknowledgeCommunity() { return fetch('/api/sync/notifications/community/ack', { method: 'POST' }).then(handle); }

  // Lightweight polling helper shared by every sidebar/shell that shows a badge (spec: "refresh
  // on app start, navigation, relevant mutations, and lightweight polling e.g. every 30s; clean
  // up polling on unmount/logout"). onUpdate(summary) is called on every successful fetch, a
  // failed fetch is swallowed (best-effort, matches this app's own wallet-balance polling
  // convention) so one flaky request never breaks the badge going forward. Returns a stop()
  // function - callers MUST call it on unmount/logout to avoid an orphaned interval.
  function startPolling(onUpdate, intervalMs) {
    var stopped = false;
    function tick() {
      if (stopped) return;
      getSummary().then(function (summary) { if (!stopped) onUpdate(summary); }).catch(function () {});
    }
    tick();
    var timer = window.setInterval(tick, intervalMs || 30000);
    return function stop() { stopped = true; window.clearInterval(timer); };
  }

  window.TradeJournalNotificationsStore = { getSummary: getSummary, acknowledgeCommunity: acknowledgeCommunity, startPolling: startPolling };
}());
