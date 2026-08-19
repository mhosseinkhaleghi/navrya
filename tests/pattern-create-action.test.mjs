import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Journey F, first vertical slice: pattern.create. navrya-src/character-app.jsx and
// navrya-src/strategiesHubView.jsx are JSX/React and have no DOM test harness (the same
// convention already established for every other navrya-src file's own AI-fill logic - see
// tests/chatdock-reply-rendering.test.mjs's own comment) - the real proof is real-browser
// verification. These are static-source regression guards, plus one pure-logic extraction (the
// completionThreshold range check) executed for real rather than reimplemented.

const root = process.cwd();
const characterAppSrc = await readFile(path.join(root, 'navrya-src', 'character-app.jsx'), 'utf8');
const hubSrc = await readFile(path.join(root, 'navrya-src', 'strategiesHubView.jsx'), 'utf8');
const patternTypesSrc = await readFile(path.join(root, 'public', 'pages', 'shared', 'pattern-registry.types.js'), 'utf8');

test('pattern.create is registered with the right domain, required/optional fields, and common aliases', () => {
  const match = /id: 'pattern\.create'[\s\S]*?resultContext: \(\) => \{\}\s*\}\);/.exec(characterAppSrc);
  assert.ok(match, 'could not find the real pattern.create registration');
  const block = match[0];
  assert.match(block, /domain: 'patterns'/);
  assert.match(block, /requiredFields: \['name'\]/);
  assert.match(block, /optionalFields: \['description', 'completionThreshold'\]/);
  assert.match(block, /'create a pattern'/);
  assert.match(block, /'new pattern'/);
});

test('pattern.create\'s open() navigates to the Strategies view before creating the Pattern (works from any page, per F75)', () => {
  const match = /id: 'pattern\.create'[\s\S]*?resultContext: \(\) => \{\}\s*\}\);/.exec(characterAppSrc);
  assert.match(match[0], /store\.setActiveId\('strategies'\)/);
});

test('pattern.create\'s open() polls (via the shared pollFor() helper) for the Strategies Hub\'s own window hook rather than assuming it is already mounted, and eventually gives up (resolves null) instead of hanging forever', () => {
  const match = /id: 'pattern\.create'[\s\S]*?resultContext: \(\) => \{\}\s*\}\);/.exec(characterAppSrc);
  assert.match(match[0], /window\.TradeJournalNavryaPatternHub/);
  assert.match(match[0], /pollFor\(/);
  assert.match(match[0], /resolve\(null\)/);
  // pollFor() itself (shared with pattern.edit - see tests/pattern-edit-action.test.mjs) is what
  // actually gives up after ~2s rather than hanging forever.
  const pollForFn = /function pollFor\([\s\S]*?attempts > 40[\s\S]*?\n    \}/.exec(characterAppSrc);
  assert.ok(pollForFn, 'the shared pollFor() helper must give up after a bounded number of attempts');
});

test('pattern.create reports back the real, dynamic pattern-editor-{id} process id (not a fixed default) once the Pattern actually exists', () => {
  const match = /id: 'pattern\.create'[\s\S]*?resultContext: \(\) => \{\}\s*\}\);/.exec(characterAppSrc);
  assert.match(match[0], /var processId = 'pattern-editor-' \+ created\.id/);
  assert.match(match[0], /resolve\(\{ processId \}\)/);
});

test('pattern.create\'s open() waits for the real "pattern-editor-{id}" registration to actually exist (TradeJournalAIProcessRegistry.query().open) before resolving - found via real browser testing: resolving as soon as the Pattern record exists races React\'s own mount/effect timing and silently drops the first field values', () => {
  const match = /id: 'pattern\.create'[\s\S]*?resultContext: \(\) => \{\}\s*\}\);/.exec(characterAppSrc);
  assert.match(match[0], /registry\.query\(processId\)\.open/);
});

test('StrategiesHub exposes a real window hook (TradeJournalNavryaPatternHub) that creates a Pattern through the same real PatternStore.create() the "New pattern" button already uses - not a second creation path', () => {
  assert.match(hubSrc, /function createNewPattern\(\) \{ const p = window\.TradeJournalPatternStore\.create\(\);/);
  assert.match(hubSrc, /window\.TradeJournalNavryaPatternHub = \{ createNew: createNewPattern, openExisting: openExistingPattern \}/);
  // Must be torn down on unmount (StrategiesHub is a per-view root - see canvasApp.jsx) so a
  // stale hook from a previous mount is never called after the real view has gone away.
  assert.match(hubSrc, /delete window\.TradeJournalNavryaPatternHub/);
});

test('completionThreshold is on the real Pattern AI-fill allowlist', () => {
  assert.match(patternTypesSrc, /patternStagePaths: \['name', 'description', 'completionThreshold'\]/);
});

// Pure-logic proof of the actual clamp/reject behavior, re-derived from the file's own real
// source (never hand-duplicated) so a change to the real logic is what this test exercises.
test('completionThreshold is rejected outright (never clamped) when out of the real slider\'s [0,100] range - F50: NAVRYA\'s own validation stays authoritative', () => {
  const match = /else if \(path === 'completionThreshold'[\s\S]*?\r?\n\s*\}\r?\n/.exec(hubSrc);
  assert.ok(match, 'could not locate the real completionThreshold branch in applyValue()');
  const applied = [];
  const patch = (p) => applied.push(p);
  // eslint-disable-next-line no-new-func
  const run = new Function('path', 'value', 'allowlist', 'patch', `
    if ${match[0].replace(/^else if /, '')}
  `);
  run('completionThreshold', '70', ['completionThreshold'], patch);
  run('completionThreshold', '150', ['completionThreshold'], patch);
  run('completionThreshold', '-5', ['completionThreshold'], patch);
  run('completionThreshold', 'not a number', ['completionThreshold'], patch);
  run('completionThreshold', '82.7', ['completionThreshold'], patch);
  assert.deepEqual(applied, [{ completionThreshold: 70 }, { completionThreshold: 83 }], 'only the two in-range values (70, rounded 82.7->83) were ever applied - 150, -5, and a non-numeric value were all rejected, not clamped');
});

test('ai-workflow-engine.js\'s start() call site in chat-dock-core.js is not (incorrectly) awaited - start() itself stays synchronous, see ai-workflow-engine.js\'s own comment', async () => {
  const coreSrc = await readFile(path.join(root, 'public', 'pages', 'shared', 'chat-dock-core.js'), 'utf8');
  assert.match(coreSrc, /(?<!await )workflowEngine\.start\(payload\.action\.id/);
});
