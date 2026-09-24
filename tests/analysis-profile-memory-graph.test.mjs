import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  NODE_KINDS, LINK_KINDS, LAYERS, CONCEPT_PRIORITY_COLOR,
  buildMemoryGraph, buildLaidOutGraph, layoutMemoryGraph, degreeMap,
  nodeVolume, nodeRadius, nodeColor, linkColor, graphSeed, seededRandom, boundingBox, graphInputSignature
} from '../navrya-src/analysisProfileBrainGraph.js';

// The Memory Graph is a DERIVED view of an Analysis Profile (ARCHITECTURE.md §7.25). These tests
// hold the two properties that make that claim true: it never invents a relationship the profile
// or the registry does not already state, and it never uses randomness, so the same profile always
// draws the same graph.

const root = process.cwd();

/* ---- fixtures: shaped exactly like the real registries' get(id) ---- */
const STYLES = {
  price_action: {
    id: 'price_action',
    name: { fa: 'پرایس اکشن', ar: 'حركة السعر', en: 'Price Action', es: 'Price Action' },
    shortDescription: { fa: 'خواندن مستقیم حرکت قیمت.', en: 'Reading price directly.' },
    recommendedFocusIds: ['market_structure', 'key_levels', 'momentum'],
    optionalFocusIds: ['multi_timeframe', 'never_selected']
  },
  smc: {
    id: 'smc',
    name: { fa: 'مفاهیم پول هوشمند (SMC)', en: 'Smart Money Concepts / SMC' },
    shortDescription: { fa: 'ردیابی نقدینگی.', en: 'Tracking liquidity.' },
    recommendedFocusIds: ['liquidity_sweep', 'market_structure'],
    optionalFocusIds: []
  }
};
const FOCUSES = {
  market_structure: { id: 'market_structure', name: { fa: 'ساختار بازار', en: 'Market Structure' }, shortDescription: { fa: 'نقشه سوئینگ‌ها.', en: 'The map of swings.' } },
  key_levels: { id: 'key_levels', name: { fa: 'سطوح کلیدی', en: 'Key Levels' }, shortDescription: { fa: 'قیمت‌های مهم.', en: 'Prices that matter.' } },
  momentum: { id: 'momentum', name: { fa: 'مومنتوم', en: 'Momentum' }, shortDescription: { fa: 'شتاب حرکت.', en: 'Speed of price.' } },
  liquidity_sweep: { id: 'liquidity_sweep', name: { fa: 'جاروب نقدینگی', en: 'Liquidity Sweep' }, shortDescription: { fa: 'جمع‌آوری نقدینگی.', en: 'Collecting liquidity.' } },
  multi_timeframe: { id: 'multi_timeframe', name: { fa: 'چند تایم‌فریم', en: 'Multi-Timeframe Context' }, shortDescription: { fa: 'بیش از یک تایم‌فریم.', en: 'More than one timeframe.' } }
};
const styles = { get: (id) => STYLES[id] || null };
const focuses = { get: (id) => FOCUSES[id] || null };

function profileFixture(overrides) {
  return Object.assign({
    id: 'analysis-profile-abc',
    name: 'پرایس اکشن روزانه',
    description: '',
    primaryStyleId: 'price_action',
    secondaryStyleIds: ['smc'],
    focusIds: ['market_structure', 'key_levels', 'momentum', 'liquidity_sweep', 'multi_timeframe'],
    customFocuses: [
      { id: 'cf1', name: 'ساعت باز شدن لندن', description: 'سی دقیقه‌ی اول.', origin: 'user' }
    ],
    concepts: [
      { id: 'c1', title: 'سطح سوییپ‌شده', description: 'پیش از ورود.', priority: 'mandatory', origin: 'user', enabled: true },
      { id: 'c2', title: 'تأیید تایم‌فریم بالاتر', description: '', priority: 'preferred', origin: 'chat', enabled: true },
      { id: 'c3', title: 'مفهوم خاموش', description: '', priority: 'reference', origin: 'ai', enabled: false }
    ],
    understanding: { summary: 'این تریدر ابتدا ساختار را می‌خواند.', version: 3, updatedAt: '2026-09-18T00:00:00.000Z' }
  }, overrides || {});
}
const build = (overrides, options) => buildMemoryGraph(profileFixture(overrides), Object.assign({ styles, focuses, lang: 'fa' }, options || {}));
const ids = (graph) => graph.nodes.map((n) => n.id);
const linkKeys = (graph) => graph.links.map((l) => l.source + '->' + l.target + ':' + l.kind);

/* ---------------------------------------------------------------- taxonomy --- */

