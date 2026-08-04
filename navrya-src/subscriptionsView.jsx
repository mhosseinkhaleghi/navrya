import React from 'react';
import { createRoot } from 'react-dom/client';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Chip } from '../public/pages/shared/navrya/components/forms/Chip.jsx';
import { currentNavryaCharacter } from './currentCharacter.js';

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
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ direction: rtl ? 'rtl' : 'ltr', display: 'flex', flexDirection: 'column', gap: 10 }}>
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
