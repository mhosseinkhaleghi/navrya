(function () {
  'use strict';
  // Phase 8c of the local-first-to-server-authoritative migration (see ARCHITECTURE.md's Known
  // Constraints section): provider/model/voice/budget/therapistModeDefault now read/write through
  // window.TradeJournalUserPreferences (Phase 8a's shared preferences primitive), one preference
  // key ('aiSettings') holding the whole object, same atomic whole-object merge shape
  // psychology-store.js's own Phase 8b migration already established.
  //
  // Phase 8f (security hardening pass): the BYOK "remember this engine's key" mechanism
  // (persistApiKeyByProvider, BYOK_KEY, loadByok/writeByok, setPersistApiKey) has been removed
  // entirely, not moved server-side or encrypted - storing a raw, unencrypted API credential
  // anywhere persistent (browser localStorage or a server record) is a real security exposure
  // (a stolen/compromised profile, another local OS user, or an XSS bug could read a live,
  // billable OpenAI/Anthropic/etc. key straight off disk). A BYO API key now lives only in
  // `sessionKeys` below - in memory, for the lifetime of this page - and is gone the moment the
  // tab/page is closed or reloaded, matching every other credential in this app after the
  // cookie-session auth migration (see docs/auth/IMPLEMENTATION_STATUS.md section 5).
  var PREF_KEY = 'aiSettings';
  var LEGACY_BYOK_KEY = 'tradejournal:ai-byok:v1';
  var LEGACY_PERSIST_FLAG_KEY = 'tradejournal:ai-persist-key-by-provider:v1';

  var sessionKeys = {};

  // One-time cleanup: purge any raw key a previous version of this app already wrote to
  // localStorage under the old opt-in "remember this key" mechanism. Best-effort - a private/
  // locked-down browsing context that throws on localStorage access must not break module load.
  (function purgeLegacyPersistedByok() {
    try { localStorage.removeItem(LEGACY_BYOK_KEY); localStorage.removeItem(LEGACY_PERSIST_FLAG_KEY); } catch (_) { /* no-op */ }
  }());

  // trait/knockout are ModelGlyph's own presentation hints (idle-loop animation, black-on-white
  // knockout-to-parchment) - kept on the one canonical catalog entry per engine so chatDockView.jsx
  // and aiAssistantView.jsx read the exact same values instead of each keeping its own copy.
  //
  // GPT-5.6 family (2026-08-29 update): OpenAI ships GPT-5.6 as three explicit API model ids -
  // Sol (flagship/frontier), Terra (balanced), Luna (fastest/cheapest) - alongside the older bare
  // `gpt-5.6` alias, which OpenAI's own API already resolves server-side to Sol (this app never
  // needs to alias-map it itself - callOpenAI() already just forwards whatever model string is
  // selected verbatim). `gpt-5.6` stays in `models` (never removed) so an existing user's already-
  // saved selection keeps working exactly as before (see load()'s stored-wins merge below).
  //
  // 2026-08-30: default flipped from Sol to Luna (the economical tier) for every user who has
  // never explicitly chosen a model - `models[0]` is the ONLY thing defaults() reads
  // (perProviderMap(p => p.models[0]) below), so Luna leads the array now. This can NEVER affect
  // anyone who already has a real modelByProvider.openai entry in their persisted aiSettings
  // (load()'s `Object.assign({}, base.modelByProvider, stored.modelByProvider || {})` always lets
  // a stored value win over this default, and that persistence already survives reload/re-login -
  // Phase 8c, window.TradeJournalUserPreferences) - only an account that has NEVER touched the
  // model dropdown notices this change at all. `modelLabels`/`modelTiers` are presentation
  // metadata on this SAME canonical entry (never a second model list) - `models` itself stays a
  // plain array of raw API id strings on purpose, since existing consumers (aiAssistantView.jsx's
  // `current.models.indexOf(value)` allowlist check, chat-dock-core.js's own pass-through) already
  // depend on that exact shape. The tier descriptor TEXT itself lives in ai-i18n.js
  // (aiAsstModelTierFrontier/Balanced/Economical), never hardcoded here - this file has no i18n
  // dependency by design, only `modelTiers` tags WHICH descriptor key applies to which model id.
  // Adaptive AI Session Analysis: capability flags, additive alongside supportsVoice above -
  // provider-level (not per-model), matching this catalog's existing granularity and the AI
  // gateway's own provider-level vision gate (server/pattern-ai-server.mjs's
  // SESSION_ANALYSIS_VISION_SUPPORT/callOpenAICompatible's `supportsVision = provider==='kimi'`).
  // Read by the Session Analysis modal/card to render an honest "this model can't see charts"
  // state (brief §6) BEFORE ever sending an image, never by string-matching a model name in a UI
  // component. recommendedForChartAnalysis is a soft steering hint only (sorts/badges a model in
  // the picker) - it never disables a selection.
  var PROVIDER_CATALOG = [
    {
      id: 'openai', label: 'OpenAI', endpoint: 'api.openai.com',
      models: ['gpt-5.6-luna', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6', 'gpt-4.1', 'gpt-4o'],
      modelLabels: { 'gpt-5.6-sol': 'GPT-5.6 Sol', 'gpt-5.6-terra': 'GPT-5.6 Terra', 'gpt-5.6-luna': 'GPT-5.6 Luna' },
      modelTiers: { 'gpt-5.6-sol': 'frontier', 'gpt-5.6-terra': 'balanced', 'gpt-5.6-luna': 'economical' },
      supportsVoice: true, trait: 'spin', knockout: true,
      supportsVision: true, supportsStructuredOutput: true, supportsReasoning: true, supportsImageGeneration: true, recommendedForChartAnalysis: true
    },
    {
      id: 'anthropic', label: 'Claude', endpoint: 'api.anthropic.com', models: ['claude-sonnet-4-5', 'claude-opus-4-1'], supportsVoice: false, trait: 'tilt', knockout: false,
      supportsVision: true, supportsStructuredOutput: true, supportsReasoning: true, supportsImageGeneration: false, recommendedForChartAnalysis: true
    },
    {
      id: 'kimi', label: 'Kimi', endpoint: 'api.moonshot.cn', models: ['moonshot-v1-8k', 'moonshot-v1-32k'], supportsVoice: false, trait: 'wink', knockout: true,
      supportsVision: true, supportsStructuredOutput: false, supportsReasoning: false, supportsImageGeneration: false, recommendedForChartAnalysis: false
    },
    {
      id: 'deepseek', label: 'DeepSeek', endpoint: 'api.deepseek.com', models: ['deepseek-chat', 'deepseek-reasoner'], supportsVoice: false, trait: 'dive', knockout: false,
      supportsVision: false, supportsStructuredOutput: false, supportsReasoning: true, supportsImageGeneration: false, recommendedForChartAnalysis: false
    }
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
      budgetByProvider: perProviderMap(null),
      therapistModeDefault: false
    };
  }

  function load() {
    var base = defaults();
    var prefs = window.TradeJournalUserPreferences;
    var stored = (prefs ? prefs.getPref(PREF_KEY, null) : null) || {};
    return Object.assign({}, base, stored, {
      modelByProvider: Object.assign({}, base.modelByProvider, stored.modelByProvider || {}),
      voiceByProvider: Object.assign({}, base.voiceByProvider, stored.voiceByProvider || {}),
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

  function write(value) {
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
    ['modelByProvider', 'voiceByProvider', 'budgetByProvider'].forEach(function (field) {
      if (patch && patch[field]) next[field] = Object.assign({}, current[field], patch[field]);
    });
    return write(next);
  }

  function getKey(provider) { return sessionKeys[provider] || ''; }

  // In-memory only, for the lifetime of this page - see the file-top comment. No localStorage
  // read/write anywhere in this function on purpose.
  function setKey(provider, value) {
    sessionKeys[provider] = value || '';
    // The key itself never lives in the persisted settings object, so it has no natural write()
    // call to piggyback its change-notification on - notify by hand, so a controlled key
    // TextField re-renders on every keystroke exactly like every other per-provider field here.
    notify(settings());
  }

  function clearKey(provider) {
    delete sessionKeys[provider];
    notify(settings());
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

  function capabilitiesFor(provider) {
    var entry = PROVIDER_CATALOG.filter(function (p) { return p.id === provider; })[0];
    if (!entry) return { supportsVision: false, supportsStructuredOutput: false, supportsReasoning: false, supportsImageGeneration: false, recommendedForChartAnalysis: false };
    return {
      supportsVision: !!entry.supportsVision, supportsStructuredOutput: !!entry.supportsStructuredOutput,
      supportsReasoning: !!entry.supportsReasoning, supportsImageGeneration: !!entry.supportsImageGeneration,
      recommendedForChartAnalysis: !!entry.recommendedForChartAnalysis
    };
  }

  function activeProvider() { return load().provider; }
  function activeModel() {
    var current = load();
    var entry = PROVIDER_CATALOG.filter(function (p) { return p.id === current.provider; })[0];
    return current.modelByProvider[current.provider] || (entry ? entry.models[0] : null);
  }

  window.TradeJournalAISettingsStore = {
    settings: settings, saveSettings: saveSettings,
    getKey: getKey, setKey: setKey, clearKey: clearKey,
    setVoice: setVoice, setBudget: setBudget,
    providerCatalog: providerCatalog, activeProvider: activeProvider, activeModel: activeModel,
    capabilitiesFor: capabilitiesFor
  };
}());
