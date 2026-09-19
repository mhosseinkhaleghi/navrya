import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { buildAnalysisProfileBrief, describeAnalysisStyle, BRIEF_SECTION_IDS } from '../server/ai/analysis-profile-brief.mjs';

// The Analysis Profile brief (server/ai/analysis-profile-brief.mjs): everything the engine is told
// about one trader's profile, built in ONE place and shared by the Session analysis prompt, the
// teaching chat and the Preview tab. The guarantee under test is that what the Preview tab SHOWS is
// what the model RECEIVES.

// This file imports the AI gateway (for the real Session prompt builder), which binds a fixed port as a
// side effect of the import - port 0 keeps parallel test processes from colliding on it.
process.env.PATTERN_AI_PORT = '0';
process.env.PORT = '0';
const serverModule = await import('../server/pattern-ai-server.mjs');
after(() => { serverModule.default.close(); });

const style = (id, extra) => ({ id, name: { en: id.toUpperCase() }, coreConcepts: ['c1'], analysisPrinciples: ['p1'], limitations: ['l1'], futurePromptGuidance: ['g1'], ...extra });
const fullProfile = () => ({
  primaryStyle: style('smc'), secondaryStyles: [style('wyckoff'), style('elliott_wave')],
  focuses: [{ id: 'trend', name: { en: 'Trend' } }, { id: 'key_levels', name: { en: 'Key levels' } }],
  customFocuses: [{ name: 'Session opens', description: 'where Asia/London open' }, { name: 'News gaps' }],
  customMethodNotes: 'I trade the London sweep.',
  concepts: [
    { title: 'Swept liquidity levels', description: 'stops already taken', priority: 'mandatory' },
    { title: 'Order block mitigation', priority: 'preferred' },
    { title: 'Weekly open', priority: 'reference' }
  ],
  understanding: 'Confirms breakouts only after a sweep.', requiredInputs: ['ohlc_chart', 'volume']
});

test('the brief has the profile\'s sections in a fixed, deterministic order, each with its own text', () => {
  const brief = buildAnalysisProfileBrief(fullProfile());
  assert.deepEqual(brief.sections.map((s) => s.id), ['primaryStyle', 'secondaryStyles', 'focuses', 'customFocuses', 'customMethodNotes', 'mandatoryConcepts', 'otherConcepts', 'understanding', 'requiredInputs']);
  assert.deepEqual(brief.sections.map((s) => s.id), BRIEF_SECTION_IDS, 'the exported id list is the real order');
  for (const section of brief.sections) {
    assert.equal(section.text, section.lines.join('\n'));
    assert.equal(section.chars, section.text.length);
  }
  assert.deepEqual(buildAnalysisProfileBrief(fullProfile()), brief, 'deterministic - the same profile always yields the same brief');
});

test('several secondary styles stay separate lines but ONE section', () => {
  const brief = buildAnalysisProfileBrief(fullProfile());
  const secondary = brief.sections.find((s) => s.id === 'secondaryStyles');
  assert.equal(secondary.lines.length, 2);
  assert.match(secondary.lines[0], /WYCKOFF/);
  assert.match(secondary.lines[1], /ELLIOTT_WAVE/);
});

