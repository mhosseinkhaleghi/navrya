import React from 'react';
import { Modal } from '../public/pages/shared/navrya/components/feedback/Modal.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { TextField } from '../public/pages/shared/navrya/components/forms/TextField.jsx';
import { Chip } from '../public/pages/shared/navrya/components/forms/Chip.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';

// Real BSC crypto invoice modal (task A.5) - built on the existing Modal shell per its own
// design contract (Modal.prompt.md: neutral --ink-900 surface, accent icon tile, footer actions,
// closes on Escape/scrim-click, respects --navrya-chat-dock-reserved). The browser NEVER marks
// anything paid here - "Check Now" and the 10s auto-poll both just ask the server to re-run its
// own on-chain verification (server/commercial/crypto-invoice-service.mjs); confirmed/expired
// status only ever comes back from that server response.
const POLL_INTERVAL_MS = 10000;

function fmtAtomicAmount(atomicAmount, decimals) {
  const value = BigInt(atomicAmount);
  const divisor = 10n ** BigInt(decimals);
  const whole = value / divisor;
  const fraction = value % divisor;
  if (fraction === 0n) return whole.toString();
  const fractionStr = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
  return whole.toString() + (fractionStr ? '.' + fractionStr : '');
}

function fmtCountdown(expiresAt, now) {
  const remainingMs = new Date(expiresAt).getTime() - now;
  if (remainingMs <= 0) return null;
  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes + ':' + String(seconds).padStart(2, '0');
}

