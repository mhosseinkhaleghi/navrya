import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = file => readFile(shared(file), 'utf8');

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.has(key) ? values.get(key) : null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key), key: index => Array.from(values.keys())[index] || null, get length() { return values.size; } };
}

// routine-store.js persists through window.TradeJournalUserPreferences exactly the way
// psychology-store.js does, so this sandbox is the same one tests/psychology-regression.test.mjs
// builds: server-replica.js + user-preferences.js, a cookie-session auth global, and a fetch
// mock answering /api/sync/preferences. Writes land in the in-memory replica, so a load() right
// after a save() sees them without any round-trip.
async function routineStore(language) {
  const localStorage = memoryStorage();
  const sandbox = {
    window: { __NAVRYA_AUTH__: { authenticated: true, userId: 'test-user', user: { id: 'test-user' }, csrfToken: 'test-csrf' } },
    localStorage,
    fetch: async (url, options) => (options && options.method === 'POST')
      ? { ok: true, json: async () => JSON.parse(options.body) }
      : { ok: true, json: async () => ({ preferences: [] }) },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options && options.detail; } }
  };
  sandbox.window = Object.assign(sandbox.window, { localStorage, dispatchEvent() {}, addEventListener() {}, fetch: sandbox.fetch });
  vm.runInNewContext(await source('server-replica.js'), sandbox, { filename: 'server-replica.js' });
  vm.runInNewContext(await source('user-preferences.js'), sandbox, { filename: 'user-preferences.js' });
  // A character page has TradeJournalTradeI18n loaded before routine-store.js; without one the store
  // falls back to Persian, its original and default language.
  if (language) sandbox.window.TradeJournalTradeI18n = { language: () => language };
  vm.runInNewContext(await source('routine-store.js'), sandbox, { filename: 'routine-store.js' });
  await new Promise((resolve) => setImmediate(resolve));
  return sandbox.window.TradeJournalRoutineStore;
}

const AT = (y, m, d) => new Date(y, m - 1, d, 12, 0, 0);

test('an empty account has no routines and no active one', async () => {
  const store = await routineStore();
  const state = store.load();
  assert.equal(state.routines.length, 0);
  assert.equal(state.activeId, null);
  assert.equal(store.active(), null);
});

test('create() from a template copies its steps and becomes active', async () => {
  const store = await routineStore();
  const routine = store.create({ template: 'hunter' });
  assert.equal(routine.steps.length, store.templates().hunter.steps.length);
  assert.equal(store.active().id, routine.id);
  assert.equal(store.list().length, 1);
});

test('create() from blank keeps the caller name and starts with no steps', async () => {
  const store = await routineStore();
  const routine = store.create({ template: 'blank', name: '  روتین صبح  ' });
  assert.equal(routine.name, 'روتین صبح');
  assert.equal(routine.steps.length, 0);
});

test('toggleStep() is a real toggle and dayProgress() counts only the active routine steps', async () => {
  const store = await routineStore();
  const routine = store.create({ template: 'minimal' });
  const [first] = routine.steps;
  const day = AT(2026, 9, 4);

  assert.equal(store.dayProgress(null, day).done, 0);
  store.toggleStep(first.id, day);
  assert.equal(store.dayProgress(null, day).done, 1);
  store.toggleStep(first.id, day);
  assert.equal(store.dayProgress(null, day).done, 0);
});

test('dayProgress() reports complete only when every step is ticked', async () => {
  const store = await routineStore();
  const routine = store.create({ template: 'minimal' });
  const day = AT(2026, 9, 4);
  routine.steps.forEach((s) => store.toggleStep(s.id, day));
  const progress = store.dayProgress(null, day);
  assert.equal(progress.complete, true);
  assert.equal(progress.pct, 100);
});

test('a watch day is a success, not a failure', async () => {
  const store = await routineStore();
  store.create({ template: 'minimal' });
  const day = AT(2026, 9, 4);
  store.setWatchDay(true, day);
  assert.equal(store.isWatchDay(null, day), true);
  const [row] = store.adherence(1, day);
  assert.equal(row.state, 'watch');
});

