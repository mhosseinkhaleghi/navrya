import React from 'react';
import { Panel } from '../core/Panel.jsx';
import { assetUrl } from '../core/AssetBase.jsx';

export const CHARACTER_QUOTE = {
  hunter: 'A hunter never rushes;\nhe waits for the right moment.',
  commander: 'Command is choosing with intent,\nnot reacting in haste.',
  engineer: 'Precision turns complexity\ninto a system.',
  master: 'Cycles repeat.\nWisdom remembers.'
};

/* Pinned quote card — Cinzel italic in the character accent with the character ornament. */
export function QuoteCard({ character = 'hunter', quote, height = 96, style, ...rest }) {
  const text = quote || CHARACTER_QUOTE[character] || '';
  return (
    <Panel
      variant="base" radius={8} ornament ornamentSize={12} ornamentInset={5}
      style={{ height, background: 'color-mix(in srgb, var(--char-active-surface) 45%, var(--surface-card))', ...style }}
      {...rest}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: height - 2, padding: '0 16px' }}>
        <p style={{
          margin: 0, flex: 1, font: 'var(--type-quote)', color: 'var(--char-accent)',
          whiteSpace: 'pre-line', textWrap: 'pretty'
        }}>{text}</p>
        <img
          src={assetUrl('assets/icons/quote-ornament-' + character + '.png')} alt=""
          style={{ width: 34, height: 34, objectFit: 'contain', opacity: .9, flex: 'none' }}
        />
      </div>
    </Panel>
  );
}
