import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Source-level contract for the checkout urgency UI in navrya-src/accountProfileView.jsx (the canonical source; the
// generated navrya-*-sessions-app.js bundles are never read here): a reverse countdown (days : hours : minutes :
// seconds) for a time-limited code, and a LIVE remaining-uses count for a usage-limited code. This codebase's
// node:test harness does not render JSX, so - like discount-checkout-ui-static.test.mjs - these are structural
// assertions. Sources are normalized to LF first: the working tree is CRLF (autocrlf).
//
// Everything shown is what the SERVER reports (quote + the status poll); the client only formats and animates it.

const root = process.cwd();
const read = async (...parts) => (await readFile(path.join(root, ...parts), 'utf8')).replace(/\r\n/g, '\n');

function functionSource(src, name) {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start > -1, 'function ' + name + ' must exist');
  const end = src.indexOf('\n}\n', start);
  assert.ok(end > start, 'function ' + name + ' must be a top-level function');
  return src.slice(start, end + 3);
}
function langBlock(src, marker, nextMarkers) {
  const start = src.indexOf(marker);
  assert.ok(start > -1, 'language block "' + marker.trim() + '" must exist');
  let end = src.length;
  nextMarkers.forEach((next) => { const idx = src.indexOf(next, start + marker.length); if (idx > -1 && idx < end) end = idx; });
  return src.slice(start, end);
}
function valueOf(block, key) {
  const match = new RegExp('\\b' + key + ':\\s*(?:\'((?:[^\'\\\\]|\\\\.)*)\'|"((?:[^"\\\\]|\\\\.)*)")').exec(block);
  return match ? (match[1] !== undefined ? match[1] : match[2]) : null;
}
const ARABIC_SCRIPT = /[؀-ۿ]/;

const NEW_KEYS = [
  'subPayUrgencyEndsIn', 'subPayUnitDay', 'subPayUnitHour', 'subPayUnitMinute', 'subPayUnitSecond',
  'subPayUrgencyLeft', 'subPayUrgencyLastOne', 'subPayUrgencyLive'
];

test('every new urgency string exists in fa, en, ar and es; fa/ar are real Arabic-script text; {count} survives translation', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  const markers = ['\n  fa: {', '\n  en: {', '\n  ar: {', '\n  es: {'];
  const [fa, en, ar, es] = markers.map((marker, i) => langBlock(src, marker, markers.slice(i + 1).concat(['\n};'])));
  NEW_KEYS.forEach((key) => {
    for (const [label, block] of [['fa', fa], ['en', en], ['ar', ar], ['es', es]]) {
      const value = valueOf(block, key);
      assert.ok(value && value.trim(), label + ' is missing "' + key + '"');
    }
    assert.match(valueOf(fa, key), ARABIC_SCRIPT, 'fa "' + key + '" must be Persian text');
    assert.match(valueOf(ar, key), ARABIC_SCRIPT, 'ar "' + key + '" must be Arabic text');
  });
  const placeholders = (block) => (valueOf(block, 'subPayUrgencyLeft').match(/\{\w+\}/g) || []).sort();
  assert.deepEqual(placeholders(en), ['{count}']);
  for (const [label, block] of [['fa', fa], ['ar', ar], ['es', es]]) assert.deepEqual(placeholders(block), ['{count}'], label + ' must keep {count}');
});

test('the removal messages REUSE the existing apply-time error strings (expired / exhausted / invalid) instead of inventing duplicates', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  const sheet = functionSource(src, 'PaymentSheet');
  ['subDiscountErrExpired', 'subDiscountErrExhausted', 'subDiscountErrInvalid'].forEach((key) => assert.match(sheet, new RegExp(key), 'PaymentSheet must use ' + key));
});

test('the live poll targets the dedicated status endpoint by codeId - never the rate-limited quote endpoint - at a bounded interval', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  const sheet = functionSource(src, 'PaymentSheet');
  assert.match(sheet, /\/api\/sync\/subscriptions\/discount-codes\/['"`]\s*\+\s*encodeURIComponent\(\w*\.?codeId\)\s*\+\s*['"`]\/status|\/api\/sync\/subscriptions\/discount-codes\/\$\{encodeURIComponent\(/, 'polls .../discount-codes/<codeId>/status');
  const interval = /const URGENCY_POLL_MS\s*=\s*(\d+)/.exec(src);
  assert.ok(interval, 'the poll interval is one named constant');
  assert.ok(Number(interval[1]) >= 3000 && Number(interval[1]) <= 15000, 'poll interval must stay between 3s and 15s (server budget is 30/min per user)');
  const effect = sheet.slice(sheet.indexOf('setInterval'), sheet.indexOf('setInterval') + 900);
  assert.doesNotMatch(effect, /subscriptions\/quote/, 'the interval must never call the quote endpoint (its 20/10min budget is for code guessing)');
});

test('polling is gentle and safe: only on the review step with a limited code, paused while the tab is hidden, and never while the payment is being submitted', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  const sheet = functionSource(src, 'PaymentSheet');
  const effectStart = sheet.indexOf('URGENCY_POLL_MS');
  assert.ok(effectStart > -1, 'PaymentSheet uses the poll interval');
  const effect = sheet.slice(effectStart - 900, effectStart + 1400);
  assert.match(effect, /step\s*!==\s*1|step\s*===\s*1/, 'only while the review step is showing');
  assert.match(effect, /submitting/, 'never while submitting - the user\'s own reservation would otherwise look like the code running out');
  assert.match(effect, /document\.hidden/, 'paused while the tab is hidden');
  assert.match(effect, /clearInterval/, 'the interval is always cleaned up');
  assert.match(effect, /cancelled|aborted|ignore/i, 'a response that arrives after cleanup is ignored');
});

