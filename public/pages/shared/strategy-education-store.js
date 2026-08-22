(function () {
  'use strict';

  var MAX_BYTES = 20 * 1024 * 1024;
  var types = window.TradeJournalStrategyEducationTypes || { numericPaths: [] };
  var DOMAIN = 'strategies';
  function replica() { return window.TradeJournalServerReplica && window.TradeJournalServerReplica.domain(DOMAIN); }

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
  // Phase 2 of the local-first-to-server-authoritative migration (see ARCHITECTURE.md's Global
  // Data Sync section): reads the in-memory server-replica directly - server-replica.js is
  // loaded before this file in every character page's script order. There is no localStorage
  // cache, no offline outbox, and no local-first fallback for Strategy Education any more.
  //
  // The old v1 (pre-array) singleton migration is deliberately NOT preserved here - it only
  // ever mattered for a browser that had never had Section 7.18's original migration run against
  // it, which by now (7.18 is complete app-wide) should be no real account's actual state. A
  // truly dormant browser that predates 7.18 entirely would lose that one legacy record; see the
  // Phase 2 report for this accepted, documented gap.
  function readRaw() {
    var domain = replica();
    return domain ? domain.list().map(normalize) : [];
  }
  function listSync() { return readRaw().sort(function (a, b) { return new Date(b.updatedAt) - new Date(a.updatedAt); }); }

  (function () {
    if (!window.TradeJournalServerReplica) return;
    window.TradeJournalServerReplica.registerListDomain(DOMAIN, {
      hydrateUrl: '/api/sync/strategies',
      writeUrl: '/api/sync/strategies',
      deleteUrlFor: function (id) { return '/api/sync/strategies/' + encodeURIComponent(id); },
      extractList: function (body) { return body.strategies || []; }
    });
    replica().hydrate();
  }());

  function find(id) { return listSync().find(function (item) { return item.id === id; }) || null; }
  function read(id) { return id ? find(id) : (listSync().find(function (item) { return item.active; }) || listSync()[0] || null); }
  // Apply optimistically and return synchronously (unchanged public contract) - the write's own
  // Promise is .catch()-guarded since neither function ever gave its caller a Promise to observe.
  function create(seed) { var strategy = normalize(Object.assign(empty(), seed || {})); if (!strategy.name) strategy.name = ''; if (replica()) replica().upsert(strategy).catch(function () {}); return strategy; }
  function save(value, options) { var strategy = normalize(value); strategy.updatedAt = now(); if (!(options && options.keepSummary)) strategy.aiUnderstandingSummary = localSummary(strategy); if (replica()) replica().upsert(strategy).catch(function () {}); return strategy; }
  // Trade Store is migrated (Phase 2) onto its own server-replica.js domain - this now goes
  // through its real public API (window.TradeJournalTradeStore) instead of reading/writing
  // tradejournal:trades:v1 directly, which no longer exists as a localStorage key at all.
  // tradeStore.save() already applies optimistically and pushes to the server itself (with
  // rollback on failure), so there is no separate sync-queue push to do here any more - a real
  // simplification, not just a like-for-like port. Looked up live (never cached), the same
  // "TradeJournalDevUserSwitcher is looked up live" convention this file already uses, since
  // trade-store.js's own <script> tag loads after this file's in the existing page order.
  function orphanLinkedTrades(strategyId) {
    var tradeStore = window.TradeJournalTradeStore;
    if (!tradeStore) return;
    try {
      tradeStore.listSync().forEach(function (trade) {
        if (trade && trade.linkedStrategyId === strategyId) tradeStore.save(Object.assign({}, trade, { linkedStrategyId: null }));
      });
    } catch (_) { /* Preserve strategy deletion even if trade data is malformed. */ }
  }
  async function remove(id) { var strategy = find(id); if (!strategy) return; if (window.TradeJournalImageStore) { var files = [].concat(strategy.positionManagement.attachments || [], strategy.riskManagement.attachments || [], strategy.overallFramework.attachments || []); await Promise.all(files.map(function (item) { return item.blobId ? window.TradeJournalImageStore.deleteImage(item.blobId) : Promise.resolve(); })); } if (replica()) await replica().remove(id); orphanLinkedTrades(id); }
  function setActive(id, active) { var strategy = find(id); if (!strategy) return null; strategy.active = Boolean(active); return save(strategy, { keepSummary: true }); }
  function getPath(record, path) { return path.split('.').reduce(function (value, key) { return value && value[key]; }, record); }
  function setPath(record, path, value) { var keys = path.split('.'), target = record; keys.slice(0, -1).forEach(function (key) { target = target[key]; }); target[keys[keys.length - 1]] = (types.numericPaths || []).indexOf(path) > -1 ? numberOrNull(value, path.indexOf('maxConcurrentTrades') > -1) : String(value == null ? '' : value); return record; }
  function compact(values) { return values.map(function (value) { return String(value || '').trim(); }).filter(Boolean).join(' • '); }
  function localSummary(record) { var strategy = normalize(record), p = strategy.positionManagement, r = strategy.riskManagement, o = strategy.overallFramework; return { positionManagement: compact([p.entryRules, p.stopLossRules, p.exitTargetRules, p.positionSizingRules, p.freeNotes]), riskManagement: compact([r.maxRiskPerTradePercent != null ? 'Risk/trade: ' + r.maxRiskPerTradePercent + '%' : '', r.dailyDrawdownLimitPercent != null ? 'Daily DD: ' + r.dailyDrawdownLimitPercent + '%' : '', r.totalDrawdownLimitPercent != null ? 'Total DD: ' + r.totalDrawdownLimitPercent + '%' : '', r.maxConcurrentTrades != null ? 'Max trades: ' + r.maxConcurrentTrades : '', r.maxProfitCapPerTrade != null ? 'Profit cap: ' + r.maxProfitCapPerTrade + '%' : '', r.freeNotes]), overallFramework: String(o.description || '').trim(), updatedAt: now() }; }
  function saveSummary(value, summary) { var strategy = normalize(value); strategy.aiUnderstandingSummary = Object.assign(localSummary(strategy), summary || {}, { updatedAt: now() }); return save(strategy, { keepSummary: true }); }
  function dataUrl(file) { return new Promise(function (resolve, reject) { var reader = new FileReader(); reader.onload = function () { resolve(String(reader.result || '')); }; reader.onerror = function () { reject(reader.error); }; reader.readAsDataURL(file); }); }
  function allowed(file) { return /^image\//.test(file.type) || file.type === 'application/pdf' || file.type === 'text/plain' || /wordprocessingml|msword/.test(file.type) || /\.(png|jpe?g|webp|gif|pdf|txt|docx?)$/i.test(file.name || ''); }
  // Phase 2 image pipeline (image-type attachments only, matching routes.strategies.mjs's own
  // image-only /images endpoint): upload first, reference by the server's own /uploads/... url
  // (fileUrl) - no IndexedDB, no blobId, no sync-queue round trip for an image attachment added
  // after this migration. A failed upload falls back to embedding the dataUrl directly on the
  // record, which still reaches the server via the strategy's own save() below. Non-image
  // attachments (pdf/txt/docx) are unaffected - they stay local-only via IndexedDB exactly as
  // before, since the shared storage module has never validated anything but image data URLs.
  async function uploadAttachmentImage(encodedDataUrl) {
    var switcher = window.TradeJournalDevUserSwitcher;
    var uid2 = switcher && switcher.currentUserId();
    if (!uid2) throw new Error('NO_CURRENT_USER');
    var response = await fetch('/api/sync/strategies/images', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dev-user-id': uid2 }, body: JSON.stringify({ dataUrl: encodedDataUrl })
    });
    if (!response.ok) throw new Error('UPLOAD_FAILED');
    var result = await response.json();
    return result.url;
  }
  async function addAttachments(strategyId, category, files) {
    var strategy = find(strategyId); if (!strategy) throw new Error('STRATEGY_NOT_FOUND');
    var section = strategy[category]; if (!section) throw new Error('INVALID_CATEGORY');
    for (var file of Array.from(files || [])) {
      if (!allowed(file)) throw new Error('INVALID_FILE_TYPE');
      if (file.size > MAX_BYTES) throw new Error('FILE_TOO_LARGE');
      var item = attachment({ fileName: file.name, mimeType: file.type, size: file.size, note: '' }, category);
      if (/^image\//.test(file.type)) {
        var encoded = await dataUrl(file);
        try { item.fileUrl = await uploadAttachmentImage(encoded); } catch (_) { item.dataUrl = encoded; }
      } else {
        try {
          if (!window.TradeJournalImageStore) throw new Error('STORE_UNAVAILABLE');
          item.blobId = uid('strategy-asset');
          await window.TradeJournalImageStore.saveImage(item.blobId, file); // no category - non-image, local-only, nothing to sync
        } catch (_) { item.dataUrl = await dataUrl(file); }
      }
      section.attachments.push(item);
    }
    return save(strategy);
  }
  async function removeAttachment(strategyId, category, id) { var strategy = find(strategyId); if (!strategy || !strategy[category]) return strategy; var item = strategy[category].attachments.find(function (entry) { return entry.id === id; }); if (item && item.blobId && window.TradeJournalImageStore) await window.TradeJournalImageStore.deleteImage(item.blobId); strategy[category].attachments = strategy[category].attachments.filter(function (entry) { return entry.id !== id; }); return save(strategy); }
  // fileUrl (the server-hosted copy) now correctly takes priority - a pre-existing gap fixed as
  // part of this migration: the old sync's image-upload sender already patched fileUrl onto a
  // record, but this function never actually read it, so a successfully-synced image attachment
  // was always displayed from its local blobId/IndexedDB copy instead, never its real server URL.
  async function attachmentUrl(item) { if (!item) return ''; if (item.fileUrl) return item.fileUrl; if (item.dataUrl) return item.dataUrl; if (item.blobId && window.TradeJournalImageStore) return await window.TradeJournalImageStore.loadImageUrl(item.blobId) || ''; return ''; }
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
    maxFileBytes: MAX_BYTES, uid: uid, now: now,
    listSync: listSync, listActive: listActive, find: find, read: read,
    create: create, save: save, remove: remove, setActive: setActive,
    getPath: getPath, setPath: setPath, localSummary: localSummary, saveSummary: saveSummary,
    addAttachments: addAttachments, removeAttachment: removeAttachment, attachmentUrl: attachmentUrl, attachmentsForAI: attachmentsForAI,
    addMessage: addMessage, applySuggestion: applySuggestion,
    getRiskDefaults: getRiskDefaults, getPositionGuide: getPositionGuide,
    addDetectionEvent: addDetectionEvent, updateDetectionEvent: updateDetectionEvent, detectionStats: detectionStats
  };
  window.TradeJournalStrategies = window.TradeJournalStrategyEducationStore;
}());