test('every node kind and link kind the brief names exists, and each maps to a real layer', () => {
  for (const kind of ['profile', 'primary-style', 'secondary-style', 'focus', 'custom-focus', 'concept', 'understanding']) {
    assert.ok(NODE_KINDS[kind], 'missing node kind ' + kind);
    assert.ok(LAYERS[NODE_KINDS[kind].layer], kind + ' points at an unknown layer');
  }
  for (const kind of ['primary-lens', 'secondary-lens', 'focus', 'custom-focus', 'active-concept', 'understanding']) {
    assert.ok(LINK_KINDS[kind], 'missing link kind ' + kind);
    assert.ok(LAYERS[LINK_KINDS[kind].layer], kind + ' points at an unknown layer');
  }
  assert.equal(NODE_KINDS.profile.layer, 'structural');
  assert.equal(NODE_KINDS['primary-style'].layer, 'lens');
  assert.equal(NODE_KINDS.concept.layer, 'learned');
  assert.equal(NODE_KINDS.understanding.layer, 'learned');
});

/* -------------------------------------------------------------- structure --- */

test('builds one node per real profile element, and hangs each off the profile with its own link kind', () => {
  const graph = build();
  assert.deepEqual(ids(graph).slice(0, 4), ['profile', 'style:price_action', 'style:smc', 'focus:market_structure']);
  const keys = linkKeys(graph);
  assert.ok(keys.includes('profile->style:price_action:primary-lens'));
  assert.ok(keys.includes('profile->style:smc:secondary-lens'));
  assert.ok(keys.includes('profile->focus:key_levels:focus'));
  assert.ok(keys.includes('profile->custom:cf1:custom-focus'));
  assert.ok(keys.includes('profile->concept:c1:active-concept'));
  assert.ok(keys.includes('profile->understanding:understanding'));
  assert.equal(graph.counts.concept, 2, 'the disabled concept is not a node');
  assert.equal(graph.counts['secondary-style'], 1);
});

test('registry names and descriptions are resolved in the requested language', () => {
  const fa = build();
  const en = buildMemoryGraph(profileFixture(), { styles, focuses, lang: 'en' });
  assert.equal(fa.nodes.find((n) => n.id === 'style:price_action').label, 'پرایس اکشن');
  assert.equal(en.nodes.find((n) => n.id === 'style:price_action').label, 'Price Action');
  assert.equal(fa.nodes.find((n) => n.id === 'focus:market_structure').description, 'نقشه سوئینگ‌ها.');
});

test('an id the registry cannot resolve falls back to the raw id and is flagged, never invented', () => {
  const graph = build({ primaryStyleId: 'no_such_style', focusIds: ['no_such_focus'] });
  const style = graph.nodes.find((n) => n.id === 'style:no_such_style');
  assert.equal(style.label, 'no_such_style');
  assert.equal(style.resolved, false);
  assert.equal(style.description, '');
  const focus = graph.nodes.find((n) => n.id === 'focus:no_such_focus');
  assert.equal(focus.resolved, false);
});

/* ----------------------------------------------- never invent a relationship --- */

test('style→focus edges come only from the registry AND only for focuses the trader selected', () => {
  const keys = linkKeys(build());
  // declared by price_action and selected
  assert.ok(keys.includes('style:price_action->focus:market_structure:style-focus'));
  assert.ok(keys.includes('style:price_action->focus:momentum:style-focus'));
  // optional in the registry, selected by the trader
  assert.ok(keys.includes('style:price_action->focus:multi_timeframe:style-focus'));
  // declared by smc as well - the same focus genuinely belongs to both lenses
  assert.ok(keys.includes('style:smc->focus:market_structure:style-focus'));
  // declared by the registry but NOT selected by the trader: no node, so no edge
  assert.ok(!keys.some((k) => k.includes('never_selected')));
  // never declared by smc: no edge, even though both nodes exist
  assert.ok(!keys.includes('style:smc->focus:key_levels:style-focus'));
});

test('a focus the trader selected that no active style declares keeps only its own profile edge', () => {
  const graph = build({ primaryStyleId: 'price_action', secondaryStyleIds: [], focusIds: ['liquidity_sweep'] });
  const keys = linkKeys(graph);
  assert.ok(keys.includes('profile->focus:liquidity_sweep:focus'));
  assert.ok(!keys.some((k) => k.startsWith('style:') && k.includes('liquidity_sweep')));
});

test('a concept carries its stored origin category verbatim and is never linked to a source node', () => {
  const graph = build();
  assert.equal(graph.nodes.find((n) => n.id === 'concept:c1').origin, 'user');
  assert.equal(graph.nodes.find((n) => n.id === 'concept:c2').origin, 'chat');
  // there is no node kind for a knowledge source at all, so no edge can claim one made a concept
  assert.ok(!Object.keys(NODE_KINDS).some((k) => /source|document|knowledge/.test(k)));
  assert.ok(!graph.links.some((l) => /source:/.test(l.source) || /source:/.test(l.target)));
});

