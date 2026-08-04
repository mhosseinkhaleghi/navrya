import React from 'react';
import { Icon } from '../core/Icon.jsx';

/* One metric tile — 24px icon, 11px label, 20px tabular value. Min 132×64. */
export function MetricTile({ icon = 'honour', label = 'HONOUR', value = '1,850', minWidth = 132, style, ...rest }) {
  return (
    <div style={{
      minWidth, height: 'var(--metric-tile-h)', display: 'flex', alignItems: 'center', gap: 9,
      padding: '0 10px', flex: '1 1 0', ...style
    }} {...rest}>
      <span style={{ color: 'var(--char-accent)' }}><Icon name={icon} size={24} /></span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{
          font: 'var(--type-metric-label)', letterSpacing: 'var(--tracking-label)',
          color: 'var(--text-muted)', textTransform: 'uppercase', whiteSpace: 'nowrap'
        }}>{label}</span>
        <span className="navrya-tabular" style={{ font: 'var(--type-metric-value)', color: 'var(--parchment)' }}>{value}</span>
      </span>
    </div>
  );
}
