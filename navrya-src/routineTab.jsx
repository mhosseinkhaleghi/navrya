import React from 'react';
import { createPortal } from 'react-dom';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { Chip } from '../public/pages/shared/navrya/components/forms/Chip.jsx';
import { TextField } from '../public/pages/shared/navrya/components/forms/TextField.jsx';
import { Notice } from '../public/pages/shared/navrya/components/feedback/Notice.jsx';
import { Modal } from '../public/pages/shared/navrya/components/feedback/Modal.jsx';
import { MetricRow } from '../public/pages/shared/navrya/components/metrics/MetricRow.jsx';
import { AiMagicFill } from '../public/pages/shared/navrya/components/feedback/AiMagicFill.jsx';
import { useAiFieldFill } from '../public/pages/shared/navrya/hooks/useAiFieldFill.js';
import { currentNavryaCharacter } from './currentCharacter.js';
import { requestReminderPermission, reminderPermission } from './routineReminders.js';

// The ROUTINE tab (RoutineNew.dc.html / Routine.dc.html on the approved canvas). Everything it
// stores goes through routine-store.js, which persists on the same server-authoritative
// preferences domain psychology-store.js already uses - no new table, no localStorage.
//
// Two modes share this one component deliberately, because they are the same object seen at two
// moments: `today` (the checklist the trader ticks) and `build` (the four-step wizard). The wizard
// opens as a popup over whichever surface hosts this tab - the dashboard panel or the Psychology
// tab - so building a routine looks and behaves the same from both.

function SectionLabel({ children, style }) {
  return <span style={{ font: 'var(--type-section-label)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-muted)', textTransform: 'uppercase', ...style }}>{children}</span>;
}
function Caption({ children, style }) {
  return <span style={{ font: 'var(--type-caption)', color: 'var(--text-dim)', letterSpacing: '.04em', ...style }}>{children}</span>;
}

const PHASE_TONE = {
  pre: 'var(--gold-warm)', mind: 'var(--char-accent)', during: 'var(--warning)',
  post: 'var(--info)', weekly: '#A965D8',
  morning: 'var(--gold-warm)', day: 'var(--char-accent)', evening: 'var(--info)'
};
const DAY_LABELS = [['sat', 'ش'], ['sun', 'ی'], ['mon', 'د'], ['tue', 'س'], ['wed', 'چ'], ['thu', 'پ'], ['fri', 'ج']];

// A step's optional `link` names another surface in this app. Rendering it as a chip is the
// whole point of the field: it tells the trader the step is one tap away, not busywork.
function linkLabel(i18n, link) {
  const map = {
    app: i18n.t('routineLinkApp'), calculator: i18n.t('routineLinkCalculator'), calm: i18n.t('routineLinkCalm'),
    tracking: i18n.t('routineLinkTracking'), reflection: i18n.t('routineLinkReflection'), tilt: i18n.t('routineLinkTilt'),
    journal: i18n.t('routineLinkJournal'), cooldown: i18n.t('routineLinkCooldown'), mood: i18n.t('routineLinkMood'),
    library: i18n.t('routineLinkLibrary')
  };
  return map[link] || '';
}

function Toggle({ checked, onChange, small }) {
  const w = small ? 40 : 46, h = small ? 22 : 26, knob = small ? 16 : 20;
  return (
    <button
      type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      style={{
        width: w, height: h, flex: 'none', borderRadius: 999, boxSizing: 'border-box', padding: 2, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: checked ? 'flex-start' : 'flex-end',
        border: '1px solid ' + (checked ? 'color-mix(in srgb, var(--char-accent) 60%, transparent)' : 'rgba(244,234,215,.14)'),
        background: checked ? 'color-mix(in srgb, var(--char-accent) 28%, transparent)' : 'rgba(3,8,7,.7)',
        transition: 'background var(--dur-hover) var(--ease-out), border-color var(--dur-hover) var(--ease-out)'
      }}
    >
      <span style={{ width: knob, height: knob, borderRadius: 999, background: checked ? 'var(--char-accent)' : 'var(--text-disabled)', display: 'block' }}></span>
    </button>
  );
}

