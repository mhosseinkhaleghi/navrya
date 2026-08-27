import React from 'react';
import { createRoot } from 'react-dom/client';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { CharacterPortrait } from '../public/pages/shared/navrya/components/identity/CharacterPortrait.jsx';
import { QuoteCard } from '../public/pages/shared/navrya/components/cards/QuoteCard.jsx';
import { AiMagicFill } from '../public/pages/shared/navrya/components/feedback/AiMagicFill.jsx';
import { useAiFieldFill } from '../public/pages/shared/navrya/hooks/useAiFieldFill.js';
import { CHARACTERS } from './characters.js';
import { currentNavryaCharacter } from './currentCharacter.js';

// ============================================================================
// Data tables - option keys/icons mirror the design handoff (TradingIntake.dc.html) mapped onto
// the real mental-health-store.js field taxonomy (see mental-health-i18n.js for every mh* key
// used below; this file adds no i18n keys of its own beyond what the vanilla wizard already did).
// ============================================================================
const AGE_MIN = 16, AGE_MAX = 80, AGE_TICK = 26;

const SCENARIOS = [
  { id: 'A_stop_loss', measuresConstruct: 'loss_aversion_discipline', choices: [['move_stop_back', 'move-horizontal'], ['wait_it_hits', 'clock'], ['quick_reanalysis', 'search'], ['pray', 'sparkle']] },
  { id: 'B_revenge', measuresConstruct: 'revenge_trading', slider: true, sliderLeft: 'mhScenarioBCalm', sliderRight: 'mhScenarioBAngry', heatQuestion: 'mhHeatQuestionB', choices: [['sleep', 'moon'], ['open_to_recover', 'rotate-ccw'], ['journal', 'edit'], ['other', 'more']], hasFreeText: true },
  { id: 'C_fomo', measuresConstruct: 'fomo', choices: [['disciplined_no_stop', 'honour'], ['was_clear_should_enter', 'zap'], ['next_time_for_sure', 'rotate-ccw'], ['no_fomo_repeat', 'shield-check']] },
  { id: 'D_patience', measuresConstruct: 'overtrading_patience', slider: true, sliderLeft: 'mhScenarioDEasy', sliderRight: 'mhScenarioDHard', heatQuestion: 'mhHeatQuestionD', choices: [['wait', 'hourglass'], ['open_test_trade', 'flask-conical'], ['lower_timeframe_for_stop', 'search'], ['exit_market', 'door-open']] },
  { id: 'E_identity', measuresConstruct: 'identity_outcome_fusion', choices: [['bad_month_review_system', 'clipboard-check'], ['not_made_for_trading', 'cloud-rain'], ['market_manipulated', 'shield-alert'], ['must_change_strategy', 'strategies'], ['only_losing_thats_all', 'moon']] }
];
const MOTIVATIONS = [['quick_money', 'zap'], ['freedom', 'key'], ['complexity_challenge', 'puzzle'], ['escape_job', 'door-open'], ['social_influence', 'users'], ['analytical_confidence', 'compass']];
const LOSS_REACTIONS = [['revenge_same_day', 'rotate-ccw'], ['shock_avoidance', 'eye-off'], ['analytical_review', 'clipboard-check'], ['anxiety_worry', 'cloud-rain'], ['blame_market', 'honour'], ['sought_support', 'message-circle']];
const CAPITAL_TYPES = [['surplus', 'coins'], ['essential', 'shield-alert'], ['mixed', 'scale']];
const GENDERS = [['male', 'user'], ['female', 'user-round'], ['prefer_not_to_say', 'eye-off']];
const MARITAL_STATUSES = [['single', 'user'], ['married', 'users'], ['divorced', 'unlink'], ['widowed', 'heart-crack'], ['prefer_not_to_say', 'eye-off']];
const OCCUPATION_TYPES = [['full_time_trader', 'execution'], ['part_time_trader', 'clock'], ['employed', 'briefcase'], ['self_employed', 'store'], ['student', 'graduation-cap'], ['retired', 'armchair'], ['other', 'more']];
const MARKET_PRESETS = ['forex', 'crypto', 'stocks', 'commodities', 'indices', 'futures_options'];

const CHAPTER_STEPS = [[1], [2, 3, 4], [5, 6, 7], [8, 9, 10, 11, 12], [13]];
const CHAPTER_KEYS = ['mhChapterOrientation', 'mhChapterContext', 'mhChapterHistory', 'mhChapterScenarios', 'mhChapterSeal'];
const TOTAL_STEPS = 13;

// Per-language display titles, keyed by this app's character id (not the design system's
// navryaCharacter id - sage's navryaCharacter is "master", see characters.js). Previously
// English-only/uppercase regardless of UI language (ported verbatim from the vanilla wizard's
// own CHAR_META table) - every other character-identity surface in the app translates this same
// title (see navrya-src/i18n.js's charTitle), so this one now does too.
const CHAR_TITLE = {
  hunter: { en: 'THE HUNTER', fa: 'شکارچی', ar: 'الصياد', es: 'EL CAZADOR' },
  engineer: { en: 'THE MARKET ENGINEER', fa: 'مهندس بازار', ar: 'مهندس السوق', es: 'EL INGENIERO DE MERCADO' },
  commander: { en: 'THE COMMANDER', fa: 'فرمانده', ar: 'القائد', es: 'EL COMANDANTE' },
  sage: { en: 'THE MARKET SAGE', fa: 'استاد بزرگ بازار', ar: 'الحكيم الأعظم للسوق', es: 'EL GRAN SABIO DEL MERCADO' }
};

// Deterministic decorative visuals (stop-loss/patience candlesticks, FOMO bars, losing-month
// grid) - ported from the design handoff. Pure display, seeded so every trader sees the same
// illustrative scene; nothing here is collected as data.
function seededCandles(seed, n, drift, vol) {
  let x = seed, price = 100;
  const out = [];
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    const r = ((x >> 9) % 1000) / 1000 - 0.5;
    const open = price;
    price = price + drift + r * vol;
    out.push({ o: open, c: price, hi: Math.max(open, price) + Math.abs(r) * vol * 0.7, lo: Math.min(open, price) - Math.abs(r) * vol * 0.7 });
  }
  return out;
}
function layoutCandles(raw, pad) {
  const his = raw.map((c) => c.hi), los = raw.map((c) => c.lo);
  const hi = Math.max.apply(null, his), lo = Math.min.apply(null, los);
  const span = (hi - lo) || 1, top = hi + span * pad, range = span * (1 + pad * 2);
  const n = raw.length, slot = 100 / n;
  const pct = (v) => ((top - v) / range) * 100;
  return raw.map((c, i) => {
    const bt = pct(Math.max(c.o, c.c)), bb = pct(Math.min(c.o, c.c));
    return {
      left: (i * slot + slot * 0.2).toFixed(2) + '%', w: (slot * 0.6).toFixed(2) + '%',
      wt: pct(c.hi).toFixed(2) + '%', wh: (pct(c.lo) - pct(c.hi)).toFixed(2) + '%',
      bt: bt.toFixed(2) + '%', bh: Math.max(0.8, bb - bt).toFixed(2) + '%', up: c.c >= c.o
    };
  });
}

// ============================================================================
// Small shared building blocks
// ============================================================================
function SectionLabel({ children, style }) {
  return <span style={{ font: 'var(--type-section-label)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--gold-warm)', ...style }}>{children}</span>;
}
function Hint({ children }) {
  return <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{children}</span>;
}
function Field({ children }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>;
}
function FieldHead({ label, note }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
      <SectionLabel>{label}</SectionLabel>
      <span style={{ flex: 1 }} />
      {note && <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-disabled)' }}>{note}</span>}
    </div>
  );
}

// Icon tile choice grid - each option is [key, iconName]; label comes from t(prefix+key).
function TileGrid({ options, prefix, t, value, onChange, basis = 240 }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
      {options.map(([key, icon]) => {
        const selected = value === key;
        return (
          <button
            key={key} type="button" onClick={() => onChange(selected ? '' : key)}
            style={{
              flex: '1 1 ' + basis + 'px', minHeight: 54, boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 11,
              padding: '10px 14px', borderRadius: 8, cursor: 'pointer', textAlign: 'start',
              border: '1px solid ' + (selected ? 'var(--char-accent)' : 'var(--divider-gold)'),
              background: selected ? 'var(--char-active-surface)' : 'rgba(11,20,21,.55)',
              color: selected ? 'var(--char-accent)' : 'var(--text-primary)',
              boxShadow: selected ? '0 0 16px var(--char-glow)' : 'none',
              font: 'var(--type-body)', transition: 'border-color var(--dur-hover) var(--ease-out), background var(--dur-hover) var(--ease-out)'
            }}
          >
            <Icon name={icon} size={18} style={{ color: selected ? 'var(--char-accent)' : 'var(--text-muted)', flex: 'none' }} />
            <span style={{ flex: 1, minWidth: 0 }}>{t(prefix + key)}</span>
            {selected && <Icon name="check" size={16} style={{ flex: 'none' }} />}
          </button>
        );
      })}
    </div>
  );
}

