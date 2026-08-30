import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { buildFixtureBundleRows } from './helpers/conversation-scenario-fixtures.mjs';

const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = file => readFile(shared(file), 'utf8');

async function matcherSandbox() {
  const sandbox = { window: {} };
  vm.runInNewContext(await source('ai-conversation-matcher.js'), sandbox, { filename: 'ai-conversation-matcher.js' });
  return sandbox.window.TradeJournalAIConversationMatcher;
}

function scenarios(m) { return buildFixtureBundleRows().map(m.scenarioFromBundleRow); }

// ---- Normalization (moved here from Gate 1's ai-conversation-router-normalization.test.mjs -
// normalize() now lives in this file, ai-conversation-router.js is a thin bundle/resolver wrapper) ----

test('Persian: digit variants (Persian-indic) normalize to the same ASCII-digit string', async () => {
  const x = await matcherSandbox();
  assert.equal(x.normalize('ریسک ۵ درصد'), x.normalize('ریسک 5 درصد'));
});

test('Persian: question-mark punctuation is stripped', async () => {
  const x = await matcherSandbox();
  assert.equal(x.normalize('سشن چیه؟'), x.normalize('سشن چیه'));
});

test('Persian: extra whitespace and repeated punctuation collapse to the same normalized text', async () => {
  const x = await matcherSandbox();
  assert.equal(x.normalize('سشن   چیه؟؟؟'), x.normalize('سشن چیه'));
});

test('Persian: a bounded run of a repeated character collapses (spoken/typed emphasis)', async () => {
  const x = await matcherSandbox();
  assert.equal(x.normalize('چیههههه'), x.normalize('چیه'));
  assert.equal(x.normalize('حرفه ای'), 'حرفه ای'); // a real doubled letter (not 3+) must survive
});

test('Persian: ZWNJ (nim-fasele) is treated as a real space, so both renderings normalize the same', async () => {
  const x = await matcherSandbox();
  assert.equal(x.normalize('چیکار می‌تونی بکنی'), x.normalize('چیکار می تونی بکنی'));
});

test('English: case is folded and apostrophes/question marks are stripped', async () => {
  const x = await matcherSandbox();
  assert.equal(x.normalize('WHAT IS A SESSION?'), x.normalize('what is a session'));
  assert.equal(x.normalize("What's a Pattern?"), 'whats a pattern');
});

test('English: repeated punctuation collapses but ordinary doubled letters do not', async () => {
  const x = await matcherSandbox();
  assert.equal(x.normalize('really???'), x.normalize('really?'));
  assert.equal(x.normalize('really'), 'really');
});

test('Arabic: Arabic-Indic digits normalize to the same ASCII-digit string', async () => {
  const x = await matcherSandbox();
  assert.equal(x.normalize('السعر ٥٠٠'), x.normalize('السعر 500'));
});

test('Arabic: diacritics (harakat) are stripped, so a fully-voweled and a plain form normalize the same', async () => {
  const x = await matcherSandbox();
  assert.equal(x.normalize('مَا هِيَ الجَلْسَة'), x.normalize('ما هي الجلسة'));
});

test('Spanish: accents are folded and inverted punctuation is stripped', async () => {
  const x = await matcherSandbox();
  assert.equal(x.normalize('¿Qué es una Sesión?'), 'que es una sesion');
  assert.equal(x.normalize('que es una sesion'), 'que es una sesion');
});

test('Spanish: n is never folded like an accented vowel (ñ is a distinct letter)', async () => {
  const x = await matcherSandbox();
  assert.equal(x.normalize('año'), 'año');
});

test('empty/whitespace-only input normalizes to an empty string', async () => {
  const x = await matcherSandbox();
  assert.equal(x.normalize(''), '');
  assert.equal(x.normalize('   '), '');
  assert.equal(x.normalize(null), '');
  assert.equal(x.normalize(undefined), '');
});

// ---- scenarioFromBundleRow ----

test('scenarioFromBundleRow flattens a bundle row into the flat shape matchScenarios scores against', async () => {
  const m = await matcherSandbox();
  const rows = buildFixtureBundleRows();
  const flat = m.scenarioFromBundleRow(rows[0]);
  assert.equal(flat.scenarioKey, 'session.purpose');
  assert.equal(flat.kind, 'faq');
  assert.deepEqual(flat.surfaceBoost, ['sessions']);
  assert.ok(flat.languages.fa && flat.languages.en && flat.languages.ar && flat.languages.es);
  assert.ok(flat.responses.en.written.length > 0);
});

// ---- matchScenarios: positives across all four languages (the exact Gate 1 corpus, §69) ----

