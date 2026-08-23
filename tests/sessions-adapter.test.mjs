import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

// sessionsAdapter.js is plain ESM (no JSX) and only touches the DOM/browser globals it's given
// through window.*/localStorage - unlike every other navrya-src/*.jsx file (which needs a JSX
// transform this project's plain `node --test` runner doesn't have), this one can be imported
// and exercised directly against a minimal stub.
function fakeLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  };
}

async function freshAdapter() {
  global.localStorage = fakeLocalStorage();
  global.window = global.window || {};
  global.window.localStorage = global.localStorage;
  global.window.dispatchEvent = global.window.dispatchEvent || (() => {});
  global.CustomEvent = global.CustomEvent || class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } };
  return import(pathToFileURL(path.join(process.cwd(), 'navrya-src', 'sessionsAdapter.js')).href + '?t=' + Date.now());
}

// HOTFIX regression guard: the entries built from NewSessionDialog's chart uploads never set
// `type` at all - every other place in this codebase that reads a session entry (the XP trigger
// in account-profile-store.js, liveSessionView.jsx's note-field branch) checks
// entry.type === 'chart'/'movement'/'fate' and silently mistreats an entry with none of those.
test("createSession() sets type: 'chart' on every entry built from an uploaded chart image", async () => {
  const { createSession } = await freshAdapter();
  global.window.TradeJournalImageStore = { saveImage: async () => {} };
  const session = await createSession('hunter', {
    city: 'London', timeframe: '5m', gregorian: '2026-08-23', jalali: '۱۴۰۵/۰۶/۰۱',
    uploads: [{ timeframe: '5m', file: { name: 'chart.png' } }, { timeframe: '1h', file: { name: 'chart2.png' } }]
  });
  assert.equal(session.entries.length, 2);
  session.entries.forEach((entry) => assert.equal(entry.type, 'chart', 'every upload-built entry must carry a real, valid type'));
  const stored = JSON.parse(global.localStorage.getItem('tradejournal:sessions:v1:shared'));
  assert.equal(stored.length, 1);
  stored[0].entries.forEach((entry) => assert.equal(entry.type, 'chart', 'the record actually persisted to localStorage must carry the fix too, not just the returned object'));
  delete global.window.TradeJournalImageStore;
});

test('createSession() with no uploads still produces zero entries, unaffected by the type fix', async () => {
  const { createSession } = await freshAdapter();
  const session = await createSession('hunter', { city: 'London', timeframe: '5m' });
  assert.deepEqual(session.entries, []);
});
