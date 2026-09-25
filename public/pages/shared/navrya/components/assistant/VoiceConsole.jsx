import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { useAssistantMotion } from './motion.js';
import { CompanionSigil } from './CompanionSigil.jsx';

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
// Companion capsule redesign: the header no longer shows an English phase code (CONNECTING /
// THINKING / MIC DENIED) next to "<ENGINE> · VOICE" - the localized phase label already sits large
// in the console body, and mic denial has its own DeniedCard. The header instead carries the same
// identity as the reply panel: the character's portrait (its ring reflects the phase), its name,
// and the engine as a small label.
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

// One quiet caption line (artbook plate VIII): what was heard, or the reply being spoken - a small
// label and the real text, instead of a big bordered box.
function CaptionBox({ label, text, caret, tone }) {
  return (
    <div className="navrya-voice-console-caption" style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '0 16px', boxSizing: 'border-box', minWidth: 0 }}>
      <span style={{ flex: 'none', font: 'var(--type-caption)', fontSize: 11, color: tone === 'reply' ? 'var(--gold-warm)' : 'var(--text-dim)', whiteSpace: 'nowrap' }}>{label}</span>
      <p dir="auto" style={{
        margin: 0, flex: 1, minWidth: 0, font: 'var(--type-body)', fontSize: 14, lineHeight: '24px',
        color: tone === 'reply' ? 'var(--parchment)' : 'color-mix(in srgb,var(--char-accent) 70%,var(--parchment))', textWrap: 'pretty',
        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden'
      }}>
        {text}
        {caret && <span aria-hidden="true" style={{ display: 'inline-block', width: 2, height: 16, marginInlineStart: 3, verticalAlign: -3, background: 'var(--char-accent)', animation: 'navrya-voice-caret 900ms steps(1) infinite' }} />}
      </p>
    </div>
  );
}

function RowButton({ icon, label, onClick, tone, active, className, disabled }) {
  const skin = tone === 'danger'
    ? { border: '1px solid color-mix(in srgb,var(--danger) 50%,transparent)', color: 'var(--danger)', background: 'transparent' }
    : tone === 'gold'
      ? { border: '1px solid color-mix(in srgb,var(--gold-warm) 60%,transparent)', color: 'var(--gold-warm)', background: 'rgba(214,175,107,.08)' }
      : active
        ? { border: '1px solid color-mix(in srgb,var(--char-accent) 50%,transparent)', color: 'var(--char-accent)', background: 'var(--char-active-surface)' }
        : { border: '1px solid var(--border-hairline)', color: 'var(--text-muted)', background: 'transparent' };
  return (
    <button
      type="button" className={className} aria-label={label} title={label} onClick={onClick} disabled={disabled}
      style={{ width: 40, height: 40, flex: 'none', borderRadius: 12, display: 'grid', placeItems: 'center', padding: 0, cursor: 'pointer', ...skin }}
    >
      <Icon name={icon} size={18} />
    </button>
  );
}

function capsuleFrame(joinedTop) {
  return {
    position: 'relative', boxSizing: 'border-box',
    borderRadius: joinedTop ? '0 0 20px 20px' : 20, border: '1px solid var(--border-gold)',
    borderTop: joinedTop ? '1px solid var(--border-hairline)' : undefined,
    background: joinedTop ? '#0A0D12' : 'linear-gradient(180deg,color-mix(in srgb,var(--char-accent) 11%,#0B0E14) 0%,#0B0E14 60%,#0A0D12 100%)',
    boxShadow: '0 26px 64px rgba(0,0,0,.6),0 0 40px var(--char-glow)'
  };
}

function CapsuleTicks() {
  return (
    <React.Fragment>
      <span aria-hidden="true" style={{ position: 'absolute', top: 9, insetInlineEnd: 9, width: 9, height: 9, pointerEvents: 'none', borderTop: '1px solid rgba(214,175,107,.55)', borderInlineEnd: '1px solid rgba(214,175,107,.55)' }} />
      <span aria-hidden="true" style={{ position: 'absolute', top: 9, insetInlineStart: 9, width: 9, height: 9, pointerEvents: 'none', borderTop: '1px solid rgba(214,175,107,.55)', borderInlineStart: '1px solid rgba(214,175,107,.55)' }} />
    </React.Fragment>
  );
}

/* Voice in the capsule (artbook plate VIII) - shown for the entire lifetime of a voice session
   unless minimized. Voice is a state of the same capsule, not a third window: one status line
   (phase, caption, or what was heard / is being said), then one row - the character's portrait
   (its ring shows the phase), the real waveform, the timer, mute, captions, back to typing, the
   one live action (Stop reply / End message, only while it can actually do something) and end.
   When a reply panel sits on top (`joinedTop`) that panel's header is the one identity header -
   this console carries none of its own. */
