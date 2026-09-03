// Ported verbatim from ai-settings-ui.js's own memorySnapshot()/clearChatHistory() - the same
// real chat-history stores, only the rendering moves to React (see aiAssistantView.jsx).
export function memorySnapshot() {
  var patterns = (window.TradeJournalPatternStore && window.TradeJournalPatternStore.listSync()) || [];
  var strategies = (window.TradeJournalStrategyEducationStore && window.TradeJournalStrategyEducationStore.listSync()) || [];
  var mh = window.TradeJournalMentalHealthStore ? window.TradeJournalMentalHealthStore.load() : null;
  return {
    patterns: patterns.map(function (p) { return { id: p.id, name: p.name, chatHistory: p.chatHistory || [] }; }),
    strategies: strategies.map(function (s) { return { id: s.id, name: s.name, chatHistory: s.chatHistory || [] }; }),
    mentalHealth: mh ? {
      chatHistory: mh.chatHistory || [],
      baselineSummary: { stress: mh.baseline.initialStressLevel, regulation: mh.baseline.initialEmotionalRegulation },
      intakeSummary: mh.intake.completed ? mh.intake : null,
      activeBiases: (mh.psychologicalProfile.biasChecklist.biases || []).map(function (b) { return { type: b.type, selfRating: b.selfRating }; })
    } : null
  };
}

export function clearChatHistory(kind) {
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

export function providerLabel(i18n, id) {
  var suffix = { openai: 'OpenAI', anthropic: 'Anthropic', gemini: 'Gemini', kimi: 'Kimi', deepseek: 'Deepseek' }[id] || (id.charAt(0).toUpperCase() + id.slice(1));
  return i18n.t('aiProvider' + suffix);
}
