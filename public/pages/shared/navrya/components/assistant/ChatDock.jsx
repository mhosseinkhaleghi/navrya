import React from 'react';
import { useAssistantMotion } from './motion.js';
import { DockButton, Waveform } from './DockButton.jsx';
import { ModelSwitcher, ModelMascot } from './ModelSwitcher.jsx';

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
   controls" precedent rather than reopening it. */
var POPOVER_SHORT_REPLY_ALLOWANCE_PX = 130;

// Ties each real Journey E VOICE_STATES value (navrya-src/aiVoiceRealtime.js) to what the button
// actually looks like and does - the single source of truth so the icon/tone/pulsing/label a user
// sees can never drift out of sync with the real underlying state again. IDLE/ERROR intentionally
// fall through to the same ghost, non-pulsing default below (their own dedicated handling lives in
// the render code, since IDLE has no status pill at all and ERROR needs the caller's own message).
var VOICE_STATE_ICON = {
  requesting_permission: 'mic', connecting: 'mic', listening: 'mic', user_speaking: 'mic',
  processing: 'mic', assistant_speaking: 'volume-2', interrupted: 'mic', reconnecting: 'mic'
};
// Distinct dot colour per state family - connecting/processing (getting ready) vs. live audio
// (listening/speaking) are visually different even though both pulse, per the spec's own
// "unmistakable" requirement (not just one colour for every non-idle state).
var VOICE_STATE_DOT = {
  requesting_permission: 'var(--warn,#e2b04a)', connecting: 'var(--warn,#e2b04a)', reconnecting: 'var(--warn,#e2b04a)',
  processing: 'var(--warn,#e2b04a)',
  listening: 'var(--char-accent)', user_speaking: 'var(--char-accent)', interrupted: 'var(--char-accent)',
  assistant_speaking: 'var(--char-accent)'
};

/* Small "[ state • label ]" pill - the always-visible, text-based state readout the spec asks
   for (not just a few-pixel icon colour change). Only ever rendered for a real, active voice
   state; IDLE has no pill (nothing to announce) and ERROR uses its own red variant inline below. */
function VoiceStatusPill({ label, dotColor, pulsing = true }) {
  return (
    <span
      role="status" aria-live="polite" title={label}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, flex: '0 1 auto', minWidth: 0,
        // Found via real browser testing: the localized permission-denied error message is long
        // enough on its own to squeeze the flexible text input (flex:1, minWidth:0) down to zero
        // visible width in the same row - capped + truncated here so the input NEVER loses its
        // space; the full untruncated text is still reachable via this same element's own title
        // and the Voice button's own aria-label/title (see ChatDock's caller below).
        maxWidth: 240, overflow: 'hidden',
        padding: '4px 10px 4px 8px', borderRadius: 'var(--radius-pill)',
        background: 'rgba(244,234,215,.06)', border: '1px solid var(--border-hairline)',
        font: 'var(--type-caption)', color: 'var(--text-primary)', whiteSpace: 'nowrap'
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 7, height: 7, borderRadius: '50%', background: dotColor, flex: 'none',
          animation: pulsing ? 'navrya-halo 1150ms var(--ease-standard) infinite' : 'none'
        }}
      />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
    </span>
  );
}

