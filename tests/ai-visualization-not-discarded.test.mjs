import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// Production incident (2026-09-01): the trader reported scenario/analysis image generation "not
// working". Root-caused to two separate, real bugs:
//
// 1. EntryDetailPanel (liveSessionView.jsx) derived scenarioVisualizations/analysisVisualization
//    from a bare `visualizingKey` (only while loading) plus the real, PERSISTED result
//    (hydrateScenarioVisualizations()/result.wholeVisualization) - nothing in between. A scenario
//    that had NOT yet been Added has nowhere persistent to attach aiVisualization to (see
//    runVisualizeAiScenario()'s own "if not yet added ... only local/ephemeral state" comment), so
//    clicking "Draw scenario" BEFORE "Add scenario" - a completely normal order - had its real,
//    successfully-generated image silently thrown away the instant loading ended. A genuine
//    provider failure had the exact same silent-revert symptom, with no error shown either.
//
// 2. sessionAnalysisCard.jsx never rendered anything at all for a `status:'error'` visualization -
//    a failed generation and a never-attempted one were visually indistinguishable.
//
// Same "source-string wiring" convention as tests/ai-analysis-loading-motion.test.mjs - these are
// UI/state-shape components with no meaningful headless-DOM render target here.

const liveSrc = await readFile(new URL('../navrya-src/liveSessionView.jsx', import.meta.url), 'utf8');
const cardSrc = await readFile(new URL('../navrya-src/sessionAnalysisCard.jsx', import.meta.url), 'utf8');

test('EntryDetailPanel keeps real ephemeral state for a just-generated (not necessarily persisted) visualization, merged with the hydrated/persisted data - not just a bare loading flag', () => {
  assert.doesNotMatch(liveSrc, /const \[visualizingKey, setVisualizingKey\]/, 'the old bare loading-only flag must be gone, not left dangling alongside the new state');
  assert.match(liveSrc, /const \[localScenarioVisualizations, setLocalScenarioVisualizations\] = React\.useState\(\{\}\);/);
  assert.match(liveSrc, /const \[localAnalysisVisualization, setLocalAnalysisVisualization\] = React\.useState\(null\);/);
  assert.match(liveSrc, /return \{ \.\.\.hydrated, \.\.\.localScenarioVisualizations \};/);
  assert.match(liveSrc, /const analysisVisualization = localAnalysisVisualization \|\| \(result && result\.wholeVisualization\) \|\| null;/);
});

test('handleVisualizeAiScenario/handleVisualizeAiAnalysis record BOTH the loading state and the real outcome (ready or error) into that ephemeral state, not just fire-and-forget', () => {
  assert.match(liveSrc, /setLocalScenarioVisualizations\(\(prev\) => \(\{ \.\.\.prev, \[aiScenario\.localKey\]: \{ status: 'loading' \} \}\)\);/);
  assert.match(liveSrc, /setLocalScenarioVisualizations\(\(prev\) => \(\{ \.\.\.prev, \[aiScenario\.localKey\]: outcome\.ok \? outcome\.visualization : \{ status: 'error' \} \}\)\);/);
  assert.match(liveSrc, /setLocalAnalysisVisualization\(\{ status: 'loading' \}\);/);
  assert.match(liveSrc, /setLocalAnalysisVisualization\(outcome\.ok \? outcome\.visualization : \{ status: 'error' \}\);/);
});

test('sessionAnalysisCard renders a real, visible error notice for a failed scenario visualization or whole-analysis visualization, not silence', () => {
  assert.match(cardSrc, /\{vizStatus === 'error' && \(/);
  assert.match(cardSrc, /tr\(lang, 'visualizeError'\)/);
  assert.match(cardSrc, /\{analysisVisualization && analysisVisualization\.status === 'error' && \(/);
  assert.match(cardSrc, /tr\(activeLang, 'visualizeAnalysisError'\)/);
});

test('every language in sessionAnalysisCard has real visualizeError/visualizeAnalysisError copy, not a missing key falling back silently', () => {
  ['fa', 'ar', 'en', 'es'].forEach((lang) => {
    const re = new RegExp(lang + ':\\s*\\{[\\s\\S]*?visualizeError: ', 'm');
    assert.ok(re.test(cardSrc), 'missing visualizeError copy for lang ' + lang);
  });
});
