(function () {
  'use strict';
  // Journey G (AI Companion & Journey Orchestration). The deterministic derivation layer -
  // ARCHITECTURE.md's Journey G section, docs/ai/journey-engine.md. Every read here is computed
  // fresh from real, already-loaded stores (mirrors mental-health-collector.js's recompute()
  // discipline - no parallel snapshot is cached across calls). Zero model calls anywhere in this
  // file - see docs/ai/journey-engine.md's "no AI call for Journey evaluation" rule.
  var lastSnapshot = null;

  function steps() { return window.TradeJournalAIJourneySteps; }
  function profileStore() { return window.TradeJournalAICompanionProfile; }

  // Raw inputs read once per evaluate() call, shared by every step's completed()/available() so
  // no step reads the same store twice in one pass.
  function buildContext() {
    var s = steps();
    if (!s) return null;
    var readers = s.readers;
    var profile = readers.mentalHealthProfile();
    var patternsList = readers.patterns();
    var strategiesList = readers.strategies();
    var tradesList = readers.trades();
    var sessionsList = readers.sessionsCache();
    var reportable = readers.patternWithReport();
    return {
      raw: null, // filled by callers that have a real action-open() context to pass through
      profile: profile, patterns: patternsList, strategies: strategiesList, trades: tradesList, sessions: sessionsList,
      openTrade: readers.firstOpenTrade(),
      reflectionDueTrade: readers.firstIncompleteReflectionTrade(),
      openSession: readers.firstOpenSession(),
      reportablePattern: reportable
    };
  }

  function safetyOrWorkflowActive() {
    var workflow = window.TradeJournalAIWorkflowEngine;
    var proactive = window.TradeJournalAIProactiveEngine;
    if (workflow && typeof workflow.current === 'function' && workflow.current()) return true;
    if (proactive && typeof proactive.pendingConfirmation === 'function' && proactive.pendingConfirmation()) return true;
    return false;
  }

  function eligibleSteps(ctx, profileState) {
    var s = steps();
    if (!s || !ctx) return [];
    return s.list().filter(function (step) {
      try {
        if (!step.available(ctx)) return false;
        if (step.completed(ctx)) return false;
      } catch (_) { return false; }
      // Companion initiative preference (§54, made real per Item 2 of the Journey G follow-up).
      // Three observably different tiers, all layered on top of the same eligibility computation -
      // never a second code path, never touching safety/cooldown/workflow precedence:
      //  - 'low': only the contextual, real-lifecycle steps (an open Trade needing attention, a
      //    due Reflection - priority >= 500) ever surface unprompted. Every foundational/optional
      //    step is suppressed from the CARD, but explicit user requests (typed/spoken chat,
      //    Explain, direct navigation to the real feature) are completely unaffected - this only
      //    governs what the Companion offers WITHOUT being asked.
      //  - 'normal' (default): every contextual and 'core'-tier step (the six foundational
      //    milestones: intake/pattern/strategy/session/scenario/trade-plan) - "foundational
      //    next-step guidance" - but never a 'progression'-tier step (currently just
      //    pattern_report - a purely supplementary, later-stage suggestion, not a foundational
      //    gap).
      //  - 'high': everything 'normal' shows, plus 'progression'-tier steps too - "may
      //    additionally surface optional educational/progression guidance." Still exactly one
      //    card at a time (pickNextStep() below still returns a single top step); still subject
      //    to the same safety/workflow block and the orchestrator's own cooldown (shorter at
      //    'high' than 'normal', never zero) - see ai-companion-orchestrator.js.
      var initiative = (profileState.preferences || {}).initiativePreference || 'normal';
      var contextual = step.priority >= 500;
      if (!contextual) {
        if (initiative === 'low') return false;
        if (initiative === 'normal' && step.tier === 'progression') return false;
      }
      if (step.optional && profileState.skippedOptional.indexOf(step.id) > -1) return false;
      if (profileState.snoozedSteps[step.id] && new Date(profileState.snoozedSteps[step.id]).getTime() > Date.now()) return false;
      var dedupeKey = dedupeKeyFor(step, ctx);
      if (profileState.dismissedSteps[dedupeKey]) return false;
      return true;
    });
  }

  // A step's identity for dismiss/dedupe purposes includes the real milestone it targets where
  // one exists (e.g. which Pattern's report), so completing a NEW milestone of the same step type
  // is recognized as a genuinely new nudge rather than staying permanently suppressed by an old
  // dismissal - "journey:{stepId}:{relevantVersionOrMilestone}", never a bare timestamp.
  function dedupeKeyFor(step, ctx) {
    if (step.id === 'pattern_report' && ctx.reportablePattern) return 'journey:pattern_report:' + ctx.reportablePattern.id;
    if (step.id === 'post_trade_reflection' && ctx.reflectionDueTrade) return 'journey:post_trade_reflection:' + ctx.reflectionDueTrade.id;
    if (step.id === 'open_trade_attention' && ctx.openTrade) return 'journey:open_trade_attention:' + ctx.openTrade.id;
    return 'journey:' + step.id;
  }

  function currentGoalDomainBoost(step, profileState) {
    return profileState.currentGoal && step.domain === profileState.currentGoal ? 500 : 0;
  }

  function pickNextStep(ctx, profileState) {
    var candidates = eligibleSteps(ctx, profileState);
    if (!candidates.length) return null;
    candidates.sort(function (a, b) {
      return (b.priority + currentGoalDomainBoost(b, profileState)) - (a.priority + currentGoalDomainBoost(a, profileState));
    });
    return candidates[0];
  }

  // The overall phase (§5) is the phase of the top real gap among the FOUNDATIONAL milestones, in
  // phase order - independent of momentary contextual steps (an open Trade or a due Reflection
  // don't retroactively make a fresh user "in the EXECUTE phase" for onboarding-guidance purposes;
  // they are surfaced by nextBestStep()'s own higher priority instead, per §13).
  var FOUNDATIONAL_ORDER = ['intake', 'pattern_create', 'strategy_create', 'session_create', 'scenario_plan', 'trade_plan'];
  function currentPhase(ctx, profileState) {
    var s = steps();
    for (var i = 0; i < FOUNDATIONAL_ORDER.length; i += 1) {
      var step = s.get(FOUNDATIONAL_ORDER[i]);
      if (!step) continue;
      if (step.optional && profileState.skippedOptional.indexOf(step.id) > -1) continue;
      try { if (!step.completed(ctx)) return step.phase; } catch (_) { continue; }
    }
    if (ctx.openTrade) return 'EXECUTE';
    if (ctx.reflectionDueTrade) return 'REFLECT';
    return 'IMPROVE';
  }

  function completedMilestoneIds(ctx, profileState) {
    var s = steps();
    return FOUNDATIONAL_ORDER.filter(function (id) {
      var step = s.get(id);
      if (!step) return false;
      try { return step.completed(ctx); } catch (_) { return false; }
    }).concat(profileState.skippedOptional.filter(function (id) { return FOUNDATIONAL_ORDER.indexOf(id) > -1; }).map(function (id) { return id + ':skipped'; }));
  }

  // GUIDE/TEACHER/COMPANION response stance (§10) - a plain, deterministic label passed to the
  // model as reference context, never a second brain deciding anything on its own.
  function responseStance(ctx, nextStep, explicitExplain) {
    if (explicitExplain) return 'TEACHER';
    if (ctx.openTrade || ctx.reflectionDueTrade) return 'COMPANION';
    if (nextStep) return 'GUIDE';
    return 'COMPANION';
  }

  function snapshot(options) {
    var opts = options || {};
    var profileStoreRef = profileStore();
    var profileState = profileStoreRef ? profileStoreRef.load() : { skippedOptional: [], snoozedSteps: {}, dismissedSteps: {}, currentGoal: null, preferences: { initiativePreference: 'normal' } };
    var ctx = buildContext();
    if (!ctx) return null;
    ctx.raw = opts.rawContext || null;

    var blocked = safetyOrWorkflowActive();
    var nextStep = blocked ? null : pickNextStep(ctx, profileState);
    var phase = currentPhase(ctx, profileState);
    var completed = completedMilestoneIds(ctx, profileState);
    var i18n = window.TradeJournalAII18n;

    var result = {
      phase: phase,
      completedMilestones: completed,
      optionalSkippedMilestones: profileState.skippedOptional.slice(),
      activeContext: { openTradeId: ctx.openTrade ? ctx.openTrade.id : null, reflectionDueTradeId: ctx.reflectionDueTrade ? ctx.reflectionDueTrade.id : null, reportablePatternId: ctx.reportablePattern ? ctx.reportablePattern.id : null },
      blockers: blocked ? ['safety_or_workflow_active'] : [],
      nextBestStep: nextStep ? {
        id: nextStep.id, phase: nextStep.phase, domain: nextStep.domain, optional: !!nextStep.optional,
        dedupeKey: dedupeKeyFor(nextStep, ctx),
        title: i18n ? i18n.t(nextStep.titleKey) : nextStep.titleKey,
        why: i18n ? i18n.t(nextStep.whyKey) : nextStep.whyKey,
        explainPrompt: i18n ? i18n.t(nextStep.explainKey) : nextStep.explainKey
      } : null,
      educationNeeded: !!(nextStep && (nextStep.id === 'intake' || nextStep.id === 'pattern_create' || nextStep.id === 'strategy_create' || nextStep.id === 'session_create' || nextStep.id === 'scenario_plan' || nextStep.id === 'trade_plan')),
      currentGoal: profileState.currentGoal,
      evidence: { openTradeId: ctx.openTrade ? ctx.openTrade.id : null, reflectionDueTradeId: ctx.reflectionDueTrade ? ctx.reflectionDueTrade.id : null }
    };
    lastSnapshot = { at: new Date().toISOString(), phase: result.phase, nextStepId: result.nextBestStep ? result.nextBestStep.id : null, completedMilestones: result.completedMilestones, blockers: result.blockers, responseStance: responseStance(ctx, nextStep, false) };
    return { result: result, ctx: ctx, profileState: profileState, nextStepDef: nextStep };
  }

  function evaluate() { var s = snapshot(); return s ? s.result : null; }
  function nextBestStep() { var s = snapshot(); return s ? s.result.nextBestStep : null; }
  function milestones() { var s = snapshot(); return s ? { completed: s.result.completedMilestones, skipped: s.result.optionalSkippedMilestones } : { completed: [], skipped: [] }; }

  function explainNextStep() {
    var s = snapshot();
    if (!s || !s.result.nextBestStep) return null;
    return { title: s.result.nextBestStep.title, why: s.result.nextBestStep.why, explainPrompt: s.result.nextBestStep.explainPrompt };
  }

  // The trimmed, model-facing package (§11) - read-only reference data for chat-dock-core.js to
  // attach to sendChat(), rendered server-side under its own COMPANION CONTEXT header exactly like
  // productContext's three existing headers (server/pattern-ai-server.mjs's
  // buildProductContextText()). Deliberately excludes raw Mental Health content - see
  // docs/ai/companion-profile.md's privacy boundary.
  function companionContext(options) {
    var s = snapshot(options);
    if (!s) return null;
    var prefs = s.profileState.preferences || {};
    return {
      phase: s.result.phase,
      nextBestStep: s.result.nextBestStep ? { id: s.result.nextBestStep.id, title: s.result.nextBestStep.title, why: s.result.nextBestStep.why } : null,
      responseStance: responseStance(s.ctx, s.nextStepDef, !!(options && options.explicitExplain)),
      communicationPreferences: { experienceLevel: prefs.experienceLevel, explanationDepth: prefs.explanationDepth, teachingPreference: prefs.teachingPreference },
      completedMilestones: s.result.completedMilestones
    };
  }

  // Sanitized dev diagnostic only - never raw store content, matching debugLastPackage()'s own
  // "duration/metadata only" posture (ai-context-builder.js).
  function debugLastSnapshot() { return lastSnapshot; }

  // Journey G UX correction (Voice Companion opening): the small, real-fact snapshot
  // ai-companion-orchestrator.js's voiceOpening() needs to pick which deterministic greeting is
  // true right now - reuses the exact same safety gate and readers nextBestStep() itself already
  // uses (never a second, parallel notion of "is it safe to proactively speak"). `hasSeenWalkthrough`
  // is read here (not just left to the orchestrator) so this one function is the single place that
  // answers "what, if anything, is factually true about this user's Journey state right now" for
  // voice - the orchestrator only turns that into text/i18n choices, never re-derives facts.
  function voiceOpeningContext() {
    var ctx = buildContext();
    var store = profileStore();
    if (!ctx) return { blocked: true };
    return {
      blocked: safetyOrWorkflowActive(),
      openTradeId: ctx.openTrade ? ctx.openTrade.id : null,
      reflectionDueTradeId: ctx.reflectionDueTrade ? ctx.reflectionDueTrade.id : null,
      openSessionId: ctx.openSession ? ctx.openSession.id : null,
      hasSeenWalkthrough: store ? store.hasSeenWalkthrough() : true
    };
  }

  window.TradeJournalAIJourneyEngine = {
    snapshot: evaluate, evaluate: evaluate, nextBestStep: nextBestStep, milestones: milestones,
    explainNextStep: explainNextStep, companionContext: companionContext, debugLastSnapshot: debugLastSnapshot,
    voiceOpeningContext: voiceOpeningContext,
    // Exposed for the orchestrator/UI to resolve dedupe keys and execute a step deterministically
    // without re-deriving snapshot logic of their own.
    dedupeKeyFor: function (stepId) {
      var s = snapshot();
      if (!s) return 'journey:' + stepId;
      var step = steps().get(stepId);
      return step ? dedupeKeyFor(step, s.ctx) : 'journey:' + stepId;
    },
    executeStep: function (stepId, rawContext) {
      var s = snapshot({ rawContext: rawContext });
      var step = steps() && steps().get(stepId);
      if (!s || !step) return;
      step.execute(s.ctx);
    }
  };
}());
