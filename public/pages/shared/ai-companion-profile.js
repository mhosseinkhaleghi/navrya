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

  // Item 4 (Journey G follow-up): switching dev users on the same browser must never leak one
  // user's Companion preferences/goal/dismissals into another's. This module's own localStorage
  // key (like every other Section 7.18-shaped module's) is a single global key, not namespaced
  // per user - and this app's real user-switch flow (dev-user-switcher.js's "Log out" button) is
  // a full navigation to the login screen, never an in-place swap, so this module's own script
  // scope IS re-initialized fresh on the next login. What it does NOT do on its own is clear
  // localStorage - `logout()` only removes the auth token, deliberately (every local-first module
  // in this app relies on the SAME "reconcile against the server on next load" recovery, not a
  // logout-time wipe). `_ownerUserId` closes this at the one choke point every read already goes
  // through (load()): a cached document whose stamped owner doesn't match whoever is CURRENTLY
  // authenticated is never revealed - load() returns a fresh default instead, and migrateOrAdopt()
  // below (which calls load() itself) then correctly treats that as "nothing local to push,"
  // adopting the new user's own real server copy instead of leaking the previous user's cache.
  function liveUserId() {
    var switcher = window.TradeJournalDevUserSwitcher;
    return switcher && typeof switcher.currentUserId === 'function' ? switcher.currentUserId() : null;
  }

  function empty() {
    var stamp = now();
    return {
      version: 1, lastUpdatedAt: stamp,
      _ownerUserId: null,
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

  // Raw read, no ownership check - the one place migrateOrAdopt()/reconcile() themselves need the
  // literal on-disk bytes (e.g. to compare a server copy's timestamp against local, or to decide
  // whether adopting a server document should overwrite what's cached) without recursing through
  // the ownership-filtered load() below.
  function readRaw() {
    try {
      var raw = localStorage.getItem(KEY);
      return normalize(raw ? JSON.parse(raw) : null);
    } catch (_) { return empty(); }
  }

  function load() {
    var stored = readRaw();
    var currentUid = liveUserId();
    // Only enforced once someone is actually authenticated AND the cached document was itself
    // stamped for a real (different) owner - a pre-login/anonymous cache, or a document this same
    // user already owns, is returned as-is.
    if (currentUid && stored._ownerUserId && stored._ownerUserId !== currentUid) return empty();
    return stored;
  }

  function write(state) {
    var normalized = normalize(state);
    normalized.lastUpdatedAt = now();
    var currentUid = liveUserId();
    if (currentUid) normalized._ownerUserId = currentUid; // stamp on every real write, once a user exists
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
      // Stamp with whoever is live right now, not whatever the server blob happened to carry
      // (older data, or none at all) - this IS a real fetch scoped by req.currentUser.id
      // server-side (see routes.companion.mjs), so it is always this user's own document; tagging
      // it locally is what lets load() trust it on every subsequent synchronous read.
      var currentUid = liveUserId();
      if (currentUid) normalized._ownerUserId = currentUid;
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
