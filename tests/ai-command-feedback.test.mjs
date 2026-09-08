import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Voice Command Learning Profile addendum, sections 6/8: three deterministic, zero-network phrase
// classifiers - real dynamic tests against the actual module, same convention as
// tests/ai-dock-control-intent.test.mjs and ai-workflow-engine's own interpretCancelText tests.

const root = process.cwd();
// interpretCorrectionText() returns a plain object CONSTRUCTED INSIDE the vm sandbox - it carries
// that realm's own Object.prototype, so a bare assert.deepEqual against a literal built in this
// file's realm fails as "same structure but not reference-equal" even for identical content (the
// same cross-realm caveat tests/ai-workflow-engine.test.mjs's own clone() helper works around).
const clone = (value) => (value == null ? value : JSON.parse(JSON.stringify(value)));
async function feedbackSandbox() {
  const sandbox = { window: {} };
  const src = await readFile(path.join(root, 'public', 'pages', 'shared', 'ai-command-feedback.js'), 'utf8');
  vm.runInNewContext(src, sandbox, { filename: 'ai-command-feedback.js' });
  return sandbox.window.TradeJournalAICommandFeedback;
}

test('interpretLearningApprovalText(): recognizes an explicit "remember/learn/do automatically" phrase in all four languages', async () => {
  const feedback = await feedbackSandbox();
  assert.equal(feedback.interpretLearningApprovalText('remember this'), true);
  assert.equal(feedback.interpretLearningApprovalText('yes, do that automatically next time'), true);
  assert.equal(feedback.interpretLearningApprovalText('یادت باشه'), true);
  assert.equal(feedback.interpretLearningApprovalText('همیشه همین کارو بکن'), true);
  assert.equal(feedback.interpretLearningApprovalText('تذكر هذا'), true);
  assert.equal(feedback.interpretLearningApprovalText('recuérdalo'), true);
  assert.equal(feedback.interpretLearningApprovalText('hazlo siempre'), true);
});

test('interpretLearningApprovalText(): a bare "yes"/"ok" or an unrelated sentence never resolves - section 6\'s hard rule that learning must never happen from a generic confirmation', async () => {
  const feedback = await feedbackSandbox();
  assert.equal(feedback.interpretLearningApprovalText('yes'), false);
  assert.equal(feedback.interpretLearningApprovalText('ok'), false);
  assert.equal(feedback.interpretLearningApprovalText('بله'), false);
  assert.equal(feedback.interpretLearningApprovalText('I will remember to check this later'), false, 'a longer sentence merely containing "remember" must not match');
});

test('interpretPositiveFeedbackText(): recognizes reinforcement phrases, distinct from and narrower than a bare confirm', async () => {
  const feedback = await feedbackSandbox();
  assert.equal(feedback.interpretPositiveFeedbackText("that's right"), true);
  assert.equal(feedback.interpretPositiveFeedbackText('perfect'), true);
  assert.equal(feedback.interpretPositiveFeedbackText('درسته'), true);
  assert.equal(feedback.interpretPositiveFeedbackText('هذا صحيح'), true);
  assert.equal(feedback.interpretPositiveFeedbackText('exacto'), true);
  assert.equal(feedback.interpretPositiveFeedbackText('yes'), false);
  assert.equal(feedback.interpretPositiveFeedbackText('ok thanks'), false);
});

test('interpretCorrectionText(): resolves each of the six deterministic reasons in English, and returns null for an ordinary sentence', async () => {
  const feedback = await feedbackSandbox();
  assert.deepEqual(clone(feedback.interpretCorrectionText('forget that')), { reason: 'forget_preference' });
  assert.deepEqual(clone(feedback.interpretCorrectionText('never do this automatically again')), { reason: 'never_automatic' });
  assert.deepEqual(clone(feedback.interpretCorrectionText('ask me next time')), { reason: 'ask_next_time' });
  assert.deepEqual(clone(feedback.interpretCorrectionText('wrong action')), { reason: 'wrong_action' });
  assert.deepEqual(clone(feedback.interpretCorrectionText('wrong trade')), { reason: 'wrong_target' });
  assert.deepEqual(clone(feedback.interpretCorrectionText('wrong value')), { reason: 'wrong_value' });
  assert.equal(feedback.interpretCorrectionText('the market looks bullish today'), null);
});

