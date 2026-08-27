import React from 'react';
import { createRoot } from 'react-dom/client';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { Select } from '../public/pages/shared/navrya/components/forms/Select.jsx';
import { Notice } from '../public/pages/shared/navrya/components/feedback/Notice.jsx';
import { InstrumentPicker } from '../public/pages/shared/navrya/components/forms/InstrumentPicker.jsx';
import { useAssistantMotion } from '../public/pages/shared/navrya/components/assistant/motion.js';
import { AiMagicFill } from '../public/pages/shared/navrya/components/feedback/AiMagicFill.jsx';
import { useAiFieldFill } from '../public/pages/shared/navrya/hooks/useAiFieldFill.js';
import { currentNavryaCharacter } from './currentCharacter.js';
import { ManualAccountModal } from './accountsView.jsx';

// ============================================================================
// Redesign of the "Log a Trade" wizard (Session tools · trade journal) against the design
// handoff code-codex/TradeLog.dc.html, field-for-field, converted to React. Same backend
// contract as the legacy trade-ui.js openWizard() throughout: same TradeJournalTradeStore
// draft/normalize/save, same TradeJournalTradeCalculator.solve() bidirectional pricing (any of
// entry/stop/take-profit/risk%/risk-amount/leverage/position-size can be typed directly - "the
// numbers" panel just also shows a live cost preview now, which the legacy wizard never did),
// same concept-tag taxonomy + real Pattern Registry linking (with quick-create, ported from the
// design's inline "save a new pattern" box), same emotion editor (up to 3 moods, 1-10 intensity,
// preset + custom reason tags per mood), same stress/breathing-threshold/sleep/significant-event
// pre-trade-context/thought-record/AI trend analysis/screenshot upload/initial AI analysis/AI
// process-registry wiring - nothing here is new data, only the surface is React + the new gold
// design system.
// ============================================================================

const STEP_KEYS = ['stepStatus', 'stepTimeframe', 'stepSeen', 'stepEmotions', 'stepScreenshot'];
const TOTAL_STEPS = 5;

// icon per legacy emotion id (design handoff's own icon choices, mapped onto the real
// TradeJournalTradeTypes.emotions ids/i18n keys - never renamed, just re-skinned)
const MOOD_ICONS = {
  excited: 'streak', anxious: 'progress', calm: 'wind', revenge: 'swords', angry: 'flame',
  afraid: 'shield-alert', confident: 'honour', fatigued: 'moon', restless: 'waves', overconfident: 'trending-up'
};
// Ported verbatim from trade-ui.js's own tagPresets table (i18n keys, not literal strings).
const TAG_PRESETS = {
  excited: ['tagOpportunity', 'tagBreakout', 'tagConfidenceHigh'],
  anxious: ['tagVolatility', 'tagNews', 'tagEntryFear'],
  calm: ['tagOnPlan', 'tagRelaxed', 'tagPatient'],
  revenge: ['tagWantRecover', 'tagAngryLoss', 'tagMustWin'],
  angry: ['tagAngryMarket', 'tagAngrySelf', 'tagFrustrated'],
  afraid: ['tagFearLoss', 'tagFearLiquidation', 'tagFearMissing'],
  confident: ['tagTrustAnalysis', 'tagStrongSetup', 'tagFollowedRules'],
  fatigued: ['tagTired', 'tagLossFocus', 'tagOvertraded'],
  restless: ['tagImpatient', 'tagBored', 'tagCantWait'],
  overconfident: ['tagSureThing', 'tagIgnoredRisk', 'tagWinStreak']
};
// 1-10 intensity descriptor, ported from trade-ui.js's severityLabel().
function severityLabel(t, value) {
  if (value <= 2) return t('severityVeryWeak');
  if (value <= 4) return t('severityWeak');
  if (value <= 6) return t('severityModerate');
  if (value <= 8) return t('severityStrong');
  return t('severityDominant');
}
// 1-5 conviction descriptor for the timeframe-trend rows - momentumStrength is stored 1-5
// (trade-store.js's normalize() clamps it to that range), unlike the design mock's 0-10 slider,
// so this reuses the same 5-word severity ladder rather than inventing a 10-point one.
function convictionLabel(t, value) {
  if (value <= 1) return t('severityVeryWeak');
  if (value <= 2) return t('severityWeak');
  if (value <= 3) return t('severityModerate');
  if (value <= 4) return t('severityStrong');
  return t('severityDominant');
}

function toNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}
function plainNum(n, d) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '';
  const k = Math.pow(10, d === undefined ? 2 : d);
  return String(Math.round(n * k) / k);
}
function fmtMoney(i18n, n, d) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return i18n.number(n, { minimumFractionDigits: d === undefined ? 2 : d, maximumFractionDigits: d === undefined ? 2 : d });
}

// ---- local primitives (mirrors tradeCalculatorModal.jsx's own small building blocks) ----
function SectionLabel({ children, style }) {
  return <span style={{ font: 'var(--type-section-label)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--gold-warm)', ...style }}>{children}</span>;
}
function MetricLabel({ children }) {
  return <span style={{ font: 'var(--type-metric-label)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{children}</span>;
}
function NumField({ value, onChange, placeholder, unit, computed }) {
  const [focus, setFocus] = React.useState(false);
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <input
        className="navrya-tabular" inputMode="decimal" dir="ltr" value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{
          flex: 1, minWidth: 0, width: '100%', height: 46, boxSizing: 'border-box',
          padding: unit ? '0 46px 0 12px' : '0 12px', borderRadius: 8,
          border: '1px solid ' + (focus ? 'var(--char-accent)' : 'var(--divider-gold)'),
          background: 'rgba(3,8,7,.55)', color: computed ? 'var(--text-muted)' : 'var(--text-primary)',
          font: '500 15px/20px var(--font-ui)', outline: 'none', fontStyle: computed ? 'italic' : 'normal'
        }}
      />
      {unit && (
        <span style={{ position: 'absolute', right: 12, font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-disabled)', pointerEvents: 'none' }}>{unit}</span>
      )}
    </div>
  );
}
function PillButton({ selected, onClick, children, height = 44, tone, disabled }) {
  const [hover, setHover] = React.useState(false);
  const selColor = tone === 'success' ? 'var(--success)' : tone === 'danger' ? 'var(--danger)' : 'var(--char-accent)';
  const selBg = tone === 'success' ? 'rgba(46,204,113,.12)' : tone === 'danger' ? 'rgba(255,56,48,.12)' : 'var(--char-active-surface)';
  const selBorder = tone === 'success' ? 'rgba(46,204,113,.5)' : tone === 'danger' ? 'rgba(255,56,48,.5)' : 'var(--char-accent)';
  return (
    <button
      type="button" disabled={disabled} onClick={onClick} className="navrya-tabular"
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        flex: 1, minWidth: 0, height, borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        border: '1px solid ' + (selected ? selBorder : hover ? 'var(--border-gold-strong)' : 'var(--divider-gold)'),
        background: selected ? selBg : 'rgba(11,20,21,.55)',
        color: selected ? selColor : hover ? 'var(--text-primary)' : 'var(--text-muted)',
        font: '500 14px/20px var(--font-ui)', letterSpacing: '.02em', opacity: disabled ? .5 : 1,
        transition: 'border-color var(--dur-hover) var(--ease-out), color var(--dur-hover) var(--ease-out), background var(--dur-hover) var(--ease-out)'
      }}
    >{children}</button>
  );
}
// Small drag/keyboard slider, 0-max integer steps - shared by conviction (0-10 display over a
// 1-5 stored range handled by the caller) and stress (0-10).
function DragSlider({ value, min = 0, max = 10, onChange, label, height = 40, render }) {
  const trackRef = React.useRef(null);
  function valueAt(clientX) {
    const r = trackRef.current && trackRef.current.getBoundingClientRect();
    if (!r || !r.width) return value;
    const t = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    return Math.round(min + t * (max - min));
  }
  function onPointerDown(e) {
    onChange(valueAt(e.clientX));
    function move(ev) { onChange(valueAt(ev.clientX)); }
    function up() { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
  function onKeyDown(e) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); onChange(Math.max(min, value - 1)); }
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); onChange(Math.min(max, value + 1)); }
  }
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <div
      ref={trackRef} role="slider" tabIndex={0} aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value}
      onPointerDown={onPointerDown} onKeyDown={onKeyDown}
      style={{ direction: 'ltr', position: 'relative', height, borderRadius: 8, border: '1px solid var(--divider-gold)', background: 'rgba(3,8,7,.55)', cursor: 'ew-resize', touchAction: 'none', overflow: 'hidden', outlineOffset: 2 }}
    >
      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: fill + '%', background: (render && render.fill) || 'color-mix(in srgb, var(--char-accent) 24%, transparent)', borderInlineEnd: '2px solid ' + ((render && render.line) || 'var(--char-accent)') }} />
    </div>
  );
}
// Vertical bar-strip intensity widget (design's emotion-intensity dial), 1-10.
function IntensityBars({ value, onChange }) {
  const trackRef = React.useRef(null);
  function valueAt(clientX) {
    const r = trackRef.current && trackRef.current.getBoundingClientRect();
    if (!r || !r.width) return value;
    const t = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    return Math.max(1, Math.min(10, Math.ceil(t * 10)));
  }
  function onPointerDown(e) {
    onChange(valueAt(e.clientX));
    function move(ev) { onChange(valueAt(ev.clientX)); }
    function up() { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
  function onKeyDown(e) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); onChange(Math.max(1, value - 1)); }
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); onChange(Math.min(10, value + 1)); }
  }
  return (
    <div
      ref={trackRef} role="slider" tabIndex={0} aria-label="Intensity" aria-valuemin={1} aria-valuemax={10} aria-valuenow={value}
      onPointerDown={onPointerDown} onKeyDown={onKeyDown}
      style={{ direction: 'ltr', display: 'flex', alignItems: 'flex-end', gap: 4, height: 56, cursor: 'pointer', touchAction: 'none', userSelect: 'none', outlineOffset: 4 }}
    >
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
        <span key={i} style={{
          flex: 1, minWidth: 0, height: (34 + i * 6.6).toFixed(0) + '%', borderRadius: 3,
          background: i <= value ? 'var(--char-accent)' : 'rgba(244,234,215,.09)',
          boxShadow: i <= value ? '0 0 12px var(--char-glow)' : 'none'
        }} />
      ))}
    </div>
  );
}
// mental-health-safety.js's renderSafetyCard() returns a real DOM node (not JSX) - the one
// shared, tested safety-gate surface every note field in this app already reuses.
function SafetyCardHost({ node }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const host = ref.current;
    if (!host || !node) return undefined;
    host.appendChild(node);
    return () => { if (host.contains(node)) host.removeChild(node); };
  }, [node]);
  return <div ref={ref} />;
}

