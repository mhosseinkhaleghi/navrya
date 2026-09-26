import React from 'react';
import { accent, INK, STAGE, EDGE, TEXT_SOFT } from './dockDesign.js';

/* The dock's resting shape - "the seed" (ChatDock capsule design, plate III, shape 1): a 64px
   portrait in the corner instead of a bar across the page, so the assistant is never in the way of
   the work underneath. It carries:
   - a badge with the number of replies that arrived while it was collapsed, and
   - when one has, the 56px variant with a "reply ready · view" pill beside it.
   The character's status ring turns into the thinking arc while a reply is being produced.
   Clicking either opens the capsule (ChatDock); Ctrl K does the same from anywhere. */
export function DockSeed({ portrait, label, count = 0, pillLabel, thinking = false, onOpen, side = 'right', dir = 'ltr' }) {
  const size = count > 0 && pillLabel ? 56 : 64;
  const ring = size - 10;
  const image = size - 18;
  const button = (
    <span style={{ position: 'relative', width: size, height: size, flex: 'none', display: 'inline-block' }}>
      <button
        type="button" data-navrya-assistant="seed" aria-label={label} title={label} onClick={onOpen}
        style={{
          width: size, height: size, borderRadius: '50%', padding: 0, cursor: 'pointer', display: 'grid', placeItems: 'center',
          border: '1px solid rgba(183,138,74,.6)', background: INK,
          boxShadow: '0 14px 34px rgba(0,0,0,.55),0 0 26px ' + accent(22)
        }}
      >
        <span style={{ position: 'relative', width: ring, height: ring, borderRadius: '50%', border: '2px solid var(--char-accent)', boxSizing: 'border-box', display: 'grid', placeItems: 'center' }}>
          {thinking && (
            <span aria-hidden="true" style={{
              position: 'absolute', inset: -4, borderRadius: '50%',
              background: 'conic-gradient(from 0deg,transparent 0 60%,var(--gold-warm) 100%)',
              WebkitMask: 'radial-gradient(farthest-side,transparent calc(100% - 3px),#000 calc(100% - 2px))',
              mask: 'radial-gradient(farthest-side,transparent calc(100% - 3px),#000 calc(100% - 2px))',
              animation: 'navrya-spin 1100ms linear infinite'
            }} />
          )}
          {portrait
            ? <img src={portrait} alt="" draggable="false" style={{ width: image, height: image, borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
            : <span style={{ width: image, height: image, borderRadius: '50%', background: 'var(--ink-950)' }} />}
        </span>
      </button>
      {count > 0 && (
        <span aria-hidden="true" style={{
          position: 'absolute', top: -2, insetInlineEnd: -2, minWidth: 22, height: 22, padding: '0 6px', boxSizing: 'border-box', borderRadius: 999,
          background: 'var(--char-accent)', color: 'var(--char-on-accent)', fontSize: 12, fontWeight: 700, display: 'grid', placeItems: 'center',
          boxShadow: '0 0 0 2px ' + STAGE
        }}>{count}</span>
      )}
    </span>
  );
  return (
    <div
      dir={dir}
      style={{
        position: 'fixed', bottom: 24, [side]: 24, zIndex: 150, display: 'flex', alignItems: 'center', gap: 12,
        animation: 'navrya-seed-in var(--dur-expand) var(--ease-out) both'
      }}
    >
      {count > 0 && pillLabel && (
        <button
          type="button" onClick={onOpen}
          style={{
            height: 44, padding: '0 14px', borderRadius: 999, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
            border: '1px solid ' + EDGE, background: INK, fontSize: 13, color: TEXT_SOFT, whiteSpace: 'nowrap',
            boxShadow: '0 10px 26px rgba(0,0,0,.5)'
          }}
        >
          <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--char-accent)' }} />
          {pillLabel}
        </button>
      )}
      {button}
    </div>
  );
}
