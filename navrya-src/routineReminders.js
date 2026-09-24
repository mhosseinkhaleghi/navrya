import { showToast } from './toast.js';

// The alert behind a routine step's optional time. The Routine builder lets a trader give any
// step a time and turn on "remind me at each step time" (the routine's own `remind` rule); this
// is the one place that acts on it. routine-store.js's dueReminders() decides WHICH steps are due
// (pure, tested); this module only decides how to show them and remembers what it already showed,
// so a step alerts once per day per tab rather than on every tick inside its window.
//
// Delivery is honest about its limits: a toast while the tab is visible, plus a browser
// notification when the tab is in the background and the trader has granted permission. There is
// no server push - an alert needs this page open, which is why the builder says so.

const CHECK_EVERY_MS = 30 * 1000;
const TOAST_MS = 9000;

const fired = new Set();
let timer = null;

function join(labels) { return labels.join(' · '); }

function deliver(items) {
  const i18n = window.TradeJournalTradeI18n;
  if (!i18n) return;
  const steps = join(items.map((item) => item.label));
  const routine = items[0].routineName;
  const message = i18n.t('routineReminderText', { steps, routine });
  showToast(message, 'warning', TOAST_MS);
  try {
    if (document.hidden && window.Notification && window.Notification.permission === 'granted') {
      // `tag` makes a later alert replace this one instead of stacking a pile of them.
      new window.Notification(routine, { body: steps, tag: 'navrya-routine-reminder' });
    }
  } catch (_) { /* a browser that refuses to construct one still got the toast */ }
}

export function checkRoutineReminders(now) {
  const store = window.TradeJournalRoutineStore;
  if (!store || !store.dueReminders) return [];
  const fresh = store.dueReminders(now || new Date()).filter((item) => {
    const key = item.routineId + '|' + item.stepId + '|' + item.dayKey;
    if (fired.has(key)) return false;
    fired.add(key);
    return true;
  });
  if (fresh.length) deliver(fresh);
  return fresh;
}

// Called from a click (turning reminders on / activating a routine that has them) - browsers only
// honour a permission prompt that follows a user gesture, and only ever ask once.
export function requestReminderPermission() {
  try {
    if (window.Notification && window.Notification.permission === 'default') window.Notification.requestPermission();
  } catch (_) { /* notifications unavailable; toasts still work */ }
}

export function reminderPermission() {
  try { return window.Notification ? window.Notification.permission : 'unsupported'; } catch (_) { return 'unsupported'; }
}

export function startRoutineReminders() {
  if (timer) return;
  timer = window.setInterval(() => checkRoutineReminders(), CHECK_EVERY_MS);
  checkRoutineReminders();
}
