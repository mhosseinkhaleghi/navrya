import React from 'react';
import { createRoot } from 'react-dom/client';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { Select } from '../public/pages/shared/navrya/components/forms/Select.jsx';
import { TextField } from '../public/pages/shared/navrya/components/forms/TextField.jsx';
import { Chip } from '../public/pages/shared/navrya/components/forms/Chip.jsx';
import { Notice } from '../public/pages/shared/navrya/components/feedback/Notice.jsx';
import { MetricRow } from '../public/pages/shared/navrya/components/metrics/MetricRow.jsx';
import { currentNavryaCharacter } from './currentCharacter.js';
import { openWeeklyCheckIn } from './weeklyCheckInModal.jsx';
import { RoutineTab } from './routineTab.jsx';
import { MoodTab, CalmRoom, BreathPreview, MOODS, BY_ID as MOOD_BY_ID } from './moodTab.jsx';
import { TherapistTab } from './therapistTab.jsx';
import { EmotionMap, DisciplineTrend, TradeArc, TiltMeter, RatingGauge, ReadinessDial, emotionMirrorVerdict } from './psychologyCharts.jsx';

// ============================================================================
// Small shared building blocks
// ============================================================================

// The same bespoke 46x26 toggle the AI Assistant screen's VOICE MODE/REMEMBER
// controls use - recreated here rather than shared, matching that screen's own
// choice to keep this one shape local to whichever screen needs it.
function BigToggle({ checked, onChange, ariaLabel }) {
  return (
    <button
      type="button" onClick={() => onChange(!checked)} aria-label={ariaLabel} aria-pressed={checked}
      style={{
        width: 46, height: 26, flex: 'none', boxSizing: 'border-box', borderRadius: 999,
        border: '1px solid ' + (checked ? 'color-mix(in srgb, var(--char-accent) 70%, transparent)' : 'var(--border-gold)'),
        background: checked ? 'var(--char-active-surface)' : 'rgba(3,8,7,.55)',
        display: 'flex', alignItems: 'center', justifyContent: checked ? 'flex-end' : 'flex-start',
        padding: 2, cursor: 'pointer', transition: 'background var(--dur-hover) var(--ease-out), border-color var(--dur-hover) var(--ease-out)'
      }}
    >
      <span style={{ width: 20, height: 20, borderRadius: 999, background: checked ? 'var(--char-accent)' : 'var(--text-disabled)', display: 'block' }}></span>
    </button>
  );
}

function SectionLabel({ children, style }) {
  return <span style={{ font: 'var(--type-section-label)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-muted)', textTransform: 'uppercase', ...style }}>{children}</span>;
}
function Caption({ children, style }) {
  return <span style={{ font: 'var(--type-caption)', color: 'var(--text-dim)', letterSpacing: '.04em', ...style }}>{children}</span>;
}

const NEGATIVE_ACUTE = ['afraid', 'revenge', 'angry'];
const NEGATIVE = ['revenge', 'angry', 'afraid', 'anxious', 'fatigued', 'restless', 'overconfident'];
const POSITIVE = ['calm', 'confident', 'excited'];
function emotionTone(name) {
  if (NEGATIVE_ACUTE.indexOf(name) > -1) return 'danger';
  if (NEGATIVE.indexOf(name) > -1) return 'accent';
  if (POSITIVE.indexOf(name) > -1) return 'success';
  return 'neutral';
}
function stageLabel(i18n, stage) { return i18n.t(stage === 'entry' ? 'entryStage' : stage === 'exit' ? 'exitStage' : 'midTrade'); }
function stressChipTone(value) { return value >= 7 ? 'danger' : value >= 4 ? 'accent' : 'success'; }

function journeyReading(i18n, log) {
  const values = log.map((e) => Number(e.stressLevel)).filter((v) => Number.isFinite(v));
  if (!values.length) return '';
  const from = values[0], to = values[values.length - 1], peak = Math.max(...values);
  if (peak > from && peak > to && peak - Math.min(from, to) >= 2) return i18n.t('psyJourneyReadingSpike', { from, to, peak });
  if (to - from >= 2) return i18n.t('psyJourneyReadingRising', { from, to });
  if (from - to >= 2) return i18n.t('psyJourneyReadingFalling', { from, to });
  return i18n.t('psyJourneyReadingSteady', { from });
}

const SCENARIO_CONSTRUCTS = { A_stop_loss: 'loss_aversion_discipline', B_revenge: 'revenge_trading', C_fomo: 'fomo', D_patience: 'overtrading_patience', E_identity: 'identity_outcome_fusion' };
const TRIGGER_TYPE_OPTIONS = ['custom', 'revenge', 'fomo', 'fatigue', 'overconfidence'];
const GROWTH_HOLD_TARGET = 10;

// Shared by InsightsTab's routine-completion correlation and OverviewTab's routine notice - a
// plain {dayKey:{total,complete}} map built from routine-store.js, kept out of psychology-store.js
// so that file stays a pure trades-in reducer with zero dependency on routine-store.js (its own
// sandboxed test harness never needs to load it).
function buildRoutineDaysMap() {
  const routineStore = window.TradeJournalRoutineStore;
  if (!routineStore) return {};
  const state = routineStore.load();
  const routine = routineStore.active(state);
  if (!routine) return {};
  const map = {};
  Object.keys(state.completions || {}).forEach((key) => {
    // routineStore's own dayProgress() re-derives its cache key from the Date it is given
    // (getFullYear/getMonth/getDate, non-padded) - parse the stored key back into that exact
    // local Date rather than trusting `new Date(nonStandardString)` across engines.
    const [y, m, d] = key.split('-').map(Number);
    const progress = routineStore.dayProgress(state, new Date(y, m - 1, d), routine);
    if (progress.total > 0) map[key] = { total: progress.total, complete: progress.complete };
  });
  return map;
}

// ============================================================================
// The always-available file rail (right, every tab)
// ============================================================================
function FileRail({ i18n, mi, profile, closed, goFile, activeSection, onRunCheckIn }) {
  const intake = profile.intake;
  const answeredIntake = [intake.demographics.age, intake.financialContext.capitalType, intake.tradingHistory.yearsTrading, intake.motivationForTrading, intake.financialContext.capitalAllocationPercent, intake.financialContext.borrowedMoneyForTrading].filter((v) => v !== null && v !== undefined).length;
  const logCount = closed.reduce((sum, t) => sum + (t.emotionLog || []).length, 0);
  const signals = [intake.completed, profile.psychologicalProfile.biasChecklist.lastAssessedAt != null, logCount > 0, true].filter(Boolean).length;
  const completePct = Math.round((signals / 4) * 100);

  const links = [
    { id: 'intake', icon: 'ClipboardList', label: mi.t('mhTabIntake'), status: intake.completed ? i18n.t('psyIntakeStatusComplete', { count: answeredIntake }) : i18n.t('psyIntakeStatusIncomplete') },
    { id: 'psych', icon: 'psychology', label: mi.t('mhTabPsychological'), status: profile.psychologicalProfile.biasChecklist.lastAssessedAt ? i18n.t('psyPsychStatusDone', { count: profile.psychologicalProfile.scenarioAssessment.responses.length, total: 5 }) : i18n.t('psyPsychStatusDue', { count: profile.psychologicalProfile.scenarioAssessment.responses.length, total: 5 }) },
    { id: 'tracking', icon: 'Activity', label: mi.t('mhTabContinuous'), status: logCount > 0 ? i18n.t('psyTrackingStatus', { count: logCount, score: i18n.number(profile.healthReportCache.weeklyScore) }) : i18n.t('psyTrackingStatusEmpty') },
    { id: 'flags', icon: 'Flag', label: mi.t('mhTabRedFlags'), status: profile.redFlags.active.length ? i18n.t('psyFlagsStatus', { count: profile.redFlags.active.length }) : i18n.t('psyFlagsStatusClear') }
  ];

  return (
    <div style={{ width: 380, flex: 'none', display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 16 }}>
      <Panel variant="prestige" ornament texture padding="18px 20px 20px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <span style={{ width: 40, height: 40, flex: 'none', borderRadius: 999, border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.55)', display: 'grid', placeItems: 'center', color: 'var(--char-accent)' }}>
              <Icon name="psychology" size={22} />
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
              <span style={{ font: 'var(--type-display-md)', color: 'var(--text-primary)', letterSpacing: 'var(--tracking-display)' }}>{i18n.t('psyFileTitle')}</span>
              <Caption>{i18n.t('psyFileSubtitle')}</Caption>
            </div>
            <Chip tone="accent">{i18n.t('psyFileComplete', { pct: completePct })}</Chip>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: 'rgba(3,8,7,.65)', border: '1px solid var(--border-hairline)', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 999, background: 'linear-gradient(90deg,color-mix(in srgb, var(--char-accent) 55%, transparent),var(--char-accent))', transition: 'width var(--dur-progress) var(--ease-out)', width: completePct + '%' }}></div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {links.map((link) => {
              const selected = activeSection === link.id;
              return (
                <button
                  key={link.id} type="button" onClick={() => goFile(link.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 8, cursor: 'pointer', textAlign: 'start',
                    border: selected ? '1px solid color-mix(in srgb, var(--char-accent) 70%, transparent)' : '1px solid var(--border-hairline)',
                    background: selected ? 'var(--char-active-surface)' : 'rgba(11,20,21,.55)',
                    boxShadow: selected ? 'var(--glow-active)' : 'none',
                    color: selected ? 'var(--char-accent)' : 'var(--text-muted)'
                  }}
                >
                  <Icon name={link.icon} size={18} />
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
                    <span style={{ font: 'var(--type-body)', color: selected ? 'var(--char-accent)' : 'var(--text-primary)' }}>{link.label}</span>
                    <Caption>{link.status}</Caption>
                  </span>
                  <Icon name="active-arrow" size={18} />
                </button>
              );
            })}
          </div>
          <div style={{ height: 1, background: 'var(--border-hairline)' }}></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Caption>{profile.lastUpdatedAt ? i18n.t('psyFileUpdated', { value: i18n.date(profile.lastUpdatedAt, { dateStyle: 'medium', timeStyle: 'short' }) }) : i18n.t('psyFileNeverUpdated')}</Caption>
            <Button variant="primary" icon="calendar" fullWidth onClick={onRunCheckIn}>{i18n.t('psyRunWeeklyCheckIn')}</Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}

// ============================================================================
// Tab 1 - Overview
// ============================================================================

// --- Readiness panel: psych.readinessScore()'s composite read of the day ---
function ReadinessPanel({ i18n, readiness, onStartSession, onOpenCalmRoom, onWatchDay }) {
  return (
    <Panel variant={readiness.hasData && !readiness.ready ? 'active' : 'base'} ornament padding="18px 20px 20px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <SectionLabel>{i18n.t('psyReadinessTitle')}</SectionLabel>
          {readiness.suggestion && <Chip tone="accent">{i18n.t('psyReadinessSuggestion_' + readiness.suggestion)}</Chip>}
          <Caption style={{ marginInlineStart: 'auto' }}>{i18n.t('psyReadinessSource')}</Caption>
        </div>
        {readiness.hasData ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
            <ReadinessDial i18n={i18n} score={readiness.score} ready={readiness.ready} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: '1 1 260px', minWidth: 0 }}>
              <span style={{ font: 'var(--type-display-md)', color: 'var(--text-primary)', textWrap: 'pretty' }}>
                {i18n.t(readiness.ready ? 'psyReadinessHeadlineReady' : 'psyReadinessHeadlineCaution')}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {readiness.factors.map((f) => (
                  <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 999, flex: 'none', background: f.tone === 'danger' ? 'var(--danger)' : f.tone === 'warning' ? 'var(--warning)' : 'var(--success)' }}></span>
                    <Caption style={{ fontSize: 12 }}>{i18n.t('psyReadinessFactor_' + f.key, { value: i18n.number(f.value) })}</Caption>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, flex: 'none', width: 190 }}>
              <Button variant="primary" icon="check" fullWidth onClick={onStartSession}>{i18n.t('psyReadinessStartSession')}</Button>
              <Button variant="secondary" icon="honour" fullWidth onClick={onOpenCalmRoom}>{i18n.t('psyOpenCalmRoom')}</Button>
              <Button variant="ghost" fullWidth onClick={onWatchDay}>{i18n.t('psyReadinessNoTrade')}</Button>
            </div>
          </div>
        ) : <Caption>{i18n.t('psyReadinessEmpty')}</Caption>}
      </div>
    </Panel>
  );
}

// --- Mood-of-the-day: a compact, real PreSessionCheckIn logging surface on the dashboard ---
const OVERVIEW_MOOD_PICK = ['calm', 'focused', 'tense', 'angry', 'flat'];
function MoodOfDayPanel({ i18n, psych, mhStore, trades, checkins, onLogged, onOpenCalmRoom }) {
  const todayKey = new Date().toDateString();
  const todays = (checkins || []).filter((c) => new Date(c.createdAt).toDateString() === todayKey);
  const latest = todays[todays.length - 1] || null;
  const activeId = latest ? latest.mood : null;
  const active = activeId ? MOOD_BY_ID[activeId] : null;
  const insight = activeId ? psych.moodInsight(trades, checkins, activeId, 5) : null;

  function pick(moodId) {
    const m = MOOD_BY_ID[moodId];
    mhStore.addPreSessionCheckIn(mhStore.load(), null, { mood: moodId, currentStressLevel: m.stress });
    if (onLogged) onLogged();
    // The two moods that mean "do not trade right now" open the calm room themselves - same
    // convention MoodTab's own log() already uses.
    if (moodId === 'angry' || moodId === 'tense') onOpenCalmRoom();
  }

  return (
    <Panel variant="base" ornament padding="18px 20px 20px" style={{ flex: '1 1 620px', borderColor: active ? active.tone : undefined }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <SectionLabel>{i18n.t('psyMoodOfDayTitle')}</SectionLabel>
          {active && <Chip style={{ color: active.tone, borderColor: active.tone, background: 'rgba(3,8,7,.5)' }}>{i18n.t(activeId)}</Chip>}
          <Caption style={{ marginInlineStart: 'auto' }}>{i18n.t('psyMoodLoggedToday', { count: i18n.number(todays.length) })}</Caption>
        </div>
        {active ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', width: 98, height: 98, flex: 'none' }}>
              <span aria-hidden="true" style={{ position: 'absolute', inset: 0, borderRadius: 999, display: 'block', background: 'radial-gradient(circle,rgba(' + active.rgb + ',.32),transparent 68%)' }}></span>
              <span style={{ position: 'absolute', inset: 12, borderRadius: 999, border: '1px solid ' + active.tone, background: 'rgba(3,8,7,.7)', display: 'grid', placeItems: 'center' }}>
                <span className="navrya-tabular" style={{ font: '600 30px/1 var(--font-display)', color: active.tone }}>{i18n.number(active.stress)}</span>
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: '1 1 260px', minWidth: 0 }}>
              <span style={{ font: 'var(--type-body)', fontSize: 15, lineHeight: '22px', color: 'var(--text-primary)' }}>{i18n.t('psyMoodHeadline_' + activeId)}</span>
              <Caption style={{ fontSize: 12, lineHeight: '18px' }}>{i18n.t('psyMoodBody_' + activeId)}</Caption>
            </div>
          </div>
        ) : <Caption>{i18n.t('psyMoodNotLoggedToday')}</Caption>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {OVERVIEW_MOOD_PICK.map((id) => {
            const m = MOOD_BY_ID[id], on = id === activeId;
            return (
              <button
                key={id} type="button" onClick={() => pick(id)}
                style={{
                  flex: '1 1 70px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, padding: '11px 4px 10px',
                  borderRadius: 8, border: '1px solid ' + (on ? m.tone : 'var(--border-hairline)'), background: on ? 'rgba(3,8,7,.7)' : 'rgba(11,16,22,.4)',
                  cursor: 'pointer', boxSizing: 'border-box'
                }}
              >
                <span style={{ width: 26, height: 26, borderRadius: 999, display: 'block', background: on ? m.tone : 'rgba(244,234,215,.14)' }}></span>
                <span style={{ font: 'var(--type-body)', fontSize: 11, color: on ? 'var(--text-primary)' : 'var(--text-dim)' }}>{i18n.t(id)}</span>
              </button>
            );
          })}
        </div>
        {activeId && (
          <Notice tone={active.tone === 'var(--danger)' || active.tone === 'var(--warning)' ? 'warning' : 'accent'}>
            {insight ? i18n.t('psyMoodInsight', { winRate: i18n.number(Math.round(insight.winRate)), count: i18n.number(insight.sampleSize) }) : i18n.t('psyMoodInsightEmpty')}
            {(activeId === 'angry' || activeId === 'tense') ? (
              <Button variant="primary" size="sm" style={{ flex: 'none', background: active.tone, borderColor: active.tone }} onClick={onOpenCalmRoom}>{i18n.t('psyOpenCalmRoom')}</Button>
            ) : null}
          </Notice>
        )}
      </div>
    </Panel>
  );
}