function SwitchRow({ label, value, onChange, t }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, minHeight: 56, paddingTop: 14, borderTop: '1px solid var(--border-hairline)' }}>
      <span style={{ flex: 1, font: 'var(--type-body)', color: 'var(--text-primary)' }}>{label}</span>
      <div style={{ flex: 'none', display: 'flex', gap: 6, padding: 4, borderRadius: 8, border: '1px solid var(--divider-gold)', background: 'rgba(3,8,7,.5)' }}>
        {[[true, t('mhYes')], [false, t('mhNo')]].map(([v, text]) => {
          const selected = value === v;
          return (
            <button
              key={String(v)} type="button" onClick={() => onChange(selected ? null : v)}
              style={{
                width: 92, height: 40, borderRadius: 6, cursor: 'pointer',
                border: '1px solid ' + (selected ? 'var(--gold-antique)' : 'transparent'),
                background: selected ? 'rgba(183,138,74,.14)' : 'transparent',
                color: selected ? 'var(--gold-warm)' : 'var(--text-muted)',
                font: 'var(--type-section-label)', letterSpacing: '.12em', textTransform: 'uppercase'
              }}
            >{text}</button>
          );
        })}
      </div>
    </div>
  );
}

function DialRow({ label, value, lowLabel, highLabel, onChange, t }) {
  const v = value == null ? 5 : value;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 14, borderTop: '1px solid var(--border-hairline)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <SectionLabel>{label}</SectionLabel>
        <span style={{ flex: 1 }} />
        <span style={{ font: 'var(--type-metric-value)', color: 'var(--char-accent)' }}>{v}</span>
        <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{t('mhOutOfTen')}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 56 }}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n} type="button" onClick={() => onChange(n)} aria-label={label + ' ' + n}
            style={{ flex: 1, height: '100%', minWidth: 0, padding: 0, background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'flex-end' }}
          >
            <span style={{
              display: 'block', width: '100%', height: (34 + n * 6.4).toFixed(0) + '%', borderRadius: 4,
              border: '1px solid ' + (n <= v ? 'var(--char-accent)' : 'var(--border-hairline)'),
              background: n <= v ? 'var(--char-active-surface)' : 'rgba(244,234,215,.04)'
            }} />
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{lowLabel}</span>
        <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{highLabel}</span>
      </div>
    </div>
  );
}

