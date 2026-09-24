import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { trainingCopy, trt, trDigits, trDate } from '../navrya-src/analysisProfileTrainingCopy.js';

// Analysis Profile "training" UI (Concepts tab, Memory tab, the engine-learning panel). Static-source
// style for the .jsx files (no JSX transform in `node --test`, same convention as
// tests/analysis-profile-onboarding.test.mjs); the copy module is plain ESM, so it is imported and
// exercised for real.
const root = process.cwd();
const read = async (file) => (await readFile(path.join(root, 'navrya-src', file), 'utf8')).replace(/\r\n/g, '\n');
const LANGS = ['fa', 'ar', 'en', 'es'];

function fnBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start > -1, `could not find function ${name}`);
  const next = source.slice(start + 10).search(/\n  (?:async )?function \w+\(|\nexport function |\nfunction /);
  const body = source.slice(start, next > -1 ? start + 10 + next : source.length);
  // Comments are prose (they legitimately NAME functions like applyLearning()) - only real code counts.
  return body.replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/\s.*$/gm, '');
}
const placeholders = (text) => (text.match(/\{[a-z]+\}/gi) || []).sort().join(',');

// ---- copy ----------------------------------------------------------------------------------------

test('every language carries exactly the same set of copy keys (nothing missing, nothing extra)', () => {
  const base = Object.keys(trainingCopy.en).sort();
  for (const lang of LANGS) {
    assert.deepEqual(Object.keys(trainingCopy[lang]).sort(), base, `${lang} must define exactly the keys en does`);
  }
});

test('no copy value is empty, and every {placeholder} an English string uses is present in the same key of every other language', () => {
  for (const lang of LANGS) {
    for (const [key, value] of Object.entries(trainingCopy[lang])) {
      assert.ok(typeof value === 'string' && value.trim().length > 0, `${lang}.${key} must be a non-empty string`);
      assert.equal(placeholders(value), placeholders(trainingCopy.en[key]), `${lang}.${key} must use the same {placeholders} as en`);
    }
  }
});

test('trt() substitutes every occurrence of a variable, falls back to English for an unknown language, and returns the key itself for an unknown key', () => {
  assert.equal(trt('en', 'conceptsCount', { n: 7, m: 2 }), '7 concepts · 2 mandatory');
  assert.equal(trt('xx', 'cancel'), trainingCopy.en.cancel, 'an unknown language falls back to English');
  assert.equal(trt('en', 'definitely_not_a_key'), 'definitely_not_a_key');
  assert.equal(trt('en', 'applied', { n: 3 }), "Learned. The engine's understanding is now v3.");
});

test('trDigits localizes ASCII digits for fa/ar only, and trDate never throws on a bad date', () => {
  assert.equal(trDigits('fa', 120), '۱۲۰');
  assert.equal(trDigits('ar', 120), '١٢٠');
  assert.equal(trDigits('en', 120), '120');
  assert.equal(trDigits('es', 120), '120');
  assert.equal(trDate('en', null), '—');
  assert.doesNotThrow(() => trDate('fa', 'not a date at all'));
});

