// The view-model of "voice while a form is open" (ChatDock capsule design, plates XIV-XVIII): which
// question is being asked, how far along the form is, what is already filled, what waits for the
// user's OK, and the quick choices - everything the voice bar, the sidecar, the peek's choices and the
// field states on the real form draw. Pure and injectable: the registry, the workflow and the
// confirmation state come in as arguments, so tests/chatdock-form-voice.test.mjs drives it as data.
//
// It reads exactly what the deterministic interview already uses (docs/ai/form-interview-contract.md):
// the process registry's `visibleInterviewFields()` in the form's own display order, and the current
// workflow's `known` answers. "Which field is next" is therefore the SAME answer sendChat() gives the
// model as `activeProcess.nextQuestion` - the bar can never say one thing while the assistant asks
// another. It never invents a field, a label or an option.

// Psychology forms speak softer (plate XVIII "calm mode"): the intake, the post-trade reflection, the
// pre-session check-in, the mood / emotion logs.
export const CALM_PROCESS = /^(mh-|psychology-|trade-emotion-log)/;

// Option lists longer than this are not offered as chips: the bar would turn into a form of its own.
export const MAX_CHOICES = 6;

function isAnswered(value) { return value !== undefined && value !== null && value !== ''; }

function optionLabel(field, value) {
  const options = field && Array.isArray(field.options) ? field.options : null;
  if (options) {
    for (let i = 0; i < options.length; i += 1) {
      const option = options[i];
      if (option && String(option.value) === String(value)) return String(option.label != null ? option.label : option.value);
    }
  }
  return null;
}

// What an answer looks like in the checklist / on the receipt: the option's own label for a choice,
// a check for a boolean, the value itself otherwise.
export function answerText(field, value) {
  if (!isAnswered(value)) return '';
  const label = optionLabel(field, value);
  if (label) return label;
  if (typeof value === 'boolean') return value ? '✓' : '—';
  if (Array.isArray(value)) return value.map((v) => optionLabel(field, v) || String(v)).join(', ');
  if (typeof value === 'object') return '';
  return String(value);
}

function isEditable(field) { return !field.role || field.role === 'editable'; }

/* input: {
     registry, workflow, pendingWrite, skipped (paths, or (processId) => paths), title, confirmMode ('direct'|'ask_each'),
     questionText, said[], voiceActive,
     labels: { askEach, direct, yes, no, confirmYes, confirmNo }
   } */
