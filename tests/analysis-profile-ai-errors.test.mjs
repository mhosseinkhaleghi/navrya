import assert from 'node:assert/strict';
import test from 'node:test';
import { AI_ERROR_KINDS, aiErrorText, classifyAiError, describeAiError, toAiError } from '../navrya-src/analysisProfileAiErrors.js';
import { trainingCopy } from '../navrya-src/analysisProfileTrainingCopy.js';

// The Analysis Profile AI failure mapper (navrya-src/analysisProfileAiErrors.js): every gateway/browser failure code
// lands in ONE of eight kinds, each with its own translated, actionable sentence in all four languages.

const LANGS = ['fa', 'ar', 'en', 'es'];

const CASES = [
  // authentication
  ['AUTH_SESSION_REQUIRED', undefined, 'auth'], ['ACCOUNT_SUSPENDED', undefined, 'auth'], ['UNAUTHORIZED', undefined, 'auth'],
  ['SOMETHING_ELSE', 401, 'auth'],
  // network / proxy
  ['ANALYSIS_PROFILE_AI_NETWORK_ERROR', undefined, 'network'], ['ANALYSIS_PROFILE_AI_PROXY_ERROR', 502, 'network'],
  // timeout
  ['ANALYSIS_PROFILE_AI_TIMEOUT', undefined, 'timeout'], ['PROVIDER_TIMEOUT', 504, 'timeout'],
  // wallet
  ['WALLET_INSUFFICIENT_BALANCE', 402, 'wallet'],
  // quota
  ['AI_QUOTA_USER_EXCEEDED', 429, 'quota'], ['AI_QUOTA_GLOBAL_EXCEEDED', 429, 'quota'], ['FEATURE_NOT_ENTITLED', 503, 'quota'], ['SOMETHING_ELSE', 429, 'quota'],
  // provider / model configuration
  ['PROVIDER_PRICING_NOT_CONFIGURED', 503, 'provider'], ['WALLET_SERVICE_UNAVAILABLE', 503, 'provider'], ['OPENAI_API_KEY_MISSING', 503, 'provider'],
  ['ANTHROPIC_API_KEY_MISSING', 503, 'provider'], ['PROVIDER_FAILED', 502, 'provider'], ['EMPTY_MODEL_RESPONSE', 502, 'provider'], ['SCHEMA_VALIDATION_FAILED', 502, 'provider'],
  // PDF-provider incompatibility
  ['MODEL_PDF_UNSUPPORTED', 422, 'pdf_provider'],
  // everything else stays generic - never invented
  // a route that is missing in front of the gateway (the production 404 - the AI prefix was not proxied) is a connectivity failure, not a generic one
  ['NOT_FOUND', 404, 'network'], ['NOT_FOUND', undefined, 'network'], ['SOMETHING_ELSE', 404, 'network'], ['SOMETHING_ELSE', 405, 'network'],
  ['ANALYSIS_PROFILE_AI_REQUEST_FAILED', 400, 'generic'], ['PATTERN_AI_FAILED', 500, 'generic'], ['', undefined, 'generic'], [undefined, undefined, 'generic']
];

test('classifyAiError maps every stable gateway/browser code to its own kind, and only falls back to the status where the code cannot say', () => {
  for (const [code, status, kind] of CASES) assert.equal(classifyAiError(code, status), kind, `${code} / ${status}`);
});

test('a known code wins over the status (a 401 with a wallet code is a wallet problem), and an inherited property name is not a code', () => {
  assert.equal(classifyAiError('WALLET_INSUFFICIENT_BALANCE', 401), 'wallet');
  assert.equal(classifyAiError('constructor', undefined), 'generic');
  assert.equal(classifyAiError('__proto__', undefined), 'generic');
  assert.equal(classifyAiError('toString', 401), 'auth', 'only the status decides an unknown code');
});

test('toAiError keeps only { code, status } - never the message, the cause, or a stray credential-looking property', () => {
  const caught = Object.assign(new Error('the raw message with sk-secret'), { name: 'AnalysisProfileAIError', code: 'PROVIDER_TIMEOUT', status: 504, cause: new Error('inner'), apiKey: 'sk-secret' });
  assert.deepEqual(toAiError(caught), { code: 'PROVIDER_TIMEOUT', status: 504 });
  assert.deepEqual(toAiError({ code: 'WALLET_INSUFFICIENT_BALANCE' }), { code: 'WALLET_INSUFFICIENT_BALANCE' });
  assert.deepEqual(toAiError(new Error('no code')), { code: 'ANALYSIS_PROFILE_AI_REQUEST_FAILED' });
  assert.deepEqual(toAiError(null), { code: 'ANALYSIS_PROFILE_AI_REQUEST_FAILED' });
  assert.deepEqual(toAiError({ code: 'X', status: 'nope' }), { code: 'X' });
  assert.equal(JSON.stringify(toAiError(caught)).includes('secret'), false);
});