test('an unrecognised origin falls back to "user" rather than being passed through or guessed', () => {
  const graph = build({ concepts: [{ id: 'c9', title: 'x', priority: 'preferred', origin: 'smuggled', enabled: true }] });
  assert.equal(graph.nodes.find((n) => n.id === 'concept:c9').origin, 'user');
});

/* ------------------------------------------------- enabled concepts only --- */

test('a disabled concept is absent entirely - no node and no link', () => {
  const graph = build();
  assert.ok(!ids(graph).includes('concept:c3'));
  assert.ok(!linkKeys(graph).some((k) => k.includes('c3')));
});

test('when an analysis context is supplied it is the authority on what reached the engine', () => {
  // c2 is enabled in the store but absent from the context bundle: the engine did not get it.
  const graph = build({}, { context: { concepts: [{ id: 'c1' }] } });
  assert.ok(ids(graph).includes('concept:c1'));
  assert.ok(!ids(graph).includes('concept:c2'));
});

test('an understanding node exists only once the engine has actually learned something', () => {
  assert.ok(ids(build()).includes('understanding'));
  assert.ok(!ids(build({ understanding: { summary: '', version: 0 } })).includes('understanding'));
  assert.ok(!ids(build({ understanding: undefined })).includes('understanding'));
});

test('a garbage or empty profile produces an empty graph instead of throwing', () => {
  for (const input of [null, undefined, 'nope', 42, {}]) {
    const graph = buildMemoryGraph(input, { styles, focuses });
    assert.ok(Array.isArray(graph.nodes));
    assert.ok(Array.isArray(graph.links));
  }
  const bare = buildMemoryGraph({ id: 'p' }, { styles, focuses });
  assert.deepEqual(ids(bare), ['profile']);
  assert.deepEqual(bare.links, []);
});

/* -------------------------------------------------------------- sizing --- */

test('node volume scales quadratically with degree, so radius grows only as its cube root', () => {
  const graph = build();
  const degree = degreeMap(graph.nodes, graph.links);
  const profile = graph.nodes.find((n) => n.id === 'profile');
  const leaf = graph.nodes.find((n) => n.id === 'concept:c2');
  assert.equal(nodeVolume(leaf, degree), 5, 'a single-edge node is the floor plus one');
  assert.ok(degree.profile >= 9);
  assert.equal(nodeVolume(profile, degree), degree.profile * degree.profile + 4);
  const ratio = nodeRadius(profile, degree) / nodeRadius(leaf, degree);
  assert.ok(ratio > 2 && ratio < 6, 'hub reads a few times a leaf, not hundreds: ' + ratio.toFixed(2));
});

test('colour encodes concept priority by lightness, and layer mode overrides every kind', () => {
  assert.equal(nodeColor({ kind: 'concept', priority: 'mandatory' }), CONCEPT_PRIORITY_COLOR.mandatory);
  assert.equal(nodeColor({ kind: 'concept', priority: 'reference' }), CONCEPT_PRIORITY_COLOR.reference);
  assert.notEqual(CONCEPT_PRIORITY_COLOR.mandatory, CONCEPT_PRIORITY_COLOR.reference);
  assert.equal(nodeColor({ kind: 'concept', priority: 'mandatory' }, true), LAYERS.learned.color);
  assert.equal(nodeColor({ kind: 'focus' }, true), LAYERS.lens.color);
  assert.equal(linkColor({ kind: 'style-focus' }, true), LAYERS.structural.color);
  assert.equal(linkColor({ kind: 'active-concept' }), LINK_KINDS['active-concept'].color);
});

/* --------------------------------------------------------- determinism --- */

test('the same profile lays out identically every time', () => {
  const a = buildLaidOutGraph(profileFixture(), { styles, focuses, lang: 'fa' });
  const b = buildLaidOutGraph(profileFixture(), { styles, focuses, lang: 'fa' });
  assert.equal(a.nodes.length, b.nodes.length);
  a.nodes.forEach((node, i) => {
    assert.equal(node.x, b.nodes[i].x, node.id + ' x');
    assert.equal(node.y, b.nodes[i].y, node.id + ' y');
    assert.equal(node.z, b.nodes[i].z, node.id + ' z');
  });
});

test('a different profile id produces a different layout, and the seed is stable per id', () => {
  const a = buildLaidOutGraph(profileFixture(), { styles, focuses });
  const b = buildLaidOutGraph(profileFixture({ id: 'analysis-profile-zzz' }), { styles, focuses });
  assert.notEqual(graphSeed('analysis-profile-abc'), graphSeed('analysis-profile-zzz'));
  assert.equal(graphSeed('analysis-profile-abc'), graphSeed('analysis-profile-abc'));
  assert.ok(a.nodes.some((n, i) => n.x !== b.nodes[i].x), 'two profiles should not share one layout');
});

