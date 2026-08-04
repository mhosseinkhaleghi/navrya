import React from 'react';
import { createRoot } from 'react-dom/client';
import { Modal } from '../public/pages/shared/navrya/components/feedback/Modal.jsx';
import { TextField } from '../public/pages/shared/navrya/components/forms/TextField.jsx';
import { Select } from '../public/pages/shared/navrya/components/forms/Select.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { showToast } from './toast.js';
import { currentNavryaCharacter } from './currentCharacter.js';

function fieldLabel(text) {
  return <span style={{ display: 'block', marginBottom: 7, font: 'var(--type-body)', fontSize: 12, color: 'var(--text-primary)' }}>{text}</span>;
}

// Shared publish/edit modal - marketplace-ui.js's openPublishFlow() delegates here when this
// hook is present (see marketplaceAdapter.js). Same generic listing-field contract as before:
// content shaping stays owned by the caller (pattern-registry.js's/strategy-education.js's own
// buildContent(previewCount)), this modal only collects title/description/price/preview depth.
function PublishFlowModal({ i18n, options, onClose }) {
  const existing = options.existingListing || null;
  const [title, setTitle] = React.useState((existing && existing.title) || options.suggestedTitle || '');
  const [description, setDescription] = React.useState((existing && existing.description) || '');
  const [price, setPrice] = React.useState(String((existing && existing.priceAmount) || 0));
  const currencies = (window.TradeJournalCommunityTypes ? window.TradeJournalCommunityTypes.priceCurrencies : ['USD', 'EUR']);
  const [currency, setCurrency] = React.useState((existing && existing.priceCurrency) || 'USD');
  const maxPreview = options.maxPreviewItems == null ? 10 : options.maxPreviewItems;
  const [previewCount, setPreviewCount] = React.useState(String(existing && existing.previewItemCount != null ? existing.previewItemCount : Math.min(2, maxPreview)));
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState(false);

  function submit() {
    const t = title.trim();
    if (!t) return;
    setSubmitting(true); setError(false);
    const content = options.buildContent(Number(previewCount) || 0);
    const payload = {
      type: options.type, sourceId: options.sourceId, title: t, description: description.trim(),
      priceAmount: Number(price) || 0, priceCurrency: currency,
      successRatePercent: options.evidence.successRatePercent, sampleSize: options.evidence.sampleSize,
      evidenceAsOf: options.evidence.evidenceAsOf, previewContent: content.previewContent, fullContent: content.fullContent,
      status: 'published'
    };
    const store = window.TradeJournalCommunityStore;
    const promise = existing ? store.updateListing(existing.id, payload) : store.createListing(payload);
    promise.then((listing) => {
      showToast(i18n.t('publishSuccess'), 'success');
      onClose();
      if (options.onPublished) options.onPublished(listing);
    }).catch(() => { setSubmitting(false); setError(true); });
  }

  return (
    <Modal
      title={existing ? i18n.t('editListingTitle') : i18n.t('publishListingTitle')} icon="upload" onClose={onClose}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{i18n.t('cancel')}</Button>
          <Button variant="primary" icon="upload" onClick={submit} disabled={submitting} style={{ marginInlineStart: 'auto' }}>
            {existing ? i18n.t('save') : i18n.t('publishSubmit')}
          </Button>
        </>
      )}
    >
      <TextField label={i18n.t('publishTitleLabel')} value={title} onChange={setTitle} />
      <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {fieldLabel(i18n.t('publishDescriptionLabel'))}
        <textarea
          value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
          style={{ resize: 'vertical', borderRadius: 8, padding: '10px 12px', background: 'rgba(3,8,7,.55)', border: '1px solid var(--border-gold)', color: 'var(--text-primary)', font: 'var(--type-body)', outline: 'none' }}
        />
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <TextField label={i18n.t('publishPriceLabel')} type="number" value={price} onChange={setPrice} />
        <div>{fieldLabel(i18n.t('publishCurrencyLabel'))}<Select value={currency} options={currencies} onChange={setCurrency} /></div>
      </div>
      <TextField label={i18n.t('publishPreviewCountLabel')} type="number" value={previewCount} onChange={setPreviewCount} />
      {error && <span style={{ font: 'var(--type-caption)', color: 'var(--danger)' }}>FAILED</span>}
    </Modal>
  );
}

export function openPublishFlow(options) {
  const i18n = window.TradeJournalCommunityI18n;
  const container = document.createElement('div');
  container.dataset.character = currentNavryaCharacter();
  document.body.append(container);
  const root = createRoot(container);
  function close() { root.unmount(); container.remove(); }
  root.render(<PublishFlowModal i18n={i18n} options={options} onClose={close} />);
}
