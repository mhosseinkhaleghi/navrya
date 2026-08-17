import React from 'react';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Chip } from '../public/pages/shared/navrya/components/forms/Chip.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { Select } from '../public/pages/shared/navrya/components/forms/Select.jsx';
import { SearchField } from '../public/pages/shared/navrya/components/forms/SearchField.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { MetricTile } from '../public/pages/shared/navrya/components/metrics/MetricTile.jsx';
import { assetUrl } from '../public/pages/shared/navrya/components/core/AssetBase.jsx';
import { ReportButton } from './reportFlow.jsx';
import { Avatar } from './communityAvatar.jsx';
import { currentNavryaCharacter } from './currentCharacter.js';

function dash(v) { return v === null || v === undefined || v === '' ? '—' : v; }

function typeLabel(i18n, type) {
  return type === 'strategy' ? i18n.t('listingTypeStrategy') : type === 'pattern' ? i18n.t('listingTypePattern') : i18n.t('listingTypeSubscription');
}

function hasEvidence(listing) { return listing.sampleSize > 0 && listing.successRatePercent != null; }

function EvidenceChip({ i18n, listing }) {
  if (!hasEvidence(listing)) return <Chip tone="neutral">{i18n.t('listingInsufficientData')}</Chip>;
  return <Chip tone="accent">{i18n.number(listing.successRatePercent) + '% · ' + i18n.number(listing.sampleSize) + ' ' + i18n.t('listingSampleSize')}</Chip>;
}

function FieldRow({ label, value }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,300px) minmax(0,1fr)', gap: 12, padding: '11px 0', borderTop: '1px solid var(--border-hairline)' }}>
      <span style={{ font: 'var(--type-caption)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</span>
      <span className="navrya-tabular" dir="auto" style={{ font: 'var(--type-body)', fontSize: 13, fontWeight: 600, color: 'var(--parchment)' }}>{dash(value)}</span>
    </div>
  );
}

function CoverArt({ character, height = 168, crestSize = 104, pillLabel }) {
  return (
    <div style={{ position: 'relative', height, background: 'var(--ink-950)', overflow: 'hidden', flex: 'none' }}>
      <img src={assetUrl('assets/textures/atmosphere-' + character + '.webp')} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: .1 }} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(3,8,7,.15), rgba(3,8,7,.55))' }} />
      <img src={assetUrl('assets/crests/crest-' + character + '.webp')} alt="" style={{ position: 'absolute', inset: 0, margin: 'auto', width: crestSize, height: crestSize, objectFit: 'contain' }} />
      {pillLabel && (
        <span style={{ position: 'absolute', top: 12, insetInlineStart: 12, padding: '4px 10px', borderRadius: 6, font: 'var(--type-caption)', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--char-accent)', background: 'rgba(3,8,7,.86)', border: '1px solid color-mix(in srgb, var(--char-accent) 55%, transparent)' }}>{pillLabel}</span>
      )}
    </div>
  );
}

function ListingCard({ i18n, listing, sellerName }) {
  const character = currentNavryaCharacter();
  return (
    <Panel
      as="button" type="button" variant="base" radius={12}
      onClick={() => { location.hash = '#community/marketplace/' + encodeURIComponent(listing.id); }}
      style={{ textAlign: 'start', cursor: 'pointer', padding: 0, display: 'flex', flexDirection: 'column', width: '100%', font: 'inherit', color: 'inherit', overflow: 'hidden', boxShadow: 'var(--shadow-panel)' }}
    >
      <CoverArt character={character} pillLabel={typeLabel(i18n, listing.type)} />
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
        <strong dir="auto" style={{ font: 'var(--type-display-md)', fontSize: 18, lineHeight: '24px', color: 'var(--parchment)' }}>{listing.title}</strong>
        <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t('listingCreatorLabel') + ' ' + (sellerName || '—')}</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><EvidenceChip i18n={i18n} listing={listing} /></div>
        <div style={{ display: 'flex', gap: 16, padding: '10px 0', borderTop: '1px solid var(--border-hairline)', borderBottom: '1px solid var(--border-hairline)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t('cardRatingLabel')}</div>
            <div className="navrya-tabular" style={{ font: 'var(--type-body)', fontWeight: 600, color: 'var(--parchment)' }}>—</div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t('listingSalesLabel')}</div>
            <div className="navrya-tabular" style={{ font: 'var(--type-body)', fontWeight: 600, color: 'var(--parchment)' }}>—</div>
          </div>
        </div>
        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span className="navrya-tabular" style={{ font: 'var(--type-metric-value)', color: 'var(--char-accent)' }}>{i18n.number(listing.priceAmount) + ' ' + listing.priceCurrency}</span>
          <Button variant="primary" icon="open" size="sm" onClick={(e) => { e.stopPropagation(); location.hash = '#community/marketplace/' + encodeURIComponent(listing.id); }}>{i18n.t('marketplaceViewProduct')}</Button>
        </div>
      </div>
    </Panel>
  );
}

