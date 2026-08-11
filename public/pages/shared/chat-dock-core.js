(function () {
  'use strict';
  var i18n = window.TradeJournalAII18n;
  var settingsStore = window.TradeJournalAISettingsStore;
  var registry = window.TradeJournalAIProcessRegistry;
  if (!i18n || !settingsStore) return;

  // Pure(ish) request/orchestration layer for the global assistant, shared by the NAVRYA
  // ChatDock (navrya-src/chatDockView.jsx) and anything else that needs to talk to the
  // gateway. Deliberately has no DOM-building of its own - every function here returns data
  // (or throws), never appends a node - so it stays testable the same way the rest of this
  // app's stores are (vm.runInNewContext + a fetch stub), independent of whichever UI layer
  // renders the result.

  function providerLabel(id) {
    var suffix = { openai: 'OpenAI', anthropic: 'Anthropic', kimi: 'Kimi', deepseek: 'Deepseek' }[id] || (id.charAt(0).toUpperCase() + id.slice(1));
    return i18n.t('aiProvider' + suffix);
  }

  // A6: OFF builds/appends to the mental-health profile and calls TradeJournalMentalHealthAI.chat()
  // - its checkText() safety gate runs unconditionally first, no new gate built here. ON calls the
  // provider-agnostic gateway with the currently open registered process (if any) and NEVER touches
  // TradeJournalMentalHealthStore. (Naming kept from the retired global-ai-dock.js: therapistMode
  // true = the ON branch below.)
  async function sendChat(options) {
    var text = String((options && options.text) || '').trim();
    var therapistMode = !!(options && options.therapistMode);
    var transcript = (options && options.transcript) || [];
    if (!text) return null;

    if (therapistMode) {
      var mhStore = window.TradeJournalMentalHealthStore, mhAi = window.TradeJournalMentalHealthAI;
      if (!mhStore || !mhAi) throw new Error('AI_REQUEST_FAILED');
      var profile = mhStore.addMessage(mhStore.load(), 'user', text);
      var mhResult = await mhAi.chat(profile, text);
      if (mhResult.flagged) return { kind: 'safety' };
      mhStore.addMessage(profile, 'assistant', mhResult.reply, mhResult.suggestions);
      return { kind: 'assistant', reply: mhResult.reply, suggestions: [], activeProcess: null };
    }

    var active = settingsStore.settings();
    var activeProcess = registry ? registry.activeOpenProcess() : null;
    var historyStore = window.TradeJournalAiChatHistoryStore;
    var response = await fetch('/api/ai/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: active.provider, apiKey: settingsStore.getKey(active.provider), model: settingsStore.activeModel(),
        language: i18n.language(), message: text, chatHistory: transcript.slice(-24),
        activeProcess: activeProcess ? { id: activeProcess.id, allowlist: activeProcess.allowlist } : null
      })
    });
    var payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'AI_REQUEST_FAILED');
    if (window.TradeJournalAIUsage) window.TradeJournalAIUsage.record({ provider: payload.provider, usage: payload.usage });
    if (historyStore) {
      var usageValue = payload.usage || {};
      var usedTokens = typeof usageValue.totalTokens === 'number' ? usageValue.totalTokens : (usageValue.promptTokens || 0) + (usageValue.completionTokens || 0);
      historyStore.addExchange(active.provider, text, payload.reply, providerLabel(payload.provider || active.provider), usedTokens);
    }
    return { kind: 'assistant', reply: payload.reply, suggestions: payload.suggestions || [], activeProcess: activeProcess };
  }

  function applySuggestion(processId, path, value, mode) {
    if (registry) registry.applyValue(processId, path, value, mode);
  }

  // A7: explicit, click-initiated action - never auto-detected - consistent with every other
  // AI trigger in this app being click-initiated.
  async function analyzeScreenshot(dataUrl) {
    var active = settingsStore.settings();
    var response = await fetch('/api/trades/extract-fields', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: active.provider, apiKey: settingsStore.getKey(active.provider), model: settingsStore.activeModel(), language: i18n.language(), images: [dataUrl] })
    });
    var result = await response.json();
    if (!response.ok) throw new Error(result.error || 'AI_REQUEST_FAILED');
    if (window.TradeJournalAIUsage) window.TradeJournalAIUsage.record({ provider: result.provider, usage: result.usage });
    return result;
  }

  function detectEmotionalContent(text) {
    if (!text) return null;
    return { id: 'dock-emotion-' + Date.now().toString(36), timestamp: new Date().toISOString(), stage: 'entry', dominantEmotions: [], emotionDetails: [], stressLevel: 5, focusQuality: 5, planCommitment: 5, wouldTakeIfNotForced: null, note: text };
  }

  // The exact same 3-call sequence openCalculator's existing log.onclick already uses
  // (createDraft -> applyCalculatedToTrade -> openWizard), just fed by extracted values instead
  // of typed ones. Emotional content in the accompanying message is seeded onto
  // trade.emotionLog before the wizard opens.
  function applyExtractionToWizard(extraction, contextMessage) {
    var tradeStore = window.TradeJournalTradeStore, tradeUi = window.TradeJournalTradeUI, calc = window.TradeJournalTradeCalculator;
    if (!tradeStore || !tradeUi || !calc) return false;
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
    tradeUi.openWizard(trade);
    return true;
  }

  window.TradeJournalChatDockCore = {
    providerLabel: providerLabel,
    sendChat: sendChat,
    applySuggestion: applySuggestion,
    analyzeScreenshot: analyzeScreenshot,
    applyExtractionToWizard: applyExtractionToWizard
  };
}());
