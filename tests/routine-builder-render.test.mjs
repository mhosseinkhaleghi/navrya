import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';

// The Routine builder popup, actually RENDERED (see analysis-profile-memory-graph-render.test.mjs for
// why: `node --test` has no JSX transform, so a name that is used but never imported would otherwise
// only fail in a user's browser). esbuild bundles the real routineTab.jsx with React and this file
// server-renders every page of the wizard. renderToString runs the whole render phase and skips
// effects, and it cannot render a portal - so react-dom is swapped for a shim whose createPortal
// returns its children, which is exactly the markup the portal would have mounted on document.body.

const root = process.cwd();
const require = createRequire(import.meta.url);
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);

let scratch;
let mod;

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => (values.has(key) ? values.get(key) : null), setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key), key: (index) => Array.from(values.keys())[index] || null, get length() { return values.size; } };
}

// The real routine-store.js and trade-i18n.js, in the language under test, exactly as a character
// page provides them. Returns the pieces the components read off `window`.
async function environment(lang) {
  const localStorage = memoryStorage();
  const document = { body: {}, documentElement: { lang, dir: lang === 'fa' || lang === 'ar' ? 'rtl' : 'ltr' } };
  const sandbox = {
    window: { __NAVRYA_AUTH__: { authenticated: true, userId: 'test-user', user: { id: 'test-user' }, csrfToken: 'test-csrf' } },
    document, localStorage,
    fetch: async (url, options) => ((options && options.method === 'POST') ? { ok: true, json: async () => JSON.parse(options.body) } : { ok: true, json: async () => ({ preferences: [] }) }),
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options && options.detail; } }
  };
  sandbox.window = Object.assign(sandbox.window, { localStorage, document, dispatchEvent() {}, addEventListener() {}, fetch: sandbox.fetch, matchMedia: () => ({ matches: false }) });
  for (const file of ['server-replica.js', 'user-preferences.js', 'trade-i18n.js', 'routine-store.js']) {
    vm.runInNewContext(await readFile(shared(file), 'utf8'), sandbox, { filename: file });
  }
  await new Promise((resolve) => setImmediate(resolve));
  globalThis.window = sandbox.window;
  globalThis.document = document;
  return { store: sandbox.window.TradeJournalRoutineStore, i18n: sandbox.window.TradeJournalTradeI18n };
}

const noop = () => {};

function draftFor(store, template, extra) {
  const preset = store.templates()[template];
  return {
    template, name: preset.name, nameTouched: false, days: preset.days.slice(), daysTouched: false, stepsTouched: false,
    remindTouched: false, session: 'london', steps: preset.steps.map((s) => ({ ...s })), rules: store.defaultRules(), editingId: null, ...extra
  };
}

function renderWizard(env, draft, initialStep, editingId) {
  const { React, renderToString, BuildView } = mod;
  return renderToString(React.createElement(BuildView, {
    i18n: env.i18n, store: env.store, draft, setDraft: noop, editingId: editingId || null, onSave: noop, onCancel: noop, initialStep
  }));
}

test.before(async () => {
  scratch = await mkdtemp(path.join(os.tmpdir(), 'nv-routine-builder-'));
  const outfile = path.join(scratch, 'bundle.cjs');
  await build({
    stdin: {
      contents: [
        "import React from 'react';",
        "import { renderToString } from 'react-dom/server';",
        "import { BuildView, RoutineTab } from './navrya-src/routineTab.jsx';",
        'export { React, renderToString, BuildView, RoutineTab };'
      ].join('\n'),
      resolveDir: root,
      loader: 'jsx',
      sourcefile: 'render-entry.jsx'
    },
    plugins: [{
      name: 'react-dom-portal-shim',
      setup(b) {
        b.onResolve({ filter: /^react-dom$/ }, () => ({ path: 'react-dom-shim', namespace: 'shim' }));
        b.onLoad({ filter: /.*/, namespace: 'shim' }, () => ({ contents: 'export const createPortal = (children) => children;', loader: 'js' }));
      }
    }],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    outfile,
    jsx: 'transform',
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'silent'
  });
  mod = require(outfile);
});

test.after(async () => {
  delete globalThis.window;
  delete globalThis.document;
  if (scratch) await rm(scratch, { recursive: true, force: true });
});

test('popup, step 1: every routine type is offered, grouped, with the "any routine" invitation - in English and Persian', async () => {
  const en = await environment('en');
  const html = renderWizard(en, draftFor(en.store, 'hunter'), 1);
  assert.match(html, /role="dialog"/);
  assert.match(html, /Build a routine/);
  assert.match(html, /Build any routine you like/);
  for (const label of ['Trading routines', 'Life and wellbeing', 'Your own']) assert.match(html, new RegExp(label));
  for (const key of Object.keys(en.store.templates())) assert.ok(html.includes(en.store.templates()[key].name), `${key} tile missing`);
  for (const name of ['Discipline routine', 'Hygiene routine', 'Analysis routine', 'My routine']) assert.match(html, new RegExp(name));

  const fa = await environment('fa');
  const faHtml = renderWizard(fa, draftFor(fa.store, 'hunter'), 1);
  for (const name of ['روتین انضباطی', 'روتین بهداشتی', 'روتین تحلیل', 'روتین من']) assert.ok(faHtml.includes(name), name);
});

