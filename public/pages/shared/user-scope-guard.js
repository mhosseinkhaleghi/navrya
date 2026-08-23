(function () {
  'use strict';
  // On-demand purge library (the boot-time owner-mismatch check this file originally performed
  // now lives in boot-language-gate.js, which must run before ANY other script - see that file's
  // own comment for why the purge routine is duplicated there rather than imported from here).
  // This file is kept, loaded later at its existing position, for the one thing that genuinely
  // needs to run on-demand rather than at boot: dev-user-switcher.js's logout() calling
  // purgeAll() directly, and any other explicit "wipe every cached record" call site.
  //
  // Cookie-based sessions mean there is no client-readable credential to decode an identity
  // from any more, so this file no longer tracks "the current user" itself at all - identity
  // lives in window.__NAVRYA_AUTH__, set once by boot-language-gate.js's own real server check.
  var OWNER_USER_ID_KEY = 'tradejournal:owner-user-id:v1';

  // See boot-language-gate.js for the identical list, kept in sync by hand - the full reasoning
  // for each entry is documented there and in this project's own migration history.
  var EXACT_KEYS = [
    'tradejournal:patterns:v1',
    'tradejournal:strategies:v2',
    'tradejournal:strategy-education:v1',
    'tradejournal:trades:v1',
    'tradejournal:trade-settings:v1',
    'tradejournal:sessions:v1:shared',
    'tradejournal:sessions:v1:hunter',
    'tradejournal:sessions:v1:engineer',
    'tradejournal:sessions:v1:commander',
    'tradejournal:sessions:v1:sage',
    'tradejournal:mental-health-profile:v2',
    'tradejournal:mental-health-profile:v1',
    'tradejournal:mental-health-compliance:v1',
    'tradejournal:companion-state:v1',
    'tradejournal:sync-queue:v1',
    'tradejournal:dev-user-id',
    'tradejournal:account-profile-xp-sent-onboarding:v1',
    'tradejournal:account-profile-xp-sent-session:v1',
    'tradejournal:account-profile-xp-sent-pattern:v1',
    'tradejournal:account-profile-xp-sent-strategy:v1',
    'tradejournal:account-profile-xp-sent-trade:v1',
    'tradejournal:account-profile-xp-sent-psych:v1',
    'tradejournal:account-profile-xp-sent-community:v1',
    'tradejournal:account-profile-listing-ids:v1',
    'tradejournal:account-profile-purchase-ids:v1'
  ];
  var MIGRATION_FLAG_PREFIXES = [
    'tradejournal:patterns-migrated:v1:',
    'tradejournal:strategies-migrated:v1:',
    'tradejournal:trades-migrated:v1:',
    'tradejournal:sessions-migrated:v1:',
    'tradejournal:mental-health-migrated:v1:',
    'tradejournal:companion-state-migrated:v1:'
  ];

  function safeRemove(key) { try { localStorage.removeItem(key); } catch (_) { /* no-op */ } }

  function sweepMigrationFlags() {
    var toRemove = [];
    try {
      for (var i = 0; i < localStorage.length; i += 1) {
        var key = localStorage.key(i) || '';
        for (var p = 0; p < MIGRATION_FLAG_PREFIXES.length; p += 1) {
          if (key.indexOf(MIGRATION_FLAG_PREFIXES[p]) === 0) { toRemove.push(key); break; }
        }
      }
    } catch (_) { /* storage unavailable - nothing to sweep */ }
    toRemove.forEach(safeRemove);
  }

  // session-entry-flow.js (the only module that actually opens the IndexedDB handle) may not
  // have loaded yet depending on when this is called - clear directly if already available,
  // otherwise leave a flag it consumes once its own IIFE runs.
  function requestImageStoreClear() {
    if (window.TradeJournalImageStore && typeof window.TradeJournalImageStore.clearAll === 'function') {
      window.TradeJournalImageStore.clearAll().catch(function () { /* best-effort - orphaned blobs are a quota/hygiene concern, not a correctness one */ });
    } else {
      window.__TJ_PENDING_IMAGE_STORE_CLEAR__ = true;
    }
  }

  function notify(type, detail) {
    if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      window.dispatchEvent(detail === undefined ? new CustomEvent(type) : new CustomEvent(type, { detail: detail }));
    }
  }

  function notifyAllDomainsChanged() {
    notify('tradejournal:patterns-changed', { count: 0 });
    notify('tradejournal:strategies-changed', { count: 0 });
    notify('tradejournal:strategy-education-changed', { count: 0 });
    notify('tradejournal:trades-changed', { count: 0 });
    notify('tradejournal:trade-settings-changed');
    notify('tradejournal:sessions-changed', { reset: true });
    notify('tradejournal:mental-health-changed');
    notify('tradejournal:companion-state-changed');
  }

  // Unconditional wipe of every scoped key, regardless of current content - called by
  // dev-user-switcher.js's logout() (ahead of clearing the session itself server-side) and by
  // boot-language-gate.js's own duplicated copy of this same routine on an owner mismatch.
  function purgeAll() {
    EXACT_KEYS.forEach(safeRemove);
    sweepMigrationFlags();
    requestImageStoreClear();
    safeRemove(OWNER_USER_ID_KEY);
    notifyAllDomainsChanged();
  }

  window.TradeJournalUserScopeGuard = {
    ownerUserIdKey: OWNER_USER_ID_KEY,
    exactKeys: EXACT_KEYS.slice(),
    migrationFlagPrefixes: MIGRATION_FLAG_PREFIXES.slice(),
    purgeAll: purgeAll
  };
}());
