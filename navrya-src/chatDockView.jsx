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

function ChatDockApp({ i18n, core, settingsStore, tradeI18n, navryaCharacter }) {
  const [text, setText] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [providerId, setProviderId] = React.useState(settingsStore.activeProvider());
  // Re-affirmed fresh on every page load from the saved default - never silently sticky across
  // navigations (A6: the mode must always be visibly true to what's on screen).
  const [therapistMode, setTherapistMode] = React.useState(() => !!settingsStore.settings().therapistModeDefault);
  const [transcript, setTranscript] = React.useState([]);
  const [popover, setPopover] = React.useState(null);
  // Mirrors the original NAVRYA chat-dock artifact exactly: a visual mic toggle only - this
  // app has no speech-to-text backend anywhere (Settings' aiVoiceModeLabel is a disabled,
  // "not available" control for the same reason), so listening never transcribes into `text`.
  const [listening, setListening] = React.useState(false);
  const fileInputRef = React.useRef(null);
  const rtl = i18n.direction() === 'rtl';

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

  async function submit(value) {
    setText('');
    setPopover({ open: true, state: 'thinking', prompt: value });
    setBusy(true);
    try {
      const result = await core.sendChat({ text: value, therapistMode, transcript });
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
        setTranscript((t) => t.concat([{ role: 'user', content: value }, { role: 'assistant', content: result.reply || '' }]).slice(-24));
        setPopover({
          open: true, state: 'answer', prompt: value, lines: [result.reply],
          suggestions: (result.suggestions || []).map((s, i) => ({ id: s.id || 'sugg-' + i, ...s })),
          activeProcessId: result.activeProcess ? result.activeProcess.id : null
        });
      }
    } catch (_err) {
      setTranscript((t) => t.concat([{ role: 'user', content: value }, { role: 'assistant', content: i18n.t('aiDockError') }]).slice(-24));
      setPopover({ open: true, state: 'answer', prompt: value, lines: [i18n.t('aiDockError')] });
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
        onToggleTherapist={() => setTherapistMode((v) => !v)}
        therapistActive={therapistMode}
        therapistLabel={therapistMode ? i18n.t('aiDockTherapistOn') : i18n.t('aiDockTherapistOff')}
        models={models} model={providerId} onModelChange={onModelChange}
      >
        {popover && (
          <ChatResponsePopover
            open={popover.open} state={popover.state}
            title={popover.title || i18n.t('aiDockLauncherLabel')}
            prompt={popover.prompt} lines={popover.lines || []} meta={popover.meta || []}
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
