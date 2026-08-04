(function () {
  'use strict';
  var i18n = window.TradeJournalAII18n;
  var settingsStore = window.TradeJournalAISettingsStore;
  var usageStore = window.TradeJournalAIUsage;
  var layer = window.TradeJournalPanelLayer;
  if (!i18n || !settingsStore || !layer) return;

  function el(tag, className, text) { var node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function ico(name) { var node = el('i'); node.dataset.lucide = name; return node; }
  function button(text, className, icon) { var b = el('button', className || '', text); b.type = 'button'; if (icon) b.prepend(ico(icon)); return b; }
  function icons(root) { if (window.TradeJournalIcons) window.TradeJournalIcons.schedule(root || document); }
  function toast(message, tone) { var node = el('div', 'tj-toast ' + (tone || ''), message); document.body.append(node); setTimeout(function () { node.remove(); }, 2600); }

  function selectField(label, options, value) {
    var wrap = el('label', 'tj-field'), input = document.createElement('select');
    options.forEach(function (opt) { input.append(new Option(opt[1], opt[0], false, opt[0] === value)); });
    wrap.append(el('span', '', label), input);
    return { wrap: wrap, input: input };
  }
  function numberField(label, value) {
    var wrap = el('label', 'tj-field'); wrap.append(el('span', '', label));
    var input = document.createElement('input'); input.type = 'number'; input.min = 0; input.value = value == null ? '' : value;
    wrap.append(input);
    return { wrap: wrap, get: function () { return input.value === '' ? null : Number(input.value); } };
  }

  function providerLabel(id) { var suffix = { openai: 'OpenAI', anthropic: 'Anthropic', kimi: 'Kimi', deepseek: 'Deepseek' }[id] || (id.charAt(0).toUpperCase() + id.slice(1)); return i18n.t('aiProvider' + suffix); }

  function memorySnapshot() {
    var patterns = (window.TradeJournalPatternStore && window.TradeJournalPatternStore.listSync()) || [];
    var strategies = (window.TradeJournalStrategyEducationStore && window.TradeJournalStrategyEducationStore.listSync()) || [];
    var mh = window.TradeJournalMentalHealthStore ? window.TradeJournalMentalHealthStore.load() : null;
    return {
      patterns: patterns.map(function (p) { return { id: p.id, name: p.name, chatHistory: p.chatHistory || [] }; }),
      strategies: strategies.map(function (s) { return { id: s.id, name: s.name, chatHistory: s.chatHistory || [] }; }),
      // aiUnderstandingSummary only exists on strategies, not patterns - not implied for both.
      mentalHealth: mh ? {
        chatHistory: mh.chatHistory || [],
        baselineSummary: { stress: mh.baseline.initialStressLevel, regulation: mh.baseline.initialEmotionalRegulation },
        intakeSummary: mh.intake.completed ? mh.intake : null,
        activeBiases: (mh.psychologicalProfile.biasChecklist.biases || []).map(function (b) { return { type: b.type, selfRating: b.selfRating }; })
      } : null
    };
  }

  function clearChatHistory(kind) {
    if (kind === 'patterns' && window.TradeJournalPatternStore) {
      window.TradeJournalPatternStore.listSync().forEach(function (p) { p.chatHistory = []; window.TradeJournalPatternStore.save(p); });
    } else if (kind === 'strategies' && window.TradeJournalStrategyEducationStore) {
      window.TradeJournalStrategyEducationStore.listSync().forEach(function (s) { s.chatHistory = []; window.TradeJournalStrategyEducationStore.save(s); });
    } else if (kind === 'mentalHealth' && window.TradeJournalMentalHealthStore) {
      var profile = window.TradeJournalMentalHealthStore.load();
      profile.chatHistory = [];
      window.TradeJournalMentalHealthStore.save(profile);
    }
  }

  function exportMemory() {
    var blob = new Blob([JSON.stringify(memorySnapshot(), null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'ai-memory-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.append(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function memoryRow(kind, labelKey, countOf) {
    var row = el('div', 'tj-ai-memory-row'), label = el('span', '');
    function refreshLabel() { label.textContent = i18n.t(labelKey) + ' (' + countOf(memorySnapshot()) + ')'; }
    refreshLabel();
    var clearBtn = button(i18n.t('aiMemoryClear'), 'tj-secondary', 'trash-2');
    clearBtn.onclick = function () {
      if (!confirm(i18n.t('aiMemoryClearConfirm'))) return;
      clearChatHistory(kind);
      refreshLabel();
      toast(i18n.t('aiSettingsSaved'), 'success');
    };
    row.append(label, clearBtn);
    return row;
  }

  function buildSection() {
    var card = el('section', 'panel-settings-card tj-ai-settings-card');
    card.dataset.aiSettings = '';
    card.append(el('h3', '', i18n.t('aiSettingsTitle')), el('p', '', i18n.t('aiSettingsHelp')));

    var settings = settingsStore.settings();
    var catalog = settingsStore.providerCatalog();

    var providerSelect = selectField(i18n.t('aiProviderLabel'), catalog.map(function (p) { return [p.id, providerLabel(p.id)]; }), settings.provider);
    var activeCatalogEntry = catalog.filter(function (p) { return p.id === settings.provider; })[0] || catalog[0];
    var modelSelect = selectField(i18n.t('aiModelLabel'), activeCatalogEntry.models.map(function (m) { return [m, m]; }), settings.modelByProvider[settings.provider]);
    var providerGrid = el('div', 'tj-calc-grid');
    providerGrid.append(providerSelect.wrap, modelSelect.wrap);
    card.append(providerGrid);

    var keyWrap = el('label', 'tj-field'); keyWrap.append(el('span', '', i18n.t('aiKeyLabel')));
    var keyInput = document.createElement('input'); keyInput.type = 'password'; keyInput.dir = 'ltr'; keyInput.placeholder = i18n.t('aiKeyPlaceholder');
    keyInput.value = settingsStore.getKey(providerSelect.input.value);
    keyInput.oninput = function () { settingsStore.setKey(providerSelect.input.value, keyInput.value); };
    keyWrap.append(keyInput);

    var testResult = el('small', 'tj-hint');
    var testBtn = button(i18n.t('aiTestConnection'), 'tj-secondary', 'plug-zap');
    testBtn.onclick = async function () {
      testBtn.disabled = true; testResult.textContent = '';
      try {
        var response = await fetch('/api/ai/test-connection', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: providerSelect.input.value, apiKey: settingsStore.getKey(providerSelect.input.value), model: modelSelect.input.value })
        });
        var result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || 'FAILED');
        testResult.textContent = i18n.t('aiTestConnectionOk'); testResult.className = 'tj-hint positive';
      } catch (_) {
        testResult.textContent = i18n.t('aiTestConnectionFailed'); testResult.className = 'tj-hint negative';
      } finally {
        testBtn.disabled = false;
      }
    };
    var testRow = el('div', 'tj-ai-test-row'); testRow.append(testBtn, testResult);

    var persistWarning = el('small', 'tj-hint', i18n.t('aiKeyPersistWarning'));
    persistWarning.hidden = !settings.persistApiKey;
    var persistWrap = el('label', 'tj-yesno-inline');
    var persistBox = document.createElement('input'); persistBox.type = 'checkbox'; persistBox.checked = settings.persistApiKey;
    persistBox.onchange = function () { settingsStore.setPersistApiKey(persistBox.checked); persistWarning.hidden = !persistBox.checked; };
    persistWrap.append(persistBox, document.createTextNode(i18n.t('aiKeyPersistToggle')));
    card.append(keyWrap, testRow, persistWrap, persistWarning);

    // Voice mode - a genuinely disabled control for unsupported providers (A0: don't fake it).
    var voiceRow = el('div', 'tj-field'), voiceControls = el('div', 'tj-yesno-inline');
    voiceRow.append(el('span', '', i18n.t('aiVoiceModeLabel')), voiceControls);
    function refreshVoiceRow() {
      voiceControls.replaceChildren();
      var entry = catalog.filter(function (p) { return p.id === providerSelect.input.value; })[0];
      var box = document.createElement('input'); box.type = 'checkbox'; box.disabled = true;
      if (entry && entry.supportsVoice) { box.checked = true; voiceControls.append(box, document.createTextNode(i18n.t('aiVoiceHandledBy', { model: modelSelect.input.value }))); }
      else { box.checked = false; voiceControls.append(box, document.createTextNode(i18n.t('aiVoiceUnavailable'))); }
    }
    refreshVoiceRow();
    card.append(voiceRow);

    providerSelect.input.onchange = function () {
      var entry = catalog.filter(function (p) { return p.id === providerSelect.input.value; })[0];
      modelSelect.input.replaceChildren();
      (entry ? entry.models : []).forEach(function (m) { modelSelect.input.append(new Option(m, m)); });
      keyInput.value = settingsStore.getKey(providerSelect.input.value);
      refreshVoiceRow();
    };
    modelSelect.input.onchange = refreshVoiceRow;

    // Token usage
    var usageSection = el('div', 'tj-ai-usage');
    usageSection.append(el('h4', '', i18n.t('aiUsageTitle')));
    var usageGrid = el('div', 'tj-calc-grid');
    var todayChip = el('div', 'mh-stat-chip'), monthChip = el('div', 'mh-stat-chip');
    var budget = numberField(i18n.t('aiUsageBudgetLabel'), settings.monthlyTokenBudget);
    var remainingText = el('small', 'tj-hint');
    function refreshUsage() {
      var todayUsage = usageStore ? usageStore.today() : { totalTokens: 0 };
      var monthUsage = usageStore ? usageStore.thisMonth() : { totalTokens: 0 };
      todayChip.replaceChildren(el('small', '', i18n.t('aiUsageToday')), el('strong', '', i18n.number(todayUsage.totalTokens)));
      monthChip.replaceChildren(el('small', '', i18n.t('aiUsageMonth')), el('strong', '', i18n.number(monthUsage.totalTokens)));
      var remaining = usageStore ? usageStore.remaining() : null;
      remainingText.textContent = remaining == null ? i18n.t('aiUsageNoBudget') : i18n.t('aiUsageRemaining', { value: i18n.number(remaining) });
    }
    refreshUsage();
    usageGrid.append(todayChip, monthChip, budget.wrap);
    usageSection.append(usageGrid, remainingText);
    card.append(usageSection);

    var save = button(i18n.t('aiSave'), 'tj-primary', 'save');
    save.onclick = function () {
      var patch = { provider: providerSelect.input.value, monthlyTokenBudget: budget.get() };
      patch.modelByProvider = {};
      patch.modelByProvider[providerSelect.input.value] = modelSelect.input.value;
      settingsStore.saveSettings(patch);
      toast(i18n.t('aiSettingsSaved'), 'success');
      refreshUsage();
    };
    card.append(save);

    // Memory - read-only aggregation, transparent per A2 ("not a black box"). Export/Clear per section.
    var memorySection = el('div', 'tj-ai-memory');
    memorySection.append(el('h4', '', i18n.t('aiMemoryTitle')), el('p', 'tj-hint', i18n.t('aiMemoryHint')));
    memorySection.append(
      memoryRow('patterns', 'aiMemoryPatterns', function (s) { return s.patterns.reduce(function (n, p) { return n + p.chatHistory.length; }, 0); }),
      memoryRow('strategies', 'aiMemoryStrategies', function (s) { return s.strategies.reduce(function (n, item) { return n + item.chatHistory.length; }, 0); }),
      memoryRow('mentalHealth', 'aiMemoryMentalHealth', function (s) { return s.mentalHealth ? s.mentalHealth.chatHistory.length : 0; })
    );
    var exportBtn = button(i18n.t('aiMemoryExport'), 'tj-secondary', 'download');
    exportBtn.onclick = exportMemory;
    memorySection.append(exportBtn);
    card.append(memorySection);

    return card;
  }

  // Real route (#ai-settings), reached from the sidebar's existing "AI" nav item - mirrors
  // the exact hash-routing pattern already established for #community and
  // #mindset/profile (layer.show(page,'ai-settings') + a manual .sidebar nav a active-class
  // toggle, since 'ai-settings' isn't in panel-system.js's own setActiveNav map). This
  // replaces the previous behavior of self-mounting a card inside the generic Settings page.
  function renderPage() {
    var navrya = window.TradeJournalNavryaAiAssistant;
    var page;
    if (navrya && navrya.render) {
      page = navrya.render();
    } else {
      page = el('section', 'panel-page tj-ai-settings-page');
      page.dir = i18n.direction();
      page.append(buildSection());
    }
    layer.show(page, 'ai-settings');
    document.querySelectorAll('.sidebar nav a').forEach(function (a) { a.classList.toggle('active', a.getAttribute('href') === '#ai-settings'); });
    icons(page);
  }
  function route() { return location.hash.indexOf('#ai-settings') === 0; }
  function render() { if (route()) renderPage(); }
  window.addEventListener('hashchange', render);
  window.setTimeout(render, 0);
}());
