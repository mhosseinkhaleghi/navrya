(function () {
  'use strict';
  var types = window.TradeJournalInstrumentCatalogTypes || {};
  var DOMAIN = 'instrument-catalog';
  function replica() { return window.TradeJournalServerReplica && window.TradeJournalServerReplica.domain(DOMAIN); }
  function uid(prefix) { return (prefix || 'instrument') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9); }
  function now() { return new Date().toISOString(); }

  function normalize(value) {
    var src = value && typeof value === 'object' ? value : {};
    var stamp = now();
    return {
      id: src.id || uid('instrument'),
      code: (types.normalizeCode ? types.normalizeCode(src.code) : null),
      displayName: typeof src.displayName === 'string' && src.displayName.trim() ? src.displayName.trim() : null,
      createdAt: src.createdAt || stamp, updatedAt: stamp
    };
  }

  function read() { var domain = replica(); return domain ? domain.list().map(normalize) : []; }

  (function () {
    if (!window.TradeJournalServerReplica) return;
    window.TradeJournalServerReplica.registerListDomain(DOMAIN, {
      hydrateUrl: '/api/sync/instrument-catalog',
      writeUrl: '/api/sync/instrument-catalog',
      deleteUrlFor: function (id) { return '/api/sync/instrument-catalog/' + encodeURIComponent(id); },
      extractList: function (body) { return body.instrumentCatalog || []; }
    });
    replica().hydrate();
  }());

  function listSync() { return read().sort(function (a, b) { return (a.code || '').localeCompare(b.code || ''); }); }
  function find(id) { return listSync().find(function (item) { return item.id === id; }) || null; }
  function findByCode(code) {
    var normalized = types.normalizeCode ? types.normalizeCode(code) : null;
    if (!normalized) return null;
    return listSync().find(function (item) { return item.code === normalized; }) || null;
  }

  // Unlike every other domain store's save()/create() in this codebase, this one deliberately
  // returns the real write Promise instead of swallowing it - a brand-new session/trade/pattern
  // now requires its instrument to already exist in this catalog server-side (hard enforcement,
  // see server/db/repo.pg.mjs's assertInstrumentInCatalog()), so a picker adding a new code must
  // be able to `await` the add actually landing before it lets the user submit the entity that
  // depends on it. Rejects (never silently invents an id) when the code fails normalization.
  function create(codeRaw, displayName) {
    var code = types.normalizeCode ? types.normalizeCode(codeRaw) : null;
    if (!code) return Promise.reject(new Error('INVALID_INSTRUMENT_CODE'));
    var existing = findByCode(code);
    if (existing) return Promise.resolve(existing);
    var record = normalize({ code: code, displayName: displayName });
    if (!replica()) return Promise.reject(new Error('NO_REPLICA'));
    return replica().upsert(record);
  }

  window.TradeJournalInstrumentCatalogStore = {
    uid: uid, now: now, normalize: normalize, listSync: listSync, find: find, findByCode: findByCode, create: create
  };
}());
