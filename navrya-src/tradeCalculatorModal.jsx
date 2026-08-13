import React from 'react';
import { createRoot } from 'react-dom/client';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { Select } from '../public/pages/shared/navrya/components/forms/Select.jsx';
import { Notice } from '../public/pages/shared/navrya/components/feedback/Notice.jsx';
import { useAssistantMotion } from '../public/pages/shared/navrya/components/assistant/motion.js';
import { currentNavryaCharacter } from './currentCharacter.js';

// ============================================================================
// Redesign of the Trade Calculator (Session tools · position sizing) against the design handoff
// code-codex/TradeCalculator.dc.html, field-for-field. The maths themselves are NOT
// reimplemented here - every number comes from the same window.TradeJournalTradeCalculator.solve()
// engine trade-ui.js's own openCalculator()/openWizard() already use (see calc() below), so a
// trade sized here matches the wizard/details view exactly. Only positionSize/qty/avg-TP/RR-bar
// derivations that solve() does not return are computed locally, the same way the design's own
// mock calc() did. Screenshot import calls the real vision endpoint
// (TradeJournalChatDockCore.analyzeScreenshot -> POST /api/trades/extract-fields) instead of the
// design mock's seeded fake extractor - that endpoint and its client already existed, wired to
// the chat dock, just not to this calculator.
// ============================================================================

const RISK_CHIPS = [0.5, 1, 2, 3];
const LEV_CHIPS = [1, 5, 10, 25, 50];

function toNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}
function fmtMoney(i18n, n, d) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return i18n.number(n, { minimumFractionDigits: d === undefined ? 2 : d, maximumFractionDigits: d === undefined ? 2 : d });
}
function fmtPrice(i18n, n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const d = Math.abs(n) >= 1000 ? 2 : (Math.abs(n) >= 1 ? 3 : 5);
  return i18n.number(n, { minimumFractionDigits: 2, maximumFractionDigits: d });
}

// ---- small local primitives (mirrors mentalHealthIntakeModal.jsx's own SectionLabel/Hint) ----
function SectionLabel({ children, style }) {
  return <span style={{ font: 'var(--type-section-label)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--gold-warm)', ...style }}>{children}</span>;
}
function MetricLabel({ children }) {
  return <span style={{ font: 'var(--type-metric-label)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{children}</span>;
}
function FromImageDot({ show, title }) {
  if (!show) return null;
  return <span title={title} style={{ width: 6, height: 6, flex: 'none', borderRadius: '50%', background: 'var(--char-accent)', boxShadow: '0 0 8px var(--char-glow)' }} />;
}

function PillButton({ selected, onClick, children, height = 44, tone }) {
  const [hover, setHover] = React.useState(false);
  const selColor = tone === 'success' ? 'var(--success)' : tone === 'danger' ? 'var(--danger)' : 'var(--char-accent)';
  const selBg = tone === 'success' ? 'rgba(46,204,113,.12)' : tone === 'danger' ? 'rgba(255,56,48,.12)' : 'var(--char-active-surface)';
  const selBorder = tone === 'success' ? 'rgba(46,204,113,.5)' : tone === 'danger' ? 'rgba(255,56,48,.5)' : 'var(--char-accent)';
  return (
    <button
      type="button" onClick={onClick} className="navrya-tabular"
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        flex: 1, minWidth: 0, height, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        border: '1px solid ' + (selected ? selBorder : hover ? 'var(--border-gold-strong)' : 'var(--divider-gold)'),
        background: selected ? selBg : 'rgba(11,20,21,.55)',
        color: selected ? selColor : hover ? 'var(--text-primary)' : 'var(--text-muted)',
        font: '500 14px/20px var(--font-ui)', letterSpacing: '.02em',
        transition: 'border-color var(--dur-hover) var(--ease-out), color var(--dur-hover) var(--ease-out), background var(--dur-hover) var(--ease-out)'
      }}
    >{children}</button>
  );
}

function NumField({ value, onChange, placeholder, unit }) {
  const [focus, setFocus] = React.useState(false);
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <input
        className="navrya-tabular" inputMode="decimal" dir="ltr" value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{
          flex: 1, minWidth: 0, width: '100%', height: 46, boxSizing: 'border-box',
          padding: unit ? '0 52px 0 14px' : '0 14px', borderRadius: 8,
          border: '1px solid ' + (focus ? 'var(--char-accent)' : 'var(--divider-gold)'),
          background: 'rgba(3,8,7,.55)', color: 'var(--text-primary)', font: '500 15px/20px var(--font-ui)', outline: 'none'
        }}
      />
      {unit && (
        <span style={{ position: 'absolute', right: 14, font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-disabled)', pointerEvents: 'none' }}>{unit}</span>
      )}
    </div>
  );
}