// A numeric drag-scale, not reading text - direction stays fixed LTR regardless of page
// direction (same reasoning the login page's own numeric widgets use), so the highlighted tick
// always sits under the centerline and ascending values always read left-to-right.
function AgeSlider({ value, onChange, t }) {
  const trackRef = React.useRef(null);
  const dragRef = React.useRef(null);
  const wheelAccRef = React.useRef(0);
  const setAge = React.useCallback((v) => onChange(Math.max(AGE_MIN, Math.min(AGE_MAX, Math.round(v)))), [onChange]);

  React.useEffect(() => {
    const el = trackRef.current;
    if (!el) return undefined;
    function onWheel(e) {
      e.preventDefault();
      const d = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      wheelAccRef.current += d;
      const steps = Math.trunc(wheelAccRef.current / AGE_TICK);
      if (steps) { wheelAccRef.current -= steps * AGE_TICK; setAge(value + steps); }
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [value, setAge]);

  function onPointerDown(e) {
    dragRef.current = { x0: e.clientX, age0: value };
    function move(ev) { setAge(dragRef.current.age0 - (ev.clientX - dragRef.current.x0) / AGE_TICK); }
    function up() { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
  function onKeyDown(e) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); setAge(value - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); setAge(value + 1); }
  }

  const ticks = [];
  for (let n = AGE_MIN; n <= AGE_MAX; n++) ticks.push(n);

  return (
    <div style={{ position: 'relative', border: '1px solid var(--border-gold)', borderRadius: 12, background: 'rgba(3,8,7,.55)', padding: '16px 18px 12px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <SectionLabel>{t('mhAge')}</SectionLabel>
          <Hint>{t('mhAgeSliderHint')}</Hint>
        </div>
        <span style={{ flex: 1 }} />
        <span className="navrya-tabular" style={{ font: '600 44px/46px var(--font-display)', letterSpacing: '.03em', color: 'var(--char-accent)' }}>{value}</span>
        <span style={{ font: 'var(--type-caption)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)', paddingBottom: 8 }}>{t('mhAgeYearsUnit')}</span>
      </div>
      <div
        ref={trackRef} role="slider" tabIndex={0} aria-label={t('mhAge')} aria-valuemin={AGE_MIN} aria-valuemax={AGE_MAX} aria-valuenow={value}
        onPointerDown={onPointerDown} onKeyDown={onKeyDown}
        style={{ direction: 'ltr', position: 'relative', height: 76, marginTop: 8, cursor: 'ew-resize', touchAction: 'none', userSelect: 'none', outlineOffset: 2 }}
      >
        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, display: 'flex', alignItems: 'flex-end', transform: 'translateX(' + (-((value - AGE_MIN) * AGE_TICK + AGE_TICK / 2)) + 'px)' }}>
          {ticks.map((age) => {
            const isCurrent = age === value, isMajor = age % 5 === 0;
            return (
              <div key={age} style={{ width: 26, flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                <span style={{
                  width: 2, borderRadius: 2,
                  height: isCurrent ? 36 : isMajor ? 22 : 12,
                  background: isCurrent ? 'var(--char-accent)' : isMajor ? 'rgba(214,175,107,.55)' : 'rgba(244,234,215,.16)',
                  boxShadow: isCurrent ? '0 0 12px var(--char-glow)' : 'none'
                }} />
                <span style={{ height: 14, font: 'var(--type-caption)', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {isCurrent || isMajor ? age : ''}
                </span>
              </div>
            );
          })}
        </div>
        <span aria-hidden="true" style={{ position: 'absolute', left: '50%', top: 0, width: 1, height: 46, background: 'linear-gradient(180deg,var(--gold-warm) 0%,rgba(214,175,107,0) 100%)' }} />
        <span aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(90deg,var(--ink-950) 0%,rgba(3,8,7,0) 15%,rgba(3,8,7,0) 85%,var(--ink-950) 100%)' }} />
      </div>
    </div>
  );
}

function yearsText(years, t) {
  if (years === 0) return t('mhYearsUnderOne');
  if (years >= 10) return t('mhYearsTenPlus');
  return years === 1 ? t('mhYearsOne') : t('mhYearsPlural', { n: years });
}

function YearsRungs({ value, onChange, t }) {
  return (
    <div style={{ border: '1px solid var(--border-gold)', borderRadius: 12, background: 'rgba(3,8,7,.55)', padding: '16px 18px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <SectionLabel>{t('mhYearsTrading')}</SectionLabel>
          <Hint>{t('mhYearsHint')}</Hint>
        </div>
        <span style={{ flex: 1 }} />
        <span className="navrya-tabular" style={{ font: '600 30px/32px var(--font-display)', color: 'var(--char-accent)' }}>{yearsText(value, t)}</span>
      </div>
      <div style={{ direction: 'ltr', display: 'flex', alignItems: 'flex-end', gap: 6 }}>
        {Array.from({ length: 11 }, (_, y) => y).map((year) => {
          const selected = value === year, lit = value > year;
          return (
            <button
              key={year} type="button" onClick={() => onChange(year)}
              aria-label={year === 10 ? t('mhYearsTenPlus') : t('mhYearsPlural', { n: year })}
              style={{ flex: 1, height: 64, minWidth: 0, padding: 0, background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 6 }}
            >
              <span style={{
                width: '100%', display: 'block', height: (26 + year * 6.6).toFixed(0) + '%', borderRadius: 4,
                border: '1px solid ' + (selected ? 'var(--char-accent)' : lit ? 'rgba(183,138,74,.4)' : 'var(--border-hairline)'),
                background: selected ? 'var(--char-active-surface)' : lit ? 'rgba(183,138,74,.14)' : 'rgba(244,234,215,.04)',
                boxShadow: selected ? '0 0 14px var(--char-glow)' : 'none'
              }} />
              <span className="navrya-tabular" style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>
                {year === 0 ? '<1' : year === 10 ? '10+' : year}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function InstrumentPicker({ selected, custom, onChange, t }) {
  const [draft, setDraft] = React.useState('');
  const presetLabels = MARKET_PRESETS.map((k) => t('mhMarketsPreset_' + k));
  function togglePreset(label) {
    const idx = selected.indexOf(label);
    onChange({ selected: idx > -1 ? selected.filter((x) => x !== label) : selected.concat([label]), custom });
  }
  function removeCustom(name) {
    onChange({ selected, custom: custom.filter((x) => x !== name) });
  }
  function addCustom() {
    const v = draft.trim();
    if (v && custom.indexOf(v) === -1 && presetLabels.indexOf(v) === -1) onChange({ selected, custom: custom.concat([v]) });
    setDraft('');
  }
  const count = selected.length + custom.length;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <SectionLabel>{t('mhMarketsTraded')}</SectionLabel>
        <span style={{ flex: 1 }} />
        <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          {count ? t('mhInstrumentsSelectedCount', { n: count }) : t('mhInstrumentsHint')}
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
        {MARKET_PRESETS.map((key) => {
          const label = t('mhMarketsPreset_' + key);
          const isSelected = selected.indexOf(label) > -1;
          return (
            <button
              key={key} type="button" onClick={() => togglePreset(label)}
              style={{
                flex: '1 1 158px', minHeight: 44, boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px 8px 14px', borderRadius: 8, cursor: 'pointer', textAlign: 'start',
                border: '1px solid ' + (isSelected ? 'var(--char-accent)' : 'var(--divider-gold)'),
                background: isSelected ? 'var(--char-active-surface)' : 'rgba(11,20,21,.55)',
                boxShadow: isSelected ? '0 0 16px var(--char-glow)' : 'none'
              }}
            >
              <span style={{ font: 'var(--type-body)', color: isSelected ? 'var(--char-accent)' : 'var(--text-primary)' }}>{label}</span>
            </button>
          );
        })}
        {custom.map((name) => (
          <div key={name} style={{
            flex: '1 1 158px', minHeight: 44, boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 10px 8px 14px', borderRadius: 8, border: '1px solid var(--char-accent)', background: 'var(--char-active-surface)', boxShadow: '0 0 16px var(--char-glow)'
          }}>
            <span dir="auto" style={{ flex: 1, minWidth: 0, font: 'var(--type-body)', color: 'var(--char-accent)' }}>{name}</span>
            <button
              type="button" onClick={() => removeCustom(name)} aria-label={t('mhAdd')}
              style={{ width: 28, height: 28, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 6, border: '1px solid transparent', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}
            ><Icon name="close" size={14} /></button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
        <input
          type="text" dir="auto" value={draft} placeholder={t('mhMarketsPlaceholder')}
          onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
          style={{ flex: 1, minWidth: 0, height: 44, boxSizing: 'border-box', padding: '0 14px', borderRadius: 8, border: '1px solid var(--divider-gold)', background: 'rgba(3,8,7,.55)', color: 'var(--text-primary)', font: 'var(--type-body)', outline: 'none' }}
        />
        <Button variant="secondary" icon="plus" onClick={addCustom}>{t('mhAdd')}</Button>
      </div>
    </div>
  );
}

// Custom drag-slider (role="slider", not a native <input type=range>) - ported field-for-field
// from the design handoff's isCapital block: a filled bar behind a floating rounded-square
// thumb, 3 quarter-mark ticks, forced LTR like the age slider (a spatial control, not text).
function ShareRange({ value, onChange, t }) {
  const trackRef = React.useRef(null);
  const setShare = React.useCallback((v) => onChange(Math.max(0, Math.min(100, Math.round(v)))), [onChange]);
  function pctFromClientX(clientX) {
    const el = trackRef.current;
    if (!el) return value;
    const rect = el.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * 100;
  }
  function onPointerDown(e) {
    setShare(pctFromClientX(e.clientX));
    function move(ev) { setShare(pctFromClientX(ev.clientX)); }
    function up() { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
  function onKeyDown(e) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); setShare(value - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); setShare(value + 1); }
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <SectionLabel>{t('mhCapitalAllocation')}</SectionLabel>
        <span style={{ flex: 1 }} />
        <span className="navrya-tabular" style={{ font: '600 30px/32px var(--font-display)', color: 'var(--char-accent)' }}>{value}%</span>
      </div>
      <div
        ref={trackRef} role="slider" tabIndex={0} aria-label={t('mhCapitalAllocation')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}
        onPointerDown={onPointerDown} onKeyDown={onKeyDown}
        style={{ direction: 'ltr', position: 'relative', height: 56, borderRadius: 8, border: '1px solid var(--divider-gold)', background: 'rgba(3,8,7,.55)', cursor: 'ew-resize', touchAction: 'none', overflow: 'hidden', outlineOffset: 2 }}
      >
        <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: value + '%', background: 'linear-gradient(90deg,rgba(3,8,7,0),color-mix(in srgb, var(--char-accent) 30%, transparent))', borderRight: '2px solid var(--char-accent)' }} />
        <span aria-hidden="true" style={{ position: 'absolute', left: '25%', top: 14, bottom: 14, width: 1, background: 'rgba(244,234,215,.1)' }} />
        <span aria-hidden="true" style={{ position: 'absolute', left: '50%', top: 10, bottom: 10, width: 1, background: 'rgba(244,234,215,.14)' }} />
        <span aria-hidden="true" style={{ position: 'absolute', left: '75%', top: 14, bottom: 14, width: 1, background: 'rgba(244,234,215,.1)' }} />
        <span style={{ position: 'absolute', left: value + '%', top: 12, height: 32, width: 14, marginLeft: -7, borderRadius: 4, border: '1px solid var(--char-accent)', background: 'var(--ink-900)', boxShadow: '0 0 14px var(--char-glow)' }} />
      </div>
      <div style={{ direction: 'ltr', display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('mhAllocationLow')}</span>
        <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('mhAllocationHigh')}</span>
      </div>
      {value >= 60 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(255,176,32,.4)', background: 'rgba(255,176,32,.08)' }}>
          <Icon name="shield-alert" size={18} style={{ color: 'var(--warning)', flex: 'none' }} />
          <span style={{ font: 'var(--type-body)', fontSize: 13, color: 'var(--text-primary)' }}>{t('mhAllocationWarning')}</span>
        </div>
      )}
    </div>
  );
}

function MarginCounter({ value, onChange, t }) {
  const pips = Math.min(6, value);
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 18, padding: '16px 18px', borderRadius: 12, border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.55)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
        <SectionLabel>{t('mhMarginCalls')}</SectionLabel>
      </div>
      <span style={{ flex: 1 }} />
      <div style={{ display: 'flex', gap: 5 }}>
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} style={{ width: 14, height: 26, borderRadius: 3, background: i < pips ? 'rgba(255,56,48,.75)' : 'rgba(244,234,215,.1)' }} />
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 4, borderRadius: 8, border: '1px solid var(--divider-gold)', background: 'rgba(3,8,7,.5)' }}>
        <button type="button" onClick={() => onChange(Math.max(0, value - 1))} aria-label={t('mhMarginCalls')} style={{ width: 44, height: 44, display: 'grid', placeItems: 'center', borderRadius: 6, border: '1px solid transparent', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
          <Icon name="minus" size={18} />
        </button>
        <span style={{ minWidth: 44, textAlign: 'center', font: '600 26px/30px var(--font-display)', color: 'var(--char-accent)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
        <button type="button" onClick={() => onChange(Math.min(99, value + 1))} aria-label={t('mhMarginCalls')} style={{ width: 44, height: 44, display: 'grid', placeItems: 'center', borderRadius: 6, border: '1px solid transparent', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
          <Icon name="plus" size={18} />
        </button>
      </div>
      <span style={{ minWidth: 84, font: 'var(--type-caption)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
        {value === 0 ? t('mhMarginNever') : value === 1 ? t('mhMarginOnce') : t('mhMarginTimes', { n: value })}
      </span>
    </div>
  );
}

function FamilySummary({ count, t }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 18, marginTop: 4, padding: '16px 18px', borderRadius: 12, border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.55)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
        <SectionLabel>{t('mhDisclosureTitle')}</SectionLabel>
        <Hint>{t('mhDisclosureHint')}</Hint>
      </div>
      <span style={{ flex: 1 }} />
      <div style={{ display: 'flex', gap: 6 }}>
        {Array.from({ length: 4 }, (_, i) => (
          <span key={i} style={{ width: 34, height: 10, borderRadius: 3, background: i < count ? 'var(--char-accent)' : 'rgba(244,234,215,.1)', boxShadow: i < count ? '0 0 10px var(--char-glow)' : 'none' }} />
        ))}
      </div>
      <span style={{ font: 'var(--type-metric-value)', color: 'var(--char-accent)', fontVariantNumeric: 'tabular-nums' }}>{t('mhDisclosureCount', { n: count })}</span>
      <span style={{ font: 'var(--type-caption)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
        {count === 0 ? t('mhDisclosureNone') : count === 4 ? t('mhDisclosureFull') : t('mhDisclosurePartial')}
      </span>
    </div>
  );
}

function Candle({ c }) {
  return (
    <span style={{ position: 'absolute', top: 0, bottom: 0, left: c.left, width: c.w }}>
      <span style={{ position: 'absolute', left: '50%', width: 1, top: c.wt, height: c.wh, background: 'rgba(244,234,215,.22)' }} />
      <span style={{ position: 'absolute', left: 0, right: 0, top: c.bt, height: c.bh, minHeight: 2, borderRadius: 1, background: c.up ? 'rgba(46,204,113,.72)' : 'rgba(255,56,48,.68)' }} />
    </span>
  );
}

// The five scenario steps' purely-decorative illustrations, one per scenario id. Absolute (left/
// top) positioning, so - like a chart's chronology - it does not mirror under RTL.
function ScenarioVisual({ id }) {
  if (id === 'A_stop_loss') {
    const layout = React.useMemo(() => layoutCandles(seededCandles(7, 26, -0.55, 2.6), 0.18), []);
    return (
      <div style={{ position: 'relative', height: 200, borderRadius: 12, border: '1px solid var(--divider-gold)', background: 'rgba(3,8,7,.55)', overflow: 'hidden' }}>
        <span style={{ position: 'absolute', inset: 0, opacity: .5, backgroundImage: 'linear-gradient(rgba(38,51,50,.3) 1px,transparent 1px)', backgroundSize: '100% 32px' }} />
        {layout.map((c, i) => <Candle key={i} c={c} />)}
        <span style={{ position: 'absolute', left: 0, right: 0, top: '26%', borderTop: '1px dashed rgba(214,175,107,.7)' }} />
        <span style={{ position: 'absolute', left: 12, top: 'calc(26% - 20px)', font: 'var(--type-caption)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--gold-warm)' }}>Entry</span>
        <span style={{ position: 'absolute', left: 0, right: 0, top: '78%', borderTop: '1px dashed rgba(255,56,48,.75)' }} />
        <span style={{ position: 'absolute', left: 12, top: 'calc(78% + 6px)', font: 'var(--type-caption)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--danger)' }}>Stop · −3.0%</span>
        <span style={{ position: 'absolute', right: 12, top: 12, display: 'flex', alignItems: 'center', gap: 8, height: 32, padding: '0 12px', borderRadius: 6, border: '1px solid rgba(255,56,48,.45)', background: 'rgba(255,56,48,.1)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--danger)' }} />
          <span style={{ font: 'var(--type-username)', color: 'var(--danger)', fontVariantNumeric: 'tabular-nums' }}>−2.8%</span>
        </span>
        <span style={{ position: 'absolute', right: 12, bottom: 12, font: 'var(--type-caption)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>XAU/USD · M15</span>
      </div>
    );
  }
  if (id === 'B_revenge') {
    return (
      <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
        {[['14:20', '−1.2 R', 'XAU/USD'], ['17:05', '−0.8 R', 'NAS 100'], ['20:40', '−1.5 R', 'BTC/USD']].map(([time, r, sym]) => (
          <div key={time} style={{ flex: 1, minWidth: 0, borderRadius: 8, border: '1px solid rgba(255,56,48,.35)', background: 'rgba(255,56,48,.07)', padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <small style={{ font: 'var(--type-caption)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{time}</small>
            <strong style={{ font: 'var(--type-metric-value)', color: 'var(--danger)', fontVariantNumeric: 'tabular-nums' }}>{r}</strong>
            <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{sym}</span>
          </div>
        ))}
        <div style={{ flex: 1, minWidth: 0, borderRadius: 8, border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.6)', padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Icon name="clock" size={18} style={{ color: 'var(--gold-warm)' }} />
          <strong style={{ font: 'var(--type-metric-value)', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>22:00</strong>
          <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>New York · closing</span>
        </div>
      </div>
    );
  }
  if (id === 'C_fomo') {
    const bars = React.useMemo(() => seededCandles(41, 14, 2.2, 1.4).map((c, i) => Math.round(26 + i * 5.2) + '%'), []);
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, borderRadius: 12, border: '1px solid var(--divider-gold)', background: 'rgba(3,8,7,.55)', padding: 18 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <small style={{ font: 'var(--type-caption)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>A friend's position</small>
          <strong style={{ font: '500 20px/24px var(--font-display)', letterSpacing: '.06em', color: 'var(--text-primary)' }}>SOL / USDT</strong>
          <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>Entered Tuesday</span>
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'flex-end', gap: 5, height: 76 }}>
          {bars.map((h, i) => <span key={i} style={{ flex: 1, minWidth: 0, height: h, borderRadius: 2, background: 'linear-gradient(180deg,rgba(46,204,113,.8),rgba(46,204,113,.2))' }} />)}
        </div>
        <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <strong style={{ font: '600 34px/38px var(--font-display)', color: 'var(--success)' }}>+40%</strong>
          <span style={{ font: 'var(--type-caption)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>4 days</span>
        </div>
      </div>
    );
  }
  if (id === 'D_patience') {
    const layout = React.useMemo(() => layoutCandles(seededCandles(23, 30, 0, 1.5), 0.55), []);
    return (
      <div style={{ position: 'relative', height: 180, borderRadius: 12, border: '1px solid var(--divider-gold)', background: 'rgba(3,8,7,.55)', overflow: 'hidden' }}>
        <span style={{ position: 'absolute', inset: 0, opacity: .5, backgroundImage: 'linear-gradient(rgba(38,51,50,.3) 1px,transparent 1px)', backgroundSize: '100% 30px' }} />
        {layout.map((c, i) => <Candle key={i} c={c} />)}
        <span style={{ position: 'absolute', left: 0, right: 0, top: '30%', bottom: '30%', background: 'rgba(183,138,74,.05)', borderTop: '1px dashed rgba(214,175,107,.5)', borderBottom: '1px dashed rgba(214,175,107,.5)' }} />
        <span style={{ position: 'absolute', left: 12, top: 12, font: 'var(--type-caption)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--gold-warm)' }}>Range · 7 days · no setup</span>
        <span style={{ position: 'absolute', right: 12, bottom: 12, font: 'var(--type-caption)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>EUR/USD · H1</span>
      </div>
    );
  }
  // E_identity
  const cells = React.useMemo(() => seededCandles(59, 28, -0.25, 3).map((c) => c.c - c.o), []);
  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'center', borderRadius: 12, border: '1px solid var(--divider-gold)', background: 'rgba(3,8,7,.55)', padding: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,20px)', gap: 5, flex: 'none' }}>
        {cells.map((d, i) => (
          <span key={i} style={{
            width: 20, height: 20, borderRadius: 4,
            border: '1px solid ' + (d > 0.7 ? 'rgba(46,204,113,.4)' : d < -0.7 ? 'rgba(255,56,48,.4)' : 'var(--border-hairline)'),
            background: d > 0.7 ? 'rgba(46,204,113,.22)' : d < -0.7 ? 'rgba(255,56,48,.22)' : 'rgba(244,234,215,.04)'
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
        <small style={{ font: 'var(--type-caption)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>July · closed</small>
        <strong style={{ font: '600 30px/32px var(--font-display)', color: 'var(--danger)' }}>−6.4%</strong>
        <span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>18 trades · 6 green · 12 red · rules kept on 11</span>
      </div>
    </div>
  );
}

// ============================================================================
// Archetype (computed live from stored scenario responses - never a new server field)
// ============================================================================
function responseChoice(profile, scenarioId) {
  const r = profile.psychologicalProfile.scenarioAssessment.responses.find((x) => x.scenarioId === scenarioId);
  return r ? r.choice : null;
}
function archetypeFor(profile, t) {
  const answered = profile.psychologicalProfile.scenarioAssessment.responses.length;
  if (answered < 3) return { title: t('mhArchetypePendingTitle'), body: t('mhArchetypePendingBody', { answered }) };
  let score = 0;
  if (responseChoice(profile, 'A_stop_loss') === 'quick_reanalysis') score++;
  const sc2 = responseChoice(profile, 'B_revenge'); if (sc2 === 'journal' || sc2 === 'sleep') score++;
  if (responseChoice(profile, 'C_fomo') === 'disciplined_no_stop') score++;
  if (responseChoice(profile, 'D_patience') === 'wait') score++;
  if (responseChoice(profile, 'E_identity') === 'bad_month_review_system') score++;
  const table = [
    { title: t('mhArchetypeImpulseTitle'), body: t('mhArchetypeImpulseBody') },
    { title: t('mhArchetypeReactiveTitle'), body: t('mhArchetypeReactiveBody') },
    { title: t('mhArchetypeMeasuredTitle'), body: t('mhArchetypeMeasuredBody') },
    { title: t('mhArchetypeSteadyTitle'), body: t('mhArchetypeSteadyBody') },
    { title: t('mhArchetypePatientTitle'), body: t('mhArchetypePatientBody') },
    { title: t('mhArchetypePatientTitle'), body: t('mhArchetypePatientBody') }
  ];
  return table[score];
}

function stepMeta(step, t) {
  switch (step) {
    case 1: return { title: t('mhIntakeWelcomeTitle'), hint: t('mhIntakeWelcomeBody') };
    case 2: return { title: t('mhIntakeStep2Title'), hint: t('mhStepAboutYouHint') };
    case 3: return { title: t('mhIntakeStep3Title'), hint: t('mhFinancialContextHint') };
    case 4: return { title: t('mhStepExperienceTitle'), hint: t('mhStepExperienceHint') };
    case 5: return { title: t('mhStepExtremesTitle'), hint: t('mhStepExtremesHint') };
    case 6: return { title: t('mhIntakeStep5Title'), hint: '' };
    case 7: return { title: t('mhIntakeStep6Title'), hint: t('mhTransparencyHint') };
    case 8: return { title: t('mhScenario_A_stop_loss_title'), hint: t('mhScenario_A_stop_loss_body') };
    case 9: return { title: t('mhScenario_B_revenge_title'), hint: t('mhScenario_B_revenge_body') };
    case 10: return { title: t('mhScenario_C_fomo_title'), hint: t('mhScenario_C_fomo_body') };
    case 11: return { title: t('mhScenario_D_patience_title'), hint: t('mhScenario_D_patience_body') };
    case 12: return { title: t('mhScenario_E_identity_title'), hint: t('mhScenario_E_identity_body') };
    default: return { title: t('mhIntakeStep8Title'), hint: t('mhIntakeSummaryHint') };
  }
}

// ============================================================================
// Step bodies - each receives `draft` (the whole editable slice) and `setDraft` (a
// functional updater merging a partial patch), so every field is a real controlled input.
// ============================================================================
function set(setDraft, patch) { setDraft((prev) => ({ ...prev, ...patch })); }

function OrientationStep({ character, navryaId, t, lang }) {
  const quote = (CHARACTERS[character] && CHARACTERS[character].quotes[lang]) || (CHARACTERS[character] && CHARACTERS[character].quotes.en) || '';
  const cards = [
    ['clock', 'mhIntakeInfo1Label', 'mhIntakeInfo1Text'],
    ['eye-off', 'mhIntakeInfo2Label', 'mhIntakeInfo2Text'],
    ['edit', 'mhIntakeInfo3Label', 'mhIntakeInfo3Text']
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '236px minmax(0,1fr)', gap: 26, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <CharacterPortrait character={navryaId} size={176} editable={false} />
        <span style={{ font: 'var(--type-display-md)', letterSpacing: 'var(--tracking-display)', color: 'var(--char-accent)', textAlign: 'center' }}>
          {(CHAR_TITLE[character] && (CHAR_TITLE[character][lang] || CHAR_TITLE[character].en)) || character.toUpperCase()}
        </span>
        <QuoteCard character={navryaId} quote={quote} height={96} style={{ width: '100%' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {cards.map(([icon, labelKey, textKey]) => (
          <div key={labelKey} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: 16, border: '1px solid var(--divider-gold)', borderRadius: 8, background: 'rgba(11,20,21,.55)' }}>
            <span style={{ width: 38, height: 38, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 8, border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.6)', color: 'var(--gold-warm)' }}>
              <Icon name={icon} size={18} />
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
              <SectionLabel>{t(labelKey)}</SectionLabel>
              <span style={{ font: 'var(--type-body)', fontSize: 13.5, lineHeight: '20px', color: 'var(--text-primary)' }}>{t(textKey)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DemographicsStep({ draft, setDraft, t }) {
  const d = draft.demographics;
  // Journey H1: magic-fill animation for this step's own intakePaths fields.
  const ageFilled = useAiFieldFill('mh-intake', 'intake.demographics.age');
  const genderFilled = useAiFieldFill('mh-intake', 'intake.demographics.gender');
  const maritalFilled = useAiFieldFill('mh-intake', 'intake.demographics.maritalStatus');
  const occupationFilled = useAiFieldFill('mh-intake', 'intake.demographics.primaryOccupation');
  const fullTimeFilled = useAiFieldFill('mh-intake', 'intake.demographics.isFullTimeTrader');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <AiMagicFill active={ageFilled}><AgeSlider value={d.age} onChange={(age) => set(setDraft, { demographics: { ...d, age } })} t={t} /></AiMagicFill>
      <AiMagicFill active={genderFilled}>
        <Field>
          <FieldHead label={t('mhGender')} />
          <TileGrid options={GENDERS} prefix="mhGender_" t={t} value={d.gender} basis={176} onChange={(gender) => set(setDraft, { demographics: { ...d, gender } })} />
        </Field>
      </AiMagicFill>
      <AiMagicFill active={maritalFilled}>
        <Field>
          <FieldHead label={t('mhMaritalStatus')} />
          <TileGrid options={MARITAL_STATUSES} prefix="mhMaritalStatus_" t={t} value={d.maritalStatus} basis={176} onChange={(maritalStatus) => set(setDraft, { demographics: { ...d, maritalStatus } })} />
        </Field>
      </AiMagicFill>
      <AiMagicFill active={occupationFilled}>
        <Field>
          <FieldHead label={t('mhOccupation')} />
          <TileGrid options={OCCUPATION_TYPES} prefix="mhOccupationType_" t={t} value={d.primaryOccupation} basis={176} onChange={(primaryOccupation) => set(setDraft, { demographics: { ...d, primaryOccupation } })} />
        </Field>
      </AiMagicFill>
      <AiMagicFill active={fullTimeFilled}><SwitchRow label={t('mhFullTimeTrader')} value={d.isFullTimeTrader} onChange={(isFullTimeTrader) => set(setDraft, { demographics: { ...d, isFullTimeTrader } })} t={t} /></AiMagicFill>
    </div>
  );
}

function FinancialStep({ draft, setDraft, t }) {
  const f = draft.financialContext;
  const capitalTypeFilled = useAiFieldFill('mh-intake', 'intake.financialContext.capitalType');
  const allocationFilled = useAiFieldFill('mh-intake', 'intake.financialContext.capitalAllocationPercent');
  const borrowedFilled = useAiFieldFill('mh-intake', 'intake.financialContext.borrowedMoneyForTrading');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <AiMagicFill active={capitalTypeFilled}>
        <Field>
          <FieldHead label={t('mhCapitalType')} />
          <TileGrid options={CAPITAL_TYPES} prefix="mhCapitalType_" t={t} value={f.capitalType} onChange={(capitalType) => set(setDraft, { financialContext: { ...f, capitalType } })} />
        </Field>
      </AiMagicFill>
      <AiMagicFill active={allocationFilled}><ShareRange value={f.capitalAllocationPercent || 0} onChange={(capitalAllocationPercent) => set(setDraft, { financialContext: { ...f, capitalAllocationPercent } })} t={t} /></AiMagicFill>
      <AiMagicFill active={borrowedFilled}><SwitchRow label={t('mhBorrowedMoney')} value={f.borrowedMoneyForTrading} onChange={(borrowedMoneyForTrading) => set(setDraft, { financialContext: { ...f, borrowedMoneyForTrading } })} t={t} /></AiMagicFill>
    </div>
  );
}

function ExperienceStep({ draft, setDraft, t }) {
  const h = draft.tradingHistory;
  const presetLabels = MARKET_PRESETS.map((k) => t('mhMarketsPreset_' + k));
  const existing = h.marketsTraded || [];
  const selected = existing.filter((v) => presetLabels.indexOf(v) > -1);
  const custom = existing.filter((v) => presetLabels.indexOf(v) === -1);
  const yearsFilled = useAiFieldFill('mh-intake', 'intake.tradingHistory.yearsTrading');
  const marketsFilled = useAiFieldFill('mh-intake', 'intake.tradingHistory.marketsTraded');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <AiMagicFill active={yearsFilled}><YearsRungs value={h.yearsTrading == null ? 0 : h.yearsTrading} onChange={(yearsTrading) => set(setDraft, { tradingHistory: { ...h, yearsTrading } })} t={t} /></AiMagicFill>
      <AiMagicFill active={marketsFilled}><InstrumentPicker selected={selected} custom={custom} t={t} onChange={({ selected: s, custom: c }) => set(setDraft, { tradingHistory: { ...h, marketsTraded: s.concat(c) } })} /></AiMagicFill>
    </div>
  );
}

function AmountField({ label, value, onChange, placeholder }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <span style={{ font: 'var(--type-metric-label)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</span>
      <input
        className="navrya-tabular" inputMode="decimal" value={value == null ? '' : value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        style={{ minWidth: 0, width: '100%', height: 44, boxSizing: 'border-box', padding: '0 14px', borderRadius: 8, border: '1px solid var(--divider-gold)', background: 'rgba(3,8,7,.55)', color: 'var(--text-primary)', font: '500 13.5px/19px var(--font-ui)', outline: 'none' }}
      />
    </div>
  );
}

function ExtremesStep({ draft, setDraft, t }) {
  const h = draft.tradingHistory;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14 }}>
        <div style={{ borderRadius: 12, border: '1px solid rgba(46,204,113,.35)', background: 'rgba(46,204,113,.05)', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, font: 'var(--type-section-label)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--success)' }}>
            <Icon name="scenarios" size={18} /><span>{t('mhLargestWinTitle')}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}>
            <AmountField label={t('mhAmountLabel')} value={h.largestWin.amount} placeholder="e.g. 4,200" onChange={(amount) => set(setDraft, { tradingHistory: { ...h, largestWin: { ...h.largestWin, amount } } })} />
            <AmountField label={t('mhPercentLabel')} value={h.largestWin.percent} placeholder="e.g. 18" onChange={(percent) => set(setDraft, { tradingHistory: { ...h, largestWin: { ...h.largestWin, percent } } })} />
          </div>
        </div>
        <div style={{ borderRadius: 12, border: '1px solid rgba(255,56,48,.35)', background: 'rgba(255,56,48,.05)', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, font: 'var(--type-section-label)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--danger)' }}>
            <Icon name="scenarios" size={18} /><span>{t('mhLargestLossTitle')}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}>
            <AmountField label={t('mhAmountLabel')} value={h.largestLoss.amount} placeholder="e.g. 2,600" onChange={(amount) => set(setDraft, { tradingHistory: { ...h, largestLoss: { ...h.largestLoss, amount } } })} />
            <AmountField label={t('mhPercentLabel')} value={h.largestLoss.percent} placeholder="e.g. 11" onChange={(percent) => set(setDraft, { tradingHistory: { ...h, largestLoss: { ...h.largestLoss, percent } } })} />
          </div>
        </div>
      </div>
      <MarginCounter value={h.marginCallOrZeroedCount || 0} onChange={(marginCallOrZeroedCount) => set(setDraft, { tradingHistory: { ...h, marginCallOrZeroedCount } })} t={t} />
    </div>
  );
}

function MotivationStep({ draft, setDraft, t }) {
  const motivationFilled = useAiFieldFill('mh-intake', 'intake.motivationForTrading');
  const lossReactionFilled = useAiFieldFill('mh-intake', 'intake.firstBigLossReaction');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <AiMagicFill active={motivationFilled}>
        <Field>
          <FieldHead label={t('mhMotivationQuestion')} />
          <TileGrid options={MOTIVATIONS} prefix="mhMotivation_" t={t} value={draft.motivationForTrading} onChange={(motivationForTrading) => set(setDraft, { motivationForTrading })} />
        </Field>
      </AiMagicFill>
      <AiMagicFill active={lossReactionFilled}>
        <Field>
          <FieldHead label={t('mhFirstLossQuestion')} />
          <TileGrid options={LOSS_REACTIONS} prefix="mhLossReaction_" t={t} value={draft.firstBigLossReaction} onChange={(firstBigLossReaction) => set(setDraft, { firstBigLossReaction })} />
        </Field>
      </AiMagicFill>
    </div>
  );
}

// Journey H1: rows here are rendered from a data-driven list (.map() below), so a hook can't be
// called directly inside that callback (Rules of Hooks) - same small per-item wrapper pattern as
// strategiesHubView.jsx's own StrategyMagicField.
function IntakeMagicField({ path, children }) {
  const active = useAiFieldFill('mh-intake', path);
  return <AiMagicFill active={active}>{children}</AiMagicFill>;
}

function TransparencyStep({ draft, setDraft, t }) {
  const m = draft.transparencyMatrix;
  const rows = [
    ['tradingActivityKnownToFamily', 'mhActivityKnown'], ['capitalKnownToFamily', 'mhCapitalKnown'],
    ['profitKnownToFamily', 'mhProfitKnown'], ['lossKnownToFamily', 'mhLossKnown']
  ];
  const count = rows.filter(([key]) => m[key] === true).length;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {rows.map(([key, labelKey]) => (
        <IntakeMagicField key={key} path={'intake.transparencyMatrix.' + key}>
          <SwitchRow label={t(labelKey)} value={m[key]} onChange={(v) => set(setDraft, { transparencyMatrix: { ...m, [key]: v } })} t={t} />
        </IntakeMagicField>
      ))}
      <div style={{ marginTop: 4 }}><FamilySummary count={count} t={t} /></div>
    </div>
  );
}

function ScenarioStep({ scenario, draft, setDraft, t }) {
  const responses = draft.scenarioResponses;
  const r = responses[scenario.id] || { choice: '', sliderValue: scenario.slider ? 5 : null, freeText: '' };
  function patch(p) { setDraft((prev) => ({ ...prev, scenarioResponses: { ...prev.scenarioResponses, [scenario.id]: { ...r, ...p } } })); }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Always English/numeric market-chart flavor text (tickers, times, R-multiples) - like a
          chart's chronology, it must never mirror or bidi-reorder under RTL. */}
      <div dir="ltr"><ScenarioVisual id={scenario.id} /></div>
      <Field>
        <FieldHead label={t('mhMeasures') + ': ' + t('mhConstruct_' + scenario.measuresConstruct)} />
        <TileGrid options={scenario.choices} prefix={'mhScenarioChoice_' + scenario.id + '_'} t={t} value={r.choice} onChange={(choice) => patch({ choice })} />
      </Field>
      {scenario.slider && (
        <DialRow label={t(scenario.heatQuestion)} value={r.sliderValue} lowLabel={t(scenario.sliderLeft)} highLabel={t(scenario.sliderRight)} onChange={(sliderValue) => patch({ sliderValue })} t={t} />
      )}
      {scenario.hasFreeText && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <SectionLabel>{t('mhScenarioFreeText')}</SectionLabel>
          <textarea
            dir="auto" rows={3} value={r.freeText || ''} placeholder={t('mhScenarioFreeText')}
            onChange={(e) => patch({ freeText: e.target.value })}
            style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: '12px 14px', borderRadius: 8, border: '1px solid var(--divider-gold)', background: 'rgba(3,8,7,.55)', color: 'var(--text-primary)', font: '500 13.5px/20px var(--font-ui)', outline: 'none' }}
          />
        </div>
      )}
    </div>
  );
}

function SummaryTile({ label, value, onEdit }) {
  return (
    <div style={{ flex: '1 1 208px', minHeight: 70, boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 8, border: '1px solid var(--divider-gold)', background: 'rgba(11,20,21,.55)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
        <small style={{ font: 'var(--type-metric-label)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</small>
        <span style={{ font: '500 14px/20px var(--font-ui)', color: 'var(--text-primary)' }}>{value}</span>
      </div>
      <button type="button" onClick={onEdit} aria-label={label} style={{ width: 32, height: 32, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 6, border: '1px solid transparent', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
        <Icon name="edit" size={15} />
      </button>
    </div>
  );
}

function SummaryStep({ draft, navryaId, t, onEditStep }) {
  const a = draft, hist = a.tradingHistory, fam = a.transparencyMatrix;
  const famCount = ['tradingActivityKnownToFamily', 'capitalKnownToFamily', 'profitKnownToFamily', 'lossKnownToFamily'].filter((k) => fam[k] === true).length;
  const scenarioCount = Object.values(a.scenarioResponses).filter((r) => r.choice || (r.sliderValue != null && r.sliderValue !== 5) || r.freeText).length;
  // archetypeFor reads real stored responses (profile.psychologicalProfile...), not the in-progress
  // draft - build a tiny shape it understands from what's actually been committed so far.
  const asProfileShape = { psychologicalProfile: { scenarioAssessment: { responses: Object.entries(a.scenarioResponses).filter(([, r]) => r.choice || r.sliderValue != null || r.freeText).map(([scenarioId, r]) => ({ scenarioId, choice: r.choice })) } } };
  const arche = archetypeFor(asProfileShape, t);
  const xpPoints = 15; // POINTS_BY_TYPE.intake_completed (server/community/xp-rules.mjs) - real, not decorative.
  const rows = [
    [t('mhAge'), a.demographics.age != null ? String(a.demographics.age) : '—', 2],
    [t('mhMaritalStatus'), a.demographics.maritalStatus ? t('mhMaritalStatus_' + a.demographics.maritalStatus) : '—', 2],
    [t('mhOccupation'), a.demographics.primaryOccupation ? t('mhOccupationType_' + a.demographics.primaryOccupation) : '—', 2],
    [t('mhCapitalType'), a.financialContext.capitalType ? t('mhCapitalType_' + a.financialContext.capitalType) : '—', 3],
    [t('mhInTradingLabel'), (a.financialContext.capitalAllocationPercent || 0) + '%', 3],
    [t('mhYearsTrading'), hist.yearsTrading != null ? String(hist.yearsTrading) : '—', 4],
    [t('mhMarketsTraded'), (hist.marketsTraded || []).length ? t('mhInstrumentsSelectedCount', { n: hist.marketsTraded.length }) : '—', 4],
    [t('mhLargestWinTitle'), hist.largestWin.amount || hist.largestWin.percent ? <span dir="ltr">{[hist.largestWin.amount, hist.largestWin.percent ? hist.largestWin.percent + '%' : ''].filter(Boolean).join(' · ')}</span> : '—', 5],
    [t('mhLargestLossTitle'), hist.largestLoss.amount || hist.largestLoss.percent ? <span dir="ltr">{[hist.largestLoss.amount, hist.largestLoss.percent ? hist.largestLoss.percent + '%' : ''].filter(Boolean).join(' · ')}</span> : '—', 5],
    [t('mhMarginCalls'), hist.marginCallOrZeroedCount ? (hist.marginCallOrZeroedCount === 1 ? t('mhMarginOnce') : t('mhMarginTimes', { n: hist.marginCallOrZeroedCount })) : t('mhMarginNever'), 5],
    [t('mhFirstDrewYouLabel'), a.motivationForTrading ? t('mhMotivation_' + a.motivationForTrading) : '—', 6],
    [t('mhDisclosureTitle'), t('mhDisclosureCount', { n: famCount }), 7],
    [t('mhScenariosAnsweredLabel'), <span dir="ltr">{scenarioCount + ' / ' + SCENARIOS.length}</span>, 8]
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '296px minmax(0,1fr)', gap: 20, alignItems: 'start' }}>
      <Panel variant="base" radius={12} texture style={{ padding: 20 }}>
        {/* Panel wraps its children in its own plain block <div> - a display:flex passed via
            Panel's own `style` only affects Panel's OUTER box, never that inner wrapper, so the
            flex layout for THESE children has to be built explicitly here instead. */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <CharacterPortrait character={navryaId} size={132} editable={false} />
          <span style={{ font: 'var(--type-caption)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('mhReadsAs')}</span>
          <span style={{ font: '600 22px/28px var(--font-display)', letterSpacing: '.06em', color: 'var(--char-accent)', textAlign: 'center' }}>{arche.title}</span>
          <span style={{ font: 'var(--type-body)', fontSize: 13, lineHeight: '20px', color: 'var(--text-muted)', textAlign: 'center' }}>{arche.body}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 2, padding: '9px 14px', borderRadius: 6, border: '1px solid var(--border-gold)', background: 'var(--char-active-surface)' }}>
            <Icon name="reward" size={16} style={{ color: 'var(--char-accent)' }} />
            <span dir="ltr" style={{ font: 'var(--type-username)', color: 'var(--char-accent)', fontVariantNumeric: 'tabular-nums' }}>{t('mhXpOnSeal', { points: xpPoints })}</span>
          </div>
        </div>
      </Panel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
          {rows.map(([label, value, step]) => <SummaryTile key={label} label={label} value={value} onEdit={() => onEditStep(step)} />)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: 14, borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.45)' }}>
          <Icon name="edit" size={16} style={{ color: 'var(--gold-warm)', flex: 'none' }} />
          <span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{t('mhIntakeInfo3Text')}</span>
        </div>
      </div>
    </div>
  );
}

function SealedStep({ profile, t }) {
  const arche = archetypeFor(profile, t);
  return (
    <div style={{ minHeight: 420, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, textAlign: 'center' }}>
      <span style={{ width: 96, height: 96, display: 'grid', placeItems: 'center', borderRadius: '50%', border: '2px solid var(--char-accent)', background: 'var(--char-active-surface)', color: 'var(--char-accent)', boxShadow: '0 0 34px var(--char-glow)' }}>
        <Icon name="check" size={40} />
      </span>
      <span style={{ font: 'var(--type-caption)', letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('mhSealedTitle')}</span>
      <span style={{ font: '600 30px/36px var(--font-display)', letterSpacing: '.06em', color: 'var(--text-primary)' }}>{arche.title}</span>
      <span style={{ maxWidth: 520, font: 'var(--type-body)', fontSize: 13.5, lineHeight: '21px', color: 'var(--text-muted)' }}>{arche.body}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, padding: '10px 16px', borderRadius: 8, border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.55)' }}>
        <Icon name="reward" size={18} style={{ color: 'var(--char-accent)' }} />
        <span dir="ltr" style={{ font: 'var(--type-username)', color: 'var(--char-accent)' }}>{t('mhXpBadge', { points: 15 })}</span>
        <span style={{ width: 1, height: 18, background: 'var(--divider-gold)' }} />
        <span style={{ font: 'var(--type-caption)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('mhPsychologyUnlocked')}</span>
      </div>
    </div>
  );
}

// ============================================================================
// Draft <-> store shaping
// ============================================================================
function draftFromProfile(profile) {
  const intake = profile.intake;
  const responses = {};
  profile.psychologicalProfile.scenarioAssessment.responses.forEach((r) => { responses[r.scenarioId] = { choice: r.choice, sliderValue: r.sliderValue, freeText: r.freeText }; });
  return {
    // AgeSlider always displays/commits a number, defaulting an unset age to 34 - matches the
    // vanilla wizard's ageSlider(initial) which did the same (`initial || 34`).
    demographics: { ...intake.demographics, age: intake.demographics.age == null ? 34 : intake.demographics.age },
    financialContext: { ...intake.financialContext },
    tradingHistory: { ...intake.tradingHistory, largestWin: { ...intake.tradingHistory.largestWin }, largestLoss: { ...intake.tradingHistory.largestLoss } },
    motivationForTrading: intake.motivationForTrading,
    firstBigLossReaction: intake.firstBigLossReaction,
    transparencyMatrix: { ...intake.transparencyMatrix },
    scenarioResponses: responses
  };
}

// ============================================================================
// Main component
// ============================================================================
function MentalHealthIntakeModal({ container, onClose, onFinish }) {
  const i18n = window.TradeJournalMentalHealthI18n;
  const store = window.TradeJournalMentalHealthStore;
  const t = i18n.t;
  const lang = i18n.language();
  const rtl = i18n.direction() === 'rtl';
  const navryaId = currentNavryaCharacter(); // design-system skin id: hunter/commander/engineer/master
  const character = Object.keys(CHARACTERS).find((k) => CHARACTERS[k].navryaCharacter === navryaId) || 'hunter'; // this app's id (sage, not master)

  const [step, setStep] = React.useState(1);
  const [sealed, setSealed] = React.useState(false);
  const [sealedProfile, setSealedProfile] = React.useState(null);
  const [draft, setDraft] = React.useState(() => draftFromProfile(store.load()));

  // Persists the current draft into the real store. Called before every navigation (Next/
  // Previous/Skip/Seal), matching the original wizard's "saves progressively as you go" - closing
  // the modal mid-way, or jumping back via a summary tile's edit button, never loses anything.
  const commit = React.useCallback(() => {
    let live = store.load();
    live.intake.demographics = { ...draft.demographics };
    live.intake.financialContext = { ...draft.financialContext };
    live.intake.tradingHistory = { ...draft.tradingHistory };
    live.intake.motivationForTrading = draft.motivationForTrading;
    live.intake.firstBigLossReaction = draft.firstBigLossReaction;
    live.intake.transparencyMatrix = { ...draft.transparencyMatrix };
    live = store.save(live);
    Object.entries(draft.scenarioResponses).forEach(([scenarioId, r]) => {
      if (!r.choice && r.sliderValue == null && !r.freeText) return;
      live.psychologicalProfile.scenarioAssessment.draftResponse = { choice: r.choice || '', sliderValue: r.sliderValue == null ? null : Number(r.sliderValue), freeText: r.freeText || null };
      const scenario = SCENARIOS.find((s) => s.id === scenarioId);
      live = store.commitDraftScenarioResponse(live, scenarioId, scenario ? scenario.measuresConstruct : '');
    });
    return live;
  }, [draft, store]);

  function goTo(n) { commit(); setStep(Math.max(1, Math.min(TOTAL_STEPS, n))); setSealed(false); }
  function goNext() { if (step >= TOTAL_STEPS) { finish(); } else { goTo(step + 1); } }
  function goPrev() { goTo(step - 1); }
  function finish() {
    let live = commit();
    live.intake.completed = true;
    live.intake.completedAt = store.now();
    live.intake.filledVia = live.intake.filledVia === 'chat' ? 'mixed' : 'form';
    live = store.save(live);
    setSealedProfile(live);
    setSealed(true);
    if (onFinish) onFinish();
  }

  React.useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') { onClose(); return; }
      const tag = e.target && e.target.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;
      if (e.key === 'ArrowRight' && !e.metaKey && step !== 2 && step !== 3) goNext();
      if (e.key === 'ArrowLeft' && !e.metaKey && step !== 2 && step !== 3) goPrev();
    }
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  });

  // AI-assistant chat dock can fill fields into the currently open intake - same draft-then-
  // approve store.applySuggestion pipeline the chat-based intake filling already uses, just
  // re-reading the result back into React state instead of a manual re-render.
  // Journey H1: field -> real Intake step map, built from the SAME intakePaths list this
  // registration's own allowlist already uses (mental-health.types.js) - every group here is a
  // whole-section dot-prefix (e.g. 'intake.demographics.'), matching how DemographicsStep/
  // FinancialStep/etc. each own one whole intake.<section>.* branch (see this file's own
  // step->component map just above, step === 2 ? <DemographicsStep> ...). Steps 1 (Orientation),
  // 5 (Extremes - largestWin/largestLoss/marginCallOrZeroedCount are real numericPaths fields but
  // NOT in intakePaths, so nothing on this step is AI-fillable through this registration today),
  // 8-12 (Scenario - a SEPARATE, non-intakePaths allowlist) and 13 (Summary/Sealed) have no
  // intakePaths fields at all, so no group exists for them - a field belonging to one of those
  // simply keeps whatever step is already showing (stepForPath returns null). motivationForTrading
  // AND firstBigLossReaction are BOTH rendered together inside MotivationStep (step 6) - despite
  // the name, "first big loss reaction" is the emotional-reaction question paired with motivation,
  // not one of ExtremesStep's own objective win/loss amount fields (step 5).
  const intakeStepMap = window.TradeJournalAIWizardStepMap ? window.TradeJournalAIWizardStepMap.forGroups({
    2: ['intake.demographics.'],
    3: ['intake.financialContext.'],
    4: ['intake.tradingHistory.'],
    6: ['intake.motivationForTrading', 'intake.firstBigLossReaction'],
    7: ['intake.transparencyMatrix.']
  }) : null;

  React.useEffect(() => {
    const registry = window.TradeJournalAIProcessRegistry;
    const types = window.TradeJournalMentalHealthTypes;
    if (!registry) return undefined;
    registry.register('mh-intake', {
      layer: 'foreground',
      allowlist: (types.intakePaths || []).slice(),
      // DOM-presence check, matching every other registrant's isOpen() convention (see
      // ai-process-registry.js) - no separate close-event plumbing needed.
      isOpen: () => document.body.contains(container),
      activeStep: () => step,
      stepForPath: intakeStepMap ? intakeStepMap.stepForPath : null,
      goToStep: goTo,
      applyValue: (path, value, mode) => {
        if ((types.intakePaths || []).indexOf(path) === -1) return;
        let profile = store.load();
        const suggestionId = store.uid('mh-dock');
        profile = store.addMessage(profile, 'assistant', '', [{ id: suggestionId, path, value, section: path.split('.')[0], mode: mode === 'append' ? 'append' : 'replace', status: 'pending', createdAt: store.now() }]);
        store.applySuggestion(profile, { id: suggestionId }, 'applied');
        setDraft(draftFromProfile(store.load()));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const meta = stepMeta(step, t);
  const activeChapterIdx = CHAPTER_STEPS.findIndex((steps) => steps.indexOf(step) > -1);

  const scenario = step >= 8 && step <= 12 ? SCENARIOS[step - 8] : null;

  return (
    <div
      dir={rtl ? 'rtl' : 'ltr'}
      style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 28, boxSizing: 'border-box', background: 'var(--scrim)', backdropFilter: 'blur(6px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <Panel
        variant="prestige" radius={12} ornament ornamentSize={16} ornamentInset={6}
        style={{ width: 'min(1120px,100%)', maxHeight: 'calc(100vh - 56px)', background: 'var(--ink-900)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        role="dialog" aria-modal="true" aria-label={t('mhIntakeTitle')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 22px 14px' }}>
          <span style={{ width: 44, height: 44, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 8, border: '1px solid var(--char-accent)', background: 'var(--char-active-surface)', color: 'var(--char-accent)' }}>
            <Icon name="psychology" size={22} />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <span style={{ font: 'var(--type-section-label)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('mhIntakeEyebrow')}</span>
            <h2 style={{ margin: 0, font: 'var(--type-display-lg)', letterSpacing: 'var(--tracking-display)', color: 'var(--text-primary)' }}>{t('mhIntakeTitle')}</h2>
          </div>
          <span style={{ flex: 1 }} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <span className="navrya-tabular" dir="ltr" style={{ font: 'var(--type-countdown)', color: 'var(--gold-warm)' }}>{(step < 10 ? '0' + step : String(step)) + ' / ' + TOTAL_STEPS}</span>
            <span style={{ font: 'var(--type-caption)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{sealed ? t('mhChapterSeal') : t(CHAPTER_KEYS[activeChapterIdx])}</span>
          </div>
          <button
            type="button" onClick={onClose} aria-label={t('mhClose')}
            style={{ width: 44, height: 44, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border-gold)', background: 'rgba(11,20,21,.72)', color: 'var(--text-muted)' }}
          ><Icon name="close" size={18} /></button>
        </div>

        {/* Chapter progress */}
        {!sealed && (
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', padding: '0 22px 14px' }}>
            {CHAPTER_STEPS.map((steps, idx) => {
              const active = idx === activeChapterIdx;
              return (
                <div key={idx} style={{ flex: steps.length, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 88 }}>
                  <span style={{
                    font: 'var(--type-caption)', letterSpacing: '.12em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    color: active ? 'var(--char-accent)' : 'var(--text-disabled)'
                  }}>{t(CHAPTER_KEYS[idx])}</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {steps.map((n) => (
                      <span key={n} style={{
                        flex: 1, height: 5, borderRadius: 3,
                        background: n < step ? 'var(--char-accent)' : n === step ? 'var(--gold-warm)' : 'rgba(244,234,215,.1)',
                        boxShadow: n === step ? '0 0 12px var(--char-glow)' : 'none'
                      }} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Body */}
        <div style={{ position: 'relative', borderTop: '1px solid var(--border-hairline)', borderBottom: '1px solid var(--border-hairline)', background: 'var(--ink-950)' }}>
          <div className="navrya-scroll" style={{ height: 'min(486px,58vh)', overflowY: 'auto', overflowX: 'hidden', padding: 22 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {!sealed && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <h3 style={{ margin: 0, font: 'var(--type-display-md)', letterSpacing: 'var(--tracking-display)', color: 'var(--text-primary)' }}>{meta.title}</h3>
                  {meta.hint && <p style={{ margin: 0, font: 'var(--type-body)', fontSize: 13.5, lineHeight: '20px', color: 'var(--text-muted)', maxWidth: 760 }}>{meta.hint}</p>}
                </div>
              )}
              {sealed ? (
                <SealedStep profile={sealedProfile} t={t} />
              ) : step === 1 ? (
                <OrientationStep character={character} navryaId={navryaId} t={t} lang={lang} />
              ) : step === 2 ? (
                <DemographicsStep draft={draft} setDraft={setDraft} t={t} />
              ) : step === 3 ? (
                <FinancialStep draft={draft} setDraft={setDraft} t={t} />
              ) : step === 4 ? (
                <ExperienceStep draft={draft} setDraft={setDraft} t={t} />
              ) : step === 5 ? (
                <ExtremesStep draft={draft} setDraft={setDraft} t={t} />
              ) : step === 6 ? (
                <MotivationStep draft={draft} setDraft={setDraft} t={t} />
              ) : step === 7 ? (
                <TransparencyStep draft={draft} setDraft={setDraft} t={t} />
              ) : scenario ? (
                <ScenarioStep scenario={scenario} draft={draft} setDraft={setDraft} t={t} />
              ) : (
                <SummaryStep draft={draft} navryaId={navryaId} t={t} onEditStep={goTo} />
              )}
            </div>
          </div>
          <span aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 56, pointerEvents: 'none', background: 'linear-gradient(180deg,rgba(3,8,7,0),var(--ink-950))' }} />
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 22px' }}>
          {sealed ? (
            <>
              <span style={{ flex: 1 }} />
              <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-disabled)', marginInlineEnd: 6 }}>{t('mhFootNoteSaved')}</span>
              <Button variant="primary" icon="check" onClick={onClose}>{t('mhDone')}</Button>
            </>
          ) : (
            <>
              {step > 1 && step < TOTAL_STEPS && (
                <Button variant="ghost" iconAfter="active-arrow" onClick={goNext}>{t('mhSkip')}</Button>
              )}
              <span style={{ flex: 1 }} />
              <span style={{ font: 'var(--type-caption)', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-disabled)', marginInlineEnd: 6 }}>
                {step === TOTAL_STEPS ? t('mhFootNoteSealing', { points: 15 }) : t('mhFootNoteOptional')}
              </span>
              {step > 1 && <Button variant="secondary" icon="chevron-left" onClick={goPrev}>{t('mhPrevious')}</Button>}
              <Button variant="primary" iconAfter={step === TOTAL_STEPS ? 'check' : 'active-arrow'} onClick={goNext}>
                {step === 1 ? t('mhBeginIntake') : step === TOTAL_STEPS ? t('mhSealProfile') : step === TOTAL_STEPS - 1 ? t('mhReview') : t('mhNext')}
              </Button>
            </>
          )}
        </div>
      </Panel>
    </div>
  );
}

export function openIntake(onFinish) {
  const i18n = window.TradeJournalMentalHealthI18n;
  const store = window.TradeJournalMentalHealthStore;
  const types = window.TradeJournalMentalHealthTypes;
  if (!i18n || !store || !types) return;
  const container = document.createElement('div');
  container.dataset.character = currentNavryaCharacter();
  document.body.append(container);
  const root = createRoot(container);
  function close() { root.unmount(); container.remove(); }
  root.render(<MentalHealthIntakeModal container={container} onClose={close} onFinish={() => { if (onFinish) onFinish(); }} />);
}