export function VoiceConsole({
  voiceState, voiceMuted, model, elapsedSeconds, dotColor, phaseLabel, phaseCaption,
  voicePermissionDenied, voiceHeardText, voiceReplyCaption, voiceManualFinishPending,
  // Slice R2, audit finding T12: defaults to true (the OpenAI Realtime adapter's real capability)
  // so every existing caller that never passes this keeps the exact prior behavior.
  voiceSupportsManualFinish = true,
  // Live caption fix (2026-09-13, real user report): defaults to false, the OPPOSITE default from
  // voiceSupportsManualFinish above - only GPT-Live reports this capability (gptLiveVoice.js's own
  // supportsLiveCaption()), so a caller that never passes it (or the retired Realtime/Gemini
  // transports) keeps today's exact "reveal only once finalized" look this component's own header
  // comment documents. When true, voiceHeardText/voiceReplyCaption are real, live, progressively
  // updating fragments (chatDockView.jsx's onInputTranscript/onOutputTranscript) rather than a
  // single value that only ever appears once a turn is fully finalized.
  voiceSupportsLiveCaption = false,
  onVoiceToggle, onVoiceEnd, onVoiceMuteToggle, onVoiceInterrupt, onVoiceEndMessage, onMinimize,
  getVoiceMediaStream, strings,
  // Companion capsule redesign: `companion` ({ name, portrait }) is the portrait in the row;
  // `joinedTop` squares the top corners when a reply panel sits flush on top (ChatDock).
  companion, joinedTop = false
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
  // see its own comment). `showHeard`'s own "empty listening placeholder" line is suppressed
  // whenever a real reply caption is already being shown in its place, so the two never stack.
  const showReply = !denied && !errored && captionsOn && !!voiceReplyCaption &&
    (voiceState === 'assistant_speaking' || voiceState === 'listening' || voiceState === 'interrupted');
  const showHeard = !denied && !errored && !replying && captionsOn && !showReply;
  // fix/voice-mode-turn-ux (Part D): the live action exists in TWO phases - ASSISTANT_SPEAKING
  // ("Stop reply") and USER_SPEAKING ("End message").
  // Slice R2, audit finding T12: USER_SPEAKING only becomes an actionable "End message" button
  // when the active adapter actually supports finishing a turn early (voiceSupportsManualFinish) -
  // Gemini Live has no real client-side mechanism for this (see geminiLiveVoice.js's own comment),
  // so no button is offered there rather than one that would do nothing.
  // Capsule exact pass: in every other phase the button is simply not rendered (the old console
  // rendered it disabled as a big status pill); the status line above says what is happening.
  const canManualFinish = userSpeaking && voiceSupportsManualFinish;
  const mainActionable = replying || canManualFinish;
  const mainActionHandler = replying ? onVoiceInterrupt : canManualFinish ? onVoiceEndMessage : undefined;
  const mainActionLabel = replying ? strings.stopReply : canManualFinish ? strings.endMessage : (thinking && voiceManualFinishPending ? strings.endingMessage : phaseLabel);
  const mainActionIcon = replying ? 'square' : canManualFinish ? 'send' : 'check';
  const statusLabel = thinking && voiceManualFinishPending ? strings.endingMessage : phaseLabel;

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
      style={{ ...capsuleFrame(joinedTop), overflow: 'hidden', animation: 'navrya-pop-in 220ms var(--ease-out) both' }}
    >
      {!joinedTop && <CapsuleTicks />}

      {/* fix/voice-mode-turn-ux (Part E req 13): the status/caption area - not the control row
          below, which stays outside this wrapper and therefore always reachable - is its own
          bounded, scrollable region so a short viewport (or a long caption) can never push the
          mute/live-action/end controls off-screen. */}
      <div className="navrya-scroll navrya-voice-console-content" style={{ maxHeight: '46vh', overflowY: 'auto', boxSizing: 'border-box' }}>
        <div className="navrya-voice-console-header" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '16px 14px 6px 16px', minWidth: 0 }}>
          <span aria-hidden="true" style={{ width: 8, height: 8, flex: 'none', borderRadius: 999, background: dotColor, animation: 'navrya-halo 1150ms var(--ease-standard) infinite' }} />
          <span className="navrya-voice-console-model" style={{ font: 'var(--type-body)', fontSize: 14.5, fontWeight: 700, color: 'var(--parchment)', whiteSpace: 'nowrap' }}>{statusLabel}</span>
          <span className="navrya-voice-console-status" style={{ flex: 1, minWidth: 120, font: 'var(--type-caption)', fontSize: 12.5, color: 'var(--text-muted)' }}>{phaseCaption}</span>
          {onMinimize && (
            <button type="button" aria-label={strings.minimize} title={strings.minimize} onClick={onMinimize} style={{ width: 32, height: 32, flex: 'none', borderRadius: 10, display: 'grid', placeItems: 'center', cursor: 'pointer', border: '1px solid transparent', background: 'transparent', color: 'var(--text-muted)' }}>
              <Icon name="chevron-down" size={16} />
            </button>
          )}
        </div>

        {(denied || errored) && (
          <div style={{ padding: '4px 14px 8px' }}>
            {denied && <DeniedCard strings={strings} onRetry={onVoiceToggle} onEnd={onVoiceEnd} />}
            {errored && <DeniedCard strings={{ deniedTitle: strings.errorLabel, deniedBody: strings.errorLabel, retry: strings.retry, close: strings.close }} onRetry={onVoiceToggle} onEnd={onVoiceEnd} />}
          </div>
        )}

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
        <CompanionSigil className="navrya-voice-console-sigil" portrait={companion && companion.portrait} size={40} state={denied || errored ? 'idle' : (SIGIL_STATE[voiceState] || 'idle')} dot={false} />
        <div className="navrya-voice-console-meter" style={{ flex: 1, minWidth: 0, height: 36, display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
          {showMeter && <VoiceMeter voiceState={voiceState} muted={voiceMuted} getVoiceMediaStream={getVoiceMediaStream} count={34} height={30} barWidth={3} gap={3} color={dotColor} />}
          {thinking && <ThinkingIndicator label={strings.analysing} />}
        </div>
        <span className="navrya-voice-console-timer navrya-tabular" style={{ flex: 'none', minWidth: 40, textAlign: 'center', font: 'var(--type-caption)', fontSize: 13, color: 'var(--text-muted)' }}>{mm}:{ss}</span>
        <button
          type="button" className="navrya-voice-console-mute" aria-label={voiceMuted ? strings.unmute : strings.mute} onClick={onVoiceMuteToggle}
          style={{ width: 40, height: 40, flex: 'none', borderRadius: 12, display: 'grid', placeItems: 'center', padding: 0, cursor: 'pointer', border: '1px solid ' + (voiceMuted ? 'var(--border-gold-strong)' : 'var(--border-hairline)'), background: voiceMuted ? 'var(--char-active-surface)' : 'transparent', color: voiceMuted ? 'var(--char-accent)' : 'var(--text-muted)' }}
        >
          <Icon name={voiceMuted ? 'mic-off' : 'mic'} size={18} />
        </button>
        <RowButton className="navrya-voice-console-captions" icon="captions" label={captionsOn ? strings.captionsOn : strings.captionsOff} active={captionsOn} onClick={() => setCaptionsOn((v) => !v)} />
        <RowButton className="navrya-voice-console-type" icon="keyboard" label={strings.type} onClick={onVoiceEnd} />
        {mainActionable && (
          <button
            type="button" className="navrya-voice-console-main-action" onClick={mainActionable ? mainActionHandler : undefined} aria-label={mainActionLabel} disabled={!mainActionable} title={mainActionLabel}
            style={{
              height: 40, flex: 'none', padding: '0 14px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
              border: '1px solid ' + (replying ? 'color-mix(in srgb,var(--gold-warm) 60%,transparent)' : 'transparent'),
              background: replying ? 'rgba(214,175,107,.08)' : 'var(--char-accent)',
              color: replying ? 'var(--gold-warm)' : 'var(--ink-950)', font: 'var(--type-body)', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap'
            }}
          >
            <Icon name={mainActionIcon} size={16} />
            <span className="navrya-voice-console-main-label">{mainActionLabel}</span>
          </button>
        )}
        <RowButton className="navrya-voice-console-end" icon="x" tone="danger" label={strings.close} onClick={onVoiceEnd} />
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
      style={{ ...capsuleFrame(joinedTop), display: 'flex', alignItems: 'center', gap: 10, minHeight: 64, padding: '0 12px' }}
    >
      <CompanionSigil portrait={companion && companion.portrait} size={36} state={SIGIL_STATE[voiceState] || 'idle'} dot={false} />
      <span className="navrya-voice-mini-label" style={{ font: 'var(--type-body)', fontSize: 14, fontWeight: 600, color: 'var(--parchment)', whiteSpace: 'nowrap' }}>{phaseLabel}</span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'center', overflow: 'hidden' }}>
        <VoiceMeter voiceState={voiceState} muted={voiceMuted} getVoiceMediaStream={getVoiceMediaStream} count={14} height={22} barWidth={2} gap={3} color={dotColor} />
      </span>
      <span className="navrya-voice-mini-timer navrya-tabular" style={{ font: 'var(--type-caption)', fontSize: 12.5, color: 'var(--text-muted)' }}>{mm}:{ss}</span>
      <RowButton icon="chevron-up" label={strings.expand} onClick={onExpand} />
      <RowButton icon="x" tone="danger" label={strings.close} onClick={onVoiceEnd} />
    </div>
  );
}
