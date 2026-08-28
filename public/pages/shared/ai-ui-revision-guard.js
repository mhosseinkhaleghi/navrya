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
  // and (2) a DIFFERENT foreground surface is now topmost - either one means the workflow's own
  // target UI is genuinely gone, so ai-workflow-engine.js abandons it outright.
  //
  // A third case - the step moved without this engine's own doing (a human clicked Back/Next/
  // Skip) - is real but NOT the same kind of divergence: found via real production testing
  // (2026-08-28 bug report) that treating it the same way (abandon the whole workflow) broke
  // Psychology Intake and Trade Wizard voice-fill entirely after the FIRST manual step change
  // (e.g. clicking the intake's own real "Begin" button off Orientation) - chat-dock-core.js has
  // no fallback mechanism to auto-apply fields into an open process that no live workflow owns
  // (that path only ever returns manual, click-to-apply suggestions - dead-ended for voice), so
  // abandoning the workflow silently ended live sync for the rest of the session. This is exactly
  // backwards from the brief's own requirement: a human's manual navigation should make Voice
  // FOLLOW the new real step, not give up on the wizard. hasDiverged() now reports which kind of
  // divergence it found - 'closed'/'surface' (target UI genuinely gone - abandon) vs 'step' (the
  // SAME wizard moved forward or back under the user's own hand - re-baseline and keep following,
  // never a reason to stop). ai-process-registry.js's applyValue() is still the only thing that
  // legitimately drives a captured workflow's OWN step moves (via stepForPath/goToStep), and the
  // caller (ai-workflow-engine.js) re-captures immediately after that happens - so a 'step'
  // divergence detected here always means a human's own action, never this engine's last turn.
  function capture(processId) {
    var registry = window.TradeJournalAIProcessRegistry;
    if (!registry || !processId) return null;
    var snap = typeof registry.snapshot === 'function' ? registry.snapshot(processId) : null;
    if (!snap || !snap.open) return null;
    return { processId: processId, layer: snap.layer, step: snap.step };
  }

  // Returns false (no divergence), or one of 'closed' | 'surface' | 'step' - never a bare
  // true/false for an actual divergence, so the caller can tell "abandon" apart from "follow".
  function hasDiverged(captured) {
    if (!captured) return false;
    var registry = window.TradeJournalAIProcessRegistry;
    if (!registry) return false;
    var current = typeof registry.snapshot === 'function' ? registry.snapshot(captured.processId) : registry.query(captured.processId);
    if (!current || !current.open) return 'closed'; // the real UI this workflow was driving is gone
    if (captured.layer === 'foreground') {
      var topmost = registry.activeOpenProcess();
      if (!topmost || topmost.id !== captured.processId) return 'surface'; // a different surface is now topmost
    }
    if (captured.step !== undefined && captured.step !== null && current.step !== captured.step) return 'step'; // the SAME wizard moved, under the user's own hand
    return false;
  }

  window.TradeJournalAIUiRevisionGuard = { capture: capture, hasDiverged: hasDiverged };
}());
