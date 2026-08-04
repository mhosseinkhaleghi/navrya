import React from 'react';
import { Panel } from '../core/Panel.jsx';
import { Icon } from '../core/Icon.jsx';
import { assetUrl } from '../core/AssetBase.jsx';

export const CHARACTER_REWARD = {
  hunter: 'EMERALD CACHE', commander: "COMMANDER'S CHEST",
  engineer: 'BLUEPRINT PACK', master: 'MASTER SIGIL'
};

/* Next-reward card — illustrated chest, reward name, XP cost and progress to unlock. */
export function RewardCard({
  character = 'hunter', reward, xp = '250 XP', progress = 73, height = 104,
  label = 'NEXT REWARD', onOpen, style, ...rest
}) {
  return (
    <Panel variant="base" radius={8} ornament ornamentSize={12} ornamentInset={5}
      style={{ height, background: 'color-mix(in srgb, var(--char-active-surface) 30%, var(--surface-card))', ...style }} {...rest}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: height - 2, padding: '0 10px' }}>
        <img
          src={assetUrl('assets/icons/reward-chest-' + character + '.png')} alt=""
          style={{ width: 42, height: 42, objectFit: 'contain', flex: 'none' }}
        />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span style={{ font: 'var(--type-caption)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-muted)' }}>{label}</span>
          <span style={{
            font: 'var(--type-username)', fontSize: 12, fontWeight: 600, letterSpacing: '.01em', color: 'var(--char-accent)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
          }}>{reward || CHARACTER_REWARD[character]}</span>
          <span className="navrya-tabular" style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{xp}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'rgba(244,234,215,.08)', overflow: 'hidden' }}>
              <div style={{
                width: progress + '%', height: '100%', borderRadius: 2,
                background: 'linear-gradient(90deg, var(--char-accent-strong), var(--char-accent))',
                transition: 'width var(--dur-progress) var(--ease-out)'
              }}></div>
            </div>
            <span className="navrya-tabular" style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{progress}%</span>
          </div>
        </div>
        <button
          type="button" onClick={onOpen} aria-label="Open reward"
          style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--text-muted)', padding: 0, flex: 'none' }}
        >
          <Icon name="active-arrow" size={20} />
        </button>
      </div>
    </Panel>
  );
}
