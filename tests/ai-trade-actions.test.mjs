import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = file => readFile(shared(file), 'utf8');

// Objects built inside the vm sandbox carry that realm's own Object/Array.prototype, so
// assert.deepEqual (node:assert/strict's deepStrictEqual, prototype-sensitive) reports "same
// structure but not reference-equal" even when every field matches - the same caveat every other
// AI Copilot test file in this suite already calls out.
const clone = value => JSON.parse(JSON.stringify(value));

async function actionsSandbox() {
  const sandbox = { window: {} };
  vm.runInNewContext(await source('ai-trade-actions.js'), sandbox, { filename: 'ai-trade-actions.js' });
  return sandbox.window.TradeJournalAITradeActions;
}

// ---- direction ----

test('normalizeDirection() maps long/buy/bull/bullish (any case) to "long"', async () => {
  const t = await actionsSandbox();
  for (const raw of ['long', 'Long', 'BUY', 'bull', 'Bullish']) assert.equal(t.normalizeDirection(raw), 'long', raw);
});

test('normalizeDirection() maps short/sell/bear/bearish (any case) to "short"', async () => {
  const t = await actionsSandbox();
  for (const raw of ['short', 'Short', 'SELL', 'bear', 'Bearish']) assert.equal(t.normalizeDirection(raw), 'short', raw);
});

test('normalizeDirection() returns null for anything unrecognized, never a guessed default', async () => {
  const t = await actionsSandbox();
  assert.equal(t.normalizeDirection('sideways'), null);
  assert.equal(t.normalizeDirection(''), null);
  assert.equal(t.normalizeDirection(null), null);
});

// ---- margin mode ----

test('normalizeMarginMode() maps cross/isolated/iso, rejects anything else', async () => {
  const t = await actionsSandbox();
  assert.equal(t.normalizeMarginMode('cross'), 'cross');
  assert.equal(t.normalizeMarginMode('Isolated'), 'isolated');
  assert.equal(t.normalizeMarginMode('iso'), 'isolated');
  assert.equal(t.normalizeMarginMode('leveraged'), null);
});

// ---- price/percent numbers ----

test('normalizeNumber() strips currency symbols/commas/units and parses a plain positive number', async () => {
  const t = await actionsSandbox();
  assert.equal(t.normalizeNumber('$66,000'), 66000);
  assert.equal(t.normalizeNumber('66000 usd'), 66000);
  assert.equal(t.normalizeNumber('1.5%'), 1.5);
  assert.equal(t.normalizeNumber('2'), 2);
});

test('normalizeNumber() rejects zero, negative, and unparseable input rather than coercing to 0/NaN', async () => {
  const t = await actionsSandbox();
  assert.equal(t.normalizeNumber('0'), null);
  assert.equal(t.normalizeNumber('not a number'), null);
  assert.equal(t.normalizeNumber(''), null);
  assert.equal(t.normalizeNumber(null), null);
});

// ---- leverage ----

test('normalizeLeverage() parses "10x"/"10" to 10, rejects below 1x', async () => {
  const t = await actionsSandbox();
  assert.equal(t.normalizeLeverage('10x'), 10);
  assert.equal(t.normalizeLeverage('25'), 25);
  assert.equal(t.normalizeLeverage('0.5'), null);
  assert.equal(t.normalizeLeverage(''), null);
});

// ---- take profits ----

test('normalizeTakeProfits() wraps a single target into one 100% portion', async () => {
  const t = await actionsSandbox();
  assert.deepEqual(clone(t.normalizeTakeProfits('66000')), [{ price: 66000, portionPercent: 100 }]);
});

test('normalizeTakeProfits() splits several targets in one message evenly, remainder on the last', async () => {
  const t = await actionsSandbox();
  assert.deepEqual(clone(t.normalizeTakeProfits('66000, 68000, 70000')), [
    { price: 66000, portionPercent: 33 },
    { price: 68000, portionPercent: 33 },
    { price: 70000, portionPercent: 34 }
  ]);
  assert.deepEqual(clone(t.normalizeTakeProfits('66000 and 70000')), [
    { price: 66000, portionPercent: 50 },
    { price: 70000, portionPercent: 50 }
  ]);
});

test('normalizeTakeProfits() returns null (not an empty array) when nothing parseable was supplied', async () => {
  const t = await actionsSandbox();
  assert.equal(t.normalizeTakeProfits(''), null);
  assert.equal(t.normalizeTakeProfits('not a price'), null);
  assert.equal(t.normalizeTakeProfits(null), null);
});

// ---- strategy/pattern resolution by name (never a guessed id) ----

test('resolveStrategyId() matches an exact (case-insensitive) saved name', async () => {
  const t = await actionsSandbox();
  const list = [{ id: 's1', name: 'Breakout retest' }, { id: 's2', name: 'Mean reversion' }];
  assert.equal(t.resolveStrategyId('breakout retest', list), 's1');
});

test('resolveStrategyId() falls back to a saved name containing the spoken text', async () => {
  const t = await actionsSandbox();
  const list = [{ id: 's1', name: 'Breakout retest' }, { id: 's2', name: 'Mean reversion' }];
  assert.equal(t.resolveStrategyId('breakout', list), 's1');
});

