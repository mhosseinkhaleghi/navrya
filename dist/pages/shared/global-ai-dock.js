(function () {
  'use strict';
  var i18n = window.TradeJournalAII18n;
  var settingsStore = window.TradeJournalAISettingsStore;
  var registry = window.TradeJournalAIProcessRegistry;
  var tradeI18n = window.TradeJournalTradeI18n;
  if (!i18n || !settingsStore) return;

  function el(tag, className, text) { var node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function ico(name) { var node = el('i'); node.dataset.lucide = name; return node; }
  function button(text, className, icon) { var b = el('button', className || '', text); b.type = 'button'; if (icon) b.prepend(ico(icon)); return b; }
  function icons(root) { if (window.TradeJournalIcons) window.TradeJournalIcons.schedule(root || document); }
  function fileDataUrl(file) { return new Promise(function (resolve, reject) { var reader = new FileReader(); reader.onload = function () { resolve(String(reader.result || '')); }; reader.onerror = function () { reject(reader.error); }; reader.readAsDataURL(file); }); }
  function fieldLabel(key) { return tradeI18n ? tradeI18n.t(key) : key; }
  function fieldNumber(value) { return tradeI18n ? tradeI18n.number(value, { maximumFractionDigits: 4 }) : String(value); }

  // Re-affirmed fresh on every page load from the saved default - never silently sticky
  // across navigations (A6: the mode must always be visibly true to what's on screen).
  var therapistMode = !!settingsStore.settings().therapistModeDefault;
  var pendingImages = []; // [{dataUrl, name}]
  var transcript = []; // [{role, content}] - ephemeral, in-memory only; therapist-mode ON persists separately via the mental-health store
  var expanded = false;
  var busy = false;

  var bar, panel, messagesBox, input, sendBtn, attachBtn, fileInput, therapistBox, therapistLabel, providerBadge, attachRow;

  function providerLabel(id) { var suffix = { openai: 'OpenAI', anthropic: 'Anthropic', kimi: 'Kimi', deepseek: 'Deepseek' }[id] || (id.charAt(0).toUpperCase() + id.slice(1)); return i18n.t('aiProvider' + suffix); }

  function refreshProviderBadge() { if (providerBadge) providerBadge.textContent = providerLabel(settingsStore.activeProvider()); }

  function clearEmpty() { var empty = messagesBox.querySelector('.tj-dock-empty'); if (empty) empty.remove(); }

  function renderEmpty() { if (!messagesBox.children.length) messagesBox.append(el('p', 'tj-dock-empty', i18n.t('aiDockEmpty'))); }

  function appendMessage(role, text) {
    clearEmpty();
    var row = el('div', 'tj-dock-msg ' + role, text);
    messagesBox.append(row);
    messagesBox.scrollTop = messagesBox.scrollHeight;
    transcript.push({ role: role, content: text });
    return row;
  }

  function setBusy(value) { busy = value; sendBtn.disabled = value; input.disabled = value; }

  // A4: renders the dock's own approval gate for suggestions coming back from the
  // provider-agnostic gateway, then routes the approved value through the target
  // process's EXISTING pipeline (ai-process-registry.applyValue) - never a second one.
  function renderSuggestions(processId, suggestions) {
    if (!suggestions || !suggestions.length) return;
    var box = el('div', 'tj-dock-suggestions');
    suggestions.forEach(function (item) {
      var card = el('div', 'tj-dock-suggestion-card');
      card.append(el('small', '', item.path), el('p', '', String(item.value)));
      var actionsRow = el('div', 'tj-dock-suggestion-actions');
      var apply = button(i18n.t('aiSuggestionApply'), 'tj-primary', 'check');
      var discard = button(i18n.t('aiSuggestionDiscard'), 'tj-secondary', 'x');
      apply.onclick = function () { if (registry) registry.applyValue(processId, item.path, item.value, item.mode); card.remove(); };
      discard.onclick = function () { card.remove(); };
      actionsRow.append(apply, discard);
      card.append(actionsRow);
      box.append(card);
    });
    messagesBox.append(box);
    messagesBox.scrollTop = messagesBox.scrollHeight;
    icons(box);
  }

  function detectEmotionalContent(text) {
    if (!text) return null;
    return { id: 'dock-emotion-' + Date.now().toString(36), timestamp: new Date().toISOString(), stage: 'entry', dominantEmotions: [], emotionDetails: [], stressLevel: 5, focusQuality: 5, planCommitment: 5, wouldTakeIfNotForced: null, note: text };
  }

  // A7: the exact same 3-call sequence openCalculator's existing log.onclick already uses
  // (createDraft -> applyCalculatedToTrade -> openWizard), just fed by extracted values
  // instead of typed ones. Emotional content in the accompanying message is seeded onto
  // trade.emotionLog before the wizard opens - its emotions step already renders pre-seeded
  // from the last emotionLog entry, so no new UI is needed for that part.
  function applyExtractionToWizard(extraction, contextMessage) {
    var tradeStore = window.TradeJournalTradeStore, tradeUi = window.TradeJournalTradeUI, calc = window.TradeJournalTradeCalculator;
    if (!tradeStore || !tradeUi || !calc) return;
    var accountSettings = tradeStore.settings(), manual = new Set();
    var takeProfits = (extraction.takeProfits || []).length
      ? extraction.takeProfits.map(function (tp) { return { price: tp.price, portionPercent: Math.round(100 / extraction.takeProfits.length) }; })
      : [{ price: null, portionPercent: 100 }];
    var source = {
      direction: extraction.direction || 'long', marginMode: 'isolated',
      entryPrice: extraction.entryPrice, stopLoss: extraction.stopLoss, slDistancePercent: null,
      riskPercent: accountSettings.defaultRiskPercent, riskAmount: null, leverage: extraction.leverage, positionSize: null,
      accountBalance: accountSettings.accountBalance, takeProfits: takeProfits,
      feeType: accountSettings.defaultFeeType, feePercent: accountSettings.defaultFeeType === 'maker' ? accountSettings.makerFeePercent : accountSettings.takerFeePercent
    };
    ['entryPrice', 'stopLoss', 'leverage'].forEach(function (k) { if (source[k] !== null && source[k] !== undefined) manual.add(k); });
    if (source.riskPercent !== null && source.riskPercent !== undefined) manual.add('riskPercent');
    if (source.accountBalance !== null && source.accountBalance !== undefined) manual.add('accountBalance');
    var result = calc.solve(source, manual, { feePercent: source.feePercent });
    var trade = tradeUi.applyCalculatedToTrade(tradeStore.createDraft({ status: 'hunting' }), result, source);
    var emotion = detectEmotionalContent(contextMessage);
    if (emotion) trade.emotionLog = (trade.emotionLog || []).concat([emotion]);
    collapse();
    tradeUi.openWizard(trade);
  }

  function renderScreenshotReview(extraction, contextMessage) {
    clearEmpty();
    var card = el('div', 'tj-dock-screenshot-review');
    card.append(el('h4', '', i18n.t('aiScreenshotReviewTitle')));
    var hasAny = extraction.direction || extraction.entryPrice != null || extraction.stopLoss != null || (extraction.takeProfits && extraction.takeProfits.length) || extraction.leverage != null;
    if (!hasAny) {
      card.append(el('p', 'tj-hint', i18n.t('aiScreenshotNoData')));
      messagesBox.append(card);
      messagesBox.scrollTop = messagesBox.scrollHeight;
      return;
    }
    var list = el('ul', 'tj-dock-review-list');
    if (extraction.direction) list.append(el('li', '', fieldLabel('direction') + ': ' + fieldLabel(extraction.direction)));
    if (extraction.entryPrice != null) list.append(el('li', '', fieldLabel('entryPrice') + ': ' + fieldNumber(extraction.entryPrice)));
    if (extraction.stopLoss != null) list.append(el('li', '', fieldLabel('stopLoss') + ': ' + fieldNumber(extraction.stopLoss)));
    (extraction.takeProfits || []).forEach(function (tp, index) { list.append(el('li', '', fieldLabel('takeProfit') + ' ' + (index + 1) + ': ' + fieldNumber(tp.price))); });
    if (extraction.leverage != null) list.append(el('li', '', fieldLabel('leverage') + ': ' + fieldNumber(extraction.leverage) + '×'));
    card.append(list);
    var actionsRow = el('div', 'tj-dock-suggestion-actions');
    var apply = button(i18n.t('aiScreenshotApply'), 'tj-primary', 'notebook-pen');
    var discard = button(i18n.t('aiScreenshotDiscard'), 'tj-secondary', 'x');
    apply.onclick = function () { applyExtractionToWizard(extraction, contextMessage); card.remove(); };
    discard.onclick = function () { card.remove(); };
    actionsRow.append(apply, discard);
    card.append(actionsRow);
    messagesBox.append(card);
    messagesBox.scrollTop = messagesBox.scrollHeight;
    icons(card);
  }

  // A7: explicit, click-initiated action - never auto-detected - consistent with every
  // other AI trigger in this app being click-initiated.
  async function analyzeScreenshot(image) {
    setBusy(true);
    try {
      var active = settingsStore.settings();
      var response = await fetch('/api/trades/extract-fields', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: active.provider, apiKey: settingsStore.getKey(active.provider), model: settingsStore.activeModel(), language: i18n.language(), images: [image.dataUrl] })
      });
      var result = await response.json();
      if (!response.ok) throw new Error(result.error || 'AI_REQUEST_FAILED');
      if (window.TradeJournalAIUsage) window.TradeJournalAIUsage.record({ provider: result.provider, usage: result.usage });
      renderScreenshotReview(result, input.value.trim());
    } catch (_) {
      appendMessage('assistant', i18n.t('aiDockError'));
    } finally {
      setBusy(false);
    }
  }

  function renderAttachments() {
    attachRow.replaceChildren();
    pendingImages.forEach(function (image, index) {
      var item = el('div', 'tj-dock-attachment');
      var thumb = document.createElement('img'); thumb.src = image.dataUrl; thumb.alt = image.name || '';
      var analyze = button(i18n.t('aiScreenshotAnalyzeAction'), 'tj-secondary', 'scan-search');
      analyze.onclick = function () { analyzeScreenshot(image); };
      var remove = button('', 'tj-icon-button', 'x');
      remove.onclick = function () { pendingImages.splice(index, 1); renderAttachments(); };
      item.append(thumb, analyze, remove);
      attachRow.append(item);
    });
    attachRow.hidden = !pendingImages.length;
    icons(attachRow);
  }

  // A6: the branch split this session's tests check directly. ON builds/appends to the
  // mental-health profile and calls TradeJournalMentalHealthAI.chat() - its checkText()
  // safety gate runs unconditionally first, no new gate built here. OFF calls the
  // provider-agnostic gateway with the currently open registered process (if any) and
  // NEVER touches TradeJournalMentalHealthStore.
  async function send() {
    var text = input.value.trim();
    if (!text || busy) return;
    appendMessage('user', text);
    input.value = '';
    setBusy(true);
    try {
      if (therapistMode) {
        var mhStore = window.TradeJournalMentalHealthStore, mhAi = window.TradeJournalMentalHealthAI, mhSafety = window.TradeJournalMentalHealthSafety;
        if (!mhStore || !mhAi) { appendMessage('assistant', i18n.t('aiDockError')); return; }
        var profile = mhStore.addMessage(mhStore.load(), 'user', text);
        var mhResult = await mhAi.chat(profile, text);
        if (mhResult.flagged) { if (mhSafety) messagesBox.append(mhSafety.renderSafetyCard(function () {})); return; }
        mhStore.addMessage(profile, 'assistant', mhResult.reply, mhResult.suggestions);
        appendMessage('assistant', mhResult.reply);
      } else {
        var active = settingsStore.settings();
        var activeProcess = registry ? registry.activeOpenProcess() : null;
        var response = await fetch('/api/ai/chat', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: active.provider, apiKey: settingsStore.getKey(active.provider), model: settingsStore.activeModel(),
            language: i18n.language(), message: text, chatHistory: transcript.slice(0, -1).slice(-24),
            activeProcess: activeProcess ? { id: activeProcess.id, allowlist: activeProcess.allowlist } : null
          })
        });
        var payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'AI_REQUEST_FAILED');
        if (window.TradeJournalAIUsage) window.TradeJournalAIUsage.record({ provider: payload.provider, usage: payload.usage });
        appendMessage('assistant', payload.reply);
        if (activeProcess) renderSuggestions(activeProcess.id, payload.suggestions);
      }
    } catch (_) {
      appendMessage('assistant', i18n.t('aiDockError'));
    } finally {
      setBusy(false);
    }
  }

  function toggle() { if (expanded) collapse(); else expand(); }
  function expand() { expanded = true; panel.hidden = false; refreshProviderBadge(); input.focus(); }
  function collapse() { expanded = false; panel.hidden = true; }

  function buildDock() {
    bar = button('', 'tj-global-ai-launcher');
    bar.dataset.globalAiLauncher = '';
    bar.title = i18n.t('aiDockLauncherLabel');
    providerBadge = el('small', 'tj-dock-provider-badge', providerLabel(settingsStore.activeProvider()));
    bar.append(ico('sparkles'), el('span', '', i18n.t('aiDockLauncherLabel')), providerBadge);
    bar.onclick = toggle;

    panel = el('section', 'tj-global-ai-panel');
    panel.hidden = true;
    panel.dir = i18n.direction();

    var head = el('header', 'tj-global-ai-head');
    var headTitle = el('div', 'tj-global-ai-head-title');
    headTitle.append(ico('sparkles'), el('b', '', i18n.t('aiDockLauncherLabel')));
    var therapistWrap = el('label', 'tj-yesno-inline tj-dock-therapist-toggle');
    therapistBox = document.createElement('input'); therapistBox.type = 'checkbox'; therapistBox.checked = therapistMode;
    therapistBox.title = i18n.t('aiDockTherapistToggle');
    therapistLabel = el('span', '', therapistMode ? i18n.t('aiDockTherapistOn') : i18n.t('aiDockTherapistOff'));
    therapistBox.onchange = function () { therapistMode = therapistBox.checked; therapistLabel.textContent = therapistMode ? i18n.t('aiDockTherapistOn') : i18n.t('aiDockTherapistOff'); };
    therapistWrap.append(therapistBox, therapistLabel);
    var closeBtn = button('', 'tj-icon-button', 'x'); closeBtn.title = i18n.t('aiDockClose'); closeBtn.onclick = collapse;
    head.append(headTitle, therapistWrap, closeBtn);

    messagesBox = el('div', 'tj-global-ai-messages');
    renderEmpty();

    attachRow = el('div', 'tj-dock-attachments'); attachRow.hidden = true;

    var form = el('div', 'tj-global-ai-form');
    fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.multiple = true; fileInput.hidden = true;
    attachBtn = button('', 'tj-icon-button', 'paperclip'); attachBtn.title = i18n.t('aiDockAttach');
    attachBtn.onclick = function () { fileInput.click(); };
    fileInput.onchange = async function () {
      var files = Array.from(fileInput.files || []).slice(0, Math.max(0, 4 - pendingImages.length));
      for (var i = 0; i < files.length; i++) {
        if (!/^image\//.test(files[i].type)) continue;
        pendingImages.push({ dataUrl: await fileDataUrl(files[i]), name: files[i].name });
      }
      fileInput.value = '';
      renderAttachments();
    };
    input = document.createElement('textarea'); input.rows = 1; input.placeholder = i18n.t('aiDockPlaceholder');
    input.onkeydown = function (event) { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); } };
    sendBtn = button('', 'tj-icon-button tj-primary', 'send'); sendBtn.title = i18n.t('aiDockSend'); sendBtn.onclick = send;
    form.append(attachBtn, fileInput, input, sendBtn);

    panel.append(head, messagesBox, attachRow, form);
    document.body.append(bar, panel);
    icons(bar); icons(panel);
  }

  // #assistantNav (the sidebar's "AI" link) now routes to #ai-settings like any other
  // sidebar item - it no longer opens this dock. The dock's own floating launcher
  // (data-global-ai-launcher) is the only way to open the conversation.
  function ensureDock() {
    if (!document.querySelector('[data-global-ai-launcher]')) buildDock();
  }
  new MutationObserver(ensureDock).observe(document.body, { subtree: true, childList: true });
  new MutationObserver(ensureDock).observe(document.documentElement, { attributes: true, attributeFilter: ['lang', 'dir'] });
  setTimeout(ensureDock, 0);

  window.TradeJournalGlobalAI = { expand: expand, collapse: collapse, toggle: toggle };
}());
