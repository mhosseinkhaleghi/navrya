import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { trainingCopy } from '../navrya-src/analysisProfileTrainingCopy.js';

// Wiring and copy for the Memory Graph (ARCHITECTURE.md §7.25). Same static-source convention as
// tests/analysis-profile-training-ui.test.mjs: `node --test` has no JSX transform, so the .jsx
// files are asserted by reading them. The graph model itself is real, executable logic and is
// covered by tests/analysis-profile-memory-graph.test.mjs instead.

const root = process.cwd();
const readSrc = async (...parts) => (await readFile(path.join(root, ...parts), 'utf8')).replace(/\r\n/g, '\n');
const exists = async (...parts) => access(path.join(root, ...parts)).then(() => true, () => false);

// Some of these guards forbid a word that the file also legitimately EXPLAINS in prose ("hands
// editing back to the Concepts tab's own applyLearning()/update() paths"). A guard that trips over
// its own documentation is a guard nobody keeps, so those scans run against code only.
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/\s\/\/.*$/gm, '');

const brain = () => readSrc('navrya-src', 'analysisProfileBrain.jsx');
const memoryTab = () => readSrc('navrya-src', 'analysisProfileMemory.jsx');
const view = () => readSrc('navrya-src', 'analysisProfilesView.jsx');
const graphCss = () => readSrc('public', 'pages', 'shared', 'navrya', 'memory-graph.css');

/* ------------------------------------------------------------------ i18n --- */

test('every graph copy key exists in all four languages', () => {
  const keys = Object.keys(trainingCopy.en).filter((key) => key.startsWith('graph'));
  assert.ok(keys.length >= 45, 'expected the full graph key set, found ' + keys.length);
  for (const lang of ['fa', 'ar', 'en', 'es']) {
    for (const key of keys) {
      const value = trainingCopy[lang][key];
      assert.ok(typeof value === 'string' && value.trim(), `${lang}.${key} is missing or blank`);
    }
  }
});

test('no language silently falls back to the English string for a graph key', () => {
  const keys = Object.keys(trainingCopy.en).filter((key) => key.startsWith('graph'));
  for (const lang of ['fa', 'ar', 'es']) {
    const identical = keys.filter((key) => trainingCopy[lang][key] === trainingCopy.en[key]);
    // A couple of legitimately-identical strings are possible; a wholesale copy is not.
    assert.ok(identical.length <= 3, `${lang} reuses ${identical.length} English strings: ${identical.join(', ')}`);
  }
});

test('placeholders in a graph key are the same in every language', () => {
  const keys = Object.keys(trainingCopy.en).filter((key) => key.startsWith('graph'));
  const slots = (text) => (text.match(/\{\w+\}/g) || []).sort().join(',');
  for (const key of keys) {
    for (const lang of ['fa', 'ar', 'es']) {
      assert.equal(slots(trainingCopy[lang][key]), slots(trainingCopy.en[key]), `${lang}.${key} placeholder mismatch`);
    }
  }
});

test('every graph copy key the components ask for actually exists', async () => {
  const sources = (await brain()) + (await memoryTab());
  const asked = new Set();
  // every quoted string shaped like a graph copy key, wherever it sits: trt(lang, 'x'),
  // trt(lang, on ? 'x' : 'y'), or a lookup table of keys
  for (const match of sources.matchAll(/'(graph[A-Z][A-Za-z0-9]*)'/g)) asked.add(match[1]);
  assert.ok(asked.size > 30, 'expected the components to reference many graph keys, saw ' + asked.size);
  for (const key of asked) assert.ok(trainingCopy.en[key], 'component asks for a key that does not exist: ' + key);
});

/* -------------------------------------------------------- Memory tab band --- */

test('the Memory tab renders the graph beside the understanding panel in the five-column band', async () => {
  const source = await memoryTab();
  assert.ok(source.includes("import { MemoryGraphPanel, MemoryGraphWorkspace } from './analysisProfileBrain.jsx'"));
  assert.ok(source.includes('className="nv-memory-band"'));
  assert.ok(source.includes('className="nv-memory-graph"'));
  assert.ok(source.includes('className="nv-memory-understanding"'));
  assert.ok(/<MemoryGraphPanel[\s\S]{0,160}onOpen=/.test(source), 'the panel needs an open handler');
  // the band sits between the subtitle and the understanding panel, per the approved design
  const band = source.indexOf('nv-memory-band');
  assert.ok(source.indexOf("trt(lang, 'memorySubtitle')") < band, 'the band must follow the subtitle');
  assert.ok(band < source.indexOf("trt(lang, 'understandingTitle')"), 'the band must contain the understanding panel');
  assert.ok(band < source.indexOf('<EngineLearningPanel'), 'teach-the-engine stays below the band');
});

