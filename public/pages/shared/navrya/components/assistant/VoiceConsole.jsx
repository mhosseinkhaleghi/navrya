import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { useAssistantMotion } from './motion.js';
import { CompanionSigil } from './CompanionSigil.jsx';
import { CapsuleTop } from './CapsuleTop.jsx';
import { DockMenu } from './DockMenu.jsx';
import {
  accent, cardBackground, cardShadow, cardRadius, pillStyle, choiceStyle,
  EDGE, EDGE_WELD, EDGE_JOINT, TEXT, MUTED, DIM, GOLD, GREEN, DANGER, DANGER_EDGE, DIVIDER, HAIRLINE_STRONG
} from './dockDesign.js';

/* Voice Mode console. Replaces the plain ChatDock row for the whole lifetime of a voice session - the
   mic button's "console" and its collapsed "mini bar" live here, both driven off the real
   navrya-src/aiVoiceRealtime.js state machine (never a second, decorative one). One component, four
   shapes of the same capsule (artbook plates VIII, XIV-XVIII; layout comes from ChatDock):

   - console  (layout 'bottom' / 'under'): the voice capsule at the bottom - one status line, then one
              row: the portrait (its ring shows the phase), the waveform, the timer, mute, captions,
              back to typing, the one live action and end.
   - bar      (layout 'weld'): the same capsule welded to the bottom edge of an open dialog, the
              dialog's width - "the dialog and the bar are one piece". While a form is being filled it
              carries the question with the form's real field label, what was heard word for word, quick
              choices when the field has options, and the form's progress; the row adds "skip this field".
   - sidecar  (layout 'side'): for a form too long to leave room under it: the same content as a column
              beside the dialog - header, the form's checklist, the last things said.
   - anchor   (layout 'anchor'): a compact card that sits in a free corner of the page (the chart's
              corner beside a scenario card) instead of over the work.

   Two honest adaptations from the design, since the real transport can't do what a static drawing
   can:
   - The waveform is the real microphone level (AnalyserNode), not a fixed animation.
   - "Stop reply" (during ASSISTANT_SPEAKING) and "End message" (during USER_SPEAKING, only for a
     transport that can finish a turn early) are real actions the design's bar does not draw; they show
     as one extra icon button only while they can actually do something (this codebase's own "no decoy
     buttons" rule - see ai-voice-chatdock-ux.test.mjs). */

const SIGIL_STATE = {
  requesting_permission: 'thinking', connecting: 'thinking', reconnecting: 'thinking', processing: 'thinking',
  listening: 'listening', user_speaking: 'listening', interrupted: 'listening',
  assistant_speaking: 'speaking'
};

const VOICE_CONSOLE_CSS = `
@keyframes navrya-voice-ring{0%{transform:scale(.82);opacity:.5}100%{transform:scale(1.55);opacity:0}}
@keyframes navrya-voice-caret{0%,49%{opacity:1}50%,100%{opacity:0}}
`;

function useVoiceConsoleMotion() {
  React.useEffect(() => {
    if (typeof document === 'undefined' || document.getElementById('navrya-voice-console-motion')) return;
    const el = document.createElement('style');
    el.id = 'navrya-voice-console-motion';
    el.textContent = VOICE_CONSOLE_CSS;
    document.head.appendChild(el);
  }, []);
}

function reducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function fill(template, values) {
  return String(template || '').replace(/\{(\w+)\}/g, (m, key) => (values && values[key] != null ? String(values[key]) : m));
}

/* Imperative bar meter, real mic data via AnalyserNode while the mic phases are live, decorative
   motion otherwise - same technique DockButton's Waveform/ChatResponsePopover's Dots already use
   in this codebase (direct style mutation on a ref, never a per-frame re-render). Reused at several
   sizes: the console's bars, the bar's wider row, the sidecar's, and the mini-bar's 14 bars. `calm`
   (the psychology intake, plate XVIII) softens it: lower peak, slower response. */