test('interpretCorrectionText(): resolves the same six reasons in Persian, Arabic, and Spanish', async () => {
  const feedback = await feedbackSandbox();
  assert.deepEqual(clone(feedback.interpretCorrectionText('فراموشش کن')), { reason: 'forget_preference' });
  assert.deepEqual(clone(feedback.interpretCorrectionText('دیگه این کارو خودکار نکن')), { reason: 'never_automatic' });
  assert.deepEqual(clone(feedback.interpretCorrectionText('دفعه بعد ازم بپرس')), { reason: 'ask_next_time' });
  assert.deepEqual(clone(feedback.interpretCorrectionText('احذف هذا التفضيل')), { reason: 'forget_preference' });
  assert.deepEqual(clone(feedback.interpretCorrectionText('اسألني في المرة القادمة')), { reason: 'ask_next_time' });
  assert.deepEqual(clone(feedback.interpretCorrectionText('olvídalo')), { reason: 'forget_preference' });
  assert.deepEqual(clone(feedback.interpretCorrectionText('pregúntame la próxima vez')), { reason: 'ask_next_time' });
});

test('canonicalFeedbackPhrase(): section 8\'s chat feedback buttons send phrases that actually match their OWN classifier, in all four languages - the real drift guard between the button wiring and the phrase patterns', async () => {
  const feedback = await feedbackSandbox();
  ['en', 'fa', 'ar', 'es'].forEach((lang) => {
    assert.equal(feedback.interpretPositiveFeedbackText(feedback.canonicalFeedbackPhrase('correct', lang)), true, lang + ': "correct" phrase must match interpretPositiveFeedbackText');
    assert.deepEqual(clone(feedback.interpretCorrectionText(feedback.canonicalFeedbackPhrase('wrongAction', lang))), { reason: 'wrong_action' }, lang + ': "wrongAction" phrase must resolve to wrong_action');
    const wrongTargetOrValue = feedback.interpretCorrectionText(feedback.canonicalFeedbackPhrase('wrongTargetOrValue', lang));
    assert.ok(wrongTargetOrValue && (wrongTargetOrValue.reason === 'wrong_value' || wrongTargetOrValue.reason === 'wrong_target'), lang + ': "wrongTargetOrValue" phrase must resolve to wrong_value or wrong_target');
    assert.equal(feedback.interpretLearningApprovalText(feedback.canonicalFeedbackPhrase('rememberThis', lang)), true, lang + ': "rememberThis" phrase must match interpretLearningApprovalText');
  });
});

test('canonicalFeedbackPhrase() falls back to English for an unrecognized language, and returns null for an unrecognized intent', async () => {
  const feedback = await feedbackSandbox();
  assert.equal(feedback.canonicalFeedbackPhrase('correct', 'de'), feedback.canonicalFeedbackPhrase('correct', 'en'));
  assert.equal(feedback.canonicalFeedbackPhrase('not-a-real-intent', 'en'), null);
});

test('all three classifiers are anchored to the whole trimmed utterance, never a substring match, and tolerate one trailing punctuation mark', async () => {
  const feedback = await feedbackSandbox();
  assert.equal(feedback.interpretLearningApprovalText('remember this.'), true, 'one trailing period is tolerated');
  assert.equal(feedback.interpretLearningApprovalText("well, I'll remember this for later"), false, 'a longer sentence must not match');
  assert.equal(feedback.interpretCorrectionText('that was totally the wrong action to take honestly'), null, 'a longer sentence must not match');
});
