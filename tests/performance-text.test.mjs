import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  SUPPORTED_AUDIO_TAGS, stripPerformanceTags, supportsExpressiveAudioTags,
  validatePerformanceText, effectiveVoiceText, responseSetFor, effectiveVoiceTextFor
} from '../server/community/performance-text.mjs';

// Journey H2 expressive-dialogue follow-up. validatePerformanceText/effectiveVoiceText both need
// the REAL shared matcher's own normalize() (FA/EN/AR/ES-aware) - loaded here exactly the way
// server/community/conversation-matcher-bridge.mjs does, so these tests exercise the real
// normalization this feature actually depends on, not a stand-in.
const root = process.cwd();
async function realMatcher() {
  const source = await readFile(path.join(root, 'public', 'pages', 'shared', 'ai-conversation-matcher.js'), 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { filename: 'ai-conversation-matcher.js' });
  return sandbox.window.TradeJournalAIConversationMatcher;
}

test('SUPPORTED_AUDIO_TAGS is a small, conversational-delivery set - never a sound-effect vocabulary', () => {
  assert.ok(SUPPORTED_AUDIO_TAGS.includes('curious'));
  assert.ok(SUPPORTED_AUDIO_TAGS.includes('short pause'));
  assert.ok(!SUPPORTED_AUDIO_TAGS.some((tag) => /gunshot|music|applause|explosion/i.test(tag)));
});

test('stripPerformanceTags removes every recognized [tag], reports what it found, and leaves an unrecognized tag both in place and flagged invalid', () => {
  const recognized = stripPerformanceTags('[curious] hello [short pause] world');
  assert.equal(recognized.strippedText.replace(/\s+/g, ' ').trim(), 'hello world');
  assert.deepEqual(recognized.tagsUsed, ['curious', 'short pause']);
  assert.deepEqual(recognized.invalidTags, []);

  const unrecognized = stripPerformanceTags('[gunshot] hello');
  assert.deepEqual(unrecognized.invalidTags, ['gunshot']);
  assert.match(unrecognized.strippedText, /\[gunshot\]/, 'an unrecognized tag is never silently stripped - the whole text must be treated as invalid, not partially cleaned');
});

test('stripPerformanceTags is case-insensitive on tag names', () => {
  const result = stripPerformanceTags('[CURIOUS] hi');
  assert.deepEqual(result.tagsUsed, ['curious']);
  assert.deepEqual(result.invalidTags, []);
});

test('supportsExpressiveAudioTags recognizes eleven_v3 (and future dated variants) but not a v2 model', () => {
  assert.equal(supportsExpressiveAudioTags('eleven_v3'), true);
  assert.equal(supportsExpressiveAudioTags('eleven_v3_alpha'), true);
  assert.equal(supportsExpressiveAudioTags('eleven_multilingual_v2'), false);
  assert.equal(supportsExpressiveAudioTags('eleven_turbo_v2_5'), false);
  assert.equal(supportsExpressiveAudioTags(''), false);
  assert.equal(supportsExpressiveAudioTags(null), false);
});

test('validatePerformanceText: a performanceText that only adds supported tags and punctuation to the exact canonical dialogue is valid', async () => {
  const matcher = await realMatcher();
  const result = validatePerformanceText(matcher, {
    performanceText: '[curious] A Session is where you watch the chart, track market movement... [short pause] before you ever place a trade.',
    canonicalSpokenText: 'A Session is where you watch the chart, track market movement before you ever place a trade.'
  });
  assert.equal(result.valid, true);
});

test('validatePerformanceText: any added, removed, or reordered word is rejected - the enhancer must never invent dialogue', async () => {
  const matcher = await realMatcher();
  const addedWord = validatePerformanceText(matcher, {
    performanceText: '[curious] A Session is where you watch the chart and also learn to code.',
    canonicalSpokenText: 'A Session is where you watch the chart.'
  });
  assert.equal(addedWord.valid, false);
  assert.equal(addedWord.reason, 'DIALOGUE_CHANGED');

  const droppedWord = validatePerformanceText(matcher, {
    performanceText: '[curious] A Session is where you watch.',
    canonicalSpokenText: 'A Session is where you watch the chart.'
  });
  assert.equal(droppedWord.valid, false);
  assert.equal(droppedWord.reason, 'DIALOGUE_CHANGED');

  const reordered = validatePerformanceText(matcher, {
    performanceText: 'the chart you watch is where A Session.',
    canonicalSpokenText: 'A Session is where you watch the chart.'
  });
  assert.equal(reordered.valid, false);
  assert.equal(reordered.reason, 'DIALOGUE_CHANGED');
});

test('validatePerformanceText: an unrecognized tag is rejected outright, never silently spoken as a literal word', async () => {
  const matcher = await realMatcher();
  const result = validatePerformanceText(matcher, {
    performanceText: '[gunshot] A Session is where you watch the chart.',
    canonicalSpokenText: 'A Session is where you watch the chart.'
  });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'UNSUPPORTED_TAG');
  assert.deepEqual(result.invalidTags, ['gunshot']);
});

