import React from 'react';
import { Icon } from '../core/Icon.jsx';

const VARIANTS = {
  primary: {
    background: 'var(--char-accent)', color: 'var(--ink-950)',
    border: '1px solid var(--char-accent)', fontWeight: 600
  },
  secondary: {
    background: 'rgba(11,20,21,.72)', color: 'var(--text-primary)',
    border: '1px solid var(--border-gold)', fontWeight: 500
  },
  danger: {
    background: 'rgba(255,56,48,.08)', color: 'var(--danger)',
    border: '1px solid rgba(255,56,48,.45)', fontWeight: 500
  },
  ghost: {
    background: 'transparent', color: 'var(--text-muted)',
    border: '1px solid transparent', fontWeight: 500
  }
};

const HOVER = {
  primary: { filter: 'brightness(var(--hover-brightness))' },
  secondary: { background: 'rgba(244,234,215,.06)', borderColor: 'var(--border-gold-strong)' },
  danger: { background: 'rgba(255,56,48,.16)', borderColor: 'var(--danger)' },
  ghost: { background: 'rgba(244,234,215,.04)', color: 'var(--text-primary)' }
};

/* The NAVRYA control. 44px tall, R8, gold frame — one primary CTA per module. */
export function Button({
  variant = 'secondary', size = 'md', icon, iconAfter, disabled = false, fullWidth = false,
  children, style, ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const v = VARIANTS[variant] || VARIANTS.secondary;
  const h = hover && !disabled ? HOVER[variant] : null;
  const pad = size === 'sm' ? '0 12px' : '0 18px';
  return (
    <button
      type="button" disabled={disabled}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        height: size === 'sm' ? 36 : 44, padding: pad, borderRadius: 8, boxSizing: 'border-box',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9,
        font: 'var(--type-body)', fontSize: size === 'sm' ? 12 : 13, letterSpacing: '.02em',
        cursor: disabled ? 'not-allowed' : 'pointer', width: fullWidth ? '100%' : undefined,
        opacity: disabled ? .38 : 1, whiteSpace: 'nowrap',
        transition: 'background var(--dur-hover) var(--ease-out), border-color var(--dur-hover) var(--ease-out), filter var(--dur-hover) var(--ease-out)',
        ...v, ...h, ...style
      }}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} />}
      {children}
      {iconAfter && <Icon name={iconAfter} size={size === 'sm' ? 16 : 18} />}
    </button>
  );
}