test('popup, step 2: the suggestions follow the routine type, and the trader can add a step of their own with an optional time', async () => {
  const en = await environment('en');
  const hygiene = renderWizard(en, draftFor(en.store, 'hygiene'), 2);
  assert.match(hygiene, /SUGGESTED STEPS — Hygiene routine/);
  assert.match(hygiene, /Brush teeth \(morning\)/);
  assert.match(hygiene, /Do the laundry/);
  assert.doesNotMatch(hygiene, /Set the day’s risk cap/);
  assert.match(hygiene, /Add your own step/);
  assert.match(hygiene, /Time \(optional\)/);
  assert.match(hygiene, /type="time"/);
  assert.match(hygiene, /Add step/);

  const analysis = renderWizard(en, draftFor(en.store, 'analysis'), 2);
  assert.match(analysis, /Higher-timeframe analysis/);
  assert.doesNotMatch(analysis, /Brush teeth/);
});

test('popup, step 2: each step row carries an editable time; the reminder switch appears only once a step has a time', async () => {
  const en = await environment('en');
  const withTimes = renderWizard(en, draftFor(en.store, 'hygiene'), 2);
  assert.match(withTimes, /value="07:00"/);
  assert.match(withTimes, /aria-label="Step time"/);
  assert.match(withTimes, /aria-label="Clear time"/);
  assert.match(withTimes, /Remind me at each step time/);

  const noTimes = renderWizard(en, draftFor(en.store, 'blank', { steps: [{ id: 'u1', label: 'Stretch', time: '', phase: 'morning', link: '', note: '' }] }), 2);
  assert.match(noTimes, /Stretch/);
  assert.doesNotMatch(noTimes, /Remind me at each step time/);
  assert.match(noTimes, /Set a time and you get an alert at that exact moment/);
});

test('popup, step 2: an empty draft says how to start, and a full one says why it cannot take more', async () => {
  const en = await environment('en');
  assert.match(renderWizard(en, draftFor(en.store, 'blank'), 2), /No steps yet — pick from the suggestions or write your own/);
  const many = Array.from({ length: en.store.MAX_STEPS }, (_, i) => ({ id: 'u' + i, label: 'Step ' + i, time: '', phase: 'day', link: '', note: '' }));
  assert.match(renderWizard(en, draftFor(en.store, 'blank', { steps: many }), 2), new RegExp('At most ' + en.store.MAX_STEPS + ' steps per routine'));
});

test('popup, steps 3 and 4: rules render, the preview lists the steps with their times, and an empty routine cannot be activated', async () => {
  const en = await environment('en');
  const rules = renderWizard(en, draftFor(en.store, 'hunter'), 3);
  assert.match(rules, /Remind me at each step time/);
  assert.match(rules, /No rule here locks a trade/);

  const preview = renderWizard(en, draftFor(en.store, 'hygiene'), 4);
  assert.match(preview, /Activate routine/);
  assert.match(preview, /Brush teeth \(morning\)/);
  assert.match(preview, /07:00/);

  const empty = renderWizard(en, draftFor(en.store, 'blank'), 4);
  assert.match(empty, /At least one step is needed to activate/);

  const editing = renderWizard(en, draftFor(en.store, 'hunter'), 4, 'routine-1');
  assert.match(editing, /Save changes/);
  assert.match(editing, /Edit routine/);
});

test('every page of the wizard renders in all four languages without throwing', async () => {
  for (const lang of ['fa', 'en', 'ar', 'es']) {
    const env = await environment(lang);
    for (const key of Object.keys(env.store.templates())) {
      for (const page of [1, 2, 3, 4]) assert.doesNotThrow(() => renderWizard(env, draftFor(env.store, key), page), `${lang}/${key}/page ${page}`);
    }
  }
});

test('the Routine tab still renders its empty state and its checklist, now grouped by the new life phases too', async () => {
  const { React, renderToString, RoutineTab } = mod;
  const en = await environment('en');
  const empty = renderToString(React.createElement(RoutineTab, { i18n: en.i18n }));
  assert.match(empty, /No routine yet/);
  assert.match(empty, /Build your first routine/);
  assert.doesNotMatch(empty, /role="dialog"/);

  en.store.create({ template: 'hygiene' });
  const today = renderToString(React.createElement(RoutineTab, { i18n: en.i18n }));
  assert.match(today, /TODAY’S ROUTINE/);
  for (const phase of ['Morning', 'During the day', 'Evening', 'Weekly']) assert.match(today, new RegExp(phase));
  assert.match(today, /Brush teeth \(morning\)/);
  assert.doesNotMatch(today, /role="dialog"/);
});
