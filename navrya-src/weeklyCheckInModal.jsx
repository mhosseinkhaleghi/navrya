import React from 'react';
import { createRoot } from 'react-dom/client';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { currentNavryaCharacter } from './currentCharacter.js';

// The real, answerable weekly reflection - psychologyView.jsx's "Run check-in now"/"Run weekly
// check-in" buttons used to call mental-health-collector.js's captureWeeklySnapshot() directly,
// which only ever aggregates numbers already present in trade history (no question, no answer,
// no visible result). The card's own copy ("Four questions, about two minutes" - psyCheckInPromptBody
// in trade-i18n.js) always described a real short popup; this is that popup, finally built,
// reusing the same Panel/Button/rating-row/emotion-grid language postTradeReflectionModal.jsx and
// preSessionCheckInModal.jsx already established for this feature area. On save it still calls
// captureWeeklySnapshot() itself (see openWeeklyCheckIn below) so every existing reader of
// progressTracking.weeklySnapshots (the WEEKLY SCORE widget, mental-health-scheduler.js's due
// check) keeps working unchanged - this only adds the subjective side next to it
// (TradeJournalMentalHealthStore.addWeeklyCheckIn), it doesn't replace the computed one.

const MOODS = ['confidence', 'calm', 'anxiety', 'euphoria', 'indifference', 'disappointment'];
const MOOD_ICONS = { confidence: 'check', calm: 'leaf', anxiety: 'activity', euphoria: 'zap', indifference: 'circle', disappointment: 'cloud' };

function SectionLabel({ children }) {
  return <span style={{ font: 'var(--type-section-label)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--gold-warm)' }}>{children}</span>;
}

// Same 1-10 numbered-button row postTradeReflectionModal.jsx's RatingRow / preSessionCheckInModal.jsx's
// RatingRow use - the control this app already defines for a "degree" scale.
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

// Single-select mood grid, same visual language as postTradeReflectionModal.jsx's emotion
// thermometer (which is multi-select) - only one mood makes sense for "how do you feel heading
// into next week", so a plain radio-like selection rather than a toggle set.
function MoodGrid({ value, onChange, t }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 8 }}>
      {MOODS.map((id) => {
        const on = value === id;
        return (
          <button
            key={id} type="button" onClick={() => onChange(id)}
            style={{ minWidth: 0, height: 48, display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', borderRadius: 8, cursor: 'pointer', border: on ? '2px solid var(--char-accent)' : '1px solid var(--divider-gold)', background: on ? 'var(--char-active-surface)' : 'rgba(11,20,21,.55)', color: on ? 'var(--char-accent)' : 'var(--text-muted)', boxShadow: on ? '0 0 16px var(--char-glow)' : 'none' }}
          ><Icon name={MOOD_ICONS[id]} size={16} /><span style={{ font: '500 13px/18px var(--font-ui)' }}>{t('mhEmotion_' + id)}</span></button>
        );
      })}
    </div>
  );
}

