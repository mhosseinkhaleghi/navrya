import React from 'react';
import { createRoot } from 'react-dom/client';
import { Modal } from '../public/pages/shared/navrya/components/feedback/Modal.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { showToast } from './toast.js';
import { currentNavryaCharacter } from './currentCharacter.js';

// One shared report-abuse modal for Community's feed posts, comments, marketplace listings and
// messages - store.report() is the same real endpoint every one of those call sites already used.
function ReportModal({ i18n, targetType, targetId, onClose }) {
  const [reason, setReason] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  function submit() {
    const value = reason.trim();
    if (!value) return;
    setSubmitting(true);
    window.TradeJournalCommunityStore.report(targetType, targetId, value)
      .then(() => { showToast(i18n.t('reportSubmitted'), 'success'); onClose(); })
      .catch((error) => { setSubmitting(false); showToast((error && error.code) || 'FAILED', 'danger'); });
  }

  return (
    <Modal
      title={i18n.t('reportAction')} icon="flag" onClose={onClose}
      footer={<Button variant="primary" icon="flag" onClick={submit} disabled={submitting} style={{ marginInlineStart: 'auto' }}>{i18n.t('reportSubmit')}</Button>}
    >
      <textarea
        value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder={i18n.t('reportReasonPlaceholder')}
        style={{ resize: 'vertical', borderRadius: 8, padding: '10px 12px', background: 'rgba(3,8,7,.55)', border: '1px solid var(--border-gold)', color: 'var(--text-primary)', font: 'var(--type-body)', outline: 'none' }}
      />
    </Modal>
  );
}

export function openReportFlow(targetType, targetId, i18n) {
  const container = document.createElement('div');
  container.dataset.character = currentNavryaCharacter();
  document.body.append(container);
  const root = createRoot(container);
  function close() { root.unmount(); container.remove(); }
  root.render(<ReportModal i18n={i18n} targetType={targetType} targetId={targetId} onClose={close} />);
}

export function ReportButton({ targetType, targetId, i18n, style }) {
  return (
    <button
      type="button" onClick={() => openReportFlow(targetType, targetId, i18n)}
      title={i18n.t('reportAction')} aria-label={i18n.t('reportAction')}
      style={{
        width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border-hairline)', background: 'transparent',
        color: 'var(--text-muted)', cursor: 'pointer', display: 'grid', placeItems: 'center', flex: 'none', ...style
      }}
    ><Icon name="flag" size={14} /></button>
  );
}
