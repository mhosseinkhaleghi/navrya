import React from 'react';
import { Icon } from '../core/Icon.jsx';

/* Toolbar dropdown — 44px control, gold frame, accent-framed listbox. */
export function Select({
  value, options = [], onChange, icon, width, placeholder = 'Select', disabled = false,
  align = 'start', style, ...rest
}) {
  const [open, setOpen] = React.useState(false);
  const [hover, setHover] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  const list = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  const current = list.find((o) => o.value === value) || list[0];
  return (
    <div ref={ref} style={{ position: 'relative', width, ...style }} {...rest}>
      <button
        type="button" disabled={disabled} onClick={() => setOpen(!open)}
        aria-haspopup="listbox" aria-expanded={open}
        onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        style={{
          height: 44, width: '100%', boxSizing: 'border-box', padding: '0 14px', borderRadius: 8,
          display: 'flex', alignItems: 'center', gap: 9, cursor: disabled ? 'not-allowed' : 'pointer',
          background: hover || open ? 'rgba(244,234,215,.06)' : 'rgba(11,20,21,.72)',
          border: '1px solid ' + (open ? 'var(--char-accent)' : hover ? 'var(--border-gold-strong)' : 'var(--border-gold)'),
          color: 'var(--text-primary)', font: 'var(--type-body)', opacity: disabled ? .38 : 1,
          transition: 'background var(--dur-hover) var(--ease-out), border-color var(--dur-hover) var(--ease-out)'
        }}
      >
        {icon && <span style={{ color: 'var(--gold-warm)', flex: 'none' }}><Icon name={icon} size={18} /></span>}
        <span style={{ flex: 1, textAlign: align === 'center' ? 'center' : 'start', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {current ? current.label : placeholder}
        </span>
        <span style={{
          color: 'var(--text-muted)', flex: 'none', display: 'flex',
          transform: open ? 'rotate(180deg)' : 'none', transition: 'transform var(--dur-hover) var(--ease-out)'
        }}><Icon name="chevron" size={16} /></span>
      </button>
      {open && (
        <ul
          role="listbox"
          style={{
            position: 'absolute', top: 48, left: 0, minWidth: '100%', zIndex: 40, margin: 0,
            padding: 4, listStyle: 'none', borderRadius: 8, background: 'var(--overlay-500)',
            border: '1px solid var(--char-accent)', boxShadow: 'var(--shadow-panel)'
          }}
        >
          {list.map((o) => (
            <li key={o.value}>
              <button
                type="button" role="option" aria-selected={o.value === value}
                onClick={() => { setOpen(false); if (onChange) onChange(o.value); }}
                style={{
                  width: '100%', height: 38, padding: '0 12px', display: 'flex', alignItems: 'center',
                  gap: 8, borderRadius: 6, border: 0, cursor: 'pointer', textAlign: 'start',
                  background: o.value === value ? 'var(--char-active-surface)' : 'transparent',
                  color: o.value === value ? 'var(--char-accent)' : 'var(--text-primary)',
                  font: 'var(--type-body)', whiteSpace: 'nowrap'
                }}
                onMouseEnter={(e) => { if (o.value !== value) e.currentTarget.style.background = 'rgba(244,234,215,.06)'; }}
                onMouseLeave={(e) => { if (o.value !== value) e.currentTarget.style.background = 'transparent'; }}
              >
                {o.native && <span style={{ color: 'var(--text-muted)', font: 'var(--type-caption)' }}>{o.native}</span>}
                <span style={{ flex: 1 }}>{o.label}</span>
                {o.value === value && <Icon name="check" size={15} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
