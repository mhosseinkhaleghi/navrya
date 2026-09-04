import React from 'react';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { Chip } from '../public/pages/shared/navrya/components/forms/Chip.jsx';
import { TextField } from '../public/pages/shared/navrya/components/forms/TextField.jsx';
import { Notice } from '../public/pages/shared/navrya/components/feedback/Notice.jsx';

// The MOOD tab (Mood.dc.html on the approved canvas) and the calm room it can open
// (CalmRoom.dc.html). Nothing here needs a new store: a day's mood IS a PreSessionCheckIn, which
// mental-health-store.js already persists - this screen is the first surface that both writes one
// outside the trade wizard and reads the day's own back.
//
// The six moods are a label ON a stress level, not a replacement for it: `currentStressLevel`
// stays the number every existing reader (emotionalWeatherDaily, the breathing guard, the
// collector) already understands, and `mood` only carries the shade the number cannot - "flat"
// and "angry" are different days at the same 5.

const MOODS = [
  { id: 'calm', stress: 3, tone: 'var(--success)', rgb: '46,204,113' },
  { id: 'focused', stress: 4, tone: 'var(--char-accent)', rgb: '102,201,78' },
  { id: 'hopeful', stress: 4, tone: 'var(--gold-warm)', rgb: '214,175,107' },
  { id: 'tense', stress: 7, tone: 'var(--warning)', rgb: '255,176,32' },
  { id: 'flat', stress: 5, tone: 'var(--info)', rgb: '77,163,255' },
  { id: 'angry', stress: 9, tone: 'var(--danger)', rgb: '255,56,48' }
];
const BY_ID = MOODS.reduce((acc, m) => { acc[m.id] = m; return acc; }, {});

function SectionLabel({ children, style }) {
  return <span style={{ font: 'var(--type-section-label)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-muted)', textTransform: 'uppercase', ...style }}>{children}</span>;
}
function Caption({ children, style, className }) {
  return <span className={className} style={{ font: 'var(--type-caption)', color: 'var(--text-dim)', letterSpacing: '.04em', ...style }}>{children}</span>;
}

// Reduced-motion is honoured by the tokens themselves (motion.css zeroes the duration vars under
// prefers-reduced-motion), but a looping keyframe has no duration var to zero - so the media
// query is repeated here for the two animations this screen adds.
const KEYFRAMES = `
@keyframes navrya-mood-aura { 0%,100% { opacity:.4; transform:scale(1) } 50% { opacity:.92; transform:scale(1.07) } }
@keyframes navrya-mood-breathe { 0% { transform:scale(.62); opacity:.5 } 33% { transform:scale(1); opacity:1 } 50% { transform:scale(1); opacity:1 } 100% { transform:scale(.62); opacity:.5 } }
@media (prefers-reduced-motion: reduce) {
  .navrya-mood-aura, .navrya-mood-breathe { animation: none !important }
}`;

function Keyframes() {
  return <style>{KEYFRAMES}</style>;
}

