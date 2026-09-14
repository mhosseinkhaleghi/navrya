import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Session / Analysis Desk AI upgrade - sessionAnalysisCard.jsx's new render sections (request/
// response, note feedback, structured unresolved items with legacy fallback, per-timeframe read/
// synthesis, deferred scenarios, provider/model attribution) and the enriched scenario-evaluation
// card (prior -> new probability + delta). Same static-source convention every other *.jsx file in
// this project uses (no DOM/React test harness here - see tests/session-actions.test.mjs).
const root = process.cwd();
const source = await readFile(path.join(root, 'navrya-src', 'sessionAnalysisCard.jsx'), 'utf8');

test('user request response ("your view and instruction") is rendered visibly, hidden entirely when the trader wrote nothing', () => {
  assert.match(source, /function RequestResponseBlock\(\{ requestResponse, lang \}\)/);
  assert.match(source, /if \(!requestResponse \|\| !\(requestResponse\.requested \|\| requestResponse\.answer\)\) return null;/);
  assert.match(source, /<RequestResponseBlock requestResponse=\{result\.requestResponse\} lang=\{activeLang\} \/>/);
});

test('note feedback renders per item with a verdict, keyed only to a noteRef - never free text matching', () => {
  assert.match(source, /function NoteFeedbackBlock\(\{ noteFeedback, lang, noteLabelFor \}\)/);
  assert.match(source, /item\.noteRef\.entryId \+ ':' \+ item\.noteRef\.field/);
  assert.match(source, /tr\(lang, 'verdict_' \+ item\.verdict\)/);
  assert.match(source, /<NoteFeedbackBlock noteFeedback=\{result\.noteFeedback\} lang=\{activeLang\} \/>/);
});

test('structured unresolvedItems render with status/action, and a legacy plain-string `unknowns` result still renders safely via resolveUnresolvedItems', () => {
  assert.match(source, /export function resolveUnresolvedItems\(result\)/);
  assert.match(source, /if \(result\.unresolvedItems && result\.unresolvedItems\.length\) return result\.unresolvedItems;/);
  assert.match(source, /return \(result\.unknowns \|\| \[\]\)\.map\(/);
  assert.match(source, /function UnresolvedItemsBlock\(\{ items, lang \}\)/);
  assert.match(source, /tr\(lang, 'unresolvedStatus_' \+ item\.status\)/);
  assert.match(source, /tr\(lang, 'actionLabel'\)/);
  assert.match(source, /const unresolvedItems = resolveUnresolvedItems\(result\);/);
});

test('scenario evaluation renders the prior -> new probability plus the delta, degrading safely when an older evaluation object has no previousProbability', () => {
  assert.match(source, /const hasPrior = typeof evaluation\.previousProbability === 'number';/);
  assert.match(source, /\{hasPrior && \(/);
  assert.match(source, /tr\(lang, 'previousProbability'\)/);
  assert.match(source, /tr\(lang, 'delta'\)/);
});

test('per-timeframe analysis and synthesis render, hidden entirely for a plain single-image analysis', () => {
  assert.match(source, /function TimeframeBlock\(\{ timeframeAnalyses, timeframeSynthesis, lang \}\)/);
  assert.match(source, /if \(!timeframeAnalyses \|\| !timeframeAnalyses\.length\) return null;/);
  assert.match(source, /tr\(lang, 'synthesisTitle'\)/);
  assert.match(source, /<TimeframeBlock timeframeAnalyses=\{result\.timeframeAnalyses\} timeframeSynthesis=\{result\.timeframeSynthesis\} lang=\{activeLang\} \/>/);
});

test('deferred scenarios are disclosed explicitly, never silently omitted', () => {
  assert.match(source, /function DeferredScenariosNote\(\{ deferredScenarios, lang \}\)/);
  assert.match(source, /<DeferredScenariosNote deferredScenarios=\{result\.deferredScenarios\} lang=\{activeLang\} \/>/);
});

test('provider/model attribution reuses the existing provider catalog and ModelGlyph system - never a second logo registry - and reads the SAVED result\'s own provider/model, never the currently-selected settings', () => {
  assert.match(source, /import \{ ModelGlyph \} from '\.\.\/public\/pages\/shared\/navrya\/components\/assistant\/ModelSwitcher\.jsx';/);
  assert.match(source, /function ProviderAttribution\(\{ result, lang \}\)/);
  assert.match(source, /settings\.providerCatalog\(\)/);
  assert.match(source, /catalogEntry\.id === result\.provider|p\.id === result\.provider/);
  assert.doesNotMatch(source, /activeProvider\(\)|activeModel\(\)/, 'must never fall back to the currently-selected settings for attribution');
  assert.match(source, /<ProviderAttribution result=\{result\} lang=\{activeLang\} \/>/);
});
