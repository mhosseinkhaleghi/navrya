import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { useAssistantMotion } from './motion.js';
import { DockButton } from './DockButton.jsx';
import { ModelGlyph } from './ModelSwitcher.jsx';
import { VoiceConsole, VoiceMiniBar } from './VoiceConsole.jsx';
import { CompanionSigil } from './CompanionSigil.jsx';
import { DockLayoutContext, UNDER_DIALOG_ALLOWANCE_PX } from './dockLayout.js';
import {
  computeSideLane, sameLane, sideReservePx, sideForDir, isLaneViewport, isLaneDialog, SIDECAR_EDGE_PX
} from './dockSideLane.js';

/* Bottom-centre command bar: add, one line of intent, mic, send. Always fixed to the viewport -
   this is the single global assistant entry point for every character dashboard, not a
   per-panel widget. `children` renders above the bar (the reply popover) so the whole thing
   pops as one composition. Tints itself off `--char-accent`/`--char-glow`, so it must be
   mounted under a `data-character="..."` ancestor (see chatDockView.jsx) to pick up that
   character's colour rather than the default gold.

   The input row and the reply popover (`children`) are two independent position:fixed elements,
   not one shared stacking context, and deliberately sit at two different z-indices:

   - The input row stays reachable ABOVE any standard NAVRYA modal (Modal.jsx and every
     hand-rolled dialog that copies its exact zIndex:100 full-viewport backdrop) - before this
     split, that backdrop sat on top of this dock's old single zIndex:70 wrapper, silently making
     the chat input unreachable (visually covered and its clicks intercepted) the instant any
     modal opened. That broke the app's own "fill an already-open form conversationally" premise
     for every existing AI-registered flow (trade wizard, mental-health intake, etc.), not just
     the newer AI-opened ones - it just went unnoticed because nothing had exercised a real modal
     + real chat click together in an actual browser before.
   - The popover stays BELOW that same modal layer. A child cannot be raised above a sibling of
     its ancestor by giving the child its own z-index - once a parent wrapper is itself raised
     above the modal, everything nested inside paints as one atomic unit at that level, popover
     included. Simply raising the old single wrapper (as a first pass) fixed the input but made
     the popover cover the modal's own interactive fields instead (a real dialog is tall enough,
     and the popover close enough to the same screen band, that this reliably collided) - a
     strict regression on top of the original bug. Splitting into two fixed elements is what
     actually lets "the input stays clickable" and "the popover doesn't block the modal's own
     controls" both be true at once.

   200 is reserved for the rare full-screen image lightbox (navrya-src/sessionEntryCardsView.jsx);
   150 keeps the input row safely below that and above every zIndex:100 modal. The popover keeps
   the dock's original 70, the same level every other non-modal page content already reasons
   about (e.g. Select.jsx's own dropdown listbox at 40) - deliberately NOT raised above the modal
   (see the regression this already caused, above): instead, geometry does the work. Every render
   this component publishes its own real reserved bottom footprint - the dock row's real height
   PLUS a fixed allowance for a typical SHORT popover reply (the size a workflow slot-filling
   question actually is, per this app's own "keep these questions short" convention - not the
   popover's rare full ~360px scrollable-thread maximum, which would waste too much of every
   modal's usable height for an uncommon case) - as `--navrya-chat-dock-reserved` on the document
   root. Modal.jsx's own backdrop reserves that same space at its own bottom edge, so in the
   common case (a short workflow question) the popover and the modal's card simply never occupy
   the same pixels at all, regardless of which one has the higher z-index - an unusually long
   reply while a modal also happens to be open is the one bounded, rare case where the popover
   can still be partially covered, exactly matching this file's own "must not cover the modal's
   controls" precedent rather than reopening it.

   Voice Mode (Journey E UI pass, matches NavryaVoiceMode.dc.html): once voiceState leaves 'idle'
   this row is entirely replaced - VoiceMiniBar or the full VoiceConsole (components/assistant/
   VoiceConsole.jsx) - rather than coexisting with the plain typing row (confirmed design: voice
   mode is a distinct mode you enter/exit, not simultaneous with typing; "Type"/Esc in the console
   is what returns here). The row's own primary button is the real dual-purpose control the design
   specifies ("two jobs, one button"): empty text -> starts Voice, typed text -> Send, icon AND
   onClick both switch together (never just the icon - see ai-voice-chatdock-ux.test.mjs's own
   "no decoy button" guard, which this preserves under its new shape).

   Companion capsule redesign (artbook plates III/IV/VII): three changes on top of all of the above,
   none of which touches the z-index policy or the reserved-bottom contract.
   - One body: while a reply is showing (`surfaceJoined`), the reply panel and this row meet flush
     (no gap, the panel's bottom corners and this row's top corners squared off) so the two
     separately-stacked elements read as one capsule instead of two floating boxes.
   - The engine's floating mascot beside the row is gone: the row starts with the character's own
     portrait (CompanionSigil) - the character is the companion, the engine is a label.
   - Beside the modal: when a real dialog is open on a wide viewport, both elements move into a
     lane beside the dialog (dockSideLane.js) at the SAME z-index 150, because the lane is outside
     the dialog's rect by construction - the reason the reply normally stays at 70 (it must not
     cover the dialog's own fields) cannot apply there. The lane is only used when it measurably
     clears the dialog.
   - Under the dialog (capsule exact pass): with a dialog open and no lane (a smaller screen, or a
     dialog that cannot make room), the capsule stays at the bottom in the band the dialog's
     backdrop reserves, and a reply shows as a short peek (UNDER_DIALOG_ALLOWANCE_PX) in that same
     band at 150 - still never over the dialog. The dock marks the open dialog's backdrop with
     data-navrya-dock-host="side"|"under" so responsive.css reserves the lane/band for EVERY dialog
     backdrop, including the hand-rolled ones that never read the CSS variables themselves.
   - Composer (capsule exact pass): portrait, input, a "+" tools menu (attach, new chat, history,
     therapist mode), an engine button whose menu switches the engine, and the one primary
     Voice/Send button - the design's composer, with every previous control still reachable. */
