import React from 'react';
import { Icon } from '../core/Icon.jsx';

/* Grid / list view toggle — one grouped 44px control, selected half takes the accent. */
export function ViewToggle({ value = 'grid', onChange, options, style, ...rest }) {
  const list = options || [{ value: 'grid', icon: 'grid' }, { value: 'list', icon: 'list' }];
  return (
    <div
      role="group" aria-label="View"
      style={{
        height: 44, boxSizing: 'border-box', display: 'inline-flex', padding: 4, gap: 4,
        borderRadius: 8, background: 'rgba(11,20,21,.72)', border: '1px solid var(--border-gold)', ...style
      }}
      {...rest}
    >
      {list.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value} type="button" aria-pressed={on} aria-label={o.value + ' view'}
            onClick={() => onChange && onChange(o.value)}
            style={{
              width: 40, borderRadius: 6, border: 0, cursor: 'pointer', display: 'grid', placeItems: 'center',
              background: on ? 'var(--char-accent)' : 'transparent',
              color: on ? 'var(--ink-950)' : 'var(--text-muted)',
              transition: 'background var(--dur-hover) var(--ease-out)'
            }}
          >
            <Icon name={o.icon} size={18} />
          </button>
        );
      })}
    </div>
  );
}
