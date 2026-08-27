import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = file => readFile(shared(file), 'utf8');

async function stepMapSandbox() {
  const sandbox = { window: {} };
  vm.runInNewContext(await source('ai-wizard-step-map.js'), sandbox, { filename: 'ai-wizard-step-map.js' });
  return sandbox.window.TradeJournalAIWizardStepMap;
}

test('stepForPath() matches an exact field name to its declared step', async () => {
  const { forGroups } = await stepMapSandbox();
  const map = forGroups({ 1: ['direction', 'instrument'], 2: ['entryPrice', 'stopLoss'] });
  assert.equal(map.stepForPath('direction'), 1);
  assert.equal(map.stepForPath('entryPrice'), 2);
});

test('stepForPath() matches a dot-prefix group (a whole section) to any field starting with it', async () => {
  const { forGroups } = await stepMapSandbox();
  const map = forGroups({ 2: ['intake.demographics.'], 3: ['intake.financialContext.'] });
  assert.equal(map.stepForPath('intake.demographics.age'), 2);
  assert.equal(map.stepForPath('intake.demographics.country'), 2);
  assert.equal(map.stepForPath('intake.financialContext.capitalType'), 3);
});

test('stepForPath() prefers the longest matching prefix, so a specific field is never shadowed by a broader section', async () => {
  const { forGroups } = await stepMapSandbox();
  const map = forGroups({
    4: ['intake.tradingHistory.'],
    5: ['intake.tradingHistory.firstBigLossReaction']
  });
  assert.equal(map.stepForPath('intake.tradingHistory.firstBigLossReaction'), 5, 'the more specific single-field group must win over the broader section group');
  assert.equal(map.stepForPath('intake.tradingHistory.yearsTrading'), 4, 'a field only the broader section covers still resolves to it');
});

test('stepForPath() returns null (never a guessed step) for a path no group mentions', async () => {
  const { forGroups } = await stepMapSandbox();
  const map = forGroups({ 1: ['direction'] });
  assert.equal(map.stepForPath('somethingUnrelated'), null);
});

test('stepForPath() returns null for undefined/null input rather than throwing', async () => {
  const { forGroups } = await stepMapSandbox();
  const map = forGroups({ 1: ['direction'] });
  assert.equal(map.stepForPath(undefined), null);
  assert.equal(map.stepForPath(null), null);
});

test('forGroups({}) builds a map where every path resolves to null', async () => {
  const { forGroups } = await stepMapSandbox();
  const map = forGroups({});
  assert.equal(map.stepForPath('anything'), null);
});
