import assert from 'node:assert/strict';
import test, { after, afterEach } from 'node:test';

// Production repair pass (section 43): dockChat() is exported directly, alongside
// dockChatFormatFor()/buildProductContextText(), specifically to make its own per-turn-type
// reasoning/verbosity policy and system-prompt content directly testable - the same
// globalThis.fetch-stubbing convention tests/ai-gateway.test.mjs already established for
// callProvider()/callOpenAI(), not a new pattern invented for this file.
const serverModule = await import('../server/pattern-ai-server.mjs');
const { dockChat, __resetAdminGeminiVoiceProfileCacheForTests } = serverModule;
const server = serverModule.default;

after(() => { server.close(); });

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const HEALTH_EVENT_URL = '/internal/ai-health-event';
const neutralHealthEventResponse = { ok: true, json: async () => ({}) };

function withEnv(vars, fn) {
  const originals = {};
  for (const key of Object.keys(vars)) { originals[key] = process.env[key]; process.env[key] = vars[key]; }
  return Promise.resolve().then(fn).finally(() => {
    for (const key of Object.keys(vars)) { if (originals[key] === undefined) delete process.env[key]; else process.env[key] = originals[key]; }
  });
}

function captureOpenAIRequest(replyPayload) {
  let seenBody = null;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes(HEALTH_EVENT_URL)) return neutralHealthEventResponse;
    seenBody = JSON.parse(options.body);
    return { ok: true, json: async () => ({ output_text: JSON.stringify(replyPayload), usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } }) };
  };
  return () => seenBody;
}

// --- reasoning/verbosity policy (sections 19-21/26) ---

test('a genuine open-ended Q&A turn (neither activeProcess nor availableActions) uses reasoning.effort=medium and text.verbosity=high - the one turn type that keeps the full, polished treatment', async () => {
  const getBody = captureOpenAIRequest({ reply: 'a full answer' });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
    await dockChat({ provider: 'openai', message: 'What is a Session?', language: 'en' });
  });
  const body = getBody();
  assert.deepEqual(body.reasoning, { effort: 'medium' });
  assert.equal(body.text.verbosity, 'high');
});

test('a workflow slot-filling turn (activeProcess open) uses reasoning.effort=low and text.verbosity=medium - fast and concise, not the full Q&A treatment', async () => {
  const getBody = captureOpenAIRequest({ reply: 'short', suggestions: [] });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
    await dockChat({ provider: 'openai', message: 'New York', language: 'en', activeProcess: { id: 'session-create', allowlist: ['city', 'timeframe'] } });
  });
  const body = getBody();
  assert.deepEqual(body.reasoning, { effort: 'low' });
  assert.equal(body.text.verbosity, 'medium');
});

// Latency pass, section 12: previously shared the SAME tier as plain Q&A (both 'medium'/'high') -
// measured to be needlessly slow for a routing decision (which offered action, if any, matches;
// extract its fields) that has no more reason to want deep reasoning or a long answer than an
// already-open form does. Fresh action discovery now gets the SAME light tier as activeProcess.
test('a fresh action-discovery turn (availableActions offered, nothing open yet) uses reasoning.effort=low and text.verbosity=medium - the SAME light tier as an open workflow, not the full Q&A treatment', async () => {
  const getBody = captureOpenAIRequest({ reply: 'a full answer', action: null });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
    await dockChat({ provider: 'openai', message: 'Start a New York session.', language: 'en', availableActions: [{ id: 'session.create', requiredFields: [], optionalFields: [] }] });
  });
  const body = getBody();
  assert.deepEqual(body.reasoning, { effort: 'low' });
  assert.equal(body.text.verbosity, 'medium');
});

test('neither reasoning nor verbosity is ever set to "max"/unbounded - both tiers are deliberate, moderate choices', async () => {
  const getBody1 = captureOpenAIRequest({ reply: 'x', action: null });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => { await dockChat({ provider: 'openai', message: 'hi', language: 'en' }); });
  assert.notEqual(getBody1().reasoning.effort, 'max');

  const getBody2 = captureOpenAIRequest({ reply: 'x', suggestions: [] });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
    await dockChat({ provider: 'openai', message: 'x', language: 'en', activeProcess: { id: 'p', allowlist: ['a'] } });
  });
  assert.notEqual(getBody2().reasoning.effort, 'max');
});

// --- system-prompt content (sections 10, 22) ---

