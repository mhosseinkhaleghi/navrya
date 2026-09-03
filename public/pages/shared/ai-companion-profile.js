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

  // AI Dashboard's Persona tab (free-text prompt + tone sliders + pinned facts) - additive to
  // this same small document, per ARCHITECTURE.md's "one document per user, no child tables"
  // rule; companion_state is stored as one verbatim JSONB column (018_companion_state.sql), so
  // every field below needs no migration. TONE_DIMENSION_KEYS deliberately excludes
  // "initiative" - that dimension writes through the EXISTING preferences.initiativePreference
  // field instead (setPreference()), so ai-journey-engine.js's existing reader keeps working
  // unchanged rather than gaining a second, competing notion of initiative.
  var TONE_DIMENSION_KEYS = ['explicitness', 'detail', 'warmth', 'humor', 'jargon'];
  var CUSTOM_INSTRUCTIONS_MAX = 600;
  var PINNED_FACT_MAX_LEN = 140;
  var PINNED_FACTS_MAX_COUNT = 10;

  function defaultToneDimensions() {
    var out = {};
    TONE_DIMENSION_KEYS.forEach(function (k) { out[k] = 50; });
    return out;
  }

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
      },
      personaPreset: null, // UI convenience label only (e.g. "coach") - never read by the server
      toneDimensions: defaultToneDimensions(), // 0-100 per TONE_DIMENSION_KEYS
      customInstructions: '', // free-text style prompt, threaded into the system prompt server-side
      pinnedFacts: [], // string[], always sent to the model - see personaStylePackage()
      // Real default is "everything on" - matches every one of these domains' CURRENT always-on
      // behavior (getRelevantAccounts()/getRelevantPsychologyContext() etc. in ai-user-memory.js
      // had no toggle before this field existed), so adding this preference never silently
      // changes an existing user's AI context. Turning one off is an explicit, opt-in narrowing.
      dataAccessPrefs: { tradesSessions: true, patternsStrategies: true, mentalHealth: true, accounts: true }
    };
  }

  function clampPercent(value, fallback) {
    var n = Number(value);
    if (!isFinite(n)) return fallback;
    return Math.max(0, Math.min(100, Math.round(n)));
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
    out.personaPreset = typeof raw.personaPreset === 'string' ? raw.personaPreset : null;
    var rawTone = raw.toneDimensions || {};
    out.toneDimensions = defaultToneDimensions();
    TONE_DIMENSION_KEYS.forEach(function (k) { if (k in rawTone) out.toneDimensions[k] = clampPercent(rawTone[k], 50); });
    out.customInstructions = typeof raw.customInstructions === 'string' ? raw.customInstructions.slice(0, CUSTOM_INSTRUCTIONS_MAX) : '';
    out.pinnedFacts = Array.isArray(raw.pinnedFacts)
      ? raw.pinnedFacts.filter(function (f) { return typeof f === 'string' && f.trim(); }).map(function (f) { return f.trim().slice(0, PINNED_FACT_MAX_LEN); }).slice(0, PINNED_FACTS_MAX_COUNT)
      : [];
    out.dataAccessPrefs = Object.assign({}, base.dataAccessPrefs, raw.dataAccessPrefs || {});
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

  // --- Persona tab (AI dashboard) ---
  function personaPreset() { return load().personaPreset; }
  function setPersonaPreset(id) { var s = load(); s.personaPreset = id || null; return save(s); }

  function toneDimensions() { return load().toneDimensions; }
  function setToneDimension(key, value) {
    var s = load();
    if (TONE_DIMENSION_KEYS.indexOf(key) === -1) return s;
    s.toneDimensions[key] = clampPercent(value, s.toneDimensions[key]);
    return save(s);
  }

  function customInstructions() { return load().customInstructions; }
  function setCustomInstructions(text) {
    var s = load();
    s.customInstructions = String(text || '').slice(0, CUSTOM_INSTRUCTIONS_MAX);
    return save(s);
  }

  function pinnedFacts() { return load().pinnedFacts; }
  function addPinnedFact(text) {
    var s = load();
    var value = String(text || '').trim().slice(0, PINNED_FACT_MAX_LEN);
    if (!value || s.pinnedFacts.length >= PINNED_FACTS_MAX_COUNT) return s;
    s.pinnedFacts = s.pinnedFacts.concat([value]);
    return save(s);
  }
  function removePinnedFact(index) {
    var s = load();
    s.pinnedFacts = s.pinnedFacts.filter(function (_, i) { return i !== index; });
    return save(s);
  }

  function dataAccessPrefs() { return load().dataAccessPrefs; }
  function setDataAccessPref(key, value) {
    var s = load();
    if (!(key in s.dataAccessPrefs)) return s;
    s.dataAccessPrefs[key] = !!value;
    return save(s);
  }

  // The wire package chat-dock-core.js attaches to every /api/ai/chat call as
  // requestBody.personaStyle (server/pattern-ai-server.mjs's buildPersonaStyleText()) -
  // deliberately UNCONDITIONAL, unlike ai-journey-engine.js's companionContext() (never
  // suppressed by an open form/workflow - tone/style should still apply mid-workflow). Returns
  // null (send nothing) when the user has never touched the Persona tab, so an untouched account
  // costs zero extra prompt tokens - never a block of default-50 filler.
  function personaStylePackage() {
    var s = load();
    var touchedTone = TONE_DIMENSION_KEYS.some(function (k) { return s.toneDimensions[k] !== 50; });
    var hasText = !!s.customInstructions.trim();
    var hasPins = s.pinnedFacts.length > 0;
    if (!touchedTone && !hasText && !hasPins) return null;
    return {
      toneDimensions: Object.assign({}, s.toneDimensions),
      initiativePreference: s.preferences.initiativePreference,
      customInstructions: s.customInstructions,
      pinnedFacts: s.pinnedFacts.slice()
    };
  }

  window.TradeJournalAICompanionProfile = {
    load: load, save: save, get: get,
    preferences: preferences, initiativePreference: initiativePreference, setPreference: setPreference,
    setWalkthroughSeen: setWalkthroughSeen, hasSeenWalkthrough: hasSeenWalkthrough,
    setCurrentGoal: setCurrentGoal, currentGoal: currentGoal,
    dismissStep: dismissStep, isDismissed: isDismissed,
    snoozeStep: snoozeStep, isSnoozed: isSnoozed,
    skipOptionalStep: skipOptionalStep, isSkipped: isSkipped,
    personaPreset: personaPreset, setPersonaPreset: setPersonaPreset,
    toneDimensions: toneDimensions, setToneDimension: setToneDimension,
    customInstructions: customInstructions, setCustomInstructions: setCustomInstructions,
    pinnedFacts: pinnedFacts, addPinnedFact: addPinnedFact, removePinnedFact: removePinnedFact,
    dataAccessPrefs: dataAccessPrefs, setDataAccessPref: setDataAccessPref,
    personaStylePackage: personaStylePackage
  };
}());
