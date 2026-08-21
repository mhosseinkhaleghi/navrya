import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = file => readFile(shared(file), 'utf8');

async function voiceTextSandbox() {
  const sandbox = { window: {} };
  vm.runInNewContext(await source('ai-voice-text.js'), sandbox, { filename: 'ai-voice-text.js' });
  return sandbox.window.TradeJournalAIVoiceText;
}

// ---- Persian Voice Quality gate, section 14: exact number-preservation regression cases ----
// "The spoken form must round-trip conceptually to the same value. Never 0.5% -> five percent.
// Never round a trading price to sound nicer. If exact spoken normalization is uncertain, leave
// the precise representation alone - correctness beats naturalness."

test('percent: 0.5% -> نیم درصد (never "five percent", never dropped)', async () => {
  const v = await voiceTextSandbox();
  assert.equal(v.normalizeNumbersForSpeech('ریسک این معامله 0.5% است.', 'fa'), 'ریسک این معامله نیم درصد است.');
});

test('percent: 1% -> یک درصد', async () => {
  const v = await voiceTextSandbox();
  assert.equal(v.normalizeNumbersForSpeech('ریسک 1% شد.', 'fa'), 'ریسک یک درصد شد.');
});

test('percent: 1.25% -> یک و ربع درصد', async () => {
  const v = await voiceTextSandbox();
  assert.equal(v.normalizeNumbersForSpeech('1.25%', 'fa'), 'یک و ربع درصد');
});

test('percent: 0.05% has no safe unambiguous word form - left exactly as written, not corrupted', async () => {
  const v = await voiceTextSandbox();
  assert.equal(v.normalizeNumbersForSpeech('0.05%', 'fa'), '0.05%');
});

test('bare 0.5/0.05/1.5 with no percent marker are never touched (not prices, not safe percents)', async () => {
  const v = await voiceTextSandbox();
  assert.equal(v.normalizeNumbersForSpeech('0.5', 'fa'), '0.5');
  assert.equal(v.normalizeNumbersForSpeech('0.05', 'fa'), '0.05');
  assert.equal(v.normalizeNumbersForSpeech('1.5', 'fa'), '1.5');
});

test('price: 65,500 -> شصت و پنج هزار و پانصد (exact directive example, standard not colloquial پانصد)', async () => {
  const v = await voiceTextSandbox();
  assert.equal(v.normalizeNumbersForSpeech('قیمت خروج 65,500 بود.', 'fa'), 'قیمت خروج شصت و پنج هزار و پانصد بود.');
});

test('price: 65,420 -> شصت و پنج هزار و چهارصد و بیست (self-correction example)', async () => {
  const v = await voiceTextSandbox();
  assert.equal(v.normalizeNumbersForSpeech('65,420', 'fa'), 'شصت و پنج هزار و چهارصد و بیست');
});

test('price: bare 64250 (no commas) -> شصت و چهار هزار و دویست و پنجاه', async () => {
  const v = await voiceTextSandbox();
  assert.equal(v.normalizeNumbersForSpeech('64250', 'fa'), 'شصت و چهار هزار و دویست و پنجاه');
});

test('price: 66000 -> شصت و شش هزار (no dangling "و صفر")', async () => {
  const v = await voiceTextSandbox();
  assert.equal(v.normalizeNumbersForSpeech('66000', 'fa'), 'شصت و شش هزار');
});

test('decimal price: 64250.75 is left FULLY untouched - both the integer and fractional parts - never spelling out only half of it', async () => {
  const v = await voiceTextSandbox();
  assert.equal(v.normalizeNumbersForSpeech('64250.75', 'fa'), '64250.75');
});

test('timeframes: the closed TIMEFRAME_TOKENS enum converts exactly, nothing else does', async () => {
  const v = await voiceTextSandbox();
  assert.equal(v.normalizeNumbersForSpeech('5m', 'fa'), 'پنج دقیقه');
  assert.equal(v.normalizeNumbersForSpeech('15m', 'fa'), 'پانزده دقیقه');
  assert.equal(v.normalizeNumbersForSpeech('1h', 'fa'), 'یک ساعت');
  assert.equal(v.normalizeNumbersForSpeech('4h', 'fa'), 'چهار ساعت');
  assert.equal(v.normalizeNumbersForSpeech('1D', 'fa'), 'یک روز');
});

test('ratio: 1:2 -> یک به دو', async () => {
  const v = await voiceTextSandbox();
  assert.equal(v.normalizeNumbersForSpeech('1:2', 'fa'), 'یک به دو');
});

test('ratio: 1:3.5 -> یک به سه و نیم (the one safe fractional ratio shape)', async () => {
  const v = await voiceTextSandbox();
  assert.equal(v.normalizeNumbersForSpeech('1:3.5', 'fa'), 'یک به سه و نیم');
});

test('Persian-indic digits are read the same as ASCII digits before conversion', async () => {
  const v = await voiceTextSandbox();
  assert.equal(v.normalizeNumbersForSpeech('۶۵۵۰۰', 'fa'), 'شصت و پنج هزار و پانصد');
});

