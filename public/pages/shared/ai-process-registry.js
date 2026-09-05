(function () {
  'use strict';
  // Universal process/form access (A4): every fillable flow registers itself here so the
  // global dock (A3) can detect "is something open right now, and what can I suggest into
  // it" without building a second suggestion mechanism. isOpen() is a DOM-presence check
  // deliberately - no flow needs internal open/close event plumbing added, just one
  // registration call at the top of its existing open-function.
  var registrations = {};
  // Bumped on every register() call (including re-registrations of the same processId) so
  // activeOpenProcess() can prefer whichever open registration was (re-)touched most recently.
  // Only matters once more than one registered process can legitimately be open at the same
  // time (e.g. several session scenario cards, or several community comment boxes, expanded
  // together) - every original singleton-modal flow only ever has one candidate open at all,
  // so this is a strict improvement with no behavior change for those.
  var registrationOrderCounter = 0;

  // Journey H1: 'foreground' vs 'background' is the entire "topmost surface" concept this app
  // gets - not a full z-index/DOM-stacking model (nothing here needs one; every real registrant
  // is either a modal/wizard/detail-editor genuinely laid over the rest of the page, or a
  // persistent inline section competing WITH the rest of the page, never both at once). Defaults
  // to 'background' so every one of the ~30 existing registrations that never passes this key is
  // completely unaffected - registering with layer:'foreground' is an explicit opt-in a real
  // modal/wizard/editor's own registration effect makes for itself.
  var LAYER_RANK = { background: 0, foreground: 1 };
  var APPLY_REASONS = { unregistered: true, 'not-allowed': true, invalid: true, stale: true, rejected: true };

  function safeIsOpen(entry) {
    try { return !!entry.isOpen(); } catch (_) { return false; }
  }

  function applyResult(applied, value, reason, details) {
    var result = { applied: !!applied };
    if (applied && value !== undefined) result.value = value;
    if (!applied) result.reason = APPLY_REASONS[reason] ? reason : 'rejected';
    if (details && typeof details === 'object') Object.keys(details).forEach(function (key) { result[key] = details[key]; });
    return result;
  }

  // One shared step-navigation primitive for both a real write and the workflow's next-question
  // preparation. A form remains the sole owner of its step state: this only calls the exact
  // `goToStep` function its registration exposed, never mutates a synthetic step value here.
  function moveToPathStep(entry, path) {
    if (typeof entry.stepForPath !== 'function' || typeof entry.goToStep !== 'function') {
      return { moved: false, step: entry.activeStep() };
    }
    var targetStep = entry.stepForPath(path);
    if (targetStep === null || targetStep === undefined || targetStep === entry.activeStep()) {
      return { moved: false, step: entry.activeStep() };
    }
    entry.goToStep(targetStep);
    return { moved: true, step: targetStep };
  }

  function register(processId, config) {
    registrations[processId] = Object.assign({
      allowlist: [],
      isOpen: function () { return false; },
      activeStep: function () { return null; },
      applyValue: function () {},
      layer: 'background',
      actionId: null,
      voicePolicy: 'unsupported',
      validateValue: null,
      getValue: null,
      readValues: null,
      // Journey H1: stepForPath(path) -> step number|null, goToStep(step) -> void. Both optional -
      // only genuine multi-step flows (such as trade-wizard, mh-intake, reflection, routine, and
      // Analysis Profile onboarding) declare them. When
      // present, applyValue() below uses them to keep the real, visible wizard step in lockstep
      // with whichever field Voice just supplied, instead of writing a field into a step the user
      // isn't looking at.
      stepForPath: null,
      goToStep: null
    }, config || {});
    registrationOrderCounter += 1;
    registrations[processId]._order = registrationOrderCounter;
    registrations[processId]._revision = registrationOrderCounter;
    registrations[processId]._voicePolicyDeclared = !!(config && config.voicePolicy);
  }

  function query(processId) {
    var entry = registrations[processId];
    if (!entry) return { open: false, step: null };
    return { open: safeIsOpen(entry), step: entry.activeStep() };
  }

  // Journey H1: the same {open, step} query() above already answers, plus `layer` - a separate
  // function rather than changing query()'s own return shape, since query() is a long-established
  // contract several callers already destructure by name; adding a field to it would have been
  // safe too, but this keeps the "topmost surface" concept opt-in for the callers that actually
  // need it (ai-ui-revision-guard.js, ai-surface-context.js) without touching query()'s own tests.
  function snapshot(processId) {
    var entry = registrations[processId];
    if (!entry) return { open: false, step: null, layer: null, revision: null };
    return { open: safeIsOpen(entry), step: entry.activeStep(), layer: entry.layer, revision: entry._revision };
  }

  function activeOpenProcess() {
    var ids = Object.keys(registrations);
    var best = null;
    for (var i = 0; i < ids.length; i++) {
      var entry = registrations[ids[i]];
      if (!safeIsOpen(entry)) continue;
      if (!best) { best = ids[i]; continue; }
      var bestEntry = registrations[best];
      var entryRank = LAYER_RANK[entry.layer] || 0;
      var bestRank = LAYER_RANK[bestEntry.layer] || 0;
      // Foreground always outranks background regardless of registration order (this IS the
      // "topmost surface" rule); within the same layer, the existing most-recently-(re-)touched
      // rule is unchanged - a strict superset of the old pure-recency behavior, since every
      // existing registration defaults to the same layer ('background').
      if (entryRank > bestRank || (entryRank === bestRank && entry._order > bestEntry._order)) best = ids[i];
    }
    if (!best) return null;
    var winner = registrations[best];
    // Journey H1 closure: stepForPath passed through as a plain function reference (never called
    // here) so a caller that needs "which of this process's own fields belong to the step
    // currently on screen" (ai-context-builder.js's own currentSurface, for a context-aware
    // answer to "what does this field mean") can ask the SAME function applyValue() already uses
    // internally, rather than re-deriving step/field ownership a second way. null for a process
    // that never declared one (every non-wizard registration) - never a guessed mapping.
    return {
      id: best,
      actionId: winner.actionId || null,
      allowlist: winner.allowlist.slice(),
      step: winner.activeStep(),
      stepForPath: winner.stepForPath || null,
      layer: winner.layer,
      revision: winner._revision,
      voicePolicy: winner.voicePolicy
    };
  }

  // Journey D checkpoint: a scoped generalization of activeOpenProcess()'s own "most recently
  // touched wins" rule, for callers that need to know about every currently-open registration
  // matching one id prefix - not just whichever single one is open overall. Real need: resolving
  // "this trade"/"this strategy"/"that pattern" (ai-context-builder.js) has to check specifically
  // for an open 'trade-details-{id}'/'strategy-editor-{id}'/'pattern-editor-{id}' registration,
  // which could easily NOT be the single most-recently-touched process system-wide (e.g. the
  // user's last click was on an unrelated field in the same still-open detail view). Returns every
  // matching open id, most-recently-touched first; [] when none match - never a guess.
  function openIdsWithPrefix(prefix) {
    return Object.keys(registrations)
      .filter(function (id) { return id.indexOf(prefix) === 0 && safeIsOpen(registrations[id]); })
      .sort(function (a, b) { return registrations[b]._order - registrations[a]._order; });
  }

  // Returns a structured result. Existing registrations may keep returning the legacy boolean
  // (or no value at all); that compatibility is normalized here, once, so callers never need to
  // guess whether a UI write actually succeeded. A registration that explicitly returns false
  // can no longer be misreported as success by the Workflow Engine.
  function applyValue(processId, path, value, mode, options) {
    var entry = registrations[processId];
    if (!entry) return applyResult(false, undefined, 'unregistered');
    if (entry.allowlist.indexOf(path) === -1) return applyResult(false, undefined, 'not-allowed');
    var expectedRevision = typeof options === 'number' ? options : options && options.expectedRevision;
    if (expectedRevision !== undefined && expectedRevision !== null && entry._revision !== expectedRevision) {
      return applyResult(false, undefined, 'stale');
    }
    if (options && options.requireActive) {
      var active = activeOpenProcess();
      if (!active || active.id !== processId) return applyResult(false, undefined, 'stale');
    }

    var acceptedValue = value;
    if (typeof entry.validateValue === 'function') {
      var validation;
      try { validation = entry.validateValue(path, value, mode); } catch (_) { return applyResult(false, undefined, 'invalid'); }
      if (validation === false || (validation && typeof validation === 'object' && validation.valid === false)) {
        return applyResult(false, undefined, (validation && validation.reason) || 'invalid');
      }
      if (validation && typeof validation === 'object' && validation.value !== undefined) acceptedValue = validation.value;
    }
    // Journey H1 (wizard lockstep, section 18-20 of the brief): a field belonging to a step the
    // real wizard isn't currently showing must never be silently written into a step the user
    // can't see. When the registration declares stepForPath/goToStep, resolve which step this
    // field belongs to and, if it differs from the step actually on screen, drive the SAME real
    // Next/Back mechanism a human click would (goToStep) before writing the value - never a fake
    // step number, never bypassing whatever validation goToStep's own implementation enforces.
    // A field stepForPath has no opinion about (returns null - not every field is step-scoped)
    // applies wherever the wizard already is, unchanged from today's behavior.
    var stepTransition = moveToPathStep(entry, path);
    var handlerResult;
    try { handlerResult = entry.applyValue(path, acceptedValue, mode); } catch (_) { return applyResult(false, undefined, 'rejected'); }
    if (handlerResult === false) return applyResult(false, undefined, 'rejected');
    if (handlerResult && typeof handlerResult === 'object' && typeof handlerResult.applied === 'boolean') {
      if (!handlerResult.applied) return applyResult(false, undefined, handlerResult.reason);
      if (handlerResult.value !== undefined) acceptedValue = handlerResult.value;
    }
    // Journey H1 (magic-fill animation): fire-and-forget presentation signal only, AFTER the real
    // value has already landed on the real UI's own state above - never a precondition for the
    // write itself, and never observable to any caller that doesn't opt into the bus.
    if (window.TradeJournalAIFieldFillBus) {
      try { window.TradeJournalAIFieldFillBus.emit(processId, path, { value: acceptedValue, mode: mode }); } catch (_) { /* presentation-only, must never break the real write above */ }
    }
    // Preserve the long-standing successful result shape unless navigation actually occurred;
    // workflow callers can opt into the extra fact without breaking older strict consumers.
    return applyResult(true, acceptedValue, null, stepTransition.moved ? { stepChanged: true, step: stepTransition.step } : null);
  }

  // Preparing a question follows the same declared step map as writing its eventual answer. It
  // intentionally does not call applyValue(): moving the real UI first must never fabricate a
  // value merely to make that move happen.
  function prepareForPath(processId, path) {
    var entry = registrations[processId];
    if (!entry) return { prepared: false, reason: 'unregistered', moved: false, step: null };
    if (entry.allowlist.indexOf(path) === -1) return { prepared: false, reason: 'not-allowed', moved: false, step: entry.activeStep() };
    var transition = moveToPathStep(entry, path);
    return { prepared: true, moved: transition.moved, step: transition.step };
  }

  // Narrow compatibility adapter for any older integration that genuinely needs a boolean.
  function applyValueLegacy(processId, path, value, mode, options) {
    return applyValue(processId, path, value, mode, options).applied;
  }

  // Public readback adapter. Registrations expose only their declared allowlist; private React
  // state and the registration object itself never leave this module. The Workflow Engine calls
  // this after React has had a macrotask to commit a setState write.
  function readValues(processId, paths) {
    var entry = registrations[processId];
    if (!entry) return { read: false, reason: 'unregistered' };
    var requested = Array.isArray(paths) ? paths.slice() : entry.allowlist.slice();
    if (requested.some(function (path) { return entry.allowlist.indexOf(path) === -1; })) return { read: false, reason: 'not-allowed' };
    try {
      var values = {};
      if (typeof entry.readValues === 'function') {
        var bulk = entry.readValues(requested);
        if (bulk && typeof bulk === 'object' && bulk.read === false) return { read: false, reason: bulk.reason || 'rejected' };
        var source = bulk && typeof bulk === 'object' && bulk.values && typeof bulk.values === 'object' ? bulk.values : bulk;
        requested.forEach(function (path) { values[path] = source ? source[path] : undefined; });
        return { read: true, values: values };
      }
      if (typeof entry.getValue === 'function') {
        requested.forEach(function (path) { values[path] = entry.getValue(path); });
        return { read: true, values: values };
      }
    } catch (_) { return { read: false, reason: 'rejected' }; }
    return { read: false, reason: 'unsupported' };
  }

  function getValue(processId, path) {
    var result = readValues(processId, [path]);
    if (!result.read) return result;
    return { read: true, value: result.values[path] };
  }

  // Creates a capability-safe descriptor only for the exact process that is topmost right now.
  // This is the public adoption seam for a form opened by the human (rather than action.open()).
  function adoptActiveProcess(processId, expectedRevision) {
    var entry = registrations[processId];
    if (!entry) return { adopted: false, reason: 'unregistered' };
    var active = activeOpenProcess();
    if (!active || active.id !== processId) return { adopted: false, reason: 'not-active' };
    if (expectedRevision !== undefined && expectedRevision !== null && active.revision !== expectedRevision) return { adopted: false, reason: 'stale' };
    return {
      adopted: true,
      process: {
        id: active.id,
        actionId: active.actionId,
        allowlist: active.allowlist.slice(),
        step: active.step,
        layer: active.layer,
        revision: active.revision
      }
    };
  }

  function coverageContract() {
    return Object.keys(registrations).map(function (id) {
      var entry = registrations[id];
      return {
        id: id,
        actionId: entry.actionId || null,
        voicePolicy: entry.voicePolicy,
        declared: !!entry._voicePolicyDeclared,
        allowlist: entry.allowlist.slice(),
        layer: entry.layer
      };
    });
  }

  // Symmetric with applyValue() above, for the AI Action Registry's workflow submit step
  // (ai-workflow-engine.js): a registration that also declares a `submit` function (in addition
  // to the required-by-default applyValue) can be triggered by the AI once every required field
  // is known - the registration's own submit() is whatever the real UI's own save/create handler
  // already is, so this never becomes a second, parallel persistence path. Returns whatever that
  // function returns (commonly a Promise resolving to the created/updated record) so a caller can
  // await the real result; returns undefined for a processId with no registration or no declared
  // submit, exactly like calling nothing at all.
  function submit(processId) {
    var entry = registrations[processId];
    if (!entry || typeof entry.submit !== 'function') return undefined;
    return entry.submit();
  }

  window.TradeJournalAIProcessRegistry = {
    register: register,
    query: query,
    snapshot: snapshot,
    activeOpenProcess: activeOpenProcess,
    adoptActiveProcess: adoptActiveProcess,
    openIdsWithPrefix: openIdsWithPrefix,
    applyValue: applyValue,
    applyValueLegacy: applyValueLegacy,
    prepareForPath: prepareForPath,
    getValue: getValue,
    readValues: readValues,
    submit: submit,
    coverageContract: coverageContract
  };
}());