test('adherence() reports a day with no row as an honest gap, never a zero score', async () => {
  const store = await routineStore();
  store.create({ template: 'minimal' });
  const rows = store.adherence(3, AT(2026, 9, 4));
  assert.equal(rows.length, 3);
  assert.ok(rows.every((r) => r.state === 'none'));
  assert.equal(store.adherenceRate(3, AT(2026, 9, 4)), null);
});

test('adherenceRate() honours the routine own watch and partial rules', async () => {
  const store = await routineStore();
  const routine = store.create({ template: 'minimal' });
  const today = AT(2026, 9, 4);
  const yesterday = AT(2026, 9, 3);

  routine.steps.forEach((s) => store.toggleStep(s.id, today));
  store.setWatchDay(true, yesterday);
  // watch:true by default -> both days count as successes
  assert.equal(store.adherenceRate(2, today), 100);

  store.update(routine.id, { rules: Object.assign(store.defaultRules(), { watch: false }) });
  assert.equal(store.adherenceRate(2, today), 50);
});

test('streak() walks back over complete and watch days and stops at the first miss', async () => {
  const store = await routineStore();
  const routine = store.create({ template: 'minimal' });
  const today = AT(2026, 9, 4);
  const days = [0, 1, 2, 3].map((back) => AT(2026, 9, 4 - back));

  routine.steps.forEach((s) => store.toggleStep(s.id, days[0]));
  routine.steps.forEach((s) => store.toggleStep(s.id, days[1]));
  store.setWatchDay(true, days[2]);
  // days[3] left untouched -> the streak ends there
  assert.equal(store.streak(today), 3);
});

test('streak() ends the moment a day is only partially done', async () => {
  const store = await routineStore();
  const routine = store.create({ template: 'minimal' });
  const today = AT(2026, 9, 4);
  store.toggleStep(routine.steps[0].id, today);
  assert.equal(store.streak(today), 0);
});

test('archive() hides a routine from list() but keeps its completion history', async () => {
  const store = await routineStore();
  const routine = store.create({ template: 'minimal' });
  const day = AT(2026, 9, 4);
  store.toggleStep(routine.steps[0].id, day);
  store.archive(routine.id);
  assert.equal(store.list().length, 0);
  assert.ok(store.load().completions[store.dayKey(day)]);
});

test('every write prunes completion days past the retention window', async () => {
  const store = await routineStore();
  const routine = store.create({ template: 'minimal' });
  const stale = AT(2025, 1, 1);
  const recent = new Date();

  // Pruning happens on the write itself, against the real clock - a day far outside the window
  // never reaches storage, so the value cannot creep upward however long the account lives.
  store.toggleStep(routine.steps[0].id, stale);
  assert.equal(store.load().completions[store.dayKey(stale)], undefined);

  store.toggleStep(routine.steps[0].id, recent);
  assert.ok(store.load().completions[store.dayKey(recent)]);
});

test('normalize() repairs a row missing every optional field', async () => {
  const store = await routineStore();
  const repaired = store.save({ routines: [{ id: 'r1' }], activeId: 'nope' });
  const [routine] = repaired.routines;
  assert.equal(routine.name, 'روتین من');
  assert.deepEqual([...routine.days], ['sat', 'sun', 'mon', 'tue', 'wed']);
  assert.deepEqual({ ...routine.rules }, { ...store.defaultRules() });
  // an activeId pointing at nothing falls back to the first live routine
  assert.equal(repaired.activeId, 'r1');
});

test('dayKey() zero-pads so keys sort chronologically as strings', async () => {
  const store = await routineStore();
  assert.equal(store.dayKey(AT(2026, 9, 4)), '2026-09-04');
  const sorted = [store.dayKey(AT(2026, 10, 1)), store.dayKey(AT(2026, 9, 30))].sort();
  assert.deepEqual([...sorted], ['2026-09-30', '2026-10-01']);
});

// ---------------------------------------------------------------------------------------------
// Routine types, per-type step libraries, custom steps with times, and reminders
// ---------------------------------------------------------------------------------------------

// The store runs in a vm context, so its arrays and objects are from another realm and never
// deepStrictEqual a literal from this one - compare a plain copy instead.
const plain = (value) => JSON.parse(JSON.stringify(value));

