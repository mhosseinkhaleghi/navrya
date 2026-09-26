import assert from 'node:assert/strict';
import test from 'node:test';

import { buildFormVoice, fieldStatesFor, formVoiceFingerprint, answerText, CALM_PROCESS, MAX_CHOICES } from '../navrya-src/dockFormVoice.js';

// Voice while a form is open (ChatDock design plates XIV-XVIII): the model behind the voice bar, the
// sidecar's checklist, the peek's choices and the field states drawn on the real form. Pure - the
// registry, the workflow and the confirmation state are injected.

const cities = ['London', 'New York', 'Tokyo', 'Sydney'].map((c) => ({ value: c, label: c }));
const sessionFields = [
  { path: 'city', order: 10, label: 'سشن معاملاتی', type: 'choice', required: true, options: cities },
  { path: 'timeframe', order: 20, label: 'تایم‌فریم اصلی', type: 'choice', required: true, options: ['5m', '15m', '1h', '4h', '1D'].map((v) => ({ value: v, label: v })) },
  { path: 'instrument', order: 30, label: 'نماد', type: 'text', required: true },
  { path: 'gregorian', order: 40, label: 'تاریخ میلادی', type: 'date', ask: false },
  { path: 'loop', order: 50, label: 'لوپ', type: 'number', ask: false }
];

function registryOf(id, fields) {
  return {
    activeOpenProcess: () => (id ? { id, allowlist: fields.map((f) => f.path) } : null),
    visibleInterviewFields: (processId) => (processId === id ? fields : [])
  };
}

const labels = { askEach: 'هر فیلد را بپرس', direct: 'مستقیم', yes: 'بله', no: 'نه', confirmYes: 'بله، ثبت کن', confirmNo: 'نه' };

test('nothing open, or a form with no interview metadata, is no model at all', () => {
  assert.equal(buildFormVoice({ registry: registryOf(null, []) }), null);
  assert.equal(buildFormVoice({ registry: registryOf('plain-form', []) }), null);
  assert.equal(buildFormVoice({}), null);
  assert.equal(buildFormVoice(null), null);
});

test('progress counts the form\'s ASKED questions only: the required trio, not the dates the app fills itself', () => {
  const fv = buildFormVoice({ registry: registryOf('session-create', sessionFields), labels });
  assert.equal(fv.total, 3);
  assert.equal(fv.index, 1);
  assert.deepEqual(fv.fields.map((f) => f.path), ['city', 'timeframe', 'instrument']);
  assert.equal(fv.current.path, 'city');
  assert.equal(fv.current.label, 'سشن معاملاتی');
  assert.deepEqual(fv.fields.map((f) => f.state), ['current', 'todo', 'todo']);
});

test('the question index follows what the assistant has filled - the same "first unanswered field" the model is told to ask', () => {
  const workflow = { processId: 'session-create', known: { city: 'New York' } };
  const fv = buildFormVoice({ registry: registryOf('session-create', sessionFields), workflow, labels });
  assert.equal(fv.index, 2);
  assert.equal(fv.current.path, 'timeframe');
  assert.deepEqual(fv.fields.map((f) => [f.path, f.state, f.valueText]), [['city', 'done', 'New York'], ['timeframe', 'current', ''], ['instrument', 'todo', '']]);
  assert.equal(fv.engaged, true, 'a workflow is driving this form');
  assert.equal(buildFormVoice({ registry: registryOf('session-create', sessionFields), labels }).engaged, false, 'a form only the user is filling is left alone');
  assert.equal(buildFormVoice({ registry: registryOf('session-create', sessionFields), labels, voiceActive: true }).engaged, true);
  // a workflow for ANOTHER process is not this form's answers
  assert.equal(buildFormVoice({ registry: registryOf('session-create', sessionFields), workflow: { processId: 'x', known: { city: 'Tokyo' } }, labels }).index, 1);
});

test('a choice field offers its real options as quick choices (up to six), a boolean offers yes / no, anything else offers none', () => {
  const fv = buildFormVoice({ registry: registryOf('session-create', sessionFields), labels });
  assert.deepEqual(fv.choices.map((c) => c.label), ['London', 'New York', 'Tokyo', 'Sydney']);
  const many = { path: 'k', order: 1, label: 'K', type: 'choice', options: Array.from({ length: MAX_CHOICES + 1 }, (_, i) => ({ value: i, label: 'o' + i })) };
  assert.deepEqual(buildFormVoice({ registry: registryOf('f', [many]), labels }).choices, [], 'a long list is not turned into a wall of chips');
  const bool = { path: 'b', order: 1, label: 'B', type: 'boolean' };
  assert.deepEqual(buildFormVoice({ registry: registryOf('f', [bool]), labels }).choices.map((c) => c.value), [true, false]);
  const text = { path: 't', order: 1, label: 'T', type: 'text' };
  assert.deepEqual(buildFormVoice({ registry: registryOf('f', [text]), labels }).choices, []);
});

test('a skipped field is passed over (and never asked again); skipping everything finishes the form', () => {
  const skip = (id) => (id === 'session-create' ? ['city'] : []);
  const fv = buildFormVoice({ registry: registryOf('session-create', sessionFields), skipped: skip, labels });
  assert.equal(fv.current.path, 'timeframe');
  assert.equal(fv.fields[0].state, 'skipped');
  assert.equal(fv.index, 2);
  const all = buildFormVoice({ registry: registryOf('f', [sessionFields[0]]), skipped: ['city'], labels });
  assert.equal(all.finished, true);
  assert.equal(all.current, null);
});

