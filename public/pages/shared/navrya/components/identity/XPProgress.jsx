import React from 'react';

/* XP track + value/percentage row. 8px track, accent gradient fill, 240ms ease-out. */
export function XPProgress({
  value = 18450, max = 25000, label = 'XP', showPercent = true, height = 8, style, ...rest
}) {
  const pct = Math.max(0, Math.min(100, Math.floor((value / max) * 100)));
  const fmt = (n) => n.toLocaleString('en-US');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, ...style }} {...rest}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{
          font: 'var(--type-section-label)', letterSpacing: 'var(--tracking-label)',
          color: 'var(--char-accent)'
        }}>{label}</span>
        <span className="navrya-tabular" style={{ font: 'var(--type-body)', color: 'var(--text-primary)' }}>
          {fmt(value)} / {fmt(max)}
        </span>
        {showPercent && (
          <span className="navrya-tabular" style={{ marginLeft: 'auto', font: 'var(--type-body)', color: 'var(--text-muted)' }}>
            {pct}%
          </span>
        )}
      </div>
      <div
        role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
        style={{
          height, borderRadius: 'var(--xp-track-radius)', background: 'rgba(244,234,215,.07)',
          border: '1px solid var(--border-hairline)', overflow: 'hidden'
        }}
      >
        <div style={{
          width: pct + '%', height: '100%', borderRadius: 'var(--xp-track-radius)',
          background: 'linear-gradient(90deg, var(--char-accent-strong) 0%, var(--char-accent) 100%)',
          boxShadow: '0 0 12px var(--char-glow)',
          transition: 'width var(--dur-progress) var(--ease-out)'
        }}></div>
      </div>
    </div>
  );
}