function WeeklyCheckInModal({ onDone }) {
  const mhi18n = window.TradeJournalMentalHealthI18n;
  const mh = window.TradeJournalMentalHealthStore;
  const collector = window.TradeJournalMentalHealthCollector;
  const t = mhi18n.t;
  const rtl = mhi18n.direction() === 'rtl';

  const [disciplineRating, setDisciplineRating] = React.useState(5);
  const [biggestWin, setBiggestWin] = React.useState('');
  const [biggestLesson, setBiggestLesson] = React.useState('');
  const [moodNextWeek, setMoodNextWeek] = React.useState(null);
  const [saving, setSaving] = React.useState(false);

  function close() { if (onDone) onDone(); }

  React.useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    const registry = window.TradeJournalAIProcessRegistry;
    if (!registry) return undefined;
    let mounted = true;
    registry.register('mh-weekly-checkin', {
      allowlist: ['disciplineRating', 'biggestWin', 'biggestLesson'],
      isOpen: () => mounted,
      activeStep: () => 'checkin',
      applyValue: (path, value) => {
        if (path === 'disciplineRating') setDisciplineRating(Number(value));
        else if (path === 'biggestWin') setBiggestWin(String(value || ''));
        else if (path === 'biggestLesson') setBiggestLesson(String(value || ''));
      }
    });
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function save() {
    if (saving) return;
    setSaving(true);
    mh.addWeeklyCheckIn(mh.load(), {
      disciplineRating, biggestWin: biggestWin || null, biggestLesson: biggestLesson || null, moodNextWeek
    });
    if (collector) collector.captureWeeklySnapshot(new Date());
    if (window.TradeJournalTradeUI) window.TradeJournalTradeUI.toast(t('mhWeeklyCheckInSaved'), 'success');
    close();
  }

  return (
    <div
      dir={rtl ? 'rtl' : 'ltr'}
      style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, boxSizing: 'border-box', background: 'var(--scrim)', backdropFilter: 'blur(6px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <Panel
        variant="prestige" radius={12} ornament ornamentSize={16} ornamentInset={6}
        role="dialog" aria-modal="true" aria-label={t('mhWeeklyCheckInTitle')}
        style={{ width: 'min(600px,100%)', maxHeight: 'calc(100vh - 48px)', background: 'var(--ink-900)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px' }}>
          <span style={{ width: 44, height: 44, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 8, border: '1px solid var(--char-accent)', background: 'var(--char-active-surface)', color: 'var(--char-accent)' }}><Icon name="calendar" size={22} /></span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <span style={{ font: 'var(--type-section-label)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('mhTabContinuous')}</span>
            <h2 style={{ margin: 0, font: 'var(--type-display-lg)', letterSpacing: 'var(--tracking-display)', color: 'var(--text-primary)' }}>{t('mhWeeklyCheckInTitle')}</h2>
          </div>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={close} aria-label={t('mhClose')} style={{ width: 44, height: 44, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border-gold)', background: 'rgba(11,20,21,.72)', color: 'var(--text-muted)' }}><Icon name="close" size={18} /></button>
        </div>

        {/* Body */}
        <div className="navrya-scroll" style={{ minHeight: 260, maxHeight: '60vh', boxSizing: 'border-box', padding: '4px 20px 20px', overflowY: 'auto', background: 'var(--ink-950)', display: 'flex', flexDirection: 'column', gap: 22 }}>
          <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{t('mhWeeklyCheckInHint')}</span>
          <RatingRow label={t('mhDisciplineRating')} value={disciplineRating} onChange={setDisciplineRating} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <SectionLabel>{t('mhBiggestWinLabel')}</SectionLabel>
            <input
              dir="auto" value={biggestWin} onChange={(e) => setBiggestWin(e.target.value)} placeholder={t('mhBiggestWinPlaceholder')}
              style={{ height: 44, boxSizing: 'border-box', padding: '0 14px', borderRadius: 8, border: '1px solid var(--divider-gold)', background: 'rgba(3,8,7,.55)', color: 'var(--text-primary)', font: '500 13.5px/19px var(--font-ui)', outline: 'none' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <SectionLabel>{t('mhBiggestLessonLabel')}</SectionLabel>
            <input
              dir="auto" value={biggestLesson} onChange={(e) => setBiggestLesson(e.target.value)} placeholder={t('mhBiggestLessonPlaceholder')}
              style={{ height: 44, boxSizing: 'border-box', padding: '0 14px', borderRadius: 8, border: '1px solid var(--divider-gold)', background: 'rgba(3,8,7,.55)', color: 'var(--text-primary)', font: '500 13.5px/19px var(--font-ui)', outline: 'none' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <SectionLabel>{t('mhMoodNextWeekLabel')}</SectionLabel>
            <MoodGrid value={moodNextWeek} onChange={setMoodNextWeek} t={t} />
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderTop: '1px solid var(--border-hairline)' }}>
          <Button variant="ghost" icon="close" onClick={close}>{t('mhSkip')}</Button>
          <span style={{ flex: 1 }} />
          <Button variant="primary" icon="check" onClick={save} disabled={saving}>{t('mhSave')}</Button>
        </div>
      </Panel>
    </div>
  );
}

export function openWeeklyCheckIn(onDone) {
  const mhi18n = window.TradeJournalMentalHealthI18n;
  const mh = window.TradeJournalMentalHealthStore;
  if (!mhi18n || !mh) { if (onDone) onDone(); return; }
  const container = document.createElement('div');
  container.dataset.character = currentNavryaCharacter();
  document.body.append(container);
  const root = createRoot(container);
  function close() { root.unmount(); container.remove(); if (onDone) onDone(); }
  root.render(<WeeklyCheckInModal onDone={close} />);
}
