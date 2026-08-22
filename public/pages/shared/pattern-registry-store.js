(function () {
  'use strict';

  var MAX_IMAGE_BYTES = 15 * 1024 * 1024;
  var DOMAIN = 'patterns';
  function replica() { return window.TradeJournalServerReplica && window.TradeJournalServerReplica.domain(DOMAIN); }

  function uid(prefix) {
    return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function now() { return new Date().toISOString(); }

  function stage(text, order) { return { id: uid('stage'), order: order, text: text }; }

  function createPattern(name, description, threshold, stageTexts) {
    var createdAt = now();
    return {
      id: uid('pattern'),
      name: name || '',
      description: description || '',
      completionThreshold: Number.isFinite(threshold) ? threshold : 70,
      stages: (stageTexts || []).map(function (text, index) { return stage(text, index + 1); }),
      referenceScreenshots: [],
      usageCount: 0,
      chatHistory: [],
      isPublic: false,
      active: true,
      createdAt: createdAt,
      updatedAt: createdAt
    };
  }

  // Sessions migrated onto server-replica.js in Phase 3 (see ARCHITECTURE.md's Global Data Sync
  // section) - reads through window.TradeJournalWorkspace's own public list(), the same real
  // source every other cross-domain Sessions reader in this app now uses, rather than scanning
  // localStorage directly (nothing is left there to scan).
  function sessionsForScenarioLookup() {
    var workspace = window.TradeJournalWorkspace;
    return workspace && typeof workspace.list === 'function' ? workspace.list() : [];
  }

  function scenarioUsage(patternId) {
    var count = 0;
    sessionsForScenarioLookup().forEach(function (session) {
      (session.entries || []).forEach(function (entry) {
        (entry.scenarios || []).forEach(function (scenario) {
          if (scenario.pattern && scenario.pattern.patternTagId === patternId) count += 1;
        });
      });
    });
    return count;
  }

  function normalize(pattern) {
    pattern.id = pattern.id || uid('pattern');
    pattern.name = pattern.name || '';
    pattern.description = pattern.description || '';
    pattern.completionThreshold = Math.max(0, Math.min(100, Number(pattern.completionThreshold ?? pattern.positionThreshold ?? 70)));
    pattern.stages = (pattern.stages || []).map(function (item, index) {
      return { id: item.id || uid('stage'), order: index + 1, text: item.text || item.label || '' };
    });
    pattern.referenceScreenshots = pattern.referenceScreenshots || [];
    pattern.usageCount = Math.max(Number(pattern.usageCount || 0), scenarioUsage(pattern.id));
    pattern.chatHistory = pattern.chatHistory || [];
    pattern.isPublic = Boolean(pattern.isPublic);
    pattern.active = pattern.active !== false;
    pattern.createdAt = pattern.createdAt || now();
    pattern.updatedAt = pattern.updatedAt || pattern.createdAt;
    return pattern;
  }

  // A brand-new user's registry starts empty - no demo/starter patterns are pre-filled, matching
  // every other store in the app (sessions, strategies, trades all start empty for a new user).
  //
  // Phase 2 of the local-first-to-server-authoritative migration (see ARCHITECTURE.md's Global
  // Data Sync section): reads the in-memory server-replica directly - server-replica.js is loaded
  // before this file in every character page's script order, and registers/hydrates this domain
  // below. There is no localStorage cache, no offline outbox, and no local-first fallback for
  // Patterns any more; see server-replica.js's own file header for the write/rollback contract.
  function read() {
    var domain = replica();
    return domain ? domain.list().map(normalize) : [];
  }

  (function () {
    if (!window.TradeJournalServerReplica) return;
    window.TradeJournalServerReplica.registerListDomain(DOMAIN, {
      hydrateUrl: '/api/sync/patterns',
      writeUrl: '/api/sync/patterns',
      deleteUrlFor: function (id) { return '/api/sync/patterns/' + encodeURIComponent(id); },
      extractList: function (body) { return body.patterns || []; }
    });
    replica().hydrate();
  }());

  function listSync() { return read().sort(function (a, b) { return new Date(b.updatedAt) - new Date(a.updatedAt); }); }

  function find(id) { return listSync().find(function (item) { return item.id === id; }) || null; }

  // save()/create() apply optimistically and return synchronously (the public contract every
  // existing caller relies on) - replica().upsert() has already updated the in-memory list before
  // it returns its Promise, so the value returned here is correct even though the POST to the
  // server keeps running in the background. A failed POST rolls the in-memory copy back and shows
  // a toast (server-replica.js does both) - the .catch() below is only there so that real failure
  // doesn't surface as an unhandled promise rejection, since neither function's own signature ever
  // gave its caller a Promise to observe in the first place.
  function save(pattern) {
    var value = normalize(pattern);
    value.updatedAt = now();
    if (replica()) replica().upsert(value).catch(function () {});
    return value;
  }

  function create() {
    var pattern = createPattern('', '', 70, []);
    if (replica()) replica().upsert(pattern).catch(function () {});
    return pattern;
  }

  async function remove(id) {
    var pattern = find(id);
    if (pattern && window.TradeJournalImageStore) {
      // Legacy IndexedDB cleanup - harmless no-op for any screenshot added after Phase 2 (which
      // no longer writes blobId at all, see addScreenshots() below), still correct for a
      // screenshot added before this migration whose blob may still be sitting in IndexedDB.
      await Promise.all((pattern.referenceScreenshots || []).map(function (item) {
        return item.blobId ? window.TradeJournalImageStore.deleteImage(item.blobId) : Promise.resolve();
      }));
    }
    if (replica()) await replica().remove(id);
  }

  function fileDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsDataURL(file);
    });
  }

  // Phase 2 image pipeline: upload first, reference by the server's own /uploads/... URL - no
  // IndexedDB, no blobId, no local blob store for a screenshot added after this migration. A
  // failed upload falls back to embedding the raw dataUrl directly on the record (never written
  // to disk on its own) - it still reaches the server as part of the pattern's own save() below,
  // so there is no "unsynced local-only blob" risk the old IndexedDB+sync-queue pipeline had.
  async function uploadScreenshot(dataUrl) {
    var switcher = window.TradeJournalDevUserSwitcher;
    var uid2 = switcher && switcher.currentUserId();
    if (!uid2) throw new Error('NO_CURRENT_USER');
    var response = await fetch('/api/sync/patterns/images', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dev-user-id': uid2 }, body: JSON.stringify({ dataUrl: dataUrl })
    });
    if (!response.ok) throw new Error('UPLOAD_FAILED');
    var result = await response.json();
    return result.url;
  }

  async function addScreenshots(patternId, files) {
    var pattern = find(patternId);
    if (!pattern) throw new Error('PATTERN_NOT_FOUND');
    var added = [];
    for (var index = 0; index < files.length; index += 1) {
      var file = files[index];
      if (!file.type || file.type.indexOf('image/') !== 0) throw new Error('INVALID_IMAGE_TYPE');
      if (file.size > MAX_IMAGE_BYTES) throw new Error('IMAGE_TOO_LARGE');
      var image = { id: uid('screenshot'), fileName: file.name, uploadedAt: now(), note: '' };
      var dataUrl = await fileDataUrl(file);
      try {
        image.imageUrl = await uploadScreenshot(dataUrl);
      } catch (_) {
        image.dataUrl = dataUrl;
      }
      pattern.referenceScreenshots.push(image);
      added.push(image);
    }
    save(pattern);
    return added;
  }

  async function removeScreenshot(patternId, screenshotId) {
    var pattern = find(patternId);
    if (!pattern) return;
    var image = pattern.referenceScreenshots.find(function (item) { return item.id === screenshotId; });
    // Legacy IndexedDB cleanup only - a screenshot added after Phase 2 never has a blobId.
    if (image && image.blobId && window.TradeJournalImageStore) await window.TradeJournalImageStore.deleteImage(image.blobId);
    pattern.referenceScreenshots = pattern.referenceScreenshots.filter(function (item) { return item.id !== screenshotId; });
    save(pattern);
  }

  async function screenshotUrl(image) {
    if (!image) return '';
    if (image.imageUrl) return image.imageUrl;
    if (image.dataUrl) return image.dataUrl;
    // Legacy fallback only - a screenshot added after Phase 2 never has a blobId.
    if (image.blobId && window.TradeJournalImageStore) return (await window.TradeJournalImageStore.loadImageUrl(image.blobId)) || '';
    return '';
  }

  function urlToDataUrl(url) {
    return fetch(url).then(function (response) { return response.blob(); }).then(fileDataUrl);
  }

  async function imageDataUrls(pattern, limit) {
    var images = (pattern.referenceScreenshots || []).slice(0, limit || 6);
    var values = [];
    for (var index = 0; index < images.length; index += 1) {
      var url = await screenshotUrl(images[index]);
      if (!url) continue;
      values.push(url.indexOf('data:') === 0 ? url : await urlToDataUrl(url));
      if (url.indexOf('blob:') === 0) URL.revokeObjectURL(url);
    }
    return values;
  }

  function listForScenarios() {
    return listSync().map(function (pattern) {
      return {
        id: pattern.id,
        name: pattern.name || '',
        positionThreshold: pattern.completionThreshold,
        completionThreshold: pattern.completionThreshold,
        stages: pattern.stages.map(function (item, index) { return { id: item.id, index: index + 1, label: item.text }; })
      };
    }).filter(function (pattern) { return pattern.name; });
  }

  function recordUsage(patternId, delta) {
    if (!patternId) return;
    var pattern = find(patternId);
    if (!pattern) return;
    pattern.usageCount = Math.max(0, Number(pattern.usageCount || 0) + Number(delta || 1));
    save(pattern);
  }

  function scenarioReport(patternId) {
    var rows = [];
    // Sessions live in one shared account-wide bucket, not a per-character one - a pattern's
    // usage/completion report must count every session regardless of which character was active
    // when it was logged. See sessionsForScenarioLookup() above for why this reads through
    // window.TradeJournalWorkspace.list() rather than localStorage.
    sessionsForScenarioLookup().forEach(function (session) {
      (session.entries || []).forEach(function (entry) {
        (entry.scenarios || []).forEach(function (scenario) {
          if (!scenario.pattern || scenario.pattern.patternTagId !== patternId) return;
          var stages = scenario.pattern.stages || [];
          var completed = scenario.pattern.completedStageIds || [];
          rows.push({
            sessionId: session.id,
            character: session.character || null,
            scenarioId: scenario.id,
            occurred: scenario.occurred === true,
            stageCount: stages.length,
            completedStageCount: completed.length,
            completionPercent: stages.length ? Math.min(100, completed.length / stages.length * 100) : null
          });
        });
      });
    });
    if (!rows.length) return { hasData: false, scenarios: [], detectionCount: null, averageCompletion: null, occurrenceRate: null, fullyCompletedCount: null };
    var completionRows = rows.filter(function (row) { return row.completionPercent !== null; });
    var completedCount = rows.filter(function (row) { return row.stageCount > 0 && row.completedStageCount >= row.stageCount; }).length;
    return {
      hasData: true,
      scenarios: rows,
      detectionCount: rows.length,
      averageCompletion: completionRows.length ? completionRows.reduce(function (sum, row) { return sum + row.completionPercent; }, 0) / completionRows.length : null,
      occurrenceRate: rows.filter(function (row) { return row.occurred; }).length / rows.length * 100,
      fullyCompletedCount: completedCount
    };
  }

  window.TradeJournalPatternStore = {
    create: create,
    find: find,
    listSync: listSync,
    save: save,
    remove: remove,
    addScreenshots: addScreenshots,
    removeScreenshot: removeScreenshot,
    screenshotUrl: screenshotUrl,
    imageDataUrls: imageDataUrls,
    listForScenarios: listForScenarios,
    recordUsage: recordUsage,
    scenarioReport: scenarioReport,
    createStage: function (text, order) { return stage(text || '', order || 1); },
    maxImageBytes: MAX_IMAGE_BYTES
  };
}());
