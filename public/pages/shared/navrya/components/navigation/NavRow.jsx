import React from 'react';
import { Icon } from '../core/Icon.jsx';

/* One navigation row: connected icon-rail node + label. Active state is shape + label + colour.
   `rtl` mirrors the parts that a pure CSS logical property can't express on its own (the
   border-trick arrow's slant, and the connected-rail's asymmetric corner radius) - everything
   else uses logical properties (marginInlineStart, textAlign:'start') so it follows
   dir="rtl"/"ltr" from the DOM automatically. */
export function NavRow({
  icon = 'dashboard', label = 'Dashboard', active = false, disabled = false, collapsed = false,
  first = false, last = false, activeLabel = 'ACTIVE', badge, rtl = false, onClick, style, ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const accent = disabled ? 'var(--text-disabled)' : active ? 'var(--char-accent)' : 'var(--gold-antique)';
  const node = (
    <span style={{
      position: 'relative', width: 32, height: 32, borderRadius: 8, display: 'grid', placeItems: 'center',
      border: '1px solid ' + (active ? 'var(--char-accent)' : 'rgba(183,138,74,.55)'),
      background: active ? 'var(--char-active-surface)' : 'rgba(3,8,7,.55)',
      boxShadow: active ? 'var(--glow-active)' : 'none',
      color: accent, opacity: disabled ? .38 : 1,
      transition: 'border-color var(--dur-hover) var(--ease-out), background var(--dur-hover) var(--ease-out)'
    }}>
      <Icon name={icon} size={20} />
      {badge && (
        <span aria-hidden="true" style={{
          position: 'absolute', top: -3, insetInlineEnd: -3, width: 8, height: 8, borderRadius: '50%',
          background: 'var(--char-accent)', boxShadow: '0 0 6px var(--char-glow)'
        }}></span>
      )}
    </span>
  );

  return (
    <button
      type="button" onClick={disabled ? undefined : onClick} disabled={disabled}
      aria-current={active ? 'page' : undefined}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative', display: 'flex', alignItems: 'center', gap: 0, width: '100%',
        minHeight: 'var(--nav-row-h)', padding: 0, border: 0, background: 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer', textAlign: 'start',
        font: 'var(--type-nav)', color: 'inherit', ...style
      }}
      {...rest}
    >
      <span aria-hidden="true" style={{
        position: 'relative', width: collapsed ? 46 : 'var(--rail-w)', flex: 'none',
        alignSelf: 'stretch', display: 'grid', placeItems: 'center'
      }}>
        <span style={{
          position: 'absolute', insetInlineStart: '50%', top: first ? '50%' : 0, bottom: last ? '50%' : 0,
          width: 1, background: 'rgba(183,138,74,.28)'
        }}></span>
        {node}
      </span>
      {!collapsed && (
        <span style={{
          position: 'relative', flex: 1, display: 'flex', alignItems: 'center', gap: 8,
          alignSelf: 'stretch', paddingInlineEnd: 12,
          background: active ? 'var(--char-active-surface)' : hover ? 'rgba(244,234,215,.04)' : 'transparent',
          borderTop: active ? '1px solid color-mix(in srgb, var(--char-accent) 90%, transparent)' : '1px solid transparent',
          borderBottom: active ? '1px solid color-mix(in srgb, var(--char-accent) 90%, transparent)' : '1px solid var(--border-hairline)',
          borderInlineEnd: active ? '1px solid color-mix(in srgb, var(--char-accent) 90%, transparent)' : '1px solid transparent',
          borderRadius: active ? (rtl ? '8px 0 0 8px' : '0 8px 8px 0') : 0,
          transition: 'background var(--dur-hover) var(--ease-out)'
        }}>
          {active && (
            <span aria-hidden="true" style={{
              width: 0, height: 0, marginInlineStart: 4, flex: 'none',
              borderTop: '6px solid transparent', borderBottom: '6px solid transparent',
              ...(rtl ? { borderRight: '8px solid var(--char-accent)' } : { borderLeft: '8px solid var(--char-accent)' })
            }}></span>
          )}
          <span style={{
            marginInlineStart: active ? 6 : 18, color: disabled ? 'var(--text-disabled)' : active ? 'var(--parchment)' : 'var(--text-primary)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
          }}>{label}</span>
          {active && (
            <span style={{
              marginInlineStart: 'auto', font: 'var(--type-caption)', letterSpacing: 'var(--tracking-label)',
              color: 'var(--char-accent)'
            }}>{activeLabel}</span>
          )}
        </span>
      )}
    </button>
  );
}
