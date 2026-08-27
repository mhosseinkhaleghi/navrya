(function () {
  'use strict';
  // Journey H1 (sections 27-28 of the brief - "stale action protection"): the narrow, additive
  // guard that lets ai-workflow-engine.js ask "has the real UI moved out from under this workflow
  // since I last knew it?" before applying a turn's fields. Pure and local - reads only
  // TradeJournalAIProcessRegistry's already-live isOpen()/activeStep() (never cached, never
  // polled independently - see that file's own no-second-mechanism comment), so this adds no
  // event plumbing and no network calls of its own.
  //
  // Deliberately narrower than a generic "did anything change" diff: the two things this
  // repo's own destructive-action pattern (character-app.jsx's delete actions,
  // docs/ai/action-safety.md) already treats as disqualifying are (1) the target process closed,
  // and (2) a DIFFERENT foreground surface is now topmost. This adds a third, wizard-specific
  // case: the step moved without this engine's own doing (a human clicked Back/Next/Skip, or
  // closed and reopened at a different step) - ai-process-registry.js's applyValue() is the only
  // thing allowed to legitimately move a captured workflow's step (via stepForPath/goToStep), and
  // the caller (ai-workflow-engine.js) re-captures immediately after that happens, so a real
  // divergence here can only mean a human's own action, never this engine's own last turn.
  function capture(processId) {
    var registry = window.TradeJournalAIProcessRegistry;
    if (!registry || !processId) return null;
    var snap = typeof registry.snapshot === 'function' ? registry.snapshot(processId) : null;
    if (!snap || !snap.open) return null;
    return { processId: processId, layer: snap.layer, step: snap.step };
  }

  function hasDiverged(captured) {
    if (!captured) return false;
    var registry = window.TradeJournalAIProcessRegistry;
    if (!registry) return false;
    var current = typeof registry.snapshot === 'function' ? registry.snapshot(captured.processId) : registry.query(captured.processId);
    if (!current || !current.open) return true; // the real UI this workflow was driving is gone
    if (captured.step !== undefined && captured.step !== null && current.step !== captured.step) return true; // moved without this engine's involvement
    if (captured.layer === 'foreground') {
      var topmost = registry.activeOpenProcess();
      if (!topmost || topmost.id !== captured.processId) return true; // a different surface is now topmost
    }
    return false;
  }

  window.TradeJournalAIUiRevisionGuard = { capture: capture, hasDiverged: hasDiverged };
}());
