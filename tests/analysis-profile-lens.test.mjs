import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { MAX_SECONDARY_LENSES, SPECIAL_STYLE_IDS, applyLensChange, focusNames, lensOfProfile, reconcileLens, toggleSecondaryLens } from '../navrya-src/analysisProfileLens.js';
import { extractFunction } from './helpers/extract-function.mjs';
import { findDivergentLenses, loadRegistries, offeredFor } from './helpers/analysis-registries.mjs';

// Lens / focus reconciliation (navrya-src/analysisProfileLens.js) against the REAL Style and Focus registries, and the three
// surfaces that edit a lens - the inline Setup tab, the create/edit wizard and the first-run rite - EXECUTED through their real
// handlers: changing the primary lens takes it out of the complementary lenses at once, recomputes the offered focus areas through
// mergeFocusRecommendations(), and removes (and names) the focus areas that no longer fit instead of persisting them hidden.

const root = process.cwd();
const view = async (file) => (await readFile(path.join(root, 'navrya-src', file), 'utf8')).replace(/\r\n/g, '\n');

let registries;
let divergent;
test.before(async () => { registries = await loadRegistries(); divergent = findDivergentLenses(registries); });

const ids = (list, map) => Array.from(list, map);

// ---- the pure rules -------------------------------------------------------------------------------------------

test('the primary lens can never also be a complementary lens, and special / unknown / duplicate / excess lenses are dropped', () => {
  const [a, b, c] = ids(registries.styles.list(), (s) => s.id).filter((id) => SPECIAL_STYLE_IDS.indexOf(id) === -1);
  const out = reconcileLens({ ...registries, primaryStyleId: a, secondaryStyleIds: [a, b, b, 'hybrid', 'general_analysis', 'custom_method', 'not_a_style', c, 'another'], focusIds: [] });
  assert.deepEqual(out.secondaryStyleIds, [b, c].slice(0, MAX_SECONDARY_LENSES));
  assert.equal(out.secondaryStyleIds.includes(a), false);
  assert.ok(out.removedSecondaryIds.includes(a) && out.removedSecondaryIds.includes('hybrid') && out.removedSecondaryIds.includes('not_a_style'));
  assert.equal(MAX_SECONDARY_LENSES, 2);
});

test('a custom method has no complementary lenses and is offered every registry focus area', () => {
  const out = reconcileLens({ ...registries, primaryStyleId: 'custom_method', secondaryStyleIds: ['smc'], focusIds: ['market_structure'] });
  assert.deepEqual(out.secondaryStyleIds, []);
  assert.equal(out.groups.recommended.length, 0);
  assert.equal(out.groups.optional.length, registries.focuses.list().length);
  assert.deepEqual(out.focusIds, ['market_structure']);
});

test('the offered focus areas are exactly the registry\'s mergeFocusRecommendations(): recommended first, then optional', () => {
  const { a } = divergent;
  const merged = registries.styles.mergeFocusRecommendations(a, []);
  const out = reconcileLens({ ...registries, primaryStyleId: a, secondaryStyleIds: [], focusIds: [] });
  assert.deepEqual(out.groups.recommended.map((f) => f.id), ids(merged.recommended).filter((id) => registries.focuses.get(id)));
  assert.deepEqual(out.groups.optional.map((f) => f.id), ids(merged.optional).filter((id) => registries.focuses.get(id)));
  assert.deepEqual(out.offeredFocusIds, offeredFor(registries, a, []));
});

