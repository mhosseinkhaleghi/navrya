(function () {
  'use strict';
  // Real, persisted app-wide preferences for the Settings screen's Region & language, Alerts &
  // discipline and Character quick-switcher panels - the fields no other store already owns.
  // Language itself is NOT duplicated here: navrya-src/store.js's setLanguage() (Phase 8e -
  // window.TradeJournalUserPreferences's 'language' key, server-backed, not localStorage) is the
  // one real mechanism already driving the whole app's locale, so Settings calls that directly
  // instead of a second copy. This file (region/alerts/quick-switcher) is itself still
  // localStorage-backed, deferred to Phase 8f.
  // Cool-down lock is likewise NOT duplicated here - it is
  // TradeJournalMentalHealthStore's own real activeInterventions.cooldownTimerEnabled field,
  // which existed with no UI anywhere before this Settings screen.
  var KEY = 'tradejournal:app-settings:v1';

  function defaults() {
    return {
      region: {
        country: 'Iran',
        timezone: 'Asia/Tehran (UTC+3:30)',
        currency: 'USD',
        weekStart: 'Monday',
        clock24: true
      },
      // Which characters show up in the header's quick character-switcher - defaults to all four,
      // same as the picker having nothing excluded on a fresh account.
      quickSwitcher: ['hunter', 'commander', 'engineer', 'sage'],
      // Real stored preferences, ready for a future delivery layer to read - exactly the same
      // "computed today, delivered later" shape window.TradeJournalNotificationProvider's own
      // top-of-file comment already documents (mental-health-scheduler.js). Toggling one of these
      // off is honest and immediate (this file's the only source of truth for it); it does not
      // yet claim to suppress a push/desktop notification that this app has no channel to send.
      alerts: {
        sessionOpen: true,
        position: true,
        emotionCheckIns: true,
        communityReplies: true,
        sound: false
      }
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      var parsed = raw ? JSON.parse(raw) : {};
      var base = defaults();
      return Object.assign({}, base, parsed, {
        region: Object.assign({}, base.region, parsed.region || {}),
        quickSwitcher: Array.isArray(parsed.quickSwitcher) ? parsed.quickSwitcher : base.quickSwitcher,
        alerts: Object.assign({}, base.alerts, parsed.alerts || {})
      });
    } catch (_) {
      return defaults();
    }
  }

  // Mirrors ai-settings-store.js's identical notify() - guarded the same way for the headless
  // vm.runInNewContext environment tests load this file under, where window.dispatchEvent/
  // CustomEvent don't exist.
  function notify(detail) {
    if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent('tradejournal:app-settings-changed', { detail: detail }));
    }
  }

  function write(value) {
    localStorage.setItem(KEY, JSON.stringify(value));
    notify(value);
    return value;
  }

  function settings() { return load(); }

  function saveSettings(patch) {
    var current = load();
    var next = Object.assign({}, current, patch || {});
    if (patch && patch.region) next.region = Object.assign({}, current.region, patch.region);
    if (patch && patch.alerts) next.alerts = Object.assign({}, current.alerts, patch.alerts);
    return write(next);
  }

  function setQuickSwitcher(characterId, enabled) {
    var current = load();
    var list = current.quickSwitcher.slice();
    var has = list.indexOf(characterId) > -1;
    if (enabled && !has) list.push(characterId);
    if (!enabled && has) list = list.filter(function (id) { return id !== characterId; });
    return saveSettings({ quickSwitcher: list });
  }

  window.TradeJournalAppSettingsStore = {
    key: KEY, defaults: defaults, settings: settings, saveSettings: saveSettings,
    setQuickSwitcher: setQuickSwitcher
  };
}());