// Bidirectional pricing preview, same TradeJournalTradeCalculator.solve() engine the legacy
// wizard's own solveTrade()/openCalculator() use - any of entry/stop/tp/risk%/risk-amount/
// leverage/position-size can be the manually-typed one, the rest derive from it.
function computeSolved(f) {
  const calc = window.TradeJournalTradeCalculator;
  const e = toNum(f.entry), s = toNum(f.stop);
  if (!calc || e === null || s === null || e <= 0 || s <= 0 || e === s) return { valid: false };
  const tp = toNum(f.tp);
  const source = {
    direction: f.dir, marginMode: f.margin, entryPrice: e, stopLoss: s, slDistancePercent: null,
    riskPercent: toNum(f.riskPercent), riskAmount: toNum(f.riskAmount), leverage: toNum(f.leverage),
    positionSize: toNum(f.positionSize), marginRequired: null, accountBalance: toNum(f.balance),
    takeProfits: tp !== null ? [{ price: tp, portionPercent: 100 }] : [],
    feeType: f.feeType, feePercent: f.feePercent
  };
  const manual = new Set();
  ['entryPrice', 'stopLoss', 'riskPercent', 'riskAmount', 'leverage', 'positionSize'].forEach((k) => { if (source[k] !== null) manual.add(k); });
  // solve()'s accountBalance is only read from the input when locked (see trade-calculator.js's
  // out.accountBalance=locks.has('accountBalance')?...) - without this, riskPercent x balance
  // never derives riskAmount at all, balance typed or not.
  if (source.accountBalance !== null) manual.add('accountBalance');
  const r = calc.solve(source, manual, { feePercent: source.feePercent });
  return { valid: true, r, entry: e, stop: s, tp };
}

// ============================================================================
// Step 1 - Status
// ============================================================================
function StepStatus({ t, i18n, trade, setField, solved, dirManual }) {
  const long = trade.dir === 'long';
  // Journey H1: magic-fill animation for this step's own AI-fillable fields (trade.types.js's
  // tradeWizardPaths). Step 1 owns direction/marginMode/entryPrice/stopLoss/riskPercent/
  // riskAmount/leverage/positionSize - see ai-process-registry.js's stepForPath group for
  // 'trade-wizard', which is why the wizard actually lands on THIS step for any of them.
  const dirFilled = useAiFieldFill('trade-wizard', 'direction');
  const marginFilled = useAiFieldFill('trade-wizard', 'marginMode');
  const entryFilled = useAiFieldFill('trade-wizard', 'entryPrice');
  const stopFilled = useAiFieldFill('trade-wizard', 'stopLoss');
  const riskPercentFilled = useAiFieldFill('trade-wizard', 'riskPercent');
  const leverageFilled = useAiFieldFill('trade-wizard', 'leverage');
  const bad = solved.valid && solved.r.potentialProfit !== null && solved.r.potentialProfit !== undefined && solved.r.potentialProfit < 0;
  const tiles = [
    { label: t('positionSize'), value: solved.valid && solved.r.positionSize !== null && solved.r.positionSize !== undefined ? fmtMoney(i18n, solved.r.positionSize, 0) + ' USD' : '—' },
    { label: t('riskAmount'), value: solved.valid && solved.r.riskAmount !== null && solved.r.riskAmount !== undefined ? fmtMoney(i18n, solved.r.riskAmount, 0) + ' USD' : '—' },
    { label: t('logStopDistanceShort'), value: solved.valid ? fmtMoney(i18n, solved.r.slDistancePercent, 2) + '%' : '—' },
    { label: t('logMarginShort'), value: solved.valid && solved.r.marginRequired !== null && solved.r.marginRequired !== undefined ? fmtMoney(i18n, solved.r.marginRequired, 0) + ' USD' : '—' },
    { label: t('potentialProfit'), value: solved.valid && solved.r.potentialProfit !== null && solved.r.potentialProfit !== undefined ? (bad ? '−' : '') + fmtMoney(i18n, Math.abs(solved.r.potentialProfit), 0) + ' USD' : t('logSetATarget') },
    { label: t('calcRiskToReward'), value: solved.valid && solved.r.rr !== null && solved.r.rr !== undefined && solved.r.rr > 0 ? '1 : ' + fmtMoney(i18n, solved.r.rr, 2) : '—' }
  ];
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
      <div style={{ flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14, border: '1px solid var(--border-gold)', borderRadius: 12, background: 'rgba(3,8,7,.55)', padding: 16 }}>
        <SectionLabel>{t('logWhereStands')}</SectionLabel>
        <button
          type="button" onClick={() => setField('tradeState', 'hunting')}
          style={{ width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 14, padding: 16, borderRadius: 10, cursor: 'pointer', textAlign: 'start', border: trade.tradeState === 'hunting' ? '2px solid var(--char-accent)' : '1px solid var(--divider-gold)', background: trade.tradeState === 'hunting' ? 'var(--char-active-surface)' : 'rgba(11,20,21,.5)', boxShadow: trade.tradeState === 'hunting' ? '0 0 16px var(--char-glow)' : 'none' }}
        >
          <span style={{ width: 42, height: 42, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 8, border: '1px solid ' + (trade.tradeState === 'hunting' ? 'var(--char-accent)' : 'var(--divider-gold)'), background: 'rgba(3,8,7,.6)', color: trade.tradeState === 'hunting' ? 'var(--char-accent)' : 'var(--text-muted)' }}><Icon name="execution" size={20} /></span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
            <span style={{ font: 'var(--type-display-md)', letterSpacing: 'var(--tracking-display)', color: trade.tradeState === 'hunting' ? 'var(--char-accent)' : 'var(--text-primary)' }}>{t('logStateHuntingTitle')}</span>
            <span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{t('logStateHuntingNote')}</span>
          </span>
        </button>
        <button
          type="button" onClick={() => setField('tradeState', 'open')}
          style={{ width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 14, padding: 16, borderRadius: 10, cursor: 'pointer', textAlign: 'start', border: trade.tradeState === 'open' ? '2px solid var(--char-accent)' : '1px solid var(--divider-gold)', background: trade.tradeState === 'open' ? 'var(--char-active-surface)' : 'rgba(11,20,21,.5)', boxShadow: trade.tradeState === 'open' ? '0 0 16px var(--char-glow)' : 'none' }}
        >
          <span style={{ width: 42, height: 42, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 8, border: '1px solid ' + (trade.tradeState === 'open' ? 'var(--char-accent)' : 'var(--divider-gold)'), background: 'rgba(3,8,7,.6)', color: trade.tradeState === 'open' ? 'var(--char-accent)' : 'var(--text-muted)' }}><Icon name="streak" size={20} /></span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
            <span style={{ font: 'var(--type-display-md)', letterSpacing: 'var(--tracking-display)', color: trade.tradeState === 'open' ? 'var(--char-accent)' : 'var(--text-primary)' }}>{t('logStateOpenTitle')}</span>
            <span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{t('logStateOpenNote')}</span>
          </span>
        </button>

        <AiMagicFill active={dirFilled}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <MetricLabel>{t('direction')}</MetricLabel>
            <div style={{ display: 'flex', gap: 8 }}>
              <PillButton selected={long} onClick={() => dirManual('long')} tone="success"><Icon name="trending-up" size={16} />{t('long')}</PillButton>
              <PillButton selected={!long} onClick={() => dirManual('short')} tone="danger"><Icon name="trending-down" size={16} />{t('short')}</PillButton>
            </div>
          </div>
        </AiMagicFill>
        <AiMagicFill active={marginFilled}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <MetricLabel>{t('marginMode')}</MetricLabel>
            <div style={{ display: 'flex', gap: 8 }}>
              <PillButton selected={trade.margin === 'isolated'} onClick={() => setField('margin', 'isolated')}>{t('isolated')}</PillButton>
              <PillButton selected={trade.margin === 'cross'} onClick={() => setField('margin', 'cross')}>{t('cross')}</PillButton>
            </div>
          </div>
        </AiMagicFill>
      </div>

      <div style={{ flex: '1 1 330px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14, border: '1px solid var(--border-gold)', borderRadius: 12, background: 'rgba(3,8,7,.55)', padding: 16 }}>
        <SectionLabel>{t('logTheNumbers')}</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}>
          <AiMagicFill active={entryFilled}><div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}><MetricLabel>{t('entryPrice')}</MetricLabel><NumField value={trade.entry} onChange={(v) => setField('entry', v)} placeholder="0.00" unit="usd" /></div></AiMagicFill>
          <AiMagicFill active={stopFilled}><div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}><MetricLabel>{t('stopLoss')}</MetricLabel><NumField value={trade.stop} onChange={(v) => setField('stop', v)} placeholder="0.00" unit="usd" /></div></AiMagicFill>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}><MetricLabel>{t('takeProfit')}</MetricLabel><NumField value={trade.tp} onChange={(v) => setField('tp', v)} placeholder="0.00" unit="usd" /></div>
          <AiMagicFill active={riskPercentFilled}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <MetricLabel>{t('riskPercent')}</MetricLabel>
              <NumField
                value={trade.riskPercent || (solved.valid && solved.r.riskPercent !== null && solved.r.riskPercent !== undefined ? plainNum(solved.r.riskPercent, 2) : '')}
                onChange={(v) => setField('riskPercent', v)} placeholder="1" unit="%" computed={!trade.riskPercent}
              />
            </div>
          </AiMagicFill>
          <AiMagicFill active={leverageFilled}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <MetricLabel>{t('leverage')}</MetricLabel>
              <NumField value={trade.leverage} onChange={(v) => setField('leverage', v)} placeholder="10" unit="x" />
            </div>
          </AiMagicFill>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}><MetricLabel>{t('accountBalance')}</MetricLabel><NumField value={trade.balance} onChange={(v) => setField('balance', v)} placeholder="0" unit="usd" /></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12, paddingTop: 4, borderTop: '1px solid var(--border-hairline)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-disabled)' }}>{t('calcCustom')} · {t('riskAmount')}</span>
            <NumField
              value={trade.riskAmount || (solved.valid && solved.r.riskAmount !== null && solved.r.riskAmount !== undefined ? plainNum(solved.r.riskAmount, 2) : '')}
              onChange={(v) => setField('riskAmount', v)} placeholder="0.00" unit="usd" computed={!trade.riskAmount}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-disabled)' }}>{t('calcCustom')} · {t('positionSize')}</span>
            <NumField
              value={trade.positionSize || (solved.valid && solved.r.positionSize !== null && solved.r.positionSize !== undefined ? plainNum(solved.r.positionSize, 2) : '')}
              onChange={(v) => setField('positionSize', v)} placeholder="0.00" unit="usd" computed={!trade.positionSize}
            />
          </div>
        </div>
      </div>

      <Panel variant="active" ornament ornamentSize={14} ornamentInset={6} texture textureOpacity={0.05} style={{ flex: '1.2 1 340px', minWidth: 0, borderColor: 'var(--border-gold-strong)', padding: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SectionLabel style={{ color: 'var(--char-accent)' }}>{t('logWhatCosts')}</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(112px,1fr))', gap: 10 }}>
            {tiles.map((tile, i) => (
              <div key={i} style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5, padding: 12, borderRadius: 8, border: '1px solid var(--divider-gold)', background: 'rgba(11,20,21,.55)' }}>
                <MetricLabel>{tile.label}</MetricLabel>
                <span className="navrya-tabular" dir="ltr" style={{ font: '500 18px/22px var(--font-num)', color: 'var(--text-primary)', textAlign: 'right' }}>{tile.value}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, paddingTop: 12, borderTop: '1px solid var(--border-hairline)' }}>
            <Button variant="secondary" icon="streak" onClick={trade.onQuickLog} style={{ height: 52, border: '1px solid var(--gold-warm)', background: 'rgba(214,175,107,.1)', color: 'var(--gold-warm)' }}>{t('logQuickLog')}</Button>
            <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{trade.tradeState === 'hunting' ? t('logQuickNoteHunting') : t('logQuickNoteOpen')}</span>
          </div>
        </div>
      </Panel>
    </div>
  );
}

