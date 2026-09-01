import React from 'react';
import { createRoot } from 'react-dom/client';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Select } from '../public/pages/shared/navrya/components/forms/Select.jsx';
import { TextField } from '../public/pages/shared/navrya/components/forms/TextField.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { Chip } from '../public/pages/shared/navrya/components/forms/Chip.jsx';
import { Notice } from '../public/pages/shared/navrya/components/feedback/Notice.jsx';
import { MetricTile } from '../public/pages/shared/navrya/components/metrics/MetricTile.jsx';
import { ModelGlyph } from '../public/pages/shared/navrya/components/assistant/ModelSwitcher.jsx';
import { memorySnapshot, clearChatHistory, providerLabel } from './aiSettingsAdapter.js';
import { currentNavryaCharacter } from './currentCharacter.js';

function fmtUsd(microUsd) { return '$' + ((Number(microUsd) || 0) / 1000000).toFixed(4); }

function compact(n) {
  const v = Number(n || 0);
  if (v >= 1000000) return (v / 1000000).toFixed(2) + 'M';
  if (v >= 1000) return Math.round(v / 1000) + 'K';
  return String(v);
}

function glyphModel(entry) { return entry ? { id: entry.id, trait: entry.trait, knockout: entry.knockout } : null; }

// The two toggles this screen uses (VOICE MODE, REMEMBER) are a bespoke 46x26 shape the design
// hands over as raw markup, not the app's generic 42x24 Toggle - recreated verbatim rather than
// re-skinning the shared component, per the handoff's "nothing here should be re-styled by eye".
function BigToggle({ checked, onChange, ariaLabel }) {
  return (
    <button
      type="button" onClick={() => onChange(!checked)} aria-label={ariaLabel} aria-pressed={checked}
      style={{
        width: 46, height: 26, flex: 'none', boxSizing: 'border-box', borderRadius: 999,
        border: '1px solid ' + (checked ? 'color-mix(in srgb, var(--char-accent) 70%, transparent)' : 'var(--border-gold)'),
        background: checked ? 'var(--char-active-surface)' : 'rgba(3,8,7,.55)',
        display: 'flex', alignItems: 'center', justifyContent: checked ? 'flex-end' : 'flex-start',
        padding: 2, cursor: 'pointer', transition: 'background var(--dur-hover) var(--ease-out), border-color var(--dur-hover) var(--ease-out)'
      }}
    >
      <span style={{ width: 20, height: 20, borderRadius: 999, background: checked ? 'var(--char-accent)' : 'var(--text-disabled)', display: 'block' }}></span>
    </button>
  );
}

function EngineTabStrip({ catalog, model, aiTab, usageMonthByProvider, onSelectEngine, onSelectKeys, i18n }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 8, border: '1px solid var(--border-gold)', borderRadius: 12, background: 'var(--surface-card)', boxShadow: 'var(--shadow-panel)' }}>
      {catalog.map((entry) => {
        // Stays highlighted even while the PERSONAL KEY tab is open (the handoff's own
        // requirement: "always clear which engine the key belongs to") - only aiTab itself
        // decides which panel renders below, not which engine tab looks selected.
        const selected = entry.id === model;
        const month = (usageMonthByProvider[entry.id] && usageMonthByProvider[entry.id].totalTokens) || 0;
        return (
          <button
            key={entry.id} type="button" onClick={() => onSelectEngine(entry.id)}
            style={{
              boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 10, height: 52, padding: '0 16px',
              borderRadius: 8, cursor: 'pointer', font: 'var(--type-body)', letterSpacing: '.06em', textTransform: 'uppercase',
              border: selected ? '2px solid var(--char-accent)' : '1px solid transparent',
              background: selected ? 'var(--char-active-surface)' : 'transparent',
              boxShadow: selected ? 'var(--glow-active)' : 'none',
              color: selected ? 'var(--char-accent)' : 'var(--text-muted)',
              transition: 'background var(--dur-hover) var(--ease-out), border-color var(--dur-hover) var(--ease-out), color var(--dur-hover) var(--ease-out)'
            }}
          >
            <ModelGlyph model={glyphModel(entry)} size={20} animate={selected} muted={!selected} />
            {providerLabel(i18n, entry.id)}
            <span className="navrya-tabular" style={{ font: 'var(--type-caption)', letterSpacing: '.06em', color: selected ? 'var(--text-muted)' : 'var(--text-dim)', opacity: selected ? 1 : 0.72 }}>
              {compact(month) + ' / MO'}
            </span>
          </button>
        );
      })}
      <span aria-hidden="true" style={{ width: 1, height: 28, background: 'var(--divider-gold)', marginInlineStart: 'auto' }}></span>
      <button
        type="button" onClick={onSelectKeys}
        style={{
          boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 10, height: 52, padding: '0 18px',
          borderRadius: 8, cursor: 'pointer', font: 'var(--type-body)', letterSpacing: '.06em', textTransform: 'uppercase',
          border: aiTab === 'keys' ? '2px solid var(--char-accent)' : '1px solid var(--border-gold)',
          background: aiTab === 'keys' ? 'var(--char-active-surface)' : 'rgba(11,20,21,.72)',
          boxShadow: aiTab === 'keys' ? 'var(--glow-active)' : 'none',
          color: aiTab === 'keys' ? 'var(--char-accent)' : 'var(--text-muted)',
          transition: 'background var(--dur-hover) var(--ease-out), border-color var(--dur-hover) var(--ease-out), color var(--dur-hover) var(--ease-out)'
        }}
      >
        <Icon name="key" size={18} />
        {i18n.t('aiAsstPersonalKeyTab')}
      </button>
    </div>
  );
}

