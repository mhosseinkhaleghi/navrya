import assert from 'node:assert/strict';
import test from 'node:test';
import { focusNames } from '../navrya-src/analysisProfileLens.js';
import { trainingCopy, trt } from '../navrya-src/analysisProfileTrainingCopy.js';
import { findDivergentLenses, loadRegistries, offeredFor } from './helpers/analysis-registries.mjs';
import { loadJsx, visibleText } from './helpers/render-jsx.mjs';

// Analysis DNA and the Profile card, actually RENDERED against the real registries: the DNA shows only the focus areas that belong to the
// lens (a stale saved one is set apart under "Outside the current lens", never shown as active), only enabled concepts (mandatory first),
// and the same structure in every language; the cards of a grid row are equal-height columns whose counts and actions sit at the bottom
// whatever the amount of data.

const LANGS = ['fa', 'ar', 'en', 'es'];
let jsx;
let registries;
let divergent;

test.before(async () => {
  registries = await loadRegistries();
  divergent = findDivergentLenses(registries);
  jsx = await loadJsx({
    dna: 'navrya-src/analysisProfileDna.jsx', view: 'navrya-src/analysisProfilesView.jsx', panel: 'public/pages/shared/navrya/components/core/Panel.jsx'
  });
});
test.after(async () => { delete globalThis.window; if (jsx) await jsx.cleanup(); });

function setWindow(extra) {
  globalThis.window = {
    TradeJournalAnalysisStyleRegistry: registries.styles, TradeJournalAnalysisFocusRegistry: registries.focuses,
    TradeJournalStrategyEducationStore: { listSync: () => [] }, addEventListener() {}, removeEventListener() {}, ...(extra || {})
  };
}
const name = (id, lang = 'en') => focusNames(registries.focuses, [id], lang)[0];
const concept = (id, title, priority, enabled = true) => ({ id, title, description: '', priority, origin: 'user', enabled });