var POPOVER_SHORT_REPLY_ALLOWANCE_PX = 130;
// NAVRYA chat dock redesign (NavryaChatDock.dc.html): in the design, the header/stream and the
// input row are ONE continuous rounded-rect panel with no visible seam. This dock keeps them as
// two independently z-indexed elements (see the file-header comment - a real, load-bearing fix
// for a modal-collision bug, not something to undo), but a small, near-hairline gap plus a
// MATCHING corner radius (both surfaces now use the same `--radius-14` the panel already does,
// replacing this row's old fully-round pill shape) reads as one connected visual unit instead of
// two unrelated floating pieces - the actual, previously-missing "shape" fix.
// Tightened further (6 -> 2) on real user feedback that the panel and dock still read as two
// separate pieces, not one flush, level unit - 2px is the smallest gap that still avoids the two
// stacked surfaces' own rounded corners visually pinching into each other at the seam (both keep
// all four corners rounded - see ChatResponsePopover.jsx's/this file's own --radius-14 match).
var PANEL_TO_DOCK_GAP_PX = 2;
// Companion capsule redesign: a reply panel rendered with `joined` (ChatResponsePopover) has no
// bottom corners or border of its own - it sits directly on this row with no gap at all. The 2px
// gap above still applies to the unjoined surfaces (history dropdown, companion card).
var JOINED_GAP_PX = 0;
var DOCK_BOTTOM_PX = 24;
var CAPSULE_RADIUS_PX = 20;

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

/* One composer button with a small menu that opens upward (the "+" tools menu and the engine
   menu). Closes on a pick, Escape, or any press outside. `items`: { key, label, icon | glyph,
   active, onSelect, role } - role 'menuitemradio'/'menuitemcheckbox' reports `active` as checked. */
