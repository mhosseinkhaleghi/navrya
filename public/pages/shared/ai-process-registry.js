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

  function register(processId, config) {
    registrations[processId] = Object.assign({
      allowlist: [],
      isOpen: function () { return false; },
      activeStep: function () { return null; },
      applyValue: function () {}
    }, config || {});
    registrationOrderCounter += 1;
    registrations[processId]._order = registrationOrderCounter;
  }

  function query(processId) {
    var entry = registrations[processId];
    if (!entry) return { open: false, step: null };
    return { open: !!entry.isOpen(), step: entry.activeStep() };
  }

  function activeOpenProcess() {
    var ids = Object.keys(registrations);
    var best = null;
    for (var i = 0; i < ids.length; i++) {
      var entry = registrations[ids[i]];
      if (!entry.isOpen()) continue;
      if (!best || entry._order > registrations[best]._order) best = ids[i];
    }
    if (!best) return null;
    var winner = registrations[best];
    return { id: best, allowlist: winner.allowlist.slice(), step: winner.activeStep() };
  }

  function applyValue(processId, path, value, mode) {
    var entry = registrations[processId];
    if (!entry || entry.allowlist.indexOf(path) === -1) return false;
    entry.applyValue(path, value, mode);
    return true;
  }

  window.TradeJournalAIProcessRegistry = { register: register, query: query, activeOpenProcess: activeOpenProcess, applyValue: applyValue };
}());