test('resolveStrategyId() returns null (never a guess) for an unmatched name or an empty list', async () => {
  const t = await actionsSandbox();
  const list = [{ id: 's1', name: 'Breakout retest' }];
  assert.equal(t.resolveStrategyId('scalping', list), null);
  assert.equal(t.resolveStrategyId('breakout', []), null);
  assert.equal(t.resolveStrategyId('breakout', undefined), null);
});

test('resolvePatternIds() resolves a real saved pattern name to a single-id array, or null if unmatched', async () => {
  const t = await actionsSandbox();
  const list = [{ id: 'p1', name: 'Double bottom' }, { id: 'p2', name: 'Head and shoulders' }];
  assert.deepEqual(clone(t.resolvePatternIds('double bottom', list)), ['p1']);
  assert.equal(t.resolvePatternIds('triangle', list), null);
});

// ---- normalizeField() dispatch (what character-app.jsx's trade.calculator action actually calls) ----

test('normalizeField() dispatches every trade.calculator path to the matching rule', async () => {
  const t = await actionsSandbox();
  assert.equal(t.normalizeField('direction', 'long'), 'long');
  assert.equal(t.normalizeField('marginMode', 'cross'), 'cross');
  assert.equal(t.normalizeField('entryPrice', '66000'), 66000);
  assert.equal(t.normalizeField('stopLoss', '65000'), 65000);
  assert.equal(t.normalizeField('accountBalance', '10000'), 10000);
  assert.equal(t.normalizeField('riskAmount', '200'), 200);
  assert.equal(t.normalizeField('riskPercent', '1%'), 1);
  assert.equal(t.normalizeField('leverage', '10x'), 10);
  assert.deepEqual(clone(t.normalizeField('takeProfits', '70000')), [{ price: 70000, portionPercent: 100 }]);
});

test('normalizeField() resolves linkedStrategyId/linkedPatternIds against the passed-in lookups object', async () => {
  const t = await actionsSandbox();
  const lookups = { strategies: [{ id: 's1', name: 'Breakout retest' }], patterns: [{ id: 'p1', name: 'Double bottom' }] };
  assert.equal(t.normalizeField('linkedStrategyId', 'breakout retest', lookups), 's1');
  assert.deepEqual(clone(t.normalizeField('linkedPatternIds', 'double bottom', lookups)), ['p1']);
});

test('normalizeField() tolerates missing lookups (no Strategy/Pattern store on this page) without throwing', async () => {
  const t = await actionsSandbox();
  assert.equal(t.normalizeField('linkedStrategyId', 'breakout retest'), null);
  assert.equal(t.normalizeField('linkedPatternIds', 'double bottom', {}), null);
});

test('normalizeField() passes an unrecognized path straight through unchanged', async () => {
  const t = await actionsSandbox();
  assert.equal(t.normalizeField('somethingElse', 'raw-value'), 'raw-value');
});

// ---- resolveAccountId() - stricter than resolveStrategyId/resolvePatternIds on purpose: an
// account is a real money/ownership boundary, so an ambiguous match must return null, never a
// first-match guess. See ai-trade-actions.js's own comment on this deliberate divergence. ----

test('resolveAccountId() matches a single exact (case-insensitive) firm name', async () => {
  const t = await actionsSandbox();
  const list = [{ id: 'a1', firm: 'Atlas Funding' }, { id: 'a2', firm: 'Vertex Capital' }];
  assert.equal(t.resolveAccountId('atlas funding', list), 'a1');
});

test('resolveAccountId() falls back to a single partial match', async () => {
  const t = await actionsSandbox();
  const list = [{ id: 'a1', firm: 'Atlas Funding' }, { id: 'a2', firm: 'Vertex Capital' }];
  assert.equal(t.resolveAccountId('atlas', list), 'a1');
});

test('resolveAccountId() returns null (never a guess) when the name is unmatched, or when the list/name is empty', async () => {
  const t = await actionsSandbox();
  const list = [{ id: 'a1', firm: 'Atlas Funding' }];
  assert.equal(t.resolveAccountId('quorum', list), null);
  assert.equal(t.resolveAccountId('atlas', []), null);
  assert.equal(t.resolveAccountId('', list), null);
});

test('resolveAccountId() returns null on an ambiguous partial match across two different accounts - it must ask, never guess', async () => {
  const t = await actionsSandbox();
  const list = [{ id: 'a1', firm: 'Atlas Funding' }, { id: 'a2', firm: 'Atlas Capital' }];
  assert.equal(t.resolveAccountId('atlas', list), null, 'two accounts both contain "atlas" - this must not silently pick the first one');
});

test('resolveAccountId() returns null even on an ambiguous EXACT match (two accounts named identically)', async () => {
  const t = await actionsSandbox();
  const list = [{ id: 'a1', firm: 'IC Markets' }, { id: 'a2', firm: 'IC Markets' }];
  assert.equal(t.resolveAccountId('ic markets', list), null);
});

test('normalizeField() dispatches accountId through resolveAccountId and instrument through uppercasing', async () => {
  const t = await actionsSandbox();
  const lookups = { accounts: [{ id: 'a1', firm: 'Atlas Funding' }] };
  assert.equal(t.normalizeField('accountId', 'Atlas Funding', lookups), 'a1');
  assert.equal(t.normalizeField('accountId', 'nonexistent firm', lookups), null);
  assert.equal(t.normalizeField('instrument', 'xauusd'), 'XAUUSD');
  assert.equal(t.normalizeField('instrument', ''), null);
});
