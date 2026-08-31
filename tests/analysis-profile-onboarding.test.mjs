import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Analysis Profiles domain (see ARCHITECTURE.md §7.25). Static source-assertion style, same
// precedent as tests/dashboard-board-sync.test.mjs: navrya-src/*.jsx has no JSX/ESM transform
// wired into this project's plain `node --test` runner, so onboarding UI behavior is verified by
// asserting on the real source text rather than executing it.
const root = process.cwd();
const navryaSrc = (...parts) => path.join(root, 'navrya-src', ...parts);
const source = (file) => readFile(navryaSrc(file), 'utf8');

test('the onboarding wizard has exactly two steps - StepDots only ever renders steps 1 and 2', async () => {
  const text = await source('analysisProfileOnboarding.jsx');
  assert.match(text, /\[1, 2\]\.map/, 'the step indicator must enumerate exactly steps 1 and 2');
  assert.doesNotMatch(text, /\[1,\s*2,\s*3\]/, 'no third step must ever be added to the step indicator');
});

test('there is no third question about AI freedom/strictness/creativity anywhere in the onboarding file\'s actual UI copy (comments are allowed to name the non-goal; user-facing strings and state must not)', async () => {
  const text = await source('analysisProfileOnboarding.jsx');
  // Strip comment lines first - this file's own header comment legitimately explains the
  // non-goal by naming these words; the real assertion is that no user-facing copy/state
  // implements a third question, not that the words never appear anywhere in the file at all.
  const codeOnly = text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
  const forbidden = /freedom|strictness|creativity|exploration|focused\s*\/\s*balanced|balanced\s*\/\s*exploratory/i;
  assert.doesNotMatch(codeOnly, forbidden, 'the onboarding wizard must never ask an AI freedom/strictness/creativity question');
  // No step-3 copy keys of any kind (step3Title, step3Subtitle, ...) exist in any language block.
  assert.doesNotMatch(text, /step3/i);
});

test('Step 1 asks the real headline question from the brief, in Persian and English', async () => {
  const text = await source('analysisProfileOnboarding.jsx');
  assert.match(text, /تو بازار را چطور می‌خوانی؟/);
  assert.match(text, /How do you read the market\?/);
});

test('Step 2 asks the real headline question from the brief, in Persian and English', async () => {
  const text = await source('analysisProfileOnboarding.jsx');
  assert.match(text, /وقتی چارت را باز می‌کنی، چشمت اول دنبال چیست؟/);
  assert.match(text, /What do your eyes look for first\?/);
});

test('Step 1 supports General / Open Analysis, Hybrid, and Custom Method as always-visible special options', async () => {
  const text = await source('analysisProfileOnboarding.jsx');
  assert.match(text, /SPECIAL_STYLE_IDS = \['general_analysis', 'hybrid', 'custom_method'\]/);
});

test('choosing Hybrid reveals a primary-lens picker plus up to two secondary lenses, never more', async () => {
  const text = await source('analysisProfileOnboarding.jsx');
  assert.match(text, /if \(prev\.length >= 2\) return prev;/, 'secondary styles must be capped at 2');
});

test('Custom Method requires a short note before the wizard can advance past Step 1', async () => {
  const text = await source('analysisProfileOnboarding.jsx');
  assert.match(text, /customMethodNotes\.trim\(\)\.length >= 8/);
  assert.match(text, /const step1Valid = Boolean\(primaryStyleId\) && customNotesOk;/);
});

