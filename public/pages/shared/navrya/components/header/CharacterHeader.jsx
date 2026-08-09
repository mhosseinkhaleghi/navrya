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

// Breakpoints match CharacterHeader.prompt.md's own documented (previously unbuilt) spec: below
// 1280px shrink the portrait, below 920px collapse to a stacked layout - 920 also matches the
// live breakpoint hunter/styles.css already uses to stack .navrya-shell (sidebar + content)
// below the header, so the whole page reflows consistently at the same width. Every style below
// is inline (not CSS) because the rest of this component already is - no @media exists anywhere
// in this design system, so a resize-driven hook is the least-surprising way to add one.
function useViewportWidth() {
  const [width, setWidth] = React.useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1920));
  React.useEffect(() => {
    function onResize() { setWidth(window.innerWidth); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

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
  const viewportWidth = useViewportWidth();
  const narrow1280 = viewportWidth <= 1280;
  const narrow920 = viewportWidth <= 920;
  const portraitSize = narrow1280 ? 176 : 200;
  return (
    <header
      style={{
        position: 'relative', boxSizing: 'border-box', width: '100%',
        display: 'flex', flexDirection: 'column',
        padding: 'var(--header-pad)', gap: 'var(--header-gutter)', overflow: 'visible',
        borderRadius: 'var(--radius-12)', border: '1px solid var(--border-gold)',
        background: 'linear-gradient(90deg, var(--char-atmosphere) 0%, color-mix(in srgb, var(--char-atmosphere) 42%, var(--ink-950)) 55%, var(--ink-950) 100%)',
        boxShadow: 'var(--shadow-panel)', ...style
      }}
      {...rest}
    >
      <div style={{ display: 'flex', flexDirection: narrow920 ? 'column' : 'row', alignItems: narrow920 ? 'stretch' : 'stretch', gap: 'var(--header-gutter)', flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--header-gutter)', flex: 'none' }}>
          <BrandLockup character={character} style={{ width: 'var(--region-brand)', flex: 'none', paddingTop: 14, alignSelf: 'flex-start' }} markSize={54} />
          <CharacterPortrait character={character} size={portraitSize} onEdit={onEditPortrait} style={{ margin: '0 8px' }} />
        </div>
        <div style={{ flex: narrow920 ? 'none' : '1 1 var(--region-identity)', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 6 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
            <CharacterIdentity character={character} name={name} handle={handle} quote={quote || d.quote} onClick={onIdentityClick} style={{ flex: '1 1 200px', minWidth: 200 }} />
            <LevelBadge level={level ?? d.level} label={levelLabel} />
          </div>
          {/* ??, not || - a real signed-in trader's xpTotal is legitimately 0 at the very start,
              and 0 is falsy; || would silently swap in the decorative demo numbers for every
              brand-new account, indistinguishable from "profile failed to load". */}
          <XPProgress value={xp ?? d.xp} max={xpMax ?? d.xpMax} />
          <MetricRow metrics={metrics} style={{ marginTop: 'auto', flexWrap: 'wrap' }} />
        </div>
        <div style={{ flex: narrow920 ? 'none' : '0 0 auto', minWidth: narrow920 ? 0 : 508, width: narrow920 ? '100%' : undefined, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--header-gutter)', flexWrap: narrow920 ? 'wrap' : 'nowrap' }}>
            <RankCrest character={character} style={{ flex: 'none', paddingTop: 8 }} label={rankLabel} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: narrow920 ? '1 1 260px' : 'none', flexShrink: narrow920 ? 1 : 0, minWidth: narrow920 ? 260 : undefined }}>
              <UtilityPanel date={date} language={language} uptime={uptime} uptimeLabel={uptimeLabel} onLanguageChange={onLanguageChange} onSettings={onSettings} width={narrow920 ? '100%' : 344} />
              <NextSessionPanel city={nextSession.city} startsIn={nextSession.startsIn} nextSessionLabel={nextSessionLabel} startsInLabel={startsInLabel} width={narrow920 ? '100%' : 344} />
            </div>
          </div>
          {/* Below 920px the market rail scrolls horizontally instead of squeezing four cards
              illegibly-thin or overflowing past the page edge (previously clipped/hidden by
              body{overflow-x:hidden} - see CharacterHeader.prompt.md's original "carousel"
              breakpoint spec; a contained scroll strip is the same idea, simpler to keep clean). */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', minHeight: 'var(--metric-tile-h)', marginTop: 'auto', overflowX: narrow920 ? 'auto' : 'visible', paddingBottom: narrow920 ? 2 : 0 }}>
            {markets.map((m) => (
              <MarketSessionCard
                key={m.market} market={m.market} state={m.state} countdown={m.countdown} cityLabel={m.cityLabel}
                minWidth={narrow920 ? 'var(--market-card-min-w)' : 0} height="var(--metric-tile-h)"
                style={{ flex: narrow920 ? '0 0 auto' : '1 1 0' }}
              />
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}
