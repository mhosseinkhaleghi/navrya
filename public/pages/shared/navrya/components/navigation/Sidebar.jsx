import React from 'react';
import { BrandStrip } from '../brand/BrandStrip.jsx';
import { NavRow } from './NavRow.jsx';
import { CollapseControl } from './CollapseControl.jsx';
import { QuoteCard } from '../cards/QuoteCard.jsx';
import { RewardCard, CHARACTER_REWARD } from '../cards/RewardCard.jsx';
import { Icon } from '../core/Icon.jsx';
import { assetUrl } from '../core/AssetBase.jsx';

export const SIDEBAR_ITEMS = [
  { id: 'sessions', icon: 'sessions', label: 'Sessions' },
  { id: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
  { id: 'strategies', icon: 'strategies', label: 'Strategies' },
  { id: 'psychology', icon: 'psychology', label: 'Psychology' },
  { id: 'subscription', icon: 'subscription', label: 'Subscription' },
  { id: 'ai-assistant', icon: 'ai-assistant', label: 'AI Assistant' },
  { id: 'community', icon: 'community', label: 'Community' },
  { id: 'settings', icon: 'settings', label: 'Settings' },
  { id: 'more', icon: 'more', label: 'More tools' }
];

function CollapsedRail({ character, items, activeId, onNavigate, progress }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div className="navrya-scroll" style={{ flex: 1, overflowY: 'auto', padding: '8px 0', minHeight: 0 }}>
        {items.map((it, i) => (
          <div key={it.id} style={{ display: 'flex', justifyContent: 'center' }}>
            <NavRow
              icon={it.icon} label={it.label} collapsed active={it.id === activeId}
              first={i === 0} last={i === items.length - 1} badge={it.id === activeId}
              onClick={() => onNavigate && onNavigate(it.id)} title={it.label}
              style={{ width: 46, minHeight: 46 }}
            />
          </div>
        ))}
      </div>
      <div aria-hidden="true" style={{ display: 'grid', placeItems: 'center', color: 'var(--gold-antique)', paddingBottom: 4 }}>
        <Icon name="scroll-down" size={18} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 10 }}>
        <button type="button" aria-label="Character quote" style={{
          width: 44, height: 40, borderRadius: 8, display: 'grid', placeItems: 'center', cursor: 'pointer',
          border: '1px solid var(--border-gold)', background: 'color-mix(in srgb, var(--char-active-surface) 55%, var(--ink-950))',
          color: 'var(--gold-warm)'
        }}><Icon name="quote" size={20} /></button>
        <div style={{
          position: 'relative', width: 52, height: 52, borderRadius: '50%', display: 'grid', placeItems: 'center',
          background: 'conic-gradient(var(--char-accent) ' + progress + '%, rgba(244,234,215,.10) 0)'
        }}>
          <div style={{
            position: 'absolute', inset: 3, borderRadius: '50%', background: 'var(--surface-card)',
            border: '1px solid var(--border-hairline)'
          }}></div>
          <img src={assetUrl('assets/icons/reward-chest-' + character + '.webp')} alt=""
            style={{ position: 'relative', width: 30, height: 30, objectFit: 'contain' }} />
        </div>
        <span className="navrya-tabular" style={{ font: 'var(--type-caption)', color: 'var(--char-accent)' }}>{progress}%</span>
      </div>
    </div>
  );
}

/* Full compact sidebar. Nav scrolls · lower modules stay pinned. 256px expanded / 72px collapsed. */
export function Sidebar({
  character = 'hunter', items = SIDEBAR_ITEMS, activeId = 'sessions', collapsed = false,
  height = 900, quote, reward, rewardXp, rewardLabel, rewardProgress = 73, onRewardOpen, onNavigate, onToggle,
  activeLabel = 'ACTIVE', collapseLabel, rtl = false, style, ...rest
}) {
  return (
    <nav
      aria-label="Primary"
      style={{
        position: 'relative', width: collapsed ? 'var(--sidebar-w-collapsed)' : 'var(--sidebar-w)', height,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        borderRadius: 'var(--radius-14)', border: '1px solid var(--border-gold)',
        background: 'linear-gradient(180deg, var(--char-atmosphere) 0%, color-mix(in srgb, var(--char-atmosphere) 42%, var(--ink-950)) 55%, var(--ink-950) 100%)',
        boxShadow: 'var(--shadow-panel)',
        transition: 'width var(--dur-expand) var(--ease-out)', ...style
      }}
      {...rest}
    >
      <BrandStrip character={character} collapsed={collapsed} />
      {collapsed ? (
        <CollapsedRail character={character} items={items} activeId={activeId} onNavigate={onNavigate} progress={rewardProgress} />
      ) : (
        <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div className="navrya-scroll" style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingTop: 4 }}>
            {items.map((it, i) => (
              <NavRow
                key={it.id} icon={it.icon} label={it.label} active={it.id === activeId}
                activeLabel={activeLabel} rtl={rtl}
                first={i === 0} last={i === items.length - 1}
                onClick={() => onNavigate && onNavigate(it.id)}
              />
            ))}
          </div>
          <span aria-hidden="true" style={{
            position: 'absolute', left: 0, right: 0, bottom: 18, height: 48, pointerEvents: 'none',
            background: 'linear-gradient(180deg, rgba(3,8,7,0) 0%, rgba(3,8,7,.92) 100%)'
          }}></span>
          <div aria-hidden="true" style={{ display: 'grid', placeItems: 'center', color: 'var(--gold-antique)', height: 18 }}>
            <Icon name="scroll-down" size={16} />
          </div>
        </div>
      )}
      {!collapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sidebar-gap)', padding: 'var(--sidebar-pad)' }}>
          <QuoteCard character={character} quote={quote} />
          <RewardCard
            character={character} reward={reward || CHARACTER_REWARD[character]} progress={rewardProgress}
            {...(rewardXp !== undefined ? { xp: rewardXp } : {})}
            {...(rewardLabel !== undefined ? { label: rewardLabel } : {})}
            onOpen={onRewardOpen}
          />
          <CollapseControl collapsed={false} onToggle={onToggle} label={collapseLabel} />
        </div>
      )}
      {collapsed && (
        <div style={{ padding: 10 }}>
          <CollapseControl collapsed onToggle={onToggle} label={collapseLabel} />
        </div>
      )}
    </nav>
  );
}