function VoiceMeter({ voiceState, muted, getVoiceMediaStream, count = 48, height = 68, barWidth = 3, gap = 3, color = 'var(--char-accent)', calm = false }) {
  const barEls = React.useRef([]);
  const smooth = React.useRef([]);
  const rafRef = React.useRef(null);
  const audioRef = React.useRef(null);
  const stateRef = React.useRef({ voiceState, muted, color, calm });
  stateRef.current = { voiceState, muted, color, calm };

  function teardownAudio() {
    const a = audioRef.current;
    if (!a) return;
    try { a.source.disconnect(); } catch (_e) { /* already gone */ }
    try { a.ctx.close(); } catch (_e) { /* already closed */ }
    audioRef.current = null;
  }

  React.useEffect(() => {
    const needsMic = voiceState === 'listening' || voiceState === 'user_speaking' || voiceState === 'interrupted';
    if (!needsMic) { teardownAudio(); return; }
    if (audioRef.current) return;
    const stream = getVoiceMediaStream && getVoiceMediaStream();
    if (!stream) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.72;
      source.connect(analyser);
      audioRef.current = { ctx, source, analyser, freq: new Uint8Array(analyser.frequencyBinCount) };
    } catch (_err) { /* no analyser - falls back to the decorative breathing motion below */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceState]);

  React.useEffect(() => () => teardownAudio(), []);

  React.useEffect(() => {
    if (reducedMotion()) {
      const v = stateRef.current.muted ? 0.03 : 0.4;
      barEls.current.forEach((el) => {
        if (!el) return;
        el.style.transform = 'scaleY(' + v + ')';
        el.style.background = stateRef.current.color;
        el.style.opacity = '0.7';
      });
      return undefined;
    }
    function paint(t) {
      const { voiceState: ph, muted, color: tone, calm: soft } = stateRef.current;
      const audio = audioRef.current;
      if (audio) { try { audio.analyser.getByteFrequencyData(audio.freq); } catch (_e) { /* context closing */ } }
      const peak = soft ? 0.72 : 1;
      const follow = soft ? 0.2 : 0.34;
      for (let i = 0; i < count; i++) {
        const el = barEls.current[i];
        if (!el) continue;
        const k = Math.abs(i - (count - 1) / 2) / ((count - 1) / 2);
        let v;
        if (muted) {
          v = 0.03;
        } else if (ph === 'assistant_speaking') {
          v = (1 - k * 0.7) * (0.32 + 0.5 * Math.abs(Math.sin(t / (soft ? 340 : 230) + i * 0.45)));
        } else if (audio) {
          const bins = audio.freq.length;
          const idx = Math.floor(Math.pow(k, 1.45) * bins * 0.42) + 2;
          v = Math.pow((audio.freq[idx] || 0) / 255, 0.85) * 1.15;
        } else {
          v = 0.16 + 0.14 * Math.abs(Math.sin(t / (soft ? 620 : 420) + i * 0.5));
        }
        v = Math.max(0.03, Math.min(peak, v * peak));
        const prev = smooth.current[i] === undefined ? 0.05 : smooth.current[i];
        const sv = prev + (v - prev) * follow;
        smooth.current[i] = sv;
        el.style.transform = 'scaleY(' + sv.toFixed(3) + ')';
        el.style.background = tone;
        el.style.opacity = (0.42 + sv * 0.58).toFixed(2);
      }
      rafRef.current = requestAnimationFrame(paint);
    }
    rafRef.current = requestAnimationFrame(paint);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [count]);

  if (muted) {
    return (
      <div aria-hidden="true" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height, width: '100%' }}>
        <span style={{ width: '86%', height: 2, borderRadius: 2, background: 'repeating-linear-gradient(90deg,var(--steel) 0 7px,transparent 7px 13px)' }} />
      </div>
    );
  }
  return (
    <div aria-hidden="true" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap, height, width: '100%', opacity: calm ? 0.7 : 1 }}>
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i} ref={(el) => { barEls.current[i] = el; }}
          style={{ width: barWidth, height, borderRadius: 2, flex: 'none', transformOrigin: 'center', transform: 'scaleY(.08)', background: color, opacity: 0.5 }}
        />
      ))}
    </div>
  );
}

// PROCESSING in the meter slot: the waveform goes quiet and the analysis shows as three dots and a
// word - never the engine's logo (the companion's identity is its portrait, see CompanionSigil).
function ThinkingIndicator({ label }) {
  return (
    <div style={{ height: 32, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
      <span aria-hidden="true" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--gold-warm)', animation: `navrya-dot 1200ms var(--ease-standard) ${i * 150}ms infinite` }} />
        ))}
      </span>
      <span style={{ font: 'var(--type-caption)', fontSize: 12, color: 'var(--gold-warm)', whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  );
}

function DeniedCard({ strings, onRetry, onEnd }) {
  return (
    <div className="navrya-voice-console-error-card" style={{ width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, border: '1px solid color-mix(in srgb,var(--danger) 45%,transparent)', background: 'rgba(255,56,48,.08)' }}>
      <span style={{ width: 32, height: 32, flex: 'none', borderRadius: 9, display: 'grid', placeItems: 'center', border: '1px solid color-mix(in srgb,var(--danger) 50%,transparent)', color: 'var(--danger)' }}>
        <Icon name="triangle-alert" size={17} />
      </span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ font: 'var(--type-body)', color: 'var(--parchment)' }}>{strings.deniedTitle}</span>
        <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{strings.deniedBody}</span>
      </span>
      <span className="navrya-voice-console-error-actions" style={{ flex: 'none', display: 'flex', gap: 8 }}>
        <button
          type="button" onClick={onRetry}
          style={{ height: 36, padding: '0 14px', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, border: '1px solid var(--border-gold)', background: 'transparent', font: 'var(--type-body)', color: 'var(--text-primary)' }}
        >
          <Icon name="rotate-cw" size={15} />
          {strings.retry}
        </button>
        <button
          type="button" onClick={onEnd}
          style={{ height: 36, padding: '0 14px', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, border: '1px solid var(--border-hairline)', background: 'transparent', font: 'var(--type-body)', color: 'var(--text-muted)' }}
        >
          <Icon name="x" size={15} />
          {strings.close}
        </button>
      </span>
    </div>
  );
}

// One quiet caption line: what was heard, or the reply being spoken - a small label and the real
// text, instead of a big bordered box.
function CaptionBox({ label, text, caret, tone }) {
  return (
    <div className="navrya-voice-console-caption" style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '0 16px', boxSizing: 'border-box', minWidth: 0 }}>
      <span style={{ flex: 'none', font: 'var(--type-caption)', fontSize: 11, color: tone === 'reply' ? 'var(--gold-warm)' : DIM, whiteSpace: 'nowrap' }}>{label}</span>
      <p dir="auto" style={{
        margin: 0, flex: 1, minWidth: 0, font: 'var(--type-body)', fontSize: 14, lineHeight: '24px',
        color: tone === 'reply' ? 'var(--parchment)' : 'var(--char-accent-soft)', textWrap: 'pretty',
        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden'
      }}>
        {text}
        {caret && <span aria-hidden="true" style={{ display: 'inline-block', width: 2, height: 16, marginInlineStart: 3, verticalAlign: -3, background: 'var(--char-accent)', animation: 'navrya-voice-caret 900ms steps(1) infinite' }} />}
      </p>
    </div>
  );
}

