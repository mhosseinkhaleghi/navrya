import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COVERAGE_STATUSES, COVERAGE_UNADDRESSED, COVERAGE_MAX_CONCEPTS, COVERAGE_EVIDENCE_MAX, COVERAGE_TOKENS_PER_CONCEPT,
  mandatoryConceptsOf, conceptCoverageSchemaProperty, sessionAnalysisFormatWithCoverage, coverageOutputBudget,
  buildConceptCoverageInstruction, sanitizeConceptCoverage, summarizeCoverage, coverageForLedger
} from '../server/ai/analysis-profile-coverage.mjs';
import { buildAnalysisProfileBrief } from '../server/ai/analysis-profile-brief.mjs';

// Verifiable enforcement of MANDATORY concepts (server/ai/analysis-profile-coverage.mjs): the pure
// half - which concepts are covered, the additive schema, and the sanitizer that makes the coverage
// list complete and honest no matter what the model returned.

const concept = (id, title, priority = 'mandatory', extra) => ({ id, title, priority, ...extra });
const profile = () => ({ concepts: [concept('c1', 'Swept liquidity levels'), concept('c2', 'Elliott impulse count'), concept('c3', 'Weekly open', 'reference'), concept('c4', 'Order block', 'preferred')] });

test('mandatoryConceptsOf selects only mandatory concepts, in order, with the request\'s own ids', () => {
  assert.deepEqual(mandatoryConceptsOf(profile()), [{ id: 'c1', title: 'Swept liquidity levels' }, { id: 'c2', title: 'Elliott impulse count' }]);
});

test('mandatoryConceptsOf mirrors the brief exactly: every concept it returns is one the brief presents as MANDATORY, and vice versa', () => {
  const p = { primaryStyle: { id: 'smc' }, concepts: profile().concepts };
  const brief = buildAnalysisProfileBrief(p);
  const mandatoryLine = brief.sections.find((s) => s.id === 'mandatoryConcepts').text;
  for (const item of mandatoryConceptsOf(p)) assert.ok(mandatoryLine.includes(item.title), `${item.title} must appear in the brief's MANDATORY line`);
  for (const other of ['Weekly open', 'Order block']) assert.ok(!mandatoryLine.includes(other));
});

test('mandatoryConceptsOf tolerates garbage: no profile, no concepts, blank titles, non-objects, unusable ids get a positional id', () => {
  for (const input of [null, undefined, {}, { concepts: 'x' }, { concepts: [] }]) assert.deepEqual(mandatoryConceptsOf(input), []);
  const out = mandatoryConceptsOf({ concepts: [null, 'x', concept('a', '   '), { title: 'No id', priority: 'mandatory' }, concept('bad id!', 'Bad id'), concept('ok', 'Kept')] });
  assert.deepEqual(out.map((c) => c.title), ['No id', 'Bad id', 'Kept']);
  assert.deepEqual(out.map((c) => c.id), ['m3', 'm4', 'ok'], 'an unusable id falls back to the concept\'s position');
});

test('mandatoryConceptsOf caps at the schema bound and re-reads only the first 120 concepts, like the brief', () => {
  const many = Array.from({ length: 200 }, (_, i) => concept('c' + i, 'Concept ' + i));
  const out = mandatoryConceptsOf({ concepts: many });
  assert.equal(out.length, COVERAGE_MAX_CONCEPTS);
  assert.equal(out[0].id, 'c0');
  const late = mandatoryConceptsOf({ concepts: [...Array.from({ length: 120 }, (_, i) => concept('p' + i, 'P' + i, 'preferred')), concept('late', 'Beyond the 120th')] });
  assert.deepEqual(late, [], 'a concept past the brief\'s own 120-concept window is not covered');
});

test('the schema is UNCHANGED (same object reference) when there is nothing to cover - a trader who never uses this sees byte-identical provider traffic', () => {
  const base = { type: 'json_schema', name: 'x', strict: true, schema: { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] } };
  assert.equal(sessionAnalysisFormatWithCoverage(base, []), base);
  assert.equal(sessionAnalysisFormatWithCoverage(base, undefined), base);
});

test('with mandatory concepts the schema gains an additive conceptCoverage property, required, without mutating the base', () => {
  const base = { type: 'json_schema', name: 'x', strict: true, schema: { type: 'object', additionalProperties: false, properties: { a: { type: 'string' } }, required: ['a'] } };
  const snapshot = JSON.stringify(base);
  const extended = sessionAnalysisFormatWithCoverage(base, mandatoryConceptsOf(profile()));
  assert.equal(JSON.stringify(base), snapshot, 'the shared base schema constant must never be mutated');
  assert.deepEqual(extended.schema.required, ['a', 'conceptCoverage']);
  assert.deepEqual(Object.keys(extended.schema.properties), ['a', 'conceptCoverage']);
  assert.equal(extended.strict, true);
  assert.equal(extended.name, 'x');
  assert.equal(extended.schema.additionalProperties, false);
});

