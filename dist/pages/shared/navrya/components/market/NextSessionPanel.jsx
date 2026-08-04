import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { Panel } from '../core/Panel.jsx';

/* Next-session panel — 344×64. Countdown ticks once per second, announced politely. */
export function NextSessionPanel({
  city = 'SYDNEY', startsIn = '01:35:40', live = true, width = 344,
  nextSessionLabel = 'NEXT SESSION', startsInLabel = 'STARTS IN', style, ...rest
}) {
  const [t, setT] = React.useState(startsIn);
  React.useEffect(() => {
    setT(startsIn);
    if (!live) return undefined;
    const parts = startsIn.split(':').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return undefined;
    let secs = parts[0] * 3600 + parts[1] * 60 + parts[2];
    const id = setInterval(() => {
      secs = Math.max(0, secs - 1);
      const h = String(Math.floor(secs / 3600)).padStart(2, '0');
      const m = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
      const s = String(secs % 60).padStart(2, '0');
      setT(h + ':' + m + ':' + s);
    }, 1000);
    return () => clearInterval(id);
  }, [startsIn, live]);
  return (
    <Panel variant="base" radius={6} style={{ width, background: 'rgba(11,16,22,.55)', ...style }} {...rest}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 42, padding: '0 12px' }}>
        <span style={{ color: 'var(--char-accent)' }}><Icon name="clock" size={18} /></span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <span style={{ font: 'var(--type-caption)', fontSize: 9, lineHeight: '12px', letterSpacing: 'var(--tracking-label)', color: 'var(--text-muted)' }}>{nextSessionLabel}</span>
          <span style={{ font: 'var(--type-caption)', fontSize: 13, lineHeight: '16px', fontWeight: 600, letterSpacing: '.1em', color: 'var(--char-accent)' }}>{city}</span>
        </div>
        <div style={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ font: 'var(--type-caption)', fontSize: 9, letterSpacing: 'var(--tracking-label)', color: 'var(--text-muted)' }}>{startsInLabel}</span>
          <span className="navrya-tabular" aria-live="polite" style={{ font: 'var(--type-countdown)', fontSize: 15, color: 'var(--parchment)', letterSpacing: '.06em' }}>{t}</span>
        </div>
      </div>
    </Panel>
  );
}