const LANGS = ['fa', 'en', 'ar', 'es'];
const TYPE_KEYS = ['hunter', 'scalper', 'swing', 'minimal', 'discipline', 'analysis', 'hygiene', 'health', 'mind', 'sleep', 'learning', 'blank'];
// How many steps each type starts with. A step id that is misspelled in the catalogue is dropped
// silently by design (a stale id must not crash the builder), so these counts are what catches a typo.
const TEMPLATE_STEP_COUNTS = { hunter: 9, scalper: 5, swing: 5, minimal: 3, discipline: 10, analysis: 8, hygiene: 8, health: 7, mind: 8, sleep: 8, learning: 6, blank: 0 };
const LIBRARY_SIZES = { hunter: 21, discipline: 19, analysis: 15, hygiene: 15, health: 12, mind: 10, sleep: 9, learning: 8, blank: 15 };

test('the builder offers trading, life and custom routine types in a fixed order, each with its own starting steps', async () => {
  const store = await routineStore();
  const templates = store.templates();
  assert.deepEqual(plain(Object.keys(templates)), TYPE_KEYS);
  assert.deepEqual(plain(Object.keys(templates).map((key) => templates[key].group)), [...Array(6).fill('market'), ...Array(5).fill('life'), 'custom']);
  for (const key of TYPE_KEYS) assert.equal(templates[key].steps.length, TEMPLATE_STEP_COUNTS[key], key + ' step count');
});

test('every type, step and suggestion has text in fa, en, ar and es, and the languages really differ', async () => {
  const store = await routineStore();
  for (const lang of LANGS) {
    const templates = store.templates(lang);
    for (const key of TYPE_KEYS) {
      const t = templates[key];
      assert.ok(t.name && t.desc && t.icon, lang + '/' + key + ' name, description and icon');
      t.steps.forEach((s) => assert.ok(s.label && s.id, lang + '/' + key + ' step ' + s.id));
      store.stepLibrary(key, lang).forEach((group) => group.items.forEach((s) => assert.ok(s.label, lang + '/' + key + ' suggestion ' + s.id)));
    }
  }
  const names = LANGS.map((lang) => store.templates(lang).hygiene.name);
  assert.equal(new Set(names).size, 4, 'four different names: ' + names.join(' | '));
  const labels = LANGS.map((lang) => store.templates(lang).hygiene.steps[0].label);
  assert.equal(new Set(labels).size, 4);
});

test('the language defaults to the UI language, and falls back to Persian without one', async () => {
  assert.equal((await routineStore()).templates().hunter.name, 'روتین شکارچی');
  const en = await routineStore('en');
  assert.equal(en.templates().hunter.name, 'Hunter routine');
  assert.equal(en.create({ template: 'hygiene' }).steps[0].label, 'Brush teeth (morning)');
  assert.equal((await routineStore('xx')).templates().hunter.name, 'روتین شکارچی');
});

test('the suggestions follow the routine type - hygiene from brushing teeth to laundry, analysis from the higher timeframe', async () => {
  const store = await routineStore();
  const ids = (type) => store.stepLibrary(type).flatMap((group) => group.items.map((s) => s.id));
  assert.ok(ids('hygiene').includes('brush_am') && ids('hygiene').includes('laundry') && ids('hygiene').includes('shower'));
  assert.ok(!ids('hygiene').includes('risk') && !ids('hygiene').includes('news'));
  assert.ok(ids('analysis').includes('htf') && ids('analysis').includes('scenarios') && !ids('analysis').includes('brush_am'));
  assert.ok(ids('sleep').includes('bed') && ids('health').includes('workout') && ids('learning').includes('read') && ids('mind').includes('meditate'));
  for (const type of Object.keys(LIBRARY_SIZES)) assert.equal(ids(type).length, LIBRARY_SIZES[type], type + ' suggestion count');
  // Called with no type it is still the trading-day library it always was.
  assert.deepEqual(plain(ids()), plain(ids('hunter')));
  assert.ok(ids().includes('plan') && ids().includes('close'));
  // A library never offers the same step twice.
  for (const type of Object.keys(LIBRARY_SIZES)) assert.equal(new Set(ids(type)).size, ids(type).length, type + ' duplicates');
});

