import React from 'react';
import { createRoot } from 'react-dom/client';
import { ChatDock } from '../public/pages/shared/navrya/components/assistant/ChatDock.jsx';
import { ChatResponsePopover, MiniButton, ActionRow } from '../public/pages/shared/navrya/components/assistant/ChatResponsePopover.jsx';

function fieldLabel(tradeI18n, key) { return tradeI18n ? tradeI18n.t(key) : key; }
function fieldNumber(tradeI18n, value) { return tradeI18n ? tradeI18n.number(value, { maximumFractionDigits: 4 }) : String(value); }

function fileDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function reviewFields(extraction, tradeI18n) {
  const rows = [];
  if (extraction.direction) rows.push({ label: fieldLabel(tradeI18n, 'direction'), value: fieldLabel(tradeI18n, extraction.direction) });
  if (extraction.entryPrice != null) rows.push({ label: fieldLabel(tradeI18n, 'entryPrice'), value: fieldNumber(tradeI18n, extraction.entryPrice) });
  if (extraction.stopLoss != null) rows.push({ label: fieldLabel(tradeI18n, 'stopLoss'), value: fieldNumber(tradeI18n, extraction.stopLoss) });
  (extraction.takeProfits || []).forEach((tp, i) => rows.push({ label: fieldLabel(tradeI18n, 'takeProfit') + ' ' + (i + 1), value: fieldNumber(tradeI18n, tp.price) }));
  if (extraction.leverage != null) rows.push({ label: fieldLabel(tradeI18n, 'leverage'), value: fieldNumber(tradeI18n, extraction.leverage) + '×' });
  return rows;
}