// The invoice body on its own, with its own "check now" action row. Extracted so the checkout
// sheet can show it as its LAST STEP instead of closing itself and opening a second popup on top
// - paying and then watching the payment land is one continuous flow, not two windows.
// CryptoInvoiceModal below is the same panel in a Modal, still used where there is no sheet to
// slide it into (the storage add-on purchase).
export function CryptoInvoicePanel({ lang, tr, invoiceId, onConfirmed }) {
  const [dto, setDto] = React.useState(null);
  const [txHash, setTxHash] = React.useState('');
  const [checking, setChecking] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [now, setNow] = React.useState(() => Date.now());

  const load = React.useCallback(() => {
    fetch('/api/sync/wallet/invoices/' + invoiceId).then((r) => r.json()).then(setDto).catch(() => {});
  }, [invoiceId]);
  React.useEffect(load, [load]);

  const check = React.useCallback((manualTxHash) => {
    setChecking(true);
    fetch('/api/sync/wallet/invoices/' + invoiceId + '/check', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ txHash: manualTxHash || undefined })
    })
      .then((r) => r.json())
      .then((result) => {
        setDto(result.invoice);
        if (result.status === 'confirmed' && onConfirmed) onConfirmed();
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [invoiceId, onConfirmed]);

  React.useEffect(() => {
    if (!dto || dto.status !== 'pending') return undefined;
    const id = setInterval(() => check(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [dto && dto.status, check]);

  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  function copyAddress() {
    if (!dto) return;
    navigator.clipboard.writeText(dto.recipientAddress).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  if (!dto) return null;
  const countdown = dto.status === 'pending' ? fmtCountdown(dto.expiresAt, now) : null;
  const isExpired = dto.status === 'expired' || (dto.status === 'pending' && countdown === null);
  const statusTone = dto.status === 'confirmed' ? 'accent' : isExpired ? 'danger' : 'neutral';
  const statusLabel = dto.status === 'confirmed' ? tr(lang, 'subInvoiceStatusConfirmed')
    : isExpired ? tr(lang, 'subInvoiceStatusExpired') : tr(lang, 'subInvoiceStatusPending');
  const label = { fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', color: 'var(--text-muted)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Chip tone={statusTone} dot>{statusLabel}</Chip>

      <div style={{ display: 'flex', justifyContent: 'center', padding: 10, borderRadius: 10, border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.45)' }}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- server-generated QR, no descriptive alt beyond its function */}
        <img src={dto.qrCodeDataUri} width={168} height={168} alt="QR" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
        <div style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.4)' }}>
          <div style={{ ...label, marginBottom: 3 }}>{tr(lang, 'subInvoiceNetwork')}</div>
          <div dir="ltr" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{dto.chainName} · {dto.assetSymbol}</div>
        </div>
        <div style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.4)' }}>
          <div style={{ ...label, marginBottom: 3 }}>{tr(lang, 'subInvoiceAmount')}</div>
          <div dir="ltr" className="navrya-tabular" style={{ fontSize: 13, fontWeight: 700, color: 'var(--char-accent)' }}>{fmtAtomicAmount(dto.atomicAmount, dto.tokenDecimals)} {dto.assetSymbol}</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <span style={label}>{tr(lang, 'subInvoiceRecipient')}</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span dir="ltr" style={{ flex: 1, fontFamily: 'monospace', fontSize: 11.5, color: 'var(--text-primary)', wordBreak: 'break-all', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.55)' }}>{dto.recipientAddress}</span>
          <Button variant="secondary" size="sm" icon="copy" onClick={copyAddress}>{copied ? tr(lang, 'subInvoiceCopied') : tr(lang, 'subInvoiceCopy')}</Button>
        </div>
      </div>

      {dto.status === 'pending' && (
        <>
          <div dir="ltr" style={{ fontSize: 11.5, color: isExpired ? 'var(--danger)' : 'var(--text-dim)' }}>
            {isExpired ? tr(lang, 'subInvoiceExpired') : tr(lang, 'subInvoiceExpiresIn', { time: countdown })}
          </div>
          <TextField label={tr(lang, 'subInvoiceTxHashLabel')} value={txHash} onChange={setTxHash} placeholder={tr(lang, 'subInvoiceTxHashPlaceholder')} dir="ltr" />
        </>
      )}

      <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-dim)', lineHeight: 1.6, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <Icon name="status" size={13} style={{ flex: 'none', marginTop: 2 }} />
        {tr(lang, 'subInvoiceHint')}
      </p>

      {dto.status === 'pending' && !isExpired && (
        <Button variant="primary" disabled={checking} onClick={() => check(txHash)} style={{ justifyContent: 'center' }}>{tr(lang, 'subInvoiceCheckNow')}</Button>
      )}
    </div>
  );
}

export function CryptoInvoiceModal({ lang, tr, invoiceId, onClose, onConfirmed }) {
  const [dto, setDto] = React.useState(null);
  const [txHash, setTxHash] = React.useState('');
  const [checking, setChecking] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [now, setNow] = React.useState(() => Date.now());

  const load = React.useCallback(() => {
    fetch('/api/sync/wallet/invoices/' + invoiceId).then((r) => r.json()).then(setDto).catch(() => {});
  }, [invoiceId]);
  React.useEffect(load, [load]);

  const check = React.useCallback((manualTxHash) => {
    setChecking(true);
    fetch('/api/sync/wallet/invoices/' + invoiceId + '/check', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ txHash: manualTxHash || undefined })
    })
      .then((r) => r.json())
      .then((result) => {
        setDto(result.invoice);
        if (result.status === 'confirmed' && onConfirmed) onConfirmed();
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [invoiceId, onConfirmed]);

  // Auto-poll while the invoice is genuinely still pending - stops entirely once confirmed/
  // expired/failed, never keeps hammering the verification endpoint after a terminal state.
  React.useEffect(() => {
    if (!dto || dto.status !== 'pending') return undefined;
    const id = setInterval(() => check(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [dto && dto.status, check]);

  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  function copyAddress() {
    if (!dto) return;
    navigator.clipboard.writeText(dto.recipientAddress).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  if (!dto) return null;
  const countdown = dto.status === 'pending' ? fmtCountdown(dto.expiresAt, now) : null;
  const isExpired = dto.status === 'expired' || (dto.status === 'pending' && countdown === null);
  const statusTone = dto.status === 'confirmed' ? 'accent' : isExpired ? 'danger' : 'neutral';
  const statusLabel = dto.status === 'confirmed' ? tr(lang, 'subInvoiceStatusConfirmed')
    : isExpired ? tr(lang, 'subInvoiceStatusExpired') : tr(lang, 'subInvoiceStatusPending');

  return (
    <Modal open title={tr(lang, 'subInvoiceTitle')} icon="wallet" onClose={onClose} width={480}
      footer={(
        <>
          <span style={{ flex: 1 }} />
          <Button variant="secondary" onClick={onClose}>{tr(lang, 'subInvoiceClose')}</Button>
          {dto.status === 'pending' && !isExpired && (
            <Button variant="primary" disabled={checking} onClick={() => check(txHash)}>{tr(lang, 'subInvoiceCheckNow')}</Button>
          )}
        </>
      )}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Chip tone={statusTone} dot>{statusLabel}</Chip>

        <div style={{ display: 'flex', justifyContent: 'center', padding: 12, borderRadius: 10, border: '1px solid var(--border-gold)', background: 'var(--surface-card)' }}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- server-generated QR, no descriptive alt beyond its function */}
          <img src={dto.qrCodeDataUri} width={200} height={200} alt="QR" />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{tr(lang, 'subInvoiceNetwork')}</span>
          <span dir="ltr" style={{ fontSize: 13, color: 'var(--text-primary)' }}>{dto.chainName} · {dto.assetSymbol}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{tr(lang, 'subInvoiceAmount')}</span>
          <span dir="ltr" className="navrya-tabular" style={{ fontSize: 20, fontWeight: 700, color: 'var(--gold-warm)' }}>{fmtAtomicAmount(dto.atomicAmount, dto.tokenDecimals)} {dto.assetSymbol}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{tr(lang, 'subInvoiceRecipient')}</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span dir="ltr" style={{ flex: 1, fontFamily: 'monospace', fontSize: 12, color: 'var(--text-primary)', wordBreak: 'break-all', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.55)' }}>{dto.recipientAddress}</span>
            <Button variant="secondary" size="sm" icon="copy" onClick={copyAddress}>{copied ? tr(lang, 'subInvoiceCopied') : tr(lang, 'subInvoiceCopy')}</Button>
          </div>
        </div>

        {dto.status === 'pending' && (
          <>
            <div dir="ltr" style={{ fontSize: 12, color: isExpired ? 'var(--danger)' : 'var(--text-dim)' }}>
              {isExpired ? tr(lang, 'subInvoiceExpired') : tr(lang, 'subInvoiceExpiresIn', { time: countdown })}
            </div>
            <TextField label={tr(lang, 'subInvoiceTxHashLabel')} value={txHash} onChange={setTxHash} placeholder={tr(lang, 'subInvoiceTxHashPlaceholder')} dir="ltr" />
          </>
        )}

        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <Icon name="status" size={14} style={{ flex: 'none', marginTop: 2 }} />
          {tr(lang, 'subInvoiceHint')}
        </p>
      </div>
    </Modal>
  );
}
