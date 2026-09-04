import React from 'react';
import { createRoot } from 'react-dom/client';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Chip } from '../public/pages/shared/navrya/components/forms/Chip.jsx';
import { currentNavryaCharacter } from './currentCharacter.js';

// Commercial System Slice 1 - the real AI Wallet balance (server/community/routes.wallet.mjs),
// shown here rather than added to Settings' AiPanelBuilderSection because THIS is the screen the
// app already treats as "billing-adjacent" (see this file's own header comment on why Settings
// deliberately does not rebuild billing). No self-serve top-up in this slice (no payment
// processor yet - see the Slice 1 plan's "explicitly out of scope" note), so this is read-only:
// balance only ever changes via the signup promo grant, Admin credit/debit, or AI settlement.
function WalletBalanceSection({ i18n }) {
  const [wallet, setWallet] = React.useState(null);
  const [error, setError] = React.useState(false);
  React.useEffect(() => {
    fetch('/api/sync/wallet')
      .then((response) => { if (!response.ok) throw new Error('WALLET_FETCH_FAILED'); return response.json(); })
      .then(setWallet)
      .catch(() => setError(true));
  }, []);
  if (error || !wallet) return null;
  const fmt = (microUsd) => '$' + (microUsd / 1000000).toFixed(2);
  return (
    <Panel variant="base" radius={12} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{i18n.t('aiWalletTitle') !== 'aiWalletTitle' ? i18n.t('aiWalletTitle') : 'AI Wallet'}</span>
      <strong style={{ font: 'var(--type-heading)', color: 'var(--parchment)' }}>{fmt(wallet.totalBalanceMicroUsd)}</strong>
      <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>
        {(i18n.t('aiWalletBreakdown') !== 'aiWalletBreakdown' ? i18n.t('aiWalletBreakdown') : 'Promo {promo} · Paid {paid}')
          .replace('{promo}', fmt(wallet.promoBalanceMicroUsd)).replace('{paid}', fmt(wallet.paidBalanceMicroUsd))}
      </span>
    </Panel>
  );
}

function fmtBytesGb(bytes) { return (bytes / 1073741824).toFixed(bytes % 1073741824 === 0 ? 0 : 1) + ' GB'; }
function fmtUsd(microUsd) { return '$' + (microUsd / 1000000).toFixed(2); }
function tOr(i18n, key, fallback) { const value = i18n.t(key); return value === key ? fallback : value; }

// Commercial System Slice 2 - the real Plan/Subscription surface (spec section 21/22/23). Same
// self-fetching, i18n-fallback pattern as WalletBalanceSection above. Upgrading never unlocks the
// new plan immediately (spec section 22) - it only creates a pending transaction; an admin must
// confirm it (this slice has no real payment gateway) before the Entitlement Resolver picks up
// the new plan on its next read.
function PlanSection({ i18n }) {
  const [data, setData] = React.useState(null);
  const [pendingNote, setPendingNote] = React.useState('');
  const rtl = i18n.direction() === 'rtl';

  function reload() {
    fetch('/api/sync/subscriptions').then((response) => response.json()).then(setData).catch(() => setData({ plan: 'free', subscription: null }));
  }
  React.useEffect(reload, []);

  function requestUpgrade(planId) {
    fetch('/api/sync/subscriptions/upgrade-request', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planId })
    })
      .then((response) => response.json())
      .then(() => setPendingNote(tOr(i18n, 'planUpgradePending', 'Upgrade requested - this is a manual/test transaction pending Admin confirmation.')))
      .catch(() => setPendingNote(tOr(i18n, 'planUpgradeFailed', 'Could not submit the upgrade request.')));
  }
  function cancelSubscription(id) {
    fetch('/api/sync/subscriptions/' + id + '/cancel', { method: 'POST' }).then(reload);
  }
  function reactivateSubscription(id) {
    fetch('/api/sync/subscriptions/' + id + '/reactivate', { method: 'POST' }).then(reload);
  }

  if (!data) return null;
  const planLabel = data.plan.charAt(0).toUpperCase() + data.plan.slice(1);
  const upgradeTargets = data.plan === 'free' ? ['plus', 'personalized'] : data.plan === 'plus' ? ['personalized'] : [];

  return (
    <Panel className="navrya-subscription-plan" variant="base" radius={12} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{tOr(i18n, 'planSectionTitle', 'Plan')}</span>
          <strong style={{ font: 'var(--type-heading)', color: 'var(--parchment)' }}>{planLabel}</strong>
        </div>
        {data.subscription && (
          <div dir={rtl ? 'rtl' : 'ltr'} style={{ font: 'var(--type-caption)', color: 'var(--text-muted)', textAlign: rtl ? 'left' : 'right' }}>
            <div>{fmtUsd(data.subscription.priceAmountMicroUsd)} / {tOr(i18n, 'perMonth', 'mo')}</div>
            <div>
              {data.subscription.cancelAtPeriodEnd
                ? tOr(i18n, 'planCancelsOn', 'Cancels {date}').replace('{date}', i18n.date(data.subscription.currentPeriodEnd))
                : tOr(i18n, 'planRenewsOn', 'Renews {date}').replace('{date}', i18n.date(data.subscription.currentPeriodEnd))}
            </div>
          </div>
        )}
      </div>
      {data.subscription && (
        <div className="navrya-subscription-actions" style={{ display: 'flex', gap: 8 }}>
          {data.subscription.cancelAtPeriodEnd
            ? <button type="button" onClick={() => reactivateSubscription(data.subscription.id)} style={{ height: 34, padding: '0 12px', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--divider-gold)', background: 'transparent', color: 'var(--text-muted)' }}>{tOr(i18n, 'planReactivate', 'Reactivate')}</button>
            : <button type="button" onClick={() => cancelSubscription(data.subscription.id)} style={{ height: 34, padding: '0 12px', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--divider-gold)', background: 'transparent', color: 'var(--text-muted)' }}>{tOr(i18n, 'planCancel', 'Cancel at period end')}</button>}
        </div>
      )}
      {!!upgradeTargets.length && (
        <div className="navrya-subscription-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {upgradeTargets.map((planId) => (
            <button key={planId} type="button" onClick={() => requestUpgrade(planId)} style={{ height: 34, padding: '0 14px', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--char-accent)', background: 'var(--char-active-surface)', color: 'var(--text-primary)' }}>
              {tOr(i18n, 'planUpgradeTo', 'Upgrade to {plan}').replace('{plan}', planId.charAt(0).toUpperCase() + planId.slice(1))}
            </button>
          ))}
        </div>
      )}
      {!!pendingNote && <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{pendingNote}</span>}
    </Panel>
  );
}

