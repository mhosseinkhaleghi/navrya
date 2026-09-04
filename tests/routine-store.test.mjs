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
async function routineStore() {
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
