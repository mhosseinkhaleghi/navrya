(function () {
  'use strict';
  // Journey H1: the one reusable "which real wizard step does this field belong to" primitive.
  // Pure lookup-table builder - no DOM/React/store dependency, so both tradeLogModal.jsx's and
  // mentalHealthIntakeModal.jsx's own registration effects can build one of these once (from a
  // plain {step: [paths-or-dot-prefixes]} groups object already sitting next to their real field
  // lists) and hand ai-process-registry.js's applyValue() a single stepForPath(path) function.
  //
  // Match rule: exact path match wins first (e.g. 'direction' -> step 1); otherwise the longest
  // registered dot-prefix that `path` starts with wins (e.g. 'intake.demographics.age' matches
  // group prefix 'intake.demographics.' over a shorter/unrelated one) - "longest prefix" so a
  // more specific group (a single field) is never shadowed by a broader one (a whole section)
  // registered for an earlier step. A path matching nothing returns null - callers must treat
  // that as "no step opinion", never as "step 0".
  function forGroups(groups) {
    var entries = [];
    Object.keys(groups || {}).forEach(function (stepKey) {
      var step = Number(stepKey);
      (groups[stepKey] || []).forEach(function (matcher) {
        entries.push({ step: step, matcher: String(matcher) });
      });
    });

    function stepForPath(path) {
      if (path === undefined || path === null) return null;
      var value = String(path);
      var exact = null;
      var bestPrefix = null;
      var bestPrefixLen = -1;
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        if (entry.matcher === value) { exact = entry.step; continue; }
        // A matcher ending in '.' (a section prefix, e.g. 'intake.demographics.') matches any
        // path starting with it; a matcher with no dot at all is also treated as an exact-only
        // field name (never a prefix of some longer, unrelated field) unless it explicitly ends
        // in '.'.
        var isPrefixMatcher = /\.$/.test(entry.matcher);
        if (isPrefixMatcher && value.indexOf(entry.matcher) === 0 && entry.matcher.length > bestPrefixLen) {
          bestPrefix = entry.step;
          bestPrefixLen = entry.matcher.length;
        }
      }
      if (exact !== null) return exact;
      return bestPrefix;
    }

    return { stepForPath: stepForPath };
  }

  window.TradeJournalAIWizardStepMap = { forGroups: forGroups };
}());
