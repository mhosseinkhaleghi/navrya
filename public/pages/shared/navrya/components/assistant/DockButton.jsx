import React from 'react';
import { Icon } from '../core/Icon.jsx';

export function DockButton({ icon, label, tone = 'ghost', active = false, disabled = false, onClick }) {
  const [hover, setHover] = React.useState(false);
  const primary = tone === 'primary';
  const base = {
    width: 36, height: 36, flex: 'none', borderRadius: 'var(--radius-pill)', display: 'grid', placeItems: 'center',
    padding: 0, cursor: disabled ? 'default' : 'pointer',
    transition: 'background 160ms var(--ease-out),border-color 160ms var(--ease-out),color 160ms var(--ease-out),transform 160ms var(--ease-out)',
    transform: hover && !disabled ? 'translateY(-1px)' : 'translateY(0)'
  };
  const skin = primary
    ? {
      border: '1px solid transparent',
      background: disabled ? 'rgba(244,234,215,.06)' : 'var(--char-accent)',
      color: disabled ? 'var(--text-muted)' : 'var(--ink-950)',
      boxShadow: disabled ? 'none' : 'var(--glow-active)'
    }
    : {
      border: '1px solid ' + (active || hover ? 'var(--border-gold-strong)' : 'var(--border-hairline)'),
      background: active ? 'var(--char-active-surface)' : hover ? 'rgba(244,234,215,.04)' : 'transparent',
      color: active ? 'var(--char-accent)' : hover ? 'var(--text-primary)' : 'var(--text-muted)'
    };
  return (
    <button
      type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}
      aria-pressed={tone === 'ghost' && active ? true : undefined}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ ...base, ...skin }}
    >
      <Icon name={icon} size={18} />
    </button>
  );
}

/* Four-bar level meter shown while the mic is "listening" (ChatDock's mic toggle). */
export function Waveform({ bars = 4, color = 'var(--char-accent)' }) {
  return (
    <span aria-hidden="true" style={{ display: 'flex', alignItems: 'center', gap: 3, height: 18 }}>
      {Array.from({ length: bars }).map((_, i) => (
        <span key={i} style={{
          width: 2, height: 18, borderRadius: 2, background: color, transformOrigin: 'center',
          animation: `navrya-bar ${640 + i * 90}ms var(--ease-standard) ${i * 80}ms infinite`
        }} />
      ))}
    </span>
  );
}
