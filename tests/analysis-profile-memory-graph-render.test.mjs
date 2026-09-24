import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';

// The Memory Graph components, actually RENDERED.
//
// Every other test for a navrya-src .jsx file is static (`node --test` has no JSX transform), and
// tests/analysis-profile-no-undefined-constants.test.mjs exists because that blind spot shipped two
// ReferenceErrors to production in a row: nothing ever executed the render, so a name that was used
// but never imported only failed in a user's browser. This closes the gap for the Memory Graph
// without a new dependency - esbuild is already here as Vite's own compiler - by bundling the real
// components together with React, then server-rendering them. renderToString runs the whole render
// phase (every hook initialiser, every branch, every translation lookup) and skips effects, which
// need a DOM: the WebGL engine, the animation loops and the label overlay are covered by the static
// tests, and the pure model by analysis-profile-memory-graph.test.mjs.

const root = process.cwd();
const require = createRequire(import.meta.url);

let scratch;
let mod;

test.before(async () => {
  scratch = await mkdtemp(path.join(os.tmpdir(), 'nv-memory-graph-'));
  const outfile = path.join(scratch, 'bundle.cjs');
  await build({
    stdin: {
      contents: [
        "import React from 'react';",
        "import { renderToString } from 'react-dom/server';",
        "import { MemoryGraphPanel, MemoryGraphWorkspace } from './navrya-src/analysisProfileBrain.jsx';",
        'export { React, renderToString, MemoryGraphPanel, MemoryGraphWorkspace };'
      ].join('\n'),
      resolveDir: root,
      loader: 'jsx',
      sourcefile: 'render-entry.jsx'
    },
    bundle: true,
    format: 'cjs',
    platform: 'node',
    outfile,
    jsx: 'transform',
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'silent'
  });

  // The components read three globals that the real character page provides.
  const styles = { price_action: { name: { fa: 'پرایس اکشن', en: 'Price Action' }, shortDescription: { fa: 'خواندن مستقیم.', en: 'Reading price.' }, recommendedFocusIds: ['market_structure'], optionalFocusIds: [] } };
  const focuses = { market_structure: { name: { fa: 'ساختار بازار', en: 'Market Structure' }, shortDescription: { fa: 'نقشه سوئینگ‌ها.', en: 'The map of swings.' } } };
  globalThis.window = {
    TradeJournalAnalysisStyleRegistry: { get: (id) => styles[id] || null },
    TradeJournalAnalysisFocusRegistry: { get: (id) => focuses[id] || null },
    TradeJournalAnalysisContext: null,
    matchMedia: () => ({ matches: false })
  };
  mod = require(outfile);
});

test.after(async () => {
  delete globalThis.window;
  if (scratch) await rm(scratch, { recursive: true, force: true });
});

const profile = (overrides) => Object.assign({
  id: 'p1', name: 'پرایس اکشن روزانه', description: '',
  primaryStyleId: 'price_action', secondaryStyleIds: [],
  focusIds: ['market_structure'],
  customFocuses: [{ id: 'cf1', name: 'ساعت باز شدن لندن', description: '', origin: 'user' }],
  concepts: [
    { id: 'c1', title: 'سطح سوییپ‌شده', description: '', priority: 'mandatory', origin: 'user', enabled: true },
    { id: 'c2', title: 'تأیید تایم‌فریم بالاتر', description: '', priority: 'preferred', origin: 'chat', enabled: true }
  ],
  understanding: { summary: 'این تریدر ابتدا ساختار را می‌خواند.', version: 3, updatedAt: '2026-09-18T00:00:00.000Z' }
}, overrides || {});

