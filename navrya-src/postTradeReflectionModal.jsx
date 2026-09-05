import React from 'react';
import { createRoot } from 'react-dom/client';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { currentNavryaCharacter } from './currentCharacter.js';

// Redesign of mental-health-continuous.js's openPostTradeReflection() - the multi-step "how did
// that trade go" wizard TradeJournalMentalHealthContinuous.onTradeClosed() opens right after a
// position is closed (closePositionModal.jsx's onSave already calls onTradeClosed(saved), same
// as the legacy closeTrade()). Same real backend throughout: same steps (emotion thermometer,
// three trade-judgment ratings, plan-deviation + would-take-again, a conditional revenge check
// when the trade was a loss, sentence-of-the-day), same
// TradeJournalMentalHealthStore.addPostTradeReflection() write, same
// psychology-store.js postTradeReflection.enabled/cooldownMinutes gate, same revenge-check
// cooldownTimerStartedAt write, same content-safety gate on the sentence field. Only the dialog
// itself moves from hand-built DOM (tj-wizard) to React + the NAVRYA design system: the emotion
// step reuses the same mood-picker chip grid as logEmotionModal.jsx's "Log Emotion" editor (per
// the redesign brief - "the emotions part should look like Log Trade's emotion logging"), and the
// three "degree" ratings reuse that same modal's numbered 1-10 row (its stress-level control) -
// the one place this app already defines what a NAVRYA rating scale looks like, replacing the
// legacy's bare <input type=range> sliders.

const EMOTIONS = ['anger', 'anxiety', 'calm', 'euphoria', 'regret', 'indifference', 'disappointment', 'confidence'];
const EMOTION_ICONS = {
  anger: 'flame', anxiety: 'activity', calm: 'leaf', euphoria: 'zap',
  regret: 'rotate-ccw', indifference: 'circle', disappointment: 'cloud', confidence: 'check'
};
const DEVIATION_LEVELS = ['none', 'slightly', 'yes'];
const TAKE_AGAIN = ['yes', 'no', 'unsure'];
const REVENGE_CHOICES = ['rest', 'recover', 'saw_setup'];

function SectionLabel({ children }) {
  return <span style={{ font: 'var(--type-section-label)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--gold-warm)' }}>{children}</span>;
}

// Same 1-10 numbered-button row logEmotionModal.jsx uses for stress level - the control this app
// already uses to render a "degree" scale, reused here instead of the legacy raw range slider.
function RatingRow({ label, value, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <SectionLabel>{label}</SectionLabel>
        <span style={{ flex: 1 }} />
        <span className="navrya-tabular" dir="ltr" style={{ font: 'var(--type-metric-value)', color: 'var(--char-accent)' }}>{value}</span>
      </div>
      <div style={{ display: 'flex', gap: 6, direction: 'ltr' }}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
          const on = n <= value;
          return (
            <button
              key={n} type="button" onClick={() => onChange(n)} aria-label={label + ' ' + n}
              style={{ flex: 1, height: 38, borderRadius: 6, cursor: 'pointer', border: '1px solid ' + (on ? 'var(--char-accent)' : 'var(--divider-gold)'), background: on ? 'var(--char-active-surface)' : 'rgba(11,20,21,.5)', color: on ? 'var(--char-accent)' : 'var(--text-disabled)', font: 'var(--type-caption)' }}
            >{n}</button>
          );
        })}
      </div>
    </div>
  );
}

// Single-select pill row (deviated-from-plan / would-take-again / revenge-choice) - same
// selected/idle visual language as every other choice control redesigned in this app.
function ChoicePills({ options, labelPrefix, value, onChange, t }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map((opt) => {
        const sel = value === opt;
        return (
          <button
            key={opt} type="button" onClick={() => onChange(opt)}
            style={{ flex: '1 1 140px', minWidth: 0, height: 44, borderRadius: 8, cursor: 'pointer', border: '1px solid ' + (sel ? 'var(--char-accent)' : 'var(--divider-gold)'), background: sel ? 'var(--char-active-surface)' : 'rgba(11,20,21,.5)', color: sel ? 'var(--char-accent)' : 'var(--text-muted)', font: '500 13.5px/19px var(--font-ui)', boxShadow: sel ? '0 0 16px var(--char-glow)' : 'none' }}
          >{t(labelPrefix + opt)}</button>
        );
      })}
    </div>
  );
}

// mental-health-safety.js's renderSafetyCard() returns a real DOM node (not JSX) - same host
// pattern tradeLogModal.jsx/logEmotionModal.jsx already use for the identical safety gate.
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

