import React from 'react';
import { assetUrl } from '../core/AssetBase.jsx';
import { BrandLockup } from './BrandLockup.jsx';

/* Sidebar brand strip — 92px atmospheric header: lockup left, character insignia right. */
export function BrandStrip({
  character = 'hunter', height = 92, collapsed = false, showInsignia = true, style, ...rest
}) {
  return (
    <div
      style={{
        position: 'relative', height, display: 'flex', alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        padding: collapsed ? '0 8px' : '0 14px', overflow: 'hidden',
        background: 'var(--char-atmosphere)',
        borderBottom: '1px solid var(--border-hairline)', ...style
      }}
      {...rest}
    >
      <img
        src={assetUrl('assets/textures/atmosphere-' + character + '.png')} alt=""
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.55 }}
      />
      <span aria-hidden="true" style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, rgba(3,8,7,.15) 0%, rgba(3,8,7,.55) 100%)'
      }}></span>
      {collapsed ? (
        <img
          src={assetUrl('assets/logo/navrya-mark-' + character + '.png')} alt="NAVRYA"
          style={{ position: 'relative', width: 40, height: 'auto' }}
        />
      ) : (
        <React.Fragment>
          <BrandLockup character={character} orientation="horizontal" markSize={40} wordmarkSize={21} style={{ position: 'relative', gap: 10 }} />
          {showInsignia && (
            <img
              src={assetUrl('assets/crests/insignia-' + character + '.png')} alt=""
              style={{ position: 'relative', width: 52, height: 52, objectFit: 'contain' }}
            />
          )}
        </React.Fragment>
      )}
    </div>
  );
}
