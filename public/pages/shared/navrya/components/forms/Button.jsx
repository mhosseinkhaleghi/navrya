import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { AnalyzingImageIcon } from '../feedback/AnalyzingImageIcon.jsx';

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

/* The NAVRYA control. 44px tall, R8, gold frame — one primary CTA per module.
   `loading` (additive, default false - every existing call site is unaffected): swaps whatever
   `icon` was given for the AnalyzingImageIcon scan animation and blocks the click, for a button
   whose action is a real in-flight chart-image call (Draw scenario, Draw full analysis on chart,
   Start analysis) - the honest "this is genuinely working, not stuck" signal the trader asked
   for, reusing loading-ui.com's "Analyzing image" motion language (see that icon's own header
   comment). `disabled` still wins outright if both are set. */
export function Button({
  variant = 'secondary', size = 'md', icon, iconAfter, disabled = false, loading = false, fullWidth = false,
  children, style, ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const v = VARIANTS[variant] || VARIANTS.secondary;
  const blocked = disabled || loading;
  const h = hover && !blocked ? HOVER[variant] : null;
  const pad = size === 'sm' ? '0 12px' : '0 18px';
  const iconSize = size === 'sm' ? 16 : 18;
  return (
    <button
      type="button" disabled={blocked} aria-busy={loading || undefined}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        height: size === 'sm' ? 36 : 44, padding: pad, borderRadius: 8, boxSizing: 'border-box',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9,
        font: 'var(--type-body)', fontSize: size === 'sm' ? 12 : 13, letterSpacing: '.02em',
        cursor: blocked ? 'not-allowed' : 'pointer', width: fullWidth ? '100%' : undefined,
        opacity: disabled ? .38 : loading ? .82 : 1, whiteSpace: 'nowrap',
        transition: 'background var(--dur-hover) var(--ease-out), border-color var(--dur-hover) var(--ease-out), filter var(--dur-hover) var(--ease-out)',
        ...v, ...h, ...style
      }}
      {...rest}
    >
      {loading ? <AnalyzingImageIcon size={iconSize} /> : icon && <Icon name={icon} size={iconSize} />}
      {children}
      {!loading && iconAfter && <Icon name={iconAfter} size={iconSize} />}
    </button>
  );
}
