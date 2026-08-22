(function () {
  'use strict';
  // Journey G (AI Companion & Journey Orchestration). The deterministic step registry - the
  // application-owned "what could the Companion offer next" catalog (ARCHITECTURE.md's Journey G
  // section, docs/ai/journey-engine.md). Every step reads REAL, already-loaded stores directly;
  // nothing here is a duplicate completion flag (ai-companion-profile.js only ever stores what
  // truly cannot be derived - dismissals/snoozes/currentGoal/preferences).
  //
  // A step's `primaryAction` is either {actionId} - resolved via
  // TradeJournalAIActionRegistry.get(actionId).open(), reusing the exact real entry point Journey
  // F's conversational actions already use - or {custom:true}, whose real executor is injected by
  // registerExecutor() from wherever that real open function already lives (character-app.jsx,
  // exactly like every other real action's open() is wired there). Journey G never opens a second,
  // parallel UI path - "Continue" always calls something that already exists.
  var PHASES = ['ORIENTATION', 'KNOW_YOURSELF', 'KNOW_WHAT_YOU_SEE', 'KNOW_WHAT_YOU_DO', 'PLAN', 'EXECUTE', 'REFLECT', 'IMPROVE'];

  function sessionsCache() {
    // Same shared, account-wide real source account-profile-store.js's allSessions() already
    // reads - Section 7.18 Module 1 scopes trading_sessions by user_id alone, and the in-memory
    // replica mirrors that as one shared list, not four character-scoped ones (Phase 3 migration,
    // see ARCHITECTURE.md's Global Data Sync section).
    var workspace = window.TradeJournalWorkspace;
    var list = workspace && typeof workspace.list === 'function' ? workspace.list() : [];
    return Array.isArray(list) ? list.filter(function (s) { return s && s.id; }) : [];
  }

  // Mirrors strategy-education's own completeness checks (account-profile-store.js's
  // positionManagementComplete/riskManagementComplete/overallFrameworkComplete) on purpose - same
  // real fields, duplicated locally rather than exported/shared, matching this codebase's existing
  // convention of small per-file completeness heuristics (e.g. ai-deterministic-extraction.js).
  function strategyComplete(s) {
    var p = s.positionManagement || {}, r = s.riskManagement || {}, o = s.overallFramework || {};
    return !!(p.entryRules && p.stopLossRules && p.exitTargetRules && p.positionSizingRules) &&
      r.maxRiskPerTradePercent != null && r.dailyDrawdownLimitPercent != null && r.totalDrawdownLimitPercent != null &&
      !!(o.description && o.description.trim().length >= 40);
  }
  function executionPlanRecorded(scenario) {
    var plan = (scenario && scenario.executionPlan) || {};
    return !!((plan.entryPrices || []).length && plan.stopLoss && plan.takeProfit);
  }
  function patternComplete(p) { return !!(p && p.name && p.description && (p.stages || []).length >= 3); }

  // ------------------------------------------------------------------------------------------
  // Real-data readers, each defensive against an absent store (a page mid-load, or a test sandbox
  // that only wires up part of the app) - never throw, just report "not available yet".
  // ------------------------------------------------------------------------------------------
  function mentalHealthProfile() {
    var store = window.TradeJournalMentalHealthStore;
    try { return store ? store.load() : null; } catch (_) { return null; }
  }
  function patterns() { var store = window.TradeJournalPatternStore; return store && store.listSync ? store.listSync() : []; }
  function strategies() { var store = window.TradeJournalStrategyEducationStore; return store && store.listSync ? store.listSync() : []; }
  function trades() { var store = window.TradeJournalTradeStore; return store && store.listSync ? store.listSync() : []; }

  function firstIncompleteReflectionTrade() {
    var profile = mentalHealthProfile();
    var reflected = {};
    ((profile && profile.continuousTracking && profile.continuousTracking.postTradeReflections) || []).forEach(function (r) { if (r && r.tradeId) reflected[r.tradeId] = true; });
    return trades().find(function (t) { return t && t.status === 'closed' && !reflected[t.id]; }) || null;
  }
  function firstOpenTrade() { return trades().find(function (t) { return t && t.status === 'open'; }) || null; }
  // Voice Companion opening (Journey G UX correction): a genuinely open Session, distinct from
  // scenario_plan's own "does a real executionPlan exist yet" check - this is the raw "is there a
  // Session the user could resume right now" fact the fresh RETURNING-USER voice greeting needs.
  function firstOpenSession() { return sessionsCache().find(function (s) { return s && s.status === 'open'; }) || null; }
  function patternWithReport() {
    var store = window.TradeJournalPatternStore;
    if (!store || !store.scenarioReport) return null;
    return patterns().find(function (p) {
      if (!patternComplete(p)) return false;
      var report = store.scenarioReport(p.id);
      return report && report.hasData && (report.scenarios || []).length >= 5;
    }) || null;
  }

  var executors = {};
  function registerExecutor(stepId, fn) { executors[stepId] = fn; }
  function runExecutor(stepId, context) { if (executors[stepId]) return executors[stepId](context); }

  function actionOpen(actionId, context) {
    var registry = window.TradeJournalAIActionRegistry;
    var action = registry && registry.get(actionId);
    if (!action) return;
    try { action.open(context); } catch (_) { /* best-effort, matching ai-workflow-engine.js's own open() handling */ }
  }

  // Each step: id, phase, domain, optional, priority (higher = more urgent), tier, i18n keys, and
  // completed/available(ctx) predicates. `ctx` is the ai-journey-engine.js snapshot's raw inputs
  // (see that file) - patterns/strategies/trades/sessions/profile, already read once per
  // evaluate() call so no step re-reads the same store twice.
  //
  // `tier` (Item 2 of the Journey G follow-up - see ai-journey-engine.js's own comment on
  // eligibleSteps() for the full Low/Normal/High semantics): 'core' = a contextual/lifecycle step
  // or a foundational onboarding milestone, shown at 'normal' initiative and above. 'progression'
  // = a purely supplementary, later-stage suggestion (currently just pattern_report), shown only
  // at 'high' initiative. Irrelevant for the two priority>=500 contextual steps (they bypass the
  // tier check entirely - real lifecycle moments always surface, at every initiative level), kept
  // here anyway for documentation completeness.
  var STEPS = [
    {
      id: 'open_trade_attention', phase: 'EXECUTE', domain: 'trades', optional: true, priority: 1000, tier: 'core',
      titleKey: 'companionStepOpenTradeTitle', whyKey: 'companionStepOpenTradeWhy', explainKey: 'companionStepOpenTradeExplain',
      available: function (ctx) { return !!ctx.openTrade; },
      completed: function () { return false; }, // contextual - "done" the instant no open Trade exists (available() false)
      execute: function (ctx) { runExecutor('open_trade_attention', ctx); }
    },
    {
      id: 'post_trade_reflection', phase: 'REFLECT', domain: 'psychology', optional: false, priority: 900, tier: 'core',
      titleKey: 'companionStepReflectionTitle', whyKey: 'companionStepReflectionWhy', explainKey: 'companionStepReflectionExplain',
      available: function (ctx) { return !!ctx.reflectionDueTrade; },
      completed: function () { return false; },
      execute: function (ctx) { runExecutor('post_trade_reflection', ctx); }
    },
    {
      id: 'intake', phase: 'KNOW_YOURSELF', domain: 'psychology', optional: true, priority: 80, tier: 'core',
      titleKey: 'companionStepIntakeTitle', whyKey: 'companionStepIntakeWhy', explainKey: 'companionStepIntakeExplain',
      available: function () { return true; },
      completed: function (ctx) { return !!(ctx.profile && ctx.profile.intake && ctx.profile.intake.completed); },
      execute: function (ctx) { runExecutor('intake', ctx); }
    },
    {
      id: 'pattern_create', phase: 'KNOW_WHAT_YOU_SEE', domain: 'patterns', optional: false, priority: 70, tier: 'core',
      titleKey: 'companionStepPatternTitle', whyKey: 'companionStepPatternWhy', explainKey: 'companionStepPatternExplain',
      available: function () { return true; },
      completed: function (ctx) { return ctx.patterns.some(patternComplete); },
      execute: function (ctx) { actionOpen('pattern.create', ctx.raw); }
    },
    {
      id: 'strategy_create', phase: 'KNOW_WHAT_YOU_DO', domain: 'strategies', optional: false, priority: 60, tier: 'core',
      titleKey: 'companionStepStrategyTitle', whyKey: 'companionStepStrategyWhy', explainKey: 'companionStepStrategyExplain',
      available: function () { return true; },
      completed: function (ctx) { return ctx.strategies.some(strategyComplete); },
      execute: function (ctx) { actionOpen('strategy.create', ctx.raw); }
    },
    {
      id: 'session_create', phase: 'PLAN', domain: 'sessions', optional: false, priority: 50, tier: 'core',
      titleKey: 'companionStepSessionTitle', whyKey: 'companionStepSessionWhy', explainKey: 'companionStepSessionExplain',
      available: function () { return true; },
      completed: function (ctx) { return ctx.sessions.some(function (s) { return s.market && s.timeframe && s.date; }); },
      execute: function (ctx) { actionOpen('session.create', ctx.raw); }
    },
    {
      id: 'scenario_plan', phase: 'PLAN', domain: 'sessions', optional: false, priority: 45, tier: 'core',
      titleKey: 'companionStepScenarioTitle', whyKey: 'companionStepScenarioWhy', explainKey: 'companionStepScenarioExplain',
      available: function (ctx) { return ctx.sessions.some(function (s) { return s.market && s.timeframe && s.date; }); },
      completed: function (ctx) {
        return ctx.sessions.some(function (s) { return (s.entries || []).some(function (e) { return (e.scenarios || []).some(executionPlanRecorded); }); });
      },
      execute: function (ctx) { runExecutor('scenario_plan', ctx); }
    },
    {
      id: 'trade_plan', phase: 'PLAN', domain: 'trades', optional: false, priority: 40, tier: 'core',
      titleKey: 'companionStepTradePlanTitle', whyKey: 'companionStepTradePlanWhy', explainKey: 'companionStepTradePlanExplain',
      available: function () { return true; },
      completed: function (ctx) { return ctx.trades.some(function (t) { return t.entryPrice != null && t.stopLoss != null && (t.takeProfits || []).length && t.direction; }); },
      execute: function (ctx) { actionOpen('trade.calculator', ctx.raw); }
    },
    {
      id: 'pattern_report', phase: 'IMPROVE', domain: 'patterns', optional: true, priority: 10, tier: 'progression',
      titleKey: 'companionStepPatternReportTitle', whyKey: 'companionStepPatternReportWhy', explainKey: 'companionStepPatternReportExplain',
      available: function (ctx) { return !!ctx.reportablePattern; },
      completed: function () { return false; }, // contextual - nothing marks a report "reviewed"; dismiss/snooze governs repetition
      execute: function (ctx) { runExecutor('pattern_report', ctx); }
    }
  ];

  function list() { return STEPS.slice(); }
  function get(id) { return STEPS.find(function (s) { return s.id === id; }) || null; }

  window.TradeJournalAIJourneySteps = {
    PHASES: PHASES, list: list, get: get,
    registerExecutor: registerExecutor,
    // Exposed for ai-journey-engine.js's snapshot building - kept here (not duplicated there) so
    // every reader of "what counts as complete" stays in exactly one place.
    readers: {
      sessionsCache: sessionsCache, mentalHealthProfile: mentalHealthProfile, patterns: patterns, strategies: strategies, trades: trades,
      firstIncompleteReflectionTrade: firstIncompleteReflectionTrade, firstOpenTrade: firstOpenTrade, firstOpenSession: firstOpenSession, patternWithReport: patternWithReport,
      patternComplete: patternComplete, strategyComplete: strategyComplete
    }
  };
}());
