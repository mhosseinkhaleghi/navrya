import React from 'react';
import { assetUrl } from '../core/AssetBase.jsx';
import { useAssistantMotion, TRAIT_ANIM } from './motion.js';

/* One engine's real logo, normalised onto the ink surface. Files live under
   assets/models/{id}.webp (provider-supplied, see ARCHITECTURE.md's Global AI Assistant
   section). Black-on-white marks (OpenAI, Kimi) are knocked out to white so they read on the
   dark dock; the two already-coloured marks (Anthropic's sunburst, DeepSeek's whale) keep
   their own brand colour - `model.knockout` picks which. */
export function ModelGlyph({ model, size = 18, animate = false, muted = false, style, ...rest }) {
  if (!model) return null;
  const filters = [];
  if (model.knockout) filters.push('brightness(0) invert(1)');
  if (muted) filters.push('grayscale(1)');
  return (
    <img
      src={assetUrl('assets/models/' + model.id + '.webp')} alt="" aria-hidden="true" draggable="false"
      style={{
        width: size, height: size, flex: 'none', display: 'block', objectFit: 'contain',
        transformOrigin: 'center',
        filter: filters.join(' ') || 'none',
        opacity: muted ? 0.62 : 1,
        animation: animate ? TRAIT_ANIM[model.trait] || 'none' : 'none',
        transition: 'opacity 160ms var(--ease-out),filter 160ms var(--ease-out)',
        ...style
      }}
      {...rest}
    />
  );
}

function ModelChip({ model, selected, onClick }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      type="button" role="radio" aria-checked={selected} aria-label={model.label} title={model.label}
      onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        width: 30, height: 30, flex: 'none', borderRadius: 'var(--radius-pill)', display: 'grid', placeItems: 'center',
        cursor: 'pointer', padding: 0,
        border: '1px solid ' + (selected ? 'color-mix(in srgb, var(--char-accent) 60%, transparent)' : hover ? 'var(--border-gold)' : 'transparent'),
        background: selected ? 'var(--char-active-surface)' : hover ? 'rgba(244,234,215,.04)' : 'transparent',
        transition: 'background 160ms var(--ease-out),border-color 160ms var(--ease-out),transform 160ms var(--ease-out)',
        transform: hover && !selected ? 'translateY(-1px)' : 'none'
      }}
    >
      <ModelGlyph model={model} size={17} muted={!selected && !hover} animate={selected || hover} />
    </button>
  );
}

/* Radio row of engine glyphs. Lives on the left of the ChatDock, after the add button. */
export function ModelSwitcher({ models, value, onChange, style, ...rest }) {
  useAssistantMotion();
  return (
    <div role="radiogroup" aria-label="Assistant engine" style={{ display: 'flex', alignItems: 'center', gap: 2, ...style }} {...rest}>
      {models.map((m) => (
        <ModelChip key={m.id} model={m} selected={m.id === value} onClick={() => onChange && onChange(m.id)} />
      ))}
    </div>
  );
}

/* The mischief: on every selection the glyph tumbles in beside the dock, then settles into
   that engine's idle loop. Remount by key to replay. */
export function ModelMascot({ model, size = 52, style, ...rest }) {
  useAssistantMotion();
  if (!model) return null;
  return (
    <div
      data-navrya-assistant="mascot"
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, ...style }}
      {...rest}
    >
      <div
        key={model.id}
        style={{
          width: size, height: size, borderRadius: 'var(--radius-pill)', display: 'grid', placeItems: 'center',
          background: 'linear-gradient(180deg,color-mix(in srgb,var(--char-active-surface) 46%,rgba(17,27,28,.94)),color-mix(in srgb,var(--char-active-surface) 26%,rgba(7,11,15,.96)))',
          border: '1px solid var(--border-gold)', boxShadow: 'var(--shadow-raised),var(--glow-active)',
          backdropFilter: 'blur(10px)',
          animation: 'navrya-mascot-in 520ms var(--ease-out) both, navrya-bob 3200ms var(--ease-standard) 520ms infinite'
        }}
      >
        <ModelGlyph model={model} size={Math.round(size * 0.5)} animate />
      </div>
      <span style={{
        font: 'var(--type-caption)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase',
        color: 'var(--text-muted)', whiteSpace: 'nowrap',
        animation: 'navrya-line-in 300ms var(--ease-out) 220ms both'
      }}>{model.label}</span>
    </div>
  );
}
