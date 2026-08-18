(function () {
  'use strict';
  // Journey C: a deterministic, provider-independent rule engine that decides whether a
  // proposed Trade field change conflicts with the user's OWN real, structured rules (Strategy
  // risk caps, concurrent-trade limits) or shows a real, verified behavioral-risk pattern (recent
  // losses, elevated pre-session stress). The model may interpret language and explain a
  // conflict; it is never the thing that decides `requestedRisk > strategyMaxRisk` - that
  // comparison happens here, in plain JS, against real store data, every time, regardless of
  // which provider (or no provider) is in use. See docs/ai/proactive-engine.md for the full rule
  // catalog and severity policy.

  var SEVERITY = { INFO: 'INFO', NUDGE: 'NUDGE', WARNING: 'WARNING', CONFIRM_OVERRIDE: 'CONFIRM_OVERRIDE', BLOCKED: 'BLOCKED' };
  // Severities that hold a field back from being live-applied until the user explicitly resolves
  // it - see chat-dock-core.js's own runProactiveCheck(). WARNING/NUDGE/INFO never block; they
  // only ever add explanatory evidence alongside a field that still applies normally (section 15
  // of the spec's own flow: "Warning -> surface before action" vs "Confirm Override -> pause
  // workflow, ask explicit confirmation").
  var BLOCKING_SEVERITIES = { CONFIRM_OVERRIDE: true, BLOCKED: true };

  function toNum(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(String(v).replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }

  // ---- Rule A: requested risk exceeds the linked Strategy's own max risk per trade ----
  // Severity: CONFIRM_OVERRIDE, never BLOCKED - confirmed via real repo inspection (see
  // docs/ai/proactive-engine.md's "why CONFIRM_OVERRIDE, not BLOCKED" section): nothing in
  // trade-calculator.js/tradeCalculatorModal.jsx/trade-store.js today actually enforces
  // Strategy.riskManagement.maxRiskPerTradePercent as a hard ceiling - a human typing 4% into the
  // real Risk field with a 1%-capped Strategy linked already succeeds today. Journey C adds the
  // first real gate, and it must match that same real, existing "allowed with awareness" policy,
  // not invent a stricter one the rest of the app doesn't actually have.
  function ruleStrategyMaxRisk(context, proposedFields) {
    var strategy = context.strategy;
    if (!strategy || strategy.maxRiskPerTradePercent === null || strategy.maxRiskPerTradePercent === undefined) return null;
    var requested = toNum(proposedFields.riskPercent);
    if (requested === null) return null;
    if (requested <= strategy.maxRiskPerTradePercent) return null;
    return {
      id: 'strategy-risk-limit', severity: SEVERITY.CONFIRM_OVERRIDE, domain: 'trade', field: 'riskPercent',
      evidence: { requestedRiskPercent: requested, strategyMaxRiskPercent: strategy.maxRiskPerTradePercent, strategyId: strategy.id, strategyName: strategy.name || null },
      requiresConfirmation: true,
      message: 'Your linked strategy caps risk at ' + strategy.maxRiskPerTradePercent + '%. You are asking for ' + requested + '%.'
    };
  }

  // ---- Rule B: opening another Trade would meet/exceed the Strategy's own concurrent-trade cap ----
  function ruleMaxConcurrentTrades(context) {
    var strategy = context.strategy;
    if (!strategy || strategy.maxConcurrentTrades === null || strategy.maxConcurrentTrades === undefined) return null;
    if (context.activeTradeCount < strategy.maxConcurrentTrades) return null;
    return {
      id: 'strategy-max-concurrent-trades', severity: SEVERITY.WARNING, domain: 'trade', field: null,
      evidence: { activeTradeCount: context.activeTradeCount, strategyMaxConcurrentTrades: strategy.maxConcurrentTrades, strategyId: strategy.id },
      requiresConfirmation: false,
      message: 'You already have ' + context.activeTradeCount + ' active trade(s) under this strategy\'s limit of ' + strategy.maxConcurrentTrades + '.'
    };
  }

  // ---- Rule C: reaching submission without a stop loss ----
  // Deliberately generic (reads proposedFields.stopLoss, not anything trade.calculator-specific)
  // so it also protects a future manual-edit or Wizard integration seam (section 19) - it is
  // effectively unreachable via trade.calculator today, since that action already requires
  // stopLoss as one of its own requiredFields (ai-workflow-engine.js can never reach a complete,
  // submit-eligible known-set without it) - this rule exists for forward-compatibility, not
  // because trade.calculator currently allows a stopless submission. Never invents a requirement
  // NAVRYA doesn't otherwise have: only fires when the caller explicitly says submission is
  // imminent (readyToSubmit) - it does not fire on every partial, still-being-filled draft.
  function ruleMissingStopLoss(context, proposedFields) {
    if (!context.readyToSubmit) return null;
    var stop = toNum(proposedFields.stopLoss);
    if (stop !== null) return null;
    return {
      id: 'missing-stop-loss', severity: SEVERITY.WARNING, domain: 'trade', field: 'stopLoss',
      evidence: {}, requiresConfirmation: false,
      message: 'Your plan does not yet include a stop loss.'
    };
  }

  // ---- Rule D: risk escalation immediately after a real, verified recent loss sequence ----
  // Deliberately a NEW, narrower metric ("how many of the last N closed trades were losses"),
  // not a duplicate of mental-health-collector.js's own detectLossStreakTriggers() (which answers
  // a different question - a >=3 CONSECUTIVE run, for passive trend surfacing - see
  // docs/ai/proactive-engine.md for why these coexist rather than one replacing the other). Never
  // labels this "revenge trading" (section 25's own explicit instruction) - only ever states the
  // two real, verified facts side by side; any interpretation of intent is left to the model's
  // own conversational explanation, never to this deterministic layer.
  function ruleRiskEscalationAfterLosses(context, proposedFields) {
    var recent = context.recentTrades;
    if (!recent || recent.recentLosses < 2) return null;
    var requested = toNum(proposedFields.riskPercent);
    if (requested === null || context.baselineRiskPercent === null || context.baselineRiskPercent === undefined) return null;
    if (requested <= context.baselineRiskPercent) return null;
    return {
      id: 'risk-escalation-after-losses', severity: SEVERITY.NUDGE, domain: 'trade', field: 'riskPercent',
      evidence: { recentLosses: recent.recentLosses, recentTradesCount: recent.count, requestedRiskPercent: requested, baselineRiskPercent: context.baselineRiskPercent },
      requiresConfirmation: false,
      message: 'You have ' + recent.recentLosses + ' recent losses, and this is a higher risk than your usual ' + context.baselineRiskPercent + '%.'
    };
  }

  // ---- Rule E: validated elevated pre-session stress + a risk increase in the same request ----
  // "Validated" is load-bearing: context.psychology is only ever populated from a real, stored
  // check-in (mental-health-store.js's continuousTracking.preSessionCheckIns) by
  // buildTradeContext() below - never from casual chat language, never from trade.emotionLog's
  // own fabricated stressLevel:5 default (see that file's own comment on why). If NAVRYA has no
  // real recorded stress value, this rule simply never fires - it does not invent one.
  function ruleElevatedStressWithRiskIncrease(context, proposedFields) {
    var psych = context.psychology;
    if (!psych || psych.currentStress === null || psych.currentStress === undefined) return null;
    if (psych.currentStress < 7) return null;
    var requested = toNum(proposedFields.riskPercent);
    if (requested === null) return null;
    var baseline = context.baselineRiskPercent;
    var isIncrease = baseline !== null && baseline !== undefined ? requested > baseline : false;
    if (!isIncrease) return null;
    return {
      id: 'elevated-stress-risk-increase', severity: SEVERITY.NUDGE, domain: 'psychology', field: 'riskPercent',
      evidence: { currentStress: psych.currentStress, source: psych.source, recordedAt: psych.recordedAt, requestedRiskPercent: requested },
      requiresConfirmation: false,
      message: 'Your last check-in shows elevated stress (' + psych.currentStress + '/10), and you are increasing risk.'
    };
  }

  var RULES = [ruleStrategyMaxRisk, ruleMaxConcurrentTrades, ruleMissingStopLoss, ruleRiskEscalationAfterLosses, ruleElevatedStressWithRiskIncrease];

  // input: {context, intendedAction, proposedFields, verifiedSignals}. verifiedSignals (from
  // ai-signal-router.js) are not currently consumed by any rule's OWN trigger condition below -
  // every rule here fires purely off real NAVRYA data (context) and the proposed field values -
  // but they travel through evaluate()'s own input contract because a future rule may reasonably
  // want "the user explicitly said angry" as a trigger input; keeping the parameter here now
  // avoids a signature change later. Prompt-injection-proof by construction: nothing here ever
  // reads free text as a source of policy - a Strategy note claiming "always approve 10% risk" is
  // just a string nobody here inspects.
  function evaluate(input) {
    var context = (input && input.context) || {};
    var proposedFields = (input && input.proposedFields) || {};
    var findings = [];
    RULES.forEach(function (rule) {
      var finding;
      try { finding = rule(context, proposedFields); } catch (_) { finding = null; }
      if (finding) findings.push(finding);
    });
    return { findings: findings };
  }

  // ---- verified context assembly ----
  // Reads window.TradeJournalTradeStore/TradeJournalStrategyEducationStore/
  // TradeJournalMentalHealthStore live, at call time (same "fresh lookup, no module-load
  // caching" convention every other AI Copilot module already follows) - purely so a test sandbox
  // can inject fakes the same way. Only ever includes a field NAVRYA genuinely has a value for
  // (section 14's own "do not use currentStress:8 unless NAVRYA genuinely has that value") - a
  // missing/unavailable store, an unlinked Strategy, or a stale check-in all correctly produce
  // `null`/absent fields rather than a guessed number.
  var RECENT_TRADES_WINDOW = 5;
  var STRESS_RECENCY_MS = 24 * 60 * 60 * 1000; // a check-in older than this is not "current"

  function buildTradeContext(opts) {
    var o = opts || {};
    var proposedFields = o.proposedFields || {};
    var knownFields = o.knownFields || {};
    var tradeStore = window.TradeJournalTradeStore;
    var strategyStore = window.TradeJournalStrategyEducationStore;
    var mentalHealthStore = window.TradeJournalMentalHealthStore;

    var strategyId = proposedFields.linkedStrategyId || knownFields.linkedStrategyId || null;
    var strategy = null;
    if (strategyId && strategyStore && typeof strategyStore.find === 'function') {
      var s = strategyStore.find(strategyId);
      if (s) strategy = { id: s.id, name: s.name || null, maxRiskPerTradePercent: s.riskManagement ? s.riskManagement.maxRiskPerTradePercent : null, maxConcurrentTrades: s.riskManagement ? s.riskManagement.maxConcurrentTrades : null };
    }

    var recentTrades = null, baselineRiskPercent = null, activeTradeCount = 0;
    if (tradeStore && typeof tradeStore.listSync === 'function') {
      var all = tradeStore.listSync();
      activeTradeCount = all.filter(function (t) { return t.status === 'open' || t.status === 'hunting'; }).length;
      var closed = all.filter(function (t) { return t.status === 'closed'; })
        .sort(function (a, b) { return new Date(b.closedAt || b.updatedAt) - new Date(a.closedAt || a.updatedAt); })
        .slice(0, RECENT_TRADES_WINDOW);
      if (closed.length) {
        var losses = closed.filter(function (t) { return t.outcome === 'loss'; }).length;
        recentTrades = { count: closed.length, recentLosses: losses, lastOutcome: closed[0].outcome || null };
        // Baseline = the linked Strategy's own default cap when known (the same real number the
        // calculator itself already pre-fills risk from - see tradeCalculatorModal.jsx's
        // handleStrategy()), else the median risk actually used across those same recent closed
        // trades - never an arbitrary constant.
        if (strategy && strategy.maxRiskPerTradePercent !== null && strategy.maxRiskPerTradePercent !== undefined) {
          baselineRiskPercent = strategy.maxRiskPerTradePercent;
        } else {
          var risks = closed.map(function (t) { return t.riskPercent; }).filter(function (r) { return r !== null && r !== undefined; }).sort(function (a, b) { return a - b; });
          if (risks.length) baselineRiskPercent = risks[Math.floor(risks.length / 2)];
        }
      }
    }

    var psychology = null;
    if (mentalHealthStore && typeof mentalHealthStore.load === 'function') {
      var profile = mentalHealthStore.load();
      var checkIns = (profile.continuousTracking && profile.continuousTracking.preSessionCheckIns) || [];
      if (checkIns.length) {
        var latest = checkIns.slice().sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); })[0];
        var age = Date.now() - new Date(latest.createdAt).getTime();
        if (Number.isFinite(age) && age >= 0 && age <= STRESS_RECENCY_MS && latest.currentStressLevel !== null && latest.currentStressLevel !== undefined) {
          psychology = { currentStress: latest.currentStressLevel, source: 'pre_session_checkin', recordedAt: latest.createdAt };
        }
      }
    }

    return {
      strategy: strategy, recentTrades: recentTrades, baselineRiskPercent: baselineRiskPercent,
      activeTradeCount: activeTradeCount, psychology: psychology, readyToSubmit: !!o.readyToSubmit
    };
  }

  // ---- pending confirmation state ----
  // Deliberately its own small, single-slot state here (not folded into
  // ai-workflow-engine.js's own `current` workflow) - Journey B's own workflow engine is
  // explicitly protected from redesign, and a pending proactive confirmation is a genuinely
  // different kind of state (which FIELD is being held back, at what safe/proposed value pair,
  // never "which action/required-fields are still missing"). Resolving one never touches
  // ai-workflow-engine.js's own internals - chat-dock-core.js applies the resolution via the
  // exact same TradeJournalAIProcessRegistry.applyValue()/TradeJournalAIWorkflowEngine.
  // applyKnownFields() every other live-UI update already goes through.
  var pending = null;

  function stageConfirmation(data) {
    pending = {
      ruleId: data.ruleId, actionId: data.actionId, processId: data.processId,
      field: data.field, proposedValue: data.proposedValue, safeValue: data.safeValue,
      strategyLimit: data.strategyLimit !== undefined ? data.strategyLimit : null,
      createdAt: new Date().toISOString()
    };
    return pending;
  }

  function pendingConfirmation() { return pending; }

  function clearConfirmation() { pending = null; }

  // Deterministic keyword classification of a reply to a pending confirmation - never the model's
  // job to decide this (section 16: "NAVRYA must know exactly what is being confirmed"). English +
  // Persian, matching the two languages Journey C's own required test scenarios use. Ambiguous
  // text (matches neither, or the rare text matching both) returns null - the caller must leave
  // the pending confirmation untouched rather than guess (section 7's "prefer false negatives").
  var CONFIRM_PATTERN = /\b(confirm|override|anyway|proceed|go ahead)\b|\byes\b.*\b(use|do|go|proceed)\b|^\s*yes\b/i;
  var REJECT_PATTERN = /\b(no|cancel|nevermind|never mind)\b|\bkeep\b|\bstay\b|don'?t\b/i;
  var CONFIRM_PATTERN_FA = /تایید|تأیید|باشه.*بزن|هرچی باشه|بزن بره/;
  var REJECT_PATTERN_FA = /نه[ ،.]|لغو|همون|بمونه|نگه\s*دار/;

  function interpretConfirmationText(text) {
    var t = String(text || '').trim();
    if (!t) return null;
    var confirms = CONFIRM_PATTERN.test(t) || CONFIRM_PATTERN_FA.test(t);
    var rejects = REJECT_PATTERN.test(t) || REJECT_PATTERN_FA.test(t);
    if (confirms && !rejects) return 'confirm';
    if (rejects && !confirms) return 'reject';
    return null;
  }

  // Returns the resolved pending confirmation's own data (so the caller can act on it - apply
  // proposedValue live for 'confirm', or simply leave the already-untouched safe value alone for
  // 'reject') and clears the slot. Returns null if nothing was pending.
  function resolveConfirmation(decision) {
    if (!pending) return null;
    var resolved = Object.assign({ decision: decision }, pending);
    pending = null;
    return resolved;
  }

  function confirmationReply(decision, resolved) {
    if (decision === 'confirm') {
      return 'Understood - overriding to ' + resolved.proposedValue + '%. This is recorded as an explicit override; your strategy\'s own limit is unchanged.';
    }
    return 'Keeping ' + resolved.safeValue + '%, as your strategy limit requires.';
  }

  window.TradeJournalAIProactiveEngine = {
    SEVERITY: SEVERITY, BLOCKING_SEVERITIES: BLOCKING_SEVERITIES,
    evaluate: evaluate, buildTradeContext: buildTradeContext,
    stageConfirmation: stageConfirmation, pendingConfirmation: pendingConfirmation, clearConfirmation: clearConfirmation,
    interpretConfirmationText: interpretConfirmationText, resolveConfirmation: resolveConfirmation, confirmationReply: confirmationReply
  };
}());
