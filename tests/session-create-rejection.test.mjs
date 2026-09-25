import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { loadJsx, visibleText } from './helpers/render-jsx.mjs';

// A refused manual Session creation (plan limit, validation, network) must not produce a ghost Session, must not
// navigate into one, and must leave the dialog open, usable and explained. These run the REAL replica, the REAL
// sessions adapter and the REAL instrument catalog store against a scripted server, plus the dialog's pure seams
// (submit guard, plan-limit wording) and the rendered failure notice - `node --test` has no DOM, so the click path
// itself is covered by the wiring assertions at the bottom.

const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const importFresh = (...parts) => import(pathToFileURL(path.join(root, ...parts)).href + '?t=' + Date.now());
const { planLimitInfo, planLimitMessage } = await importFresh('public', 'pages', 'shared', 'navrya', 'hooks', 'planLimit.js');
const { createSubmitGuard } = await importFresh('public', 'pages', 'shared', 'navrya', 'hooks', 'submitGuard.js');

const tick = () => new Promise((resolve) => setImmediate(resolve));
const LIMIT_BODY = { error: 'PLAN_LIMIT_REACHED', resource: 'sessions', limit: 10, used: 10, plan: 'free' };

// A browser-like sandbox: the real server-replica.js (+ the instrument catalog store), a scripted fetch, and spies.
async function makeWorld({ withCatalog = false } = {}) {
  const toasts = [];
  const events = [];
  const deletedImages = [];
  const writes = [];
  let respondTo = null; // (url, options) => Promise<response-like>
  const document = { body: { appendChild(node) { toasts.push(node); } }, documentElement: { lang: 'en' }, createElement: () => ({ setAttribute() {} }) };
  const fetchFn = async (url, options) => {
    if (options && options.method === 'POST') { writes.push(JSON.parse(options.body)); return respondTo(url, options); }
    return { ok: true, status: 200, json: async () => ({ sessions: [], instrumentCatalog: [] }) };
  };
  const window = { __NAVRYA_AUTH__: { authenticated: true, userId: 'u1', user: { id: 'u1' }, csrfToken: 'c' }, fetch: fetchFn, dispatchEvent: (event) => events.push(event.type), addEventListener() {} };
  const sandbox = { window, document, fetch: fetchFn, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } } };
  vm.runInNewContext(await readFile(shared('server-replica.js'), 'utf8'), sandbox, { filename: 'server-replica.js' });
  const sessions = window.TradeJournalServerReplica.registerListDomain('sessions', {
    hydrateUrl: '/api/sync/sessions', writeUrl: '/api/sync/sessions', deleteUrlFor: (id) => '/api/sync/sessions/' + id, extractList: (body) => body.sessions || []
  });
  if (withCatalog) {
    for (const file of ['instrument-catalog.types.js', 'instrument-catalog-store.js']) vm.runInNewContext(await readFile(shared(file), 'utf8'), sandbox, { filename: file });
    await tick();
  }
  window.TradeJournalImageStore = { saveImage: async () => {}, deleteImage: async (id) => { deletedImages.push(id); } };
  globalThis.window = window;
  globalThis.CustomEvent = sandbox.CustomEvent;
  return { window, sessions, toasts, events, deletedImages, writes, respondWith(fn) { respondTo = fn; } };
}

// Arrays built inside the vm sandbox have that realm's prototype; plain() makes them comparable with deepEqual.
const plain = (value) => JSON.parse(JSON.stringify(value));
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const values = { city: 'London', timeframe: '5m', gregorian: '2026-09-25', jalali: '', loop: '5', grace: '5', instrument: 'XAUUSD', accountId: null, uploads: [{ timeframe: '5m', file: { name: 'chart.png' } }] };

let createSession;
before(async () => { ({ createSession } = await importFresh('navrya-src', 'sessionsAdapter.js')); });
after(() => { delete globalThis.window; delete globalThis.CustomEvent; });