// The design's row button: 40px (36px in the narrow sidecar / anchor), a 1px hairline edge, danger tone
// for "end", accent for an active toggle, gold for the calm mode's "later".
function RowButton({ icon, label, onClick, tone, active, className, disabled, size = 40 }) {
  const skin = tone === 'danger'
    ? { border: '1px solid ' + DANGER_EDGE, color: DANGER, background: 'transparent' }
    : tone === 'gold'
      ? { border: '1px solid color-mix(in srgb,var(--gold-warm) 60%,transparent)', color: 'var(--gold-warm)', background: 'rgba(214,175,107,.08)' }
      : active
        ? { border: '1px solid ' + accent(50), color: 'var(--char-accent)', background: 'var(--char-active-surface)' }
        : { border: '1px solid rgba(244,234,215,.12)', color: MUTED, background: 'transparent' };
  return (
    <button
      type="button" className={className} aria-label={label} title={label} onClick={onClick} disabled={disabled}
      style={{ width: size, height: size, flex: 'none', borderRadius: size < 40 ? 12 : 13, display: 'grid', placeItems: 'center', padding: 0, cursor: 'pointer', ...skin }}
    >
      <Icon name={icon} size={18} />
    </button>
  );
}

// A labelled row button ("skip", "later"): 40px tall, 12px corner.
function TextButton({ icon, label, onClick, tone, className }) {
  const gold = tone === 'gold';
  return (
    <button
      type="button" className={className} onClick={onClick}
      style={{
        height: 40, padding: '0 14px', borderRadius: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, flex: 'none', whiteSpace: 'nowrap',
        border: '1px solid ' + (gold ? 'rgba(214,175,107,.45)' : 'rgba(244,234,215,.12)'), background: 'transparent', color: gold ? GOLD : TEXT, fontSize: 12.5
      }}
    >
      <Icon name={icon} size={14} />{label}
    </button>
  );
}

/* The card the console sits in: the design's capsule (or, welded to a dialog, the bar with no top edge
   of its own - the dialog is its top). */
function frameFor(kind, joinedTop) {
  if (kind === 'bar') {
    return {
      position: 'relative', boxSizing: 'border-box', borderRadius: '0 0 18px 18px', border: '1px solid ' + EDGE_WELD, borderTop: '1px solid ' + EDGE_JOINT,
      background: cardBackground('weld'), boxShadow: cardShadow('weld')
    };
  }
  return {
    position: 'relative', boxSizing: 'border-box', borderRadius: cardRadius(joinedTop, false), border: '1px solid ' + EDGE, borderTop: joinedTop ? 0 : undefined,
    background: joinedTop ? '#0A0D12' : cardBackground('card'),
    boxShadow: joinedTop ? '0 26px 64px rgba(0,0,0,.6),0 0 40px ' + accent(10) : cardShadow('card')
  };
}

function useVoiceKeys({ onVoiceEnd, onVoiceMuteToggle, voiceMuted, onVoiceToggle }) {
  React.useEffect(() => {
    function isEditable(el) { return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable); }
    let spaceHeld = false;
    function onKeyDown(e) {
      if (e.key === 'Escape') { onVoiceEnd && onVoiceEnd(); return; }
      if (e.code === 'Space' && !e.repeat && !isEditable(document.activeElement)) {
        e.preventDefault();
        if (!voiceMuted) { spaceHeld = true; onVoiceMuteToggle && onVoiceMuteToggle(); }
      }
    }
    function onKeyUp(e) {
      if (e.code === 'Space' && spaceHeld) { spaceHeld = false; onVoiceMuteToggle && onVoiceMuteToggle(); }
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); };
  }, [onVoiceToggle, onVoiceMuteToggle, onVoiceEnd, voiceMuted]);
}

function progressBar(fraction, dir) {
  const pct = Math.max(0, Math.min(100, Math.round(fraction * 100)));
  return 'linear-gradient(' + (dir === 'rtl' ? '270deg' : '90deg') + ',var(--char-accent) ' + pct + '%,rgba(244,234,215,.1) ' + pct + '%)';
}

/* Voice in the capsule - shown for the entire lifetime of a voice session unless minimized. Voice is
   a state of the same capsule, not a third window. When a reply panel sits on top (`joinedTop`) that
   panel's header is the one identity header - the console carries none of its own. */
