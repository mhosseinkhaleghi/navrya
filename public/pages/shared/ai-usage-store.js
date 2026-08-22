(function () {
  'use strict';
  var settingsStore = window.TradeJournalAISettingsStore;

  function today() { return new Date().toISOString().slice(0, 10); }
  function thisMonthKey() { return new Date().toISOString().slice(0, 7); }

  function emptyBucket() { return { promptTokens: 0, completionTokens: 0, totalTokens: 0, byProvider: {} }; }

  // Phase 8c of the local-first-to-server-authoritative migration (see ARCHITECTURE.md's Known
  // Constraints section): reconciled onto the EXISTING ai_usage_events table/reportToServer()
  // write path below (already real, already server-canonical - untouched by this migration),
  // never a second parallel ledger. The read side (today()/thisMonth()/lifetime()/remaining())
  // used to compute its own numbers from a running total this file persisted to localStorage,
  // duplicating what the server already durably records. It now hydrates its baseline from
  // server-replica.js's generic document-domain infrastructure (a new user-scoped aggregate
  // endpoint, GET /api/users/me/usage - a pure read over the same rows reportToServer() writes)
  // and layers this tab's own not-yet-reconciled increments on top in memory only - never
  // localStorage, discarded on reload. `set()` is deliberately never called on this domain -
  // there is no client-writable "whole document" write here, only individual usage-report
  // events and a server-computed aggregate - registerDocumentDomain()'s hydrate()/get()/
  // isHydrated() are reused for exactly what this domain needs, nothing more.
  function replica() { return window.TradeJournalServerReplica && window.TradeJournalServerReplica.domain('ai-usage'); }
  (function () {
    if (!window.TradeJournalServerReplica) return;
    window.TradeJournalServerReplica.registerDocumentDomain('ai-usage', {
      hydrateUrl: '/api/users/me/usage',
      extractDoc: function (body) { return body || null; }
    });
    replica().hydrate();
  }());

  function emptyBaseline() { return { todayKey: null, today: emptyBucket(), monthKey: null, thisMonth: emptyBucket(), lifetime: emptyBucket() }; }
  function baseline() {
    var domain = replica(), doc = domain ? domain.get() : null;
    return doc || emptyBaseline();
  }
  function isHydrated() { var domain = replica(); return domain ? domain.isHydrated() : false; }

  function authToken() {
    var switcher = window.TradeJournalDevUserSwitcher;
    return (switcher && switcher.currentUserId()) || '';
  }

  // This tab's own not-yet-reconciled increments, layered on top of the hydrated baseline at
  // read time - never persisted, discarded on reload (the next load re-hydrates a fresh baseline
  // that already includes whatever this tab reported in the meantime).
  var localDelta = { daily: {}, monthly: {}, lifetime: emptyBucket() };

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

  function mergeBuckets(base, delta) {
    var merged = { promptTokens: base.promptTokens + delta.promptTokens, completionTokens: base.completionTokens + delta.completionTokens, totalTokens: base.totalTokens + delta.totalTokens, byProvider: {} };
    var providers = {};
    Object.keys(base.byProvider).forEach(function (p) { providers[p] = true; });
    Object.keys(delta.byProvider).forEach(function (p) { providers[p] = true; });
    Object.keys(providers).forEach(function (p) {
      var b = base.byProvider[p] || { promptTokens: 0, completionTokens: 0, totalTokens: 0, calls: 0 };
      var d = delta.byProvider[p] || { promptTokens: 0, completionTokens: 0, totalTokens: 0, calls: 0 };
      merged.byProvider[p] = { promptTokens: b.promptTokens + d.promptTokens, completionTokens: b.completionTokens + d.completionTokens, totalTokens: b.totalTokens + d.totalTokens, calls: b.calls + d.calls };
    });
    return merged;
  }

  // No-op for local-fallback responses (no usage field) - a call that never reached a real
  // provider must never be recorded as token spend.
  function record(entry) {
    if (!entry || !entry.usage) return;
    var usage = entry.usage;
    var hasSignal = typeof usage.promptTokens === 'number' || typeof usage.completionTokens === 'number' || typeof usage.totalTokens === 'number';
    if (!hasSignal) return;
    var provider = entry.provider || 'unknown';
    var dayKey = today(), monthKey = thisMonthKey();
    localDelta.daily[dayKey] = localDelta.daily[dayKey] || emptyBucket();
    localDelta.monthly[monthKey] = localDelta.monthly[monthKey] || emptyBucket();
    addInto(localDelta.daily[dayKey], provider, usage);
    addInto(localDelta.monthly[monthKey], provider, usage);
    addInto(localDelta.lifetime, provider, usage);
    reportToServer(provider, usage, entry.source);
  }

  // Best-effort: reports into the admin panel's server-side ai_usage_events table, tagged with
  // the current dev-user id - the ONE real write path for AI usage; the read-side baseline
  // above/below is entirely derived from these same rows, never a second source of truth. A
  // failed report never blocks or breaks the AI feature that triggered it - same soft-fail
  // philosophy as every other non-critical fetch in this app. Note: NOT /api/ai/usage-report -
  // /api/ai/* is already proxied to the (deliberately DB-free) AI gateway on a different port, so
  // this rides the existing /api/users proxy instead.
  function reportToServer(provider, usage, source) {
    var userId = authToken();
    if (!userId) return;
    fetch('/api/users/usage-report', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dev-user-id': userId },
      body: JSON.stringify({ provider: provider, promptTokens: usage.promptTokens, completionTokens: usage.completionTokens, totalTokens: usage.totalTokens, source: source || 'unknown' })
    }).catch(function () {});
  }

  // A stale baseline (hydrated for a day/month that has since rolled over while this tab stayed
  // open) is treated as real zero, never silently misattributed to the new period - the server's
  // own todayKey/monthKey is the one source of truth for "is this baseline still current," not a
  // client-side date recomputation racing the server's.
  function todayUsage() {
    var b = baseline(), key = today();
    var base = b.todayKey === key ? b.today : emptyBucket();
    return mergeBuckets(base, localDelta.daily[key] || emptyBucket());
  }
  function thisMonth() {
    var b = baseline(), key = thisMonthKey();
    var base = b.monthKey === key ? b.thisMonth : emptyBucket();
    return mergeBuckets(base, localDelta.monthly[key] || emptyBucket());
  }
  function lifetime() { var b = baseline(); return mergeBuckets(b.lifetime, localDelta.lifetime); }

  // Per-provider now (each engine keeps its own budget) - was a single workspace-wide budget
  // compared against the whole month's total across every provider combined.
  function remaining(provider) {
    var budget = settingsStore ? settingsStore.settings().budgetByProvider[provider] : null;
    if (budget == null) return null;
    var spent = (thisMonth().byProvider[provider] || { totalTokens: 0 }).totalTokens;
    return budget - spent;
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

  window.TradeJournalAIUsage = { record: record, today: todayUsage, thisMonth: thisMonth, lifetime: lifetime, remaining: remaining, isHydrated: isHydrated };
}());
