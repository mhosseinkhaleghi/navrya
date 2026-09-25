import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { AI_ERROR_KINDS, describeAiError, toAiError } from '../navrya-src/analysisProfileAiErrors.js';
import { trainingCopy } from '../navrya-src/analysisProfileTrainingCopy.js';
import { extractFunction } from './helpers/extract-function.mjs';
import { loadJsx, visibleText } from './helpers/render-jsx.mjs';

// The Analysis Profile AI status surface, actually RENDERED (analysisProfileAiStatus.jsx: the readiness line and the
// shared error notice), and the Preview / Chat Retry behaviour, actually EXECUTED: the real generate() / send() are
// extracted from their .jsx sources (no JSX in their bodies) and run against a fake AI client, so "Retry" is proven to
// re-issue the identical request and to clear the error on success - not just grepped for.

const root = process.cwd();
const LANGS = ['fa', 'ar', 'en', 'es'];
const read = async (file) => (await readFile(path.join(root, 'navrya-src', file), 'utf8')).replace(/\r\n/g, '\n');

let jsx;
test.before(async () => { jsx = await loadJsx({ status: 'navrya-src/analysisProfileAiStatus.jsx' }); });
test.after(async () => { delete globalThis.window; if (jsx) await jsx.cleanup(); });

const KIND_SAMPLES = {
  auth: { code: 'AUTH_SESSION_REQUIRED', status: 401 }, network: { code: 'ANALYSIS_PROFILE_AI_PROXY_ERROR', status: 502 }, timeout: { code: 'PROVIDER_TIMEOUT', status: 504 },
  wallet: { code: 'WALLET_INSUFFICIENT_BALANCE', status: 402 }, quota: { code: 'AI_QUOTA_USER_EXCEEDED', status: 429 }, provider: { code: 'PROVIDER_PRICING_NOT_CONFIGURED', status: 503 },
  pdf_provider: { code: 'MODEL_PDF_UNSUPPORTED', status: 422 }, generic: { code: 'PATTERN_AI_FAILED', status: 500 }
};

// ---- AiErrorNotice ------------------------------------------------------------------------------------

test('AiErrorNotice renders each failure kind as its own translated alert, in every language, with the stable code shown', () => {
  globalThis.window = {};
  for (const lang of LANGS) {
    for (const kind of AI_ERROR_KINDS) {
      const html = jsx.render(jsx.modules.status.AiErrorNotice, { lang, error: KIND_SAMPLES[kind] });
      const info = describeAiError(lang, KIND_SAMPLES[kind]);
      assert.match(html, /role="alert"/);
      assert.match(html, new RegExp(`data-ai-error-kind="${kind}"`));
      const text = visibleText(html);
      assert.ok(text.includes(info.text), `${lang}/${kind}: the translated sentence is on screen`);
      assert.ok(text.includes(KIND_SAMPLES[kind].code), `${lang}/${kind}: the stable code is on screen`);
      assert.ok(text.includes('HTTP ' + KIND_SAMPLES[kind].status), `${lang}/${kind}: the HTTP status is on screen`);
    }
  }
});

test('AiErrorNotice offers Retry only when it is given something to retry, and disables it (busy) while a retry is running', () => {
  globalThis.window = {};
  const error = KIND_SAMPLES.wallet;
  for (const lang of LANGS) {
    const retryLabel = trainingCopy[lang].retryBtn;
    const without = jsx.render(jsx.modules.status.AiErrorNotice, { lang, error });
    assert.equal(without.includes('<button'), false, `${lang}: no retry without a handler`);
    const withRetry = jsx.render(jsx.modules.status.AiErrorNotice, { lang, error, onRetry: () => {} });
    assert.ok(/<button[^>]*>/.test(withRetry) && visibleText(withRetry).includes(retryLabel), `${lang}: Retry is offered, translated`);
    assert.equal(/<button[^>]*disabled/.test(withRetry), false);
    const busy = jsx.render(jsx.modules.status.AiErrorNotice, { lang, error, onRetry: () => {}, busy: true });
    assert.match(busy, /<button[^>]*disabled/);
    assert.match(busy, /aria-busy="true"/);
  }
});

test('AiErrorNotice renders nothing when there is no error', () => {
  globalThis.window = {};
  assert.equal(jsx.render(jsx.modules.status.AiErrorNotice, { lang: 'en', error: null, onRetry: () => {} }), '');
  assert.equal(jsx.render(jsx.modules.status.AiErrorNotice, { lang: 'en', error: undefined }), '');
});

// ---- AiReadinessBar -----------------------------------------------------------------------------------

