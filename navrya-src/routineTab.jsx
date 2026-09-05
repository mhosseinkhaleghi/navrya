import React from 'react';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { Chip } from '../public/pages/shared/navrya/components/forms/Chip.jsx';
import { TextField } from '../public/pages/shared/navrya/components/forms/TextField.jsx';
import { Notice } from '../public/pages/shared/navrya/components/feedback/Notice.jsx';
import { MetricRow } from '../public/pages/shared/navrya/components/metrics/MetricRow.jsx';

// The ROUTINE tab (RoutineNew.dc.html / Routine.dc.html on the approved canvas). Everything it
// stores goes through routine-store.js, which persists on the same server-authoritative
// preferences domain psychology-store.js already uses - no new table, no localStorage.
//
// Two modes share this one component deliberately, because they are the same object seen at two
// moments: `today` (the checklist the trader ticks) and `build` (the four-step wizard). The
// wizard is not a modal - a routine is a document you edit, and a modal would lose the
// side-by-side preview that makes step 4 worth having.

function SectionLabel({ children, style }) {
  return <span style={{ font: 'var(--type-section-label)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-muted)', textTransform: 'uppercase', ...style }}>{children}</span>;
}
function Caption({ children, style }) {
  return <span style={{ font: 'var(--type-caption)', color: 'var(--text-dim)', letterSpacing: '.04em', ...style }}>{children}</span>;
}

