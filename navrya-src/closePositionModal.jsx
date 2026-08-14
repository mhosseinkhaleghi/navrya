import React from 'react';
import { createRoot } from 'react-dom/client';
import { Modal } from '../public/pages/shared/navrya/components/feedback/Modal.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { currentNavryaCharacter } from './currentCharacter.js';

// Redesign of trade-ui.js's closeTrade() modal against the NAVRYA dialog system (Modal.jsx),
// same real close-out math and save path - trade-ui.js's own closeTrade(id, callback) is
// unchanged and still the one place that owns it; this only replaces the dialog it opens.

// Exact port of closeTrade()'s own pnl/pnlPercent/outcome formula (trade-ui.js) - kept in one
// place here so the live preview shown while typing can never drift from what actually gets
// saved on submit.
function computeClose(trade, exit) {
  if (exit === null || !Number.isFinite(exit)) return null;
  const quantity = trade.positionSize && trade.entryPrice ? trade.positionSize / trade.entryPrice : null;
  const gross = quantity !== null ? (exit - trade.entryPrice) * quantity * (trade.direction === 'long' ? 1 : -1) : null;
  if (gross === null) return null;
  const pnl = gross - (trade.commission.totalCommission || 0);
  const base = trade.marginRequired || trade.positionSize;
  const pnlPercent = base ? (pnl / base) * 100 : null;
  const outcome = Math.abs(pnl) < 0.000001 ? 'breakeven' : pnl > 0 ? 'win' : 'loss';
  return { pnl, pnlPercent, outcome };
}

function ClosePositionModal({ trade, onClose, onSave }) {
  const i18n = window.TradeJournalTradeI18n;
  const tradeStore = window.TradeJournalTradeStore;
  const t = i18n.t;
  const rtl = i18n.direction() === 'rtl';
  const [exitInput, setExitInput] = React.useState(trade.exitPrice != null ? String(trade.exitPrice) : '');
  const [touched, setTouched] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const exit = exitInput.trim() === '' ? null : Number(exitInput);
  const valid = exit !== null && Number.isFinite(exit) && exit > 0;
  const preview = valid ? computeClose(trade, exit) : null;
  const outcomeColor = !preview ? 'var(--text-muted)' : preview.outcome === 'win' ? 'var(--success)' : preview.outcome === 'loss' ? 'var(--danger)' : 'var(--text-muted)';

  function submit() {
    if (!valid) { setTouched(true); return; }
    setSaving(true);
    const result = computeClose(trade, exit);
    const next = { ...trade };
    next.exitPrice = exit;
    next.pnl = result.pnl;
    next.pnlPercent = result.pnlPercent;
    next.outcome = result.outcome;
    next.status = 'closed';
    next.closedAt = tradeStore.now();
    const saved = tradeStore.save(next);
    if (window.TradeJournalMentalHealthContinuous) window.TradeJournalMentalHealthContinuous.onTradeClosed(saved);
    onClose();
    if (onSave) onSave(saved);
  }

  return (
    <Modal
      open title={t('closeTradeTitle')} icon="execution" onClose={onClose} width={460}
      eyebrow={{ left: t(trade.direction), right: t('entryPrice') + ' ' + (trade.entryPrice ?? '—') }}
      footer={(
        <>
          <span style={{ flex: 1 }} />
          <Button variant="secondary" onClick={onClose}>{t('cancel')}</Button>
          <Button variant="primary" icon="calculator" disabled={!valid || saving} onClick={submit}>{t('closeAndCalculate')}</Button>
        </>
      )}
    >
      <div dir={rtl ? 'rtl' : 'ltr'} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ font: 'var(--type-body)', fontSize: 12, color: 'var(--text-primary)' }}>{t('exitPrice')}</span>
        {/* Forced dir="ltr"/physical offsets throughout - a price+unit pair reads left-to-right
            even on an RTL page, same convention every other numeric field in this app follows. */}
        <div dir="ltr" style={{ position: 'relative' }}>
          <input
            type="number" inputMode="decimal" autoFocus value={exitInput} dir="ltr"
            onChange={(e) => setExitInput(e.target.value)}
            onBlur={() => setTouched(true)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            style={{
              height: 44, boxSizing: 'border-box', width: '100%',
              paddingLeft: 14, paddingRight: 52,
              borderRadius: 8, background: 'rgba(3,8,7,.55)', color: 'var(--text-primary)', font: 'var(--type-body)',
              border: '1px solid ' + (touched && !valid ? 'var(--danger)' : 'var(--border-gold)'), outline: 'none'
            }}
          />
          <span style={{
            position: 'absolute', right: 14, top: 0, height: 44, display: 'flex', alignItems: 'center',
            font: 'var(--type-caption)', letterSpacing: '.06em', color: 'var(--text-muted)', pointerEvents: 'none'
          }}>USD</span>
        </div>
        {touched && !valid && (
          <span style={{ font: 'var(--type-caption)', color: 'var(--danger)' }}>{t('invalidExit')}</span>
        )}
      </div>
      {preview && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.45)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
            <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('pnl')}</span>
            <span className="navrya-tabular" dir="ltr" style={{ font: '600 20px/24px var(--font-num)', color: outcomeColor }}>
              {(preview.pnl >= 0 ? '+' : '') + i18n.money(preview.pnl)}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
            <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('outcome')}</span>
            <span className="navrya-tabular" dir="ltr" style={{ font: 'var(--type-username)', color: outcomeColor }}>
              {t(preview.outcome === 'breakeven' ? 'breakevenOutcome' : preview.outcome) + (preview.pnlPercent !== null ? ' · ' + (preview.pnlPercent >= 0 ? '+' : '') + preview.pnlPercent.toFixed(2) + '%' : '')}
            </span>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function openClosePosition(id, callback) {
  const tradeStore = window.TradeJournalTradeStore;
  const i18n = window.TradeJournalTradeI18n;
  if (!tradeStore || !i18n) return;
  const trade = tradeStore.find(id);
  if (!trade) return;
  const container = document.createElement('div');
  container.dataset.character = currentNavryaCharacter();
  document.body.append(container);
  const root = createRoot(container);
  function close() { root.unmount(); container.remove(); }
  root.render(<ClosePositionModal trade={trade} onClose={close} onSave={callback} />);
  return close;
}
