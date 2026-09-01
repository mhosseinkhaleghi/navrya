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
  // AI-access follow-up: onClose is now a small block (also clears sessionAnalysisAutoRun and
  // resolves any pending runAiAnalysis() Promise - see tests/session-analysis-action.test.mjs) -
  // still always clears sessionAnalysisEntry itself, unchanged.
  assert.match(source, /onClose=\{\(\) => \{\s*setSessionAnalysisEntry\(null\);/);
  assert.match(source, /onAddScenario=\{addAiScenario\}/);
  assert.match(source, /onVisualizeScenario=\{runVisualizeAiScenario\}/);
});

// Production incident (2026-08-31): once a real analysis was saved, this same leftover local-demo
// strip crashed with "Cannot read properties of undefined (reading 'length')" - it unconditionally
// read entry.aiAnalysisResult.patterns/.chartSummary, a shape only the OLD, no-longer-reachable
// local-demo path ever wrote; computeAnalysisPatches() (session-analysis-client.js) writes the
// REAL normalized analysis result (thesis/blocks/scenarios/...) into that exact same field. Rather
// than teach AiStrip two incompatible shapes, it (and the dead analyzeEntry()/makeAiResult() path
// that only it ever called) was removed outright - the real modal is the only "view/start
// analysis" entry point for an entry now.
test('the dead, now-crashing AiStrip local-demo component and its analyzeEntry()/makeAiResult() callers are gone', () => {
  assert.doesNotMatch(source, /function AiStrip\(/);
  assert.doesNotMatch(source, /<AiStrip /);
  assert.doesNotMatch(source, /function analyzeEntry\(/);
  assert.doesNotMatch(source, /function makeAiResult\(/);
});

// "View analysis again" (not just "start a new one") now goes through the SAME real modal instead
// of AiStrip's broken toggle - see sessionAiAnalysisModal.jsx's hasSavedResult.
test('EntryDetailPanel\'s single AI-analysis button is the real popup trigger, with no separate onAnalyze prop left over', () => {
  assert.doesNotMatch(source, /onAnalyze/);
  assert.match(source, /function EntryDetailPanel\(\{ session, entry, index, lang, imageUrl, openScenarios, onNote, onDeleteEntry, onAttachImage, onOpenSessionAnalysis,/);
});