const SORT_OPTIONS = ['marketplaceSortNewest', 'marketplaceSortPriceLow', 'marketplaceSortPriceHigh', 'marketplaceSortBestSelling'];

export function MarketplaceStorefront({ i18n }) {
  const [query, setQuery] = React.useState('');
  const [sort, setSort] = React.useState(SORT_OPTIONS[0]);
  const [listings, setListings] = React.useState(null);
  const [sellers, setSellers] = React.useState({});
  React.useEffect(() => {
    setListings(null);
    window.TradeJournalCommunityStore.listListings({}).then((data) => {
      setListings(data);
      const store = window.TradeJournalCommunityStore;
      const uniqueSellers = Array.from(new Set(data.map((l) => l.sellerId)));
      Promise.all(uniqueSellers.map((id) => store.getUser(id).then((user) => [id, user])))
        .then((pairs) => setSellers(Object.fromEntries(pairs)));
    });
  }, []);
  const filtered = React.useMemo(() => {
    if (!listings) return null;
    const needle = query.trim().toLowerCase();
    if (!needle) return listings;
    return listings.filter((l) => l.title.toLowerCase().includes(needle) || (sellers[l.sellerId] && sellers[l.sellerId].displayName.toLowerCase().includes(needle)));
  }, [listings, query, sellers]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <SearchField value={query} onChange={setQuery} placeholder={i18n.t('marketplaceSearchPlaceholder')} style={{ flex: 1, minWidth: 220 }} />
        <Select value={sort} onChange={setSort} icon="sort" width={220} options={SORT_OPTIONS.map((key) => ({ value: key, label: i18n.t(key) }))} />
        <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{i18n.t('marketplaceResultCount', { n: i18n.number(filtered ? filtered.length : 0) })}</span>
      </div>
      {filtered === null ? null : !filtered.length ? (
        <Panel variant="base" radius={12} style={{ padding: 16 }}><span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t('marketplaceEmpty')}</span></Panel>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {filtered.map((listing) => <ListingCard key={listing.id} i18n={i18n} listing={listing} sellerName={sellers[listing.sellerId] && sellers[listing.sellerId].displayName} />)}
        </div>
      )}
    </div>
  );
}

