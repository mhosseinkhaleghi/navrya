import React from 'react';
import { useAssistantMotion } from './motion.js';
import { DockButton } from './DockButton.jsx';
import { ModelSwitcher, ModelMascot } from './ModelSwitcher.jsx';
import { VoiceConsole, VoiceMiniBar } from './VoiceConsole.jsx';

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
   "no decoy button" guard, which this preserves under its new shape). */
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
  onVoiceToggle, onVoiceMuteToggle, onVoiceInterrupt, onVoiceEndMessage, voiceErrorLabel, voiceLabels = {},
  getVoiceMediaStream, voiceHeardText, voiceReplyCaption,
  // Journey G UX correction: the one real "the user just deliberately engaged with the dock"
  // signal - fired alongside the existing local `focused` styling state, never replacing it.
  // chatDockView.jsx uses this to gate the first-run Companion welcome card behind an explicit
  // open gesture instead of showing it the instant the dock merely mounts.
  onInputFocus,
  busy = false, width = 680, hint,
  models, model, onModelChange, mascot = true, children,
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
  const withMascot = !!(active && mascot);

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
  }, [dir]);

  // Publishes the dock's own real reserved bottom footprint - its own `bottom` margin + the row's
  // real height + the popover's own gap AND typical-short-reply allowance (see the top-of-file
  // comment) - as a CSS custom property on the document root, so any other fixed-positioned UI on
  // the page - today, specifically Modal.jsx's own backdrop - can reserve the same space without
  // importing/knowing anything about ChatDock itself. Cleared on unmount (there is exactly one
  // ChatDock per character page, but this keeps the contract honest for any future page that
  // doesn't mount one).
  React.useEffect(() => {
    var root = document.documentElement;
    root.style.setProperty('--navrya-chat-dock-reserved', (24 + rowHeight + PANEL_TO_DOCK_GAP_PX + POPOVER_SHORT_REPLY_ALLOWANCE_PX) + 'px');
    return () => { root.style.removeProperty('--navrya-chat-dock-reserved'); };
  }, [rowHeight]);

  const dotColor = voiceState === 'error' ? 'var(--danger,#e05a5a)' : voiceMuted ? 'var(--steel)' : (VOICE_STATE_DOT[voiceState] || 'var(--char-accent)');
  const phaseLabel = voicePhaseLabel(voiceState, voiceMuted, voiceErrorLabel, voiceLabels);
  const phaseCaption = voicePhaseCaption(voiceState, voiceMuted, voicePermissionDenied, voiceErrorLabel, voiceLabels);

  return (
    <React.Fragment>
      {children && (
        <div
          data-navrya-assistant="response-surface"
          style={{
            position: 'fixed', bottom: 24 + rowHeight + PANEL_TO_DOCK_GAP_PX, boxSizing: 'border-box',
            zIndex: 70, pointerEvents: 'none',
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
        data-navrya-assistant="dock" dir={dir}
        style={{
          position: 'fixed', left: 16, right: 16, bottom: 24, margin: '0 auto', zIndex: 150,
          maxWidth: width + (withMascot ? 66 : 0),
          display: 'flex', alignItems: 'flex-end', gap: 14, ...style
        }}
        {...rest}
      >
        {/* Purely decorative (no onClick of its own) - never allowed to sit in front of and
            swallow a click meant for whatever's underneath, e.g. a tall modal's own footer
            button in the same bottom-of-viewport band this raised z-index now shares with it. */}
        {withMascot && <ModelMascot model={active} size={52} style={{ flex: 'none', paddingBottom: 2, pointerEvents: 'none' }} />}

        <div ref={rowRef} data-navrya-assistant="dock-surface" style={{ flex: 1, minWidth: 0 }}>
          {idle && (
            <div
              data-navrya-chat-dock=""
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px 9px 12px', boxSizing: 'border-box',
                // NAVRYA chat dock redesign: matches the reply panel's own corner radius
                // (ChatResponsePopover.jsx) instead of the old fully-round pill shape, so the two
                // stacked surfaces (see PANEL_TO_DOCK_GAP_PX above) read as one connected unit.
                borderRadius: 'var(--radius-14)',
                border: '1px solid ' + (focused ? 'var(--border-gold-strong)' : 'var(--border-gold)'),
                background: 'linear-gradient(180deg,color-mix(in srgb,var(--char-active-surface) 46%,rgba(17,27,28,.94)),color-mix(in srgb,var(--char-active-surface) 26%,rgba(7,11,15,.96)))',
                backdropFilter: 'blur(12px)',
                boxShadow: focused
                  ? 'var(--shadow-panel),var(--glow-soft),var(--shadow-inset-hairline)'
                  : 'var(--shadow-panel),var(--shadow-inset-hairline)',
                transition: 'border-color 200ms var(--ease-out),box-shadow 200ms var(--ease-out),background 200ms var(--ease-out)'
              }}
            >
              <DockButton icon="plus" label={addLabel} active={addActive} onClick={onAdd} />
              {onNewChat && <DockButton icon="square-pen" label={newChatLabel} onClick={onNewChat} />}
              {onHistory && <DockButton icon="history" label={historyLabel} active={historyActive} onClick={onHistory} />}
              {list && (
                <React.Fragment>
                  <span aria-hidden="true" style={{ width: 1, height: 22, flex: 'none', background: 'var(--border-hairline)' }} />
                  <ModelSwitcher models={list} value={active.id} onChange={onModelChange} />
                  <span aria-hidden="true" style={{ width: 1, height: 22, flex: 'none', background: 'var(--border-hairline)' }} />
                </React.Fragment>
              )}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="text" value={text}
                  placeholder={placeholder}
                  onChange={(e) => onValueChange && onValueChange(e.target.value)}
                  onFocus={() => { setFocused(true); if (onInputFocus) onInputFocus(); }} onBlur={() => setFocused(false)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
                  aria-label={placeholder} disabled={busy}
                  style={{
                    width: '100%', minWidth: 0, border: 0, background: 'transparent', padding: 0,
                    font: 'var(--type-body)', color: 'var(--text-primary)', caretColor: 'var(--char-accent)'
                  }}
                />
              </div>
              {hint && (
                <span style={{
                  font: 'var(--type-caption)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase',
                  color: 'var(--text-muted)', whiteSpace: 'nowrap', flex: 'none'
                }}>{hint}</span>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
                {onToggleTherapist && (
                  <DockButton icon="psychology" label={therapistLabel} active={therapistActive} onClick={onToggleTherapist} />
                )}
                {/* NAVRYA chat dock redesign (NavryaChatDock.dc.html): a dedicated, always-
                    available mic shortcut, distinct from the dual-purpose end button below it -
                    that one only starts Voice when the input is already empty (typed text takes
                    priority as Send); this one switches to Voice immediately regardless of
                    whatever is currently typed, mirroring the design's own separate mic control
                    rather than a decorative duplicate of the same action. */}
                {onVoiceToggle && (
                  <DockButton icon="mic" label={voiceLabels.start} disabled={busy} onClick={onVoiceToggle} />
                )}
                <DockButton
                  icon={showSend ? 'arrow-up' : 'audio-lines'}
                  tone="primary" disabled={showSend && !ready}
                  label={showSend ? sendLabel : voiceLabels.start}
                  onClick={mainAction}
                />
              </div>
            </div>
          )}
          {!idle && voiceMinimized && (
            <VoiceMiniBar
              voiceState={voiceState} voiceMuted={voiceMuted} dotColor={dotColor} phaseLabel={phaseLabel}
              elapsedSeconds={voiceElapsed} onExpand={() => setVoiceMinimized(false)} onVoiceToggle={onVoiceToggle}
              getVoiceMediaStream={getVoiceMediaStream}
              strings={{ expand: voiceLabels.expand, close: voiceLabels.close }}
            />
          )}
          {!idle && !voiceMinimized && (
            <VoiceConsole
              voiceState={voiceState} voiceMuted={voiceMuted} model={active} elapsedSeconds={voiceElapsed}
              dotColor={dotColor} phaseLabel={phaseLabel} phaseCaption={phaseCaption}
              voicePermissionDenied={voicePermissionDenied} voiceHeardText={voiceHeardText} voiceReplyCaption={voiceReplyCaption}
              voiceManualFinishPending={voiceManualFinishPending}
              onVoiceToggle={onVoiceToggle} onVoiceMuteToggle={onVoiceMuteToggle} onVoiceInterrupt={onVoiceInterrupt}
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
    </React.Fragment>
  );
}
