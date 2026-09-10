import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Voice/Chat form-interview workflow upgrade: session.analysis.read - reads the EXISTING,
// already-persisted AI Analysis top to bottom (including its own progressive-disclosure section),
// through bounded sequential Voice chunks, never regenerating or charging for a new analysis.
// navrya-src has no DOM/React test harness in this project (see tests/session-actions.test.mjs's
// own comment) - these are static-source regression guards plus a real, executed test of the pure
// narration-assembly functions themselves (brace-matched out of the real source, the same
// convention tests/psychology-intake-enum-normalization.test.mjs and
// tests/account-kind-interview.test.mjs already established).

const root = process.cwd();
const characterAppSrc = await readFile(path.join(root, 'navrya-src', 'character-app.jsx'), 'utf8');
const dockViewSrc = await readFile(path.join(root, 'navrya-src', 'chatDockView.jsx'), 'utf8');
const analysisCardSrc = await readFile(path.join(root, 'navrya-src', 'sessionAnalysisCard.jsx'), 'utf8');

function actionBlock(id) {
  const re = new RegExp(`id: '${id.replace(/\./g, '\\.')}'[\\s\\S]*?resultContext: \\(\\) => \\{\\}\\s*\\}\\);`);
  const match = re.exec(characterAppSrc);
  assert.ok(match, `could not find the real ${id} registration`);
  return match[0];
}

function extractFunctionSource(src, name) {
  const startMatch = new RegExp(`function ${name}\\(`).exec(src);
  assert.ok(startMatch, `could not find the real function ${name}`);
  const braceOpen = src.indexOf('{', startMatch.index);
  let depth = 0, i = braceOpen;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  assert.ok(depth === 0, `unbalanced braces extracting ${name}`);
  return src.slice(startMatch.index, i + 1);
}

function narrationSandbox() {
  const src = [
    extractFunctionSource(characterAppSrc, 'analysisBlockText'),
    extractFunctionSource(characterAppSrc, 'analysisSectionTexts'),
    extractFunctionSource(characterAppSrc, 'chunkAnalysisSections')
  ].join('\n');
  const trCalls = [];
  const sandbox = {
    analysisCardTr: (lang, key) => { trCalls.push(key); return 'T(' + key + ')'; },
    ANALYSIS_VOICE_CHUNK_MAX_CHARS: 600
  };
  vm.createContext(sandbox);
  vm.runInContext(src + '\nthis.analysisSectionTexts = analysisSectionTexts; this.chunkAnalysisSections = chunkAnalysisSections;', sandbox);
  return { analysisSectionTexts: sandbox.analysisSectionTexts, chunkAnalysisSections: sandbox.chunkAnalysisSections, trCalls };
}

test('sessionAnalysisCard.jsx exports tr() so session.analysis.read reuses the real, already-rendered labels - never invented terminology', () => {
  assert.match(analysisCardSrc, /export function tr\(lang, key, vars\)/);
});

test('session.analysis.read is entityAlreadyPersisted with zero fields (a pure read, never a mutation), and is only available when a real persisted analysis exists', () => {
  const block = actionBlock('session.analysis.read');
  assert.match(block, /entityAlreadyPersisted: true/);
  assert.match(block, /requiredFields: \[\], optionalFields: \[\]/);
  assert.match(block, /e\.type === 'chart' && e\.aiAnalysisResult/);
});