// --- One self-rating gauge card: real value + a real trend delta vs the prior window ---
function GaugeCard({ i18n, label, value, tone, delta, deltaGoodWhen, note }) {
  const deltaGood = delta == null ? null : (deltaGoodWhen === 'down' ? delta <= 0 : delta >= 0);
  const deltaText = delta == null ? '—' : (delta > 0 ? '+' : '') + i18n.number(delta);
  return (
    <Panel variant="raised" padding="16px 20px 17px" style={{ flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <RatingGauge i18n={i18n} value={value} tone={tone} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
          <SectionLabel>{label}</SectionLabel>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
            <span className="navrya-tabular" style={{ font: 'var(--type-metric-value)', fontSize: 22, color: tone }}>{value == null ? '—' : i18n.number(value)}</span>
            <Caption>/ 10</Caption>
            {delta != null && <Chip tone={deltaGood ? 'success' : 'danger'} style={{ height: 20, fontSize: 10, marginInlineStart: 'auto' }}>{deltaText}</Chip>}
          </div>
          <Caption style={{ lineHeight: '16px' }}>{note}</Caption>
        </div>
      </div>
    </Panel>
  );
}

// --- Today's routine: routine-store.js, live - the same store RoutineTab itself reads/writes ---
function RoutineTodayPanel({ i18n, trades, onEdit }) {
  const store = window.TradeJournalRoutineStore;
  const [, forceRerender] = React.useReducer((x) => x + 1, 0);
  if (!store) return null;
  const state = store.load();
  const routine = store.active(state);
  if (!routine) {
    return (
      <Panel variant="base" ornament padding="18px 20px 20px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SectionLabel>{i18n.t('psyRoutineTodayTitle')}</SectionLabel>
          <Caption>{i18n.t('psyRoutineNoneYet')}</Caption>
          <Button variant="secondary" icon="plus" onClick={onEdit} style={{ alignSelf: 'flex-start' }}>{i18n.t('psyRoutineBuildOne')}</Button>
        </div>
      </Panel>
    );
  }
  const progress = store.dayProgress(state, new Date(), routine);
  const doneToday = state.completions[store.dayKey()] || {};
  const rate14 = store.adherenceRate(14, new Date(), state);

  function toggle(stepId) { store.toggleStep(stepId); forceRerender(); }

  return (
    <Panel variant="base" ornament padding="18px 20px 20px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <SectionLabel>{i18n.t('psyRoutineTodayTitle')}</SectionLabel>
          <Chip tone="gold">{routine.name}</Chip>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginInlineStart: 'auto' }}>
            <Caption className="navrya-tabular">{i18n.t('routineOfTotal', { done: i18n.number(progress.done), total: i18n.number(progress.total) })}</Caption>
            <div style={{ width: 120, height: 8, borderRadius: 999, background: 'rgba(3,8,7,.65)', border: '1px solid var(--border-hairline)', overflow: 'hidden', flex: 'none' }}>
              <div style={{ height: '100%', width: progress.pct + '%', borderRadius: 999, background: 'linear-gradient(90deg,rgba(102,201,78,.45),var(--char-accent))' }}></div>
            </div>
            <Button variant="secondary" size="sm" onClick={onEdit}>{i18n.t('psyRoutineEdit')}</Button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '8px 16px' }}>
          {routine.steps.map((s) => {
            const done = !!doneToday[s.id];
            return (
              <button
                key={s.id} type="button" onClick={() => toggle(s.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', width: '100%', boxSizing: 'border-box',
                  borderRadius: 8, cursor: 'pointer', textAlign: 'start', font: 'inherit',
                  border: '1px solid ' + (done ? 'rgba(102,201,78,.42)' : 'var(--border-hairline)'),
                  background: done ? 'rgba(18,51,27,.5)' : 'rgba(11,16,22,.4)'
                }}
              >
                <span style={{ width: 22, height: 22, flex: 'none', borderRadius: 6, display: 'grid', placeItems: 'center', border: '1px solid ' + (done ? 'var(--char-accent)' : 'rgba(244,234,215,.18)'), background: done ? 'var(--char-accent)' : 'transparent', color: 'var(--ink-950)' }}>
                  {done && <Icon name="check" size={14} />}
                </span>
                <span style={{ flex: 1, minWidth: 0, font: 'var(--type-body)', fontSize: 13, color: done ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: done ? 'line-through' : 'none' }}>{s.label}</span>
                {s.time && <Caption className="navrya-tabular" style={{ flex: 'none' }}>{s.time}</Caption>}
              </button>
            );
          })}
        </div>
        {rate14 != null && (
          <Notice tone="accent" icon="check">
            {i18n.t('psyRoutineAdherenceNote', { rate: i18n.number(rate14) })}
          </Notice>
        )}
      </div>
    </Panel>
  );
}

// --- One journey preview card: real TradeArc, real symbol/pnl, real reading ---
function JourneyPreviewCard({ i18n, trade }) {
  const log = trade.emotionLog || [];
  const stages = log.map((e) => ({ label: stageLabel(i18n, e.stage), value: Number(e.stressLevel || 0) }));
  const pnlTone = trade.pnl > 0 ? 'var(--success)' : trade.pnl < 0 ? 'var(--danger)' : 'var(--text-muted)';
  return (
    <Panel variant="base" padding="15px" style={{ flex: '1 1 240px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: pnlTone, flex: 'none' }}></span>
          <span style={{ flex: 1, minWidth: 0, font: 'var(--type-username)', color: 'var(--text-primary)' }}>{trade.instrument || i18n.t(trade.direction)}</span>
          <span className="navrya-tabular" style={{ font: 'var(--type-body)', fontSize: 13, color: pnlTone }}>{trade.pnl == null ? '—' : (trade.pnl >= 0 ? '+' : '') + i18n.money(trade.pnl)}</span>
        </div>
        <TradeArc i18n={i18n} stages={stages} width={240} height={108} />
        <Caption style={{ lineHeight: '16px' }}>{journeyReading(i18n, log)}</Caption>
      </div>
    </Panel>
  );
}

// --- Quick access: one click from the dashboard to the tab/modal that already exists ---
function QuickAccessGrid({ i18n, onNavigate }) {
  const items = [
    { id: 'calm', icon: 'honour', tone: '#2ECC71', soon: false },
    { id: 'therapist', icon: 'sparkle', tone: '#A965D8', soon: false },
    { id: 'routine', icon: 'edit', tone: '#D6AF6B', soon: false },
    { id: 'journal', icon: 'file-text', tone: '#4DA3FF', soon: false },
    { id: 'weekly', icon: 'history', tone: '#66C94E', soon: false },
    { id: 'bias', icon: 'star', tone: '#D6AF6B', soon: false },
    { id: 'rules', icon: 'flag', tone: '#FFB020', soon: true },
    { id: 'month', icon: 'moon', tone: '#A965D8', soon: true }
  ];
  return (
    <Panel variant="base" ornament padding="18px 20px 20px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <SectionLabel>{i18n.t('psyQuickAccessTitle')}</SectionLabel>
          <Caption style={{ marginInlineStart: 'auto' }}>{i18n.t('psyQuickAccessHint')}</Caption>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          {items.map((q) => (
            <button
              key={q.id} type="button" disabled={q.soon} onClick={() => onNavigate(q.id)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 12, padding: 14, width: '100%', boxSizing: 'border-box', textAlign: 'start', font: 'inherit',
                borderRadius: 8, cursor: q.soon ? 'default' : 'pointer',
                border: '1px solid ' + (q.soon ? 'rgba(214,175,107,.35)' : 'var(--border-hairline)'),
                background: q.soon ? 'rgba(183,138,74,.06)' : 'rgba(11,16,22,.4)'
              }}
            >
              <span style={{ width: 32, height: 32, flex: 'none', borderRadius: 8, border: '1px solid ' + (q.soon ? 'rgba(214,175,107,.35)' : 'var(--border-hairline)'), background: 'rgba(3,8,7,.5)', display: 'grid', placeItems: 'center', color: q.tone }}>
                <Icon name={q.icon} size={17} />
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ font: 'var(--type-body)', fontSize: 13, color: 'var(--text-primary)' }}>{i18n.t('psyQuick_' + q.id + '_title')}</span>
                  {q.soon && <Chip tone="gold" style={{ height: 18, fontSize: 9 }}>{i18n.t('psyComingSoon')}</Chip>}
                </span>
                <Caption style={{ lineHeight: '16px' }}>{i18n.t('psyQuick_' + q.id + '_body')}</Caption>
              </span>
            </button>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function OverviewTab({ i18n, psych, mhStore, profile, trades, closed, checkins, setPsyTab, goFile, runCheckIn }) {
  const now = new Date();
  const [calmOpen, setCalmOpen] = React.useState(false);
  const [, forceRerender] = React.useReducer((x) => x + 1, 0);

  const streak = psych.disciplineStreak(trades);
  const totalLogs = closed.reduce((sum, t) => sum + (t.emotionLog || []).length, 0);
  // The map needs both halves: how often an emotion shows up (emotionFrequency) and what it cost
  // when it did (emotionalMirror). Only emotions with BOTH can be placed - one without a
  // profitable/costly reading has no y position, and inventing one would be a fabricated number.
  const frequency = psych.emotionFrequency(trades, 30);
  const performance = psych.emotionalMirror(closed, 8);
  const perfBy = {};
  performance.forEach((row) => { perfBy[row.emotion] = row; });
  const mapRows = frequency.map((f) => {
    const perf = perfBy[f.emotion];
    if (!perf || perf.insufficient || perf.avgPnl == null) return null;
    return { emotion: f.emotion, freq: f.pct, pnl: perf.avgPnl, n: perf.sampleSize };
  }).filter(Boolean).slice(0, 6);
  // Everything the map cannot honestly place is named underneath it rather than dropped silently.
  const thinRows = frequency.filter((f) => !mapRows.some((m) => m.emotion === f.emotion)).slice(0, 6);
  const mirrorVerdict = emotionMirrorVerdict(mapRows);

  const weekly = psych.disciplineWeekly(trades, 12);
  const scored = weekly.filter((w) => w.score != null);
  const recent4 = scored.slice(-4), prior4 = scored.slice(-8, -4);
  const recentAvg = recent4.length ? recent4.reduce((s, w) => s + w.score, 0) / recent4.length : null;
  const priorAvg = prior4.length ? prior4.reduce((s, w) => s + w.score, 0) / prior4.length : null;
  const delta = recentAvg != null && priorAvg != null ? Math.round(recentAvg - priorAvg) : null;
  const healthyStreak = psych.disciplineHealthyStreak(weekly, 70, 90);

  const avgStressToday = (() => {
    const since = Date.now() - 30 * 86400000;
    const values = [];
    trades.forEach((t) => (t.emotionLog || []).forEach((e) => { if (new Date(e.timestamp).getTime() >= since && Number.isFinite(Number(e.stressLevel))) values.push(Number(e.stressLevel)); }));
    return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
  })();
  const planAdherencePct = closed.length ? Math.max(0, Math.round(100 - profile.behavioralPatterns.planDeviationRate)) : null;
  const tilt = psych.tiltReading(trades, now);
  const ratings = psych.selfRatings(trades, 30);
  const deltas = psych.ratingDeltas(trades, 30, now);
  const gauges = [
    { key: 'stress', label: i18n.t('psyRating_stress'), value: ratings.stress, delta: deltas.stress.delta, goodWhen: 'down', tone: ratings.stress == null ? 'var(--text-disabled)' : ratings.stress >= 7 ? 'var(--danger)' : ratings.stress >= 5 ? 'var(--warning)' : 'var(--success)' },
    { key: 'focus', label: i18n.t('psyRating_focus'), value: ratings.focus, delta: deltas.focus.delta, goodWhen: 'up', tone: ratings.focus == null ? 'var(--text-disabled)' : ratings.focus >= 7 ? 'var(--success)' : ratings.focus >= 5 ? 'var(--warning)' : 'var(--danger)' },
    { key: 'plan', label: i18n.t('psyRating_plan'), value: ratings.planCommitment, delta: deltas.planCommitment.delta, goodWhen: 'up', tone: ratings.planCommitment == null ? 'var(--text-disabled)' : ratings.planCommitment >= 7 ? 'var(--success)' : ratings.planCommitment >= 5 ? 'var(--warning)' : 'var(--danger)' }
  ];

  const readiness = psych.readinessScore(trades, checkins, now);

  const journeys = trades.filter((t) => (t.emotionLog || []).length > 1).slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const journeyPreview = journeys.slice(0, 4);
  const arcShapes = psych.journeyArcShapes(closed, 3);
  const arcByShape = {};
  arcShapes.forEach((s) => { arcByShape[s.shape] = s; });
  const totalArcSamples = arcShapes.reduce((sum, s) => sum + s.sampleSize, 0);
  const risingShare = totalArcSamples && arcByShape.rising ? Math.round(arcByShape.rising.sampleSize / totalArcSamples * 100) : null;
  const fallingShare = totalArcSamples && arcByShape.falling ? Math.round(arcByShape.falling.sampleSize / totalArcSamples * 100) : null;

  const metrics = [
    { icon: 'streak', label: i18n.t('psyDisciplineStreakTitle'), value: i18n.t('psyDisciplineStreakDays', { count: streak }) },
    { icon: 'scenarios', label: i18n.t('totalTrades'), value: i18n.number(closed.length) },
    { icon: 'psychology', label: i18n.t('psyMetricAvgStress'), value: avgStressToday != null ? avgStressToday.toFixed(1) + ' / 10' : '—' },
    { icon: 'execution', label: i18n.t('psyMetricPlanAdherence'), value: planAdherencePct != null ? planAdherencePct + '%' : '—' }
  ];

  function onQuickNavigate(id) {
    if (id === 'calm') { setCalmOpen(true); return; }
    if (id === 'therapist') { setPsyTab('therapist'); return; }
    if (id === 'routine') { setPsyTab('routine'); return; }
    if (id === 'journal') { location.hash = '#strategies/trades'; return; }
    if (id === 'weekly') { runCheckIn(); return; }
    if (id === 'bias') { goFile('psych'); return; }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <MetricRow metrics={metrics} />

      <ReadinessPanel
        i18n={i18n} readiness={readiness}
        onStartSession={() => setPsyTab('mood')} onOpenCalmRoom={() => setCalmOpen(true)}
        onWatchDay={() => { const s = window.TradeJournalRoutineStore; if (s) s.setWatchDay(true); forceRerender(); }}
      />

      <div style={{ display: 'flex', alignItems: 'stretch', gap: 16, flexWrap: 'wrap' }}>
        <MoodOfDayPanel i18n={i18n} psych={psych} mhStore={mhStore} trades={trades} checkins={checkins} onLogged={forceRerender} onOpenCalmRoom={() => setCalmOpen(true)} />

        <Panel variant="base" ornament padding="18px 20px 20px" style={{ flex: '1 1 300px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <SectionLabel>{i18n.t('psyTiltTitle')}</SectionLabel>
            <TiltMeter i18n={i18n} reading={tilt} />
            <div style={{ height: 1, background: 'var(--border-hairline)' }}></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {[
                [i18n.t('psyTiltSinceLoss'), tilt.minutesSinceLoss == null ? '—' : i18n.t('psyTiltMinutes', { count: i18n.number(tilt.minutesSinceLoss) })],
                [i18n.t('psyTiltLossStreak'), i18n.number(tilt.lossStreak)],
                [i18n.t('psyTiltOpen'), i18n.number(tilt.openCount)]
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Caption style={{ flex: 1 }}>{label}</Caption>
                  <span className="navrya-tabular" style={{ font: 'var(--type-body)', fontSize: 12, color: 'var(--text-muted)' }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <GaugeCard i18n={i18n} label={gauges[0].label} value={gauges[0].value} tone={gauges[0].tone} delta={gauges[0].delta} deltaGoodWhen={gauges[0].goodWhen} note={i18n.t('psyGaugeNote', { count: i18n.number(ratings.sampleSize) })} />
        <GaugeCard i18n={i18n} label={gauges[1].label} value={gauges[1].value} tone={gauges[1].tone} delta={gauges[1].delta} deltaGoodWhen={gauges[1].goodWhen} note={i18n.t('psyGaugeNote', { count: i18n.number(ratings.sampleSize) })} />
        <GaugeCard i18n={i18n} label={gauges[2].label} value={gauges[2].value} tone={gauges[2].tone} delta={gauges[2].delta} deltaGoodWhen={gauges[2].goodWhen} note={i18n.t('psyGaugeNote', { count: i18n.number(ratings.sampleSize) })} />
      </div>

      <RoutineTodayPanel i18n={i18n} trades={trades} onEdit={() => setPsyTab('routine')} />

      <Panel variant="base" ornament padding="18px 20px 20px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <SectionLabel>{i18n.t('psyEmotionalMirrorTitle')}</SectionLabel>
            <Caption>{i18n.t('psyMirrorLegendHint')}</Caption>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginInlineStart: 'auto' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 999, background: 'var(--success)', display: 'block' }}></span><Caption>{i18n.t('psyMapLegendGood')}</Caption></span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 999, border: '2px solid var(--warning)', boxSizing: 'border-box', display: 'block' }}></span><Caption>{i18n.t('psyMapLegendNeutral')}</Caption></span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, background: 'var(--danger)', display: 'block', transform: 'rotate(45deg)' }}></span><Caption>{i18n.t('psyMapLegendBad')}</Caption></span>
            </div>
          </div>
          {mapRows.length ? (
            <EmotionMap i18n={i18n} rows={mapRows} />
          ) : <Caption>{i18n.t('psyMirrorEmpty')}</Caption>}
          {thinRows.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <Caption>{i18n.t('psyMapThinTitle')}</Caption>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {thinRows.map((row) => (
                  <Chip key={row.emotion} tone="neutral">{i18n.t(row.emotion)} · {i18n.number(row.pct)}%</Chip>
                ))}
              </div>
            </div>
          )}
          {mirrorVerdict && (
            <Notice tone="danger">
              {i18n.t('psyMirrorVerdict', { costly: i18n.t(mirrorVerdict.costly.emotion), cost: i18n.money(Math.abs(mirrorVerdict.costly.pnl)), best: i18n.t(mirrorVerdict.best.emotion) })}
            </Notice>
          )}
        </div>
      </Panel>

      <Panel variant="base" ornament padding="18px 20px 20px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <SectionLabel>{i18n.t('psyDisciplineScoreTitle')}</SectionLabel>
            {delta != null && <Chip tone={delta >= 0 ? 'success' : 'danger'}>{i18n.t(delta > 0 ? 'psyDisciplineTrendUp' : delta < 0 ? 'psyDisciplineTrendDown' : 'psyDisciplineTrendFlat', { value: delta })}</Chip>}
            <Caption style={{ marginInlineStart: 'auto' }}>{i18n.t('psyLast12Weeks')}</Caption>
          </div>
          {scored.length ? (
            <DisciplineTrend i18n={i18n} weeks={weekly} />
          ) : <Caption>{i18n.t('psyDisciplineEmpty')}</Caption>}
          <Notice tone="accent" icon="check">
            {i18n.t(healthyStreak.streak > 0 ? (healthyStreak.isRecord ? 'psyDisciplineGapNoteRecord' : 'psyDisciplineGapNote') : 'psyDisciplineGapNoteNone', { count: i18n.number(healthyStreak.streak) })}
          </Notice>
        </div>
      </Panel>

      {journeyPreview.length > 0 && (
        <Panel variant="base" ornament padding="18px 20px 20px">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <SectionLabel>{i18n.t('psyJourneyPreviewTitle')}</SectionLabel>
              <Caption>{i18n.t('psyJourneyPreviewHint')}</Caption>
              <Button variant="secondary" size="sm" style={{ marginInlineStart: 'auto' }} onClick={() => setPsyTab('journeys')}>{i18n.t('psyJourneyPreviewAll', { count: i18n.number(journeys.length) })}</Button>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {journeyPreview.map((t) => <JourneyPreviewCard key={t.id} i18n={i18n} trade={t} />)}
            </div>
            {risingShare != null && fallingShare != null && !arcByShape.rising.insufficient && (
              <Notice tone="warning">
                {i18n.t('psyJourneyPreviewVerdict', { risingShare: i18n.number(risingShare), risingRate: i18n.number(Math.round(arcByShape.rising.winRate)), fallingShare: i18n.number(fallingShare) })}
              </Notice>
            )}
          </div>
        </Panel>
      )}

      <QuickAccessGrid i18n={i18n} onNavigate={onQuickNavigate} />

      {calmOpen && <CalmRoom i18n={i18n} psych={psych} profile={profile} trades={trades} reason={i18n.t('psyCalmRoomManualReason')} onClose={() => setCalmOpen(false)} />}
    </div>
  );
}

// ============================================================================
// Tab 2 - Trade journeys
// ============================================================================
function JourneyRow({ i18n, trade, expanded, onToggle }) {
  const log = trade.emotionLog || [];
  const path = log.map((e) => ({ tone: emotionTone((e.dominantEmotions || [])[0]), label: stageLabel(i18n, e.stage) + ' · ' + ((e.dominantEmotions || [])[0] ? i18n.t(e.dominantEmotions[0]) : '—') }));
  const stages = log.map((e) => ({ label: stageLabel(i18n, e.stage), value: Number(e.stressLevel || 0) }));
  return (
    <div style={{ border: '1px solid var(--border-hairline)', borderRadius: 8, background: 'rgba(11,20,21,.55)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <span style={{ width: 34, height: 34, flex: 'none', borderRadius: 999, border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.55)', display: 'grid', placeItems: 'center', color: 'var(--char-accent)' }}>
          <Icon name="strategies" size={18} />
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 200 }}>
          <span style={{ font: 'var(--type-username)', color: 'var(--text-primary)' }}>{(trade.session ? trade.session.toUpperCase() : '—') + ' · ' + i18n.t(trade.direction)}</span>
          <span className="navrya-tabular" style={{ font: 'var(--type-caption)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
            {i18n.date(trade.createdAt, { dateStyle: 'medium', timeStyle: 'short' }) + ' · ' + i18n.t(log.length === 1 ? 'psyEmotionLogsOne' : 'psyEmotionLogsMany', { count: log.length })}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
          {path.map((p, i) => <Chip key={i} tone={p.tone} dot>{p.label}</Chip>)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
          <span className="navrya-tabular" style={{ font: 'var(--type-caption)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{i18n.t('psyStressPath', { path: log.map((e) => e.stressLevel).join(' → ') })}</span>
          <Button variant="secondary" size="sm" onClick={onToggle}>{expanded ? i18n.t('psyHideJourney') : i18n.t('psyViewJourney')}</Button>
        </div>
      </div>
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border-hairline)', paddingTop: 14, display: 'flex', gap: 20, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 280px', minWidth: 0 }}>
            <TradeArc i18n={i18n} stages={stages} />
          </div>
          <div style={{ width: 300, flex: 'none', display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 6 }}>
            <SectionLabel>{i18n.t('psyWhatJourneySays')}</SectionLabel>
            <p style={{ margin: 0, font: 'var(--type-body)', color: 'var(--text-primary)', textWrap: 'pretty' }}>{journeyReading(i18n, log)}</p>
          </div>
        </div>
      )}
    </div>
  );
}

