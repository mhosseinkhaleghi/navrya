import React from 'react';
import { useAssistantMotion } from './motion.js';
import { DockButton } from './DockButton.jsx';
import { DockMenu } from './DockMenu.jsx';
import { DockSeed } from './DockSeed.jsx';
import { ModelGlyph } from './ModelSwitcher.jsx';
import { VoiceConsole, VoiceMiniBar } from './VoiceConsole.jsx';
import { CompanionSigil } from './CompanionSigil.jsx';
import { CapsuleTop } from './CapsuleTop.jsx';
import { DockLayoutContext } from './dockLayout.js';
import { IDLE_TO_SEED_MS, PEEK_HOLD_MS } from './dockShape.js';
import {
  accent, cardBackground, cardShadow, cardRadius, EDGE, INK_DEEP, TEXT, DIVIDER
} from './dockDesign.js';
import {
  computeSideLane, computePinnedLane, computeWeld, computeAnchor, sameLane, sameWeld, sameAnchor, sideReservePx, sideForDir, isLaneViewport, isLaneDialog, isLongForm,
  SIDECAR_EDGE_PX, DOCK_BOTTOM_PX, PANEL_TO_DOCK_GAP_PX, DOCK_RESERVED_PX
} from './dockSideLane.js';

/* The bottom-centre command capsule: portrait, one line of intent, tools, engine, and one primary
   button (voice when empty, send when typing). Always fixed to the viewport - this is the single
   global assistant entry point for every character dashboard, not a per-panel widget. `children`
   renders above the bar (the reply: a peek or the conversation scroll) so the whole thing reads as one
   composition. Tints itself off `--char-accent`/`--char-glow`, so it must be mounted under a
   `data-character="..."` ancestor (see chatDockView.jsx) to pick up that character's colour rather
   than the default gold.

   The input row and the reply (`children`) are two independent position:fixed elements, not one shared
   stacking context, and deliberately sit at two different z-indices:

   - The input row stays reachable ABOVE any standard NAVRYA modal (Modal.jsx and every hand-rolled
     dialog that copies its exact zIndex:100 full-viewport backdrop) - before this split, that backdrop
     sat on top of this dock's old single zIndex:70 wrapper, silently making the chat input unreachable
     (visually covered and its clicks intercepted) the instant any modal opened. That broke the app's
     own "fill an already-open form conversationally" premise for every existing AI-registered flow.
   - The reply stays BELOW that same modal layer. A child cannot be raised above a sibling of its
     ancestor by giving the child its own z-index - once a parent wrapper is itself raised above the
     modal, everything nested inside paints as one atomic unit at that level, reply included. Simply
     raising the old single wrapper made the reply cover the modal's own interactive fields instead.
     Splitting into two fixed elements is what lets "the input stays clickable" and "the reply doesn't
     block the modal's own controls" both be true at once.

   200 is reserved for the rare full-screen image lightbox (navrya-src/sessionEntryCardsView.jsx); 150
   keeps the input row safely below that and above every zIndex:100 modal. The reply keeps the dock's
   original 70 at the bottom, deliberately NOT raised above the modal: geometry does the work instead.
   The dock publishes ONE constant reserved bottom footprint (DOCK_RESERVED_PX: its own margin, the
   composer row, and room for a short reply) as `--navrya-chat-dock-reserved` on the document root.
   Modal.jsx's backdrop reserves that space at its own bottom edge (and responsive.css does the same for
   every hand-rolled backdrop the dock marks with data-navrya-dock-host), so a dialog and the dock never
   occupy the same pixels regardless of z-index.

   That constant is what keeps a dialog STILL when the dock reacts to it (design plate III, "the popup
   is never moved by the dock"): the reserve does not depend on the placement, the live row height or
   the voice console's height, and the dialog's own re-centering is animated by its backdrop's padding
   transition. The only time a dialog makes room on the side is the design's sidecar - a voice session
   on a form too long to leave room under it (plate XVII) - which the user started themselves.

   Shapes (dockShape.js): 'seed' is only the 64px portrait in the corner (DockSeed); 'capsule' the
   composer alone; 'peek' and 'scroll' add the reply above it - `children` are only rendered by the
   caller in those two. In 'scroll' the composer drops its portrait and engine button (the reply's
   header carries both), exactly as the design draws it.

   Placements (dockSideLane.js): 'free' with no dialog open; 'side' (the conversation beside an open
   dialog, or pinned to the corner); 'under' (a dialog is open and nothing fits beside it); 'weld' (a
   voice session with a dialog open: the voice bar attached to the dialog's bottom edge). The dock
   marks the open dialog's backdrop with data-navrya-dock-host="side"|"under"|"weld" and the dialog
   itself with data-navrya-dock-weld while welded (responsive.css squares its bottom corners).

   Voice Mode: once voiceState leaves 'idle' this row is entirely replaced - VoiceMiniBar or the
   VoiceConsole (components/assistant/VoiceConsole.jsx) - rather than coexisting with the plain typing
   row (voice mode is a distinct mode you enter/exit; "Type"/Esc in the console returns here). The row's
   own primary button is the real dual-purpose control ("two jobs, one button"): empty text -> starts
   Voice, typed text -> Send, icon AND onClick both switch together (never just the icon - see
   ai-voice-chatdock-ux.test.mjs's own "no decoy button" guard). */
