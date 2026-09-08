import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Voice Command Learning Profile addendum, section 9: verifies the source file itself is valid
// UTF-8 (never silently corrupted/mojibake at the byte level) and that representative new Persian/
// Arabic strings decode to their real Unicode script ranges - determining whether a rendering
// artifact seen elsewhere in this session was only a terminal/font limitation or genuine source
// corruption. A file with even one invalid UTF-8 byte sequence gets silently rewritten with U+FFFD
// (the replacement character) by Buffer.toString('utf8') - re-encoding that result and comparing
// byte-for-byte against the original raw bytes is the real, mechanical test for that, not a guess.

const root = process.cwd();
const i18nPath = path.join(root, 'public', 'pages', 'shared', 'ai-i18n.js');

test('ai-i18n.js is byte-for-byte valid UTF-8 - decoding then re-encoding produces the exact original bytes, proving no invalid sequence was silently replaced', async () => {
  const raw = await readFile(i18nPath);
  const decoded = raw.toString('utf8');
  const reEncoded = Buffer.from(decoded, 'utf8');
  assert.ok(raw.equals(reEncoded), 'ai-i18n.js contains at least one invalid UTF-8 byte sequence - real source corruption, not merely a terminal/font rendering limitation');
});

test('new Persian strings added by this addendum decode to real Persian/Arabic-script Unicode code points (U+0600-U+06FF / U+FB50-U+FDFF / U+FE70-U+FEFF), never mojibake replacement characters', async () => {
  const source = await readFile(i18nPath, 'utf8');
  const samples = [
    'دستورهای یادگرفته‌شده', // Learned Commands (Persian)
    'یادت باشه', // "remember this" (Persian)
    'باشه - دوباره همون کارو انجام دادم.' // repeat-action reply (Persian)
  ];
  samples.forEach((sample) => {
    assert.ok(source.includes(sample), 'expected Persian sample not found verbatim in ai-i18n.js: ' + sample);
    assert.ok(!/�/.test(sample), 'sample itself contains a Unicode replacement character - already corrupted in this test file');
    const hasArabicScript = /[؀-ۿﭐ-﷿ﹰ-﻿]/.test(sample);
    assert.ok(hasArabicScript, 'sample does not contain any real Arabic/Persian-script code point: ' + sample);
  });
});

test('new Arabic strings added by this addendum decode to real Arabic-script Unicode code points, never mojibake', async () => {
  const source = await readFile(i18nPath, 'utf8');
  const samples = ['الأوامر المتعلمة', 'تذكر هذا', 'تم - فعلت ذلك مرة أخرى.'];
  samples.forEach((sample) => {
    assert.ok(source.includes(sample), 'expected Arabic sample not found verbatim in ai-i18n.js: ' + sample);
    assert.ok(/[؀-ۿﭐ-﷿ﹰ-﻿]/.test(sample), 'sample does not contain any real Arabic-script code point: ' + sample);
  });
});

test('every one of this addendum\'s own new i18n keys is present in all four languages it claims to support (aiChatFeedback*, aiLearnedCommand*, aiRepeatAction*, aiWorkflowFinishing-adjacent) - a real parity check, not just "the file parses"', async () => {
  const source = await readFile(i18nPath, 'utf8');
  const blockBounds = [
    { lang: 'fa', start: source.indexOf('fa: {'), end: source.indexOf('ar: {') },
    { lang: 'ar', start: source.indexOf('ar: {'), end: source.indexOf('en: {') },
    { lang: 'en', start: source.indexOf('en: {'), end: source.indexOf('es: {') },
    { lang: 'es', start: source.indexOf('es: {'), end: source.length }
  ];
  const keysToCheck = [
    'aiChatFeedbackPrompt', 'aiChatFeedbackCorrect', 'aiChatFeedbackWrongAction', 'aiChatFeedbackWrongTargetValue', 'aiChatFeedbackRememberThis', 'aiChatFeedbackDismiss',
    'aiLearnedCommandApplied', 'aiLearnedCommandTaught', 'aiLearnedCommandReinforced', 'aiLearnedCommandForgotten', 'aiLearnedCommandDisabled', 'aiLearnedCommandCorrectionNoted',
    'aiRepeatActionApplied', 'aiRepeatActionStarted'
  ];
  blockBounds.forEach(({ lang, start, end }) => {
    assert.ok(start > -1, lang + ' block not found');
    const block = source.slice(start, end);
    keysToCheck.forEach((key) => assert.match(block, new RegExp(key + ':'), lang + ' is missing key ' + key));
  });
});