test('a focus area that fits the lens is kept; one that does not is STALE - removed from the selection and reported, in selection order', () => {
  const { a, b, onlyInA } = divergent;
  const kept = reconcileLens({ ...registries, primaryStyleId: a, secondaryStyleIds: [], focusIds: onlyInA });
  assert.deepEqual(kept.focusIds, onlyInA);
  assert.deepEqual(kept.staleFocusIds, []);
  const changed = reconcileLens({ ...registries, primaryStyleId: b, secondaryStyleIds: [], focusIds: onlyInA });
  assert.deepEqual(changed.focusIds, []);
  assert.deepEqual(changed.staleFocusIds, onlyInA);
  const partial = reconcileLens({ ...registries, primaryStyleId: b, secondaryStyleIds: [], focusIds: [onlyInA[0], ...offeredFor(registries, b, []).slice(0, 1), onlyInA[1]] });
  assert.equal(partial.focusIds.length, 1);
  assert.deepEqual(partial.staleFocusIds, [onlyInA[0], onlyInA[1]]);
});

test('reconciling is idempotent, never mutates its input, and no lens yet means no focus selection can stand', () => {
  const input = { ...registries, primaryStyleId: divergent.b, secondaryStyleIds: [divergent.b, divergent.a], focusIds: divergent.onlyInA };
  const frozen = JSON.stringify([input.secondaryStyleIds, input.focusIds]);
  const once = reconcileLens(input);
  const twice = reconcileLens({ ...registries, primaryStyleId: once.primaryStyleId, secondaryStyleIds: once.secondaryStyleIds, focusIds: once.focusIds });
  assert.deepEqual([twice.secondaryStyleIds, twice.focusIds, twice.staleFocusIds], [once.secondaryStyleIds, once.focusIds, []]);
  assert.equal(JSON.stringify([input.secondaryStyleIds, input.focusIds]), frozen);
  const none = reconcileLens({ ...registries, primaryStyleId: '', secondaryStyleIds: ['smc'], focusIds: ['market_structure'] });
  assert.deepEqual([none.secondaryStyleIds, none.focusIds, none.staleFocusIds], [[], [], ['market_structure']]);
});

test('toggleSecondaryLens follows the chip rule: click again removes, a third selection is refused', () => {
  assert.deepEqual(toggleSecondaryLens([], 'a'), ['a']);
  assert.deepEqual(toggleSecondaryLens(['a'], 'b'), ['a', 'b']);
  assert.deepEqual(toggleSecondaryLens(['a', 'b'], 'c'), ['a', 'b']);
  assert.deepEqual(toggleSecondaryLens(['a', 'b'], 'a'), ['b']);
  assert.deepEqual(toggleSecondaryLens(undefined, 'a'), ['a']);
});

test('applyLensChange: switching the primary lens reports exactly the focus areas it removed; omitted fields keep their value', () => {
  const { a, b, onlyInA } = divergent;
  const next = applyLensChange(registries, { primaryStyleId: a, secondaryStyleIds: [b], focusIds: onlyInA }, { primaryStyleId: b });
  assert.equal(next.primaryStyleId, b);
  assert.deepEqual(next.secondaryStyleIds, [], 'b was complementary and is now primary - taken out immediately');
  assert.deepEqual(next.removedFocusIds, onlyInA);
  assert.deepEqual(next.focusIds, []);
  const same = applyLensChange(registries, { primaryStyleId: a, secondaryStyleIds: [], focusIds: onlyInA }, {});
  assert.deepEqual(same.focusIds, onlyInA);
  assert.deepEqual(same.removedFocusIds, []);
});

test('adding a complementary lens widens what is offered; removing it removes the focus areas only it offered', () => {
  const { a, b } = divergent;
  const onlyByB = offeredFor(registries, b, []).filter((id) => offeredFor(registries, a, []).indexOf(id) === -1);
  assert.ok(onlyByB.length > 0);
  const widened = applyLensChange(registries, { primaryStyleId: a, secondaryStyleIds: [], focusIds: [] }, { secondaryStyleIds: [b] });
  assert.ok(onlyByB.every((id) => widened.offeredFocusIds.includes(id)));
  const withPick = applyLensChange(registries, { primaryStyleId: a, secondaryStyleIds: [b], focusIds: [onlyByB[0]] }, {});
  assert.deepEqual(withPick.focusIds, [onlyByB[0]]);
  const narrowed = applyLensChange(registries, { primaryStyleId: a, secondaryStyleIds: [b], focusIds: [onlyByB[0]] }, { secondaryStyleIds: [] });
  assert.deepEqual(narrowed.removedFocusIds, [onlyByB[0]]);
});

