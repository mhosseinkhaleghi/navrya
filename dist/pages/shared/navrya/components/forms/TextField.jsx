import React from 'react';

/* Labelled input — 44px, gold frame, neutral ink surface. Pair two per row in a dialog grid. */
export function TextField({
  label, value, onChange, placeholder, type = 'text', dir, disabled = false, hint, style, ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0, ...style }} {...rest}>
      {label && (
        <span style={{ font: 'var(--type-body)', fontSize: 12, color: 'var(--text-primary)' }}>{label}</span>
      )}
      <input
        type={type} value={value} placeholder={placeholder} dir={dir} disabled={disabled}
        onChange={(e) => onChange && onChange(e.target.value)}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{
          height: 44, boxSizing: 'border-box', padding: '0 14px', borderRadius: 8, width: '100%',
          background: 'rgba(3,8,7,.55)', color: 'var(--text-primary)', font: 'var(--type-body)',
          border: '1px solid ' + (focus ? 'var(--char-accent)' : 'var(--border-gold)'),
          outline: 'none', opacity: disabled ? .38 : 1,
          transition: 'border-color var(--dur-hover) var(--ease-out)'
        }}
      />
      {hint && <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{hint}</span>}
    </label>
  );
}
