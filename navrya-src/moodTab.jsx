import React from 'react';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { Chip } from '../public/pages/shared/navrya/components/forms/Chip.jsx';
import { TextField } from '../public/pages/shared/navrya/components/forms/TextField.jsx';
import { Notice } from '../public/pages/shared/navrya/components/feedback/Notice.jsx';
import { Modal } from '../public/pages/shared/navrya/components/feedback/Modal.jsx';

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
// query is repeated here for the animations this screen adds.
const KEYFRAMES = `
@keyframes navrya-mood-aura { 0%,100% { opacity:.4; transform:scale(1) } 50% { opacity:.92; transform:scale(1.07) } }
@keyframes navrya-mood-breathe { 0% { transform:scale(.62); opacity:.5 } 33% { transform:scale(1); opacity:1 } 50% { transform:scale(1); opacity:1 } 100% { transform:scale(.62); opacity:.5 } }
@keyframes navrya-mood-spin { from { transform:rotate(0) } to { transform:rotate(360deg) } }
@media (prefers-reduced-motion: reduce) {
  .navrya-mood-aura, .navrya-mood-breathe, .navrya-mood-spin { animation: none !important }
}`;

function Keyframes() {
  return <style>{KEYFRAMES}</style>;
}

// A small, non-interactive preview of the breathing pacer - the same visual promise the always-
// reachable calm-room card on the design canvas makes: this is what opening it looks like, not
// just a link with an icon.
function BreathPreview({ size = 96, label }) {
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <svg className="navrya-mood-spin" width={size} height={size} viewBox={'0 0 ' + size + ' ' + size} style={{ position: 'absolute', inset: 0, display: 'block', animation: 'navrya-mood-spin 24s linear infinite' }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={size / 2 - 8} fill="none" stroke="rgba(102,201,78,.18)" strokeWidth="1" strokeDasharray="2 12"></circle>
        <circle cx={size / 2} cy="6" r="2.5" fill="var(--char-light-glow, #8AF7B4)"></circle>
      </svg>
      <span className="navrya-mood-breathe" aria-hidden="true" style={{ position: 'absolute', inset: size * 0.14, borderRadius: 999, display: 'block', border: '2px solid var(--char-emerald, #35D07F)', background: 'radial-gradient(circle,rgba(53,208,127,.16),rgba(3,8,7,.7))', animation: 'navrya-mood-breathe 12s cubic-bezier(.4,0,.2,1) infinite' }}></span>
      {label && (
        <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
          <span style={{ font: '600 ' + Math.round(size * 0.19) + 'px/1 var(--font-display)', letterSpacing: '.14em', color: 'var(--char-light-glow, #8AF7B4)' }}>{label}</span>
        </span>
      )}
    </div>
  );
}

