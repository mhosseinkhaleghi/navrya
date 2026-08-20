import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Journey F, second vertical slice: pattern.edit. Same convention as
// tests/pattern-create-action.test.mjs (navrya-src has no DOM test harness - real-browser
// verification is the real proof): static-source regression guards, plus one pure-logic
// extraction (the by-name entity resolution) executed for real rather than reimplemented.

const root = process.cwd();
const characterAppSrc = await readFile(path.join(root, 'navrya-src', 'character-app.jsx'), 'utf8');
const hubSrc = await readFile(path.join(root, 'navrya-src', 'strategiesHubView.jsx'), 'utf8');

function patternEditBlock() {
  const match = /id: 'pattern\.edit'[\s\S]*?resultContext: \(\) => \{\}\s*\}\);/.exec(characterAppSrc);
  assert.ok(match, 'could not find the real pattern.edit registration');
  return match[0];
}

test('pattern.edit is registered with the right domain, required/optional fields, and common aliases', () => {
  const block = patternEditBlock();
  assert.match(block, /entityAlreadyPersisted: true/, 'submit() is already a no-op - the real Pattern already exists the instant open() resolves it; see ai-workflow-engine.js\'s own comment on why this must never schedule a submit');
  assert.match(block, /domain: 'patterns'/);
  assert.match(block, /requiredFields: \['patternName'\]/);
  assert.match(block, /optionalFields: \['name', 'description', 'completionThreshold'\]/);
  assert.match(block, /'edit a pattern'/);
  assert.match(block, /'open the pattern'/);
});

test('pattern.edit\'s description tells the model patternName identifies an existing Pattern (never a rename), and to ask rather than guess when it is not yet known - F53', () => {
  const block = patternEditBlock();
  assert.match(block, /never a rename/);
  assert.match(block, /ask them which Pattern first instead of guessing/);
});

test('pattern.edit\'s open() resolves nothing (never guesses) when patternName is missing, or matches zero or more than one real Pattern - F53', () => {
  const block = patternEditBlock();
  assert.match(block, /if \(!patternName\) \{ resolve\(null\); return; \}/);
  assert.match(block, /if \(matches\.length !== 1\) \{ resolve\(null\); return; \}/);
});

test('pattern.edit\'s open() resolves an existing Pattern by an exact, case-insensitive name match against the real PatternStore - never a fuzzy/partial match', () => {
  const block = patternEditBlock();
  assert.match(block, /String\(p\.name \|\| ''\)\.trim\(\)\.toLowerCase\(\) === patternName\.toLowerCase\(\)/);
});

test('pattern.edit\'s open() drives the same real StrategiesHub hub pattern.create already uses (hub.openExisting), and waits for the real pattern-editor-{id} process to actually register before resolving - same two-stage race fix as pattern.create', () => {
  const block = patternEditBlock();
  assert.match(block, /hub\.openExisting\(target\.id\)/);
  assert.match(block, /var processId = 'pattern-editor-' \+ target\.id/);
  assert.match(block, /registry\.query\(processId\)\.open/);
});

test('pollFor() is a single shared helper reused by both pattern.create and pattern.edit, not duplicated', () => {
  const declarations = characterAppSrc.match(/function pollFor\(/g) || [];
  assert.equal(declarations.length, 1, 'pollFor must only be declared once');
  const usages = characterAppSrc.match(/\bpollFor\(/g) || [];
  assert.ok(usages.length >= 3, 'pollFor must be called at least once by pattern.create and twice by pattern.edit (hub, then process)');
});

test('StrategiesHub exposes openExisting(id) on the same real window hook pattern.create\'s createNew already uses - not a second navigation path', () => {
  assert.match(hubSrc, /function openExistingPattern\(id\) \{ setTab\('patterns'\); openItem\('pattern', id, 'details'\); \}/);
  assert.match(hubSrc, /window\.TradeJournalNavryaPatternHub = \{ createNew: createNewPattern, openExisting: openExistingPattern \}/);
});

// Pure-logic proof of the actual resolution behavior, re-derived from the file's own real source
// (never hand-duplicated) so a change to the real logic is what this test exercises.
test('the real by-name resolution logic: exact case-insensitive match resolves, empty/zero/ambiguous matches all resolve nothing', () => {
  const match = /var matches = patterns\.filter\(\(p\) => String\(p\.name \|\| ''\)\.trim\(\)\.toLowerCase\(\) === patternName\.toLowerCase\(\)\);\r?\n\s*if \(matches\.length !== 1\) \{ resolve\(null\); return; \}[^\n]*\r?\n\s*var target = matches\[0\];/.exec(characterAppSrc);
  assert.ok(match, 'could not locate the real matches/target resolution in pattern.edit\'s open()');
  const results = [];
  function resolve(value) { results.push(value); }
  // eslint-disable-next-line no-new-func
  const run = new Function('patterns', 'patternName', 'resolve', `
    ${match[0]}
    resolve(target);
  `);
  run([{ id: 'p1', name: 'Liquidity Sweep' }], 'liquidity sweep', resolve); // exact, case-insensitive
  run([{ id: 'p1', name: 'Liquidity Sweep' }], 'Nonexistent Thing', resolve); // zero matches
  run([{ id: 'p1', name: 'Sweep' }, { id: 'p2', name: 'Sweep' }], 'Sweep', resolve); // ambiguous
  run([], 'Sweep', resolve); // no patterns at all
  assert.equal(results[0].id, 'p1');
  assert.equal(results[1], null, 'zero matches must never resolve a target');
  assert.equal(results[2], null, 'an ambiguous name must never guess one of the matches');
  assert.equal(results[3], null);
});