test('a step only ever sits in a phase its routine family has (trading: pre..weekly, life: morning..weekly)', async () => {
  const store = await routineStore();
  const templates = store.templates();
  for (const key of TYPE_KEYS) {
    const phases = store.phasesFor(key);
    templates[key].steps.forEach((s) => assert.ok(phases.includes(s.phase), key + ' template step ' + s.id + ' is in ' + s.phase));
    store.stepLibrary(key).forEach((group) => {
      assert.ok(phases.includes(group.phase), key + ' library group ' + group.phase);
      group.items.forEach((s) => assert.ok(phases.includes(s.phase), key + ' suggestion ' + s.id + ' is in ' + s.phase));
    });
  }
  assert.deepEqual(plain(store.phasesFor('hunter')), ['pre', 'mind', 'during', 'post', 'weekly']);
  assert.deepEqual(plain(store.phasesFor('hygiene')), ['morning', 'day', 'evening', 'weekly']);
  assert.deepEqual(plain(store.phasesFor('blank')), ['morning', 'day', 'evening', 'weekly']);
  // every phase the store can produce has a place in the checklist order
  for (const phase of [...store.phasesFor('hunter'), ...store.phasesFor('hygiene')]) assert.ok(store.PHASE_ORDER.includes(phase), phase);
});

test('the original trading templates keep their exact steps, times and notes', async () => {
  const store = await routineStore();
  const templates = store.templates();
  assert.deepEqual(plain(templates.hunter.steps[0]), { id: 'plan', label: 'مرور پلن و قوانین دیروز', time: '07:40', phase: 'pre', link: '', note: 'دو دقیقه، فقط خواندن' });
  assert.deepEqual(plain(templates.hunter.steps.map((s) => s.time)), ['07:40', '07:50', '08:05', '08:15', '08:25', '08:30', '', '16:00', '22:30']);
  assert.equal(templates.scalper.steps.find((s) => s.id === 'checkin').time, '09:20');
  assert.equal(templates.swing.steps.find((s) => s.id === 'look').time, '08:00');
  const minimal = templates.minimal.steps;
  assert.deepEqual(plain(minimal.map((s) => s.id)), ['checkin', 'reflect', 'sentence']);
  assert.equal(minimal[0].time, '');
  assert.equal(minimal[1].label, 'یک جمله دربارهٔ اجرا');
  assert.equal(minimal[1].note, '');
});

