import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { build } from 'esbuild';
import {
  TECHNIQUES, techniqueById, cycleSeconds, locate, phaseBoundaries, normalizeCalmPrefs, PHASE_LABEL_KEY, CALM_PREF_KEY
} from '../navrya-src/calmRoomBreath.js';

// The Calm Room redesign (code-codex/peace design canvas): the breathing model, the four-language
// copy, and the popup + board card actually RENDERED from the real calmRoom.jsx (esbuild + React
// server rendering; createPortal is shimmed to return its children, as in routine-builder-render).

const root = process.cwd();
const require = createRequire(import.meta.url);
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = (...parts) => readFile(path.join(root, ...parts), 'utf8').then((text) => text.replace(/\r\n/g, '\n'));

let scratch;
let mod;

test('the technique catalogue: default long exhale, box/tactical, cyclic sighing, 4-7-8 and coherent', () => {
  assert.deepEqual(TECHNIQUES.map((t) => t.id), ['calm', 'box', 'sigh', '478', 'coherent']);
  assert.deepEqual(techniqueById('calm').phases, [['in', 4], ['full', 2], ['out', 6]]);
  assert.deepEqual(techniqueById('box').phases, [['in', 4], ['full', 4], ['out', 4], ['empty', 4]]);
  assert.deepEqual(techniqueById('sigh').phases, [['inpart', 3], ['top', 1], ['out', 7]]);
  assert.deepEqual(techniqueById('478').phases, [['in', 4], ['full', 7], ['out', 8]]);
  assert.deepEqual(techniqueById('coherent').phases, [['in', 5.5], ['out', 5.5]]);
  assert.equal(techniqueById('nope').id, 'calm');
  for (const tech of TECHNIQUES) for (const [kind] of tech.phases) assert.ok(PHASE_LABEL_KEY[kind], kind);
});

test('the clock: phase, cycle and the whole-second countdown under the word', () => {
  const calm = techniqueById('calm');
  assert.equal(cycleSeconds(calm), 12);
  assert.deepEqual([locate(calm, 0).idx, locate(calm, 0).left], [0, 4]);
  assert.deepEqual([locate(calm, 3.2).idx, locate(calm, 3.2).left], [0, 1]);
  assert.deepEqual([locate(calm, 4.5).idx, locate(calm, 4.5).left], [1, 2]);
  assert.deepEqual([locate(calm, 6.1).idx, locate(calm, 6.1).left], [2, 6]);
  assert.deepEqual([locate(calm, 12.2).idx, locate(calm, 12.2).cycle], [0, 1]);
  const coherent = techniqueById('coherent');
  assert.equal(locate(coherent, 0).left, 5, 'a 5.5 s phase counts 5, 4, ... 1');
  assert.equal(locate(coherent, 5.4).left, 1);
  assert.equal(locate(coherent, 5.6).idx, 1);
  const sigh = techniqueById('sigh');
  assert.equal(locate(sigh, 3.5).idx, 1, 'the short top-up inhale');
  assert.deepEqual(phaseBoundaries(techniqueById('box')), [0, 90, 180, 270]);
});

test('saved preferences are normalized: unknown technique, volumes clamped, sound off by default', () => {
  assert.deepEqual(normalizeCalmPrefs(null), { technique: 'calm', breathSound: false, breathVolume: 0.6, musicVolume: 0.6, trackId: null });
  assert.deepEqual(
    normalizeCalmPrefs({ technique: 'box', breathSound: true, breathVolume: 4, musicVolume: -1, trackId: 'trk-1' }),
    { technique: 'box', breathSound: true, breathVolume: 1, musicVolume: 0, trackId: 'trk-1' }
  );
  assert.equal(normalizeCalmPrefs({ technique: 'wim-hof' }).technique, 'calm');
  assert.equal(CALM_PREF_KEY, 'calmRoom');
});

