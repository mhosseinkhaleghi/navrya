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
    entry.applyValue(path, value, mode);
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

  window.TradeJournalAIProcessRegistry = { register: register, query: query, activeOpenProcess: activeOpenProcess, openIdsWithPrefix: openIdsWithPrefix, applyValue: applyValue, submit: submit };
}());