test('the conceptCoverage property follows the schema conventions: strict object items, every field required, statuses an enum, maxItems bounded by the concept count', () => {
  const property = conceptCoverageSchemaProperty(2);
  assert.equal(property.type, 'array');
  assert.equal(property.maxItems, 2);
  assert.equal(property.items.additionalProperties, false);
  assert.deepEqual(property.items.required, ['conceptTitle', 'status', 'evidence']);
  assert.deepEqual(property.items.properties.status.enum, COVERAGE_STATUSES);
  assert.equal(conceptCoverageSchemaProperty(500).maxItems, COVERAGE_MAX_CONCEPTS);
  assert.ok(!COVERAGE_STATUSES.includes(COVERAGE_UNADDRESSED), '"unaddressed" is something only the SERVER can assign, never a status the model may choose');
});

test('the output budget grows with the number of covered concepts (so coverage can never be what truncates a response) and is 0 when nothing is covered', () => {
  assert.equal(coverageOutputBudget([]), 0);
  assert.equal(coverageOutputBudget(undefined), 0);
  assert.equal(coverageOutputBudget(mandatoryConceptsOf(profile())), 2 * COVERAGE_TOKENS_PER_CONCEPT);
});

test('the instruction spells out the exact entry keys and the never-claim-applied-without-evidence rule (Kimi/DeepSeek have no schema, only this sentence)', () => {
  const text = buildConceptCoverageInstruction(mandatoryConceptsOf(profile()));
  for (const key of ['conceptCoverage', 'conceptTitle', 'status', 'evidence', 'applied', 'not_visible', 'not_applicable']) assert.match(text, new RegExp(key));
  assert.match(text, /Never claim `applied` without visible evidence/);
  assert.match(text, /EXACTLY one entry for each MANDATORY concept/);
});

// ---- sanitizeConceptCoverage: the part that makes coverage verifiable ----------------------------------------

const mandatory = () => mandatoryConceptsOf(profile());

test('a complete, well-formed answer is kept as chosen, keyed by the request\'s ids, evidence trimmed', () => {
  const out = sanitizeConceptCoverage([
    { conceptTitle: 'Swept liquidity levels', status: 'applied', evidence: '  Asia low swept at the London open  ' },
    { conceptTitle: 'Elliott impulse count', status: 'not_visible', evidence: 'Only 15 candles visible' }
  ], mandatory());
  assert.deepEqual(out, [
    { conceptId: 'c1', title: 'Swept liquidity levels', status: 'applied', evidence: 'Asia low swept at the London open' },
    { conceptId: 'c2', title: 'Elliott impulse count', status: 'not_visible', evidence: 'Only 15 candles visible' }
  ]);
});

test('a concept the model OMITTED is marked unaddressed - never silently promoted, never dropped', () => {
  const out = sanitizeConceptCoverage([{ conceptTitle: 'Swept liquidity levels', status: 'applied', evidence: 'x' }], mandatory());
  assert.equal(out.length, 2);
  assert.deepEqual(out[1], { conceptId: 'c2', title: 'Elliott impulse count', status: 'unaddressed', evidence: '' });
});

test('a missing / non-array / all-garbage coverage yields one unaddressed row per mandatory concept', () => {
  for (const raw of [undefined, null, 'applied', 7, {}, [], [null, 3, 'x'], [{ nonsense: true }]]) {
    const out = sanitizeConceptCoverage(raw, mandatory());
    assert.deepEqual(out.map((r) => r.status), ['unaddressed', 'unaddressed'], JSON.stringify(raw));
  }
});

test('a status outside the enum (including the server-only "unaddressed") never survives as the model\'s claim - it becomes unaddressed', () => {
  const out = sanitizeConceptCoverage([
    { conceptTitle: 'Swept liquidity levels', status: 'definitely_done', evidence: 'trust me' },
    { conceptTitle: 'Elliott impulse count', status: 'unaddressed', evidence: 'x' }
  ], mandatory());
  assert.deepEqual(out.map((r) => r.status), ['unaddressed', 'unaddressed']);
});

test('an entry for a concept that is NOT mandatory (invented, or merely preferred) is dropped', () => {
  const out = sanitizeConceptCoverage([
    { conceptTitle: 'Weekly open', status: 'applied', evidence: 'reference concept' },
    { conceptTitle: 'Totally invented concept', status: 'applied', evidence: 'x' },
    { conceptTitle: 'Swept liquidity levels', status: 'applied', evidence: 'real' }
  ], mandatory());
  assert.equal(out.length, 2, 'exactly one row per mandatory concept - nothing extra');
  assert.deepEqual(out.map((r) => r.conceptId), ['c1', 'c2']);
  assert.ok(!JSON.stringify(out).includes('Totally invented'));
});