test('every string the calm room reads exists in fa, ar, en and es', async () => {
  const i18nSource = await readFile(shared('trade-i18n.js'), 'utf8');
  const sandbox = { window: {}, document: { documentElement: { lang: 'fa' } } };
  vm.runInNewContext(i18nSource, sandbox);
  const { messages } = sandbox.window.TradeJournalTradeI18n;
  const room = await source('navrya-src', 'calmRoom.jsx');
  const keys = new Set([...room.matchAll(/\bt\('([A-Za-z0-9_]+)'\s*[,)]/g)].map((m) => m[1]));
  for (const m of room.matchAll(/t\((?:running|playing|breathDone|reasonGiven|canLeave|prefs\.breathSound|on) \? '([A-Za-z0-9_]+)' : '([A-Za-z0-9_]+)'/g)) { keys.add(m[1]); keys.add(m[2]); }
  Object.values(PHASE_LABEL_KEY).forEach((key) => keys.add(key));
  for (const tech of TECHNIQUES) for (const part of ['Name', 'Tag', 'Use', 'Rounds', 'Hint']) keys.add('calmTech' + tech.key + part);
  keys.add('calmTech478Caution');
  assert.ok(keys.size > 60, 'found the room\'s keys');
  for (const lang of ['fa', 'ar', 'en', 'es']) {
    const missing = [...keys].filter((key) => !messages[lang][key]);
    assert.deepEqual(missing, [], lang + ' is missing keys');
  }
  assert.match(messages.fa.moodCalmSubtitle, /هر سه شرط/);
  assert.match(messages.en.moodCalmLeaveHint, /all three conditions/);
});

// The real stores a character page provides, in the language under test.
async function environment(lang, prefs) {
  const values = new Map();
  const localStorage = { getItem: (k) => (values.has(k) ? values.get(k) : null), setItem: (k, v) => values.set(k, String(v)), removeItem: (k) => values.delete(k), key: () => null, get length() { return values.size; } };
  const document = { body: {}, documentElement: { lang, dir: lang === 'fa' || lang === 'ar' ? 'rtl' : 'ltr' } };
  const sandbox = {
    window: { __NAVRYA_AUTH__: { authenticated: true, userId: 'u1', user: { id: 'u1' }, csrfToken: 'c' } },
    document, localStorage,
    fetch: async (url, options) => ((options && options.method === 'POST') ? { ok: true, json: async () => JSON.parse(options.body) } : { ok: true, json: async () => ({ preferences: [] }) }),
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options && options.detail; } }
  };
  sandbox.window = Object.assign(sandbox.window, { localStorage, document, dispatchEvent() {}, addEventListener() {}, removeEventListener() {}, fetch: sandbox.fetch });
  for (const file of ['server-replica.js', 'user-preferences.js', 'trade-i18n.js']) {
    vm.runInNewContext(await readFile(shared(file), 'utf8'), sandbox, { filename: file });
  }
  await new Promise((resolve) => setImmediate(resolve));
  if (prefs) sandbox.window.TradeJournalUserPreferences.setPref('calmRoom', prefs);
  const psych = {
    settings: () => ({ postTradeReflection: { cooldownMinutes: 15 } }),
    worstRevengeTrade: () => null
  };
  Object.assign(sandbox.window, {
    TradeJournalPsychologyStore: psych,
    TradeJournalTradeStore: { listSync: () => [] },
    TradeJournalMentalHealthStore: { load: () => ({ continuousTracking: { postTradeReflections: [] } }) }
  });
  globalThis.window = sandbox.window;
  globalThis.document = document;
  return { i18n: sandbox.window.TradeJournalTradeI18n, psych, window: sandbox.window };
}

test.before(async () => {
  scratch = await mkdtemp(path.join(os.tmpdir(), 'nv-calm-room-'));
  const outfile = path.join(scratch, 'bundle.cjs');
  await build({
    stdin: {
      contents: [
        "import React from 'react';",
        "import { renderToString } from 'react-dom/server';",
        "import { CalmRoom, CalmRoomPanel, TypesList } from './navrya-src/calmRoom.jsx';",
        'export { React, renderToString, CalmRoom, CalmRoomPanel, TypesList };'
      ].join('\n'),
      resolveDir: root,
      loader: 'jsx',
      sourcefile: 'calm-room-entry.jsx'
    },
    plugins: [{
      name: 'react-dom-portal-shim',
      setup(b) {
        b.onResolve({ filter: /^react-dom$/ }, () => ({ path: 'react-dom-shim', namespace: 'shim' }));
        b.onLoad({ filter: /.*/, namespace: 'shim' }, () => ({ contents: 'export const createPortal = (children) => children;', loader: 'js' }));
      }
    }],
    bundle: true, format: 'cjs', platform: 'node', outfile, jsx: 'transform',
    define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent'
  });
  mod = require(outfile);
});

test.after(async () => {
  delete globalThis.window;
  delete globalThis.document;
  if (scratch) await rm(scratch, { recursive: true, force: true });
});

function renderRoom(env) {
  const { React, renderToString, CalmRoom } = mod;
  return renderToString(React.createElement(CalmRoom, {
    i18n: env.i18n, psych: env.psych, profile: { continuousTracking: { postTradeReflections: [] } }, trades: [], onClose: () => {}
  }));
}