export function buildFormVoice(input) {
  const o = input || {};
  const registry = o.registry;
  if (!registry || typeof registry.activeOpenProcess !== 'function' || typeof registry.visibleInterviewFields !== 'function') return null;
  const active = registry.activeOpenProcess();
  if (!active || !active.id) return null;
  const all = registry.visibleInterviewFields(active.id) || [];
  // The form's own questions: real, editable, asked ones. A gate (the final "create it?") and a
  // resolution-only field are not questions of the form, and `ask: false` fields (dates the app fills
  // itself) are shown as done rather than asked.
  const editable = all.filter((f) => isEditable(f));
  const askable = editable.filter((f) => f.ask !== false);
  if (!askable.length) return null;

  const workflow = o.workflow && o.workflow.processId === active.id ? o.workflow : null;
  const known = workflow && workflow.known ? workflow.known : {};
  const skipped = new Set(typeof o.skipped === 'function' ? (o.skipped(active.id) || []) : (Array.isArray(o.skipped) ? o.skipped : []));
  const pending = o.pendingWrite && o.pendingWrite.processId === active.id ? o.pendingWrite : null;
  const labels = o.labels || {};

  // Each question is answered (by the assistant), skipped, waiting for the user's OK, or still to come;
  // the one being asked is the pending confirmation if there is one, otherwise the first still to come.
  const states = askable.map((field) => {
    if (pending && pending.path === field.path) return 'pending';
    if (isAnswered(known[field.path])) return 'done';
    if (skipped.has(field.path)) return 'skipped';
    return 'todo';
  });
  let currentIndex = states.indexOf('pending');
  if (currentIndex < 0) currentIndex = states.indexOf('todo');
  const fields = askable.map((field, i) => ({
    path: field.path,
    label: field.label || field.path,
    state: i === currentIndex && states[i] === 'todo' ? 'current' : states[i],
    valueText: states[i] === 'done' ? answerText(field, known[field.path]) : ''
  }));
  const current = currentIndex >= 0 ? fields[currentIndex] : null;
  const currentField = currentIndex >= 0 ? askable[currentIndex] : null;
  const index = current ? currentIndex + 1 : fields.length;
  let choices = [];
  if (pending) {
    choices = [
      { value: 'confirm', kind: 'confirm', label: labels.confirmYes || '' },
      { value: 'reject', kind: 'reject', label: labels.confirmNo || '' }
    ].filter((c) => c.label);
  } else if (currentField) {
    if (currentField.type === 'choice' && Array.isArray(currentField.options) && currentField.options.length >= 2 && currentField.options.length <= MAX_CHOICES) {
      choices = currentField.options.map((opt) => ({ value: opt.value, label: String(opt.label != null ? opt.label : opt.value) }));
    } else if (currentField.type === 'boolean' && labels.yes && labels.no) {
      choices = [{ value: true, label: labels.yes }, { value: false, label: labels.no }];
    }
  }

  const calm = CALM_PROCESS.test(active.id);
  const askEach = o.confirmMode === 'ask_each';
  const modeLabel = askEach ? labels.askEach : labels.direct;
  return {
    processId: active.id,
    title: o.title || '',
    calm,
    index,
    total: fields.length,
    current: currentField
      ? { path: currentField.path, label: currentField.label || currentField.path, help: currentField.help || null, type: currentField.type || null, options: currentField.options || null, required: !!currentField.required }
      : null,
    fields,
    // Every label of the form's interview fields (asked or not) - the field-state overlay uses them to never match a
    // label to its neighbour.
    allLabels: all.map((f) => f.label).filter(Boolean),
    choices,
    pending: pending ? { path: pending.path, valueText: answerText(currentField, pending.value) } : null,
    finished: !current,
    // The assistant is actually working on this form (a workflow drives it, or a voice session is live):
    // only then are the field states and the quick choices drawn - a form the user fills by hand alone
    // is left as it is.
    engaged: !!workflow || !!o.voiceActive,
    questionText: o.questionText || '',
    said: Array.isArray(o.said) ? o.said : [],
    modeChips: modeLabel ? [{ key: 'mode', tone: askEach ? 'neutral' : 'gold', icon: askEach ? 'check' : 'zap', label: modeLabel }] : [],
    // A field the user may pass over: an optional one - or any, in the calm psychology forms, where
    // "skip this question" is always available.
    canSkip: !!currentField && !pending && (calm || !currentField.required)
  };
}

// The states drawn on the REAL form's fields (dockFieldStates.js): the field being asked (or heard),
// what the assistant has filled, and what waits for the user's OK.
export function fieldStatesFor(formVoice, heardText, hearing) {
  if (!formVoice) return [];
  const out = [];
  formVoice.fields.forEach((f) => {
    if (f.state === 'done') out.push({ path: f.path, label: f.label, state: 'filled' });
    else if (f.state === 'pending') out.push({ path: f.path, label: f.label, state: 'pending', valueText: formVoice.pending ? formVoice.pending.valueText : '' });
    else if (f.state === 'current') out.push({ path: f.path, label: f.label, state: hearing && heardText ? 'hearing' : 'asking', heard: hearing ? heardText : '' });
  });
  return out;
}

// A cheap change detector so the polling loop only re-renders when the model really changed.
export function formVoiceFingerprint(formVoice) {
  if (!formVoice) return '';
  return JSON.stringify([
    formVoice.processId, formVoice.index, formVoice.total, formVoice.pending && formVoice.pending.path, formVoice.canSkip,
    formVoice.fields.map((f) => f.path + ':' + f.state + ':' + f.valueText), formVoice.choices.map((c) => c.label)
  ]);
}