var DOCK_WIDTH_PX = 600;
var CAPSULE_ROW_PX = 68;
// Below the design's 1px joint the reply panel and this row are flush: the row's own top edge is
// drawn by an inset divider (see `joint` below), not a border.
var JOINED_GAP_PX = 0;

// Ties each real Journey E VOICE_STATES value (navrya-src/aiVoiceRealtime.js) to its dot colour -
// the single source of truth VoiceConsole/VoiceMiniBar's status dot reads from, so what a user
// sees can never drift out of sync with the real underlying state. IDLE/ERROR are handled inline
// below (IDLE has no dot at all; ERROR is always danger-red regardless of this map).
var VOICE_STATE_DOT = {
  requesting_permission: 'var(--gold-antique)', connecting: 'var(--gold-antique)', reconnecting: 'var(--gold-antique)',
  processing: 'var(--gold-antique)',
  listening: 'var(--char-accent)', user_speaking: 'var(--char-accent)', interrupted: 'var(--char-accent)',
  assistant_speaking: 'var(--gold-warm)'
};

function voicePhaseLabel(voiceState, voiceMuted, voiceErrorLabel, voiceLabels) {
  if (voiceState === 'error') return voiceErrorLabel || voiceLabels.error;
  if (voiceMuted) return voiceLabels.muted;
  return ({
    requesting_permission: voiceLabels.requestingPermission, connecting: voiceLabels.connecting,
    listening: voiceLabels.listening, user_speaking: voiceLabels.userSpeaking,
    processing: voiceLabels.processing, assistant_speaking: voiceLabels.speaking,
    interrupted: voiceLabels.listening, reconnecting: voiceLabels.reconnecting
  })[voiceState] || '';
}

function voicePhaseCaption(voiceState, voiceMuted, voicePermissionDenied, voiceErrorLabel, voiceLabels) {
  if (voiceState === 'error') return voicePermissionDenied ? voiceLabels.captionDenied : (voiceErrorLabel || voiceLabels.error);
  if (voiceMuted) return voiceLabels.captionMuted;
  return ({
    requesting_permission: voiceLabels.captionConnecting, connecting: voiceLabels.captionConnecting,
    reconnecting: voiceLabels.captionConnecting,
    listening: voiceLabels.captionListening, interrupted: voiceLabels.captionListening,
    user_speaking: voiceLabels.captionUserSpeaking,
    processing: voiceLabels.captionProcessing, assistant_speaking: voiceLabels.captionSpeaking
  })[voiceState] || '';
}