test('lensOfProfile reads a stored profile through the same rules, and focusNames resolves display names in the trader\'s language', () => {
  const { a, b, onlyInA } = divergent;
  const legacy = lensOfProfile(registries, { primaryStyleId: b, secondaryStyleIds: [b], focusIds: onlyInA });
  assert.deepEqual(legacy.staleFocusIds, onlyInA);
  assert.deepEqual(legacy.removedSecondaryIds, [b]);
  const names = focusNames(registries.focuses, onlyInA, 'en');
  assert.equal(names.length, onlyInA.length);
  assert.ok(names.every((name, i) => name && name !== onlyInA[i]), 'real names, not ids');
  assert.notEqual(focusNames(registries.focuses, onlyInA, 'fa')[0], names[0], 'a different language reads different');
  assert.deepEqual(focusNames(registries.focuses, ['unknown_focus'], 'en'), ['unknown_focus']);
  assert.ok(lensOfProfile(registries, null));
  assert.equal(a.length > 0, true);
});

// ---- the surfaces, through their real handlers -----------------------------------------------------------------

// Runs a component's REAL lens handlers (extracted from its source) against the real registries, mirroring what React does: each
// setter records the new value, and for the components that read the latest lens through a ref, the ref follows the state.
async function surface(file, names, initial, extras) {
  const source = await view(file);
  const state = { ...initial, notice: null, hybridMode: null, notes: null, calls: 0 };
  const context = {
    registries, styles: registries.styles, focuses: registries.focuses, applyLensChange, toggleSecondaryLens,
    lensRef: { current: { primaryStyleId: initial.primaryStyleId, secondaryStyleIds: initial.secondaryStyleIds, focusIds: initial.focusIds } },
    // React state: a setter changes what the NEXT render sees, never the variables the running handler closed over (rerender() below).
    setPrimaryStyleId: (v) => { state.primaryStyleId = v; },
    setSecondaryStyleIds: (v) => { state.secondaryStyleIds = v; },
    setFocusIds: (v) => { state.focusIds = v; },
    setLensNotice: (v) => { state.notice = v; },
    setHybridMode: (v) => { state.hybridMode = v; }, setCustomMethodNotes: (v) => { state.notes = v; },
    primaryStyleId: initial.primaryStyleId, secondaryStyleIds: initial.secondaryStyleIds, focusIds: initial.focusIds,
    ...(extras || {})
  };
  vm.createContext(context);
  vm.runInContext(names.map((name) => extractFunction(source, name)).join('\n'), context);
  const rerender = () => { context.primaryStyleId = state.primaryStyleId; context.secondaryStyleIds = state.secondaryStyleIds; context.focusIds = state.focusIds; };
  return { state, run: (code) => vm.runInContext(code, context), context, rerender };
}

const SURFACES = [
  ['Setup tab', 'analysisProfilesView.jsx', ['applyLens', 'changePrimary', 'toggleSecondary'], (h, id) => h.run(`changePrimary(${JSON.stringify(id)})`)],
  ['create/edit wizard', 'analysisProfileOnboarding.jsx', ['applyLens', 'pickPrimary', 'pickHybridPrimary', 'toggleSecondary'], (h, id) => h.run(`pickHybridPrimary(${JSON.stringify(id)})`)],
  ['first-run rite', 'analysisProfileRite.jsx', ['applyLens', 'pickPrimary', 'pickHybridPrimary', 'toggleSecondary'], (h, id) => h.run(`pickHybridPrimary(${JSON.stringify(id)})`)]
];

