(function () {
  'use strict';
  var types = window.TradeJournalAccountsTypes || {};
  var DOMAIN = 'accounts';
  function replica() { return window.TradeJournalServerReplica && window.TradeJournalServerReplica.domain(DOMAIN); }
  function uid(prefix) { return (prefix || 'account') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9); }
  function now() { return new Date().toISOString(); }
  function n(value) { if (value === null || value === undefined || value === '') return null; var out = Number(value); return Number.isFinite(out) ? out : null; }

  // Real IANA-zone validation (Intl works identically in the browser and Node) - an
  // unrecognized string is rejected back to the safe UTC default rather than silently reaching
  // accounts-engine.js's own try/catch fallback with no signal to whoever configured it.
  function resetTimezone(value) { return (types.isValidTimezone ? types.isValidTimezone(value) : false) ? value : 'UTC'; }
  function resetHour(value) { var h = n(value); return h === null ? 0 : Math.max(0, Math.min(23, Math.round(h))); }
  function lossBasis(value) { return (types.dailyLossBases || ['realized', 'realized_and_open']).indexOf(value) > -1 ? value : 'realized'; }

  function normalizeRules(kind, rules) {
    var r = rules || {};
    var reset = { dailyResetTimezone: resetTimezone(r.dailyResetTimezone), dailyResetHour: resetHour(r.dailyResetHour), dailyLossBasis: lossBasis(r.dailyLossBasis) };
    if (kind === 'personal') {
      return Object.assign({ kind: 'personal', dailyLossCap: n(r.dailyLossCap), maxRiskPerTradePercent: n(r.maxRiskPerTradePercent), monthlyGoalPercent: n(r.monthlyGoalPercent), maxOpenPositions: n(r.maxOpenPositions), hardFloor: n(r.hardFloor) }, reset);
    }
    return Object.assign({
      kind: 'prop', profitTargetPercent: n(r.profitTargetPercent), dailyLossLimitPercent: n(r.dailyLossLimitPercent),
      maxDrawdownPercent: n(r.maxDrawdownPercent), drawdownType: r.drawdownType === 'trailing' ? 'trailing' : 'static',
      minTradingDays: n(r.minTradingDays), consistencyCapPercent: n(r.consistencyCapPercent),
      maxLotSize: n(r.maxLotSize), maxOpenPositions: n(r.maxOpenPositions), maxRiskPerTradePercent: n(r.maxRiskPerTradePercent)
    }, reset);
  }
  // Last 4 characters only, ever - the raw account number never leaves the create/edit form.
  function maskNumber(value) {
    var digits = String(value || '').replace(/\s+/g, '');
    if (!digits) return null;
    return '••••' + digits.slice(-4);
  }
  function empty(seed) {
    var stamp = now(), value = seed || {}, kind = value.kind === 'personal' ? 'personal' : 'prop';
    return {
      id: value.id || uid('account'), kind: kind, firm: '', program: null, platform: null, numberMasked: null,
      status: 'active', archivedAt: null, currency: 'USD', startDate: stamp.slice(0, 10), startingBalance: 0,
      rules: normalizeRules(kind, kind === 'personal' ? (types.defaultPersonalRules ? types.defaultPersonalRules() : {}) : (types.defaultPropRules ? types.defaultPropRules() : {})),
      createdAt: stamp, updatedAt: stamp
    };
  }
  function normalize(value) {
    var src = value && typeof value === 'object' ? value : {}, base = empty(src);
    Object.assign(base, src);
    // Defense in depth: an explicit `id: undefined` own property on `src` (a real bug caught
    // via browser testing - see accountsView.jsx's manToAccount()) survives Object.assign()
    // above and clobbers the fresh id empty() already generated, silently producing a record
    // with no id at all once JSON.stringify() drops that key. Re-checked here so this bug
    // class can never again make it all the way to a rejected server request.
    if (!base.id) base.id = uid('account');
    base.kind = src.kind === 'personal' ? 'personal' : 'prop';
    base.status = src.status === 'archived' ? 'archived' : 'active';
    base.firm = String(base.firm || '').trim();
    base.currency = (types.currencies || ['USD', 'EUR', 'GBP', 'AUD']).indexOf(base.currency) > -1 ? base.currency : 'USD';
    base.startingBalance = n(base.startingBalance) || 0;
    base.numberMasked = base.numberMasked ? maskNumber(base.numberMasked.replace(/[^0-9]/g, '') || base.numberMasked) : null;
    base.rules = normalizeRules(base.kind, src.rules);
    base.createdAt = src.createdAt || base.createdAt;
    base.updatedAt = now();
    return base;
  }
  function read() { var domain = replica(); return domain ? domain.list().map(normalize) : []; }

  (function () {
    if (!window.TradeJournalServerReplica) return;
    window.TradeJournalServerReplica.registerListDomain(DOMAIN, {
      hydrateUrl: '/api/sync/accounts',
      writeUrl: '/api/sync/accounts',
      deleteUrlFor: function (id) { return '/api/sync/accounts/' + encodeURIComponent(id); },
      extractList: function (body) { return body.accounts || []; }
    });
    replica().hydrate();
  }());

  function listSync() { return read().sort(function (a, b) { return new Date(b.updatedAt) - new Date(a.updatedAt); }); }
  function listActive() { return listSync().filter(function (a) { return a.status !== 'archived'; }); }
  function find(id) { return listSync().find(function (item) { return item.id === id; }) || null; }
  function createDraft(seed) { return normalize(Object.assign(empty(seed), seed || {})); }
  // Apply optimistically and return synchronously, same contract as trade-store.js's save().
  function save(value) {
    var account = normalize(value);
    account.updatedAt = now();
    if (replica()) replica().upsert(account).catch(function () {});
    return account;
  }
  // Archiving vs removing is decided server-side (archives if any trade still references the
  // account, otherwise deletes) - the client always calls the same remove() and re-hydrates to
  // pick up whichever outcome actually happened, rather than guessing locally.
  function archive(id) {
    var account = find(id);
    if (!account) return null;
    return save(Object.assign({}, account, { status: 'archived', archivedAt: now() }));
  }
  function remove(id) {
    var domain = replica();
    if (domain) domain.remove(id).catch(function () {});
  }
  window.TradeJournalAccountsStore = {
    uid: uid, now: now, maskNumber: maskNumber, normalizeRules: normalizeRules,
    createDraft: createDraft, normalize: normalize, listSync: listSync, listActive: listActive, find: find,
    save: save, archive: archive, remove: remove
  };
}());
