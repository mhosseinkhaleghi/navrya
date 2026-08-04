import React from 'react';
import { Icon } from '../core/Icon.jsx';

/* Toolbar search field — 44px, trailing search glyph, takes the remaining width. */
export function SearchField({
  value, onChange, placeholder = 'Search sessions', disabled = false, style, ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  return (
    <div
      style={{
        height: 44, boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 9,
        padding: '0 14px', borderRadius: 8, background: 'rgba(11,20,21,.72)',
        border: '1px solid ' + (focus ? 'var(--char-accent)' : 'var(--border-gold)'),
        boxShadow: focus ? 'var(--glow-active)' : 'none',
        transition: 'border-color var(--dur-hover) var(--ease-out)', ...style
      }}
      {...rest}
    >
      <input
        type="search" value={value} disabled={disabled} placeholder={placeholder}
        onChange={(e) => onChange && onChange(e.target.value)}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{
          flex: 1, minWidth: 0, background: 'transparent', border: 0, outline: 'none',
          color: 'var(--text-primary)', font: 'var(--type-body)'
        }}
      />
      <span style={{ color: 'var(--text-muted)', flex: 'none', display: 'flex' }}><Icon name="search" size={18} /></span>
    </div>
  );
}
