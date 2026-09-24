import React from 'react';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';

// Report chart primitives shared by the Patterns/Strategies report (strategiesHubView.jsx) and the Analysis Profile report
// (analysisProfileReport.jsx). Moved out of strategiesHubView.jsx (unchanged apart from the two fixes noted on percentSign and heatCellEl) so both reports draw with the SAME
// donut / trend / funnel / R-distribution / heat-cell / bar / KPI-tile code instead of the profile report growing a second,
// slightly different copy. Every function draws only the numbers it is handed - none owns any data.

export function digits(lang, value) {
  const s = String(value);
  if (lang !== 'fa') return s;
  return s.replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
}

export function round1(n) { return Math.round(n * 10) / 10; }

// Persian and Arabic readers get the Arabic percent sign; every other language gets a plain "%" (the donut used to print the Arabic sign for all four).
export function percentSign(lang) { return lang === 'fa' || lang === 'ar' ? '٪' : '%'; }

export function h(tag, props, ...children) { return React.createElement(tag, props, ...children); }

export function donutChart(pct, size, label, lang) {
  const s = size || 56, r = (s - 7) / 2, c = 2 * Math.PI * r, value = pct == null ? 0 : pct;
  return h('div', { style: { position: 'relative', width: s, height: s, flex: 'none' } },
    h('svg', { width: s, height: s, viewBox: '0 0 ' + s + ' ' + s, style: { display: 'block', transform: 'rotate(-90deg)' } },
      h('circle', { cx: s / 2, cy: s / 2, r, fill: 'none', strokeWidth: 5, style: { stroke: 'rgba(244,234,215,.08)' } }),
      h('circle', { cx: s / 2, cy: s / 2, r, fill: 'none', strokeWidth: 5, strokeLinecap: 'round', strokeDasharray: c, strokeDashoffset: c * (1 - value / 100), style: { stroke: 'var(--char-accent)' } })),
    h('div', { style: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 } },
      h('span', { style: { fontSize: s > 90 ? 26 : 13, fontWeight: 700, color: 'var(--parchment)', lineHeight: 1 } }, pct == null ? '—' : digits(lang, pct) + percentSign(lang)),
      label ? h('span', { style: { fontSize: s > 90 ? 11 : 8.5, color: 'var(--text-dim)' } }, label) : null)
  );
}

export function trendSvg(vals, avg, key) {
  const W = 720, H = 210, pad = 14, max = 100, min = 0;
  const px = (i) => pad + (i / Math.max(1, vals.length - 1)) * (W - pad * 2);
  const py = (v) => pad + (1 - (v - min) / (max - min)) * (H - pad * 2 - 8);
  const path = (arr) => arr.map((v, i) => (i ? 'L' : 'M') + px(i).toFixed(1) + ' ' + py(v).toFixed(1)).join(' ');
  const line = path(vals);
  const area = line + ' L' + px(vals.length - 1).toFixed(1) + ' ' + (H - pad) + ' L' + px(0).toFixed(1) + ' ' + (H - pad) + ' Z';
  const gid = 'ntr-' + key;
  const grid = [25, 50, 75, 100].map((g, i) => h('line', { key: 'g' + i, x1: pad, y1: py(g), x2: W - pad, y2: py(g), strokeWidth: 1, strokeDasharray: '3 5', style: { stroke: 'rgba(244,234,215,.1)' } }));
  const dots = vals.map((v, i) => h('circle', { key: 'd' + i, cx: px(i), cy: py(v), r: 2.4, style: { fill: 'var(--char-accent)' } }));
  return h('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', height: '100%', preserveAspectRatio: 'none', style: { display: 'block' } },
    h('defs', null, h('linearGradient', { id: gid, x1: '0', y1: '0', x2: '0', y2: '1' },
      h('stop', { offset: '0%', style: { stopColor: 'var(--char-accent)', stopOpacity: 0.3 } }),
      h('stop', { offset: '100%', style: { stopColor: 'var(--char-accent)', stopOpacity: 0 } }))),
    grid, h('path', { d: area, fill: 'url(#' + gid + ')' }),
    h('path', { d: path(avg), fill: 'none', strokeWidth: 1.6, strokeDasharray: '5 4', style: { stroke: 'var(--gold-antique)' } }),
    h('path', { d: line, fill: 'none', strokeWidth: 2.2, strokeLinejoin: 'round', strokeLinecap: 'round', style: { stroke: 'var(--char-accent)' } }),
    dots
  );
}

