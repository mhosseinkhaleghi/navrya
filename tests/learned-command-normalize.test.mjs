import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeLearnedPhrase, looksLikeOpaqueId, applyLearnedCommandOutcome,
  CONFIDENCE_NEW, CONFIDENCE_MIN, CORRECTION_DISABLE_THRESHOLD
} from '../server/db/learned-command-normalize.mjs';

// Voice Command Learning Profile addendum, sections 4/5/8: normalizeLearnedPhrase() is the single
// gate every raw utterance passes through before it can ever become a stored normalizedPhrase -
// this suite exercises it directly (a plain .mjs module, no DB/vm needed), the same "import the
// real server module" convention tests/instrument-normalize.test.mjs already established.

test('normalizeLearnedPhrase(): collapses whitespace and strips a leading/trailing politeness filler without changing the real content', () => {
  assert.equal(normalizeLearnedPhrase('  please   log this trade   ').normalizedPhrase, 'log this trade');
  assert.equal(normalizeLearnedPhrase('لطفا این معامله رو ثبت کن').normalizedPhrase, 'این معامله رو ثبت کن');
});

test('normalizeLearnedPhrase(): normalizes Persian/Arabic digit and letter script variants to one canonical form', () => {
  assert.equal(normalizeLearnedPhrase('۱۲۳').normalizedPhrase, '123');
  assert.equal(normalizeLearnedPhrase('كتاب').normalizedPhrase, 'کتاب');
});

test('normalizeLearnedPhrase(): redacts an email, a URL, an EVM wallet address, and this app\'s own entity-id shape, and reports redacted:true', () => {
  const email = normalizeLearnedPhrase('email me at trader@example.com about it');
  assert.equal(email.normalizedPhrase, 'email me at [email] about it');
  assert.equal(email.redacted, true);

  const url = normalizeLearnedPhrase('open https://navrya.app/x?token=abc123 please');
  assert.equal(url.normalizedPhrase, 'open [link]');

  const wallet = normalizeLearnedPhrase('send it to 0x1234567890abcdef1234567890abcdef12345678');
  assert.equal(wallet.normalizedPhrase, 'send it to [wallet]');

  const entity = normalizeLearnedPhrase('reopen trade-lz3k9f2a-a1b2c3d4 for me');
  assert.equal(entity.normalizedPhrase, 'reopen [id] for me');
});

test('normalizeLearnedPhrase(): an ordinary phrase with no sensitive content is left alone and reports redacted:false', () => {
  const result = normalizeLearnedPhrase('always show me the risk first');
  assert.equal(result.normalizedPhrase, 'always show me the risk first');
  assert.equal(result.redacted, false);
});

test('normalizeLearnedPhrase(): empty/whitespace-only input returns an empty phrase, never throws', () => {
  assert.equal(normalizeLearnedPhrase('   ').normalizedPhrase, '');
  assert.equal(normalizeLearnedPhrase(null).normalizedPhrase, '');
});

test('looksLikeOpaqueId(): flags this app\'s own entity-id shape and a UUID, never an ordinary short scalar value a phrase mapping might legitimately store', () => {
  assert.equal(looksLikeOpaqueId('trade-lz3k9f2a-a1b2c3d4'), true);
  assert.equal(looksLikeOpaqueId('123e4567-e89b-12d3-a456-426614174000'), true);
  assert.equal(looksLikeOpaqueId('XAUUSD'), false);
  assert.equal(looksLikeOpaqueId('high'), false);
  assert.equal(looksLikeOpaqueId('active_open_trade'), false);
});

test('applyLearnedCommandOutcome(): a fresh mapping starts at CONFIDENCE_NEW, and each success raises confidence without ever touching correctionCount', () => {
  const created = applyLearnedCommandOutcome({ confidence: CONFIDENCE_NEW, successCount: 0, correctionCount: 0, enabled: true }, 'success');
  assert.equal(created.confidence, CONFIDENCE_NEW + 10);
  assert.equal(created.successCount, 1);
  assert.equal(created.correctionCount, 0);
  assert.equal(created.enabled, true);
});

test(`applyLearnedCommandOutcome(): ${CORRECTION_DISABLE_THRESHOLD} corrections disable the mapping even if it had many prior successes`, () => {
  let state = { confidence: 90, successCount: 5, correctionCount: 0, enabled: true };
  state = applyLearnedCommandOutcome(state, 'correction');
  assert.equal(state.enabled, true, 'one correction alone does not yet disable it');
  state = applyLearnedCommandOutcome(state, 'correction');
  assert.equal(state.correctionCount, CORRECTION_DISABLE_THRESHOLD);
  assert.equal(state.enabled, false, 'the threshold is reached - auto-disabled');
});

test('applyLearnedCommandOutcome(): confidence never drops below CONFIDENCE_MIN or rises above 100, regardless of how many outcomes are applied', () => {
  let state = { confidence: CONFIDENCE_MIN, successCount: 0, correctionCount: 0, enabled: true };
  state = applyLearnedCommandOutcome(state, 'correction');
  assert.equal(state.confidence, CONFIDENCE_MIN);
  let high = { confidence: 100, successCount: 0, correctionCount: 0, enabled: true };
  high = applyLearnedCommandOutcome(high, 'success');
  assert.equal(high.confidence, 100);
});
