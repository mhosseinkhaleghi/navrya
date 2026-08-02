(function () {
  'use strict';
  // Universal process/form access (A4): every fillable flow registers itself here so the
  // global dock (A3) can detect "is something open right now, and what can I suggest into
  // it" without building a second suggestion mechanism. isOpen() is a DOM-presence check
  // deliberately - no flow needs internal open/close event plumbing added, just one
  // registration call at the top of its existing open-function.
  var registrations = {};

  function register(processId, config) {
    registrations[processId] = Object.assign({
      allowlist: [],
      isOpen: function () { return false; },
      activeStep: function () { return null; },
      applyValue: function () {}
    }, config || {});
  }

  function query(processId) {
    var entry = registrations[processId];
    if (!entry) return { open: false, step: null };
    return { open: !!entry.isOpen(), step: entry.activeStep() };
  }

  function activeOpenProcess() {
    var ids = Object.keys(registrations);
    for (var i = 0; i < ids.length; i++) {
      var entry = registrations[ids[i]];
      if (entry.isOpen()) return { id: ids[i], allowlist: entry.allowlist.slice(), step: entry.activeStep() };
    }
    return null;
  }

  function applyValue(processId, path, value, mode) {
    var entry = registrations[processId];
    if (!entry || entry.allowlist.indexOf(path) === -1) return false;
    entry.applyValue(path, value, mode);
    return true;
  }

  window.TradeJournalAIProcessRegistry = { register: register, query: query, activeOpenProcess: activeOpenProcess, applyValue: applyValue };
}());
