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
    // Snapshot before iterating - a handler unsubscribing itself (or another) mid-dispatch must
    // never skip/duplicate a still-pending listener, the same defensive copy convention used
    // elsewhere in this codebase's own small pub/sub helpers.
    list.slice().forEach(function (entry) {
      if (entry.path !== path) return;
      try { entry.fn(Object.assign({ processId: processId, path: path, timestamp: Date.now() }, meta || {})); } catch (_) { /* one bad listener must never break another */ }
    });
  }

  window.TradeJournalAIFieldFillBus = { on: on, emit: emit };
}());