test('the seeded PRNG is reproducible and stays in range', () => {
  const first = Array.from({ length: 6 }, seededRandom(123));
  const again = Array.from({ length: 6 }, seededRandom(123));
  assert.deepEqual(first, again);
  assert.ok(first.every((v) => v >= 0 && v < 1));
  assert.notDeepEqual(first, Array.from({ length: 6 }, seededRandom(124)));
});

test('the layout converges: finite, the two layers separated, no two nodes on top of each other', () => {
  const graph = buildLaidOutGraph(profileFixture(), { styles, focuses });
  assert.ok(graph.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y) && Number.isFinite(n.z)),
    'the simulation diverged');
  const box = boundingBox(graph.nodes);
  const radius = Math.max(box.maxX - box.minX, box.maxY - box.minY, box.maxZ - box.minZ);
  assert.ok(radius > 100 && radius < 4000, 'implausible extent: ' + radius.toFixed(0));

  const avg = (kindLayer) => {
    const xs = graph.nodes.filter((n) => NODE_KINDS[n.kind].layer === kindLayer).map((n) => n.x);
    return xs.reduce((s, v) => s + v, 0) / xs.length;
  };
  assert.ok(avg('lens') < avg('learned'), 'the lens and learned anchor zones did not separate');

  let min = Infinity;
  for (let i = 0; i < graph.nodes.length; i += 1) {
    for (let j = i + 1; j < graph.nodes.length; j += 1) {
      const a = graph.nodes[i], b = graph.nodes[j];
      min = Math.min(min, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
    }
  }
  assert.ok(min > 20, 'nodes overlap: closest pair ' + min.toFixed(1));
});

test('the layout is stable under a bigger, denser profile too', () => {
  const concepts = Array.from({ length: 24 }, (_, i) => ({ id: 'k' + i, title: 'c' + i, priority: 'preferred', origin: 'user', enabled: true }));
  const graph = buildLaidOutGraph(profileFixture({ concepts }), { styles, focuses });
  assert.equal(graph.counts.concept, 24);
  assert.ok(graph.nodes.every((n) => Number.isFinite(n.x)));
});

/* ------------------------------------------------------ no randomness --- */

test('the module contains no randomness and no storage, network or DOM call', async () => {
  const source = await readFile(path.join(root, 'navrya-src', 'analysisProfileBrainGraph.js'), 'utf8');
  // Comments are stripped first: this file DOCUMENTS the no-Math.random rule in prose, and a
  // guard that trips over its own explanation is a guard nobody can keep.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/.*$/gm, '');
  assert.ok(!/Math\.random/.test(code), 'Math.random() would break determinism');
  for (const forbidden of ['localStorage', 'sessionStorage', 'indexedDB', 'fetch(', 'XMLHttpRequest', 'document.', 'window.']) {
    assert.ok(!code.includes(forbidden), 'the pure graph model must not reference ' + forbidden);
  }
});

/* ------------------------------------------------------- input signature --- */

test('the signature changes for every field the graph is built from', () => {
  const base = graphInputSignature(profileFixture());
  const changed = {
    name: { name: 'another name' },
    primaryStyleId: { primaryStyleId: 'smc' },
    secondaryStyleIds: { secondaryStyleIds: [] },
    focusIds: { focusIds: ['market_structure'] },
    customFocuses: { customFocuses: [{ id: 'cf1', name: 'renamed', description: 'x', origin: 'user' }] },
    // renaming a concept changes neither the concept count nor the understanding version - the
    // exact case a length-and-version memo dependency silently misses
    conceptTitle: { concepts: profileFixture().concepts.map((c, i) => (i === 0 ? Object.assign({}, c, { title: 'renamed concept' }) : c)) },
    conceptPriority: { concepts: profileFixture().concepts.map((c, i) => (i === 0 ? Object.assign({}, c, { priority: 'reference' }) : c)) },
    conceptEnabled: { concepts: profileFixture().concepts.map((c, i) => (i === 1 ? Object.assign({}, c, { enabled: false }) : c)) },
    understandingVersion: { understanding: { summary: 'this trader reads structure first', version: 4 } }
  };
  for (const [name, override] of Object.entries(changed)) {
    assert.notEqual(graphInputSignature(profileFixture(override)), base, name + ' must change the signature');
  }
});

test('the signature ignores fields the graph never reads, and is stable across calls', () => {
  const base = graphInputSignature(profileFixture());
  assert.equal(graphInputSignature(profileFixture()), base);
  assert.equal(graphInputSignature(profileFixture({ updatedAt: '2030-01-01T00:00:00.000Z', isDefault: true, isActive: false })), base);
  assert.equal(graphInputSignature(null), '');
  assert.equal(graphInputSignature('nope'), '');
});
