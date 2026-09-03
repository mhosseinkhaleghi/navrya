import React from 'react';
import { createRoot } from 'react-dom/client';
import { ChatDock } from '../public/pages/shared/navrya/components/assistant/ChatDock.jsx';
import { ChatResponsePopover, MiniButton, ActionRow } from '../public/pages/shared/navrya/components/assistant/ChatResponsePopover.jsx';
import { CompanionCard } from '../public/pages/shared/navrya/components/assistant/CompanionCard.jsx';
import { createVoiceSession, VOICE_STATES } from './aiVoiceRealtime.js';

function fieldLabel(tradeI18n, key) { return tradeI18n ? tradeI18n.t(key) : key; }
function fieldNumber(tradeI18n, value) { return tradeI18n ? tradeI18n.number(value, { maximumFractionDigits: 4 }) : String(value); }

// fix/voice-mode-hosted-connection (Phase 3): maps aiVoiceRealtime.js's sanitized connect()
// failure stage to a localized i18n key. Every key here already exists in all four languages
// (public/pages/shared/ai-i18n.js) - a stage this map doesn't recognize (or no stage at all)
// falls back to the pre-existing generic 'voiceDockError' message, unchanged behavior for every
// non-connection failure mode (reconnect exhaustion, an in-call session error, interrupt/speak).
const VOICE_ERROR_STAGE_I18N_KEY = {
  microphone_permission: 'voiceDockErrorPermissionDenied',
  session_auth: 'voiceDockErrorSessionAuth',
  session_quota: 'voiceDockErrorSessionQuota',
  key_missing: 'voiceDockErrorKeyMissing',
  key_rejected: 'voiceDockErrorKeyRejected',
  model_unavailable: 'voiceDockErrorModelUnavailable',
  token_mint_timeout: 'voiceDockErrorMintTimeout',
  sdp_exchange: 'voiceDockErrorSdpExchange',
  sdp_relay_timeout: 'voiceDockErrorSdpTimeout',
  ice_connection: 'voiceDockErrorIceConnection',
  data_channel: 'voiceDockErrorDataChannel',
  session_ack: 'voiceDockErrorSessionAck'
};
function voiceErrorMessageForStage(i18nApi, stage) {
  const key = VOICE_ERROR_STAGE_I18N_KEY[stage] || 'voiceDockError';
  return i18nApi.t(key);
}

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
        // NAVRYA chat dock redesign: matches ChatResponsePopover.jsx's own new panel treatment -
        // this dropdown, the Companion card, and the reply panel all render into the same ChatDock
        // `children` slot and must read as one consistent family.
        borderRadius: 'var(--radius-14)', border: '1px solid var(--border-gold-strong)',
        background: 'linear-gradient(180deg,rgba(17,27,28,.97),rgba(7,11,15,.985))',
        boxShadow: 'var(--shadow-panel),var(--glow-soft)',
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
  // fix/voice-mode-hosted-connection (Phase 3): the sanitized stage aiVoiceRealtime.js's connect()
  // classified the most recent failure into (see that file's classifyMintFailureStage()/
  // classifySdpFailureStage()) - never a raw error message, credential, or upstream detail, only
  // one of the fixed stage labels. `voicePermissionDenied` is derived from it (kept as its own
  // boolean since ChatDock.jsx/VoiceConsole.jsx already branch on it for more than just the
  // message - e.g. a "grant access" affordance) rather than replaced outright.
  const [voiceErrorStage, setVoiceErrorStage] = React.useState(null);
  const voicePermissionDenied = voiceErrorStage === 'microphone_permission';
  // fix/voice-mode-turn-ux (Part D): true only for the PROCESSING stretch caused by the user's own
  // "End message" click (finishUserTurn()), not an ordinary VAD-driven turn reaching PROCESSING the
  // normal way - purely a label distinction ("Ending message…" vs the generic "Processing…"), the
  // button's own disabled-processing rendering is identical either way. Cleared the moment voiceState
  // leaves PROCESSING for any reason (a real transcript arriving, the manual-finish timeout falling
  // back to LISTENING, or a fatal error) - see the previousVoiceStateRef effect below.
  const [voiceManualFinishPending, setVoiceManualFinishPending] = React.useState(false);
  // Voice Mode console (ChatDock.jsx/VoiceConsole.jsx): the real, finalized text NAVRYA just
  // heard (shown during PROCESSING) and the real reply text it's about to speak (timed-revealed
  // during ASSISTANT_SPEAKING) - both set right where onVoiceTranscript already has them, never
  // fabricated/interim text (see aiVoiceRealtime.js's own "finalized transcript only" rule).
  const [voiceHeardText, setVoiceHeardText] = React.useState('');
  const [voiceReplyCaption, setVoiceReplyCaption] = React.useState('');
  const voiceRef = React.useRef(null);
  // Voice Mode performance pass (feature/voice-mode-performance): conversationEpoch is bumped by
  // startNewChat()/resumeConversation() - anything voice-related that captured an OLDER epoch
  // (a still-in-flight turn's own business result, an already-queued-but-not-yet-spoken reply) is
  // discarded rather than mutating a conversation the user has since moved on from.
  // turnCoordinatorRef/playbackControllerRef are the split successors of the old voiceTurnQueue -
  // see ai-voice-turn-coordinator.js/ai-voice-playback-controller.js for why the split exists: the
  // OLD queue chained submit() (business/inference) and speak() (playback) into ONE serial
  // promise per turn, so a second already-finalized transcript's own submit() could not even
  // START until the FIRST turn's speech had finished playing. TurnCoordinator now serializes
  // submit() calls only against each other; PlaybackController serializes speak() calls only
  // against each other; chatDockView.jsx connects the two by handing a finished turn's text to
  // PlaybackController.enqueue() - a fire-and-forget call TurnCoordinator never awaits.
  const conversationEpochRef = React.useRef(0);
  const turnCoordinatorRef = React.useRef(null);
  const playbackControllerRef = React.useRef(null);
  const fileInputRef = React.useRef(null);
  const rtl = i18n.direction() === 'rtl';
  const historyStore = window.TradeJournalAiChatHistoryStore;

  const models = React.useMemo(() => settingsStore.visibleProviderCatalog(providerId).map((p) => ({
    id: p.id, label: core.providerLabel(p.id), trait: p.trait, knockout: !!p.knockout
  })), [providerId]);
  // NAVRYA chat dock redesign: the redesigned reply panel's header shows a real avatar/label for
  // the engine that answered - the same "current model" ChatDock.jsx's own pill already resolves
  // from `models`/`providerId`, recomputed the same way rather than a second source of truth.
  const activeModel = models.find((m) => m.id === providerId) || models[0] || null;

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
  // starts a brand-new conversation rather than appending to whatever was open before. Also
  // releases any workflow/confirmation still in flight from the conversation just left behind
  // (core.resetConversationState()) - otherwise the very first message typed into this "new"
  // conversation could silently continue filling or confirming state that belongs to the old one.
  //
  // Voice Mode performance pass: also bumps conversationEpochRef and invalidates the playback
  // queue - a voice turn whose own submit() is still in flight (TurnCoordinator checks the epoch
  // again once it resolves - see ai-voice-turn-coordinator.js) or a reply already queued to be
  // spoken (PlaybackController.invalidate() drops it and interrupts anything playing right now -
  // see ai-voice-playback-controller.js) must never reach the new conversation.
  function startNewChat() {
    setTranscript([]);
    setActiveConversationId(null);
    setPopover(null);
    setHistoryOpen(false);
    if (core && typeof core.resetConversationState === 'function') core.resetConversationState();
    conversationEpochRef.current += 1;
    if (playbackControllerRef.current) playbackControllerRef.current.invalidate();
    // fix/voice-mode-turn-ux: New Chat is a "the user has moved on" moment for the voice-specific
    // caption (Part C req 7) and any manual "End message" commit still awaiting its server ack
    // (Part D req 14) exactly the same way it already is for the playback queue above.
    setVoiceReplyCaption('');
    if (voiceRef.current) voiceRef.current.cancelManualFinish();
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
  // appends to this same server-side conversation instead of starting a new one. Voice Mode
  // performance pass: switching to a different conversation is the same kind of "moved on" event
  // startNewChat() guards against - bumps the epoch and invalidates queued/in-flight voice work
  // the same way.
  async function resumeConversation(id) {
    setHistoryOpen(false);
    if (!historyStore) return;
    try {
      const record = await historyStore.get(id);
      if (!record) return;
      const messages = record.messages || [];
      conversationEpochRef.current += 1;
      if (playbackControllerRef.current) playbackControllerRef.current.invalidate();
      setVoiceReplyCaption('');
      if (voiceRef.current) voiceRef.current.cancelManualFinish();
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
    // NAVRYA chat dock redesign: real per-turn timestamp/latency for the message-grid's timestamp
    // row (never fabricated - a conversation resumed from server history simply has no `at` on
    // its messages, and the redesigned popover renders no timestamp for those, rather than a
    // guessed one - see ChatResponsePopover.jsx's own comment).
    const sentAt = Date.now();
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
        setTranscript((t) => t.concat([{ role: 'user', content: value, at: sentAt }]).slice(-24));
        const safetyNode = window.TradeJournalMentalHealthSafety
          ? window.TradeJournalMentalHealthSafety.renderSafetyCard(closePopover)
          : null;
        setPopover({ open: true, state: 'safety', prompt: value, safetyNode });
        return { kind: 'safety', reply: '' };
      } else {
        const nextTranscript = transcript.concat([
          { role: 'user', content: value, at: sentAt },
          { role: 'assistant', content: result.reply || '', at: Date.now(), latencyMs: Date.now() - sentAt }
        ]).slice(-24);
        setTranscript(nextTranscript);
        if (result.conversationId) setActiveConversationId(result.conversationId);
        setPopover({
          open: true, state: 'answer', messages: nextTranscript,
          suggestions: (result.suggestions || []).map((s, i) => ({ id: s.id || 'sugg-' + i, ...s })),
          activeProcessId: result.activeProcess ? result.activeProcess.id : null,
          // result.kind === 'workflow' (an AI-discovered/in-progress action, e.g. session.create):
          // fields it already applied live are shown as plain meta chips - reusing the popover's
          // existing meta row rather than a new dedicated "AI action progress" component.
          meta: result.workflow ? Object.keys(result.workflow.known || {}).map((path) => `${path}: ${result.workflow.known[path]}`) : [],
          // NAVRYA chat dock redesign: real "a Journey C proactive rule was applied to this reply"
          // banner - only ever true when chat-dock-core.js genuinely resolved a proactive
          // confirmation this turn (ai-proactive-engine.js's own real ruleId), never fabricated.
          ruleApplied: result.kind === 'proactive-resolved'
        });
        markRenderTiming(renderStampAt);
        // Returned so a voice-originated turn (see the Realtime wiring below) can speak back a
        // reply - voiceReply (a deliberately shorter, TTS-friendly rendering the server produces
        // only for source:'voice' turns) is preferred over the full written reply so a long
        // written Q&A answer isn't read back verbatim; falls back to `reply` when absent (e.g.
        // the therapist/proactive-resolved paths, whose replies are already short).
        //
        // Journey H2, Gate 3: audioUrl/audioMimeType (null unless a matched static scenario has
        // approved, hash-current published audio - see chat-dock-core.js/ai-conversation-
        // router.js) are threaded straight through unchanged. Computed unconditionally regardless
        // of `source` - the onResult wiring below is what decides whether to actually USE it (via
        // ai-voice-output-resolver.js), never this function; a typed/text turn simply never reads
        // these fields at all (see submit()'s only two callers: onSend, for text, never looks at
        // them, and onVoiceTranscript's TurnCoordinator, below).
        return {
          kind: result.kind || 'assistant', reply: result.reply || '', voiceReply: result.voiceReply || result.reply || '',
          audioUrl: result.audioUrl || null, audioMimeType: result.audioMimeType || null
        };
      }
    } catch (_err) {
      const nextTranscript = transcript.concat([{ role: 'user', content: value, at: sentAt }, { role: 'assistant', content: i18n.t('aiDockError'), at: Date.now() }]).slice(-24);
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
  // Dynamic VAD (Voice Mode performance pass): read fresh inside the empty-deps mount effect's
  // onResult callback below, the same reason submitRef exists - Therapist Mode can be toggled at
  // any time, and the closure created once at mount must never see a stale value.
  const therapistModeRef = React.useRef(therapistMode);
  therapistModeRef.current = therapistMode;

  // Voice Mode performance pass: accepts aiVoiceRealtime.js's own AbortSignal (bounded by its
  // CONNECT_TIMEOUT_MS) so a hung/slow token mint can actually be cancelled client-side, not just
  // ignored - `signal` is optional (a caller/test that never supplies one gets the exact previous
  // behavior, no timeout applied at the fetch layer itself). `eagerness` is aiVoiceRealtime.js's
  // own currentEagerness (see its connect()'s own comment) - only actually differs from the
  // server's 'medium' default on a reconnect that's preserving context.
  // ElevenLabs voice-provider follow-up (per-character/gender voice routing): `navryaCharacter`
  // (this component's own prop) is already translated to the design-system's 4th-skin id ('master')
  // for 'sage' - see navrya-src/characters.js's own comment on why the two systems name it
  // differently. The server-side admin config (server/admin/routes.voice-providers.mjs) and every
  // other product-facing surface use the app's own 4 character ids ('hunter'/'commander'/
  // 'engineer'/'sage'), so this maps back at the one point a voice request is actually built.
  function voiceCharacter() { return navryaCharacter === 'master' ? 'sage' : navryaCharacter; }
  // Reads the same per-account preference settingsView.jsx's VoiceGenderSection writes via
  // window.TradeJournalUserPreferences (public/pages/shared/user-preferences.js) - one gender pick
  // per character, applied globally regardless of which language is active. A caller before the
  // preferences replica has hydrated (or one who never set a preference at all) gets `undefined`
  // for that character, which the server's own resolveElevenLabsForRequest() already treats as
  // "use the documented default" - never a thrown error client-side.
  function voiceGenderPreference() {
    const store = window.TradeJournalUserPreferences;
    const prefs = store ? store.getPref('voiceGenderPreference', {}) : {};
    return (prefs || {})[voiceCharacter()];
  }

  async function fetchRealtimeSession(language, options) {
    const settingsForOpenAI = settingsStore.getKey('openai');
    const response = await fetch('/api/ai/realtime/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: settingsForOpenAI, language, eagerness: options && options.eagerness, character: voiceCharacter(), gender: voiceGenderPreference() }),
      signal: options && options.signal
    });
    if (!response.ok) {
      // fix/voice-mode-hosted-connection: this used to collapse every failure (a 401 session
      // problem, a 429 quota problem, a 503 missing-key problem, a real OpenAI-side
      // REALTIME_TOKEN_FAILED_* rejection) into one indistinguishable 'VOICE_SESSION_REQUEST_FAILED'
      // string, which is exactly what hid the real production failure behind a generic message
      // (docs/ai/voice-mode-performance-gap-matrix.md). The real server error code/status is now
      // preserved on the thrown Error so aiVoiceRealtime.js's connect() can classify it into one
      // of the stage-aware diagnostics (session_auth/session_quota/key_missing/key_rejected/...)
      // instead of a single opaque failure - never surfaced to the user beyond that sanitized
      // stage, and the raw response body is never read/logged here.
      let code = 'VOICE_SESSION_REQUEST_FAILED';
      try {
        const body = await response.json();
        if (body && typeof body.error === 'string' && body.error) code = body.error;
      } catch (_parseError) { /* non-JSON error body - keep the generic code */ }
      const error = new Error(code);
      error.code = code;
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  // ElevenLabs voice-provider follow-up: injected into aiVoiceRealtime.js as fetchSpeakAudio, the
  // same pattern as fetchRealtimeSession above - that module keeps zero knowledge of the real HTTP
  // endpoint. Only reached when mintRealtimeClientSecret()'s own response (fetchRealtimeSession's
  // return value) reported ttsProvider:'elevenlabs' for the active language; the server resolves
  // which credential/voice/model to use itself (never trusted from this request) and the API key
  // never leaves it. Deliberately never throws for an ordinary fallback condition - the server
  // always answers 200 with {fallback:true, reason} for those (missing config, circuit open,
  // upstream failure, ...); only a genuine transport failure (network error, non-2xx, malformed
  // body) rejects here, and aiVoiceRealtime.js's own speakViaElevenLabs() treats that exactly the
  // same as an explicit fallback - same text, once, through the existing OpenAI voice path.
  async function fetchVoiceProviderSpeak(language, text) {
    const response = await fetch('/api/ai/voice/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language, text, character: voiceCharacter(), gender: voiceGenderPreference() })
    });
    if (!response.ok) throw new Error('VOICE_SPEAK_REQUEST_FAILED');
    return response.json();
  }

  // A finalized voice turn goes through the exact same submit() a typed message does - one
  // brain, not two conversations. Once NAVRYA's own deterministic reply comes back, the reply
  // text is handed to PlaybackController.enqueue() to have the Realtime session speak that exact
  // text (never its own improvised answer) - fire-and-forget, never awaited here.
  //
  // Found via real E1 multi-turn browser testing (pre-split architecture): aiVoiceRealtime.js's
  // transcription-completed handler fires onVoiceTranscript once per finalized transcript with no
  // awareness of whether a PRIOR voice turn is still in flight. Two finalized transcripts arriving
  // close together (a fast talker, or a queued backlog after a slow reply) each independently
  // called submit() and both raced core.sendChat()'s own read of "is there already an open form/
  // workflow" before either had finished starting one - producing duplicate session.create action
  // turns instead of the second turn being recognized as filling the form the first one had just
  // opened. TurnCoordinator (ai-voice-turn-coordinator.js) still serializes submit() calls one at
  // a time, in arrival order, to preserve that guarantee - it just no longer also waits for
  // speech playback to finish first (see that module's own header comment for why that coupling
  // was removed).
  //
  // Latency pass, section 21/34: final transcript -> useful reply, and final transcript -> the
  // moment NAVRYA asks the Realtime session to speak it - the two numbers this layer can actually
  // observe. transcriptToSpeakRequestedMs is NOT "audio actually started" - the real first-audio-
  // byte moment happens inside aiVoiceRealtime.js's own speak()/response.create round trip, not
  // observable from here without deeper transport instrumentation (out of scope for this pass -
  // see docs/ai/latency-testing.md).
  // Journey G UX correction, item 10: true for exactly the one turn right after a Companion
  // opening was spoken - read-and-cleared (not a React state, so it can never race a re-render)
  // the instant the next transcript arrives, so only that ONE reply is ever treated specially,
  // regardless of how it's classified (start/later/explain/ambiguous).
  const awaitingCompanionOpeningReplyRef = React.useRef(false);
  function onVoiceTranscript(transcriptText) {
    setVoiceHeardText(transcriptText);
    const wasAwaitingCompanionOpeningReply = awaitingCompanionOpeningReplyRef.current;
    awaitingCompanionOpeningReplyRef.current = false;
    const transcriptAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const connectionEpochAtTranscript = (voiceRef.current && voiceRef.current.connectionEpoch) ? voiceRef.current.connectionEpoch() : 0;
    if (!turnCoordinatorRef.current) return;
    return turnCoordinatorRef.current.handleFinalTranscript(transcriptText, {
      awaitingCompanionOpeningReply: wasAwaitingCompanionOpeningReply,
      transcriptAt: transcriptAt,
      connectionEpoch: connectionEpochAtTranscript
    });
  }

  // Journey G UX correction, items 2-9: the deterministic, zero-model-call Voice Companion
  // opening. Architecture (unchanged elsewhere): Journey Engine supplies real facts -> Companion
  // Orchestrator decides whether/what to say -> this function hands the EXACT text to
  // PlaybackController -> the Realtime session speaks it verbatim, same as any other reply
  // (docs/ai/companion-orchestration.md). Called only once per real connection, only from the
  // voiceState effect below, itself only ever reachable after the user's own explicit Voice press
  // (item 6's consent boundary) - never from page load/refresh/navigation/login.
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
    // card by the time playback actually starts. Capturing it first is what lets the visual card
    // (item 9) still show the real Start/What is NAVRYA?/Later card synchronized with the spoken
    // greeting.
    var preOpeningCard = orchestrator.currentCard();
    var opening = orchestrator.voiceOpening(); // zero model calls - real Journey facts only
    if (!opening || !opening.text) return; // safety blocked it, or nothing true to say - stay silent, never forced
    setCompanionCard(opening.kind === 'freshWelcome' && preOpeningCard ? preOpeningCard : orchestrator.currentCard());
    setCompanionOpeningActive(true);
    var toSpeak = voiceText ? voiceText.toSpokenText(opening.text, i18n.language()) : opening.text;
    // The very next finalized transcript is a reply to THIS opening - see onVoiceTranscript's
    // own read-and-clear of this ref. Set BEFORE enqueueing (not after playback finishes) so a
    // fast barge-in mid-opening is still correctly treated as a reply to it.
    awaitingCompanionOpeningReplyRef.current = true;
    // Routed through the SAME PlaybackController every real turn's reply already speaks through
    // (this function only ever runs before any user turn has arrived, but a fast talker can still
    // barge in the instant playback starts - aiVoiceRealtime.js's own TRANSPORT_SPEECH_STARTED
    // handling already interrupts ANY ASSISTANT_SPEAKING playback, this opening included, via the
    // existing barge-in path). Tagged kind:'companion-opening' so the controller's onSettled
    // callback below knows to clear companionOpeningActive once THIS entry (not some later real
    // turn's reply) actually finishes/is skipped/is interrupted. `caption` (Part C) is published by
    // onAudioStart exactly when this entry's own audio genuinely starts, not here at enqueue time.
    if (playbackControllerRef.current) playbackControllerRef.current.enqueue(toSpeak, { kind: 'companion-opening', caption: opening.text });
    else setCompanionOpeningActive(false);
  }

  React.useEffect(() => {
    voiceRef.current = createVoiceSession({
      language: i18n.language(),
      fetchSession: fetchRealtimeSession,
      fetchSpeakAudio: fetchVoiceProviderSpeak,
      onStateChange: setVoiceState,
      onFinalTranscript: onVoiceTranscript,
      onMuteChange: setVoiceMuted,
      // Every failure aiVoiceRealtime.js's connect() reports now carries a sanitized stage label
      // (see that file's classifyMintFailureStage()/classifySdpFailureStage()) - stored as-is and
      // resolved to a localized message below (voiceErrorMessageForStage). A failure mode this
      // dock doesn't specifically recognize (e.g. 'reconnect', 'interrupt', 'speak', 'session' -
      // none of which are connection-diagnostic stages) still falls back to the original generic
      // Voice error message, unchanged from before this pass.
      onError: (detail) => {
        setVoiceErrorStage((detail && detail.stage) || null);
        setVoiceState(VOICE_STATES.ERROR);
      },
      // fix/voice-mode-turn-ux (Part A/B): pure relays into PlaybackController, read fresh via
      // playbackControllerRef.current on every call (never captured once) so they stay correct
      // across a reconnect (this createVoiceSession() instance is only ever created once per dock
      // mount; PlaybackController's own instance is created right below, in the same effect, so by
      // the time any of these three callbacks can actually fire - only ever after a real connect() -
      // playbackControllerRef.current already points at it).
      onOutputAudioBufferEvent: (type, responseId) => {
        const pc = playbackControllerRef.current;
        if (!pc) return;
        if (type === 'output_audio_buffer.started') pc.notifyAudioBufferStarted(responseId);
        else if (type === 'output_audio_buffer.stopped') pc.notifyAudioBufferStopped(responseId);
        else if (type === 'output_audio_buffer.cleared') pc.notifyAudioBufferCleared(responseId);
      },
      onResponseCreated: (responseId) => { if (playbackControllerRef.current) playbackControllerRef.current.setCurrentResponseId(responseId); },
      // The ONE place a real barge-in ever reaches PlaybackController - aiVoiceRealtime.js itself
      // never calls its own transport-level interrupt() in response to a barge-in any more (see
      // that file's own onTransportEvent comment); this is what replaces that direct, queue-
      // bypassing call with the controller-owned path (Part B).
      onBargeIn: () => { if (playbackControllerRef.current) playbackControllerRef.current.interrupt(); }
    });
    // Voice Mode performance pass: PlaybackController owns only speech - speak()/interrupt() are
    // read fresh from voiceRef.current on every call (never captured once), so they stay correct
    // across a reconnect (aiVoiceRealtime.js's own returned object identity never changes; only
    // its internal session does).
    //
    // fix/voice-mode-turn-ux (Part A/C): onAudioStart fires once per entry, exactly when ITS OWN
    // real output-audio buffer genuinely starts (never at enqueue/speak-call time) - publishing the
    // caption here, not from the business-result callback further down, is what stops a later
    // turn's result from overwriting a still-playing/still-queued earlier reply's caption before
    // its own audio has even started (Part C's core fix). onSettled now also always calls
    // voiceRef.current.markPlaybackEnded() - the one place `state` is moved back to LISTENING once
    // PlaybackController has genuinely finished with the current entry, for any reason (a real
    // output-audio-buffer stop, an interrupt, an error, or its own bounded watchdog fallback) -
    // never the SDK's own high-level audio_stopped any more (see aiVoiceRealtime.js's own comment).
    playbackControllerRef.current = window.TradeJournalAIVoicePlaybackController.create({
      speak: (text) => voiceRef.current.speak(text),
      // Journey H2, Gate 3: read fresh via voiceRef.current on every call, same convention as
      // speak()/interrupt() just above - only ever reached by PlaybackController itself, for an
      // entry the onResult wiring below tagged with a real audioUrl.
      playAudioUrl: (url) => voiceRef.current.playAudioUrl(url),
      interrupt: () => voiceRef.current.interrupt(),
      onAudioStart: (entry) => { if (entry.caption) setVoiceReplyCaption(entry.caption); },
      onSettled: (entry) => {
        if (entry.kind === 'companion-opening') setCompanionOpeningActive(false);
        if (voiceRef.current) voiceRef.current.markPlaybackEnded();
        window.TradeJournalChatDockVoiceLastPlayback = { responseId: entry.responseId, turnId: entry.turnId || null, spoken: entry.spoken, reason: entry.reason || null };
      }
    });
    // TurnCoordinator owns only submit() sequencing - getEpoch() is read fresh every time
    // (conversationEpochRef.current), so a New Chat/conversation switch mid-flight is always seen
    // by both the enqueue-time and resolve-time checks (see ai-voice-turn-coordinator.js).
    turnCoordinatorRef.current = window.TradeJournalAIVoiceTurnCoordinator.create({
      submit: (text, meta) => submitRef.current(text, { source: 'voice', awaitingCompanionOpeningReply: meta.awaitingCompanionOpeningReply }),
      getEpoch: () => conversationEpochRef.current,
      onResult: (result, meta) => {
        // The conversation moved on (New Chat/switch) while this turn's own submit() was in
        // flight, or submit() itself failed - never speak/caption a stale or absent result.
        if (meta.discarded || !result) return;
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
        const latency = { transcriptToReplyMs: Math.round(replyAt - meta.transcriptAt), transcriptToSpeakRequestedMs: null };
        if (toSpeak && playbackControllerRef.current) {
          const speakCalledAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
          latency.transcriptToSpeakRequestedMs = Math.round(speakCalledAt - meta.transcriptAt);
          // fix/voice-mode-turn-ux (Part C): the caption is no longer set here, at business-result
          // time - it is carried on the entry itself and published by PlaybackController's own
          // onAudioStart callback below, exactly when THIS entry's real audio genuinely starts
          // playing. Setting it here would let a later turn's result overwrite the caption for a
          // still-playing or still-queued earlier reply before its own audio has even started.
          // Fire-and-forget - handing the reply to PlaybackController never blocks this callback,
          // and TurnCoordinator's own queue has already moved on to the next turn by now anyway
          // (its serialization only ever waited for submit() above, never for this).
          //
          // Journey H2, Gate 3: the ONE place this turn's delivery mechanism is actually decided -
          // ai-voice-output-resolver.js's own pure resolve() (spec section 25: kept out of this
          // component's own branching). This callback is only ever reached for a voice-originated
          // turn (TurnCoordinator's own submit() option above always passes source:'voice'), so
          // that is what is reported here - a typed/text submit() never reaches this wiring at
          // all, so a typed message can never end up autoplaying audio (spec section 26/27), no
          // matter what result.audioUrl happens to contain. A missing resolver module degrades to
          // the always-safe DYNAMIC_TTS decision, never PUBLISHED_AUDIO by accident.
          const outputResolver = window.TradeJournalAIVoiceOutputResolver;
          const outputDecision = outputResolver
            ? outputResolver.resolve({ source: 'voice', hasAudio: !!(result && result.audioUrl) })
            : 'DYNAMIC_TTS';
          const audioUrlForEntry = outputDecision === 'PUBLISHED_AUDIO' ? result.audioUrl : null;
          playbackControllerRef.current.enqueue(toSpeak, { turnId: meta.turnId, connectionEpoch: meta.connectionEpoch, caption: rawToSpeak || '', audioUrl: audioUrlForEntry });
        }
        window.TradeJournalChatDockVoiceLatency = latency;
        // Dynamic VAD (Voice Mode performance pass): re-derive eagerness for the NEXT user turn
        // from what NAVRYA is now waiting on (ai-voice-eagerness.js is the one configuration
        // authority - see that file's own comment). setEagerness() itself is a no-op if the
        // value is unchanged from what's already in effect, so a run of ordinary turns never
        // sends a redundant session.update.
        const eagernessModule = window.TradeJournalAIVoiceEagerness;
        const workflowEngine = window.TradeJournalAIWorkflowEngine;
        if (eagernessModule && voiceRef.current) {
          const nextEagerness = eagernessModule.deriveEagerness({
            workflow: workflowEngine ? workflowEngine.current() : null,
            therapistMode: therapistModeRef.current,
            companionIntent: null
          });
          voiceRef.current.setEagerness(nextEagerness);
        }
      }
    });
    return () => { if (voiceRef.current) voiceRef.current.disconnect(); if (playbackControllerRef.current) playbackControllerRef.current.invalidate(); };
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
    // fix/voice-mode-turn-ux (Part C, requirements 6/7): the assistant caption is cleared exactly
    // when real user speech genuinely begins (any transition INTO USER_SPEAKING - this covers both
    // an ordinary turn and a barge-in interrupting a reply mid-playback, since both are the exact
    // same speech_started-driven transition), and on disconnect/a fatal error (IDLE/ERROR). It is
    // deliberately NOT cleared on PROCESSING/ASSISTANT_SPEAKING/LISTENING/RECONNECTING transitions -
    // "Stop reply" without the user having spoken again must leave the caption visible (requirement
    // 8), and it must stay visible through LISTENING after playback ends (requirement 5).
    if (voiceState === VOICE_STATES.USER_SPEAKING || voiceState === VOICE_STATES.IDLE || voiceState === VOICE_STATES.ERROR) {
      setVoiceReplyCaption('');
    }
    if (voiceState !== VOICE_STATES.PROCESSING) setVoiceManualFinishPending(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceState]);

  // AI-access follow-up: liveSessionView.jsx's own AI Analysis flow (any of its 3 pre-existing
  // manual triggers, or the new session.analysis.run Action Registry action) dispatches this event
  // once a real result lands - completely independent of any specific chat turn, since the
  // analysis itself runs entirely inside Live Session, never through submit()/core.sendChat() at
  // all. Speaks the result's own short headline through the exact same PlaybackController queue
  // every other reply already uses, but ONLY when Voice Mode is genuinely connected right now - a
  // typed-only session never hears anything, and this never triggers a second /api/ai/chat call
  // (the text is already known, produced by the analysis call itself). Reads voiceRef.current.
  // state() fresh at event time (mount-once effect, empty deps) rather than closing over the
  // `voiceState` React variable, which would otherwise always read its stale mount-time value.
  React.useEffect(() => {
    function onAnalysisReady(event) {
      const headline = event && event.detail && event.detail.headline;
      if (!headline || !voiceRef.current || !playbackControllerRef.current) return;
      const currentState = voiceRef.current.state();
      if (currentState === VOICE_STATES.IDLE || currentState === VOICE_STATES.ERROR) return;
      const spoken = voiceText ? voiceText.toSpokenText(headline, i18n.language()) : headline;
      playbackControllerRef.current.enqueue(spoken, { kind: 'ai-analysis-result', caption: headline });
    }
    window.addEventListener('tradejournal:ai-analysis-ready', onAnalysisReady);
    return () => window.removeEventListener('tradejournal:ai-analysis-ready', onAnalysisReady);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleVoice() {
    if (!voiceRef.current) return;
    const current = voiceRef.current.state();
    if (current === VOICE_STATES.IDLE || current === VOICE_STATES.ERROR) {
      // Pressing Voice is itself an explicit "open the dock" gesture (item 1/6) - the consent
      // boundary for everything that follows, spoken opening included.
      setDockExplicitlyOpened(true);
      setVoiceErrorStage(null);
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

  // VoiceConsole's centre pill button, ASSISTANT_SPEAKING mode ("Stop reply"). fix/voice-mode-
  // turn-ux (Part B): routed through PlaybackController, never aiVoiceRealtime.js's own transport-
  // level interrupt() directly - a direct call here was the original "Stop reply leaves queued
  // replies alive" bug, since only PlaybackController itself knows about anything still queued.
  function interruptVoice() {
    if (!playbackControllerRef.current) return;
    playbackControllerRef.current.interrupt();
  }

  // VoiceConsole's centre pill button, USER_SPEAKING mode ("End message" - Part D). Finishes only
  // the current spoken utterance early; never disconnects, never closes the conversation, never
  // touches conversation history. aiVoiceRealtime.js's own finishUserTurn() already enforces every
  // real precondition (connected/USER_SPEAKING/an active utterance/no manual commit already
  // pending) and its own bounded timeout - this is a thin pass-through, exactly like every other
  // voice control here.
  function endVoiceMessage() {
    if (!voiceRef.current) return;
    if (voiceRef.current.finishUserTurn()) setVoiceManualFinishPending(true);
  }

  function applySuggestion(item) {
    if (!popover || !popover.activeProcessId) return;
    core.applySuggestion(popover.activeProcessId, item.path, item.value, item.mode);
    setPopover((p) => (p ? { ...p, suggestions: p.suggestions.filter((s) => s !== item) } : p));
  }
  function discardSuggestion(item) {
    setPopover((p) => (p ? { ...p, suggestions: p.suggestions.filter((s) => s !== item) } : p));
  }

  // NAVRYA chat dock redesign: "Regenerate" (the design's "پاسخ دیگر") re-asks the same last user
  // message as a brand-new turn through the exact same submit() a typed message already goes
  // through - it does not attempt to replace the prior turn in place. Honest adaptation from the
  // mock: this app's transcript is a real, linear, append-only history (Section 3/7.14), so
  // "another answer" reads as a new exchange rather than silently rewriting one that already
  // happened - consistent with never mutating past turns anywhere else in this app.
  function regenerateLastReply(lastUserText) {
    if (!lastUserText || busy) return;
    submit(lastUserText);
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
        voiceManualFinishPending={voiceManualFinishPending}
        onVoiceToggle={toggleVoice} onVoiceMuteToggle={toggleVoiceMute} onVoiceInterrupt={interruptVoice}
        onVoiceEndMessage={endVoiceMessage}
        voiceErrorLabel={voiceErrorMessageForStage(i18n, voiceErrorStage)}
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
          endMessage: i18n.t('voiceConsoleEndMessage'), endingMessage: i18n.t('voiceConsoleEndingMessage'),
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
            model={activeModel} locale={i18n.language()}
            todayLabel={i18n.t('aiDockToday')} yesterdayLabel={i18n.t('aiDockYesterday')}
            sizeLabels={{
              compact: i18n.t('aiDockStageCompact'), tall: i18n.t('aiDockStageTall'), full: i18n.t('aiDockStageFull'),
              grow: i18n.t('aiDockGrow'), shrink: i18n.t('aiDockShrink'),
              fold: i18n.t('aiDockFold'), unfold: i18n.t('aiDockUnfold'), close: i18n.t('aiDockClose')
            }}
            messageActionLabels={{ copy: i18n.t('aiDockCopyReply'), copied: i18n.t('aiDockCopied'), regenerate: i18n.t('aiDockRegenerate') }}
            ruleApplied={!!popover.ruleApplied} ruleAppliedLabel={i18n.t('aiDockRuleApplied')}
            onRegenerate={regenerateLastReply}
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
