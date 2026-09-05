import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = file => readFile(shared(file), 'utf8');

const clone = value => JSON.parse(JSON.stringify(value));

async function extractionSandbox() {
  const sandbox = { window: {} };
  vm.runInNewContext(await source('ai-deterministic-extraction.js'), sandbox, { filename: 'ai-deterministic-extraction.js' });
  return sandbox.window.TradeJournalAIDeterministicExtraction;
}

// ---- the exact required Journey C sentences, with ZERO model involvement ----

test('the exact Journey C English sentence deterministically extracts riskPercent: 4, no model dependency', async () => {
  const x = await extractionSandbox();
  const result = x.extractDeterministicFields("I've had two losses, I'm angry, and I want to increase risk to 4%.");
  assert.equal(result.riskPercent, 4);
});

test('the exact Journey C Persian sentence deterministically extracts riskPercent: 4, no model dependency', async () => {
  const x = await extractionSandbox();
  const result = x.extractDeterministicFields('دو تا ضرر کردم و خیلی عصبانی‌ام، ریسک رو بکن ۴ درصد.');
  assert.equal(result.riskPercent, 4);
});

test('Scenario B\'s simpler wording also extracts deterministically', async () => {
  const x = await extractionSandbox();
  assert.equal(x.extractDeterministicFields('Increase risk to 4%.').riskPercent, 4);
  assert.equal(x.extractDeterministicFields('Set risk to 3%.').riskPercent, 3);
  assert.equal(x.extractDeterministicFields('risk 1%').riskPercent, 1);
  assert.equal(x.extractDeterministicFields('4% risk please').riskPercent, 4);
});

// ---- direction ----

test('extracts direction from explicit long/short/buy/sell words, EN + FA', async () => {
  const x = await extractionSandbox();
  assert.equal(x.extractDeterministicFields('I want to take BTC long.').direction, 'long');
  assert.equal(x.extractDeterministicFields('go short on ETH').direction, 'short');
  assert.equal(x.extractDeterministicFields('buy BTC now').direction, 'long');
  assert.equal(x.extractDeterministicFields('sell this').direction, 'short');
  assert.equal(x.extractDeterministicFields('لانگ می‌گیرم').direction, 'long');
  assert.equal(x.extractDeterministicFields('شورت کن').direction, 'short');
});

test('direction is left undetermined (never guessed) when both or neither appear', async () => {
  const x = await extractionSandbox();
  assert.equal(x.extractDeterministicFields('should I long or short this').direction, undefined);
  assert.equal(x.extractDeterministicFields('what is my balance').direction, undefined);
});

// ---- labeled entry/stop/target ----

test('extracts entry/stop/target only when an explicit label sits next to the number', async () => {
  const x = await extractionSandbox();
  const result = x.extractDeterministicFields('entry 66000, stop 65000, target 70000');
  assert.equal(result.entryPrice, 66000);
  assert.equal(result.stopLoss, 65000);
  assert.equal(result.takeProfits, 70000);
});

test('a bare, unlabeled number is never claimed by this module', async () => {
  const x = await extractionSandbox();
  const result = x.extractDeterministicFields('66000');
  assert.equal(result.entryPrice, undefined);
  assert.equal(result.stopLoss, undefined);
  assert.equal(result.takeProfits, undefined);
});

test('recognizes Persian entry/stop/target labels', async () => {
  const x = await extractionSandbox();
  const result = x.extractDeterministicFields('ورود ۶۶۰۰۰ حد ضرر ۶۵۰۰۰ هدف ۷۰۰۰۰');
  assert.equal(result.entryPrice, 66000);
  assert.equal(result.stopLoss, 65000);
  assert.equal(result.takeProfits, 70000);
});

test('recognizes "take profit"/"tp" and "stop loss" as alternate English labels', async () => {
  const x = await extractionSandbox();
  assert.equal(x.extractDeterministicFields('take profit 70000').takeProfits, 70000);
  assert.equal(x.extractDeterministicFields('tp 70000').takeProfits, 70000);
  assert.equal(x.extractDeterministicFields('stop loss 65000').stopLoss, 65000);
});