test('Step 2 focus recommendations come from the Style/Focus Registries via mergeFocusRecommendations(), never a hardcoded per-style list inside the onboarding component', async () => {
  const text = await source('analysisProfileOnboarding.jsx');
  assert.match(text, /styles\.mergeFocusRecommendations\(primaryStyleId, secondaryStyleIds\)/);
  assert.doesNotMatch(text, /recommendedFocusIds:\s*\[/, 'no style-specific focus list should be hardcoded inside the onboarding UI itself');
});

test('a live Analysis DNA preview is rendered from the real selected style/focus, not static placeholder text', async () => {
  const text = await source('analysisProfileOnboarding.jsx');
  assert.match(text, /function DnaPreview\(/);
  assert.match(text, /<DnaPreview lang={activeLang} primaryStyleId={primaryStyleId} secondaryStyleIds={secondaryStyleIds} focusIds={focusIds} name={name} \/>/);
});

test('a default profile name is auto-suggested from the real store, and never overwrites a name the user already typed', async () => {
  const text = await source('analysisProfileOnboarding.jsx');
  assert.match(text, /window\.TradeJournalAnalysisProfileStore\s*\?\s*window\.TradeJournalAnalysisProfileStore\.suggestedName\(primaryStyleId, focusIds, activeLang\)/);
  assert.match(text, /if \(nameTouched\) return;/);
});

test('"Set up later" is offered only in first-run mode, distinct from Cancel in create/edit mode', async () => {
  const text = await source('analysisProfileOnboarding.jsx');
  assert.match(text, /mode === 'first-run' && <Button variant="ghost" onClick={onSkip}>\{tr\(activeLang, 'setUpLater'\)\}<\/Button>/);
  assert.match(text, /mode !== 'first-run' && <Button variant="ghost" onClick={onCancel}>\{tr\(activeLang, 'cancel'\)\}<\/Button>/);
});

test('Escape/backdrop closing the modal is wired to the real Modal component, which already supports it', async () => {
  const text = await source('analysisProfileOnboarding.jsx');
  assert.match(text, /import \{ Modal \} from '\.\.\/public\/pages\/shared\/navrya\/components\/feedback\/Modal\.jsx';/);
  assert.match(text, /onClose={handleClose}/);
});

test('character-app.jsx only mounts the first-run gate when the user genuinely has zero Analysis Profiles, after the real replica boot gate has resolved', async () => {
  const text = await source('character-app.jsx');
  assert.match(text, /window\.TradeJournalAnalysisProfileStore && !window\.TradeJournalAnalysisProfileStore\.listSync\(\)\.length/);
  assert.match(text, /getElementById\('navryaAnalysisProfileOnboardingRoot'\)/);
});

test('skipping first-run onboarding creates the exact safe default profile the brief specifies: General Market Analysis / general_analysis / market_structure, trend, key_levels, momentum', async () => {
  const text = await source('character-app.jsx');
  assert.match(text, /primaryStyleId: 'general_analysis'/);
  assert.match(text, /focusIds: \['market_structure', 'trend', 'key_levels', 'momentum'\]/);
});

test('the first-run gate never leaves the user with zero profiles: both complete() and skip() call AnalysisProfileStore.create()', async () => {
  const text = await source('character-app.jsx');
  const gate = text.slice(text.indexOf('function AnalysisProfileFirstRunGate'), text.indexOf('export function mountCharacterApp'));
  const createCalls = gate.match(/window\.TradeJournalAnalysisProfileStore\.create\(/g) || [];
  assert.ok(createCalls.length >= 2, 'both the completion path and the skip path must create a real profile');
});

test('strategiesHubView.jsx mounts the Analysis Profiles tab as a fully self-contained branch, the same pattern as the Positions tab - no Analysis-Profile business logic embedded in the hub itself', async () => {
  const text = await source('strategiesHubView.jsx');
  assert.match(text, /import \{ AnalysisProfilesTab \} from '\.\/analysisProfilesView\.jsx';/);
  assert.match(text, /if \(tab === 'analysis-profiles'\) \{\s*\n\s*return \(\s*\n\s*<div style={container}>\s*\n\s*<AnalysisProfilesTab lang={lang} character={character} \/>/);
});

test('Strategy detail exposes a Preferred Analysis Profile selector, defaulting to "no profile linked" - a Strategy is never implicitly pre-selected', async () => {
  const text = await source('strategiesHubView.jsx');
  assert.match(text, /analysisProfileFieldLabel/);
  assert.match(text, /\[\{ value: '', label: tr\(lang, 'analysisProfileNone'\) \}\]/);
});