// ---- risk-per-trade drag slider, 0.25-10% in quarter-point steps ----
function RiskSlider({ value, onChange, label }) {
  const trackRef = React.useRef(null);
  function valueAt(clientX) {
    const r = trackRef.current && trackRef.current.getBoundingClientRect();
    if (!r || !r.width) return value;
    const v = Math.round((((clientX - r.left) / r.width) * 10) * 4) / 4;
    return Math.max(0.25, Math.min(10, v));
  }
  function onPointerDown(e) {
    onChange(valueAt(e.clientX));
    function move(ev) { onChange(valueAt(ev.clientX)); }
    function up() { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
  function onKeyDown(e) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); onChange(Math.max(0.25, value - 0.25)); }
    if (e.key === 'ArrowRight') { e.preventDefault(); onChange(Math.min(10, value + 0.25)); }
  }
  const fill = (value / 10) * 100;
  return (
    <div
      ref={trackRef} role="slider" tabIndex={0} aria-label={label} aria-valuemin={0} aria-valuemax={10} aria-valuenow={value}
      onPointerDown={onPointerDown} onKeyDown={onKeyDown}
      style={{ direction: 'ltr', position: 'relative', height: 40, borderRadius: 8, border: '1px solid var(--divider-gold)', background: 'rgba(3,8,7,.55)', cursor: 'ew-resize', touchAction: 'none', overflow: 'hidden', outlineOffset: 2 }}
    >
      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: fill + '%', background: 'linear-gradient(90deg, rgba(3,8,7,0), color-mix(in srgb, var(--char-accent) 30%, transparent))', borderInlineEnd: '2px solid var(--char-accent)' }} />
      <span style={{ position: 'absolute', left: 'calc(' + fill + '% - 6px)', top: 8, height: 24, width: 12, borderRadius: 4, border: '1px solid var(--char-accent)', background: 'var(--ink-900)', boxShadow: '0 0 12px var(--char-glow)' }} />
    </div>
  );
}

// ---- pulsing "reading the chart" indicator, reusing the assistant surfaces' own motion sheet ----
function ReadingIndicator({ label }) {
  return (
    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--char-accent)' }}>
        {label}
        <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          {[0, 1, 2].map((i) => (
            <span key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--char-accent)', animation: `navrya-dot 1150ms var(--ease-standard) ${i * 140}ms infinite` }} />
          ))}
        </span>
      </span>
      <span style={{ position: 'relative', height: 3, borderRadius: 2, background: 'rgba(244,234,215,.1)', overflow: 'hidden' }}>
        <span style={{ position: 'absolute', inset: 0, background: 'var(--char-accent)', animation: 'navrya-halo 1400ms var(--ease-standard) infinite' }} />
      </span>
    </span>
  );
}

// ---- chart-screenshot import control: idle / reading / filled / failed ----
function ScreenshotImport({ img, onPick, onUndo, t }) {
  const base = { height: 44, boxSizing: 'border-box', width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', borderRadius: 8 };
  if (img.state === 'reading') {
    return (
      <div style={{ ...base, border: '1px solid var(--char-accent)', background: 'var(--char-active-surface)', overflow: 'hidden' }}>
        <span style={{ width: 26, height: 26, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 6, color: 'var(--char-accent)', background: 'rgba(3,8,7,.7)', border: '1px solid color-mix(in srgb, var(--char-accent) 60%, transparent)' }}>
          <Icon name="scan-line" size={14} />
        </span>
        <ReadingIndicator label={t('calcReadingChart')} />
      </div>
    );
  }
  if (img.state === 'filled') {
    return (
      <div style={{ ...base, gap: 9, paddingInlineEnd: 4, border: '1px solid var(--char-accent)', background: 'var(--char-active-surface)', overflow: 'hidden' }}>
        <button type="button" onClick={onPick} title={t('calcReplaceScreenshot')} aria-label={t('calcReplaceScreenshot')} style={{ width: 46, height: 42, flex: 'none', padding: 0, border: 'none', borderInlineEnd: '1px solid var(--char-accent)', background: 'transparent', cursor: 'pointer', display: 'block' }}>
          <img src={img.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </button>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ font: 'var(--type-caption)', color: 'var(--parchment)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{img.name}</span>
          <span style={{ font: 'var(--type-caption)', color: 'var(--char-accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{img.summary}</span>
        </span>
        <button
          type="button" onClick={onUndo} title={t('calcUndoImport')} aria-label={t('calcUndoImport')}
          style={{ width: 40, height: 40, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 6, cursor: 'pointer', border: '1px solid transparent', background: 'transparent', color: 'var(--text-muted)' }}
        ><Icon name="rotate-ccw" size={16} /></button>
      </div>
    );
  }
  if (img.state === 'failed') {
    const label = img.failKind === 'type' ? t('calcNotImage') : img.failKind === 'unavailable' ? t('calcAiUnavailable') : img.failKind === 'empty' ? t('calcNothingFound') : t('calcAiFailed');
    const hint = img.failKind === 'type' ? t('calcChooseImageType') : t('calcImportScreenshot');
    return (
      <button type="button" onClick={onPick} style={{ ...base, cursor: 'pointer', border: '1px dashed rgba(255,56,48,.5)', background: 'rgba(255,56,48,.07)', textAlign: 'start' }}>
        <span style={{ width: 26, height: 26, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 6, color: 'var(--danger)', background: 'rgba(3,8,7,.7)', border: '1px solid rgba(255,56,48,.5)' }}>
          <Icon name="shield-alert" size={14} />
        </span>
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, minWidth: 0 }}>
          <span style={{ font: 'var(--type-body)', fontWeight: 600, color: 'var(--parchment)' }}>{label}</span>
          <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hint}</span>
        </span>
      </button>
    );
  }
  return (
    <button type="button" onClick={onPick} style={{ ...base, cursor: 'pointer', border: '1px dashed var(--border-gold)', background: 'rgba(3,8,7,.45)', textAlign: 'start' }}>
      <span style={{ width: 26, height: 26, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 6, color: 'var(--char-accent)', background: 'rgba(3,8,7,.7)', border: '1px solid color-mix(in srgb, var(--char-accent) 60%, transparent)' }}>
        <Icon name="upload" size={14} />
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, minWidth: 0 }}>
        <span style={{ font: 'var(--type-body)', fontWeight: 600, color: 'var(--parchment)' }}>{t('calcImportScreenshot')}</span>
        <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t('calcImportHint')}</span>
      </span>
    </button>
  );
}

