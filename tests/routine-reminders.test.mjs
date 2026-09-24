import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// The alert behind a routine step's time (navrya-src/routineReminders.js). Which steps are due is the
// store's job (tests/routine-store.test.mjs); this covers delivery: one toast per step per day, one
// combined toast when several fall due together, a browser notification only for a hidden tab that
// has granted permission, and a permission prompt only when the browser has never been asked.

const root = process.cwd();
const toasts = [];
const removals = [];
const notifications = [];
const intervals = [];
let nextDue = [];

class FakeNotification {
  constructor(title, options) { notifications.push({ title, options }); }
}
FakeNotification.permission = 'default';
FakeNotification.requestPermission = () => { FakeNotification.asked = (FakeNotification.asked || 0) + 1; };

globalThis.document = {
  hidden: false,
  body: { append: (node) => toasts.push(node) },
  createElement: () => ({ className: '', textContent: '', remove() {} })
};
globalThis.window = {
  setTimeout: (fn, ms) => { removals.push(ms); return 0; },
  setInterval: (fn, ms) => { intervals.push(ms); return 1; },
  TradeJournalTradeI18n: { t: (key, vars) => key + '|' + Object.entries(vars || {}).map(([k, v]) => k + '=' + v).join(';') },
  TradeJournalRoutineStore: { dueReminders: () => nextDue },
  Notification: FakeNotification
};

const { checkRoutineReminders, startRoutineReminders, requestReminderPermission, reminderPermission } = await import('../navrya-src/routineReminders.js');

const due = (stepId, label, dayKey, routineName) => ({ routineId: 'r1', routineName: routineName || 'Morning', stepId, label, time: '07:00', dayKey });

function reset() {
  toasts.length = 0; removals.length = 0; notifications.length = 0;
  document.hidden = false;
  FakeNotification.permission = 'default';
  FakeNotification.asked = 0;
}

test('a step that falls due alerts once - not on every check inside its five-minute window - and again the next day', () => {
  reset();
  nextDue = [due('brush', 'Brush teeth', '2026-09-05')];
  assert.equal(checkRoutineReminders().length, 1);
  assert.equal(toasts.length, 1);
  assert.match(toasts[0].textContent, /routineReminderText/);
  assert.match(toasts[0].textContent, /steps=Brush teeth/);
  assert.match(toasts[0].textContent, /routine=Morning/);
  assert.match(toasts[0].className, /warning/);

  assert.equal(checkRoutineReminders().length, 0);
  assert.equal(checkRoutineReminders().length, 0);
  assert.equal(toasts.length, 1, 'no repeat while the step stays due');

  nextDue = [due('brush', 'Brush teeth', '2026-09-06')];
  assert.equal(checkRoutineReminders().length, 1);
  assert.equal(toasts.length, 2, 'the same step alerts again on the next day');
});

test('the alert stays on screen long enough to read, unlike a plain confirmation toast', () => {
  reset();
  nextDue = [due('walk', 'Walk', '2026-09-07')];
  checkRoutineReminders();
  assert.deepEqual(removals, [9000]);
});

test('steps that fall due together are one combined toast, and an already-shown one is not repeated inside it', () => {
  reset();
  nextDue = [due('a', 'Brush teeth', '2026-09-08'), due('b', 'Take a shower', '2026-09-08')];
  checkRoutineReminders();
  assert.equal(toasts.length, 1);
  assert.match(toasts[0].textContent, /steps=Brush teeth · Take a shower/);

  nextDue = [due('a', 'Brush teeth', '2026-09-08'), due('c', 'Floss', '2026-09-08')];
  checkRoutineReminders();
  assert.equal(toasts.length, 2);
  assert.match(toasts[1].textContent, /steps=Floss/);
  assert.doesNotMatch(toasts[1].textContent, /Brush teeth/);
});

test('a hidden tab with permission also gets a browser notification; a visible one, or one without permission, does not', () => {
  reset();
  document.hidden = true;
  FakeNotification.permission = 'granted';
  nextDue = [due('x1', 'Stretch', '2026-09-09', 'Health')];
  checkRoutineReminders();
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].title, 'Health');
  assert.equal(notifications[0].options.body, 'Stretch');
  assert.equal(notifications[0].options.tag, 'navrya-routine-reminder');
  assert.equal(toasts.length, 1, 'the toast is still shown for when the tab comes back');

  document.hidden = false;
  nextDue = [due('x2', 'Walk', '2026-09-09', 'Health')];
  checkRoutineReminders();
  assert.equal(notifications.length, 1, 'a visible tab already has the toast');

  document.hidden = true;
  FakeNotification.permission = 'denied';
  nextDue = [due('x3', 'Read', '2026-09-09', 'Health')];
  assert.doesNotThrow(() => checkRoutineReminders());
  assert.equal(notifications.length, 1, 'no permission, no notification');
});

test('a browser that refuses to construct a notification does not lose the toast or throw', () => {
  reset();
  document.hidden = true;
  const Original = window.Notification;
  class Refusing { constructor() { throw new Error('Illegal constructor'); } }
  Refusing.permission = 'granted';
  window.Notification = Refusing;
  nextDue = [due('y1', 'Sleep', '2026-09-10')];
  assert.doesNotThrow(() => checkRoutineReminders());
  assert.equal(toasts.length, 1);
  window.Notification = Original;
});

test('nothing happens without a routine store, or when nothing is due', () => {
  reset();
  nextDue = [];
  assert.deepEqual(checkRoutineReminders(), []);
  const store = window.TradeJournalRoutineStore;
  delete window.TradeJournalRoutineStore;
  assert.deepEqual(checkRoutineReminders(), []);
  window.TradeJournalRoutineStore = store;
  assert.equal(toasts.length, 0);
});

test('the permission prompt is only ever raised when the browser has never been asked', () => {
  reset();
  assert.equal(reminderPermission(), 'default');
  requestReminderPermission();
  assert.equal(FakeNotification.asked, 1);
  FakeNotification.permission = 'granted';
  requestReminderPermission();
  FakeNotification.permission = 'denied';
  requestReminderPermission();
  assert.equal(FakeNotification.asked, 1);
  assert.equal(reminderPermission(), 'denied');

  const Original = window.Notification;
  delete window.Notification;
  assert.equal(reminderPermission(), 'unsupported');
  assert.doesNotThrow(() => requestReminderPermission());
  window.Notification = Original;
});

test('the checker runs on one 30-second interval however many times it is started', () => {
  reset();
  intervals.length = 0;
  startRoutineReminders();
  startRoutineReminders();
  assert.deepEqual(intervals, [30000]);
});

test('the shell starts reminders only after the replica has hydrated, and the toast helper accepts a duration', async () => {
  const shell = await readFile(path.join(root, 'navrya-src', 'character-app.jsx'), 'utf8');
  const hydrated = shell.indexOf('store.init();');
  const started = shell.indexOf('startRoutineReminders();');
  assert.ok(hydrated > -1 && started > hydrated, 'startRoutineReminders() must come after the boot gate and store.init()');
  assert.match(shell, /import \{ startRoutineReminders \} from '\.\/routineReminders\.js';/);
  const toast = await readFile(path.join(root, 'navrya-src', 'toast.js'), 'utf8');
  assert.match(toast, /export function showToast\(message, tone, duration\)/);
  assert.match(toast, /duration \|\| 2600/);
});