// A physical-direction CSS property in serialised inline styles would break RTL; the design system is logical-properties only.
const PHYSICAL = /(?:margin|padding|border)-(?:left|right)\b|(?:^|[;"\s])(?:left|right):|text-align:\s*(?:left|right)/;

// ---- Analysis DNA -----------------------------------------------------------------------------------------

test('DNA: a saved profile shows lens, its focus areas, and what the engine learned - grouped, titled and translated in every language', () => {
  setWindow();
  const { a, onlyInA } = divergent;
  const profile = {
    name: 'My profile', primaryStyleId: a, secondaryStyleIds: [], focusIds: onlyInA.slice(0, 2), customFocuses: [{ id: 'c1', name: 'London open range', description: '' }],
    concepts: [concept('k1', 'Swept level', 'mandatory'), concept('k2', 'HTF confirmation', 'preferred')], understanding: { summary: 'Reads structure first.', version: 3 }
  };
  for (const lang of LANGS) {
    const html = jsx.render(jsx.modules.dna.AnalysisDna, { lang, profile, showName: true });
    const text = visibleText(html);
    for (const key of ['dnaTitle', 'dnaLensGroup', 'dnaPrimaryLens', 'dnaFocusGroup', 'dnaLearnedGroup']) assert.ok(text.includes(trainingCopy[lang][key]), `${lang}: ${key}`);
    assert.ok(text.includes('My profile'));
    assert.ok(text.includes('London open range'), 'the trader\'s own focus area is part of the DNA');
    assert.ok(text.includes(name(onlyInA[0], lang)) && text.includes(name(onlyInA[1], lang)));
    assert.ok(text.includes(trt(lang, 'conceptsCount', { n: lang === 'fa' ? '۲' : lang === 'ar' ? '٢' : '2', m: lang === 'fa' ? '۱' : lang === 'ar' ? '١' : '1' })), `${lang}: concept counts`);
    assert.equal(html.includes('data-dna-stale'), false, 'a clean profile has no stale block');
    assert.equal(PHYSICAL.test(html), false, `${lang}: logical CSS only`);
    assert.equal((html.match(/<section aria-label=/g) || []).length, 3, 'three labelled groups: an accessible structure');
  }
});

test('DNA: a stale saved focus area is set apart under "Outside the current lens" with the reason - it is NOT shown among the active focus areas', () => {
  setWindow();
  const { b, onlyInA } = divergent;
  const valid = offeredFor(registries, b, [])[0];
  const html = jsx.render(jsx.modules.dna.AnalysisDna, { lang: 'en', profile: { name: 'P', primaryStyleId: b, secondaryStyleIds: [], focusIds: [valid, onlyInA[0], onlyInA[1]], customFocuses: [], concepts: [] } });
  const at = html.indexOf('data-dna-stale');
  assert.ok(at > -1);
  const activePart = html.slice(0, at);
  const stalePart = html.slice(at);
  assert.ok(visibleText(activePart).includes(name(valid)));
  assert.equal(visibleText(activePart).includes(name(onlyInA[0])), false, 'not among the active chips');
  assert.ok(visibleText(stalePart).includes(name(onlyInA[0])) && visibleText(stalePart).includes(name(onlyInA[1])));
  assert.ok(visibleText(stalePart).includes(trainingCopy.en.dnaStaleFocus));
  assert.ok(visibleText(stalePart).includes(trainingCopy.en.dnaStaleHint));
});

test('DNA: only ENABLED concepts appear (mandatory first, capped with a "+N more"), and a wizard preview - no concepts yet - has no Learned group', () => {
  setWindow();
  const { a } = divergent;
  const many = Array.from({ length: 12 }, (_, i) => concept('c' + i, 'Concept ' + i, i === 11 ? 'mandatory' : 'preferred'));
  many.push(concept('off', 'Disabled concept', 'mandatory', false));
  const html = jsx.render(jsx.modules.dna.AnalysisDna, { lang: 'en', profile: { primaryStyleId: a, secondaryStyleIds: [], focusIds: [], customFocuses: [], concepts: many } });
  const text = visibleText(html);
  assert.equal(text.includes('Disabled concept'), false);
  assert.ok(text.includes('12 concepts · 1 mandatory'));
  assert.ok(text.indexOf('Concept 11') < text.indexOf('Concept 0'), 'the mandatory concept is listed first');
  assert.ok(text.includes('+4 more'), '12 enabled, 8 shown');
  assert.equal(text.includes('Concept 9'), false);

  const wizard = visibleText(jsx.render(jsx.modules.dna.AnalysisDna, { lang: 'en', profile: { name: 'Draft', primaryStyleId: a, secondaryStyleIds: [], focusIds: [], customFocuses: [] } }));
  assert.equal(wizard.includes(trainingCopy.en.dnaLearnedGroup), false);
  assert.ok(wizard.includes(trainingCopy.en.dnaNoFocus));
});

test('DNA: the understanding excerpt is bounded, an empty saved profile says nothing was taught, and no lens yet says to pick one', () => {
  setWindow();
  const { a } = divergent;
  const long = 'x'.repeat(400);
  const withLong = visibleText(jsx.render(jsx.modules.dna.AnalysisDna, { lang: 'en', profile: { primaryStyleId: a, secondaryStyleIds: [], focusIds: [], customFocuses: [], concepts: [], understanding: { summary: long, version: 2 } } }));
  assert.ok(withLong.includes('x'.repeat(170) + '…') && !withLong.includes('x'.repeat(171)));
  assert.ok(withLong.includes(trt('en', 'understandingVersion', { n: '2' })));
  const empty = visibleText(jsx.render(jsx.modules.dna.AnalysisDna, { lang: 'en', profile: { primaryStyleId: a, secondaryStyleIds: [], focusIds: [], customFocuses: [], concepts: [] } }));
  assert.ok(empty.includes(trainingCopy.en.dnaNoLearned));
  const noLens = visibleText(jsx.render(jsx.modules.dna.AnalysisDna, { lang: 'fa', profile: { primaryStyleId: '', secondaryStyleIds: [], focusIds: [], customFocuses: [] } }));
  assert.ok(noLens.includes(trainingCopy.fa.dnaNoLens));
});

test('LensNotice names the removed focus areas in every language, says when the primary lens left the complementary lenses, and is silent when nothing changed', () => {
  setWindow();
  const { onlyInA } = divergent;
  for (const lang of LANGS) {
    const removed = visibleText(jsx.render(jsx.modules.dna.LensNotice, { lang, removedFocusIds: onlyInA, mode: 'removed' }));
    for (const id of onlyInA) assert.ok(removed.includes(name(id, lang)), `${lang}: names ${id}`);
    assert.ok(removed.includes(trainingCopy[lang].lensRemovedFocuses.split('{')[0].trim().slice(0, 6)));
    const stale = jsx.render(jsx.modules.dna.LensNotice, { lang, removedFocusIds: onlyInA, mode: 'stale' });
    assert.match(stale, /data-lens-notice="stale"/);
    assert.match(stale, /role="status"/);
    const both = visibleText(jsx.render(jsx.modules.dna.LensNotice, { lang, removedFocusIds: [], secondaryRemoved: true, mode: 'removed' }));
    assert.ok(both.includes(trainingCopy[lang].lensRemovedSecondary));
  }
  assert.equal(jsx.render(jsx.modules.dna.LensNotice, { lang: 'en', removedFocusIds: [], secondaryRemoved: false }), '');
  assert.equal(jsx.render(jsx.modules.dna.LensNotice, { lang: 'en' }), '');
});

// ---- Panel fill -------------------------------------------------------------------------------------------

test('Panel `fill` is additive: it stretches the content wrapper to the frame height and changes nothing when off', () => {
  setWindow();
  const off = jsx.render(jsx.modules.panel.Panel, { children: 'x', style: { display: 'flex' } });
  const on = jsx.render(jsx.modules.panel.Panel, { children: 'x', fill: true, style: { display: 'flex', flexDirection: 'column' } });
  assert.equal(/height:100%/.test(off), false);
  assert.match(on, /<div style="position:relative;height:100%;display:flex;flex-direction:column">x<\/div>/);
});

// ---- Profile cards ---------------------------------------------------------------------------------------

function profile(overrides) {
  return {
    id: 'p' + Math.random().toString(36).slice(2, 7), name: 'Profile', description: '', primaryStyleId: divergent.a, secondaryStyleIds: [], focusIds: [], customFocuses: [],
    isDefault: false, isActive: true, concepts: [], understanding: { summary: '', version: 0 }, ...overrides
  };
}
function cards(html) { return html.split('data-profile-card="true"').slice(1).map((part) => 'data-profile-card="true"' + part); }
const noop = () => {};
const renderCard = (p, lang = 'en') => jsx.render(jsx.modules.view.ProfileCard, { profile: p, lang, onOpen: noop, onEdit: noop, onDuplicate: noop, onSetDefault: noop, onReport: noop, onDelete: noop });

test('a card is a full-height column: head at the top, focus chips taking the room, counts + actions pinned to the bottom', () => {
  setWindow();
  const html = renderCard(profile({ name: 'Only lens' }));
  const inner = /data-profile-card="true"[^>]*><div style="([^"]*)"/.exec(html)[1];
  assert.match(inner, /height:100%/);
  assert.match(inner, /display:flex/);
  assert.match(inner, /flex-direction:column/);
  const head = html.indexOf('data-card-section="head"');
  const focus = html.indexOf('data-card-section="focus"');
  const footer = html.indexOf('data-card-section="footer"');
  assert.ok(head > -1 && focus > head && footer > focus, 'head, then focus, then footer');
  assert.match(/data-card-section="focus" style="([^"]*)"/.exec(html)[1], /flex:1/);
  assert.match(/data-card-section="footer" style="([^"]*)"/.exec(html)[1], /margin-top:auto/);
  const body = /data-card-section="footer"/.exec(html);
  const footerHtml = html.slice(body.index);
  assert.equal((footerHtml.match(/<button/g) || []).length, 6, 'open, edit, duplicate, set default, report, delete - all inside the footer');
  assert.ok(visibleText(footerHtml).includes('0'), 'the counts are in the footer too');
});

