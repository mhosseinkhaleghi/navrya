import React from 'react';
import { Icon } from './Icon.jsx';

/* Label + value row, optional progress bar and trailing icon buttons - used for strategy
   performance rows and the Settings panel-manager list. Logical properties throughout. */
export function ListRow({ title, value, progress, actions, icon, onClick, style, ...rest }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined} onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', width: '100%',
        boxSizing: 'border-box', borderRadius: 8, border: '1px solid var(--border-hairline)',
        background: 'rgba(11,16,22,.4)', cursor: onClick ? 'pointer' : 'default',
        textAlign: 'start', color: 'inherit', font: 'inherit', ...style
      }}
      {...rest}
    >
      {icon && <span style={{ color: 'var(--char-accent)', flex: 'none' }}><Icon name={icon} size={18} /></span>}
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ font: 'var(--type-body)', color: 'var(--parchment)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
          {value !== undefined && <span className="navrya-tabular" style={{ font: 'var(--type-caption)', color: 'var(--text-muted)', flex: 'none' }}>{value}</span>}
        </span>
        {progress !== undefined && progress !== null && (
          <span style={{ height: 4, borderRadius: 2, background: 'rgba(244,234,215,.08)', overflow: 'hidden', display: 'block' }}>
            <span style={{ display: 'block', height: '100%', width: Math.max(0, Math.min(100, progress)) + '%', background: 'var(--char-accent)', borderRadius: 2 }}></span>
          </span>
        )}
      </span>
      {actions && <span style={{ display: 'flex', gap: 4, flex: 'none' }}>{actions}</span>}
    </Tag>
  );
}
