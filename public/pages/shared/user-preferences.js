(function () {
  'use strict';
  // Phase 8 of the local-first-to-server-authoritative migration (see ARCHITECTURE.md's Known
  // Constraints section): a small, reusable primitive every Phase 8 sub-module (8a's similarity
  // threshold today; panel layout/language/AI settings/app settings in later sub-phases) reads
  // and writes through, instead of each one hand-rolling its own raw localStorage key. Wraps
  // server-replica.js's generic list-domain contract - each preference is modeled as one "record"
  // whose id is the preference's own key (e.g. 'similarityThreshold'), so this reuses the exact
  // same registerListDomain()/upsert()/remove() infrastructure every other migrated domain does,
  // with no new client-side primitive needed. See server/community/routes.preferences.mjs and
  // 019_session_signatures_and_preferences.sql for the server side.
  function replica() { return window.TradeJournalServerReplica && window.TradeJournalServerReplica.domain('preferences'); }

  (function () {
    if (!window.TradeJournalServerReplica) return;
    window.TradeJournalServerReplica.registerListDomain('preferences', {
      hydrateUrl: '/api/sync/preferences',
      writeUrl: '/api/sync/preferences',
      deleteUrlFor: function (key) { return '/api/sync/preferences/' + encodeURIComponent(key); },
      extractList: function (body) { return (body && body.preferences) || []; }
    });
    replica().hydrate();
  }());

  function isHydrated() { var domain = replica(); return domain ? domain.isHydrated() : false; }

  // Synchronous, reading straight from the already-hydrated in-memory replica - matches every
  // caller's existing pre-migration contract (a plain synchronous localStorage read, before
  // this module existed). Returns `fallback` both before hydration completes and when no
  // override exists yet -
  // callers that must distinguish "not yet hydrated" from "genuinely no preference set" should
  // check isHydrated() first, the same way every other migrated domain's boot-gate-sensitive
  // reader already does.
  function getPref(key, fallback) {
    var domain = replica();
    if (!domain) return fallback;
    var row = domain.find(String(key));
    return row && Object.prototype.hasOwnProperty.call(row, 'value') ? row.value : fallback;
  }

  // Optimistic apply + POST in the background, .catch()-guarded - same fire-and-forget contract
  // as every other migrated domain's save()/create(), so callers keep their existing synchronous
  // "set and move on" call shape unchanged.
  function setPref(key, value) {
    var domain = replica();
    if (domain) domain.upsert({ id: String(key), value: value }).catch(function () {});
  }

  // Resets one preference back to its own caller-side hardcoded default by deleting the row
  // entirely - never storing an explicit null override, so a future change to that default is
  // honored immediately rather than staying pinned to whatever null once meant.
  function resetPref(key) {
    var domain = replica();
    if (domain) domain.remove(String(key)).catch(function () {});
  }

  window.TradeJournalUserPreferences = { isHydrated: isHydrated, getPref: getPref, setPref: setPref, resetPref: resetPref };
}());
