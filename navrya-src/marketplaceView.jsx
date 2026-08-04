import React from 'react';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Chip } from '../public/pages/shared/navrya/components/forms/Chip.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { Select } from '../public/pages/shared/navrya/components/forms/Select.jsx';
import { ReportButton } from './reportFlow.jsx';

function statLine(hasData, listing, i18n) {
  if (!hasData) return <Chip tone="neutral">{i18n.t('listingInsufficientData')}</Chip>;
  const failure = Math.round((100 - listing.successRatePercent) * 10) / 10;
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <Chip tone="accent">{i18n.number(listing.successRatePercent) + '% · ' + i18n.number(listing.sampleSize) + ' ' + i18n.t('listingSampleSize')}</Chip>
      <Chip tone="neutral">{i18n.t('listingFailureRate') + ': ' + i18n.number(failure) + '%'}</Chip>
    </div>
  );
}

function ListingCard({ listing, i18n }) {
  const hasData = listing.sampleSize > 0 && listing.successRatePercent != null;
  return (
    <Panel
      as="button" type="button" variant="base" radius={12}
      onClick={() => { location.hash = '#community/marketplace/' + encodeURIComponent(listing.id); }}
      style={{ textAlign: 'start', cursor: 'pointer', padding: 16, display: 'flex', flexDirection: 'column', gap: 10, width: '100%', font: 'inherit', color: 'inherit' }}
    >
      <strong style={{ font: 'var(--type-body)', color: 'var(--parchment)' }}>{listing.title}</strong>
      {statLine(hasData, listing, i18n)}
      <span className="navrya-tabular" style={{ font: 'var(--type-metric-value)', color: 'var(--char-accent)' }}>{i18n.number(listing.priceAmount) + ' ' + listing.priceCurrency}</span>
    </Panel>
  );
}

export function MarketplaceStorefront({ i18n }) {
  const [filter, setFilter] = React.useState('');
  const [listings, setListings] = React.useState(null);
  React.useEffect(() => {
    setListings(null);
    window.TradeJournalCommunityStore.listListings(filter ? { type: filter } : {}).then(setListings);
  }, [filter]);
  const filters = [['', i18n.t('marketplaceFilterAll')], ['pattern', i18n.t('marketplaceFilterPatterns')], ['strategy', i18n.t('marketplaceFilterStrategies')]];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h2 style={{ margin: 0, font: 'var(--type-display-md)', fontSize: 20, color: 'var(--parchment)' }}>{i18n.t('marketplaceTitle')}</h2>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {filters.map(([value, label]) => (
          <Button key={value || 'all'} variant={value === filter ? 'primary' : 'ghost'} size="sm" onClick={() => setFilter(value)}>{label}</Button>
        ))}
      </div>
      {listings === null ? null : !listings.length ? (
        <Panel variant="base" radius={12} style={{ padding: 16 }}><span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t('marketplaceEmpty')}</span></Panel>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {listings.map((listing) => <ListingCard key={listing.id} listing={listing} i18n={i18n} />)}
        </div>
      )}
    </div>
  );
}

