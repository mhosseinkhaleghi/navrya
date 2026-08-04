import React from 'react';

/* Level module — 104px wide, uppercase label over a 48px accent numeral. */
export function LevelBadge({ level = 27, label = 'LEVEL', width = 104, style, ...rest }) {
  return (
    <div style={{
      width, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flex: 'none', ...style
    }} {...rest}>
      <span style={{
        font: 'var(--type-section-label)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-muted)'
      }}>{label}</span>
      <span className="navrya-tabular" style={{
        font: 'var(--type-level)', color: 'var(--char-accent)', letterSpacing: '.01em'
      }}>{String(level).padStart(2, '0')}</span>
    </div>
  );
}
