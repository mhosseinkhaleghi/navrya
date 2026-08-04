import React from 'react';
import { Icon } from '../core/Icon.jsx';

/* Pinned collapse / expand control at the foot of the sidebar. 44px target, 220ms ease. */
export function CollapseControl({ collapsed = false, onToggle, label, style, ...rest }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      type="button" onClick={onToggle}
      aria-expanded={!collapsed} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        height: 'var(--collapse-h)', width: '100%', display: 'flex', alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start', gap: 12, padding: collapsed ? 0 : '0 16px',
        borderRadius: 8, cursor: 'pointer',
        border: '1px solid ' + (hover ? 'var(--border-gold-strong)' : 'var(--border-gold)'),
        background: hover ? 'rgba(244,234,215,.04)' : 'transparent',
        color: 'var(--text-primary)', font: 'var(--type-body)', fontSize: 14,
        transition: 'border-color var(--dur-expand) var(--ease-out), background var(--dur-expand) var(--ease-out)',
        ...style
      }}
      {...rest}
    >
      <span style={{ color: 'var(--gold-warm)' }}><Icon name={collapsed ? 'expand' : 'collapse'} size={18} /></span>
      {!collapsed && <span>{label || 'Collapse sidebar'}</span>}
    </button>
  );
}
