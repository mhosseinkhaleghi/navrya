import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = file => readFile(shared(file), 'utf8');

// pattern-registry.js and strategy-education.js are large, deeply-interconnected DOM/routing
// modules (layer/store/i18n/ai/icons all wired together through real hash routing) - fully
// executing them in a vm sandbox to click a checkbox is disproportionate for what this test
// needs to prove. This codebase already has precedent for static-analysis verification of
// hard-to-execute UI code (see trade-regression.test.mjs's "modal contract..." and "session
// integration..." tests, which grep the real source rather than run it). We do the same here:
// verify the sharingView() source itself pulls real numbers from scenarioReport()/
// detectionStats() - never fabricated ones - and wires the toggle to the publish flow.

test('pattern-registry.js: checking the sharing toggle triggers openFlow(), and the evidence snapshot is built from the real scenarioReport() fields', async () => {
  const text = await source('pattern-registry.js');
  const start = text.indexOf('function sharingView');
  const end = text.indexOf('\n  function', start + 10);
  const view = text.slice(start, end);
  assert.match(view, /store\.scenarioReport\(pattern\.id\)/, 'evidence must come from the pattern\'s real scenario report, not a guess');
  assert.match(view, /successRatePercent:\s*report\.hasData\s*\?\s*report\.occurrenceRate\s*:\s*null/, 'successRatePercent maps from report.occurrenceRate, and is null (not 0 or fabricated) when there is no data');
  assert.match(view, /sampleSize:\s*report\.hasData\s*\?\s*report\.detectionCount\s*:\s*0/, 'sampleSize maps from report.detectionCount');
  assert.match(view, /type:\s*'pattern',\s*sourceId:\s*pattern\.id/, 'the listing is published against this exact pattern\'s id as sourceId');
  assert.match(view, /if\s*\(input\.checked\)\s*openFlow\(\)/, 'checking the toggle must trigger the publish flow, not just flip the local isPublic flag');
  assert.doesNotMatch(view, /successRatePercent:\s*\d/, 'no hardcoded numeric success rate anywhere in this function');
});

test('strategy-education.js: checking the sharing toggle triggers openFlow(), and the evidence snapshot is built from the real detectionStats() fields', async () => {
  const text = await source('strategy-education.js');
  const start = text.indexOf('function sharingView');
  const end = text.indexOf('\n  function', start + 10);
  const view = text.slice(start, end);
  assert.match(view, /store\.detectionStats\(strategy,\s*state\.staleHours\)/, 'evidence must come from the strategy\'s real detection stats, not a guess');
  assert.match(view, /successRatePercent:\s*stats\.confirmationRate/, 'successRatePercent maps from the same confirmationRate the report tab already shows');
  assert.match(view, /sampleSize:\s*stats\.total/, 'sampleSize maps from the same total the report tab already shows');
  assert.match(view, /type:\s*'strategy',\s*sourceId:\s*strategy\.id/, 'the listing is published against this exact strategy\'s id as sourceId');
  assert.match(view, /if\s*\(toggle\.checked\)\s*openFlow\(\)/, 'checking the toggle must trigger the publish flow, not just flip the local isPublic flag');
  assert.doesNotMatch(view, /successRatePercent:\s*\d/, 'no hardcoded numeric success rate anywhere in this function');
});

test('both sharing tabs look up an existing listing before offering to publish again, rather than always prompting a fresh listing', async () => {
  const patternText = await source('pattern-registry.js');
  const strategyText = await source('strategy-education.js');
  assert.match(patternText, /marketplace\.findListingBySource\(pattern\.id\)/);
  assert.match(strategyText, /marketplace\.findListingBySource\(strategy\.id\)/);
});

test('marketplace-ui.js: openPublishFlow never invents preview/full content itself - it always delegates to the caller-supplied buildContent()', async () => {
  const text = await source('marketplace-ui.js');
  const start = text.indexOf('function openPublishFlow');
  const end = text.indexOf('\n  function', start + 10);
  const flow = text.slice(start, end);
  assert.match(flow, /options\.buildContent\(Number\(previewInput\.value\)/, 'content shaping stays owned by the pattern/strategy-specific caller');
  assert.doesNotMatch(flow, /stages\.slice|positionManagement\./, 'marketplace-ui.js must stay type-agnostic and never inspect pattern/strategy internals directly');
});