test('create() starts a life routine on every day and a trading routine on the market days', async () => {
  const store = await routineStore();
  assert.deepEqual(plain(store.create({ template: 'hygiene' }).days), ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri']);
  assert.deepEqual(plain(store.create({ template: 'discipline' }).days), ['sat', 'sun', 'mon', 'tue', 'wed']);
  assert.deepEqual(plain(store.templates().blank.days), ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri']);
});

test('sanitizeTime() accepts a real 24h time and turns everything else into "no time"', async () => {
  const { sanitizeTime } = await routineStore();
  assert.equal(sanitizeTime('07:05'), '07:05');
  assert.equal(sanitizeTime('7:05'), '07:05');
  assert.equal(sanitizeTime(' 23:59 '), '23:59');
  assert.equal(sanitizeTime('00:00'), '00:00');
  for (const bad of ['24:00', '12:60', '1200', '12:5', 'abc', '', null, undefined, 5]) assert.equal(sanitizeTime(bad), '', String(bad));
});

test('customStep() makes a short unique id, trims the name, keeps the phase and validates the time', async () => {
  const store = await routineStore();
  const made = store.customStep({ label: '  Drink water  ', time: '9:30', phase: 'morning' });
  assert.equal(made.label, 'Drink water');
  assert.equal(made.time, '09:30');
  assert.equal(made.phase, 'morning');
  assert.match(made.id, /^u[a-z0-9]{1,5}$/);
  assert.equal(store.customStep({ label: 'x', time: 'nope' }).time, '');
  assert.equal(store.customStep({ label: 'x'.repeat(500) }).label.length, store.MAX_LABEL);
  // ids never collide with the ones already in the routine
  const taken = [];
  for (let i = 0; i < 200; i++) { const s = store.customStep({ label: 'x' }, taken); assert.ok(!taken.includes(s.id)); taken.push(s.id); }
});

test('a step time and name survive a save; an invalid time is dropped and a routine is capped at MAX_STEPS', async () => {
  const store = await routineStore();
  const steps = [{ id: 'a', label: 'A', time: '25:99' }, { id: 'b', label: 'B', time: '7:05' }, { id: 'c', label: 'C', time: '18:30' }];
  const saved = store.save({ routines: [{ id: 'r1', steps }] });
  assert.deepEqual(plain(saved.routines[0].steps.map((s) => s.time)), ['', '07:05', '18:30']);
  const flood = Array.from({ length: store.MAX_STEPS + 12 }, (_, i) => ({ id: 's' + i, label: 'S' + i }));
  assert.equal(store.save({ routines: [{ id: 'r2', steps: flood }] }).routines[0].steps.length, store.MAX_STEPS);
});

test('the stored value stays under the server per-preference limit however long and full a routine gets', async () => {
  const store = await routineStore();
  const steps = Array.from({ length: store.MAX_STEPS }, (_, i) => ({ id: 'u' + i.toString(36).padStart(4, 'x'), label: 'گام شماره ' + i, time: '08:00', phase: 'day' }));
  const completions = {};
  for (let i = 0; i < 175; i++) {
    const key = store.dayKey(new Date(Date.now() - i * 86400000));
    completions[key] = Object.fromEntries(steps.map((s) => [s.id, true]));
  }
  const saved = store.save({ routines: [{ id: 'r1', steps }], completions });
  const bytes = Buffer.byteLength(JSON.stringify(saved), 'utf8');
  assert.ok(bytes <= 16 * 1024, 'stored ' + bytes + ' bytes, the server rejects anything over 16384');
  assert.ok(saved.completions[store.dayKey(new Date())], 'today, the streak the trader is looking at, is kept');
  assert.ok(Object.keys(saved.completions).length < 175, 'the oldest days were dropped to fit');
  // and a small account loses nothing
  const small = store.save({ routines: [{ id: 'r1', steps: steps.slice(0, 3) }], completions: { [store.dayKey(new Date())]: { u1: true } } });
  assert.equal(Object.keys(small.completions).length, 1);
});

function at(hours, minutes, base) {
  const d = new Date(base || new Date(2026, 8, 5));
  d.setHours(hours, minutes, 0, 0);
  return d;
}
const DAY_OF = (d) => ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][d.getDay()];

async function routineWithTimes(rules, days) {
  const store = await routineStore();
  const routine = store.create({
    template: 'blank', name: 'R', days: days || ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'], rules: Object.assign(store.defaultRules(), rules),
    steps: [
      { id: 'a', label: 'Brush', time: '07:00', phase: 'morning' },
      { id: 'b', label: 'Walk', time: '07:03', phase: 'day' },
      { id: 'c', label: 'No time', time: '', phase: 'day' }
    ]
  });
  return { store, routine };
}

test('dueReminders(): nothing is due unless the routine has reminders on', async () => {
  const { store } = await routineWithTimes({ remind: false });
  assert.deepEqual(plain(store.dueReminders(at(7, 1))), []);
});

test('dueReminders(): a step is due from its time for five minutes, and a step without a time never is', async () => {
  const { store, routine } = await routineWithTimes({ remind: true });
  assert.deepEqual(plain(store.dueReminders(at(6, 59))), []);
  const first = store.dueReminders(at(7, 0));
  assert.deepEqual(plain(first.map((x) => x.stepId)), ['a']);
  assert.equal(first[0].routineId, routine.id);
  assert.equal(first[0].routineName, 'R');
  assert.equal(first[0].label, 'Brush');
  assert.equal(first[0].dayKey, '2026-09-05');
  assert.deepEqual(plain(store.dueReminders(at(7, 3)).map((x) => x.stepId)), ['a', 'b']);
  assert.deepEqual(plain(store.dueReminders(at(7, 5)).map((x) => x.stepId)), ['b']);
  assert.deepEqual(plain(store.dueReminders(at(7, 8))), []);
  assert.ok(store.dueReminders(at(12, 0)).every((x) => x.stepId !== 'c'));
});

test('dueReminders(): a ticked step is not reminded, and only the routine\'s own days remind', async () => {
  const { store } = await routineWithTimes({ remind: true });
  store.toggleStep('a', at(7, 0));
  assert.deepEqual(plain(store.dueReminders(at(7, 1))), []);

  const today = at(7, 1);
  const other = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'].filter((d) => d !== DAY_OF(today));
  const { store: offDay } = await routineWithTimes({ remind: true }, other);
  assert.deepEqual(plain(offDay.dueReminders(today)), []);
});