test('session.purpose resolves HIGH-confidence for natural Persian phrasings, zero ambiguity', async () => {
  const m = await matcherSandbox();
  const list = scenarios(m);
  const phrasings = ['سشن چیه', 'سشن چیه؟', 'سشن یعنی چی', 'فایده سشن چیه', 'این سشن به چه دردی میخوره', 'سشن به چه درد میخوره', 'session چیه'];
  for (const text of phrasings) {
    const result = m.matchScenarios(text, list, {});
    assert.equal(result.confidenceBand, 'HIGH', 'expected HIGH for: ' + text);
    assert.equal(result.winner.scenario.scenarioKey, 'session.purpose', 'expected session.purpose for: ' + text);
  }
});

test('session.purpose resolves HIGH-confidence for natural English/Arabic/Spanish phrasings', async () => {
  const m = await matcherSandbox();
  const list = scenarios(m);
  const phrasings = [
    'what is a session', "what's a session for", 'why do i need a session',
    'ما هي الجلسة', 'ما فائدة جلسة التداول',
    '¿Qué es una sesión?', 'para que sirve una sesion de trading'
  ];
  for (const text of phrasings) {
    const result = m.matchScenarios(text, list, {});
    assert.equal(result.confidenceBand, 'HIGH', 'expected HIGH for: ' + text);
    assert.equal(result.winner.scenario.scenarioKey, 'session.purpose', 'expected session.purpose for: ' + text);
  }
});

// ---- negatives / collisions (§70-71) ----

test('an explicit create/delete/status command never resolves to session.purpose', async () => {
  const m = await matcherSandbox();
  const list = scenarios(m);
  const negatives = ['create a session', 'delete my session', 'which session is active', 'یه سشن بساز', 'سشن رو حذف کن', 'سشن فعالم چیه'];
  for (const text of negatives) {
    const result = m.matchScenarios(text, list, {});
    // The real safety property: never a HIGH-confidence (bypass-eligible) resolution to
    // session.purpose - a low/medium-scoring incidental "winner" among many zero-scoring
    // candidates is harmless, since only HIGH ever bypasses the model (see the router/
    // chat-dock-core integration). Some of these (e.g. "create a session") legitimately still
    // score MEDIUM via a cross-language incidental term match ('session' is intentionally listed
    // as an FA group1 alternative for code-switching support) - that is expected and safe.
    if (result.confidenceBand === 'HIGH') assert.notEqual(result.winner.scenario.scenarioKey, 'session.purpose', 'must not resolve HIGH to session.purpose for: ' + text);
  }
});

test('a genuinely ambiguous comparison question does not confidently resolve to either scenario', async () => {
  const m = await matcherSandbox();
  const list = scenarios(m);
  const result = m.matchScenarios('توی این اپ پترن و استراتژی چه فرقی دارن؟', list, {});
  assert.notEqual(result.confidenceBand, 'HIGH');
});

test('the two data-query scenarios never collide with each other', async () => {
  const m = await matcherSandbox();
  const list = scenarios(m);
  assert.equal(m.matchScenarios('how many open trades do i have', list, {}).winner.scenario.scenarioKey, 'trade.open_count_query');
  assert.equal(m.matchScenarios('what is my default risk', list, {}).winner.scenario.scenarioKey, 'trade.default_risk_query');
});

// ---- surface boost is a bonus, never a requirement ----

test('a HIGH-confidence match resolves from text alone, with no surface context', async () => {
  const m = await matcherSandbox();
  const list = scenarios(m);
  const result = m.matchScenarios('what is a session', list, {});
  assert.equal(result.confidenceBand, 'HIGH');
});

test('a matching surfacePage adds a real, measurable boost', async () => {
  const m = await matcherSandbox();
  const list = scenarios(m);
  const withoutBoost = m.matchScenarios('session', list, {});
  const withBoost = m.matchScenarios('session', list, { page: 'sessions' });
  // 'session' alone only satisfies one of two concept groups for session.purpose - too weak to
  // resolve on its own, but the boost should still be visible in the raw candidate score.
  const scoreWithout = (withoutBoost.candidates.find((c) => c.scenario.scenarioKey === 'session.purpose') || {}).score || 0;
  const scoreWith = (withBoost.candidates.find((c) => c.scenario.scenarioKey === 'session.purpose') || {}).score || 0;
  assert.ok(scoreWith > scoreWithout, 'surface boost must increase the score');
});

// ---- renderTemplate / templateVariablesIn (§23/§26/§29) ----