test('AiReadinessBar shows platform-managed vs BYOK with the provider/model, and never anything secret', () => {
  const SECRET = 'sk-live-DO-NOT-RENDER';
  const fakeClient = (state) => ({ readiness: () => state });
  for (const lang of LANGS) {
    globalThis.window = { TradeJournalAnalysisProfileAI: fakeClient({ mode: 'byok', provider: 'anthropic', providerLabel: 'Claude', model: 'claude-sonnet-4-5', apiKey: SECRET }), addEventListener() {}, removeEventListener() {} };
    const byok = jsx.render(jsx.modules.status.AiReadinessBar, { lang });
    assert.match(byok, /data-ai-mode="byok"/);
    const byokText = visibleText(byok);
    assert.ok(byokText.includes(trainingCopy[lang].aiReadyByok));
    assert.ok(byokText.includes('Claude') && byokText.includes('claude-sonnet-4-5'));
    assert.ok(byokText.includes(trainingCopy[lang].aiReadyByokHint));
    assert.equal(byok.includes(SECRET), false, 'a stray credential-looking field on the state is never rendered');

    globalThis.window = { TradeJournalAnalysisProfileAI: fakeClient({ mode: 'platform', provider: 'openai', providerLabel: 'OpenAI', model: 'gpt-5.6' }), addEventListener() {}, removeEventListener() {} };
    const platform = jsx.render(jsx.modules.status.AiReadinessBar, { lang });
    assert.match(platform, /data-ai-mode="platform"/);
    const platformText = visibleText(platform);
    assert.ok(platformText.includes(trainingCopy[lang].aiReadyPlatform));
    assert.ok(platformText.includes(trainingCopy[lang].aiReadyProviderPlatform), 'in platform mode the model is NAVRYA\'s choice, so the local selection is not presented as what will be used');
    assert.equal(platformText.includes('gpt-5.6'), false);
    assert.ok(platformText.includes(trainingCopy[lang].aiReadyPlatformHint));
  }
});

test('AiReadinessBar renders nothing when the AI client is not loaded', () => {
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  assert.equal(jsx.render(jsx.modules.status.AiReadinessBar, { lang: 'en' }), '');
});

test('the readiness bar re-reads whenever the AI settings change, and the AI-using tabs (and only those) show it', async () => {
  const status = await read('analysisProfileAiStatus.jsx');
  assert.match(status, /addEventListener\('tradejournal:ai-settings-changed', refresh\)/);
  assert.match(status, /removeEventListener\('tradejournal:ai-settings-changed', refresh\)/);
  const view = await read('analysisProfilesView.jsx');
  assert.match(view, /const AI_TABS = \['concepts', 'knowledge', 'memory', 'chat', 'preview'\];/);
  assert.match(view, /\{AI_TABS\.indexOf\(dtab\) > -1 && <AiReadinessBar lang=\{lang\} \/>\}/);
});

// ---- Preview: Retry re-issues the same request ----------------------------------------------------------

async function runPreview(clientBehaviour) {
  const source = await read('analysisProfilePreview.jsx');
  const calls = { preview: [], phase: [], error: [], observations: [], usage: [] };
  const fakeClient = { preview: async (args) => { calls.preview.push(args); return clientBehaviour(calls.preview.length, args); } };
  const context = {
    window: { TradeJournalAnalysisProfileAI: fakeClient },
    phase: 'idle', observations: [], profileContext: { profile: { id: 'p1', revision: 'r1' }, concepts: [{ id: 'c1', title: 'Swept liquidity' }] }, lang: 'en', toAiError,
    setPhase: (value) => { calls.phase.push(value); context.phase = value; },
    setError: (value) => calls.error.push(value), setObservations: (value) => { calls.observations.push(value); context.observations = value; }, setUsage: (value) => calls.usage.push(value)
  };
  vm.createContext(context);
  vm.runInContext([extractFunction(source, 'aiClient'), extractFunction(source, 'generate')].join('\n'), context);
  return { calls, context, generate: () => vm.runInContext('generate()', context) };
}

