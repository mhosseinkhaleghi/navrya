import React from 'react';
import { createRoot } from 'react-dom/client';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Select } from '../public/pages/shared/navrya/components/forms/Select.jsx';
import { TextField } from '../public/pages/shared/navrya/components/forms/TextField.jsx';
import { Toggle } from '../public/pages/shared/navrya/components/forms/Toggle.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { Notice } from '../public/pages/shared/navrya/components/feedback/Notice.jsx';
import { MetricTile } from '../public/pages/shared/navrya/components/metrics/MetricTile.jsx';
import { memorySnapshot, clearChatHistory, providerLabel } from './aiSettingsAdapter.js';
import { currentNavryaCharacter } from './currentCharacter.js';

function fieldLabel(text) {
  return <span style={{ display: 'block', marginBottom: 7, font: 'var(--type-body)', fontSize: 12, color: 'var(--text-primary)' }}>{text}</span>;
}

function MemoryRow({ label, count, clearLabel, onClear }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ font: 'var(--type-body)', color: 'var(--text-primary)' }}>{label + ' (' + count + ')'}</span>
      <Button variant="secondary" size="sm" icon="trash-2" onClick={onClear}>{clearLabel}</Button>
    </div>
  );
}

function ChatHistoryRow({ message }) {
  const isUser = message.role === 'user';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 10px', borderRadius: 8, background: isUser ? 'rgba(255,255,255,.04)' : 'rgba(11,20,21,.4)' }}>
      <span style={{ font: 'var(--type-caption)', fontSize: 11, color: 'var(--text-muted)' }}>
        {(isUser ? 'You' : 'Assistant') + ' · ' + new Date(message.createdAt).toLocaleString()}
      </span>
      <span style={{ font: 'var(--type-body)', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{message.content}</span>
    </div>
  );
}

function AiAssistantView({ i18n, settingsStore, usageStore, chatHistoryStore }) {
  const catalog = React.useMemo(() => settingsStore.providerCatalog(), []);
  const initial = React.useMemo(() => settingsStore.settings(), []);
  const [provider, setProvider] = React.useState(initial.provider);
  const activeEntry = catalog.find((p) => p.id === provider) || catalog[0];
  const [model, setModel] = React.useState(initial.modelByProvider[provider] || (activeEntry ? activeEntry.models[0] : ''));
  const [key, setKey] = React.useState(settingsStore.getKey(provider));
  const [persist, setPersist] = React.useState(!!initial.persistApiKey);
  const [budget, setBudget] = React.useState(initial.monthlyTokenBudget == null ? '' : String(initial.monthlyTokenBudget));
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState(null);
  const [usage, setUsage] = React.useState(null);
  const [memory, setMemory] = React.useState(() => memorySnapshot());
  const [chatHistory, setChatHistory] = React.useState(() => (chatHistoryStore ? chatHistoryStore.load() : []));
  const [toast, setToast] = React.useState(null);

  React.useEffect(() => {
    if (!chatHistoryStore) return undefined;
    function onChange() { setChatHistory(chatHistoryStore.load()); }
    window.addEventListener('tradejournal:ai-chat-history-changed', onChange);
    return () => window.removeEventListener('tradejournal:ai-chat-history-changed', onChange);
  }, [chatHistoryStore]);

  function refreshUsage() {
    setUsage({
      today: usageStore ? usageStore.today() : { totalTokens: 0 },
      month: usageStore ? usageStore.thisMonth() : { totalTokens: 0 },
      remaining: usageStore ? usageStore.remaining() : null
    });
  }
  React.useEffect(refreshUsage, []);

  function showToast(message) { setToast(message); window.setTimeout(() => setToast(null), 2600); }

  function onProviderChange(next) {
    setProvider(next);
    const entry = catalog.find((p) => p.id === next);
    setModel((entry && entry.models[0]) || '');
    setKey(settingsStore.getKey(next));
    setTestResult(null);
  }
  function onKeyChange(value) { setKey(value); settingsStore.setKey(provider, value); }
  function onPersistChange(value) { setPersist(value); settingsStore.setPersistApiKey(value); }

  async function testConnection() {
    setTesting(true); setTestResult(null);
    try {
      const response = await fetch('/api/ai/test-connection', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey: settingsStore.getKey(provider), model })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || 'FAILED');
      setTestResult({ ok: true, message: i18n.t('aiTestConnectionOk') });
    } catch (_) {
      setTestResult({ ok: false, message: i18n.t('aiTestConnectionFailed') });
    } finally {
      setTesting(false);
    }
  }

  function save() {
    const patch = { provider, monthlyTokenBudget: budget === '' ? null : Number(budget) };
    patch.modelByProvider = {};
    patch.modelByProvider[provider] = model;
    settingsStore.saveSettings(patch);
    showToast(i18n.t('aiSettingsSaved'));
    refreshUsage();
  }

  function clearMemory(kind) {
    if (!window.confirm(i18n.t('aiMemoryClearConfirm'))) return;
    clearChatHistory(kind);
    setMemory(memorySnapshot());
    showToast(i18n.t('aiSettingsSaved'));
  }

  function clearChatHistoryLog() {
    if (!chatHistoryStore || !window.confirm(i18n.t('aiChatHistoryClearConfirm'))) return;
    chatHistoryStore.clear();
    setChatHistory([]);
    showToast(i18n.t('aiSettingsSaved'));
  }

  function exportMemory() {
    const blob = new Blob([JSON.stringify(memory, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'ai-memory-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.append(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const rtl = i18n.direction() === 'rtl';
  const voiceSupported = !!(activeEntry && activeEntry.supportsVoice);

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ direction: rtl ? 'rtl' : 'ltr', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 760 }}>
      <div>
        <h2 style={{ margin: '0 0 4px', font: 'var(--type-display-md)', fontSize: 22, color: 'var(--parchment)' }}>{i18n.t('aiSettingsTitle')}</h2>
        <p style={{ margin: 0, font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t('aiSettingsHelp')}</p>
      </div>

      <Panel variant="base" radius={12} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>{fieldLabel(i18n.t('aiProviderLabel'))}<Select value={provider} options={catalog.map((p) => ({ value: p.id, label: providerLabel(i18n, p.id) }))} onChange={onProviderChange} /></div>
          <div>{fieldLabel(i18n.t('aiModelLabel'))}<Select value={model} options={(activeEntry ? activeEntry.models : []).map((m) => ({ value: m, label: m }))} onChange={setModel} /></div>
        </div>
        <TextField label={i18n.t('aiKeyLabel')} type="password" dir="ltr" value={key} placeholder={i18n.t('aiKeyPlaceholder')} onChange={onKeyChange} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Button variant="secondary" icon="plug-zap" onClick={testConnection} disabled={testing}>{i18n.t('aiTestConnection')}</Button>
          {testResult && <span style={{ font: 'var(--type-caption)', color: testResult.ok ? 'var(--success)' : 'var(--danger)' }}>{testResult.message}</span>}
        </div>
        <Toggle checked={persist} onChange={onPersistChange} label={i18n.t('aiKeyPersistToggle')} />
        {persist && <Notice tone="warning">{i18n.t('aiKeyPersistWarning')}</Notice>}
        <Toggle checked={voiceSupported} disabled label={i18n.t('aiVoiceModeLabel')} hint={voiceSupported ? i18n.t('aiVoiceHandledBy', { model }) : i18n.t('aiVoiceUnavailable')} />
      </Panel>

      <Panel variant="base" radius={12} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h3 style={{ margin: 0, font: 'var(--type-body)', fontWeight: 700, color: 'var(--parchment)' }}>{i18n.t('aiUsageTitle')}</h3>
        {usage && (
          <div style={{ display: 'flex', gap: 16 }}>
            <MetricTile icon="scenarios" label={i18n.t('aiUsageToday')} value={i18n.number(usage.today.totalTokens)} />
            <MetricTile icon="execution" label={i18n.t('aiUsageMonth')} value={i18n.number(usage.month.totalTokens)} />
          </div>
        )}
        <TextField label={i18n.t('aiUsageBudgetLabel')} type="number" value={budget} onChange={setBudget} />
        {usage && (
          <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>
            {usage.remaining == null ? i18n.t('aiUsageNoBudget') : i18n.t('aiUsageRemaining', { value: i18n.number(usage.remaining) })}
          </span>
        )}
      </Panel>

      <Button variant="primary" icon="save" onClick={save} style={{ alignSelf: 'flex-start' }}>{i18n.t('aiSave')}</Button>

      <Panel variant="base" radius={12} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <h3 style={{ margin: '0 0 4px', font: 'var(--type-body)', fontWeight: 700, color: 'var(--parchment)' }}>{i18n.t('aiMemoryTitle')}</h3>
          <p style={{ margin: 0, font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t('aiMemoryHint')}</p>
        </div>
        <MemoryRow label={i18n.t('aiMemoryPatterns')} count={memory.patterns.reduce((n, p) => n + p.chatHistory.length, 0)} clearLabel={i18n.t('aiMemoryClear')} onClear={() => clearMemory('patterns')} />
        <MemoryRow label={i18n.t('aiMemoryStrategies')} count={memory.strategies.reduce((n, s) => n + s.chatHistory.length, 0)} clearLabel={i18n.t('aiMemoryClear')} onClear={() => clearMemory('strategies')} />
        <MemoryRow label={i18n.t('aiMemoryMentalHealth')} count={memory.mentalHealth ? memory.mentalHealth.chatHistory.length : 0} clearLabel={i18n.t('aiMemoryClear')} onClear={() => clearMemory('mentalHealth')} />
        <Button variant="secondary" icon="download" onClick={exportMemory} style={{ alignSelf: 'flex-start' }}>{i18n.t('aiMemoryExport')}</Button>
      </Panel>

      <Panel variant="base" radius={12} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <h3 style={{ margin: '0 0 4px', font: 'var(--type-body)', fontWeight: 700, color: 'var(--parchment)' }}>{i18n.t('aiChatHistoryTitle')}</h3>
            <p style={{ margin: 0, font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t('aiChatHistoryHint')}</p>
          </div>
          {chatHistory.length > 0 && <Button variant="secondary" size="sm" icon="trash-2" onClick={clearChatHistoryLog}>{i18n.t('aiMemoryClear')}</Button>}
        </div>
        {chatHistory.length === 0 ? (
          <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t('aiChatHistoryEmpty')}</span>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
            {chatHistory.map((message) => <ChatHistoryRow key={message.id} message={message} />)}
          </div>
        )}
      </Panel>

      {toast && <div className="tj-toast success" role="status">{toast}</div>}
    </div>
  );
}

// ai-settings-ui.js's renderPage() defers to this hook when present - same settingsStore/
// usageStore reads and writes, only the DOM building changes (mirrors window.TradeJournalNavryaCanvas).
export function renderAiAssistant() {
  const i18n = window.TradeJournalAII18n;
  const settingsStore = window.TradeJournalAISettingsStore;
  const usageStore = window.TradeJournalAIUsage;
  const chatHistoryStore = window.TradeJournalAiChatHistoryStore;
  const container = document.createElement('div');
  container.className = 'panel-page tj-ai-settings-page';
  container.dataset.character = currentNavryaCharacter();
  createRoot(container).render(<AiAssistantView i18n={i18n} settingsStore={settingsStore} usageStore={usageStore} chatHistoryStore={chatHistoryStore} />);
  return container;
}