for (const [label, file, names, changePrimary] of SURFACES) {
  test(`${label}: changing the primary lens removes it from the complementary lenses IMMEDIATELY, and drops (and names) the focus areas that no longer fit`, async () => {
    const { a, b, onlyInA } = divergent;
    const h = await surface(file, names, { primaryStyleId: a, secondaryStyleIds: [b], focusIds: onlyInA });
    changePrimary(h, b);
    assert.equal(h.state.primaryStyleId, b);
    assert.deepEqual(ids(h.state.secondaryStyleIds), [], 'the new primary is no longer complementary');
    assert.deepEqual(ids(h.state.focusIds), [], 'no hidden old focus areas are left selected');
    assert.deepEqual(ids(h.state.notice.removedFocusIds), onlyInA, 'the notice names exactly what was removed');
    assert.equal(h.state.notice.secondaryRemoved, true);
    assert.equal(h.state.notice.mode, 'removed');
  });

  test(`${label}: toggling a complementary lens recomputes the offered focus areas through the registry - removing the lens removes the focus areas only it offered`, async () => {
    const { a, b } = divergent;
    const onlyByB = offeredFor(registries, b, []).filter((id) => offeredFor(registries, a, []).indexOf(id) === -1);
    const h = await surface(file, names, { primaryStyleId: a, secondaryStyleIds: [b], focusIds: [onlyByB[0]] });
    h.run(`toggleSecondary(${JSON.stringify(b)})`);
    assert.deepEqual(ids(h.state.secondaryStyleIds), []);
    assert.deepEqual(ids(h.state.focusIds), []);
    assert.deepEqual(ids(h.state.notice.removedFocusIds), [onlyByB[0]]);
  });
}

test('wizard and rite: picking a single (non-hybrid) lens resets the complementary lenses, clears custom notes unless it is a custom method, and reconciles the focus selection', async () => {
  const { a, b, onlyInA } = divergent;
  for (const [file] of [['analysisProfileOnboarding.jsx'], ['analysisProfileRite.jsx']]) {
    const h = await surface(file, ['applyLens', 'pickPrimary', 'pickHybridPrimary', 'toggleSecondary'], { primaryStyleId: a, secondaryStyleIds: [b], focusIds: onlyInA });
    h.run(`pickPrimary(${JSON.stringify(b)})`);
    assert.equal(h.state.hybridMode, false);
    assert.deepEqual([h.state.primaryStyleId, ids(h.state.secondaryStyleIds), ids(h.state.focusIds), h.state.notes], [b, [], [], '']);
    const custom = await surface(file, ['applyLens', 'pickPrimary', 'pickHybridPrimary', 'toggleSecondary'], { primaryStyleId: a, secondaryStyleIds: [], focusIds: onlyInA });
    custom.run("pickPrimary('custom_method')");
    assert.equal(custom.state.notes, null, 'a custom method keeps its notes field untouched');
    assert.deepEqual(ids(custom.state.focusIds), onlyInA.filter((id) => registries.focuses.get(id)), 'a custom method offers every registry focus, so nothing is stale');
  }
});

