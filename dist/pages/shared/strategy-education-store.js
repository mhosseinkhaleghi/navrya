(function () {
  'use strict';

  var KEY = 'tradejournal:strategies:v2';
  var LEGACY_KEY = 'tradejournal:strategy-education:v1';
  var TRADE_KEY = 'tradejournal:trades:v1';
  var MAX_BYTES = 20 * 1024 * 1024;
  var types = window.TradeJournalStrategyEducationTypes || { numericPaths: [] };

  function uid(prefix) { return (prefix || 'strategy') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9); }
  function now() { return new Date().toISOString(); }
  function numberOrNull(value, integer) { if (value === null || value === undefined || value === '') return null; var out = Number(value); if (!Number.isFinite(out)) return null; if (integer) out = Math.round(out); return Math.max(0, out); }
  function emptySections() { return { positionManagement: { entryRules: '', stopLossRules: '', exitTargetRules: '', positionSizingRules: '', freeNotes: '', attachments: [] }, riskManagement: { maxRiskPerTradePercent: null, dailyDrawdownLimitPercent: null, totalDrawdownLimitPercent: null, maxConcurrentTrades: null, maxProfitCapPerTrade: null, freeNotes: '', attachments: [] }, overallFramework: { description: '', attachments: [] } }; }
  function empty(seed) { var stamp = now(), sections = emptySections(), value = seed || {}; return { id: value.id || uid('strategy'), name: String(value.name || ''), active: value.active !== false, isPublic: Boolean(value.isPublic), origin: value.origin === 'ai_from_event' ? 'ai_from_event' : 'manual', positionManagement: sections.positionManagement, riskManagement: sections.riskManagement, overallFramework: sections.overallFramework, chatHistory: [], aiUnderstandingSummary: { positionManagement: '', riskManagement: '', overallFramework: '', updatedAt: stamp }, detectionEvents: [], createdAt: stamp, updatedAt: stamp }; }
  // `fileUrl` (Section 7.18 Module 3) is the server-hosted copy of an image-type attachment,
  // patched in by the 'strategy-images' sync sender once its upload resolves - must be
  // preserved through normalize() like blobId/dataUrl, or it would be silently dropped on the
  // very next save()/read().
  function attachment(item, category) { item = item || {}; return { id: item.id || uid('strategy-file'), category: category, fileName: item.fileName || 'file', blobId: item.blobId, dataUrl: item.dataUrl, fileUrl: item.fileUrl, mimeType: item.mimeType || '', size: Number(item.size || 0), note: item.note || '', uploadedAt: item.uploadedAt || now() }; }
  function detectionEvent(item, strategyId) { item = item || {}; var status = ['pending', 'confirmed', 'invalidated'].indexOf(item.status) > -1 ? item.status : 'pending'; return { id: item.id || uid('strategy-event'), strategyId: strategyId, detectedAt: item.detectedAt || now(), source: Object.assign({ type: 'manual' }, item.source || {}), predictedOutcome: String(item.predictedOutcome || ''), status: status, resolvedAt: status === 'pending' ? null : (item.resolvedAt || now()), note: item.note || '' }; }
  function normalize(value) {
    var source = value && typeof value === 'object' ? value : {}, base = empty(source), sections = emptySections();
    Object.assign(base, source);
    base.id = source.id && source.id !== 'strategy-education-singleton' ? String(source.id) : uid('strategy');
    base.name = String(source.name || ''); base.active = source.active !== false; base.isPublic = Boolean(source.isPublic); base.origin = source.origin === 'ai_from_event' ? 'ai_from_event' : 'manual';
    base.positionManagement = Object.assign(sections.positionManagement, source.positionManagement || {});
    base.riskManagement = Object.assign(sections.riskManagement, source.riskManagement || {});
    base.overallFramework = Object.assign(sections.overallFramework, source.overallFramework || {});
    base.positionManagement.attachments = (base.positionManagement.attachments || []).map(function (item) { return attachment(item, 'positionManagement'); });
    base.riskManagement.attachments = (base.riskManagement.attachments || []).map(function (item) { return attachment(item, 'riskManagement'); });
    base.overallFramework.attachments = (base.overallFramework.attachments || []).map(function (item) { return attachment(item, 'overallFramework'); });
    ['entryRules', 'stopLossRules', 'exitTargetRules', 'positionSizingRules', 'freeNotes'].forEach(function (key) { base.positionManagement[key] = String(base.positionManagement[key] || ''); });
    base.riskManagement.freeNotes = String(base.riskManagement.freeNotes || ''); base.overallFramework.description = String(base.overallFramework.description || '');
    ['maxRiskPerTradePercent', 'dailyDrawdownLimitPercent', 'totalDrawdownLimitPercent', 'maxProfitCapPerTrade'].forEach(function (key) { base.riskManagement[key] = numberOrNull(base.riskManagement[key], false); });
    base.riskManagement.maxConcurrentTrades = numberOrNull(base.riskManagement.maxConcurrentTrades, true);
    base.chatHistory = Array.isArray(source.chatHistory) ? source.chatHistory : [];
    base.aiUnderstandingSummary = Object.assign(empty().aiUnderstandingSummary, source.aiUnderstandingSummary || {});
    base.detectionEvents = (Array.isArray(source.detectionEvents) ? source.detectionEvents : []).map(function (item) { return detectionEvent(item, base.id); });
    base.createdAt = source.createdAt || base.createdAt; base.updatedAt = source.updatedAt || base.createdAt;
    return base;
  }
  function legacyName() { var language = String(document.documentElement && document.documentElement.lang || 'en'); return language === 'fa' ? 'استراتژی مهاجرت‌شده' : language === 'ar' ? 'الاستراتيجية المنقولة' : language === 'es' ? 'Estrategia migrada' : 'Migrated strategy'; }
  function migrateLegacy() {
    if (localStorage.getItem(KEY) !== null) return readRaw();
    var output = [];
    try {
      var legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
      if (legacy && typeof legacy === 'object' && !Array.isArray(legacy)) {
        legacy.id = uid('strategy'); legacy.name = legacy.name || legacyName(); legacy.active = true; legacy.isPublic = false; legacy.origin = 'manual'; legacy.detectionEvents = legacy.detectionEvents || [];
        output = [normalize(legacy)];
      }
    } catch (_) { output = []; }
    localStorage.setItem(KEY, JSON.stringify(output));
    return output;
  }
  function readRaw() { try { var parsed = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(parsed) ? parsed.map(normalize) : []; } catch (_) { return []; } }
  function listSync() { return migrateLegacy().sort(function (a, b) { return new Date(b.updatedAt) - new Date(a.updatedAt); }); }
  function write(values) { var normalized = (values || []).map(normalize); localStorage.setItem(KEY, JSON.stringify(normalized)); var detail = { count: normalized.length }; window.dispatchEvent(new CustomEvent('tradejournal:strategies-changed', { detail: detail })); window.dispatchEvent(new CustomEvent('tradejournal:strategy-education-changed', { detail: detail })); return normalized; }

  // --- Server sync (Module 3 of the local-first-to-server migration; see ARCHITECTURE.md's
  // Global Data Sync section, 7.18). Same shape as session-workspace-logic.js's/
  // pattern-registry-store.js's own sync blocks: localStorage (read via listSync()/write()
  // above) stays the source of instant, offline-capable reads and writes; this only pushes the
  // same writes to the server in the background and reconciles the local cache from the server
  // when reachable. TradeJournalDevUserSwitcher is looked up live (never cached), since
  // dev-user-switcher.js's <script> tag loads after this file's in the existing page order. ---
  (function () {
    var queue = window.TradeJournalSyncQueue;
    if (!queue) return;
    function devUser() { return window.TradeJournalDevUserSwitcher; }

    queue.registerModule('strategies', function (entry) {
      var switcher = devUser(); var uid = switcher && switcher.currentUserId();
      if (!uid) throw new Error('NO_CURRENT_USER');
      if (entry.action === 'delete') {
        return fetch('/api/sync/strategies/' + encodeURIComponent(entry.recordId), { method: 'DELETE', headers: { 'x-dev-user-id': uid } })
          .then(function (response) { if (!response.ok && response.status !== 404) throw new Error('SYNC_FAILED'); });
      }
      return fetch('/api/sync/strategies', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dev-user-id': uid },
        body: JSON.stringify(entry.payload)
      }).then(function (response) { if (!response.ok) throw new Error('SYNC_FAILED'); });
    });

    // Image-type attachments only (matches routes.strategies.mjs's own /images endpoint - the
    // shared storage module validates/stores images; non-image attachments (pdf/txt/docx) stay
    // local-only, same as when TradeJournalImageStore itself is unavailable).
    queue.registerModule('strategy-images', function (entry) {
      var switcher = devUser(); var uid = switcher && switcher.currentUserId();
      if (!uid) throw new Error('NO_CURRENT_USER');
      return fetch('/api/sync/strategies/images', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dev-user-id': uid },
        body: JSON.stringify({ dataUrl: entry.payload.dataUrl })
      }).then(function (response) {
        if (!response.ok) throw new Error('SYNC_FAILED');
        return response.json();
      }).then(function (result) {
        var items = readRaw();
        var matched = null;
        items.forEach(function (strategy) {
          ['positionManagement', 'riskManagement', 'overallFramework'].forEach(function (section) {
            (strategy[section].attachments || []).forEach(function (item) {
              if (item.blobId === entry.recordId && !item.fileUrl) { item.fileUrl = result.url; matched = strategy; }
            });
          });
        });
        if (matched) { write(items); queue.enqueue('strategies', matched.id, matched); }
      });
    });

    function mergeServerStrategies(serverStrategies) {
      if (!Array.isArray(serverStrategies) || !serverStrategies.length) return;
      var byId = {};
      readRaw().forEach(function (item) { byId[item.id] = item; });
      serverStrategies.forEach(function (item) { byId[item.id] = item; }); // server wins on conflict
      write(Object.keys(byId).map(function (id) { return byId[id]; }));
    }

    function reconcileFromServer() {
      var switcher = devUser(); var uid = switcher && switcher.currentUserId();
      if (!uid) return;
      fetch('/api/sync/strategies', { headers: { 'x-dev-user-id': uid } })
        .then(function (response) { return response.ok ? response.json() : null; })
        .then(function (result) { if (result) mergeServerStrategies(result.strategies); })
        .catch(function () { /* offline - the local cache stands as-is until the next reconnect */ });
    }

    // Checks the server BEFORE deciding whether to push local data up - mirrors
    // pattern-registry-store.js's migrateOrAdopt() (see its comment): a legacy v1->v2 singleton
    // migration on THIS browser could otherwise get pushed up as a duplicate alongside a
    // different browser's already-synced real strategies for the same user.
    function migrateOrAdopt() {
      var switcher = devUser(); var uid = switcher && switcher.currentUserId();
      if (!uid) return;
      var flagKey = 'tradejournal:strategies-migrated:v1:' + uid;
      if (localStorage.getItem(flagKey)) { reconcileFromServer(); return; }
      fetch('/api/sync/strategies', { headers: { 'x-dev-user-id': uid } })
        .then(function (response) { return response.ok ? response.json() : null; })
        .then(function (result) {
          if (result && Array.isArray(result.strategies) && result.strategies.length) {
            write(result.strategies);
          } else {
            listSync().forEach(function (strategy) { queue.enqueue('strategies', strategy.id, strategy); });
          }
          localStorage.setItem(flagKey, new Date().toISOString());
        })
        .catch(function () { /* offline - try again next time this runs (flag not yet set) */ });
    }

    // Deferred to the next tick (see session-workspace-logic.js's identical comment) -
    // dev-user-switcher.js's <script> tag sits after this file's in the existing load order.
    window.setTimeout(migrateOrAdopt, 0);
    window.addEventListener('online', reconcileFromServer);
  }());
  function find(id) { return listSync().find(function (item) { return item.id === id; }) || null; }
  function read(id) { return id ? find(id) : (listSync().find(function (item) { return item.active; }) || listSync()[0] || null); }
  function create(seed) { var strategy = normalize(Object.assign(empty(), seed || {})); if (!strategy.name) strategy.name = ''; write([strategy].concat(listSync())); if (window.TradeJournalSyncQueue) window.TradeJournalSyncQueue.enqueue('strategies', strategy.id, strategy); return strategy; }
  function save(value, options) { var strategy = normalize(value), values = listSync(), index = values.findIndex(function (item) { return item.id === strategy.id; }); strategy.updatedAt = now(); if (!(options && options.keepSummary)) strategy.aiUnderstandingSummary = localSummary(strategy); if (index > -1) values[index] = strategy; else values.unshift(strategy); write(values); if (window.TradeJournalSyncQueue) window.TradeJournalSyncQueue.enqueue('strategies', strategy.id, strategy); return strategy; }
  // Orphaned trades are also pushed onto the shared sync queue (Section 7.18 Module 4) so the
  // server's copy of each trade stops pointing at a now-deleted strategy id too - without this,
  // trades.linkedStrategyId is a plain, un-FK'd TEXT column server-side (see 009_trades.sql's
  // reasoning) and would otherwise only drift back into sync the next time that trade happened
  // to be saved for an unrelated reason.
  function orphanLinkedTrades(strategyId) { try { var trades = JSON.parse(localStorage.getItem(TRADE_KEY) || '[]'); if (!Array.isArray(trades)) return; var changed = false, orphaned = []; trades.forEach(function (trade) { if (trade && trade.linkedStrategyId === strategyId) { trade.linkedStrategyId = null; trade.updatedAt = now(); changed = true; orphaned.push(trade); } }); if (changed) { localStorage.setItem(TRADE_KEY, JSON.stringify(trades)); window.dispatchEvent(new CustomEvent('tradejournal:trades-changed', { detail: { count: trades.length } })); if (window.TradeJournalSyncQueue) orphaned.forEach(function (trade) { window.TradeJournalSyncQueue.enqueue('trades', trade.id, trade); }); } } catch (_) { /* Preserve strategy deletion even if old trade data is malformed. */ } }
  async function remove(id) { var strategy = find(id); if (!strategy) return; if (window.TradeJournalImageStore) { var files = [].concat(strategy.positionManagement.attachments || [], strategy.riskManagement.attachments || [], strategy.overallFramework.attachments || []); await Promise.all(files.map(function (item) { return item.blobId ? window.TradeJournalImageStore.deleteImage(item.blobId) : Promise.resolve(); })); } write(listSync().filter(function (item) { return item.id !== id; })); if (window.TradeJournalSyncQueue) window.TradeJournalSyncQueue.enqueue('strategies', id, null, 'delete'); orphanLinkedTrades(id); }
  function setActive(id, active) { var strategy = find(id); if (!strategy) return null; strategy.active = Boolean(active); return save(strategy, { keepSummary: true }); }
  function getPath(record, path) { return path.split('.').reduce(function (value, key) { return value && value[key]; }, record); }
  function setPath(record, path, value) { var keys = path.split('.'), target = record; keys.slice(0, -1).forEach(function (key) { target = target[key]; }); target[keys[keys.length - 1]] = (types.numericPaths || []).indexOf(path) > -1 ? numberOrNull(value, path.indexOf('maxConcurrentTrades') > -1) : String(value == null ? '' : value); return record; }
  function compact(values) { return values.map(function (value) { return String(value || '').trim(); }).filter(Boolean).join(' • '); }
  function localSummary(record) { var strategy = normalize(record), p = strategy.positionManagement, r = strategy.riskManagement, o = strategy.overallFramework; return { positionManagement: compact([p.entryRules, p.stopLossRules, p.exitTargetRules, p.positionSizingRules, p.freeNotes]), riskManagement: compact([r.maxRiskPerTradePercent != null ? 'Risk/trade: ' + r.maxRiskPerTradePercent + '%' : '', r.dailyDrawdownLimitPercent != null ? 'Daily DD: ' + r.dailyDrawdownLimitPercent + '%' : '', r.totalDrawdownLimitPercent != null ? 'Total DD: ' + r.totalDrawdownLimitPercent + '%' : '', r.maxConcurrentTrades != null ? 'Max trades: ' + r.maxConcurrentTrades : '', r.maxProfitCapPerTrade != null ? 'Profit cap: ' + r.maxProfitCapPerTrade + '%' : '', r.freeNotes]), overallFramework: String(o.description || '').trim(), updatedAt: now() }; }
  function saveSummary(value, summary) { var strategy = normalize(value); strategy.aiUnderstandingSummary = Object.assign(localSummary(strategy), summary || {}, { updatedAt: now() }); return save(strategy, { keepSummary: true }); }
  function dataUrl(file) { return new Promise(function (resolve, reject) { var reader = new FileReader(); reader.onload = function () { resolve(String(reader.result || '')); }; reader.onerror = function () { reject(reader.error); }; reader.readAsDataURL(file); }); }
  function allowed(file) { return /^image\//.test(file.type) || file.type === 'application/pdf' || file.type === 'text/plain' || /wordprocessingml|msword/.test(file.type) || /\.(png|jpe?g|webp|gif|pdf|txt|docx?)$/i.test(file.name || ''); }
  async function addAttachments(strategyId, category, files) { var strategy = find(strategyId); if (!strategy) throw new Error('STRATEGY_NOT_FOUND'); var section = strategy[category]; if (!section) throw new Error('INVALID_CATEGORY'); for (var file of Array.from(files || [])) { if (!allowed(file)) throw new Error('INVALID_FILE_TYPE'); if (file.size > MAX_BYTES) throw new Error('FILE_TOO_LARGE'); var item = attachment({ fileName: file.name, mimeType: file.type, size: file.size, note: '' }, category); try { if (!window.TradeJournalImageStore) throw new Error('STORE_UNAVAILABLE'); item.blobId = uid('strategy-asset'); await window.TradeJournalImageStore.saveImage(item.blobId, file, /^image\//.test(file.type) ? 'strategy' : undefined); } catch (_) { item.dataUrl = await dataUrl(file); } section.attachments.push(item); } return save(strategy); }
  async function removeAttachment(strategyId, category, id) { var strategy = find(strategyId); if (!strategy || !strategy[category]) return strategy; var item = strategy[category].attachments.find(function (entry) { return entry.id === id; }); if (item && item.blobId && window.TradeJournalImageStore) await window.TradeJournalImageStore.deleteImage(item.blobId); strategy[category].attachments = strategy[category].attachments.filter(function (entry) { return entry.id !== id; }); return save(strategy); }
  async function attachmentUrl(item) { if (!item) return ''; if (item.dataUrl) return item.dataUrl; if (item.blobId && window.TradeJournalImageStore) return await window.TradeJournalImageStore.loadImageUrl(item.blobId) || ''; return ''; }
  function urlToDataUrl(url) { return fetch(url).then(function (response) { return response.blob(); }).then(dataUrl); }
  async function attachmentsForAI(record) { var output = []; for (var section of ['positionManagement', 'riskManagement', 'overallFramework']) { for (var item of (record[section].attachments || []).slice(0, 5)) { var url = await attachmentUrl(item), encoded = ''; if (url) { encoded = url.indexOf('data:') === 0 ? url : await urlToDataUrl(url); if (url.indexOf('blob:') === 0) URL.revokeObjectURL(url); } output.push({ category: section, fileName: item.fileName, mimeType: item.mimeType, note: item.note || '', dataUrl: encoded }); } } return output; }
  function addMessage(record, role, content, suggestions) { record.chatHistory.push({ id: uid('strategy-chat'), role: role, content: String(content || ''), createdAt: now(), suggestions: suggestions || [] }); return save(record, { keepSummary: true }); }
  function applySuggestion(record, suggestion, status) { var strategy = normalize(record), target = null; (strategy.chatHistory || []).some(function (message) { return (message.suggestions || []).some(function (item) { if (item.id === suggestion.id) { target = item; return true; } return false; }); }); if (!target) return strategy; target.status = status; if (status === 'applied') setPath(strategy, target.path, target.value); return save(strategy); }
  function getRiskDefaults(strategyId) { var strategy = strategyId ? find(strategyId) : null, r = strategy ? strategy.riskManagement : {}; return { maxRiskPerTradePercent: r.maxRiskPerTradePercent == null ? null : r.maxRiskPerTradePercent, dailyDrawdownLimitPercent: r.dailyDrawdownLimitPercent == null ? null : r.dailyDrawdownLimitPercent, totalDrawdownLimitPercent: r.totalDrawdownLimitPercent == null ? null : r.totalDrawdownLimitPercent, maxConcurrentTrades: r.maxConcurrentTrades == null ? null : r.maxConcurrentTrades, maxProfitCapPerTrade: r.maxProfitCapPerTrade == null ? null : r.maxProfitCapPerTrade }; }
  function getPositionGuide(strategyId) { var strategy = strategyId ? find(strategyId) : null, p = strategy ? strategy.positionManagement : {}; return { entryRules: p.entryRules || '', stopLossRules: p.stopLossRules || '', exitTargetRules: p.exitTargetRules || '', positionSizingRules: p.positionSizingRules || '', freeNotes: p.freeNotes || '' }; }
  function listActive() { return listSync().filter(function (item) { return item.active; }); }
  function addDetectionEvent(strategyId, value) { var strategy = find(strategyId); if (!strategy) throw new Error('STRATEGY_NOT_FOUND'); var event = detectionEvent(value, strategy.id); strategy.detectionEvents.unshift(event); save(strategy, { keepSummary: true }); return event; }
  function updateDetectionEvent(strategyId, eventId, patch) { var strategy = find(strategyId); if (!strategy) return null; var event = strategy.detectionEvents.find(function (item) { return item.id === eventId; }); if (!event) return null; Object.assign(event, patch || {}); event.status = ['pending', 'confirmed', 'invalidated'].indexOf(event.status) > -1 ? event.status : 'pending'; event.resolvedAt = event.status === 'pending' ? null : (event.resolvedAt || now()); save(strategy, { keepSummary: true }); return event; }
  function detectionStats(strategy, staleHours) { var threshold = Number(staleHours || 72) * 3600000, stamp = Date.now(), events = (strategy && strategy.detectionEvents) || [], confirmed = events.filter(function (item) { return item.status === 'confirmed'; }).length, unresolved = events.filter(function (item) { return item.status === 'invalidated' || (item.status === 'pending' && stamp - new Date(item.detectedAt).getTime() > threshold); }).length; return { total: events.length, confirmed: confirmed, unresolved: unresolved, pending: events.filter(function (item) { return item.status === 'pending' && stamp - new Date(item.detectedAt).getTime() <= threshold; }).length, confirmationRate: events.length ? Math.round(confirmed / events.length * 100) : null }; }

  window.TradeJournalStrategyEducationStore = {
    key: KEY, legacyKey: LEGACY_KEY, maxFileBytes: MAX_BYTES, uid: uid, now: now,
    migrateLegacy: migrateLegacy, listSync: listSync, listActive: listActive, find: find, read: read,
    create: create, save: save, remove: remove, setActive: setActive,
    getPath: getPath, setPath: setPath, localSummary: localSummary, saveSummary: saveSummary,
    addAttachments: addAttachments, removeAttachment: removeAttachment, attachmentUrl: attachmentUrl, attachmentsForAI: attachmentsForAI,
    addMessage: addMessage, applySuggestion: applySuggestion,
    getRiskDefaults: getRiskDefaults, getPositionGuide: getPositionGuide,
    addDetectionEvent: addDetectionEvent, updateDetectionEvent: updateDetectionEvent, detectionStats: detectionStats
  };
  window.TradeJournalStrategies = window.TradeJournalStrategyEducationStore;
  migrateLegacy();
}());