export function ChatDock({
  placeholder = 'Ask anything',
  listeningPlaceholder = 'Listening…',
  value, onValueChange, onSubmit, onAdd, addLabel, addActive,
  onNewChat, newChatLabel, onHistory, historyLabel, historyActive,
  onToggleTherapist, therapistActive, therapistLabel,
  // Journey E ChatDock voice-UX repair: one real Voice control, driven directly off
  // aiVoiceRealtime.js's own VOICE_STATES (never a collapsed boolean) so every distinct state the
  // adapter can report is actually distinguishable on screen, not folded into "listening: true".
  voiceState = 'idle', voiceMuted = false, onVoiceToggle, onVoiceMuteToggle, voiceErrorLabel, voiceLabels = {},
  busy = false, width = 680, hint,
  models, model, onModelChange, mascot = true, children,
  dir = 'ltr',
  sendLabel = 'Send',
  style, ...rest
}) {
  var listening = voiceState !== 'idle' && voiceState !== 'error';
  useAssistantMotion();
  const [focused, setFocused] = React.useState(false);
  const text = value || '';
  const ready = !!text.trim() && !busy;

  const submit = () => {
    if (!ready) return;
    if (onSubmit) onSubmit(text.trim());
  };

  const list = models && models.length ? models : null;
  const active = list ? (list.find((m) => m.id === model) || list[0]) : null;
  const withMascot = !!(active && mascot);

  // Measures the input row's real rendered (border-box, visual) height so the popover (a
  // separate fixed element) and Modal.jsx's own reserved-bottom-space can both anchor/clear it
  // exactly - kept live via ResizeObserver rather than a guessed constant, since the row can
  // legitimately change height (therapist/history buttons appearing, RTL, font scaling).
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

  // Publishes the dock's own real reserved bottom footprint - its own `bottom` margin + the row's
  // real height + the popover's own gap AND typical-short-reply allowance (see the top-of-file
  // comment) - as a CSS custom property on the document root, so any other fixed-positioned UI on
  // the page - today, specifically Modal.jsx's own backdrop - can reserve the same space without
  // importing/knowing anything about ChatDock itself. Cleared on unmount (there is exactly one
  // ChatDock per character page, but this keeps the contract honest for any future page that
  // doesn't mount one).
  React.useEffect(() => {
    var root = document.documentElement;
    root.style.setProperty('--navrya-chat-dock-reserved', (24 + rowHeight + 12 + POPOVER_SHORT_REPLY_ALLOWANCE_PX) + 'px');
    return () => { root.style.removeProperty('--navrya-chat-dock-reserved'); };
  }, [rowHeight]);

  return (
    <React.Fragment>
      {children && (
        <div
          style={{
            position: 'fixed', left: 16, right: 16, bottom: 24 + rowHeight + 12, margin: '0 auto',
            zIndex: 70, maxWidth: width, pointerEvents: 'none'
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
        <div
          ref={rowRef}
          data-navrya-chat-dock=""
          style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px 9px 12px', boxSizing: 'border-box',
          flex: 1, minWidth: 0,
          borderRadius: 'var(--radius-pill)',
          border: '1px solid ' + (focused ? 'var(--border-gold-strong)' : 'var(--border-gold)'),
          background: 'linear-gradient(180deg,color-mix(in srgb,var(--char-active-surface) 46%,rgba(17,27,28,.94)),color-mix(in srgb,var(--char-active-surface) 26%,rgba(7,11,15,.96)))',
          backdropFilter: 'blur(12px)',
          boxShadow: focused
            ? 'var(--shadow-panel),var(--glow-soft),var(--shadow-inset-hairline)'
            : 'var(--shadow-panel),var(--shadow-inset-hairline)',
          transition: 'border-color 200ms var(--ease-out),box-shadow 200ms var(--ease-out),background 200ms var(--ease-out)'
        }}>
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
            {voiceState !== 'idle' && (
              <VoiceStatusPill
                label={
                  (voiceState === 'error'
                    ? (voiceErrorLabel || voiceLabels.error)
                    : ({
                      requesting_permission: voiceLabels.requestingPermission, connecting: voiceLabels.connecting,
                      listening: voiceLabels.listening, user_speaking: voiceLabels.userSpeaking,
                      processing: voiceLabels.processing, assistant_speaking: voiceLabels.speaking,
                      interrupted: voiceLabels.listening, reconnecting: voiceLabels.reconnecting
                    }[voiceState])
                  ) + (voiceMuted && voiceState !== 'error' ? ' · ' + voiceLabels.muted : '')
                }
                dotColor={voiceState === 'error' ? 'var(--danger,#e05a5a)' : VOICE_STATE_DOT[voiceState]}
                pulsing={voiceState !== 'error'}
              />
            )}
            {(voiceState === 'listening' || voiceState === 'user_speaking' || voiceState === 'assistant_speaking') && <Waveform />}
            <input
              type="text" value={text}
              placeholder={(voiceState === 'listening' || voiceState === 'user_speaking') ? listeningPlaceholder : placeholder}
              onChange={(e) => onValueChange && onValueChange(e.target.value)}
              onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
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
            {/* Mute only ever appears once a real Voice session is live - muting a session that
                doesn't exist yet has nothing to act on, and showing it beforehand would be a
                second, redundant voice-ish control right next to the one real entry point below
                (the exact ambiguity this whole repair pass exists to remove). */}
            {listening && onVoiceMuteToggle && (
              <DockButton
                icon={voiceMuted ? 'mic-off' : 'mic'} active={voiceMuted}
                label={voiceMuted ? voiceLabels.unmute : voiceLabels.mute}
                onClick={onVoiceMuteToggle}
              />
            )}
            {onVoiceToggle && (
              <DockButton
                icon={voiceState === 'idle' || voiceState === 'error' ? 'mic' : (VOICE_STATE_ICON[voiceState] || 'mic')}
                tone={listening ? 'primary' : 'ghost'}
                danger={voiceState === 'error'}
                label={voiceState === 'idle' ? voiceLabels.start : voiceState === 'error' ? (voiceErrorLabel || voiceLabels.error) : voiceLabels.stop}
                onClick={onVoiceToggle}
              />
            )}
            <DockButton icon="arrow-up" tone="primary" disabled={!ready} label={sendLabel} onClick={submit} />
          </div>
        </div>
      </div>
    </React.Fragment>
  );
}
