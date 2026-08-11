import React from 'react';
import { assetUrl } from '../core/AssetBase.jsx';
import { Icon } from '../core/Icon.jsx';

export const MARKETS = {
  london: { city: 'LONDON', hours: '07:00 – 16:00', landmark: 'big-ben' },
  'new-york': { city: 'NEW YORK', hours: '13:00 – 22:00', landmark: 'liberty' },
  tokyo: { city: 'TOKYO', hours: '00:00 – 09:00', landmark: 'pagoda' },
  sydney: { city: 'SYDNEY', hours: '22:00 – 07:00', landmark: 'opera-house' }
};

const STATE_STYLE = {
  default: { border: '1px solid var(--border-gold)', background: 'rgba(11,16,22,.55)', color: 'var(--text-primary)' },
  hover: { border: '1px solid var(--border-gold-strong)', background: 'var(--raised-600)', color: 'var(--parchment)' },
  open: { border: '1px solid var(--border-gold-strong)', background: 'var(--char-active-surface)', color: 'var(--parchment)' },
  next: { border: '1px solid var(--border-gold)', background: 'rgba(11,16,22,.75)', color: 'var(--text-primary)' },
  closed: { border: '1px solid var(--divider-gold)', background: 'rgba(11,16,22,.35)', color: 'var(--text-muted)' },
  disabled: { border: '1px dashed rgba(108,112,120,.5)', background: 'transparent', color: 'var(--text-disabled)' }
};

const STATE_TEXT = { open: 'Open', next: 'Next session', closed: 'Closed', disabled: 'Unavailable' };

/* Market session card. Every state keeps the same 64px box — open is a highlight plus a green dot. */
export function MarketSessionCard({
  market = 'london', state = 'default', countdown, cityLabel, minWidth = 264, height = 64, style, ...rest
}) {
  const m = MARKETS[market] || MARKETS.london;
  const displayCity = cityLabel || m.city;
  const s = STATE_STYLE[state] || STATE_STYLE.default;
  const dim = state === 'disabled' || state === 'closed';
  return (
    <div
      title={displayCity + (STATE_TEXT[state] ? ' — ' + STATE_TEXT[state] : '')}
      style={{
        position: 'relative', minWidth, height, boxSizing: 'border-box', borderRadius: 6,
        display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px',
        boxShadow: state === 'open' ? 'var(--glow-active)' : 'none',
        transition: 'background var(--dur-hover) var(--ease-out), border-color var(--dur-hover) var(--ease-out)',
        ...s, ...style
      }}
      {...rest}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {state === 'open' && (
            <span aria-hidden="true" style={{
              width: 8, height: 8, borderRadius: '50%', background: 'var(--success)',
              boxShadow: '0 0 8px var(--success)', flex: 'none'
            }}></span>
          )}
          {state === 'next' && <span style={{ color: 'var(--gold-warm)', flex: 'none' }}><Icon name="clock" size={13} /></span>}
          <span style={{
            font: 'var(--type-username)', fontWeight: 600, letterSpacing: '.08em', color: 'inherit',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
          }}>{displayCity}</span>
        </div>
        <span className="navrya-tabular" style={{
          font: 'var(--type-caption)', color: dim ? 'inherit' : 'var(--text-muted)', letterSpacing: '.04em',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
        }}>{countdown || m.hours}</span>
      </div>
      <img
        src={assetUrl('assets/icons/landmark-' + m.landmark + '.webp')} alt=""
        style={{ width: 26, height: 36, objectFit: 'contain', opacity: dim ? .35 : .95, flex: 'none' }}
      />
    </div>
  );
}
