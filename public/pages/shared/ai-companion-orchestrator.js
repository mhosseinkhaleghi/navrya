(function () {
  'use strict';
  // Journey G (AI Companion & Journey Orchestration). The thin, deterministic glue between
  // ai-journey-engine.js (what's next) and the ChatDock's CompanionCard UI (navrya-src) - never a
  // second AI runtime, never a poller (event-driven only, per §22-23 of the brief / docs/ai/
  // companion-orchestration.md). Re-evaluates on the real CustomEvents every relevant store
  // already dispatches, and republishes a single, UI-agnostic `tradejournal:companion-updated`
  // event the React layer subscribes to - the same cross-root-sync convention
  // tradejournal:ai-settings-changed already established (ARCHITECTURE.md 7.14).
  function engine() { return window.TradeJournalAIJourneyEngine; }
  function profileStore() { return window.TradeJournalAICompanionProfile; }

  function publish() { window.dispatchEvent(new CustomEvent('tradejournal:companion-updated')); }

  // Item 2 of the Journey G follow-up: a real, observable behavioral difference for the
  // Companion-initiative Settings toggle, on top of ai-journey-engine.js's own tier gating (see
  // that file's eligibleSteps() comment for the Low/Normal/High tier semantics). This half is the
  // "cooldown" - how soon a genuinely DIFFERENT, non-contextual proactive suggestion may replace
  // the one currently shown. 'normal' is conservative (15 minutes); 'high' is shorter but still a
  // real, deterministic minimum, never zero/instant ("never becomes spammy" - one background
  // store event changing several things in quick succession must not flicker the card through
  // three different suggestions in three seconds). 'low' never reaches this check at all - only
  // contextual (priority >= 500) steps are ever eligible for it, and those always bypass cooldown
  // unconditionally (a real lifecycle moment - an open Trade, a due Reflection - must never wait).
  //
  // Deliberately in-memory, not persisted: this throttles rapid *background* re-suggestion within
  // one live session, not something that needs to survive a reload - a fresh page load showing
  // today's real nextBestStep() immediately is correct, not spam.
  var NORMAL_COOLDOWN_MS = 15 * 60 * 1000;
  var HIGH_COOLDOWN_MS = 3 * 60 * 1000;
  var lastShownStepId = null;
  var lastShownAt = 0;

  function cooldownMsFor(initiative) { return initiative === 'high' ? HIGH_COOLDOWN_MS : NORMAL_COOLDOWN_MS; }

  // Called whenever the user themselves just acted on the Companion (Continue/Later/Skip) - the
  // very next card should reflect that action immediately, never sit behind a cooldown meant for
  // *unprompted* background changes. Only a background re-evaluation (a store CustomEvent firing
  // with no preceding user interaction) is ever cooldown-throttled.
  function resetCooldown() { lastShownStepId = null; lastShownAt = 0; }

  // Real product-state events that can change what's next - never a timer/poll.
  var WATCHED_EVENTS = [
    'tradejournal:trades-changed', 'tradejournal:sessions-changed', 'tradejournal:patterns-changed',
    'tradejournal:strategy-education-changed', 'tradejournal:mental-health-changed', 'tradejournal:companion-state-changed'
  ];
  var wired = false;
  function init() {
    if (wired) return;
    wired = true;
    WATCHED_EVENTS.forEach(function (name) { window.addEventListener(name, publish); });
  }

  // The one-time first-run welcome (§16) - shown once, purely local/zero-network. Any of its three
  // real responses (Start/What is NAVRYA?/Later) marks it seen; this is a deliberate simplification
  // documented in docs/ai/companion-orchestration.md - a one-time welcome, not a recurring nudge,
  // so there is no separate "ask again later" state to track.
  function welcomeCard() {
    var store = profileStore();
    if (!store || store.hasSeenWalkthrough()) return null;
    var i18n = window.TradeJournalAII18n;
    return {
      kind: 'welcome',
      title: i18n ? i18n.t('companionWelcomeTitle') : 'Welcome.',
      why: i18n ? i18n.t('companionWelcomeBody') : '',
      startLabel: i18n ? i18n.t('companionWelcomeStart') : 'Start',
      whatIsLabel: i18n ? i18n.t('companionWelcomeWhatIsNavrya') : 'What is NAVRYA?',
      laterLabel: i18n ? i18n.t('companionWelcomeLater') : 'Later'
    };
  }

  // Real-browser bug found and fixed (Journey G, second real-browser verification pass):
  // currentCard() used to check welcomeCard() BEFORE ever consulting the engine, so the one-time
  // welcome could still be returned - and, depending on the render-time popover gate's own timing
  // in chatDockView.jsx, could visibly reappear - while a real destructive confirmation or an
  // in-flight Workflow was active, since ai-journey-engine.js's own safety gate lives inside
  // nextBestStep()/evaluate(), never reached by the short-circuit above it. Confirmed live: calling
  // window.TradeJournalAICompanionOrchestrator.currentCard() while a real session.create workflow
  // was in flight (started via window.TradeJournalAIWorkflowEngine.start(), zero AI calls) still
  // returned the welcome card. Fixed by checking the SAME safety/workflow gate nextBestStep()
  // itself uses - via evaluate().blockers - before EITHER card kind is ever considered, so "safety
  // always wins" now genuinely applies to the welcome card too, not just step cards.
  function safetyBlocksCompanion() {
    var eng = engine();
    if (!eng || typeof eng.evaluate !== 'function') return false;
    var snapshot = eng.evaluate();
    return !!(snapshot && Array.isArray(snapshot.blockers) && snapshot.blockers.length);
  }

  // The live Companion card - null when nothing to offer right now (a legitimate, quiet outcome,
  // never forced). Never called from a timer; the UI (chatDockView.jsx) calls this on mount and on
  // every `tradejournal:companion-updated`/relevant transient-UI-state change.
  function currentCard() {
    if (safetyBlocksCompanion()) return null;
    var welcome = welcomeCard();
    if (welcome) return welcome;
    var eng = engine();
    if (!eng) return null;
    var step = eng.nextBestStep();
    if (!step) { lastShownStepId = null; return null; }
    var contextual = step.dedupeKey.indexOf('journey:open_trade_attention:') === 0 || step.dedupeKey.indexOf('journey:post_trade_reflection:') === 0;
    var now = Date.now();
    if (!contextual && lastShownStepId !== null && step.id !== lastShownStepId) {
      var store = profileStore();
      var initiative = store ? store.initiativePreference() : 'normal';
      if (now - lastShownAt < cooldownMsFor(initiative)) return null; // cooldown active - stay quiet rather than flicker to a new suggestion
    }
    lastShownStepId = step.id;
    lastShownAt = now;
    return { kind: 'step', id: step.id, dedupeKey: step.dedupeKey, optional: step.optional, title: step.title, why: step.why, explainPrompt: step.explainPrompt };
  }

  function startWalkthrough() { var store = profileStore(); if (store) store.setWalkthroughSeen(); resetCooldown(); publish(); }
  function dismissWelcomeLater() { var store = profileStore(); if (store) store.setWalkthroughSeen(); resetCooldown(); publish(); }

  // Deterministic Continue (§18) - resolves straight into the real, already-registered action/
  // navigation entry point. Never a synthetic chat message asking the model to guess.
  function continueStep(stepId, rawContext) {
    var eng = engine();
    if (!eng) return;
    eng.executeStep(stepId, rawContext);
    resetCooldown();
    publish();
  }

  function laterStep(stepId) {
    var store = profileStore();
    var eng = engine();
    if (!store || !eng) return;
    var dedupeKey = eng.dedupeKeyFor(stepId);
    store.dismissStep(dedupeKey);
    resetCooldown();
    publish();
  }

  function skipStep(stepId) {
    var store = profileStore();
    if (!store) return;
    store.skipOptionalStep(stepId);
    resetCooldown();
    publish();
  }

  function setCurrentGoal(domainOrNull) {
    var store = profileStore();
    if (store) store.setCurrentGoal(domainOrNull);
    resetCooldown();
    publish();
  }

  // ==========================================================================================
  // Voice Companion opening (Journey G UX correction). Architecture (unchanged from the rest of
  // this module): Journey Engine supplies real facts (voiceOpeningContext()) -> this function
  // decides whether/what to say -> the caller (chatDockView.jsx) hands the exact text to the
  // existing Realtime speak() mechanism. Zero model calls; the Realtime session never improvises.
  // See docs/ai/companion-orchestration.md's "Voice Companion opening" section.
  //
  // Priority mirrors nextBestStep()'s own contextual-beats-onboarding rule: an active Trade > a
  // due Reflection > an open Session > (fresh: the one-time onboarding welcome) > a short neutral
  // returning greeting. Product-state safety (destructive/proactive confirmation pending, a real
  // workflow awaiting input) is checked via ai-journey-engine.js's voiceOpeningContext(), the
  // exact same gate nextBestStep() itself already uses. Therapist Mode and "Voice already mid-
  // turn" are transient UI state this module has no visibility into - the caller MUST check those
  // itself before ever calling this (same split as the Companion card's own render gate).
  // ==========================================================================================
  function voiceOpening() {
    var eng = engine();
    var i18n = window.TradeJournalAII18n;
    if (!eng || !i18n) return null;
    var voiceCtx = eng.voiceOpeningContext();
    if (!voiceCtx || voiceCtx.blocked) return null;
    if (voiceCtx.openTradeId) return { kind: 'activeTrade', text: i18n.t('voiceOpeningActiveTrade') };
    if (voiceCtx.reflectionDueTradeId) return { kind: 'dueReflection', text: i18n.t('voiceOpeningDueReflection') };
    if (voiceCtx.openSessionId) return { kind: 'activeSession', text: i18n.t('voiceOpeningActiveSession') };
    if (!voiceCtx.hasSeenWalkthrough) {
      // Spoken once it's delivered - marked seen right here, before the user even replies, is
      // what stops this exact onboarding greeting repeating on the NEXT Voice activation (item
      // 13): a real spoken interaction can't be "un-heard," so the moment NAVRYA is about to say
      // it counts as delivered, the same way starting/dismissing the equivalent Text welcome card
      // already does (startWalkthrough()/dismissWelcomeLater() above).
      var store = profileStore();
      if (store) store.setWalkthroughSeen();
      resetCooldown();
      publish();
      return { kind: 'freshWelcome', text: i18n.t('voiceOpeningFreshWelcome') };
    }
    return { kind: 'returningNeutral', text: i18n.t('voiceOpeningReturningNeutral') };
  }

  // Deterministic classification of the user's spoken reply to a just-delivered Companion opening
  // (item 10) - EN/FA only, matching the exact scope ai-proactive-engine.js's own
  // interpretConfirmationText() already established (a bare "yes"/"بله" is a safe, high-confidence
  // match ONLY because this is ever called in the narrow window right after NAVRYA just asked a
  // yes/no-shaped question - never against an ordinary message). AR/ES, and anything ambiguous in
  // EN/FA, return null - the caller (chat-dock-core.js) falls through to the one ordinary AI turn.
  var VOICE_EXPLAIN_PATTERN = /what('?s| is) navrya|what does navrya do/i;
  var VOICE_EXPLAIN_PATTERN_FA = /navrya چیه|navrya چیست|ناوریا چیه|ناوریا چیست/i;
  var VOICE_START_PATTERN = /\b(start|let'?s start|begin|let'?s go|sure|ok(ay)?|yes|yeah)\b/i;
  var VOICE_START_PATTERN_FA = /شروع کنیم|شروع کن|بزن بریم|بریم شروع|باشه شروع|آره شروع|بله شروع|^\s*(آره|بله|باشه)\s*$/;
  var VOICE_LATER_PATTERN = /\b(later|not now|no thanks|nope|skip|no)\b/i;
  var VOICE_LATER_PATTERN_FA = /بعدا|بعداً|فعلا نه|فعلاً نه|نه ممنون|نه بعدا|^\s*نه\s*$/;

  function interpretVoiceOpeningReply(text) {
    var t = String(text || '').trim();
    if (!t) return null;
    if (VOICE_EXPLAIN_PATTERN.test(t) || VOICE_EXPLAIN_PATTERN_FA.test(t)) return 'explain';
    var starts = VOICE_START_PATTERN.test(t) || VOICE_START_PATTERN_FA.test(t);
    var laters = VOICE_LATER_PATTERN.test(t) || VOICE_LATER_PATTERN_FA.test(t);
    if (starts && !laters) return 'start';
    if (laters && !starts) return 'later';
    return null;
  }

  // Resolves a deterministically-classified Start/Later choice by calling straight into the exact
  // same real functions the visual CompanionCard's own Continue/Later buttons already call - never
  // a second, parallel action path. "Start" never hardcodes a target (item 11) - nextBestStep() is
  // re-read fresh (walkthrough is already marked seen by voiceOpening() above by this point, so
  // for a fresh user this correctly resolves to their real first real step, e.g. Pattern creation).
  function resolveVoiceOpeningChoice(choice) {
    var eng = engine();
    var i18n = window.TradeJournalAII18n;
    if (!eng || !i18n) return { text: '' };
    if (choice === 'start') {
      var step = eng.nextBestStep();
      if (step) continueStep(step.id);
      return { text: i18n.t('voiceOpeningStartAck') };
    }
    if (choice === 'later') {
      var current = currentCard();
      if (current && current.kind === 'step') laterStep(current.id);
      return { text: i18n.t('voiceOpeningLaterAck') };
    }
    return { text: '' };
  }

  window.TradeJournalAICompanionOrchestrator = {
    init: init, currentCard: currentCard,
    startWalkthrough: startWalkthrough, dismissWelcomeLater: dismissWelcomeLater,
    continueStep: continueStep, laterStep: laterStep, skipStep: skipStep, setCurrentGoal: setCurrentGoal,
    voiceOpening: voiceOpening, interpretVoiceOpeningReply: interpretVoiceOpeningReply, resolveVoiceOpeningChoice: resolveVoiceOpeningChoice
  };

  init();
}());
