import React from 'react';

/* Circular progress ring via conic-gradient (no canvas/SVG library). value=null renders an
   honest "insufficient data" ring (dashed, no fill) rather than a fabricated percentage. */
export function ProgressRing({ value, label, size = 72, emptyLabel = '—', style, ...rest }) {
  const hasValue = value !== null && value !== undefined;
  const pct = hasValue ? Math.max(0, Math.min(100, value)) : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, ...style }} {...rest}>
      <div style={{
        position: 'relative', width: size, height: size, borderRadius: '50%',
        background: hasValue
          ? 'conic-gradient(var(--char-accent) ' + pct + '%, rgba(244,234,215,.08) 0)'
          : 'none',
        border: hasValue ? 'none' : '1px dashed var(--border-gold)',
        display: 'grid', placeItems: 'center'
      }}>
        <div style={{
          position: 'absolute', inset: 5, borderRadius: '50%', background: 'var(--surface-card)',
          border: '1px solid var(--border-hairline)', display: 'grid', placeItems: 'center'
        }}>
          <span className="navrya-tabular" style={{ font: 'var(--type-username)', fontWeight: 700, color: hasValue ? 'var(--char-accent)' : 'var(--text-muted)' }}>
            {hasValue ? pct + '%' : emptyLabel}
          </span>
        </div>
      </div>
      {label && <span style={{ font: 'var(--type-caption)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-muted)' }}>{label}</span>}
    </div>
  );
}
