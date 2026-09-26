import React from 'react';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Chip } from '../public/pages/shared/navrya/components/forms/Chip.jsx';
import { TextField } from '../public/pages/shared/navrya/components/forms/TextField.jsx';
import { Notice } from '../public/pages/shared/navrya/components/feedback/Notice.jsx';
import { AiMagicFill } from '../public/pages/shared/navrya/components/feedback/AiMagicFill.jsx';
import { useAiFieldFill } from '../public/pages/shared/navrya/hooks/useAiFieldFill.js';
import { CalmRoom, CalmRoomPanel } from './calmRoom.jsx';

// The MOOD tab (Mood.dc.html on the approved canvas). The calm room it can open lives in
// calmRoom.jsx. Nothing here needs a new store: a day's mood IS a PreSessionCheckIn, which
// mental-health-store.js already persists - this screen is the first surface that both writes one
// outside the trade wizard and reads the day's own back.
//
// The six moods are a label ON a stress level, not a replacement for it: `currentStressLevel`
// stays the number every existing reader (emotionalWeatherDaily, the breathing guard, the
// collector) already understands, and `mood` only carries the shade the number cannot - "flat"
// and "angry" are different days at the same 5.

export const MOODS = [
  { id: 'calm', stress: 3, tone: 'var(--success)', rgb: '46,204,113' },
  { id: 'focused', stress: 4, tone: 'var(--char-accent)', rgb: '102,201,78' },
  { id: 'hopeful', stress: 4, tone: 'var(--gold-warm)', rgb: '214,175,107' },
  { id: 'tense', stress: 7, tone: 'var(--warning)', rgb: '255,176,32' },
  { id: 'flat', stress: 5, tone: 'var(--info)', rgb: '77,163,255' },
  { id: 'angry', stress: 9, tone: 'var(--danger)', rgb: '255,56,48' }
];
export const BY_ID = MOODS.reduce((acc, m) => { acc[m.id] = m; return acc; }, {});

function SectionLabel({ children, style }) {
  return <span style={{ font: 'var(--type-section-label)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-muted)', textTransform: 'uppercase', ...style }}>{children}</span>;
}
function Caption({ children, style, className }) {
  return <span className={className} style={{ font: 'var(--type-caption)', color: 'var(--text-dim)', letterSpacing: '.04em', ...style }}>{children}</span>;
}

// Reduced-motion is honoured by the tokens themselves (motion.css zeroes the duration vars under
// prefers-reduced-motion), but a looping keyframe has no duration var to zero - so the media
// query is repeated here for the animations this screen adds.
const KEYFRAMES = `
@keyframes navrya-mood-aura { 0%,100% { opacity:.4; transform:scale(1) } 50% { opacity:.92; transform:scale(1.07) } }
@media (prefers-reduced-motion: reduce) {
  .navrya-mood-aura { animation: none !important }
}`;

function Keyframes() {
  return <style>{KEYFRAMES}</style>;
}

