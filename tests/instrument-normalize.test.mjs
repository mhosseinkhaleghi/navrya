import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { normalizeInstrumentCode, normalizeInstrumentCodes } from '../server/db/instrument-normalize.mjs';

// Instrument Catalog domain: one normalization spec (trim -> strip internal whitespace ->
// uppercase -> validate; deterministic; never expands an alias), implemented twice - the real
// server module (imported directly) and the classic-script client copy (loaded into a vm sandbox,
// the same convention every other client-only file in this suite already uses). Both must agree.

const root = process.cwd();
const clientSource = await readFile(path.join(root, 'public', 'pages', 'shared', 'instrument-catalog.types.js'), 'utf8');

function clientTypes() {
  const sandbox = { window: {} };
  vm.runInNewContext(clientSource, sandbox, { filename: 'instrument-catalog.types.js' });
  return sandbox.window.TradeJournalInstrumentCatalogTypes;
}

test('server normalizeInstrumentCode() trims, strips internal whitespace, and uppercases', () => {
  assert.equal(normalizeInstrumentCode('  xauusd  '), 'XAUUSD');
  assert.equal(normalizeInstrumentCode('btc usdt'), 'BTCUSDT');
  assert.equal(normalizeInstrumentCode('Nas100'), 'NAS100');
});

test('server normalizeInstrumentCode() rejects empty/whitespace-only input', () => {
  assert.equal(normalizeInstrumentCode(''), null);
  assert.equal(normalizeInstrumentCode('   '), null);
  assert.equal(normalizeInstrumentCode(null), null);
  assert.equal(normalizeInstrumentCode(undefined), null);
});

test('server normalizeInstrumentCode() rejects a single character and an over-long code, deterministically', () => {
  assert.equal(normalizeInstrumentCode('X'), null, 'below the 2-character minimum');
  assert.equal(normalizeInstrumentCode('X'.repeat(20)), 'X'.repeat(20), 'exactly at the 20-character maximum');
  assert.equal(normalizeInstrumentCode('X'.repeat(21)), null, 'over the 20-character maximum');
});

test('server normalizeInstrumentCode() allows internal separators but not a leading/trailing one', () => {
  assert.equal(normalizeInstrumentCode('BTC-USD'), 'BTC-USD');
  assert.equal(normalizeInstrumentCode('BTC.USD'), 'BTC.USD');
  assert.equal(normalizeInstrumentCode('-BTCUSD'), null);
  assert.equal(normalizeInstrumentCode('BTCUSD-'), null);
});

test('server normalizeInstrumentCode() never expands an alias - "BTC" stays "BTC", never becomes "BTCUSDT"', () => {
  assert.equal(normalizeInstrumentCode('btc'), 'BTC');
  assert.equal(normalizeInstrumentCode('gold'), 'GOLD');
});

test('server normalizeInstrumentCodes() dedupes after normalization and drops invalid entries, preserving first-seen order', () => {
  assert.deepEqual(normalizeInstrumentCodes(['xauusd', 'XAUUSD', ' btcusdt ', '', '   ', 'btcusdt']), ['XAUUSD', 'BTCUSDT']);
  assert.deepEqual(normalizeInstrumentCodes(null), []);
  assert.deepEqual(normalizeInstrumentCodes('not-an-array'), []);
});

test('client normalizeCode() matches the server algorithm exactly', () => {
  const types = clientTypes();
  assert.equal(types.normalizeCode('  xauusd  '), 'XAUUSD');
  assert.equal(types.normalizeCode('btc usdt'), 'BTCUSDT');
  assert.equal(types.normalizeCode(''), null);
  assert.equal(types.normalizeCode('X'), null);
  assert.equal(types.normalizeCode('X'.repeat(20)), 'X'.repeat(20));
  assert.equal(types.normalizeCode('X'.repeat(21)), null);
  assert.equal(types.normalizeCode('-BTCUSD'), null);
});

test('client isValidCode() agrees with normalizeCode() returning non-null', () => {
  const types = clientTypes();
  assert.equal(types.isValidCode('XAUUSD'), true);
  assert.equal(types.isValidCode(''), false);
  assert.equal(types.isValidCode('X'), false);
});
