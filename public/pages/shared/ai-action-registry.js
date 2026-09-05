(function () {
  'use strict';
  // Extends TradeJournalAIProcessRegistry's "fill an already-open form" contract with discovery
  // and starting: an action describes how to decide it's relevant right now (available), how to
  // open its own real UI (open), and how to submit through the app's real persistence path
  // (submit) plus what to do with the result (resultContext, e.g. navigate to it). Deliberately a
  // second, small registry rather than a change to ai-process-registry.js's existing contract -
  // every current register() call site (trade wizard, mental-health intake, etc.) is untouched.
  var actions = {};
  var COMPLETION_POLICIES = {
    'auto-submit': true,
    'explicit-confirm': true,
    'persist-on-change': true,
    command: true,
    'manual-only': true
  };

  function normalizedCompletionPolicy(config) {
    if (config && COMPLETION_POLICIES[config.completionPolicy]) return config.completionPolicy;
    // Compatibility lives at this one registration boundary. The Workflow Engine consumes only
    // completionPolicy and no longer knows what the historical entityAlreadyPersisted flag means.
    return config && config.entityAlreadyPersisted ? 'persist-on-change' : 'auto-submit';
  }

  function registerAction(config) {
    if (!config || !config.id) return;
    var action = Object.assign({
      domain: null,
      description: '',
      aliases: [],
      requiredFields: [],
      optionalFields: [],
      riskLevel: 'low',
      completionPolicy: normalizedCompletionPolicy(config),
      confirmationField: 'confirm',
      voicePolicy: 'unsupported',
      deterministicMatch: null,
      available: function () { return true; },
      open: function () {},
      normalizeField: function (path, value) { return value; },
      submit: function () { return undefined; },
      resultContext: function () {}
    }, config);
    action.completionPolicy = normalizedCompletionPolicy(action);
    action._completionPolicyDeclared = !!config.completionPolicy;
    action._voicePolicyDeclared = !!config.voicePolicy;
    actions[config.id] = action;
  }

  function get(id) { return actions[id] || null; }

  // Trimmed to exactly what the server-side model needs to pick an action and extract fields -
  // never the open()/submit()/resultContext() functions themselves, which never leave the client.
  function shortlisted(action, options) {
    if (!options) return true;
    if (Array.isArray(options.actionIds) && options.actionIds.indexOf(action.id) === -1) return false;
    if (options.domain && action.domain !== options.domain) return false;
    if (options.processId) {
      var ids = Array.isArray(action.processIds) ? action.processIds : action.processId ? [action.processId] : [];
      if (ids.length && !ids.some(function (id) { return id === options.processId || (id.slice(-1) === '*' && options.processId.indexOf(id.slice(0, -1)) === 0); })) return false;
    }
    return true;
  }

  function availableActions(context, options) {
    return Object.keys(actions)
      .map(function (id) { return actions[id]; })
      .filter(function (action) { return shortlisted(action, options); })
      .filter(function (action) {
        try { return !!action.available(context); } catch (_) { return false; }
      });
  }

  function catalogFor(context, options) {
    return availableActions(context, options)
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

  // Deterministic routing stays action-owned: each action may reuse the canonical extractor and
  // its own domain adapters in deterministicMatch(). The registry only arbitrates confidence and
  // ambiguity; it contains no parallel intent parser or product vocabulary of its own.
  function resolveDeterministic(text, context, options) {
    var matches = [];
    availableActions(context, options).forEach(function (action) {
      if (typeof action.deterministicMatch !== 'function') return;
      var match = null;
      try { match = action.deterministicMatch(text, context); } catch (_) { match = null; }
      if (!match) return;
      var high = match.confidence === 'high' || (typeof match.confidence === 'number' && match.confidence >= 0.9);
      if (!high) return;
      matches.push({ actionId: action.id, confidence: match.confidence, fields: Array.isArray(match.fields) ? match.fields : [] });
    });
    return matches.length === 1 ? matches[0] : null;
  }

  function coverageContract() {
    return Object.keys(actions).map(function (id) {
      var action = actions[id];
      return {
        id: id,
        domain: action.domain,
        completionPolicy: action.completionPolicy,
        completionPolicyDeclared: !!action._completionPolicyDeclared,
        voicePolicy: action.voicePolicy,
        voicePolicyDeclared: !!action._voicePolicyDeclared,
        requiredFields: action.requiredFields.slice(),
        optionalFields: action.optionalFields.slice()
      };
    });
  }

  window.TradeJournalAIActionRegistry = {
    registerAction: registerAction,
    get: get,
    catalogFor: catalogFor,
    resolveDeterministic: resolveDeterministic,
    coverageContract: coverageContract
  };
}());