function fmtChatDate(i18n, value) {
  try { return new Intl.DateTimeFormat(i18n.locale(), { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value)); }
  catch (_) { return ''; }
}

// `chat` is the lightweight list summary (id/title/messageCount/tokens/updatedAt - no message
// bodies); `detail` is the full { messages: [{role,content}] } record, fetched lazily by the
// parent only once this row is expanded (avoids an N-conversation fetch just to render the list).
function ChatRow({ chat, engineGlyph, expanded, detail, onToggle, onDelete, onContinue, i18n }) {
  return (
    <div style={{ border: '1px solid var(--border-hairline)', borderRadius: 8, background: 'rgba(11,20,21,.55)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <span style={{ width: 34, height: 34, flex: 'none', borderRadius: 999, border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.55)', display: 'grid', placeItems: 'center' }}>
          <ModelGlyph model={engineGlyph} size={16} />
        </span>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={{ font: 'var(--type-username)', color: 'var(--text-primary)' }}>{chat.title}</span>
          <span className="navrya-tabular" style={{ font: 'var(--type-caption)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
            {i18n.t('aiAsstMessagesTokensMeta', { date: fmtChatDate(i18n, chat.updatedAt), messages: chat.messageCount, tokens: i18n.number(chat.tokens || 0) })}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
          <Button variant="primary" size="sm" icon="square-pen" onClick={onContinue}>{i18n.t('aiAsstContinueInDock')}</Button>
          <Button variant="secondary" size="sm" onClick={onToggle}>{expanded ? i18n.t('aiAsstClose') : i18n.t('aiAsstOpen')}</Button>
          <Button variant="danger" size="sm" icon="trash" onClick={onDelete}></Button>
        </div>
      </div>
      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--border-hairline)', paddingTop: 12 }}>
          {!detail ? (
            <span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t('aiDockHistoryLoading')}</span>
          ) : (detail.messages || []).map((line, i) => (
            <div key={i} style={{ display: 'flex', gap: 14 }}>
              <span style={{ width: 76, flex: 'none', font: 'var(--type-caption)', letterSpacing: 'var(--tracking-label)', color: 'var(--char-accent)', textTransform: 'uppercase' }}>
                {line.role === 'user' ? i18n.t('aiDockYou') : i18n.t('aiDockAssistant')}
              </span>
              <span style={{ flex: 1, font: 'var(--type-body)', color: 'var(--text-primary)', textWrap: 'pretty' }}>{line.content}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AiAssistantView({ i18n, settingsStore, usageStore, chatHistoryStore }) {
  const catalog = React.useMemo(() => settingsStore.providerCatalog(), []);
  const [model, setModel] = React.useState(() => settingsStore.activeProvider());
  const [aiTab, setAiTab] = React.useState('engine');
  const [openChatId, setOpenChatId] = React.useState(null);
  const [openChatDetail, setOpenChatDetail] = React.useState(null);
  const [chats, setChats] = React.useState([]);
  const [chatsLoading, setChatsLoading] = React.useState(false);
  const [, forceRerender] = React.useReducer((x) => x + 1, 0);
  const [revealByProvider, setRevealByProvider] = React.useState({});
  const [keyStatusByProvider, setKeyStatusByProvider] = React.useState({});
  const [keyMessageByProvider, setKeyMessageByProvider] = React.useState({});
  const [savedAtByProvider, setSavedAtByProvider] = React.useState({});
  const testTimer = React.useRef(null);
  const clearMessageTimer = React.useRef(null);
  // Real, gateway-settled per-model cost (task D.1) - a server fetch, never the local
  // usageStore's own client-reported token counts above (that store stays exactly as-is, per
  // task C.2's "preserve the existing client usage UI's immediate local feedback").
  const [realCostByModel, setRealCostByModel] = React.useState(null);
  React.useEffect(() => {
    fetch('/api/users/me/ai-usage-by-model').then((r) => r.json()).then((d) => setRealCostByModel(d.byModel || [])).catch(() => setRealCostByModel([]));
  }, []);

  // Real-money subscription rollout: the CURRENT plan's feature flags (byok/premiumModels),
  // reusing the exact same two endpoints SubscriptionTab already calls (accountProfileView.jsx) -
  // never a third/parallel entitlements fetch. `planFeatures` defaults to an all-false shape so a
  // slow/failed fetch fails CLOSED (locked), never open, on both gates below.
  const [planFeatures, setPlanFeatures] = React.useState({ byok: false, premiumModels: false });
  // 'model' | 'byok' | null - which lock the user just bumped into, so the inline notice below
  // shows the right copy; null hides it entirely.
  const [upgradeNotice, setUpgradeNotice] = React.useState(null);
  React.useEffect(() => {
    Promise.all([
      fetch('/api/sync/subscriptions').then((r) => r.json()),
      fetch('/api/sync/subscriptions/catalog').then((r) => r.json())
    ]).then(([sub, cat]) => {
      const plan = cat.plans && cat.plans[sub.plan];
      if (plan) setPlanFeatures({ byok: !!plan.features.byok, premiumModels: !!plan.features.premiumModels });
    }).catch(() => {});
  }, []);

  // Every field this screen reads (key, model choice, voice, remember, budget) lives in
  // ai-settings-store.js, not component state - both stores dispatch a change event on every
  // write (including our own), so this listener is the single re-render trigger for the whole
  // screen. It also keeps the tab strip pointed at whatever engine the ChatDock is on, since
  // that is a separate React root (README: "one selection, two surfaces").
  React.useEffect(() => {
    function onSettingsChanged(event) {
      const next = (event.detail && event.detail.provider) || settingsStore.activeProvider();
      setModel(next);
      forceRerender();
    }
    window.addEventListener('tradejournal:ai-settings-changed', onSettingsChanged);
    return () => window.removeEventListener('tradejournal:ai-settings-changed', onSettingsChanged);
  }, []);

  // AI process registry (A4) - mountedRef template, whole-page scope (this screen has no
  // per-tab remount the way Account Profile's tabs do - 'engine'/'keys' is local aiTab state,
  // not a mount signal).
  // Journey F, F36: modelRef keeps applyValue reading the CURRENT active provider (this effect's
  // deps [] only run once at mount) - 'model' below validates against THAT provider's own real
  // models list, never a fixed one captured at mount. 'apiKey'/'persistApiKey'/'budget' are
  // deliberately never wired into applyValue at all - not merely left off the allowlist, since a
  // future allowlist edit here must not accidentally reopen that seam. Every applied value here
  // is already a complete, immediate persist (saveSettings()/setVoice() write straight through,
  // same as Trading Defaults/Region & language) - no separate Save step exists on this screen.
  const modelRef = React.useRef(model);
  modelRef.current = model;
  const engineMountedRef = React.useRef(true);
  React.useEffect(() => {
    engineMountedRef.current = true;
    const registry = window.TradeJournalAIProcessRegistry;
    if (!registry) return undefined;
    registry.register('ai-assistant-engine', {
      allowlist: ['provider', 'model', 'voice'],
      isOpen: () => engineMountedRef.current,
      applyValue: (path, value) => {
        if (path === 'provider') {
          if (catalog.some((p) => p.id === value)) selectEngine(value);
          return;
        }
        if (path === 'model') {
          const current = catalog.find((p) => p.id === modelRef.current);
          if (current && current.models.indexOf(value) > -1) settingsStore.saveSettings({ modelByProvider: { [modelRef.current]: value } });
          return;
        }
        if (path === 'voice') {
          const v = value === true || value === 'true';
          if (value === true || value === false || value === 'true' || value === 'false') settingsStore.setVoice(modelRef.current, v);
        }
      }
    });
    return () => { engineMountedRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Conversations are real and server-backed now (ai-chat-history-store.js) - fetched per engine,
  // refreshed whenever the model changes AND on the dock's own
  // tradejournal:ai-chat-history-changed event (a message sent from the dock, or a delete/rename
  // here, must both refresh this same list).
  const refreshChats = React.useCallback(() => {
    if (!chatHistoryStore) return;
    setChatsLoading(true);
    chatHistoryStore.listFor(model)
      .then((list) => setChats(list))
      .catch(() => setChats([]))
      .finally(() => setChatsLoading(false));
  }, [model, chatHistoryStore]);

  React.useEffect(() => { refreshChats(); }, [refreshChats]);

  React.useEffect(() => {
    function onChanged() { forceRerender(); refreshChats(); }
    window.addEventListener('tradejournal:ai-chat-history-changed', onChanged);
    return () => window.removeEventListener('tradejournal:ai-chat-history-changed', onChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshChats]);

  React.useEffect(() => () => { clearTimeout(testTimer.current); clearTimeout(clearMessageTimer.current); }, []);

  const rtl = i18n.direction() === 'rtl';
  const settings = settingsStore.settings();
  const entry = catalog.find((p) => p.id === model) || catalog[0];
  const engLabel = providerLabel(i18n, model);
  const engGlyph = glyphModel(entry);

  const usageToday = usageStore ? usageStore.today() : { byProvider: {} };
  const usageMonth = usageStore ? usageStore.thisMonth() : { byProvider: {} };
  const usageLifetime = usageStore ? usageStore.lifetime() : { byProvider: {} };
  const todayTokens = (usageToday.byProvider[model] && usageToday.byProvider[model].totalTokens) || 0;
  const monthTokens = (usageMonth.byProvider[model] && usageMonth.byProvider[model].totalTokens) || 0;
  const lifeTokens = (usageLifetime.byProvider[model] && usageLifetime.byProvider[model].totalTokens) || 0;
  const budget = settings.budgetByProvider[model];
  const budgetPct = budget ? Math.min(100, Math.round((monthTokens / budget) * 100)) : 0;

  const avgTokens = chats.length ? Math.round(chats.reduce((sum, c) => sum + (c.tokens || 0), 0) / chats.length) : 0;

  const key = settingsStore.getKey(model);
  const voice = !!settings.voiceByProvider[model];
  const reveal = !!revealByProvider[model];
  const keyStatus = keyStatusByProvider[model];
  const keyMessage = keyMessageByProvider[model];
  const savedAt = savedAtByProvider[model];

  // Recomputed on every render (cheap: a handful of localStorage-backed store reads) rather than
  // memoized - memoizing it would need its own invalidation signal for clearMemoryBucket()'s
  // writes, and forceRerender() already gives every write in this screen a fresh render for free.
  const memory = memorySnapshot();

  function selectEngine(nextId) {
    setModel(nextId);
    setAiTab('engine');
    setOpenChatId(null);
    settingsStore.saveSettings({ provider: nextId });
  }
  function selectKeysTab() { setAiTab('keys'); }

  function setKeyMessageFor(id, value) {
    setKeyMessageByProvider((prev) => ({ ...prev, [id]: value }));
    clearTimeout(clearMessageTimer.current);
    if (value) clearMessageTimer.current = window.setTimeout(() => setKeyMessageByProvider((prev) => ({ ...prev, [id]: null })), 3000);
  }

  async function testConnection() {
    const providerAtStart = model;
    setKeyStatusByProvider((prev) => ({ ...prev, [providerAtStart]: 'testing' }));
    try {
      const response = await fetch('/api/ai/test-connection', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: providerAtStart, apiKey: settingsStore.getKey(providerAtStart), model: settingsStore.settings().modelByProvider[providerAtStart] })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || 'FAILED');
      setKeyStatusByProvider((prev) => ({ ...prev, [providerAtStart]: 'verified' }));
      setKeyMessageFor(providerAtStart, { ok: true, text: i18n.t('aiTestConnectionOk') });
    } catch (_) {
      setKeyStatusByProvider((prev) => ({ ...prev, [providerAtStart]: null }));
      setKeyMessageFor(providerAtStart, { ok: false, text: i18n.t('aiTestConnectionFailed') });
    }
  }

  function onKeyChange(value) {
    settingsStore.setKey(model, value);
    setKeyStatusByProvider((prev) => ({ ...prev, [model]: null }));
  }

  function saveKey() {
    const stamp = new Date();
    const value = stamp.toISOString().slice(0, 10) + ' · ' + stamp.toTimeString().slice(0, 5);
    setSavedAtByProvider((prev) => ({ ...prev, [model]: value }));
  }

  // No empty draft row is created here anymore - the dock itself creates the real conversation
  // record on its first successful reply (chat-dock-core.js). This just tells the dock (a
  // separate React root) to reset to a fresh thread on whichever engine is selected, the same
  // cross-root-sync convention tradejournal:ai-settings-changed already establishes.
  function newChat() {
    window.dispatchEvent(new CustomEvent('tradejournal:ai-resume-conversation', { detail: { id: null, provider: model } }));
  }
  function continueInDock(chat) {
    window.dispatchEvent(new CustomEvent('tradejournal:ai-resume-conversation', { detail: { id: chat.id, provider: model } }));
  }
  function toggleChat(chat) {
    if (openChatId === chat.id) { setOpenChatId(null); setOpenChatDetail(null); return; }
    setOpenChatId(chat.id);
    setOpenChatDetail(null);
    if (chatHistoryStore) {
      chatHistoryStore.get(chat.id).then((record) => setOpenChatDetail(record)).catch(() => setOpenChatDetail({ messages: [] }));
    }
  }
  function deleteChat(chat) {
    if (!chatHistoryStore) return;
    chatHistoryStore.remove(chat.id).then(() => { if (openChatId === chat.id) { setOpenChatId(null); setOpenChatDetail(null); } });
  }
  function clearMemoryBucket(kind) {
    if (!window.confirm(i18n.t('aiMemoryClearConfirm'))) return;
    clearChatHistory(kind);
    forceRerender();
  }
  function exportMemory() {
    const blob = new Blob([JSON.stringify(memory, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'ai-memory-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.append(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const memoryRows = [
    { id: 'patterns', label: i18n.t('aiMemoryPatterns'), count: memory.patterns.reduce((n, p) => n + p.chatHistory.length, 0) },
    { id: 'strategies', label: i18n.t('aiMemoryStrategies'), count: memory.strategies.reduce((n, s) => n + s.chatHistory.length, 0) },
    { id: 'mentalHealth', label: i18n.t('aiMemoryMentalHealth'), count: memory.mentalHealth ? memory.mentalHealth.chatHistory.length : 0 }
  ];

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ direction: rtl ? 'rtl' : 'ltr', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 32, padding: '0 2px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ font: 'var(--type-display-lg)', color: 'var(--text-primary)', letterSpacing: 'var(--tracking-display)', textTransform: 'uppercase' }}>{i18n.t('aiAsstTitle')}</div>
          <p style={{ margin: 0, maxWidth: 660, font: 'var(--type-body)', color: 'var(--text-muted)', textWrap: 'pretty' }}>{i18n.t('aiAsstSubtitle')}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
          <Chip tone="accent" dot>{i18n.t('aiAsstActiveInDock')}</Chip>
          <Chip tone="neutral">{engLabel}</Chip>
        </div>
      </div>

      <EngineTabStrip
        catalog={catalog} model={model} aiTab={aiTab} usageMonthByProvider={usageMonth.byProvider}
        onSelectEngine={selectEngine} onSelectKeys={selectKeysTab} i18n={i18n}
      />

      {aiTab === 'engine' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!!upgradeNotice && (
            <Notice tone="accent" icon="crown">
              {i18n.t(upgradeNotice === 'model' ? 'aiAsstPremiumModelLockedNotice' : 'aiAsstByokLockedNotice')}{' '}
              <a href="#account/profile/subscriptions" onClick={() => setUpgradeNotice(null)} style={{ color: 'var(--char-accent)', textDecoration: 'underline', cursor: 'pointer' }}>
                {i18n.t('aiAsstOpenSubscription')}
              </a>
            </Notice>
          )}
          <Panel variant="prestige" ornament texture padding="18px 20px">
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
              <span style={{ width: 64, height: 64, flex: 'none', borderRadius: 999, border: '1px solid var(--border-gold)', background: 'linear-gradient(180deg,rgba(17,27,28,.94),rgba(7,11,15,.96))', boxShadow: 'var(--shadow-raised)', display: 'grid', placeItems: 'center' }}>
                <ModelGlyph model={engGlyph} size={30} animate />
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 220 }}>
                <span style={{ font: 'var(--type-caption)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{i18n.t('aiAsstEngineLabel')}</span>
                <span style={{ font: 'var(--type-display-md)', color: 'var(--text-primary)', letterSpacing: 'var(--tracking-display)' }}>{engLabel}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <span style={{ font: 'var(--type-body)', fontSize: 12, color: 'var(--text-primary)' }}>{i18n.t('aiAsstModelLabel')}</span>
                <Select
                  value={settings.modelByProvider[model]}
                  options={(entry ? entry.models : []).map((m) => {
                    // modelLabels/modelTiers are optional per-model presentation metadata on the
                    // SAME canonical catalog entry (ai-settings-store.js) - a model with neither
                    // (every legacy id: gpt-5.6, gpt-4.1, gpt-4o, and every non-OpenAI model)
                    // falls back to the raw id exactly as before this composition existed. The
                    // tier phrase itself is real, localized UI copy (ai-i18n.js
                    // aiAsstModelTier<Tier>) - never a hardcoded dollar figure, since retail
                    // pricing/markup stay admin-controlled (server/commercial/wallet-service.mjs).
                    const label = (entry && entry.modelLabels && entry.modelLabels[m]) || m;
                    const tier = entry && entry.modelTiers && entry.modelTiers[m];
                    const tierKey = tier && 'aiAsstModelTier' + tier.charAt(0).toUpperCase() + tier.slice(1);
                    const tierText = tierKey ? i18n.t(tierKey) : '';
                    const isPremiumLocked = entry && entry.premiumModels && entry.premiumModels.indexOf(m) > -1 && !planFeatures.premiumModels;
                    const suffix = isPremiumLocked ? i18n.t('aiAsstModelNeedsSubscription') : tierText;
                    return { value: m, label: suffix ? label + ' — ' + suffix : label };
                  })}
                  onChange={(v) => {
                    const isPremiumLocked = entry && entry.premiumModels && entry.premiumModels.indexOf(v) > -1 && !planFeatures.premiumModels;
                    if (isPremiumLocked) { setUpgradeNotice('model'); return; }
                    settingsStore.saveSettings({ modelByProvider: { [model]: v } });
                  }}
                  icon="sparkle" width={340}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginInlineStart: 8 }}>
                <span style={{ font: 'var(--type-caption)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{i18n.t('aiAsstPersonalKeyLabel')}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {key ? <Chip tone="success" dot>{i18n.t('aiAsstLinked')}</Chip> : <Chip tone="neutral" dot>{i18n.t('aiAsstNotSet')}</Chip>}
                  <Button variant="ghost" size="sm" icon="key" onClick={selectKeysTab}>{i18n.t('aiAsstEditKey')}</Button>
                </div>
              </div>
              <div style={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, textAlign: rtl ? 'left' : 'right' }}>
                  <span style={{ font: 'var(--type-caption)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{i18n.t('aiAsstVoiceMode')}</span>
                  <span style={{ font: 'var(--type-caption)', color: 'var(--text-dim)' }}>{voice ? i18n.t('aiAsstVoiceHandledBy', { model: settings.modelByProvider[model] }) : i18n.t('aiAsstVoiceTextOnly')}</span>
                </div>
                <BigToggle checked={voice} onChange={(v) => settingsStore.setVoice(model, v)} ariaLabel={i18n.t('aiAsstVoiceMode')} />
              </div>
            </div>
          </Panel>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <Panel variant="base" ornament padding="18px 20px 20px" style={{ flex: '1 1 560px', minWidth: 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ font: 'var(--type-section-label)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{i18n.t('aiAsstChatHistory')}</span>
                  <Chip tone="neutral">{i18n.t(chats.length === 1 ? 'aiAsstConversationsOne' : 'aiAsstConversationsMany', { n: chats.length })}</Chip>
                  <span style={{ font: 'var(--type-caption)', color: 'var(--text-dim)', letterSpacing: '.04em' }}>{i18n.t('aiAsstKeptForOnly', { engine: engLabel })}</span>
                  <div style={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Button variant="ghost" size="sm" icon="trash" onClick={() => { if (window.confirm(i18n.t('aiChatHistoryClearConfirm'))) chatHistoryStore.clear(model).then(refreshChats); }}>{i18n.t('aiAsstClear')}</Button>
                    <Button variant="primary" icon="plus" onClick={newChat}>{i18n.t('aiAsstNewConversation')}</Button>
                  </div>
                </div>
                {chatsLoading && !chats.length ? (
                  <div style={{ padding: 32, textAlign: 'center', font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t('aiDockHistoryLoading')}</div>
                ) : chats.length > 0 ? (
                  <div className="navrya-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 470, overflowY: 'auto', paddingInlineEnd: 6 }}>
                    {chats.map((chat) => (
                      <ChatRow
                        key={chat.id} chat={chat} engineGlyph={engGlyph} expanded={openChatId === chat.id}
                        detail={openChatId === chat.id ? openChatDetail : null}
                        onToggle={() => toggleChat(chat)}
                        onDelete={() => deleteChat(chat)}
                        onContinue={() => continueInDock(chat)}
                        i18n={i18n}
                      />
                    ))}
                  </div>
                ) : (
                  <div style={{ border: '1px dashed var(--border-gold)', borderRadius: 8, minHeight: 300, display: 'grid', placeItems: 'center', textAlign: 'center', padding: 32 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, maxWidth: 420 }}>
                      <span style={{ width: 52, height: 52, borderRadius: 999, border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.55)', display: 'grid', placeItems: 'center' }}>
                        <ModelGlyph model={engGlyph} size={22} muted />
                      </span>
                      <span style={{ font: 'var(--type-display-md)', color: 'var(--text-primary)', letterSpacing: 'var(--tracking-display)' }}>{i18n.t('aiAsstNoConversationsYet')}</span>
                      <p style={{ margin: 0, font: 'var(--type-body)', color: 'var(--text-muted)', textWrap: 'pretty' }}>{i18n.t('aiAsstEmptyHelper', { engine: engLabel })}</p>
                    </div>
                  </div>
                )}
              </div>
            </Panel>

            <div style={{ width: 392, flex: 'none', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Panel variant="base" ornament padding="18px 20px 20px">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ font: 'var(--type-section-label)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{i18n.t('aiAsstTokenUsage')}</span>
                    <span style={{ marginInlineStart: 'auto', font: 'var(--type-caption)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-dim)', textTransform: 'uppercase' }}>{engLabel}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--divider-gold)', border: '1px solid var(--divider-gold)', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ background: 'var(--surface-card)', padding: '6px 0' }}><MetricTile icon="streak" label={i18n.t('aiAsstToday')} value={i18n.number(todayTokens)} /></div>
                    <div style={{ background: 'var(--surface-card)', padding: '6px 0' }}><MetricTile icon="calendar" label={i18n.t('aiAsstThisMonth')} value={i18n.number(monthTokens)} /></div>
                    <div style={{ background: 'var(--surface-card)', padding: '6px 0' }}><MetricTile icon="scenarios" label={i18n.t('aiAsstLifetime')} value={compact(lifeTokens)} /></div>
                    <div style={{ background: 'var(--surface-card)', padding: '6px 0' }}><MetricTile icon="execution" label={i18n.t('aiAsstAvgPerChat')} value={i18n.number(avgTokens)} /></div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                      <span style={{ font: 'var(--type-caption)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{i18n.t('aiAsstMonthlyBudget')}</span>
                      <span className="navrya-tabular" style={{ marginInlineStart: 'auto', font: 'var(--type-body)', color: 'var(--text-primary)' }}>{budget ? i18n.number(monthTokens) + ' / ' + i18n.number(budget) : i18n.t('aiAsstBudgetUsed', { value: i18n.number(monthTokens) })}</span>
                      <span className="navrya-tabular" style={{ font: 'var(--type-caption)', color: 'var(--char-accent)' }}>{budget ? budgetPct + '%' : '—'}</span>
                    </div>
                    <div style={{ height: 8, borderRadius: 999, background: 'rgba(3,8,7,.65)', border: '1px solid var(--border-hairline)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 999, background: 'linear-gradient(90deg,color-mix(in srgb, var(--char-accent) 55%, transparent),var(--char-accent))', transition: 'width var(--dur-progress) var(--ease-out)', width: (budget ? budgetPct : 0) + '%' }}></div>
                    </div>
                    <TextField
                      label={i18n.t('aiAsstBudgetFieldLabel')} value={budget ? String(budget) : ''}
                      onChange={(v) => settingsStore.setBudget(model, String(v).replace(/[^0-9]/g, ''))}
                      placeholder={i18n.t('aiAsstBudgetPlaceholder')}
                      hint={budget ? i18n.t('aiAsstBudgetHintSet') : i18n.t('aiAsstBudgetHintUnset')}
                    />
                  </div>
                </div>
              </Panel>

              <Panel variant="base" ornament padding="18px 20px 20px">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ font: 'var(--type-section-label)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{i18n.t('aiAsstRealCostTitle')}</span>
                    <span style={{ font: 'var(--type-caption)', color: 'var(--text-dim)' }}>{i18n.t('aiAsstRealCostHint')}</span>
                  </div>
                  {!realCostByModel || !realCostByModel.length ? (
                    <span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t('aiAsstRealCostEmpty')}</span>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {realCostByModel.map((row) => (
                        <div key={row.provider + '/' + row.model} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 12px', border: '1px solid var(--border-hairline)', borderRadius: 8, background: 'rgba(11,20,21,.55)' }}>
                          <span style={{ font: 'var(--type-body)', color: 'var(--text-primary)' }}>{row.provider + ' / ' + (row.model || '—')}</span>
                          <div dir="ltr" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, font: 'var(--type-caption)', color: 'var(--text-muted)' }}>
                            <span>{i18n.t('aiAsstRealCostCalls')}: {i18n.number(row.calls)}</span>
                            <span>{i18n.t('aiAsstRealCostTokens')}: {i18n.number(row.totalTokens)}</span>
                            <span>{i18n.t('aiAsstRealCostProviderCost')}: {fmtUsd(row.providerCostMicroUsd)}</span>
                            <span style={{ color: 'var(--char-accent)' }}>{i18n.t('aiAsstRealCostCharged')}: {fmtUsd(row.retailChargeMicroUsd)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Panel>

              <Panel variant="base" ornament padding="18px 20px 20px">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ font: 'var(--type-section-label)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{i18n.t('aiAsstAssistantMemory')}</span>
                    <span style={{ font: 'var(--type-caption)', color: 'var(--text-dim)' }}>{i18n.t('aiAsstMemoryNote')}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {memoryRows.map((row) => (
                      <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: '1px solid var(--border-hairline)', borderRadius: 8, background: 'rgba(11,20,21,.55)' }}>
                        <span style={{ font: 'var(--type-body)', color: 'var(--text-primary)', flex: 1 }}>{row.label}</span>
                        <span className="navrya-tabular" style={{ font: 'var(--type-body)', color: 'var(--char-accent)' }}>{i18n.number(row.count)}</span>
                        <Button variant="ghost" size="sm" icon="trash" onClick={() => clearMemoryBucket(row.id)}>{i18n.t('aiAsstClear')}</Button>
                      </div>
                    ))}
                  </div>
                  <Button variant="secondary" icon="download" fullWidth onClick={exportMemory}>{i18n.t('aiMemoryExport')}</Button>
                </div>
              </Panel>
            </div>
          </div>
        </div>
      )}

      {aiTab === 'keys' && !planFeatures.byok && (
        // "Do NOT delete the section - lock it with an upgrade message" (task requirement): the
        // BYOK tab itself stays reachable (EngineTabStrip's own tab strip is unaffected) but its
        // content is replaced entirely by this locked state, never a disabled-but-visible form
        // (a locked TextField would still let a determined user paste/submit via devtools; not
        // rendering the real inputs at all is the only real lock).
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 860 }}>
          <Panel variant="base" padding="28px 24px" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
            <Icon name="lock" size={28} />
            <span style={{ font: 'var(--type-display-md)', color: 'var(--text-primary)' }}>{i18n.t('aiAsstByokLockedTitle')}</span>
            <p style={{ margin: 0, font: 'var(--type-body)', color: 'var(--text-muted)', maxWidth: 480 }}>{i18n.t('aiAsstByokLockedBody')}</p>
            <Button variant="primary" icon="crown" onClick={() => { location.hash = '#account/profile/subscriptions'; }}>{i18n.t('aiAsstOpenSubscription')}</Button>
          </Panel>
        </div>
      )}

      {aiTab === 'keys' && planFeatures.byok && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 860 }}>
          <Notice tone="accent" icon="key">{i18n.t('aiAsstKeyNotice')}</Notice>
          <Panel variant="base" padding="16px 20px 18px">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <span style={{ width: 40, height: 40, flex: 'none', borderRadius: 999, border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.55)', display: 'grid', placeItems: 'center' }}>
                  <ModelGlyph model={engGlyph} size={20} />
                </span>
                <span style={{ font: 'var(--type-display-md)', color: 'var(--text-primary)', letterSpacing: 'var(--tracking-display)' }}>{engLabel}</span>
                <span style={{ font: 'var(--type-caption)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-dim)', textTransform: 'uppercase' }}>{entry ? entry.endpoint : ''}</span>
                <span style={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                  {keyStatus === 'verified' && <Chip tone="success" dot>{i18n.t('aiAsstVerified')}</Chip>}
                  {keyStatus === 'testing' && <Chip tone="accent" dot>{i18n.t('aiAsstTesting')}</Chip>}
                  {!keyStatus && key && <Chip tone="neutral" dot>{i18n.t('aiAsstStored')}</Chip>}
                  {!keyStatus && !key && <Chip tone="neutral" dot>{i18n.t('aiAsstNotSet')}</Chip>}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                  <TextField
                    label={i18n.t('aiAsstYourKeyLabel', { engine: engLabel })} type={reveal ? 'text' : 'password'} dir="ltr"
                    value={key} onChange={onKeyChange}
                    placeholder={i18n.t('aiAsstKeyPlaceholder', { engine: engLabel })}
                    hint={i18n.t('aiAsstKeyHint', { engine: engLabel })}
                  />
                </div>
                <Button variant="ghost" icon={reveal ? 'eye-off' : 'eye'} onClick={() => setRevealByProvider((prev) => ({ ...prev, [model]: !reveal }))}>
                  {reveal ? i18n.t('aiAsstHide') : i18n.t('aiAsstShow')}
                </Button>
                <Button variant="secondary" icon="sparkle" onClick={testConnection} disabled={keyStatus === 'testing'}>{i18n.t('aiTestConnection')}</Button>
              </div>
              {keyMessage && <span style={{ font: 'var(--type-caption)', color: keyMessage.ok ? 'var(--success)' : 'var(--danger)' }}>{keyMessage.text}</span>}
            </div>
          </Panel>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '0 2px', flexWrap: 'wrap' }}>
            <span style={{ flex: 1, font: 'var(--type-caption)', color: 'var(--text-dim)' }}>{savedAt ? i18n.t('aiAsstLastSaved', { value: savedAt }) : i18n.t('aiAsstNeverSaved')}</span>
            <Button variant="primary" icon="check" onClick={saveKey}>{i18n.t('aiAsstSaveKey')}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function renderAiAssistant() {
  const i18n = window.TradeJournalAII18n;
  const settingsStore = window.TradeJournalAISettingsStore;
  const usageStore = window.TradeJournalAIUsage;
  const chatHistoryStore = window.TradeJournalAiChatHistoryStore;
  const container = document.createElement('div');
  container.className = 'panel-page';
  container.dataset.character = currentNavryaCharacter();
  createRoot(container).render(<AiAssistantView i18n={i18n} settingsStore={settingsStore} usageStore={usageStore} chatHistoryStore={chatHistoryStore} />);
  return container;
}
