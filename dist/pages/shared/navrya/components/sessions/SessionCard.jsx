import React from 'react';
import { Chip } from '../forms/Chip.jsx';
import { Button } from '../forms/Button.jsx';
import { assetUrl } from '../core/AssetBase.jsx';

function Field({ label, value }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
      <span style={{ font: 'var(--type-caption)', fontSize: 10, letterSpacing: 'var(--tracking-label)', color: 'var(--text-muted)' }}>{label}</span>
      <span className="navrya-tabular" style={{ font: 'var(--type-body)', fontSize: 14, fontWeight: 600, color: 'var(--parchment)' }}>{value}</span>
    </div>
  );
}

/* A saved session. `compact` stacks chart over detail so several fit side by side;
   `row` puts the chart beside a 366px ledger panel. */
export function SessionCard({
  title = 'London — 2026-08-01', status = 'ACTIVE', city = 'London', timeframe = '5m',
  summary = '1 entry · 0 scenarios', instrument = 'BTCUSDT', lastUpdate = '20:46 UTC',
  instrumentLabel = 'INSTRUMENT', lastUpdateLabel = 'LAST UPDATE',
  openLabel = 'Continue / open', reportLabel = 'View report', repeatLabel = 'Repeat / copy', deleteLabel = 'Delete',
  edition, thumbnail, layout = 'row', showDetail, chartHeight,
  onOpen, onReport, onRepeat, onDelete, style, ...rest
}) {
  const compact = layout === 'compact' || layout === 'column';
  const detail = showDetail === undefined ? !compact : showDetail;
  const chartH = chartHeight || (compact ? 200 : '100%');
  return (
    <article
      style={{
        display: 'flex', flexDirection: compact ? 'column' : 'row', overflow: 'hidden',
        height: compact ? '100%' : 360, boxSizing: 'border-box',
        borderRadius: 12, border: '1px solid var(--border-gold)',
        background: 'linear-gradient(135deg, color-mix(in srgb, var(--char-atmosphere) 65%, var(--surface-card)) 0%, var(--surface-card) 60%)',
        boxShadow: '0 18px 38px rgba(0,0,0,.34)', ...style
      }}
      {...rest}
    >
      <div style={{
        position: 'relative', flex: compact ? 'none' : '1 1 auto', minWidth: 0, height: chartH,
        background: 'var(--ink-950)', overflow: 'hidden',
        borderRight: compact ? 0 : '1px solid var(--border-hairline)',
        borderBottom: compact ? '1px solid var(--border-hairline)' : 0
      }}>
        <img
          src={thumbnail || assetUrl('assets/sessions/chart-session-london.png')} alt=""
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block' }}
        />
        {edition && (
          <span style={{
            position: 'absolute', left: 10, bottom: 10, display: 'inline-flex', alignItems: 'center', gap: 6,
            height: 24, padding: '0 10px', borderRadius: 6, font: 'var(--type-caption)', fontSize: 10,
            letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--char-accent)',
            background: 'rgba(3,8,7,.86)', border: '1px solid color-mix(in srgb, var(--char-accent) 55%, transparent)'
          }}>
            <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }}></span>
            {edition}
          </span>
        )}
      </div>
      <div style={{
        flex: 'none', width: compact ? '100%' : 366, boxSizing: 'border-box',
        padding: compact ? 16 : 20, display: 'flex', flexDirection: 'column', gap: compact ? 12 : 14
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <h3 style={{ margin: 0, flex: 1, font: 'var(--type-display-md)', fontSize: 18, lineHeight: '24px', color: 'var(--parchment)' }}>{title}</h3>
          {status && <Chip tone="accent" dot>{status}</Chip>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Chip tone="accent">{city}</Chip>
          <Chip tone="neutral">{timeframe}</Chip>
        </div>
        <p style={{ margin: 0, font: 'var(--type-body)', color: 'var(--text-muted)' }}>{summary}</p>
        {detail && (
          <div style={{ display: 'flex', gap: 16, padding: '12px 0', borderTop: '1px solid var(--border-hairline)', borderBottom: '1px solid var(--border-hairline)' }}>
            <Field label={instrumentLabel} value={instrument} />
            <span style={{ width: 1, background: 'var(--divider-gold)' }}></span>
            <Field label={lastUpdateLabel} value={lastUpdate} />
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginTop: 'auto' }}>
          <Button variant="primary" icon="open" size="sm" onClick={onOpen}>{openLabel}</Button>
          <Button variant="secondary" icon="report" size="sm" onClick={onReport}>{reportLabel}</Button>
          <Button variant="secondary" icon="copy" size="sm" onClick={onRepeat}>{repeatLabel}</Button>
          <Button variant="danger" icon="trash" size="sm" onClick={onDelete}>{deleteLabel}</Button>
        </div>
      </div>
    </article>
  );
}
