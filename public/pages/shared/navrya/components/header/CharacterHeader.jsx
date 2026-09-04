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

// The header's regions have real minimum widths (brand + portrait + identity + utility rail), so
// the layout must stack before they are squeezed on ordinary laptop screens.  The viewport here
// is the full app shell, not just the content column below the sidebar.
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

// Same idea, on the vertical axis: the header was previously only width-aware, so on a short
// laptop viewport (~700-800px tall) it kept its full ~230-260px portrait-driven height no matter
// what, crowding out everything below it (the chat dock ended up overlapping the session-library
// toolbar at 1440x560). Below 820px tall, shrink the identity-plate title, portrait, and outer
// padding/gutter so the whole header takes meaningfully less vertical room.
function useViewportHeight() {
  const [height, setHeight] = React.useState(() => (typeof window !== 'undefined' ? window.innerHeight : 1080));
  React.useEffect(() => {
    function onResize() { setHeight(window.innerHeight); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return height;
}

/* ONE COMPONENT. FOUR IDENTITIES. The 1920×320 character header. */
export function CharacterHeader({
  character = 'hunter', title, name = 'RAYAN LAND', handle = '@rayanland', level, xp, xpMax, quote,
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
  const viewportHeight = useViewportHeight();
  const compactDesktop = viewportWidth <= 1680;
  const narrowDesktop = viewportWidth <= 1180;
  const mobile = viewportWidth <= 720;
  const shortHeight = viewportHeight <= 820;
  const portraitSize = mobile ? 76 : (shortHeight ? 88 : (compactDesktop ? 108 : 124));
  const headerPad = mobile ? 10 : (shortHeight ? '10px 16px' : 'var(--header-pad)');
  const gutter = mobile ? 8 : (shortHeight ? 8 : 'var(--header-gutter)');
  const marketTileHeight = shortHeight ? 44 : 'var(--metric-tile-h)';
  if (mobile) {
    return (
      <header
        className="navrya-character-header navrya-character-header--mobile"
        style={{
          position: 'relative', boxSizing: 'border-box', width: '100%', display: 'flex', flexDirection: 'column',
          padding: headerPad, gap: 10, borderRadius: 'var(--radius-12)', border: '1px solid var(--border-gold)',
          background: 'linear-gradient(135deg, var(--char-atmosphere) 0%, color-mix(in srgb, var(--char-atmosphere) 36%, var(--ink-950)) 58%, var(--ink-950) 100%)',
          boxShadow: 'var(--shadow-panel)', ...style
        }}
        {...rest}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0, paddingInlineEnd: 48 }}>
          <BrandLockup
            character={character} orientation="horizontal" showEdition={false}
            style={{ minWidth: 0, flex: '1 1 auto', paddingTop: 2 }} markSize={30} wordmarkSize={16}
          />
          <CharacterPortrait character={character} size={68} onEdit={onEditPortrait} style={{ margin: 0, flex: 'none' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', alignItems: 'start', gap: 10, minWidth: 0 }}>
          <CharacterIdentity
            character={character} name={name} handle={handle} title={title}
            quote={undefined} onClick={onIdentityClick} titleSize={22} style={{ minWidth: 0 }}
          />
          <LevelBadge level={level ?? d.level} label={levelLabel} />
        </div>
        <XPProgress value={xp ?? d.xp} max={xpMax ?? d.xpMax} />
      </header>
    );
  }
  return (
    <header
      className="navrya-character-header navrya-character-header--desktop"
      style={{
        position: 'relative', boxSizing: 'border-box', width: '100%',
        display: 'flex', flexDirection: 'column',
        padding: headerPad, gap: gutter, overflow: 'visible',
        borderRadius: 'var(--radius-12)', border: '1px solid var(--border-gold)',
        background: 'linear-gradient(90deg, var(--char-atmosphere) 0%, color-mix(in srgb, var(--char-atmosphere) 42%, var(--ink-950)) 55%, var(--ink-950) 100%)',
        boxShadow: 'var(--shadow-panel)', ...style
      }}
      {...rest}
    >
      <div className="navrya-header-primary-row" style={{ display: 'grid', gridTemplateColumns: narrowDesktop ? 'minmax(0,1fr) minmax(0,1fr)' : 'minmax(252px,.72fr) minmax(0,1.34fr) minmax(300px,.82fr)', alignItems: 'stretch', gap: gutter }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: gutter, minWidth: 0 }}>
          <BrandLockup character={character} orientation="horizontal" style={{ minWidth: 0, flex: '1 1 auto' }} markSize={compactDesktop ? 38 : 46} wordmarkSize={compactDesktop ? 20 : 23} />
          <CharacterPortrait character={character} size={portraitSize} onEdit={onEditPortrait} style={{ margin: 0, flex: 'none' }} />
        </div>
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: shortHeight ? 6 : 8 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, minWidth: 0 }}>
            <CharacterIdentity
              character={character} name={name} handle={handle} title={title}
              quote={undefined} onClick={onIdentityClick}
              titleSize={shortHeight ? 21 : 25} style={{ flex: '1 1 auto', minWidth: 0 }}
            />
            <LevelBadge level={level ?? d.level} label={levelLabel} />
          </div>
          <XPProgress value={xp ?? d.xp} max={xpMax ?? d.xpMax} />
          <MetricRow metrics={metrics} style={{ minWidth: 0 }} />
        </div>
        <div style={{ gridColumn: narrowDesktop ? '1 / -1' : undefined, minWidth: 0, alignSelf: 'stretch' }}>
          <UtilityPanel date={date} language={language} uptime={uptime} uptimeLabel={uptimeLabel} onLanguageChange={onLanguageChange} onSettings={onSettings} width="100%" />
        </div>
      </div>
      <div className="navrya-header-market-row" style={{ display: 'flex', alignItems: 'stretch', gap: gutter, minWidth: 0 }}>
        <RankCrest character={character} size={shortHeight ? 58 : 72} style={{ flex: '0 0 auto', minWidth: 190 }} label={rankLabel} />
        <NextSessionPanel city={nextSession.city} startsIn={nextSession.startsIn} nextSessionLabel={nextSessionLabel} startsInLabel={startsInLabel} width={narrowDesktop ? 260 : 300} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', minWidth: 0, flex: '1 1 auto', overflowX: 'auto', paddingBottom: 2 }}>
          {markets.map((m) => (
            <MarketSessionCard
              key={m.market} market={m.market} state={m.state} countdown={m.countdown} cityLabel={m.cityLabel}
              minWidth={narrowDesktop ? 156 : 0} height={marketTileHeight}
              style={{ flex: narrowDesktop ? '0 0 auto' : '1 1 0' }}
            />
          ))}
        </div>
      </div>
    </header>
  );
}