test('the availableActions branch\'s system prompt teaches ASK/DO/GUIDE and explicitly allows a zero-field action start', async () => {
  const getBody = captureOpenAIRequest({ reply: 'ok', action: null });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
    await dockChat({ provider: 'openai', message: 'create a session for me', language: 'en', availableActions: [{ id: 'session.create', requiredFields: ['city'], optionalFields: [] }] });
  });
  const systemText = getBody().input[0].content[0].text;
  assert.match(systemText, /\bASK\b/);
  assert.match(systemText, /\bDO\b/);
  assert.match(systemText, /\bGUIDE\b/);
  assert.match(systemText, /zero known fields is completely valid/i);
  assert.match(systemText, /never withhold action\.id/i);
});

test('every branch\'s system prompt carries the richer conversational style instruction, not "keep answers concise"', async () => {
  const getBody = captureOpenAIRequest({ reply: 'ok', action: null });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
    await dockChat({ provider: 'openai', message: 'hi', language: 'en' });
  });
  const systemText = getBody().input[0].content[0].text;
  assert.match(systemText, /polished, useful answer/i);
  assert.doesNotMatch(systemText, /keep answers concise/i);
});

test('the activeProcess branch\'s system prompt still explicitly asks for SHORT workflow questions, even though the base style is richer', async () => {
  const getBody = captureOpenAIRequest({ reply: 'ok', suggestions: [] });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
    await dockChat({ provider: 'openai', message: 'New York', language: 'en', activeProcess: { id: 'session-create', allowlist: ['city'] } });
  });
  const systemText = getBody().input[0].content[0].text;
  assert.match(systemText, /keep these workflow questions short/i);
});

// --- Journey F, F21: past-action confirmation bias and topic-recency bias (found via real
// browser testing - a Scenario created a few turns earlier got treated as perpetually "still
// pending submission", blocking or hedging on completely unrelated later actions like
// strategy.create/trade.calculator, and a later message naming a different action outright got
// misclassified as continuing the earlier Scenario topic) ---

test('the system prompt distinguishes "this turn\'s own action" from an action selected in an earlier turn - a past action must be treated as already completed, never described as still pending/unsaved', async () => {
  const getBody = captureOpenAIRequest({ reply: 'ok', action: null });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
    await dockChat({ provider: 'openai', message: 'Create a Strategy called X.', language: 'en', availableActions: [{ id: 'strategy.create', requiredFields: ['name'], optionalFields: [] }] });
  });
  const systemText = getBody().input[0].content[0].text;
  assert.match(systemText, /treat that earlier action as having completed successfully/i);
  assert.match(systemText, /never describe it as still pending, not yet saved, or unconfirmed/i);
  assert.match(systemText, /never let it block, delay, or add a confirmation step in front of a new, unrelated action/i);
});

test('the availableActions branch\'s system prompt explicitly warns against recency/topic bias - a new message naming a different action always wins over what recent turns were about', async () => {
  const getBody = captureOpenAIRequest({ reply: 'ok', action: null });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => {
    await dockChat({ provider: 'openai', message: 'Create a Strategy called X.', language: 'en', availableActions: [{ id: 'strategy.create', requiredFields: ['name'], optionalFields: [] }] });
  });
  const systemText = getBody().input[0].content[0].text;
  assert.match(systemText, /do not default to whichever action recent turns happened to be about/i);
  assert.match(systemText, /always means that different action, in that different domain, not a continuation of the old one/i);
});

// --- provider isolation (section 42): OpenAI-only params never leak to other providers ---

test('reasoning/verbosity never appear in the actual outgoing request body for Anthropic, Kimi, or DeepSeek', async () => {
  const cases = [
    ['anthropic', 'ANTHROPIC_API_KEY', 'https://api.anthropic.com/v1/messages'],
    ['kimi', 'KIMI_API_KEY', 'https://api.moonshot.cn/v1/chat/completions'],
    ['deepseek', 'DEEPSEEK_API_KEY', 'https://api.deepseek.com/chat/completions']
  ];
  for (const [provider, envKey, expectedUrl] of cases) {
    let seenBody = null, seenUrl = null;
    globalThis.fetch = async (url, options) => {
      if (String(url).includes(HEALTH_EVENT_URL)) return neutralHealthEventResponse;
      seenUrl = String(url);
      seenBody = JSON.parse(options.body);
      if (provider === 'anthropic') return { ok: true, json: async () => ({ content: [{ type: 'tool_use', input: { reply: 'ok', action: null } }], usage: { input_tokens: 1, output_tokens: 1 } }) };
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ reply: 'ok', action: null }) } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }) };
    };
    await withEnv({ [envKey]: 'test-key' }, async () => {
      await dockChat({ provider, message: 'hi', language: 'en', availableActions: [{ id: 'session.create', requiredFields: [], optionalFields: [] }] });
    });
    assert.equal(seenUrl, expectedUrl, provider + ' must hit its own real endpoint');
    assert.equal(seenBody.reasoning, undefined, provider + ' must never receive the OpenAI-only reasoning param');
    const jsonStr = JSON.stringify(seenBody);
    assert.ok(jsonStr.indexOf('verbosity') === -1, provider + ' must never receive the OpenAI-only text.verbosity param');
  }
});

