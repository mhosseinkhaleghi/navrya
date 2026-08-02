(function () {
  'use strict';
  var KEY = 'tradejournal:ai-usage:v1';
  var settingsStore = window.TradeJournalAISettingsStore;

  function today() { return new Date().toISOString().slice(0, 10); }
  function thisMonthKey() { return new Date().toISOString().slice(0, 7); }

  function emptyBucket() { return { promptTokens: 0, completionTokens: 0, totalTokens: 0, byProvider: {} }; }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      var parsed = raw ? JSON.parse(raw) : {};
      return { daily: parsed.daily || {}, monthly: parsed.monthly || {} };
    } catch (_) {
      return { daily: {}, monthly: {} };
    }
  }

  function write(value) { localStorage.setItem(KEY, JSON.stringify(value)); return value; }

  function addInto(bucket, provider, usage) {
    var prompt = typeof usage.promptTokens === 'number' ? usage.promptTokens : 0;
    var completion = typeof usage.completionTokens === 'number' ? usage.completionTokens : 0;
    var total = typeof usage.totalTokens === 'number' ? usage.totalTokens : prompt + completion;
    bucket.promptTokens += prompt;
    bucket.completionTokens += completion;
    bucket.totalTokens += total;
    var perProvider = bucket.byProvider[provider] || { promptTokens: 0, completionTokens: 0, totalTokens: 0, calls: 0 };
    perProvider.promptTokens += prompt;
    perProvider.completionTokens += completion;
    perProvider.totalTokens += total;
    perProvider.calls += 1;
    bucket.byProvider[provider] = perProvider;
  }

  // No-op for local-fallback responses (no usage field) - a call that never reached a
  // real provider must never be recorded as token spend. Day/month buckets are never
  // explicitly "reset"; they're lazily created keyed by the current date, so rollover
  // across a day/month boundary is automatic and each period's total is independent.
  function record(entry) {
    if (!entry || !entry.usage) return;
    var usage = entry.usage;
    var hasSignal = typeof usage.promptTokens === 'number' || typeof usage.completionTokens === 'number' || typeof usage.totalTokens === 'number';
    if (!hasSignal) return;
    var provider = entry.provider || 'unknown';
    var state = load();
    var dayKey = today(), monthKey = thisMonthKey();
    state.daily[dayKey] = state.daily[dayKey] || emptyBucket();
    state.monthly[monthKey] = state.monthly[monthKey] || emptyBucket();
    addInto(state.daily[dayKey], provider, usage);
    addInto(state.monthly[monthKey], provider, usage);
    write(state);
    reportToServer(provider, usage, entry.source);
  }

  // Best-effort: mirrors the localStorage-only ledger above into the admin panel's
  // server-side ai_usage_events table, tagged with the current dev-user id. A failed report
  // never blocks or breaks the AI feature that triggered it - same soft-fail philosophy as
  // every other non-critical fetch in this app. Note: NOT /api/ai/usage-report - /api/ai/* is
  // already proxied to the (deliberately DB-free) AI gateway on a different port, so this
  // rides the existing /api/users proxy instead.
  function reportToServer(provider, usage, source) {
    var switcher = window.TradeJournalDevUserSwitcher;
    var userId = switcher && switcher.currentUserId();
    if (!userId) return;
    fetch('/api/users/usage-report', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dev-user-id': userId },
      body: JSON.stringify({ provider: provider, promptTokens: usage.promptTokens, completionTokens: usage.completionTokens, totalTokens: usage.totalTokens, source: source || 'unknown' })
    }).catch(function () {});
  }

  function todayUsage() { return load().daily[today()] || emptyBucket(); }
  function thisMonth() { return load().monthly[thisMonthKey()] || emptyBucket(); }

  function remaining() {
    var budget = settingsStore ? settingsStore.settings().monthlyTokenBudget : null;
    if (budget == null) return null;
    return budget - thisMonth().totalTokens;
  }

  // Observes usage from the three existing AI clients WITHOUT editing them: loads after
  // them in script order and wraps their exported functions, mirroring the exact
  // decorator pattern already used in this codebase (trade-ui.js's `details` layering).
  // Callers get the byte-identical resolved value; usage is only observed in transit.
  function decorate(namespace, methodNames) {
    var api = window[namespace];
    if (!api) return;
    methodNames.forEach(function (name) {
      var original = api[name];
      if (typeof original !== 'function') return;
      api[name] = function () {
        var result = original.apply(this, arguments);
        return Promise.resolve(result).then(function (value) {
          if (value) record({ provider: value.provider, usage: value.usage, source: namespace + '.' + name });
          return value;
        });
      };
    });
  }
  decorate('TradeJournalPatternAI', ['generateStages', 'chat']);
  decorate('TradeJournalStrategyEducationAI', ['chat', 'summarize', 'proposeFromEvent']);
  decorate('TradeJournalMentalHealthAI', ['chat', 'educationCard']);

  window.TradeJournalAIUsage = { record: record, today: todayUsage, thisMonth: thisMonth, remaining: remaining };
}());
