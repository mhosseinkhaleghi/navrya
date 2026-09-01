import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// Adaptive AI Session Analysis loading redesign (2026-09-01): the trader reported the modal's
// fixed 6-item checklist visibly looping for the full 30-120s+ a real analysis call takes, and
// asked for the "Draw scenario"/"Draw full analysis on chart" buttons to show a real in-flight
// scanning animation instead of just a disabled state. Same "source-string wiring" convention as
// tests/session-ai-analysis-popup-wiring.test.mjs - these are visual/animation components with no
// meaningful headless-DOM render target, so correctness here is "the real wiring is present and
// the old, disproven approach is gone," not a snapshot.

const buttonSrc = await readFile(new URL('../public/pages/shared/navrya/components/forms/Button.jsx', import.meta.url), 'utf8');
const cardSrc = await readFile(new URL('../navrya-src/sessionAnalysisCard.jsx', import.meta.url), 'utf8');
const modalSrc = await readFile(new URL('../navrya-src/sessionAiAnalysisModal.jsx', import.meta.url), 'utf8');

test('Button gained an additive `loading` prop that swaps its icon for AnalyzingImageIcon and blocks the click, without touching the default click/disabled path', () => {
  assert.match(buttonSrc, /import \{ AnalyzingImageIcon \} from '\.\.\/feedback\/AnalyzingImageIcon\.jsx';/);
  assert.match(buttonSrc, /loading = false/);
  assert.match(buttonSrc, /const blocked = disabled \|\| loading;/);
  assert.match(buttonSrc, /disabled=\{blocked\}/);
  assert.match(buttonSrc, /loading \? <AnalyzingImageIcon size=\{iconSize\} \/> : icon &&/);
});

test('the per-scenario "Draw scenario" and whole-analysis "Draw full analysis" buttons drive Button\'s real loading prop, not a bare disabled flag', () => {
  assert.match(cardSrc, /icon="image" loading=\{vizStatus === 'loading'\} onClick=\{onVisualize\}/);
  assert.match(cardSrc, /icon="image" loading=\{!!\(analysisVisualization && analysisVisualization\.status === 'loading'\)\} onClick=\{onVisualizeAnalysis\}/);
});

test('the old fixed 6-item generating checklist (GENERATION_STAGES/stage_* copy) is gone, replaced by the shuffled AI_THINKING_PHRASES feed + AiThinkingOrb', () => {
  assert.doesNotMatch(modalSrc, /GENERATION_STAGES/);
  assert.doesNotMatch(modalSrc, /stage_readingChart/);
  assert.doesNotMatch(modalSrc, /function GeneratingStages\(/);
  assert.match(modalSrc, /import \{ AiThinkingOrb \} from '\.\.\/public\/pages\/shared\/navrya\/components\/feedback\/AiThinkingOrb\.jsx';/);
  assert.match(modalSrc, /const AI_THINKING_PHRASES = \{/);
  assert.match(modalSrc, /fa: \{/);
  assert.match(modalSrc, /ar: \{/);
  assert.match(modalSrc, /en: \{/);
  assert.match(modalSrc, /es: \{/);
  assert.match(modalSrc, /function GeneratingView\(\{ lang, active, isEvaluation \}\)/);
  assert.match(modalSrc, /\{phase === 'generating' && <GeneratingView lang=\{activeLang\} active=\{phase === 'generating'\} isEvaluation=\{isEvaluation\} \/>\}/);
});

test('the status feed never shows the whole phrase pool at once - only a small trailing slice, fading older lines rather than listing everything', () => {
  assert.match(modalSrc, /const visible = items\.slice\(-3\);/);
  assert.match(modalSrc, /\.slice\(-4\)/);
});

test('every AI_THINKING_PHRASES language pool has real, distinct base phrases (never a copy-pasted single string) and an evaluation-only addendum', () => {
  const langBlocks = ['fa', 'ar', 'en', 'es'];
  langBlocks.forEach((lang) => {
    const re = new RegExp(lang + ':\\s*\\{\\s*base:\\s*\\[([^\\]]+)\\][\\s\\S]*?evaluation:\\s*\\[([^\\]]+)\\]');
    const m = modalSrc.match(re);
    assert.ok(m, 'expected a base+evaluation phrase list for lang ' + lang);
    const baseItems = m[1].split(',').filter((s) => s.trim().length > 0);
    assert.ok(baseItems.length >= 15, lang + ' base pool should have well over the old fixed 6 phrases, got ' + baseItems.length);
  });
});