// --- Journey E: voice-sourced turns get a separate, shorter spoken reply (found via real E0
// browser testing: a full written-Q&A-length reply read back verbatim via TTS ran past a minute -
// see DOCK_STYLE_INSTRUCTION/voiceInstruction and dockChatFormatFor()'s voiceSource param) ---

test('a plain text turn (no source, or source !== "voice") never asks for voiceReply and never returns one', async () => {
  const getBody = captureOpenAIRequest({ reply: 'a full written answer', action: null });
  const result = await withEnv({ OPENAI_API_KEY: 'test-key' }, () =>
    dockChat({ provider: 'openai', message: 'What is a Session?', language: 'en' }));
  const body = getBody();
  assert.equal(body.text.format.schema.required.includes('voiceReply'), false);
  assert.equal(body.text.format.schema.properties.voiceReply, undefined);
  assert.equal(result.voiceReply, null);
});

test('a voice-sourced turn (source: "voice") requires voiceReply in the schema, adds the spoken-reply instruction, and passes it through in the result', async () => {
  const getBody = captureOpenAIRequest({ reply: 'a full written answer', voiceReply: 'a short spoken version', action: null });
  const result = await withEnv({ OPENAI_API_KEY: 'test-key' }, () =>
    dockChat({ provider: 'openai', message: 'What can I do in the positions panel?', language: 'en', source: 'voice' }));
  const body = getBody();
  assert.ok(body.text.format.schema.required.includes('voiceReply'));
  assert.equal(body.text.format.schema.properties.voiceReply.type, 'string');
  const systemText = body.input[0].content[0].text;
  assert.match(systemText, /read aloud/i);
  assert.match(systemText, /noticeably shorter than reading `reply` verbatim/i);
  assert.equal(result.reply, 'a full written answer');
  assert.equal(result.voiceReply, 'a short spoken version');
});

test('a voice-sourced turn applies only an allowlisted character delivery frame, preserving the one approved chat decision path', async () => {
  const getBody = captureOpenAIRequest({ reply: 'A plan.', voiceReply: 'A plan.' });
  const result = await withEnv({ OPENAI_API_KEY: 'test-key' }, () => dockChat({ language: 'en', message: 'Help me plan this', source: 'voice', character: 'sage', chatHistory: [], provider: 'openai' }));
  assert.equal(result.provider, 'openai');
  const body = getBody();
  const systemText = body.input[0].content[0].text;
  assert.match(systemText, /You are speaking as the Market Sage/);
  assert.match(systemText, /preserve every fact, number, safety warning, and required confirmation/);
});

test('a Gemini Voice turn reads the saved role interaction rule while an OpenAI Voice turn remains on its own transport profile', async () => {
  __resetAdminGeminiVoiceProfileCacheForTests();
  const getBody = captureOpenAIRequest({ reply: 'ok', voiceReply: 'ok', action: null });
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes('/internal/admin-gemini-voice-profiles')) {
      return { ok: true, json: async () => [{ character: 'sage', voiceMale: 'Sadaltager', voiceFemale: 'Sulafat', speechRule: 'Warm voice.', interactionRule: 'Teach one calm lesson before the next action.' }] };
    }
    return original(url, options);
  };
  await withEnv({ OPENAI_API_KEY: 'test-key' }, () =>
    dockChat({ provider: 'openai', message: 'help me plan', language: 'en', source: 'voice', voiceTransport: 'gemini', character: 'sage' }));
  assert.match(getBody().input[0].content[0].text, /Teach one calm lesson before the next action/);
  __resetAdminGeminiVoiceProfileCacheForTests();
});

