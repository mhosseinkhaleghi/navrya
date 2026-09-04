import React from 'react';
import { Modal } from '../public/pages/shared/navrya/components/feedback/Modal.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { TextField } from '../public/pages/shared/navrya/components/forms/TextField.jsx';
import { Chip } from '../public/pages/shared/navrya/components/forms/Chip.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Notice } from '../public/pages/shared/navrya/components/feedback/Notice.jsx';

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

function fmtMicroUsd(microUsd) { return '$' + (microUsd / 1000000).toFixed(2); }

function fmtCountdown(expiresAt, now) {
  const remainingMs = new Date(expiresAt).getTime() - now;
  if (remainingMs <= 0) return null;
  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes + ':' + String(seconds).padStart(2, '0');
}

// A per-poll reason (from checkInvoicePayment's own return shape) that never changes dto.status
// on its own - "insufficient confirmations" or "no matching transfer yet" both stay 'pending'.
// Without surfacing this, clicking Check Now while any of these applies looks like it does
// nothing at all - the exact reported bug.
function reasonKey(reason) {
  return {
    TRANSACTION_NOT_FOUND: 'subInvoiceReasonNotFound',
    TRANSACTION_FAILED: 'subInvoiceReasonFailed',
    NO_MATCHING_TRANSFER: 'subInvoiceReasonNoTransfer',
    CHAIN_MISMATCH: 'subInvoiceReasonChainMismatch',
    INSUFFICIENT_CONFIRMATIONS: 'subInvoiceReasonConfirming',
    TX_HASH_ALREADY_CLAIMED: 'subInvoiceReasonAlreadyClaimed',
    CLAIM_FAILED: 'subInvoiceReasonAlreadyClaimed',
    INVALID_TX_HASH: 'subInvoiceReasonInvalidHash'
  }[reason] || null;
}

// A real transaction hash is always exactly `0x` + 64 hex characters - checked client-side too so
// a mistyped/partial paste gets an immediate, specific hint instead of a round trip to find out.
const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