function TakeProfitRow({ index, tp, fromImage, removable, onPrice, onPortion, onRemove, t }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          <FromImageDot show={fromImage} title={t('calcReadFromScreenshot')} />
          {t('takeProfit') + ' ' + (index + 1)}
        </span>
        <NumField value={tp.price} onChange={onPrice} placeholder="0.00" unit="usd" />
      </div>
      <div style={{ width: 104, flex: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('portion')}</span>
        <NumField value={tp.portion} onChange={onPortion} placeholder="100" unit="%" />
      </div>
      {removable && (
        <button
          type="button" onClick={onRemove} aria-label={t('calcRemoveTp')}
          style={{ width: 44, height: 44, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--divider-gold)', background: 'rgba(11,20,21,.55)', color: 'var(--text-muted)' }}
        ><Icon name="trash" size={16} /></button>
      )}
    </div>
  );
}

function ResultTile({ label, value, gold }) {
  return (
    <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4, padding: '11px 12px', borderRadius: 8, border: '1px solid ' + (gold ? 'rgba(214,175,107,.4)' : 'var(--border-hairline)'), background: gold ? 'rgba(214,175,107,.06)' : 'rgba(11,20,21,.5)' }}>
      <MetricLabel>{label}</MetricLabel>
      <span className="navrya-tabular" style={{ font: '500 17px/22px var(--font-ui)', color: gold ? 'var(--gold-warm)' : 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

// Lays out entry/stop/breakeven/TP markers on the vertical price-map track, resolving overlaps
// the same way the design's own mock did (sort by price, push down any row within 18px of the
// previous one, then shift the whole stack back up if it overflowed the bottom).
function buildLadder(i18n, t, out, tps) {
  if (!out.valid) return [];
  const be = out.r.profitPrice;
  const pts = [out.entry, out.stop].concat(tps.map((x) => toNum(x.price)).filter((v) => v !== null));
  if (Number.isFinite(be)) pts.push(be);
  const hi = Math.max(...pts), lo = Math.min(...pts);
  const span = (hi - lo) || 1, pad = span * 0.22, top = hi + pad, range = span + pad * 2;
  const H = 196;
  const at = (v) => ((top - v) / range) * H + 9;
  const rows = [];
  tps.forEach((x, i) => {
    const p = toNum(x.price);
    if (p !== null) rows.push({ y: at(p), kind: 'tp', color: 'var(--success)', line: 'rgba(46,204,113,.4)', label: 'TP' + (i + 1) + ' ' + fmtPrice(i18n, p) });
  });
  if (Number.isFinite(be)) {
    const beY = at(be), entryY = at(out.entry);
    if (Math.abs(beY - entryY) >= 18) rows.push({ y: beY, kind: 'be', color: 'var(--warning)', line: null, dashed: true, label: t('calcLadderBE') + ' ' + fmtPrice(i18n, be) });
  }
  rows.push({ y: at(out.entry), kind: 'entry', color: 'var(--gold-warm)', line: 'rgba(214,175,107,.55)', label: t('calcLadderEntry') + ' ' + fmtPrice(i18n, out.entry) });
  rows.push({ y: at(out.stop), kind: 'stop', color: 'var(--danger)', line: 'rgba(255,56,48,.45)', label: t('calcLadderSL') + ' ' + fmtPrice(i18n, out.stop) });
  rows.sort((a, b) => a.y - b.y);
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].y - rows[i - 1].y < 18) rows[i].y = rows[i - 1].y + 18;
  }
  const over = rows.length ? rows[rows.length - 1].y - (H + 9) : 0;
  if (over > 0) rows.forEach((r) => { r.y -= over; });
  return rows;
}

function computeOut(state) {
  const calc = window.TradeJournalTradeCalculator;
  const e = toNum(state.entry), s = toNum(state.stop), bal = toNum(state.balance);
  if (!calc || e === null || s === null || e <= 0 || s <= 0 || e === s) return { valid: false };
  const source = {
    direction: state.dir, marginMode: state.margin, entryPrice: e, stopLoss: s, slDistancePercent: null,
    riskPercent: state.risk, riskAmount: null, leverage: state.leverage, positionSize: null, marginRequired: null,
    accountBalance: bal, takeProfits: state.tps.map((x) => ({ price: toNum(x.price), portionPercent: toNum(x.portion) })),
    feeType: state.feeType, feePercent: toNum(state.feePercent) || 0
  };
  const manual = new Set(['entryPrice', 'stopLoss', 'accountBalance', 'riskPercent', 'leverage']);
  const r = calc.solve(source, manual, { feePercent: source.feePercent });
  let wSum = 0, tpNum = 0;
  state.tps.forEach((x) => {
    const p = toNum(x.price), pn = toNum(x.portion) || 0;
    if (p !== null) { wSum += pn; tpNum += p * pn; }
  });
  const tpAvg = wSum ? tpNum / wSum : null;
  const qty = r.positionSize !== null && r.positionSize !== undefined ? r.positionSize / e : null;
  const rr = r.riskAmount && r.potentialProfit !== null && r.potentialProfit !== undefined ? r.potentialProfit / r.riskAmount : null;
  const bad = r.potentialProfit !== null && r.potentialProfit !== undefined && r.potentialProfit < 0;
  const rw = rr !== null && rr > 0 ? Math.min(90, (rr / (1 + rr)) * 100) : 50;
  return { valid: true, source, r, entry: e, stop: s, balance: bal, qty, tpAvg, wSum, rr, bad, rw };
}