// Persian Voice Quality gate, section 9-11: voiceReply was previously only ever told to be
// "shorter" - never told written and spoken Persian are different registers. This addendum is
// deliberately scoped to language 'fa' only (section 32/33: EN/AR/ES must be byte-for-byte
// unaffected).
test('a Persian voice-sourced turn gets the extra natural-spoken-Persian style instruction; English/Arabic/Spanish do not', async () => {
  const getBodyFa = captureOpenAIRequest({ reply: 'ok', voiceReply: 'ok', action: null });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, () =>
    dockChat({ provider: 'openai', message: 'یه سوال دارم', language: 'fa', source: 'voice' }));
  const systemTextFa = getBodyFa().input[0].content[0].text;
  assert.match(systemTextFa, /contemporary Iranian Persian/);
  assert.match(systemTextFa, /never a fact, a trading number, a safety warning, or a confirmation requirement/);

  for (const language of ['en', 'ar', 'es']) {
    const getBody = captureOpenAIRequest({ reply: 'ok', voiceReply: 'ok', action: null });
    await withEnv({ OPENAI_API_KEY: 'test-key' }, () =>
      dockChat({ provider: 'openai', message: 'hello', language, source: 'voice' }));
    const systemText = getBody().input[0].content[0].text;
    assert.doesNotMatch(systemText, /contemporary Iranian Persian/, `${language} must not receive the Persian-only style instruction`);
  }
});

// Found via real Journey E voice testing in Arabic: a session-city field value came back
// transliterated ("نيويورك") instead of NAVRYA's own canonical English form ("New York"), which
// the client's normalizeSessionCity() then correctly refuses (never applies a value the real
// dropdown wouldn't accept) but silently drops the field instead of filling it - the user has to
// repeat themselves. Applies to both the activeProcess and availableActions branches, since both
// extract field values.
test('both the activeProcess and availableActions branches instruct the model to keep fixed-choice field values in their canonical English form, not translated/transliterated into the reply language', async () => {
  const getBody1 = captureOpenAIRequest({ reply: 'ok', action: null });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, () =>
    dockChat({ provider: 'openai', message: 'استخدم نيويورك', language: 'ar', availableActions: [{ id: 'session.create', requiredFields: ['city'], optionalFields: [] }] }));
  assert.match(getBody1().input[0].content[0].text, /canonical English form/i);

  const getBody2 = captureOpenAIRequest({ reply: 'ok', suggestions: [] });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, () =>
    dockChat({ provider: 'openai', message: 'نيويورك', language: 'ar', activeProcess: { id: 'session-create', allowlist: ['city'] } }));
  assert.match(getBody2().input[0].content[0].text, /canonical English form/i);
});

// Found via real E1 voice testing: a spoken self-correction ("fifteen minutes... no, five
// minutes") produced a reply that correctly named the corrected value ("5m") but a structured
// suggestion that still held the superseded first value ("15m") - the two must never disagree.
test('both branches instruct the model to resolve a self-correcting message to only the final value, and to keep the reply text and any extracted field value in agreement', async () => {
  const getBody1 = captureOpenAIRequest({ reply: 'ok', action: null });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, () =>
    dockChat({ provider: 'openai', message: '15 minutes, no, 5 minutes', language: 'en', availableActions: [{ id: 'session.create', requiredFields: ['timeframe'], optionalFields: [] }] }));
  assert.match(getBody1().input[0].content[0].text, /final, corrected value/i);

  const getBody2 = captureOpenAIRequest({ reply: 'ok', suggestions: [] });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, () =>
    dockChat({ provider: 'openai', message: '15 minutes, no, 5 minutes', language: 'en', activeProcess: { id: 'session-create', allowlist: ['timeframe'] } }));
  assert.match(getBody2().input[0].content[0].text, /final, corrected value/i);
});

test('voiceReply is requested in the activeProcess (open-form) branch too, since its own reply can still occasionally be full Q&A-length', async () => {
  const getBody = captureOpenAIRequest({ reply: 'ok', voiceReply: 'ok', suggestions: [] });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, () =>
    dockChat({ provider: 'openai', message: 'New York', language: 'en', activeProcess: { id: 'session-create', allowlist: ['city'] }, source: 'voice' }));
  const body = getBody();
  assert.ok(body.text.format.schema.required.includes('voiceReply'));
});
