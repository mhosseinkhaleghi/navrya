(function () {
  'use strict';
  var KEY = 'tradejournal:ai-settings:v1';
  var BYOK_KEY = 'tradejournal:ai-byok:v1';

  // BYO API keys are in-memory only for the session by default (never in localStorage) -
  // opt-in persistence is the only path that writes them anywhere, and it writes to the
  // separate BYOK_KEY, never into the settings object itself.
  var sessionKeys = {};

  var PROVIDER_CATALOG = [
    { id: 'openai', label: 'OpenAI', models: ['gpt-5.6', 'gpt-4.1', 'gpt-4o'], supportsVoice: true },
    { id: 'anthropic', label: 'Claude', models: ['claude-sonnet-4-5', 'claude-opus-4-1'], supportsVoice: false },
    { id: 'kimi', label: 'Kimi', models: ['moonshot-v1-8k', 'moonshot-v1-32k'], supportsVoice: false },
    { id: 'deepseek', label: 'DeepSeek', models: ['deepseek-chat', 'deepseek-reasoner'], supportsVoice: false }
  ];

  function defaults() {
    var modelByProvider = {};
    PROVIDER_CATALOG.forEach(function (p) { modelByProvider[p.id] = p.models[0]; });
    return { provider: 'openai', modelByProvider: modelByProvider, persistApiKey: false, monthlyTokenBudget: null, therapistModeDefault: false };
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      var parsed = raw ? JSON.parse(raw) : {};
      var base = defaults();
      return Object.assign({}, base, parsed, { modelByProvider: Object.assign({}, base.modelByProvider, parsed.modelByProvider || {}) });
    } catch (_) {
      return defaults();
    }
  }

  function write(value) { localStorage.setItem(KEY, JSON.stringify(value)); return value; }

  function settings() { return load(); }

  function saveSettings(patch) {
    var current = load();
    var next = Object.assign({}, current, patch || {});
    if (patch && patch.modelByProvider) next.modelByProvider = Object.assign({}, current.modelByProvider, patch.modelByProvider);
    return write(next);
  }

  function loadByok() {
    try { var raw = localStorage.getItem(BYOK_KEY); return raw ? JSON.parse(raw) : {}; }
    catch (_) { return {}; }
  }
  function writeByok(value) { localStorage.setItem(BYOK_KEY, JSON.stringify(value)); }

  // Restore persisted keys into memory once, at load time, only if the user had already
  // opted in on a previous visit - never read implicitly otherwise.
  (function restorePersisted() {
    if (!settings().persistApiKey) return;
    var byok = loadByok();
    Object.keys(byok).forEach(function (provider) { sessionKeys[provider] = byok[provider]; });
  }());

  function getKey(provider) { return sessionKeys[provider] || ''; }

  function setKey(provider, value) {
    sessionKeys[provider] = value || '';
    if (settings().persistApiKey) {
      var byok = loadByok();
      byok[provider] = value || '';
      writeByok(byok);
    }
  }

  function clearKey(provider) {
    delete sessionKeys[provider];
    var byok = loadByok();
    delete byok[provider];
    writeByok(byok);
  }

  // Atomic toggle: flips the persisted setting AND immediately syncs the current
  // in-memory keys into (or out of) BYOK_KEY, so the two never drift out of sync.
  function setPersistApiKey(value) {
    saveSettings({ persistApiKey: !!value });
    if (value) writeByok(Object.assign({}, loadByok(), sessionKeys));
    else writeByok({});
  }

  function providerCatalog() { return PROVIDER_CATALOG.map(function (p) { return Object.assign({}, p, { models: p.models.slice() }); }); }

  function activeProvider() { return load().provider; }
  function activeModel() {
    var current = load();
    var entry = PROVIDER_CATALOG.filter(function (p) { return p.id === current.provider; })[0];
    return current.modelByProvider[current.provider] || (entry ? entry.models[0] : null);
  }

  window.TradeJournalAISettingsStore = {
    settings: settings, saveSettings: saveSettings,
    getKey: getKey, setKey: setKey, clearKey: clearKey, setPersistApiKey: setPersistApiKey,
    providerCatalog: providerCatalog, activeProvider: activeProvider, activeModel: activeModel
  };
}());
