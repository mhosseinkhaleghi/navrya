import React from 'react';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { normalizeUsageRows, rowsForEngine, rowForModel, engineTotal, allEnginesTotal, fmtWalletUsd } from './aiWalletUsage.js';

// The customer-facing AI charge views. They render ONLY what the server actually debited from the customer's wallet
// (walletDebitMicroUsd, per exact provider/model) plus call/token counts - never a provider cost, a provider price or
// a markup, and they never compute a price in the browser. Split out of aiAssistantView.jsx so the scoping rules can
// be rendered and checked on their own:
//   - EngineCardCharges / EngineChargesList are ENGINE-CONTEXT views: they only ever look at the given engine's rows
//     (exact provider match), so an OpenAI view can never show a Gemini charge and vice versa;
//   - a model-specific figure is the exact (provider, model) row, never "the first row of this provider";
//   - a provider total is an explicit aggregate (engineTotal) and is labelled "total - all <engine> models";
//   - AllEnginesChargesList is the general Costs comparison: every exact row plus an explicitly labelled all-engines total.

const caption = { font: 'var(--type-caption)', color: 'var(--text-muted)' };
const emptyLine = { font: 'var(--type-body)', color: 'var(--text-muted)' };

// The two rows of a Dashboard engine card: this engine's TOTAL charged, and the model the engine is configured to use.
export function EngineCardCharges({ i18n, engineLabel, rows, provider, configuredModel }) {
  const total = engineTotal(rows, provider);
  return (
    <React.Fragment>
      <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <span style={caption}>{i18n.t('aiAsstRealCostEngineTotal', { engine: engineLabel })}</span>
        <span className="navrya-tabular" style={{ fontWeight: 600, fontSize: 17, lineHeight: '22px', color: 'var(--parchment)' }}>{fmtWalletUsd(total.walletDebitMicroUsd)}</span>
      </span>
      <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <span style={caption}>{i18n.t('aiAsstModelLabel')}</span>
        <span style={{ font: 'var(--type-body)', color: 'var(--text-primary)' }}>{configuredModel || '—'}</span>
      </span>
    </React.Fragment>
  );
}

// Engine context (the Engines tab): only the selected engine's exact rows, the configured model's own row highlighted,
// and an explicitly labelled total of this engine's models.
export function EngineChargesList({ i18n, engineLabel, rows, provider, selectedModel }) {
  const own = rowsForEngine(rows, provider);
  const selected = rowForModel(rows, provider, selectedModel);
  if (!own.length) return <span style={emptyLine}>{i18n.t('aiAsstRealCostEmpty')}</span>;
  return (
    <div data-scope="engine" data-provider={provider} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {own.map((row) => (
        <div key={row.provider + '/' + row.model} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 12px', border: '1px solid ' + (selected && row.model === selected.model ? 'var(--char-accent)' : 'var(--border-hairline)'), borderRadius: 8, background: 'rgba(11,20,21,.55)' }}>
          <span style={{ font: 'var(--type-body)', color: 'var(--text-primary)' }}>{row.model || '—'}</span>
          <div dir="ltr" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, font: 'var(--type-caption)', color: 'var(--text-muted)' }}>
            <span>{i18n.t('aiAsstRealCostCalls')}: {i18n.number(row.calls)}</span>
            <span>{i18n.t('aiAsstRealCostTokens')}: {i18n.number(row.totalTokens)}</span>
            <span style={{ color: 'var(--char-accent)' }}>{i18n.t('aiAsstRealCostCharged')}: {fmtWalletUsd(row.walletDebitMicroUsd)}</span>
          </div>
        </div>
      ))}
      <span dir="ltr" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '4px 12px 0' }}>
        <span className="cap" style={caption}>{i18n.t('aiAsstRealCostEngineTotal', { engine: engineLabel })}</span>
        <span className="navrya-tabular" style={{ font: 'var(--type-body)', fontWeight: 600, color: 'var(--char-accent)' }}>{fmtWalletUsd(engineTotal(rows, provider).walletDebitMicroUsd)}</span>
      </span>
    </div>
  );
}

// The general Costs view: the one place engines are compared side by side. Every row is one exact (provider, model);
// the only aggregate is the explicitly labelled all-engines total.
export function AllEnginesChargesList({ i18n, rows, providerColor }) {
  const all = normalizeUsageRows(rows);
  if (!all.length) return <span style={emptyLine}>{i18n.t('aiAsstRealCostEmpty')}</span>;
  return (
    <div data-scope="all-engines" style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      {all.map((row) => (
        <Panel key={row.provider + '/' + row.model} variant="raised" padding="12px 13px" style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: providerColor ? providerColor(row.provider) : 'var(--char-accent)', display: 'block', flex: 'none' }}></span>
            <span style={{ font: 'var(--type-body)', color: 'var(--text-primary)' }}>{row.provider + ' / ' + (row.model || '—')}</span>
          </span>
          <div dir="ltr" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}><span className="cap" style={caption}>{i18n.t('aiAsstRealCostTokens')}</span><span className="navrya-tabular" style={{ font: 'var(--type-body)', color: 'var(--text-primary)' }}>{i18n.number(row.totalTokens)}</span></span>
            <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}><span className="cap" style={caption}>{i18n.t('aiAsstRealCostCalls')}</span><span className="navrya-tabular" style={{ font: 'var(--type-body)', color: 'var(--text-primary)' }}>{i18n.number(row.calls)}</span></span>
            <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}><span className="cap" style={caption}>{i18n.t('aiAsstRealCostCharged')}</span><span className="navrya-tabular" style={{ font: 'var(--type-body)', color: 'var(--char-accent)' }}>{fmtWalletUsd(row.walletDebitMicroUsd)}</span></span>
          </div>
        </Panel>
      ))}
      <span dir="ltr" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '4px 13px 0' }}>
        <span className="cap" style={caption}>{i18n.t('aiAsstRealCostAllEngines')}</span>
        <span className="navrya-tabular" style={{ font: 'var(--type-body)', fontWeight: 600, color: 'var(--char-accent)' }}>{fmtWalletUsd(allEnginesTotal(rows).walletDebitMicroUsd)}</span>
      </span>
    </div>
  );
}