// ============================================================================
// CALM ROOM - a scrim over the app, not a route. Opened from a tense/angry mood
// or from the protective guards.
// ============================================================================
export function CalmRoom({ i18n, reason, onClose }) {
  const [seconds, setSeconds] = React.useState(4 * 60);
  const [why, setWhy] = React.useState('');

  React.useEffect(() => {
    const id = setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, []);

  // Both gates must clear before the room lets go: the timer, and a written reason. The reason is
  // the point - it is what gets read back in the weekly review, not a formality.
  const timerDone = seconds === 0;
  const reasonGiven = why.trim().length >= 10;
  const canLeave = timerDone && reasonGiven;
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  return (
    <div
      role="dialog" aria-modal="true" aria-label={i18n.t('moodCalmTitle')}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'var(--scrim)', display: 'grid', placeItems: 'center', padding: 24, boxSizing: 'border-box', overflow: 'auto' }}
    >
      <Keyframes />
      <Panel variant="prestige" ornament texture padding={0} style={{ width: 'min(940px, 100%)', background: 'linear-gradient(180deg,rgba(46,204,113,.06),color-mix(in srgb, var(--char-atmosphere) 42%, var(--ink-950)))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 22px', borderBottom: '1px solid var(--divider-gold)', flexWrap: 'wrap' }}>
          <span style={{ width: 38, height: 38, flex: 'none', borderRadius: 999, border: '1px solid color-mix(in srgb, var(--char-accent) 50%, transparent)', background: 'var(--char-active-surface)', display: 'grid', placeItems: 'center', color: 'var(--char-accent)' }}>
            <Icon name="honour" size={19} />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
            <span style={{ font: 'var(--type-display-md)', color: 'var(--text-primary)', letterSpacing: 'var(--tracking-display)' }}>{i18n.t('moodCalmTitle')}</span>
            <Caption>{i18n.t('moodCalmSubtitle')}</Caption>
          </div>
          {reason && <Chip tone="danger" dot>{reason}</Chip>}
        </div>

        <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 380px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, padding: '26px 24px', borderInlineEnd: '1px solid var(--border-hairline)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
              <SectionLabel>{i18n.t('moodBreathTitle')}</SectionLabel>
              <Chip tone="accent" style={{ marginInlineStart: 'auto' }}>{i18n.t('moodBreathPattern')}</Chip>
            </div>
            <div style={{ position: 'relative', width: 260, height: 260 }}>
              <span className="navrya-mood-breathe" aria-hidden="true" style={{ position: 'absolute', inset: 0, borderRadius: 999, display: 'block', background: 'radial-gradient(circle,rgba(53,208,127,.3),transparent 66%)', animation: 'navrya-mood-breathe 12s cubic-bezier(.4,0,.2,1) infinite' }}></span>
              <span className="navrya-mood-breathe" aria-hidden="true" style={{ position: 'absolute', inset: 32, borderRadius: 999, display: 'block', border: '2px solid var(--char-emerald, #35D07F)', background: 'radial-gradient(circle,rgba(53,208,127,.14),rgba(3,8,7,.72))', animation: 'navrya-mood-breathe 12s cubic-bezier(.4,0,.2,1) infinite' }}></span>
              <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
                <span className="navrya-tabular" style={{ font: '600 34px/1 var(--font-display)', color: 'var(--char-light-glow, #8AF7B4)' }}>{mm}:{ss}</span>
              </span>
            </div>
            <Caption style={{ textAlign: 'center', lineHeight: '18px' }}>{i18n.t('moodBreathHint')}</Caption>
          </div>

          <div style={{ flex: '1 1 400px', display: 'flex', flexDirection: 'column', gap: 16, padding: '26px 24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <SectionLabel>{i18n.t('moodExitGate')}</SectionLabel>
              <Caption style={{ lineHeight: '18px' }}>{i18n.t('moodExitGateBody')}</Caption>
              <TextField
                label={i18n.t('moodExitReason')} value={why} onChange={setWhy}
                placeholder={i18n.t('moodExitReasonPlaceholder')}
                hint={reasonGiven ? undefined : i18n.t('moodExitReasonHint')}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {[[timerDone, i18n.t('moodGateTimer', { value: mm + ':' + ss })], [reasonGiven, i18n.t('moodGateReason')]].map(([ok, label]) => (
                <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{
                    width: 20, height: 20, flex: 'none', borderRadius: 6, display: 'grid', placeItems: 'center',
                    border: '1px solid ' + (ok ? 'color-mix(in srgb, var(--char-accent) 60%, transparent)' : 'rgba(244,234,215,.18)'),
                    background: ok ? 'var(--char-accent)' : 'transparent', color: 'var(--ink-950)'
                  }}>{ok && <Icon name="check" size={13} />}</span>
                  <Caption style={{ flex: 1 }}>{label}</Caption>
                </span>
              ))}
            </div>

            <div style={{ height: 1, background: 'var(--border-hairline)' }}></div>
            <Button variant="primary" fullWidth disabled={!canLeave} onClick={onClose}>{i18n.t('moodCalmLeave')}</Button>
            <Caption style={{ textAlign: 'center' }}>{i18n.t('moodCalmLeaveHint')}</Caption>
          </div>
        </div>
      </Panel>
    </div>
  );
}

// ============================================================================
// MOOD TAB
// ============================================================================
export function MoodTab({ i18n, mhStore, profile, trades, onLogged }) {
  const [picked, setPicked] = React.useState(null);
  const [sleep, setSleep] = React.useState(3);
  const [prove, setProve] = React.useState(false);
  const [event, setEvent] = React.useState('');
  const [calm, setCalm] = React.useState(null);

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
    if (moodId === 'angry' || moodId === 'tense') setCalm(i18n.t('moodCalmReason_' + moodId));
  }

  const rhythm = todays
    .map((c) => ({ at: new Date(c.createdAt), value: Number(c.currentStressLevel) }))
    .filter((r) => Number.isFinite(r.value));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Keyframes />
      {calm && <CalmRoom i18n={i18n} reason={calm} onClose={() => setCalm(null)} />}

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
            <Caption style={{ lineHeight: '17px' }}>{i18n.t('moodWritesNote')}</Caption>
          </div>
        </Panel>

        <Panel variant="base" ornament padding="18px 20px 20px" style={{ flex: '1 1 300px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <SectionLabel>{i18n.t('moodContextTitle')}</SectionLabel>
              <Caption style={{ marginInlineStart: 'auto' }}>{i18n.t('moodOptional')}</Caption>
            </div>

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

            <TextField label={i18n.t('moodEvent')} value={event} onChange={setEvent} placeholder={i18n.t('moodEventPlaceholder')} />
            <Caption style={{ lineHeight: '17px' }}>{i18n.t('moodContextNote')}</Caption>
          </div>
        </Panel>
      </div>

      {/* today's rhythm, straight from today's own check-ins */}
      <Panel variant="base" ornament padding="18px 20px 20px">
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
      <Panel variant="base" ornament padding="18px 20px 20px">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <span style={{ width: 40, height: 40, flex: 'none', borderRadius: 999, border: '1px solid color-mix(in srgb, var(--char-accent) 45%, transparent)', background: 'var(--char-active-surface)', display: 'grid', placeItems: 'center', color: 'var(--char-accent)' }}>
            <Icon name="honour" size={20} />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 300px', minWidth: 0 }}>
            <span style={{ font: 'var(--type-username)', color: 'var(--text-primary)' }}>{i18n.t('moodCalmTitle')}</span>
            <Caption style={{ lineHeight: '17px' }}>{i18n.t('moodCalmAlways')}</Caption>
          </div>
          <Button variant="secondary" onClick={() => setCalm(i18n.t('moodCalmReason_manual'))} style={{ flex: 'none' }}>
            {i18n.t('moodCalmOpen')}
          </Button>
        </div>
      </Panel>
    </div>
  );
}