test('every kind has its own translated sentence in all four languages - distinct from every other kind, and never a raw copy key', () => {
  for (const lang of LANGS) {
    const seen = new Map();
    for (const kind of AI_ERROR_KINDS) {
      const sample = CASES.find((c) => c[2] === kind);
      const info = describeAiError(lang, { code: sample[0], status: sample[1] });
      assert.equal(info.kind, kind);
      assert.ok(info.text && info.text.length > 12, `${lang}/${kind} has real text`);
      assert.doesNotMatch(info.text, /^(aiErr|sourceErr|aiError)/, `${lang}/${kind} is a translation, not a key`);
      assert.equal(seen.has(info.text), false, `${lang}: ${kind} must not reuse the sentence of ${seen.get(info.text)}`);
      seen.set(info.text, kind);
    }
    assert.equal(seen.size, AI_ERROR_KINDS.length);
  }
});

test('the wallet message is actionable (top up, or use your own key), and the PDF message names PDF - so they cannot be swapped for the generic one', () => {
  assert.match(describeAiError('en', { code: 'WALLET_INSUFFICIENT_BALANCE' }).text, /top up/i);
  assert.match(describeAiError('en', { code: 'WALLET_INSUFFICIENT_BALANCE' }).text, /own API key/i);
  assert.match(describeAiError('en', { code: 'MODEL_PDF_UNSUPPORTED' }).text, /PDF/);
  assert.match(describeAiError('en', { code: 'ANALYSIS_PROFILE_AI_PROXY_ERROR', status: 502 }).text, /proxy/i);
  assert.match(describeAiError('en', { code: 'AUTH_SESSION_REQUIRED', status: 401 }).text, /sign in/i);
});

test('the detail line carries the stable code and HTTP status so a support conversation can start from it', () => {
  assert.equal(describeAiError('en', { code: 'ANALYSIS_PROFILE_AI_PROXY_ERROR', status: 502 }).detail, 'Code: ANALYSIS_PROFILE_AI_PROXY_ERROR · HTTP 502');
  assert.equal(describeAiError('en', { code: 'PROVIDER_TIMEOUT' }).detail, 'Code: PROVIDER_TIMEOUT');
  assert.equal(describeAiError('en', { status: 503 }).detail, 'HTTP 503');
  assert.equal(describeAiError('en', {}).detail, '');
  assert.match(describeAiError('fa', { code: 'PROVIDER_TIMEOUT' }).detail, /PROVIDER_TIMEOUT/);
});

test('aiErrorText is the sentence alone, and an unknown language falls back to English rather than a key', () => {
  assert.equal(aiErrorText('en', 'MODEL_PDF_UNSUPPORTED'), describeAiError('en', { code: 'MODEL_PDF_UNSUPPORTED' }).text);
  assert.equal(aiErrorText('xx', 'PROVIDER_TIMEOUT'), aiErrorText('en', 'PROVIDER_TIMEOUT'));
});

test('the copy keys the mapper and the readiness bar rely on exist in every language with the same {placeholders}', () => {
  const keys = ['aiErrAuth', 'aiErrNetwork', 'aiErrTimeout', 'aiErrWallet', 'aiErrQuota', 'aiErrProvider', 'aiErrorGeneric', 'sourceErrPdfProvider', 'aiErrCode', 'retryBtn',
    'aiReadyLabel', 'aiReadyByok', 'aiReadyPlatform', 'aiReadyByokHint', 'aiReadyPlatformHint', 'aiReadyProviderPlatform'];
  for (const lang of LANGS) for (const key of keys) assert.ok(trainingCopy[lang][key], `${lang}.${key}`);
  for (const lang of LANGS) assert.match(trainingCopy[lang].aiErrCode, /\{code\}/);
});

test('the per-surface wallet/generic copy the mapper replaced is gone (one wording, owned in one place)', () => {
  for (const lang of LANGS) for (const key of ['aiErrorBalance', 'chatErrorBalance', 'chatErrorGeneric']) assert.equal(key in trainingCopy[lang], false, `${lang}.${key}`);
});