test('MANDATORY concepts are phrased as a real instruction, distinct from preferred/reference concepts which stay data', () => {
  const brief = buildAnalysisProfileBrief(fullProfile());
  const mandatory = brief.sections.find((s) => s.id === 'mandatoryConcepts').text;
  assert.match(mandatory, /MANDATORY for this profile - directly address each one/);
  assert.match(mandatory, /never silently omit one, never invent one that isn't there/);
  assert.match(mandatory, /Swept liquidity levels \(stops already taken\)/);
  assert.doesNotMatch(mandatory, /Order block mitigation|Weekly open/);
  const other = brief.sections.find((s) => s.id === 'otherConcepts').text;
  assert.match(other, /data - apply where genuinely relevant, never forced/);
  assert.match(other, /Order block mitigation; Weekly open/);
  assert.doesNotMatch(other, /MANDATORY|Swept liquidity/);
});

test('the understanding is framed as historical context, not established truth', () => {
  const text = buildAnalysisProfileBrief(fullProfile()).sections.find((s) => s.id === 'understanding').text;
  assert.match(text, /historical context, not established truth/);
  assert.match(text, /Confirms breakouts only after a sweep\./);
});

test('freedom/strictness is never part of the brief - it is chosen per generation request, not stored on a profile', () => {
  const profile = { ...fullProfile(), adherence: 'strict' };
  const brief = buildAnalysisProfileBrief(profile);
  assert.doesNotMatch(brief.text, /adherence/i);
  assert.doesNotMatch(brief.text, /\b(?:STRICT|BALANCED)\b/, 'no adherence level leaks into the brief');
});

test('a profile with no primary style (or no profile at all) yields an empty brief', () => {
  for (const input of [null, undefined, {}, { primaryStyle: null, concepts: [{ title: 'x', priority: 'mandatory' }] }]) {
    const brief = buildAnalysisProfileBrief(input);
    assert.deepEqual(brief.sections, []);
    assert.deepEqual(brief.lines, []);
    assert.equal(brief.text, '');
    assert.equal(brief.chars, 0);
    assert.equal(brief.estimatedTokens, 0);
  }
});

test('the brief re-applies its own caps to browser-supplied data: 30 custom focuses, 120 concepts, 4000-char understanding, 100/300-char concept text', () => {
  const profile = {
    primaryStyle: style('smc'),
    customFocuses: Array.from({ length: 50 }, (_, i) => ({ name: `focus-${i}` })),
    concepts: Array.from({ length: 200 }, (_, i) => ({ title: `concept-${i}`, priority: i < 130 ? 'mandatory' : 'preferred' })),
    understanding: 'u'.repeat(9000)
  };
  const brief = buildAnalysisProfileBrief(profile);
  const customText = brief.sections.find((s) => s.id === 'customFocuses').text;
  assert.match(customText, /focus-29/);
  assert.doesNotMatch(customText, /focus-30\b/);
  const mandatory = brief.sections.find((s) => s.id === 'mandatoryConcepts').text;
  assert.match(mandatory, /concept-119/);
  assert.doesNotMatch(mandatory, /concept-120\b/, 'only the first 120 concepts are ever read');
  assert.ok(brief.sections.find((s) => s.id === 'understanding').text.endsWith('u'.repeat(4000)) && !/u{4001}/.test(brief.text));
  const long = buildAnalysisProfileBrief({ primaryStyle: style('smc'), concepts: [{ title: 't'.repeat(300), description: 'd'.repeat(900), priority: 'preferred' }] });
  assert.match(long.text, new RegExp(`t{100} \\(d{300}\\)`));
  assert.doesNotMatch(long.text, /t{101}|d{301}/);
});

test('malformed entries are skipped, never thrown on (the brief arrives from the browser)', () => {
  const brief = buildAnalysisProfileBrief({
    primaryStyle: style('smc'), secondaryStyles: [null, {}, { id: '' }], focuses: [],
    customFocuses: [null, 7, { name: '   ' }, { name: 'ok' }], concepts: [null, 'x', { title: '' }, { title: 'kept', priority: 'mandatory' }], understanding: '   '
  });
  assert.equal(brief.sections.find((s) => s.id === 'customFocuses').text.endsWith('ok'), true);
  assert.match(brief.text, /kept/);
  assert.equal(brief.sections.find((s) => s.id === 'secondaryStyles'), undefined, 'secondary entries with no id produce no line');
  assert.equal(brief.sections.find((s) => s.id === 'focuses'), undefined);
});

test('estimatedTokens is the ~4-chars-per-token heuristic over the whole brief text', () => {
  const brief = buildAnalysisProfileBrief(fullProfile());
  assert.equal(brief.chars, brief.text.length);
  assert.equal(brief.estimatedTokens, Math.ceil(brief.text.length / 4));
  assert.ok(brief.estimatedTokens > 50);
});

test('describeAnalysisStyle is unchanged by the move: name, id and each non-empty facet joined with an em dash', () => {
  assert.equal(describeAnalysisStyle(null), '');
  assert.equal(describeAnalysisStyle({}), '');
  assert.equal(describeAnalysisStyle({ id: 'x', name: { en: 'X style' } }), 'X style (x)');
  assert.equal(describeAnalysisStyle(style('smc')), 'SMC (smc) — core concepts: c1 — principles: p1 — known limitations: l1 — guidance: g1');
});

test('WHAT THE PREVIEW SHOWS IS WHAT THE MODEL RECEIVES: the Session analysis system prompt contains exactly the brief lines, in order, adjacent to each other', () => {
  const profile = fullProfile();
  const brief = buildAnalysisProfileBrief(profile);
  const prompt = serverModule.buildSessionAnalysisSystemPrompt({ analysisType: 'initial', analysisProfile: profile, adherence: 'strict' }, 'English');
  // The prompt separates every line with a blank line; the brief's own lines are otherwise untouched.
  const block = brief.lines.join('\n\n');
  assert.ok(prompt.includes(block), 'the brief must appear in the real prompt exactly as the Preview tab displays it');
  const afterBrief = prompt.slice(prompt.indexOf(block) + block.length);
  assert.match(afterBrief, /^\n\nThe trader set adherence to STRICT/, 'the per-request adherence line follows the brief, and is not part of it');
});

test('a Session prompt for a profile with no primary style contains none of the brief', () => {
  const prompt = serverModule.buildSessionAnalysisSystemPrompt({ analysisType: 'initial', analysisProfile: { primaryStyle: null, concepts: [{ title: 'zzz', priority: 'mandatory' }] } }, 'English');
  assert.doesNotMatch(prompt, /MANDATORY for this profile|zzz/);
});