const ARC_SHAPE_TONE = { falling: 'var(--success)', bowl: 'var(--warning)', steady: 'var(--char-accent)', rising: 'var(--danger)' };
const ARC_SHAPE_ORDER = ['falling', 'steady', 'bowl', 'rising'];

function ArcShapeCard({ i18n, shape }) {
  const tone = ARC_SHAPE_TONE[shape.shape];
  return (
    <Panel variant="base" padding="15px 16px" style={{ flex: '1 1 190px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: tone, flex: 'none' }}></span>
          <span style={{ flex: 1, minWidth: 0, font: 'var(--type-body)', fontSize: 12, color: 'var(--text-primary)' }}>{i18n.t('psyArcShape_' + shape.shape)}</span>
        </div>
        {shape.example ? <TradeArc i18n={i18n} stages={shape.example.map((s) => ({ label: stageLabel(i18n, s.stage), value: s.value }))} width={220} height={110} /> : <div style={{ height: 78 }} />}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span className="navrya-tabular" style={{ font: 'var(--type-metric-value)', fontSize: 16, color: shape.insufficient ? 'var(--text-disabled)' : tone }}>
            {shape.insufficient ? '—' : Math.round(shape.winRate) + '%'}
          </span>
          <Caption style={{ marginInlineStart: 'auto', fontVariantNumeric: 'tabular-nums' }}>{i18n.t('psyArcShapeSamples', { count: i18n.number(shape.sampleSize) })}</Caption>
        </div>
      </div>
    </Panel>
  );
}

function JourneysTab({ i18n, psych, trades, closed, openJourney, setOpenJourney }) {
  const [filter, setFilter] = React.useState('all');
  const journeys = trades.filter((t) => (t.emotionLog || []).length > 1).slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const filtered = journeys.filter((t) => filter === 'all' || (filter === 'wins' ? t.outcome === 'win' : t.outcome === 'loss'));

  const arcShapes = psych.journeyArcShapes(closed, 3);
  const arcByShape = {};
  arcShapes.forEach((s) => { arcByShape[s.shape] = s; });
  const totalArcSamples = arcShapes.reduce((sum, s) => sum + s.sampleSize, 0);
  const risingShare = totalArcSamples ? Math.round((arcByShape.rising ? arcByShape.rising.sampleSize : 0) / totalArcSamples * 100) : null;

  const withHold = closed.filter((t) => t.createdAt && t.closedAt);
  const avgHoldMinutes = withHold.length
    ? Math.round(withHold.reduce((s, t) => s + (new Date(t.closedAt) - new Date(t.createdAt)) / 60000, 0) / withHold.length)
    : null;
  const peakStresses = journeys.map((t) => {
    const values = (t.emotionLog || []).map((e) => Number(e.stressLevel)).filter((v) => Number.isFinite(v));
    return values.length ? Math.max(...values) : null;
  }).filter((v) => v != null);
  const avgPeakStress = peakStresses.length ? Math.round(peakStresses.reduce((s, v) => s + v, 0) / peakStresses.length * 10) / 10 : null;

  const holdRows = psych.holdTimeByExitTone(closed).sort((a, b) => b.sampleSize - a.sampleSize).slice(0, 6);
  const openPos = psych.openPositionMoods(trades);

  const metrics = [
    { icon: 'strategies', label: i18n.t('psyJourneysMetricCount'), value: i18n.number(journeys.length) },
    { icon: 'psychology', label: i18n.t('psyJourneysMetricPeak'), value: avgPeakStress == null ? '—' : avgPeakStress + ' / 10' },
    { icon: 'clock', label: i18n.t('psyJourneysMetricHold'), value: avgHoldMinutes == null ? '—' : i18n.t('psyHoldMinutes', { value: i18n.number(avgHoldMinutes) }) },
    { icon: 'execution', label: i18n.t('psyJourneysMetricRising'), value: risingShare == null ? '—' : risingShare + '%' }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <MetricRow metrics={metrics} />

      {/* the pattern the arc shape reveals */}
      <Panel variant="base" ornament padding="18px 20px 20px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <SectionLabel>{i18n.t('psyArcShapeTitle')}</SectionLabel>
            <Caption style={{ marginInlineStart: 'auto' }}>{i18n.t('psyArcShapeHint')}</Caption>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {ARC_SHAPE_ORDER.map((shape) => <ArcShapeCard key={shape} i18n={i18n} shape={arcByShape[shape]} />)}
          </div>
          {!arcByShape.falling.insufficient && !arcByShape.rising.insufficient && (
            <Notice tone={arcByShape.falling.winRate >= arcByShape.rising.winRate ? 'accent' : 'warning'} icon="execution">
              {i18n.t('psyArcShapeVerdict', { fallingRate: i18n.number(Math.round(arcByShape.falling.winRate)), risingRate: i18n.number(Math.round(arcByShape.rising.winRate)) })}
            </Notice>
          )}
        </div>
      </Panel>

      {/* journey list */}
      <Panel variant="base" ornament padding="18px 20px 20px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <SectionLabel>{i18n.t('psyJourneysTitle')}</SectionLabel>
            <Chip tone="neutral">{i18n.t('psyJourneysCountChip', { count: journeys.length })}</Chip>
            <div style={{ display: 'flex', gap: 6, marginInlineStart: 'auto' }}>
              {['all', 'wins', 'losses'].map((k) => (
                <button key={k} type="button" onClick={() => setFilter(k)} style={{ padding: 0, border: 0, background: 'transparent', cursor: 'pointer', font: 'inherit' }}>
                  <Chip tone={filter === k ? 'accent' : 'neutral'}>{i18n.t('psyJourneyFilter_' + k)}</Chip>
                </button>
              ))}
            </div>
          </div>
          {filtered.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filtered.map((trade) => (
                <JourneyRow key={trade.id} i18n={i18n} trade={trade} expanded={openJourney === trade.id} onToggle={() => setOpenJourney((v) => (v === trade.id ? null : trade.id))} />
              ))}
            </div>
          ) : <Caption>{i18n.t('psyJourneysEmpty')}</Caption>}
        </div>
      </Panel>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        {/* hold time vs exit emotion */}
        <Panel variant="base" ornament padding="18px 20px 20px" style={{ flex: '1 1 380px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <SectionLabel>{i18n.t('psyHoldTimeTitle')}</SectionLabel>
            {holdRows.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {holdRows.map((r) => {
                  const tone = r.outcome === 'win' ? 'var(--success)' : 'var(--danger)';
                  const pct = Math.min(100, Math.round(r.avgMinutes / 240 * 100));
                  return (
                    <div key={r.outcome + r.emotion} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 999, background: tone, flex: 'none' }}></span>
                        <span style={{ flex: 1, minWidth: 0, font: 'var(--type-body)', fontSize: 12, color: 'var(--text-primary)' }}>
                          {i18n.t('psyHoldRowLabel', { outcome: i18n.t(r.outcome === 'win' ? 'psyOutcomeWin' : 'psyOutcomeLoss'), emotion: i18n.t(r.emotion) })}
                        </span>
                        <span className="navrya-tabular" style={{ font: 'var(--type-body)', fontSize: 12, color: tone }}>{i18n.t('psyHoldMinutes', { value: i18n.number(r.avgMinutes) })}</span>
                      </div>
                      <span style={{ height: 6, borderRadius: 999, background: 'rgba(3,8,7,.65)', display: 'block', overflow: 'hidden', marginInlineStart: 17 }}>
                        <span style={{ display: 'block', height: '100%', borderRadius: 999, background: tone, width: pct + '%' }}></span>
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : <Caption>{i18n.t('psyHoldTimeEmpty')}</Caption>}
          </div>
        </Panel>

        {/* open positions' mood */}
        <Panel variant="base" ornament padding="18px 20px 20px" style={{ flex: '1 1 340px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <SectionLabel>{i18n.t('psyOpenMoodTitle')}</SectionLabel>
            </div>
            {openPos.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {openPos.map((p) => (
                  <div key={p.tradeId} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(11,16,22,.4)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                      {p.instrument && <span style={{ font: 'var(--type-username)', color: 'var(--text-primary)' }}>{p.instrument}</span>}
                      <Chip tone="neutral">{i18n.t(p.direction)}</Chip>
                      {p.stressLevel != null && (
                        <span className="navrya-tabular" style={{ marginInlineStart: 'auto', font: 'var(--type-caption)', color: p.stressLevel >= 7 ? 'var(--danger)' : p.stressLevel >= 5 ? 'var(--warning)' : 'var(--success)' }}>
                          {i18n.t('psyStressChip', { value: i18n.number(p.stressLevel) })}
                        </span>
                      )}
                    </div>
                    {p.dominantEmotions.length > 0 && (
                      <Caption>{p.dominantEmotions.map((e) => i18n.t(e)).join(' · ')}</Caption>
                    )}
                    {p.tags.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {p.tags.map((tag) => <Chip key={tag} tone="neutral" style={{ height: 20, fontSize: 10 }}>{tag}</Chip>)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : <Caption>{i18n.t('psyOpenMoodEmpty')}</Caption>}
          </div>
        </Panel>
      </div>
    </div>
  );
}

// ============================================================================
// Tab 3 - AI insights
//
// Rebuilt on a local, deterministic pattern search (psych.aiInsightCards -
// psychology-store.js) instead of an LLM call: every card and correlation on this tab is a
// reducer over real trade/check-in/routine rows, symmetrically sample-gated, never generated
// prose with invented numbers. See that function's own header comment for the full rationale.
// ============================================================================
const INSIGHT_MIN_SAMPLES = 8;

function pnlFmt(i18n, v) { return (v >= 0 ? '+' : '') + i18n.money(v); }
function confidenceOf(sampleA, sampleB) {
  return Math.min(0.95, 0.4 + Math.min(sampleA, sampleB) / 40);
}
function confidenceTone(c) { return c >= 0.7 ? 'success' : c >= 0.4 ? 'accent' : 'neutral'; }
function confidenceLabel(i18n, c) { return i18n.t(c >= 0.7 ? 'psyConfidenceHigh' : c >= 0.4 ? 'psyConfidenceMedium' : 'psyConfidenceLow'); }

function insightCardCopy(i18n, card) {
  if (card.kind === 'hourWindow') {
    return {
      title: i18n.t('psyInsightHourTitle', { start: i18n.number(card.startHour), end: i18n.number(card.endHour) }),
      body: i18n.t('psyInsightHourBody', { winRate: i18n.number(Math.round(card.winRate)), restWinRate: i18n.number(Math.round(card.restWinRate)) }),
      evidence: [i18n.t('psyInsightHourEvidence', { count: i18n.number(card.sampleSize), start: i18n.number(card.startHour), end: i18n.number(card.endHour) })],
      action: i18n.t('psyInsightHourAction'),
      recommendation: i18n.t('psyInsightHourAction')
    };
  }
  if (card.kind === 'symbolStress') {
    return {
      title: i18n.t('psyInsightSymbolTitle', { instrument: card.instrument }),
      body: i18n.t('psyInsightSymbolBody', { avgStress: card.avgStress.toFixed(1), restAvgStress: card.restAvgStress.toFixed(1) }),
      evidence: [i18n.t('psyInsightSymbolEvidence', { count: i18n.number(card.sampleSize), instrument: card.instrument })],
      action: i18n.t('psyInsightSymbolAction', { instrument: card.instrument }),
      recommendation: i18n.t('psyInsightSymbolAction', { instrument: card.instrument })
    };
  }
  return { title: '', body: '', evidence: [], action: '', recommendation: '' };
}

function InsightsTab({ i18n, psych, trades, closed, checkins, routineDays, mhStore, profile, dismissedKinds, onDismiss, onAddAsTrigger }) {
  const { cards, correlations, minSamples } = psych.aiInsightCards(trades, checkins, routineDays, INSIGHT_MIN_SAMPLES);
  const headline = cards.find((c) => c.kind === 'emotionSpread');
  const secondaryCards = cards.filter((c) => c.kind !== 'emotionSpread' && !dismissedKinds.has(c.kind));
  const maxAbsSpread = headline ? Math.max(...headline.spread.map((s) => Math.abs(s.avgPnl)), 1) : 1;
  const headlineConfidence = headline ? confidenceOf(headline.best.sampleSize, headline.worst.sampleSize) : 0;
  const perTradeDiff = headline ? headline.best.avgPnl - headline.worst.avgPnl : 0;
  const totalTrades = headline ? headline.best.sampleSize + headline.worst.sampleSize : 0;

  const CORR_META = {
    sleepNextDay: (c) => ({
      title: i18n.t('psyCorrSleepTitle'),
      aLabel: i18n.t('psyCorrSleepLow'), aValue: i18n.number(Math.round(c.lowWinRate)) + '%', aGood: c.lowWinRate >= c.highWinRate,
      bLabel: i18n.t('psyCorrSleepHigh'), bValue: i18n.number(Math.round(c.highWinRate)) + '%', bGood: c.highWinRate >= c.lowWinRate,
      n: i18n.t('psyCorrTradesCount', { count: i18n.number(c.lowSampleSize + c.highSampleSize) })
    }),
    proveToday: (c) => ({
      title: i18n.t('psyCorrProveTitle'),
      aLabel: i18n.t('psyCorrProveYes'), aValue: pnlFmt(i18n, c.yesAvgPnl), aGood: c.yesAvgPnl >= c.noAvgPnl,
      bLabel: i18n.t('psyCorrProveNo'), bValue: pnlFmt(i18n, c.noAvgPnl), bGood: c.noAvgPnl >= c.yesAvgPnl,
      n: i18n.t('psyCorrTradesCount', { count: i18n.number(c.yesSampleSize + c.noSampleSize) })
    }),
    personalEvent: (c) => ({
      title: i18n.t('psyCorrEventTitle'),
      aLabel: i18n.t('psyCorrEventWith'), aValue: c.withAvgCommitment.toFixed(1) + ' / 10', aGood: c.withAvgCommitment >= c.withoutAvgCommitment,
      bLabel: i18n.t('psyCorrEventWithout'), bValue: c.withoutAvgCommitment.toFixed(1) + ' / 10', bGood: c.withoutAvgCommitment >= c.withAvgCommitment,
      n: i18n.t('psyCorrTradesCount', { count: i18n.number(c.withSampleSize + c.withoutSampleSize) })
    }),
    routineCompletion: (c) => ({
      title: i18n.t('psyCorrRoutineTitle'),
      aLabel: i18n.t('psyCorrRoutineFull'), aValue: c.fullAvgStress.toFixed(1) + ' / 10', aGood: c.fullAvgStress <= c.partialAvgStress,
      bLabel: i18n.t('psyCorrRoutinePartial'), bValue: c.partialAvgStress.toFixed(1) + ' / 10', bGood: c.partialAvgStress <= c.fullAvgStress,
      n: i18n.t('psyCorrTradesCount', { count: i18n.number(c.fullSampleSize + c.partialSampleSize) })
    })
  };

  function addAsTrigger(title, recommendation) { onAddAsTrigger({ title, recommendation }); }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Notice tone="warning" icon="honour">
        {i18n.t('psyInsightsSampleNotice', { count: i18n.number(minSamples) })}
      </Notice>

      {!headline && !secondaryCards.length && !correlations.length && (
        <Panel variant="base" ornament padding="18px 20px"><Caption>{i18n.t('psyInsightsNoPatternsYet', { count: i18n.number(minSamples) })}</Caption></Panel>
      )}

      {headline && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <Panel variant="prestige" ornament padding="18px 20px 20px" style={{ flex: '1 1 520px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <SectionLabel>{i18n.t('psyInsightsHeadlineLabel')}</SectionLabel>
                <Chip tone={confidenceTone(headlineConfidence)}>{confidenceLabel(i18n, headlineConfidence)}</Chip>
                <Caption style={{ marginInlineStart: 'auto' }}>{i18n.t('psyInsightsHeadlineSample', { count: i18n.number(closed.length) })}</Caption>
              </div>
              <span style={{ font: 'var(--type-display-md)', color: 'var(--text-primary)', textWrap: 'pretty' }}>
                {i18n.t('psyInsightsHeadlineBody', {
                  bestEmotion: i18n.t(headline.best.emotion), bestValue: pnlFmt(i18n, headline.best.avgPnl),
                  worstEmotion: i18n.t(headline.worst.emotion), worstValue: pnlFmt(i18n, headline.worst.avgPnl)
                })}
              </span>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 110 }}>
                {headline.spread.map((s) => (
                  <div key={s.emotion} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, justifyContent: 'flex-end', height: '100%' }}>
                    <span className="navrya-tabular" style={{ font: 'var(--type-caption)', fontSize: 11, color: s.avgPnl >= 0 ? 'var(--success)' : 'var(--danger)' }}>{pnlFmt(i18n, s.avgPnl)}</span>
                    <span style={{
                      width: '100%', borderRadius: '4px 4px 2px 2px', display: 'block',
                      height: Math.max(8, Math.round((Math.abs(s.avgPnl) / maxAbsSpread) * 78)),
                      background: s.avgPnl >= 0 ? 'linear-gradient(180deg,var(--char-accent),rgba(102,201,78,.3))' : 'linear-gradient(180deg,var(--danger),rgba(255,56,48,.3))'
                    }}></span>
                    <Caption>{i18n.t(s.emotion)}</Caption>
                  </div>
                ))}
              </div>
              <div style={{ height: 1, background: 'var(--border-hairline)' }}></div>
              <Caption>{i18n.t('psyInsightsHeadlineDiff', { perTrade: i18n.money(Math.abs(perTradeDiff)), total: i18n.money(Math.abs(perTradeDiff) * totalTrades), count: i18n.number(totalTrades) })}</Caption>
            </div>
          </Panel>

          <Panel variant="base" ornament padding="18px 20px 20px" style={{ flex: '1 1 260px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <SectionLabel>{i18n.t('psyInsightsConfidenceLegendTitle')}</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  ['success', 'psyConfidenceHigh', 'psyConfidenceHighHint'],
                  ['accent', 'psyConfidenceMedium', 'psyConfidenceMediumHint'],
                  ['neutral', 'psyConfidenceLow', 'psyConfidenceLowHint']
                ].map(([tone, label, hint]) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(11,16,22,.4)' }}>
                    <Chip tone={tone} style={{ flex: 'none' }}>{i18n.t(label)}</Chip>
                    <Caption style={{ flex: 1 }}>{i18n.t(hint)}</Caption>
                  </div>
                ))}
              </div>
              <div style={{ height: 1, background: 'var(--border-hairline)' }}></div>
              <Caption>{i18n.t('psyInsightsLegendNote')}</Caption>
            </div>
          </Panel>
        </div>
      )}

      {secondaryCards.map((card) => {
        const copy = insightCardCopy(i18n, card);
        const c = confidenceOf(card.sampleSize, card.restSampleSize || card.sampleSize);
        return (
          <Panel key={card.kind} variant="base" ornament padding="18px 20px 20px">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ width: 34, height: 34, flex: 'none', borderRadius: 8, border: '1px solid var(--border-gold)', background: 'var(--char-active-surface)', display: 'grid', placeItems: 'center', color: 'var(--char-accent)' }}>
                  <Icon name="sparkle" size={18} />
                </span>
                <span style={{ flex: '1 1 260px', minWidth: 0, font: 'var(--type-display-md)', color: 'var(--text-primary)', textWrap: 'pretty' }}>{copy.title}</span>
                <Chip tone={confidenceTone(c)} style={{ flex: 'none' }}>{confidenceLabel(i18n, c)}</Chip>
                <Chip tone="neutral" style={{ flex: 'none' }}>{i18n.t('psyInsightSampleChip', { count: i18n.number(card.sampleSize) })}</Chip>
              </div>
              <p style={{ margin: 0, font: 'var(--type-body)', color: 'var(--text-muted)', textWrap: 'pretty' }}>{copy.body}</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {copy.evidence.map((e) => <Chip key={e} tone="neutral">{e}</Chip>)}
              </div>
              <div style={{ height: 1, background: 'var(--border-hairline)' }}></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <Caption style={{ flex: 1 }}>{copy.action}</Caption>
                <Button variant="ghost" size="sm" onClick={() => onDismiss(card.kind)}>{i18n.t('psyDismiss')}</Button>
                <Button variant="secondary" size="sm" icon="plus" onClick={() => addAsTrigger(copy.title, copy.recommendation)}>{i18n.t('psyAddAsTrigger')}</Button>
              </div>
            </div>
          </Panel>
        );
      })}

      {correlations.length > 0 && (
        <Panel variant="base" ornament padding="18px 20px 20px">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <SectionLabel>{i18n.t('psyInsightsCorrelationsTitle')}</SectionLabel>
              <Caption style={{ marginInlineStart: 'auto' }}>{i18n.t('psyInsightsCorrelationsHint')}</Caption>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
              {correlations.map((corr) => {
                const meta = CORR_META[corr.kind](corr);
                return (
                  <div key={corr.kind} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px', borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(11,16,22,.4)' }}>
                    <span style={{ font: 'var(--type-body)', color: 'var(--text-primary)' }}>{meta.title}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                        <Caption>{meta.aLabel}</Caption>
                        <span className="navrya-tabular" style={{ font: 'var(--type-metric-value)', fontSize: 18, color: meta.aGood ? 'var(--success)' : 'var(--danger)' }}>{meta.aValue}</span>
                      </span>
                      <span style={{ width: 1, height: 34, background: 'var(--border-hairline)', flex: 'none' }}></span>
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                        <Caption>{meta.bLabel}</Caption>
                        <span className="navrya-tabular" style={{ font: 'var(--type-metric-value)', fontSize: 18, color: meta.bGood ? 'var(--success)' : 'var(--danger)' }}>{meta.bValue}</span>
                      </span>
                      <Caption style={{ flex: 'none', fontVariantNumeric: 'tabular-nums' }}>{meta.n}</Caption>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}

// ============================================================================
// Tab 4 - Protective
// ============================================================================
// The design's guard wall shows six cards; only two exist as real, enforced behavior anywhere in
// this app today (breathing prompt, post-trade cooldown - both wired into logEmotionModal.jsx /
// postTradeReflectionModal.jsx / tradeLogModal.jsx). The other four ("halve risk after two
// losses", "lock the stop-loss", "daily trade cap", "note to tomorrow-self") have no real
// enforcement anywhere in the codebase - no risk-calculator hook, no stop-loss-change audit, no
// per-day cap setting, no scheduled-message system. Rather than wire a toggle that visually
// looks live but silently does nothing, they render exactly like this screen's own original
// brief asked for new, not-yet-built ideas to be shown: locked, with a "coming soon" chip.
const PROTECTIVE_COMING_SOON = ['halve', 'lock', 'cap', 'note'];
const PROTECTIVE_COMING_SOON_ICON = { halve: 'minus', lock: 'lock', cap: 'flag', note: 'mail' };

function ProtectiveTab({ i18n, psych, mhStore, profile, trades, closed, savedAt, onSaved }) {
  const settings = psych.settings();
  const tilt = psych.tiltReading(trades);
  const [calmOpen, setCalmOpen] = React.useState(false);
  const [breathPreviewOpen, setBreathPreviewOpen] = React.useState(false);

  const realGuards = [
    {
      id: 'breath', icon: 'psychology', title: i18n.t('psyBreathingTitle'), body: i18n.t('psyBreathingBody'),
      fieldLabel: i18n.t('psyStressThresholdLabel'), value: String(settings.breathing.stressThreshold),
      hint: i18n.t('psyBreathingHintValue', { value: settings.breathing.stressThreshold }),
      on: settings.breathing.enabled,
      onToggle: () => psych.saveSettings({ breathing: { ...settings.breathing, enabled: !settings.breathing.enabled } }),
      onChange: (v) => psych.saveSettings({ breathing: { ...settings.breathing, stressThreshold: Number(String(v).replace(/[^0-9]/g, '')) || 0 } })
    },
    {
      id: 'cooldown', icon: 'clock', title: i18n.t('psyPostTradeReflectionTitle'), body: i18n.t('psyPostTradeReflectionBody'),
      fieldLabel: i18n.t('psyCooldownMinutes'), value: String(settings.postTradeReflection.cooldownMinutes),
      hint: i18n.t('psyCooldownHintValue', { value: settings.postTradeReflection.cooldownMinutes }),
      on: settings.postTradeReflection.enabled,
      onToggle: () => psych.saveSettings({ postTradeReflection: { ...settings.postTradeReflection, enabled: !settings.postTradeReflection.enabled } }),
      onChange: (v) => psych.saveSettings({ postTradeReflection: { ...settings.postTradeReflection, cooldownMinutes: Number(String(v).replace(/[^0-9]/g, '')) || 0 } })
    }
  ];
  const activeGuardCount = realGuards.filter((g) => g.on).length;

  const today = new Date();
  const tradesToday = trades.filter((t) => t.createdAt && new Date(t.createdAt).toDateString() === today.toDateString()).length;

  const triggers = profile.triggerProfile.triggers || [];
  const cooldownMinutes = settings.postTradeReflection.cooldownMinutes;
  const history = psych.cooldownHistory(trades, profile.continuousTracking.postTradeReflections || [], cooldownMinutes);
  const historySummary = psych.cooldownHistorySummary(history);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Live tilt state - the same real reading and gauge OverviewTab already draws */}
      <Panel variant={tilt.level === 'calm' ? 'base' : 'active'} ornament padding="18px 20px 20px">
        <div style={{ display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
          <div style={{ width: 200, flex: 'none' }}>
            <TiltMeter i18n={i18n} reading={tilt} />
          </div>
          <div style={{ flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <SectionLabel>{i18n.t('psyTiltTitle')}</SectionLabel>
              <Chip tone={activeGuardCount ? 'accent' : 'success'}>{i18n.t(activeGuardCount ? 'psyGuardsSomeActive' : 'psyGuardsNoneActive', { count: i18n.number(activeGuardCount) })}</Chip>
            </div>
            <span style={{ font: 'var(--type-display-md)', color: 'var(--text-primary)' }}>{i18n.t('psyTiltState_' + tilt.level)}</span>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {[
                [i18n.t('psyTiltSinceLoss'), tilt.minutesSinceLoss == null ? '—' : i18n.t('psyTiltMinutes', { count: i18n.number(tilt.minutesSinceLoss) })],
                [i18n.t('psyTiltLossStreak'), i18n.number(tilt.lossStreak)],
                [i18n.t('psyTiltOpen'), i18n.number(tilt.openCount)],
                [i18n.t('psyGuardsTradesToday'), i18n.number(tradesToday)]
              ].map(([label, value]) => (
                <span key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Caption>{label}</Caption>
                  <span className="navrya-tabular" style={{ font: 'var(--type-body)', fontSize: 17, color: 'var(--text-primary)' }}>{value}</span>
                </span>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, flex: 'none', width: 180 }}>
            <Button variant="secondary" icon="honour" fullWidth onClick={() => setCalmOpen(true)}>{i18n.t('psyOpenCalmRoom')}</Button>
            <Button variant="ghost" fullWidth onClick={() => setBreathPreviewOpen((v) => !v)}>{i18n.t(breathPreviewOpen ? 'psyHideBreathPreview' : 'psyPreviewBreath')}</Button>
          </div>
        </div>
        {breathPreviewOpen && (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 18, marginTop: 18, borderTop: '1px solid var(--border-hairline)' }}>
            <BreathPreview size={110} label={i18n.t('psyBreathInLabel')} />
          </div>
        )}
      </Panel>

      {/* The guards themselves - real toggles first, then the honestly-labelled coming-soon ones */}
      <Panel variant="base" ornament padding="18px 20px 20px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <SectionLabel>{i18n.t('psyGuardsTitle')}</SectionLabel>
            <Chip tone="accent">{i18n.t('psyGuardsActiveChip', { count: i18n.number(activeGuardCount) })}</Chip>
            <Caption style={{ marginInlineStart: 'auto' }}>{i18n.t('psyGuardsAutoSaveNote')}</Caption>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {realGuards.map((g) => (
              <div key={g.id} style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, borderRadius: 8, border: '1px solid ' + (g.on ? 'rgba(102,201,78,.4)' : 'var(--border-hairline)'), background: g.on ? 'rgba(18,51,27,.32)' : 'rgba(11,16,22,.4)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <span style={{ width: 36, height: 36, flex: 'none', borderRadius: 8, border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.5)', display: 'grid', placeItems: 'center', color: 'var(--char-accent)' }}>
                    <Icon name={g.icon} size={18} />
                  </span>
                  <div style={{ flex: '1 1 220px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ font: 'var(--type-body)', color: 'var(--text-primary)' }}>{g.title}</span>
                    <Caption style={{ fontSize: 12, lineHeight: '18px' }}>{g.body}</Caption>
                  </div>
                  <BigToggle checked={g.on} onChange={g.onToggle} ariaLabel={g.title} />
                </div>
                {g.on && (
                  <div style={{ paddingTop: 12, borderTop: '1px solid var(--border-hairline)', width: 220 }}>
                    <TextField label={g.fieldLabel} value={g.value} onChange={g.onChange} hint={g.hint} />
                  </div>
                )}
              </div>
            ))}
            {PROTECTIVE_COMING_SOON.map((id) => (
              <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16, borderRadius: 8, border: '1px dashed rgba(214,175,107,.42)', background: 'rgba(183,138,74,.05)' }}>
                <span style={{ width: 36, height: 36, flex: 'none', borderRadius: 8, border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.5)', display: 'grid', placeItems: 'center', color: 'var(--text-disabled)' }}>
                  <Icon name={PROTECTIVE_COMING_SOON_ICON[id]} size={18} />
                </span>
                <div style={{ flex: '1 1 220px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span style={{ font: 'var(--type-body)', color: 'var(--text-primary)' }}>{i18n.t('psyGuard_' + id + '_title')}</span>
                    <Chip tone="gold">{i18n.t('psyComingSoon')}</Chip>
                  </div>
                  <Caption style={{ fontSize: 12, lineHeight: '18px' }}>{i18n.t('psyGuard_' + id + '_body')}</Caption>
                </div>
                <span style={{ width: 46, height: 26, flex: 'none', borderRadius: 999, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.7)', display: 'flex', alignItems: 'center', padding: 2, boxSizing: 'border-box', opacity: 0.5 }}>
                  <span style={{ width: 20, height: 20, borderRadius: 999, background: 'var(--text-disabled)', display: 'block' }}></span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </Panel>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        {/* Trigger radar - the real, user-authored triggerProfile.triggers, never a fabricated fire count */}
        <Panel variant="base" ornament padding="18px 20px 20px" style={{ flex: '1 1 420px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <SectionLabel>{i18n.t('psyTriggerRadarTitle')}</SectionLabel>
              <Caption style={{ marginInlineStart: 'auto' }}>{i18n.t('psyTriggerRadarCount', { count: i18n.number(triggers.length) })}</Caption>
            </div>
            {triggers.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {triggers.map((t) => (
                  <div key={t.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '13px 15px', borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(11,16,22,.4)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <span style={{ flex: 1, minWidth: 0, font: 'var(--type-body)', fontSize: 12, color: 'var(--text-primary)' }}>{t.description}</span>
                      <Chip tone="neutral" style={{ flex: 'none' }}>{i18n.t('psyTriggerType_' + t.triggerType)}</Chip>
                    </div>
                    {t.recommendedAction && <Caption>{t.recommendedAction}</Caption>}
                    <Caption style={{ fontVariantNumeric: 'tabular-nums' }}>{i18n.t('psyTriggerAddedAt', { value: i18n.date(t.lastTriggeredAt, { dateStyle: 'medium' }) })}</Caption>
                  </div>
                ))}
              </div>
            ) : <Caption>{i18n.t('psyTriggerRadarEmpty')}</Caption>}
          </div>
        </Panel>

        {/* Calm room preview - the real component, opened in place */}
        <Panel variant="base" ornament padding="18px 20px 20px" style={{ flex: '1 1 300px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
              <SectionLabel>{i18n.t('psyCalmRoomTitle')}</SectionLabel>
              <Chip tone="accent" style={{ marginInlineStart: 'auto' }}>{i18n.t('psyCalmRoomPattern')}</Chip>
            </div>
            <BreathPreview size={170} label={i18n.t('psyBreathInLabel')} />
            <Caption style={{ textAlign: 'center', lineHeight: '18px' }}>{i18n.t('psyCalmRoomHint')}</Caption>
            <Button variant="primary" icon="honour" fullWidth onClick={() => setCalmOpen(true)}>{i18n.t('psyOpenCalmRoom')}</Button>
          </div>
        </Panel>
      </div>

      {/* What fired lately - real cooldown-guard history, objectively read from trade timestamps */}
      <Panel variant="base" ornament padding="18px 20px 20px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <SectionLabel>{i18n.t('psyGuardHistoryTitle')}</SectionLabel>
            <Caption style={{ marginInlineStart: 'auto' }}>{i18n.t('psyGuardHistoryHint')}</Caption>
          </div>
          {history.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {history.slice(0, 8).map((row) => (
                <div key={row.tradeId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(11,16,22,.4)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: row.held ? 'var(--success)' : 'var(--danger)', flex: 'none' }}></span>
                  <span style={{ width: 160, flex: 'none', font: 'var(--type-body)', fontSize: 12, color: 'var(--text-primary)' }}>{i18n.t('psyGuard_cooldown_title')}</span>
                  <Caption style={{ flex: 1, minWidth: 0 }}>{row.instrument ? i18n.t('psyGuardHistoryWhat', { instrument: row.instrument }) : ''}</Caption>
                  <Chip tone={row.held ? 'success' : 'danger'} style={{ flex: 'none' }}>{i18n.t(row.held ? 'psyGuardHeld' : 'psyGuardBroke')}</Chip>
                  <Caption style={{ flex: 'none', width: 96, textAlign: 'end', fontVariantNumeric: 'tabular-nums' }}>{i18n.date(row.startedAt, { dateStyle: 'short', timeStyle: 'short' })}</Caption>
                </div>
              ))}
            </div>
          ) : <Caption>{i18n.t('psyGuardHistoryEmpty')}</Caption>}
          {historySummary.total > 0 && (
            <Notice tone="accent" icon="check">
              {i18n.t('psyGuardHistorySummary', { total: i18n.number(historySummary.total), held: i18n.number(historySummary.held) })}
            </Notice>
          )}
        </div>
      </Panel>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '0 2px', flexWrap: 'wrap' }}>
        <Caption style={{ flex: 1 }}>{savedAt ? i18n.t('psyGuardsSavedNote', { value: savedAt }) : i18n.t('psyGuardsNeverSaved')}</Caption>
        <Button variant="primary" icon="check" onClick={onSaved}>{i18n.t('psySaveProtective')}</Button>
      </div>

      {calmOpen && <CalmRoom i18n={i18n} psych={psych} profile={profile} trades={trades} reason={i18n.t('psyCalmRoomManualReason')} onClose={() => setCalmOpen(false)} />}
    </div>
  );
}

// ============================================================================
// Tab 5 - My file
// ============================================================================
// The four transparency questions are the only intake answers that arm a red flag directly:
// mental-health-collector.js's detectRedFlags() raises `hiding_losses` the moment
// lossKnownToFamily is false. That is worth saying on the cell itself - a question whose stakes
// are invisible gets answered carelessly or not at all.
const TRANSPARENCY = [
  { key: 'profitKnownToFamily', label: 'mhProfitKnown', arms: false },
  { key: 'lossKnownToFamily', label: 'mhLossKnown', arms: true },
  { key: 'capitalKnownToFamily', label: 'mhCapitalKnown', arms: false },
  { key: 'tradingActivityKnownToFamily', label: 'mhActivityKnown', arms: false }
];

function IntakeSection({ i18n, mi, profile, onOpenIntake }) {
  const intake = profile.intake;
  const matrix = intake.transparencyMatrix || {};

  const rows = [
    [mi.t('mhAge'), intake.demographics.age],
    [mi.t('mhCapitalType'), intake.financialContext.capitalType ? mi.t('mhCapitalType_' + intake.financialContext.capitalType) : null],
    [mi.t('mhYearsTrading'), intake.tradingHistory.yearsTrading],
    [mi.t('mhMotivationQuestion'), intake.motivationForTrading ? mi.t('mhMotivation_' + intake.motivationForTrading) : null],
    [mi.t('mhCapitalAllocation'), intake.financialContext.capitalAllocationPercent != null ? intake.financialContext.capitalAllocationPercent + '%' : null],
    [mi.t('mhBorrowedMoney'), intake.financialContext.borrowedMoneyForTrading == null ? null : (intake.financialContext.borrowedMoneyForTrading ? mi.t('mhYes') : mi.t('mhNo'))]
  ];

  // Progress counts the real intake paths the types file declares, so it cannot drift out of step
  // with the questionnaire itself the way a hardcoded total would.
  const paths = (window.TradeJournalMentalHealthTypes && window.TradeJournalMentalHealthTypes.intakePaths) || [];
  const store = window.TradeJournalMentalHealthStore;
  const answered = store ? paths.filter((path) => {
    const value = store.getPath(profile, path);
    return value !== null && value !== undefined && value !== '' && !(Array.isArray(value) && !value.length);
  }).length : 0;
  const pct = paths.length ? Math.round(answered / paths.length * 100) : 0;

  const hidden = TRANSPARENCY.filter((c) => matrix[c.key] === false).length;
  const unanswered = TRANSPARENCY.filter((c) => matrix[c.key] == null).length;
  const armsFlag = matrix.lossKnownToFamily === false;
  const via = intake.filledVia || 'form';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Panel variant="base" ornament padding="18px 20px 20px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <SectionLabel>{mi.t('mhTabIntake')}</SectionLabel>
            <Chip tone={intake.completed ? 'success' : 'neutral'} dot>{i18n.t(intake.completed ? 'psyIntakeComplete' : 'psyIntakeIncomplete')}</Chip>
            <Chip tone="neutral">{i18n.t('psyIntakeVia_' + via)}</Chip>
            <span className="navrya-tabular" style={{ marginInlineStart: 'auto', font: 'var(--type-caption)', color: 'var(--text-dim)' }}>
              {i18n.t('psyIntakeProgress', { done: i18n.number(answered), total: i18n.number(paths.length) })}
            </span>
            <Button variant="secondary" size="sm" icon="edit" onClick={onOpenIntake}>{i18n.t(intake.completed ? 'psyEditIntake' : 'psyStartIntake')}</Button>
          </div>

          <div style={{ height: 8, borderRadius: 999, background: 'rgba(3,8,7,.65)', border: '1px solid var(--border-hairline)', overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 999, width: pct + '%', background: 'linear-gradient(90deg,color-mix(in srgb, var(--char-accent) 55%, transparent),var(--char-accent))', transition: 'width var(--dur-progress) var(--ease-out)' }}></div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {rows.map(([label, value]) => (
              <div key={label} style={{ border: '1px solid var(--border-hairline)', borderRadius: 8, background: 'rgba(11,20,21,.55)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ font: 'var(--type-caption)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-muted)', textTransform: 'uppercase', textWrap: 'pretty' }}>{label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ flex: 1, font: 'var(--type-username)', color: 'var(--text-primary)', textWrap: 'pretty' }}>{value == null || value === '' ? '—' : String(value)}</span>
                  <Button variant="ghost" size="sm" icon="edit" aria-label={i18n.t('psyEditIntake')} onClick={onOpenIntake}></Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Panel>

      <Panel variant="base" ornament padding="18px 20px 20px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <SectionLabel>{i18n.t('psyTransparencyTitle')}</SectionLabel>
            {armsFlag && <Chip tone="danger" dot>{i18n.t('psyTransparencyArmed')}</Chip>}
            <Caption style={{ marginInlineStart: 'auto' }}>{mi.t('mhTransparencyHint')}</Caption>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
            {TRANSPARENCY.map((cell) => {
              const value = matrix[cell.key];
              const known = value === true, hiddenCell = value === false;
              const tone = known ? 'var(--success)' : hiddenCell ? 'var(--warning)' : 'var(--text-disabled)';
              return (
                <button
                  key={cell.key} type="button" onClick={onOpenIntake}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 10, padding: 14, minHeight: 104, boxSizing: 'border-box',
                    borderRadius: 8, cursor: 'pointer', textAlign: 'start', font: 'inherit',
                    border: '1px solid ' + (hiddenCell && cell.arms ? 'rgba(255,56,48,.4)' : hiddenCell ? 'rgba(255,176,32,.32)' : known ? 'color-mix(in srgb, var(--success) 35%, transparent)' : 'var(--border-hairline)'),
                    background: hiddenCell && cell.arms ? 'rgba(255,56,48,.05)' : hiddenCell ? 'rgba(255,176,32,.05)' : known ? 'rgba(46,204,113,.05)' : 'rgba(11,16,22,.4)'
                  }}
                >
                  <span style={{ flex: 1, font: 'var(--type-body)', fontSize: 12, color: 'var(--text-primary)', textWrap: 'pretty' }}>{mi.t(cell.label)}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{
                      width: 16, height: 16, flex: 'none', borderRadius: 4, display: 'grid', placeItems: 'center',
                      border: '1px solid ' + (known ? 'var(--success)' : 'rgba(244,234,215,.2)'),
                      background: known ? 'var(--success)' : 'transparent', color: 'var(--ink-950)'
                    }}>{known && <Icon name="check" size={11} />}</span>
                    <Caption style={{ color: tone }}>{value == null ? i18n.t('psyTransparencyUnanswered') : mi.t(known ? 'mhYes' : 'mhNo')}</Caption>
                    {cell.arms && hiddenCell && <Chip tone="danger" style={{ height: 20, fontSize: 10 }}>{i18n.t('psyTransparencyArmsFlag')}</Chip>}
                  </span>
                </button>
              );
            })}
          </div>

          <Notice tone={armsFlag ? 'danger' : hidden ? 'warning' : 'accent'} icon="honour">
            {armsFlag
              ? i18n.t('psyTransparencyNoteArmed')
              : unanswered === TRANSPARENCY.length
                ? i18n.t('psyTransparencyNoteEmpty')
                : hidden
                  ? i18n.t('psyTransparencyNoteHidden', { count: i18n.number(hidden) })
                  : i18n.t('psyTransparencyNoteOpen')}
          </Notice>
        </div>
      </Panel>
    </div>
  );
}

function PsychSection({ i18n, mi, profile, onOpenChecklist }) {
  const responses = profile.psychologicalProfile.scenarioAssessment.responses;
  const scenarioIds = (window.TradeJournalMentalHealthTypes && window.TradeJournalMentalHealthTypes.scenarioIds) || Object.keys(SCENARIO_CONSTRUCTS);
  const biases = profile.psychologicalProfile.biasChecklist.biases.slice().sort((a, b) => {
    const av = a.computedIndicatorScore != null ? a.computedIndicatorScore * 10 : a.selfRating * 20;
    const bv = b.computedIndicatorScore != null ? b.computedIndicatorScore * 10 : b.selfRating * 20;
    return bv - av;
  });
  const tests = [['bigFive', mi.t('mhTestBigFive')], ['riskToleranceScale', mi.t('mhTestRiskTolerance')], ['bis11Impulsivity', mi.t('mhTestBis11')], ['sogsGamblingScreen', mi.t('mhTestSogs')]];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Panel variant="base" ornament padding="18px 20px 20px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <SectionLabel>{mi.t('mhScenarioAssessmentTitle')}</SectionLabel>
            <Chip tone="neutral">{i18n.t('psyScenarioChip', { count: responses.length, total: scenarioIds.length })}</Chip>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {scenarioIds.map((id) => {
              const r = responses.find((x) => x.scenarioId === id);
              const construct = r ? r.measuresConstruct : SCENARIO_CONSTRUCTS[id];
              const answer = r ? (r.choice ? mi.t('mhScenarioChoice_' + id + '_' + r.choice) : (r.freeText || '—')) : i18n.t('psyScenarioNotAnswered');
              const intensity = r && r.sliderValue != null ? r.sliderValue : null;
              return (
                <div key={id} style={{ border: '1px solid var(--border-hairline)', borderRadius: 8, background: 'rgba(11,20,21,.55)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 260px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ font: 'var(--type-username)', color: 'var(--text-primary)' }}>{mi.t('mhScenario_' + id + '_title')}</span>
                      <span style={{ font: 'var(--type-caption)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-dim)', textTransform: 'uppercase' }}>{mi.t('mhMeasures') + ': ' + mi.t('mhConstruct_' + construct)}</span>
                    </div>
                    <span style={{ font: 'var(--type-body)', color: 'var(--text-muted)', textWrap: 'pretty' }}>{answer}</span>
                  </div>
                  <div style={{ width: 180, flex: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ font: 'var(--type-caption)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{mi.t('mhScenarioIntensity')}</span>
                      <span className="navrya-tabular" style={{ marginInlineStart: 'auto', font: 'var(--type-caption)', color: 'var(--char-accent)' }}>{intensity != null ? intensity + '/10' : '—'}</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 999, background: 'rgba(3,8,7,.65)', border: '1px solid var(--border-hairline)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 999, background: 'var(--char-accent)', transition: 'width var(--dur-progress) var(--ease-out)', width: (intensity != null ? intensity * 10 : 0) + '%' }}></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <Button variant="secondary" icon="check" fullWidth onClick={onOpenChecklist}>{i18n.t(profile.psychologicalProfile.biasChecklist.lastAssessedAt ? 'psyRedoMonthlyChecklist' : 'psyStartMonthlyChecklist')}</Button>
        </div>
      </Panel>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <Panel variant="base" ornament padding="18px 20px 20px" style={{ flex: '1 1 420px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <SectionLabel>{i18n.t('psyBiasMeterTitle')}</SectionLabel>
              <Caption style={{ marginInlineStart: 'auto' }}>{i18n.t('psyBiasGapHint')}</Caption>
            </div>
            {biases.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {biases.map((b) => {
                  // Two separate readings, kept separate. Collapsing them into one bar - which is
                  // what this meter used to do, falling back to selfRating when no computed score
                  // existed - hid the only thing worth looking at: where the trader's own estimate
                  // and their trade history disagree. A bias they under-rate is where the work is.
                  const self = b.selfRating != null ? Math.round(b.selfRating * 20) : null;
                  const data = b.computedIndicatorScore != null ? Math.round(b.computedIndicatorScore * 10) : null;
                  const gap = self != null && data != null ? data - self : null;
                  const verdict = gap == null ? null : gap > 15 ? 'under' : gap < -15 ? 'over' : 'close';
                  const tone = verdict === 'under' ? 'var(--danger)' : verdict === 'over' ? 'var(--char-accent)' : 'var(--success)';
                  const lo = Math.min(self == null ? 0 : self, data == null ? 0 : data);
                  const hi = Math.max(self == null ? 0 : self, data == null ? 0 : data);
                  return (
                    <div key={b.type} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ flex: 1, minWidth: 140, font: 'var(--type-body)', color: 'var(--text-primary)' }}>{mi.t('mhBias_' + b.type)}</span>
                        {verdict && <Chip tone={verdict === 'under' ? 'danger' : verdict === 'over' ? 'accent' : 'success'} style={{ flex: 'none' }}>{i18n.t('psyBiasGap_' + verdict)}</Chip>}
                      </div>
                      <div style={{ position: 'relative', height: 22 }}>
                        <span style={{ position: 'absolute', insetInline: 0, top: 10, height: 2, background: 'rgba(244,234,215,.08)', display: 'block' }}></span>
                        {self != null && data != null && (
                          <span style={{ position: 'absolute', top: 10, height: 2, background: tone, insetInlineStart: lo + '%', width: (hi - lo) + '%', display: 'block' }}></span>
                        )}
                        {self != null && (
                          <span title={i18n.t('psyBiasSelf')} style={{ position: 'absolute', top: 3, insetInlineStart: self + '%', marginInlineStart: -8, width: 16, height: 16, borderRadius: 999, border: '2px solid rgba(244,234,215,.5)', background: 'var(--ink-950)', display: 'block' }}></span>
                        )}
                        {data != null && (
                          <span title={i18n.t('psyBiasData')} style={{ position: 'absolute', top: 3, insetInlineStart: data + '%', marginInlineStart: -8, width: 16, height: 16, borderRadius: 999, background: tone, border: '2px solid var(--ink-950)', display: 'block' }}></span>
                        )}
                      </div>
                      {b.exampleThisMonth && <Caption style={{ textWrap: 'pretty' }}>{b.exampleThisMonth}</Caption>}
                    </div>
                  );
                })}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', paddingTop: 4 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ width: 14, height: 14, borderRadius: 999, border: '2px solid rgba(244,234,215,.5)', boxSizing: 'border-box', display: 'block' }}></span>
                    <Caption>{i18n.t('psyBiasSelf')}</Caption>
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ width: 14, height: 14, borderRadius: 999, background: 'var(--warning)', display: 'block' }}></span>
                    <Caption>{i18n.t('psyBiasData')}</Caption>
                  </span>
                </div>
              </div>
            ) : <Caption>{i18n.t('psyBiasMeterEmpty')}</Caption>}
          </div>
        </Panel>
        <Panel variant="base" ornament padding="18px 20px 20px" style={{ flex: '1 1 380px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <SectionLabel>{mi.t('mhStandardizedTestsTitle')}</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tests.map(([key, label]) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', border: '1px solid var(--border-hairline)', borderRadius: 8, background: 'rgba(11,20,21,.55)' }}>
                  <span style={{ flex: 1, font: 'var(--type-body)', color: 'var(--text-primary)' }}>{label}</span>
                  <Chip tone="neutral">{i18n.t('psyComingSoonChip')}</Chip>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function TrackingSection({ i18n, mi, psych, trades, closed, profile, dueCheckIn, checkInDismissed, onDismissCheckIn, onRunCheckIn }) {
  const weather = psych.emotionalWeatherDaily(trades, 90);
  const weeklyScore = profile.healthReportCache.weeklyScore;
  const weekTrades = closed.filter((t) => (new Date(t.closedAt || t.createdAt)).getTime() >= Date.now() - 7 * 86400000);
  const snapshots = profile.progressTracking.weeklySnapshots.slice(-8);
  const trend = snapshots.length >= 2 ? Math.round(snapshots[snapshots.length - 1].progressScore - snapshots[snapshots.length - 2].progressScore) : null;
  const activity = [];
  trades.forEach((t) => (t.emotionLog || []).forEach((e) => activity.push({ timestamp: e.timestamp, dominantEmotions: e.dominantEmotions || [], stressLevel: Number(e.stressLevel) })));
  activity.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  function exportLog() {
    const blob = new Blob([JSON.stringify(activity, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'psychology-activity-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.append(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <Panel variant="base" ornament padding="18px 20px 20px" style={{ flex: '1 1 380px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <SectionLabel>{mi.t('mhEmotionalWeatherTitle')}</SectionLabel>
              <Caption style={{ marginInlineStart: 'auto' }}>{i18n.t('psyWeatherNote')}</Caption>
            </div>
            {/* A calendar, not seven bars. The pattern worth catching here is monthly - a
                tense last week of every month, a bad Monday - and a seven-day window is too
                short to contain one. A day with no log stays an empty cell, never a zero. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(15, minmax(0, 1fr))', gap: 4 }}>
              {weather.map((w, i) => {
                const s = w.avgStress;
                const fill = s == null ? 'rgba(244,234,215,.06)'
                  : s <= 3 ? 'color-mix(in srgb, var(--success) 75%, transparent)'
                    : s <= 5 ? 'color-mix(in srgb, var(--char-accent) 60%, transparent)'
                      : s <= 7 ? 'color-mix(in srgb, var(--warning) 60%, transparent)'
                        : 'color-mix(in srgb, var(--danger) 65%, transparent)';
                const day = new Date(w.date);
                return (
                  <span
                    key={i}
                    title={i18n.date(day, { dateStyle: 'medium' }) + (s == null ? ' · ' + i18n.t('psyWeatherNoLog') : ' · ' + i18n.number(s))}
                    style={{
                      aspectRatio: '1', borderRadius: 3, display: 'grid', placeItems: 'center',
                      background: fill, border: '1px solid ' + (s == null ? 'var(--border-hairline)' : 'rgba(3,8,7,.5)')
                    }}
                  >
                    <span className="navrya-tabular" style={{ font: '400 8px/10px var(--font-ui)', color: s == null ? 'var(--text-disabled)' : 'var(--ink-950)' }}>
                      {s == null ? '' : Math.round(s)}
                    </span>
                  </span>
                );
              })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Caption>{i18n.t('psyWeatherCalm')}</Caption>
              <span style={{ display: 'flex', gap: 3 }}>
                {['var(--success)', 'var(--char-accent)', 'var(--warning)', 'var(--danger)'].map((tone, i) => (
                  <span key={i} style={{ width: 13, height: 13, borderRadius: 3, display: 'block', background: 'color-mix(in srgb, ' + tone + ' 65%, transparent)' }}></span>
                ))}
              </span>
              <Caption>{i18n.t('psyWeatherTense')}</Caption>
              <span style={{ width: 13, height: 13, borderRadius: 3, display: 'block', background: 'rgba(244,234,215,.06)', border: '1px solid var(--border-hairline)', marginInlineStart: 8 }}></span>
              <Caption>{i18n.t('psyWeatherNoLog')}</Caption>
              <Caption style={{ marginInlineStart: 'auto', fontVariantNumeric: 'tabular-nums' }}>
                {i18n.t('psyWeatherLogged', { count: i18n.number(weather.filter((w) => w.avgStress != null).length), total: i18n.number(weather.length) })}
              </Caption>
            </div>
          </div>
        </Panel>
        <Panel variant="base" ornament padding="18px 20px 20px" style={{ width: 340, flex: 'none' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%' }}>
            <SectionLabel>{i18n.t('psyWeeklyScoreTitle')}</SectionLabel>
            {weekTrades.length ? (
              <React.Fragment>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
                  <span className="navrya-tabular" style={{ font: 'var(--type-level)', color: 'var(--char-accent)' }}>{i18n.number(weeklyScore)}</span>
                  <span style={{ font: 'var(--type-body)', color: 'var(--text-muted)', paddingBottom: 10 }}>/ 100</span>
                  {trend != null && <span style={{ marginInlineStart: 'auto', paddingBottom: 10 }}><Chip tone={trend >= 0 ? 'success' : 'danger'}>{i18n.t(trend > 0 ? 'psyDisciplineTrendUp' : trend < 0 ? 'psyDisciplineTrendDown' : 'psyDisciplineTrendFlat', { value: trend })}</Chip></span>}
                </div>
                {snapshots.length > 0 && (
                  <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'flex-end', gap: 5, height: 52 }}>
                    {snapshots.map((s, i) => <span key={i} style={{ flex: 1, borderRadius: 3, display: 'block', background: 'color-mix(in srgb, var(--char-accent) 60%, transparent)', height: Math.max(6, Math.round(s.progressScore / 100 * 52)) + 'px' }}></span>)}
                  </div>
                )}
              </React.Fragment>
            ) : <Caption>{i18n.t('psyWeeklyScoreEmpty')}</Caption>}
          </div>
        </Panel>
      </div>
      {dueCheckIn && !checkInDismissed && (
        <Panel variant="active" ornament padding="18px 20px">
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
            <span style={{ width: 40, height: 40, flex: 'none', borderRadius: 999, border: '1px solid color-mix(in srgb, var(--char-accent) 60%, transparent)', background: 'rgba(3,8,7,.45)', display: 'grid', placeItems: 'center', color: 'var(--char-accent)' }}>
              <Icon name="calendar" size={22} />
            </span>
            <div style={{ flex: '1 1 260px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={{ font: 'var(--type-display-md)', color: 'var(--text-primary)', letterSpacing: 'var(--tracking-display)' }}>{mi.t('mhCheckInDue')}</span>
              <span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t('psyCheckInPromptBody')}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
              <Button variant="ghost" onClick={onDismissCheckIn}>{i18n.t('psyLater')}</Button>
              <Button variant="primary" icon="calendar" onClick={onRunCheckIn}>{i18n.t('psyRunCheckInNow')}</Button>
            </div>
          </div>
        </Panel>
      )}
      <Panel variant="base" ornament padding="18px 20px 20px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <SectionLabel>{mi.t('mhActivityLog')}</SectionLabel>
            <Chip tone="neutral">{i18n.t('psyActivityCountChip', { count: activity.length })}</Chip>
            <span style={{ marginInlineStart: 'auto' }}><Button variant="ghost" size="sm" icon="download" onClick={exportLog}>{i18n.t('psyExportLog')}</Button></span>
          </div>
          {activity.length ? (
            <div className="navrya-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto', overflowX: 'hidden', paddingInlineEnd: 6 }}>
              {activity.map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', border: '1px solid var(--border-hairline)', borderRadius: 8, background: 'rgba(11,20,21,.55)' }}>
                  <span className="navrya-tabular" style={{ width: 180, flex: 'none', font: 'var(--type-caption)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-dim)', textTransform: 'uppercase' }}>{i18n.date(a.timestamp, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                  <span style={{ flex: 1, font: 'var(--type-body)', color: 'var(--text-primary)' }}>{a.dominantEmotions.length ? a.dominantEmotions.map((e) => i18n.t(e)).join(' · ') : '—'}</span>
                  <Chip tone={stressChipTone(a.stressLevel)} dot>{i18n.t('psyStressChip', { value: a.stressLevel })}</Chip>
                </div>
              ))}
            </div>
          ) : <Caption>{i18n.t('psyActivityEmpty')}</Caption>}
        </div>
      </Panel>
    </div>
  );
}

function FlagsSection({ i18n, mi, profile, onResolve }) {
  const types = window.TradeJournalMentalHealthTypes || {};
  const mandatory = types.mandatoryReferralRedFlags || [];
  const allTypes = (types.redFlagTypes || []).filter((t) => t !== 'custom');
  const active = profile.redFlags.active || [];
  const resolved = profile.redFlags.resolved || [];
  const activeByType = {};
  active.forEach((f) => { activeByType[f.type] = f; });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Notice tone="warning" icon="honour">{i18n.t('psyRedFlagsWarning')}</Notice>

      {active.length ? active.map((flag) => {
        const isMandatory = mandatory.indexOf(flag.type) > -1;
        return (
          <Panel key={flag.id} variant="base" ornament padding="18px 20px" style={isMandatory ? { borderColor: 'rgba(255,56,48,.55)', background: 'rgba(255,56,48,.04)' } : undefined}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                <span style={{ width: 40, height: 40, flex: 'none', borderRadius: 8, border: '1px solid rgba(255,56,48,.45)', background: 'rgba(255,56,48,.08)', display: 'grid', placeItems: 'center', color: 'var(--danger)' }}>
                  <Icon name="Flag" size={22} />
                </span>
                <div style={{ flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ font: 'var(--type-display-md)', color: 'var(--text-primary)', letterSpacing: 'var(--tracking-display)' }}>{mi.t('mhRedFlag_' + flag.type)}</span>
                    <Chip tone="danger" dot>{i18n.t(isMandatory ? 'psyFlagSeverityHigh' : 'psyFlagSeverityReview')}</Chip>
                    <span className="navrya-tabular" style={{ font: 'var(--type-caption)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-dim)', textTransform: 'uppercase' }}>{i18n.date(flag.detectedAt)}</span>
                  </div>
                  <p style={{ margin: 0, font: 'var(--type-body)', color: 'var(--text-muted)', textWrap: 'pretty' }}>{i18n.t('psyRedFlagBody_' + flag.type)}</p>
                </div>
                <Button variant="secondary" size="sm" icon="check" onClick={() => onResolve(flag.id)}>{i18n.t('psyMarkReviewed')}</Button>
              </div>

              {/* A mandatory-referral flag carries the real safety copy, given the same weight as
                  the alert itself - mental-health-store.js sets professionalReferralShown for
                  exactly these types, and mental-health-safety.js already owns the wording. */}
              {flag.professionalReferralShown && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '14px 16px', borderRadius: 8, border: '1px solid rgba(255,56,48,.4)', background: 'rgba(255,56,48,.06)' }}>
                  <span style={{ font: 'var(--type-username)', color: 'var(--text-primary)' }}>{mi.t('mhSafetyTitle')}</span>
                  <span style={{ font: 'var(--type-body)', color: 'var(--text-muted)', textWrap: 'pretty' }}>{mi.t('mhSafetyBody')}</span>
                </div>
              )}
            </div>
          </Panel>
        );
      }) : <Panel variant="base" ornament padding="18px 20px"><Caption>{i18n.t('psyNoActiveFlags')}</Caption></Panel>}

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        {/* What is being watched, whether or not anything has fired. A list of five quiet rows is
            more reassuring than an empty screen, and it says plainly which three force a referral. */}
        <Panel variant="base" ornament padding="18px 20px 20px" style={{ flex: '1 1 420px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <SectionLabel>{i18n.t('psyFlagsWatchTitle')}</SectionLabel>
              <Caption style={{ marginInlineStart: 'auto' }}>{i18n.t('psyFlagsWatchHint')}</Caption>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {allTypes.map((type) => {
                const fired = !!activeByType[type];
                const isMandatory = mandatory.indexOf(type) > -1;
                return (
                  <div key={type} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', borderRadius: 8,
                    border: '1px solid ' + (fired ? 'rgba(255,56,48,.35)' : isMandatory ? 'rgba(214,175,107,.3)' : 'var(--border-hairline)'),
                    background: fired ? 'rgba(255,56,48,.05)' : 'rgba(11,16,22,.4)'
                  }}>
                    <span style={{ width: 8, height: 8, flex: 'none', marginTop: 6, borderRadius: 999, background: fired ? 'var(--danger)' : 'var(--success)' }}></span>
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ font: 'var(--type-body)', fontSize: 12, color: 'var(--text-primary)' }}>{mi.t('mhRedFlag_' + type)}</span>
                        {isMandatory && <Chip tone="gold" style={{ height: 18, fontSize: 9 }}>{i18n.t('psyFlagMandatory')}</Chip>}
                      </span>
                      <Caption style={{ textWrap: 'pretty' }}>{i18n.t('psyRedFlagBody_' + type)}</Caption>
                    </span>
                    <Chip tone={fired ? 'danger' : 'success'} style={{ flex: 'none' }}>{i18n.t(fired ? 'psyFlagStateActive' : 'psyFlagStateClear')}</Chip>
                  </div>
                );
              })}
            </div>
          </div>
        </Panel>

        <Panel variant="base" ornament padding="18px 20px 20px" style={{ flex: '1 1 300px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <SectionLabel>{i18n.t('psyFlagsResolvedTitle')}</SectionLabel>
              <Chip tone="neutral" style={{ marginInlineStart: 'auto' }}>{i18n.number(resolved.length)}</Chip>
            </div>
            {resolved.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {resolved.slice(-6).reverse().map((flag) => (
                  <div key={flag.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(11,16,22,.4)' }}>
                    <span style={{ flex: 1, minWidth: 0, font: 'var(--type-body)', fontSize: 12, color: 'var(--text-muted)' }}>{mi.t('mhRedFlag_' + flag.type)}</span>
                    <span className="navrya-tabular" style={{ flex: 'none', font: 'var(--type-caption)', color: 'var(--text-dim)' }}>{i18n.date(flag.detectedAt)}</span>
                  </div>
                ))}
              </div>
            ) : <Caption>{i18n.t('psyFlagsResolvedEmpty')}</Caption>}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function FileTab(props) {
  const { i18n, mi, fileTab, setFileTab } = props;
  const SUBS = [
    ['intake', mi.t('mhTabIntake'), 'ClipboardList'],
    ['psych', mi.t('mhTabPsychological'), 'psychology'],
    ['tracking', mi.t('mhTabContinuous'), 'Activity'],
    ['flags', mi.t('mhTabRedFlags'), 'Flag']
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 6, border: '1px solid var(--border-hairline)', borderRadius: 10, background: 'rgba(11,20,21,.55)' }}>
        {SUBS.map(([id, label, icon]) => {
          const selected = fileTab === id;
          return (
            <button
              key={id} type="button" onClick={() => setFileTab(id)}
              style={{
                boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 9, height: 40, padding: '0 14px', borderRadius: 6, cursor: 'pointer',
                border: selected ? '1px solid color-mix(in srgb, var(--char-accent) 70%, transparent)' : '1px solid transparent',
                background: selected ? 'var(--char-active-surface)' : 'transparent',
                color: selected ? 'var(--char-accent)' : 'var(--text-muted)', font: 'var(--type-body)', letterSpacing: '.04em'
              }}
            >
              <Icon name={icon} size={18} />{label}
            </button>
          );
        })}
      </div>
      {fileTab === 'intake' && <IntakeSection {...props} />}
      {fileTab === 'psych' && <PsychSection {...props} />}
      {fileTab === 'tracking' && <TrackingSection {...props} />}
      {fileTab === 'flags' && <FlagsSection {...props} />}
    </div>
  );
}

// ============================================================================
// Tab 6 - Growth path
// ============================================================================
function GrowthTab({ i18n, mi, psych, mhStore, profile, closed, triggerDraft, setTriggerDraft, onSaveTrigger, onDeleteTrigger, thoughtDraft, setThoughtDraft, onSaveThought }) {
  const triggers = profile.triggerProfile.triggers;
  const settings = psych.settings();
  const guardActive = settings.breathing.enabled || settings.postTradeReflection.enabled;
  const stage1Done = triggers.length > 0;
  const earliest = triggers.slice().sort((a, b) => new Date(a.lastTriggeredAt) - new Date(b.lastTriggeredAt))[0];
  const sessionsHeld = stage1Done && earliest ? closed.filter((t) => new Date(t.closedAt || t.createdAt) > new Date(earliest.lastTriggeredAt)).length : 0;
  const stage2Done = stage1Done && guardActive;
  const stage3Done = stage2Done && sessionsHeld >= GROWTH_HOLD_TARGET;
  const stages = [
    { stage: 'STAGE 01', label: i18n.t('psyStage1'), kind: stage1Done ? 'done' : 'locked' },
    { stage: 'STAGE 02', label: i18n.t('psyStage2'), kind: stage2Done ? 'done' : stage1Done ? 'now' : 'locked' },
    { stage: 'STAGE 03', label: i18n.t('psyStage3', { target: GROWTH_HOLD_TARGET }), kind: stage3Done ? 'done' : stage2Done ? 'now' : 'locked' },
    { stage: 'STAGE 04', label: i18n.t('psyStage4'), kind: stage3Done ? 'now' : 'locked' }
  ];
  const statusFor = (kind, idx) => {
    if (kind === 'done') return i18n.t('psyStageComplete');
    if (kind === 'locked') return i18n.t('psyStageLocked');
    if (idx === 2) return i18n.t('psyStage3Progress', { count: Math.min(sessionsHeld, GROWTH_HOLD_TARGET), target: GROWTH_HOLD_TARGET });
    return i18n.t('psyStageComplete');
  };
  const GSTYLE = {
    done: { border: 'var(--border-gold)', bg: 'rgba(11,20,21,.55)', tone: 'var(--text-muted)' },
    now: { border: 'color-mix(in srgb, var(--char-accent) 70%, transparent)', bg: 'var(--char-active-surface)', tone: 'var(--char-accent)' },
    locked: { border: 'var(--border-hairline)', bg: 'transparent', tone: 'var(--text-disabled)' }
  };
  const triggerTypeOptions = TRIGGER_TYPE_OPTIONS.map((v) => ({ value: v, label: i18n.t('psyTriggerType_' + v) }));

  // Six real, live-computed achievements - never a persisted ledger, since
  // mental-health-store.js's own addMilestone() is never actually called anywhere in the app
  // yet, so profile.progressTracking.milestones is always empty. Each condition here reuses a
  // function or field that already exists; nothing is invented to fill the wall.
  const sortedClosed = closed.slice().sort((a, b) => new Date(b.closedAt || b.createdAt) - new Date(a.closedAt || a.createdAt));
  let mirrorStreak = 0;
  for (const t of sortedClosed) { if ((t.emotionLog || []).length > 0) mirrorStreak += 1; else break; }
  const recent30 = closed.filter((t) => t.closedAt && new Date(t.closedAt).getTime() >= Date.now() - 30 * 86400000);
  const badges = [
    { id: 'streak7', unlocked: psych.disciplineStreak(closed) >= 7 },
    { id: 'mirror10', unlocked: mirrorStreak >= 10 },
    { id: 'fileOpen', unlocked: !!profile.intake.completed },
    { id: 'biasChecklist', unlocked: !!profile.psychologicalProfile.biasChecklist.lastAssessedAt },
    { id: 'scenariosDone', unlocked: profile.psychologicalProfile.scenarioAssessment.responses.length >= 5 },
    { id: 'noRevenge30', unlocked: recent30.length >= 5 && !psych.worstRevengeTrade(recent30) }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Panel variant="base" ornament padding="18px 20px 20px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <SectionLabel>{i18n.t('psyIdentifiedTriggers')}</SectionLabel>
            <Chip tone="neutral">{i18n.t('psyTriggersActiveChip', { count: triggers.length })}</Chip>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {triggers.map((t) => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 16px', border: '1px solid var(--border-hairline)', borderRadius: 8, background: 'rgba(11,20,21,.55)', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 260px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <span style={{ font: 'var(--type-username)', color: 'var(--text-primary)' }}>{t.description}</span>
                  <span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{t.recommendedAction || '—'}</span>
                </div>
                <Chip tone="accent">{String(t.triggerType || 'custom').toUpperCase()}</Chip>
                <Button variant="danger" size="sm" icon="trash" onClick={() => onDeleteTrigger(t.id)}></Button>
              </div>
            ))}
          </div>
        </div>
      </Panel>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <Panel variant="base" ornament padding="18px 20px 20px" style={{ flex: '1 1 340px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <SectionLabel>{i18n.t('psyAddTriggerTitle')}</SectionLabel>
            <TextField label={i18n.t('psyTriggerDescLabel')} value={triggerDraft.desc} onChange={(v) => setTriggerDraft((d) => ({ ...d, desc: v }))} placeholder={i18n.t('psyTriggerDescPlaceholder')} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <span style={{ font: 'var(--type-body)', fontSize: 12, color: 'var(--text-primary)' }}>{i18n.t('psyTriggerTypeLabel')}</span>
              <Select value={triggerDraft.type} options={triggerTypeOptions} onChange={(v) => setTriggerDraft((d) => ({ ...d, type: v }))} icon="psychology" />
            </div>
            <TextField label={i18n.t('psyTriggerActionLabel')} value={triggerDraft.action} onChange={(v) => setTriggerDraft((d) => ({ ...d, action: v }))} placeholder={i18n.t('psyTriggerActionPlaceholder')} />
            <Button variant="primary" icon="check" fullWidth onClick={onSaveTrigger}>{mi.t('mhSaveTrigger')}</Button>
          </div>
        </Panel>
        <div style={{ flex: '1 1 340px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Panel variant="base" ornament padding="18px 20px 20px">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <SectionLabel>{i18n.t('psyGrowthPathTitle')}</SectionLabel>
              <div style={{ display: 'flex', alignItems: 'stretch', gap: 10, flexWrap: 'wrap' }}>
                {stages.map((s, i) => {
                  const style = GSTYLE[s.kind];
                  return (
                    <div key={s.stage} style={{ flex: '1 1 120px', display: 'flex', flexDirection: 'column', gap: 8, padding: 14, borderRadius: 8, border: '1px solid ' + style.border, background: style.bg }}>
                      <span className="navrya-tabular" style={{ font: 'var(--type-caption)', letterSpacing: 'var(--tracking-label)', color: style.tone, textTransform: 'uppercase' }}>{s.stage}</span>
                      <span style={{ font: 'var(--type-body)', color: 'var(--text-primary)', textWrap: 'pretty' }}>{s.label}</span>
                      <span style={{ font: 'var(--type-caption)', color: 'var(--text-dim)' }}>{statusFor(s.kind, i)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </Panel>
          <Panel variant="base" ornament padding="18px 20px 20px">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <SectionLabel>{i18n.t('psyBadgeWallTitle')}</SectionLabel>
                <Chip tone="accent" style={{ marginInlineStart: 'auto' }}>{i18n.t('psyBadgeWallCount', { unlocked: i18n.number(badges.filter((b) => b.unlocked).length), total: i18n.number(badges.length) })}</Chip>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 10 }}>
                {badges.map((b) => (
                  <div key={b.id} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, padding: '13px 10px', borderRadius: 8, textAlign: 'center',
                    border: '1px solid ' + (b.unlocked ? 'color-mix(in srgb, var(--char-accent) 40%, transparent)' : 'var(--border-hairline)'),
                    background: b.unlocked ? 'color-mix(in srgb, var(--char-active-surface) 55%, transparent)' : 'rgba(11,16,22,.4)'
                  }}>
                    <span style={{
                      width: 36, height: 36, borderRadius: 999, display: 'grid', placeItems: 'center',
                      border: '1px solid ' + (b.unlocked ? 'color-mix(in srgb, var(--char-accent) 55%, transparent)' : 'var(--border-hairline)'),
                      background: 'rgba(3,8,7,.5)', color: b.unlocked ? 'var(--char-accent)' : 'var(--text-disabled)'
                    }}><Icon name="honour" size={17} /></span>
                    <span style={{ font: 'var(--type-body)', fontSize: 11, lineHeight: '15px', color: b.unlocked ? 'var(--text-primary)' : 'var(--text-disabled)' }}>{i18n.t('psyBadge_' + b.id)}</span>
                    <span style={{ font: 'var(--type-caption)', fontSize: 9, color: 'var(--text-disabled)' }}>{i18n.t(b.unlocked ? 'psyBadgeUnlocked' : 'psyBadgeLocked')}</span>
                  </div>
                ))}
              </div>
            </div>
          </Panel>
          <Panel variant="base" ornament padding="18px 20px 20px">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <SectionLabel>{mi.t('mhThoughtRecordTitle')}</SectionLabel>
                <Caption style={{ marginInlineStart: 'auto' }}>{i18n.t('psyThoughtRecordNote')}</Caption>
              </div>
              <TextField label={mi.t('mhAutomaticThought')} value={thoughtDraft.auto} onChange={(v) => setThoughtDraft((d) => ({ ...d, auto: v }))} placeholder={i18n.t('psyAutomaticThoughtPlaceholder')} />
              <TextField label={mi.t('mhBalancedThought')} value={thoughtDraft.balanced} onChange={(v) => setThoughtDraft((d) => ({ ...d, balanced: v }))} placeholder={i18n.t('psyBalancedThoughtPlaceholder')} />
              <Button variant="secondary" icon="check" fullWidth onClick={onSaveThought}>{mi.t('mhSaveThoughtRecord')}</Button>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Shell
// ============================================================================
function TabStrip({ i18n, psyTab, setPsyTab }) {
  const TABS = [
    { id: 'overview', label: i18n.t('psyTabOverview'), icon: 'dashboard' },
    { id: 'routine', label: i18n.t('psyTabRoutine'), icon: 'calendar' },
    { id: 'mood', label: i18n.t('psyTabMood'), icon: 'status' },
    { id: 'therapist', label: i18n.t('psyTabTherapist'), icon: 'psychology' },
    { id: 'journeys', label: i18n.t('psyTabJourneys'), icon: 'strategies' },
    { id: 'insights', label: i18n.t('psyTabInsights'), icon: 'sparkle' },
    { id: 'protective', label: i18n.t('psyTabProtective'), icon: 'honour' },
    { id: 'file', label: i18n.t('psyTabFile'), icon: 'User' },
    { id: 'growth', label: i18n.t('psyTabGrowth'), icon: 'Sprout' }
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 8, border: '1px solid var(--border-gold)', borderRadius: 12, background: 'var(--surface-card)', boxShadow: 'var(--shadow-panel)', flexWrap: 'wrap' }}>
      {TABS.map((t) => {
        const selected = psyTab === t.id;
        return (
          <button
            key={t.id} type="button" onClick={() => setPsyTab(t.id)}
            style={{
              boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 10, height: 52, padding: '0 16px', borderRadius: 8, cursor: 'pointer',
              border: selected ? '2px solid var(--char-accent)' : '1px solid transparent',
              background: selected ? 'var(--char-active-surface)' : 'transparent',
              boxShadow: selected ? 'var(--glow-active)' : 'none',
              color: selected ? 'var(--char-accent)' : 'var(--text-muted)', font: 'var(--type-body)', letterSpacing: '.06em', textTransform: 'uppercase'
            }}
          >
            <Icon name={t.icon} size={18} />{t.label}
          </button>
        );
      })}
    </div>
  );
}

// renderPsychology() below creates a brand-new container + React root on every call (it's the
// render target psychology-ui.js's onTabChange callback re-invokes on every main-tab switch, see
// that file's renderPage()) - so PsychologyShell fully remounts, and any local useState (like
// fileTab) is lost, on every main-tab change. `tab` survives this because renderPsychology()
// already threads it through as an argument; goFile() below stashes the target FILE sub-tab here
// just before triggering that same remount, so PsychologyShell's initial fileTab state can read
// it back instead of always defaulting to 'intake'. Cleared immediately after being read so a
// later plain tab switch (clicking a file sub-tab directly) isn't affected by a stale value.
let pendingFileTab = null;

function PsychologyShell({ i18n, tab, onTabChange }) {
  const mi = window.TradeJournalMentalHealthI18n;
  const psych = window.TradeJournalPsychologyStore;
  const mhStore = window.TradeJournalMentalHealthStore;
  const collector = window.TradeJournalMentalHealthCollector;
  const scheduler = window.TradeJournalMentalHealthScheduler;
  const tradeStore = window.TradeJournalTradeStore;

  const [psyTab, setPsyTabState] = React.useState(tab || 'overview');
  const [fileTab, setFileTab] = React.useState(() => {
    const initial = pendingFileTab || 'intake';
    pendingFileTab = null;
    return initial;
  });
  const [openJourney, setOpenJourney] = React.useState(null);
  const [, forceRerender] = React.useReducer((x) => x + 1, 0);
  const [dismissedInsightKinds, setDismissedInsightKinds] = React.useState(() => new Set());
  const [triggerDraft, setTriggerDraft] = React.useState({ desc: '', type: 'custom', action: '' });
  const [thoughtDraft, setThoughtDraft] = React.useState({ auto: '', balanced: '' });
  const [protectiveSavedAt, setProtectiveSavedAt] = React.useState(null);
  const [checkInDismissed, setCheckInDismissed] = React.useState(false);

  React.useEffect(() => {
    function onChange() { forceRerender(); }
    window.addEventListener('tradejournal:mental-health-changed', onChange);
    window.addEventListener('tradejournal:trades-changed', onChange);
    window.addEventListener('tradejournal:psychology-settings-changed', onChange);
    return () => {
      window.removeEventListener('tradejournal:mental-health-changed', onChange);
      window.removeEventListener('tradejournal:trades-changed', onChange);
      window.removeEventListener('tradejournal:psychology-settings-changed', onChange);
    };
  }, []);

  const rtl = i18n.direction() === 'rtl';
  const trades = tradeStore.listSync();
  const closed = trades.filter((t) => t.status === 'closed');
  const profile = collector ? collector.ensureFresh() : mhStore.load();
  const dueCheckIn = scheduler ? scheduler.dueItems(profile, new Date()).some((d) => d.type === 'weekly_snapshot') : false;

  // Insights/Protective tabs both reduce over the same two real, already-stored continuous-
  // tracking records (never an LLM call) - see psych.aiInsightCards()/cooldownHistory()'s own
  // header comments in psychology-store.js for exactly what backs each card.
  const checkins = profile.continuousTracking.preSessionCheckIns || [];
  const reflections = profile.continuousTracking.postTradeReflections || [];
  // routineDays stays a plain {dayKey:{total,complete}} map built here (not inside
  // psychology-store.js) so that file keeps zero dependency on routine-store.js and its own
  // sandboxed test harness never needs to load it.
  const routineDays = React.useMemo(() => buildRoutineDaysMap(), [psyTab]);

  function setPsyTab(next) { setPsyTabState(next); if (onTabChange) onTabChange(next); }
  function goFile(section) {
    setFileTab(section); setPsyTabState('file');
    // onTabChange (when present) remounts this whole shell - see pendingFileTab's comment above.
    // Stashed for the remount even though setFileTab(section) above already covers the case
    // where onTabChange is absent/a no-op and this instance survives in place.
    pendingFileTab = section;
    if (onTabChange) onTabChange('file');
  }

  // "Run check-in now"/"Run weekly check-in" used to just silently call captureWeeklySnapshot()
  // and switch tabs - no visible result, despite the card's own copy (psyCheckInPromptBody)
  // promising "four questions, about two minutes". This now opens that real popup; the snapshot
  // itself is still captured (from inside the modal's own save handler) once the trader actually
  // answers or skips, so every existing reader of progressTracking.weeklySnapshots keeps working.
  function runCheckIn() {
    openWeeklyCheckIn(() => {
      setCheckInDismissed(false);
      goFile('tracking');
      forceRerender();
    });
  }

  // Voice actions only ask this live shell to do what the visible tab strip and check-in button
  // already do. The ref keeps the mount-once public hook on the latest real React callbacks.
  const psychologyHubRef = React.useRef(null);
  psychologyHubRef.current = { openTab: setPsyTab, runWeeklyCheckIn: runCheckIn };
  React.useEffect(() => {
    window.TradeJournalNavryaPsychologyHub = {
      openTab: (nextTab) => psychologyHubRef.current.openTab(nextTab),
      runWeeklyCheckIn: () => psychologyHubRef.current.runWeeklyCheckIn()
    };
    return () => { delete window.TradeJournalNavryaPsychologyHub; };
  }, []);

  function saveTrigger() {
    if (!triggerDraft.desc.trim()) return;
    let p = mhStore.load();
    p.triggerProfile.draftTrigger = { description: triggerDraft.desc.trim(), triggerType: triggerDraft.type, recommendedAction: triggerDraft.action.trim() };
    p = mhStore.save(p);
    mhStore.commitDraftTrigger(p);
    setTriggerDraft({ desc: '', type: 'custom', action: '' });
  }
  function deleteTrigger(id) { mhStore.removeTrigger(mhStore.load(), id); }

  function saveThought() {
    let p = mhStore.load();
    p.cognitiveProfile.draftThoughtRecord = { automaticThought: thoughtDraft.auto.trim(), emotion: '', evidenceFor: '', evidenceAgainst: '', balancedThought: thoughtDraft.balanced.trim() };
    p = mhStore.save(p);
    mhStore.commitDraftThoughtRecord(p, null, null);
    setThoughtDraft({ auto: '', balanced: '' });
  }

  function addInsightAsTrigger(insight) {
    setTriggerDraft({ desc: insight.title, type: 'custom', action: insight.recommendation || '' });
    setPsyTab('growth');
  }

  function openIntake() { if (window.TradeJournalMentalHealthIntake) window.TradeJournalMentalHealthIntake.open(forceRerender); }
  function openChecklist() { if (window.TradeJournalMentalHealthContinuous) window.TradeJournalMentalHealthContinuous.openBiasChecklist(forceRerender); }

  const totalLogs = closed.reduce((sum, t) => sum + (t.emotionLog || []).length, 0);
  const streak = psych.disciplineStreak(trades);

  const sharedProps = { i18n, mi, psych, mhStore, collector, scheduler, tradeStore, trades, closed, profile, fileTab, setFileTab, dueCheckIn, checkInDismissed, onDismissCheckIn: () => setCheckInDismissed(true), onRunCheckIn: runCheckIn, onOpenIntake: openIntake, onOpenChecklist: openChecklist, onResolve: (id) => mhStore.resolveRedFlag(mhStore.load(), id) };

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ direction: rtl ? 'rtl' : 'ltr', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 32, padding: '0 2px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ font: 'var(--type-display-lg)', color: 'var(--text-primary)', letterSpacing: 'var(--tracking-display)', textTransform: 'uppercase' }}>{i18n.t('psyNavTitle')}</div>
          <p style={{ margin: 0, maxWidth: 660, font: 'var(--type-body)', color: 'var(--text-muted)', textWrap: 'pretty' }}>{i18n.t('psyNavSubtitle')}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
          <Chip tone="accent" dot>{i18n.t('psyStreakChip', { count: streak })}</Chip>
          <Chip tone="neutral">{i18n.t('psyTradesLogsChip', { trades: closed.length, logs: totalLogs })}</Chip>
        </div>
      </div>

      <TabStrip i18n={i18n} psyTab={psyTab} setPsyTab={setPsyTab} />

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 700px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {psyTab === 'overview' && (
            <OverviewTab
              i18n={i18n} psych={psych} mhStore={mhStore} profile={profile} trades={trades} closed={closed} checkins={checkins}
              setPsyTab={setPsyTab} goFile={goFile} runCheckIn={runCheckIn}
            />
          )}
          {psyTab === 'routine' && <RoutineTab i18n={i18n} />}
          {psyTab === 'mood' && <MoodTab i18n={i18n} psych={psych} mhStore={mhStore} profile={profile} trades={trades} onLogged={forceRerender} />}
          {psyTab === 'therapist' && <TherapistTab i18n={i18n} mhStore={mhStore} profile={profile} onChanged={forceRerender} />}
          {psyTab === 'journeys' && <JourneysTab i18n={i18n} psych={psych} trades={trades} closed={closed} openJourney={openJourney} setOpenJourney={setOpenJourney} />}
          {psyTab === 'insights' && (
            <InsightsTab
              i18n={i18n} psych={psych} trades={trades} closed={closed} checkins={checkins} routineDays={routineDays}
              mhStore={mhStore} profile={profile} dismissedKinds={dismissedInsightKinds}
              onDismiss={(kind) => setDismissedInsightKinds((s) => new Set(s).add(kind))} onAddAsTrigger={addInsightAsTrigger}
            />
          )}
          {psyTab === 'protective' && (
            <ProtectiveTab
              i18n={i18n} psych={psych} mhStore={mhStore} profile={profile} trades={trades} closed={closed}
              savedAt={protectiveSavedAt} onSaved={() => setProtectiveSavedAt(i18n.date(new Date(), { dateStyle: 'medium', timeStyle: 'short' }))}
            />
          )}
          {psyTab === 'file' && <FileTab {...sharedProps} />}
          {psyTab === 'growth' && (
            <GrowthTab
              i18n={i18n} mi={mi} psych={psych} mhStore={mhStore} profile={profile} closed={closed}
              triggerDraft={triggerDraft} setTriggerDraft={setTriggerDraft} onSaveTrigger={saveTrigger} onDeleteTrigger={deleteTrigger}
              thoughtDraft={thoughtDraft} setThoughtDraft={setThoughtDraft} onSaveThought={saveThought}
            />
          )}
        </div>
        <FileRail i18n={i18n} mi={mi} profile={profile} closed={closed} goFile={goFile} activeSection={psyTab === 'file' ? fileTab : null} onRunCheckIn={runCheckIn} />
      </div>
    </div>
  );
}

// psychology-ui.js's renderPage() defers to this hook when present - state.tab stays owned by
// psychology-ui.js's own controller (onTabChange calls back into it), only the DOM building
// changes. tab/onTabChange are an opaque string passthrough - this screen owns a wider tab
// vocabulary (overview/routine/mood/therapist/journeys/insights/protective/file/growth) than the
// legacy controller ever knew about, which is fine since its own tab-switch branches are dead code
// once this hook exists (mirrors ai-settings-ui.js's identical fallback-hook pattern).
export function renderPsychology(tab, onTabChange) {
  const i18n = window.TradeJournalTradeI18n;
  const container = document.createElement('div');
  container.className = 'panel-page psy-page';
  container.dataset.character = currentNavryaCharacter();
  createRoot(container).render(<PsychologyShell i18n={i18n} tab={tab} onTabChange={onTabChange} />);
  return container;
}
