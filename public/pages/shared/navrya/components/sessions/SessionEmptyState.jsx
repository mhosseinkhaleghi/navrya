import React from 'react';
import { Icon } from '../core/Icon.jsx';

/* Session Library empty state — icon, title, helper, three decorative ghost cards.
   2px character accent on the left rail is the only accent in the field. */
export function SessionEmptyState({
  title = 'No sessions yet',
  helper = 'Select \u201cNew session\u201d to begin. Saved sessions will appear here as cards.',
  icon = 'calendar',
  hints = ['LONDON', 'NEW YORK', 'TOKYO'],
  minHeight = 314, style, ...rest
}) {
  return (
    <div
      style={{
        minHeight, boxSizing: 'border-box', padding: 24, borderRadius: 12,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14,
        background: 'linear-gradient(180deg, color-mix(in srgb, var(--char-atmosphere) 55%, var(--surface-card)) 0%, var(--surface-card) 100%)',
        border: '1px dashed var(--border-gold)', borderLeft: '2px solid var(--char-accent)', ...style
      }}
      {...rest}
    >
      <span style={{
        width: 60, height: 60, borderRadius: 12, display: 'grid', placeItems: 'center',
        border: '1px solid color-mix(in srgb, var(--char-accent) 55%, transparent)',
        background: 'var(--char-active-surface)', color: 'var(--char-accent)'
      }}><Icon name={icon} size={26} /></span>
      <h3 style={{ margin: 0, font: 'var(--type-body)', fontSize: 18, lineHeight: '23px', fontWeight: 600, color: 'var(--parchment)' }}>{title}</h3>
      <p style={{ margin: 0, font: 'var(--type-body)', fontSize: 12, lineHeight: '18px', color: 'var(--text-muted)', textAlign: 'center', maxWidth: 460, textWrap: 'pretty' }}>{helper}</p>
      <div aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, width: '100%', maxWidth: 620, marginTop: 6 }}>
        {hints.map((h) => (
          <div key={h} style={{
            height: 82, borderRadius: 8, padding: 12, boxSizing: 'border-box',
            border: '1px solid var(--border-hairline)', background: 'rgba(11,20,21,.45)',
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
          }}>
            <span style={{ font: 'var(--type-caption)', fontSize: 10, letterSpacing: '.1em', color: 'var(--text-muted)', opacity: .55 }}>{h}</span>
            <span style={{ height: 1, background: 'var(--divider-gold)', opacity: .5 }}></span>
          </div>
        ))}
      </div>
    </div>
  );
}