export function funnelSvg(stages, key) {
  const W = 960, H = 190, n = stages.length, colW = W / n, barW = colW * 0.44, mid = H / 2;
  const top = stages[0].v || 1;
  const hh = stages.map((s) => Math.max(16, (s.v / top) * (H - 34)));
  const cx = stages.map((s, i) => W - (colW * (i + 0.5)));
  const gid = 'nfn-' + key;
  const poly = [];
  for (let i = n - 1; i >= 0; i--) poly.push([cx[i], mid - hh[i] / 2]);
  for (let i = 0; i < n; i++) poly.push([cx[i], mid + hh[i] / 2]);
  const pts = poly.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const bars = stages.map((s, i) => h('g', { key: 'b' + i },
    h('rect', { x: cx[i] - barW / 2, y: mid - hh[i] / 2, width: barW, height: hh[i], rx: 6, style: { fill: 'var(--char-accent)', fillOpacity: 0.9 - i * 0.16 } }),
    h('rect', { x: cx[i] - barW / 2, y: mid - hh[i] / 2, width: barW, height: hh[i], rx: 6, fill: 'none', strokeWidth: 1, style: { stroke: 'var(--border-gold)' } })
  ));
  return h('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', height: 190, preserveAspectRatio: 'none', style: { display: 'block' } },
    h('defs', null, h('linearGradient', { id: gid, x1: '1', y1: '0', x2: '0', y2: '0' },
      h('stop', { offset: '0%', style: { stopColor: 'var(--char-accent)', stopOpacity: 0.24 } }),
      h('stop', { offset: '100%', style: { stopColor: 'var(--char-accent)', stopOpacity: 0.04 } }))),
    h('polygon', { points: pts, fill: 'url(#' + gid + ')' }), bars
  );
}

export function rDistSvg(buckets) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const cells = buckets.map((b, i) => {
    const neg = b.r < 0, hgt = Math.max(3, (b.count / max) * 66);
    return h('div', { key: 'r' + i, style: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 } },
      h('div', { style: { height: 70, display: 'flex', alignItems: 'flex-end', width: '100%' } },
        neg ? null : h('div', { style: { width: '76%', margin: '0 auto', height: hgt, borderRadius: '4px 4px 0 0', background: 'var(--char-accent)', opacity: 0.35 + (b.count / max) * 0.6 } })),
      h('div', { style: { height: 1, width: '100%', background: 'rgba(244,234,215,.14)' } }),
      h('div', { style: { height: 70, display: 'flex', alignItems: 'flex-start', width: '100%' } },
        neg ? h('div', { style: { width: '76%', margin: '0 auto', height: hgt, borderRadius: '0 0 4px 4px', background: 'var(--danger)', opacity: 0.3 + (b.count / max) * 0.55 } }) : null)
    );
  });
  return h('div', { style: { display: 'flex', gap: 3, direction: 'ltr', alignItems: 'stretch' } }, cells);
}

// `max` (optional) is the largest cell of the grid being drawn; without it the scale is the original one (6 or more hits = full colour).
// Either way the intensity is clamped: `color-mix` rejects a percentage above 100, which used to leave every cell of 7+ hits unpainted.
export function heatCellEl(v, lang, max) {
  const level = Math.min(1, v / (max > 0 ? max : 6));
  return h('div', {
    title: v ? digits(lang, v) : '',
    style: { height: 30, borderRadius: 5, background: 'color-mix(in srgb, var(--char-accent) ' + Math.round(8 + level * 90) + '%, transparent)', border: '1px solid rgba(244,234,215,.06)', display: 'grid', placeItems: 'center', fontSize: 10.5, color: level > 0.5 ? 'var(--ink-950)' : 'var(--text-primary)', fontWeight: 600 }
  }, v ? digits(lang, v) : '');
}

export function barFillEl(pct, tone) {
  return h('span', { style: { display: 'block', height: '100%', width: Math.max(0, Math.min(100, pct)) + '%', borderRadius: 5, background: tone === 'gold' ? 'var(--gold-antique)' : 'var(--char-accent)', boxShadow: '0 0 12px var(--char-glow)' } });
}

export function movingAverage(vals, k) {
  return vals.map((_, i) => { const a = Math.max(0, i - k); const slice = vals.slice(a, i + 1); return Math.round(slice.reduce((x, y) => x + y, 0) / slice.length); });
}

export function KpiTile({ icon, label, value, note }) {
  return (
    <Panel variant="base" padding="14px 15px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10.5, letterSpacing: '.07em', color: 'var(--text-muted)' }}>
          <span style={{ color: 'var(--char-accent)', display: 'grid', placeItems: 'center' }}><Icon name={icon} size={16} /></span>{label}
        </span>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: '3px 7px', flexWrap: 'wrap' }}>
          <span className="navrya-tabular" style={{ fontSize: 26, fontWeight: 700, color: 'var(--parchment)', lineHeight: 1 }}>{value}</span>
          {note && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{note}</span>}
        </span>
      </div>
    </Panel>
  );
}