test('"ask every field": the value waits for the user\'s OK - the pending field is the one being answered, with yes / no as the choices', () => {
  const pendingWrite = { processId: 'session-create', path: 'city', value: 'Tokyo' };
  const fv = buildFormVoice({ registry: registryOf('session-create', sessionFields), pendingWrite, confirmMode: 'ask_each', labels });
  assert.equal(fv.current.path, 'city');
  assert.equal(fv.fields[0].state, 'pending');
  assert.equal(fv.pending.valueText, 'Tokyo');
  assert.deepEqual(fv.choices.map((c) => c.kind), ['confirm', 'reject']);
  assert.equal(fv.canSkip, false, 'a value waiting for OK is not skipped');
  assert.deepEqual(fv.modeChips.map((c) => c.label), ['هر فیلد را بپرس']);
  assert.deepEqual(buildFormVoice({ registry: registryOf('session-create', sessionFields), labels }).modeChips.map((c) => c.tone), ['gold']);
  assert.equal(buildFormVoice({ registry: registryOf('session-create', sessionFields), pendingWrite: { ...pendingWrite, processId: 'other' }, labels }).fields[0].state, 'current');
});

test('skip is offered for an optional field - and, in the calm psychology forms, for every question', () => {
  const opt = { path: 'note', order: 1, label: 'یادداشت', type: 'text' };
  assert.equal(buildFormVoice({ registry: registryOf('account-manual-form', [opt]), labels }).canSkip, true);
  const req = { path: 'name', order: 1, label: 'نام', type: 'text', required: true };
  assert.equal(buildFormVoice({ registry: registryOf('account-manual-form', [req]), labels }).canSkip, false);
  const intake = buildFormVoice({ registry: registryOf('mh-intake', [req]), labels });
  assert.equal(intake.calm, true);
  assert.equal(intake.canSkip, true);
  for (const id of ['mh-intake', 'mh-post-trade-reflection', 'mh-pre-session-checkin', 'psychology-mood-log', 'trade-emotion-log']) assert.match(id, CALM_PROCESS);
  assert.doesNotMatch('session-create', CALM_PROCESS);
});

test('gates and resolution-only fields are not questions of the form', () => {
  const fields = [
    { path: 'name', order: 1, label: 'نام', type: 'text' },
    { path: 'accountName', order: 2, label: 'حساب', role: 'resolution' },
    { path: 'save', order: 9, label: 'ذخیره', role: 'gate' }
  ];
  const fv = buildFormVoice({ registry: registryOf('f', fields), labels });
  assert.deepEqual(fv.fields.map((f) => f.path), ['name']);
});

test('the field states drawn on the real form: filled, pending, and the current field as asking - or hearing, with the live words', () => {
  const workflow = { processId: 'session-create', known: { city: 'New York' } };
  const fv = buildFormVoice({ registry: registryOf('session-create', sessionFields), workflow, labels });
  assert.deepEqual(fieldStatesFor(fv, '', false), [
    { path: 'city', label: 'سشن معاملاتی', state: 'filled' },
    { path: 'timeframe', label: 'تایم‌فریم اصلی', state: 'asking', heard: '' }
  ]);
  assert.deepEqual(fieldStatesFor(fv, 'پانزده دقیقه', true)[1], { path: 'timeframe', label: 'تایم‌فریم اصلی', state: 'hearing', heard: 'پانزده دقیقه' });
  assert.equal(fieldStatesFor(fv, 'x', true)[1].state, 'hearing');
  assert.equal(fieldStatesFor(fv, '', true)[1].state, 'asking', 'nothing heard yet: still asking');
  const pending = buildFormVoice({ registry: registryOf('session-create', sessionFields), pendingWrite: { processId: 'session-create', path: 'city', value: 'Tokyo' }, labels });
  assert.deepEqual(fieldStatesFor(pending, '', false)[0], { path: 'city', label: 'سشن معاملاتی', state: 'pending', valueText: 'Tokyo' });
  assert.deepEqual(fieldStatesFor(null, '', false), []);
});

test('answers read as the option\'s own label, a check for a boolean, the value otherwise', () => {
  assert.equal(answerText({ options: [{ value: 'prop', label: 'حساب فرم' }] }, 'prop'), 'حساب فرم');
  assert.equal(answerText({}, true), '✓');
  assert.equal(answerText({}, false), '—');
  assert.equal(answerText({}, 100000), '100000');
  assert.equal(answerText({}, ['a', 'b']), 'a, b');
  assert.equal(answerText({}, { a: 1 }), '');
  assert.equal(answerText({}, ''), '');
});

test('the fingerprint changes when the model really changes - and only then', () => {
  const base = buildFormVoice({ registry: registryOf('session-create', sessionFields), labels });
  const same = buildFormVoice({ registry: registryOf('session-create', sessionFields), labels });
  assert.equal(formVoiceFingerprint(base), formVoiceFingerprint(same));
  const moved = buildFormVoice({ registry: registryOf('session-create', sessionFields), workflow: { processId: 'session-create', known: { city: 'Tokyo' } }, labels });
  assert.notEqual(formVoiceFingerprint(base), formVoiceFingerprint(moved));
  assert.equal(formVoiceFingerprint(null), '');
});