// Fast-resume shortcut anchored above the dock, same glass-card language as ChatResponsePopover -
// full browse/rename/delete management stays on the AI Assistant screen (aiAssistantView.jsx),
// this is just "pick a recent one and keep going" without leaving the dashboard.
function ConversationHistoryDropdown({ i18n, loading, conversations, onPick, onClose }) {
  return (
    <div
      role="listbox" aria-label={i18n.t('aiDockHistory')}
      style={{
        width: '100%', maxWidth: 360, boxSizing: 'border-box', maxHeight: 320, overflowY: 'auto',
        borderRadius: 'var(--radius-14)', border: '1px solid rgba(244,234,215,.14)',
        background: 'linear-gradient(180deg,rgba(244,234,215,.10),rgba(244,234,215,.035))',
        backdropFilter: 'blur(26px) saturate(150%)', WebkitBackdropFilter: 'blur(26px) saturate(150%)',
        boxShadow: 'var(--shadow-panel),inset 0 1px 0 rgba(255,255,255,.16),inset 0 0 0 1px rgba(183,138,74,.18)',
        padding: 6
      }}
    >
      {loading && (
        <div style={{ padding: 12, font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t('aiDockHistoryLoading')}</div>
      )}
      {!loading && !conversations.length && (
        <div style={{ padding: 12, font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t('aiDockHistoryEmpty')}</div>
      )}
      {!loading && conversations.map((conversation) => (
        <button
          key={conversation.id} type="button" onClick={() => onPick(conversation.id)}
          style={{
            display: 'block', width: '100%', textAlign: 'start', padding: '9px 10px', borderRadius: 8,
            border: '1px solid transparent', background: 'transparent', cursor: 'pointer', font: 'inherit'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(244,234,215,.05)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <div style={{ font: 'var(--type-body)', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conversation.title}</div>
          <div className="navrya-tabular" style={{ font: 'var(--type-caption)', color: 'var(--text-dim)' }}>
            {conversation.messageCount} · {new Date(conversation.updatedAt).toLocaleDateString()}
          </div>
        </button>
      ))}
    </div>
  );
}

function ChatDockApp({ i18n, core, settingsStore, tradeI18n, navryaCharacter }) {
  const [text, setText] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [providerId, setProviderId] = React.useState(settingsStore.activeProvider());
  // Re-affirmed fresh on every page load from the saved default - never silently sticky across
  // navigations (A6: the mode must always be visibly true to what's on screen).
  const [therapistMode, setTherapistMode] = React.useState(() => !!settingsStore.settings().therapistModeDefault);
  const [transcript, setTranscript] = React.useState([]);
  const [popover, setPopover] = React.useState(null);
  // Which server-side conversation (ai-chat-history-store.js) the current thread is saved as -
  // null until the first successful reply of a fresh session creates one. A real, growing,
  // resumable conversation now, not "every question is its own disconnected history card".
  const [activeConversationId, setActiveConversationId] = React.useState(null);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [historyList, setHistoryList] = React.useState([]);
  const [historyLoading, setHistoryLoading] = React.useState(false);
  // Mirrors the original NAVRYA chat-dock artifact exactly: a visual mic toggle only - this
  // app has no speech-to-text backend anywhere (Settings' aiVoiceModeLabel is a disabled,
  // "not available" control for the same reason), so listening never transcribes into `text`.
  const [listening, setListening] = React.useState(false);
  const fileInputRef = React.useRef(null);
  const rtl = i18n.direction() === 'rtl';
  const historyStore = window.TradeJournalAiChatHistoryStore;

  const models = React.useMemo(() => settingsStore.providerCatalog().map((p) => ({
    id: p.id, label: core.providerLabel(p.id), trait: p.trait, knockout: !!p.knockout
  })), []);

  // Keeps this dock and the AI Assistant screen's tab strip pointed at the same engine even
  // though they are two separate React roots (README: "one selection, two surfaces") - whichever
  // one changes the provider broadcasts it, both listen and re-sync their own local state.
  React.useEffect(() => {
    function onSettingsChanged(event) {
      const next = (event.detail && event.detail.provider) || settingsStore.activeProvider();
      setProviderId(next);
    }
    window.addEventListener('tradejournal:ai-settings-changed', onSettingsChanged);
    return () => window.removeEventListener('tradejournal:ai-settings-changed', onSettingsChanged);
  }, []);

  function onModelChange(nextProvider) {
    setProviderId(nextProvider);
    settingsStore.saveSettings({ provider: nextProvider });
  }

  function closePopover() { setPopover((p) => (p ? { ...p, open: false } : p)); }

  // New Chat: clears the visible thread and the server-conversation link - the next message
  // starts a brand-new conversation rather than appending to whatever was open before.
  function startNewChat() {
    setTranscript([]);
    setActiveConversationId(null);
    setPopover(null);
    setHistoryOpen(false);
  }

  async function toggleHistory() {
    if (historyOpen) { setHistoryOpen(false); return; }
    setHistoryOpen(true);
    if (!historyStore) return;
    setHistoryLoading(true);
    try {
      setHistoryList(await historyStore.listFor(providerId));
    } catch (_err) {
      setHistoryList([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  // Loads a past conversation's full message list back into the live dock - the next message
  // appends to this same server-side conversation instead of starting a new one.
  async function resumeConversation(id) {
    setHistoryOpen(false);
    if (!historyStore) return;
    try {
      const record = await historyStore.get(id);
      if (!record) return;
      const messages = record.messages || [];
      setTranscript(messages.slice(-24));
      setActiveConversationId(record.id);
      setPopover({ open: true, state: 'answer', messages, suggestions: [], activeProcessId: null });
    } catch (_err) { /* no-op - resuming is best-effort */ }
  }

  // Lets the AI Assistant screen's "Continue in dock"/"New conversation" actions drive this dock
  // from a separate React root, the same cross-root-sync convention
  // tradejournal:ai-settings-changed already establishes for provider selection.
  React.useEffect(() => {
    function onResume(event) {
      const detail = (event && event.detail) || {};
      if (detail.provider) onModelChange(detail.provider);
      if (detail.id) resumeConversation(detail.id); else startNewChat();
    }
    window.addEventListener('tradejournal:ai-resume-conversation', onResume);
    return () => window.removeEventListener('tradejournal:ai-resume-conversation', onResume);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(value) {
    setText('');
    setPopover((p) => ({ open: true, state: 'thinking', prompt: value, messages: p && p.messages }));
    setBusy(true);
    try {
      const result = await core.sendChat({ text: value, therapistMode, transcript, conversationId: activeConversationId });
      if (!result) { setBusy(false); return; }
      if (result.kind === 'safety') {
        // Mirrors the retired global-ai-dock.js exactly: the user turn is still recorded, but
        // no assistant turn exists to append when the safety gate stops the reply.
        setTranscript((t) => t.concat([{ role: 'user', content: value }]).slice(-24));
        const safetyNode = window.TradeJournalMentalHealthSafety
          ? window.TradeJournalMentalHealthSafety.renderSafetyCard(closePopover)
          : null;
        setPopover({ open: true, state: 'safety', prompt: value, safetyNode });
      } else {
        const nextTranscript = transcript.concat([{ role: 'user', content: value }, { role: 'assistant', content: result.reply || '' }]).slice(-24);
        setTranscript(nextTranscript);
        if (result.conversationId) setActiveConversationId(result.conversationId);
        setPopover({
          open: true, state: 'answer', messages: nextTranscript,
          suggestions: (result.suggestions || []).map((s, i) => ({ id: s.id || 'sugg-' + i, ...s })),
          activeProcessId: result.activeProcess ? result.activeProcess.id : null
        });
      }
    } catch (_err) {
      const nextTranscript = transcript.concat([{ role: 'user', content: value }, { role: 'assistant', content: i18n.t('aiDockError') }]).slice(-24);
      setTranscript(nextTranscript);
      setPopover({ open: true, state: 'answer', messages: nextTranscript });
    } finally {
      setBusy(false);
    }
  }

  function applySuggestion(item) {
    if (!popover || !popover.activeProcessId) return;
    core.applySuggestion(popover.activeProcessId, item.path, item.value, item.mode);
    setPopover((p) => (p ? { ...p, suggestions: p.suggestions.filter((s) => s !== item) } : p));
  }
  function discardSuggestion(item) {
    setPopover((p) => (p ? { ...p, suggestions: p.suggestions.filter((s) => s !== item) } : p));
  }

  function triggerAttach() { if (fileInputRef.current) fileInputRef.current.click(); }

  async function onFileChosen(event) {
    const file = (event.target.files || [])[0];
    event.target.value = '';
    if (!file || !/^image\//.test(file.type)) return;
    const dataUrl = await fileDataUrl(file);
    const contextMessage = text.trim();
    setPopover({ open: true, state: 'thinking', prompt: i18n.t('aiScreenshotAnalyzeAction'), thinkingLabel: i18n.t('aiScreenshotAnalyzeAction') });
    setBusy(true);
    try {
      const extraction = await core.analyzeScreenshot(dataUrl);
      setPopover({
        open: true, state: 'review', title: i18n.t('aiScreenshotReviewTitle'),
        reviewFields: reviewFields(extraction, tradeI18n), reviewEmptyLabel: i18n.t('aiScreenshotNoData'),
        extraction, contextMessage
      });
    } catch (_err) {
      setPopover({ open: true, state: 'answer', lines: [i18n.t('aiDockError')] });
    } finally {
      setBusy(false);
    }
  }

  function applyReview() {
    if (!popover || !popover.extraction) return;
    core.applyExtractionToWizard(popover.extraction, popover.contextMessage);
    closePopover();
  }

  const reviewActions = popover && popover.state === 'review' && popover.reviewFields && popover.reviewFields.length
    ? (
      <ActionRow>
        <MiniButton kind="apply" icon="notebook-pen" onClick={applyReview}>{i18n.t('aiScreenshotApply')}</MiniButton>
        <MiniButton kind="discard" icon="close" onClick={closePopover}>{i18n.t('aiScreenshotDiscard')}</MiniButton>
      </ActionRow>
    )
    : null;

  return (
    <div data-character={navryaCharacter} dir={rtl ? 'rtl' : 'ltr'}>
      <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={onFileChosen} />
      <ChatDock
        dir={rtl ? 'rtl' : 'ltr'}
        placeholder={i18n.t('aiDockPlaceholder')}
        listeningPlaceholder={i18n.t('aiDockListening')}
        sendLabel={i18n.t('aiDockSend')}
        voiceLabel={i18n.t('aiVoiceModeLabel')}
        micLabel={i18n.t('aiDockMic')}
        stopListeningLabel={i18n.t('aiDockStopListening')}
        listening={listening} onMic={() => setListening((v) => !v)}
        value={text} onValueChange={setText} onSubmit={submit} busy={busy}
        onAdd={triggerAttach} addLabel={i18n.t('aiDockAttach')}
        onNewChat={startNewChat} newChatLabel={i18n.t('aiDockNewChat')}
        onHistory={toggleHistory} historyLabel={i18n.t('aiDockHistory')} historyActive={historyOpen}
        onToggleTherapist={() => setTherapistMode((v) => !v)}
        therapistActive={therapistMode}
        therapistLabel={therapistMode ? i18n.t('aiDockTherapistOn') : i18n.t('aiDockTherapistOff')}
        models={models} model={providerId} onModelChange={onModelChange}
      >
        {historyOpen && (
          <ConversationHistoryDropdown
            i18n={i18n} loading={historyLoading} conversations={historyList}
            onPick={resumeConversation} onClose={() => setHistoryOpen(false)}
          />
        )}
        {popover && (
          <ChatResponsePopover
            open={popover.open} state={popover.state}
            title={popover.title || i18n.t('aiDockLauncherLabel')}
            prompt={popover.prompt} lines={popover.lines || []} messages={popover.messages}
            userLabel={i18n.t('aiDockYou')} assistantLabel={i18n.t('aiDockAssistant')}
            meta={popover.meta || []}
            thinkingLabel={popover.thinkingLabel}
            safetyNode={popover.safetyNode}
            suggestions={popover.suggestions || []}
            suggestionLabels={{ apply: i18n.t('aiSuggestionApply'), discard: i18n.t('aiSuggestionDiscard') }}
            onApplySuggestion={applySuggestion} onDiscardSuggestion={discardSuggestion}
            reviewFields={popover.reviewFields || []} reviewEmptyLabel={popover.reviewEmptyLabel}
            reviewActions={reviewActions}
            onClose={closePopover}
          />
        )}
      </ChatDock>
    </div>
  );
}

export function renderChatDock(container, navryaCharacter) {
  const i18n = window.TradeJournalAII18n;
  const core = window.TradeJournalChatDockCore;
  const settingsStore = window.TradeJournalAISettingsStore;
  const tradeI18n = window.TradeJournalTradeI18n;
  if (!i18n || !core || !settingsStore) return;
  createRoot(container).render(<ChatDockApp i18n={i18n} core={core} settingsStore={settingsStore} tradeI18n={tradeI18n} navryaCharacter={navryaCharacter} />);
}