function StrategyContentPanel({ i18n, fullContent }) {
  const overall = (fullContent && fullContent.overallFramework) || {};
  const risk = (fullContent && fullContent.riskManagement) || {};
  const position = (fullContent && fullContent.positionManagement) || {};
  return (
    <>
      <div>
        <div style={{ font: 'var(--type-caption)', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--char-accent)', marginBottom: 4 }}>{i18n.t('listingGroupOverallFramework')}</div>
        <FieldRow label={i18n.t('fieldDescription')} value={overall.description} />
        <FieldRow label={i18n.t('fieldAttachments')} value={(overall.attachments || []).length ? i18n.number(overall.attachments.length) : null} />
      </div>
      <div style={{ marginTop: 14 }}>
        <div style={{ font: 'var(--type-caption)', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--char-accent)', marginBottom: 4 }}>{i18n.t('listingGroupRiskManagement')}</div>
        <FieldRow label={i18n.t('fieldMaxConcurrentTrades')} value={risk.maxConcurrentTrades} />
        <FieldRow label={i18n.t('fieldMaxProfitCap')} value={risk.maxProfitCapPerTrade} />
        <FieldRow label={i18n.t('fieldMaxRiskPerTrade')} value={risk.maxRiskPerTradePercent != null ? i18n.number(risk.maxRiskPerTradePercent) + '%' : null} />
        <FieldRow label={i18n.t('fieldDailyDrawdownLimit')} value={risk.dailyDrawdownLimitPercent != null ? i18n.number(risk.dailyDrawdownLimitPercent) + '%' : null} />
        <FieldRow label={i18n.t('fieldTotalDrawdownLimit')} value={risk.totalDrawdownLimitPercent != null ? i18n.number(risk.totalDrawdownLimitPercent) + '%' : null} />
        <FieldRow label={i18n.t('fieldFreeNotes')} value={risk.freeNotes} />
        <FieldRow label={i18n.t('fieldAttachments')} value={(risk.attachments || []).length ? i18n.number(risk.attachments.length) : null} />
      </div>
      <div style={{ marginTop: 14 }}>
        <div style={{ font: 'var(--type-caption)', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--char-accent)', marginBottom: 4 }}>{i18n.t('listingGroupPositionManagement')}</div>
        <FieldRow label={i18n.t('fieldEntryRules')} value={position.entryRules} />
        <FieldRow label={i18n.t('fieldStopLossRules')} value={position.stopLossRules} />
        <FieldRow label={i18n.t('fieldExitTargetRules')} value={position.exitTargetRules} />
        <FieldRow label={i18n.t('fieldPositionSizingRules')} value={position.positionSizingRules} />
        <FieldRow label={i18n.t('fieldFreeNotes')} value={position.freeNotes} />
        <FieldRow label={i18n.t('fieldAttachments')} value={(position.attachments || []).length ? i18n.number(position.attachments.length) : null} />
      </div>
    </>
  );
}

// No design spec exists for pattern/subscription content (the handoff only covers strategy
// packages) - same field-row visual language, real fields for whatever shape those types carry.
function GenericContentPanel({ i18n, fullContent }) {
  const content = fullContent || {};
  return (
    <>
      <FieldRow label={i18n.t('fieldDescription')} value={content.description} />
      {Array.isArray(content.stages) && <FieldRow label={i18n.t('listingPreview')} value={content.stages.length ? content.stages.map((s) => s.text).join(' → ') : null} />}
    </>
  );
}

function FreePreviewPanel({ i18n, previewContent }) {
  const preview = previewContent || {};
  const freeItems = Object.keys(preview).filter((k) => k !== 'name').length;
  const framework = preview.overallFramework && preview.overallFramework.description ? preview.overallFramework.description : (preview.description || null);
  return (
    <Panel variant="base" radius={12} style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Icon name="unlock" size={18} style={{ color: 'var(--char-accent)' }} />
        <h3 style={{ margin: 0, font: 'var(--type-body)', fontWeight: 700, color: 'var(--parchment)' }}>{i18n.t('listingFreePreviewTitle')}</h3>
      </div>
      <FieldRow label={i18n.t('listingFreeItemsLabel')} value={freeItems || null} />
      <FieldRow label={i18n.t('listingFrameworkLabel')} value={framework} />
    </Panel>
  );
}

function FullContentPanel({ i18n, listing, unlocked }) {
  return (
    <Panel variant="base" radius={12} style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Icon name="strategies" size={18} style={{ color: 'var(--char-accent)' }} />
        <h3 style={{ margin: 0, flex: 1, font: 'var(--type-body)', fontWeight: 700, color: 'var(--parchment)' }}>{i18n.t('listingFullContentTitle')}</h3>
        <Chip tone={unlocked ? 'accent' : 'neutral'}>{i18n.t(unlocked ? 'listingUnlockedChip' : 'listingLockedChip')}</Chip>
      </div>
      {unlocked ? (
        listing.type === 'strategy'
          ? <StrategyContentPanel i18n={i18n} fullContent={listing.fullContent} />
          : <GenericContentPanel i18n={i18n} fullContent={listing.fullContent} />
      ) : (
        <p style={{ margin: 0, font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t('listingLocked')}</p>
      )}
    </Panel>
  );
}

function WinsLossesPanel({ i18n, listing }) {
  const evidence = hasEvidence(listing);
  const wins = evidence ? Math.round((listing.sampleSize * listing.successRatePercent) / 100) : null;
  const losses = evidence ? listing.sampleSize - wins : null;
  return (
    <Panel variant="base" radius={12} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="report" size={18} style={{ color: 'var(--char-accent)' }} />
        <h3 style={{ margin: 0, flex: 1, font: 'var(--type-body)', fontWeight: 700, color: 'var(--parchment)' }}>{i18n.t('listingWinsLossesTitle')}</h3>
        <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t('listingAsOf', { date: i18n.date(listing.evidenceAsOf) })}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
        <MetricTile icon="trending-up" label={i18n.t('listingWinsLabel')} value={evidence ? i18n.number(wins) : '—'} />
        <MetricTile icon="trending-down" label={i18n.t('listingLossesLabel')} value={evidence ? i18n.number(losses) : '—'} />
        <MetricTile icon="execution" label={i18n.t('listingWinRateLabel')} value={evidence ? i18n.number(listing.successRatePercent) + '%' : '—'} />
      </div>
      {!evidence && <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t('listingNoResultsFootnote')}</span>}
    </Panel>
  );
}

function RatingsPanel({ i18n, listing, ratingsData, isSeller, unlocked, onRated }) {
  const [ratingValue, setRatingValue] = React.useState('5');
  const [reviewText, setReviewText] = React.useState('');

  // AI process registry (A4) - this panel is always mounted while a listing's detail view is
  // open, but the rating form itself only makes sense once !isSeller && unlocked, so isOpen
  // reflects that condition directly rather than mount/unmount. Re-registers whenever those two
  // props change (idempotent, same "refresh on relevant render" convention the vanilla-JS flows
  // in trade-ui.js/pattern-registry.js already use), so a stale isSeller/unlocked never lingers.
  React.useEffect(() => {
    const registry = window.TradeJournalAIProcessRegistry;
    if (!registry) return undefined;
    registry.register('marketplace-rate-' + listing.id, {
      allowlist: ['ratingValue', 'reviewText'],
      isOpen: () => !isSeller && unlocked,
      applyValue: (path, value) => {
        if (path === 'ratingValue') { const n = Number(value); if (n >= 1 && n <= 5) setRatingValue(String(Math.round(n))); }
        else if (path === 'reviewText') setReviewText(String(value ?? ''));
      }
    });
    return undefined;
  }, [listing.id, isSeller, unlocked]);

  function submit() {
    window.TradeJournalCommunityStore.rateListing(listing.id, Number(ratingValue), reviewText.trim()).then(() => { setReviewText(''); onRated(); });
  }
  const ratings = ratingsData.ratings;
  return (
    <Panel variant="base" radius={12} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="star" size={18} style={{ color: 'var(--char-accent)' }} />
        <h3 style={{ margin: 0, flex: 1, font: 'var(--type-body)', fontWeight: 700, color: 'var(--parchment)' }}>{i18n.t('listingRatingsTitle')}</h3>
        <span className="navrya-tabular" style={{ font: 'var(--type-body)', fontWeight: 600, color: 'var(--char-accent)' }}>{ratingsData.average != null ? i18n.number(ratingsData.average, { maximumFractionDigits: 1 }) : '—'} / 5</span>
      </div>
      {!ratings.length ? (
        <span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t('listingNoRatings')}</span>
      ) : ratings.map((rating) => (
        <div key={rating.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <Avatar user={rating.author} size={32} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
              <strong style={{ font: 'var(--type-body)', color: 'var(--parchment)' }}>{rating.author ? rating.author.displayName : '—'}</strong>
              <span className="navrya-tabular" style={{ color: 'var(--char-accent)', fontWeight: 600 }}>{rating.rating + '/5'}</span>
              <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.date(rating.createdAt)}</span>
            </div>
            {rating.reviewText && <p dir="auto" style={{ margin: '4px 0 0', font: 'var(--type-body)', color: 'var(--text-primary)' }}>{rating.reviewText}</p>}
          </div>
        </div>
      ))}
      {!isSeller && unlocked && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', paddingTop: 6, borderTop: '1px solid var(--border-hairline)' }}>
          <Select value={ratingValue} align="center" width={120} options={[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: n + ' / 5' }))} onChange={setRatingValue} />
          <input
            type="text" value={reviewText} onChange={(e) => setReviewText(e.target.value)} placeholder={i18n.t('reviewPlaceholder')} dir="auto"
            style={{ flex: 1, minWidth: 140, height: 44, boxSizing: 'border-box', padding: '0 14px', borderRadius: 8, background: 'rgba(3,8,7,.55)', border: '1px solid var(--border-gold)', color: 'var(--text-primary)', font: 'var(--type-body)', outline: 'none' }}
          />
          <Button variant="secondary" icon="check" onClick={submit}>{i18n.t('submitReview')}</Button>
        </div>
      )}
    </Panel>
  );
}