test('a session the server REFUSES (plan limit) is never listed - not even while the request is in flight - nothing is announced, and the stored chart is cleaned up', async () => {
  const world = await makeWorld();
  let refuse;
  world.respondWith(() => new Promise((resolve) => { refuse = () => resolve(json(403, LIMIT_BODY)); }));

  const pending = createSession('hunter', values).then(() => null, (error) => error);
  await tick();
  assert.equal(world.writes.length, 1, 'the create reached the server');
  assert.deepEqual(plain(world.sessions.list()), [], 'no optimistic ghost while the round trip is pending');

  refuse();
  const error = await pending;
  assert.ok(error, 'the refusal reaches the caller instead of being swallowed');
  assert.equal(error.code, 'PLAN_LIMIT_REACHED');
  assert.deepEqual(plain(planLimitInfo(error)), { resource: 'sessions', limit: 10, used: 10, plan: 'free' });
  assert.deepEqual(plain(world.sessions.list()), [], 'no session remains after the refusal');
  assert.equal(world.events.includes('tradejournal:sessions-changed'), false, 'nothing announces a session that was never saved');
  assert.equal(world.toasts.length, 0, 'the dialog explains the limit itself, so the generic "save failed" toast stays quiet');
  assert.equal(world.deletedImages.length, 1, 'the chart image stored for the refused session is removed again');
});

test('an accepted session is listed only once the server accepted it, is what the caller gets back, and is announced exactly once', async () => {
  const world = await makeWorld();
  let accept;
  world.respondWith((url, options) => new Promise((resolve) => { accept = () => resolve(json(200, { ...JSON.parse(options.body), serverConfirmed: true })); }));

  const pending = createSession('hunter', values);
  await tick();
  assert.deepEqual(plain(world.sessions.list()), [], 'still nothing before the server answers');
  accept();
  const created = await pending;
  assert.equal(created.serverConfirmed, true, 'the caller receives the server-accepted record');
  assert.equal(world.sessions.list().length, 1);
  assert.equal(world.sessions.list()[0].id, created.id);
  assert.equal(world.events.filter((type) => type === 'tradejournal:sessions-changed').length, 1);
  assert.equal(world.deletedImages.length, 0, 'the saved chart image is kept');
});

test('any other failure (server error, network) is also a rejection with no ghost - and is not mistaken for a plan limit', async () => {
  const world = await makeWorld();
  world.respondWith(async () => json(500, { error: 'COMMUNITY_API_FAILED' }));
  const serverError = await createSession('hunter', values).then(() => null, (error) => error);
  assert.equal(serverError.status, 500);
  assert.equal(planLimitInfo(serverError), null);
  assert.deepEqual(plain(world.sessions.list()), []);

  world.respondWith(async () => { throw new TypeError('network down'); });
  const networkError = await createSession('hunter', values).then(() => null, (error) => error);
  assert.ok(networkError);
  assert.equal(planLimitInfo(networkError), null);
  assert.deepEqual(plain(world.sessions.list()), []);
  assert.equal(world.events.includes('tradejournal:sessions-changed'), false);
});

test('a 403 that is NOT a plan limit (ownership, archived account, ...) is never presented as one', () => {
  assert.equal(planLimitInfo({ status: 403, code: 'NOT_ACCOUNT_OWNER', details: { error: 'NOT_ACCOUNT_OWNER' } }), null);
  assert.equal(planLimitInfo(new Error('boom')), null);
  assert.equal(planLimitInfo(null), null);
});

test('the instrument catalog store only lists a code once the server accepted it: a plan-limit refusal leaves no phantom instrument, and carries the reason', async () => {
  const world = await makeWorld({ withCatalog: true });
  const store = world.window.TradeJournalInstrumentCatalogStore;
  let refuse;
  world.respondWith(() => new Promise((resolve) => { refuse = () => resolve(json(403, { error: 'PLAN_LIMIT_REACHED', resource: 'analysisSymbols', limit: 1, used: 1, plan: 'free' })); }));

  const pending = store.create('BTCUSDT', undefined, { silent: true }).then(() => null, (error) => error);
  await tick();
  assert.deepEqual(plain(store.listSync()), [], 'no optimistic phantom in the picker while pending');
  refuse();
  const error = await pending;
  assert.deepEqual(plain(planLimitInfo(error)), { resource: 'analysisSymbols', limit: 1, used: 1, plan: 'free' });
  assert.deepEqual(plain(store.listSync()), [], 'a refused instrument is not in the picker or the Session dropdown');
  assert.equal(world.toasts.length, 0, 'silent: the picker renders the message itself');

  world.respondWith(async (url, options) => json(200, JSON.parse(options.body)));
  const accepted = await store.create('BTCUSDT');
  assert.equal(accepted.code, 'BTCUSDT');
  assert.deepEqual(plain(store.listSync()).map((item) => item.code), ['BTCUSDT']);
});