test('Preview: a failed sample keeps its specific error, and Retry (the same generate()) re-sends the identical request, clears the error and shows the result', async () => {
  const h = await runPreview((attempt) => {
    if (attempt === 1) throw Object.assign(new Error('x'), { code: 'PROVIDER_TIMEOUT', status: 504 });
    return { observations: [{ title: 'A', detail: 'b' }], usage: { promptTokens: 3, completionTokens: 4 } };
  });

  await h.generate();
  assert.deepEqual(h.calls.error, [null, { code: 'PROVIDER_TIMEOUT', status: 504 }], 'cleared at the start, then the specific failure');
  assert.deepEqual(h.calls.phase, ['working', 'idle'], 'a failed first sample falls back to idle, not a fake ready state');
  assert.equal(h.calls.observations.length, 0, 'nothing invented on failure');

  await h.generate(); // what the Retry button calls
  assert.equal(h.calls.preview.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.preview[1])), JSON.parse(JSON.stringify(h.calls.preview[0])), 'the retried request is identical');
  assert.equal(h.calls.preview[0].language, 'en');
  assert.deepEqual(h.calls.error.slice(2), [null], 'the retry clears the error before it runs, and it stays cleared on success');
  assert.deepEqual(h.calls.phase.slice(2), ['working', 'ready']);
  assert.deepEqual(h.calls.observations.at(-1), [{ title: 'A', detail: 'b' }]);
});

test('Preview: a retry that fails again shows the NEW failure (wallet after a timeout), and a running request cannot be doubled', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const h = await runPreview(async (attempt) => {
    if (attempt === 1) throw Object.assign(new Error('x'), { code: 'PROVIDER_TIMEOUT' });
    if (attempt === 2) { await gate; throw Object.assign(new Error('x'), { code: 'WALLET_INSUFFICIENT_BALANCE', status: 402 }); }
    return { observations: [], usage: null };
  });
  await h.generate();
  const second = h.generate();
  await h.generate(); // pressed again while the retry is still in flight: phase is 'working', so it is ignored
  release();
  await second;
  assert.equal(h.calls.preview.length, 2, 'the in-flight retry was not doubled');
  assert.deepEqual(h.calls.error.at(-1), { code: 'WALLET_INSUFFICIENT_BALANCE', status: 402 });
});

test('Preview: the notice is rendered with Retry wired to generate(), and no per-code wording is decided in the component', async () => {
  const source = await read('analysisProfilePreview.jsx');
  assert.match(source, /<AiErrorNotice lang=\{lang\} error=\{error\} onRetry=\{generate\} busy=\{phase === 'working'\} \/>/);
  assert.match(source, /setError\(toAiError\(caught\)\)/);
  assert.doesNotMatch(source, /WALLET_INSUFFICIENT_BALANCE/);
});

// ---- Chat: Retry re-sends the same message ---------------------------------------------------------------

async function runChat(clientBehaviour) {
  const source = await read('analysisProfileChat.jsx');
  const calls = { chat: [], append: [], events: [], sending: [], error: [], messages: [], draft: [] };
  const fakeClient = { chat: async (args) => { calls.chat.push(args); return clientBehaviour(calls.chat.length, args); } };
  const context = {
    window: { TradeJournalAnalysisProfileAI: fakeClient, TradeJournalAnalysisContext: { getAnalysisContext: (id) => ({ profile: { id }, concepts: [] }) } },
    profiles: {
      appendMessages: async (id, list) => { calls.append.push([id, list]); return list.map((m, i) => ({ id: 'm' + calls.append.length + i, ...m })); },
      recordEvent: (id, event) => { calls.events.push([id, event]); return Promise.resolve(); }
    },
    profile: { id: 'p1', understanding: { version: 2 } }, lang: 'en', trimmed: 'What is a sweep?', sending: false,
    messages: [{ role: 'user', content: 'earlier' }, { role: 'assistant', content: 'reply' }], aliveRef: { current: true }, toAiError,
    setSending: (v) => calls.sending.push(v), setError: (v) => calls.error.push(v), setMessages: (fn) => calls.messages.push(fn), setDraft: (v) => calls.draft.push(v)
  };
  vm.createContext(context);
  vm.runInContext([extractFunction(source, 'aiClient'), extractFunction(source, 'analysisContext'), extractFunction(source, 'tokensOf'), extractFunction(source, 'send')].join('\n'), context);
  return { calls, send: () => vm.runInContext('send()', context) };
}