// Shared by both the standalone modal (storage add-on purchase) and the in-sheet panel (wallet
// top-up / subscription checkout) - one implementation, so the two can never quietly drift apart.
function useCryptoInvoice(invoiceId, onConfirmed) {
  const [dto, setDto] = React.useState(null);
  const [txHash, setTxHash] = React.useState('');
  const [checking, setChecking] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  // The concrete outcome of the LAST check - separate from dto, because a reason (still waiting
  // on confirmations, no transfer found yet, wrong network...) or a request-level failure changes
  // neither dto.status nor anything else the old code looked at, which is exactly why "Check Now"
  // used to look like it did nothing.
  const [outcome, setOutcome] = React.useState(null);

  const load = React.useCallback(() => {
    fetch('/api/sync/wallet/invoices/' + invoiceId).then((r) => r.json())
      .then((data) => { if (data && data.invoiceId) { setDto(data); setTxHash((cur) => cur || data.txHash || ''); } })
      .catch(() => {});
  }, [invoiceId]);
  React.useEffect(load, [load]);

  const check = React.useCallback((manualTxHash) => {
    setChecking(true);
    setOutcome(null);
    fetch('/api/sync/wallet/invoices/' + invoiceId + '/check', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ txHash: manualTxHash || undefined })
    })
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        // A thrown ApiError (missing tx hash, RPC/config trouble) has NO `.invoice` at all - the
        // old code did `setDto(result.invoice)` unconditionally here, which set dto to `undefined`
        // and made the whole panel disappear. Never let that happen again.
        if (!ok || !body.invoice) { setOutcome({ kind: 'error', error: body.error || 'UNKNOWN' }); return; }
        setDto(body.invoice);
        // An overpayment still completes the purchase (never re-priced upward); the excess lands
        // on dto.mismatchCreditedMicroUsd via setDto above, which the confirmed-status render
        // already shows on its own - no separate outcome needed for this case.
        // Both 'confirmed' (including an overpayment's extra credit) and 'mismatched_credited'
        // are already fully reflected in dto itself (status + mismatchCreditedMicroUsd) via
        // setDto above - the render below reads dto directly, so no separate outcome is needed
        // for either.
        if (body.status === 'confirmed' || body.status === 'mismatched_credited') {
          if (onConfirmed) onConfirmed();
          return;
        }
        if (body.reason) setOutcome({ kind: 'reason', reason: body.reason });
      })
      .catch(() => setOutcome({ kind: 'error', error: 'NETWORK_ERROR' }))
      .finally(() => setChecking(false));
  }, [invoiceId, onConfirmed]);

  React.useEffect(() => {
    if (!dto || dto.status !== 'pending') return undefined;
    const id = setInterval(() => check(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [dto && dto.status, check]);

  function copyAddress() {
    if (!dto) return;
    navigator.clipboard.writeText(dto.recipientAddress).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  return { dto, txHash, setTxHash, checking, copied, copyAddress, check, outcome };
}

// The invoice body itself, with no Modal/footer of its own - the checkout sheet renders this as
// its LAST sliding step (paying and then watching the payment land is one continuous flow, not a
// second popup on top) and puts "Check Now" in ITS OWN footer, next to "Close", via the exposed
// imperative handle. CryptoInvoiceModal below is the same content wrapped in its own Modal, still
// used where there is no sheet to slide it into (the storage add-on purchase).
export const CryptoInvoicePanel = React.forwardRef(function CryptoInvoicePanel({ lang, tr, invoiceId, onConfirmed, onStatus }, ref) {
  const { dto, txHash, setTxHash, checking, copied, copyAddress, check, outcome } = useCryptoInvoice(invoiceId, onConfirmed);

  const isTerminal = !!dto && (dto.status === 'confirmed' || dto.status === 'expired' || dto.status === 'failed');
  const canCheck = !!dto && dto.status === 'pending' && (!!dto.txHash || TX_HASH_RE.test(txHash.trim()));

  React.useImperativeHandle(ref, () => ({ checkNow: () => check(txHash) }), [check, txHash]);
  React.useEffect(() => { if (onStatus) onStatus({ checking, canCheck: canCheck && !isTerminal }); }, [checking, canCheck, isTerminal, onStatus]);

  if (!dto) return null;
  return <CryptoInvoiceBody lang={lang} tr={tr} dto={dto} txHash={txHash} setTxHash={setTxHash} copied={copied} copyAddress={copyAddress} outcome={outcome} />;
});

export function CryptoInvoiceModal({ lang, tr, invoiceId, onClose, onConfirmed }) {
  const { dto, txHash, setTxHash, checking, copied, copyAddress, check, outcome } = useCryptoInvoice(invoiceId, onConfirmed);
  if (!dto) return null;
  const isExpired = dto.status === 'expired';
  const canCheck = dto.status === 'pending' && (!!dto.txHash || TX_HASH_RE.test(txHash.trim()));

  return (
    <Modal open title={tr(lang, 'subInvoiceTitle')} icon="wallet" onClose={onClose} width={480}
      footer={(
        <>
          <span style={{ flex: 1 }} />
          <Button variant="secondary" onClick={onClose}>{tr(lang, 'subInvoiceClose')}</Button>
          {dto.status === 'pending' && !isExpired && (
            <Button variant="primary" disabled={!canCheck} loading={checking} onClick={() => check(txHash)}>{tr(lang, 'subInvoiceCheckNow')}</Button>
          )}
        </>
      )}
    >
      <CryptoInvoiceBody lang={lang} tr={tr} dto={dto} txHash={txHash} setTxHash={setTxHash} copied={copied} copyAddress={copyAddress} outcome={outcome} />
    </Modal>
  );
}

// The content both the standalone Modal and the in-sheet panel render identically - status chip,
// QR, network/amount facts, recipient address, mismatch note, tx-hash field and the last check's
// outcome. Neither wrapper renders its own "Check Now" here; each puts that button in its own
// footer instead (Modal's footer, or the checkout sheet's footer via the imperative handle).
function CryptoInvoiceBody({ lang, tr, dto, txHash, setTxHash, copied, copyAddress, outcome }) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);

  const countdown = dto.status === 'pending' ? fmtCountdown(dto.expiresAt, now) : null;
  const isExpired = dto.status === 'expired' || (dto.status === 'pending' && countdown === null);
  const isMismatchCredited = dto.status === 'failed' && dto.mismatchCreditedMicroUsd != null;
  const statusTone = dto.status === 'confirmed' ? 'accent' : isMismatchCredited ? 'accent' : isExpired || dto.status === 'failed' ? 'danger' : 'neutral';
  const statusLabel = dto.status === 'confirmed' ? tr(lang, 'subInvoiceStatusConfirmed')
    : isMismatchCredited ? tr(lang, 'subInvoiceMismatchCredited', { amount: fmtMicroUsd(dto.mismatchCreditedMicroUsd) })
      : isExpired ? tr(lang, 'subInvoiceStatusExpired') : tr(lang, 'subInvoiceStatusPending');
  const label = { fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', color: 'var(--text-muted)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Chip tone={statusTone} dot>{statusLabel}</Chip>

      {!isMismatchCredited && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 10, borderRadius: 10, border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.45)' }}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- server-generated QR, no descriptive alt beyond its function */}
          <img src={dto.qrCodeDataUri} width={168} height={168} alt="QR" />
        </div>
      )}

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

      {!isMismatchCredited && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={label}>{tr(lang, 'subInvoiceRecipient')}</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span dir="ltr" style={{ flex: 1, fontFamily: 'monospace', fontSize: 11.5, color: 'var(--text-primary)', wordBreak: 'break-all', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.55)' }}>{dto.recipientAddress}</span>
            <Button variant="secondary" size="sm" icon="copy" onClick={copyAddress}>{copied ? tr(lang, 'subInvoiceCopied') : tr(lang, 'subInvoiceCopy')}</Button>
          </div>
        </div>
      )}

      {dto.status === 'pending' && (
        <>
          <div dir="ltr" style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{tr(lang, 'subInvoiceExpiresIn', { time: countdown })}</div>
          <TextField
            label={tr(lang, 'subInvoiceTxHashLabel')} value={txHash} onChange={setTxHash}
            placeholder={tr(lang, 'subInvoiceTxHashPlaceholder')} dir="ltr"
            hint={
              !txHash.trim() ? tr(lang, 'subInvoiceTxHashRequired')
                : !TX_HASH_RE.test(txHash.trim()) ? tr(lang, 'subInvoiceReasonInvalidHash')
                  : undefined
            }
          />
        </>
      )}

      {/* The one piece of feedback this screen was entirely missing - what the last click on
          Check Now actually found, good or bad, instead of silently changing nothing. */}
      {outcome && outcome.kind === 'error' && (
        <Notice tone="danger" icon="status">{tr(lang, 'subInvoiceCheckError', { error: outcome.error })}</Notice>
      )}
      {outcome && outcome.kind === 'reason' && reasonKey(outcome.reason) && (
        <Notice tone={outcome.reason === 'CHAIN_MISMATCH' || outcome.reason === 'TX_HASH_ALREADY_CLAIMED' || outcome.reason === 'CLAIM_FAILED' || outcome.reason === 'TRANSACTION_FAILED' ? 'danger' : 'accent'} icon="status">
          {tr(lang, reasonKey(outcome.reason))}
        </Notice>
      )}
      {/* Durable across a reload, unlike `outcome` (which only lives for the check that just ran)
          - dto.mismatchCreditedMicroUsd on a CONFIRMED invoice always means "the purchase went
          through and this much extra was credited on top", whatever check produced it. */}
      {dto.status === 'confirmed' && dto.mismatchCreditedMicroUsd > 0 && (
        <Notice tone="accent" icon="status">{tr(lang, 'subInvoiceOverpaidCredited', { amount: fmtMicroUsd(dto.mismatchCreditedMicroUsd) })}</Notice>
      )}

      {!isMismatchCredited && dto.status !== 'confirmed' && (
        <p style={{ margin: 0, fontSize: 11.5, color: 'var(--text-dim)', lineHeight: 1.6, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <Icon name="status" size={13} style={{ flex: 'none', marginTop: 2 }} />
          {tr(lang, 'subInvoiceHint')}
        </p>
      )}
      {dto.status === 'pending' && (
        <p style={{ margin: 0, fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.6, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <Icon name="status" size={13} style={{ flex: 'none', marginTop: 2, color: 'var(--gold-warm)' }} />
          {tr(lang, 'subInvoiceMismatchNote')}
        </p>
      )}
    </div>
  );
}
