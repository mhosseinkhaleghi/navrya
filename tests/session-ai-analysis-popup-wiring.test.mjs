import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../navrya-src/liveSessionView.jsx', import.meta.url), 'utf8');

test('the visible Session AI Analysis button opens the whole-session popup', () => {
  assert.match(source, /const \[sessionAiPopupOpen, setSessionAiPopupOpen\] = React\.useState\(false\)/);
  assert.match(source, /onOpenSessionAnalysis=\{\(\) => setSessionAiPopupOpen\(true\)\}/);
  assert.match(source, /onClick=\{onOpenSessionAnalysis\}>\{tr\(lang, 'aiAnalyzeButton'\)\}/);
  assert.match(source, /\{sessionAiPopupOpen && <SessionAiAnalysisModal session=\{session\} lang=\{lang\} onClose=\{\(\) => setSessionAiPopupOpen\(false\)\} \/>\}/);
});

test('entry-level AI analysis remains wired to the existing deterministic action', () => {
  assert.match(source, /onAnalyze=\{analyzeEntry\}/);
  assert.match(source, /<AiStrip session=\{session\} entry=\{entry\} lang=\{lang\} onAnalyze=\{\(\) => onAnalyze\(entry\)\} \/>/);
});