function RatingsSection({ i18n, listing, ratings, isSeller, unlocked, onRated }) {
  const [ratingValue, setRatingValue] = React.useState('5');
  const [reviewText, setReviewText] = React.useState('');
  function submit() {
    window.TradeJournalCommunityStore.rateListing(listing.id, Number(ratingValue), reviewText.trim()).then(onRated);
  }
  return (
    <Panel variant="base" radius={12} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h3 style={{ margin: 0, font: 'var(--type-body)', fontWeight: 700, color: 'var(--parchment)' }}>{i18n.t('listingRatingsTitle')}</h3>
      {!ratings.length ? (
        <span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t('listingNoRatings')}</span>
      ) : ratings.map((rating, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
          <strong style={{ color: 'var(--char-accent)' }}>{rating.rating + '/5'}</strong>
          <span style={{ font: 'var(--type-body)', color: 'var(--text-primary)' }}>{rating.reviewText || ''}</span>
        </div>
      ))}
      {!isSeller && unlocked && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Select value={ratingValue} options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: n + '/5' }))} onChange={setRatingValue} width={110} />
          <input
            type="text" value={reviewText} onChange={(e) => setReviewText(e.target.value)}
            style={{ flex: 1, minWidth: 140, height: 44, boxSizing: 'border-box', padding: '0 14px', borderRadius: 8, background: 'rgba(3,8,7,.55)', border: '1px solid var(--border-gold)', color: 'var(--text-primary)', font: 'var(--type-body)', outline: 'none' }}
          />
          <Button variant="secondary" icon="star" onClick={submit}>{i18n.t('listingRateAction')}</Button>
        </div>
      )}
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
  const hasData = listing.sampleSize > 0 && listing.successRatePercent != null;
  const rtl = i18n.direction() === 'rtl';

  function buy() { window.TradeJournalCommunityStore.purchaseListing(listing.id).then(() => setReload((r) => r + 1)); }
  function message() { window.TradeJournalCommunityStore.openThread(listing.id).then((thread) => { location.hash = '#community/messages/' + encodeURIComponent(thread.id); }); }

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ direction: rtl ? 'rtl' : 'ltr', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 760 }}>
      <Button variant="ghost" icon={rtl ? 'arrow-right' : 'arrow-left'} onClick={() => { location.hash = '#community/marketplace'; }} style={{ alignSelf: 'flex-start' }}>{i18n.t('back')}</Button>
      <div>
        <h2 style={{ margin: '0 0 4px', font: 'var(--type-display-md)', fontSize: 22, color: 'var(--parchment)' }}>{listing.title}</h2>
        {seller && <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t('listingCreatorLabel') + ' ' + seller.displayName}</span>}
      </div>
      <p style={{ margin: 0, font: 'var(--type-body)', color: 'var(--text-primary)' }}>{listing.description}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {statLine(hasData, listing, i18n)}
        <Chip tone="neutral">{i18n.t('listingAsOf', { date: i18n.date(listing.evidenceAsOf) })}</Chip>
      </div>

      <Panel variant="base" radius={12} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h3 style={{ margin: 0, font: 'var(--type-body)', fontWeight: 700, color: 'var(--parchment)' }}>{i18n.t('listingPreview')}</h3>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', font: 'var(--type-caption)', color: 'var(--text-primary)', overflowX: 'auto' }}>{JSON.stringify(listing.previewContent, null, 2)}</pre>
      </Panel>

      {unlocked ? (
        <Panel variant="base" radius={12} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h3 style={{ margin: 0, font: 'var(--type-body)', fontWeight: 700, color: 'var(--parchment)' }}>{i18n.t('listingFull')}</h3>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', font: 'var(--type-caption)', color: 'var(--text-primary)', overflowX: 'auto' }}>{JSON.stringify(listing.fullContent, null, 2)}</pre>
        </Panel>
      ) : (
        <Notice>{i18n.t('listingLocked')}</Notice>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span className="navrya-tabular" style={{ font: 'var(--type-metric-value)', color: 'var(--char-accent)' }}>{i18n.number(listing.priceAmount) + ' ' + listing.priceCurrency}</span>
        {!isSeller && (unlocked ? (
          <Chip tone="success">{i18n.t('listingBought')}</Chip>
        ) : (
          <Button variant="primary" icon="shopping-cart" onClick={buy}>{i18n.t('listingBuy')}</Button>
        ))}
        {!isSeller && <Button variant="secondary" icon="message-circle" onClick={message}>{i18n.t('listingMessageSeller')}</Button>}
        <ReportButton targetType="listing" targetId={listing.id} i18n={i18n} />
      </div>
      <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t('mockBadge')}</span>

      <RatingsSection i18n={i18n} listing={listing} ratings={ratingsData.ratings} isSeller={isSeller} unlocked={unlocked} onRated={() => setReload((r) => r + 1)} />
    </div>
  );
}

function Notice({ children }) {
  return <div style={{ padding: '12px 14px', borderRadius: 8, background: 'rgba(3,8,7,.45)', border: '1px solid var(--border-hairline)', font: 'var(--type-body)', color: 'var(--text-muted)' }}>{children}</div>;
}

export function MarketplaceView({ i18n, itemId }) {
  return itemId ? <MarketplaceDetail i18n={i18n} id={itemId} /> : <MarketplaceStorefront i18n={i18n} />;
}