test('the popup is the shared opaque Modal in the character colour, with the design\'s sections (Persian)', async () => {
  const env = await environment('fa');
  const html = renderRoom(env);
  assert.match(html, /role="dialog"/);
  assert.match(html, /data-character="hunter"/);
  assert.match(html, /background:var\(--ink-900\)/, 'the dialog keeps the Modal\'s opaque ink');
  assert.doesNotMatch(html, /rgba\(46,204,113,\.07\)/, 'no see-through tint over the dialog');
  assert.doesNotMatch(html, /۴ دم · ۲ نگه/, 'the old pattern chip is gone');
  for (const text of ['اتاق آرامش', 'هر سه شرط', 'تمرین', 'انواع تنفس', 'دور ۱', 'توقف', 'رد کردن تنفس', 'بازدم بلند',
    'صدای نفس', 'افزودن آهنگ', 'هنوز آهنگی اضافه نکرده‌ای', 'دروازهٔ خروج', 'یک دور کامل تنفس', 'دلیل نوشته شود', 'بازگشت به معامله']) {
    assert.ok(html.includes(text), 'missing: ' + text);
  }
  // the stepper is the pattern: inhale, hold, exhale with their seconds
  for (const text of ['دم', 'مکث', 'بازدم', '۴ ث', '۲ ث', '۶ ث']) assert.ok(html.includes(text), 'stepper: ' + text);
  // the breath is animated by CSS, starting with the inhale
  assert.match(html, /navrya-calm-disc-in 4s cubic-bezier\(\.37,0,\.63,1\)/);
  assert.match(html, /navrya-calm-streak-in /);
  assert.match(html, /navrya-calm-streak-out /);
  assert.match(html, /@keyframes navrya-calm-disc-out/);
  assert.match(html, /color-mix\(in srgb, var\(--char-accent\)/, 'accents come from the character tokens');
  assert.match(html, /role="switch" aria-checked="false"/, 'breath sound starts off');
  assert.match(html, /accept="audio\/\*"/);
});

test('the popup follows the saved technique and speaks English', async () => {
  const env = await environment('en', { technique: 'box', breathSound: true });
  const html = renderRoom(env);
  for (const text of ['Calm room', 'Practice', 'Breathing types', 'Box / tactical', 'Four equal phases', 'Breath sound', 'Add song', 'all three conditions']) {
    assert.ok(html.includes(text), 'missing: ' + text);
  }
  assert.equal((html.match(/>Hold</g) || []).length, 2, 'box has two holds');
  assert.match(html, /role="switch" aria-checked="true"/);
  assert.match(html, /navrya-calm-ring 16s linear/, 'the cycle ring spans the 16 s box cycle');
});

test('the breathing-types tab lists every technique with its source, pattern and cautions', async () => {
  const env = await environment('fa');
  const { React, renderToString, TypesList } = mod;
  const html = renderToString(React.createElement(TypesList, { i18n: env.i18n, activeId: 'sigh', onPick: () => {} }));
  for (const text of ['بازدم بلند', 'مربعی / تاکتیکی', 'نیروی دریایی و ارتش', 'آه چرخه‌ای', 'استنفورد ۲۰۲۳', '۴–۷–۸', 'دکتر اندرو وایل', 'هم‌آهنگ',
    'دم ۴، مکث ۴، بازدم ۴، مکث ۴ ثانیه', 'دم ۳، دم دوم ۱، بازدم ۷ ثانیه', 'دم ۵٫۵، بازدم ۵٫۵ ثانیه', 'در حال تمرین', 'در بارداری مکث را حذف کن']) {
    assert.ok(html.includes(text), 'missing: ' + text);
  }
  assert.equal((html.match(/aria-pressed="true"/g) || []).length, 1);
});

test('the board card: live mini pacer, technique, sound and music status, and the way in', async () => {
  const env = await environment('fa', { technique: 'sigh' });
  const { React, renderToString, CalmRoomPanel } = mod;
  const html = renderToString(React.createElement(CalmRoomPanel, { i18n: env.i18n }));
  for (const text of ['آه چرخه‌ای', 'استنفورد ۲۰۲۳', 'صدای نفس خاموش', 'بدون موسیقی', 'ورود به اتاق آرامش', 'دم دوم']) {
    assert.ok(html.includes(text), 'missing: ' + text);
  }
  assert.match(html, /navrya-calm-disc-inpart 3s/);
  const titled = renderToString(React.createElement(CalmRoomPanel, { i18n: env.i18n, titled: true }));
  assert.ok(titled.includes('کول‌داون ۱۵ دقیقه'));
});

test('every host uses the one calm room module; the old inline copies are gone', async () => {
  const [mood, psychology, dashboard, session, room] = await Promise.all([
    source('navrya-src', 'moodTab.jsx'), source('navrya-src', 'psychologyView.jsx'), source('navrya-src', 'dashboardView.jsx'),
    source('navrya-src', 'liveSessionView.jsx'), source('navrya-src', 'calmRoom.jsx')
  ]);
  assert.match(mood, /import \{ CalmRoom, CalmRoomPanel \} from '\.\/calmRoom\.jsx';/);
  assert.doesNotMatch(mood, /function (BreathPreview|CalmRoom|CalmRoomPanel)\b/);
  assert.doesNotMatch(mood, /rgba\(102,201,78,\.45\)/, 'the mood tab card is no longer hard-coded Hunter green');
  assert.match(psychology, /import \{ CalmRoom, CalmRoomPanel, BreathPreview \} from '\.\/calmRoom\.jsx';/);
  assert.doesNotMatch(psychology, /psyCalmRoomPattern/);
  assert.match(dashboard, /import \{ CalmRoomPanel \} from '\.\/calmRoom\.jsx';/);
  assert.match(dashboard, /catCalmRoomMeta/);
  assert.match(session, /import \{ CalmRoomPanel \} from '\.\/calmRoom\.jsx';/);
  const modal = room.slice(room.indexOf('<Modal'), room.indexOf('footer=', room.indexOf('<Modal')));
  assert.doesNotMatch(modal, /style=/, 'the popup never overrides the Modal surface');
  assert.match(room, /createPortal\(/);
});
