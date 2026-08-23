import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

// sessionsAdapter.js is plain ESM (no JSX) and only touches the DOM/browser globals it's given
// through window.* - unlike every other navrya-src/*.jsx file (which needs a JSX transform this
// project's plain `node --test` runner doesn't have, hence the "static-source regression guard"
// convention those files' own tests use instead - see ai-voice-realtime-adapter.test.mjs's own
// file-top comment), this one can be imported and exercised directly against a minimal stub.
global.window = global.window || {};
global.CustomEvent = global.CustomEvent || class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } };

function fakeDomain() {
  const records = [];
  return {
    list: () => records.slice(),
    upsert: async (record) => { records.push(record); },
    records
  };
}

async function freshAdapter(domainImpl) {
  global.window.TradeJournalServerReplica = { domain: () => domainImpl };
  global.window.dispatchEvent = global.window.dispatchEvent || (() => {});
  // Cache-bust: every test gets a fresh module instance isn't actually needed here (the module
  // holds no mutable top-level state of its own - `domain()`/`window.*` are read fresh on every
  // call), so a single cached import is safe and fast to reuse across tests.
  return import(pathToFileURL(path.join(process.cwd(), 'navrya-src', 'sessionsAdapter.js')).href + '?t=' + Date.now());
}

// Regression: createSession()'s own session object literal never included
// updateIntervalMinutes/gracePeriodMinutes at all, even though NewSessionDialog.jsx (and the
// AI-fillable session.create action, per docs/ai/action-coverage-matrix.md) both collect
// loop/grace - the DB/repo layer (repo.pg.mjs/repo.memory.mjs) fully supports the real fields,
// but nothing ever put a value on the object being upserted, so every session silently fell back
// to the repo layer's own hardcoded defaults (30/5) regardless of what the user picked or the AI
// extracted.
test('createSession() maps the dialog\'s loop label to real minutes and passes grace through as a number, onto updateIntervalMinutes/gracePeriodMinutes', async () => {
  const domainImpl = fakeDomain();
  const { createSession } = await freshAdapter(domainImpl);
  const session = await createSession('hunter', { city: 'London', timeframe: '5m', gregorian: '08/01/2026', jalali: '۱۴۰۵/۰۵/۱۰', loop: '1 hour', grace: '10' });
  assert.equal(session.updateIntervalMinutes, 60, "'1 hour' must resolve to 60 minutes, not be dropped or left as the display string");
  assert.equal(session.gracePeriodMinutes, 10);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(domainImpl.records.length, 1);
  assert.equal(domainImpl.records[0].updateIntervalMinutes, 60, 'the value actually sent to the replica/server must carry the real fields too, not just the returned object');
  assert.equal(domainImpl.records[0].gracePeriodMinutes, 10);
});

test('createSession() maps every real LOOP_INTERVALS label to the correct number of minutes', async () => {
  const domainImpl = fakeDomain();
  const { createSession } = await freshAdapter(domainImpl);
  const cases = { '15 min': 15, '30 min': 30, '1 hour': 60, '4 hours': 240 };
  for (const [label, minutes] of Object.entries(cases)) {
    const session = await createSession('hunter', { city: 'London', timeframe: '5m', loop: label, grace: '5' });
    assert.equal(session.updateIntervalMinutes, minutes, label + ' must map to ' + minutes + ' minutes');
  }
});

test('createSession() omits updateIntervalMinutes/gracePeriodMinutes when nothing usable was supplied, rather than writing NaN/an unparseable value onto the record', async () => {
  const domainImpl = fakeDomain();
  const { createSession } = await freshAdapter(domainImpl);
  const session = await createSession('hunter', { city: 'London', timeframe: '5m' });
  assert.equal('updateIntervalMinutes' in session, false, 'no loop was supplied - the field must be omitted, not set to NaN, so the repo layer\'s own real default (30) applies downstream');
  assert.equal('gracePeriodMinutes' in session, false, 'no grace was supplied - same reasoning');
});
