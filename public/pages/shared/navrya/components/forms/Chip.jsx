import React from 'react';

const TONES = {
  accent: { color: 'var(--char-accent)', border: 'color-mix(in srgb, var(--char-accent) 55%, transparent)', background: 'var(--char-active-surface)' },
  neutral: { color: 'var(--text-muted)', border: 'var(--border-gold)', background: 'rgba(11,20,21,.72)' },
  success: { color: 'var(--success)', border: 'color-mix(in srgb, var(--success) 55%, transparent)', background: 'rgba(46,204,113,.10)' },
  danger: { color: 'var(--danger)', border: 'rgba(255,56,48,.45)', background: 'rgba(255,56,48,.10)' },
  // AI dashboard's engine cards: an unconfigured key ("کلید تنظیم‌نشده") vs. a personal key
  // ("کلید شخصی") - matches every design mockup's `.chip.warn`/`.chip.gold` exactly.
  warning: { color: 'var(--warning)', border: 'rgba(255,176,32,.5)', background: 'rgba(255,176,32,.10)' },
  gold: { color: 'var(--gold-warm)', border: 'rgba(214,175,107,.45)', background: 'rgba(214,175,107,.10)' }
};

/* Small metadata chip — session city, timeframe, status. Dot makes state non-colour-only. */
export function Chip({ tone = 'neutral', dot = false, children, style, ...rest }) {
  const t = TONES[tone] || TONES.neutral;
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, height: 24, padding: '0 10px',
        borderRadius: 6, font: 'var(--type-caption)', fontSize: 11, letterSpacing: '.06em',
        color: t.color, background: t.background, border: '1px solid ' + t.border, ...style
      }}
      {...rest}
    >
      {dot && <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', flex: 'none' }}></span>}
      {children}
    </span>
  );
}