test('every key a training component looks up actually exists (a typo would render the raw key in the UI)', async () => {
  const files = ['analysisProfileConcepts.jsx', 'analysisProfileMemory.jsx', 'analysisProfileKnowledge.jsx', 'engineLearning.jsx', 'analysisProfilesView.jsx', 'analysisProfileReport.jsx'];
  const known = new Set(Object.keys(trainingCopy.en));
  for (const file of files) {
    const source = await read(file);
    const direct = [...source.matchAll(/trt\(\s*lang\s*,\s*'([A-Za-z]+)'/g)].map((m) => m[1]);
    // keys reached through a lookup map / array literal rather than a direct trt(lang, 'x') call
    const mapped = [
      ...[...source.matchAll(/(?:mandatory|preferred|reference): '([A-Za-z]+)'/g)].map((m) => m[1]),
      ...[...source.matchAll(/(?:user|ai|source|chat|starter): '(origin[A-Za-z]+)'/g)].map((m) => m[1]),
      ...[...source.matchAll(/: '(evt[A-Za-z]+)'/g)].map((m) => m[1]),
      ...[...source.matchAll(/'(col[A-Z][A-Za-z]+)'/g)].map((m) => m[1]),
      ...[...source.matchAll(/'(sort[A-Z][A-Za-z]+)'/g)].map((m) => m[1]),
      ...[...source.matchAll(/'(teachKind[A-Z][A-Za-z]+)'/g)].map((m) => m[1]),
      // Report tab: keys reached through the WEEKDAY_KEYS/SESSION_KEYS/STAGE_KEYS lookup tables rather than a literal trt(lang, 'x') call.
      ...[...source.matchAll(/'(rpt[A-Za-z]+)'/g)].map((m) => m[1])
    ];
    for (const key of direct.concat(mapped)) assert.ok(known.has(key), `${file} references missing copy key "${key}"`);
  }
});

// ---- Engine-learning panel -----------------------------------------------------------------------

test('the teach flow makes exactly one AI call, refuses empty text up front, and never applies anything itself - apply() is the only writer', async () => {
  const source = await read('engineLearning.jsx');
  const teach = fnBody(source, 'teach');
  assert.equal((teach.match(/ingestLearning\(/g) || []).length, 1, 'teach() makes exactly one AI call');
  assert.match(teach, /!trimmed/, 'empty text must be refused before any call');
  assert.doesNotMatch(teach, /applyLearning\(/, 'teach() must only PROPOSE - it must never apply');
  const apply = fnBody(source, 'apply');
  assert.equal((apply.match(/applyLearning\(/g) || []).length, 1, 'apply() commits through exactly one applyLearning() call (one save, one event)');
});

test('tokens are recorded the moment the AI call returns (a discarded proposal still cost tokens) and never counted a second time on apply', async () => {
  const source = await read('engineLearning.jsx');
  assert.match(fnBody(source, 'teach'), /recordEvent\(profile\.id, \{[\s\S]*?tokenUsage: result\.usage \|\| null/, 'the analysis event carries the real usage');
  assert.match(fnBody(source, 'apply'), /tokenUsage: null/, 'apply() must not re-attribute the same tokens');
});

test('"Save without teaching" is a plain diary note: it calls recordNote() and NEVER the AI client or applyLearning()', async () => {
  const saveNote = fnBody(await read('engineLearning.jsx'), 'saveNote');
  assert.match(saveNote, /recordNote\(/);
  assert.doesNotMatch(saveNote, /ingestLearning|applyLearning/);
});

test('the wallet-balance error is shown honestly, distinct from a generic failure - there is no fake local fallback proposal', async () => {
  const source = await read('engineLearning.jsx');
  // An empty wallet, an expired session, a dead proxy, a timeout and a PDF-incompatible model each get their own message from the
  // shared mapper (tests/analysis-profile-ai-errors.test.mjs) - this file only keeps the raw code and never fakes a proposal.
  assert.match(source, /setError\(toAiError\(caught\)\)/);
  assert.match(source, /<AiErrorNotice lang=\{lang\} error=\{error\} onRetry=\{teach\} busy=\{phase === 'working'\} \/>/);
  assert.doesNotMatch(source, /WALLET_INSUFFICIENT_BALANCE|MODEL_PDF_UNSUPPORTED/);
  assert.doesNotMatch(source, /local-fallback|fallbackProposal|mockProposal/i);
});

test('the three "steps" are shown as in-progress while the call is in flight and only show real results (concept count, understanding change, tokens) once it returns - no animated fake progress', async () => {
  const source = await read('engineLearning.jsx');
  assert.match(source, /phase === 'working'/);
  assert.match(source, /resultConcepts/);
  assert.match(source, /resultUnderstandingChanged/);
  assert.match(source, /tokensUsed/);
  assert.doesNotMatch(source, /setInterval|setTimeout\([^)]*step|progressPercent/, 'no timer-driven fake step advancement');
});

// ---- Concepts tab --------------------------------------------------------------------------------

test('every way of ADDING concepts (manual, starter, accepted AI batch) goes through the one applyLearning() funnel, once per action', async () => {
  const source = await read('analysisProfileConcepts.jsx');
  for (const name of ['submitNew', 'addStarters', 'addChosen']) {
    const body = fnBody(source, name);
    assert.equal((body.match(/applyLearning\(/g) || []).length, 1, `${name}() must call applyLearning() exactly once`);
    // The one call must sit at the function's own top level - never inside a forEach/map/for callback
    // (a loop body is a deeper brace level). Other loops in the function (e.g. building a lookup
    // map) are fine; a save per concept is not.
    const before = body.slice(0, body.indexOf('applyLearning('));
    const depth = (before.match(/{/g) || []).length - (before.match(/}/g) || []).length;
    assert.equal(depth, 1, `${name}() must call applyLearning() once at its top level, never inside a loop/callback`);
  }
});

test('routine edits (priority, enabled, rename, delete) are plain profile updates - never teaching events', async () => {
  const source = await read('analysisProfileConcepts.jsx');
  assert.match(source, /function updateConcepts\(mapper\) \{ profiles\.update\(profile\.id, \{ concepts: mapper\(profile\.concepts\) \}\); \}/);
  for (const name of ['patchConcept', 'removeConcept', 'saveEdit']) {
    assert.doesNotMatch(fnBody(source, name), /applyLearning|recordEvent/, `${name}() must not write a learning event`);
  }
});

test('a rename or add that collides with an existing concept title is refused up front (the store would otherwise silently drop one duplicate)', async () => {
  const source = await read('analysisProfileConcepts.jsx');
  assert.match(fnBody(source, 'saveEdit'), /titleTaken\(title, concept\.id\)/);
  assert.match(fnBody(source, 'submitNew'), /titleTaken\(title, null\)/);
  assert.match(source, /conceptDuplicate/);
});

test('the 120-concept cap is enforced in the UI before any write (add, starter and accepted-AI batch all respect the remaining capacity)', async () => {
  const source = await read('analysisProfileConcepts.jsx');
  assert.match(source, /helpers\.LIMITS\.conceptMax/);
  assert.match(fnBody(source, 'submitNew'), /capacity <= 0/);
  assert.match(fnBody(source, 'addStarters'), /slice\(0, capacity\)/);
  assert.match(fnBody(source, 'addChosen'), /slice\(0, capacity\)/);
});

test('starter concepts are free (no AI call), seeded from the style registry\'s coreConcepts, deduplicated against what the trader already has, and marked origin "starter"', async () => {
  const source = await read('analysisProfileConcepts.jsx');
  const starters = fnBody(source, 'starterCandidates');
  assert.match(starters, /style\.coreConcepts/);
  assert.match(starters, /foldFocusName/);
  const add = fnBody(source, 'addStarters');
  assert.doesNotMatch(add, /suggestConcepts|ingestLearning/, 'starter concepts must never call the AI');
  assert.match(add, /origin: 'starter'/);
});

test('AI concept suggestions are proposals only: unselected by default, tokens recorded when the call returns, added only via the explicit batch button', async () => {
  const source = await read('analysisProfileConcepts.jsx');
  assert.match(source, /selected: false/, 'a suggestion must start unselected - explicit approval only');
  assert.match(fnBody(source, 'suggest'), /recordEvent\(profile\.id, \{[\s\S]*?kind: 'ai_suggested_concepts'[\s\S]*?tokenUsage: result\.usage \|\| null/);
  assert.doesNotMatch(fnBody(source, 'suggest'), /applyLearning\(/, 'suggest() must never add anything by itself');
  assert.match(fnBody(source, 'addChosen'), /origin: 'ai'/);
});

// ---- Memory tab ----------------------------------------------------------------------------------

test('the Memory tab history is the REAL ledger: it reads listEvents(), waits for in-flight writes to settle before re-reading, and invents no rows', async () => {
  const source = await read('analysisProfileMemory.jsx');
  assert.match(source, /listEvents\(profile\.id\)/);
  assert.match(source, /settleEvents\(\)\.then\(reload\)/);
  assert.match(source, /events\.map\(\(event\) => <EventRow/);
  assert.doesNotMatch(source, /Math\.random|fakeEvents|mockEvents/);
});

test('the token total is a real sum over the recorded events\' token usage, and only real AI events are counted as AI-assisted', async () => {
  const source = await read('analysisProfileMemory.jsx');
  assert.match(source, /events\.reduce\(\(sum, event\) => sum \+ eventTokens\(event\), 0\)/);
  assert.match(source, /events\.filter\(\(event\) => eventTokens\(event\) > 0\)/);
});

test('editing the understanding by hand goes through applyLearning() (one save + one event), and only an explicit clear takes the direct-update path', async () => {
  const body = fnBody(await read('analysisProfileMemory.jsx'), 'saveUnderstanding');
  assert.match(body, /applyLearning\(profile\.id, \{ understandingSummary: text, eventKind: 'understanding_edited'/);
  assert.match(body, /profiles\.update\(profile\.id, \{ understanding: \{ summary: ''/);
});

test('every ledger event kind the UI writes has a label in the history (so no row falls back to the generic "Learning" label)', async () => {
  const written = new Set();
  for (const file of ['analysisProfileConcepts.jsx', 'analysisProfileMemory.jsx', 'engineLearning.jsx']) {
    const source = await read(file);
    for (const m of source.matchAll(/(?:eventKind|kind): '([a-z_]+)'/g)) { if (!m[1].endsWith('_')) written.add(m[1]); } // 'ai_analyzed_' is a prefix, completed below
  }
  written.add('ai_analyzed_note'); written.add('ai_analyzed_correction'); // built as 'ai_analyzed_' + kind
  written.add('taught_note'); written.add('taught_correction');           // built with a ternary in apply()
  written.add('ai_analyzed_source'); written.add('taught_source');       // the source (Knowledge tab) variants of the two above
  const memory = await read('analysisProfileMemory.jsx');
  const labelled = new Set([...memory.matchAll(/(?:^|\n|, |\{ )\s*([a-z_]+): 'evt[A-Za-z]+'/g)].map((m) => m[1]));
  for (const kind of written) {
    if (['note', 'correction'].includes(kind)) continue; // the plain teach-kind toggle values, not ledger kinds
    assert.ok(labelled.has(kind) || memory.includes(`${kind}: 'evt`), `ledger kind "${kind}" has no history label`);
  }
});

// ---- wiring --------------------------------------------------------------------------------------

test('the profile detail pill bar exposes Concepts, Knowledge and Memory, and renders the matching tabs keyed by profile id', async () => {
  const source = await read('analysisProfilesView.jsx');
  assert.match(source, /\['concepts', tr\(lang, 'tabConcepts'\)\], \['knowledge', tr\(lang, 'tabKnowledge'\)\], \['memory', tr\(lang, 'tabMemory'\)\]/);
  assert.match(source, /dtab === 'concepts' && <ConceptsTab key=\{profile\.id\}/);
  assert.match(source, /dtab === 'memory' && <MemoryTab key=\{profile\.id\}/);
  for (const lang of LANGS) {
    assert.match(source, new RegExp(`  ${lang}: \\{[\\s\\S]*?tabConcepts: '[^']+', tabMemory: '[^']+'`), `${lang} must label both new tabs`);
  }
});

test('the Overview card shows what the engine has learned (concepts with mandatory ones highlighted, and the current understanding), not just the style/focus DNA', async () => {
  // The DNA block is the shared AnalysisDna (analysisProfileDna.jsx); the detail passes it the whole profile, concepts and understanding included.
  assert.match(await read('analysisProfilesView.jsx'), /<AnalysisDna lang=\{lang\} profile=\{profile\} showName \/>/);
  const dna = await read('analysisProfileDna.jsx');
  assert.match(dna, /p\.concepts\.filter\(\(c\) => c && c\.enabled\)/);
  assert.match(dna, /c\.priority === 'mandatory' \? 'accent' : 'neutral'/);
  assert.match(dna, /p\.understanding && p\.understanding\.summary/);
});
