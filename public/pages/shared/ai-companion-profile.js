(function () {
  'use strict';
  // Journey G (AI Companion & Journey Orchestration). Owns the ONE small per-user document Journey
  // G is allowed to persist (ARCHITECTURE.md's "persist only what cannot be derived" rule): a
  // one-time walkthrough flag, dismissed/snoozed step ids, an explicit user-chosen currentGoal, and
  // a communication-preference profile. It deliberately does NOT store anything ai-journey-engine.js
  // can derive from real product data (hasPattern, hasStrategy, intakeCompleted, ...) - those are
  // recomputed fresh on every read by ai-journey-steps.js/ai-journey-engine.js, never cached here.
  //
  // Communication preferences (experienceLevel/explanationDepth/teachingPreference/
  // initiativePreference/interactionPreference) are a COMMUNICATION model, not a psychological
  // profile - never fed from, or written to, TradeJournalMentalHealthStore. See
  // docs/ai/companion-profile.md.
  //
  // Persistence mirrors mental-health-store.js's Module 5 shape exactly (same "one document per
  // user, no child tables" reasoning, same write-through-cache/sync-queue/reconcile-by-
  // lastUpdatedAt pattern) since this is the same shape of problem at a much smaller scale - see
  // server/db/migrations/018_companion_state.sql.
  var KEY = 'tradejournal:companion-state:v1';
  var MIGRATED_PREFIX = 'tradejournal:companion-state-migrated:v1:';

  function now() { return new Date().toISOString(); }

  // Item 4 (Journey G follow-up) originally closed the "switching dev users on the same browser
  // must never leak one user's Companion preferences/goal/dismissals into another's" gap right
  // here, by stamping/checking an in-document `_ownerUserId` on every read - but only ever hid a
  // mismatched document in memory, never deleted it from storage. Superseded (Phase 1 of the
  // local-first-to-server-authoritative migration): user-scope-guard.js is now the single place
  // this is handled, for this document and five others, by actually deleting KEY from storage
  // the moment it detects a different authenticated user - and it is the first shared <script> on
  // every character page, so by the time this file's own IIFE runs, that has already happened.
  // load()/write() below are plain again on purpose; do not re-add a second ownership check here.
  function empty() {
    var stamp = now();
    return {
      version: 1, lastUpdatedAt: stamp,
      walkthroughSeenAt: null,
      currentGoal: null,
      dismissedSteps: {}, // dedupeKey -> iso, permanently acknowledged ("Later" on a step's own card)
      snoozedSteps: {}, // stepId -> iso snoozeUntil
      skippedOptional: [], // stepId[], explicit Skip on an optional step
      preferences: {
        experienceLevel: null, explanationDepth: null, teachingPreference: null,
        initiativePreference: 'normal', interactionPreference: null
      }
    };
  }

  function normalize(raw) {
    var base = empty();
    if (!raw || typeof raw !== 'object') return base;
    var out = Object.assign({}, base, raw);
    out.dismissedSteps = Object.assign({}, raw.dismissedSteps || {});
    out.snoozedSteps = Object.assign({}, raw.snoozedSteps || {});
    out.skippedOptional = Array.isArray(raw.skippedOptional) ? raw.skippedOptional.slice() : [];
    out.preferences = Object.assign({}, base.preferences, raw.preferences || {});
    if (['low', 'normal', 'high'].indexOf(out.preferences.initiativePreference) === -1) out.preferences.initiativePreference = 'normal';
    return out;
  }

  // Used directly by migrateOrAdopt()/reconcile() themselves for the literal on-disk bytes (e.g.
  // to compare a server copy's timestamp against local) - identical to load() now that ownership
  // filtering lives in user-scope-guard.js instead, kept as a separate name for symmetry with the
  // other synced stores' own readRaw()/read() split.
  function readRaw() {
    try {
      var raw = localStorage.getItem(KEY);
      return normalize(raw ? JSON.parse(raw) : null);
    } catch (_) { return empty(); }
  }

  function load() { return readRaw(); }

  function write(state) {
    var normalized = normalize(state);
    normalized.lastUpdatedAt = now();
    localStorage.setItem(KEY, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent('tradejournal:companion-state-changed'));
    if (window.TradeJournalSyncQueue) window.TradeJournalSyncQueue.enqueue('companion-state', 'state', normalized);
    return normalized;
  }
  function save(state) { return write(normalize(state)); }

  // --- Server sync - mirrors mental-health-store.js's block exactly. ---
  (function () {
    var queue = window.TradeJournalSyncQueue;
    if (!queue) return;
    function devUser() { return window.TradeJournalDevUserSwitcher; }

    queue.registerModule('companion-state', function (entry) {
      var switcher = devUser(); var uid = switcher && switcher.currentUserId();
      if (!uid) throw new Error('NO_CURRENT_USER');
      return fetch('/api/sync/companion-state', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dev-user-id': uid },
        body: JSON.stringify(entry.payload)
      }).then(function (response) { if (!response.ok) throw new Error('SYNC_FAILED'); });
    });

    function applyServerState(serverState) {
      if (!serverState) return;
      var normalized = normalize(serverState);
      localStorage.setItem(KEY, JSON.stringify(normalized));
      window.dispatchEvent(new CustomEvent('tradejournal:companion-state-changed'));
    }

    function fetchServerState(uid) {
      return fetch('/api/sync/companion-state', { headers: { 'x-dev-user-id': uid } })
        .then(function (response) { return response.ok ? response.json() : { state: null }; })
        .then(function (body) { return body.state || null; })
        .catch(function () { return null; });
    }

    // First activation: adopt the server's copy outright if one exists (same "no prior local edit
    // worth protecting yet" reasoning as every other Module 5-shaped first-activation check);
    // otherwise push the local document up, but only if it actually diverges from a fresh default
    // (a brand-new browser with nothing set yet has nothing meaningful to push).
    function migrateOrAdopt() {
      var switcher = devUser(); var uid = switcher && switcher.currentUserId();
      if (!uid) return;
      var flagKey = MIGRATED_PREFIX + uid;
      if (localStorage.getItem(flagKey)) return reconcile();
      fetchServerState(uid).then(function (serverState) {
        if (serverState) { applyServerState(serverState); }
        else {
          var local = load();
          var isDefault = JSON.stringify(normalize(local)) === JSON.stringify(Object.assign(empty(), { lastUpdatedAt: local.lastUpdatedAt }));
          if (!isDefault) queue.enqueue('companion-state', 'state', local);
        }
        localStorage.setItem(flagKey, now());
      });
    }

    // Steady-state (the `online` event): whichever copy's lastUpdatedAt is newer wins - same
    // reasoning as mental-health-store.js's own reconcile (a single document has no per-record id
    // to merge by, so this protects a just-made offline edit from a reconcile moments later).
    function reconcile() {
      var switcher = devUser(); var uid = switcher && switcher.currentUserId();
      if (!uid) return;
      fetchServerState(uid).then(function (serverState) {
        if (!serverState) return;
        var local = load();
        if (new Date(serverState.lastUpdatedAt || 0).getTime() > new Date(local.lastUpdatedAt || 0).getTime()) applyServerState(serverState);
      });
    }

    window.setTimeout(migrateOrAdopt, 0);
    window.addEventListener('online', reconcile);
  }());

  // --- Reads/mutations ---
  function get() { return load(); }
  function preferences() { return load().preferences; }
  function initiativePreference() { return load().preferences.initiativePreference; }

  function setWalkthroughSeen() { var s = load(); if (!s.walkthroughSeenAt) { s.walkthroughSeenAt = now(); return save(s); } return s; }
  function hasSeenWalkthrough() { return !!load().walkthroughSeenAt; }

  function setCurrentGoal(goalId) { var s = load(); s.currentGoal = goalId || null; return save(s); }
  function currentGoal() { return load().currentGoal; }

  function dismissStep(dedupeKey) { var s = load(); s.dismissedSteps[dedupeKey] = now(); return save(s); }
  function isDismissed(dedupeKey) { return !!load().dismissedSteps[dedupeKey]; }

  function snoozeStep(stepId, untilIso) { var s = load(); s.snoozedSteps[stepId] = untilIso; return save(s); }
  function isSnoozed(stepId) {
    var until = load().snoozedSteps[stepId];
    return !!until && new Date(until).getTime() > Date.now();
  }

  function skipOptionalStep(stepId) {
    var s = load();
    if (s.skippedOptional.indexOf(stepId) === -1) s.skippedOptional.push(stepId);
    return save(s);
  }
  function isSkipped(stepId) { return load().skippedOptional.indexOf(stepId) > -1; }

  function setPreference(key, value) {
    var s = load();
    if (!(key in s.preferences)) return s;
    s.preferences[key] = value;
    return save(s);
  }

  window.TradeJournalAICompanionProfile = {
    key: KEY, load: load, save: save, get: get,
    preferences: preferences, initiativePreference: initiativePreference, setPreference: setPreference,
    setWalkthroughSeen: setWalkthroughSeen, hasSeenWalkthrough: hasSeenWalkthrough,
    setCurrentGoal: setCurrentGoal, currentGoal: currentGoal,
    dismissStep: dismissStep, isDismissed: isDismissed,
    snoozeStep: snoozeStep, isSnoozed: isSnoozed,
    skipOptionalStep: skipOptionalStep, isSkipped: isSkipped
  };
}());
