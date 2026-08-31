import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../navrya-src/liveSessionView.jsx', import.meta.url), 'utf8');

// Superseded by the real Adaptive AI Session Analysis wiring (server/pattern-ai-server.mjs's
// /api/sessions/analyze, session-analysis-client.js): the per-entry "AI analysis" button now
// opens SessionAiAnalysisModal pinned to the SPECIFIC entry the trader had open (not just a bare
// boolean toggle), and the popup is wired to the real onResult/onAddScenario/onVisualizeScenario
// persistence callbacks - the same full plumbing FateSummaryModal's own embedded instance uses -
// rather than a dead-end, unwired popup.
test('the per-entry "AI analysis" button opens the real popup, pinned to the entry that was open when clicked', () => {
  assert.match(source, /const \[sessionAnalysisEntry, setSessionAnalysisEntry\] = React\.useState\(null\)/);
  assert.match(source, /onOpenSessionAnalysis=\{\(\) => setSessionAnalysisEntry\(selEntry\)\}/);
  assert.match(source, /onClick=\{onOpenSessionAnalysis\}>\{tr\(lang, 'aiAnalyzeButton'\)\}/);
});

test('the per-entry popup is wired to real persistence (onResult/onAddScenario/onVisualizeScenario), not left unwired', () => {
  assert.match(source, /\{sessionAnalysisEntry && \(/);
  assert.match(source, /entry=\{sessionAnalysisEntry\}/);
  assert.match(source, /onClose=\{\(\) => setSessionAnalysisEntry\(null\)\}/);
  assert.match(source, /onAddScenario=\{addAiScenario\}/);
  assert.match(source, /onVisualizeScenario=\{runVisualizeAiScenario\}/);
});

test('entry-level AiStrip stays wired to the existing, separate local-demo quick-blurb action, unchanged', () => {
  assert.match(source, /onAnalyze=\{analyzeEntry\}/);
  assert.match(source, /<AiStrip session=\{session\} entry=\{entry\} lang=\{lang\} onAnalyze=\{\(\) => onAnalyze\(entry\)\} \/>/);
});
