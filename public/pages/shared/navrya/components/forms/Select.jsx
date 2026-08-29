import React from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../core/Icon.jsx';

/* Toolbar dropdown — 44px control, gold frame, accent-framed listbox.

   The open listbox is portaled to document.body and positioned from the trigger's live
   viewport rect (position: fixed), instead of rendering in-flow as an absolutely-positioned
   child of the trigger. Every caller of this component sits inside a Panel (core/Panel.jsx
   always sets overflow:hidden on its frame) or inside Modal's dialog box (same) - an in-flow
   list got silently clipped at the card/dialog edge, or - when it fit - painted overlapping
   whatever the next row/section happened to be, since it was never actually floating above the
   rest of the page. Found via real screenshots: the Settings "AI companion" and "Region &
   language" rows, and the AI Assistant model picker, all showing a truncated or overlapping
   option list. Flips to open upward when there isn't room below the viewport. */
export function Select({
  value, options = [], onChange, icon, width, placeholder = 'Select', disabled = false,
  align = 'start', style, ...rest
}) {
  const [open, setOpen] = React.useState(false);
  const [hover, setHover] = React.useState(false);
  const [menuStyle, setMenuStyle] = React.useState(null);
  const triggerRef = React.useRef(null);
  const menuRef = React.useRef(null);

  const list = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  const current = list.find((o) => o.value === value) || list[0];

  const reposition = React.useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 4;
    const estimatedHeight = Math.min(320, 8 + list.length * 38);
    const spaceBelow = window.innerHeight - rect.bottom - gap;
    const spaceAbove = rect.top - gap;
    const openUp = estimatedHeight > spaceBelow && spaceAbove > spaceBelow;
    setMenuStyle({
      position: 'fixed', left: rect.left, minWidth: rect.width,
      maxHeight: Math.max(120, (openUp ? spaceAbove : spaceBelow)),
      ...(openUp ? { bottom: window.innerHeight - rect.top + gap } : { top: rect.bottom + gap })
    });
  }, [list.length]);

  React.useEffect(() => {
    if (!open) return undefined;
    reposition();
    const away = (e) => {
      if (triggerRef.current && triggerRef.current.contains(e.target)) return;
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', away);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('mousedown', away);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, reposition]);

  return (
    <div ref={triggerRef} style={{ position: 'relative', width, ...style }} {...rest}>
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
      {open && menuStyle && createPortal(
        <ul
          ref={menuRef}
          role="listbox"
          style={{
            ...menuStyle, zIndex: 1000, margin: 0, overflowY: 'auto',
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
        </ul>,
        document.body
      )}
    </div>
  );
}