test('title matching is case/whitespace/punctuation-insensitive, and tolerates the model echoing "title (description)" from the brief', () => {
  const out = sanitizeConceptCoverage([
    { conceptTitle: '  SWEPT   liquidity LEVELS. ', status: 'applied', evidence: 'a' },
    { conceptTitle: 'Elliott impulse count (waves 1-5 in the trend direction)', status: 'not_applicable', evidence: 'b' }
  ], mandatory());
  assert.deepEqual(out.map((r) => r.status), ['applied', 'not_applicable']);
});

test('Persian/Arabic title variants (ZWNJ, Arabic yeh/kaf) still match', () => {
  const persian = [{ id: 'p1', title: 'سطح‌های نقدینگی', priority: 'mandatory' }, { id: 'p2', title: 'ساختار کلی', priority: 'mandatory' }];
  const out = sanitizeConceptCoverage([
    { conceptTitle: 'سطحهای نقدینگی', status: 'applied', evidence: 'x' },     // ZWNJ dropped
    { conceptTitle: 'ساختار كلي', status: 'applied', evidence: 'y' }          // Arabic kaf + yeh
  ], mandatoryConceptsOf({ concepts: persian }));
  assert.deepEqual(out.map((r) => r.status), ['applied', 'applied']);
});

test('one returned entry can satisfy at most ONE concept (a duplicated title cannot cover two)', () => {
  const twins = mandatoryConceptsOf({ concepts: [concept('a', 'Same title'), concept('b', 'Same title')] });
  const out = sanitizeConceptCoverage([{ conceptTitle: 'Same title', status: 'applied', evidence: 'once' }], twins);
  assert.deepEqual(out.map((r) => r.status), ['applied', 'unaddressed']);
});

test('the output order is always the REQUEST\'s order, whatever order the model answered in', () => {
  const out = sanitizeConceptCoverage([
    { conceptTitle: 'Elliott impulse count', status: 'applied', evidence: '' },
    { conceptTitle: 'Swept liquidity levels', status: 'not_visible', evidence: '' }
  ], mandatory());
  assert.deepEqual(out.map((r) => r.conceptId), ['c1', 'c2']);
  assert.deepEqual(out.map((r) => r.status), ['not_visible', 'applied']);
});

test('evidence is whitespace-collapsed and capped; a non-string evidence becomes empty', () => {
  const out = sanitizeConceptCoverage([
    { conceptTitle: 'Swept liquidity levels', status: 'applied', evidence: 'e'.repeat(2000) + '\n\n  tail' },
    { conceptTitle: 'Elliott impulse count', status: 'applied', evidence: { not: 'a string' } }
  ], mandatory());
  assert.equal(out[0].evidence.length, COVERAGE_EVIDENCE_MAX);
  assert.equal(out[1].evidence, '', 'an object is not evidence - it must not be stringified into "[object Object]"');
  assert.equal(out[1].status, 'applied', 'the status the model chose is still honoured; only the junk evidence is discarded');
});

test('no mandatory concepts -> an empty list, whatever the model sent', () => {
  assert.deepEqual(sanitizeConceptCoverage([{ conceptTitle: 'x', status: 'applied', evidence: '' }], []), []);
  assert.deepEqual(sanitizeConceptCoverage([{ conceptTitle: 'x', status: 'applied', evidence: '' }], undefined), []);
});

test('summarizeCoverage counts every status, treating anything else as unaddressed; coverageForLedger keeps only ids and statuses', () => {
  const rows = [
    { conceptId: 'a', status: 'applied', evidence: 'long prose that must not reach the analytics table' },
    { conceptId: 'b', status: 'not_visible', evidence: '' }, { conceptId: 'c', status: 'not_applicable', evidence: '' },
    { conceptId: 'd', status: 'unaddressed', evidence: '' }, { conceptId: 'e', status: 'weird', evidence: '' }
  ];
  assert.deepEqual(summarizeCoverage(rows), { total: 5, applied: 1, notVisible: 1, notApplicable: 1, unaddressed: 2 });
  assert.deepEqual(summarizeCoverage(undefined), { total: 0, applied: 0, notVisible: 0, notApplicable: 0, unaddressed: 0 });
  assert.deepEqual(coverageForLedger(rows)[0], { conceptId: 'a', status: 'applied' });
  assert.ok(!JSON.stringify(coverageForLedger(rows)).includes('prose'));
});