test('cards with very different amounts of data have the same structure, so titles, counts and buttons line up across a grid row', () => {
  setWindow();
  const { a, b, onlyInA } = divergent;
  const bare = profile({ name: 'Bare' });
  const rich = profile({ name: 'A very long profile name that must be truncated instead of pushing everything down '.repeat(2), secondaryStyleIds: [b], focusIds: onlyInA.concat(offeredFor(registries, a, []).slice(0, 4)), isDefault: true });
  const inactive = profile({ name: 'Inactive', isActive: false });
  const shapes = [bare, rich, inactive].map((p) => {
    const html = renderCard(p);
    return {
      sections: ['head', 'focus', 'footer'].map((s) => html.indexOf('data-card-section="' + s + '"')).every((i, n, all) => i > -1 && (n === 0 || i > all[n - 1])),
      lens: /data-card-lens="true" style="([^"]*)"/.exec(html)[1],
      title: /<span title="[^"]*" style="([^"]*)"/.exec(html)[1],
      buttons: (html.slice(html.indexOf('data-card-section="footer"')).match(/<button/g) || []).length
    };
  });
  for (const shape of shapes) {
    assert.equal(shape.sections, true);
    assert.match(shape.lens, /min-height:32px/, 'the lens line always reserves two lines');
    assert.match(shape.lens, /-webkit-line-clamp:2/);
    assert.match(shape.title, /white-space:nowrap/);
    assert.match(shape.title, /text-overflow:ellipsis/);
  }
  assert.equal(shapes[1].buttons, 5, 'the default profile has no "set as default" button');
  assert.equal(shapes[0].buttons, 6);
  assert.equal(new Set(shapes.map((s) => s.lens)).size, 1, 'identical head geometry on every card');
});