// ============================================================================
// Step 2 - Timeframes
// ============================================================================
function StepTimeframes({ t, types, trade, setField, setTrend }) {
  // Journey H1: this whole step maps to 'trade-wizard's stepForPath step 2 - primaryTimeframe is
  // the only tradeWizardPaths field on it (see ai-process-registry.js's stepForPath groups).
  const timeframeFilled = useAiFieldFill('trade-wizard', 'primaryTimeframe');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <AiMagicFill active={timeframeFilled}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid var(--border-gold)', borderRadius: 12, background: 'rgba(3,8,7,.55)', padding: 16 }}>
          <SectionLabel>{t('logTimeframeTraded')}</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
            {(types.timeframes || []).map((tf) => (
              <button
                key={tf} type="button" onClick={() => setField('primaryTimeframe', tf)} className="navrya-tabular"
                style={{
                  flex: '1 1 100px', minWidth: 0, height: 52, borderRadius: 8, cursor: 'pointer',
                  border: trade.primaryTimeframe === tf ? '2px solid var(--char-accent)' : '1px solid var(--divider-gold)',
                  background: trade.primaryTimeframe === tf ? 'var(--char-active-surface)' : 'rgba(11,20,21,.5)',
                  color: trade.primaryTimeframe === tf ? 'var(--char-accent)' : 'var(--text-muted)',
                  font: '600 19px/22px var(--font-display)', letterSpacing: '.06em',
                  boxShadow: trade.primaryTimeframe === tf ? '0 0 16px var(--char-glow)' : 'none'
                }}
              >{tf}</button>
            ))}
          </div>
        </div>
      </AiMagicFill>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, border: '1px solid var(--border-gold)', borderRadius: 12, background: 'rgba(3,8,7,.55)', padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <SectionLabel>{t('logHowEachReads')}</SectionLabel>
          <span style={{ flex: 1 }} />
          <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{t('logDirectionConviction')}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(360px,1fr))', gap: 12 }}>
          {(types.timeframes || []).map((tf) => {
            const row = trade.trends[tf] || { direction: null, momentumStrength: null, source: 'user' };
            const strength = row.momentumStrength || 1;
            return (
              <div key={tf} style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(11,20,21,.45)' }}>
                <span className="navrya-tabular" style={{ width: 38, flex: 'none', font: '600 16px/20px var(--font-display)', letterSpacing: '.06em', color: 'var(--gold-warm)' }}>{tf}</span>
                <div style={{ display: 'flex', gap: 6, flex: 'none' }}>
                  <button
                    type="button" onClick={() => setTrend(tf, { direction: 'bullish', source: 'user' })} aria-label={t('bullish')}
                    style={{ width: 44, height: 44, display: 'grid', placeItems: 'center', borderRadius: 8, cursor: 'pointer', border: '1px solid ' + (row.direction === 'bullish' ? 'rgba(46,204,113,.55)' : 'var(--divider-gold)'), background: row.direction === 'bullish' ? 'rgba(46,204,113,.14)' : 'rgba(3,8,7,.5)', color: row.direction === 'bullish' ? 'var(--success)' : 'var(--text-disabled)' }}
                  ><Icon name="trending-up" size={17} /></button>
                  <button
                    type="button" onClick={() => setTrend(tf, { direction: 'bearish', source: 'user' })} aria-label={t('bearish')}
                    style={{ width: 44, height: 44, display: 'grid', placeItems: 'center', borderRadius: 8, cursor: 'pointer', border: '1px solid ' + (row.direction === 'bearish' ? 'rgba(255,56,48,.55)' : 'var(--divider-gold)'), background: row.direction === 'bearish' ? 'rgba(255,56,48,.14)' : 'rgba(3,8,7,.5)', color: row.direction === 'bearish' ? 'var(--danger)' : 'var(--text-disabled)' }}
                  ><Icon name="trending-down" size={17} /></button>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <DragSlider value={strength} min={1} max={5} height={34} label={t('logDirectionConviction')} onChange={(v) => setTrend(tf, { momentumStrength: v, source: 'user' })} />
                </div>
                <span className="navrya-tabular" style={{ width: 78, flex: 'none', textAlign: 'end', font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{row.momentumStrength ? convictionLabel(t, row.momentumStrength) : '—'}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Step 3 - What you saw
// ============================================================================
function StepSeen({ t, types, trade, toggleConcept, patterns, togglePattern, patternDraft, setPatternDraft, onAddPattern, setField }) {
  // Journey H1: this step maps to 'trade-wizard's stepForPath step 3 - conceptTags/chartNote are
  // its only tradeWizardPaths fields (linkedPatternIds isn't AI-fillable today).
  const conceptTagsFilled = useAiFieldFill('trade-wizard', 'conceptTags');
  const chartNoteFilled = useAiFieldFill('trade-wizard', 'chartNote');
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'stretch' }}>
      <div style={{ flex: '1.4 1 460px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12, border: '1px solid var(--border-gold)', borderRadius: 12, background: 'rgba(3,8,7,.55)', padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <SectionLabel>{t('conceptTags')}</SectionLabel>
        </div>
        <AiMagicFill active={conceptTagsFilled}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
            {(types.concepts || []).map((tag) => {
              const sel = trade.conceptTags.indexOf(tag) > -1;
              return (
                <button
                  key={tag} type="button" onClick={() => toggleConcept(tag)}
                  style={{ minHeight: 40, boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', border: '1px solid ' + (sel ? 'var(--char-accent)' : 'var(--divider-gold)'), background: sel ? 'var(--char-active-surface)' : 'rgba(11,20,21,.5)', color: sel ? 'var(--char-accent)' : 'var(--text-primary)' }}
                >{sel && <Icon name="check" size={13} />}<span style={{ font: '500 13px/17px var(--font-ui)' }}>{tag}</span></button>
              );
            })}
          </div>
        </AiMagicFill>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, paddingTop: 12, borderTop: '1px solid var(--border-hairline)' }}>
          <SectionLabel>{t('logYourSavedPatterns')}</SectionLabel>
          <span style={{ flex: 1 }} />
          <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{patterns.length ? t('logChosenCount', { count: trade.linkedPatternIds.length }) : t('logPickAnyApplied')}</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
          {patterns.map((p) => {
            const sel = trade.linkedPatternIds.indexOf(p.id) > -1;
            return (
              <button
                key={p.id} type="button" onClick={() => togglePattern(p.id)}
                style={{ flex: '1 1 200px', minWidth: 0, minHeight: 48, boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 9, padding: '10px 14px', borderRadius: 8, cursor: 'pointer', textAlign: 'start', border: '1px solid ' + (sel ? 'var(--char-accent)' : 'var(--divider-gold)'), background: sel ? 'var(--char-active-surface)' : 'rgba(11,20,21,.5)', color: sel ? 'var(--char-accent)' : 'var(--text-primary)', boxShadow: sel ? '0 0 16px var(--char-glow)' : 'none' }}
              >
                <span style={{ width: 18, height: 18, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 4, background: sel ? 'var(--char-accent)' : 'transparent', border: sel ? 'none' : '1px solid var(--divider-gold)', color: 'var(--ink-950)' }}>{sel && <Icon name="check" size={12} />}</span>
                <span style={{ font: '500 14px/19px var(--font-ui)' }}>{p.name}</span>
              </button>
            );
          })}
        </div>
        <span style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 9, alignItems: 'center', paddingTop: 12, borderTop: '1px solid var(--border-hairline)' }}>
          <input
            dir="auto" value={patternDraft} onChange={(e) => setPatternDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onAddPattern(); } }}
            placeholder={t('logSaveNewPatternPlaceholder')}
            style={{ flex: 1, minWidth: 0, height: 44, boxSizing: 'border-box', padding: '0 14px', borderRadius: 8, border: '1px solid var(--divider-gold)', background: 'rgba(3,8,7,.55)', color: 'var(--text-primary)', font: '500 13.5px/19px var(--font-ui)', outline: 'none' }}
          />
          <Button variant="secondary" icon="plus" onClick={onAddPattern}>{t('logSave')}</Button>
        </div>
      </div>
      <AiMagicFill active={chartNoteFilled}>
        <div style={{ flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12, border: '1px solid var(--border-gold)', borderRadius: 12, background: 'rgba(3,8,7,.55)', padding: 16 }}>
          <SectionLabel>{t('logInYourWords')}</SectionLabel>
          <textarea
            dir="auto" value={trade.chartNote} onChange={(e) => setField('chartNote', e.target.value)} placeholder={t('chartNotePlaceholder')}
            style={{ flex: 1, minHeight: 240, boxSizing: 'border-box', padding: 14, borderRadius: 8, border: '1px solid var(--divider-gold)', background: 'rgba(3,8,7,.55)', color: 'var(--text-primary)', font: 'var(--type-body)', lineHeight: '22px', resize: 'none', outline: 'none' }}
          />
          <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{t('logFutureSelfTrust')}</span>
        </div>
      </AiMagicFill>
    </div>
  );
}

// ============================================================================
// Step 4 - Emotions
// ============================================================================
function MoodDetailCard({ t, id, entry, onLevel, onToggleReason, onDraftChange, onDraftCommit, onRemove }) {
  const presets = (TAG_PRESETS[id] || []).map((key) => t(key));
  const custom = (entry.tags || []).filter((tag) => presets.indexOf(tag) === -1);
  const allChips = presets.concat(custom);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, border: '1px solid var(--char-accent)', borderRadius: 12, background: 'rgba(3,8,7,.6)', padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 32, height: 32, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 7, border: '1px solid var(--char-accent)', background: 'var(--char-active-surface)', color: 'var(--char-accent)' }}><Icon name={MOOD_ICONS[id] || 'psychology'} size={16} /></span>
        <span style={{ font: 'var(--type-display-md)', letterSpacing: 'var(--tracking-display)', color: 'var(--char-accent)' }}>{t(id)}</span>
        <span style={{ flex: 1 }} />
        <span style={{ font: 'var(--type-caption)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{severityLabel(t, entry.intensity)}</span>
        <span className="navrya-tabular" style={{ font: '600 26px/28px var(--font-num)', color: 'var(--char-accent)' }}>{entry.intensity}</span>
        <button type="button" onClick={onRemove} aria-label={t('logRemoveFeeling')} style={{ width: 36, height: 36, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 6, cursor: 'pointer', border: '1px solid transparent', background: 'transparent', color: 'var(--text-muted)' }}><Icon name="close" size={15} /></button>
      </div>
      <IntensityBars value={entry.intensity} onChange={onLevel} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <span style={{ font: 'var(--type-caption)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('logBecause')}</span>
        {allChips.map((label) => {
          const sel = (entry.tags || []).indexOf(label) > -1;
          return (
            <button
              key={label} type="button" onClick={() => onToggleReason(label)}
              style={{ height: 36, padding: '0 12px', borderRadius: 6, cursor: 'pointer', border: '1px solid ' + (sel ? 'var(--char-accent)' : 'var(--divider-gold)'), background: sel ? 'var(--char-active-surface)' : 'rgba(11,20,21,.5)', color: sel ? 'var(--char-accent)' : 'var(--text-muted)', font: 'var(--type-caption)' }}
            >{label}</button>
          );
        })}
      </div>
      <input
        dir="auto" value={entry.draft || ''} onChange={(e) => onDraftChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onDraftCommit(); } }}
        placeholder={t('logOwnWay')}
        style={{ height: 44, boxSizing: 'border-box', padding: '0 14px', borderRadius: 8, border: '1px solid var(--divider-gold)', background: 'rgba(3,8,7,.55)', color: 'var(--text-primary)', font: '500 13.5px/19px var(--font-ui)', outline: 'none' }}
      />
    </div>
  );
}

