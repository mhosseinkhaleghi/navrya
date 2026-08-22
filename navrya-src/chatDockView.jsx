import React from 'react';
import { createRoot } from 'react-dom/client';
import { ChatDock } from '../public/pages/shared/navrya/components/assistant/ChatDock.jsx';
import { ChatResponsePopover, MiniButton, ActionRow } from '../public/pages/shared/navrya/components/assistant/ChatResponsePopover.jsx';
import { CompanionCard } from '../public/pages/shared/navrya/components/assistant/CompanionCard.jsx';
import { createVoiceSession, VOICE_STATES } from './aiVoiceRealtime.js';

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

function ChatDockApp({ i18n, core, settingsStore, tradeI18n, navryaCharacter, voiceText }) {
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
  // Journey G (AI Companion & Journey Orchestration): the live Companion card - re-read from
  // window.TradeJournalAICompanionOrchestrator.currentCard() (deterministic, zero-network) on
  // mount and on its own `tradejournal:companion-updated` event. Rendering itself is additionally
  // gated below (popover/historyOpen/therapistMode/voice all take precedence) - see
  // docs/ai/companion-orchestration.md for why this is a render-time gate rather than the
  // orchestrator trying to track those transient UI states itself.
  const [companionCard, setCompanionCard] = React.useState(null);
  // Journey G UX correction: the first-run welcome must never auto-pop just because the dock
  // mounted (item 1) - it (and, unaffected, nothing else) is now gated behind a real, explicit
  // "the user engaged with the dock" gesture: focusing the input, pressing Voice, or sending a
  // message. A regular 'step' guidance card is NOT gated by this - it keeps showing through the
  // pre-existing, cooldown-gated ai-companion-orchestrator.js mechanism (see the render gate
  // below and docs/ai/companion-orchestration.md's "Voice Companion opening" section).
  const [dockExplicitlyOpened, setDockExplicitlyOpened] = React.useState(false);
  // True only while NAVRYA is speaking its own proactive Voice Companion opening (item 7/9) - a
  // caller-level label layered on top of aiVoiceRealtime.js's own transport state (which stays a
  // pure connecting->assistant_speaking->listening machine with no Companion-specific concept of
  // its own - see that file's header comment). Used only to (a) let the CompanionCard render as a
  // synchronized visual aid during the opening specifically, never for the rest of a Voice
  // session, and (b) tests/diagnostics.
  const [companionOpeningActive, setCompanionOpeningActive] = React.useState(false);
  // Journey E (Realtime Voice): the Voice button drives a real OpenAI Realtime WebRTC session
  // (navrya-src/aiVoiceRealtime.js). ChatDock.jsx renders every one of these states distinctly
  // (see its own VOICE_STATE_ICON/VOICE_STATE_DOT/VoiceStatusPill) directly off voiceState - it
  // derives its own "is a session live" boolean internally rather than this file collapsing the
  // state for it.
  const [voiceState, setVoiceState] = React.useState(VOICE_STATES.IDLE);
  const [voiceMuted, setVoiceMuted] = React.useState(false);
  // Which localized error message to show - a denied microphone permission gets its own clearer
  // message (spec: "DENY -> clear localized error", not the same generic "something went wrong"
  // every other Voice failure mode falls back to).
  const [voicePermissionDenied, setVoicePermissionDenied] = React.useState(false);
  // Voice Mode console (ChatDock.jsx/VoiceConsole.jsx): the real, finalized text NAVRYA just
  // heard (shown during PROCESSING) and the real reply text it's about to speak (timed-revealed
  // during ASSISTANT_SPEAKING) - both set right where onVoiceTranscript already has them, never
  // fabricated/interim text (see aiVoiceRealtime.js's own "finalized transcript only" rule).
  const [voiceHeardText, setVoiceHeardText] = React.useState('');
  const [voiceReplyCaption, setVoiceReplyCaption] = React.useState('');
  const voiceRef = React.useRef(null);
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

  // Journey G: refresh the Companion card on mount and whenever the orchestrator recomputes -
  // never a poll (ai-companion-orchestrator.js only republishes on real product-state
  // CustomEvents). refreshCompanion() is deliberately cheap/synchronous (ai-journey-engine.js
  // makes zero network calls), so calling it eagerly here costs nothing.
  React.useEffect(() => {
    function refreshCompanion() {
      const orchestrator = window.TradeJournalAICompanionOrchestrator;
      setCompanionCard(orchestrator ? orchestrator.currentCard() : null);
    }
    refreshCompanion();
    window.addEventListener('tradejournal:companion-updated', refreshCompanion);
    return () => window.removeEventListener('tradejournal:companion-updated', refreshCompanion);
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

  // Latency pass, section 1/19/34: how long the reply actually took to reach the screen after
  // sendChat() resolved - chat-dock-core.js has no visibility into React's own commit/paint
  // timing, so this stays a small, explicit, best-effort stamp taken here instead. A
  // requestAnimationFrame after the state update (rather than measuring immediately after
  // setPopover() is called) is the closest approximation of "actually painted" available without
  // a ref-based DOM mutation observer - documented as an approximation, the same "crude proxy,
  // said so plainly" posture debugLastPackage()'s own approxTokens already uses.
  function markRenderTiming(sentAt) {
    if (typeof requestAnimationFrame !== 'function') return;
    requestAnimationFrame(() => {
      const ms = Math.round(((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - sentAt);
      if (core.recordRenderComplete) core.recordRenderComplete(ms);
    });
  }

  async function submit(value, options) {
    const source = (options && options.source) === 'voice' ? 'voice' : 'text';
    // Sending any message is unambiguously an explicit engagement with the dock (item 1/14) -
    // harmless to set unconditionally here even for a Voice-sourced turn, which already set it
    // itself the moment Voice was pressed (toggleVoice()).
    setDockExplicitlyOpened(true);
    setText('');
    setPopover((p) => ({ open: true, state: 'thinking', prompt: value, messages: p && p.messages }));
    setBusy(true);
    try {
      // Journey G, Item 1: a Companion "Explain" tap threads companionIntent:'explain' through so
      // chat-dock-core.js (a) never lets an unrelated registered process elsewhere on the page
      // hijack this one turn and (b) asks ai-journey-engine.js for a TEACHER-stance
      // companionContext - the question text itself (value) is a real, per-step localized prompt
      // (CompanionCard's own explainPrompt), never a synthetic "continue" message. explainStepId
      // is passed through only as debug metadata (chat-dock-core.js's debugLastTurn()).
      const result = await core.sendChat({
        text: value, therapistMode, transcript, conversationId: activeConversationId, source,
        companionIntent: options && options.companionIntent, explainStepId: options && options.explainStepId,
        // Journey G UX correction, item 10: set for exactly the one voice turn that immediately
        // follows a spoken Companion opening (see onVoiceTranscript below) - chat-dock-core.js's
        // own deterministic Start/Later/Explain classifier only ever runs when this is true.
        awaitingCompanionOpeningReply: options && options.awaitingCompanionOpeningReply
      });
      const renderStampAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      if (!result) { setBusy(false); return null; }
      if (result.kind === 'safety') {
        // Mirrors the retired global-ai-dock.js exactly: the user turn is still recorded, but
        // no assistant turn exists to append when the safety gate stops the reply.
        setTranscript((t) => t.concat([{ role: 'user', content: value }]).slice(-24));
        const safetyNode = window.TradeJournalMentalHealthSafety
          ? window.TradeJournalMentalHealthSafety.renderSafetyCard(closePopover)
          : null;
        setPopover({ open: true, state: 'safety', prompt: value, safetyNode });
        return { kind: 'safety', reply: '' };
      } else {
        const nextTranscript = transcript.concat([{ role: 'user', content: value }, { role: 'assistant', content: result.reply || '' }]).slice(-24);
        setTranscript(nextTranscript);
        if (result.conversationId) setActiveConversationId(result.conversationId);
        setPopover({
          open: true, state: 'answer', messages: nextTranscript,
          suggestions: (result.suggestions || []).map((s, i) => ({ id: s.id || 'sugg-' + i, ...s })),
          activeProcessId: result.activeProcess ? result.activeProcess.id : null,
          // result.kind === 'workflow' (an AI-discovered/in-progress action, e.g. session.create):
          // fields it already applied live are shown as plain meta chips - reusing the popover's
          // existing meta row rather than a new dedicated "AI action progress" component.
          meta: result.workflow ? Object.keys(result.workflow.known || {}).map((path) => `${path}: ${result.workflow.known[path]}`) : []
        });
        markRenderTiming(renderStampAt);
        // Returned so a voice-originated turn (see the Realtime wiring below) can speak back a
        // reply - voiceReply (a deliberately shorter, TTS-friendly rendering the server produces
        // only for source:'voice' turns) is preferred over the full written reply so a long
        // written Q&A answer isn't read back verbatim; falls back to `reply` when absent (e.g.
        // the therapist/proactive-resolved paths, whose replies are already short).
        return { kind: result.kind || 'assistant', reply: result.reply || '', voiceReply: result.voiceReply || result.reply || '' };
      }
    } catch (_err) {
      const nextTranscript = transcript.concat([{ role: 'user', content: value }, { role: 'assistant', content: i18n.t('aiDockError') }]).slice(-24);
      setTranscript(nextTranscript);
      setPopover({ open: true, state: 'answer', messages: nextTranscript });
      return { kind: 'error', reply: i18n.t('aiDockError') };
    } finally {
      setBusy(false);
    }
  }

  // Always points at the current render's `submit` closure (itself closing over the current
  // transcript/activeConversationId/therapistMode) - the voice session below is created once
  // and must never call a stale copy of submit() from the render it was constructed in.
  const submitRef = React.useRef(submit);
  submitRef.current = submit;

  async function fetchRealtimeSession(language) {
    const settingsForOpenAI = settingsStore.getKey('openai');
    const response = await fetch('/api/ai/realtime/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: settingsForOpenAI, language })
    });
    if (!response.ok) throw new Error('VOICE_SESSION_REQUEST_FAILED');
    return response.json();
  }

  // A finalized voice turn goes through the exact same submit() a typed message does - one
  // brain, not two conversations. Once NAVRYA's own deterministic reply comes back, the
  // Realtime session is told to speak that exact text (never its own improvised answer).
  //
  // Found via real E1 multi-turn browser testing: aiVoiceRealtime.js's transcription-completed
  // handler fires this function once per finalized transcript with no awareness of whether a
  // PRIOR voice turn is still in flight. Two finalized transcripts arriving close together (a
  // fast talker, or a queued backlog after a slow reply) each independently called submit() and
  // both raced core.sendChat()'s own read of "is there already an open form/workflow" before
  // either had finished starting one - producing duplicate session.create action turns instead of
  // the second turn being recognized as filling the form the first one had just opened. Text
  // input never had this problem (one input field, one submit at a time); voice needed the same
  // guarantee explicitly. voiceTurnQueue serializes every voice-originated submit()+speak() cycle
  // strictly one at a time, in arrival order - "one utterance -> one Copilot turn", never two
  // turns processed concurrently.
  const voiceTurnQueue = React.useRef(Promise.resolve());
  // Latency pass, section 21/34: final transcript -> useful reply, and final transcript -> the
  // moment NAVRYA asks the Realtime session to speak it - the two numbers this layer can actually
  // observe. transcriptToSpeakRequestedMs is NOT "audio actually started" - the real first-audio-
  // byte moment happens inside aiVoiceRealtime.js's own speak()/response.create round trip, not
  // observable from here without deeper transport instrumentation (out of scope for this pass -
  // see docs/ai/latency-testing.md). Kept as its own small object, not folded into
  // chat-dock-core.js's debugLastLatency() (which knows nothing about the voice transport), since
  // it spans two modules this file already bridges.
  // Journey G UX correction, item 10: true for exactly the one turn right after a Companion
  // opening was spoken - read-and-cleared (not a React state, so it can never race a re-render)
  // the instant the next transcript arrives, so only that ONE reply is ever treated specially,
  // regardless of how it's classified (start/later/explain/ambiguous).
  const awaitingCompanionOpeningReplyRef = React.useRef(false);
  let lastVoiceLatency = null;
  function onVoiceTranscript(transcriptText) {
    setVoiceHeardText(transcriptText);
    const wasAwaitingCompanionOpeningReply = awaitingCompanionOpeningReplyRef.current;
    awaitingCompanionOpeningReplyRef.current = false;
    const transcriptAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    voiceTurnQueue.current = voiceTurnQueue.current
      .catch(() => {})
      .then(async () => {
        const result = await submitRef.current(transcriptText, { source: 'voice', awaitingCompanionOpeningReply: wasAwaitingCompanionOpeningReply });
        const replyAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const rawToSpeak = result && (result.voiceReply || result.reply);
        // Persian Voice Quality gate: a final, deterministic, voice-ONLY pass (no model call, no
        // network - see ai-voice-text.js's own header comment) applied uniformly to every spoken
        // turn regardless of source (a model-generated voiceReply, a Journey C proactive-safety
        // message, or one of chat-dock-core.js's own zero-network acknowledgements) - strips any
        // markdown that slipped past the model's own "plain text" instruction, and (Persian only,
        // for now - section 32/33: no EN/AR/ES regression) spells out the small closed set of
        // NAVRYA-owned numeric forms (timeframes, whole/half/quarter percents, whole-number
        // prices) into natural spoken words. The CAPTION shown on screen stays the raw text - only
        // what is actually spoken changes, matching section 12's "never make the written UI
        // colloquial."
        const toSpeak = rawToSpeak && voiceText ? voiceText.toSpokenText(rawToSpeak, i18n.language()) : rawToSpeak;
        setVoiceReplyCaption(rawToSpeak || '');
        lastVoiceLatency = { transcriptToReplyMs: Math.round(replyAt - transcriptAt), transcriptToSpeakRequestedMs: null };
        // Awaited so the queue doesn't move on to the next turn until this one has actually
        // finished being spoken (see aiVoiceRealtime.js's speak() for why that matters).
        if (toSpeak && voiceRef.current) {
          const speakCalledAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
          lastVoiceLatency.transcriptToSpeakRequestedMs = Math.round(speakCalledAt - transcriptAt);
          window.TradeJournalChatDockVoiceLatency = lastVoiceLatency;
          await voiceRef.current.speak(toSpeak);
        } else {
          window.TradeJournalChatDockVoiceLatency = lastVoiceLatency;
        }
      });
    return voiceTurnQueue.current;
  }

  // Journey G UX correction, items 2-9: the deterministic, zero-model-call Voice Companion
  // opening. Architecture (unchanged elsewhere): Journey Engine supplies real facts -> Companion
  // Orchestrator decides whether/what to say -> this function hands the EXACT text to the
  // existing speak() mechanism -> the Realtime session speaks it verbatim, same as any other
  // reply (docs/ai/companion-orchestration.md). Called only once per real connection, only from
  // the voiceState effect below, itself only ever reachable after the user's own explicit Voice
  // press (item 6's consent boundary) - never from page load/refresh/navigation/login.
  const openingDeliveredForConnectionRef = React.useRef(false);
  function deliverCompanionOpening() {
    if (openingDeliveredForConnectionRef.current) return;
    openingDeliveredForConnectionRef.current = true;
    // Item 16: Therapist Mode suppresses a proactive Journey opening - this is transient UI state
    // the orchestrator has no visibility into, so it is checked here, the same "product-state
    // safety lives in the engine, transient-UI safety lives in the component" split the Text
    // CompanionCard's own render gate already uses. Destructive/proactive-confirmation/workflow
    // safety is checked inside voiceOpening() itself (ai-journey-engine.js's
    // voiceOpeningContext()), the exact same gate nextBestStep() uses.
    if (therapistMode) return;
    const orchestrator = window.TradeJournalAICompanionOrchestrator;
    if (!orchestrator || typeof orchestrator.voiceOpening !== 'function') return;
    // Captured BEFORE voiceOpening() runs: for a genuinely fresh user, voiceOpening() itself marks
    // the walkthrough seen as a side effect of deciding to speak it (so it never repeats on the
    // next Voice press - item 13) - which means currentCard() would no longer return the welcome
    // card by the time the speak() promise below actually resolves. Capturing it first is what
    // lets the visual card (item 9) still show the real Start/What is NAVRYA?/Later card
    // synchronized with the spoken greeting.
    var preOpeningCard = orchestrator.currentCard();
    var opening = orchestrator.voiceOpening(); // zero model calls - real Journey facts only
    if (!opening || !opening.text) return; // safety blocked it, or nothing true to say - stay silent, never forced
    // Routed through the SAME voiceTurnQueue every real turn already serializes through (this
    // function only ever runs before any user turn has arrived, but a fast talker can still
    // barge in the instant speak() starts - see aiVoiceRealtime.js's own TRANSPORT_SPEECH_STARTED
    // handling, which already interrupts ANY ASSISTANT_SPEAKING playback, this opening included,
    // via the existing barge-in path, no new code needed there). Serializing here is what stops
    // that interrupting turn's own eventual speak() call from overlapping this one's still-
    // resolving promise (found necessary for the identical reason documented on voiceTurnQueue's
    // own declaration above).
    voiceTurnQueue.current = voiceTurnQueue.current.catch(() => {}).then(async function () {
      setCompanionCard(opening.kind === 'freshWelcome' && preOpeningCard ? preOpeningCard : orchestrator.currentCard());
      setCompanionOpeningActive(true);
      var toSpeak = voiceText ? voiceText.toSpokenText(opening.text, i18n.language()) : opening.text;
      setVoiceReplyCaption(opening.text);
      // The very next finalized transcript is a reply to THIS opening - see onVoiceTranscript's
      // own read-and-clear of this ref.
      awaitingCompanionOpeningReplyRef.current = true;
      if (voiceRef.current) await voiceRef.current.speak(toSpeak);
      setCompanionOpeningActive(false);
    });
    return voiceTurnQueue.current;
  }

  React.useEffect(() => {
    voiceRef.current = createVoiceSession({
      language: i18n.language(),
      fetchSession: fetchRealtimeSession,
      onStateChange: setVoiceState,
      onFinalTranscript: onVoiceTranscript,
      onMuteChange: setVoiceMuted,
      // A denied getUserMedia prompt reports stage:'permission' (see aiVoiceRealtime.js's
      // connect()) - every other failure mode (session/connect/interrupt/speak) falls back to the
      // generic Voice error message instead.
      onError: (detail) => {
        setVoicePermissionDenied(!!(detail && detail.stage === 'permission'));
        setVoiceState(VOICE_STATES.ERROR);
      }
    });
    return () => { if (voiceRef.current) voiceRef.current.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Journey G UX correction, item 7: the real trigger point for the Voice Companion opening -
  // aiVoiceRealtime.js's own connect() (a pure transport, untouched - see that file's header
  // comment) already transitions CONNECTING -> LISTENING itself the instant session.connect()
  // resolves; the FIRST time that specific transition is observed for a connection is the one,
  // real "the session just became ready, nothing has been said yet" moment. Every LATER
  // CONNECTING->LISTENING-shaped transition within the same connection (there isn't one - Voice
  // only reaches CONNECTING once per connect() call) or ordinary USER_SPEAKING->LISTENING/
  // ASSISTANT_SPEAKING->LISTENING transitions during a real conversation are excluded simply by
  // openingDeliveredForConnectionRef already being set, never by watching `previous` for those.
  const previousVoiceStateRef = React.useRef(VOICE_STATES.IDLE);
  React.useEffect(() => {
    const previous = previousVoiceStateRef.current;
    previousVoiceStateRef.current = voiceState;
    if (voiceState === VOICE_STATES.LISTENING && previous === VOICE_STATES.CONNECTING) deliverCompanionOpening();
    // Reset for the NEXT connect() - disconnecting (a real disconnect, or the ERROR state a failed
    // connect/session lands in) must not leave a stale "already delivered" flag that would
    // silently skip the opening on a later, genuinely new connection.
    if (voiceState === VOICE_STATES.IDLE || voiceState === VOICE_STATES.ERROR) openingDeliveredForConnectionRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceState]);

  function toggleVoice() {
    if (!voiceRef.current) return;
    const current = voiceRef.current.state();
    if (current === VOICE_STATES.IDLE || current === VOICE_STATES.ERROR) {
      // Pressing Voice is itself an explicit "open the dock" gesture (item 1/6) - the consent
      // boundary for everything that follows, spoken opening included.
      setDockExplicitlyOpened(true);
      setVoicePermissionDenied(false);
      // i18n.language() reads document.documentElement.lang live (see ai-i18n.js) - it has no
      // change event, so the adapter's own language is re-synced right here, immediately before
      // every connect(), rather than through a React effect keyed on the i18n object (which never
      // changes reference and would silently miss a language switch made between mounting the
      // dock and the user actually pressing the mic button).
      voiceRef.current.setLanguage(i18n.language());
      voiceRef.current.connect().catch(() => {});
    } else {
      voiceRef.current.disconnect();
    }
  }

  function toggleVoiceMute() {
    if (!voiceRef.current) return;
    voiceRef.current.mute(!voiceRef.current.isMuted());
  }

  // VoiceConsole's centre pill button - real only during ASSISTANT_SPEAKING (barge-in), the one
  // live phase with an actual transport action to call.
  function interruptVoice() {
    if (!voiceRef.current) return;
    voiceRef.current.interrupt();
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

  // Journey G: Companion card actions. Continue is fully deterministic (§18) - it never goes
  // through the model, it calls straight into the step's own real executor
  // (ai-journey-steps.js/character-app.jsx). Explain is the one action that DOES go through the
  // normal chat pipeline, in TEACHER stance, using the step's own real localized question.
  const companionOrchestrator = window.TradeJournalAICompanionOrchestrator;
  function companionContinue() { if (companionOrchestrator && companionCard) companionOrchestrator.continueStep(companionCard.id); }
  function companionExplain() { if (companionCard) submit(companionCard.explainPrompt, { companionIntent: 'explain', explainStepId: companionCard.id }); }
  function companionLater() { if (companionOrchestrator && companionCard) companionOrchestrator.laterStep(companionCard.id); }
  function companionSkip() { if (companionOrchestrator && companionCard) companionOrchestrator.skipStep(companionCard.id); }
  function welcomeStart() { if (companionOrchestrator) companionOrchestrator.startWalkthrough(); }
  function welcomeWhatIs() {
    if (companionOrchestrator) companionOrchestrator.startWalkthrough();
    submit(i18n.t('companionWelcomeWhatIsNavrya'), { companionIntent: 'explain', explainStepId: 'orientation' });
  }
  function welcomeLater() { if (companionOrchestrator) companionOrchestrator.dismissWelcomeLater(); }
  // Never shown over a reply/history/Therapist Mode - see docs/ai/companion-orchestration.md's
  // render-time gate. Journey G UX correction, items 1/9: the WELCOME variant specifically also
  // requires dockExplicitlyOpened (never auto-pops on ordinary page load - see that state's own
  // declaration above); a real 'step' card is unaffected, still governed only by the pre-existing
  // cooldown-gated orchestrator mechanism. Voice no longer unconditionally hides the card - it may
  // render as a synchronized visual aid specifically while companionOpeningActive is true (the
  // Voice Companion opening), and stays hidden for the rest of an ordinary Voice session exactly
  // as before.
  const companionCardAllowed = companionCard && (companionCard.kind !== 'welcome' || dockExplicitlyOpened);
  const showCompanionCard = !!companionCardAllowed && !popover && !historyOpen && !therapistMode &&
    (voiceState === VOICE_STATES.IDLE || companionOpeningActive);

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
        sendLabel={i18n.t('aiDockSend')}
        voiceState={voiceState} voiceMuted={voiceMuted} voicePermissionDenied={voicePermissionDenied}
        onVoiceToggle={toggleVoice} onVoiceMuteToggle={toggleVoiceMute} onVoiceInterrupt={interruptVoice}
        voiceErrorLabel={voicePermissionDenied ? i18n.t('voiceDockErrorPermissionDenied') : i18n.t('voiceDockError')}
        getVoiceMediaStream={() => voiceRef.current && voiceRef.current.getMediaStream()}
        voiceHeardText={voiceHeardText} voiceReplyCaption={voiceReplyCaption}
        voiceLabels={{
          start: i18n.t('voiceDockStart'), stop: i18n.t('voiceDockStop'),
          requestingPermission: i18n.t('voiceDockRequestingPermission'), connecting: i18n.t('voiceDockConnecting'),
          listening: i18n.t('voiceDockListening'), userSpeaking: i18n.t('voiceDockUserSpeaking'),
          processing: i18n.t('voiceDockProcessing'), speaking: i18n.t('voiceDockSpeaking'),
          reconnecting: i18n.t('voiceDockReconnecting'), error: i18n.t('voiceDockError'),
          mute: i18n.t('voiceDockMute'), unmute: i18n.t('voiceDockUnmute'), muted: i18n.t('voiceDockMuted'),
          analysing: i18n.t('voiceConsoleAnalysing'),
          captionConnecting: i18n.t('voiceConsoleCaptionConnecting'), captionListening: i18n.t('voiceConsoleCaptionListening'),
          captionUserSpeaking: i18n.t('voiceConsoleCaptionUserSpeaking'), captionProcessing: i18n.t('voiceConsoleCaptionProcessing'),
          captionSpeaking: i18n.t('voiceConsoleCaptionSpeaking'), captionMuted: i18n.t('voiceConsoleCaptionMuted'),
          captionDenied: i18n.t('voiceConsoleCaptionDenied'), listeningPlaceholder: i18n.t('voiceConsoleListeningPlaceholder'),
          heardLabel: i18n.t('voiceConsoleHeardLabel'), replyLabel: i18n.t('voiceConsoleReplyLabel'),
          type: i18n.t('voiceConsoleType'), stopReply: i18n.t('voiceConsoleStopReply'),
          captionsOn: i18n.t('voiceConsoleCaptionsOn'), captionsOff: i18n.t('voiceConsoleCaptionsOff'),
          minimize: i18n.t('voiceConsoleMinimize'), expand: i18n.t('voiceConsoleExpand'), close: i18n.t('voiceConsoleClose'),
          deniedTitle: i18n.t('voiceConsoleDeniedTitle'), deniedBody: i18n.t('voiceConsoleDeniedBody'), retry: i18n.t('voiceConsoleRetry')
        }}
        value={text} onValueChange={setText} onSubmit={submit} busy={busy}
        onAdd={triggerAttach} addLabel={i18n.t('aiDockAttach')}
        onNewChat={startNewChat} newChatLabel={i18n.t('aiDockNewChat')}
        onHistory={toggleHistory} historyLabel={i18n.t('aiDockHistory')} historyActive={historyOpen}
        onToggleTherapist={() => setTherapistMode((v) => !v)}
        therapistActive={therapistMode}
        therapistLabel={therapistMode ? i18n.t('aiDockTherapistOn') : i18n.t('aiDockTherapistOff')}
        models={models} model={providerId} onModelChange={onModelChange}
        onInputFocus={() => setDockExplicitlyOpened(true)}
      >
        {historyOpen && (
          <ConversationHistoryDropdown
            i18n={i18n} loading={historyLoading} conversations={historyList}
            onPick={resumeConversation} onClose={() => setHistoryOpen(false)}
          />
        )}
        {showCompanionCard && (
          <CompanionCard
            card={companionCard} i18n={i18n}
            onContinue={companionContinue} onExplain={companionExplain} onLater={companionLater} onSkip={companionSkip}
            onStart={welcomeStart} onWhatIs={welcomeWhatIs} onWelcomeLater={welcomeLater}
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
  // Persian Voice Quality gate: purely additive/optional (see ai-voice-text.js) - a page that
  // hasn't loaded it yet keeps today's exact behavior (onVoiceTranscript's own `voiceText &&`
  // guard falls back to speaking the model's/deterministic path's own text completely unchanged).
  const voiceText = window.TradeJournalAIVoiceText;
  if (!i18n || !core || !settingsStore) return;
  createRoot(container).render(<ChatDockApp i18n={i18n} core={core} settingsStore={settingsStore} tradeI18n={tradeI18n} navryaCharacter={navryaCharacter} voiceText={voiceText} />);
}
