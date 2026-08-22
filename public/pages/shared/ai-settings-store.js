(function () {
  'use strict';
  // Phase 8c of the local-first-to-server-authoritative migration (see ARCHITECTURE.md's Known
  // Constraints section): provider/model/voice/budget/therapistModeDefault now read/write through
  // window.TradeJournalUserPreferences (Phase 8a's shared preferences primitive), one preference
  // key ('aiSettings') holding the whole object, same atomic whole-object merge shape
  // psychology-store.js's own Phase 8b migration already established.
  //
  // `persistApiKeyByProvider` (the "remember this engine's key" opt-in flag) and the entire BYOK
  // mechanism below it (sessionKeys/BYOK_KEY/getKey/setKey/clearKey) are deliberately NOT part of
  // this migration - explicit product decision: BYOK persistence is being removed entirely in
  // Phase 8f, not moved server-side (storing a raw, unencrypted API credential server-side would
  // be a real security regression, the same reasoning Section 7.18 originally kept BYOK
  // client-only for). Migrating that flag now would be throwaway work Phase 8f immediately
  // deletes, so it stays local-only for this one remaining sub-phase.
  var PREF_KEY = 'aiSettings';
  var BYOK_KEY = 'tradejournal:ai-byok:v1';

  // BYO API keys are in-memory only for the session by default (never in localStorage) -
  // opt-in persistence is the only path that writes them anywhere, and it writes to the
  // separate BYOK_KEY, never into the settings object itself. Persistence is now a per-provider
  // choice (persistApiKeyByProvider), matching the AI Assistant screen's per-engine REMEMBER
  // toggle - remembering ChatGPT's key must never also remember Claude's.
  var sessionKeys = {};

  // trait/knockout are ModelGlyph's own presentation hints (idle-loop animation, black-on-white
  // knockout-to-parchment) - kept on the one canonical catalog entry per engine so chatDockView.jsx
  // and aiAssistantView.jsx read the exact same values instead of each keeping its own copy.
  var PROVIDER_CATALOG = [
    { id: 'openai', label: 'OpenAI', endpoint: 'api.openai.com', models: ['gpt-5.6', 'gpt-4.1', 'gpt-4o'], supportsVoice: true, trait: 'spin', knockout: true },
    { id: 'anthropic', label: 'Claude', endpoint: 'api.anthropic.com', models: ['claude-sonnet-4-5', 'claude-opus-4-1'], supportsVoice: false, trait: 'tilt', knockout: false },
    { id: 'kimi', label: 'Kimi', endpoint: 'api.moonshot.cn', models: ['moonshot-v1-8k', 'moonshot-v1-32k'], supportsVoice: false, trait: 'wink', knockout: true },
    { id: 'deepseek', label: 'DeepSeek', endpoint: 'api.deepseek.com', models: ['deepseek-chat', 'deepseek-reasoner'], supportsVoice: false, trait: 'dive', knockout: false }
  ];

  function perProviderMap(fill) {
    var map = {};
    PROVIDER_CATALOG.forEach(function (p) { map[p.id] = typeof fill === 'function' ? fill(p) : fill; });
    return map;
  }

  function defaults() {
    return {
      provider: 'openai',
      modelByProvider: perProviderMap(function (p) { return p.models[0]; }),
      voiceByProvider: perProviderMap(function (p) { return !!p.supportsVoice; }),
      persistApiKeyByProvider: perProviderMap(false),
      budgetByProvider: perProviderMap(null),
      therapistModeDefault: false
    };
  }

  // The "remember this engine's key" opt-in flags are the one field of the old whole-object
  // localStorage blob that stays local (see the file-top comment) - their own small dedicated
  // key, separate from PREF_KEY, so a stale local copy can never shadow a real server value for
  // every other field.
  var LOCAL_PERSIST_FLAG_KEY = 'tradejournal:ai-persist-key-by-provider:v1';
  function loadLocalPersistFlags() {
    try { return JSON.parse(localStorage.getItem(LOCAL_PERSIST_FLAG_KEY) || '{}'); } catch (_) { return {}; }
  }
  function writeLocalPersistFlags(value) { localStorage.setItem(LOCAL_PERSIST_FLAG_KEY, JSON.stringify(value)); }

  function load() {
    var base = defaults();
    var prefs = window.TradeJournalUserPreferences;
    var stored = (prefs ? prefs.getPref(PREF_KEY, null) : null) || {};
    return Object.assign({}, base, stored, {
      modelByProvider: Object.assign({}, base.modelByProvider, stored.modelByProvider || {}),
      voiceByProvider: Object.assign({}, base.voiceByProvider, stored.voiceByProvider || {}),
      persistApiKeyByProvider: Object.assign({}, base.persistApiKeyByProvider, loadLocalPersistFlags()),
      budgetByProvider: Object.assign({}, base.budgetByProvider, stored.budgetByProvider || {})
    });
  }

  // Lets every mounted surface that reads "the current engine" (the ChatDock's own switcher, the
  // AI Assistant screen's tab strip) stay in sync without a shared React tree - mirrors
  // ai-chat-history-store.js's identical changed-event pattern. Guarded: this file is also
  // executed headless via vm.runInNewContext in tests, where window.dispatchEvent/CustomEvent
  // don't exist - a no-op there is correct, not a bug to work around.
  function notify(detail) {
    if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent('tradejournal:ai-settings-changed', { detail: detail }));
    }
  }

  // `value` is always the full merged object (settings()'s own shape) - split across its two
  // real backends: persistApiKeyByProvider to its own local key (see loadLocalPersistFlags()
  // above), everything else to the server preference. Callers never see this split - saveSettings()
  // still returns/round-trips the one whole object, matching this store's existing public contract.
  function write(value) {
    writeLocalPersistFlags(value.persistApiKeyByProvider || {});
    var prefs = window.TradeJournalUserPreferences;
    if (prefs) {
      prefs.setPref(PREF_KEY, {
        provider: value.provider, modelByProvider: value.modelByProvider, voiceByProvider: value.voiceByProvider,
        budgetByProvider: value.budgetByProvider, therapistModeDefault: value.therapistModeDefault
      });
    }
    notify(value);
    return value;
  }

  function settings() { return load(); }

  function saveSettings(patch) {
    var current = load();
    var next = Object.assign({}, current, patch || {});
    ['modelByProvider', 'voiceByProvider', 'persistApiKeyByProvider', 'budgetByProvider'].forEach(function (field) {
      if (patch && patch[field]) next[field] = Object.assign({}, current[field], patch[field]);
    });
    return write(next);
  }

  function loadByok() {
    try { var raw = localStorage.getItem(BYOK_KEY); return raw ? JSON.parse(raw) : {}; }
    catch (_) { return {}; }
  }
  function writeByok(value) { localStorage.setItem(BYOK_KEY, JSON.stringify(value)); }

  // Restore persisted keys into memory once, at load time, only for providers the user had
  // already opted into remembering on a previous visit - never read implicitly otherwise.
  (function restorePersisted() {
    var remember = settings().persistApiKeyByProvider;
    var byok = loadByok();
    Object.keys(byok).forEach(function (provider) { if (remember[provider]) sessionKeys[provider] = byok[provider]; });
  }());

  function getKey(provider) { return sessionKeys[provider] || ''; }

  function setKey(provider, value) {
    sessionKeys[provider] = value || '';
    if (settings().persistApiKeyByProvider[provider]) {
      var byok = loadByok();
      byok[provider] = value || '';
      writeByok(byok);
    }
    // The key itself never lives in the persisted settings object (see the file-top comment), so
    // it has no natural write() call to piggyback its change-notification on - notify by hand, so
    // a controlled key TextField re-renders on every keystroke exactly like every other
    // per-provider field here.
    notify(settings());
  }

  function clearKey(provider) {
    delete sessionKeys[provider];
    var byok = loadByok();
    delete byok[provider];
    writeByok(byok);
  }

  // Atomic per-provider toggle: flips that provider's persisted flag AND immediately syncs its
  // current in-memory key into (or out of) BYOK_KEY, so the two never drift out of sync -
  // mirrors the previous global setPersistApiKey()'s exact guarantee, just scoped to one engine.
  function setPersistApiKey(provider, value) {
    var patch = { persistApiKeyByProvider: {} };
    patch.persistApiKeyByProvider[provider] = !!value;
    saveSettings(patch);
    var byok = loadByok();
    if (value) byok[provider] = sessionKeys[provider] || '';
    else delete byok[provider];
    writeByok(byok);
  }

  function setVoice(provider, value) {
    var patch = { voiceByProvider: {} };
    patch.voiceByProvider[provider] = !!value;
    saveSettings(patch);
  }

  function setBudget(provider, value) {
    var patch = { budgetByProvider: {} };
    patch.budgetByProvider[provider] = value === null || value === undefined || value === '' ? null : Number(value);
    saveSettings(patch);
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
    getKey: getKey, setKey: setKey, clearKey: clearKey,
    setPersistApiKey: setPersistApiKey, setVoice: setVoice, setBudget: setBudget,
    providerCatalog: providerCatalog, activeProvider: activeProvider, activeModel: activeModel
  };
}());
