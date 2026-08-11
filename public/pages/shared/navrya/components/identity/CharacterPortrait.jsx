import React from 'react';
import { assetUrl } from '../core/AssetBase.jsx';
import { Icon } from '../core/Icon.jsx';

/* Circular editable character portrait — 220px gold frame, 188px crop, accent edit control. */
export function CharacterPortrait({
  character = 'hunter', size = 220, src, alt = '', editable = true, onEdit, style, ...rest
}) {
  const scale = size / 220;
  const edit = Math.round(36 * scale);
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none', ...style }} {...rest}>
      <span aria-hidden="true" style={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        border: '1px solid var(--border-gold)', boxShadow: 'inset 0 0 24px rgba(0,0,0,.6)'
      }}></span>
      <span aria-hidden="true" style={{
        position: 'absolute', inset: Math.round(8 * scale), borderRadius: '50%',
        border: '1px solid rgba(214,175,107,.35)'
      }}></span>
      <img
        src={src || assetUrl('assets/portraits/portrait-' + character + '.webp')} alt={alt}
        style={{
          position: 'absolute', inset: Math.round(16 * scale), width: 'calc(100% - ' + Math.round(32 * scale) + 'px)',
          height: 'calc(100% - ' + Math.round(32 * scale) + 'px)', borderRadius: '50%', objectFit: 'cover',
          objectPosition: 'center 30%'
        }}
      />
      {editable && (
        <button
          type="button" onClick={onEdit} aria-label="Edit portrait"
          style={{
            position: 'absolute', right: Math.round(8 * scale), bottom: Math.round(8 * scale),
            width: edit, height: edit, borderRadius: '50%', display: 'grid', placeItems: 'center',
            background: 'var(--raised-600)', color: 'var(--parchment)', cursor: 'pointer',
            border: '2px solid var(--char-accent)', transition: 'filter var(--dur-hover) var(--ease-out)'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(var(--hover-brightness))'; }}
          onMouseLeave={(e) => { e.currentTarget.style.filter = 'none'; }}
        >
          <Icon name="edit" size={Math.round(18 * scale)} />
        </button>
      )}
    </div>
  );
}