export function VoiceConsole({
  voiceState, voiceMuted, model, elapsedSeconds, dotColor, phaseLabel, phaseCaption,
  voicePermissionDenied, voiceHeardText, voiceReplyCaption, voiceManualFinishPending,
  // Slice R2, audit finding T12: defaults to true (the OpenAI Realtime adapter's real capability)
  // so every existing caller that never passes this keeps the exact prior behavior.
  voiceSupportsManualFinish = true,
  // Live caption fix (2026-09-13, real user report): defaults to false, the OPPOSITE default from
  // voiceSupportsManualFinish above - only GPT-Live reports this capability (gptLiveVoice.js's own
  // supportsLiveCaption()), so a caller that never passes it (or the retired Realtime/Gemini
  // transports) keeps today's exact "reveal only once finalized" look. When true,
  // voiceHeardText/voiceReplyCaption are real, live, progressively updating fragments
  // (chatDockView.jsx's onInputTranscript/onOutputTranscript) rather than a single value that only
  // ever appears once a turn is fully finalized.
  voiceSupportsLiveCaption = false,
  onVoiceToggle, onVoiceEnd, onVoiceMuteToggle, onVoiceInterrupt, onVoiceEndMessage, onMinimize,
  getVoiceMediaStream, strings,
  // `companion` ({ name, portrait }) is the portrait in the row; `joinedTop` squares the top corners
  // when a reply panel sits flush on top (ChatDock). `layout` is where ChatDock put the capsule (see
  // dockLayout.js); `laneHeight` the sidecar's height; `dir` the reading direction.
  companion, joinedTop = false, layout = 'bottom', laneHeight = null, dir = 'ltr',
  // A form is being filled by voice (navrya-src/dockFormVoice.js): null, or the view-model the bar and
  // sidecar draw. `engineMenu` is the engine chip's menu; `numberFormat` localizes the counters.
  formVoice = null, formVoiceLabels = {}, onFormVoiceChoice, onFormVoiceSkip, onFormVoiceLater, engineMenu = null, numberFormat
}) {
  useAssistantMotion();
  useVoiceConsoleMotion();
  const [captionsOn, setCaptionsOn] = React.useState(true);

  const denied = voiceState === 'error' && voicePermissionDenied;
  const errored = voiceState === 'error' && !voicePermissionDenied;
  const thinking = voiceState === 'processing';
  const replying = voiceState === 'assistant_speaking';
  const userSpeaking = voiceState === 'user_speaking';
  const showMeter = !denied && !errored && !thinking;
  // fix/voice-mode-turn-ux (Part C): the reply caption is no longer tied to the transient `replying`
  // (ASSISTANT_SPEAKING) state alone - it stays visible through LISTENING/INTERRUPTED too, for as long
  // as chatDockView.jsx itself still has real text to show (that file is the one place the caption is
  // ever cleared - real next-user-speech, New Chat, disconnect, fatal error). `showHeard`'s own "empty
  // listening placeholder" line is suppressed whenever a real reply caption is already being shown in
  // its place, so the two never stack.
  const showReply = !denied && !errored && captionsOn && !!voiceReplyCaption &&
    (voiceState === 'assistant_speaking' || voiceState === 'listening' || voiceState === 'interrupted');
  const showHeard = !denied && !errored && !replying && captionsOn && !showReply;
  // fix/voice-mode-turn-ux (Part D): the live action exists in TWO phases - ASSISTANT_SPEAKING ("Stop
  // reply") and USER_SPEAKING ("End message"). Slice R2, audit finding T12: USER_SPEAKING only becomes
  // an actionable "End message" button when the active adapter actually supports finishing a turn
  // early (voiceSupportsManualFinish) - Gemini Live has no real client-side mechanism for this, so no
  // button is offered there rather than one that would do nothing. In every other phase the button is
  // simply not rendered; the status line says what is happening.
  const canManualFinish = userSpeaking && voiceSupportsManualFinish;
  const mainActionable = replying || canManualFinish;
  const mainActionHandler = replying ? onVoiceInterrupt : canManualFinish ? onVoiceEndMessage : undefined;
  const mainActionLabel = replying ? strings.stopReply : canManualFinish ? strings.endMessage : (thinking && voiceManualFinishPending ? strings.endingMessage : phaseLabel);
  const mainActionIcon = replying ? 'square' : canManualFinish ? 'send' : 'check';
  const statusLabel = thinking && voiceManualFinishPending ? strings.endingMessage : phaseLabel;
  const sigilState = denied || errored ? 'idle' : (SIGIL_STATE[voiceState] || 'idle');

  useVoiceKeys({ onVoiceEnd, onVoiceMuteToggle, voiceMuted, onVoiceToggle });

  const num = (n) => (typeof numberFormat === 'function' ? numberFormat(n) : String(n));
  const mm = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
  const ss = String(elapsedSeconds % 60).padStart(2, '0');
  const timerText = num(mm) + ':' + num(ss);

  const variant = layout === 'side' ? 'sidecar' : layout === 'weld' ? 'bar' : layout === 'anchor' ? 'anchor' : 'console';
  const calm = !!(formVoice && formVoice.calm);
  const sideCompact = variant === 'sidecar' || variant === 'anchor';
  const buttonSize = sideCompact ? 36 : 40;
  const labels = formVoiceLabels || {};

  // The pieces the four shapes share.
  const meter = (
    <div className="navrya-voice-console-meter" style={{ flex: 1, minWidth: 0, height: variant === 'console' ? 36 : sideCompact ? 36 : 32, display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
      {showMeter && <VoiceMeter voiceState={voiceState} muted={voiceMuted} getVoiceMediaStream={getVoiceMediaStream} count={sideCompact ? 26 : variant === 'bar' ? 44 : 34} height={variant === 'bar' ? 32 : 30} barWidth={3} gap={3} color={dotColor} calm={calm} />}
      {thinking && <ThinkingIndicator label={strings.analysing} />}
    </div>
  );
  const timer = <span className="navrya-voice-console-timer navrya-tabular" style={{ flex: 'none', minWidth: 40, textAlign: 'center', font: 'var(--type-caption)', fontSize: 13, color: MUTED }}>{timerText}</span>;
  const muteButton = (
    <button
      type="button" className="navrya-voice-console-mute" aria-label={voiceMuted ? strings.unmute : strings.mute} title={voiceMuted ? strings.unmute : strings.mute} onClick={onVoiceMuteToggle}
      style={{ width: buttonSize, height: buttonSize, flex: 'none', borderRadius: buttonSize < 40 ? 12 : 13, display: 'grid', placeItems: 'center', padding: 0, cursor: 'pointer', border: '1px solid ' + (voiceMuted ? EDGE : 'rgba(244,234,215,.12)'), background: voiceMuted ? 'var(--char-active-surface)' : 'transparent', color: voiceMuted ? 'var(--char-accent)' : MUTED }}
    >
      <Icon name={voiceMuted ? 'mic-off' : 'mic'} size={18} />
    </button>
  );
  const captionsButton = variant === 'console' && <RowButton className="navrya-voice-console-captions" icon="captions" label={captionsOn ? strings.captionsOn : strings.captionsOff} active={captionsOn} onClick={() => setCaptionsOn((v) => !v)} />;
  const typeButton = <RowButton className="navrya-voice-console-type" icon="keyboard" label={strings.type} onClick={onVoiceEnd} size={buttonSize} />;
  const endButton = <RowButton className="navrya-voice-console-end" icon="x" tone="danger" label={strings.close} onClick={onVoiceEnd} size={buttonSize} />;
  const mainAction = mainActionable && (
    variant === 'console'
      ? (
        <button
          type="button" className="navrya-voice-console-main-action" onClick={mainActionHandler} aria-label={mainActionLabel} title={mainActionLabel}
          style={{
            height: 40, flex: 'none', padding: '0 14px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
            border: '1px solid ' + (replying ? 'color-mix(in srgb,var(--gold-warm) 60%,transparent)' : 'transparent'),
            background: replying ? 'rgba(214,175,107,.08)' : 'var(--char-accent)',
            color: replying ? 'var(--gold-warm)' : 'var(--char-on-accent)', font: 'var(--type-body)', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap'
          }}
        >
          <Icon name={mainActionIcon} size={16} />
          <span className="navrya-voice-console-main-label">{mainActionLabel}</span>
        </button>
      )
      : (
        <button
          type="button" className="navrya-voice-console-main-action" onClick={mainActionHandler} aria-label={mainActionLabel} title={mainActionLabel}
          style={{
            width: buttonSize, height: buttonSize, flex: 'none', borderRadius: buttonSize < 40 ? 12 : 13, display: 'grid', placeItems: 'center', padding: 0, cursor: 'pointer',
            border: '1px solid ' + (replying ? 'color-mix(in srgb,var(--gold-warm) 60%,transparent)' : 'transparent'),
            background: replying ? 'rgba(214,175,107,.08)' : 'var(--char-accent)', color: replying ? 'var(--gold-warm)' : 'var(--char-on-accent)'
          }}
        >
          <Icon name={mainActionIcon} size={16} />
        </button>
      )
  );
  const deniedBlock = (denied || errored) && (
    <div style={{ padding: '4px 14px 8px' }}>
      {denied && <DeniedCard strings={strings} onRetry={onVoiceToggle} onEnd={onVoiceEnd} />}
      {errored && <DeniedCard strings={{ deniedTitle: strings.errorLabel, deniedBody: strings.errorLabel, retry: strings.retry, close: strings.close }} onRetry={onVoiceToggle} onEnd={onVoiceEnd} />}
    </div>
  );

  // What is being asked, what was heard: the form's own words when a form is being filled, otherwise
  // the phase and the reply / heard captions.
  const fv = formVoice;
  const questionCounter = fv && fv.index && fv.total ? fill(labels.questionOf, { index: num(fv.index), total: num(fv.total) }) : '';
  const sourceLine = fv
    ? [questionCounter, fv.current && fv.current.label].filter(Boolean).join(' · ')
    : statusLabel;
  // The question is what is being said to the user (the reply caption), else the assistant's last message.
  const questionText = (captionsOn && voiceReplyCaption) || (fv && fv.questionText) || phaseCaption;
  // What was heard belongs to the CURRENT question: it shows while the user is answering (or has just answered),
  // never left over from the previous turn under a new question.
  const heardText = captionsOn && voiceHeardText && !replying && (userSpeaking || thinking || !voiceReplyCaption) ? voiceHeardText : '';
  const choices = fv && fv.choices && fv.choices.length && !replying ? fv.choices : [];
  // "Question 5 of 6" fills five sixths.
  const fraction = fv && fv.total ? fv.index / fv.total : 0;
  const calmPill = calm && labels.calm ? (
    <span style={pillStyle('neutral')}><Icon name="moon" size={11} />{labels.calm}</span>
  ) : null;
  // The form's own row actions: skip this field, or - the calm mode - "later" and "skip this question".
  const canSkip = !!(fv && fv.canSkip && onFormVoiceSkip);
  const formActions = fv ? (
    <React.Fragment>
      {calm && onFormVoiceLater && labels.later && <TextButton icon="moon" tone="gold" label={labels.later} onClick={onFormVoiceLater} className="navrya-voice-console-later" />}
      {canSkip && <TextButton icon="skip-forward" label={calm ? labels.skipQuestion : labels.skip} onClick={onFormVoiceSkip} className="navrya-voice-console-skip" />}
    </React.Fragment>
  ) : null;

  const wrapperProps = { 'data-navrya-assistant': 'voice-console', 'data-navrya-voice-variant': variant, className: 'navrya-voice-console' };

  // ---- BAR: welded under a dialog ---------------------------------------------------------------
  if (variant === 'bar') {
    return (
      <div {...wrapperProps} style={{ ...frameFor('bar'), animation: 'navrya-dock-rise var(--dur-expand) var(--ease-out) both' }}>
        {deniedBlock}
        {!denied && !errored && (
          <div className="navrya-voice-console-header" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '14px 16px 4px' }}>
            <CompanionSigil portrait={companion && companion.portrait} size={44} state={sigilState} />
            <div style={{ flex: '1 1 220px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: DIM, minWidth: 0 }}>
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sourceLine}</span>
                {calmPill}
              </span>
              <span dir="auto" className="navrya-voice-console-question" style={{ font: 'var(--type-body)', fontSize: 15.5, fontWeight: 700, color: TEXT, lineHeight: 1.6, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{questionText}</span>
              {heardText && <span dir="auto" className="navrya-voice-console-heard" style={{ fontSize: 13, color: 'var(--char-accent-soft)' }}>«{heardText}»</span>}
            </div>
            {choices.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {choices.map((c) => <button key={String(c.value)} type="button" style={choiceStyle(34)} onClick={() => onFormVoiceChoice && onFormVoiceChoice(c)}>{c.label}</button>)}
              </div>
            )}
            {fv && fv.total > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flex: 'none', width: 92 }}>
                <span style={{ fontSize: 11.5, color: MUTED }}>{fill(labels.progress, { index: num(fv.index), total: num(fv.total) })}</span>
                <span style={{ display: 'block', width: 92, height: 4, borderRadius: 2, background: progressBar(fraction, dir) }} />
              </div>
            )}
          </div>
        )}
        <div className="navrya-voice-console-controls" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, paddingBlock: '6px 12px', paddingInlineStart: 16, paddingInlineEnd: 12 }}>
          {meter}
          {timer}
          {mainAction}
          {formActions}
          {muteButton}
          {typeButton}
          {endButton}
        </div>
      </div>
    );
  }

  // ---- SIDECAR: a form too long to leave room under it -----------------------------------------
  if (variant === 'sidecar') {
    const fields = (fv && fv.fields) || [];
    return (
      <div {...wrapperProps} style={{ ...frameFor('card', false), borderRadius: 16, display: 'flex', flexDirection: 'column', height: laneHeight || undefined, maxHeight: '100%', overflow: 'hidden', animation: 'navrya-dock-rise var(--dur-expand) var(--ease-out) both' }}>
        <CapsuleTop />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 12px 12px' }}>
          <CompanionSigil portrait={companion && companion.portrait} size={36} state={sigilState} />
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span style={{ font: 'var(--type-body)', fontSize: 15, fontWeight: 700, color: TEXT }}>{companion && companion.name}</span>
              {model && engineMenu && engineMenu.items && engineMenu.items.length > 0 && (
                <DockMenu variant="chip" placement="down" label={engineMenu.switchLabel || model.label} chipLabel={model.label} glyph={engineMenu.glyph} items={engineMenu.items} />
              )}
            </div>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: MUTED, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, flex: 'none' }} />
              {fv && fv.title && labels.voiceChatOn ? fill(labels.voiceChatOn, { form: fv.title }) : statusLabel}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {onMinimize && (
              <button type="button" aria-label={strings.minimize} title={strings.minimize} onClick={onMinimize} style={{ width: 36, height: 36, flex: 'none', borderRadius: 12, display: 'grid', placeItems: 'center', cursor: 'pointer', border: '1px solid transparent', background: 'transparent', color: MUTED, padding: 0 }}>
                <Icon name="chevron-down" size={16} />
              </button>
            )}
            <button type="button" aria-label={strings.close} title={strings.close} onClick={onVoiceEnd} style={{ width: 36, height: 36, flex: 'none', borderRadius: 12, display: 'grid', placeItems: 'center', cursor: 'pointer', border: '1px solid transparent', background: 'transparent', color: MUTED, padding: 0 }}>
              <Icon name="x" size={16} />
            </button>
          </div>
        </div>
        {fv && fv.modeChips && fv.modeChips.length > 0 && (
          <div style={{ display: 'flex', gap: 6, padding: '0 14px 10px', flexWrap: 'wrap' }}>
            {fv.modeChips.map((chip) => (
              <span key={chip.key} style={pillStyle(chip.tone)}><Icon name={chip.icon} size={11} />{chip.label}</span>
            ))}
          </div>
        )}
        <div aria-hidden="true" style={{ height: 1, background: DIVIDER, margin: '0 14px' }} />
        {deniedBlock}
        {!denied && !errored && (
          <div style={{ padding: '12px 14px 6px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {sourceLine && <span style={{ fontSize: 11.5, color: DIM }}>{sourceLine}</span>}
            <span dir="auto" style={{ font: 'var(--type-body)', fontSize: 15, fontWeight: 700, color: TEXT, lineHeight: 1.7, display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{questionText}</span>
            {heardText && <span dir="auto" style={{ fontSize: 13, color: 'var(--char-accent-soft)' }}>«{heardText}»</span>}
          </div>
        )}
        {choices.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '2px 14px 8px' }}>
            {choices.map((c) => <button key={String(c.value)} type="button" style={choiceStyle(34)} onClick={() => onFormVoiceChoice && onFormVoiceChoice(c)}>{c.label}</button>)}
          </div>
        )}
        {fields.length > 0 && (
          <div className="navrya-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '4px 14px 10px', overflowY: 'auto', minHeight: 0, flex: '0 1 auto' }}>
            {fields.map((f) => (
              <div key={f.path} style={{ display: 'flex', alignItems: 'center', gap: 10, height: 30, flex: 'none', fontSize: 12.5, fontWeight: f.state === 'current' || f.state === 'pending' ? 700 : 500, color: f.state === 'pending' ? GOLD : f.state === 'todo' ? DIM : f.state === 'current' ? TEXT : MUTED }}>
                {f.state === 'done' && <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(46,204,113,.14)', color: GREEN, display: 'grid', placeItems: 'center', flex: 'none' }}><Icon name="check" size={11} strokeWidth={2.4} /></span>}
                {f.state === 'pending' && <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: '50%', border: '1.5px dashed ' + GOLD, boxSizing: 'border-box', flex: 'none' }} />}
                {f.state === 'current' && <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: '50%', border: '1.5px solid var(--char-accent)', boxSizing: 'border-box', flex: 'none', display: 'grid', placeItems: 'center' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--char-accent)' }} /></span>}
                {f.state === 'todo' && <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: '50%', border: '1.5px solid rgba(244,234,215,.2)', boxSizing: 'border-box', flex: 'none' }} />}
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.label}</span>
                {f.state === 'pending' && labels.waitingConfirm && <span style={{ marginInlineStart: 'auto', fontSize: 11, fontWeight: 500 }}>{labels.waitingConfirm}</span>}
              </div>
            ))}
          </div>
        )}
        <div aria-hidden="true" style={{ height: 1, background: DIVIDER, margin: '0 14px' }} />
        <div className="navrya-scroll" style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {fv && fv.said && fv.said.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '12px 14px', boxSizing: 'border-box' }}>
              {fv.said.map((m, i) => (
                <div key={i} style={{ alignSelf: 'flex-end', maxWidth: '80%', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <div dir="auto" style={{ padding: '9px 14px', borderRadius: 16, borderEndEndRadius: 5, background: accent(13), border: '1px solid ' + accent(28), fontSize: 13.5, lineHeight: 1.85, color: TEXT }}>{m.text}</div>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#8F8B80' }}>
                    <span style={{ display: 'inline-flex', color: 'var(--char-accent-soft)' }}><Icon name="mic" size={11} /></span>
                    {[labels.voice, m.time].filter(Boolean).join(' · ')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div aria-hidden="true" style={{ height: 1, background: DIVIDER, margin: '0 14px' }} />
        <div className="navrya-voice-console-controls" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, padding: 12, minHeight: 68, boxSizing: 'border-box', flex: 'none' }}>
          <CompanionSigil className="navrya-voice-console-sigil" portrait={companion && companion.portrait} size={40} state={sigilState} dot />
          {meter}
          {timer}
          {mainAction}
          {muteButton}
          {typeButton}
          {endButton}
        </div>
      </div>
    );
  }

  // ---- ANCHOR: a compact card in a free corner of the page ---------------------------------------
  if (variant === 'anchor') {
    return (
      <div {...wrapperProps} style={{ ...frameFor('card', false), overflow: 'hidden', animation: 'navrya-dock-rise var(--dur-expand) var(--ease-out) both' }}>
        <CapsuleTop />
        {deniedBlock}
        {!denied && !errored && (
          <div className="navrya-voice-console-header" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 14px 6px 12px' }}>
            <span aria-hidden="true" style={{ width: 8, height: 8, flex: 'none', borderRadius: '50%', background: dotColor }} />
            <span style={{ fontSize: 14.5, fontWeight: 700, color: TEXT, whiteSpace: 'nowrap' }}>{(fv && fv.current && fv.current.label) || statusLabel}{fv && fv.current ? '؟' : ''}</span>
            <span dir="auto" style={{ fontSize: 12.5, color: MUTED, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{heardText ? '«' + heardText + '»' : questionText}</span>
            {onMinimize && (
              <button type="button" aria-label={labels.expandConversation || strings.minimize} title={labels.expandConversation || strings.minimize} onClick={onMinimize} style={{ width: 34, height: 34, flex: 'none', borderRadius: 11, display: 'grid', placeItems: 'center', cursor: 'pointer', border: '1px solid transparent', background: 'transparent', color: MUTED, padding: 0 }}>
                <Icon name="chevron-up" size={15} />
              </button>
            )}
          </div>
        )}
        <div className="navrya-voice-console-controls" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, padding: 12, minHeight: 68, boxSizing: 'border-box' }}>
          <CompanionSigil className="navrya-voice-console-sigil" portrait={companion && companion.portrait} size={40} state={sigilState} dot />
          {meter}
          {timer}
          {mainAction}
          {muteButton}
          {typeButton}
          {endButton}
        </div>
      </div>
    );
  }

  // ---- CONSOLE: the voice capsule at the bottom --------------------------------------------------
  return (
    <div {...wrapperProps} style={{ ...frameFor('card', joinedTop), overflow: 'hidden', animation: 'navrya-dock-rise var(--dur-expand) var(--ease-out) both' }}>
      {!joinedTop && <CapsuleTop />}
      {joinedTop && <span aria-hidden="true" style={{ position: 'absolute', top: 0, insetInlineStart: 14, insetInlineEnd: 14, height: 1, background: DIVIDER, pointerEvents: 'none' }} />}

      {/* fix/voice-mode-turn-ux (Part E req 13): the status/caption area - not the control row
          below, which stays outside this wrapper and therefore always reachable - is its own
          bounded, scrollable region so a short viewport (or a long caption) can never push the
          mute/live-action/end controls off-screen. */}
      <div className="navrya-scroll navrya-voice-console-content" style={{ maxHeight: '46vh', overflowY: 'auto', boxSizing: 'border-box' }}>
        <div className="navrya-voice-console-header" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '16px 14px 6px 16px', minWidth: 0 }}>
          <span aria-hidden="true" style={{ width: 8, height: 8, flex: 'none', borderRadius: 999, background: dotColor, animation: 'navrya-halo 1150ms var(--ease-standard) infinite' }} />
          <span className="navrya-voice-console-model" style={{ font: 'var(--type-body)', fontSize: 14.5, fontWeight: 700, color: TEXT, whiteSpace: 'nowrap' }}>{statusLabel}</span>
          <span className="navrya-voice-console-status" style={{ flex: 1, minWidth: 120, font: 'var(--type-caption)', fontSize: 12.5, color: MUTED }}>{phaseCaption}</span>
          {onMinimize && (
            <button type="button" aria-label={strings.minimize} title={strings.minimize} onClick={onMinimize} style={{ width: 32, height: 32, flex: 'none', borderRadius: 10, display: 'grid', placeItems: 'center', cursor: 'pointer', border: '1px solid transparent', background: 'transparent', color: MUTED }}>
              <Icon name="chevron-down" size={16} />
            </button>
          )}
        </div>

        {deniedBlock}

        {/* Live caption fix (2026-09-13): voiceSupportsLiveCaption-gated - a transport with no live
            partial transcript (Realtime historically, still Gemini) keeps the exact prior "reveal
            only once PROCESSING starts" behavior below unchanged. GPT-Live's own voiceHeardText is
            instead a real, progressively-growing fragment stream (chatDockView.jsx's
            onInputTranscript), so it is shown as soon as there is anything to show - the label
            only falls back to the plain listening placeholder while it is still genuinely empty. */}
        {showHeard && (
          <CaptionBox
            label={(thinking || (voiceSupportsLiveCaption && voiceHeardText)) ? strings.heardLabel : strings.listeningPlaceholder}
            text={(thinking || voiceSupportsLiveCaption) ? (voiceHeardText || '') : ''}
            caret={!thinking}
            tone="heard"
          />
        )}
        {/* fix/voice-mode-turn-ux (Part C req 10): renders the full text directly - an instant,
            complete reveal can never be truncated/disappear. Live caption fix (2026-09-13): a caret
            is shown only while a live-caption-capable transport is still actively speaking. */}
        {showReply && <CaptionBox label={strings.replyLabel} text={voiceReplyCaption} caret={voiceSupportsLiveCaption && replying} tone="reply" />}
      </div>

      <div className="navrya-voice-console-controls" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px 12px' }}>
        <CompanionSigil className="navrya-voice-console-sigil" portrait={companion && companion.portrait} size={40} state={sigilState} dot={false} />
        {meter}
        {timer}
        {muteButton}
        {captionsButton}
        {typeButton}
        {mainAction}
        {endButton}
      </div>
    </div>
  );
}