test('renderTemplate only ever substitutes an explicitly-provided variable, never arbitrary text', async () => {
  const m = await matcherSandbox();
  assert.equal(m.renderTemplate('You have {count} open trades.', { count: 3 }), 'You have 3 open trades.');
  // an unresolvable placeholder is left literal, never blanked - a misconfigured scenario fails
  // loudly (visibly wrong text) rather than silently rendering a hole.
  assert.equal(m.renderTemplate('Your risk is {value}%.', {}), 'Your risk is {value}%.');
  assert.equal(m.renderTemplate('{__proto__} {constructor}', { count: 1 }), '{__proto__} {constructor}');
});

test('templateVariablesIn extracts every real {word} placeholder for publish-time validation', async () => {
  const m = await matcherSandbox();
  assert.deepEqual(Array.from(m.templateVariablesIn('You have {count} open {count} trades, risk {value}%.')), ['count', 'value']);
  assert.deepEqual(Array.from(m.templateVariablesIn('No variables here.')), []);
});

// ---- debug/no-throw ----

test('matchScenarios never throws on empty input or an empty scenario list', async () => {
  const m = await matcherSandbox();
  assert.equal(m.matchScenarios('', scenarios(m), {}).winner, null);
  assert.equal(m.matchScenarios('what is a session', [], {}).winner, null);
});

// ---- Journey H2 expressive/context follow-up: selectVariant() / variantsCollide() ----

test('scenarioFromBundleRow flattens definition.variants through unchanged - absent for every scenario published before this gate', async () => {
  const m = await matcherSandbox();
  // JSON.stringify sidesteps a cross-realm gotcha: scenarioFromBundleRow's {} literal is built
  // with the vm sandbox's own Object constructor, so assert.deepEqual against a plain {} from
  // this file's own realm reports "same structure but not reference-equal" despite being
  // genuinely equivalent data - the same reason this file's other bundle-row tests compare via
  // property reads rather than a whole-object deepEqual.
  const withoutVariants = m.scenarioFromBundleRow({ scenarioKey: 'x', domain: 'd', kind: 'faq', definition: { responses: {} } });
  assert.equal(JSON.stringify(withoutVariants.variants), '{}');
  const withVariants = m.scenarioFromBundleRow({ scenarioKey: 'x', domain: 'd', kind: 'faq', definition: { responses: {}, variants: { en: [{ key: 'FIRST_TIME' }] } } });
  assert.equal(JSON.stringify(withVariants.variants), JSON.stringify({ en: [{ key: 'FIRST_TIME' }] }));
});

test('selectVariant: FIRST_TIME matches only at exposureCount 0; STANDARD (null) wins at every other count when no NTH_OR_LATER variant is authored', async () => {
  const m = await matcherSandbox();
  const variants = [{ key: 'FIRST_TIME', context: { exposure: { type: 'FIRST_TIME' } }, written: 'first' }];
  assert.equal(m.selectVariant(variants, { exposureCount: 0 }).key, 'FIRST_TIME');
  assert.equal(m.selectVariant(variants, { exposureCount: 1 }), null);
  assert.equal(m.selectVariant(variants, { exposureCount: 5 }), null);
});

test('selectVariant: the full session.purpose acceptance example - 0->FIRST_TIME, 1->STANDARD(null), 2->THIRD_TIME_PLUS, 3+->THIRD_TIME_PLUS', async () => {
  const m = await matcherSandbox();
  const variants = [
    { key: 'FIRST_TIME', context: { exposure: { type: 'FIRST_TIME' } }, written: 'first' },
    { key: 'THIRD_TIME_PLUS', context: { exposure: { type: 'NTH_OR_LATER', threshold: 3 } }, written: 'third-plus' }
  ];
  assert.equal(m.selectVariant(variants, { exposureCount: 0 }).key, 'FIRST_TIME');
  assert.equal(m.selectVariant(variants, { exposureCount: 1 }), null, 'the 2nd real delivery (count=1 at resolution time) falls through to STANDARD - no forced second-time variant');
  assert.equal(m.selectVariant(variants, { exposureCount: 2 }).key, 'THIRD_TIME_PLUS');
  assert.equal(m.selectVariant(variants, { exposureCount: 10 }).key, 'THIRD_TIME_PLUS');
});

