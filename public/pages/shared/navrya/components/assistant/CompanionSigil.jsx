import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { accent, INK_DEEP, GREEN } from './dockDesign.js';

/* The companion's face in every assistant surface (ChatDock capsule redesign, artbook plates
   III/IV/XIV-XVIII): the active character's own portrait inside a --char-accent ring, never the
   engine's logo - the engine is only a small label (see EngineChip below). The ring is the one place
   state shows:
   - idle: a still accent ring and a green "here" dot
   - thinking: an accent arc sweeping round (replaces the old separate "dots" row)
   - listening: a second ring breathes around the portrait (the design's "cap-pulse") and the dot
     turns the accent colour (Voice LISTENING/USER_SPEAKING)
   - speaking: a gold ring, the colour VOICE_STATES already uses for ASSISTANT_SPEAKING
   Purely presentational: no handler, so it is never a decoy control. */
var DOT_COLOR = {
  idle: GREEN, thinking: 'var(--gold-warm)', listening: 'var(--char-accent)', speaking: 'var(--gold-warm)'
};

export function CompanionSigil({ portrait, size = 36, state = 'idle', dot = true, className, style }) {
  var ringColor = state === 'speaking' ? 'var(--gold-warm)' : accent(60);
  var inner = size - 6;
  var dotSize = size > 40 ? 11 : 9;
  return (
    <span className={className} aria-hidden="true" style={{ position: 'relative', display: 'inline-block', width: size, height: size, flex: 'none', ...style }}>
      <span style={{ position: 'absolute', inset: 0, borderRadius: 999, border: '1.5px solid ' + ringColor }} />
      {state === 'thinking' && (
        <span style={{
          position: 'absolute', inset: -2, borderRadius: 999,
          background: 'conic-gradient(from 0deg,transparent 0 60%,var(--char-accent) 100%)',
          WebkitMask: 'radial-gradient(farthest-side,transparent calc(100% - 2.5px),#000 calc(100% - 2px))',
          mask: 'radial-gradient(farthest-side,transparent calc(100% - 2.5px),#000 calc(100% - 2px))',
          animation: 'navrya-spin 1100ms linear infinite'
        }} />
      )}
      {(state === 'listening' || state === 'speaking') && (
        <span style={{ position: 'absolute', inset: -5, borderRadius: 999, border: '2px solid ' + (state === 'speaking' ? ringColor : accent(55)), animation: 'navrya-cap-pulse 1400ms ease-in-out infinite' }} />
      )}
      {portrait
        ? <img src={portrait} alt="" draggable="false" style={{ position: 'absolute', top: 3, left: 3, width: inner, height: inner, borderRadius: 999, objectFit: 'cover', display: 'block' }} />
        : <span style={{ position: 'absolute', inset: 3, borderRadius: 999, display: 'grid', placeItems: 'center', background: 'var(--ink-950)', color: 'var(--char-accent)' }}><Icon name="sparkle" size={Math.round(size * 0.4)} /></span>}
      {dot && <span style={{ position: 'absolute', bottom: 0, insetInlineStart: 0, width: dotSize, height: dotSize, borderRadius: 999, background: DOT_COLOR[state] || DOT_COLOR.idle, boxShadow: '0 0 0 2px ' + INK_DEEP }} />}
    </span>
  );
}

/* The engine as a small label next to the companion's name (the Voice console header, the peek):
   the model's real glyph plus its real label. Informational only - the interactive version, with the
   engine menu behind it, is ChatDock's EngineChipButton (DockMenu.jsx). */
export function EngineChip({ model, glyph }) {
  if (!model) return null;
  return (
    <span dir="ltr" style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, height: 24, padding: '0 9px 0 7px', flex: 'none',
      borderRadius: 999, border: '1px solid var(--border-hairline)', font: 'var(--type-caption)', fontSize: 11.5, color: 'var(--text-muted)', whiteSpace: 'nowrap'
    }}>
      {glyph}{model.label}
    </span>
  );
}