function StepEmotions({ t, mhi18n, types, emotion, setEmotion, breathOpen, onCloseBreath, preTradeContext, setPreTradeContext, thoughtRecord }) {
  const picked = emotion.dominantEmotions;
  function toggleMood(id) {
    if (picked.indexOf(id) > -1) {
      setEmotion((prev) => ({ ...prev, dominantEmotions: prev.dominantEmotions.filter((x) => x !== id), emotionDetails: prev.emotionDetails.filter((d) => d.emotion !== id) }));
      return;
    }
    if (picked.length >= 3) return;
    setEmotion((prev) => ({
      ...prev, dominantEmotions: prev.dominantEmotions.concat([id]),
      emotionDetails: prev.emotionDetails.some((d) => d.emotion === id) ? prev.emotionDetails : prev.emotionDetails.concat([{ emotion: id, intensity: 5, tags: [], draft: '' }])
    }));
  }
  function detailFor(id) { return emotion.emotionDetails.find((d) => d.emotion === id) || { emotion: id, intensity: 5, tags: [], draft: '' }; }
  function updateDetail(id, patch) {
    setEmotion((prev) => ({ ...prev, emotionDetails: prev.emotionDetails.map((d) => (d.emotion === id ? { ...d, ...patch } : d)) }));
  }
  function toggleReason(id, label) {
    const cur = detailFor(id).tags || [];
    updateDetail(id, { tags: cur.indexOf(label) > -1 ? cur.filter((x) => x !== label) : cur.concat([label]) });
  }
  function commitDraft(id) {
    const value = (detailFor(id).draft || '').trim();
    if (!value) return;
    toggleReason(id, value);
    updateDetail(id, { draft: '' });
  }

  const stress = emotion.stressLevel;
  const stressWord = stress <= 3 ? t('logStressSettled') : stress <= 6 ? t('logStressElevated') : t('logStressHot');
  const stressColor = stress <= 3 ? 'var(--success)' : stress <= 6 ? 'var(--warning)' : 'var(--danger)';

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
      <div style={{ flex: '1 1 268px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12, border: '1px solid var(--border-gold)', borderRadius: 12, background: 'rgba(3,8,7,.55)', padding: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <SectionLabel>{t('logWhatFeelNow')}</SectionLabel>
          <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{picked.length ? t('logOfThreeChosen', { count: picked.length }) : t('logUpToThree')}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(112px,1fr))', gap: 8 }}>
          {(types.emotions || []).map((id) => {
            const sel = picked.indexOf(id) > -1;
            return (
              <button
                key={id} type="button" onClick={() => toggleMood(id)}
                style={{ minWidth: 0, height: 48, display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', borderRadius: 8, cursor: 'pointer', border: '1px solid ' + (sel ? 'var(--char-accent)' : 'var(--divider-gold)'), background: sel ? 'var(--char-active-surface)' : 'rgba(11,20,21,.5)', color: sel ? 'var(--char-accent)' : 'var(--text-muted)', boxShadow: sel ? '0 0 16px var(--char-glow)' : 'none' }}
              ><Icon name={MOOD_ICONS[id] || 'psychology'} size={16} /><span style={{ font: '500 13.5px/18px var(--font-ui)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t(id)}</span></button>
            );
          })}
        </div>
      </div>

      <div style={{ flex: '1.5 1 420px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {picked.length === 0 && (
          <div style={{ minHeight: 250, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, border: '1px dashed var(--border-gold)', borderRadius: 12, background: 'rgba(3,8,7,.45)', padding: 24, textAlign: 'center' }}>
            <span style={{ width: 40, height: 40, display: 'grid', placeItems: 'center', borderRadius: 8, border: '1px solid var(--divider-gold)', color: 'var(--gold-warm)' }}><Icon name="psychology" size={20} /></span>
            <span style={{ font: 'var(--type-display-md)', letterSpacing: 'var(--tracking-display)', color: 'var(--text-primary)' }}>{t('logNameToTame')}</span>
            <span style={{ maxWidth: 340, font: 'var(--type-body)', color: 'var(--text-muted)' }}>{t('logPickLeftHint')}</span>
          </div>
        )}
        {picked.map((id) => (
          <MoodDetailCard
            key={id} t={t} id={id} entry={detailFor(id)}
            onLevel={(v) => updateDetail(id, { intensity: v })}
            onToggleReason={(label) => toggleReason(id, label)}
            onDraftChange={(v) => updateDetail(id, { draft: v })}
            onDraftCommit={() => commitDraft(id)}
            onRemove={() => toggleMood(id)}
          />
        ))}
      </div>

      <div style={{ flex: '1 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid var(--border-gold)', borderRadius: 12, background: 'rgba(3,8,7,.55)', padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <SectionLabel>{t('logStressShort')}</SectionLabel>
            <span style={{ flex: 1 }} />
            <span style={{ font: 'var(--type-caption)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{stressWord}</span>
            <span className="navrya-tabular" style={{ font: '600 24px/26px var(--font-num)', color: 'var(--gold-warm)' }}>{stress}</span>
          </div>
          <DragSlider value={stress} min={0} max={10} onChange={(v) => setEmotion((prev) => ({ ...prev, stressLevel: v }))} label={t('logStressShort')} render={{ fill: 'color-mix(in srgb, ' + stressColor + ' 24%, transparent)', line: stressColor }} />
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, paddingTop: 10, borderTop: '1px solid var(--border-hairline)' }}>
            <span style={{ color: 'var(--gold-warm)', display: 'flex' }}><Icon name="moon" size={15} /></span>
            <SectionLabel>{t('logSleepShort')}</SectionLabel>
            <span style={{ flex: 1 }} />
            <span className="navrya-tabular" style={{ font: '600 24px/26px var(--font-num)', color: 'var(--char-accent)' }}>{preTradeContext.sleepQuality}</span>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
              <button
                key={i} type="button" onClick={() => setPreTradeContext((prev) => ({ ...prev, sleepQuality: i }))}
                aria-label={mhi18n ? mhi18n.t('mhSleepQuality') + ' ' + i : String(i)}
                style={{ flex: 1, minWidth: 0, height: 36, borderRadius: 4, cursor: 'pointer', border: '1px solid ' + (i <= preTradeContext.sleepQuality ? 'var(--char-accent)' : 'var(--divider-gold)'), background: i <= preTradeContext.sleepQuality ? 'var(--char-active-surface)' : 'rgba(3,8,7,.5)' }}
              />
            ))}
          </div>
          {mhi18n && (
            <input
              dir="auto" value={preTradeContext.significantPersonalEvent} onChange={(e) => setPreTradeContext((prev) => ({ ...prev, significantPersonalEvent: e.target.value }))}
              placeholder={mhi18n.t('mhSignificantEventPlaceholder')}
              style={{ height: 40, boxSizing: 'border-box', padding: '0 12px', borderRadius: 8, border: '1px solid var(--divider-gold)', background: 'rgba(3,8,7,.5)', color: 'var(--text-primary)', font: 'var(--type-caption)', outline: 'none' }}
            />
          )}
        </div>

        {breathOpen && (
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, border: '1px solid var(--gold-warm)', borderRadius: 12, background: 'rgba(3,8,7,.6)', padding: 18, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
              <SectionLabel>{t('psyBreathingTitle')}</SectionLabel>
              <span style={{ flex: 1 }} />
              <button type="button" onClick={onCloseBreath} aria-label={t('psyBreathingDismiss')} style={{ width: 36, height: 36, display: 'grid', placeItems: 'center', borderRadius: 6, cursor: 'pointer', border: '1px solid transparent', background: 'transparent', color: 'var(--text-muted)' }}><Icon name="close" size={15} /></button>
            </div>
            <span style={{ width: 96, height: 96, borderRadius: '50%', border: '1px solid var(--gold-warm)', background: 'radial-gradient(circle at 50% 50%, rgba(214,175,107,.28), rgba(3,8,7,.2))', animation: 'nv-log-breath 19s ease-in-out infinite', display: 'block' }} />
            <span style={{ font: 'var(--type-body)', color: 'var(--text-primary)', textAlign: 'center' }}>{t('psyBreathingHint')}</span>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, border: '1px solid var(--border-gold)', borderRadius: 12, background: 'rgba(3,8,7,.55)', padding: 16 }}>
          <SectionLabel>{t('logAnythingElse')}</SectionLabel>
          <textarea
            dir="auto" value={emotion.note} onChange={(e) => setEmotion((prev) => ({ ...prev, note: e.target.value }))} placeholder={t('emotionNotePlaceholder')}
            style={{ minHeight: 96, boxSizing: 'border-box', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--divider-gold)', background: 'rgba(3,8,7,.55)', color: 'var(--text-primary)', font: 'var(--type-body)', lineHeight: '21px', resize: 'none', outline: 'none' }}
          />
        </div>

        {thoughtRecord}
      </div>
    </div>
  );
}

// ============================================================================
// Step 5 - Screenshots
// ============================================================================
function StepScreenshots({ t, shots, onPick, onRemoveShot, review }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'stretch' }}>
      <div style={{ flex: '1.3 1 420px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button
          type="button" onClick={onPick}
          style={{ minHeight: 196, boxSizing: 'border-box', width: '100%', padding: 20, borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, cursor: 'pointer', border: '1px dashed var(--border-gold)', background: 'rgba(3,8,7,.45)' }}
        >
          <span style={{ width: 34, height: 34, display: 'grid', placeItems: 'center', borderRadius: 8, color: 'var(--char-accent)', background: 'rgba(3,8,7,.7)', border: '1px solid color-mix(in srgb, var(--char-accent) 60%, transparent)' }}><Icon name="upload" size={17} /></span>
          <span style={{ font: 'var(--type-display-md)', letterSpacing: 'var(--tracking-display)', color: 'var(--parchment)' }}>{t('logScreenshotsTitle')}</span>
          <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('logOptionalFormats')}</span>
        </button>
        {shots.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
            {shots.map((shot, i) => (
              <div key={i} style={{ position: 'relative', borderRadius: 8, border: '1px solid var(--border-gold)', background: 'rgba(11,20,21,.5)', overflow: 'hidden' }}>
                <img src={shot.url} alt="" style={{ width: '100%', height: 104, objectFit: 'cover', display: 'block' }} />
                <span style={{ display: 'block', padding: '8px 10px', font: 'var(--type-caption)', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shot.name}</span>
                <button
                  type="button" onClick={() => onRemoveShot(i)} aria-label={t('logRemoveScreenshot')}
                  style={{ position: 'absolute', insetInlineEnd: 6, top: 6, width: 32, height: 32, display: 'grid', placeItems: 'center', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.8)', color: 'var(--text-muted)' }}
                ><Icon name="trash" size={14} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
      <Panel variant="active" ornament ornamentSize={14} ornamentInset={6} texture textureOpacity={0.05} style={{ flex: '1 1 330px', minWidth: 0, borderColor: 'var(--border-gold-strong)', padding: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <SectionLabel style={{ color: 'var(--char-accent)' }}>{t('logBeforeSeal')}</SectionLabel>
          {review.map((row, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border-hairline)' }}>
              <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{row.label}</span>
              <span style={{ flex: 1 }} />
              <span className="navrya-tabular" dir="ltr" style={{ font: 'var(--type-username)', color: 'var(--text-primary)', textAlign: 'left' }}>{row.value}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================
function TradeLogModal({ seed, options, onClose }) {
  const i18n = window.TradeJournalTradeI18n;
  const tradeStore = window.TradeJournalTradeStore;
  const types = window.TradeJournalTradeTypes || {};
  const t = i18n.t;
  const rtl = i18n.direction() === 'rtl';
  const mhi18n = window.TradeJournalMentalHealthI18n;
  useAssistantMotion();

  const existingRef = React.useRef(seed && seed.id ? tradeStore.find(seed.id) : null);
  const baseTrade = React.useMemo(() => (existingRef.current ? tradeStore.normalize(existingRef.current) : tradeStore.createDraft(seed || {})), []); // eslint-disable-line react-hooks/exhaustive-deps
  const settings = React.useMemo(() => tradeStore.settings(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [step, setStep] = React.useState(1);
  const [selectedStatus, setSelectedStatus] = React.useState(baseTrade.status);
  const [trade, setTrade] = React.useState(() => ({
    tradeState: baseTrade.status === 'open' ? 'open' : 'hunting',
    dir: baseTrade.direction, margin: baseTrade.marginMode,
    entry: baseTrade.entryPrice !== null ? String(baseTrade.entryPrice) : '',
    stop: baseTrade.stopLoss !== null ? String(baseTrade.stopLoss) : '',
    tp: baseTrade.takeProfits[0] ? String(baseTrade.takeProfits[0].price) : '',
    riskPercent: baseTrade.riskPercent !== null ? String(baseTrade.riskPercent) : '',
    riskAmount: baseTrade.riskAmount !== null ? String(baseTrade.riskAmount) : '',
    leverage: baseTrade.leverage !== null ? String(baseTrade.leverage) : '',
    positionSize: baseTrade.positionSize !== null ? String(baseTrade.positionSize) : '',
    balance: settings.accountBalance !== null && settings.accountBalance !== undefined ? String(settings.accountBalance) : '',
    primaryTimeframe: baseTrade.primaryTimeframe || (types.timeframes || [])[2] || null,
    trends: (baseTrade.timeframeTrends || []).reduce((acc, x) => { acc[x.timeframe] = x; return acc; }, {}),
    conceptTags: baseTrade.conceptTags.slice(),
    linkedPatternIds: baseTrade.linkedPatternIds.slice(),
    linkedStrategyId: baseTrade.linkedStrategyId,
    chartNote: baseTrade.chartNote || ''
  }));
  const [strategyId, setStrategyId] = React.useState(baseTrade.linkedStrategyId || '');
  // Accounts domain integration: baseTrade.accountId already carries through from `seed` (the
  // calculator's own handoff, or the AI's normalizeField-resolved value) via createDraft()'s
  // Object.assign-preserving normalize() - see trade-store.js. instrument follows the same path.
  const [accountId, setAccountId] = React.useState(baseTrade.accountId || '');
  const [instrument, setInstrument] = React.useState(baseTrade.instrument || '');
  const [accountError, setAccountError] = React.useState(false);
  const [instrumentError, setInstrumentError] = React.useState(false);
  const [showCreateAccount, setShowCreateAccount] = React.useState(false);
  const [patternDraft, setPatternDraft] = React.useState('');
  const lastEmotion = baseTrade.emotionLog.length ? baseTrade.emotionLog[baseTrade.emotionLog.length - 1] : null;
  const [emotion, setEmotion] = React.useState(() => ({
    dominantEmotions: lastEmotion ? lastEmotion.dominantEmotions.slice() : [],
    emotionDetails: lastEmotion ? lastEmotion.emotionDetails.map((d) => ({ ...d, draft: '' })) : [],
    stressLevel: lastEmotion ? lastEmotion.stressLevel : 5,
    note: lastEmotion ? lastEmotion.note : ''
  }));
  const [preTradeContext, setPreTradeContext] = React.useState({ sleepQuality: 5, significantPersonalEvent: '' });
  const [breathDismissed, setBreathDismissed] = React.useState(false);
  const [shots, setShots] = React.useState([]);
  const [dragging, setDragging] = React.useState(false);
  const [safetyNode, setSafetyNode] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const fileInputRef = React.useRef(null);
  const trendRequestedRef = React.useRef(false);
  const stepRef = React.useRef(step);
  stepRef.current = step;
  // Journey H1: finish() (defined below) closes over this render's own instrument/selectedStatus/
  // accountId/etc - the registration effect below only re-runs when [step] changes, so capturing
  // finish() directly inside it would be exactly the ScenarioEditor-class stale-closure bug this
  // codebase already fixed elsewhere (publishFlowModal.jsx's own submitRef.current = submit
  // convention). Re-assigned every render instead (below, right after finish() is (re)defined).
  const submitRef = React.useRef(null);

  const solved = computeSolved({
    entry: trade.entry, stop: trade.stop, tp: trade.tp, dir: trade.dir, margin: trade.margin,
    riskPercent: trade.riskPercent, riskAmount: trade.riskAmount, leverage: trade.leverage, positionSize: trade.positionSize,
    balance: trade.balance, feeType: baseTrade.commission.feeType, feePercent: baseTrade.commission.feePercent
  });

  function setField(key, value) { setTrade((prev) => ({ ...prev, [key]: value })); }
  function dirManual(dir) { setField('dir', dir); }
  function setTrend(tf, patch) {
    setTrade((prev) => ({ ...prev, trends: { ...prev.trends, [tf]: { ...(prev.trends[tf] || { timeframe: tf, direction: null, momentumStrength: null, source: 'user' }), ...patch } } }));
  }
  function toggleConcept(tag) {
    setTrade((prev) => ({ ...prev, conceptTags: prev.conceptTags.indexOf(tag) > -1 ? prev.conceptTags.filter((x) => x !== tag) : prev.conceptTags.concat([tag]) }));
  }
  function togglePattern(id) {
    setTrade((prev) => ({ ...prev, linkedPatternIds: prev.linkedPatternIds.indexOf(id) > -1 ? prev.linkedPatternIds.filter((x) => x !== id) : prev.linkedPatternIds.concat([id]) }));
  }

  // AI trend analysis - real integration point, defaults to an empty-array stub when no live
  // provider is registered (see trade-ui.js's window.TradeJournalTrendAnalysisProvider), fetched
  // once per wizard session the first time step 2 is visited, and only fills timeframes the
  // trader has not already set a direction for.
  React.useEffect(() => {
    if (step !== 2 || trendRequestedRef.current) return;
    trendRequestedRef.current = true;
    const provider = window.TradeJournalTrendAnalysisProvider;
    if (!provider) return;
    Promise.resolve(provider.analyze(baseTrade)).then((values) => {
      if (!Array.isArray(values) || !values.length) return;
      setTrade((prev) => {
        const trends = { ...prev.trends };
        values.forEach((v) => {
          const cur = trends[v.timeframe];
          if (cur && cur.direction === null) trends[v.timeframe] = { ...cur, direction: v.direction, momentumStrength: v.momentumStrength, source: 'ai' };
        });
        return { ...prev, trends };
      });
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // AI process registry - the global assistant dock can suggest values into this open wizard,
  // same allowlist/applyValue contract trade-ui.js's own openWizard() registers.
  // Journey H1: field -> real wizard step map. accountId/instrument are deliberately left out of
  // every group - they live in the persistent "Session bar" rendered above the per-step body on
  // EVERY step (see this component's own JSX), not inside any one step, so stepForPath() must
  // return null for them (apply wherever the wizard already is, never force a step change).
  // Step 4 (emotions)/Step 5 (screenshots) have no tradeWizardPaths fields at all - dominant
  // emotions/stress/note are a SEPARATE allowlist (trade.types.js's emotionLogPaths), filled
  // through the trade-emotion-log process/trade.emotion.log action instead.
  const wizardStepMap = window.TradeJournalAIWizardStepMap ? window.TradeJournalAIWizardStepMap.forGroups({
    1: ['direction', 'marginMode', 'entryPrice', 'stopLoss', 'riskPercent', 'riskAmount', 'leverage', 'positionSize'],
    2: ['primaryTimeframe'],
    3: ['conceptTags', 'chartNote']
  }) : null;

  React.useEffect(() => {
    const registry = window.TradeJournalAIProcessRegistry;
    if (!registry) return undefined;
    let mounted = true;
    registry.register('trade-wizard', {
      layer: 'foreground',
      allowlist: (types.tradeWizardPaths || []).slice(),
      isOpen: () => mounted,
      activeStep: () => stepRef.current,
      stepForPath: wizardStepMap ? wizardStepMap.stepForPath : null,
      goToStep: goTo,
      // Journey H1: closes the confirmed gap - this process previously had no submit at all, so
      // an AI-driven "log a trade" could fill the wizard but never complete it. Delegates through
      // submitRef (assigned fresh every render, right after finish() itself is defined below) so
      // this always calls the LATEST finish() closure - not a stale one from whatever render this
      // effect (deps [step]) last ran in - the same real save path the "Register" button's own
      // onClick already calls.
      submit: () => submitRef.current && submitRef.current(),
      applyValue: (path, value) => {
        if ((types.tradeWizardPaths || []).indexOf(path) === -1) return;
        if (path === 'conceptTags') { toggleConcept(value); return; }
        if (['entryPrice', 'stopLoss', 'riskPercent', 'riskAmount', 'leverage', 'positionSize'].indexOf(path) > -1) {
          const key = { entryPrice: 'entry', stopLoss: 'stop' }[path] || path;
          setField(key, value === '' || value === null || value === undefined ? '' : String(value));
          return;
        }
        if (path === 'direction') { setField('dir', value); return; }
        if (path === 'marginMode') { setField('margin', value); return; }
        if (path === 'primaryTimeframe') { setField('primaryTimeframe', value); return; }
        if (path === 'chartNote') { setField('chartNote', value); return; }
        if (path === 'accountId') { handleAccount(value || ''); return; }
        if (path === 'instrument') { setInstrument(value || ''); return; }
      }
    });
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pickFile() { if (fileInputRef.current) fileInputRef.current.click(); }
  function handleFiles(list) {
    const files = Array.prototype.slice.call(list || []).filter((f) => /^image\//.test(f.type || ''));
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => setShots((prev) => prev.concat([{ file, url: reader.result, name: file.name }]));
      reader.readAsDataURL(file);
    });
  }

  const strategyStore = window.TradeJournalStrategyEducationStore;
  const activeStrategies = strategyStore ? strategyStore.listActive() : [];
  const strategyOptions = [{ value: '', label: t('noStrategy') }].concat(activeStrategies.map((s) => ({ value: s.id, label: s.name })));
  function handleStrategy(id) {
    setStrategyId(id);
    setField('linkedStrategyId', id || null);
    if (id && strategyStore) {
      const defaults = strategyStore.getRiskDefaults(id);
      if (defaults && defaults.maxRiskPerTradePercent !== null && defaults.maxRiskPerTradePercent !== undefined) {
        setField('riskPercent', String(defaults.maxRiskPerTradePercent));
        setField('riskAmount', '');
        const tradeUi = window.TradeJournalTradeUI;
        if (tradeUi) tradeUi.toast(t('strategyRiskLoaded'), 'success');
      }
    }
  }

  const accountsStore = window.TradeJournalAccountsStore;
  const activeAccounts = accountsStore ? accountsStore.listActive() : [];
  // Once at least one active account exists, "No account" is a misleading normal-path option
  // (defect #1) - it disappears from the list entirely rather than staying selectable.
  const accountOptions = activeAccounts.length
    ? activeAccounts.map((a) => ({ value: a.id, label: a.firm }))
    : [{ value: '', label: t('noAccount') }];
  // Only a brand-new trade (never yet saved) is gated - an already-existing trade (this wizard
  // re-opened to edit a hunting/open trade, possibly a legacy one with accountId already null)
  // is never retroactively forced to pick one.
  const accountRequired = !existingRef.current && activeAccounts.length > 0 && !accountId;
  // Instrument Catalog domain: mandatory for every brand-new trade (the server enforces this too
  // - INSTRUMENT_REQUIRED) - never retroactively forced onto a pre-existing trade being edited.
  const instrumentRequired = !existingRef.current && !instrument;
  // BUG FIX (defect #2, found via real browser verification): this handler pre-filled riskPercent
  // from the account's own rule but never touched `balance` at all - unlike
  // tradeCalculatorModal.jsx's own handleAccount() (which does `setBalance(String(metrics.equity))`
  // unconditionally), picking an account here left step 1's Account Balance field exactly as it
  // was (usually still the global Trade Settings default), so riskAmount/positionSize kept
  // deriving from the WRONG balance even after a real account was selected - the exact
  // double-counting/wrong-equity failure defect #2 exists to prevent. Now mirrors the Calculator
  // exactly: balance is always refreshed to the account's own real computed equity
  // (accounts-engine.js's computeMetrics - starting balance + that account's own real closed
  // trades) the moment an account is chosen, same as riskPercent's own pre-fill-only-not-locked
  // contract below.
  function handleAccount(id) {
    setAccountId(id);
    const engine = window.TradeJournalAccountsEngine;
    if (!id || !accountsStore || !engine) return;
    const account = accountsStore.find(id);
    if (!account) return;
    const trades = tradeStore ? tradeStore.listSync() : [];
    const metrics = engine.computeMetrics(account, trades);
    setField('balance', String(metrics.equity));
    const maxRisk = account.rules && account.rules.maxRiskPerTradePercent;
    if (maxRisk !== null && maxRisk !== undefined && !trade.riskPercent && !trade.riskAmount) {
      setField('riskPercent', String(maxRisk));
      const tradeUi = window.TradeJournalTradeUI;
      if (tradeUi) tradeUi.toast(t('accountRiskLoaded'), 'success');
    }
  }

  // Instrument Catalog domain: patterns are scoped to this trade's own instrument via
  // listForInstrument() - a pattern never valid for this instrument must never be offered.
  const patternStore = window.TradeJournalPatternStore;
  const patterns = patternStore && instrument ? patternStore.listForInstrument(instrument) : [];
  function onAddPattern() {
    const name = patternDraft.trim();
    if (!name || !patternStore || !instrument) return;
    const existing = patterns.find((p) => p.name === name);
    let pattern = existing;
    if (!pattern) {
      // A quick-created pattern inherits the active instrument - never persisted unassigned.
      pattern = patternStore.create([instrument]);
      if (!pattern) return;
      pattern.name = name;
      pattern = patternStore.save(pattern);
    }
    setPatternDraft('');
    // togglePattern's own setState is what triggers the re-render that picks up the freshly
    // saved pattern from patternStore.listForInstrument() on the next render.
    if (trade.linkedPatternIds.indexOf(pattern.id) === -1) togglePattern(pattern.id);
  }

  const psyStore = window.TradeJournalPsychologyStore;
  const breathing = psyStore ? psyStore.settings().breathing : null;
  const breathOpen = !!(breathing && breathing.enabled && !breathDismissed && emotion.stressLevel >= breathing.stressThreshold);

  // Thought-record block - ported from trade-ui.js's thoughtRecordBlock(), same conditional
  // (shown only when the mental-health profile has an identified cognitive bias) and same real
  // mh.commitDraftThoughtRecord()/safety-gate save path, wrapped as a native <details> like the
  // legacy DOM version.
  const mh = window.TradeJournalMentalHealthStore;
  const mhSafety = window.TradeJournalMentalHealthSafety;
  const cognitiveBias = React.useMemo(() => {
    if (!mh) return null;
    const profile = mh.load();
    return (profile.cognitiveProfile.identifiedBiases || []).find((b) => b.cyclePhase === 'cognitive') || null;
  }, [mh]);
  const [thoughtDraft, setThoughtDraft] = React.useState({ automaticThought: '', evidenceFor: '', evidenceAgainst: '', balancedThought: '' });
  const [thoughtSafety, setThoughtSafety] = React.useState(null);
  const [thoughtSaved, setThoughtSaved] = React.useState(false);
  function saveThoughtRecord() {
    const combined = [thoughtDraft.automaticThought, thoughtDraft.evidenceFor, thoughtDraft.evidenceAgainst, thoughtDraft.balancedThought].join(' ');
    if (mhSafety && mhSafety.checkText(combined).flagged) { setThoughtSafety(mhSafety.renderSafetyCard(() => setThoughtSafety(null))); return; }
    let profile = mh.load();
    profile.cognitiveProfile.draftThoughtRecord = { ...thoughtDraft };
    profile = mh.save(profile);
    mh.commitDraftThoughtRecord(profile, baseTrade.id, cognitiveBias.type);
    const tradeUi = window.TradeJournalTradeUI;
    if (tradeUi) tradeUi.toast(mhi18n.t('mhThoughtRecordSaved'), 'success');
    setThoughtSaved(true);
  }
  const thoughtRecordEl = cognitiveBias && mhi18n ? (
    <details style={{ border: '1px solid var(--border-gold)', borderRadius: 12, background: 'rgba(3,8,7,.55)', padding: 16 }}>
      <summary style={{ cursor: 'pointer', font: 'var(--type-section-label)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--gold-warm)' }}>{mhi18n.t('mhThoughtRecordTitle')}</summary>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
        <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{mhi18n.t('mhOptionalReflection')}</span>
        {[['automaticThought', 'mhAutomaticThought'], ['evidenceFor', 'mhEvidenceFor'], ['evidenceAgainst', 'mhEvidenceAgainst'], ['balancedThought', 'mhBalancedThought']].map(([key, labelKey]) => (
          <textarea
            key={key} dir="auto" rows={2} value={thoughtDraft[key]} placeholder={mhi18n.t(labelKey)}
            onChange={(e) => { setThoughtSaved(false); setThoughtDraft((prev) => ({ ...prev, [key]: e.target.value })); }}
            style={{ boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--divider-gold)', background: 'rgba(3,8,7,.55)', color: 'var(--text-primary)', font: 'var(--type-body)', resize: 'vertical', outline: 'none' }}
          />
        ))}
        {thoughtSafety && <SafetyCardHost node={thoughtSafety} />}
        <Button variant="secondary" icon="check" onClick={saveThoughtRecord} disabled={thoughtSaved}>{thoughtSaved ? t('saved') : mhi18n.t('mhSaveThoughtRecord')}</Button>
      </div>
    </details>
  ) : null;

  // Merges the local emotion draft into trade.emotionLog exactly like the legacy wizard's own
  // Next-button handler: only if something was actually picked or written, replacing the last
  // entry when editing an existing trade, otherwise appending a fresh one.
  function mergeEmotionIntoTrade() {
    const has = emotion.dominantEmotions.length || emotion.note;
    if (!has) return null;
    const cleanDetails = emotion.emotionDetails.map(({ draft, ...rest }) => rest);
    if (existingRef.current && baseTrade.emotionLog.length) {
      const log = baseTrade.emotionLog.slice();
      log[log.length - 1] = { ...log[log.length - 1], dominantEmotions: emotion.dominantEmotions, emotionDetails: cleanDetails, stressLevel: emotion.stressLevel, note: emotion.note };
      return log;
    }
    if (!baseTrade.emotionLog.length) {
      return baseTrade.emotionLog.concat([{ id: tradeStore.uid('emotion'), timestamp: tradeStore.now(), stage: 'entry', dominantEmotions: emotion.dominantEmotions, emotionDetails: cleanDetails, stressLevel: emotion.stressLevel, note: emotion.note, focusQuality: 5, planCommitment: 5, wouldTakeIfNotForced: null }]);
    }
    return baseTrade.emotionLog;
  }

  function buildTradeForSave(status, entryMode) {
    baseTrade.status = status;
    baseTrade.entryMode = entryMode;
    baseTrade.direction = trade.dir;
    baseTrade.marginMode = trade.margin;
    baseTrade.entryPrice = toNum(trade.entry);
    baseTrade.stopLoss = toNum(trade.stop);
    baseTrade.takeProfits = toNum(trade.tp) !== null ? [{ price: toNum(trade.tp), portionPercent: 100 }] : [];
    baseTrade.riskPercent = toNum(trade.riskPercent);
    baseTrade.riskAmount = toNum(trade.riskAmount);
    baseTrade.leverage = toNum(trade.leverage);
    baseTrade.positionSize = toNum(trade.positionSize);
    baseTrade.primaryTimeframe = trade.primaryTimeframe;
    baseTrade.timeframeTrends = (types.timeframes || []).map((tf) => trade.trends[tf] || { timeframe: tf, direction: null, momentumStrength: null, source: 'user' });
    baseTrade.conceptTags = trade.conceptTags;
    baseTrade.linkedPatternIds = trade.linkedPatternIds;
    baseTrade.linkedStrategyId = trade.linkedStrategyId;
    baseTrade.accountId = accountId || null;
    baseTrade.instrument = instrument || null;
    baseTrade.chartNote = trade.chartNote;
    const merged = mergeEmotionIntoTrade();
    if (merged) baseTrade.emotionLog = merged;
    const calc = window.TradeJournalTradeCalculator;
    const tradeUi = window.TradeJournalTradeUI;
    const source = {
      direction: baseTrade.direction, marginMode: baseTrade.marginMode, entryPrice: baseTrade.entryPrice, stopLoss: baseTrade.stopLoss,
      slDistancePercent: baseTrade.slDistancePercent, riskPercent: baseTrade.riskPercent, riskAmount: baseTrade.riskAmount, leverage: baseTrade.leverage,
      // Real bug fix (defect #2, found via real browser/code audit): this used to read
      // settings.accountBalance (the global Trade Settings default) here, ignoring both
      // whatever the trader actually typed/left in step 1's own visible balance field AND the
      // selected account's real derived equity that handleAccount() already pre-filled into it -
      // the wizard's own live preview and the trade actually SAVED could silently disagree.
      // trade.balance (state) is the single source of truth for this save, exactly as it already
      // is for the step 1 preview and for the identical accountBalance:toNum(f.balance) pattern
      // used elsewhere in this same file for a screenshot-extracted draft.
      positionSize: baseTrade.positionSize, marginRequired: baseTrade.marginRequired, accountBalance: toNum(trade.balance),
      takeProfits: baseTrade.takeProfits, feeType: baseTrade.commission.feeType, feePercent: baseTrade.commission.feePercent
    };
    const manual = new Set();
    ['entryPrice', 'stopLoss', 'riskPercent', 'riskAmount', 'leverage', 'positionSize', 'marginRequired'].forEach((k) => { if (source[k] !== null && source[k] !== undefined) manual.add(k); });
    // Deliberately deviates from trade-ui.js's legacy solveTrade(), which never locks
    // accountBalance and so never actually derives riskAmount from riskPercent x balance at
    // save time either - invisible before since the wizard never previewed the number, but
    // would now save a trade whose riskAmount contradicts what step 1's live preview just
    // showed. Locking it here keeps the saved trade consistent with that preview.
    if (source.accountBalance !== null && source.accountBalance !== undefined) manual.add('accountBalance');
    return tradeUi.applyCalculatedToTrade(baseTrade, calc.solve(source, manual, { feePercent: source.feePercent }), source);
  }

  function quickLog() {
    if (accountRequired) { setAccountError(true); return; }
    if (instrumentRequired) { setInstrumentError(true); return; }
    let saved = buildTradeForSave(trade.tradeState, 'quick');
    saved.disciplineImpact = -1;
    saved = tradeStore.save(saved);
    const tradeUi = window.TradeJournalTradeUI;
    if (tradeUi) tradeUi.toast(t('saved'), 'success');
    onClose();
    if (options && options.onSave) options.onSave(saved);
  }

  function finish() {
    if (saving) return;
    if (accountRequired) { setAccountError(true); return; }
    if (instrumentRequired) { setInstrumentError(true); return; }
    setSaving(true);
    let saved = buildTradeForSave(selectedStatus, 'full');
    saved = tradeStore.save(saved);
    if (mh && (preTradeContext.sleepQuality !== 5 || preTradeContext.significantPersonalEvent)) {
      mh.addPreTradeContext(mh.load(), saved.id, { sleepQuality: preTradeContext.sleepQuality, significantPersonalEvent: preTradeContext.significantPersonalEvent || null });
    }
    const filesToUpload = shots.map((s) => s.file);
    const promise = filesToUpload.length ? tradeStore.addScreenshots(saved.id, filesToUpload) : Promise.resolve(saved);
    // Journey H1: return the chain (previously fire-and-forget, its result discarded by the one
    // existing caller, goNext()) so ai-process-registry.js's submit() - and, through it,
    // ai-workflow-engine.js's action.resultContext() - can receive the real saved trade once
    // trade.wizard wires this in as its own submit. No change in behavior for the human "Register"
    // button, which already ignored finish()'s return value.
    return promise.then((value) => {
      const urlData = (url) => (url.indexOf('data:') === 0 ? Promise.resolve(url) : fetch(url).then((r) => r.blob()).then((blob) => new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result || '')); reader.readAsDataURL(blob); })));
      if (!value.screenshots.length) return value;
      return Promise.all(value.screenshots.slice(0, 4).map((item) => tradeStore.screenshotUrl(item).then((url) => (url ? urlData(url) : ''))))
        .then((images) => fetch('/api/trades/analyze', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            language: i18n.language(),
            trade: { direction: value.direction, entryPrice: value.entryPrice, stopLoss: value.stopLoss, takeProfits: value.takeProfits, riskPercent: value.riskPercent, rr: value.rr, primaryTimeframe: value.primaryTimeframe, timeframeTrends: value.timeframeTrends, conceptTags: value.conceptTags, linkedPatternIds: value.linkedPatternIds, linkedStrategyId: value.linkedStrategyId, chartNote: value.chartNote },
            images
          })
        })).then((res) => (res.ok ? res.json() : null)).then((result) => {
          if (!result) return value;
          value.aiInitialAnalysis = result;
          return tradeStore.save(value);
        }).catch(() => value);
    }).then((value) => {
      const tradeUi = window.TradeJournalTradeUI;
      if (tradeUi) tradeUi.toast(existingRef.current ? t('updated') : t('saved'), 'success');
      setSaving(false);
      onClose();
      if (options && options.onSave) options.onSave(value);
      return value;
    }).catch(() => {
      setSaving(false);
      const tradeUi = window.TradeJournalTradeUI;
      if (tradeUi) tradeUi.toast(t('uploadError'), 'danger');
    });
  }
  // Re-captured every render (finish() closes over instrument/selectedStatus/accountId/etc, all
  // of which can change after the trade-wizard registration effect above last ran) - same
  // stale-closure-avoidance convention as publishFlowModal.jsx's own submitRef.current = submit.
  submitRef.current = finish;

  function goNext() {
    if (step === 4) {
      const has = emotion.dominantEmotions.length || emotion.note;
      if (has && mhSafety && mhSafety.checkText(emotion.note).flagged) {
        setSafetyNode(mhSafety.renderSafetyCard(() => setSafetyNode(null)));
      }
    }
    if (step >= TOTAL_STEPS) { finish(); return; }
    setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  }
  function goBack() { setStep((s) => Math.max(1, s - 1)); }
  function goTo(n) { setStep(Math.max(1, Math.min(TOTAL_STEPS, n))); }

  const review = [
    { label: t('logReviewState'), value: trade.tradeState === 'hunting' ? t('hunting') : t('tradeOpened') },
    { label: t('direction'), value: t(trade.dir) + ' · ' + t(trade.margin) },
    { label: t('logReviewEntryStop'), value: (trade.entry || '—') + ' / ' + (trade.stop || '—') },
    { label: t('calcRiskToReward'), value: solved.valid && solved.r.rr !== null && solved.r.rr !== undefined && solved.r.rr > 0 ? '1 : ' + fmtMoney(i18n, solved.r.rr, 2) : '—' },
    { label: t('primaryTimeframe'), value: trade.primaryTimeframe || '—' },
    { label: t('logReviewPatternsLabel'), value: trade.linkedPatternIds.length ? t('logChosenCount', { count: trade.linkedPatternIds.length }) : t('logNoneAttached') },
    { label: t('logReviewFeelings'), value: emotion.dominantEmotions.length ? emotion.dominantEmotions.map((id) => t(id)).join(' · ') : t('logNotRecorded') },
    { label: t('logReviewStressSleep'), value: emotion.stressLevel + ' / ' + preTradeContext.sleepQuality },
    { label: t('screenshots'), value: shots.length ? t('logAttachedCount', { count: shots.length }) : t('logNoneAttached') }
  ];

  const stepList = STEP_KEYS.map((key, i) => ({ n: i + 1, label: t(key), done: i + 1 < step, current: i + 1 === step, idle: i + 1 > step }));
  const footNote = step === TOTAL_STEPS ? t('logScreenshotsOptionalFoot') : t('logNothingSavedYet');

  return (
    <div
      dir={rtl ? 'rtl' : 'ltr'}
      style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, boxSizing: 'border-box', background: 'var(--scrim)', backdropFilter: 'blur(6px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <style>{'@keyframes nv-log-breath{0%{transform:scale(.62);opacity:.55}21%{transform:scale(1);opacity:1}58%{transform:scale(1);opacity:1}100%{transform:scale(.62);opacity:.55}}'}</style>
      <Panel
        variant="prestige" radius={12} ornament ornamentSize={16} ornamentInset={6}
        role="dialog" aria-modal="true" aria-label={t('logTrade')}
        style={{ width: 'min(1380px,100%)', maxHeight: 'calc(100vh - 48px)', background: 'var(--ink-900)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onMouseDown={(e) => e.stopPropagation()}
        onDragOver={(e) => { e.preventDefault(); if (!dragging) setDragging(true); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer && e.dataTransfer.files); }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', flexWrap: 'wrap' }}>
            <span style={{ width: 44, height: 44, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 8, border: '1px solid var(--char-accent)', background: 'var(--char-active-surface)', color: 'var(--char-accent)' }}><Icon name="new-session" size={22} /></span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
              <span style={{ font: 'var(--type-section-label)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('logEyebrow')}</span>
              <h2 style={{ margin: 0, font: 'var(--type-display-lg)', letterSpacing: 'var(--tracking-display)', color: 'var(--text-primary)' }}>{t('logTrade')}</h2>
            </div>
            <span style={{ flex: 1 }} />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <span className="navrya-tabular" dir="ltr" style={{ font: 'var(--type-countdown)', color: 'var(--gold-warm)' }}>{t('logStepOf', { step: step, total: TOTAL_STEPS })}</span>
              <span style={{ font: 'var(--type-caption)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t(STEP_KEYS[step - 1])}</span>
            </div>
            <button type="button" onClick={onClose} aria-label={t('close')} style={{ width: 44, height: 44, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border-gold)', background: 'rgba(11,20,21,.72)', color: 'var(--text-muted)' }}><Icon name="close" size={18} /></button>
          </div>

          {/* Step nav */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 20px 14px' }}>
            {stepList.map((s) => (
              <button
                key={s.n} type="button" onClick={() => goTo(s.n)}
                style={{
                  flex: 1, minWidth: 0, height: 44, display: 'flex', alignItems: 'center', gap: 9, padding: '0 12px', borderRadius: 8, cursor: s.current ? 'default' : 'pointer',
                  border: s.current ? '2px solid var(--char-accent)' : s.done ? '1px solid var(--char-accent)' : '1px solid var(--divider-gold)',
                  background: s.current || s.done ? 'var(--char-active-surface)' : 'rgba(11,20,21,.5)',
                  color: s.current ? 'var(--text-primary)' : s.done ? 'var(--char-accent)' : 'var(--text-muted)',
                  boxShadow: s.current ? '0 0 16px var(--char-glow)' : 'none'
                }}
              >
                {s.done
                  ? <span style={{ width: 20, height: 20, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: '50%', background: 'var(--char-accent)', color: 'var(--ink-950)' }}><Icon name="check" size={13} /></span>
                  : <span className="navrya-tabular" style={{ width: 20, height: 20, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: '50%', border: '1px solid ' + (s.current ? 'var(--char-accent)' : 'var(--divider-gold)'), color: s.current ? 'var(--char-accent)' : 'inherit', font: '600 11px/11px var(--font-ui)' }}>{s.n}</span>}
                <span style={{ font: 'var(--type-section-label)', letterSpacing: '.1em', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
              </button>
            ))}
          </div>

          {/* Session bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px', borderTop: '1px solid var(--border-hairline)', borderBottom: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.5)', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--gold-warm)', display: 'flex' }}><Icon name="sessions" size={16} /></span>
            <span style={{ font: 'var(--type-caption)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('currentSession')}</span>
            <span style={{ font: 'var(--type-username)', letterSpacing: '.06em', color: 'var(--char-accent)' }}>{tradeSessionLabel(baseTrade.session)}</span>
            <span style={{ width: 1, height: 16, background: 'var(--divider-gold)' }} />
            <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--success)' }} />
              <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('autoDetected')}</span>
            </span>
            <span style={{ flex: 1 }} />
            <span style={{ font: 'var(--type-caption)', letterSpacing: '.12em', textTransform: 'uppercase', color: accountError && accountRequired ? 'var(--danger)' : 'var(--text-muted)' }}>{t('account')}{activeAccounts.length && !existingRef.current ? ' *' : ''}</span>
            {activeAccounts.length ? (
              <Select value={accountId} options={accountOptions} onChange={(id) => { setAccountError(false); handleAccount(id); }} icon="wallet" width={200} placeholder={t('chooseAccount')} />
            ) : (
              <Button variant="secondary" size="sm" icon="wallet" onClick={() => setShowCreateAccount(true)}>{t('setUpFirstAccount')}</Button>
            )}
            <span style={{ font: 'var(--type-caption)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('strategy')}</span>
            <Select value={strategyId} options={strategyOptions} onChange={handleStrategy} icon="strategies" width={220} />
            <span style={{ font: 'var(--type-caption)', letterSpacing: '.12em', textTransform: 'uppercase', color: instrumentError ? 'var(--danger)' : 'var(--text-muted)' }}>{t('instrument')} *</span>
            {/* Instrument Catalog domain: locked read-only once sourced from a Session - a Trade
                sourced from a Session must match its instrument exactly (repo.pg.mjs's
                TRADE_SESSION_INSTRUMENT_MISMATCH), never re-typed to something else here. */}
            <InstrumentPicker
              value={instrument || null} onChange={(v) => { setInstrumentError(false); setInstrument(v || ''); }}
              disabled={!!(baseTrade.source && baseTrade.source.sessionId)} width={140}
            />
          </div>
          {accountError && accountRequired && (
            <div style={{ padding: '10px 20px 0' }}>
              <Notice tone="danger" icon="close">{t('accountRequiredError')}</Notice>
            </div>
          )}
          {instrumentError && (
            <div style={{ padding: '10px 20px 0' }}>
              <Notice tone="danger" icon="close">{t('instrumentRequiredError')}</Notice>
            </div>
          )}

          {/* Body */}
          <div className="navrya-scroll" style={{ minHeight: 300, maxHeight: '58vh', boxSizing: 'border-box', padding: 18, background: 'var(--ink-950)', overflowY: 'auto' }}>
            {step === 1 && <StepStatus t={t} i18n={i18n} trade={{ ...trade, onQuickLog: quickLog }} setField={setField} solved={solved} dirManual={dirManual} />}
            {step === 2 && <StepTimeframes t={t} types={types} trade={trade} setField={setField} setTrend={setTrend} />}
            {step === 3 && <StepSeen t={t} types={types} trade={trade} toggleConcept={toggleConcept} patterns={patterns} togglePattern={togglePattern} patternDraft={patternDraft} setPatternDraft={setPatternDraft} onAddPattern={onAddPattern} setField={setField} />}
            {step === 4 && (
              <>
                {safetyNode && <div style={{ marginBottom: 12 }}><SafetyCardHost node={safetyNode} /></div>}
                <StepEmotions
                  t={t} mhi18n={mhi18n} types={types} emotion={emotion} setEmotion={setEmotion}
                  breathOpen={breathOpen} onCloseBreath={() => setBreathDismissed(true)}
                  preTradeContext={preTradeContext} setPreTradeContext={setPreTradeContext}
                  thoughtRecord={thoughtRecordEl}
                />
              </>
            )}
            {step === 5 && <StepScreenshots t={t} shots={shots} onPick={pickFile} onRemoveShot={(i) => setShots((prev) => prev.filter((_, j) => j !== i))} review={review} />}
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', flexWrap: 'wrap' }}>
            {step > 1 && <Button variant="ghost" icon="collapse" onClick={goBack}>{t('previous')}</Button>}
            {step === 1 && <Button variant="ghost" icon="close" onClick={onClose}>{t('cancel')}</Button>}
            <span style={{ flex: 1 }} />
            <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-disabled)', marginInlineEnd: 6 }}>{footNote}</span>
            {step < TOTAL_STEPS && <Button variant="primary" iconAfter="expand" onClick={goNext}>{t('next')}</Button>}
            {step === TOTAL_STEPS && <Button variant="primary" icon="check" onClick={finish} disabled={saving}>{t('registerWithAnalysis')}</Button>}
          </div>
        </div>

        <input
          type="file" accept="image/png,image/jpeg,image/webp" multiple ref={fileInputRef}
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
          tabIndex={-1} aria-hidden="true" style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
        />
        {dragging && (
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(3,8,7,.84)', pointerEvents: 'none' }}>
            <div style={{ width: 'min(420px,74%)', boxSizing: 'border-box', padding: 26, borderRadius: 10, border: '1px dashed var(--char-accent)', background: 'rgba(3,8,7,.6)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 34, height: 34, display: 'grid', placeItems: 'center', borderRadius: 8, color: 'var(--char-accent)', background: 'rgba(3,8,7,.7)', border: '1px solid var(--char-accent)' }}><Icon name="upload" size={18} /></span>
              <span style={{ font: 'var(--type-display-md)', letterSpacing: 'var(--tracking-display)', color: 'var(--parchment)' }}>{t('logDropScreenshots')}</span>
              <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('logAttachToTrade')}</span>
            </div>
          </div>
        )}
      </Panel>
      {showCreateAccount && (
        <ManualAccountModal
          lang={document.documentElement.lang || 'fa'} editing={null}
          onClose={() => setShowCreateAccount(false)}
          onSaved={(id) => { setShowCreateAccount(false); setAccountError(false); handleAccount(id); }}
        />
      )}
    </div>
  );
}

function tradeSessionLabel(value) {
  return { tokyo: 'Tokyo', london: 'London', newyork: 'New York', sydney: 'Sydney' }[value] || value;
}

export function openLogWizard(seed, options) {
  const i18n = window.TradeJournalTradeI18n;
  const tradeStore = window.TradeJournalTradeStore;
  const calc = window.TradeJournalTradeCalculator;
  if (!i18n || !tradeStore || !calc) return;
  const container = document.createElement('div');
  container.dataset.character = currentNavryaCharacter();
  document.body.append(container);
  const root = createRoot(container);
  function close() { root.unmount(); container.remove(); }
  root.render(<TradeLogModal seed={seed} options={options} onClose={close} />);
}