test('the layout contract is real CSS: two of five columns, three of five, stacking when narrow', async () => {
  const css = await graphCss();
  assert.match(css, /\.nv-memory-band\s*\{[^}]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.nv-memory-band\s*>\s*\.nv-memory-graph\s*\{\s*grid-column:\s*span 2/);
  assert.match(css, /\.nv-memory-band\s*>\s*\.nv-memory-understanding\s*\{\s*grid-column:\s*span 3/);
  assert.match(css, /@media \(max-width:\s*1120px\)/);
  const narrow = css.slice(css.indexOf('@media'));
  assert.match(narrow, /grid-template-columns:\s*minmax\(0,\s*1fr\)/, 'both areas stack when narrow');
});

test('the stylesheet is imported by the design system entry point, so no character page changed', async () => {
  const styles = await readSrc('public', 'pages', 'shared', 'navrya', 'styles.css');
  assert.ok(styles.includes('@import url("memory-graph.css");'));
});

test('every nv- class the components render exists in the stylesheet', async () => {
  const css = await graphCss();
  const rendered = new Set();
  // Every nv-* token anywhere in the code (className literals, ternaries, string concatenation),
  // so a class built dynamically cannot escape the check.
  for (const source of [await memoryTab(), await brain()]) {
    for (const match of stripComments(source).matchAll(/\bnv-[a-z0-9-]+/g)) rendered.add(match[0]);
  }
  rendered.delete('nv-gx-open');   // toggled on <html>, styled as `html.nv-gx-open`
  rendered.delete('nv-memory-text-');   // the id PREFIX of the graph's textual equivalent (an id, not a class)
  assert.ok(rendered.size >= 40, 'expected the band and workspace classes, saw ' + rendered.size);
  for (const cls of rendered) assert.ok(css.includes('.' + cls), 'class rendered but never styled: ' + cls);
});

test('"Manage concepts" returns to the Concepts tab instead of opening a second editor', async () => {
  assert.ok((await view()).includes("onManageConcepts={() => setDtab('concepts')}"));
  const source = await brain();
  assert.ok(source.includes("trt(lang, 'graphManageConcepts')"));
  assert.ok(/onClick=\{\(\) => \{ onClose\(\); onManageConcepts\(\); \}\}/.test(source));
  // no parallel concept form or store write anywhere in this view
  const code = stripComments(source);
  for (const forbidden of ['applyLearning', 'recordEvent', 'store.update', 'profiles.update', '<textarea']) {
    assert.ok(!code.includes(forbidden), 'the graph view must not write concepts itself: ' + forbidden);
  }
});

/* ------------------------------------------------------- lazy 3D loading --- */

test('the 3D engine is vendored and script-injected, never bundled into the character app', async () => {
  assert.ok(await exists('public', 'pages', 'shared', 'vendor', '3d-force-graph.min.js'), 'the engine is not vendored');
  assert.ok(await exists('public', 'pages', 'shared', 'vendor', '3D-FORCE-GRAPH-LICENSE.txt'), 'the licence is missing');
  const source = await brain();
  assert.ok(source.includes("'../shared/vendor/3d-force-graph.min.js'"), 'vendor path missing');
  assert.match(source, /document\.createElement\('script'\)/, 'the engine must be injected on demand');
  // A bundled import would defeat the lazy load entirely: the IIFE build cannot code-split.
  assert.ok(!/^\s*import .*(force-graph|three)/m.test(source), 'the engine must not be a bundled import');
});

test('the workspace mounts only after the trader opens it', async () => {
  const source = await memoryTab();
  assert.ok(source.includes('const [graphOpen, setGraphOpen] = React.useState(false)'));
  assert.ok(/\{graphOpen && \(\s*<MemoryGraphWorkspace/.test(source), 'the workspace must be gated behind state');
});

test('only one WebGL canvas can exist, and it is destroyed on unmount', async () => {
  const source = await brain();
  assert.ok(source.includes('let ACTIVE_GRAPH = null'));
  assert.ok(source.includes('_destructor()'), 'the previous instance must be torn down');
  assert.ok(/return \(\) => \{[\s\S]{0,200}releaseActiveGraph\(\);/.test(source), 'the effect must clean up');
  assert.ok(source.includes('releaseActiveGraph();\n\n      const host'), 'a new instance must release the old one first');
});

test('a browser without WebGL still gets a node list, the search and the detail panel', async () => {
  const source = await brain();
  assert.ok(source.includes('function webglAvailable()'));
  assert.ok(source.includes("setStatus('no-webgl')"));
  assert.ok(source.includes("trt(lang, 'graphFallbackBody')"));
  // the fallback overlay lists every node, and it does so for a failed engine load too
  assert.ok(source.includes("status === 'no-webgl' || status === 'failed'"));
  assert.ok(source.includes("role=\"group\" aria-label={trt(lang, 'graphNodeList')}"));
  // the search and the panel are siblings of the overlay, not children of the canvas
  const overlay = source.indexOf('nv-gx-overlay');
  assert.ok(source.indexOf('nv-gx-panel') > overlay, 'the panel is rendered outside the canvas branch');
  assert.ok(source.indexOf('nv-gx-search') < overlay);
});

/* ------------------------------------------------------------- behaviour --- */

test('labels are plain text, never markup - these are the trader\'s own words', async () => {
  for (const source of [await brain(), await memoryTab()]) {
    for (const forbidden of ['dangerouslySetInnerHTML', '.innerHTML', 'insertAdjacentHTML']) {
      assert.ok(!source.includes(forbidden), 'user text must never be rendered as HTML: ' + forbidden);
    }
  }
  const source = await brain();
  assert.ok(source.includes('el.textContent = displayLabel(node, lang)'), 'overlay labels set textContent');
  assert.ok(source.includes('text.textContent = displayLabel(node, lang)'), 'preview labels set textContent');
});

test('CSS custom properties are resolved to real colours before they reach WebGL', async () => {
  const source = await brain();
  assert.ok(source.includes('function resolveToken('));
  assert.ok(source.includes('getPropertyValue'));
  assert.ok(/resolveToken\(rootRef\.current \|\| host, '--gx-bg'/.test(source), 'the canvas background must be resolved');
  assert.ok(!/backgroundColor\('var\(/.test(source), 'a raw var() would render as nothing in WebGL');
});

test('motion stops for the toggle, for reduced-motion, and for a hidden tab', async () => {
  const source = await brain();
  assert.ok(source.includes("matchMedia('(prefers-reduced-motion: reduce)')"));
  assert.ok(source.includes("document.addEventListener('visibilitychange', apply)"));
  assert.ok(source.includes('g.pauseAnimation()') && source.includes('g.resumeAnimation()'));
  // The render loop is paused ONLY for a hidden tab. pauseAnimation() also stops the camera
  // controls, so pausing it for the "pause motion" toggle would leave a graph you cannot rotate.
  const calls = source.match(/pauseAnimation\(\)/g) || [];
  assert.equal(calls.length, 1, 'exactly one pauseAnimation() call site');
  assert.ok(/if \(document\.hidden\) g\.pauseAnimation\(\); else g\.resumeAnimation\(\)/.test(source));
  assert.ok(source.includes('linkDirectionalParticles(on ? 1 : 0)'), 'the toggle stops the particles instead');
  assert.ok(source.includes('cameraMs = on ? 900 : 0'), 'and turns the camera easing off');
  // the preview pauses on hover and keyboard focus too
  assert.ok(/wrap\.matches\(':hover'\)/.test(source));
  assert.ok(/wrap\.contains\(document\.activeElement\)/.test(source));
});

test('animation runs on requestAnimationFrame and is always cancelled, never on an interval', async () => {
  const source = await brain();
  assert.ok(!source.includes('setInterval'), 'a permanent interval would keep running behind the view');
  assert.ok(source.includes('window.requestAnimationFrame'));
  const cancels = source.match(/cancelAnimationFrame/g) || [];
  assert.ok(cancels.length >= 2, 'every rAF loop needs its own cleanup, found ' + cancels.length);
});

test('the simulation is bounded and the spheres are low-poly', async () => {
  const source = await brain();
  assert.match(source, /cooldownTicks\(\d+\)/, 'the force simulation must stop');
  assert.match(source, /nodeResolution\(\d+\)/);
  const resolution = Number(source.match(/nodeResolution\((\d+)\)/)[1]);
  assert.ok(resolution <= 16, 'node resolution should stay low, got ' + resolution);
});

test('the view reads the store through the profile it is handed and keeps no state of its own', async () => {
  const source = stripComments(await brain());
  for (const forbidden of ['localStorage', 'sessionStorage', 'indexedDB']) {
    assert.ok(!source.includes(forbidden), 'the graph view must not touch browser storage: ' + forbidden);
  }
  // the only globals it reads are the two registries and the read-only analysis context
  const globals = [...source.matchAll(/window\.(TradeJournal\w+)/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(globals)].sort(),
    ['TradeJournalAnalysisContext', 'TradeJournalAnalysisFocusRegistry', 'TradeJournalAnalysisStyleRegistry']);
  assert.ok(source.includes('getAnalysisContext(profile.id)'));
});

/* ------------------------------------------------ the reference app's chrome --- */

test('the workspace is a fixed overlay, not a child of Modal whose auto-height body collapses the canvas', async () => {
  const source = stripComments(await brain());
  assert.ok(!/from '.*feedback\/Modal\.jsx'/.test(source), 'Modal must not host the workspace');
  assert.ok(!source.includes('<Modal'));
  const css = await graphCss();
  assert.match(css, /\.nv-gx\s*\{[^}]*position:\s*fixed;\s*inset:\s*0/, 'a fixed overlay with an explicit inset');
  assert.match(css, /\.nv-gx-body\s*\{[^}]*flex:\s*1;\s*min-height:\s*0/, 'the body fills what the toolbar leaves');
  assert.match(css, /\.nv-gx-canvas\s*\{[^}]*position:\s*absolute;\s*inset:\s*0/, 'the canvas fills its body');
  // it still yields to the always-on-top ChatDock the way Modal does
  assert.ok(css.includes('padding-block-end: var(--navrya-chat-dock-reserved, 0px)'));
});

test('the workspace behaves as a dialog: role, focus in and back out, Escape, Tab kept inside, scroll locked', async () => {
  const source = await brain();
  assert.ok(source.includes('role="dialog" aria-modal="true"'));
  assert.ok(source.includes('closeRef.current.focus()'), 'focus moves into the dialog');
  assert.ok(/previous\.focus\(\)/.test(source), 'and returns to whatever opened it');
  assert.ok(source.includes("event.key === 'Escape'") && source.includes('onClose();'));
  assert.ok(source.includes("event.key !== 'Tab'"), 'Tab is trapped');
  assert.ok(source.includes("classList.add('nv-gx-open')") && source.includes("classList.remove('nv-gx-open')"));
  assert.match(await graphCss(), /html\.nv-gx-open,\s*html\.nv-gx-open body\s*\{\s*overflow:\s*hidden/);
  // the dialog carries its own direction, so it is right whatever the surrounding page does
  assert.ok(source.includes('dir={dir}') && source.includes("lang === 'fa' || lang === 'ar' ? 'rtl' : 'ltr'"));
});

test('it carries the reference app\'s parts: toolbar, search, filters, toggles, legend, stats pill, tooltip, panel', async () => {
  const source = await brain();
  for (const part of [
    'nv-gx-toolbar', 'nv-gx-search', 'nv-gx-filters', 'nv-gx-toggles', 'nv-gx-legend', 'nv-gx-stats',
    'nv-gx-tooltip', 'nv-gx-panel', 'nv-gx-labels', 'nv-gx-overlay'
  ]) assert.ok(source.includes(part), 'missing ' + part);
  // one filter pill per node kind, coloured by that kind
  assert.ok(source.includes('FILTER_KINDS.map((kind) =>'));
  assert.ok(source.includes("style={{ '--pill': color }}"));
  // the engine settings that make it that graph
  assert.ok(source.includes('.nodeVal((node) => nodeVolume(node, graph.degree))'));
  assert.ok(source.includes('.linkOpacity(0.5)') && source.includes('.linkDirectionalParticleWidth(1.5)'));
  assert.ok(source.includes("const dimNode = 'rgba(30,32,42,0.30)'") && source.includes("const dimLink = 'rgba(30,32,42,0.15)'"));
  assert.ok(source.includes('g.d3Force(\'charge\').strength(-400)') && source.includes('g.d3Force(\'link\').distance(80)'));
});

test('search: a keyboard-reachable result list, Enter to select, Escape to clear, zoom-to-match debounced', async () => {
  const source = await brain();
  assert.ok(source.includes('SEARCH_RESULT_LIMIT') && source.includes('matches.slice(0, SEARCH_RESULT_LIMIT)'));
  assert.ok(source.includes("e.key === 'Enter' && matches[0]"));
  assert.ok(source.includes("e.key === 'Escape' && query"), 'Escape clears the query before it closes the dialog');
  assert.ok(source.includes('e.stopPropagation()'));
  assert.ok(/window\.setTimeout\(\(\) => \{ if \(matches\[0\]\) setSelectedId\(matches\[0\]\.id\); \}, 320\)/.test(source));
  assert.ok(source.includes('window.clearTimeout(timer)'), 'a stale timer is cleared');
});

test('the camera is framed on the first paint, refit once the layout settles, and flies to a selection', async () => {
  const source = await brain();
  assert.ok(source.includes('g.cameraPosition({ x: 0, y: 0, z: Math.max(320, reach * 1.6) }'), 'never an empty first frame');
  assert.ok(source.includes('.onEngineStop(() => {') && source.includes('g.zoomToFit('));
  assert.ok(source.includes('if (fitted || stateRef.current.selected) return;'), 'and never yanks a trader who has moved');
  assert.ok(source.includes('g.cameraPosition(position, n, stateRef.current.cameraMs)'));
  assert.ok(source.includes('r < 1e-3'), 'a node on the origin has no direction to back away along');
});

test('labels are depth-faded and only leaf nodes wait for the camera to come close', async () => {
  const source = await brain();
  assert.ok(source.includes('LABEL_NEAR') && source.includes('LABEL_FADE'));
  assert.ok(source.includes('graph.degree[node.id] || 0) >= 3'));
  assert.ok(source.includes("entry.el.classList.toggle('is-off', !show)"));
  // the live node map is built once, not searched with find() for every label on every frame
  assert.ok(source.includes('liveRef.current = new Map('));
  assert.ok(!/graphData\(\)\.nodes\.find/.test(source));
});

test('the workspace CSS is logical: no physical left/right, except the pointer-following tooltip', async () => {
  const css = await graphCss();
  const workspace = css.slice(css.indexOf('.nv-gx {'));
  const rules = workspace.split('}');
  const offenders = rules.filter((rule) => /(^|[\s;{])(left|right)\s*:|margin-(left|right)|padding-(left|right)|border-(left|right)|text-align:\s*(left|right)/.test(rule))
    .map((rule) => rule.trim().split('{')[0].trim());
  assert.deepEqual(offenders, ['.nv-gx-tooltip'], 'only the tooltip is positioned in physical pixels');
  // RTL slides the panel out the other way, and the centred stats pill is mirrored with it
  assert.match(css, /\.nv-gx\[dir="rtl"\]\s*\{\s*--slide:\s*-100%/);
  assert.match(css, /\.nv-gx\[dir="rtl"\] \.nv-gx-stats\s*\{\s*translate:\s*50% 0/);
});

test('phones: the panel becomes a bottom sheet, the toolbar scrolls sideways, the legend and tooltip go', async () => {
  const css = await graphCss();
  const phone = css.slice(css.indexOf('@media (max-width: 760px)'));
  assert.match(phone, /\.nv-gx-panel\s*\{[^}]*height:\s*62%[^}]*transform:\s*translateY\(100%\)/);
  assert.match(phone, /\.nv-gx-controls\s*\{[^}]*overflow-x:\s*auto/);
  assert.match(phone, /\.nv-gx-legend,\s*\.nv-gx-tooltip\s*\{\s*display:\s*none/);
  assert.match(phone, /\.nv-gx-filter,\s*\.nv-gx-toggle\s*\{[^}]*min-height:\s*38px/, 'touch-sized targets');
});

test('reduced motion also stops the panel slide and the spinner, and focus is always visible', async () => {
  const css = await graphCss();
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\.nv-gx-panel[^}]*transition:\s*none/);
  assert.match(css, /\.nv-gx-spinner\s*\{\s*animation:\s*none/);
  assert.match(css, /\.nv-gx button:focus-visible[\s\S]*box-shadow:\s*0 0 0 2px var\(--char-accent\)/);
  // a closed panel leaves the tab order and the accessibility tree
  assert.match(css, /\.nv-gx-panel\s*\{[^}]*visibility:\s*hidden/);
  assert.ok((await brain()).includes("aria-hidden={selected ? undefined : 'true'}"));
});

test('the graph is memoised on a content signature, not on counts that a rename does not change', async () => {
  const source = await brain();
  assert.ok(source.includes('graphInputSignature(profile)'));
  assert.ok(source.includes('[signature, lang, provided]'), 'the signature still drives the memo; a handed-in synced graph is the only other input');
  assert.ok(!source.includes('profile.concepts.length'), 'a length-based dependency misses renames');
});

test('the rejected brain-shaped preview is gone: no lobes, gyri, brain stem or hemisphere in the shipped code', async () => {
  for (const file of ['analysisProfileBrain.jsx', 'analysisProfileBrainGraph.js']) {
    const code = stripComments(await readSrc('navrya-src', file)).toLowerCase();
    for (const word of ['lobe', 'gyri', 'cortex', 'hemisphere', 'corpus', 'brainstem', 'brain stem']) {
      assert.ok(!code.includes(word), file + ' still mentions ' + word);
    }
  }
  assert.ok(!(await exists('docs', 'artboards', 'memory-graph.artboard.html')), 'the rejected artboard is removed');
});
