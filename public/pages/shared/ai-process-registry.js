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

  function register(processId, config) {
    registrations[processId] = Object.assign({
      allowlist: [],
      isOpen: function () { return false; },
      activeStep: function () { return null; },
      applyValue: function () {},
      layer: 'background',
      // Journey H1: stepForPath(path) -> step number|null, goToStep(step) -> void. Both optional -
      // only the two genuine multi-step wizards (trade-wizard, mh-intake) declare them. When
      // present, applyValue() below uses them to keep the real, visible wizard step in lockstep
      // with whichever field Voice just supplied, instead of writing a field into a step the user
      // isn't looking at.
      stepForPath: null,
      goToStep: null
    }, config || {});
    registrationOrderCounter += 1;
    registrations[processId]._order = registrationOrderCounter;
  }

  function query(processId) {
    var entry = registrations[processId];
    if (!entry) return { open: false, step: null };
    return { open: !!entry.isOpen(), step: entry.activeStep() };
  }

  // Journey H1: the same {open, step} query() above already answers, plus `layer` - a separate
  // function rather than changing query()'s own return shape, since query() is a long-established
  // contract several callers already destructure by name; adding a field to it would have been
  // safe too, but this keeps the "topmost surface" concept opt-in for the callers that actually
  // need it (ai-ui-revision-guard.js, ai-surface-context.js) without touching query()'s own tests.
  function snapshot(processId) {
    var entry = registrations[processId];
    if (!entry) return { open: false, step: null, layer: null };
    return { open: !!entry.isOpen(), step: entry.activeStep(), layer: entry.layer };
  }

  function activeOpenProcess() {
    var ids = Object.keys(registrations);
    var best = null;
    for (var i = 0; i < ids.length; i++) {
      var entry = registrations[ids[i]];
      if (!entry.isOpen()) continue;
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
    return { id: best, allowlist: winner.allowlist.slice(), step: winner.activeStep(), stepForPath: winner.stepForPath || null };
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
      .filter(function (id) { return id.indexOf(prefix) === 0 && registrations[id].isOpen(); })
      .sort(function (a, b) { return registrations[b]._order - registrations[a]._order; });
  }

  function applyValue(processId, path, value, mode) {
    var entry = registrations[processId];
    if (!entry || entry.allowlist.indexOf(path) === -1) return false;
    // Journey H1 (wizard lockstep, section 18-20 of the brief): a field belonging to a step the
    // real wizard isn't currently showing must never be silently written into a step the user
    // can't see. When the registration declares stepForPath/goToStep, resolve which step this
    // field belongs to and, if it differs from the step actually on screen, drive the SAME real
    // Next/Back mechanism a human click would (goToStep) before writing the value - never a fake
    // step number, never bypassing whatever validation goToStep's own implementation enforces.
    // A field stepForPath has no opinion about (returns null - not every field is step-scoped)
    // applies wherever the wizard already is, unchanged from today's behavior.
    if (typeof entry.stepForPath === 'function' && typeof entry.goToStep === 'function') {
      var targetStep = entry.stepForPath(path);
      if (targetStep !== null && targetStep !== undefined && targetStep !== entry.activeStep()) {
        entry.goToStep(targetStep);
      }
    }
    entry.applyValue(path, value, mode);
    // Journey H1 (magic-fill animation): fire-and-forget presentation signal only, AFTER the real
    // value has already landed on the real UI's own state above - never a precondition for the
    // write itself, and never observable to any caller that doesn't opt into the bus.
    if (window.TradeJournalAIFieldFillBus) {
      try { window.TradeJournalAIFieldFillBus.emit(processId, path, { value: value, mode: mode }); } catch (_) { /* presentation-only, must never break the real write above */ }
    }
    return true;
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

  window.TradeJournalAIProcessRegistry = { register: register, query: query, snapshot: snapshot, activeOpenProcess: activeOpenProcess, openIdsWithPrefix: openIdsWithPrefix, applyValue: applyValue, submit: submit };
}());