test('Chat: a failed send keeps the trader\'s draft and the specific error; Retry (the same send()) re-sends the identical message and history', async () => {
  const h = await runChat((attempt) => {
    if (attempt === 1) throw Object.assign(new Error('x'), { code: 'AUTH_SESSION_REQUIRED', status: 401 });
    return { reply: 'A sweep is...', proposals: [], usage: { promptTokens: 5, completionTokens: 6 } };
  });

  await h.send();
  assert.deepEqual(h.calls.error, [null, { code: 'AUTH_SESSION_REQUIRED', status: 401 }]);
  assert.deepEqual(h.calls.draft, [], 'the draft is NOT cleared by a failed send - it is what Retry re-sends');
  assert.equal(h.calls.append.length, 0, 'nothing is stored for a failed turn');
  assert.deepEqual(h.calls.sending, [true, false]);

  await h.send(); // what the Retry button calls
  assert.equal(h.calls.chat.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.chat[1])), JSON.parse(JSON.stringify(h.calls.chat[0])), 'the retried request is identical');
  assert.equal(h.calls.chat[0].message, 'What is a sweep?');
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls.chat[0].history)), [{ role: 'user', content: 'earlier' }, { role: 'assistant', content: 'reply' }]);
  assert.equal(h.calls.append.length, 1);
  assert.deepEqual(Array.from(h.calls.append[0][1], (m) => m.role), ['user', 'assistant']);
  assert.deepEqual(h.calls.error.slice(2), [null], 'cleared for the retry, and stays cleared on success');
  assert.deepEqual(h.calls.draft, [''], 'the draft is cleared only once the turn succeeded');
  assert.equal(h.calls.events.length, 1, 'the real usage is recorded once, for the successful turn only');
});

test('Chat: every kind of failure reaches the notice as its own { code, status } - a wallet failure is not a network one', async () => {
  for (const [kind, sample] of Object.entries(KIND_SAMPLES)) {
    const h = await runChat(() => { throw Object.assign(new Error('x'), sample); });
    await h.send();
    const shown = h.calls.error.at(-1);
    assert.deepEqual(shown, sample);
    assert.equal(describeAiError('en', shown).kind, kind);
  }
});

test('Chat: the notice is rendered with Retry wired to send()', async () => {
  const source = await read('analysisProfileChat.jsx');
  assert.match(source, /<AiErrorNotice lang=\{lang\} error=\{error\} onRetry=\{send\} busy=\{sending\} \/>/);
});

// ---- Suggestions, Memory learning and Knowledge use the same mapper ------------------------------------------

test('Concepts suggestions, the onboarding wizard, the rite and Memory learning all keep the specific failure and offer Retry (no per-code ternaries left)', async () => {
  const cases = [
    ['analysisProfileConcepts.jsx', /setSuggestError\(toAiError\(caught\)\)/, /<AiErrorNotice lang=\{lang\} error=\{suggestError\} onRetry=\{suggest\} busy=\{suggestLoading\} \/>/],
    ['analysisProfileOnboarding.jsx', /setAiSuggestError\(toAiError\(error\)\)/, /<AiErrorNotice lang=\{activeLang\} error=\{aiSuggestError\} onRetry=\{regenerateFocusSuggestions\} busy=\{aiSuggestLoading\} \/>/],
    ['analysisProfileRite.jsx', /setAiSuggestError\(toAiError\(error\)\)/, /<AiErrorNotice lang=\{activeLang\} error=\{aiSuggestError\} onRetry=\{regenerateFocusSuggestions\} busy=\{aiSuggestLoading\} \/>/],
    ['analysisProfileTeachJobs.js', /error: toAiError\(caught\)/, null],
    ['engineLearning.jsx', null, /<AiErrorNotice lang=\{lang\} error=\{error\} onRetry=\{retry\} busy=\{phase === 'working'\} \/>/]
  ];
  for (const [file, catches, notice] of cases) {
    const source = await read(file);
    if (catches) assert.match(source, catches, file);
    if (notice) assert.match(source, notice, file);
    assert.doesNotMatch(source, /WALLET_INSUFFICIENT_BALANCE/, file + ' leaves the wording to the shared mapper');
    assert.doesNotMatch(source, /aiSuggestErrorBalance|aiSuggestErrorGeneric|aiErrorBalance/, file + ' no longer carries per-surface error copy');
  }
});

test('Knowledge keeps its source-specific messages and falls back to the shared kinds (auth, quota, provider...) before the catch-all', async () => {
  const source = await read('analysisProfileKnowledge.jsx');
  assert.match(source, /import \{ classifyAiError, aiErrorText \} from '\.\/analysisProfileAiErrors\.js';/);
  const body = extractFunction(source, 'errorText');
  assert.match(body, /key === 'sourceErrGeneric' && classifyAiError\(code, status\) !== 'generic'/);
  assert.match(body, /aiErrorText\(lang, code, status\)/);
  // The source-specific mapping still wins for the codes it knows (SSRF block, too large, timeout, quota, PDF provider...).
  const mapper = extractFunction(source, 'errorKeyFor');
  for (const code of ['ADDRESS_BLOCKED', 'SOURCE_TOO_LARGE', 'SOURCE_TIMEOUT', 'STORAGE_QUOTA_EXCEEDED', 'MODEL_PDF_UNSUPPORTED']) assert.match(mapper, new RegExp(code));
});
