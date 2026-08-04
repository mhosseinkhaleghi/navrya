import React from 'react';
import { Icon } from '../core/Icon.jsx';

/* Dialog shell. The surface stays neutral ink — character identity shows only in the
   accent icon tile, the focus rings and the primary action, never as a background tint. */
export function Modal({
  open = true, title, icon, eyebrow, onClose, footer, width = 860, children, style, ...rest
}) {
  React.useEffect(() => {
    if (!open || !onClose) return undefined;
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100, display: 'grid', placeItems: 'center',
        padding: 24, background: 'var(--scrim)', backdropFilter: 'blur(3px)'
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}
    >
      <div
        role="dialog" aria-modal="true" aria-label={title}
        style={{
          width: '100%', maxWidth: width, maxHeight: 'calc(100vh - 48px)', boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          borderRadius: 14, border: '1px solid var(--border-gold)', background: 'var(--ink-900)',
          boxShadow: '0 18px 38px rgba(0,0,0,.34)', ...style
        }}
        {...rest}
      >
        {eyebrow && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
            padding: '10px 20px', borderBottom: '1px solid var(--border-hairline)',
            font: 'var(--type-caption)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase'
          }}>
            <span style={{ color: 'var(--char-accent)' }}>{eyebrow.left}</span>
            <span style={{ color: 'var(--text-muted)' }}>{eyebrow.right}</span>
          </div>
        )}
        <header style={{
          display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px',
          borderBottom: '1px solid var(--border-hairline)'
        }}>
          {icon && (
            <span style={{
              width: 34, height: 34, borderRadius: 8, display: 'grid', placeItems: 'center', flex: 'none',
              color: 'var(--char-accent)', background: 'rgba(3,8,7,.7)',
              border: '1px solid color-mix(in srgb, var(--char-accent) 60%, transparent)'
            }}><Icon name={icon} size={18} /></span>
          )}
          <h2 style={{ margin: 0, flex: 1, font: 'var(--type-body)', fontSize: 18, lineHeight: '23px', fontWeight: 600, color: 'var(--parchment)' }}>{title}</h2>
          {onClose && (
            <button
              type="button" onClick={onClose} aria-label="Close"
              style={{
                width: 34, height: 34, borderRadius: 8, display: 'grid', placeItems: 'center',
                background: 'transparent', border: '1px solid transparent', color: 'var(--text-muted)', cursor: 'pointer'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-gold)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
            ><Icon name="close" size={18} /></button>
          )}
        </header>
        <div className="navrya-scroll" style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {children}
        </div>
        {footer && (
          <footer style={{
            display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px',
            borderTop: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.35)'
          }}>{footer}</footer>
        )}
      </div>
    </div>
  );
}