const PHASE_TONE = {
  pre: 'var(--gold-warm)', mind: 'var(--char-accent)', during: 'var(--warning)',
  post: 'var(--info)', weekly: '#A965D8'
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

  const phases = ['pre', 'mind', 'during', 'post', 'weekly']
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
// BUILD - the four-step wizard
// ============================================================================
function BuildView({ i18n, store, draft, setDraft, editingId, onSave, onCancel }) {
  const [step, setStep] = React.useState(1);
  const templates = store.templates();
  const library = store.stepLibrary();
  const used = new Set(draft.steps.map((s) => s.id));
  const stepRef = React.useRef(step);
  const onSaveRef = React.useRef(onSave);
  stepRef.current = step;
  onSaveRef.current = onSave;

  const STEPS = [
    { n: 1, title: i18n.t('routineWizard1'), note: i18n.t('routineWizard1Note') },
    { n: 2, title: i18n.t('routineWizard2'), note: i18n.t('routineWizard2Note') },
    { n: 3, title: i18n.t('routineWizard3'), note: i18n.t('routineWizard3Note') },
    { n: 4, title: i18n.t('routineWizard4'), note: i18n.t('routineWizard4Note') }
  ];

  function pickTemplate(key) {
    setDraft((d) => ({ ...d, template: key, name: d.nameTouched ? d.name : templates[key].name, steps: templates[key].steps.map((s) => ({ ...s })) }));
  }
  function toggleDay(key) {
    setDraft((d) => ({ ...d, days: d.days.indexOf(key) > -1 ? d.days.filter((x) => x !== key) : d.days.concat([key]) }));
  }
  function addStep(s) {
    if (used.has(s.id)) { setDraft((d) => ({ ...d, steps: d.steps.filter((x) => x.id !== s.id) })); return; }
    setDraft((d) => ({ ...d, steps: d.steps.concat([{ ...s }]) }));
  }
  function removeStep(id) { setDraft((d) => ({ ...d, steps: d.steps.filter((s) => s.id !== id) })); }
  function move(id, delta) {
    setDraft((d) => {
      const i = d.steps.findIndex((s) => s.id === id), j = i + delta;
      if (i < 0 || j < 0 || j >= d.steps.length) return d;
      const next = d.steps.slice();
      next.splice(j, 0, next.splice(i, 1)[0]);
      return { ...d, steps: next };
    });
  }
  function toggleRule(key) { setDraft((d) => ({ ...d, rules: { ...d.rules, [key]: !d.rules[key] } })); }

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
        if (path === 'template') { pickTemplate(String(value)); return; }
        if (path === 'name') { setDraft((d) => ({ ...d, name: String(value || ''), nameTouched: true })); return; }
        if (path === 'days') { setDraft((d) => ({ ...d, days: value.slice() })); return; }
        if (path.indexOf('rules.') === 0) {
          const key = path.slice('rules.'.length);
            setDraft((d) => ({ ...d, rules: { ...d.rules, [key]: value } }));
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, flexWrap: 'wrap' }}>
        {STEPS.map((s, i) => {
          const cur = s.n === step, done = s.n < step;
          return (
            <React.Fragment key={s.n}>
              <button
                type="button" onClick={() => setStep(s.n)}
                style={{
                  flex: '1 1 180px', display: 'flex', flexDirection: 'column', gap: 6, padding: '14px 16px', boxSizing: 'border-box',
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
              {i < STEPS.length - 1 && <span style={{ width: 16, alignSelf: 'center', height: 1, background: 'var(--divider-gold)', flex: 'none' }}></span>}
            </React.Fragment>
          );
        })}
      </div>

      {step === 1 && (
        <Panel variant="base" ornament padding="18px 20px 20px">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <SectionLabel>{i18n.t('routineWizard1')}</SectionLabel>
              <Caption style={{ marginInlineStart: 'auto' }}>{i18n.t('routineTemplateHint')}</Caption>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 12 }}>
              {Object.keys(templates).map((key) => {
                const t = templates[key], on = draft.template === key;
                return (
                  <button
                    key={key} type="button" onClick={() => pickTemplate(key)}
                    style={{
                      display: 'flex', flexDirection: 'column', gap: 10, padding: 16, boxSizing: 'border-box',
                      borderRadius: 8, cursor: 'pointer', textAlign: 'start', font: 'inherit',
                      border: '1px solid ' + (on ? 'color-mix(in srgb, var(--char-accent) 55%, transparent)' : 'var(--border-hairline)'),
                      background: on ? 'color-mix(in srgb, var(--char-active-surface) 70%, transparent)' : 'rgba(11,16,22,.4)'
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 999, background: on ? 'var(--char-accent)' : 'var(--text-disabled)', flex: 'none' }}></span>
                      <span style={{ font: 'var(--type-body)', color: 'var(--text-primary)' }}>{t.name}</span>
                    </span>
                    <Caption className="navrya-tabular">{i18n.t('routineStepCount', { count: i18n.number(t.steps.length) })}</Caption>
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
              <TextField
                label={i18n.t('routineName')} value={draft.name} style={{ flex: '1 1 300px' }}
                onChange={(v) => setDraft((d) => ({ ...d, name: v, nameTouched: true }))}
              />
              <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                <span style={{ font: 'var(--type-body)', fontSize: 12, color: 'var(--text-primary)' }}>{i18n.t('routineDays')}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {DAY_LABELS.map(([key, label]) => {
                    const on = draft.days.indexOf(key) > -1;
                    return (
                      <button
                        key={key} type="button" onClick={() => toggleDay(key)}
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
              </div>
            </div>
          </div>
        </Panel>
      )}

      {step === 2 && (
        <Panel variant="base" ornament padding="18px 20px 20px">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <SectionLabel>{i18n.t('routineWizard2')}</SectionLabel>
              <Chip tone="accent">{i18n.t('routineStepCount', { count: i18n.number(draft.steps.length) })}</Chip>
              <Caption style={{ marginInlineStart: 'auto' }}>{i18n.t('routineLibraryHint')}</Caption>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 420px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {draft.steps.length === 0 && <Caption>{i18n.t('routineNoSteps')}</Caption>}
                {draft.steps.map((s, i) => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(11,16,22,.4)' }}>
                    <span style={{ width: 7, height: 7, borderRadius: 999, background: PHASE_TONE[s.phase] || 'var(--text-disabled)', flex: 'none' }}></span>
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ font: 'var(--type-body)', color: 'var(--text-primary)' }}>{s.label}</span>
                      {s.note && <Caption>{s.note}</Caption>}
                    </span>
                    {s.time && <Caption className="navrya-tabular" style={{ flex: 'none' }}>{s.time}</Caption>}
                    <span style={{ display: 'flex', gap: 4, flex: 'none' }}>
                      <Button variant="ghost" size="sm" icon="arrow-up" aria-label={i18n.t('routineMoveUp')} disabled={i === 0} onClick={() => move(s.id, -1)} />
                      <Button variant="ghost" size="sm" icon="chevron" aria-label={i18n.t('routineMoveDown')} disabled={i === draft.steps.length - 1} onClick={() => move(s.id, 1)} />
                      <Button variant="danger" size="sm" icon="trash" aria-label={i18n.t('delete')} onClick={() => removeStep(s.id)} />
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 14, padding: 16, boxSizing: 'border-box', borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(11,16,22,.4)' }}>
                <SectionLabel>{i18n.t('routineLibrary')}</SectionLabel>
                {library.map((group) => (
                  <div key={group.phase} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <Caption style={{ color: PHASE_TONE[group.phase] }}>{i18n.t('routinePhase_' + group.phase)}</Caption>
                    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                      {group.items.map((s) => (
                        <button key={s.id} type="button" onClick={() => addStep(s)} style={{ padding: 0, border: 0, background: 'transparent', cursor: 'pointer', font: 'inherit' }}>
                          <Chip tone={used.has(s.id) ? 'accent' : 'neutral'}>{s.label}</Chip>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Panel>
      )}

      {step === 3 && (
        <Panel variant="base" ornament padding="18px 20px 20px">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <SectionLabel>{i18n.t('routineWizard3')}</SectionLabel>
              <Caption style={{ marginInlineStart: 'auto' }}>{i18n.t('routineWizard3Note')}</Caption>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '11px 16px' }}>
              {RULES.map(([key, title, body]) => (
                <div key={key} style={{
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
              ))}
            </div>
            <Notice tone="warning" icon="honour">{i18n.t('routineNeverLocks')}</Notice>
          </div>
        </Panel>
      )}

      {step === 4 && (
        <Panel variant="active" ornament padding="18px 20px 20px">
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
                      <span style={{ flex: 1, minWidth: 0, font: 'var(--type-body)', fontSize: 12, color: 'var(--text-primary)' }}>{s.label}</span>
                      {s.time && <Caption className="navrya-tabular" style={{ flex: 'none' }}>{s.time}</Caption>}
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
                <div style={{ display: 'flex', gap: 10 }}>
                  <Button variant="secondary" style={{ flex: 1 }} onClick={onCancel}>{i18n.t('cancel')}</Button>
                  <Button variant="primary" icon="check" style={{ flex: 1 }} disabled={!draft.steps.length} onClick={onSave}>
                    {editingId ? i18n.t('routineSaveChanges') : i18n.t('routineActivate')}
                  </Button>
                </div>
                {!draft.steps.length && <Caption style={{ textAlign: 'center' }}>{i18n.t('routineNeedsOneStep')}</Caption>}
              </div>
            </div>
          </div>
        </Panel>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Button variant="secondary" disabled={step === 1} onClick={() => setStep((s) => Math.max(1, s - 1))}>{i18n.t('routinePrev')}</Button>
        <Caption style={{ flex: 1, textAlign: 'center' }}>{i18n.t('routineStepOf', { step: i18n.number(step), total: i18n.number(4) })}</Caption>
        {step < 4
          ? <Button variant="primary" onClick={() => setStep((s) => Math.min(4, s + 1))}>{i18n.t('routineNext')}</Button>
          : <Button variant="secondary" onClick={onCancel}>{i18n.t('cancel')}</Button>}
      </div>
    </div>
  );
}

// ============================================================================
export function RoutineTab({ i18n }) {
  const store = window.TradeJournalRoutineStore;
  const [, forceRerender] = React.useReducer((x) => x + 1, 0);
  const [mode, setMode] = React.useState(null);
  const [draft, setDraft] = React.useState(null);

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

  if (!store) return null;
  const routine = store.active();

  function startNew() {
    const preset = store.templates().hunter;
    setDraft({ template: 'hunter', name: preset.name, nameTouched: false, days: ['sat', 'sun', 'mon', 'tue', 'wed'], session: 'london', steps: preset.steps.map((s) => ({ ...s })), rules: store.defaultRules(), editingId: null });
    setMode('build');
  }
  function startEdit() {
    setDraft({ template: routine.template, name: routine.name, nameTouched: true, days: routine.days.slice(), session: routine.session, steps: routine.steps.map((s) => ({ ...s })), rules: { ...routine.rules }, editingId: routine.id });
    setMode('build');
  }
  function save() {
    if (draft.editingId) store.update(draft.editingId, { name: draft.name, template: draft.template, days: draft.days, session: draft.session, steps: draft.steps, rules: draft.rules });
    else store.create(draft);
    setMode(null); setDraft(null);
  }

  routineHubRef.current = { startNew, startEdit };

  // No routine yet, and not mid-build: the empty state IS the invitation to build one.
  if (!routine && mode !== 'build') {
    return (
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
    );
  }

  if (mode === 'build') {
    return <BuildView i18n={i18n} store={store} draft={draft} setDraft={setDraft} editingId={draft.editingId} onSave={save} onCancel={() => { setMode(null); setDraft(null); }} />;
  }

  return <TodayView i18n={i18n} store={store} routine={routine} onEdit={startEdit} onNew={startNew} />;
}
