import React from 'react';

/* Real checkbox-backed switch (never a fake div-only toggle) - a genuinely disabled Toggle
   stays disabled for keyboard/screen-reader users too, not just visually dimmed. Logical
   properties throughout so it mirrors correctly under dir="rtl" with no extra prop. */
export function Toggle({ checked = false, onChange, disabled = false, label, hint, style, ...rest }) {
  return (
    <label
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? .5 : 1, ...style
      }}
      {...rest}
    >
      {(label || hint) && (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
          {label && <span style={{ font: 'var(--type-body)', color: 'var(--text-primary)' }}>{label}</span>}
          {hint && <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{hint}</span>}
        </span>
      )}
      <span style={{ position: 'relative', width: 42, height: 24, flex: 'none' }}>
        <input
          type="checkbox" checked={checked} disabled={disabled}
          onChange={(e) => onChange && onChange(e.target.checked)}
          style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', margin: 0, cursor: 'inherit' }}
        />
        <span aria-hidden="true" style={{
          position: 'absolute', inset: 0, borderRadius: 999,
          background: checked ? 'var(--char-accent)' : 'var(--border-gold)',
          transition: 'background var(--dur-hover) var(--ease-out)'
        }}></span>
        <span aria-hidden="true" style={{
          position: 'absolute', top: 3, insetInlineStart: checked ? 21 : 3, width: 18, height: 18, borderRadius: '50%',
          background: 'var(--parchment)', transition: 'inset-inline-start var(--dur-hover) var(--ease-out)'
        }}></span>
      </span>
    </label>
  );
}