// ============================================================================
// CALM ROOM - the real app Modal shell (blur + scrim + close + ESC + click-outside), not a
// hand-rolled overlay. Opened from a tense/angry mood, from the protective guards, or manually.
// ============================================================================
export function CalmRoom({ i18n, psych, profile, trades, reason, onClose }) {
  const settings = psych.settings();
  const totalSeconds = Math.max(60, (settings.postTradeReflection.cooldownMinutes || 15) * 60);
  const [seconds, setSeconds] = React.useState(totalSeconds);
  const [why, setWhy] = React.useState('');
  const [breathDone, setBreathDone] = React.useState(false);
  const [muted, setMuted] = React.useState(false);

  React.useEffect(() => {
    const id = setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, []);

  // One full breathing cycle (4 in + 2 hold + 6 out = 12s) satisfies the gate on its own, the same
  // as actually following the pacer through once; the skip button satisfies it immediately for
  // whoever does not want a forced-meditation experience - matching the design's own "رد کردن
  // تنفس" control rather than making breathing mandatory.
  React.useEffect(() => {
    if (breathDone) return undefined;
    const id = setTimeout(() => setBreathDone(true), 12000);
    return () => clearTimeout(id);
  }, [breathDone]);

  // Three real gates, all required - the timer, a full breath cycle (or an explicit skip), and a
  // written reason of real length. The written reason is the point, not a formality: it is what
  // comes back in the weekly review.
  const timerDone = seconds === 0;
  const reasonGiven = why.trim().length >= 10;
  const canLeave = timerDone && reasonGiven && breathDone;
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  const worst = psych.worstRevengeTrade(trades || []);
  const reflections = (profile.continuousTracking && profile.continuousTracking.postTradeReflections) || [];
  const worstReflection = worst ? reflections.find((r) => r.tradeId === worst.tradeId) : null;
  // A real count of how often the revenge cool-down has actually armed, from
  // postTradeReflection.revengeCheck - never a fabricated "stayed until it cleared" completion
  // rate, since that outcome is not tracked anywhere yet.
  const cooldownFires = reflections.filter((r) => r.revengeCheck && r.revengeCheck.cooldownTimerStartedAt).length;

  const gates = [
    [breathDone, i18n.t('moodGateBreath')],
    [timerDone, i18n.t('moodGateTimer', { value: mm + ':' + ss })],
    [reasonGiven, i18n.t('moodGateReason')]
  ];

  return (
    <Modal
      open title={i18n.t('moodCalmTitle')} icon="honour" onClose={onClose} width={980}
      style={{ background: 'linear-gradient(180deg,rgba(46,204,113,.07),var(--ink-900))' }}
      footer={(
        <React.Fragment>
          <Caption style={{ flex: 1 }}>{i18n.t('moodCalmAfter')}</Caption>
          {cooldownFires > 0 && <Chip tone="neutral">{i18n.t('moodCalmFiredCount', { count: i18n.number(cooldownFires) })}</Chip>}
        </React.Fragment>
      )}
    >
      <Keyframes />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Caption style={{ flex: '1 1 260px' }}>{i18n.t('moodCalmSubtitle')}</Caption>
        {reason && <Chip tone="danger" dot>{reason}</Chip>}
      </div>

      <div style={{ display: 'flex', alignItems: 'stretch', gap: 22, flexWrap: 'wrap' }}>
        {/* breathing pacer */}
        <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, paddingInlineEnd: 22, borderInlineEnd: '1px solid var(--border-hairline)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
            <SectionLabel>{i18n.t('moodBreathTitle')}</SectionLabel>
            <Chip tone="accent" style={{ marginInlineStart: 'auto' }}>{i18n.t('moodBreathPattern')}</Chip>
          </div>
          <BreathPreview size={220} label={i18n.t('moodBreathIn')} />
          <Caption style={{ textAlign: 'center', lineHeight: '18px' }}>{i18n.t('moodBreathHint')}</Caption>
          <div style={{ display: 'flex', gap: 8, width: '100%' }}>
            <Button variant="secondary" size="sm" onClick={() => setMuted((m) => !m)} style={{ flex: 1 }}>
              {i18n.t(muted ? 'moodBreathUnmute' : 'moodBreathMute')}
            </Button>
            <Button variant="ghost" size="sm" disabled={breathDone} onClick={() => setBreathDone(true)} style={{ flex: 1 }}>
              {i18n.t(breathDone ? 'moodBreathDone' : 'moodBreathSkip')}
            </Button>
          </div>
        </div>

        {/* deterrent + exit gate */}
        <div style={{ flex: '1 1 380px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {worst ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '15px 16px', borderRadius: 8, border: '1px solid rgba(255,56,48,.45)', background: 'rgba(255,56,48,.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <SectionLabel>{i18n.t('moodCalmDeterrentTitle')}</SectionLabel>
                <Caption style={{ marginInlineStart: 'auto' }}>{i18n.date(worst.closedAt)}</Caption>
              </div>
              <div style={{ display: 'flex', gap: 14 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                  <Caption>{i18n.t('moodCalmLoss')}</Caption>
                  <span className="navrya-tabular" style={{ font: '600 20px/24px var(--font-display)', color: 'var(--danger)' }}>{i18n.money(worst.pnl)}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                  <Caption>{i18n.t('moodCalmGapLabel')}</Caption>
                  <span className="navrya-tabular" style={{ font: '600 20px/24px var(--font-display)', color: 'var(--text-primary)' }}>{i18n.t('moodCalmGapMinutes', { value: i18n.number(worst.minutesSinceLoss) })}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                  <Caption>{i18n.t('moodCalmSizeLabel')}</Caption>
                  <span className="navrya-tabular" style={{ font: '600 20px/24px var(--font-display)', color: worst.sizeRatio != null ? 'var(--warning)' : 'var(--text-disabled)' }}>
                    {worst.sizeRatio != null ? i18n.t('moodCalmSizeRatio', { value: i18n.number(worst.sizeRatio) }) : '—'}
                  </span>
                </div>
              </div>
              {worstReflection && worstReflection.sentenceOfTheDay && (
                <span style={{ font: 'italic 400 14px/22px var(--font-quote, Georgia, serif)', color: 'var(--parchment)', borderInlineStart: '2px solid rgba(255,56,48,.5)', paddingInlineStart: 12 }}>
                  «{worstReflection.sentenceOfTheDay}»
                </span>
              )}
            </div>
          ) : (
            <Notice tone="accent" icon="honour">{i18n.t('moodNoRevengeYet')}</Notice>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <SectionLabel>{i18n.t('moodExitGate')}</SectionLabel>
            <Caption style={{ lineHeight: '18px' }}>{i18n.t('moodExitGateBody')}</Caption>
            <TextField
              label={i18n.t('moodExitReason')} value={why} onChange={setWhy}
              placeholder={i18n.t('moodExitReasonPlaceholder')}
              hint={reasonGiven ? undefined : i18n.t('moodExitReasonHint')}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {gates.map(([ok, label]) => (
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
    </Modal>
  );
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
        <Panel variant="base" ornament padding="18px 20px 20px" style={{ flex: '1 1 300px', borderColor: 'rgba(102,201,78,.45)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
              <SectionLabel>{i18n.t('moodCalmTitle')}</SectionLabel>
              <Chip tone="accent" style={{ marginInlineStart: 'auto' }}>{i18n.t('moodBreathPattern')}</Chip>
            </div>
            <BreathPreview size={130} label={i18n.t('moodBreathIn')} />
            <Caption style={{ textAlign: 'center', lineHeight: '18px' }}>{i18n.t('moodCalmAlways')}</Caption>
            <Button variant="primary" fullWidth onClick={() => setCalm(i18n.t('moodCalmReason_manual'))}>
              {i18n.t('moodCalmOpen')}
            </Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
