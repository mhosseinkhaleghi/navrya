import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { ModelGlyph } from './ModelSwitcher.jsx';
import { useAssistantMotion } from './motion.js';

/* Voice Mode console (Journey E UI pass, matches the NavryaVoiceMode.dc.html design file).
   Replaces the plain ChatDock row for the whole lifetime of a voice session - the mic button's
   "console" and its collapsed "mini bar" live here, both driven off the real
   navrya-src/aiVoiceRealtime.js state machine (never a second, decorative one). Two honest
   adaptations from the design file, since the real transport can't do what the mocked prototype
   simulated:
   - No fabricated live word-by-word transcript: the Realtime API only ever exposes a *finalized*
     transcript (see aiVoiceRealtime.js's own ABSOLUTE rule), so the listening/user_speaking
     caption is a plain placeholder+caret, not fake growing words. The heard text appears, real
     and complete, once PROCESSING starts.
   - The centre pill button only has a real action during ASSISTANT_SPEAKING ("Stop reply" ->
     interrupt()) - turn-end is auto-detected server-side VAD, there is no manual "finish talking"
     call in this transport, so every other live phase renders it disabled rather than inventing a
     fake affordance (this codebase's own "no decoy buttons" rule - see ai-voice-chatdock-ux.test.mjs). */

const CONNECT_PHASES = { requesting_permission: 1, connecting: 1, reconnecting: 1 };
const PHASE_CODE = {
  requesting_permission: 'CONNECTING', connecting: 'CONNECTING', reconnecting: 'RECONNECTING',
  listening: 'LISTENING', user_speaking: 'SPEAKING', interrupted: 'LISTENING',
  processing: 'THINKING', assistant_speaking: 'REPLYING', error: 'VOICE ERROR'
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

/* Imperative bar meter, real mic data via AnalyserNode while the mic phases are live, decorative
   motion otherwise - same technique DockButton's Waveform/ChatResponsePopover's Dots already use
   in this codebase (direct style mutation on a ref, never a per-frame re-render). Reused at two
   sizes: the 48-bar console meter and the 14-bar mini-bar meter. */
function VoiceMeter({ voiceState, muted, getVoiceMediaStream, count = 48, height = 68, barWidth = 3, gap = 3, color = 'var(--char-accent)' }) {
  const barEls = React.useRef([]);
  const smooth = React.useRef([]);
  const rafRef = React.useRef(null);
  const audioRef = React.useRef(null);
  const stateRef = React.useRef({ voiceState, muted, color });
  stateRef.current = { voiceState, muted, color };

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
      const { voiceState: ph, muted, color: tone } = stateRef.current;
      const audio = audioRef.current;
      if (audio) { try { audio.analyser.getByteFrequencyData(audio.freq); } catch (_e) { /* context closing */ } }
      for (let i = 0; i < count; i++) {
        const el = barEls.current[i];
        if (!el) continue;
        const k = Math.abs(i - (count - 1) / 2) / ((count - 1) / 2);
        let v;
        if (muted) {
          v = 0.03;
        } else if (ph === 'assistant_speaking') {
          v = (1 - k * 0.7) * (0.32 + 0.5 * Math.abs(Math.sin(t / 230 + i * 0.45)));
        } else if (audio) {
          const bins = audio.freq.length;
          const idx = Math.floor(Math.pow(k, 1.45) * bins * 0.42) + 2;
          v = Math.pow((audio.freq[idx] || 0) / 255, 0.85) * 1.15;
        } else {
          v = 0.16 + 0.14 * Math.abs(Math.sin(t / 420 + i * 0.5));
        }
        v = Math.max(0.03, Math.min(1, v));
        const prev = smooth.current[i] === undefined ? 0.05 : smooth.current[i];
        const sv = prev + (v - prev) * 0.34;
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
    <div aria-hidden="true" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap, height, width: '100%' }}>
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i} ref={(el) => { barEls.current[i] = el; }}
          style={{ width: barWidth, height, borderRadius: 2, flex: 'none', transformOrigin: 'center', transform: 'scaleY(.08)', background: color, opacity: 0.5 }}
        />
      ))}
    </div>
  );
}