// ---- timeframes ----

test('extracts a known timeframe token directly', async () => {
  const x = await extractionSandbox();
  assert.equal(x.extractDeterministicFields('use the 15m chart', { domain: 'session' }).timeframe, '15m');
  assert.equal(x.extractDeterministicFields('4h looks good', { domain: 'session' }).timeframe, '4h');
});

test('extracts a natural-language timeframe phrase, EN + FA', async () => {
  const x = await extractionSandbox();
  assert.equal(x.extractDeterministicFields('15 minutes', { domain: 'session' }).timeframe, '15m');
  assert.equal(x.extractDeterministicFields('5 minutes', { domain: 'session' }).timeframe, '5m');
  assert.equal(x.extractDeterministicFields('۱۵ دقیقه', { domain: 'session' }).timeframe, '15m');
});

test('does not claim an unsupported timeframe value', async () => {
  const x = await extractionSandbox();
  assert.equal(x.extractDeterministicFields('37 minutes', { domain: 'session' }).timeframe, undefined);
});

// Found via real Journey E voice testing: a spoken self-correction ("fifteen minutes... no, five
// minutes") was transcribed with digit notation ("15 minutes... no, 5 minutes"), and the
// extractor returned the FIRST value (15m) instead of the LAST, corrected one (5m) - the model's
// own reply correctly said "5m", but the deterministic layer silently overrode it (see
// mergeWithModelFields()'s "deterministic wins" precedence) with the superseded value.
test('a self-correcting message resolves to the LAST stated value, not the first, for every numeric extractor', async () => {
  const x = await extractionSandbox();
  assert.equal(x.extractDeterministicFields('15 minutes, no, 5 minutes', { domain: 'session' }).timeframe, '5m');
  assert.equal(x.extractDeterministicFields('use the 15m chart, actually make that 5m', { domain: 'session' }).timeframe, '5m');
  assert.equal(x.extractDeterministicFields('risk 4%, no wait, risk 2%', { domain: 'trade' }).riskPercent, 2);
  assert.equal(x.extractDeterministicFields('entry 64250, no, entry 64500', { domain: 'trade' }).entryPrice, 64500);
  assert.equal(x.extractDeterministicFields('۱۵ دقیقه، نه، ۵ دقیقه', { domain: 'session' }).timeframe, '5m');
});

// ---- session city names ----

test('extracts known Session city names, EN + FA', async () => {
  const x = await extractionSandbox();
  assert.equal(x.extractDeterministicFields('Start a New York session.', { domain: 'session' }).city, 'New York');
  assert.equal(x.extractDeterministicFields('Start a Tokyo session.', { domain: 'session' }).city, 'Tokyo');
  assert.equal(x.extractDeterministicFields('یک سشن نیویورک شروع کن', { domain: 'session' }).city, 'New York');
});

test('session city/timeframe extraction supports Persian, Arabic and Spanish phrases plus native digits', async () => {
  const x = await extractionSandbox();
  assert.deepEqual(clone(x.extractDeterministicFields('سشن نیویورک روی ۱۵ دقیقه', { domain: 'session' })), {
    timeframe: '15m', city: 'New York'
  });
  assert.deepEqual(clone(x.extractDeterministicFields('افتح جلسة نيويورك على ١٥ دقيقة', { domain: 'session' })), {
    timeframe: '15m', city: 'New York'
  });
  assert.deepEqual(clone(x.extractDeterministicFields('abre una sesión de Nueva York en 15 minutos', { domain: 'session' })), {
    timeframe: '15m', city: 'New York'
  });
});

test('instrument extraction only selects one exact code from the supplied real Instrument Catalog', async () => {
  const x = await extractionSandbox();
  const context = { domain: 'session', instrumentCatalog: [{ code: 'XAUUSD' }, { code: 'BTCUSDT' }] };
  assert.equal(x.extractDeterministicFields('سشن نیویورک برای XAUUSD روی ۱۵ دقیقه باز کن', context).instrument, 'XAUUSD');
  assert.equal(x.extractDeterministicFields('open New York for eurusd on 15m', context).instrument, undefined, 'an absent catalog code must never be invented');
  assert.equal(x.extractDeterministicFields('compare XAUUSD with BTCUSDT', context).instrument, undefined, 'two different catalog matches are ambiguous');
});