function PostTradeReflectionModal({ trade, settings, onClose }) {
  const mhi18n = window.TradeJournalMentalHealthI18n;
  const mh = window.TradeJournalMentalHealthStore;
  const mhSafety = window.TradeJournalMentalHealthSafety;
  const t = mhi18n.t;
  const rtl = mhi18n.direction() === 'rtl';
  // Same condition as the legacy wizard: the revenge-check step only exists when the trade that
  // just closed was a loss.
  const showRevenge = trade.outcome === 'loss';
  const steps = React.useMemo(() => {
    const base = ['emotion', 'ratings', 'plan', 'sentence'];
    if (showRevenge) base.splice(3, 0, 'revenge');
    return base;
  }, [showRevenge]);
  const stepMeta = {
    emotion: { label: t('mhEmotionThermometer'), icon: 'psychology' },
    ratings: { label: t('mhTradeJudgment'), icon: 'report' },
    plan: { label: t('mhKeyQuestion'), icon: 'execution' },
    revenge: { label: t('mhRevengeCheckQuestion'), icon: 'shield-alert' },
    sentence: { label: t('mhSentenceOfTheDay'), icon: 'quote' }
  };

  const [step, setStep] = React.useState(0);
  const [emotionThermometer, setEmotionThermometer] = React.useState([]);
  const [setupQualityRating, setSetupQualityRating] = React.useState(5);
  const [planAdherenceRating, setPlanAdherenceRating] = React.useState(5);
  const [emotionManagementRating, setEmotionManagementRating] = React.useState(5);
  const [deviatedFromPlan, setDeviatedFromPlan] = React.useState('none');
  const [deviationReason, setDeviationReason] = React.useState('');
  const [wouldTakeAgain, setWouldTakeAgain] = React.useState('unsure');
  const [revengeChoice, setRevengeChoice] = React.useState(null);
  const [sentenceOfTheDay, setSentenceOfTheDay] = React.useState('');
  const [safetyNode, setSafetyNode] = React.useState(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  // AI process registry - same allowlist/applyValue contract the legacy wizard registered under
  // 'mh-post-trade-reflection', so the global assistant dock can still suggest values into it.
  const stepRef = React.useRef(step);
  stepRef.current = step;
  const stepsRef = React.useRef(steps);
  stepsRef.current = steps;
  const finishRef = React.useRef(null);
  React.useEffect(() => {
    const registry = window.TradeJournalAIProcessRegistry;
    if (!registry) return undefined;
    let mounted = true;
    registry.register('mh-post-trade-reflection', {
      layer: 'foreground', actionId: 'psychology.postTradeReflection.fill',
      allowlist: ['setupQualityRating', 'planAdherenceRating', 'emotionManagementRating', 'deviationReason', 'sentenceOfTheDay'],
      isOpen: () => mounted,
      activeStep: () => steps[stepRef.current],
      stepForPath: (path) => {
        if (path === 'setupQualityRating' || path === 'planAdherenceRating' || path === 'emotionManagementRating') return 'ratings';
        if (path === 'deviationReason') return 'plan';
        if (path === 'sentenceOfTheDay') return 'sentence';
        return null;
      },
      goToStep,
      applyValue: (path, value) => {
        if (path === 'setupQualityRating') setSetupQualityRating(Number(value));
        else if (path === 'planAdherenceRating') setPlanAdherenceRating(Number(value));
        else if (path === 'emotionManagementRating') setEmotionManagementRating(Number(value));
        else if (path === 'deviationReason') setDeviationReason(String(value || ''));
        else if (path === 'sentenceOfTheDay') setSentenceOfTheDay(String(value || ''));
      },
      submit: () => finishRef.current && finishRef.current()
    });
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleEmotion(id) {
    setEmotionThermometer((list) => (list.indexOf(id) > -1 ? list.filter((x) => x !== id) : list.concat([id])));
  }

  function finish() {
    if (saving) return;
    setSaving(true);
    const data = {
      emotionThermometer, setupQualityRating, planAdherenceRating, emotionManagementRating,
      deviatedFromPlan, deviationReason: deviationReason || null, wouldTakeAgain,
      revengeCheck: showRevenge ? { shown: true, choice: revengeChoice, cooldownTimerStartedAt: revengeChoice === 'recover' ? mh.now() : null } : null,
      sentenceOfTheDay: sentenceOfTheDay || null
    };
    mh.addPostTradeReflection(mh.load(), trade.id, data);
    if (window.TradeJournalTradeUI) window.TradeJournalTradeUI.toast(t('mhPostTradeSaved'), 'success');
    onClose();
  }
  finishRef.current = finish;

  // This is the same state setter every visible step control ultimately uses. The Process
  // Registry calls it before applying a field or before Voice asks for the next field.
  function goToStep(stepKey) {
    const index = stepsRef.current.indexOf(stepKey);
    if (index >= 0) setStep(index);
  }

  function goNext() {
    const isLast = step === steps.length - 1;
    if (steps[step] === 'sentence' && sentenceOfTheDay && mhSafety && mhSafety.checkText(sentenceOfTheDay).flagged) {
      setSafetyNode(mhSafety.renderSafetyCard(() => setSafetyNode(null)));
      return;
    }
    if (isLast) { finish(); return; }
    setStep((s) => s + 1);
  }
  function goBack() { if (step === 0) onClose(); else setStep((s) => s - 1); }

  const stepList = steps.map((key, i) => ({ key, n: i + 1, ...stepMeta[key], done: i < step, current: i === step }));
  const current = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <div
      dir={rtl ? 'rtl' : 'ltr'}
      style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, boxSizing: 'border-box', background: 'var(--scrim)', backdropFilter: 'blur(6px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <Panel
        variant="prestige" radius={12} ornament ornamentSize={16} ornamentInset={6}
        role="dialog" aria-modal="true" aria-label={t('mhPostTradeTitle')}
        style={{ width: 'min(760px,100%)', maxHeight: 'calc(100vh - 48px)', background: 'var(--ink-900)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px' }}>
          <span style={{ width: 44, height: 44, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 8, border: '1px solid var(--char-accent)', background: 'var(--char-active-surface)', color: 'var(--char-accent)' }}><Icon name="psychology" size={22} /></span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <span style={{ font: 'var(--type-section-label)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('mhTabContinuous')}</span>
            <h2 style={{ margin: 0, font: 'var(--type-display-lg)', letterSpacing: 'var(--tracking-display)', color: 'var(--text-primary)' }}>{t('mhPostTradeTitle')}</h2>
          </div>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={onClose} aria-label={t('mhClose')} style={{ width: 44, height: 44, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border-gold)', background: 'rgba(11,20,21,.72)', color: 'var(--text-muted)' }}><Icon name="close" size={18} /></button>
        </div>

        {/* Step nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 20px 14px' }}>
          {stepList.map((s) => (
            <span
              key={s.key}
              style={{
                flex: 1, minWidth: 0, height: 44, display: 'flex', alignItems: 'center', gap: 9, padding: '0 12px', borderRadius: 8,
                border: s.current ? '2px solid var(--char-accent)' : s.done ? '1px solid var(--char-accent)' : '1px solid var(--divider-gold)',
                background: s.current || s.done ? 'var(--char-active-surface)' : 'rgba(11,20,21,.5)',
                color: s.current ? 'var(--text-primary)' : s.done ? 'var(--char-accent)' : 'var(--text-muted)'
              }}
            >
              {s.done
                ? <span style={{ width: 20, height: 20, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: '50%', background: 'var(--char-accent)', color: 'var(--ink-950)' }}><Icon name="check" size={13} /></span>
                : <span className="navrya-tabular" style={{ width: 20, height: 20, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: '50%', border: '1px solid ' + (s.current ? 'var(--char-accent)' : 'var(--divider-gold)'), font: '600 11px/11px var(--font-ui)' }}>{s.n}</span>}
              <span style={{ font: 'var(--type-caption)', letterSpacing: '.06em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
            </span>
          ))}
        </div>

        {/* Body */}
        <div className="navrya-scroll" style={{ minHeight: 260, maxHeight: '54vh', boxSizing: 'border-box', padding: '4px 20px 20px', overflowY: 'auto', background: 'var(--ink-950)' }}>
          {current === 'emotion' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <SectionLabel>{t('mhEmotionThermometer')}</SectionLabel>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8 }}>
                {EMOTIONS.map((id) => {
                  const on = emotionThermometer.indexOf(id) > -1;
                  return (
                    <button
                      key={id} type="button" onClick={() => toggleEmotion(id)}
                      style={{ minWidth: 0, height: 52, display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', borderRadius: 8, cursor: 'pointer', border: on ? '2px solid var(--char-accent)' : '1px solid var(--divider-gold)', background: on ? 'var(--char-active-surface)' : 'rgba(11,20,21,.55)', color: on ? 'var(--char-accent)' : 'var(--text-muted)', boxShadow: on ? '0 0 16px var(--char-glow)' : 'none' }}
                    ><Icon name={EMOTION_ICONS[id]} size={17} /><span style={{ font: '500 13.5px/18px var(--font-ui)' }}>{t('mhEmotion_' + id)}</span></button>
                  );
                })}
              </div>
            </div>
          )}
          {current === 'ratings' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
              <SectionLabel>{t('mhTradeJudgment')}</SectionLabel>
              <RatingRow label={t('mhSetupQuality')} value={setupQualityRating} onChange={setSetupQualityRating} />
              <RatingRow label={t('mhPlanAdherence')} value={planAdherenceRating} onChange={setPlanAdherenceRating} />
              <RatingRow label={t('mhEmotionManagement')} value={emotionManagementRating} onChange={setEmotionManagementRating} />
            </div>
          )}
          {current === 'plan' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <SectionLabel>{t('mhKeyQuestion')}</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={{ font: 'var(--type-body)', color: 'var(--text-primary)' }}>{t('mhDeviatedFromPlan')}</span>
                <ChoicePills options={DEVIATION_LEVELS} labelPrefix="mhDeviation_" value={deviatedFromPlan} onChange={setDeviatedFromPlan} t={t} />
                <input
                  dir="auto" value={deviationReason} onChange={(e) => setDeviationReason(e.target.value)} placeholder={t('mhDeviationReasonPlaceholder')}
                  style={{ height: 44, boxSizing: 'border-box', padding: '0 14px', borderRadius: 8, border: '1px solid var(--divider-gold)', background: 'rgba(3,8,7,.55)', color: 'var(--text-primary)', font: '500 13.5px/19px var(--font-ui)', outline: 'none' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={{ font: 'var(--type-body)', color: 'var(--text-primary)' }}>{t('mhWouldTakeAgainQuestion')}</span>
                <ChoicePills options={TAKE_AGAIN} labelPrefix="mhTakeAgain_" value={wouldTakeAgain} onChange={setWouldTakeAgain} t={t} />
              </div>
            </div>
          )}
          {current === 'revenge' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <SectionLabel>{t('mhRevengeCheckQuestion')}</SectionLabel>
              <ChoicePills options={REVENGE_CHOICES} labelPrefix="mhRevengeChoice_" value={revengeChoice} onChange={setRevengeChoice} t={t} />
              {revengeChoice === 'recover' && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 8, border: '1px solid rgba(255,176,32,.4)', background: 'rgba(255,176,32,.08)' }}>
                  <span style={{ color: 'var(--warning)', display: 'flex', flex: 'none' }}><Icon name="triangle-alert" size={16} /></span>
                  <span style={{ font: 'var(--type-body)', color: 'var(--text-primary)' }}>{t('mhRevengeWarningBody', { minutes: settings.cooldownMinutes })}</span>
                </div>
              )}
            </div>
          )}
          {current === 'sentence' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <SectionLabel>{t('mhSentenceOfTheDay')}</SectionLabel>
              <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{t('mhSentenceHint')}</span>
              <textarea
                dir="auto" rows={4} value={sentenceOfTheDay} onChange={(e) => setSentenceOfTheDay(e.target.value)} placeholder={t('mhSentencePlaceholder')}
                style={{ boxSizing: 'border-box', padding: 14, borderRadius: 8, border: '1px solid var(--divider-gold)', background: 'rgba(3,8,7,.55)', color: 'var(--text-primary)', font: 'var(--type-body)', lineHeight: '22px', resize: 'vertical', outline: 'none' }}
              />
              {safetyNode && <SafetyCardHost node={safetyNode} />}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderTop: '1px solid var(--border-hairline)' }}>
          <Button variant="ghost" icon={step === 0 ? 'close' : 'collapse'} onClick={goBack}>{step === 0 ? t('mhSkip') : t('mhPrevious')}</Button>
          <span style={{ flex: 1 }} />
          <Button variant="primary" icon={isLast ? 'check' : undefined} iconAfter={isLast ? undefined : 'expand'} onClick={goNext} disabled={saving}>
            {isLast ? t('mhFinish') : t('mhNext')}
          </Button>
        </div>
      </Panel>
    </div>
  );
}

export function openPostTradeReflection(trade) {
  const mhi18n = window.TradeJournalMentalHealthI18n;
  const mh = window.TradeJournalMentalHealthStore;
  const psy = window.TradeJournalPsychologyStore;
  if (!mhi18n || !mh || !trade) return;
  const settings = (psy ? psy.settings().postTradeReflection : null) || { enabled: true, cooldownMinutes: 15 };
  if (!settings.enabled) return;
  const container = document.createElement('div');
  container.dataset.character = currentNavryaCharacter();
  document.body.append(container);
  const root = createRoot(container);
  function close() { root.unmount(); container.remove(); }
  root.render(<PostTradeReflectionModal trade={trade} settings={settings} onClose={close} />);
}
