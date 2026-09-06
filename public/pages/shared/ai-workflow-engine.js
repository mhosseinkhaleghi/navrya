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

  // Journey F: an action whose target UI has a STABLE, well-known process id (session.create ->
  // 'session-create', trade.calculator -> 'trade-calculator') needs nothing more than
  // processIdFor() below. An action that creates a brand-new entity first (pattern.create,
  // strategy.create, ...) targets a process id that only exists AFTER open() runs
  // (PatternStore.create() returns a real id, and the real editor registers under
  // 'pattern-editor-' + that id) - processIdFor(actionId) alone can never express that. Rather
  // than inventing a second mechanism, open() may optionally return (or resolve to) an object
  // with a `processId` field, which overrides the default once it's known.
  //
  // start() stays synchronous (every existing caller/test relies on that) - the returned/resolved
  // value from open() is stashed as `pendingOpen` and resolved lazily, on the very first
  // applyKnownFields() call for this workflow instead (see that function's own comment). Every
  // existing action's open() returns undefined, Promise.resolve(undefined) is a no-op, and this
  // is completely unobservable to them.
  //
  // `initialFields` (added for pattern.edit-shaped actions): the same {path,value} pairs this
  // turn already extracted, passed straight through to open() as a second argument - open() never
  // writes them into `known` itself (that stays applyKnownFields()'s own job, right after this
  // returns), this is purely so an action that must RESOLVE an existing real entity before it can
  // open anything (e.g. "Edit the Liquidity Sweep pattern's threshold to 85%" - which real Pattern
  // even is that?) has the name to look up on the very same turn, instead of only ever seeing an
  // empty `known`. An action that creates rather than resolves (pattern.create) simply ignores the
  // second argument, unaffected.
  function start(actionId, context, initialFields) {
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
    try {
      current.pendingOpen = Promise.resolve(action.open(context, initialFields));
    } catch (_) {
      // opening is best-effort - the workflow state is still usable even if navigation/opening
      // partly failed (a synchronous throw is treated the same as open() resolving to nothing).
      current.pendingOpen = Promise.resolve(null);
    }
    return current;
  }

  // Journey H1 (stale-action protection, brief sections 27-28): captures the "known-good" real UI
  // state (which surface, which step) this workflow is about to drive. processId isn't resolved
  // yet for a pattern.create-shaped action at this exact synchronous point (see start()'s own
  // comment on pendingOpen) - capture is deferred to applyKnownFields()'s first call, right after
  // pendingOpen resolves and workflow.processId is finally the real one, never the placeholder
  // processIdFor(actionId) guess.
  function captureUiSnapshot(workflow) {
    var guard = window.TradeJournalAIUiRevisionGuard;
    workflow.uiSnapshot = guard && typeof guard.capture === 'function' ? guard.capture(workflow.processId) : null;
  }

  // Applies each {path, value} pair to the real, already-open UI via
  // TradeJournalAIProcessRegistry.applyValue() - live sync, no manual "Apply" click, unlike the
  // existing screenshot-review suggestions[] flow which stays a deliberate manual-approval UX for
  // its own use case. Once nothing required is left missing, submits through the action's own
  // submit()/resultContext() and clears the workflow. Returns the resulting workflow state (or
  // null once it has completed).
  async function applyKnownFields(fields, context) {
    if (!current) return current;
    var workflow = current;
    var actionRegistry = window.TradeJournalAIActionRegistry;
    var processRegistry = window.TradeJournalAIProcessRegistry;
    var action = actionRegistry && actionRegistry.get(workflow.actionId);
    if (!action) return current;

    // Journey F: resolve start()'s stashed open() result exactly once, on this workflow's first
    // applyKnownFields() call - see start()'s own comment on why this is deferred rather than
    // awaited there. `current` may have moved on (cancelled, superseded by a brand-new start())
    // while this specific await was pending; re-check identity before touching it, the same
    // pattern scheduleSubmit() below already uses for the identical reason.
    if (workflow.pendingOpen) {
      var openResult = null;
      try { openResult = await workflow.pendingOpen; } catch (_) { /* best-effort, matching start()'s own synchronous-throw handling */ }
      if (current !== workflow) return current;
      if (openResult && typeof openResult === 'object' && openResult.processId) workflow.processId = openResult.processId;
      workflow.pendingOpen = null;
    }

    // Journey H1 (stale-action protection): the first call for this workflow captures the
    // known-good real UI state now that processId is finally the real one (see start()'s own
    // comment on why this can't happen synchronously there). Every later call checks whether the
    // real UI has since moved out from under it - closed, a different step from a manual
    // Back/Next/Skip, or a different foreground surface now topmost - BEFORE this turn's fields
    // ever touch it.
    var revisionGuard = window.TradeJournalAIUiRevisionGuard;
    if (!workflow.uiSnapshot) {
      captureUiSnapshot(workflow);
    } else if (revisionGuard && typeof revisionGuard.hasDiverged === 'function') {
      var divergence = revisionGuard.hasDiverged(workflow.uiSnapshot);
      if (divergence === 'closed' || divergence === 'surface') {
        // The real UI this workflow was driving is genuinely gone (closed, or a different surface
        // is now topmost) - resurrecting this workflow's stale assumptions onto whatever the user
        // has since moved to by hand would be exactly the "AI restores an overridden value" bug
        // this guard exists to prevent (brief sections 27, 49-51: manual edits/navigation are
        // always authoritative). Clear it - a later turn re-evaluates fresh against whatever the
        // real UI actually shows next, the same way chat-dock-core.js's own activeProcess
        // resolution already fills an open process it didn't itself start.
        if (current === workflow) current = null;
        return null;
      }
      if (divergence === 'step') {
        // Found via real production testing (2026-08-28 bug report): the SAME wizard this
        // workflow is driving simply moved to a different step under the user's own hand (a real
        // Next/Back/Skip click) - the most ordinary thing that can happen mid-intake or mid-wizard,
        // not a sign the workflow is stale. Treating it like 'closed'/'surface' above (abandon the
        // whole workflow) silently ended live voice-fill for the rest of the session the instant
        // this happened - chat-dock-core.js has no fallback that auto-applies fields into an open
        // process no live workflow owns, so once abandoned, only manual click-to-apply suggestions
        // were ever offered again, a dead end for voice. Re-baseline to the real step instead and
        // keep collecting - this turn's own fields still land on whichever step they actually
        // belong to (ai-process-registry.js's own applyValue() drives the real step there itself,
        // forward or back, via stepForPath/goToStep), so Voice follows the user, exactly as the
        // brief requires, rather than giving up on them.
        captureUiSnapshot(workflow);
      }
    }

    var appliedAny = false;
    (fields || []).forEach(function (field) {
      // Slice W1 (field/gate contracts): explicit requested-clear semantics. An OMITTED field
      // (simply absent from this turn's extraction) must remain the no-op it always was - that
      // case is unaffected below. A field arriving with mode:'clear' is a DIFFERENT, deliberate
      // signal ("the user explicitly asked to clear this") that must reach the real setter/
      // readback even though its value is empty/null - the exact case the old unconditional
      // falsy-value skip below could never distinguish from mere omission. Only ever honored for a
      // field the action itself declares clearable (action.clearableFields) - a field with no
      // sensible "empty" state stays exactly as unclearable as before this change.
      if (field && field.path && field.mode === 'clear') {
        var clearableFields = Array.isArray(action.clearableFields) ? action.clearableFields : [];
        if (clearableFields.indexOf(field.path) === -1) return; // not a field this action permits clearing
        current.known[field.path] = null;
        // Clearing a REQUIRED field must reopen missing status - missingFields() below already
        // does this correctly once `known` genuinely holds null, so no separate branch is needed.
        if (processRegistry) { processRegistry.applyValue(current.processId, field.path, null, 'clear'); appliedAny = true; }
        return;
      }
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
    if (current !== workflow) return current;

    // Journey H1: re-baseline the known-good snapshot AFTER this turn's own field application (and
    // any resulting real step-advance it triggered via ai-process-registry.js's own
    // stepForPath/goToStep) has settled - so the guard above never mistakes THIS engine's own
    // legitimate step-follow for a human's independent action on the very next turn.
    if (appliedAny) captureUiSnapshot(workflow);

    // Any turn re-evaluates from scratch - a previously scheduled submit must never fire against
    // whatever is current by the time it would run; if the set is still complete after this turn,
    // scheduleSubmit() below re-arms a fresh window.
    if (current.pendingSubmitTimer) { clearTimeout(current.pendingSubmitTimer); current.pendingSubmitTimer = null; }

    // Journey F: an action whose real entity already persists the instant open() creates it
    // (pattern.create, pattern.edit, strategy.create, strategy.edit - submit() is already a
    // no-op for every one of them) declares entityAlreadyPersisted: true precisely so this never
    // fires for it. Found via real browser testing of a Strategy created-then-edited-a-few-
    // seconds-later flow: the moment the SOLE required field (often just 'name') became known,
    // this scheduled a submit exactly like session.create's real "time to persist now" moment -
    // but there is no real submit step here, only workflow.status flipping to 'pending-submit'
    // and then, once SUBMIT_GRACE_MS elapsed, current being cleared to null. A follow-up turn
    // ("Set max risk to 1%.") that happened to arrive a beat AFTER that grace window had already
    // elapsed found no workflow left to continue - chat-dock-core.js's own "workflow continued"
    // branch requires a live currentWorkflow, so the turn fell back to fresh action-discovery
    // instead, and the new field value was lost. An action whose real persistence already
    // happened has nothing here to actually finish - it should stay collecting for as long as the
    // real target UI stays open (pruneIfAbandoned already clears it once that closes), so any
    // later turn keeps landing on the same live workflow instead of racing a timer that exists
    // for a different kind of action entirely.
    if ((current.status === 'collecting' || current.status === 'pending-submit') && !current.missing.length) {
      if (action.entityAlreadyPersisted) current.status = 'collecting';
      else scheduleSubmit(current, action, context);
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

  // 2026-08-28 bug report: a small number of REAL, app-owned popups (currently only the
  // Pre-Session Check-In - preSessionCheckInModal.jsx) show themselves as a genuine precondition
  // BEFORE another action's own target UI ever opens (session.movementEntry.create's/
  // session.scenario.create's own open() is still mid-poll, waiting for its real target to
  // exist, while the popup is genuinely the topmost thing on screen) - or independently, from a
  // human's own manual click, with no AI workflow in flight at all. Neither case was ever
  // fillable by voice before this: chat-dock-core.js's field-application only ever reaches a
  // process that either (a) a brand-new action.id just started, or (b) an ALREADY in-flight
  // workflow's own processId already matches - a reactive popup opened by app code satisfies
  // neither, so voice could only ever produce a manual, click-to-apply suggestion for it (a dead
  // end, since no click-to-apply control is reachable from Voice).
  //
  // retargetOrStart() is the fix: if a workflow is already in flight (the common case - the user
  // asked to add an entry, and THIS popup interrupted that), point the SAME workflow at the
  // popup's own real processId for as long as it's showing (pushing the previous processId onto
  // a small stack, restored by restorePreviousProcessId() once it closes) - the original
  // workflow's own open() polling, still running the whole time, resumes exactly where it left
  // off once restored, rather than being abandoned by starting a second, unrelated workflow (see
  // applyKnownFields()'s own comment on why a superseded workflow's late-resolving open() safely
  // no-ops - that mechanism is what an abandoned workflow would fall into, silently orphaning the
  // user's original request). If nothing was in flight (a human's own manual click opened the
  // popup with no AI involvement yet), starts a small, self-contained workflow instead so the
  // popup is still voice-fillable standalone - it clears itself automatically once the popup
  // closes, via this engine's own existing pruneIfAbandoned().
  function retargetOrStart(processId, actionId, context, initialFields) {
    if (current) {
      if (current.processId === processId) return current;
      current._retargetStack = current._retargetStack || [];
      current._retargetStack.push(current.processId);
      current.processId = processId;
      current.uiSnapshot = null; // force a fresh capture against the new real surface
      return current;
    }
    return start(actionId, context, initialFields);
  }

  // Hands a retargeted workflow back to whichever real processId it was driving before the
  // interruption (see retargetOrStart() above) - a no-op if nothing was ever retargeted (the
  // standalone-popup case handles its own cleanup via pruneIfAbandoned() instead).
  function restorePreviousProcessId() {
    if (!current || !current._retargetStack || !current._retargetStack.length) return current;
    current.processId = current._retargetStack.pop();
    current.uiSnapshot = null;
    return current;
  }

  window.TradeJournalAIWorkflowEngine = {
    start: start,
    retargetOrStart: retargetOrStart,
    restorePreviousProcessId: restorePreviousProcessId,
    applyKnownFields: applyKnownFields,
    current: currentWorkflow,
    pruneIfAbandoned: pruneIfAbandoned,
    cancel: cancel,
    // Exposed for tests (and any future caller with a reason to tune it) rather than a
    // hardcoded, unreachable constant - see SUBMIT_GRACE_MS's own comment above. Latency pass,
    // section 15: chat-dock-core.js's own gate-field confirm fast path temporarily zeroes this for
    // the one applyKnownFields() call that completes a destructive/consequential confirmation (no
    // "same-breath correction" concept applies to an explicit yes/no), then restores whatever it
    // was - getSubmitGraceMs() lets it save/restore the real current value rather than assuming 3000.
    setSubmitGraceMs: function (ms) { SUBMIT_GRACE_MS = ms; },
    getSubmitGraceMs: function () { return SUBMIT_GRACE_MS; }
  };
}());
