import React from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../core/Icon.jsx';
import { accent, MUTED, HAIRLINE, HAIRLINE_STRONG, DIALOG, EDGE_WELD } from './dockDesign.js';

/* A small menu behind one composer/header control: the "+" tools menu, the engine menu in the
   composer, and the engine chip in the reply header (ChatDock capsule design, plate III). Closes on a
   pick, Escape, or any press outside.
   - `items`: { key, label, icon | glyph, active, onSelect, role } - role 'menuitemradio' /
     'menuitemcheckbox' reports `active` as checked.
   - `variant`: 'icon' (40px square button, the composer) or 'chip' (the header's "ChatGPT v" pill).
   - `placement`: 'up' (the composer - opens above it) or 'down' (the header - opens below it).

   The list is drawn in a portal on the page (fixed, at the trigger's own rect): the reply card and the
   composer both clip their contents to their rounded corners, and a menu inside them would be cut off. It
   carries data-navrya-assistant so a press on it never counts as a press "outside" the dock. */
export function DockMenu({ icon, glyph, label, items, className, variant = 'icon', placement = 'up', tone = 'ghost', chipLabel }) {
  const [open, setOpen] = React.useState(false);
  const [box, setBox] = React.useState(null);
  const ref = React.useRef(null);
  const listRef = React.useRef(null);

  function measure() {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    // The portal sits outside the page's [data-character] wrapper, so it carries the character and the reading
    // direction with it - the accent tokens and the alignment come from there.
    const holder = ref.current.closest ? ref.current.closest('[data-character]') : null;
    let rtl = false;
    try { rtl = window.getComputedStyle(ref.current).direction === 'rtl'; } catch (_e) { rtl = false; }
    setBox({ left: r.left, right: r.right, top: r.top, bottom: r.bottom, vw: window.innerWidth, vh: window.innerHeight, rtl, character: holder ? holder.getAttribute('data-character') : null });
  }
  React.useEffect(() => {
    if (!open) return undefined;
    measure();
    function onDown(e) {
      const inside = (ref.current && ref.current.contains(e.target)) || (listRef.current && listRef.current.contains(e.target));
      if (!inside) setOpen(false);
    }
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', measure);
    document.addEventListener('scroll', measure, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', measure);
      document.removeEventListener('scroll', measure, true);
    };
  }, [open]);
  const shown = items.filter(Boolean);
  if (!shown.length) return null;
  const chip = variant === 'chip';
  const triggerBase = chip
    ? {
      display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 6px 0 8px', borderRadius: 999, flex: 'none', cursor: 'pointer',
      border: '1px solid ' + (open ? accent(55) : HAIRLINE_STRONG), background: open ? 'var(--char-active-surface)' : 'transparent',
      font: 'var(--type-caption)', fontSize: 11.5, color: open ? 'var(--char-accent)' : MUTED
    }
    : {
      width: 40, height: 40, flex: 'none', display: 'grid', placeItems: 'center', padding: 0, cursor: 'pointer', borderRadius: 13,
      border: '1px solid ' + (open ? accent(55) : tone === 'outlined' ? HAIRLINE : 'transparent'),
      background: open ? 'var(--char-active-surface)' : 'transparent', color: open ? 'var(--char-accent)' : MUTED
    };
  const isRtl = !!(box && box.rtl);
  // Where the list goes: above / below the trigger, its inline-end edge on the trigger's (chip: its start),
  // and always inside the viewport.
  let listStyle = null;
  if (open && box) {
    const width = 236;
    const margin = 8;
    let left = chip ? (isRtl ? box.right - width : box.left) : (isRtl ? box.left : box.right - width);
    left = Math.max(margin, Math.min(left, box.vw - width - margin));
    listStyle = { position: 'fixed', left, width, maxWidth: box.vw - 2 * margin, zIndex: 160 };
    if (placement === 'down') { listStyle.top = box.bottom + 8; listStyle.maxHeight = Math.max(160, box.vh - box.bottom - 8 - margin); }
    else { listStyle.bottom = box.vh - box.top + 12; listStyle.maxHeight = Math.max(160, box.top - 12 - margin); }
  }
  return (
    <span ref={ref} className={className} style={{ position: 'relative', display: 'inline-flex', flex: 'none' }}>
      <button
        type="button" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open ? 'true' : 'false'}
        dir={chip ? 'ltr' : undefined}
        onClick={() => setOpen((v) => !v)}
        style={{ ...triggerBase, transition: 'background 160ms var(--ease-out),border-color 160ms var(--ease-out),color 160ms var(--ease-out)' }}
      >
        {chip
          ? (<React.Fragment>{glyph}{chipLabel}<Icon name="chevron-down" size={11} /></React.Fragment>)
          : (glyph || <Icon name={icon} size={18} />)}
      </button>
      {open && listStyle && typeof document !== 'undefined' && createPortal(
        <span
          ref={listRef} role="menu" aria-label={label} data-navrya-assistant="menu" data-character={box.character || undefined}
          dir={isRtl ? 'rtl' : 'ltr'}
          style={{
            ...listStyle, display: 'flex', flexDirection: 'column', gap: 2, padding: 6, boxSizing: 'border-box', overflowY: 'auto',
            borderRadius: 14, border: '1px solid ' + EDGE_WELD, background: DIALOG,
            boxShadow: '0 18px 44px rgba(0,0,0,.6)', animation: 'navrya-pop-in 180ms var(--ease-out) both'
          }}
        >
          {shown.map((item) => (
            <button
              key={item.key} type="button" role={item.role || 'menuitem'}
              aria-checked={item.role && item.role !== 'menuitem' ? (item.active ? 'true' : 'false') : undefined}
              onClick={() => { setOpen(false); if (item.onSelect) item.onSelect(); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, height: 42, padding: '0 10px', boxSizing: 'border-box', cursor: 'pointer', flex: 'none',
                borderRadius: 10, border: 0, textAlign: 'start', whiteSpace: 'nowrap',
                background: item.active ? 'var(--char-active-surface)' : 'transparent',
                color: item.active ? 'var(--char-accent)' : 'var(--text-primary)', font: 'var(--type-body)', fontSize: 13.5
              }}
            >
              <span style={{ width: 26, height: 26, flex: 'none', borderRadius: 8, display: 'grid', placeItems: 'center', background: 'rgba(244,234,215,.05)', color: 'inherit' }}>
                {item.glyph || <Icon name={item.icon} size={15} />}
              </span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
              {item.active && <Icon name="check" size={14} />}
            </button>
          ))}
        </span>,
        document.body
      )}
    </span>
  );
}