// Commercial System Slice 2 - Storage usage/quota/entitlements (spec section 21). usedBytes/
// quotaBytes always come from the server-authoritative endpoint (server/community/
// routes.storage.mjs) - never computed client-side. Purchase requests are pending-only, same
// manual/test caveat as PlanSection above.
function StorageSection({ i18n }) {
  const [storage, setStorage] = React.useState(null);
  const [products, setProducts] = React.useState([]);
  const [pendingNote, setPendingNote] = React.useState('');

  function reload() {
    fetch('/api/sync/storage').then((response) => response.json()).then(setStorage).catch(() => {});
    fetch('/api/sync/storage/products').then((response) => response.json()).then((data) => setProducts(data.products || [])).catch(() => {});
  }
  React.useEffect(reload, []);

  function requestPurchase(productId) {
    fetch('/api/sync/storage/purchase-request', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId })
    })
      .then((response) => response.json())
      .then(() => setPendingNote(tOr(i18n, 'storagePurchasePending', 'Purchase requested - this is a manual/test transaction pending Admin confirmation.')))
      .catch(() => setPendingNote(tOr(i18n, 'storagePurchaseFailed', 'Could not submit the purchase request.')));
  }

  if (!storage) return null;
  return (
    <Panel className="navrya-subscription-storage" variant="base" radius={12} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{tOr(i18n, 'storageSectionTitle', 'Storage')}</span>
      <strong style={{ font: 'var(--type-heading)', color: 'var(--parchment)' }}>{fmtBytesGb(storage.usedBytes)} / {fmtBytesGb(storage.quotaBytes)}</strong>
      {!!(storage.entitlements && storage.entitlements.length) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {storage.entitlements.map((entitlement) => (
            <span key={entitlement.id} style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>
              {fmtBytesGb(entitlement.capacityBytesSnapshot)} — {tOr(i18n, 'storageExpires', 'Expires {date}').replace('{date}', i18n.date(entitlement.expiresAt))}
            </span>
          ))}
        </div>
      )}
      {!!products.length && (
        <div className="navrya-subscription-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {products.map((product) => (
            <button key={product.id} type="button" onClick={() => requestPurchase(product.id)} style={{ height: 34, padding: '0 12px', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--divider-gold)', background: 'transparent', color: 'var(--text-muted)' }}>
              {product.name} — {fmtUsd(product.priceAmountMicroUsd)}
            </button>
          ))}
        </div>
      )}
      {!!pendingNote && <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{pendingNote}</span>}
    </Panel>
  );
}

// account-profile-ui.js's subscriptionsTab() delegates here when this hook is present (see
// account-profile-ui.js's renderPage()) - same store.getSubscriptions() call, only the DOM
// building changes. Real subscriptions only; the "mock" badge is the same disclosure the
// legacy tab already showed (community-store.js's purchase flow is a local mock, not billing).
function SubscriptionsView({ i18n }) {
  const [subs, setSubs] = React.useState(null);
  React.useEffect(() => {
    const store = window.TradeJournalAccountProfileStore;
    if (store) store.getSubscriptions().then(setSubs).catch(() => setSubs([]));
  }, []);
  const rtl = i18n.direction() === 'rtl';
  return (
    <div className="navrya-subscriptions-view" dir={rtl ? 'rtl' : 'ltr'} style={{ direction: rtl ? 'rtl' : 'ltr', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <PlanSection i18n={i18n} />
      <WalletBalanceSection i18n={i18n} />
      <StorageSection i18n={i18n} />
      {subs === null ? null : !subs.length ? (
        <Panel variant="base" radius={12} style={{ padding: 16 }}>
          <span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t('subscriptionsEmpty')}</span>
        </Panel>
      ) : subs.map((sub) => (
        <Panel key={sub.id || sub.purchasedAt} variant="base" radius={12} style={{ padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <strong style={{ font: 'var(--type-body)', color: 'var(--parchment)' }}>{sub.listing.title}</strong>
            <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t('purchasedOn', { date: i18n.date(sub.purchasedAt) })}</span>
          </div>
          <Chip tone="neutral">{i18n.t('mockBadge')}</Chip>
        </Panel>
      ))}
    </div>
  );
}

export function renderSubscriptions() {
  const i18n = window.TradeJournalAccountProfileI18n;
  const container = document.createElement('div');
  container.dataset.character = currentNavryaCharacter();
  createRoot(container).render(<SubscriptionsView i18n={i18n} />);
  return container;
}
