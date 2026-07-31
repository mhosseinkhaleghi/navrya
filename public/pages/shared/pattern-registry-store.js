(function () {
  'use strict';

  var STORAGE_KEY = 'tradejournal:patterns:v1';
  var MAX_IMAGE_BYTES = 15 * 1024 * 1024;

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
      createdAt: createdAt,
      updatedAt: createdAt
    };
  }

  function seedPatterns() {
    return [
      createPattern('Quit ACC', 'An accumulation pattern that begins with a strong spike, develops a controlled counter-direction accumulation, and then resumes in the prevailing market direction.', 85, ['Strong impulsive spike', 'Controlled accumulation against the spike', 'False move or liquidity test', 'Return toward the spike origin', 'Continuation with the dominant trend']),
      createPattern('Double Bottom V+ No Retest', 'A double-bottom reversal with an impulsive V-shaped recovery and no full retest of the breakout area.', 70, ['First low and reaction', 'Second low or liquidity sweep', 'Strong V-shaped displacement', 'Breakout without full retest', 'Trend continuation']),
      createPattern('No Liquidity ACC', 'Accumulation that develops without a clear external liquidity sweep.', 70, ['Initial range', 'Internal liquidity rotation', 'Compression', 'Directional break', 'Continuation']),
      createPattern('3ACC at the end', 'Three consecutive accumulation structures near the end of a directional move.', 70, ['First accumulation', 'Expansion', 'Second accumulation', 'Expansion and compression', 'Third accumulation', 'Final resolution']),
      createPattern('Boomerang ACC', 'A boomerang-shaped accumulation that rejects the first direction before returning to the dominant path.', 70, ['Initial displacement', 'Counter move', 'Rejection', 'Return to origin']),
      createPattern('UTAD WYCKOF', 'Wyckoff UTAD structure with a strong spike, counter-direction accumulation, return to the origin, and distribution in the original spike direction.', 70, ['Strong spike move', 'Counter-direction accumulation after the spike', 'Return to the spike origin', 'Distribution in the original spike direction']),
      createPattern('Liquidity Engineering', 'A liquidity-engineering structure used to prepare and confirm a directional move.', 70, []),
      createPattern('ACC at the start', 'Accumulation forming at the beginning of a new directional movement.', 70, [])
    ];
  }

  function scenarioUsage(patternId) {
    var count = 0;
    for (var index = 0; index < localStorage.length; index += 1) {
      var key = localStorage.key(index) || '';
      if (key.indexOf('tradejournal:sessions:v1:') !== 0) continue;
      try {
        var sessions = JSON.parse(localStorage.getItem(key)) || [];
        sessions.forEach(function (session) {
          (session.entries || []).forEach(function (entry) {
            (entry.scenarios || []).forEach(function (scenario) {
              if (scenario.pattern && scenario.pattern.patternTagId === patternId) count += 1;
            });
          });
        });
      } catch (_) { /* Ignore unrelated or older local records. */ }
    }
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
    pattern.createdAt = pattern.createdAt || now();
    pattern.updatedAt = pattern.updatedAt || pattern.createdAt;
    return pattern;
  }

  function read() {
    try {
      var parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (Array.isArray(parsed)) return parsed.map(normalize);
    } catch (_) { /* Seed below. */ }
    var seeded = seedPatterns();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }

  function write(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent('tradejournal:patterns-changed', { detail: { count: items.length } }));
  }

  function listSync() { return read().sort(function (a, b) { return new Date(b.updatedAt) - new Date(a.updatedAt); }); }

  function find(id) { return listSync().find(function (item) { return item.id === id; }) || null; }

  function save(pattern) {
    var items = read();
    var value = normalize(pattern);
    value.updatedAt = now();
    var index = items.findIndex(function (item) { return item.id === value.id; });
    if (index > -1) items[index] = value;
    else items.unshift(value);
    write(items);
    return value;
  }

  function create() {
    var pattern = createPattern('', '', 70, []);
    var items = read();
    items.unshift(pattern);
    write(items);
    return pattern;
  }

  async function remove(id) {
    var pattern = find(id);
    if (pattern && window.TradeJournalImageStore) {
      await Promise.all((pattern.referenceScreenshots || []).map(function (item) {
        return item.blobId ? window.TradeJournalImageStore.deleteImage(item.blobId) : Promise.resolve();
      }));
    }
    write(read().filter(function (item) { return item.id !== id; }));
  }

  function fileDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsDataURL(file);
    });
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
      try {
        if (!window.TradeJournalImageStore) throw new Error('IMAGE_STORE_UNAVAILABLE');
        image.blobId = uid('pattern-image');
        await window.TradeJournalImageStore.saveImage(image.blobId, file);
      } catch (_) {
        image.blobId = undefined;
        image.dataUrl = await fileDataUrl(file);
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
    if (image && image.blobId && window.TradeJournalImageStore) await window.TradeJournalImageStore.deleteImage(image.blobId);
    pattern.referenceScreenshots = pattern.referenceScreenshots.filter(function (item) { return item.id !== screenshotId; });
    save(pattern);
  }

  async function screenshotUrl(image) {
    if (!image) return '';
    if (image.dataUrl) return image.dataUrl;
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
    ['hunter', 'engineer', 'commander', 'sage'].forEach(function (character) {
      try {
        var sessions = JSON.parse(localStorage.getItem('tradejournal:sessions:v1:' + character)) || [];
        sessions.forEach(function (session) {
          (session.entries || []).forEach(function (entry) {
            (entry.scenarios || []).forEach(function (scenario) {
              if (!scenario.pattern || scenario.pattern.patternTagId !== patternId) return;
              var stages = scenario.pattern.stages || [];
              var completed = scenario.pattern.completedStageIds || [];
              rows.push({
                sessionId: session.id,
                character: character,
                scenarioId: scenario.id,
                occurred: scenario.occurred === true,
                stageCount: stages.length,
                completedStageCount: completed.length,
                completionPercent: stages.length ? Math.min(100, completed.length / stages.length * 100) : null
              });
            });
          });
        });
      } catch (_) { /* Ignore corrupt legacy records for one character. */ }
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
    key: STORAGE_KEY,
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