test('the list is a stretch grid that cannot overflow a narrow screen, and every profile renders as a card in it', () => {
  const { b, onlyInA } = divergent;
  const list = [profile({ id: 'one', name: 'One' }), profile({ id: 'two', name: 'Two', focusIds: onlyInA }), profile({ id: 'three', name: 'Three', primaryStyleId: b, focusIds: onlyInA })];
  setWindow({ TradeJournalAnalysisProfileStore: { listSync: () => list, helpers: {} } });
  const html = jsx.render(jsx.modules.view.AnalysisProfilesTab, { lang: 'en' });
  const grid = /data-profile-grid="true" style="([^"]*)"/.exec(html)[1];
  assert.match(grid, /align-items:stretch/);
  assert.doesNotMatch(grid, /align-items:start/);
  assert.match(grid, /grid-template-columns:repeat\(auto-fill,minmax\(min\(100%,340px\),1fr\)\)/);
  assert.equal(cards(html).length, 3);
  assert.equal(PHYSICAL.test(html.slice(html.indexOf('data-profile-grid'))), false, 'RTL-safe: logical properties only');
});

test('a card shows only the focus areas that belong to the profile\'s lens - a stale saved one is neither listed nor counted', () => {
  setWindow();
  const { b, onlyInA } = divergent;
  const valid = offeredFor(registries, b, [])[0];
  const html = renderCard(profile({ primaryStyleId: b, focusIds: [valid, onlyInA[0]] }));
  const text = visibleText(html);
  assert.ok(text.includes(name(valid)));
  assert.equal(text.includes(name(onlyInA[0])), false);
  assert.match(text, /1 focus/i, 'the count is of the focus areas that belong');
});

test('a card renders in every language without a raw key, and its lens line names the complementary lenses (never the primary twice)', () => {
  setWindow();
  const { a, b } = divergent;
  for (const lang of LANGS) {
    const html = renderCard(profile({ primaryStyleId: a, secondaryStyleIds: [b, a] }), lang);
    const text = visibleText(html);
    assert.doesNotMatch(text, /\b(strategyCount|focusCount|defaultBadge|setDefault)\b/);
    const lens = visibleText(/data-card-lens="true"[^>]*>(.*?)<\/span>/.exec(html)[1]);
    const aName = registries.styles.get(a).name[lang] || registries.styles.get(a).name.en;
    assert.equal(lens.split(aName).length - 1, 1, `${lang}: the primary lens appears once`);
  }
});
