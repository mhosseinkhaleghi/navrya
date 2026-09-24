import React from 'react';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { Chip } from '../public/pages/shared/navrya/components/forms/Chip.jsx';
import { describeAiError } from './analysisProfileAiErrors.js';
import { trt } from './analysisProfileTrainingCopy.js';

// The Analysis Profile area's AI connectivity surface (ARCHITECTURE.md §7.25): a small, non-secret readiness line
// and the ONE error notice every AI surface (Suggestions, Memory learning, Preview, Chat, Knowledge teaching)
// renders. Both are presentation only - the request behaviour lives in analysis-profile-ai.js and the failure
// classification in analysisProfileAiErrors.js.

function aiClient() { return window.TradeJournalAnalysisProfileAI; }

// How the next billed call will be served: the trader's own key (never wallet-billed) or platform-managed (billed per
// token), plus the provider/model when the trader's own key makes them known locally. It shows whether a key is
// set - never the key, never a prefix or suffix of it - and re-reads whenever the AI settings change.
export function AiReadinessBar({ lang }) {
  const [state, setState] = React.useState(() => {
    const client = aiClient();
    return client && typeof client.readiness === 'function' ? client.readiness() : null;
  });
  React.useEffect(() => {
    function refresh() {
      const client = aiClient();
      if (client && typeof client.readiness === 'function') setState(client.readiness());
    }
    refresh();
    window.addEventListener('tradejournal:ai-settings-changed', refresh);
    return () => window.removeEventListener('tradejournal:ai-settings-changed', refresh);
  }, []);
  if (!state) return null;
  const byok = state.mode === 'byok';
  return (
    <div role="status" aria-label={trt(lang, 'aiReadyLabel')} data-ai-mode={state.mode} style={{
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '9px 14px', borderRadius: 10,
      border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.4)'
    }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11, letterSpacing: '.08em', color: 'var(--text-dim)' }}>
        <span style={{ color: 'var(--char-accent)', display: 'inline-flex' }}><Icon name={byok ? 'key' : 'shield-check'} size={14} /></span>
        {trt(lang, 'aiReadyLabel')}
      </span>
      <Chip tone={byok ? 'gold' : 'accent'} dot>{trt(lang, byok ? 'aiReadyByok' : 'aiReadyPlatform')}</Chip>
      {byok ? (
        <span dir="ltr" style={{ fontSize: 12, color: 'var(--text-primary)' }}>{[state.providerLabel || state.provider, state.model].filter(Boolean).join(' · ')}</span>
      ) : (
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{trt(lang, 'aiReadyProviderPlatform')}</span>
      )}
      <span style={{ marginInlineStart: 'auto', fontSize: 11, color: 'var(--text-dim)' }}>{trt(lang, byok ? 'aiReadyByokHint' : 'aiReadyPlatformHint')}</span>
    </div>
  );
}

// `error` is the small { code, status? } shape analysisProfileAiErrors.toAiError() produces. Renders nothing without one.
// With `onRetry` it offers a Retry that re-issues the SAME request (the caller's own function - inputs are the ones
// the trader already entered), disabled while `busy` so a slow retry cannot be doubled.
export function AiErrorNotice({ lang, error, onRetry, busy }) {
  if (!error) return null;
  const info = describeAiError(lang, error);
  return (
    <div role="alert" data-ai-error-kind={info.kind} style={{
      display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 10,
      border: '1px solid rgba(255,56,48,.4)', background: 'rgba(255,56,48,.07)'
    }}>
      <span style={{ color: 'var(--danger)', display: 'inline-flex', marginTop: 1 }}><Icon name="triangle-alert" size={16} /></span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: '1 1 220px' }}>
        <span dir="auto" style={{ fontSize: 12.5, lineHeight: 1.8, color: 'var(--text-primary)' }}>{info.text}</span>
        {info.detail && <span dir="ltr" style={{ fontSize: 10.5, color: 'var(--text-dim)', textAlign: 'start' }}>{info.detail}</span>}
      </span>
      {onRetry && (
        <Button variant="secondary" size="sm" icon="refresh-cw" loading={Boolean(busy)} disabled={Boolean(busy)} onClick={onRetry}>{trt(lang, 'retryBtn')}</Button>
      )}
    </div>
  );
}
