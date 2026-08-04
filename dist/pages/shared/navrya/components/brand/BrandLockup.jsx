import React from 'react';
import { assetUrl } from '../core/AssetBase.jsx';

export const EDITION_LABEL = {
  hunter: 'HUNTER EDITION', commander: 'COMMANDER EDITION',
  engineer: 'ENGINEER EDITION', master: 'MASTER EDITION'
};

/* NAVRYA compass-arrow mark + wordmark. The mark's wedge carries the character accent. */
export function BrandLockup({
  character = 'hunter', orientation = 'vertical', markSize = 56, showEdition = true,
  edition, wordmarkSize, style, ...rest
}) {
  const vertical = orientation === 'vertical';
  const ws = wordmarkSize || (vertical ? 26 : 20);
  return (
    <div
      style={{
        display: 'flex', flexDirection: vertical ? 'column' : 'row', alignItems: 'center',
        gap: vertical ? 12 : 12, ...style
      }}
      {...rest}
    >
      <img
        src={assetUrl('assets/logo/navrya-mark-' + character + '.png')} alt="NAVRYA"
        style={{ width: markSize, height: 'auto', display: 'block', flex: 'none' }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: vertical ? 6 : 2, alignItems: vertical ? 'center' : 'flex-start' }}>
        <div style={{
          fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: ws, lineHeight: 1,
          letterSpacing: '.22em', textIndent: '.22em', color: 'var(--parchment)', whiteSpace: 'nowrap'
        }}>NAVRYA</div>
        {showEdition && (
          <div style={{
            font: 'var(--type-caption)', fontSize: vertical ? 11 : 10, letterSpacing: '.16em', color: 'var(--char-accent)', whiteSpace: 'nowrap',
            textTransform: 'uppercase'
          }}>{edition || EDITION_LABEL[character] || ''}</div>
        )}
      </div>
    </div>
  );
}