function Notice({ children }) {
  return <div style={{ padding: '12px 14px', borderRadius: 8, background: 'rgba(3,8,7,.45)', border: '1px solid var(--border-hairline)', font: 'var(--type-body)', color: 'var(--text-muted)' }}>{children}</div>;
}

function BuyBox({ i18n, listing, isSeller, unlocked, ratingsData, onBuy, onMessage }) {
  return (
    <Panel variant="base" radius={12} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, border: '1px solid var(--border-gold-strong)', boxShadow: 'var(--shadow-panel)' }}>
      <div>
        <div style={{ font: 'var(--type-caption)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{i18n.t('listingPrice')}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="navrya-tabular" style={{ font: 'var(--type-level)', fontSize: 34, lineHeight: '38px', color: 'var(--char-accent)' }}>{i18n.number(listing.priceAmount) + ' ' + listing.priceCurrency}</span>
          {!isSeller && unlocked && <Chip tone="success" dot>{i18n.t('listingBought')}</Chip>}
        </div>
      </div>
      <FieldRow label={i18n.t('cardRatingLabel')} value={ratingsData.average != null ? i18n.number(ratingsData.average, { maximumFractionDigits: 1 }) + ' / 5' : null} />
      <FieldRow label={i18n.t('listingReviewsCountLabel')} value={i18n.number(ratingsData.count)} />
      <FieldRow label={i18n.t('listingSalesLabel')} value={listing.salesCount ? i18n.number(listing.salesCount) : null} />
      <FieldRow label={i18n.t('listingBestsellerLabel')} value={listing.bestsellerRank ? '#' + i18n.number(listing.bestsellerRank) : null} />
      {!isSeller && (unlocked ? null : <Button variant="primary" icon="shopping-cart" fullWidth onClick={onBuy}>{i18n.t('listingBuy')}</Button>)}
      {!isSeller && <Button variant={unlocked ? 'primary' : 'secondary'} icon="message-circle" fullWidth onClick={onMessage}>{i18n.t('listingMessageSeller')}</Button>}
      <Notice>{i18n.t('mockBadge')}</Notice>
    </Panel>
  );
}