// ============================================================================
// TODAY - the checklist, and the adherence history underneath it
// ============================================================================
function TodayView({ i18n, store, routine, onEdit, onNew }) {
  // One load() per render, shared by every reader below. dayProgress()/adherence()/streak() each
  // fall back to their own load() when passed no state, which would mean one replica read per
  // step per render - fine for correctness, wasteful for a checklist that re-renders on every tick.
  const state = store.load();
  const today = store.dayKey();
  const doneToday = state.completions[today] || {};
  const progress = store.dayProgress(state, new Date(), routine);
  const rows = store.adherence(28, new Date(), state);
  const rate = store.adherenceRate(28, new Date(), state);
  const streak = store.streak(new Date(), state);

  const phases = store.PHASE_ORDER
    .map((phase) => ({ phase, items: routine.steps.filter((s) => s.phase === phase) }))
    .filter((g) => g.items.length);

  const gridFill = { complete: 'var(--char-accent)', partial: 'color-mix(in srgb, var(--char-accent) 40%, transparent)', watch: 'rgba(214,175,107,.35)', none: 'rgba(244,234,215,.07)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <MetricRow metrics={[
        { icon: 'execution', label: i18n.t('routineMetricToday'), value: i18n.t('routineOfTotal', { done: i18n.number(progress.done), total: i18n.number(progress.total) }) },
        { icon: 'streak', label: i18n.t('routineMetricStreak'), value: i18n.t('psyDisciplineStreakDays', { count: i18n.number(streak) }) },
        { icon: 'scenarios', label: i18n.t('routineMetricAdherence'), value: rate == null ? '—' : i18n.number(rate) + '%' },
        { icon: 'psychology', label: i18n.t('routineMetricLogged'), value: i18n.number(rows.filter((r) => r.state !== 'none').length) }
      ]} />

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <Panel variant="active" ornament padding="18px 20px 20px" style={{ flex: '1 1 480px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <SectionLabel>{i18n.t('routineToday')}</SectionLabel>
              <Chip tone="gold">{routine.name}</Chip>
              <Caption style={{ marginInlineStart: 'auto' }} className="navrya-tabular">{progress.pct}%</Caption>
            </div>

            <div style={{ height: 10, borderRadius: 999, background: 'rgba(3,8,7,.65)', border: '1px solid var(--border-hairline)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 999, width: progress.pct + '%', background: 'linear-gradient(90deg,color-mix(in srgb, var(--char-accent) 45%, transparent),var(--char-accent))', transition: 'width var(--dur-progress) var(--ease-out)' }}></div>
            </div>

            {progress.watch && (
              <Notice tone="accent" icon="honour">{i18n.t('routineWatchDayOn')}</Notice>
            )}

            {phases.map((group) => (
              <div key={group.phase} style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 999, background: PHASE_TONE[group.phase], flex: 'none' }}></span>
                  <SectionLabel>{i18n.t('routinePhase_' + group.phase)}</SectionLabel>
                  <span style={{ flex: 1, height: 1, background: 'var(--divider-gold)' }}></span>
                  <Caption className="navrya-tabular">{i18n.t('routineOfTotal', { done: i18n.number(group.items.filter((s) => doneToday[s.id]).length), total: i18n.number(group.items.length) })}</Caption>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {group.items.map((s) => {
                    const done = !!doneToday[s.id];
                    const link = linkLabel(i18n, s.link);
                    return (
                      <button
                        key={s.id} type="button" onClick={() => store.toggleStep(s.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', width: '100%', boxSizing: 'border-box',
                          borderRadius: 8, cursor: 'pointer', textAlign: 'start', font: 'inherit',
                          border: '1px solid ' + (done ? 'color-mix(in srgb, var(--char-accent) 42%, transparent)' : 'var(--border-hairline)'),
                          background: done ? 'color-mix(in srgb, var(--char-active-surface) 60%, transparent)' : 'rgba(11,16,22,.4)',
                          transition: 'background var(--dur-hover) var(--ease-out), border-color var(--dur-hover) var(--ease-out)'
                        }}
                      >
                        <span style={{
                          width: 22, height: 22, flex: 'none', borderRadius: 6, display: 'grid', placeItems: 'center',
                          border: '1px solid ' + (done ? 'var(--char-accent)' : 'rgba(244,234,215,.18)'),
                          background: done ? 'var(--char-accent)' : 'transparent', color: 'var(--ink-950)'
                        }}>{done && <Icon name="check" size={14} />}</span>
                        <span style={{ flex: 1, minWidth: 0, font: 'var(--type-body)', color: done ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: done ? 'line-through' : 'none' }}>{s.label}</span>
                        {link && <Chip tone="accent" style={{ height: 20, fontSize: 10, flex: 'none' }}>{link}</Chip>}
                        {s.time && <Caption className="navrya-tabular" style={{ flex: 'none' }}>{s.time}</Caption>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            <div style={{ height: 1, background: 'var(--border-hairline)' }}></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Caption style={{ flex: 1 }}>{i18n.t('routineWatchDayHint')}</Caption>
              <Button variant="secondary" size="sm" onClick={() => store.setWatchDay(!progress.watch)}>
                {progress.watch ? i18n.t('routineWatchDayUndo') : i18n.t('routineWatchDay')}
              </Button>
              <Button variant="secondary" size="sm" icon="settings" onClick={onEdit}>{i18n.t('routineEdit')}</Button>
            </div>
          </div>
        </Panel>

        <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Panel variant="base" ornament padding="18px 20px 20px">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <SectionLabel>{i18n.t('routineAdherence28')}</SectionLabel>
                <Caption style={{ marginInlineStart: 'auto' }}>{i18n.t('routineOneCellADay')}</Caption>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(14, minmax(0, 1fr))', gap: 5 }}>
                {rows.map((r) => (
                  <span key={r.date} title={r.date} style={{ aspectRatio: '1', borderRadius: 3, display: 'block', background: gridFill[r.state], border: '1px solid ' + (r.state === 'none' ? 'var(--border-hairline)' : 'transparent') }}></span>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {[['complete', i18n.t('routineLegendComplete')], ['partial', i18n.t('routineLegendPartial')], ['watch', i18n.t('routineLegendWatch')], ['none', i18n.t('routineLegendNone')]].map(([k, label]) => (
                  <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 2, background: gridFill[k], display: 'block' }}></span>
                    <Caption>{label}</Caption>
                  </span>
                ))}
              </div>
            </div>
          </Panel>

          <Panel variant="base" ornament padding="18px 20px 20px">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <SectionLabel>{i18n.t('routineYourRoutines')}</SectionLabel>
              {store.list().map((r) => (
                <button
                  key={r.id} type="button" onClick={() => store.setActive(r.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', width: '100%', boxSizing: 'border-box',
                    borderRadius: 8, cursor: 'pointer', textAlign: 'start', font: 'inherit',
                    border: '1px solid ' + (r.id === routine.id ? 'color-mix(in srgb, var(--char-accent) 70%, transparent)' : 'var(--border-hairline)'),
                    background: r.id === routine.id ? 'var(--char-active-surface)' : 'rgba(11,16,22,.4)'
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0, font: 'var(--type-body)', color: r.id === routine.id ? 'var(--char-accent)' : 'var(--text-primary)' }}>{r.name}</span>
                  <Caption className="navrya-tabular">{i18n.t('routineStepCount', { count: i18n.number(r.steps.length) })}</Caption>
                </button>
              ))}
              <Button variant="secondary" icon="plus" fullWidth onClick={onNew}>{i18n.t('routineNew')}</Button>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// BUILD - the four-step wizard, shown as a popup
// ============================================================================
// The wizard is a dialog, not an inline document: the dashboard hosts this tab inside a small board
// panel, and the Psychology tab hosts the very same component, so one popup gives both the same
// roomy builder. It is portaled to document.body (inside a data-character wrapper so the theme
// tokens resolve there) because a position:fixed scrim inside a board panel would be clipped to it.
// The wizard state (draft + step) still lives in this component tree, so Voice/Chat drive it exactly
// as before through the 'psychology-routine-editor' process registration below.

const GROUP_ORDER = ['market', 'life', 'custom'];
const PLAIN_BUTTON = { padding: 0, border: 0, background: 'transparent', cursor: 'pointer', font: 'inherit' };

// Optional time of day for a step. Empty is a real, valid value (no alert), so it can be cleared.
function TimeField({ value, onChange, label, clearLabel }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, flex: 'none' }}>
      <input
        type="time" value={value || ''} aria-label={label} title={label} dir="ltr"
        onChange={(e) => onChange(e.target.value)}
        style={{
          height: 32, width: 126, boxSizing: 'border-box', padding: '0 8px', borderRadius: 6, outline: 'none', colorScheme: 'dark',
          background: 'rgba(3,8,7,.55)', font: 'var(--type-caption)', color: value ? 'var(--text-primary)' : 'var(--text-dim)',
          border: '1px solid ' + (value ? 'color-mix(in srgb, var(--char-accent) 45%, transparent)' : 'var(--border-hairline)')
        }}
      />
      {value && <Button variant="ghost" size="sm" icon="close" aria-label={clearLabel} title={clearLabel} style={{ padding: '0 6px' }} onClick={() => onChange('')} />}
    </span>
  );
}

function StepRow({ i18n, s, index, count, onMove, onRemove, onPatch }) {
  const [editing, setEditing] = React.useState(false);
  const before = React.useRef(s.label);
  function begin() { before.current = s.label; setEditing(true); }
  // A step with no name is meaningless; leaving the field blank puts the previous name back.
  function end() { if (!String(s.label).trim()) onPatch({ label: before.current }); setEditing(false); }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(11,16,22,.4)' }}>
      <span style={{ width: 7, height: 7, borderRadius: 999, background: PHASE_TONE[s.phase] || 'var(--text-disabled)', flex: 'none' }}></span>
      <span style={{ flex: '1 1 190px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {editing ? (
          <input
            autoFocus value={s.label} maxLength={80} dir="auto" aria-label={i18n.t('routineRenameStep')}
            onChange={(e) => onPatch({ label: e.target.value })} onBlur={end}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
              // Escape here cancels the rename only - it must not also close the whole dialog.
              if (e.key === 'Escape') { e.stopPropagation(); onPatch({ label: before.current }); setEditing(false); }
            }}
            style={{ height: 32, boxSizing: 'border-box', padding: '0 10px', borderRadius: 6, outline: 'none', background: 'rgba(3,8,7,.55)', color: 'var(--text-primary)', font: 'var(--type-body)', border: '1px solid var(--char-accent)' }}
          />
        ) : (
          <span style={{ font: 'var(--type-body)', color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{s.label}</span>
        )}
        {s.note && !editing && <Caption>{s.note}</Caption>}
      </span>
      <TimeField value={s.time} label={i18n.t('routineStepTimeLabel')} clearLabel={i18n.t('routineClearTime')} onChange={(time) => onPatch({ time })} />
      <span style={{ display: 'flex', gap: 2, flex: 'none' }}>
        <Button variant="ghost" size="sm" icon="edit" aria-label={i18n.t('routineRenameStep')} title={i18n.t('routineRenameStep')} onClick={begin} />
        <Button variant="ghost" size="sm" icon="arrow-up" aria-label={i18n.t('routineMoveUp')} disabled={index === 0} onClick={() => onMove(s.id, -1)} />
        <Button variant="ghost" size="sm" icon="chevron" aria-label={i18n.t('routineMoveDown')} disabled={index === count - 1} onClick={() => onMove(s.id, 1)} />
        <Button variant="danger" size="sm" icon="trash" aria-label={i18n.t('delete')} onClick={() => onRemove(s.id)} />
      </span>
    </div>
  );
}

// The trader's own step: a name, an optional time, and which part of the day/session it belongs to.
function AddOwnStep({ i18n, phases, atLimit, maxSteps, onAdd }) {
  const [label, setLabel] = React.useState('');
  const [time, setTime] = React.useState('');
  const [phase, setPhase] = React.useState(phases[0]);
  // The routine type can change underneath this form; a section the new type does not have is dropped.
  const activePhase = phases.indexOf(phase) > -1 ? phase : phases[0];
  const canAdd = label.trim().length > 0 && !atLimit;
  function submit() {
    if (!canAdd) return;
    onAdd({ label: label.trim(), time, phase: activePhase });
    setLabel(''); setTime('');
  }
  return (
    <div
      onKeyDown={(e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }}
      style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, boxSizing: 'border-box', borderRadius: 8, border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.35)' }}
    >
      <SectionLabel>{i18n.t('routineAddOwn')}</SectionLabel>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <TextField
          style={{ flex: '1 1 220px' }} label={i18n.t('routineStepName')} value={label} dir="auto"
          placeholder={i18n.t('routineStepNamePh')} onChange={(v) => setLabel(v.slice(0, 80))}
        />
        <TextField style={{ flex: '0 1 150px' }} type="time" dir="ltr" label={i18n.t('routineStepTime')} value={time} onChange={setTime} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Caption>{i18n.t('routineStepPhase')}</Caption>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', flex: 1 }}>
          {phases.map((p) => (
            <button key={p} type="button" onClick={() => setPhase(p)} style={PLAIN_BUTTON}>
              <Chip tone={p === activePhase ? 'accent' : 'neutral'}>{i18n.t('routinePhase_' + p)}</Chip>
            </button>
          ))}
        </div>
        <Button variant="primary" size="sm" icon="plus" disabled={!canAdd} onClick={submit}>{i18n.t('routineAddStep')}</Button>
      </div>
      <Caption>{atLimit ? i18n.t('routineMaxSteps', { count: i18n.number(maxSteps) }) : i18n.t('routineTimeHint')}</Caption>
    </div>
  );
}

// Exported (with `initialStep`) so tests/routine-builder-render.test.mjs can render each page of the wizard.
export function BuildView({ i18n, store, draft, setDraft, editingId, onSave, onCancel, initialStep = 1 }) {
  const [step, setStep] = React.useState(initialStep);
  const templates = store.templates();
  const template = templates[draft.template] || templates.blank;
  const library = store.stepLibrary(draft.template);
  const phases = store.phasesFor(draft.template);
  const used = new Set(draft.steps.map((s) => s.id));
  const atLimit = draft.steps.length >= store.MAX_STEPS;
  const hasTimes = draft.steps.some((s) => s.time);
  const stepRef = React.useRef(step);
  const onSaveRef = React.useRef(onSave);
  const bodyTopRef = React.useRef(null);
  stepRef.current = step;
  onSaveRef.current = onSave;
  const rtl = (typeof i18n.direction === 'function' ? i18n.direction() : document.documentElement.dir) === 'rtl';

  // Each step is a fresh page in a scrolling dialog: start it at the top, not wherever the last one ended.
  React.useEffect(() => {
    if (bodyTopRef.current && bodyTopRef.current.scrollIntoView) bodyTopRef.current.scrollIntoView({ block: 'start' });
  }, [step]);

  // Voice/Chat form-interview workflow upgrade: the same shared magic-fill animation every other
  // migrated Journey H1 surface uses, one per real allowlisted field (see the registration effect
  // below for the interview.fields list this mirrors).
  const templateFilled = useAiFieldFill('psychology-routine-editor', 'template');
  const nameFilled = useAiFieldFill('psychology-routine-editor', 'name');
  const daysFilled = useAiFieldFill('psychology-routine-editor', 'days');
  const warnFilled = useAiFieldFill('psychology-routine-editor', 'rules.warn');
  const streakFilled = useAiFieldFill('psychology-routine-editor', 'rules.streak');
  const remindFilled = useAiFieldFill('psychology-routine-editor', 'rules.remind');
  const watchRuleFilled = useAiFieldFill('psychology-routine-editor', 'rules.watch');
  const partialFilled = useAiFieldFill('psychology-routine-editor', 'rules.partial');
  const carryFilled = useAiFieldFill('psychology-routine-editor', 'rules.carry');
  const ruleFilledByKey = { warn: warnFilled, streak: streakFilled, remind: remindFilled, watch: watchRuleFilled, partial: partialFilled, carry: carryFilled };

  const STEPS = [
    { n: 1, title: i18n.t('routineWizard1'), note: i18n.t('routineWizard1Note') },
    { n: 2, title: i18n.t('routineWizard2'), note: i18n.t('routineWizard2Note') },
    { n: 3, title: i18n.t('routineWizard3'), note: i18n.t('routineWizard3Note') },
    { n: 4, title: i18n.t('routineWizard4'), note: i18n.t('routineWizard4Note') }
  ];

  // Seeds the type's own default name, days and steps. Anything the trader already typed or picked
  // by hand (name, days) is kept; the steps are replaced, which pickTemplate() below confirms first
  // when the trader has built or edited them. Voice calls this directly: it has no such steps yet.
  function applyTemplate(key) {
    const t = templates[key];
    setDraft((d) => ({
      ...d, template: key, name: d.nameTouched ? d.name : t.name, days: d.daysTouched ? d.days : t.days.slice(),
      steps: t.steps.map((s) => ({ ...s })), stepsTouched: false
    }));
  }
  function pickTemplate(key) {
    if (key === draft.template) return;
    if (draft.stepsTouched && draft.steps.length && !window.confirm(i18n.t('routineChangeTypeConfirm'))) return;
    applyTemplate(key);
  }
  function toggleDay(key) {
    setDraft((d) => ({ ...d, daysTouched: true, days: d.days.indexOf(key) > -1 ? d.days.filter((x) => x !== key) : d.days.concat([key]) }));
  }

  // Setting a time is the trader saying "tell me when" - so unless they have already made their own
  // call on reminders, the routine's `remind` rule follows. The toggle stays visible right beside
  // the steps (and in step 3) so it is never hidden magic.
  function withAutoRemind(d, timeSet) {
    return timeSet && !d.remindTouched && !d.rules.remind ? { ...d.rules, remind: true } : d.rules;
  }
  function editSteps(d, steps) { return { ...d, steps, stepsTouched: true }; }
  function addStep(s) {
    if (used.has(s.id)) { setDraft((d) => editSteps(d, d.steps.filter((x) => x.id !== s.id))); return; }
    if (atLimit) return;
    setDraft((d) => editSteps(d, d.steps.concat([{ ...s }])));
  }
  function addOwnStep(fields) {
    setDraft((d) => {
      if (d.steps.length >= store.MAX_STEPS) return d;
      const made = store.customStep(fields, d.steps.map((s) => s.id));
      return { ...editSteps(d, d.steps.concat([made])), rules: withAutoRemind(d, !!made.time) };
    });
  }
  function patchStep(id, patch) {
    setDraft((d) => ({
      ...editSteps(d, d.steps.map((s) => (s.id === id ? { ...s, ...patch, ...(patch.time != null ? { time: store.sanitizeTime(patch.time) } : {}) } : s))),
      rules: withAutoRemind(d, !!patch.time)
    }));
  }
  function removeStep(id) { setDraft((d) => editSteps(d, d.steps.filter((s) => s.id !== id))); }
  function move(id, delta) {
    setDraft((d) => {
      const i = d.steps.findIndex((s) => s.id === id), j = i + delta;
      if (i < 0 || j < 0 || j >= d.steps.length) return d;
      const next = d.steps.slice();
      next.splice(j, 0, next.splice(i, 1)[0]);
      return editSteps(d, next);
    });
  }
  function toggleRule(key) {
    if (key === 'remind' && !draft.rules.remind) requestReminderPermission();
    setDraft((d) => ({ ...d, remindTouched: key === 'remind' ? true : d.remindTouched, rules: { ...d.rules, [key]: !d.rules[key] } }));
  }

  // This wizard owns the same draft state for manual and conversational edits. Template is kept
  // as a first-class field because its existing manual handler intentionally seeds the real step
  // list and default name; Voice calls that handler rather than rebuilding either value itself.
  React.useEffect(() => {
    const registry = window.TradeJournalAIProcessRegistry;
    if (!registry) return undefined;
    let mounted = true;
    registry.register('psychology-routine-editor', {
      actionId: 'psychology.routine.create',
      allowlist: ['template', 'name', 'days', 'rules.warn', 'rules.streak', 'rules.remind', 'rules.watch', 'rules.partial', 'rules.carry'],
      isOpen: () => mounted,
      // Voice/Chat form-interview workflow upgrade: real display order follows the wizard's own
      // real step sequence - step 1 (template, name, days, in that on-screen order) then step 3
      // (the six rules, in the same order RULES itself renders them). Step 2 (the step library/
      // step list builder) and step 4 (preview) have no allowlisted paths, so they contribute no
      // interview fields - not an oversight, just nothing there is voice-fillable today. Template
      // options are read from the same store.templates() this view already renders tiles from.
      interview: {
        fields: [
          { path: 'template', order: 101, label: i18n.t('routineWizard1'), help: i18n.t('routineTemplateHint'), type: 'choice', options: Object.keys(templates).map((key) => ({ value: key, label: templates[key].name })), role: 'editable' },
          { path: 'name', order: 102, label: i18n.t('routineName'), type: 'text', role: 'editable' },
          { path: 'days', order: 103, label: i18n.t('routineDays'), type: 'text', role: 'editable' },
          { path: 'rules.warn', order: 301, label: i18n.t('routineRuleWarn'), help: i18n.t('routineRuleWarnBody'), type: 'boolean', role: 'editable' },
          { path: 'rules.streak', order: 302, label: i18n.t('routineRuleStreak'), help: i18n.t('routineRuleStreakBody'), type: 'boolean', role: 'editable' },
          { path: 'rules.remind', order: 303, label: i18n.t('routineRuleRemind'), help: i18n.t('routineRuleRemindBody'), type: 'boolean', role: 'editable' },
          { path: 'rules.watch', order: 304, label: i18n.t('routineRuleWatch'), help: i18n.t('routineRuleWatchBody'), type: 'boolean', role: 'editable' },
          { path: 'rules.partial', order: 305, label: i18n.t('routineRulePartial'), help: i18n.t('routineRulePartialBody'), type: 'boolean', role: 'editable' },
          { path: 'rules.carry', order: 306, label: i18n.t('routineRuleCarry'), help: i18n.t('routineRuleCarryBody'), type: 'boolean', role: 'editable' }
        ]
      },
      activeStep: () => stepRef.current,
      stepForPath: (path) => {
        if (path === 'template' || path === 'name' || path === 'days') return 1;
        if (path.indexOf('rules.') === 0) return 3;
        return null;
      },
      goToStep: (nextStep) => setStep(Math.max(1, Math.min(4, Number(nextStep) || 1))),
      validateValue: (path, value) => {
        if (path === 'template') return !!templates[String(value || '')];
        if (path === 'days') return Array.isArray(value) && value.every((day) => DAY_LABELS.some(([id]) => id === day));
        if (path.indexOf('rules.') === 0) return typeof value === 'boolean';
        return true;
      },
      applyValue: (path, value) => {
        if (path === 'template') { applyTemplate(String(value)); return; }
        if (path === 'name') { setDraft((d) => ({ ...d, name: String(value || ''), nameTouched: true })); return; }
        if (path === 'days') { setDraft((d) => ({ ...d, days: value.slice(), daysTouched: true })); return; }
        if (path.indexOf('rules.') === 0) {
          const key = path.slice('rules.'.length);
          setDraft((d) => ({ ...d, remindTouched: key === 'remind' ? true : d.remindTouched, rules: { ...d.rules, [key]: value } }));
        }
      },
      submit: () => onSaveRef.current()
    });
    return () => { mounted = false; };
    // The state setters are stable and the current submit callback is ref-backed above.
  }, []);

  const RULES = [
    ['warn', i18n.t('routineRuleWarn'), i18n.t('routineRuleWarnBody')],
    ['streak', i18n.t('routineRuleStreak'), i18n.t('routineRuleStreakBody')],
    ['remind', i18n.t('routineRuleRemind'), i18n.t('routineRuleRemindBody')],
    ['watch', i18n.t('routineRuleWatch'), i18n.t('routineRuleWatchBody')],
    ['partial', i18n.t('routineRulePartial'), i18n.t('routineRulePartialBody')],
    ['carry', i18n.t('routineRuleCarry'), i18n.t('routineRuleCarryBody')]
  ];

  const footer = (
    <>
      <Button variant="secondary" disabled={step === 1} onClick={() => setStep((s) => Math.max(1, s - 1))}>{i18n.t('routinePrev')}</Button>
      <Caption style={{ flex: 1, textAlign: 'center' }}>{i18n.t('routineStepOf', { step: i18n.number(step), total: i18n.number(4) })}</Caption>
      {step < 4
        ? <Button variant="primary" onClick={() => setStep((s) => Math.min(4, s + 1))}>{i18n.t('routineNext')}</Button>
        : (
          <Button variant="primary" icon="check" disabled={!draft.steps.length} onClick={onSave}>
            {editingId ? i18n.t('routineSaveChanges') : i18n.t('routineActivate')}
          </Button>
        )}
    </>
  );

  return createPortal(
    <div data-character={currentNavryaCharacter()} dir={rtl ? 'rtl' : 'ltr'}>
      <Modal
        open title={editingId ? i18n.t('routineEdit') : i18n.t('routineBuildTitle')} icon="calendar" width={1040}
        dir={rtl ? 'rtl' : 'ltr'} onClose={onCancel} footer={footer}
      >
        <div ref={bodyTopRef} style={{ display: 'flex', alignItems: 'stretch', gap: 0, flexWrap: 'wrap' }}>
          {STEPS.map((s, i) => {
            const cur = s.n === step, done = s.n < step;
            return (
              <React.Fragment key={s.n}>
                <button
                  type="button" onClick={() => setStep(s.n)}
                  style={{
                    flex: '1 1 170px', display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 14px', boxSizing: 'border-box',
                    borderRadius: 8, cursor: 'pointer', textAlign: 'start', font: 'inherit',
                    border: '1px solid ' + (cur ? 'color-mix(in srgb, var(--char-accent) 55%, transparent)' : done ? 'color-mix(in srgb, var(--char-accent) 28%, transparent)' : 'var(--border-hairline)'),
                    background: cur ? 'var(--char-active-surface)' : done ? 'color-mix(in srgb, var(--char-active-surface) 45%, transparent)' : 'rgba(11,16,22,.4)'
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span className="navrya-tabular" style={{
                      width: 22, height: 22, borderRadius: 999, display: 'grid', placeItems: 'center', flex: 'none',
                      border: '1px solid ' + (cur || done ? 'color-mix(in srgb, var(--char-accent) 60%, transparent)' : 'rgba(244,234,215,.16)'),
                      background: cur ? 'var(--char-accent)' : 'rgba(3,8,7,.6)',
                      font: '600 11px/1 var(--font-display)', color: cur ? 'var(--ink-950)' : done ? 'var(--char-accent)' : 'var(--text-disabled)'
                    }}>{i18n.number(s.n)}</span>
                    <span style={{ font: 'var(--type-body)', color: cur || done ? 'var(--text-primary)' : 'var(--text-muted)' }}>{s.title}</span>
                  </span>
                  <Caption>{s.note}</Caption>
                </button>
                {i < STEPS.length - 1 && <span style={{ width: 12, alignSelf: 'center', height: 1, background: 'var(--divider-gold)', flex: 'none' }}></span>}
              </React.Fragment>
            );
          })}
        </div>

        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Notice tone="accent" icon="sparkle">{i18n.t('routineAnyHint')}</Notice>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <SectionLabel>{i18n.t('routineWizard1')}</SectionLabel>
              <Caption style={{ marginInlineStart: 'auto' }}>{i18n.t('routineTemplateHint')}</Caption>
            </div>
            <AiMagicFill active={templateFilled}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {GROUP_ORDER.map((group) => {
                  const keys = Object.keys(templates).filter((key) => templates[key].group === group);
                  if (!keys.length) return null;
                  return (
                    <div key={group} style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                      <Caption style={{ color: 'var(--text-muted)' }}>{i18n.t('routineGroup_' + group)}</Caption>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10 }}>
                        {keys.map((key) => {
                          const t = templates[key], on = draft.template === key;
                          return (
                            <button
                              key={key} type="button" onClick={() => pickTemplate(key)} aria-pressed={on}
                              style={{
                                display: 'flex', flexDirection: 'column', gap: 8, padding: 14, boxSizing: 'border-box',
                                borderRadius: 8, cursor: 'pointer', textAlign: 'start', font: 'inherit',
                                border: '1px solid ' + (on ? 'color-mix(in srgb, var(--char-accent) 55%, transparent)' : 'var(--border-hairline)'),
                                background: on ? 'color-mix(in srgb, var(--char-active-surface) 70%, transparent)' : 'rgba(11,16,22,.4)'
                              }}
                            >
                              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{
                                  width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', flex: 'none',
                                  color: on ? 'var(--char-accent)' : 'var(--text-muted)', background: 'rgba(3,8,7,.6)',
                                  border: '1px solid ' + (on ? 'color-mix(in srgb, var(--char-accent) 55%, transparent)' : 'var(--border-hairline)')
                                }}><Icon name={t.icon} size={16} /></span>
                                <span style={{ flex: 1, minWidth: 0, font: 'var(--type-body)', color: 'var(--text-primary)' }}>{t.name}</span>
                                {on && <span style={{ color: 'var(--char-accent)', display: 'flex', flex: 'none' }}><Icon name="check" size={14} /></span>}
                              </span>
                              <Caption style={{ lineHeight: '17px' }}>{t.desc}</Caption>
                              {t.steps.length > 0 && <Caption className="navrya-tabular" style={{ color: 'var(--text-muted)' }}>{i18n.t('routineStepCount', { count: i18n.number(t.steps.length) })}</Caption>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </AiMagicFill>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 300px', minWidth: 0 }}>
                <AiMagicFill active={nameFilled} value={draft.name}>
                  <TextField
                    label={i18n.t('routineName')} value={draft.name} dir="auto"
                    onChange={(v) => setDraft((d) => ({ ...d, name: v.slice(0, 60), nameTouched: true }))}
                  />
                </AiMagicFill>
              </div>
              <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                <span style={{ font: 'var(--type-body)', fontSize: 12, color: 'var(--text-primary)' }}>{i18n.t('routineDays')}</span>
                <AiMagicFill active={daysFilled}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {DAY_LABELS.map(([key, label]) => {
                      const on = draft.days.indexOf(key) > -1;
                      return (
                        <button
                          key={key} type="button" onClick={() => toggleDay(key)} aria-pressed={on}
                          style={{
                            flex: 1, height: 44, borderRadius: 6, cursor: 'pointer', display: 'grid', placeItems: 'center', font: 'inherit',
                            border: '1px solid ' + (on ? 'color-mix(in srgb, var(--char-accent) 60%, transparent)' : 'var(--border-hairline)'),
                            background: on ? 'color-mix(in srgb, var(--char-active-surface) 70%, transparent)' : 'rgba(11,16,22,.4)',
                            color: on ? 'var(--char-accent)' : 'var(--text-disabled)'
                          }}
                        >{label}</button>
                      );
                    })}
                  </div>
                </AiMagicFill>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <SectionLabel>{i18n.t('routineWizard2')}</SectionLabel>
              <Chip tone="accent">{i18n.t('routineStepCount', { count: i18n.number(draft.steps.length) })}</Chip>
              <Caption style={{ marginInlineStart: 'auto' }}>{i18n.t('routineLibraryHint')}</Caption>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 440px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <AddOwnStep i18n={i18n} phases={phases} atLimit={atLimit} maxSteps={store.MAX_STEPS} onAdd={addOwnStep} />
                {hasTimes && (
                  <div style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', borderRadius: 8,
                    border: '1px solid ' + (draft.rules.remind ? 'color-mix(in srgb, var(--char-accent) 35%, transparent)' : 'var(--border-hairline)'),
                    background: draft.rules.remind ? 'color-mix(in srgb, var(--char-active-surface) 45%, transparent)' : 'rgba(11,16,22,.4)'
                  }}>
                    <Toggle small checked={!!draft.rules.remind} onChange={() => toggleRule('remind')} />
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ font: 'var(--type-body)', fontSize: 12, color: 'var(--text-primary)' }}>{i18n.t('routineRuleRemind')}</span>
                      <Caption>{i18n.t('routineRuleRemindBody')}</Caption>
                      {draft.rules.remind && reminderPermission() === 'default' && <Caption>{i18n.t('routineNotifyNote')}</Caption>}
                    </span>
                  </div>
                )}
                {draft.steps.length === 0 && <Caption>{i18n.t('routineNoSteps')}</Caption>}
                {draft.steps.map((s, i) => (
                  <StepRow
                    key={s.id} i18n={i18n} s={s} index={i} count={draft.steps.length}
                    onMove={move} onRemove={removeStep} onPatch={(patch) => patchStep(s.id, patch)}
                  />
                ))}
              </div>
              <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 14, padding: 16, boxSizing: 'border-box', borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(11,16,22,.4)' }}>
                <SectionLabel>{i18n.t('routineSuggestionsFor', { type: template.name })}</SectionLabel>
                {library.map((group) => (
                  <div key={group.phase} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <Caption style={{ color: PHASE_TONE[group.phase] }}>{i18n.t('routinePhase_' + group.phase)}</Caption>
                    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                      {group.items.map((s) => (
                        <button key={s.id} type="button" onClick={() => addStep(s)} aria-pressed={used.has(s.id)} style={PLAIN_BUTTON}>
                          <Chip tone={used.has(s.id) ? 'accent' : 'neutral'}>{s.label}</Chip>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <SectionLabel>{i18n.t('routineWizard3')}</SectionLabel>
              <Caption style={{ marginInlineStart: 'auto' }}>{i18n.t('routineWizard3Note')}</Caption>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '11px 16px' }}>
              {RULES.map(([key, title, body]) => (
                <AiMagicFill key={key} active={ruleFilledByKey[key]}>
                  <div style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 15px', borderRadius: 8,
                    border: '1px solid ' + (draft.rules[key] ? 'color-mix(in srgb, var(--char-accent) 35%, transparent)' : 'var(--border-hairline)'),
                    background: draft.rules[key] ? 'color-mix(in srgb, var(--char-active-surface) 45%, transparent)' : 'rgba(11,16,22,.4)'
                  }}>
                    <Toggle small checked={draft.rules[key]} onChange={() => toggleRule(key)} />
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ font: 'var(--type-body)', fontSize: 12, color: 'var(--text-primary)' }}>{title}</span>
                      <Caption>{body}</Caption>
                    </span>
                  </div>
                </AiMagicFill>
              ))}
            </div>
            <Notice tone="warning" icon="honour">{i18n.t('routineNeverLocks')}</Notice>
          </div>
        )}

        {step === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <SectionLabel>{i18n.t('routineWizard4')}</SectionLabel>
              <Caption style={{ marginInlineStart: 'auto' }}>{i18n.t('routinePreviewNote')}</Caption>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 420px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 9, padding: 16, boxSizing: 'border-box', borderRadius: 8, border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.45)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <SectionLabel>{i18n.t('routineToday')}</SectionLabel>
                  <Chip tone="gold">{draft.name}</Chip>
                  <Caption className="navrya-tabular" style={{ marginInlineStart: 'auto' }}>{i18n.t('routineOfTotal', { done: i18n.number(0), total: i18n.number(draft.steps.length) })}</Caption>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '7px 14px' }}>
                  {draft.steps.map((s) => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(11,16,22,.4)' }}>
                      <span style={{ width: 18, height: 18, flex: 'none', borderRadius: 5, border: '1px solid rgba(244,234,215,.18)' }}></span>
                      <span style={{ flex: 1, minWidth: 0, font: 'var(--type-body)', fontSize: 12, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{s.label}</span>
                      {s.time && <span className="navrya-tabular" dir="ltr" style={{ flex: 'none', font: 'var(--type-caption)', color: 'var(--text-dim)', letterSpacing: '.04em' }}>{s.time}</span>}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 16, borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(11,16,22,.4)' }}>
                  <SectionLabel>{i18n.t('routineMeasures')}</SectionLabel>
                  {[i18n.t('routineMeasure1'), i18n.t('routineMeasure2'), i18n.t('routineMeasure3'), i18n.t('routineMeasure4')].map((text) => (
                    <span key={text} style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                      <span style={{ color: 'var(--char-accent)', flex: 'none', display: 'flex', marginTop: 2 }}><Icon name="check" size={14} /></span>
                      <Caption style={{ flex: 1 }}>{text}</Caption>
                    </span>
                  ))}
                </div>
                {!draft.steps.length && <Notice tone="warning" icon="status">{i18n.t('routineNeedsOneStep')}</Notice>}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>,
    document.body
  );
}

// ============================================================================
export function RoutineTab({ i18n, intent, onIntentHandled }) {
  const store = window.TradeJournalRoutineStore;
  const [, forceRerender] = React.useReducer((x) => x + 1, 0);
  const [mode, setMode] = React.useState(null);
  const [draft, setDraft] = React.useState(null);
  // What the popup opened with, so closing it can tell "nothing changed" from "about to lose work".
  const openedWith = React.useRef('');

  React.useEffect(() => {
    function onChange() { forceRerender(); }
    window.addEventListener('tradejournal:routine-changed', onChange);
    return () => window.removeEventListener('tradejournal:routine-changed', onChange);
  }, []);

  const routineHubRef = React.useRef(null);
  React.useEffect(() => {
    window.TradeJournalNavryaRoutineHub = {
      create: () => routineHubRef.current && routineHubRef.current.startNew(),
      editActive: () => routineHubRef.current && routineHubRef.current.startEdit()
    };
    return () => { delete window.TradeJournalNavryaRoutineHub; };
  }, []);

  // The Psychology overview's "Build one" / "Edit" buttons switch to this tab and ask for the popup
  // in the same click; the tab mounts fresh, so the request arrives as a prop.
  React.useEffect(() => {
    if (!intent) return;
    const hub = routineHubRef.current;
    if (hub) { if (intent === 'edit') hub.startEdit(); else hub.startNew(); }
    if (onIntentHandled) onIntentHandled();
  }, [intent]);

  if (!store) return null;
  const routine = store.active();

  function open(nextDraft) {
    openedWith.current = JSON.stringify(nextDraft);
    setDraft(nextDraft);
    setMode('build');
  }
  function close() { setMode(null); setDraft(null); }
  // Escape, the scrim and the X all land here: leaving a half-built routine by accident is the one
  // way this popup can cost the trader real work, so an edited draft asks first.
  function requestClose() {
    if (draft && JSON.stringify(draft) !== openedWith.current && !window.confirm(i18n.t('routineDiscardConfirm'))) return;
    close();
  }
  function startNew() {
    const preset = store.templates().hunter;
    open({
      template: 'hunter', name: preset.name, nameTouched: false, days: preset.days.slice(), daysTouched: false,
      stepsTouched: false, remindTouched: false, session: 'london', steps: preset.steps.map((s) => ({ ...s })),
      rules: store.defaultRules(), editingId: null
    });
  }
  function startEdit() {
    if (!routine) { startNew(); return; }
    // An existing routine's steps, days and reminder choice are decisions the trader already made.
    open({
      template: routine.template, name: routine.name, nameTouched: true, days: routine.days.slice(), daysTouched: true,
      stepsTouched: true, remindTouched: true, session: routine.session, steps: routine.steps.map((s) => ({ ...s })),
      rules: { ...routine.rules }, editingId: routine.id
    });
  }
  function save() {
    if (!draft) return;
    // This click is the user gesture browsers require before they will ask about notifications.
    if (draft.rules.remind) requestReminderPermission();
    if (draft.editingId) store.update(draft.editingId, { name: draft.name, template: draft.template, days: draft.days, session: draft.session, steps: draft.steps, rules: draft.rules });
    else store.create(draft);
    close();
  }

  routineHubRef.current = { startNew, startEdit };

  const builder = mode === 'build' && draft
    ? <BuildView i18n={i18n} store={store} draft={draft} setDraft={setDraft} editingId={draft.editingId} onSave={save} onCancel={requestClose} />
    : null;

  // No routine yet: the empty state IS the invitation to build one. The popup opens over it.
  if (!routine) {
    return (
      <>
      <Panel variant="prestige" ornament texture padding="18px 20px 20px">
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <span style={{ width: 44, height: 44, flex: 'none', borderRadius: 999, border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.55)', display: 'grid', placeItems: 'center', color: 'var(--char-accent)' }}>
            <Icon name="calendar" size={22} />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 320px', minWidth: 0 }}>
            <span style={{ font: 'var(--type-display-md)', color: 'var(--text-primary)', letterSpacing: 'var(--tracking-display)' }}>{i18n.t('routineEmptyTitle')}</span>
            <span style={{ font: 'var(--type-body)', color: 'var(--text-muted)', textWrap: 'pretty' }}>{i18n.t('routineEmptyBody')}</span>
          </div>
          <Button variant="primary" icon="plus" onClick={startNew} style={{ flex: 'none' }}>{i18n.t('routineBuildFirst')}</Button>
        </div>
      </Panel>
      {builder}
      </>
    );
  }

  return (
    <>
      <TodayView i18n={i18n} store={store} routine={routine} onEdit={startEdit} onNew={startNew} />
      {builder}
    </>
  );
}