test('session.analysis.read never calls the analysis client / any network AI call - deterministic text assembly only, never regenerates or charges', () => {
  const block = actionBlock('session.analysis.read');
  assert.doesNotMatch(block, /analyzeSession|TradeJournalSessionAnalysisClient|fetch\(/);
});

test('session.analysis.read dispatches tradejournal:ai-analysis-narrate with the real bounded chunks - the same custom-event pattern tradejournal:ai-analysis-ready already established, never a second narration mechanism', () => {
  const block = actionBlock('session.analysis.read');
  assert.match(block, /new CustomEvent\('tradejournal:ai-analysis-narrate', \{/);
  assert.match(block, /detail: \{ chunks: chunks,/);
});

test('analysisSectionTexts() assembles every real section, in the exact order SessionAnalysisCard itself renders them: thesis, metrics, high-importance blocks, scenario evaluations, scenarios, watch items, then the progressive-disclosure section (other blocks, unknowns, what-would-change-view, confidence)', () => {
  const { analysisSectionTexts, trCalls } = narrationSandbox();
  const result = {
    thesis: { headline: 'Price is coiling under resistance.', summary: 'Liquidity above needs to be swept first.' },
    stateMetrics: [{ label: 'Trend', value: 'Bullish' }, { label: 'Momentum', value: 'Weak' }],
    blocks: [
      { id: 'b1', title: 'Key structure', importance: 'high', summary: 'A clean higher low formed.' },
      { id: 'b2', title: 'Session context', importance: 'low', items: ['London already swept Asia highs.'] }
    ],
    scenarioEvaluations: [{ scenarioId: 's1', status: 'confirmed', newProbability: 72 }],
    scenarios: [{ localKey: 'sc1', role: 'primary', title: 'Breakout continuation', summary: 'Price breaks and retests.', probability: 65 }],
    watchItems: ['4200 resistance', 'NY open volume'],
    unknowns: ['Unclear whether the news release already priced in.'],
    whatWouldChangeView: 'A clean break and hold above 4230.',
    confidence: { level: 'medium', reasons: ['Mixed higher-timeframe signal.'] }
  };
  const sections = analysisSectionTexts(result, 'en');

  assert.ok(sections[0].includes('Price is coiling under resistance.') && sections[0].includes('Liquidity above needs to be swept first.'));
  assert.ok(sections.some((s) => s === 'Trend: Bullish'));
  assert.ok(sections.some((s) => s === 'Momentum: Weak'));
  assert.ok(sections.some((s) => s.includes('Key structure') && s.includes('A clean higher low formed.')), 'high-importance block must be included');
  assert.ok(sections.some((s) => s.includes('72%')), 'scenario evaluation probability must be included');
  assert.ok(sections.some((s) => s.includes('Breakout continuation') && s.includes('65%')), 'scenario title/probability must be included');
  assert.ok(sections.some((s) => s.includes('4200 resistance') && s.includes('NY open volume')), 'watch items must be included');
  assert.ok(sections.some((s) => s.includes('London already swept Asia highs.')), 'the progressive-disclosure "other" block must be included, not just what is visible by default');
  assert.ok(sections.some((s) => s.includes('Unclear whether the news release')), 'unknowns must be included');
  assert.ok(sections.some((s) => s.includes('A clean break and hold above 4230.')), 'whatWouldChangeView must be included');
  assert.ok(sections.some((s) => s.includes('medium') && s.includes('Mixed higher-timeframe signal.')), 'confidence level/reasons must be included');

  // Real declared display order: thesis -> metrics -> high blocks -> scenario evaluations ->
  // scenarios -> watch items -> other blocks -> unknowns -> whatWouldChangeView -> confidence.
  const thesisIdx = sections.findIndex((s) => s.includes('Price is coiling'));
  const metricIdx = sections.findIndex((s) => s === 'Trend: Bullish');
  const highBlockIdx = sections.findIndex((s) => s.includes('Key structure'));
  const evalIdx = sections.findIndex((s) => s.includes('72%'));
  const scenarioIdx = sections.findIndex((s) => s.includes('Breakout continuation'));
  const watchIdx = sections.findIndex((s) => s.includes('4200 resistance'));
  const otherBlockIdx = sections.findIndex((s) => s.includes('London already swept'));
  const unknownsIdx = sections.findIndex((s) => s.includes('Unclear whether'));
  const changeViewIdx = sections.findIndex((s) => s.includes('4230'));
  const confidenceIdx = sections.findIndex((s) => s.includes('Mixed higher-timeframe'));
  assert.ok(thesisIdx < metricIdx && metricIdx < highBlockIdx && highBlockIdx < evalIdx && evalIdx < scenarioIdx && scenarioIdx < watchIdx && watchIdx < otherBlockIdx && otherBlockIdx < unknownsIdx && unknownsIdx < changeViewIdx && changeViewIdx < confidenceIdx);

  assert.ok(trCalls.includes('thesisTitle') && trCalls.includes('watchingTitle') && trCalls.includes('unknownsTitle') && trCalls.includes('confidenceTitle'), 'real card labels must be reused, never invented terminology');
});

test('chunkAnalysisSections() never splits a real section across two chunks, and respects the per-chunk bound', () => {
  const { chunkAnalysisSections } = narrationSandbox();
  const shortSections = ['a'.repeat(100), 'b'.repeat(100), 'c'.repeat(100)];
  const chunks = chunkAnalysisSections(shortSections);
  assert.ok(chunks.every((c) => c.length <= 600));
  chunks.join(' ').split(' ').forEach(() => {}); // sanity - real content preserved below
  assert.equal(chunks.join(' ').replace(/\s+/g, ''), shortSections.join('').replace(/\s+/g, ''));

  const longSections = ['x'.repeat(500), 'y'.repeat(500)];
  const longChunks = chunkAnalysisSections(longSections);
  assert.equal(longChunks.length, 2, 'a section that would overflow the bound with the previous one starts its own new chunk, never split mid-section');
  assert.ok(longChunks[0].indexOf('x'.repeat(500)) > -1);
  assert.ok(longChunks[1].indexOf('y'.repeat(500)) > -1);
});

test('chatDockView.jsx listens for tradejournal:ai-analysis-narrate, enqueues every chunk sequentially through the real PlaybackController queue, and only while Voice is genuinely connected', () => {
  const fn = dockViewSrc.slice(dockViewSrc.indexOf('function onAnalysisNarrate'), dockViewSrc.indexOf("window.addEventListener('tradejournal:ai-analysis-narrate'"));
  assert.match(fn, /if \(!Array\.isArray\(chunks\) \|\| !chunks\.length \|\| !voiceRef\.current \|\| !playbackControllerRef\.current\) return;/);
  assert.match(fn, /if \(currentState === VOICE_STATES\.IDLE \|\| currentState === VOICE_STATES\.ERROR\) return;/);
  assert.match(fn, /chunks\.forEach\(\(chunk, i\) => \{/);
  assert.match(fn, /playbackControllerRef\.current\.enqueue\(spoken, \{ kind: 'ai-analysis-narration'/);
});

test('the tradejournal:ai-analysis-narrate listener is registered exactly once (mount-time, empty deps) and cleaned up on unmount, mirroring the existing tradejournal:ai-analysis-ready listener', () => {
  const block = dockViewSrc.slice(dockViewSrc.indexOf('function onAnalysisNarrate'), dockViewSrc.indexOf('function onAnalysisNarrate') + 1400);
  assert.match(block, /window\.addEventListener\('tradejournal:ai-analysis-narrate', onAnalysisNarrate\);/);
  assert.match(block, /window\.removeEventListener\('tradejournal:ai-analysis-narrate', onAnalysisNarrate\);/);
  assert.match(block, /\}, \[\]\); \/\/ eslint-disable-line react-hooks\/exhaustive-deps/);
});
