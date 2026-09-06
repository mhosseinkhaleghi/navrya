(function () {
  'use strict';
  // Journey H1: the presentation/animation event bus. ai-process-registry.js's applyValue() is a
  // plain script module loaded before React ever runs (see that file's own header comment) - it
  // cannot import a React hook to tell a field "you were just voice-filled." This bus is the
  // decoupling seam: applyValue() emits a plain, synchronous event here every time a value
  // actually lands on the real UI; any component (via useAiFieldFill.js) subscribes by its own
  // (processId, path) pair to know when to play its magic-fill animation. This bus carries only
  // presentation metadata (path/value/mode/timestamp) - it is never a second source of truth for
  // form data, and nothing here persists anything.
  var handlers = {}; // processId -> [{path, fn}]
  // Slice V1 (visual step/AiMagicFill), audit item 5: a monotonic id, unique per emit() call
  // (never reused, never derived from a value/timestamp that two rapid, genuinely distinct fills
  // could share) - lets a consumer (useAiFieldFill.js) tell "a NEW fill just happened" apart from
  // "the same still-active pulse re-affirming itself," which a single boolean can never express.
  // Found via a real repro: two rapid voice corrections to the same field within one animation
  // window ("15 minutes" then "no, 5 minutes") left the SECOND value's typewriter reveal never
  // restarting, since the boolean pulse never actually transitions false->true again.
  var nextEventId = 1;

  function key(processId) { return String(processId); }

  function on(processId, path, fn) {
    if (typeof fn !== 'function') return function () {};
    var list = handlers[key(processId)] || (handlers[key(processId)] = []);
    var entry = { path: path, fn: fn };
    list.push(entry);
    return function off() {
      var idx = list.indexOf(entry);
      if (idx > -1) list.splice(idx, 1);
    };
  }

  function emit(processId, path, meta) {
    var list = handlers[key(processId)];
    if (!list || !list.length) return;
    var eventId = nextEventId++;
    // Snapshot before iterating - a handler unsubscribing itself (or another) mid-dispatch must
    // never skip/duplicate a still-pending listener, the same defensive copy convention used
    // elsewhere in this codebase's own small pub/sub helpers.
    list.slice().forEach(function (entry) {
      if (entry.path !== path) return;
      try { entry.fn(Object.assign({ processId: processId, path: path, timestamp: Date.now(), eventId: eventId }, meta || {})); } catch (_) { /* one bad listener must never break another */ }
    });
  }

  window.TradeJournalAIFieldFillBus = { on: on, emit: emit };
}());