test('wizard: a hybrid pick clears the lens (no lens, no focus selection); an assistant filling primary -> secondary -> focus in one turn sees each step', async () => {
  const { a, b, onlyInA } = divergent;
  const h = await surface('analysisProfileOnboarding.jsx', ['applyLens', 'pickPrimary'], { primaryStyleId: a, secondaryStyleIds: [], focusIds: onlyInA });
  h.run("pickPrimary('hybrid')");
  assert.equal(h.state.hybridMode, true);
  assert.deepEqual([h.state.primaryStyleId, ids(h.state.secondaryStyleIds), ids(h.state.focusIds)], ['', [], []]);

  // three applyLens() calls back to back, as the assistant's applyValue() does - lensRef carries each result to the next call
  const seq = await surface('analysisProfileOnboarding.jsx', ['applyLens'], { primaryStyleId: '', secondaryStyleIds: [], focusIds: [] });
  seq.run(`applyLens({ primaryStyleId: ${JSON.stringify(a)}, secondaryStyleIds: [] }); applyLens({ secondaryStyleIds: [${JSON.stringify(b)}] }); applyLens({ focusIds: ${JSON.stringify(onlyInA)}.concat(['not_a_focus']) })`);
  assert.equal(seq.state.primaryStyleId, a);
  assert.deepEqual(ids(seq.state.secondaryStyleIds), [b]);
  assert.deepEqual(ids(seq.state.focusIds), onlyInA, 'the assistant may only select what the lens offers; an id it invented is refused');
  assert.deepEqual(ids(seq.state.notice.removedFocusIds), ['not_a_focus']);
});

test('the Setup tab opens a stale saved profile already reconciled and says so, saves only the reconciled selection, and never touches custom focus areas', async () => {
  const source = await view('analysisProfilesView.jsx');
  const tab = source.slice(source.indexOf('function SetupTab('), source.indexOf('function ProfileDetail('));
  assert.match(tab, /const seed = React\.useMemo\(\(\) => lensOfProfile\(registries, profile\), \[\]\);/);
  assert.match(tab, /React\.useState\(seed\.focusIds\)/);
  assert.match(tab, /mode: 'stale'/);
  const save = extractFunction(source, 'save');
  assert.match(save, /reconcileLens\(\{ styles, focuses, primaryStyleId, secondaryStyleIds, focusIds \}\)/);
  assert.match(save, /focusIds: lens\.focusIds, customFocuses,/, 'custom focuses are passed through as they are');
  assert.match(save, /setLensNotice\(null\)/);
  assert.doesNotMatch(tab, /useState\(profile\.focusIds\)|useState\(profile\.secondaryStyleIds\)/, 'no raw, unreconciled seed');
});

test('the wizard and the rite submit only a reconciled lens, and the wizard opens an existing profile reconciled', async () => {
  const onboarding = await view('analysisProfileOnboarding.jsx');
  const rite = await view('analysisProfileRite.jsx');
  for (const text of [onboarding, rite]) {
    assert.match(text, /const lens = reconcileLens\(\{ styles, focuses, primaryStyleId, secondaryStyleIds, focusIds \}\)/);
    assert.match(text, /LensNotice/);
  }
  assert.match(onboarding, /const seedLens = React\.useMemo\(\(\) => \(seed \? lensOfProfile\(registries, seed\) : null\), \[\]\);/);
  assert.doesNotMatch(onboarding, /useState\(seed \? seed\.focusIds/);
  // the hybrid-mode exit button routes through the same step
  assert.match(onboarding, /setHybridMode\(false\); applyLens\(\{ primaryStyleId: '', secondaryStyleIds: \[\] \}\)/);
  assert.match(rite, /setHybridMode\(false\); applyLens\(\{ primaryStyleId: '', secondaryStyleIds: \[\] \}\)/);
});

test('every lens surface filters special styles out of the complementary choices with the ONE shared list', async () => {
  const setup = await view('analysisProfilesView.jsx');
  assert.match(setup, /import \{ SPECIAL_STYLE_IDS, [^}]*\} from '\.\/analysisProfileLens\.js';/);
  assert.match(setup, /SPECIAL_STYLE_IDS\.indexOf\(st\.id\) === -1/);
  assert.match(await view('analysisProfileRite.jsx'), /import \{ SPECIAL_STYLE_IDS, [^}]*\} from '\.\/analysisProfileLens\.js';/);
  for (const file of ['analysisProfileOnboarding.jsx', 'analysisProfileRite.jsx', 'analysisProfilesView.jsx']) {
    assert.doesNotMatch(await view(file), /SPECIAL_STYLE_IDS = \[/, file + ' keeps no second copy');
  }
});