test('the code is removed with a clear reason when the SERVER says it is no longer usable; a local clock reaching zero only triggers a server check', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  const sheet = functionSource(src, 'PaymentSheet');
  assert.match(sheet, /function expireQuote\(/, 'one removal helper that keeps the reason visible (clearCode would wipe it)');
  assert.match(sheet, /status\s*===\s*'expired'|'expired'/);
  assert.match(sheet, /status\s*===\s*'exhausted'|'exhausted'/);
  const helper = sheet.slice(sheet.indexOf('function expireQuote('), sheet.indexOf('function expireQuote(') + 500);
  assert.match(helper, /setQuote\(null\)/);
  assert.match(helper, /setCodeError\(/);
  assert.match(sheet, /verifyWithServer|checkStatusNow/, 'a countdown that hits zero asks the server before removing anything (a wrong device clock must never strip a valid code)');
});

test('the countdown shows days, hours, minutes and seconds, ticks each second, and is corrected by the server clock', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  const countdown = functionSource(src, 'DiscountCountdown');
  ['subPayUnitDay', 'subPayUnitHour', 'subPayUnitMinute', 'subPayUnitSecond', 'subPayUrgencyEndsIn'].forEach((key) => assert.match(countdown, new RegExp(key), 'countdown must render ' + key));
  assert.match(countdown, /setInterval\([\s\S]*?,\s*1000\)/, 'ticks once per second');
  assert.match(countdown, /clearInterval/);
  assert.match(countdown, /offsetMs/, 'uses a server-clock offset so a wrong device clock cannot mis-time the discount');
  assert.match(countdown, /Math\.floor\([^)]*86400/, 'days are derived from the remaining seconds');
  assert.match(countdown, /padStart\(2/, 'two-digit boxes');
  assert.match(countdown, /dir="ltr"/, 'digits always read left-to-right, like every other numeric display in this file');
  assert.match(countdown, /key=\{/, 'a changed digit remounts its box so the tick animation replays');
});

test('the remaining-uses display is live: pulsing LIVE dot, animated number, a floating "-N" when it drops, a depleting bar, and a special last-one message', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  const live = functionSource(src, 'DiscountLiveRemaining');
  ['subPayUrgencyLive', 'subPayUrgencyLeft', 'subPayUrgencyLastOne'].forEach((key) => assert.match(live, new RegExp(key), key));
  assert.match(live, /nv-urgency-pop/, 'the number pops when it changes');
  assert.match(live, /nv-urgency-float/, 'a floating "-N" appears when capacity drops');
  assert.match(live, /nv-urgency-live/, 'a pulsing live indicator');
  assert.match(live, /transition:\s*'width/, 'the bar depletes smoothly');
  assert.match(live, /key=\{/);
  assert.match(live, /remaining\s*===\s*1/, 'the last slot gets its own message');
});

test('the motion is injected ONCE (idempotent style tag), uses transform/opacity only, and honours prefers-reduced-motion', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  assert.match(src, /getElementById\('nv-discount-urgency-motion'\)/, 'inject-once guard, same convention as the other motion hooks in this app');
  const css = /const DISCOUNT_URGENCY_MOTION_CSS = `([\s\S]*?)`;/.exec(src);
  assert.ok(css, 'the keyframes live in one named constant');
  ['nv-urgency-enter', 'nv-urgency-glow', 'nv-urgency-tick', 'nv-urgency-pop', 'nv-urgency-float', 'nv-urgency-live', 'nv-urgency-colon'].forEach((name) => {
    assert.match(css[1], new RegExp('@keyframes ' + name + '\\b'), 'missing @keyframes ' + name);
  });
  assert.match(css[1], /@media \(prefers-reduced-motion:\s*reduce\)/, 'motion must be switchable off');
  assert.doesNotMatch(css[1], /\b(margin|padding|left|right|width|height|top|bottom)\s*:/i, 'keyframes animate transform/opacity/shadow only - never layout');
});

test('the urgency panel appears under the applied-code chip only for a limited code, and every new component uses logical CSS (RTL-safe)', async () => {
  const src = await read('navrya-src', 'accountProfileView.jsx');
  const sheet = functionSource(src, 'PaymentSheet');
  assert.match(sheet, /<DiscountCountdown\b/);
  assert.match(sheet, /<DiscountLiveRemaining\b/);
  assert.match(sheet, /data-nv-urgency/, 'the panel is tagged so reduced-motion can switch every animation off');
  for (const name of ['DiscountCountdown', 'DiscountLiveRemaining']) {
    assert.doesNotMatch(functionSource(src, name), /marginLeft|marginRight|paddingLeft|paddingRight|textAlign: '(left|right)'/, name + ': logical CSS only');
  }
  assert.doesNotMatch(sheet, /marginLeft|marginRight|paddingLeft|paddingRight|textAlign: '(left|right)'/, 'PaymentSheet: logical CSS only');
});