function SellerCard({ i18n, seller, listingId }) {
  return (
    <Panel variant="base" radius={12} style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 14 }}>
      <Avatar user={seller} size={52} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: 'var(--type-caption)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{i18n.t('sellerLabel')}</div>
        <strong style={{ display: 'block', font: 'var(--type-username)', color: 'var(--parchment)' }}>{seller ? seller.displayName : '—'}</strong>
        <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{seller ? '@' + seller.id : ''}</span>
      </div>
      <ReportButton targetType="listing" targetId={listingId} i18n={i18n} />
    </Panel>
  );
}

export function MarketplaceDetail({ i18n, id }) {
  const [data, setData] = React.useState(null);
  const [reload, setReload] = React.useState(0);
  React.useEffect(() => {
    setData(null);
    const store = window.TradeJournalCommunityStore;
    Promise.all([store.getListing(id), store.listRatings(id)])
      .then(([listing, ratingsData]) => store.getUser(listing.sellerId).then((seller) => setData({ listing, ratingsData, seller })));
  }, [id, reload]);

  if (!data) return null;
  const { listing, ratingsData, seller } = data;
  const switcher = window.TradeJournalDevUserSwitcher;
  const isSeller = switcher && switcher.currentUserId() === listing.sellerId;
  const unlocked = isSeller || listing.fullContent != null;
  const rtl = i18n.direction() === 'rtl';
  const character = currentNavryaCharacter();

  function buy() { window.TradeJournalCommunityStore.purchaseListing(listing.id).then(() => setReload((r) => r + 1)); }
  function message() { window.TradeJournalCommunityStore.openThread(listing.id).then((thread) => { location.hash = '#community/messages/' + encodeURIComponent(thread.id); }); }

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ direction: rtl ? 'rtl' : 'ltr', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Button variant="ghost" icon={rtl ? 'arrow-right' : 'arrow-left'} onClick={() => { location.hash = '#community/marketplace'; }} style={{ alignSelf: 'flex-start' }}>{i18n.t('back')}</Button>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 360px', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Panel variant="base" radius={12} style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--border-gold-strong)', boxShadow: 'var(--shadow-panel)' }}>
            <CoverArt character={character} height={320} crestSize={176} pillLabel={typeLabel(i18n, listing.type) + ' PACKAGE'} />
            <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <span style={{ font: 'var(--type-section-label)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{i18n.t('listingScreenshotsLabel')}</span>
              {(listing.screenshots || []).length ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  {listing.screenshots.map((src, i) => <img key={i} src={src} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border-hairline)' }} />)}
                </div>
              ) : <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t('listingNoScreenshots')}</span>}
            </div>
          </Panel>

          <Panel variant="base" radius={12} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h2 dir="auto" style={{ margin: 0, font: 'var(--type-display-lg)', fontSize: 22, lineHeight: '28px', color: 'var(--parchment)' }}>{listing.title}</h2>
            <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t('listingCreatorLabel') + ' ' + (seller ? seller.displayName : '—')}</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <EvidenceChip i18n={i18n} listing={listing} />
              <Chip tone="neutral">{i18n.t('listingAsOf', { date: i18n.date(listing.evidenceAsOf) })}</Chip>
            </div>
            {listing.description && <p dir="auto" style={{ margin: 0, font: 'var(--type-body)', fontSize: 15, lineHeight: '26px', color: 'var(--text-primary)' }}>{listing.description}</p>}
          </Panel>

          <FreePreviewPanel i18n={i18n} previewContent={listing.previewContent} />
          <FullContentPanel i18n={i18n} listing={listing} unlocked={unlocked} />
          <WinsLossesPanel i18n={i18n} listing={listing} />
          <RatingsPanel i18n={i18n} listing={listing} ratingsData={ratingsData} isSeller={isSeller} unlocked={unlocked} onRated={() => setReload((r) => r + 1)} />
        </div>
        <div style={{ position: 'sticky', top: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <BuyBox i18n={i18n} listing={listing} isSeller={isSeller} unlocked={unlocked} ratingsData={ratingsData} onBuy={buy} onMessage={message} />
          <SellerCard i18n={i18n} seller={seller} listingId={listing.id} />
        </div>
      </div>
    </div>
  );
}

export function MarketplaceView({ i18n, itemId }) {
  return itemId ? <MarketplaceDetail i18n={i18n} id={itemId} /> : <MarketplaceStorefront i18n={i18n} />;
}