function TradeCalculatorModal({ onClose }) {
  const i18n = window.TradeJournalTradeI18n;
  const tradeStore = window.TradeJournalTradeStore;
  const t = i18n.t;
  const rtl = i18n.direction() === 'rtl';
  useAssistantMotion();

  const settings = React.useMemo(() => tradeStore.settings(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [dir, setDir] = React.useState('long');
  const [margin, setMargin] = React.useState('isolated');
  const [strategyId, setStrategyId] = React.useState('');
  const [entry, setEntry] = React.useState('');
  const [stop, setStop] = React.useState('');
  const [balance, setBalance] = React.useState(settings.accountBalance !== null && settings.accountBalance !== undefined ? String(settings.accountBalance) : '');
  const [risk, setRisk] = React.useState(settings.defaultRiskPercent || 1);
  const [leverage, setLeverage] = React.useState(10);
  const [feeType, setFeeType] = React.useState(settings.defaultFeeType || 'taker');
  const [feePercent, setFeePercent] = React.useState(String(settings.defaultFeeType === 'maker' ? settings.makerFeePercent : settings.takerFeePercent));
  const [tps, setTps] = React.useState([{ price: '', portion: '100' }]);

  const [img, setImg] = React.useState({ state: 'idle', url: null, name: '', summary: '', failKind: null });
  const [filled, setFilled] = React.useState([]);
  const [snapshot, setSnapshot] = React.useState(null);
  const [dragging, setDragging] = React.useState(false);
  const fileInputRef = React.useRef(null);
  const readTokenRef = React.useRef(0);

  const out = computeOut({ dir, margin, entry, stop, balance, risk, leverage, feeType, feePercent, tps });

  function resetImportState() { setImg({ state: 'idle', url: null, name: '', summary: '', failKind: null }); setFilled([]); setSnapshot(null); }

  async function handleFiles(list) {
    const file = list && list[0];
    if (!file) return;
    if (!/^image\//.test(file.type || '')) { setImg({ state: 'failed', url: null, name: file.name || '', summary: '', failKind: 'type' }); return; }
    const snap = { dir, entry, stop, tps };
    const reader = new FileReader();
    const token = ++readTokenRef.current;
    reader.onerror = () => { if (readTokenRef.current === token) setImg({ state: 'failed', url: null, name: file.name, summary: '', failKind: 'ai' }); };
    reader.onload = async () => {
      if (readTokenRef.current !== token) return;
      const dataUrl = String(reader.result || '');
      setSnapshot(snap);
      setImg({ state: 'reading', url: dataUrl, name: file.name, summary: '', failKind: null });
      const core = window.TradeJournalChatDockCore;
      if (!core) { setImg({ state: 'failed', url: dataUrl, name: file.name, summary: '', failKind: 'unavailable' }); return; }
      try {
        const extraction = await core.analyzeScreenshot(dataUrl);
        if (readTokenRef.current !== token) return;
        const gotDir = extraction.direction === 'long' || extraction.direction === 'short';
        const gotEntry = typeof extraction.entryPrice === 'number';
        const gotStop = typeof extraction.stopLoss === 'number';
        const gotTps = Array.isArray(extraction.takeProfits) && extraction.takeProfits.length > 0;
        if (!gotDir && !gotEntry && !gotStop && !gotTps) { setImg({ state: 'failed', url: dataUrl, name: file.name, summary: '', failKind: 'empty' }); return; }
        const next = [];
        if (gotDir) { setDir(extraction.direction); next.push('dir'); }
        if (gotEntry) { setEntry(String(extraction.entryPrice)); next.push('entry'); }
        if (gotStop) { setStop(String(extraction.stopLoss)); next.push('stop'); }
        if (gotTps) {
          const n = extraction.takeProfits.length, equal = Math.round(100 / n);
          setTps(extraction.takeProfits.map((tp, i) => ({ price: String(tp.price), portion: String(i === n - 1 ? 100 - equal * (n - 1) : equal) })));
          next.push('tps');
        }
        if (typeof extraction.leverage === 'number') { setLeverage(extraction.leverage); next.push('leverage'); }
        setFilled(next);
        const segments = [];
        if (gotDir) segments.push(t(extraction.direction));
        if (gotEntry && gotStop) segments.push(t('calcSummaryEntryStop'));
        else if (gotEntry) segments.push(t('entryPrice'));
        else if (gotStop) segments.push(t('stopLoss'));
        if (gotTps) segments.push(t('calcSummaryTargets', { count: extraction.takeProfits.length }));
        const confidence = typeof extraction.confidence === 'number' ? ' · ' + Math.round(extraction.confidence * 100) + '%' : '';
        setImg({ state: 'filled', url: dataUrl, name: file.name, summary: segments.join(' · ') + confidence, failKind: null });
      } catch (err) {
        if (readTokenRef.current === token) setImg({ state: 'failed', url: dataUrl, name: file.name, summary: '', failKind: 'ai' });
      }
    };
    reader.readAsDataURL(file);
  }

  function undoImport() {
    const snap = snapshot || {};
    readTokenRef.current += 1;
    resetImportState();
    setDir(snap.dir || 'long'); setEntry(snap.entry || ''); setStop(snap.stop || ''); setTps(snap.tps || [{ price: '', portion: '100' }]);
  }

  function pickFile() { if (fileInputRef.current) fileInputRef.current.click(); }

  function setTpField(index, key) {
    return (v) => setTps((prev) => prev.map((tp, i) => (i === index ? { ...tp, [key]: v } : tp)));
  }

  function handleStrategy(id) {
    setStrategyId(id);
    const strategyStore = window.TradeJournalStrategyEducationStore;
    if (id && strategyStore) {
      const defaults = strategyStore.getRiskDefaults(id);
      if (defaults && defaults.maxRiskPerTradePercent !== null && defaults.maxRiskPerTradePercent !== undefined) {
        setRisk(defaults.maxRiskPerTradePercent);
        const tradeUi = window.TradeJournalTradeUI;
        if (tradeUi) tradeUi.toast(t('strategyRiskLoaded'), 'success');
      }
    }
  }

  function handleFeeType(type) {
    setFeeType(type);
    setFeePercent(String(type === 'maker' ? settings.makerFeePercent : settings.takerFeePercent));
  }

  function handleReset() {
    setDir('long'); setMargin('isolated'); setStrategyId('');
    setEntry(''); setStop('');
    setBalance(settings.accountBalance !== null && settings.accountBalance !== undefined ? String(settings.accountBalance) : '');
    setRisk(settings.defaultRiskPercent || 1); setLeverage(10);
    setFeeType(settings.defaultFeeType || 'taker');
    setFeePercent(String(settings.defaultFeeType === 'maker' ? settings.makerFeePercent : settings.takerFeePercent));
    setTps([{ price: '', portion: '100' }]);
    resetImportState();
  }

  // Same createDraft -> applyCalculatedToTrade -> openWizard sequence trade-ui.js's legacy
  // openCalculator()'s "register trade" button (and chat-dock-core.js's screenshot-triggered
  // applyExtractionToWizard()) already use - the calculator only sizes the trade, the existing
  // 5-step wizard still owns status/timeframe/emotions/screenshot.
  function handleLogTrade() {
    const tradeUi = window.TradeJournalTradeUI;
    if (!tradeUi || !out.valid) return;
    const trade = tradeUi.applyCalculatedToTrade(tradeStore.createDraft({ status: 'hunting', linkedStrategyId: strategyId || null }), out.r, out.source);
    trade.linkedStrategyId = strategyId || null;
    onClose();
    tradeUi.openWizard(trade);
  }

  const strategyStore = window.TradeJournalStrategyEducationStore;
  const activeStrategies = strategyStore ? strategyStore.listActive() : [];
  const strategyOptions = [{ value: '', label: t('noStrategy') }].concat(activeStrategies.map((s) => ({ value: s.id, label: s.name })));

  const ladder = buildLadder(i18n, t, out, tps);
  const tiles = [
    { label: t('marginRequired'), value: out.valid && out.r.marginRequired !== null && out.r.marginRequired !== undefined ? fmtMoney(i18n, out.r.marginRequired, 0) + ' USD' : '—' },
    { label: t('calcLeverageUsed'), value: leverage + '×' },
    { label: t('slDistance'), value: out.valid ? fmtMoney(i18n, out.r.slDistancePercent, 2) + '% · ' + fmtPrice(i18n, Math.abs(out.entry - out.stop)) : '—' },
    { label: t('calcAvgTp'), value: out.valid && out.tpAvg !== null ? fmtPrice(i18n, out.tpAvg) : '—' },
    { label: t('breakeven'), value: out.valid ? fmtPrice(i18n, out.r.profitPrice) : '—', gold: true },
    { label: t('totalCommission'), value: out.valid && out.r.totalCommission !== null && out.r.totalCommission !== undefined ? fmtMoney(i18n, out.r.totalCommission) + ' USD' : '—', gold: true },
    { label: t('liquidation'), value: out.valid ? fmtPrice(i18n, out.r.liquidationPrice) : '—' },
    { label: t('calcInProfitAbove'), value: out.valid ? fmtPrice(i18n, out.r.profitPrice) : '—' }
  ];

  const footNote = img.state === 'filled' ? t('calcFootFilledFromScreenshot') : out.valid ? t('calcFootNumbersUpdate') : t('calcFootRequireEntryStop');

  return (
    <div
      dir={rtl ? 'rtl' : 'ltr'}
      style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, boxSizing: 'border-box', background: 'var(--scrim)', backdropFilter: 'blur(6px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <Panel
        variant="prestige" radius={12} ornament ornamentSize={16} ornamentInset={6}
        role="dialog" aria-modal="true" aria-label={t('tradeCalculator')}
        style={{ width: 'min(1380px,100%)', maxHeight: 'calc(100vh - 48px)', background: 'var(--ink-900)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onMouseDown={(e) => e.stopPropagation()}
        onDragOver={(e) => { e.preventDefault(); if (!dragging) setDragging(true); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer && e.dataTransfer.files); }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', flexWrap: 'wrap' }}>
          <span style={{ width: 44, height: 44, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 8, border: '1px solid var(--char-accent)', background: 'var(--char-active-surface)', color: 'var(--char-accent)' }}>
            <Icon name="calculator" size={22} />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <span style={{ font: 'var(--type-section-label)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('calcEyebrow')}</span>
            <h2 style={{ margin: 0, font: 'var(--type-display-lg)', letterSpacing: 'var(--tracking-display)', color: 'var(--text-primary)' }}>{t('tradeCalculator')}</h2>
          </div>
          <span style={{ flex: 1 }} />
          <div style={{ width: 252, flex: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ font: 'var(--type-caption)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('calcChartScreenshot')}</span>
            <ScreenshotImport img={img} onPick={pickFile} onUndo={undoImport} t={t} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ font: 'var(--type-caption)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('strategy')}</span>
            <Select value={strategyId} options={strategyOptions} onChange={handleStrategy} icon="strategies" width={220} />
          </div>
          <button
            type="button" onClick={onClose} aria-label={t('close')}
            style={{ width: 44, height: 44, flex: 'none', alignSelf: 'flex-end', display: 'grid', placeItems: 'center', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border-gold)', background: 'rgba(11,20,21,.72)', color: 'var(--text-muted)' }}
          ><Icon name="close" size={18} /></button>
        </div>

        {/* Body */}
        <div className="navrya-scroll" style={{ borderTop: '1px solid var(--border-hairline)', borderBottom: '1px solid var(--border-hairline)', background: 'var(--ink-950)', padding: 18, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start', maxHeight: '66vh', overflowY: 'auto' }}>

          {/* The setup */}
          <div style={{ flex: '1 1 296px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14, border: '1px solid var(--border-gold)', borderRadius: 12, background: 'rgba(3,8,7,.55)', padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ color: 'var(--gold-warm)', display: 'flex' }}><Icon name="target" size={16} /></span>
              <SectionLabel>{t('calcTheSetup')}</SectionLabel>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <MetricLabel>{t('direction')}</MetricLabel>
              <div style={{ display: 'flex', gap: 8 }}>
                <PillButton selected={dir === 'long'} onClick={() => setDir('long')} tone="success"><Icon name="trending-up" size={16} />{t('long')}</PillButton>
                <PillButton selected={dir === 'short'} onClick={() => setDir('short')} tone="danger"><Icon name="trending-down" size={16} />{t('short')}</PillButton>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <FromImageDot show={filled.indexOf('entry') > -1} title={t('calcReadFromScreenshot')} />
                <MetricLabel>{t('entryPrice')}</MetricLabel>
              </div>
              <NumField value={entry} onChange={setEntry} placeholder="0.00" unit="usd" />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <FromImageDot show={filled.indexOf('stop') > -1} title={t('calcReadFromScreenshot')} />
                <MetricLabel>{t('stopLoss')}</MetricLabel>
                <span style={{ flex: 1 }} />
                {out.valid && <span className="navrya-tabular" style={{ font: 'var(--type-caption)', color: 'var(--gold-warm)' }}>{t('calcSlAway', { value: fmtMoney(i18n, out.r.slDistancePercent, 2) })}</span>}
              </div>
              <NumField value={stop} onChange={setStop} placeholder="0.00" unit="usd" />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <MetricLabel>{t('accountBalance')}</MetricLabel>
              <NumField value={balance} onChange={setBalance} placeholder="0" unit="usd" />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <MetricLabel>{t('marginMode')}</MetricLabel>
              <div style={{ display: 'flex', gap: 8 }}>
                <PillButton selected={margin === 'isolated'} onClick={() => setMargin('isolated')}>{t('isolated')}</PillButton>
                <PillButton selected={margin === 'cross'} onClick={() => setMargin('cross')}>{t('cross')}</PillButton>
              </div>
            </div>
          </div>

          {/* Risk and leverage + Take profit */}
          <div style={{ flex: '1 1 318px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, border: '1px solid var(--border-gold)', borderRadius: 12, background: 'rgba(3,8,7,.55)', padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ color: 'var(--gold-warm)', display: 'flex' }}><Icon name="honour" size={16} /></span>
                <SectionLabel>{t('calcRiskAndLeverage')}</SectionLabel>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <MetricLabel>{t('calcRiskPerTrade')}</MetricLabel>
                  <span style={{ flex: 1 }} />
                  <span className="navrya-tabular" dir="ltr" style={{ font: 'var(--type-username)', color: 'var(--char-accent)' }}>
                    {fmtMoney(i18n, risk, risk % 1 ? 2 : 0) + '% · ' + (out.valid && out.r.riskAmount !== null && out.r.riskAmount !== undefined ? fmtMoney(i18n, out.r.riskAmount, 0) + ' USD' : '—')}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 7 }}>
                  {RISK_CHIPS.map((v) => <PillButton key={v} selected={risk === v} onClick={() => setRisk(v)}>{fmtMoney(i18n, v, v % 1 ? 1 : 0) + '%'}</PillButton>)}
                </div>
                <RiskSlider value={risk} onChange={setRisk} label={t('calcRiskPerTrade')} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <MetricLabel>{t('leverage')}</MetricLabel>
                  <span style={{ flex: 1 }} />
                  <span className="navrya-tabular" dir="ltr" style={{ font: 'var(--type-username)', color: 'var(--char-accent)' }}>
                    {leverage + '× · ' + (out.valid && out.r.marginRequired !== null && out.r.marginRequired !== undefined ? fmtMoney(i18n, out.r.marginRequired, 0) + ' USD margin' : '—')}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 7 }}>
                  {LEV_CHIPS.map((v) => <PillButton key={v} selected={leverage === v} onClick={() => setLeverage(v)}>{v + '×'}</PillButton>)}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 12, borderTop: '1px solid var(--border-hairline)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <MetricLabel>{t('calcFees')}</MetricLabel>
                  <span style={{ flex: 1 }} />
                  <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{t('calcFeesHint')}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', gap: 6, padding: 4, borderRadius: 8, border: '1px solid var(--divider-gold)', background: 'rgba(3,8,7,.5)' }}>
                    <PillButton selected={feeType === 'maker'} onClick={() => handleFeeType('maker')} height={36}>{t('maker')}</PillButton>
                    <PillButton selected={feeType === 'taker'} onClick={() => handleFeeType('taker')} height={36}>{t('taker')}</PillButton>
                  </div>
                  <div style={{ flex: 'none', width: 118 }}>
                    <NumField value={feePercent} onChange={setFeePercent} placeholder="0.06" unit="%" />
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, border: '1px solid var(--border-gold)', borderRadius: 12, background: 'rgba(3,8,7,.55)', padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ color: 'var(--gold-warm)', display: 'flex' }}><Icon name="flag" size={16} /></span>
                <SectionLabel>{t('takeProfit')}</SectionLabel>
                <span style={{ flex: 1 }} />
                {tps.length < 4 && (
                  <Button variant="secondary" size="sm" icon="plus" onClick={() => setTps((prev) => prev.concat([{ price: '', portion: '' }]))}>{t('addTakeProfit')}</Button>
                )}
              </div>
              {tps.map((tp, i) => (
                <TakeProfitRow
                  key={i} index={i} tp={tp} fromImage={filled.indexOf('tps') > -1} removable={tps.length > 1} t={t}
                  onPrice={setTpField(i, 'price')} onPortion={setTpField(i, 'portion')}
                  onRemove={() => setTps((prev) => prev.filter((_, j) => j !== i))}
                />
              ))}
              {out.valid && out.wSum > 0 && Math.abs(out.wSum - 100) > 0.5 && (
                <Notice tone="warning" icon="shield-alert">{t('calcPortionWarn', { value: fmtMoney(i18n, out.wSum, 0) })}</Notice>
              )}
            </div>
          </div>

          {/* The maths */}
          <Panel
            variant="active" ornament ornamentSize={14} ornamentInset={6} texture textureOpacity={0.05}
            style={{ flex: '2.2 1 462px', minWidth: 0, borderColor: 'var(--border-gold-strong)', padding: 16 }}
          >
            {/* Panel wraps children in its own non-flex position:relative div (see Panel.jsx),
                so the gap/column layout has to live on this inner div, not on Panel's own style -
                the same footgun mentalHealthIntakeModal.jsx's commit already had to work around. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ color: 'var(--char-accent)', display: 'flex' }}><Icon name="report" size={16} /></span>
              <SectionLabel style={{ color: 'var(--char-accent)' }}>{t('calcTheMaths')}</SectionLabel>
              <span style={{ flex: 1 }} />
              <span style={{ font: 'var(--type-caption)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                {out.valid ? t('calcLive', { direction: t(dir), margin: t(margin) }) : t('calcWaiting')}
              </span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'stretch' }}>
              <div style={{ flex: '1 1 150px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6, padding: 14, borderRadius: 8, border: '1px solid var(--divider-gold)', background: 'rgba(11,20,21,.6)' }}>
                <MetricLabel>{t('positionSize')}</MetricLabel>
                <span className="navrya-tabular" style={{ font: '600 26px/30px var(--font-display)', color: 'var(--text-primary)' }}>{out.valid && out.r.positionSize !== null && out.r.positionSize !== undefined ? fmtMoney(i18n, out.r.positionSize, 0) + ' USD' : '—'}</span>
                <span className="navrya-tabular" style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{out.valid && out.qty !== null ? t('calcUnitsAt', { qty: fmtMoney(i18n, out.qty, 4), price: fmtPrice(i18n, out.entry) }) : t('calcEnterBalanceHint')}</span>
              </div>
              <div style={{ flex: '1 1 150px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6, padding: 14, borderRadius: 8, border: '1px solid ' + (out.bad ? 'rgba(255,56,48,.45)' : 'rgba(46,204,113,.4)'), background: out.bad ? 'rgba(255,56,48,.09)' : 'rgba(46,204,113,.07)' }}>
                <MetricLabel>{out.bad ? t('calcLossAtTargets') : t('potentialProfit')}</MetricLabel>
                <span className="navrya-tabular" style={{ font: '600 26px/30px var(--font-display)', color: out.bad ? 'var(--danger)' : 'var(--success)' }}>
                  {out.valid && out.r.potentialProfit !== null && out.r.potentialProfit !== undefined ? (out.r.potentialProfit < 0 ? '−' : '') + fmtMoney(i18n, Math.abs(out.r.potentialProfit)) + ' USD' : '—'}
                </span>
                <span className="navrya-tabular" style={{ font: 'var(--type-caption)', color: out.bad ? 'var(--danger)' : 'var(--success)' }}>
                  {out.valid && out.r.potentialProfit !== null && out.r.potentialProfit !== undefined && out.balance
                    ? (out.r.potentialProfit < 0 ? '−' : '+') + t('calcOfBalance', { value: fmtMoney(i18n, Math.abs((out.r.potentialProfit / out.balance) * 100), 2) })
                    : t('calcSetTpHint')}
                </span>
              </div>
              <div style={{ flex: '1 1 150px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6, padding: 14, borderRadius: 8, border: '1px solid rgba(255,56,48,.4)', background: 'rgba(255,56,48,.07)' }}>
                <MetricLabel>{t('riskAmount')}</MetricLabel>
                <span className="navrya-tabular" style={{ font: '600 26px/30px var(--font-display)', color: 'var(--danger)' }}>{out.valid && out.r.riskAmount !== null && out.r.riskAmount !== undefined ? fmtMoney(i18n, out.r.riskAmount) + ' USD' : '—'}</span>
                <span className="navrya-tabular" style={{ font: 'var(--type-caption)', color: 'var(--danger)' }}>{t('calcOfBalance', { value: fmtMoney(i18n, risk, risk % 1 ? 2 : 0) })}</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 14, borderRadius: 8, border: '1px solid var(--divider-gold)', background: 'rgba(11,20,21,.5)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <MetricLabel>{t('calcRiskToReward')}</MetricLabel>
                <span style={{ flex: 1 }} />
                <span className="navrya-tabular" dir="ltr" style={{ font: 'var(--type-metric-value)', color: 'var(--char-accent)' }}>
                  {out.rr === null ? '—' : out.rr > 0 ? '1 : ' + fmtMoney(i18n, out.rr, 2) : t('calcLossAtTargets')}
                </span>
              </div>
              <div style={{ direction: 'ltr', display: 'flex', height: 14, borderRadius: 4, overflow: 'hidden', background: 'rgba(244,234,215,.06)' }}>
                <span style={{ width: (out.bad ? 100 : 100 - out.rw) + '%', background: 'rgba(255,56,48,.65)' }} />
                <span style={{ width: (out.bad ? 0 : out.rw) + '%', background: 'rgba(46,204,113,.65)' }} />
              </div>
              <div style={{ direction: 'ltr', display: 'flex', justifyContent: 'space-between' }}>
                <span className="navrya-tabular" style={{ font: 'var(--type-caption)', color: 'var(--danger)' }}>{out.valid && out.r.riskAmount !== null && out.r.riskAmount !== undefined ? '−' + fmtMoney(i18n, out.r.riskAmount, 0) + ' USD' : '—'}</span>
                <span className="navrya-tabular" style={{ font: 'var(--type-caption)', color: out.bad ? 'var(--danger)' : 'var(--success)' }}>
                  {out.valid && out.r.potentialProfit !== null && out.r.potentialProfit !== undefined ? (out.r.potentialProfit < 0 ? '−' : '+') + fmtMoney(i18n, Math.abs(out.r.potentialProfit), 0) + ' USD' : '—'}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
              <div style={{ position: 'relative', flex: '0 1 124px', minWidth: 110, minHeight: 214, borderRadius: 8, border: '1px solid var(--divider-gold)', background: 'rgba(3,8,7,.5)', overflow: 'hidden' }}>
                {ladder.map((row, i) => (
                  <span key={i} style={{ position: 'absolute', left: 0, right: 0, top: row.y + 'px', display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', transform: 'translateY(-50%)' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: row.color, flex: 'none' }} />
                    <span style={{ flex: 1, height: 1, background: row.dashed ? 'transparent' : (row.line || 'transparent'), borderTop: row.dashed ? '1px dashed rgba(255,176,32,.5)' : 'none' }} />
                    <span className="navrya-tabular" style={{ font: 'var(--type-caption)', color: row.color }}>{row.label}</span>
                  </span>
                ))}
                <span style={{ position: 'absolute', left: 10, bottom: 8, font: 'var(--type-caption)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-disabled)' }}>{t('calcPriceMap')}</span>
              </div>
              <div style={{ flex: '1 1 200px', minWidth: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(112px,1fr))', gap: 8, alignContent: 'start' }}>
                {tiles.map((tile, i) => <ResultTile key={i} label={tile.label} value={tile.value} gold={tile.gold} />)}
              </div>
            </div>
            </div>
          </Panel>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', flexWrap: 'wrap' }}>
          <Button variant="ghost" icon="rotate-ccw" onClick={handleReset}>{t('calcReset')}</Button>
          <span style={{ flex: 1 }} />
          <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-disabled)', marginInlineEnd: 6 }}>{footNote}</span>
          <Button variant="secondary" icon="close" onClick={onClose}>{t('close')}</Button>
          <Button variant="primary" icon="new-session" disabled={!out.valid} onClick={handleLogTrade}>{t('registerTrade')}</Button>
        </div>

        <input
          type="file" accept="image/png,image/jpeg,image/webp" ref={fileInputRef}
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
          tabIndex={-1} aria-hidden="true" style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
        />

        {dragging && (
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(3,8,7,.84)', pointerEvents: 'none' }}>
            <div style={{ width: 'min(420px,74%)', boxSizing: 'border-box', padding: 26, borderRadius: 10, border: '1px dashed var(--char-accent)', background: 'rgba(3,8,7,.6)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 34, height: 34, display: 'grid', placeItems: 'center', borderRadius: 8, color: 'var(--char-accent)', background: 'rgba(3,8,7,.7)', border: '1px solid var(--char-accent)' }}><Icon name="upload" size={18} /></span>
              <span style={{ font: 'var(--type-display-md)', letterSpacing: 'var(--tracking-display)', color: 'var(--parchment)' }}>{t('calcDropTitle')}</span>
              <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('calcDropHint')}</span>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

export function openCalculator() {
  const i18n = window.TradeJournalTradeI18n;
  const tradeStore = window.TradeJournalTradeStore;
  const calc = window.TradeJournalTradeCalculator;
  if (!i18n || !tradeStore || !calc) return;
  const container = document.createElement('div');
  container.dataset.character = currentNavryaCharacter();
  document.body.append(container);
  const root = createRoot(container);
  function close() { root.unmount(); container.remove(); }
  root.render(<TradeCalculatorModal onClose={close} />);
  return close;
}