function DockMenu({ icon, glyph, label, items, className }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return undefined;
    function onDown(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  const shown = items.filter(Boolean);
  if (!shown.length) return null;
  return (
    <span ref={ref} className={className} style={{ position: 'relative', display: 'inline-flex', flex: 'none' }}>
      <button
        type="button" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open ? 'true' : 'false'}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: 40, height: 40, flex: 'none', display: 'grid', placeItems: 'center', padding: 0, cursor: 'pointer',
          borderRadius: 13, border: '1px solid ' + (open ? 'color-mix(in srgb,var(--char-accent) 55%,transparent)' : 'var(--border-hairline)'),
          background: open ? 'var(--char-active-surface)' : 'transparent', color: open ? 'var(--char-accent)' : 'var(--text-muted)',
          transition: 'background 160ms var(--ease-out),border-color 160ms var(--ease-out),color 160ms var(--ease-out)'
        }}
      >
        {glyph || <Icon name={icon} size={18} />}
      </button>
      {open && (
        <span role="menu" aria-label={label} style={{
          position: 'absolute', bottom: 'calc(100% + 12px)', insetInlineEnd: 0, zIndex: 3, minWidth: 220, maxWidth: 'calc(100vw - 32px)',
          display: 'flex', flexDirection: 'column', gap: 2, padding: 6, boxSizing: 'border-box',
          borderRadius: 14, border: '1px solid var(--border-gold)', background: 'var(--overlay-500)',
          boxShadow: '0 18px 44px rgba(0,0,0,.6)', animation: 'navrya-pop-in 180ms var(--ease-out) both'
        }}>
          {shown.map((item) => (
            <button
              key={item.key} type="button" role={item.role || 'menuitem'}
              aria-checked={item.role && item.role !== 'menuitem' ? (item.active ? 'true' : 'false') : undefined}
              onClick={() => { setOpen(false); if (item.onSelect) item.onSelect(); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, height: 42, padding: '0 10px', boxSizing: 'border-box', cursor: 'pointer',
                borderRadius: 10, border: 0, textAlign: 'start', whiteSpace: 'nowrap',
                background: item.active ? 'var(--char-active-surface)' : 'transparent',
                color: item.active ? 'var(--char-accent)' : 'var(--text-primary)', font: 'var(--type-body)', fontSize: 13.5
              }}
            >
              <span style={{ width: 26, height: 26, flex: 'none', borderRadius: 8, display: 'grid', placeItems: 'center', background: 'rgba(244,234,215,.05)', color: 'inherit' }}>
                {item.glyph || <Icon name={item.icon} size={15} />}
              </span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
              {item.active && <Icon name="check" size={14} />}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

export function ChatDock({
  placeholder = 'Ask anything',
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
  // Journey G UX correction: the one real "the user just deliberately engaged with the dock"
  // signal - fired alongside the existing local `focused` styling state, never replacing it.
  // chatDockView.jsx uses this to gate the first-run Companion welcome card behind an explicit
  // open gesture instead of showing it the instant the dock merely mounts.
  onInputFocus,
  // Companion capsule redesign: `companion` is { name, portrait } for the active character (see
  // chatDockView.jsx). `surfaceJoined` is true only while a real reply panel is showing, so it can
  // meet this row flush. `sideLaneEnabled` lets a caller opt out of the beside-the-modal lane.
  companion, surfaceJoined = false, sideLaneEnabled = true,
  // Capsule exact pass: the accessible name of the "+" tools menu (falls back to addLabel).
  toolsLabel,
  busy = false, width = 680, hint,
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

  const submit = () => {
    if (!ready) return;
    if (onSubmit) onSubmit(text.trim());
  };
  const mainAction = () => { if (showSend) submit(); else if (onVoiceToggle) onVoiceToggle(); };

  const list = models && models.length ? models : null;
  const active = list ? (list.find((m) => m.id === model) || list[0]) : null;

  // Placement (see the top-of-file comment, dockSideLane.js and dockLayout.js): 'free' with no
  // dialog open, 'side' in the lane beside an open dialog, 'under' when a dialog is open but no
  // lane fits. Recomputed from the real DOM whenever nodes are added/removed (a dialog mounting or
  // unmounting), on viewport resize, and whenever the chosen dialog's own box changes size. Only
  // ever setState()s when something genuinely changed, so the dock's own re-renders can never loop.
  const dockRef = React.useRef(null);
  const [dockMode, setDockMode] = React.useState('free');
  const [sideLane, setSideLane] = React.useState(null);
  React.useEffect(() => {
    if (!sideLaneEnabled || typeof window === 'undefined' || typeof document === 'undefined') return undefined;
    const root = document.documentElement;
    const side = sideForDir(dir);
    // A dialog that still overlaps the lane after the reserve was published is never retried for
    // the lane (it goes 'under'), so it can never flicker between placements.
    const refused = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
    let frame = 0;
    let disposed = false;
    let observedDialog = null;
    let dialogObserver = null;
    let hostEl = null;

    function publishSide(on) {
      root.style.setProperty('--navrya-chat-dock-side-' + side, on ? sideReservePx() + 'px' : '0px');
      root.style.setProperty('--navrya-chat-dock-side-' + (side === 'left' ? 'right' : 'left'), '0px');
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
    function commit(mode, lane) {
      setDockMode((prev) => (prev === mode ? prev : mode));
      setSideLane((prev) => (sameLane(prev, lane) ? prev : lane));
    }
    function compute() {
      frame = 0;
      if (disposed) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const dialog = findDialog();
      watch(dialog);
      if (!dialog) { setHost(null); publishSide(false); commit('free', null); return; }
      const host = findBackdrop(dialog);
      if (isLaneViewport(vw) && !(refused && refused.has(dialog))) {
        // Publishing the reserve first lets the dialog re-centre into the rest of the viewport;
        // getBoundingClientRect() then reads its real post-reserve position synchronously.
        setHost(host, 'side');
        publishSide(true);
        const lane = computeSideLane({ viewportWidth: vw, viewportHeight: vh, dir, dialogRect: dialog.getBoundingClientRect() });
        if (lane) { commit('side', lane); return; }
        if (refused) refused.add(dialog);
      }
      publishSide(false);
      setHost(host, 'under');
      commit('under', null);
    }
    function schedule() {
      if (!frame && !disposed) frame = window.requestAnimationFrame(compute);
    }

    const mutations = typeof MutationObserver !== 'undefined' ? new MutationObserver(schedule) : null;
    if (mutations && document.body) mutations.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', schedule);
    schedule();
    return () => {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      if (mutations) mutations.disconnect();
      if (dialogObserver) dialogObserver.disconnect();
      window.removeEventListener('resize', schedule);
      setHost(null);
      root.style.removeProperty('--navrya-chat-dock-side-left');
      root.style.removeProperty('--navrya-chat-dock-side-right');
      setDockMode('free');
      setSideLane(null);
    };
  }, [sideLaneEnabled, dir]);
  const inLane = dockMode === 'side' && !!sideLane;
  const underDialog = dockMode === 'under';
  const dockLayout = inLane ? 'side' : underDialog ? 'under' : 'bottom';

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

  // Measures the input row's real rendered (border-box, visual) height so the popover (a
  // separate fixed element) and Modal.jsx's own reserved-bottom-space can both anchor/clear it
  // exactly - kept live via ResizeObserver rather than a guessed constant, since the row can
  // legitimately change height (therapist/history buttons appearing, RTL, font scaling, or the
  // voice console's own much taller panel while a session is live).
  //
  // Found via real browser measurement (production repair pass): ResizeObserverEntry.contentRect
  // reports the CONTENT box only - it excludes this row's own 9px top/bottom padding, so the
  // popover/gap math below was under-measuring the row by ~18-20px and visibly overlapping it.
  // el.offsetHeight is the actual border-box height (padding + border included, matching
  // getBoundingClientRect()) - the number every consumer of rowHeight here actually needs.
  const rowRef = React.useRef(null);
  const [rowHeight, setRowHeight] = React.useState(56);
  React.useEffect(() => {
    const el = rowRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => setRowHeight(el.offsetHeight));
    observer.observe(el);
    setRowHeight(el.offsetHeight);
    return () => observer.disconnect();
  }, []);

  // fix/voice-mode-turn-ux (Part E): the response/companion/history surface (`children` below) used
  // to center itself independently (`left:16,right:16,margin:'0 auto',maxWidth:width`) while the
  // dock ROW visually sits inside a wider outer box that also reserves a start-side lane for the
  // mascot column - and that lane is not a fixed 52px: ModelMascot renders a real text label (the
  // provider name, e.g. "DeepSeek") BELOW the glyph with `whiteSpace:'nowrap'`, on a `flex:'none'`
  // wrapper with no explicit width, so the lane's real rendered width is
  // `max(52px, textWidth(providerName))`, not the hardcoded 66px (52 + the 14px gap) this file used
  // to assume. The dock row's own visible content is therefore genuinely off-center relative to the
  // outer box (and to the independently-centered popover) by however much the real mascot lane
  // exceeds 52px, on whichever side the mascot renders (which itself flips with RTL/LTR).
  //
  // The fix: measure the row's OWN real rendered rect (getBoundingClientRect - already exactly
  // where the browser placed it, correctly accounting for the real mascot lane width, RTL/LTR, and
  // anything else affecting layout) and position the popover using those same physical left/width
  // values directly, instead of recomputing centering independently. A ResizeObserver alone is not
  // enough here (it only fires when the observed element's own BOX SIZE changes, not when it merely
  // moves - e.g. a pure viewport resize that re-centers an already-at-max-width row) - paired with a
  // window resize/orientation listener for that case.
  const [dockSurfaceRect, setDockSurfaceRect] = React.useState(null);
  React.useEffect(() => {
    const el = rowRef.current;
    if (!el) return undefined;
    function measure() {
      const rect = el.getBoundingClientRect();
      setDockSurfaceRect({ left: rect.left, width: rect.width });
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
  }, [dir, inLane]);

  // Publishes the dock's own real reserved bottom footprint - its own `bottom` margin + the row's
  // real height + the popover's own gap AND typical-short-reply allowance (see the top-of-file
  // comment) - as a CSS custom property on the document root, so any other fixed-positioned UI on
  // the page - Modal.jsx's own backdrop, and every other dialog backdrop through responsive.css's
  // data-navrya-dock-host rule - can reserve the same space without importing/knowing anything
  // about ChatDock itself. Cleared on unmount (there is exactly one ChatDock per character page,
  // but this keeps the contract honest for any future page that doesn't mount one).
  // Capsule exact pass: in the side lane the dock is not at the bottom at all, so it reserves 0
  // (the dialog gets its full height back - the cut-off form in the lane was this reserve); under
  // a dialog it reserves exactly its row plus the reply peek band.
  React.useEffect(() => {
    var root = document.documentElement;
    var reserved = dockMode === 'side'
      ? 0
      : dockMode === 'under'
        ? DOCK_BOTTOM_PX + rowHeight + JOINED_GAP_PX + UNDER_DIALOG_ALLOWANCE_PX
        : 24 + rowHeight + PANEL_TO_DOCK_GAP_PX + POPOVER_SHORT_REPLY_ALLOWANCE_PX;
    root.style.setProperty('--navrya-chat-dock-reserved', reserved + 'px');
    return () => { root.style.removeProperty('--navrya-chat-dock-reserved'); };
  }, [rowHeight, dockMode]);

  const dotColor = voiceState === 'error' ? 'var(--danger,#e05a5a)' : voiceMuted ? 'var(--steel)' : (VOICE_STATE_DOT[voiceState] || 'var(--char-accent)');
  const phaseLabel = voicePhaseLabel(voiceState, voiceMuted, voiceErrorLabel, voiceLabels);
  const phaseCaption = voicePhaseCaption(voiceState, voiceMuted, voicePermissionDenied, voiceErrorLabel, voiceLabels);

  // Where the row sits: bottom-centre as always, or the beside-the-modal lane.
  const dockBottom = inLane ? sideLane.bottom : DOCK_BOTTOM_PX;
  const surfaceGap = surfaceJoined ? JOINED_GAP_PX : PANEL_TO_DOCK_GAP_PX;
  const hasSurface = React.Children.toArray(children).length > 0;
  const dockPlacement = inLane
    ? { position: 'fixed', [sideLane.side]: SIDECAR_EDGE_PX, bottom: sideLane.bottom, width: sideLane.width, maxWidth: sideLane.width, margin: 0 }
    : { position: 'fixed', left: 16, right: 16, bottom: DOCK_BOTTOM_PX, margin: '0 auto', maxWidth: width };
  // The row's own corners: squared on top while a joined reply panel sits on it.
  const rowRadius = surfaceJoined ? `0 0 ${CAPSULE_RADIUS_PX}px ${CAPSULE_RADIUS_PX}px` : CAPSULE_RADIUS_PX;
  const sigilState = busy ? 'thinking' : 'idle';
  // The reply's height: capped to the lane in 'side', to the reserved peek band in 'under'.
  const surfaceCap = inLane
    ? { maxHeight: Math.max(0, sideLane.height - rowHeight), overflowY: 'auto' }
    : underDialog ? { maxHeight: UNDER_DIALOG_ALLOWANCE_PX, overflowY: 'auto' } : null;

  // "+" tools menu: every secondary control the old row showed inline, now one tap away.
  const toolItems = [
    onAdd && { key: 'attach', icon: 'image', label: addLabel, active: addActive, onSelect: onAdd },
    onNewChat && { key: 'new', icon: 'square-pen', label: newChatLabel, onSelect: onNewChat },
    onHistory && { key: 'history', icon: 'history', label: historyLabel, active: historyActive, onSelect: onHistory },
    onToggleTherapist && { key: 'therapist', icon: 'psychology', label: therapistLabel, active: therapistActive, role: 'menuitemcheckbox', onSelect: onToggleTherapist }
  ];
  // Engine menu: the same models/onModelChange the ModelSwitcher glyph row used.
  const engineItems = list && onModelChange
    ? list.map((m) => ({ key: m.id, role: 'menuitemradio', label: m.label, glyph: <ModelGlyph model={m} size={15} />, active: active && m.id === active.id, onSelect: () => onModelChange(m.id) }))
    : [];

  return (
    <DockLayoutContext.Provider value={dockLayout}>
      {hasSurface && (
        <div
          data-navrya-assistant="response-surface"
          style={{
            position: 'fixed', bottom: dockBottom + rowHeight + surfaceGap, boxSizing: 'border-box',
            // 70 below modals at the bottom (see the top-of-file comment). 150 beside a dialog (the
            // lane is outside the dialog's rect by construction) and under one (the band the
            // dialog's backdrop reserves below it) - in neither is there anything of the dialog's
            // to cover, and at 70 the reply would sit dimmed under the dialog's scrim.
            zIndex: dockLayout === 'bottom' ? 70 : 150, pointerEvents: 'none',
            ...surfaceCap,
            // fix/voice-mode-turn-ux (Part E): once the real dock row rect has been measured, this
            // surface is pinned to those EXACT physical left/width values - its left/right edges
            // then match the real, visible dock input surface within, in practice, well under 1px
            // (both read from the browser's own layout in the same tick). Before the first
            // measurement (or in a legacy/test render with no ResizeObserver support at all), it
            // falls back to the previous independent-centering behavior so nothing ever renders at
            // 0-width/off-screen.
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
        data-navrya-assistant="dock" data-navrya-dock-layout={dockLayout} dir={dir}
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
                display: 'flex', alignItems: 'center', gap: 8, padding: '12px', minHeight: 68, boxSizing: 'border-box',
                // Companion capsule redesign: one opaque body with the reply panel above it (no
                // see-through blur, so page content never bleeds through), squared top corners
                // while joined, and the joint drawn as a hairline instead of a second gold edge.
                borderRadius: rowRadius,
                border: '1px solid var(--border-gold-strong)',
                borderTop: surfaceJoined ? '1px solid var(--border-hairline)' : undefined,
                background: surfaceJoined
                  ? '#0A0D12'
                  : 'linear-gradient(180deg,color-mix(in srgb,var(--char-accent) 11%,#0B0E14) 0%,#0B0E14 60%,#0A0D12 100%)',
                boxShadow: focused
                  ? '0 26px 64px rgba(0,0,0,.6),var(--glow-soft),inset 0 1px 0 rgba(244,234,215,.12)'
                  : '0 26px 64px rgba(0,0,0,.6),0 0 40px var(--char-glow),inset 0 1px 0 rgba(244,234,215,.12)',
                transition: 'border-color 200ms var(--ease-out),box-shadow 200ms var(--ease-out),background 200ms var(--ease-out)'
              }}
            >
              {/* The character's own portrait opens the row. Purely decorative (no onClick), and
                  hidden on phones by the same .navrya-dock-mascot rule the old engine mascot used. */}
              <CompanionSigil className="navrya-dock-mascot" portrait={companion && companion.portrait} size={40} state={sigilState} />
              <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="text" value={text}
                  placeholder={placeholder}
                  onChange={(e) => onValueChange && onValueChange(e.target.value)}
                  onFocus={() => { setFocused(true); if (onInputFocus) onInputFocus(); }} onBlur={() => setFocused(false)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
                  aria-label={placeholder} disabled={busy}
                  style={{
                    width: '100%', minWidth: 0, height: 44, border: 0, background: 'transparent', padding: '0 4px',
                    font: 'var(--type-body)', fontSize: 14.5, color: 'var(--text-primary)', caretColor: 'var(--char-accent)'
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
                <DockMenu className="navrya-dock-tools" icon="plus" label={toolsLabel || addLabel} items={toolItems} />
                {active && engineItems.length > 0 && (
                  <DockMenu className="navrya-dock-engine" label={active.label} glyph={<ModelGlyph model={active} size={18} />} items={engineItems} />
                )}
                {/* A separate Voice control only while there is typed text: the primary button
                    below is then Send, so this is the one way to go to Voice without deleting the
                    text. With an empty input the primary button already IS Voice - showing a
                    second, identical Voice button next to it (the old always-on mic) was the
                    duplicate the capsule redesign removes ("one job per button"). */}
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
              companion={companion} joinedTop={surfaceJoined}
              voiceState={voiceState} voiceMuted={voiceMuted} dotColor={dotColor} phaseLabel={phaseLabel}
              elapsedSeconds={voiceElapsed} onExpand={() => setVoiceMinimized(false)} onVoiceToggle={onVoiceToggle} onVoiceEnd={onVoiceEnd}
              getVoiceMediaStream={getVoiceMediaStream}
              strings={{ expand: voiceLabels.expand, close: voiceLabels.close }}
            />
          )}
          {!idle && !voiceMinimized && (
            <VoiceConsole
              companion={companion} joinedTop={surfaceJoined}
              voiceState={voiceState} voiceMuted={voiceMuted} model={active} elapsedSeconds={voiceElapsed}
              dotColor={dotColor} phaseLabel={phaseLabel} phaseCaption={phaseCaption}
              voicePermissionDenied={voicePermissionDenied} voiceHeardText={voiceHeardText} voiceReplyCaption={voiceReplyCaption}
              voiceManualFinishPending={voiceManualFinishPending} voiceSupportsManualFinish={voiceSupportsManualFinish}
              voiceSupportsLiveCaption={voiceSupportsLiveCaption}
              onVoiceToggle={onVoiceToggle} onVoiceEnd={onVoiceEnd} onVoiceMuteToggle={onVoiceMuteToggle} onVoiceInterrupt={onVoiceInterrupt}
              onVoiceEndMessage={onVoiceEndMessage}
              onMinimize={() => setVoiceMinimized(true)} getVoiceMediaStream={getVoiceMediaStream}
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

