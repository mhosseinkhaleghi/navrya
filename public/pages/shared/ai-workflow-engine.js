(function () {
  'use strict';
  // Deterministic, in-memory multi-turn slot state for one AI-initiated action at a time.
  // NAVRYA owns this state (which fields are known, which are still missing, when to submit) -
  // the model only ever supplies natural-language field extraction on top of it, matching the
  // rest of this app's local-first, app-owns-state design. Resets on page reload, the same
  // lifecycle as the ChatDock's own in-memory transcript.
  var current = null;

  // Found via real end-to-end testing of the exact scenario this exists to support: "15 minutes"
  // immediately followed by "no, make that 5 minutes" - if the LAST required field submits the
  // instant it lands, there is no room left for a same-breath correction to ever reach the real
  // UI before the record is already created. A short, cancelable grace window after the required
  // set first completes gives a natural follow-up correction somewhere to land; a turn that
  // arrives with no actual field change simply re-arms the same window rather than shortening it.
  // Mutable (not a const) so tests can shrink it rather than sleep multiple seconds per
  // assertion. 3000ms in production: comfortably longer than one real provider round-trip (found
  // via real end-to-end testing to often run 1-3s on its own), so a correction typed right after
  // seeing the first value applied has real room to land before commit, not a race against it.
  var SUBMIT_GRACE_MS = 3000;

  // 'session.create' -> 'session-create': matches the id the target UI registers with
  // TradeJournalAIProcessRegistry under. Kept as one mapping so an action never has to duplicate
  // its own process id.
  function processIdFor(actionId) { return String(actionId).replace(/\./g, '-'); }

  function missingFields(action, known) {
    return action.requiredFields.filter(function (field) {
      var value = known[field];
      return value === undefined || value === null || value === '';
    });
  }

  function start(actionId, context) {
    var actionRegistry = window.TradeJournalAIActionRegistry;
    var action = actionRegistry && actionRegistry.get(actionId);
    if (!action) return null;
    current = {
      workflowId: 'wf-' + Date.now().toString(36),
      actionId: actionId,
      processId: processIdFor(actionId),
      status: 'collecting',
      known: {},
      missing: action.requiredFields.slice()
    };
    try { action.open(context); } catch (_) { /* opening is best-effort - the workflow state is still usable even if navigation/opening partly failed */ }
    return current;
  }

  // Applies each {path, value} pair to the real, already-open UI via
  // TradeJournalAIProcessRegistry.applyValue() - live sync, no manual "Apply" click, unlike the
  // existing screenshot-review suggestions[] flow which stays a deliberate manual-approval UX for
  // its own use case. Once nothing required is left missing, submits through the action's own
  // submit()/resultContext() and clears the workflow. Returns the resulting workflow state (or
  // null once it has completed).
  async function applyKnownFields(fields, context) {
    if (!current) return current;
    var actionRegistry = window.TradeJournalAIActionRegistry;
    var processRegistry = window.TradeJournalAIProcessRegistry;
    var action = actionRegistry && actionRegistry.get(current.actionId);
    if (!action) return current;

    var appliedAny = false;
    (fields || []).forEach(function (field) {
      if (!field || !field.path || field.value === undefined || field.value === null || field.value === '') return;
      // A raw extracted value is untrusted app input, exactly like a typed form value - run it
      // through the action's own normalizeField() (e.g. "15 minutes" -> "15m" for session.create,
      // matching the real dropdown's actual option values) before ever treating the field as
      // known. A value normalizeField rejects (null/undefined/'') is left missing rather than
      // applied - the workflow keeps asking instead of live-syncing (or later submitting) a value
      // the real UI wouldn't actually accept.
      var value = field.value;
      if (typeof action.normalizeField === 'function') {
        try { value = action.normalizeField(field.path, value); } catch (_) { value = null; }
      }
      if (value === undefined || value === null || value === '') return;
      // Only push into the real UI when this is a genuinely new/changed value for this path -
      // a model that re-echoes a field it already extracted on an earlier turn (e.g. repeating
      // city: 'New York' on the turn that only actually supplied timeframe) must never silently
      // reapply it and clobber a value the user has since edited by hand in the real, still-open
      // form. A turn that actually changes the value (a correction, e.g. 15m -> 5m) still applies
      // normally, since that IS a new explicit reason.
      //
      // JSON.stringify, not String(): Journey A's fields were always plain scalars, where the two
      // agree. Journey B's takeProfits is a compound value (normalizeField wraps a plain target
      // price into [{price,portionPercent}]) - String() on two DIFFERENT arrays of plain objects
      // both collapse to the literal text "[object Object]", so a genuine correction (a new
      // target price) would have been wrongly treated as an unchanged re-echo and silently
      // dropped. JSON.stringify compares the real content instead, and agrees with String() on
      // every scalar value already covered by Journey A's own tests (same equal/not-equal
      // outcome), so this changes nothing for city/timeframe-shaped fields.
      var isNewOrChanged = current.known[field.path] === undefined || JSON.stringify(current.known[field.path]) !== JSON.stringify(value);
      current.known[field.path] = value;
      if (processRegistry && isNewOrChanged) { processRegistry.applyValue(current.processId, field.path, value, field.mode || 'replace'); appliedAny = true; }
    });
    current.missing = missingFields(action, current.known);

    // applyValue() above lands on the real UI's own React state setter - React does not commit
    // and re-render synchronously from here, so the target's own submit() (a closure over its
    // component state, re-captured every render - see e.g. NewSessionDialog.jsx's registration
    // effect) would otherwise still be the PREVIOUS render's closure, missing whichever field was
    // just applied this turn. Yielding one macrotask lets that render (and the resulting
    // re-registration) actually happen before any auto-submit decision reads real, current state,
    // rather than deciding to submit a beat too early against stale data.
    if (appliedAny) await new Promise(function (resolve) { setTimeout(resolve, 0); });

    // Any turn re-evaluates from scratch - a previously scheduled submit must never fire against
    // whatever is current by the time it would run; if the set is still complete after this turn,
    // scheduleSubmit() below re-arms a fresh window.
    if (current.pendingSubmitTimer) { clearTimeout(current.pendingSubmitTimer); current.pendingSubmitTimer = null; }

    if ((current.status === 'collecting' || current.status === 'pending-submit') && !current.missing.length) {
      scheduleSubmit(current, action, context);
    }
    return current;
  }

  function scheduleSubmit(workflow, action, context) {
    workflow.status = 'pending-submit';
    workflow.pendingSubmitTimer = setTimeout(function () {
      // The module-level `current` may have moved on (cancelled, superseded by a new start(), or
      // this exact submit already ran) by the time this fires - never act unless this scheduled
      // run is still the live workflow.
      if (current !== workflow) return;
      // The user may have closed/cancelled the real UI (the dialog's own X/Cancel, never routed
      // through this engine's own cancel()) at any point during the grace window - found via real
      // end-to-end testing: without this check, a workflow the user visibly dismissed still
      // silently created the record a few seconds later. TradeJournalAIProcessRegistry.query()
      // is the same live isOpen() every other read of "is this process open" already goes
      // through; treat "no longer open" as an implicit cancel, never a reason to press on.
      var processRegistry = window.TradeJournalAIProcessRegistry;
      var stillOpen = !processRegistry || typeof processRegistry.query !== 'function' || processRegistry.query(workflow.processId).open;
      if (!stillOpen) { if (current === workflow) current = null; return; }
      workflow.pendingSubmitTimer = null;
      workflow.status = 'submitting';
      var submitFn = typeof action.submit === 'function' ? action.submit : function () { return undefined; };
      // Promise.resolve().then(() => submitFn(...)), not Promise.resolve(submitFn(...)): found
      // while building Journey B - tradeCalculatorModal.jsx's own submit() is a plain, synchronous
      // function (tradeStore.save() needs no awaiting), unlike session.create's, which always
      // happens to return a promise. Promise.resolve(submitFn(...)) evaluates submitFn(...) as a
      // bare argument expression first - a SYNCHRONOUS throw there escapes before Promise.resolve()
      // ever wraps anything, as an uncaught exception inside this setTimeout callback, leaving the
      // workflow stuck in 'submitting' forever (the .then() rejection fallback below never runs).
      // Deferring the call inside a .then() callback means any throw - sync or async - becomes a
      // normal promise rejection either way, so the existing failure-recovery fallback catches it.
      Promise.resolve().then(function () { return submitFn(workflow.known, context); }).then(function (result) {
        if (current !== workflow) return;
        try { action.resultContext(result); } catch (_) { /* navigation to the result is best-effort */ }
        current = null;
      }, function () {
        // A failed submit must never lose the values already applied live to the real, still-open
        // form - leave the workflow collecting so a retry (or the user finishing manually) still
        // works, matching the app-wide rule that an AI failure never rolls back applied state.
        if (current === workflow) workflow.status = 'collecting';
      });
    }, SUBMIT_GRACE_MS);
  }

  function currentWorkflow() { return current; }

  // Found via real end-to-end testing: closing the real dialog (X/Cancel) *before* the required
  // set ever completes leaves the workflow sitting in 'collecting' forever - nothing else was
  // ever going to clear it (no submit gets scheduled, so scheduleSubmit()'s own isOpen() check
  // never runs), silently occupying the one global workflow slot. A user who cancels once and
  // later tries an entirely new, unrelated request would find it never recognized as a fresh
  // intent - chat-dock-core.js's own "is a workflow already active?" check would keep saying yes.
  //
  // Deliberately its own explicit method, not folded into current() itself: current() is also
  // called mid-flight from inside the very same start()-then-applyKnownFields() sequence that
  // just opened the target UI (ai-context-engine.js's snapshot() reads current(), and
  // chat-dock-core.js builds that snapshot as applyKnownFields()'s own argument, i.e. before
  // applyKnownFields has run at all) - isOpen() cannot have caught up with React's own
  // (asynchronous) re-render yet at that exact point, so pruning there would delete a workflow
  // the instant it starts. chat-dock-core.js instead calls this once, at the top of handling each
  // new incoming message - by then any previous turn's own start()/applyKnownFields() has long
  // since resolved (an awaited network round trip in between gives React ample time to settle),
  // so it is safe to ask "does the process this workflow is driving still report itself open?"
  function pruneIfAbandoned() {
    if (current && current.status !== 'pending-submit' && current.status !== 'submitting') {
      var processRegistry = window.TradeJournalAIProcessRegistry;
      var stillOpen = !processRegistry || typeof processRegistry.query !== 'function' || processRegistry.query(current.processId).open;
      if (!stillOpen) current = null;
    }
    return current;
  }
  function cancel() {
    if (current && current.pendingSubmitTimer) clearTimeout(current.pendingSubmitTimer);
    current = null;
  }

  window.TradeJournalAIWorkflowEngine = {
    start: start,
    applyKnownFields: applyKnownFields,
    current: currentWorkflow,
    pruneIfAbandoned: pruneIfAbandoned,
    cancel: cancel,
    // Exposed for tests (and any future caller with a reason to tune it) rather than a
    // hardcoded, unreachable constant - see SUBMIT_GRACE_MS's own comment above.
    setSubmitGraceMs: function (ms) { SUBMIT_GRACE_MS = ms; }
  };
}());