// ============================================================================
// MOOD TAB
// ============================================================================
export function MoodTab({ i18n, psych, mhStore, profile, trades, onLogged }) {
  const [picked, setPicked] = React.useState(null);
  const [sleep, setSleep] = React.useState(3);
  const [prove, setProve] = React.useState(false);
  const [event, setEvent] = React.useState('');
  const [calm, setCalm] = React.useState(null);
  const pickedRef = React.useRef(picked);
  const logRef = React.useRef(null);
  pickedRef.current = picked;

  // Voice/Chat form-interview workflow upgrade: the same shared magic-fill animation every other
  // Journey H1 surface uses, now that this tab's own fields carry canonical interview metadata.
  const moodFilled = useAiFieldFill('psychology-mood-log', 'mood');
  const sleepFilled = useAiFieldFill('psychology-mood-log', 'sleepQuality');
  const proveFilled = useAiFieldFill('psychology-mood-log', 'somethingToProveToday');
  const eventFilled = useAiFieldFill('psychology-mood-log', 'significantPersonalEvent');

  const checkIns = (profile.continuousTracking && profile.continuousTracking.preSessionCheckIns) || [];
  const todayKey = new Date().toDateString();
  const todays = checkIns.filter((c) => new Date(c.createdAt).toDateString() === todayKey);
  const latest = todays[todays.length - 1] || null;

  // The scene follows the LATEST logged mood, falling back to the one being picked, so the page
  // reacts before the write lands and still reads right on a fresh open.
  const activeId = picked || (latest && latest.mood) || null;
  const active = activeId ? BY_ID[activeId] : null;
  const stress = active ? active.stress : (latest ? latest.currentStressLevel : null);
  const rgb = active ? active.rgb : '172,169,148';

  // A specific, computed reason beats a generic one: when the tilt reading itself justifies it
  // (two or more losses close together), the calm room's header chip names the real streak and
  // gap rather than only naming the mood that triggered it.
  function calmReasonFor(moodId) {
    const t = psych.tiltReading(trades || []);
    if (t.lossStreak >= 2 && t.minutesSinceLoss != null) {
      return i18n.t('moodCalmReason_streak', { count: i18n.number(t.lossStreak), minutes: i18n.number(t.minutesSinceLoss) });
    }
    return i18n.t('moodCalmReason_' + moodId);
  }

  function log(moodId) {
    const m = BY_ID[moodId];
    mhStore.addPreSessionCheckIn(mhStore.load(), null, {
      mood: moodId,
      currentStressLevel: m.stress,
      sleepQuality: sleep,
      somethingToProveToday: prove,
      significantPersonalEvent: event.trim() || null
    });
    setPicked(moodId);
    setEvent('');
    if (onLogged) onLogged();
    // The two moods that mean "do not trade right now" open the room themselves. Waiting for the
    // trader to go looking for help in that state is exactly when they will not.
    if (moodId === 'angry' || moodId === 'tense') setCalm(calmReasonFor(moodId));
  }
  logRef.current = log;

  // The Mood card is a real Pre-Session Check-In authoring surface. Voice writes the same local
  // React draft controls first; its eventual submit delegates to log(), the exact handler a
  // trader invokes by pressing one of the visible mood cards.
  React.useEffect(() => {
    const registry = window.TradeJournalAIProcessRegistry;
    if (!registry) return undefined;
    let mounted = true;
    registry.register('psychology-mood-log', {
      actionId: 'psychology.mood.log',
      allowlist: ['mood', 'sleepQuality', 'somethingToProveToday', 'significantPersonalEvent'],
      isOpen: () => mounted,
      activeStep: () => 'mood',
      // Voice/Chat form-interview workflow upgrade: the form's own real display order - the mood
      // picker card first, then the optional context card (sleep -> something to prove -> event),
      // exactly as MoodTab itself renders them below. Options are the same real MOODS table the
      // picker buttons render from - never a second, hand-typed mood list.
      interview: {
        fields: [
          { path: 'mood', order: 1, label: i18n.t('moodPickTitle'), type: 'choice', options: MOODS.map((m) => ({ value: m.id, label: i18n.t('moodName_' + m.id) })), role: 'editable' },
          { path: 'sleepQuality', order: 2, label: i18n.t('moodSleep'), type: 'number', role: 'editable' },
          { path: 'somethingToProveToday', order: 3, label: i18n.t('moodSomethingToProve'), type: 'boolean', role: 'editable' },
          { path: 'significantPersonalEvent', order: 4, label: i18n.t('moodEvent'), type: 'text', role: 'editable' }
        ]
      },
      validateValue: (path, value) => {
        if (path === 'mood') return !!BY_ID[String(value || '').toLowerCase()];
        if (path === 'sleepQuality') return Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 5;
        if (path === 'somethingToProveToday') return typeof value === 'boolean';
        return true;
      },
      applyValue: (path, value) => {
        if (path === 'mood') setPicked(String(value).toLowerCase());
        else if (path === 'sleepQuality') setSleep(Number(value));
        else if (path === 'somethingToProveToday') setProve(value);
        else if (path === 'significantPersonalEvent') setEvent(String(value || ''));
      },
      submit: () => {
        const moodId = pickedRef.current;
        if (!BY_ID[moodId]) return { submitted: false, reason: 'invalid', field: 'mood' };
        return logRef.current(moodId);
      }
    });
    return () => { mounted = false; };
  }, []);

  const rhythm = todays
    .map((c) => ({ at: new Date(c.createdAt), value: Number(c.currentStressLevel) }))
    .filter((r) => Number.isFinite(r.value));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Keyframes />
      {calm && <CalmRoom i18n={i18n} psych={psych} profile={profile} trades={trades} reason={calm} onClose={() => setCalm(null)} />}

      {/* the aura stage */}
      <Panel
        variant={active ? 'active' : 'base'} ornament padding="20px 22px 22px"
        style={{ borderColor: active ? 'rgba(' + rgb + ',.5)' : undefined }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', width: 190, height: 190, flex: 'none' }}>
            <span
              className="navrya-mood-aura" aria-hidden="true"
              style={{ position: 'absolute', inset: 0, borderRadius: 999, display: 'block', background: 'radial-gradient(circle,rgba(' + rgb + ',.32),transparent 66%)', animation: 'navrya-mood-aura 4.6s ease-in-out infinite' }}
            ></span>
            <span style={{
              position: 'absolute', inset: 34, borderRadius: 999, border: '1px solid rgba(' + rgb + ',.5)',
              background: 'rgba(3,8,7,.72)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4
            }}>
              <span className="navrya-tabular" style={{ font: '600 44px/1 var(--font-display)', color: active ? active.tone : 'var(--text-disabled)' }}>
                {stress == null ? '—' : i18n.number(stress)}
              </span>
              <SectionLabel>{i18n.t('moodStressOf10')}</SectionLabel>
            </span>
          </div>

          <div style={{ flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <span style={{ font: 'var(--type-display-md)', color: 'var(--text-primary)', letterSpacing: 'var(--tracking-display)', textWrap: 'pretty' }}>
              {activeId ? i18n.t('moodHeadline_' + activeId) : i18n.t('moodNoneTitle')}
            </span>
            <span style={{ font: 'var(--type-body)', color: 'var(--text-muted)', textWrap: 'pretty', maxWidth: '62ch' }}>
              {activeId ? i18n.t('moodBody_' + activeId) : i18n.t('moodNoneBody')}
            </span>
            {activeId && (
              <Notice tone={activeId === 'angry' || activeId === 'tense' ? 'warning' : 'accent'} icon="honour">
                {i18n.t('moodHelp_' + activeId)}
              </Notice>
            )}
          </div>
        </div>
      </Panel>

      {/* picker + the optional fuller form */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <Panel variant="base" ornament padding="18px 20px 20px" style={{ flex: '1 1 460px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <SectionLabel>{i18n.t('moodPickTitle')}</SectionLabel>
              <Caption style={{ marginInlineStart: 'auto' }}>{i18n.t('moodPickHint')}</Caption>
            </div>
            <AiMagicFill active={moodFilled}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 11 }}>
              {MOODS.map((m) => {
                const on = activeId === m.id;
                return (
                  <button
                    key={m.id} type="button" onClick={() => log(m.id)}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9, padding: '16px 8px 14px',
                      borderRadius: 8, cursor: 'pointer', boxSizing: 'border-box', font: 'inherit',
                      border: '1px solid ' + (on ? 'rgba(' + m.rgb + ',.55)' : 'var(--border-hairline)'),
                      background: on ? 'rgba(3,8,7,.7)' : 'rgba(11,16,22,.4)',
                      transition: 'transform var(--dur-hover) var(--ease-out), border-color var(--dur-hover) var(--ease-out)'
                    }}
                  >
                    <span style={{ position: 'relative', width: 42, height: 42, display: 'block' }}>
                      {on && <span aria-hidden="true" style={{ position: 'absolute', inset: 0, borderRadius: 999, background: 'radial-gradient(circle,rgba(' + m.rgb + ',.32),transparent 66%)', display: 'block' }}></span>}
                      <span style={{ position: 'absolute', inset: 9, borderRadius: 999, background: on ? m.tone : 'rgba(244,234,215,.2)', display: 'block' }}></span>
                    </span>
                    <span style={{ font: 'var(--type-body)', fontSize: 12, color: on ? 'var(--text-primary)' : 'var(--text-dim)' }}>{i18n.t('moodName_' + m.id)}</span>
                  </button>
                );
              })}
            </div>
            </AiMagicFill>
            <Caption style={{ lineHeight: '17px' }}>{i18n.t('moodWritesNote')}</Caption>
          </div>
        </Panel>

        <Panel variant="base" ornament padding="18px 20px 20px" style={{ flex: '1 1 300px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <SectionLabel>{i18n.t('moodContextTitle')}</SectionLabel>
              <Caption style={{ marginInlineStart: 'auto' }}>{i18n.t('moodOptional')}</Caption>
            </div>

            <AiMagicFill active={sleepFilled}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <span style={{ font: 'var(--type-body)', fontSize: 12, color: 'var(--text-primary)' }}>{i18n.t('moodSleep')}</span>
              <div style={{ display: 'flex', gap: 7 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n} type="button" onClick={() => setSleep(n)}
                    style={{
                      flex: 1, height: 44, borderRadius: 6, cursor: 'pointer', display: 'grid', placeItems: 'center', font: 'inherit',
                      border: '1px solid ' + (sleep === n ? 'color-mix(in srgb, var(--char-accent) 60%, transparent)' : 'var(--border-hairline)'),
                      background: sleep === n ? 'color-mix(in srgb, var(--char-active-surface) 70%, transparent)' : 'rgba(11,16,22,.4)',
                      color: sleep === n ? 'var(--char-accent)' : 'var(--text-dim)'
                    }}
                  ><span className="navrya-tabular">{i18n.number(n)}</span></button>
                ))}
              </div>
            </div>
            </AiMagicFill>

            <AiMagicFill active={proveFilled}>
            <button
              type="button" onClick={() => setProve((v) => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '13px 15px', borderRadius: 8, cursor: 'pointer',
                textAlign: 'start', font: 'inherit', width: '100%', boxSizing: 'border-box',
                border: '1px solid ' + (prove ? 'rgba(255,56,48,.35)' : 'var(--border-hairline)'),
                background: prove ? 'rgba(255,56,48,.05)' : 'rgba(11,16,22,.4)'
              }}
            >
              <span style={{
                width: 20, height: 20, flex: 'none', borderRadius: 6, display: 'grid', placeItems: 'center',
                border: '1px solid ' + (prove ? 'var(--danger)' : 'rgba(244,234,215,.18)'),
                background: prove ? 'var(--danger)' : 'transparent', color: 'var(--ink-950)'
              }}>{prove && <Icon name="check" size={13} />}</span>
              <span style={{ flex: 1, font: 'var(--type-body)', fontSize: 12, color: 'var(--text-primary)' }}>{i18n.t('moodSomethingToProve')}</span>
            </button>
            </AiMagicFill>

            <AiMagicFill active={eventFilled} value={event}>
            <TextField label={i18n.t('moodEvent')} value={event} onChange={setEvent} placeholder={i18n.t('moodEventPlaceholder')} />
            </AiMagicFill>
            <Caption style={{ lineHeight: '17px' }}>{i18n.t('moodContextNote')}</Caption>
          </div>
        </Panel>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        {/* today's rhythm, straight from today's own check-ins */}
        <Panel variant="base" ornament padding="18px 20px 20px" style={{ flex: '1 1 460px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <SectionLabel>{i18n.t('moodRhythmTitle')}</SectionLabel>
              <Chip tone="neutral">{i18n.t('moodLogsToday', { count: i18n.number(todays.length) })}</Chip>
              <Caption style={{ marginInlineStart: 'auto' }}>{i18n.t('moodRhythmHint')}</Caption>
            </div>
            {rhythm.length ? (
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 9, height: 150 }}>
                {rhythm.map((r, i) => {
                  const tone = r.value >= 8 ? 'var(--danger)' : r.value >= 6 ? 'var(--warning)' : 'var(--char-accent)';
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, justifyContent: 'flex-end', height: '100%' }}>
                      <Caption className="navrya-tabular">{i18n.number(r.value)}</Caption>
                      <span style={{ width: '100%', borderRadius: '4px 4px 2px 2px', display: 'block', height: Math.max(6, Math.round(r.value / 10 * 112)), background: 'linear-gradient(180deg,' + tone + ',color-mix(in srgb,' + tone + ' 30%, transparent))' }}></span>
                      <Caption className="navrya-tabular">{r.at.toLocaleTimeString(i18n.locale(), { hour: '2-digit', minute: '2-digit' })}</Caption>
                    </div>
                  );
                })}
              </div>
            ) : <Caption>{i18n.t('moodRhythmEmpty')}</Caption>}
          </div>
        </Panel>

        {/* the room, always reachable - not only when a bad mood opened it */}
        <Panel variant="base" ornament padding="18px 20px 20px" style={{ flex: '1 1 300px' }}>
          <CalmRoomPanel
            i18n={i18n} titled notch="color-mix(in srgb, var(--char-atmosphere) 42%, var(--ink-950))"
            onOpen={() => setCalm(i18n.t('moodCalmReason_manual'))}
          />
        </Panel>
      </div>
    </div>
  );
}
