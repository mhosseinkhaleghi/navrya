(function () {
  'use strict';
  // Voice Mode performance pass (feature/voice-mode-performance): a pure, deterministic (no
  // model call, no network) rule for which semantic_vad eagerness the NEXT user turn should use,
  // derived from what NAVRYA is actually waiting on right now - the same real workflow state
  // chat-dock-core.js's sendChat() result already returns, never a second, invented signal.
  //
  // One configuration authority (per the task's own requirement): this function is the ONLY place
  // that decides eagerness. The caller (chatDockView.jsx) is responsible for only calling
  // aiVoiceRealtime.js's setEagerness() when the result actually differs from the last-applied
  // value - see that file's own comment on why avoiding a no-op session.update matters.
  //
  // - 'high': a workflow is waiting on exactly one short, closed-form answer - a yes/no gate
  //   field (confirm/confirmDelete/confirmPublish/send/publish) or a short slot NAVRYA's own
  //   deterministic extractor already resolves in one utterance (city/timeframe/direction/a
  //   price/percent/rating). The user is expected to say one short thing; the model should not
  //   wait around for more.
  // - 'low': a long, free-form answer is expected - a note/description/evidence/problem/trigger/
  //   review-text field still missing, an explicit Companion "Explain" (teaching) turn, or
  //   Therapist Mode (reflection). Cutting the user off mid-thought here is worse than waiting a
  //   beat longer before deciding they're done.
  // - 'medium': everything else - ordinary conversation, no active workflow, or a workflow
  //   missing more than one field (no single expected shape to anchor on).
  var GATE_FIELDS = { confirm: true, confirmDelete: true, confirmPublish: true, send: true, publish: true };
  var SHORT_SLOT_FIELDS = {
    city: true, timeframe: true, direction: true, exitPrice: true, entryPrice: true, stopLoss: true,
    riskPercent: true, leverage: true, ratingValue: true, role: true, language: true
  };
  var LONG_FORM_FIELDS = {
    note: true, description: true, evidence: true, problem: true, trigger: true, reviewText: true,
    draft: true, text: true
  };

  function deriveEagerness(context) {
    var ctx = context || {};
    if (ctx.therapistMode || ctx.companionIntent === 'explain') return 'low';
    var missing = (ctx.workflow && ctx.workflow.missing) || [];
    if (missing.length === 1) {
      var field = missing[0];
      if (GATE_FIELDS[field] || SHORT_SLOT_FIELDS[field]) return 'high';
      if (LONG_FORM_FIELDS[field]) return 'low';
    } else if (missing.length > 1 && missing.every(function (field) { return LONG_FORM_FIELDS[field]; })) {
      return 'low';
    }
    return 'medium';
  }

  window.TradeJournalAIVoiceEagerness = { deriveEagerness: deriveEagerness };
}());