test('a self-correcting city mention resolves to the LAST stated city, not whichever comes first in the known-cities list', async () => {
  const x = await extractionSandbox();
  assert.equal(x.extractDeterministicFields('London, no, New York', { domain: 'session' }).city, 'New York');
  assert.equal(x.extractDeterministicFields('New York, actually Tokyo', { domain: 'session' }).city, 'Tokyo');
});

// ---- domain scoping ----

test('domain scoping skips fields outside the given domain', async () => {
  const x = await extractionSandbox();
  const tradeOnly = x.extractDeterministicFields('Start a New York session, risk 1%.', { domain: 'trade' });
  assert.equal(tradeOnly.city, undefined, 'a trade-domain call must not also extract Session fields');
  assert.equal(tradeOnly.riskPercent, 1);
  const sessionOnly = x.extractDeterministicFields('Start a New York session, risk 1%.', { domain: 'session' });
  assert.equal(sessionOnly.riskPercent, undefined, 'a session-domain call must not also extract Trade fields');
  assert.equal(sessionOnly.city, 'New York');
});

test('with no domain hint, both trade and session fields are attempted', async () => {
  const x = await extractionSandbox();
  const result = x.extractDeterministicFields('Start a New York session, risk 1%.');
  assert.equal(result.city, 'New York');
  assert.equal(result.riskPercent, 1);
});

// ---- safety / edge cases ----

test('never throws on empty/missing text', async () => {
  const x = await extractionSandbox();
  assert.deepEqual(clone(x.extractDeterministicFields('')), {});
  assert.deepEqual(clone(x.extractDeterministicFields(null)), {});
  assert.deepEqual(clone(x.extractDeterministicFields(undefined)), {});
});

test('rejects a zero or negative risk value rather than extracting a meaningless number', async () => {
  const x = await extractionSandbox();
  assert.equal(x.extractDeterministicFields('risk 0%').riskPercent, undefined);
});

// ---- merge with model fields ----

test('mergeWithModelFields(): deterministic wins over a model value for the same path', async () => {
  const x = await extractionSandbox();
  const modelFields = [{ path: 'riskPercent', value: '1' }]; // the model declined to update it
  const merged = x.mergeWithModelFields(modelFields, 'Increase risk to 4%.');
  const risk = merged.find((f) => f.path === 'riskPercent');
  assert.equal(risk.value, 4, 'the deterministic, literal reading of the user\'s own words must win');
  assert.equal(risk.source, 'deterministic');
});

test('mergeWithModelFields(): fills in a field the model omitted entirely', async () => {
  const x = await extractionSandbox();
  const modelFields = [{ path: 'direction', value: 'long' }];
  const merged = x.mergeWithModelFields(modelFields, 'Take BTC long, entry 66000, stop 65000, risk 1%.');
  const byPath = {}; merged.forEach((f) => { byPath[f.path] = f.value; });
  assert.equal(byPath.direction, 'long');
  assert.equal(byPath.entryPrice, 66000);
  assert.equal(byPath.stopLoss, 65000);
  assert.equal(byPath.riskPercent, 1);
});

test('mergeWithModelFields(): never removes a model-supplied field this module cannot itself recognize', async () => {
  const x = await extractionSandbox();
  const modelFields = [{ path: 'linkedStrategyId', value: 'Conservative Scalper' }];
  const merged = x.mergeWithModelFields(modelFields, 'link my Conservative Scalper strategy');
  assert.deepEqual(clone(merged), [{ path: 'linkedStrategyId', value: 'Conservative Scalper' }]);
});

test('mergeWithModelFields(): with nothing extracted deterministically and no model fields, returns an empty array', async () => {
  const x = await extractionSandbox();
  assert.deepEqual(clone(x.mergeWithModelFields([], 'what is my balance')), []);
});