test('validatePerformanceText: empty performanceText or missing canonical text are both rejected, never treated as "valid but empty"', async () => {
  const matcher = await realMatcher();
  assert.equal(validatePerformanceText(matcher, { performanceText: '', canonicalSpokenText: 'hello' }).reason, 'EMPTY');
  assert.equal(validatePerformanceText(matcher, { performanceText: '[curious] hello', canonicalSpokenText: '' }).reason, 'NO_CANONICAL_TEXT');
});

test('validatePerformanceText: Persian - normalize() folding (ZWNJ, digits, punctuation) still allows a valid enhancement while catching a real change', async () => {
  const matcher = await realMatcher();
  const valid = validatePerformanceText(matcher, {
    performanceText: '[curious] سشن یعنی همون فضایی که... [short pause] قبل از ورود به معامله، چارت رو می‌بینی.',
    canonicalSpokenText: 'سشن یعنی همون فضایی که قبل از ورود به معامله، چارت رو می‌بینی.'
  });
  assert.equal(valid.valid, true);
  const changed = validatePerformanceText(matcher, {
    performanceText: '[curious] سشن یعنی همون فضایی که قبل از ورود به معامله، حتما باید بخری.',
    canonicalSpokenText: 'سشن یعنی همون فضایی که قبل از ورود به معامله، چارت رو می‌بینی.'
  });
  assert.equal(changed.valid, false);
  assert.equal(changed.reason, 'DIALOGUE_CHANGED');
});

test('effectiveVoiceText: prefers a valid performanceText only when the model supports tags, falls back to canonical text otherwise (missing, invalid, or unsupported model) - a scenario must never break', async () => {
  const matcher = await realMatcher();
  const canonicalSpokenText = 'A Session is where you watch the chart.';
  const validPerformance = '[curious] A Session is where you watch the chart.';

  const supported = effectiveVoiceText(matcher, { performanceText: validPerformance, canonicalSpokenText, modelId: 'eleven_v3' });
  assert.deepEqual(supported, { text: validPerformance, usedPerformanceText: true });

  const unsupportedModel = effectiveVoiceText(matcher, { performanceText: validPerformance, canonicalSpokenText, modelId: 'eleven_multilingual_v2' });
  assert.deepEqual(unsupportedModel, { text: canonicalSpokenText, usedPerformanceText: false });

  const invalidTag = effectiveVoiceText(matcher, { performanceText: '[gunshot] A Session is where you watch the chart.', canonicalSpokenText, modelId: 'eleven_v3' });
  assert.deepEqual(invalidTag, { text: canonicalSpokenText, usedPerformanceText: false });

  const missing = effectiveVoiceText(matcher, { performanceText: null, canonicalSpokenText, modelId: 'eleven_v3' });
  assert.deepEqual(missing, { text: canonicalSpokenText, usedPerformanceText: false });
});

test('responseSetFor: variantKey standard/undefined always resolves the flat responses[language] shape - every scenario published before this gate is unaffected', () => {
  const definition = { responses: { en: { written: 'W', voiceReply: 'V' } }, variants: { en: [{ key: 'FIRST_TIME', written: 'first' }] } };
  assert.deepEqual(responseSetFor(definition, 'en', undefined), { written: 'W', voiceReply: 'V' });
  assert.deepEqual(responseSetFor(definition, 'en', 'standard'), { written: 'W', voiceReply: 'V' });
});

test('responseSetFor: a real variant key resolves that exact authored variant, never STANDARD, and a stale/renamed key gracefully degrades to STANDARD rather than throwing', () => {
  const definition = { responses: { en: { written: 'W' } }, variants: { en: [{ key: 'FIRST_TIME', written: 'first-time text' }] } };
  assert.deepEqual(responseSetFor(definition, 'en', 'FIRST_TIME'), { key: 'FIRST_TIME', written: 'first-time text' });
  assert.deepEqual(responseSetFor(definition, 'en', 'NO_LONGER_EXISTS'), { written: 'W' });
});

test('effectiveVoiceTextFor: resolves the right variant/STANDARD text, reports the written-fallback flag, and prefers a valid performanceText for that exact variant only', async () => {
  const matcher = await realMatcher();
  const definition = {
    responses: { en: { written: 'Standard written.', voiceReply: 'Standard spoken.' } },
    variants: { en: [{ key: 'FIRST_TIME', written: 'First-time written.', voiceReply: 'First-time spoken.', performanceText: '[curious] First-time spoken.' }] }
  };
  const standard = effectiveVoiceTextFor(matcher, definition, 'en', 'standard', 'eleven_v3');
  assert.equal(standard.text, 'Standard spoken.');
  assert.equal(standard.usedPerformanceText, false);

  const firstTime = effectiveVoiceTextFor(matcher, definition, 'en', 'FIRST_TIME', 'eleven_v3');
  assert.equal(firstTime.text, '[curious] First-time spoken.');
  assert.equal(firstTime.usedPerformanceText, true);

  // Fallback-to-written: a response set with no voiceReply at all still resolves from `written`,
  // flagged, exactly like conversation-audio-identity.mjs's own original spokenTextFor() rule.
  const fallbackDefinition = { responses: { en: { written: 'Only written text.', voiceReply: '' } } };
  const fallback = effectiveVoiceTextFor(matcher, fallbackDefinition, 'en', 'standard', null);
  assert.equal(fallback.text, 'Only written text.');
  assert.equal(fallback.usedWrittenFallback, true);
});
