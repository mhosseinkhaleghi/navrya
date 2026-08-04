import React from 'react';
import { BrandLockup } from '../brand/BrandLockup.jsx';
import { CharacterPortrait } from '../identity/CharacterPortrait.jsx';
import { CharacterIdentity } from '../identity/CharacterIdentity.jsx';
import { XPProgress } from '../identity/XPProgress.jsx';
import { LevelBadge } from '../identity/LevelBadge.jsx';
import { RankCrest } from '../identity/RankCrest.jsx';
import { MetricRow, DEFAULT_METRICS } from '../metrics/MetricRow.jsx';
import { UtilityPanel } from '../market/UtilityPanel.jsx';
import { NextSessionPanel } from '../market/NextSessionPanel.jsx';
import { MarketSessionCard } from '../market/MarketSessionCard.jsx';

export const CHARACTER_DATA = {
  hunter: { level: 27, xp: 18450, xpMax: 25000, quote: 'The market reveals. The Hunter decides.' },
  commander: { level: 4, xp: 2450, xpMax: 5000, quote: 'Lead with purpose. Execute with precision.' },
  engineer: { level: 18, xp: 8760, xpMax: 12000, quote: 'Every structure reveals a signal.' },
  master: { level: 42, xp: 38400, xpMax: 50000, quote: 'Cycles repeat. The Master remembers.' }
};

/* ONE COMPONENT. FOUR IDENTITIES. The 1920×320 character header. */
export function CharacterHeader({
  character = 'hunter', name = 'RAYAN LAND', handle = '@rayanland', level, xp, xpMax, quote,
  metrics = DEFAULT_METRICS, date = '2026-07-30', language = 'EN', uptime = '12:48:36', uptimeLabel,
  onLanguageChange, onSettings, onIdentityClick, levelLabel, rankLabel,
  nextSession = { city: 'SYDNEY', startsIn: '01:35:40' }, nextSessionLabel, startsInLabel,
  markets = [
    { market: 'london', state: 'open' }, { market: 'new-york', state: 'default' },
    { market: 'tokyo', state: 'default' }, { market: 'sydney', state: 'default' }
  ],
  onEditPortrait, style, ...rest
}) {
  const d = CHARACTER_DATA[character] || CHARACTER_DATA.hunter;
  return (
    <header
      style={{
        position: 'relative', boxSizing: 'border-box', minWidth: 1620,
        display: 'flex', flexDirection: 'column',
        padding: 'var(--header-pad)', gap: 'var(--header-gutter)', overflow: 'visible',
        borderRadius: 'var(--radius-12)', border: '1px solid var(--border-gold)',
        background: 'linear-gradient(90deg, var(--char-atmosphere) 0%, color-mix(in srgb, var(--char-atmosphere) 42%, var(--ink-950)) 55%, var(--ink-950) 100%)',
        boxShadow: 'var(--shadow-panel)', ...style
      }}
      {...rest}
    >
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 'var(--header-gutter)', flex: 1 }}>
        <BrandLockup character={character} style={{ width: 'var(--region-brand)', flex: 'none', paddingTop: 14, alignSelf: 'flex-start' }} markSize={54} />
        <CharacterPortrait character={character} size={200} onEdit={onEditPortrait} style={{ margin: '0 8px' }} />
        <div style={{ flex: '1 1 var(--region-identity)', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 6 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24 }}>
            <CharacterIdentity character={character} name={name} handle={handle} quote={quote || d.quote} onClick={onIdentityClick} style={{ flex: 1 }} />
            <LevelBadge level={level ?? d.level} label={levelLabel} />
          </div>
          {/* ??, not || - a real signed-in trader's xpTotal is legitimately 0 at the very start,
              and 0 is falsy; || would silently swap in the decorative demo numbers for every
              brand-new account, indistinguishable from "profile failed to load". */}
          <XPProgress value={xp ?? d.xp} max={xpMax ?? d.xpMax} />
          <MetricRow metrics={metrics} style={{ marginTop: 'auto' }} />
        </div>
        <div style={{ flex: '0 0 auto', minWidth: 508, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--header-gutter)' }}>
            <RankCrest character={character} style={{ flex: 'none', paddingTop: 8 }} label={rankLabel} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 'none', flexShrink: 0 }}>
              <UtilityPanel date={date} language={language} uptime={uptime} uptimeLabel={uptimeLabel} onLanguageChange={onLanguageChange} onSettings={onSettings} />
              <NextSessionPanel city={nextSession.city} startsIn={nextSession.startsIn} nextSessionLabel={nextSessionLabel} startsInLabel={startsInLabel} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', minHeight: 'var(--metric-tile-h)', marginTop: 'auto' }}>
            {markets.map((m) => (
              <MarketSessionCard key={m.market} market={m.market} state={m.state} countdown={m.countdown} cityLabel={m.cityLabel} minWidth={0} height="var(--metric-tile-h)" style={{ flex: '1 1 0' }} />
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}