test('the plan-limit wording is localized (en/fa/ar/es), carries the server\'s own numbers, and a limit without numbers falls back to the generic sentence', () => {
  const info = { resource: 'sessions', limit: 7, used: 7, plan: 'free' };
  for (const lang of ['en', 'fa', 'ar', 'es']) {
    const message = planLimitMessage(info, lang);
    assert.ok(message.includes('7'), lang + ': shows the limit and the used count');
    assert.equal(/\{limit\}|\{used\}/.test(message), false, lang + ': no unfilled placeholder');
  }
  assert.notEqual(planLimitMessage(info, 'fa'), planLimitMessage(info, 'en'));
  const instruments = planLimitMessage({ resource: 'analysisSymbols', limit: 1, used: 1 }, 'en');
  assert.match(instruments, /instrument/);
  const generic = planLimitMessage({ resource: 'patterns', limit: 3, used: 3 }, 'en');
  assert.doesNotMatch(generic, /\{|undefined/);
  const noNumbers = planLimitMessage({ resource: 'sessions', limit: null, used: null }, 'en');
  assert.doesNotMatch(noNumbers, /\b(null|NaN)\b|\s{2,}/);
});

test('the submit guard: a refusal is reported and the dialog becomes usable again; a second submit while in flight is ignored', async () => {
  const state = { submitting: [], errors: [] };
  const guard = createSubmitGuard({ setSubmitting: (value) => state.submitting.push(value), setError: (value) => state.errors.push(value) });
  let finish; let calls = 0;
  const first = guard.run(() => { calls += 1; return new Promise((resolve, reject) => { finish = reject; }); });
  assert.equal(guard.isBusy(), true);
  assert.equal(await guard.run(() => { calls += 1; }), undefined, 'a second submit while the first is in flight is ignored');
  assert.equal(calls, 1, 'so a double click can never create two sessions');

  const refusal = Object.assign(new Error('REPLICA_REQUEST_FAILED'), { status: 403, code: 'PLAN_LIMIT_REACHED', details: LIMIT_BODY });
  finish(refusal);
  await assert.rejects(first, (error) => error === refusal, 'the refusal is re-thrown so a programmatic caller (the AI submit) sees the real outcome');
  assert.equal(guard.isBusy(), false);
  assert.deepEqual(state.submitting, [true, false], 'the loading state is always restored');
  assert.equal(state.errors[state.errors.length - 1], refusal, 'the refusal is handed to the dialog to explain');

  assert.equal(await guard.run(async () => 'created'), 'created', 'and the dialog can be submitted again');
  assert.equal(state.errors[state.errors.length - 1], null, 'a new attempt clears the previous notice');
});

test('the submit guard never touches state after the dialog unmounted (a successful create navigates away)', async () => {
  let mounted = true;
  const seen = [];
  const guard = createSubmitGuard({ setSubmitting: (value) => seen.push(['submitting', value]), setError: (value) => seen.push(['error', value]), isMounted: () => mounted });
  await guard.run(async () => { mounted = false; return 'ok'; });
  assert.deepEqual(seen, [['submitting', true], ['error', null]], 'only the pre-flight updates ran; nothing after unmount');
});

test('the rendered failure notice: plan limit -> localized sentence with a "View plans" action; any other failure -> a plain "nothing saved" line with no upgrade action', async () => {
  const jsx = await loadJsx({ dialog: 'public/pages/shared/navrya/components/sessions/NewSessionDialog.jsx' });
  try {
    const { CreateFailureNotice } = jsx.modules.dialog;
    const limitError = { code: 'PLAN_LIMIT_REACHED', details: LIMIT_BODY };
    for (const lang of ['en', 'fa', 'ar', 'es']) {
      const text = visibleText(jsx.render(CreateFailureNotice, { error: limitError, lang, labels: {}, onUpgrade: () => {} }));
      assert.ok(text.includes('10'), lang + ': the limit is shown');
    }
    const withAction = jsx.render(CreateFailureNotice, { error: limitError, lang: 'en', labels: {}, onUpgrade: () => {} });
    assert.match(withAction, /role="alert"/);
    assert.match(visibleText(withAction), /View plans/);
    const noAction = jsx.render(CreateFailureNotice, { error: limitError, lang: 'en', labels: {} });
    assert.doesNotMatch(visibleText(noAction), /View plans/, 'no action without a destination');
    const other = jsx.render(CreateFailureNotice, { error: new Error('boom'), lang: 'en', labels: {}, onUpgrade: () => {} });
    assert.match(visibleText(other), /nothing was saved/i);
    assert.doesNotMatch(visibleText(other), /View plans/, 'an unrelated failure never offers the plans');
  } finally { await jsx.cleanup(); }
});

// The click path (a DOM event) cannot run under `node --test`; these pin the wiring that makes the behaviour above
// reach the user: navigation only after the awaited create, and the dialog closed only on success.
test('wiring: the library closes the dialog only after the create resolved, and the app navigates into a session only from the resolved create', async () => {
  const read = (...parts) => readFile(path.join(root, ...parts), 'utf8').then((text) => text.replace(/\r\n/g, '\n'));
  const library = await read('public', 'pages', 'shared', 'navrya', 'components', 'sessions', 'SessionLibrary.jsx');
  const create = library.slice(library.indexOf('onCreate={async (values) => {'), library.indexOf('{...dialogProps}'));
  assert.ok(create.length > 0, 'the library awaits the caller\'s create');
  assert.ok(create.indexOf('await onNewSession(values)') > -1 && create.indexOf('await onNewSession(values)') < create.indexOf('setDialog(false)'), 'setDialog(false) only after the awaited create');
  assert.doesNotMatch(create, /catch/, 'a refusal is not swallowed - it reaches the dialog');

  const app = await read('navrya-src', 'character-app.jsx');
  const onNew = app.slice(app.indexOf('onNewSession={(values) =>'), app.indexOf('title={t.sessionLibraryTitle}'));
  assert.match(onNew, /store\.createSession\(values\)\)\.then\(\(session\) => \{\s*if \(session && session\.id\) openLiveSession\(session\.id\);/);
  assert.doesNotMatch(onNew, /\.catch\(/, 'a refusal must reach the dialog, never be swallowed here');

  const adapter = await read('navrya-src', 'sessionsAdapter.js');
  assert.match(adapter, /await live\.upsert\(session, \{ confirmFirst: true, silent: true \}\)/);
  assert.doesNotMatch(adapter, /live\.upsert\(session\)\.catch\(\(\) => \{\}\)/, 'the swallowed fire-and-forget create is gone');

  const dialog = await read('public', 'pages', 'shared', 'navrya', 'components', 'sessions', 'NewSessionDialog.jsx');
  assert.match(dialog, /loading=\{submitting\}/, 'the primary shows its loading state');
  const picker = await read('public', 'pages', 'shared', 'navrya', 'components', 'forms', 'InstrumentPicker.jsx');
  assert.match(picker, /store\.create\(normalizedQuery, undefined, \{ silent: true \}\)/, 'the picker awaits the server-confirmed add and renders the failure itself');
  assert.match(picker, /planLimitInfo\(addError\)/);
  assert.match(picker, /role="alert"/);
  assert.match(picker, /limitReached && onUpgrade/, 'the plans action appears only for a plan limit, and only with a destination');
  assert.match(dialog, /<InstrumentPicker[^>]*onUpgrade=\{onUpgrade\}/, 'the dialog picker offers the same plans action');
  assert.equal((dialog.match(/runCreate\(\{/g) || []).length, 2, 'both the button and the AI submit go through the ONE guarded runCreate');
  assert.doesNotMatch(dialog, /onClick=\{\(\) => onCreate|submit: \(\) => onCreate/, 'no path calls onCreate around the guard');
});