const render = (Component, props) => mod.renderToString(mod.React.createElement(Component, props));
const noop = () => {};
// A leaked copy key would print as its own name: a missing translation, visible to the trader.
const leakedKeys = (html) => (html.replace(/class="[^"]*"/g, '').match(/\bgraph[A-Z][A-Za-z0-9]+\b/g) || []);

test('the graph block renders in all four languages with real copy, real counts and a working open button', () => {
  for (const lang of ['fa', 'ar', 'en', 'es']) {
    const html = render(mod.MemoryGraphPanel, { profile: profile(), lang, onOpen: noop });
    assert.deepEqual(leakedKeys(html), [], lang + ' leaked a copy key');
    assert.ok(html.includes('<svg'), lang + ': the preview svg is present');
    assert.match(html, /role="img"/);
    assert.ok(!/disabled=""/.test(html), lang + ': the open button is enabled for a populated profile');
  }
  const fa = render(mod.MemoryGraphPanel, { profile: profile(), lang: 'fa', onOpen: noop });
  assert.ok(fa.includes('رصدخانه‌ی حافظه'), 'the block title');
  assert.ok(fa.includes('باز کردن گراف سه‌بعدی'), 'the open button');
  // 1 profile + 1 primary style + 1 focus + 1 own focus + 2 concepts + 1 understanding = 7 nodes, in Persian digits
  assert.ok(fa.includes('۷ گره'), 'the node count chip');
  assert.ok(fa.includes('۳'), 'the understanding version');
});

test('a profile with nothing to draw shows the empty state and a disabled open button', () => {
  const bare = profile({ primaryStyleId: '', focusIds: [], customFocuses: [], concepts: [], understanding: { summary: '', version: 0, updatedAt: null } });
  const html = render(mod.MemoryGraphPanel, { profile: bare, lang: 'en', onOpen: noop });
  assert.ok(html.includes('Nothing to show yet'));
  assert.ok(/<button[^>]*disabled/.test(html));
  assert.ok(!html.includes('<svg') || !/role="img"/.test(html), 'no preview is drawn for an empty graph');
});

test('the workspace renders as a labelled dialog carrying the right direction for each language', () => {
  const dirs = { fa: 'rtl', ar: 'rtl', en: 'ltr', es: 'ltr' };
  for (const [lang, dir] of Object.entries(dirs)) {
    const html = render(mod.MemoryGraphWorkspace, { profile: profile(), lang, onClose: noop, onManageConcepts: noop });
    assert.deepEqual(leakedKeys(html), [], lang + ' leaked a copy key');
    assert.ok(html.includes('role="dialog"') && html.includes('aria-modal="true"'), lang);
    assert.ok(html.includes('class="nv-gx"') && html.includes('dir="' + dir + '"'), lang + ' direction ' + dir);
    assert.ok(html.includes('data-status="loading"'), lang + ': starts in the loading state');
  }
});

test('the workspace carries every part of the reference chrome on first paint', () => {
  const html = render(mod.MemoryGraphWorkspace, { profile: profile(), lang: 'en', onClose: noop, onManageConcepts: noop });
  for (const part of ['nv-gx-toolbar', 'nv-gx-search', 'nv-gx-filters', 'nv-gx-toggles', 'nv-gx-canvas', 'nv-gx-labels', 'nv-gx-stats', 'nv-gx-legend', 'nv-gx-tooltip', 'nv-gx-panel', 'nv-gx-overlay']) {
    assert.ok(html.includes(part), 'missing ' + part);
  }
  // one filter pill per node kind
  assert.equal((html.match(/class="nv-gx-filter is-on"/g) || []).length, 7);
  assert.equal((html.match(/<input[^>]*type="search"/g) || []).length, 1);
  // the loading spinner, a title, and the profile name in the toolbar
  assert.ok(html.includes('nv-gx-spinner') && html.includes('Building the graph'));
  assert.ok(html.includes('Profile memory graph'));
  assert.ok(html.includes('پرایس اکشن روزانه'));
  // stats pill: 7 nodes, and links = profile→style, profile→focus, style→focus, profile→own focus,
  // profile→2 concepts, profile→understanding = 7
  assert.ok(html.includes('7 nodes · 7 links'));
  // the detail panel exists but is closed, and is hidden from assistive technology until a node is selected
  assert.match(html, /<aside class="nv-gx-panel"[^>]*aria-hidden="true"/);
  // the legend lists every node kind, and the "brighter = mandatory" note
  assert.ok(html.includes('Brighter = mandatory'));
});

test('the workspace renders identically twice: no random input reaches the markup', () => {
  const a = render(mod.MemoryGraphWorkspace, { profile: profile(), lang: 'fa', onClose: noop, onManageConcepts: noop });
  const b = render(mod.MemoryGraphWorkspace, { profile: profile(), lang: 'fa', onClose: noop, onManageConcepts: noop });
  assert.equal(a, b);
});

test('a hostile concept title is escaped, never emitted as markup', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const html = render(mod.MemoryGraphWorkspace, {
    profile: profile({ concepts: [{ id: 'c1', title: evil, description: '', priority: 'mandatory', origin: 'user', enabled: true }] }),
    lang: 'en', onClose: noop, onManageConcepts: noop
  });
  assert.ok(!html.includes('<img src=x'), 'raw markup must never appear');
  assert.ok(!/onerror=alert/.test(html.replace(/&lt;img src=x onerror=alert\(1\)&gt;/g, '')), 'and no live handler either');
});

test('the render survives a profile the store has not normalised yet', () => {
  const sparse = { id: 'p2', name: '', primaryStyleId: 'price_action', understanding: { summary: '', version: 0, updatedAt: null }, concepts: [] };
  for (const lang of ['fa', 'en']) {
    assert.doesNotThrow(() => render(mod.MemoryGraphPanel, { profile: sparse, lang, onOpen: noop }));
    assert.doesNotThrow(() => render(mod.MemoryGraphWorkspace, { profile: sparse, lang, onClose: noop, onManageConcepts: noop }));
  }
});