function ThinkingIndicator({ model, label }) {
  return (
    <div style={{ height: 68, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <span style={{ position: 'relative', width: 44, height: 44, borderRadius: 999, display: 'grid', placeItems: 'center', border: '1px solid var(--divider-gold)', background: 'rgba(3,8,7,.55)' }}>
        <span aria-hidden="true" style={{ position: 'absolute', inset: -2, borderRadius: 999, border: '1px solid var(--gold-antique)', animation: 'navrya-voice-ring 1800ms var(--ease-out) infinite' }} />
        <ModelGlyph model={model} size={20} style={{ animation: 'navrya-spin 5200ms linear infinite' }} />
      </span>
      <span aria-hidden="true" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--gold-warm)', animation: `navrya-dot 1200ms var(--ease-standard) ${i * 150}ms infinite` }} />
        ))}
      </span>
      <span style={{ font: 'var(--type-caption)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--gold-warm)' }}>{label}</span>
    </div>
  );
}

function DeniedCard({ strings, onRetry, onEnd }) {
  return (
    <div className="navrya-voice-console-error-card" style={{ width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 10, border: '1px solid color-mix(in srgb,var(--danger) 45%,transparent)', background: 'rgba(255,56,48,.08)' }}>
      <span style={{ width: 34, height: 34, flex: 'none', borderRadius: 8, display: 'grid', placeItems: 'center', border: '1px solid color-mix(in srgb,var(--danger) 50%,transparent)', color: 'var(--danger)' }}>
        <Icon name="triangle-alert" size={18} />
      </span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ font: 'var(--type-body)', color: 'var(--parchment)' }}>{strings.deniedTitle}</span>
        <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{strings.deniedBody}</span>
      </span>
      <span className="navrya-voice-console-error-actions" style={{ flex: 'none', display: 'flex', gap: 8 }}>
        <button
          type="button" onClick={onRetry}
          style={{ height: 36, padding: '0 14px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, border: '1px solid var(--border-gold)', background: 'transparent', font: 'var(--type-body)', color: 'var(--text-primary)' }}
        >
          <Icon name="rotate-cw" size={15} />
          {strings.retry}
        </button>
        <button
          type="button" onClick={onEnd}
          style={{ height: 36, padding: '0 14px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, border: '1px solid var(--border-hairline)', background: 'transparent', font: 'var(--type-body)', color: 'var(--text-muted)' }}
        >
          <Icon name="x" size={15} />
          {strings.close}
        </button>
      </span>
    </div>
  );
}

function CaptionBox({ label, text, caret, tone }) {
  return (
    <div className="navrya-voice-console-caption" style={{
      position: 'relative', margin: '0 22px 4px', padding: '14px 16px', borderRadius: 10, minHeight: 64, boxSizing: 'border-box',
      border: '1px solid ' + (tone === 'reply' ? 'var(--divider-gold)' : 'var(--border-hairline)'),
      background: tone === 'reply' ? 'rgba(214,175,107,.06)' : 'rgba(3,8,7,.5)'
    }}>
      <span style={{ position: 'absolute', top: -8, insetInlineStart: 14, padding: '0 8px', font: 'var(--type-caption)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: tone === 'reply' ? 'var(--gold-warm)' : 'var(--text-muted)', background: 'var(--ink-900)' }}>{label}</span>
      <p dir="auto" style={{ margin: 0, font: 'var(--type-body)', fontSize: 15, lineHeight: '26px', color: tone === 'reply' ? 'var(--parchment)' : 'var(--text-primary)', textWrap: 'pretty' }}>
        {text}
        {caret && <span aria-hidden="true" style={{ display: 'inline-block', width: 2, height: 17, marginInlineStart: 3, verticalAlign: -3, background: 'var(--char-accent)', animation: 'navrya-voice-caret 900ms steps(1) infinite' }} />}
      </p>
    </div>
  );
}

/* Full console panel - shown for the entire lifetime of a voice session unless minimized. */
export function VoiceConsole({
  voiceState, voiceMuted, model, elapsedSeconds, dotColor, phaseLabel, phaseCaption,
  voicePermissionDenied, voiceHeardText, voiceReplyCaption, voiceManualFinishPending,
  onVoiceToggle, onVoiceEnd, onVoiceMuteToggle, onVoiceInterrupt, onVoiceEndMessage, onMinimize,
  getVoiceMediaStream, strings
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
  // fix/voice-mode-turn-ux (Part C): the reply caption is no longer tied to the transient
  // `replying` (ASSISTANT_SPEAKING) state alone - it stays visible through LISTENING/INTERRUPTED
  // too, for as long as chatDockView.jsx itself still has real text to show (that file is the one
  // place the caption is ever cleared - real next-user-speech, New Chat, disconnect, fatal error;
  // see its own comment). `showHeard`'s own "empty listening placeholder" box is suppressed
  // whenever a real reply caption is already being shown in its place, so the two never stack.
  const showReply = !denied && !errored && captionsOn && !!voiceReplyCaption &&
    (voiceState === 'assistant_speaking' || voiceState === 'listening' || voiceState === 'interrupted');
  const showHeard = !denied && !errored && !replying && captionsOn && !showReply;
  // fix/voice-mode-turn-ux (Part D): the centre pill button now has a real action in TWO live
  // phases, not one - ASSISTANT_SPEAKING ("Stop reply", unchanged) and USER_SPEAKING ("End
  // message", new). PROCESSING/LISTENING keep the existing disabled-state rendering.
  const mainActionable = replying || userSpeaking;
  const mainActionHandler = replying ? onVoiceInterrupt : userSpeaking ? onVoiceEndMessage : undefined;
  const mainActionLabel = replying ? strings.stopReply : userSpeaking ? strings.endMessage : (thinking && voiceManualFinishPending ? strings.endingMessage : phaseLabel);
  const mainActionIcon = replying ? 'square' : userSpeaking ? 'send' : 'check';

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
  }, [onVoiceToggle, onVoiceMuteToggle, voiceMuted]);

  const mm = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
  const ss = String(elapsedSeconds % 60).padStart(2, '0');

  return (
    <div
      data-navrya-assistant="voice-console" className="navrya-voice-console"
      style={{
        position: 'relative', borderRadius: 'var(--radius-14)', border: '1px solid var(--border-gold-strong)',
        background: 'linear-gradient(180deg,rgba(17,27,28,.97),rgba(7,11,15,.98))',
        boxShadow: 'var(--shadow-panel),var(--glow-soft)', overflow: 'hidden',
        animation: 'navrya-pop-in 220ms var(--ease-out) both'
      }}
    >
      <span aria-hidden="true" style={{ position: 'absolute', top: 5, insetInlineEnd: 5, width: 14, height: 14, borderTop: '1px solid color-mix(in srgb,var(--char-accent) 80%,transparent)', borderInlineEnd: '1px solid color-mix(in srgb,var(--char-accent) 80%,transparent)' }} />
      <span aria-hidden="true" style={{ position: 'absolute', top: 5, insetInlineStart: 5, width: 14, height: 14, borderTop: '1px solid color-mix(in srgb,var(--char-accent) 80%,transparent)', borderInlineStart: '1px solid color-mix(in srgb,var(--char-accent) 80%,transparent)' }} />
      <span aria-hidden="true" style={{ position: 'absolute', bottom: 5, insetInlineEnd: 5, width: 14, height: 14, borderBottom: '1px solid color-mix(in srgb,var(--char-accent) 80%,transparent)', borderInlineEnd: '1px solid color-mix(in srgb,var(--char-accent) 80%,transparent)' }} />
      <span aria-hidden="true" style={{ position: 'absolute', bottom: 5, insetInlineStart: 5, width: 14, height: 14, borderBottom: '1px solid color-mix(in srgb,var(--char-accent) 80%,transparent)', borderInlineStart: '1px solid color-mix(in srgb,var(--char-accent) 80%,transparent)' }} />

      <div className="navrya-voice-console-header" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border-hairline)' }}>
        {/* NAVRYA chat dock redesign consistency pass: the same one-time header sweep
            ChatResponsePopover.jsx's header now plays (NavryaChatDock.dc.html) - purely
            decorative, plays once on mount, touches nothing about the real voice transport/turn
            state machine below (NavryaVoiceMode.dc.html itself is unchanged - this console already
            matched it pixel-for-pixel before this pass). */}
        <span aria-hidden="true" style={{ position: 'absolute', top: 0, insetInlineStart: 0, insetInlineEnd: 0, height: 1, overflow: 'hidden' }}>
          <span style={{ display: 'block', width: '38%', height: 1, background: 'linear-gradient(90deg,transparent,var(--char-accent),transparent)', animation: 'navrya-sweep-a 900ms var(--ease-out) both' }} />
        </span>
        <span style={{ width: 30, height: 30, flex: 'none', borderRadius: 999, display: 'grid', placeItems: 'center', border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.6)' }}>
          <ModelGlyph model={model} size={16} />
        </span>
        <span className="navrya-voice-console-model" style={{ font: 'var(--type-caption)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--text-primary)' }}>{model ? model.label : ''} · VOICE</span>
        <span className="navrya-voice-console-divider" aria-hidden="true" style={{ width: 1, height: 18, background: 'var(--border-hairline)' }} />
        <span className="navrya-voice-console-status" style={{ font: 'var(--type-caption)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{denied ? 'MIC DENIED' : (PHASE_CODE[voiceState] || '')}</span>
        <span style={{ flex: 1 }} />
        <span className="navrya-tabular" style={{ font: 'var(--type-countdown)', fontSize: 15, color: 'var(--parchment)' }}>{mm}:{ss}</span>
        <button type="button" aria-label={strings.minimize} title={strings.minimize} onClick={onMinimize} style={{ width: 32, height: 32, flex: 'none', borderRadius: 8, display: 'grid', placeItems: 'center', cursor: 'pointer', border: '1px solid var(--border-hairline)', background: 'transparent', color: 'var(--text-muted)' }}>
          <Icon name="chevron-down" size={16} />
        </button>
        <button type="button" aria-label={strings.close} title={strings.close} onClick={onVoiceEnd} style={{ width: 32, height: 32, flex: 'none', borderRadius: 8, display: 'grid', placeItems: 'center', cursor: 'pointer', border: '1px solid var(--border-hairline)', background: 'transparent', color: 'var(--text-muted)' }}>
          <Icon name="x" size={16} />
        </button>
      </div>

      {/* fix/voice-mode-turn-ux (Part E req 13): the meter/caption area - not the header or the
          footer controls below, both of which stay outside this wrapper and therefore always
          reachable - is its own bounded, scrollable region so a short viewport (or a long reply
          caption) can never push the mute/main-action/captions-toggle controls off-screen. */}
      <div className="navrya-scroll navrya-voice-console-content" style={{ maxHeight: '46vh', overflowY: 'auto', boxSizing: 'border-box' }}>
        <div style={{ position: 'relative', padding: '20px 22px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <span aria-hidden="true" style={{ width: 9, height: 9, flex: 'none', borderRadius: 999, background: dotColor, animation: 'navrya-halo 1150ms var(--ease-standard) infinite' }} />
            <span style={{ font: 'var(--type-display-md)', fontSize: 19, fontWeight: 700, color: 'var(--parchment)' }}>{phaseLabel}</span>
            <span aria-hidden="true" style={{ width: 1, height: 16, background: 'var(--border-hairline)' }} />
            <span style={{ font: 'var(--type-body)', fontSize: 13, color: 'var(--text-muted)' }}>{phaseCaption}</span>
          </div>

          {showMeter && <VoiceMeter voiceState={voiceState} muted={voiceMuted} getVoiceMediaStream={getVoiceMediaStream} count={48} height={68} color={dotColor} />}
          {thinking && <ThinkingIndicator model={model} label={strings.analysing} />}
          {denied && <DeniedCard strings={strings} onRetry={onVoiceToggle} onEnd={onVoiceEnd} />}
          {errored && <DeniedCard strings={{ deniedTitle: strings.errorLabel, deniedBody: strings.errorLabel, retry: strings.retry, close: strings.close }} onRetry={onVoiceToggle} onEnd={onVoiceEnd} />}
        </div>

        {showHeard && (
          <CaptionBox
            label={thinking ? strings.heardLabel : strings.listeningPlaceholder}
            text={thinking ? (voiceHeardText || '') : ''}
            caret={!thinking}
            tone="heard"
          />
        )}
        {/* fix/voice-mode-turn-ux (Part C req 10): renders the full text directly - the previous
            char-by-char typewriter reset to '' the instant `replying` went false (entering
            LISTENING), which would have made the reply appear to vanish right as this requirement
            says it must stay visible. An instant, complete reveal can never be truncated/disappear. */}
        {showReply && <CaptionBox label={strings.replyLabel} text={voiceReplyCaption} caret={false} tone="reply" />}
      </div>

      <div className="navrya-voice-console-controls" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderTop: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.4)' }}>
        <button
          type="button" className="navrya-voice-console-mute" aria-label={voiceMuted ? strings.unmute : strings.mute} onClick={onVoiceMuteToggle}
          style={{ width: 44, height: 44, flex: 'none', borderRadius: 10, display: 'grid', placeItems: 'center', cursor: 'pointer', border: '1px solid ' + (voiceMuted ? 'var(--border-gold-strong)' : 'var(--border-hairline)'), background: voiceMuted ? 'var(--char-active-surface)' : 'transparent', color: voiceMuted ? 'var(--char-accent)' : 'var(--text-muted)' }}
        >
          <Icon name={voiceMuted ? 'mic-off' : 'mic'} size={19} />
        </button>
        <button
          type="button" className="navrya-voice-console-type" aria-label={strings.type} onClick={onVoiceEnd}
          style={{ height: 44, flex: 'none', padding: '0 14px', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', border: '1px solid var(--border-hairline)', background: 'transparent', font: 'var(--type-body)', color: 'var(--text-muted)' }}
        >
          <Icon name="keyboard" size={19} />
          {strings.type}
        </button>
        <span style={{ flex: 1 }} />
        <button
          type="button" className="navrya-voice-console-main-action" onClick={mainActionable ? mainActionHandler : undefined} aria-label={mainActionLabel} disabled={!mainActionable}
          style={{
            height: 56, flex: 'none', padding: '0 24px', borderRadius: 'var(--radius-pill)', display: 'flex', alignItems: 'center', gap: 10,
            cursor: mainActionable ? 'pointer' : 'default', border: '1px solid transparent',
            background: mainActionable ? 'var(--char-accent)' : 'rgba(244,234,215,.06)',
            color: mainActionable ? 'var(--ink-950)' : 'var(--text-muted)',
            boxShadow: mainActionable ? 'var(--glow-active)' : 'none',
            font: 'var(--type-nav)'
          }}
        >
          <Icon name={mainActionIcon} size={20} />
          {mainActionLabel}
        </button>
        <span style={{ flex: 1 }} />
        <button
          type="button" className="navrya-voice-console-captions" aria-label={captionsOn ? strings.captionsOn : strings.captionsOff} onClick={() => setCaptionsOn((v) => !v)}
          style={{ width: 44, height: 44, flex: 'none', borderRadius: 10, display: 'grid', placeItems: 'center', cursor: 'pointer', border: '1px solid ' + (captionsOn ? 'var(--border-gold-strong)' : 'var(--border-hairline)'), background: 'transparent', color: captionsOn ? 'var(--text-primary)' : 'var(--text-muted)' }}
        >
          <Icon name="captions" size={19} />
        </button>
        <span className="navrya-voice-console-volume" aria-hidden="true" style={{ width: 44, height: 44, flex: 'none', borderRadius: 10, display: 'grid', placeItems: 'center', border: '1px solid var(--border-hairline)', color: 'var(--text-muted)' }}>
          <Icon name="volume-2" size={19} />
        </span>
        <span className="navrya-voice-console-speed" aria-hidden="true" style={{ flex: 'none', height: 44, padding: '0 12px', borderRadius: 10, display: 'grid', placeItems: 'center', border: '1px solid var(--border-hairline)', font: 'var(--type-body)', color: 'var(--text-muted)' }}>1×</span>
      </div>

      <div className="navrya-voice-console-footer" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14, padding: '9px 16px', borderTop: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.65)', flexWrap: 'wrap' }}>
        <span style={{ font: 'var(--type-caption)', fontSize: 11, color: 'var(--text-muted)' }}>Esc — {strings.close}</span>
        <span aria-hidden="true" style={{ width: 1, height: 12, background: 'var(--border-hairline)' }} />
        <span style={{ font: 'var(--type-caption)', fontSize: 11, color: 'var(--text-muted)' }}>Space — {strings.mute}</span>
      </div>
    </div>
  );
}

/* Collapsed pill - same live meter/timer, fits back into the dock's own row height. */
export function VoiceMiniBar({ voiceState, voiceMuted, dotColor, phaseLabel, elapsedSeconds, onExpand, onVoiceToggle, onVoiceEnd, getVoiceMediaStream, strings }) {
  useAssistantMotion();
  const mm = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
  const ss = String(elapsedSeconds % 60).padStart(2, '0');
  return (
    <div
      data-navrya-assistant="voice-mini"
      style={{
        display: 'flex', alignItems: 'center', gap: 12, height: 56, boxSizing: 'border-box', padding: '0 10px 0 18px',
        borderRadius: 'var(--radius-pill)', border: '1px solid var(--border-gold-strong)',
        background: 'linear-gradient(180deg,rgba(17,27,28,.96),rgba(7,11,15,.97))', boxShadow: 'var(--shadow-panel),var(--glow-active)'
      }}
    >
      <span aria-hidden="true" style={{ width: 8, height: 8, flex: 'none', borderRadius: 999, background: dotColor, animation: 'navrya-halo 1150ms var(--ease-standard) infinite' }} />
      <span style={{ font: 'var(--type-body)', fontSize: 14, color: 'var(--parchment)', whiteSpace: 'nowrap' }}>{phaseLabel}</span>
      <span aria-hidden="true" style={{ width: 1, height: 20, flex: 'none', background: 'var(--border-hairline)' }} />
      <VoiceMeter voiceState={voiceState} muted={voiceMuted} getVoiceMediaStream={getVoiceMediaStream} count={14} height={22} barWidth={2} gap={3} color={dotColor} />
      <span className="navrya-tabular" style={{ font: 'var(--type-caption)', fontSize: 12, color: 'var(--text-muted)' }}>{mm}:{ss}</span>
      <span style={{ flex: 1 }} />
      <button type="button" aria-label={strings.expand} title={strings.expand} onClick={onExpand} style={{ width: 36, height: 36, flex: 'none', borderRadius: 999, display: 'grid', placeItems: 'center', cursor: 'pointer', border: '1px solid var(--border-hairline)', background: 'transparent', color: 'var(--text-muted)' }}>
        <Icon name="chevron-up" size={18} />
      </button>
      <button type="button" aria-label={strings.close} title={strings.close} onClick={onVoiceEnd} style={{ width: 36, height: 36, flex: 'none', borderRadius: 999, display: 'grid', placeItems: 'center', cursor: 'pointer', border: '1px solid color-mix(in srgb,var(--danger) 45%,transparent)', background: 'rgba(255,56,48,.1)', color: 'var(--danger)' }}>
        <Icon name="x" size={18} />
      </button>
    </div>
  );
}
