import React from 'react';
import { Icon } from '../core/Icon.jsx';

const TONES = { info: 'var(--info)', accent: 'var(--char-accent)', warning: 'var(--warning)', danger: 'var(--danger)' };

/* Inline notice strip — one line of guidance above a form. Neutral surface, accent glyph. */
export function Notice({ tone = 'accent', icon = 'status', children, style, ...rest }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 8,
        background: 'rgba(3,8,7,.45)', border: '1px solid var(--border-hairline)',
        font: 'var(--type-body)', color: 'var(--text-primary)', ...style
      }}
      {...rest}
    >
      <span style={{ color: TONES[tone] || TONES.accent, flex: 'none', display: 'flex' }}><Icon name={icon} size={14} /></span>
      <span style={{ flex: 1 }}>{children}</span>
    </div>
  );
}
