import React from 'react';
import { assetUrl } from '../core/AssetBase.jsx';

export const RANK_TITLE = {
  hunter: { rank: 'EMERALD HUNTER', tier: 'III' },
  commander: { rank: 'FIELD COMMANDER', tier: 'III' },
  engineer: { rank: 'SYSTEMS ENGINEER', tier: 'II' },
  master: { rank: 'GRAND MARKET MASTER', tier: 'IV' }
};

/* Rank crest — illustrated character insignia plus rank name and tier numeral. */
export function RankCrest({
  character = 'hunter', rank, tier, size = 132, layout = 'row', label = 'RANK', style, ...rest
}) {
  const info = RANK_TITLE[character] || {};
  return (
    <div style={{
      display: 'flex', flexDirection: layout === 'row' ? 'row' : 'column',
      alignItems: 'center', gap: 14, ...style
    }} {...rest}>
      <img
        src={assetUrl('assets/crests/crest-' + character + '.png')} alt=""
        style={{ width: size, height: size, objectFit: 'contain', flex: 'none' }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, textAlign: layout === 'row' ? 'left' : 'center' }}>
        <span style={{ font: 'var(--type-section-label)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-muted)' }}>{label}</span>
        <span style={{
          font: 'var(--type-username)', fontWeight: 600, letterSpacing: '.06em', color: 'var(--char-accent)',
          textTransform: 'uppercase'
        }}>{rank || info.rank}</span>
        <span style={{ font: 'var(--type-caption)', letterSpacing: '.12em', color: 'var(--char-accent)', opacity: .85 }}>
          {tier || info.tier}
        </span>
      </div>
    </div>
  );
}
