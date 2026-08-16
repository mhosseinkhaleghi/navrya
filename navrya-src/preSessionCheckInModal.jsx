import React from 'react';
import { createRoot } from 'react-dom/client';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { currentNavryaCharacter } from './currentCharacter.js';

// Redesign of mental-health-continuous.js's openPreSessionCheckIn() - the short, optional
// "before you start" popup that used to fire once per session, before the first entry's
// image-upload UI, by wrapping the legacy session-entry-flow.js's TradeJournalEntryFlow.
// openEntry(). That wrap never fires anymore: liveSessionView.jsx (the NAVRYA session screen)
// builds its own entries directly against TradeJournalWorkspace and never calls
// TradeJournalEntryFlow.openEntry, so the popup silently stopped appearing once this app's
// session UI moved to React - this is that popup's real replacement, called directly from
// liveSessionView.jsx's own add-entry actions (see withPreSessionCheckIn() there), the same
// "call the hook directly, don't rely on a monkey-patched legacy function" pattern
// closePositionModal.jsx already established for onTradeClosed()/openPostTradeReflection().
// Same real store write (TradeJournalMentalHealthStore.addPreSessionCheckIn()), same
// sleepQuality/currentStressLevel/somethingToProveToday/significantPersonalEvent fields, same
// 'mh-pre-session-checkin' AI-process-registry allowlist so the chat dock can still fill it in.
// Only the dialog itself moves from hand-built DOM (tj-small-modal) to React + the NAVRYA
// design system, reusing the same rating-row / pill / panel language postTradeReflectionModal.jsx
// already established for this exact feature area.

function SectionLabel({ children }) {
  return <span style={{ font: 'var(--type-section-label)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--gold-warm)' }}>{children}</span>;
}

// Same 1-10 numbered-button row postTradeReflectionModal.jsx's RatingRow uses - the control this
// app already defines for a "degree" scale, replacing the legacy's bare <input type=range>.
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

// Two-way yes/no pill, same selected/idle language as postTradeReflectionModal.jsx's ChoicePills
// (character-accent driven, not the intake wizard's gold/antique styling, to match this feature
// area's own established redesign).
function YesNoRow({ label, value, onChange, t }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span style={{ font: 'var(--type-body)', color: 'var(--text-primary)' }}>{label}</span>
      <div style={{ display: 'flex', gap: 8 }}>
        {[[true, t('mhYes')], [false, t('mhNo')]].map(([v, text]) => {
          const sel = value === v;
          return (
            <button
              key={String(v)} type="button" onClick={() => onChange(v)}
              style={{ flex: 1, height: 44, borderRadius: 8, cursor: 'pointer', border: '1px solid ' + (sel ? 'var(--char-accent)' : 'var(--divider-gold)'), background: sel ? 'var(--char-active-surface)' : 'rgba(11,20,21,.5)', color: sel ? 'var(--char-accent)' : 'var(--text-muted)', font: '500 13.5px/19px var(--font-ui)', boxShadow: sel ? '0 0 16px var(--char-glow)' : 'none' }}
            >{text}</button>
          );
        })}
      </div>
    </div>
  );
}

function PreSessionCheckInModal({ session, onDone }) {
  const mhi18n = window.TradeJournalMentalHealthI18n;
  const mh = window.TradeJournalMentalHealthStore;
  const t = mhi18n.t;
  const rtl = mhi18n.direction() === 'rtl';

  const [sleepQuality, setSleepQuality] = React.useState(5);
  const [currentStressLevel, setCurrentStressLevel] = React.useState(5);
  const [somethingToProveToday, setSomethingToProveToday] = React.useState(false);
  const [significantPersonalEvent, setSignificantPersonalEvent] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  function close() { if (onDone) onDone(); }

  React.useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Same 'mh-pre-session-checkin' process id / allowlist the legacy wizard registered, so the
  // global assistant dock's suggestion pipeline keeps working unchanged against this dialog.
  React.useEffect(() => {
    const registry = window.TradeJournalAIProcessRegistry;
    if (!registry) return undefined;
    let mounted = true;
    registry.register('mh-pre-session-checkin', {
      allowlist: ['sleepQuality', 'currentStressLevel', 'significantPersonalEvent'],
      isOpen: () => mounted,
      activeStep: () => 'checkin',
      applyValue: (path, value) => {
        if (path === 'sleepQuality') setSleepQuality(Number(value));
        else if (path === 'currentStressLevel') setCurrentStressLevel(Number(value));
        else if (path === 'significantPersonalEvent') setSignificantPersonalEvent(String(value || ''));
      }
    });
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function save() {
    if (saving) return;
    setSaving(true);
    mh.addPreSessionCheckIn(mh.load(), session.id, {
      sleepQuality, currentStressLevel, somethingToProveToday, significantPersonalEvent: significantPersonalEvent || null
    });
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
        role="dialog" aria-modal="true" aria-label={t('mhPreSessionCheckInTitle')}
        style={{ width: 'min(520px,100%)', maxHeight: 'calc(100vh - 48px)', background: 'var(--ink-900)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px' }}>
          <span style={{ width: 44, height: 44, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 8, border: '1px solid var(--char-accent)', background: 'var(--char-active-surface)', color: 'var(--char-accent)' }}><Icon name="psychology" size={22} /></span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <span style={{ font: 'var(--type-section-label)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t('mhTabContinuous')}</span>
            <h2 style={{ margin: 0, font: 'var(--type-display-lg)', letterSpacing: 'var(--tracking-display)', color: 'var(--text-primary)' }}>{t('mhPreSessionCheckInTitle')}</h2>
          </div>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={close} aria-label={t('mhClose')} style={{ width: 44, height: 44, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border-gold)', background: 'rgba(11,20,21,.72)', color: 'var(--text-muted)' }}><Icon name="close" size={18} /></button>
        </div>

        {/* Body */}
        <div className="navrya-scroll" style={{ minHeight: 200, maxHeight: '60vh', boxSizing: 'border-box', padding: '4px 20px 20px', overflowY: 'auto', background: 'var(--ink-950)', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{t('mhPreSessionCheckInHint')}</span>
          <RatingRow label={t('mhSleepQuality')} value={sleepQuality} onChange={setSleepQuality} />
          <RatingRow label={t('mhCurrentStress')} value={currentStressLevel} onChange={setCurrentStressLevel} />
          <YesNoRow label={t('mhSomethingToProve')} value={somethingToProveToday} onChange={setSomethingToProveToday} t={t} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <SectionLabel>{t('mhSignificantEventPlaceholder')}</SectionLabel>
            <input
              dir="auto" value={significantPersonalEvent} onChange={(e) => setSignificantPersonalEvent(e.target.value)} placeholder={t('mhSignificantEventPlaceholder')}
              style={{ height: 44, boxSizing: 'border-box', padding: '0 14px', borderRadius: 8, border: '1px solid var(--divider-gold)', background: 'rgba(3,8,7,.55)', color: 'var(--text-primary)', font: '500 13.5px/19px var(--font-ui)', outline: 'none' }}
            />
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

export function openPreSessionCheckIn(session, onDone) {
  const mhi18n = window.TradeJournalMentalHealthI18n;
  const mh = window.TradeJournalMentalHealthStore;
  if (!mhi18n || !mh || !session) { if (onDone) onDone(); return; }
  const container = document.createElement('div');
  container.dataset.character = currentNavryaCharacter();
  document.body.append(container);
  const root = createRoot(container);
  function close() { root.unmount(); container.remove(); if (onDone) onDone(); }
  root.render(<PreSessionCheckInModal session={session} onDone={close} />);
}
