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

  // Persian Voice Quality gate: found while auditing every string this module hands to
  // chat-dock-core.js's buildProactiveReply()/confirmationReply() for the spoken/written safety
  // path (gate section 24: "safety language must still sound human") - every message below was
  // hardcoded English ONLY, regardless of the user's actual language, so a Persian (or Arabic/
  // Spanish) conversation hitting Journey C's own risk-cap confirmation spoke/wrote English back.
  // Not a voice-specific bug (the WRITTEN reply was wrong too) but the single highest-impact fix
  // for "Persian sounds natural" specifically because no prosody/voice change can fix a reply in
  // the wrong language. `pick()` mirrors ai-i18n.js's own language-table shape one level down (this
  // module deliberately has no load-time dependency on window.TradeJournalAII18n - only a fresh,
  // call-time read, matching buildTradeContext()'s own "no module-load caching" convention - so
  // this stays correct however this script happens to load relative to ai-i18n.js on a given page).
  // `language` defaults to 'en' everywhere below so every pre-existing caller (this file's own test
  // suite included) that doesn't pass one keeps the exact original English text, byte for byte.
  function pick(language, table) { return table[language] || table.en; }

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
  function ruleStrategyMaxRisk(context, proposedFields, language) {
    var strategy = context.strategy;
    if (!strategy || strategy.maxRiskPerTradePercent === null || strategy.maxRiskPerTradePercent === undefined) return null;
    var requested = toNum(proposedFields.riskPercent);
    if (requested === null) return null;
    if (requested <= strategy.maxRiskPerTradePercent) return null;
    return {
      id: 'strategy-risk-limit', severity: SEVERITY.CONFIRM_OVERRIDE, domain: 'trade', field: 'riskPercent',
      evidence: { requestedRiskPercent: requested, strategyMaxRiskPercent: strategy.maxRiskPerTradePercent, strategyId: strategy.id, strategyName: strategy.name || null },
      requiresConfirmation: true,
      message: pick(language, {
        en: 'Your linked strategy caps risk at ' + strategy.maxRiskPerTradePercent + '%. You are asking for ' + requested + '%.',
        fa: 'سقف ریسک استراتژیت ' + strategy.maxRiskPerTradePercent + '%‌ه، ولی الان ' + requested + '% خواستی.',
        ar: 'سقف الريسك في استراتيجيتك ' + strategy.maxRiskPerTradePercent + '%، لكنك طلبت الآن ' + requested + '%.',
        es: 'El límite de riesgo de tu estrategia es ' + strategy.maxRiskPerTradePercent + '%, pero ahora pediste ' + requested + '%.'
      })
    };
  }

  // ---- Rule B: opening another Trade would meet/exceed the Strategy's own concurrent-trade cap ----
  function ruleMaxConcurrentTrades(context, proposedFields, language) {
    var strategy = context.strategy;
    if (!strategy || strategy.maxConcurrentTrades === null || strategy.maxConcurrentTrades === undefined) return null;
    if (context.activeTradeCount < strategy.maxConcurrentTrades) return null;
    return {
      id: 'strategy-max-concurrent-trades', severity: SEVERITY.WARNING, domain: 'trade', field: null,
      evidence: { activeTradeCount: context.activeTradeCount, strategyMaxConcurrentTrades: strategy.maxConcurrentTrades, strategyId: strategy.id },
      requiresConfirmation: false,
      message: pick(language, {
        en: 'You already have ' + context.activeTradeCount + ' active trade(s) under this strategy\'s limit of ' + strategy.maxConcurrentTrades + '.',
        fa: 'همین الان ' + context.activeTradeCount + ' معامله باز داری، که سقف این استراتژیه (' + strategy.maxConcurrentTrades + ').',
        ar: 'لديك الآن ' + context.activeTradeCount + ' صفقة نشطة، وهو سقف هذه الاستراتيجية (' + strategy.maxConcurrentTrades + ').',
        es: 'Ya tienes ' + context.activeTradeCount + ' operación(es) activa(s), el límite de esta estrategia es ' + strategy.maxConcurrentTrades + '.'
      })
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
  function ruleMissingStopLoss(context, proposedFields, language) {
    if (!context.readyToSubmit) return null;
    var stop = toNum(proposedFields.stopLoss);
    if (stop !== null) return null;
    return {
      id: 'missing-stop-loss', severity: SEVERITY.WARNING, domain: 'trade', field: 'stopLoss',
      evidence: {}, requiresConfirmation: false,
      message: pick(language, {
        en: 'Your plan does not yet include a stop loss.',
        fa: 'پلنت هنوز حد ضرر نداره.',
        ar: 'خطتك لا تتضمن وقف خسارة بعد.',
        es: 'Tu plan aún no incluye un stop loss.'
      })
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
  function ruleRiskEscalationAfterLosses(context, proposedFields, language) {
    var recent = context.recentTrades;
    if (!recent || recent.recentLosses < 2) return null;
    var requested = toNum(proposedFields.riskPercent);
    if (requested === null || context.baselineRiskPercent === null || context.baselineRiskPercent === undefined) return null;
    if (requested <= context.baselineRiskPercent) return null;
    return {
      id: 'risk-escalation-after-losses', severity: SEVERITY.NUDGE, domain: 'trade', field: 'riskPercent',
      evidence: { recentLosses: recent.recentLosses, recentTradesCount: recent.count, requestedRiskPercent: requested, baselineRiskPercent: context.baselineRiskPercent },
      requiresConfirmation: false,
      message: pick(language, {
        en: 'You have ' + recent.recentLosses + ' recent losses, and this is a higher risk than your usual ' + context.baselineRiskPercent + '%.',
        fa: recent.recentLosses + ' تا از معاملات اخیرت ضرر بوده، و این ریسک از ریسک معمولت (' + context.baselineRiskPercent + '%) بیشتره.',
        ar: 'لديك ' + recent.recentLosses + ' خسائر أخيرة، وهذا الريسك أعلى من المعتاد (' + context.baselineRiskPercent + '%).',
        es: 'Tienes ' + recent.recentLosses + ' pérdidas recientes, y este riesgo es mayor que tu ' + context.baselineRiskPercent + '% habitual.'
      })
    };
  }

  // ---- Rule E: validated elevated pre-session stress + a risk increase in the same request ----
  // "Validated" is load-bearing: context.psychology is only ever populated from a real, stored
  // check-in (mental-health-store.js's continuousTracking.preSessionCheckIns) by
  // buildTradeContext() below - never from casual chat language, never from trade.emotionLog's
  // own fabricated stressLevel:5 default (see that file's own comment on why). If NAVRYA has no
  // real recorded stress value, this rule simply never fires - it does not invent one.
  function ruleElevatedStressWithRiskIncrease(context, proposedFields, language) {
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
      message: pick(language, {
        en: 'Your last check-in shows elevated stress (' + psych.currentStress + '/10), and you are increasing risk.',
        fa: 'آخرین چک‌این‌ات استرس بالا نشون می‌ده (' + psych.currentStress + ' از ۱۰)، و داری ریسک رو هم بیشتر می‌کنی.',
        ar: 'آخر تسجيل دخول لك يُظهر توتراً مرتفعاً (' + psych.currentStress + '/10)، وأنت ترفع الريسك أيضاً.',
        es: 'Tu último registro muestra estrés elevado (' + psych.currentStress + '/10), y estás aumentando el riesgo.'
      })
    };
  }

  // ---- Rule F: no active account exists yet, and a trade is close to being submitted ----
  // Accounts domain defect #8. Deliberately gated on readyToSubmit (same restraint
  // ruleMissingStopLoss above uses) - firing on every keystroke while the account list is
  // legitimately empty would be noise, not guidance. INFO only: NAVRYA never blocks an
  // accountless trade from the AI side (the server's own ACCOUNT_REQUIRED check only applies
  // once at least one active account exists - see server/db/repo.*.mjs's trades.upsert()), so an
  // AI-filled submit for a genuinely account-less user must stay fully unblocked.
  function ruleNoAccountOnboarding(context, proposedFields, language) {
    if (!context.readyToSubmit) return null;
    if (context.hasActiveAccounts) return null;
    if (context.accountId) return null;
    return {
      id: 'account-onboarding', severity: SEVERITY.INFO, domain: 'account', field: null,
      evidence: {}, requiresConfirmation: false,
      message: pick(language, {
        en: 'You do not have a trading account set up yet - adding one lets NAVRYA track your real balance and risk against it.',
        fa: 'هنوز حساب معاملاتی‌ای تنظیم نکردی - با اضافه‌کردنش، ناوریا می‌تونه موجودی و ریسک واقعیت رو دنبال کنه.',
        ar: 'لا يوجد لديك حساب تداول بعد - إضافة واحد يتيح لناڤريا تتبع رصيدك ومخاطرك الحقيقيين.',
        es: 'Aún no tienes una cuenta de trading configurada - añadir una permite que NAVRYA siga tu saldo y riesgo reales.'
      })
    };
  }

  // ---- Rule G: the selected account is archived - AI-side heads-up, never the enforcement ----
  // Real enforcement is server-side (ACCOUNT_ARCHIVED, defect #3) and the visible Select already
  // excludes archived accounts from its own options - this only covers the narrow case of an
  // account that WAS active when picked earlier in the same conversation and has since been
  // archived elsewhere (another tab, the Accounts screen). Never silently proceeds as if nothing
  // is wrong.
  function ruleAccountArchivedSelection(context, proposedFields, language) {
    if (!context.accountArchived) return null;
    return {
      id: 'account-archived-selection', severity: SEVERITY.WARNING, domain: 'account', field: 'accountId',
      evidence: { accountId: context.accountId }, requiresConfirmation: false,
      message: pick(language, {
        en: 'That account is archived - it can no longer be selected for a new trade. Pick an active account.',
        fa: 'اون حساب آرشیو شده - دیگه نمی‌شه برای معامله جدید انتخابش کرد. یه حساب فعال انتخاب کن.',
        ar: 'هذا الحساب مؤرشف - لم يعد بالإمكان اختياره لصفقة جديدة. اختر حساباً نشطاً.',
        es: 'Esa cuenta está archivada - ya no se puede seleccionar para una nueva operación. Elige una cuenta activa.'
      })
    };
  }

  // ---- Rule H: the proposed risk against the linked account's OWN real, computed daily
  // allowance (accounts-engine.js's evaluatePretrade - the exact same deterministic function the
  // visible Pre-trade Check tab already uses, never a second, parallel risk calculation) ----
  function ruleAccountPretradeRisk(context, proposedFields, language) {
    var pretrade = context.accountPretrade;
    if (!pretrade || pretrade.riskAmount === null) return null;
    if (pretrade.basisInsufficient) {
      return {
        id: 'account-daily-loss-basis-insufficient', severity: SEVERITY.NUDGE, domain: 'account', field: null,
        evidence: { accountId: context.accountId }, requiresConfirmation: false,
        message: pick(language, {
          en: 'This account\'s daily-loss rule counts floating P/L on an open position, and NAVRYA cannot verify that right now - it cannot confirm this trade is inside the limit.',
          fa: 'قانون ضرر روزانه این حساب سود/زیان شناور یه پوزیشن باز رو هم حساب می‌کنه، و ناوریا الان نمی‌تونه اونو تأیید کنه - نمی‌تونه بگه این معامله داخل سقفه یا نه.',
          ar: 'قاعدة الخسارة اليومية لهذا الحساب تحتسب الربح/الخسارة العائم لمركز مفتوح، ولا يمكن لناڤريا التحقق من ذلك الآن - لا يمكنها تأكيد أن هذه الصفقة ضمن الحد.',
          es: 'La regla de pérdida diaria de esta cuenta cuenta el P/L flotante de una posición abierta, y NAVRYA no puede verificarlo ahora - no puede confirmar que esta operación está dentro del límite.'
        })
      };
    }
    if (pretrade.tone === 'bad') {
      return {
        // field must match whichever path the caller actually proposed (riskAmount in "amount"
        // mode, riskPercent in "percent" mode) - chat-dock-core.js's runProactiveCheck() filters
        // the blocked value out of fieldsToApply by exact path match, so naming the wrong one
        // here would hold back nothing and let the unconfirmed risky value apply anyway.
        id: 'account-daily-loss-exceeded', severity: SEVERITY.CONFIRM_OVERRIDE, domain: 'account', field: context.accountRiskField || 'riskAmount',
        evidence: {
          accountId: context.accountId, requestedRiskAmount: pretrade.riskAmount, requestedRiskPercent: proposedFields ? toNum(proposedFields.riskPercent) : null,
          allowanceLeft: pretrade.allowanceLeft, allowanceAmount: pretrade.allowanceAmount
        },
        requiresConfirmation: true,
        message: pick(language, {
          en: 'This trade risks ' + pretrade.riskAmount.toFixed(2) + ' against only ' + (pretrade.allowanceLeft || 0).toFixed(2) + ' left of this account\'s daily allowance.',
          fa: 'این معامله ' + pretrade.riskAmount.toFixed(2) + ' ریسک داره، در حالی که فقط ' + (pretrade.allowanceLeft || 0).toFixed(2) + ' از سقف روزانه این حساب مونده.',
          ar: 'هذه الصفقة تخاطر بمبلغ ' + pretrade.riskAmount.toFixed(2) + ' مقابل ' + (pretrade.allowanceLeft || 0).toFixed(2) + ' فقط المتبقي من المخصص اليومي لهذا الحساب.',
          es: 'Esta operación arriesga ' + pretrade.riskAmount.toFixed(2) + ' contra solo ' + (pretrade.allowanceLeft || 0).toFixed(2) + ' restantes de la asignación diaria de esta cuenta.'
        })
      };
    }
    if (pretrade.tone === 'warn') {
      return {
        id: 'account-daily-loss-close', severity: SEVERITY.WARNING, domain: 'account', field: null,
        evidence: { accountId: context.accountId, requestedRiskAmount: pretrade.riskAmount, allowanceLeft: pretrade.allowanceLeft },
        requiresConfirmation: false,
        message: pick(language, {
          en: 'This uses a large share of what is left of this account\'s daily allowance (' + (pretrade.allowanceLeft || 0).toFixed(2) + ' remaining).',
          fa: 'این معامله بخش بزرگی از سقف روزانه باقی‌مونده این حساب رو مصرف می‌کنه (' + (pretrade.allowanceLeft || 0).toFixed(2) + ' باقی‌مونده).',
          ar: 'هذا يستخدم حصة كبيرة مما تبقى من المخصص اليومي لهذا الحساب (' + (pretrade.allowanceLeft || 0).toFixed(2) + ' متبقٍ).',
          es: 'Esto usa una parte grande de lo que queda de la asignación diaria de esta cuenta (' + (pretrade.allowanceLeft || 0).toFixed(2) + ' restante).'
        })
      };
    }
    return null;
  }

  // ---- Rule I: the linked account is already sitting in DANGER/VIOLATED on its own real,
  // configured rules - independent of whatever risk is being proposed right now ----
  function ruleAccountWorstState(context, proposedFields, language) {
    var state = context.accountWorstRuleState;
    if (state !== 'danger' && state !== 'violated') return null;
    return {
      id: 'account-worst-state-' + state, severity: state === 'violated' ? SEVERITY.WARNING : SEVERITY.NUDGE, domain: 'account', field: null,
      evidence: { accountId: context.accountId, state: state }, requiresConfirmation: false,
      message: pick(language, {
        en: 'This account is currently in ' + (state === 'violated' ? 'a violated' : 'a danger') + ' state on one of its own rules.',
        fa: 'این حساب الان روی یکی از قوانین خودش در وضعیت ' + (state === 'violated' ? 'نقض‌شده' : 'خطر') + ' قرار داره.',
        ar: 'هذا الحساب حالياً في حالة ' + (state === 'violated' ? 'مخالفة' : 'خطر') + ' على إحدى قواعده الخاصة.',
        es: 'Esta cuenta está actualmente en un estado de ' + (state === 'violated' ? 'incumplimiento' : 'peligro') + ' en una de sus propias reglas.'
      })
    };
  }

  // ---- Rule J: real, evidence-backed behaviour signal on THIS account (accounts-engine.js's
  // computeDiscipline - never derived from profitability, only fires above its own minimum real
  // sample size, exactly like the visible Behaviour tab) ----
  function ruleAccountDisciplineSignal(context, proposedFields, language) {
    var d = context.accountDiscipline;
    if (!d || d.score === null) return null;
    if (!d.riskRuleViolations && !d.revengeCount) return null;
    return {
      id: 'account-discipline-signal', severity: SEVERITY.NUDGE, domain: 'account', field: null,
      evidence: { accountId: context.accountId, riskRuleViolations: d.riskRuleViolations, riskRuleSample: d.riskRuleSample, revengeCount: d.revengeCount, revengeSample: d.revengeSample },
      requiresConfirmation: false,
      message: pick(language, {
        en: 'On this account, ' + d.riskRuleViolations + ' of your last ' + d.riskRuleSample + ' trades exceeded your own risk rule, and ' + d.revengeCount + ' were re-entries within 10 minutes of a loss.',
        fa: 'توی این حساب، ' + d.riskRuleViolations + ' تا از ' + d.riskRuleSample + ' معامله اخیرت از قانون ریسک خودت رد شده، و ' + d.revengeCount + ' تاشون ظرف ۱۰ دقیقه بعد یه ضرر دوباره وارد شدن.',
        ar: 'في هذا الحساب، ' + d.riskRuleViolations + ' من آخر ' + d.riskRuleSample + ' صفقة تجاوزت قاعدة المخاطرة الخاصة بك، و' + d.revengeCount + ' كانت دخولاً جديداً خلال 10 دقائق من خسارة.',
        es: 'En esta cuenta, ' + d.riskRuleViolations + ' de tus últimas ' + d.riskRuleSample + ' operaciones superaron tu propia regla de riesgo, y ' + d.revengeCount + ' fueron reentradas dentro de los 10 minutos posteriores a una pérdida.'
      })
    };
  }

  var RULES = [
    ruleStrategyMaxRisk, ruleMaxConcurrentTrades, ruleMissingStopLoss, ruleRiskEscalationAfterLosses, ruleElevatedStressWithRiskIncrease,
    ruleNoAccountOnboarding, ruleAccountArchivedSelection, ruleAccountPretradeRisk, ruleAccountWorstState, ruleAccountDisciplineSignal
  ];

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
    // Persian Voice Quality gate: defaults to 'en' so any pre-existing caller that never passed a
    // language (this file's own test suite included) gets byte-for-byte the same English text as
    // before this pass - only chat-dock-core.js's own runProactiveCheck() actually threads the
    // real i18n.language() through today.
    var language = (input && input.language) || 'en';
    var findings = [];
    RULES.forEach(function (rule) {
      var finding;
      try { finding = rule(context, proposedFields, language); } catch (_) { finding = null; }
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

  // Same worst-of-configured-rules reduction accountsView.jsx's own worstState() uses - a small
  // local copy, matching this app's established per-module self-contained-helper convention
  // (dashboardView.jsx's own AccountsPanel keeps an identical small copy for the same reason).
  function worstRuleState(groups) {
    var order = ['violated', 'danger', 'insufficient', 'watch', 'progress', 'safe'];
    var worst = null;
    (groups || []).forEach(function (g) {
      (g.items || []).forEach(function (item) {
        if (worst === null || order.indexOf(item.state) < order.indexOf(worst)) worst = item.state;
      });
    });
    return worst;
  }

  function buildTradeContext(opts) {
    var o = opts || {};
    var proposedFields = o.proposedFields || {};
    var knownFields = o.knownFields || {};
    var tradeStore = window.TradeJournalTradeStore;
    var strategyStore = window.TradeJournalStrategyEducationStore;
    var mentalHealthStore = window.TradeJournalMentalHealthStore;
    var accountsStore = window.TradeJournalAccountsStore;
    var accountsEngine = window.TradeJournalAccountsEngine;

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

    // Accounts domain defect #8: every figure here comes straight from accounts-engine.js's own
    // deterministic functions (computeMetrics/evaluatePretrade/evaluateRules/computeDiscipline) -
    // the exact same calls the real Accounts UI's Overview/Pre-trade/Behaviour tabs already make.
    // Nothing here is a second, parallel risk calculation, and an account NAVRYA cannot resolve
    // (no accountId proposed, or the store/engine is not loaded) produces honest nulls, never a
    // fabricated figure.
    var accountId = proposedFields.accountId || knownFields.accountId || null;
    var hasActiveAccounts = false, accountArchived = false, accountPretrade = null, accountWorstRuleState = null, accountDiscipline = null;
    if (accountsStore && typeof accountsStore.listSync === 'function') {
      hasActiveAccounts = accountsStore.listSync().some(function (a) { return a.status === 'active'; });
    }
    if (accountId && accountsStore && accountsEngine && typeof accountsStore.find === 'function') {
      var account = accountsStore.find(accountId);
      if (account) {
        accountArchived = account.status === 'archived';
        var accountTrades = tradeStore && typeof tradeStore.listSync === 'function' ? tradeStore.listSync() : [];
        var accountMetrics = accountsEngine.computeMetrics(account, accountTrades);
        // riskAmount arrives directly when the calculator is in "amount" mode; in "percent" mode
        // it must be derived from this SAME account's real equity, never a different balance
        // (defect #2's own "real equity drives every calculation" rule) - mirrors exactly how
        // tradeCalculatorModal.jsx's own computeOut() converts between the two modes.
        var riskAmount = toNum(proposedFields.riskAmount);
        var accountRiskField = 'riskAmount';
        if (riskAmount === null) {
          var riskPercentInput = toNum(proposedFields.riskPercent);
          if (riskPercentInput !== null && accountMetrics.equity) { riskAmount = accountMetrics.equity * (riskPercentInput / 100); accountRiskField = 'riskPercent'; }
        }
        if (riskAmount !== null) accountPretrade = accountsEngine.evaluatePretrade(account, accountMetrics, { riskAmount: riskAmount });
        accountWorstRuleState = worstRuleState(accountsEngine.evaluateRules(account, accountMetrics).groups);
        accountDiscipline = accountsEngine.computeDiscipline(account, accountTrades);
      }
    }

    return {
      strategy: strategy, recentTrades: recentTrades, baselineRiskPercent: baselineRiskPercent,
      activeTradeCount: activeTradeCount, psychology: psychology, readyToSubmit: !!o.readyToSubmit,
      accountId: accountId, hasActiveAccounts: hasActiveAccounts, accountArchived: accountArchived,
      accountPretrade: accountPretrade, accountRiskField: accountPretrade ? accountRiskField : null,
      accountWorstRuleState: accountWorstRuleState, accountDiscipline: accountDiscipline
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

  // Accounts domain defect #8: a confirmable finding can now originate from an account rule
  // (ruleAccountPretradeRisk's 'account-daily-loss-exceeded'), not only the original Strategy
  // rule - resolved.ruleId (staged verbatim in stageConfirmation() above) tells us which real
  // limit this confirmation is actually about, so the reply names the right one instead of always
  // saying "your strategy's own limit" regardless of what was really confirmed.
  function confirmationReply(decision, resolved, language) {
    var isAccountRule = resolved && String(resolved.ruleId || '').indexOf('account-') === 0;
    if (isAccountRule) {
      if (decision === 'confirm') {
        return pick(language, {
          en: 'Understood - proceeding with this trade\'s risk against the account\'s daily allowance. This is recorded as an explicit override; the account\'s own rule is unchanged.',
          fa: 'باشه، با همین ریسک نسبت به سقف روزانه حساب ادامه می‌دم. این به‌عنوان یه استثنای صریح ثبت می‌شه؛ قانون خود حساب دست‌نخورده می‌مونه.',
          ar: 'تم - المتابعة بمخاطرة هذه الصفقة مقابل المخصص اليومي للحساب. يُسجَّل هذا كتجاوز صريح؛ قاعدة الحساب نفسها تبقى دون تغيير.',
          es: 'Entendido - se procede con el riesgo de esta operación frente a la asignación diaria de la cuenta. Esto se registra como una anulación explícita; la regla propia de la cuenta no cambia.'
        });
      }
      return pick(language, {
        en: 'Keeping the trade within this account\'s real daily allowance, as its own rule requires.',
        fa: 'معامله رو داخل سقف روزانه واقعی این حساب نگه داشتم، همون‌طور که قانون خودش می‌گه.',
        ar: 'تم الإبقاء على الصفقة ضمن المخصص اليومي الحقيقي لهذا الحساب، كما تتطلب قاعدته الخاصة.',
        es: 'Se mantiene la operación dentro de la asignación diaria real de esta cuenta, según lo requiere su propia regla.'
      });
    }
    if (decision === 'confirm') {
      return pick(language, {
        en: 'Understood - overriding to ' + resolved.proposedValue + '%. This is recorded as an explicit override; your strategy\'s own limit is unchanged.',
        fa: 'باشه، رفت رو ' + resolved.proposedValue + '%. این به‌عنوان یه استثنای صریح ثبت می‌شه؛ سقف استراتژیت خودش دست‌نخورده می‌مونه.',
        ar: 'تم - تجاوز الحد إلى ' + resolved.proposedValue + '%. يُسجَّل هذا كتجاوز صريح؛ حد استراتيجيتك يبقى دون تغيير.',
        es: 'Entendido: se anula a ' + resolved.proposedValue + '%. Esto se registra como una anulación explícita; el límite de tu estrategia no cambia.'
      });
    }
    return pick(language, {
      en: 'Keeping ' + resolved.safeValue + '%, as your strategy limit requires.',
      fa: 'باشه، رو ' + resolved.safeValue + '% نگه داشتم، همون‌طور که سقف استراتژیت می‌گه.',
      ar: 'تم الإبقاء على ' + resolved.safeValue + '%، كما يتطلب حد استراتيجيتك.',
      es: 'Se mantiene en ' + resolved.safeValue + '%, según lo requiere el límite de tu estrategia.'
    });
  }

  window.TradeJournalAIProactiveEngine = {
    SEVERITY: SEVERITY, BLOCKING_SEVERITIES: BLOCKING_SEVERITIES,
    evaluate: evaluate, buildTradeContext: buildTradeContext,
    stageConfirmation: stageConfirmation, pendingConfirmation: pendingConfirmation, clearConfirmation: clearConfirmation,
    interpretConfirmationText: interpretConfirmationText, resolveConfirmation: resolveConfirmation, confirmationReply: confirmationReply
  };
}());
