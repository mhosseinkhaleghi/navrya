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
  // Persistence mirrors mental-health-store.js's Module 5 shape (same "one document per user, no
  // child tables" reasoning) - see server/db/migrations/018_companion_state.sql. As of Phase 2 of
  // the local-first-to-server-authoritative migration (see ARCHITECTURE.md's Global Data Sync
  // section), this also means the same server-replica.js in-memory replica, not localStorage.
  var DOMAIN = 'companion-state';
  function replica() { return window.TradeJournalServerReplica && window.TradeJournalServerReplica.domain(DOMAIN); }

  function now() { return new Date().toISOString(); }

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

  function load() {
    var domain = replica();
    return normalize((domain && domain.get()) || null);
  }

  // Apply optimistically and return synchronously (unchanged contract) - the write's own Promise
  // is .catch()-guarded since save()/write() never gave their caller a Promise to observe.
  function write(state) {
    var normalized = normalize(state);
    normalized.lastUpdatedAt = now();
    if (replica()) replica().set(normalized).catch(function () {});
    return normalized;
  }
  function save(state) { return write(normalize(state)); }

  // Phase 2 of the local-first-to-server-authoritative migration (see ARCHITECTURE.md's Global
  // Data Sync section): reads/writes the in-memory server-replica directly - server-replica.js is
  // loaded before this file in every character page's script order. There is no localStorage
  // cache, no offline outbox, and no periodic reconciliation for Companion state any more.
  (function () {
    if (!window.TradeJournalServerReplica) return;
    window.TradeJournalServerReplica.registerDocumentDomain(DOMAIN, {
      hydrateUrl: '/api/sync/companion-state',
      writeUrl: '/api/sync/companion-state',
      extractDoc: function (body) { return body.state || null; },
      // Unlike mental-health.mjs, routes.companion.mjs's own POST wraps the saved document as
      // {state: saved} rather than returning it directly - see server-replica.js's own comment.
      extractSaved: function (body) { return body && body.state; }
    });
    replica().hydrate();
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
    load: load, save: save, get: get,
    preferences: preferences, initiativePreference: initiativePreference, setPreference: setPreference,
    setWalkthroughSeen: setWalkthroughSeen, hasSeenWalkthrough: hasSeenWalkthrough,
    setCurrentGoal: setCurrentGoal, currentGoal: currentGoal,
    dismissStep: dismissStep, isDismissed: isDismissed,
    snoozeStep: snoozeStep, isSnoozed: isSnoozed,
    skipOptionalStep: skipOptionalStep, isSkipped: isSkipped
  };
}());