/* Collapsed voice: the same capsule, one row - portrait with its phase ring, the phase, a small
   live meter, the timer, expand and end. */
export function VoiceMiniBar({ voiceState, voiceMuted, dotColor, phaseLabel, elapsedSeconds, onExpand, onVoiceToggle, onVoiceEnd, getVoiceMediaStream, strings, companion, joinedTop = false }) {
  useAssistantMotion();
  const mm = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
  const ss = String(elapsedSeconds % 60).padStart(2, '0');
  return (
    <div
      data-navrya-assistant="voice-mini"
      style={{ ...frameFor('card', joinedTop), display: 'flex', alignItems: 'center', gap: 10, minHeight: 64, padding: '0 12px' }}
    >
      <CompanionSigil portrait={companion && companion.portrait} size={36} state={SIGIL_STATE[voiceState] || 'idle'} dot={false} />
      <span className="navrya-voice-mini-label" style={{ font: 'var(--type-body)', fontSize: 14, fontWeight: 600, color: TEXT, whiteSpace: 'nowrap' }}>{phaseLabel}</span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'center', overflow: 'hidden' }}>
        <VoiceMeter voiceState={voiceState} muted={voiceMuted} getVoiceMediaStream={getVoiceMediaStream} count={14} height={22} barWidth={2} gap={3} color={dotColor} />
      </span>
      <span className="navrya-voice-mini-timer navrya-tabular" style={{ font: 'var(--type-caption)', fontSize: 12.5, color: MUTED }}>{mm}:{ss}</span>
      <RowButton icon="chevron-up" label={strings.expand} onClick={onExpand} />
      <RowButton icon="x" tone="danger" label={strings.close} onClick={onVoiceEnd} />
    </div>
  );
}
