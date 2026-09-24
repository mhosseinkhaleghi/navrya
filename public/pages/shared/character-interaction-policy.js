(function () {
  'use strict';
  // NAVRYA — Character Interaction Policy (Hunter gate, extended to Commander and Market Engineer).
  //
  // NAVRYA's own deterministic engines (Workflow/Action/Risk/Safety/Proactive) decide WHAT
  // happens; a character only ever decides HOW it is communicated. This module is the one shared,
  // reusable place that answers "given this real event, how should the active character deliver
  // it" - it holds no business logic of its own (no field order, no risk math, no safety rule) and
  // is never itself an AI call. Only Hunter, Commander and Market Engineer (`engineer`) have real
  // content so far (each its own gate); `sage` resolves to `active: false` and every caller's own
  // existing, unchanged behavior applies.
  //
  // This is deliberately a small, fixed set of four reusable "delivery gears" (section 7 of the
  // interaction-policy brief), not a per-event bible - the same four gears cover every event below,
  // so adding a new event later never means writing new prose here, only classifying it into an
  // existing gear. Safety and destructive/override confirmations always resolve to NEUTRAL
  // regardless of what event/sensitivity is passed in (section 8: safety outranks character) - in
  // practice, a genuine crisis-safety turn never reaches this module at all, since
  // mental-health-safety.js's preflight (chat-dock-core.js) short-circuits before any reply is
  // composed; the NEUTRAL default here is a second, structural belt-and-braces guarantee, not the
  // only one.
  //
  // Consumed today by: ai-companion-orchestrator.js (voice-opening greeting selection),
  // chat-dock-core.js (proactive risk-warning framing). The server-side LLM prompt fragment
  // (server/pattern-ai-server.mjs's CHARACTER_GEAR_INSTRUCTION) and the analysis-headline lead-in
  // (navrya-src/chatDockView.jsx) implement the SAME gear/event model independently, kept in sync
  // by hand - matching this codebase's existing convention for the server's own
  // VOICE_CHARACTER_REPLY_STYLE (no shared file crosses the Node-server/browser-client boundary
  // anywhere else in this app, and this feature does not introduce a new exception to that).
  // See docs/ai/character-interaction-policy.md.

  var EVENTS = {
    VOICE_START: 'VOICE_START', CONTEXTUAL_OPENING: 'CONTEXTUAL_OPENING', GENERAL_QA: 'GENERAL_QA',
    PRODUCT_EXPLANATION: 'PRODUCT_EXPLANATION', DATA_ANSWER: 'DATA_ANSWER',
    FORM_NEXT_FIELD: 'FORM_NEXT_FIELD', FORM_FIELD_ACCEPTED: 'FORM_FIELD_ACCEPTED', FORM_CORRECTION: 'FORM_CORRECTION',
    FORM_CLARIFICATION: 'FORM_CLARIFICATION', FORM_STEP_TRANSITION: 'FORM_STEP_TRANSITION', FORM_COMPLETE: 'FORM_COMPLETE',
    WORKFLOW_CANCEL: 'WORKFLOW_CANCEL', RISK_WARNING: 'RISK_WARNING', RISK_OVERRIDE_CONFIRMATION: 'RISK_OVERRIDE_CONFIRMATION',
    PROACTIVE_NUDGE: 'PROACTIVE_NUDGE', POST_TRADE_REFLECTION: 'POST_TRADE_REFLECTION',
    ANALYSIS_HEADLINE: 'ANALYSIS_HEADLINE', ANALYSIS_FULL: 'ANALYSIS_FULL', LOW_CONFIDENCE: 'LOW_CONFIDENCE',
    PRAISE: 'PRAISE', ERROR_RECOVERY: 'ERROR_RECOVERY', DESTRUCTIVE_CONFIRMATION: 'DESTRUCTIVE_CONFIRMATION',
    LEARNED_COMMAND_FEEDBACK: 'LEARNED_COMMAND_FEEDBACK', SAFETY: 'SAFETY'
  };

  var GEARS = { NORMAL: 'NORMAL', FOCUSED: 'FOCUSED', HUMAN_MOMENT: 'HUMAN_MOMENT', NEUTRAL: 'NEUTRAL' };

  // Characters with real Character Interaction Policy content. The event->gear table below is
  // shared/character-agnostic (brief section 7: "reuse existing gears, do not add a second gear
  // enum") - only the actual phrase tables further down differ per character.
  var IMPLEMENTED_CHARACTERS = { hunter: true, commander: true, engineer: true };

  // Default gear per event, absent any overriding sensitivity (see gearForEvent()). Events not
  // listed here (a future addition, or a caller's typo) fall back to NORMAL - the safest, most
  // reversible default, never NEUTRAL (which would silently suppress Hunter's identity) and never
  // FOCUSED/HUMAN_MOMENT (which assume a context this table has no evidence for).
  var EVENT_GEAR = {};
  EVENT_GEAR[EVENTS.VOICE_START] = GEARS.NORMAL;
  EVENT_GEAR[EVENTS.CONTEXTUAL_OPENING] = GEARS.NORMAL;
  EVENT_GEAR[EVENTS.GENERAL_QA] = GEARS.NORMAL;
  EVENT_GEAR[EVENTS.PRODUCT_EXPLANATION] = GEARS.NORMAL;
  EVENT_GEAR[EVENTS.DATA_ANSWER] = GEARS.NORMAL;
  EVENT_GEAR[EVENTS.PROACTIVE_NUDGE] = GEARS.NORMAL;
  EVENT_GEAR[EVENTS.LOW_CONFIDENCE] = GEARS.NORMAL;
  EVENT_GEAR[EVENTS.PRAISE] = GEARS.NORMAL;
  EVENT_GEAR[EVENTS.ERROR_RECOVERY] = GEARS.NORMAL;
  EVENT_GEAR[EVENTS.LEARNED_COMMAND_FEEDBACK] = GEARS.NORMAL;
  EVENT_GEAR[EVENTS.FORM_NEXT_FIELD] = GEARS.FOCUSED;
  EVENT_GEAR[EVENTS.FORM_FIELD_ACCEPTED] = GEARS.FOCUSED;
  EVENT_GEAR[EVENTS.FORM_CORRECTION] = GEARS.FOCUSED;
  EVENT_GEAR[EVENTS.FORM_CLARIFICATION] = GEARS.FOCUSED;
  EVENT_GEAR[EVENTS.FORM_STEP_TRANSITION] = GEARS.FOCUSED;
  EVENT_GEAR[EVENTS.FORM_COMPLETE] = GEARS.FOCUSED;
  EVENT_GEAR[EVENTS.WORKFLOW_CANCEL] = GEARS.FOCUSED;
  EVENT_GEAR[EVENTS.RISK_WARNING] = GEARS.FOCUSED;
  EVENT_GEAR[EVENTS.ANALYSIS_HEADLINE] = GEARS.FOCUSED;
  EVENT_GEAR[EVENTS.ANALYSIS_FULL] = GEARS.FOCUSED;
  EVENT_GEAR[EVENTS.POST_TRADE_REFLECTION] = GEARS.HUMAN_MOMENT;
  EVENT_GEAR[EVENTS.RISK_OVERRIDE_CONFIRMATION] = GEARS.NEUTRAL;
  EVENT_GEAR[EVENTS.DESTRUCTIVE_CONFIRMATION] = GEARS.NEUTRAL;
  EVENT_GEAR[EVENTS.SAFETY] = GEARS.NEUTRAL;

  // How freely Hunter's own address term ("رفیق"/a natural per-language equivalent - section 4) and
  // light tracking/navigation metaphor (section 6) may be used per gear. Never business logic -
  // purely a delivery-style ceiling a caller may consult before composing a line.
  var ADDRESS_ALLOWANCE = { NORMAL: 'occasional', FOCUSED: 'rare', HUMAN_MOMENT: 'name_if_available', NEUTRAL: 'none' };
  var METAPHOR_ALLOWANCE = { NORMAL: 'light', FOCUSED: 'minimal', HUMAN_MOMENT: 'none', NEUTRAL: 'none' };

  function pick(language, table) { return table[language] || table.en; }

  // A gate/destructive/override confirmation, or an explicit safety sensitivity, always wins
  // NEUTRAL regardless of which event was passed - section 8/24's absolute override, expressed
  // structurally rather than left to every caller to remember.
  function gearForEvent(event, opts) {
    opts = opts || {};
    if (opts.sensitivity === 'safety' || event === EVENTS.SAFETY) return GEARS.NEUTRAL;
    if (opts.sensitivity === 'gate' || event === EVENTS.DESTRUCTIVE_CONFIRMATION || event === EVENTS.RISK_OVERRIDE_CONFIRMATION) return GEARS.NEUTRAL;
    return EVENT_GEAR[event] || GEARS.NORMAL;
  }

  function activeCharacter() {
    return (window.TradeJournalPanelLayer && window.TradeJournalPanelLayer.character) || 'hunter';
  }
  function isHunterActive(character) { return (character || activeCharacter()) === 'hunter'; }
  function isCommanderActive(character) { return (character || activeCharacter()) === 'commander'; }
  function isEngineerActive(character) { return (character || activeCharacter()) === 'engineer'; }
  function hasCharacterPolicy(character) { return !!IMPLEMENTED_CHARACTERS[character || activeCharacter()]; }

  // Per-character phrase tables for the fully deterministic (non-model) replies. NAVRYA/the
  // proactive engine's own finding (severity/evidence/message) is never touched by any of these:
  // `proactiveOpener` is the address a blocking risk conflict starts with, `proactiveOverrideQuestion`
  // the closing options question, `analysisHeadlineLeadIn` a short label prepended to the model's
  // real, unchanged analysis headline (MAIN SIGNAL / OBSERVATION first). All are reused verbatim by
  // chat-dock-core.js's buildProactiveReply() and chatDockView.jsx's onAnalysisReady(). A
  // `character` that is omitted or has no table here resolves to Hunter's (this module's original,
  // still-default character), so every pre-existing caller keeps its exact original behavior.
  var PHRASES = {
    hunter: {
      proactiveOpener: { en: 'Hold on a sec.', fa: 'یه لحظه رفیق.', ar: 'لحظة واحدة.', es: 'Un momento.' },
      proactiveOverrideQuestion: {
        en: 'Want to stick with the plan, or knowingly push past it?',
        fa: 'می‌خوای برگردیم روی پلن، یا همین استثنا رو آگاهانه تأیید می‌کنی؟',
        ar: 'تريد نلتزم بالخطة، أم نتجاوزها بوعي؟',
        es: '¿Nos quedamos con el plan, o lo superamos a propósito?'
      },
      analysisHeadlineLeadIn: { en: 'Main signal:', fa: 'ردپای اصلی اینه:', ar: 'الإشارة الرئيسية:', es: 'Señal principal:' }
    },
    commander: {
      proactiveOpener: { en: 'Hold on, sir.', fa: 'قربان، یه تضاد داریم.', ar: 'سيدي، لدينا تعارض.', es: 'Señor, tenemos un conflicto.' },
      proactiveOverrideQuestion: {
        en: 'Two options: fall back to the cap, or knowingly confirm this exception.',
        fa: 'دو انتخاب داریم: برگردیم روی سقف، یا این استثنا رو آگاهانه تأیید کنید.',
        ar: 'أمامنا خياران: الالتزام بالحد، أو تأكيد هذا الاستثناء عن وعي.',
        es: 'Tenemos dos opciones: volver al límite, o confirmar esta excepción a propósito.'
      },
      analysisHeadlineLeadIn: { en: 'Sir, quick briefing:', fa: 'قربان، گزارش کوتاه:', ar: 'سيدي، تقرير موجز:', es: 'Señor, informe breve:' }
    },
    // Market Engineer: no signature address term at all (no "رفیق"/"قربان") - the personality is
    // how it frames a mismatch (fact -> constraint -> difference -> options), not who it names.
    engineer: {
      proactiveOpener: { en: 'We have a mismatch.', fa: 'یه mismatch داریم.', ar: 'عندنا عدم تطابق.', es: 'Hay un desajuste.' },
      proactiveOverrideQuestion: {
        en: 'Fix it, or knowingly confirm the exception?',
        fa: 'اصلاح کنیم یا استثنا رو آگاهانه تأیید می‌کنی؟',
        ar: 'نصحّحه، أم تؤكد هذا الاستثناء عن وعي؟',
        es: '¿Lo corregimos, o confirmas la excepción a propósito?'
      },
      analysisHeadlineLeadIn: { en: 'Main observation:', fa: 'Observation اصلی:', ar: 'الملاحظة الرئيسية:', es: 'Observación principal:' }
    }
  };
  function phrase(kind, language, character) {
    return pick(language, (PHRASES[character || 'hunter'] || PHRASES.hunter)[kind]);
  }
  function proactiveOpener(language, character) { return phrase('proactiveOpener', language, character); }
  function proactiveOverrideQuestion(language, character) { return phrase('proactiveOverrideQuestion', language, character); }
  function analysisHeadlineLeadIn(language, character) { return phrase('analysisHeadlineLeadIn', language, character); }

  // Market Engineer's DIFFERENCE step (fact -> constraint -> difference -> options). Pure
  // arithmetic over numbers the Proactive Engine's own finding already carries in its evidence -
  // never a new risk condition and never a new threshold: only the strategy-risk-limit finding has
  // requested-vs-cap evidence, and only when both are finite numbers with requested above the cap.
  // Any other finding, missing/non-numeric evidence, or any other character returns ''.
  var DIFFERENCE_LINE = {
    en: function (n) { return 'That is ' + n + ' point' + (n === 1 ? '' : 's') + ' above the limit.'; },
    fa: function (n) { return 'یعنی ' + n + ' واحد درصد بالاتر از محدوده.'; },
    ar: function (n) { return 'أي ' + n + ' نقطة مئوية فوق الحد.'; },
    es: function (n) { return 'Es decir, ' + n + ' punto' + (n === 1 ? '' : 's') + ' porcentual' + (n === 1 ? '' : 'es') + ' por encima del límite.'; }
  };
  function proactiveDifferenceLine(findings, language, character) {
    if (character !== 'engineer' || !Array.isArray(findings)) return '';
    for (var i = 0; i < findings.length; i++) {
      var f = findings[i];
      var e = f && f.id === 'strategy-risk-limit' && f.evidence;
      if (!e || typeof e.requestedRiskPercent !== 'number' || typeof e.strategyMaxRiskPercent !== 'number') continue;
      if (!isFinite(e.requestedRiskPercent) || !isFinite(e.strategyMaxRiskPercent) || e.requestedRiskPercent <= e.strategyMaxRiskPercent) continue;
      var diff = Math.round((e.requestedRiskPercent - e.strategyMaxRiskPercent) * 100) / 100;
      return (DIFFERENCE_LINE[language] || DIFFERENCE_LINE.en)(diff);
    }
    return '';
  }

  function resolve(ctx) {
    ctx = ctx || {};
    var character = ctx.character || activeCharacter();
    var active = hasCharacterPolicy(character);
    var gear = active ? gearForEvent(ctx.event, ctx) : null;
    return {
      active: active,
      character: character,
      event: ctx.event || null,
      gear: gear,
      addressAllowance: active ? (ADDRESS_ALLOWANCE[gear] || 'none') : 'none',
      metaphorAllowance: active ? (METAPHOR_ALLOWANCE[gear] || 'none') : 'none'
    };
  }

  window.TradeJournalCharacterPolicy = {
    EVENTS: EVENTS,
    GEARS: GEARS,
    resolve: resolve,
    activeCharacter: activeCharacter,
    isHunterActive: isHunterActive,
    isCommanderActive: isCommanderActive,
    isEngineerActive: isEngineerActive,
    hasCharacterPolicy: hasCharacterPolicy,
    proactiveOpener: proactiveOpener,
    proactiveOverrideQuestion: proactiveOverrideQuestion,
    analysisHeadlineLeadIn: analysisHeadlineLeadIn,
    proactiveDifferenceLine: proactiveDifferenceLine
  };
})();