// ---- section 32/33: EN/AR/ES must be completely unaffected by number normalization ----

test('normalizeNumbersForSpeech is a no-op for EN/AR/ES - no regression to non-Persian languages', async () => {
  const v = await voiceTextSandbox();
  const text = 'Exit price 65,500, risk 0.5%, 5m.';
  assert.equal(v.normalizeNumbersForSpeech(text, 'en'), text);
  assert.equal(v.normalizeNumbersForSpeech(text, 'ar'), text);
  assert.equal(v.normalizeNumbersForSpeech(text, 'es'), text);
});

// ---- section 21: markup must never reach the TTS engine literally ----

test('stripMarkupForSpeech removes bold/headers/bullets/backticks/links/urls/braces', async () => {
  const v = await voiceTextSandbox();
  const raw = '# Header\n**ریسک: 0.5%** شد.\n- نکته اول\n`code` and [text](https://example.com) plus {"a":1}';
  const out = v.stripMarkupForSpeech(raw);
  assert.ok(!/[#*`{}[\]]/.test(out), 'no markdown/JSON punctuation should survive: ' + out);
  assert.ok(!/https?:\/\//.test(out), 'no raw URL should survive: ' + out);
  assert.ok(out.includes('ریسک: 0.5%'));
  assert.ok(out.includes('نکته اول'));
});

// ---- section 16: pronunciation map, deliberately short ----

test('pronunciation map substitutes BTC/ETH for Persian only, leaves everything else alone', async () => {
  const v = await voiceTextSandbox();
  assert.equal(v.applyPronunciationMap('BTC رو بررسی کن.', 'fa'), 'بیت‌کوین رو بررسی کن.');
  assert.equal(v.applyPronunciationMap('ETH هم همینطور.', 'fa'), 'اتریوم هم همینطور.');
  assert.equal(v.applyPronunciationMap('New York session with OpenAI.', 'fa'), 'New York session with OpenAI.');
  assert.equal(v.applyPronunciationMap('BTC check.', 'en'), 'BTC check.');
});

// ---- toSpokenText() composes all three passes in order ----

test('toSpokenText strips markup and normalizes numbers together for Persian', async () => {
  const v = await voiceTextSandbox();
  const out = v.toSpokenText('**ریسکت شد 0.5%.**', 'fa');
  assert.equal(out, 'ریسکت شد نیم درصد.');
});

test('toSpokenText only strips markup (no number changes) for English', async () => {
  const v = await voiceTextSandbox();
  const out = v.toSpokenText('**Risk is 0.5%.**', 'en');
  assert.equal(out, 'Risk is 0.5%.');
});

// ---- section 22/23: context-aware deterministic acknowledgements, Persian only for now ----

test('spokenSlotFilled gives field-aware Persian phrasing, composes with number normalization downstream', async () => {
  const v = await voiceTextSandbox();
  assert.equal(v.toSpokenText(v.spokenSlotFilled('timeframe', '5m', 'fa'), 'fa'), 'اوکی، شد پنج دقیقه.');
  assert.equal(v.toSpokenText(v.spokenSlotFilled('defaultRiskPercent', '0.5', 'fa'), 'fa'), 'ریسکت شد نیم درصد.');
  assert.equal(v.toSpokenText(v.spokenSlotFilled('exitPrice', '65500', 'fa'), 'fa'), 'قیمت خروج شد شصت و پنج هزار و پانصد.');
});

test('spokenSlotFilled returns null for an unmapped field or a non-Persian language - caller falls back to the existing generic reply, zero regression', async () => {
  const v = await voiceTextSandbox();
  assert.equal(v.spokenSlotFilled('someUnmappedField', '3', 'fa'), null);
  assert.equal(v.spokenSlotFilled('timeframe', '5m', 'en'), null);
  assert.equal(v.spokenSlotFilled('timeframe', '5m', 'ar'), null);
  assert.equal(v.spokenSlotFilled('timeframe', '5m', 'es'), null);
});

test('spokenConfirmation gives the directive\'s own natural Persian phrasing for cancel/accept, null elsewhere', async () => {
  const v = await voiceTextSandbox();
  assert.equal(v.spokenConfirmation('cancelled', 'fa'), 'باشه، لغوش کردم.');
  assert.equal(v.spokenConfirmation('accepted', 'fa'), 'باشه، تأیید شد.');
  assert.equal(v.spokenConfirmation('cancelled', 'en'), null);
});

// ---- faIntegerToWords: direct unit coverage of the underlying converter ----

test('faIntegerToWords covers zero, teens, and round thousands cleanly', async () => {
  const v = await voiceTextSandbox();
  assert.equal(v.faIntegerToWords(0), 'صفر');
  assert.equal(v.faIntegerToWords(15), 'پانزده');
  assert.equal(v.faIntegerToWords(1000), 'هزار');
  assert.equal(v.faIntegerToWords(63700), 'شصت و سه هزار و هفتصد');
});