export function ChatDock({
  placeholder = 'Ask anything', inputLabel,
  value, onValueChange, onSubmit, onAdd, addLabel, addActive,
  onNewChat, newChatLabel, onHistory, historyLabel, historyActive,
  onToggleTherapist, therapistActive, therapistLabel,
  // Journey E: one real Voice control, driven directly off aiVoiceRealtime.js's own VOICE_STATES
  // (never a collapsed boolean). Entering any non-idle state hands the whole row over to
  // VoiceConsole/VoiceMiniBar (see the top-of-file comment) - the labels/callbacks below are
  // exactly what those components need to stay a thin, stateless presentation layer.
  voiceState = 'idle', voiceMuted = false, voicePermissionDenied = false,
  // fix/voice-mode-turn-ux (Part D): true only while the current PROCESSING stretch was caused by
  // the user's own "End message" click, not an ordinary VAD-driven turn - see chatDockView.jsx's
  // own comment on why this is tracked separately from the generic PROCESSING/`thinking` state.
  voiceManualFinishPending = false,
  // Slice R2 (transport repair), audit finding T12: true for every adapter except Gemini Live,
  // which has no real client-side "end just this turn" mechanism (see geminiLiveVoice.js's own
  // finishUserTurn()/supportsManualFinish() comment) - defaults to true so every existing caller
  // that never passes this keeps the exact prior OpenAI Realtime behavior.
  voiceSupportsManualFinish = true,
  // Live caption fix (2026-09-13): opposite default from voiceSupportsManualFinish above - only
  // gptLiveVoice.js reports this capability at all, so "not passed" must mean false here to keep
  // every other caller's console looking exactly as it always has (see chatDockView.jsx's own
  // voiceSupportsLiveCaption declaration comment).
  voiceSupportsLiveCaption = false,
  onVoiceToggle, onVoiceEnd, onVoiceMuteToggle, onVoiceInterrupt, onVoiceEndMessage, voiceErrorLabel, voiceLabels = {},
  getVoiceMediaStream, voiceHeardText, voiceReplyCaption,
  // Voice while a form is open (plates XIV-XVIII): what the voice bar/sidecar/field states need to say
  // which question is being asked and how far along the form is - see navrya-src/dockFormVoice.js.
  // null when no form is being filled (the ordinary console then renders unchanged).
  formVoice = null, formVoiceLabels = {}, onFormVoiceChoice, onFormVoiceSkip, onFormVoiceLater, numberFormat,
  // "Ask every field": the persisted preference (companion profile) that a value waits for the user's OK
  // before it is written into a form - a real toggle in the tools menu.
  formConfirmActive = false, onFormConfirmToggle, formConfirmLabel,
  // Journey G UX correction: the one real "the user just deliberately engaged with the dock"
  // signal - fired alongside the existing local `focused` styling state, never replacing it.
  // chatDockView.jsx uses this to gate the first-run Companion welcome card behind an explicit
  // open gesture instead of showing it the instant the dock merely mounts.
  onInputFocus,
  // Companion capsule: `companion` is { name, portrait } for the active character (see
  // chatDockView.jsx). `surfaceJoined` is true only while a real reply panel is showing, so it can
  // meet this row flush. `sideLaneEnabled` lets a caller opt out of the beside-the-modal lane.
  companion, surfaceJoined = false, sideLaneEnabled = true,
  // The design's shapes (dockShape.js): what the caller's shape state says the dock is right now,
  // the events this component raises (idle, outside click, Ctrl K, up key), and the seed's copy.
  shape = 'capsule', onShapeEvent, unseenCount = 0, seedLabel, seedPillLabel, replyAvailable = false,
  pinned = false, autoCollapse = true, onAutoCollapseChange, autoCollapseLabel,
  // Capsule exact pass: the accessible name of the "+" tools menu (falls back to addLabel).
  toolsLabel, engineLabel, openConversationLabel,
  busy = false, width = DOCK_WIDTH_PX, hint,
  models, model, onModelChange, children,
  dir = 'ltr',
  sendLabel = 'Send',
  style, ...rest
}) {
  useAssistantMotion();
  const [focused, setFocused] = React.useState(false);
  const text = value || '';
  const showSend = !!text.trim();
  const ready = showSend && !busy;
  const idle = voiceState === 'idle';
  const seed = shape === 'seed' && idle;
  const scrollOpen = shape === 'scroll' && surfaceJoined;

  const submit = () => {
    if (!ready) return;
    if (onSubmit) onSubmit(text.trim());
  };
  const mainAction = () => { if (showSend) submit(); else if (onVoiceToggle) onVoiceToggle(); };
  const emit = (type) => { if (onShapeEvent) onShapeEvent(type); };

  const list = models && models.length ? models : null;
  const active = list ? (list.find((m) => m.id === model) || list[0]) : null;

  // ---- Placement -----------------------------------------------------------------------------
  // 'free' with no dialog open, 'side' (a lane beside an open dialog, or pinned), 'under' when a
  // dialog is open and nothing fits beside it, 'weld' for a voice session on a dialog. Recomputed from
  // the real DOM the moment nodes are added/removed (a dialog mounting or unmounting - synchronously,
  // before the browser paints, so a dialog is never seen in the wrong place for one frame), on
  // viewport resize, and whenever the chosen dialog's own box changes size. Only ever setState()s when
  // something genuinely changed, so the dock's own re-renders can never loop.
  const dockRef = React.useRef(null);
  const [dockMode, setDockMode] = React.useState('free');
  const [sideLane, setSideLane] = React.useState(null);
  const [weld, setWeld] = React.useState(null);
  const [anchor, setAnchor] = React.useState(null);
  // The anchored capsule can be dismissed back to the bottom for the rest of the session (its expand button).
  const [anchorDismissed, setAnchorDismissed] = React.useState(false);
  React.useEffect(() => { if (idle) setAnchorDismissed(false); }, [idle]);
  // What compute() reads without re-subscribing: the live session, the shape, the pin.
  const placementInput = React.useRef({});
  placementInput.current = { voiceActive: !idle, scrollOpen, pinned, dir, anchorWanted: !!(formVoice && formVoice.engaged) && !anchorDismissed };
  const recompute = React.useRef(null);
  React.useEffect(() => {
    if (!sideLaneEnabled || typeof window === 'undefined' || typeof document === 'undefined') return undefined;
    const root = document.documentElement;
    const side = sideForDir(dir);
    // A dialog that still overlaps the lane after the reserve was published is never retried for
    // the lane (it goes 'under'/'weld'), so it can never flicker between placements. The voice
    // choice is latched per dialog for the same reason: a wizard whose steps change height never
    // flips between the bar and the sidecar mid-session.
    const refused = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
    const voiceChoice = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
    let frame = 0;
    let disposed = false;
    let observedDialog = null;
    let dialogObserver = null;
    let hostEl = null;
    let weldEl = null;
    const published = { left: null, right: null };

    function publishSide(on) {
      const near = on ? sideReservePx() + 'px' : '0px';
      const far = '0px';
      const left = side === 'left' ? near : far;
      const right = side === 'right' ? near : far;
      if (published.left !== left) { root.style.setProperty('--navrya-chat-dock-side-left', left); published.left = left; }
      if (published.right !== right) { root.style.setProperty('--navrya-chat-dock-side-right', right); published.right = right; }
    }
    // The dialog's full-viewport backdrop gets data-navrya-dock-host, which responsive.css turns
    // into the lane/band reserve - the one rule that makes every dialog backdrop (Modal.jsx and the
    // hand-rolled ones alike) leave the dock its room. React never removes an attribute it did not
    // render, so the mark survives the dialog's own re-renders; it goes when the dialog does.
    function setHost(el, kind) {
      if (hostEl && hostEl !== el && hostEl.removeAttribute) hostEl.removeAttribute('data-navrya-dock-host');
      hostEl = el;
      if (el && el.getAttribute('data-navrya-dock-host') !== kind) el.setAttribute('data-navrya-dock-host', kind);
    }
    // The welded dialog loses its bottom edge so bar and dialog read as one piece (responsive.css).
    function setWeldMark(el) {
      if (weldEl && weldEl !== el && weldEl.removeAttribute) weldEl.removeAttribute('data-navrya-dock-weld');
      weldEl = el;
      if (el && el.getAttribute('data-navrya-dock-weld') !== 'true') el.setAttribute('data-navrya-dock-weld', 'true');
    }
    function findBackdrop(dialog) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      for (let el = dialog.parentElement; el && el !== document.body; el = el.parentElement) {
        let position = '';
        try { position = window.getComputedStyle(el).position; } catch (_) { position = ''; }
        if (position !== 'fixed') continue;
        const rect = el.getBoundingClientRect();
        if (rect.width >= vw * 0.9 && rect.height >= vh * 0.9) return el;
      }
      return null;
    }
    function watch(el) {
      if (el === observedDialog) return;
      if (dialogObserver) dialogObserver.disconnect();
      observedDialog = el;
      dialogObserver = null;
      if (el && typeof ResizeObserver !== 'undefined') {
        dialogObserver = new ResizeObserver(schedule);
        dialogObserver.observe(el);
      }
    }
    function findDialog() {
      const nodes = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      let best = null;
      let bestArea = 0;
      for (let i = 0; i < nodes.length; i += 1) {
        const el = nodes[i];
        if (dockRef.current && dockRef.current.contains(el)) continue;
        const rect = el.getBoundingClientRect();
        if (!isLaneDialog(rect)) continue;
        if (rect.width * rect.height > bestArea) { best = el; bestArea = rect.width * rect.height; }
      }
      return best;
    }
    function commit(mode, lane, weldRect, anchorRect) {
      setDockMode((prev) => (prev === mode ? prev : mode));
      setSideLane((prev) => (sameLane(prev, lane) ? prev : lane));
      setWeld((prev) => (sameWeld(prev, weldRect) ? prev : weldRect));
      setAnchor((prev) => (sameAnchor(prev, anchorRect || null) ? prev : (anchorRect || null)));
    }
    function compute() {
      frame = 0;
      if (disposed) return;
      const input = placementInput.current;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const dialog = findDialog();
      watch(dialog);
      if (!dialog) {
        setHost(null); setWeldMark(null); publishSide(false);
        // A voice session on a form that is not a dialog: the capsule steps aside into the free corner of the
        // page (the chart) instead of sitting over the work.
        if (input.voiceActive && input.anchorWanted) {
          const anchorEl = document.querySelector('[data-navrya-dock-anchor]');
          const spot = anchorEl ? computeAnchor({ dir, viewportWidth: vw, viewportHeight: vh, anchorRect: anchorEl.getBoundingClientRect() }) : null;
          if (spot) { commit('anchor', null, null, spot); return; }
        }
        if (input.pinned && isLaneViewport(vw)) commit('side', computePinnedLane({ viewportHeight: vh, dir }), null);
        else commit('free', null, null);
        return;
      }
      const host = findBackdrop(dialog);
      const wantsSide = input.pinned || input.scrollOpen;
      // A live voice session: the bar welds under an ordinary popup, the sidecar takes a form too long
      // to leave room under (decided once per dialog, when the session first sees it).
      if (input.voiceActive) {
        let choice = voiceChoice ? voiceChoice.get(dialog) : null;
        if (!choice) {
          choice = isLongForm({ height: dialog.offsetHeight }, vh) && isLaneViewport(vw) ? 'side' : 'weld';
          if (voiceChoice) voiceChoice.set(dialog, choice);
        }
        if (choice === 'side') {
          setHost(host, 'side');
          publishSide(true);
          const lane = computeSideLane({ viewportWidth: vw, viewportHeight: vh, dir, dialogRect: dialog.getBoundingClientRect() });
          if (lane) { setWeldMark(null); commit('side', lane, null); return; }
          // No room for the sidecar after all: weld instead (and remember it).
          if (voiceChoice) voiceChoice.set(dialog, 'weld');
        }
        publishSide(false);
        setHost(host, 'weld');
        const attach = computeWeld({ viewportWidth: vw, viewportHeight: vh, dialogRect: dialog.getBoundingClientRect() });
        if (attach) { setWeldMark(dialog); commit('weld', null, attach); return; }
        setWeldMark(null); setHost(host, 'under'); commit('under', null, null);
        return;
      }
      setWeldMark(null);
      if (wantsSide && isLaneViewport(vw) && !(refused && refused.has(dialog))) {
        // Publishing the reserve first lets the dialog re-centre into the rest of the viewport;
        // getBoundingClientRect() then reads its real post-reserve position synchronously.
        setHost(host, 'side');
        publishSide(true);
        const lane = computeSideLane({ viewportWidth: vw, viewportHeight: vh, dir, dialogRect: dialog.getBoundingClientRect() });
        if (lane) { commit('side', lane, null); return; }
        if (refused) refused.add(dialog);
      }
      publishSide(false);
      setHost(host, 'under');
      commit('under', null, null);
    }
    function schedule() {
      if (!frame && !disposed) frame = window.requestAnimationFrame(compute);
    }
    // A dialog mounting must be seen before the browser paints it - the mutation callback is a
    // microtask, so the reserve it publishes is already in the dialog's first frame.
    function onMutation() {
      if (disposed) return;
      if (frame) { window.cancelAnimationFrame(frame); frame = 0; }
      compute();
    }
    recompute.current = schedule;

    const mutations = typeof MutationObserver !== 'undefined' ? new MutationObserver(onMutation) : null;
    if (mutations && document.body) mutations.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', schedule);
    document.addEventListener('scroll', schedule, true);
    // The dialog's own pop-in animation moves its box for a moment: re-measure when it ends.
    document.addEventListener('animationend', schedule, true);
    document.addEventListener('transitionend', schedule, true);
    schedule();
    return () => {
      disposed = true;
      recompute.current = null;
      if (frame) window.cancelAnimationFrame(frame);
      if (mutations) mutations.disconnect();
      if (dialogObserver) dialogObserver.disconnect();
      window.removeEventListener('resize', schedule);
      document.removeEventListener('scroll', schedule, true);
      document.removeEventListener('animationend', schedule, true);
      document.removeEventListener('transitionend', schedule, true);
      setHost(null);
      setWeldMark(null);
      root.style.removeProperty('--navrya-chat-dock-side-left');
      root.style.removeProperty('--navrya-chat-dock-side-right');
      setDockMode('free');
      setSideLane(null);
      setWeld(null);
      setAnchor(null);
    };
  }, [sideLaneEnabled, dir]);
  // The placement depends on the live session, the open conversation and the pin as well.
  const formEngaged = !!(formVoice && formVoice.engaged);
  React.useEffect(() => { if (recompute.current) recompute.current(); }, [idle, scrollOpen, pinned, anchorDismissed, formEngaged]);
  const inLane = dockMode === 'side' && !!sideLane;
  const welded = dockMode === 'weld' && !!weld && !idle;
  const underDialog = dockMode === 'under';
  const anchored = dockMode === 'anchor' && !!anchor && !idle;
  const dockLayout = inLane ? 'side' : welded ? 'weld' : anchored ? 'anchor' : underDialog ? 'under' : 'bottom';

  // Minimized is purely local UI state for the current session - always starts expanded, and
  // resets the instant the session actually ends (never stays stuck minimized into the next one).
  const [voiceMinimized, setVoiceMinimized] = React.useState(false);
  React.useEffect(() => { if (idle) setVoiceMinimized(false); }, [idle]);

  // Elapsed session timer lives here (not inside VoiceConsole/VoiceMiniBar) specifically so it
  // survives minimizing/expanding - those are two different mounted components, and a timer local
  // to either would reset to 0 every time the user toggled between them.
  const [voiceElapsed, setVoiceElapsed] = React.useState(0);
  React.useEffect(() => {
    if (idle) { setVoiceElapsed(0); return undefined; }
    const iv = setInterval(() => setVoiceElapsed((s) => s + 1), 1000);
    return () => clearInterval(iv);
  }, [idle]);

  // Measures the input row's real rendered (border-box, visual) height so the reply (a separate
  // fixed element) can anchor exactly to it - kept live via ResizeObserver rather than a guessed
  // constant, since the row can legitimately change height (RTL, font scaling, or the voice
  // console's own taller panel while a session is live). el.offsetHeight is the actual border-box
  // height (padding + border included) - ResizeObserverEntry.contentRect would under-measure it.
  const rowRef = React.useRef(null);
  const [rowHeight, setRowHeight] = React.useState(CAPSULE_ROW_PX);
  React.useEffect(() => {
    const el = rowRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => setRowHeight(el.offsetHeight));
    observer.observe(el);
    setRowHeight(el.offsetHeight);
    return () => observer.disconnect();
  }, [seed]);

  // The reply (a separate fixed element) is pinned to the composer's own real rect: its physical
  // left/width are read from the browser's layout (getBoundingClientRect), which already accounts for
  // RTL/LTR and max-width centring, so its edges match the composer's within well under 1px. A
  // ResizeObserver alone is not enough (it only fires when the box SIZE changes, not when it merely
  // moves - a pure viewport resize that re-centres an already-at-max-width row) - paired with a
  // window resize/orientation listener.
  const [dockSurfaceRect, setDockSurfaceRect] = React.useState(null);
  React.useEffect(() => {
    const el = rowRef.current;
    if (!el) return undefined;
    function measure() {
      const rect = el.getBoundingClientRect();
      setDockSurfaceRect((prev) => (prev && prev.left === rect.left && prev.width === rect.width ? prev : { left: rect.left, width: rect.width }));
    }
    measure();
    let observer = null;
    if (typeof ResizeObserver !== 'undefined') { observer = new ResizeObserver(measure); observer.observe(el); }
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => {
      if (observer) observer.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, [dir, inLane, welded, seed]);

  // Publishes the dock's reserved bottom footprint as a CSS custom property on the document root, so
  // any other fixed-positioned UI on the page - Modal.jsx's own backdrop, and every other dialog
  // backdrop through responsive.css's data-navrya-dock-host rule - can reserve the same space without
  // importing/knowing anything about ChatDock itself. ONE constant (see the top-of-file comment): the
  // dialog must not move because the dock's placement or row height changed. Only the side lane frees
  // the bottom (the dock is not there), and a collapsed seed needs no room at all. Cleared on unmount.
  React.useEffect(() => {
    var root = document.documentElement;
    var reserved = inLane || seed ? 0 : DOCK_RESERVED_PX;
    root.style.setProperty('--navrya-chat-dock-reserved', reserved + 'px');
    return () => { root.style.removeProperty('--navrya-chat-dock-reserved'); };
  }, [inLane, seed]);

  // ---- The seed: idle / outside click collapse, Ctrl K, the up key -----------------------------
  // The design's flow: click on the page or 8 seconds of doing nothing folds the capsule to the seed;
  // clicking the seed or Ctrl K brings it back. Never while there is something in progress - typed
  // text, a focused input, a live voice session, a pending reply, an open menu, a pinned dock - and
  // never while a dialog is open (the dock is then part of the form flow, and every click inside the
  // dialog would otherwise fold it).
  // A click elsewhere on the page folds it even while the (empty) input still has focus - the press is what
  // takes the focus away; only idleness waits for the caret to leave.
  const clickCollapsible = autoCollapse && idle && !busy && !showSend && !pinned && dockMode === 'free' && shape === 'capsule';
  const collapsible = clickCollapsible && !focused;
  const collapsibleRef = React.useRef(clickCollapsible);
  collapsibleRef.current = clickCollapsible;
  const idleCollapsibleRef = React.useRef(collapsible);
  idleCollapsibleRef.current = collapsible;
  // A peek folds away after a few seconds of inattention, or on a click elsewhere on the page.
  const peekFoldable = shape === 'peek' && idle && !focused && !showSend && dockMode !== 'weld';
  const peekFoldableRef = React.useRef(peekFoldable);
  peekFoldableRef.current = peekFoldable;
  const activityRef = React.useRef(0);
  const [activity, setActivity] = React.useState(0);
  const bumpActivity = React.useCallback(() => { activityRef.current += 1; setActivity(activityRef.current); }, []);
  React.useEffect(() => {
    if (!collapsible) return undefined;
    const timer = setTimeout(() => { if (idleCollapsibleRef.current && onShapeEvent) onShapeEvent('collapse'); }, IDLE_TO_SEED_MS);
    return () => clearTimeout(timer);
    // `activity` restarts the countdown on any pointer/keyboard movement inside the dock.
  }, [collapsible, activity, shape, onShapeEvent]);
  React.useEffect(() => {
    if (!peekFoldable) return undefined;
    const timer = setTimeout(() => { if (peekFoldableRef.current && onShapeEvent) onShapeEvent('peekTimeout'); }, PEEK_HOLD_MS);
    return () => clearTimeout(timer);
  }, [peekFoldable, activity, onShapeEvent]);
  React.useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    function onDown(e) {
      const t = e.target;
      if (t && t.closest && t.closest('[data-navrya-assistant]')) return;
      if (peekFoldableRef.current) { if (onShapeEvent) onShapeEvent('peekTimeout'); return; }
      if (collapsibleRef.current && onShapeEvent) onShapeEvent('collapse');
    }
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [onShapeEvent]);
  const inputRef = React.useRef(null);
  React.useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (onShapeEvent) onShapeEvent('open');
        setTimeout(() => { if (inputRef.current) inputRef.current.focus(); }, 40);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onShapeEvent]);

  const dotColor = voiceState === 'error' ? 'var(--danger,#e05a5a)' : voiceMuted ? 'var(--steel)' : (VOICE_STATE_DOT[voiceState] || 'var(--char-accent)');
  const phaseLabel = voicePhaseLabel(voiceState, voiceMuted, voiceErrorLabel, voiceLabels);
  const phaseCaption = voicePhaseCaption(voiceState, voiceMuted, voicePermissionDenied, voiceErrorLabel, voiceLabels);

  // Where the row sits: bottom-centre as always, the lane (beside a dialog / pinned), or welded to
  // the dialog's bottom edge.
  const dockBottom = inLane ? sideLane.bottom : DOCK_BOTTOM_PX;
  const surfaceGap = surfaceJoined ? JOINED_GAP_PX : PANEL_TO_DOCK_GAP_PX;
  const hasSurface = React.Children.toArray(children).length > 0 && !welded && !anchored;
  const dockPlacement = inLane
    ? { position: 'fixed', [sideLane.side]: SIDECAR_EDGE_PX, bottom: sideLane.bottom, width: sideLane.width, maxWidth: sideLane.width, margin: 0 }
    : welded
      ? { position: 'fixed', left: weld.left, top: weld.top, width: weld.width, maxWidth: weld.width, margin: 0 }
      : anchored
        ? { position: 'fixed', left: anchor.left, top: anchor.top, width: anchor.width, maxWidth: anchor.width, margin: 0 }
        : { position: 'fixed', left: 16, right: 16, bottom: DOCK_BOTTOM_PX, margin: '0 auto', maxWidth: width };
  const sigilState = busy ? 'thinking' : 'idle';
  // The reply's height: capped to the lane in 'side', to the reserved peek band in 'under'.
  const surfaceCap = inLane
    ? { maxHeight: Math.max(0, sideLane.height - rowHeight), overflowY: 'auto' }
    : underDialog ? { maxHeight: DOCK_RESERVED_PX - DOCK_BOTTOM_PX - CAPSULE_ROW_PX, overflowY: 'auto' } : null;

  // "+" tools menu: every secondary control the old row showed inline, now one tap away.
  const toolItems = [
    // The portrait opens the conversation - and on a phone, where the portrait is hidden, so does this.
    replyAvailable && shape !== 'scroll' && openConversationLabel && { key: 'conversation', icon: 'messages-square', label: openConversationLabel, onSelect: () => emit('expand') },
    onAdd && { key: 'attach', icon: 'image', label: addLabel, active: addActive, onSelect: onAdd },
    onNewChat && { key: 'new', icon: 'square-pen', label: newChatLabel, onSelect: onNewChat },
    onHistory && { key: 'history', icon: 'history', label: historyLabel, active: historyActive, onSelect: onHistory },
    onToggleTherapist && { key: 'therapist', icon: 'psychology', label: therapistLabel, active: therapistActive, role: 'menuitemcheckbox', onSelect: onToggleTherapist },
    onFormConfirmToggle && formConfirmLabel && { key: 'form-confirm', icon: 'shield-check', label: formConfirmLabel, active: formConfirmActive, role: 'menuitemcheckbox', onSelect: onFormConfirmToggle },
    onAutoCollapseChange && autoCollapseLabel && { key: 'auto-collapse', icon: 'minimize-2', label: autoCollapseLabel, active: autoCollapse, role: 'menuitemcheckbox', onSelect: () => onAutoCollapseChange(!autoCollapse) }
  ];
  // Engine menu: the same models/onModelChange the ModelSwitcher glyph row used.
  const engineItems = list && onModelChange
    ? list.map((m) => ({ key: m.id, role: 'menuitemradio', label: m.label, glyph: <ModelGlyph model={m} size={15} />, active: active && m.id === active.id, onSelect: () => onModelChange(m.id) }))
    : [];

  if (seed) {
    return (
      <DockLayoutContext.Provider value="bottom">
        <DockSeed
          portrait={companion && companion.portrait} label={seedLabel} count={unseenCount} pillLabel={seedPillLabel}
          thinking={busy} onOpen={() => emit('open')} side={sideForDir(dir)} dir={dir}
        />
      </DockLayoutContext.Provider>
    );
  }

  // The joint between a reply and this row: an inset hairline (the design's divider), not a border.
  const joint = surfaceJoined ? (
    <span aria-hidden="true" style={{ position: 'absolute', top: 0, insetInlineStart: 14, insetInlineEnd: 14, height: 1, background: DIVIDER, pointerEvents: 'none' }} />
  ) : null;

  return (
    <DockLayoutContext.Provider value={dockLayout}>
      {hasSurface && (
        <div
          data-navrya-assistant="response-surface"
          onPointerMove={bumpActivity}
          style={{
            position: 'fixed', bottom: dockBottom + rowHeight + surfaceGap, boxSizing: 'border-box',
            // 70 below modals at the bottom (see the top-of-file comment). 150 beside a dialog (the
            // lane is outside the dialog's rect by construction) and under one (the band the
            // dialog's backdrop reserves below it) - in neither is there anything of the dialog's
            // to cover, and at 70 the reply would sit dimmed under the dialog's scrim.
            zIndex: dockLayout === 'bottom' ? 70 : 150, pointerEvents: 'none',
            ...surfaceCap,
            // Once the real dock row rect has been measured, this surface is pinned to those EXACT
            // physical left/width values. Before the first measurement (or in a legacy/test render
            // with no ResizeObserver support at all), it falls back to independent centring so
            // nothing ever renders at 0-width/off-screen.
            ...(dockSurfaceRect
              ? { left: dockSurfaceRect.left, width: dockSurfaceRect.width }
              : { left: 16, right: 16, margin: '0 auto', maxWidth: width })
          }}
        >
          <div style={{ pointerEvents: 'auto' }}>{children}</div>
        </div>
      )}
      <div
        ref={dockRef}
        data-navrya-assistant="dock" data-navrya-dock-layout={dockLayout} data-navrya-dock-shape={shape} dir={dir}
        onPointerMove={bumpActivity} onKeyDown={bumpActivity}
        style={{
          ...dockPlacement, zIndex: 150,
          display: 'flex', alignItems: 'flex-end', gap: 14, ...style
        }}
        {...rest}
      >
        <div ref={rowRef} data-navrya-assistant="dock-surface" style={{ flex: 1, minWidth: 0 }}>
          {idle && (
            <div
              data-navrya-chat-dock=""
              style={{
                position: 'relative', display: 'flex', alignItems: 'center', gap: 8, padding: 12, minHeight: CAPSULE_ROW_PX, boxSizing: 'border-box',
                // One opaque body: the design's card (edge, gradient over the stage colour, shadow) - and
                // when a reply sits on it, squared on top with the joint drawn as an inset hairline.
                borderRadius: cardRadius(surfaceJoined, false),
                border: '1px solid ' + EDGE,
                borderTop: surfaceJoined ? 0 : undefined,
                background: surfaceJoined ? INK_DEEP : cardBackground('card'),
                boxShadow: surfaceJoined ? '0 26px 64px rgba(0,0,0,.6),0 0 40px ' + accent(10) : cardShadow('card'),
                transition: 'border-color 200ms var(--ease-out),box-shadow 200ms var(--ease-out),background 200ms var(--ease-out)'
              }}
            >
              {!surfaceJoined && <CapsuleTop />}
              {joint}
              {/* The character's own portrait opens the row - and is the button that opens the
                  conversation when there is one to open. Hidden on phones by .navrya-dock-mascot. */}
              {!scrollOpen && (
                (replyAvailable || onHistory)
                  ? (
                    <button
                      type="button" className="navrya-dock-mascot" aria-label={openConversationLabel} title={openConversationLabel} onClick={() => { if (replyAvailable) emit('expand'); else if (onHistory) onHistory(); }}
                      style={{ padding: 0, border: 0, background: 'transparent', cursor: 'pointer', flex: 'none', display: 'inline-flex' }}
                    >
                      <CompanionSigil portrait={companion && companion.portrait} size={40} state={sigilState} />
                    </button>
                  )
                  : <CompanionSigil className="navrya-dock-mascot" portrait={companion && companion.portrait} size={40} state={sigilState} />
              )}
              {scrollOpen && (
                <DockMenu className="navrya-dock-tools" icon="plus" label={toolsLabel || addLabel} items={toolItems} />
              )}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  ref={inputRef} type="text" value={text}
                  placeholder={placeholder}
                  onChange={(e) => onValueChange && onValueChange(e.target.value)}
                  onFocus={() => { setFocused(true); if (onInputFocus) onInputFocus(); emit('focus'); }} onBlur={() => setFocused(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); submit(); return; }
                    if (e.key === 'ArrowUp' && replyAvailable && shape !== 'scroll') { e.preventDefault(); emit('expand'); }
                  }}
                  aria-label={inputLabel || placeholder} disabled={busy}
                  style={{
                    width: '100%', minWidth: 0, height: 44, border: 0, background: 'transparent', outline: 'none', padding: '0 4px',
                    font: 'var(--type-body)', fontSize: 14.5, color: TEXT, caretColor: 'var(--char-accent)'
                  }}
                />
              </div>
              {hint && !inLane && (
                <span style={{
                  font: 'var(--type-caption)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase',
                  color: 'var(--text-muted)', whiteSpace: 'nowrap', flex: 'none'
                }}>{hint}</span>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
                {!scrollOpen && <DockMenu className="navrya-dock-tools" icon="plus" label={toolsLabel || addLabel} items={toolItems} />}
                {!scrollOpen && active && engineItems.length > 0 && (
                  <DockMenu className="navrya-dock-engine" tone="outlined" label={engineLabel || active.label} glyph={<ModelGlyph model={active} size={18} />} items={engineItems} />
                )}
                {/* A separate Voice control only while there is typed text: the primary button
                    below is then Send, so this is the one way to go to Voice without deleting the
                    text. With an empty input the primary button already IS Voice - showing a
                    second, identical Voice button next to it was the duplicate the capsule redesign
                    removes ("one job per button"). */}
                {onVoiceToggle && showSend && (
                  <DockButton className="navrya-dock-mic" icon="mic" label={voiceLabels.start} disabled={busy} onClick={onVoiceToggle} size={40} radius={13} />
                )}
                <DockButton
                  icon={showSend ? 'arrow-up' : 'audio-lines'}
                  tone="primary" size={44} radius={14} disabled={showSend && !ready}
                  className="navrya-dock-primary-action" label={showSend ? sendLabel : voiceLabels.start}
                  onClick={mainAction}
                />
              </div>
            </div>
          )}
          {!idle && voiceMinimized && (
            <VoiceMiniBar
              companion={companion} joinedTop={surfaceJoined && !welded}
              voiceState={voiceState} voiceMuted={voiceMuted} dotColor={dotColor} phaseLabel={phaseLabel}
              elapsedSeconds={voiceElapsed} onExpand={() => setVoiceMinimized(false)} onVoiceToggle={onVoiceToggle} onVoiceEnd={onVoiceEnd}
              getVoiceMediaStream={getVoiceMediaStream}
              strings={{ expand: voiceLabels.expand, close: voiceLabels.close }}
            />
          )}
          {!idle && !voiceMinimized && (
            <VoiceConsole
              companion={companion} joinedTop={surfaceJoined && !welded && !anchored} layout={dockLayout} laneHeight={inLane ? sideLane.height : null}
              voiceState={voiceState} voiceMuted={voiceMuted} model={active} elapsedSeconds={voiceElapsed}
              dotColor={dotColor} phaseLabel={phaseLabel} phaseCaption={phaseCaption}
              voicePermissionDenied={voicePermissionDenied} voiceHeardText={voiceHeardText} voiceReplyCaption={voiceReplyCaption}
              voiceManualFinishPending={voiceManualFinishPending} voiceSupportsManualFinish={voiceSupportsManualFinish}
              voiceSupportsLiveCaption={voiceSupportsLiveCaption}
              dir={dir} numberFormat={numberFormat}
              formVoice={formVoice} formVoiceLabels={formVoiceLabels} onFormVoiceChoice={onFormVoiceChoice} onFormVoiceSkip={onFormVoiceSkip} onFormVoiceLater={onFormVoiceLater}
              onVoiceToggle={onVoiceToggle} onVoiceEnd={onVoiceEnd} onVoiceMuteToggle={onVoiceMuteToggle} onVoiceInterrupt={onVoiceInterrupt}
              onVoiceEndMessage={onVoiceEndMessage}
              onMinimize={anchored ? () => setAnchorDismissed(true) : () => setVoiceMinimized(true)} getVoiceMediaStream={getVoiceMediaStream}
              engineMenu={list && onModelChange ? { items: engineItems, glyph: active ? <ModelGlyph model={active} size={13} /> : null, label: active && active.label } : null}
              strings={{
                minimize: voiceLabels.minimize, expand: voiceLabels.expand, close: voiceLabels.close,
                mute: voiceLabels.mute, unmute: voiceLabels.unmute, type: voiceLabels.type, stopReply: voiceLabels.stopReply,
                endMessage: voiceLabels.endMessage, endingMessage: voiceLabels.endingMessage,
                captionsOn: voiceLabels.captionsOn, captionsOff: voiceLabels.captionsOff, analysing: voiceLabels.analysing,
                listeningPlaceholder: voiceLabels.listeningPlaceholder, heardLabel: voiceLabels.heardLabel, replyLabel: voiceLabels.replyLabel,
                deniedTitle: voiceLabels.deniedTitle, deniedBody: voiceLabels.deniedBody, retry: voiceLabels.retry,
                errorLabel: voiceErrorLabel || voiceLabels.error
              }}
            />
          )}
        </div>
      </div>
    </DockLayoutContext.Provider>
  );
}

// Re-exported so the reply header can reuse the exact menu.
export { DockMenu };
