import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

// sessionsAdapter.js is plain ESM (no JSX) and only touches the DOM/browser globals it's given
// through window.* - unlike every other navrya-src/*.jsx file (which needs a JSX transform this
// project's plain `node --test` runner doesn't have, hence the "static-source regression guard"
// convention those files' own tests use instead), this one can be imported and exercised directly
// against a minimal stub.
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
  return import(pathToFileURL(path.join(process.cwd(), 'navrya-src', 'sessionsAdapter.js')).href + '?t=' + Date.now());
}

// HOTFIX regression guard: the entries built from NewSessionDialog's chart uploads never set
// `type` at all - trading_session_entries.type is NOT NULL with a CHECK (chart/movement/fate)
// constraint on the real server (006_trading_sessions.sql), so the whole session upsert 500'd and
// server-replica.js rolled it back (a brand-new record has no "previous" state to revert to, so
// it was spliced out of the local list entirely) - the exact real production bug: an image upload
// during session creation both failed to save AND made the session unopenable/vanish afterward.
test("createSession() sets type: 'chart' on every entry built from an uploaded chart image", async () => {
  const domainImpl = fakeDomain();
  global.window.TradeJournalImageStore = { saveImage: async () => {} };
  const { createSession } = await freshAdapter(domainImpl);
  const session = await createSession('hunter', {
    city: 'London', timeframe: '5m', gregorian: '08/01/2026', jalali: '۱۴۰۵/۰۵/۱۰',
    uploads: [{ timeframe: '5m', file: { name: 'chart.png' } }, { timeframe: '1h', file: { name: 'chart2.png' } }]
  });
  assert.equal(session.entries.length, 2);
  session.entries.forEach((entry) => assert.equal(entry.type, 'chart', 'every upload-built entry must carry a real, valid type'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(domainImpl.records.length, 1);
  domainImpl.records[0].entries.forEach((entry) => assert.equal(entry.type, 'chart', 'the record actually sent to the replica/server must carry the fix too, not just the returned object'));
  delete global.window.TradeJournalImageStore;
});

test('createSession() with no uploads still produces zero entries, unaffected by the type fix', async () => {
  const domainImpl = fakeDomain();
  const { createSession } = await freshAdapter(domainImpl);
  const session = await createSession('hunter', { city: 'London', timeframe: '5m' });
  assert.deepEqual(session.entries, []);
});