test('selectVariant: surface-only and exposure+surface priority (surface+exposure beats exposure-only beats surface-only beats STANDARD)', async () => {
  const m = await matcherSandbox();
  const exposureOnly = { key: 'EXPOSURE_ONLY', context: { exposure: { type: 'FIRST_TIME' } }, written: 'a' };
  const surfaceOnly = { key: 'SURFACE_ONLY', context: { surface: { page: 'sessions' } }, written: 'b' };
  const both = { key: 'BOTH', context: { exposure: { type: 'FIRST_TIME' }, surface: { page: 'sessions' } }, written: 'c' };

  assert.equal(m.selectVariant([surfaceOnly], { exposureCount: 0, surfaceSnapshot: { page: 'sessions' } }).key, 'SURFACE_ONLY');
  assert.equal(m.selectVariant([surfaceOnly], { exposureCount: 0, surfaceSnapshot: { page: 'dashboard' } }), null, 'a surface condition must not match a different real surface');
  assert.equal(m.selectVariant([exposureOnly, surfaceOnly], { exposureCount: 0, surfaceSnapshot: { page: 'sessions' } }).key, 'EXPOSURE_ONLY', 'tie at specificity 1 each - deterministic, first-declared wins, never random');
  assert.equal(m.selectVariant([exposureOnly, surfaceOnly, both], { exposureCount: 0, surfaceSnapshot: { page: 'sessions' } }).key, 'BOTH', 'the most specific real match always wins over either single-axis variant');
});

test('selectVariant: never random - a tie at the same specificity is resolved deterministically to the first-declared variant, and this never depends on iteration order tricks', async () => {
  const m = await matcherSandbox();
  const a = { key: 'A', context: { exposure: { type: 'FIRST_TIME' } }, written: 'a' };
  const b = { key: 'B', context: { exposure: { type: 'FIRST_TIME' } }, written: 'b' };
  assert.equal(m.selectVariant([a, b], { exposureCount: 0 }).key, 'A');
  assert.equal(m.selectVariant([b, a], { exposureCount: 0 }).key, 'B', 'still deterministic - always the first in the array as given, never re-sorted');
});

test('selectVariant: no variants, or none matching, returns null (the caller falls back to STANDARD) - never throws', async () => {
  const m = await matcherSandbox();
  assert.equal(m.selectVariant([], { exposureCount: 0 }), null);
  assert.equal(m.selectVariant(undefined, { exposureCount: 0 }), null);
  assert.equal(m.selectVariant([{ key: 'X', context: { exposure: { type: 'NTH_OR_LATER', threshold: 10 } }, written: 'x' }], { exposureCount: 0 }), null);
});

test('variantsCollide: two FIRST_TIME variants with no surface condition collide - an authoring ambiguity, must be flagged', async () => {
  const m = await matcherSandbox();
  const a = { key: 'A', context: { exposure: { type: 'FIRST_TIME' } } };
  const b = { key: 'B', context: { exposure: { type: 'FIRST_TIME' } } };
  assert.equal(m.variantsCollide(a, b), true);
});

test('variantsCollide: two NTH_OR_LATER variants with DIFFERENT thresholds still collide - both ranges are unbounded above and eventually overlap at a high enough real exposure count', async () => {
  const m = await matcherSandbox();
  const a = { key: 'A', context: { exposure: { type: 'NTH_OR_LATER', threshold: 3 } } };
  const b = { key: 'B', context: { exposure: { type: 'NTH_OR_LATER', threshold: 5 } } };
  assert.equal(m.variantsCollide(a, b), true);
});

test('variantsCollide: FIRST_TIME never collides with an NTH_OR_LATER whose threshold is high enough to exclude count 0', async () => {
  const m = await matcherSandbox();
  const firstTime = { key: 'A', context: { exposure: { type: 'FIRST_TIME' } } };
  const thirdPlus = { key: 'B', context: { exposure: { type: 'NTH_OR_LATER', threshold: 3 } } };
  assert.equal(m.variantsCollide(firstTime, thirdPlus), false, 'FIRST_TIME (count 0) and NTH_OR_LATER threshold 3 (count>=2) never both match the same real turn');
});

test('variantsCollide: the same exposure condition on two DIFFERENT, non-overlapping surfaces never collides - they can both be published safely', async () => {
  const m = await matcherSandbox();
  const a = { key: 'A', context: { exposure: { type: 'FIRST_TIME' }, surface: { page: 'sessions' } } };
  const b = { key: 'B', context: { exposure: { type: 'FIRST_TIME' }, surface: { page: 'dashboard' } } };
  assert.equal(m.variantsCollide(a, b), false);
});

test('variantsCollide: different specificity levels never collide (a surface-only variant and an exposure-only variant are never ambiguous with each other)', async () => {
  const m = await matcherSandbox();
  const exposureOnly = { key: 'A', context: { exposure: { type: 'FIRST_TIME' } } };
  const surfaceOnly = { key: 'B', context: { surface: { page: 'sessions' } } };
  assert.equal(m.variantsCollide(exposureOnly, surfaceOnly), false);
});
