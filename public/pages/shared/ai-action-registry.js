(function () {
  'use strict';
  // Extends TradeJournalAIProcessRegistry's "fill an already-open form" contract with discovery
  // and starting: an action describes how to decide it's relevant right now (available), how to
  // open its own real UI (open), and how to submit through the app's real persistence path
  // (submit) plus what to do with the result (resultContext, e.g. navigate to it). Deliberately a
  // second, small registry rather than a change to ai-process-registry.js's existing contract -
  // every current register() call site (trade wizard, mental-health intake, etc.) is untouched.
  var actions = {};

  function registerAction(config) {
    if (!config || !config.id) return;
    actions[config.id] = Object.assign({
      domain: null,
      description: '',
      aliases: [],
      requiredFields: [],
      optionalFields: [],
      riskLevel: 'low',
      available: function () { return true; },
      open: function () {},
      normalizeField: function (path, value) { return value; },
      submit: function () { return undefined; },
      resultContext: function () {}
    }, config);
  }

  function get(id) { return actions[id] || null; }

  // Trimmed to exactly what the server-side model needs to pick an action and extract fields -
  // never the open()/submit()/resultContext() functions themselves, which never leave the client.
  function catalogFor(context) {
    return Object.keys(actions)
      .map(function (id) { return actions[id]; })
      .filter(function (action) {
        try { return !!action.available(context); } catch (_) { return false; }
      })
      .map(function (action) {
        return {
          id: action.id,
          description: action.description,
          aliases: action.aliases.slice(),
          requiredFields: action.requiredFields.slice(),
          optionalFields: action.optionalFields.slice()
        };
      });
  }

  window.TradeJournalAIActionRegistry = { registerAction: registerAction, get: get, catalogFor: catalogFor };
}());
