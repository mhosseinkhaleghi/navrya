import assert from 'node:assert/strict';
import test, { after, afterEach } from 'node:test';

// Importing the server module has a real side effect: it calls server.listen(...) at
// module scope (this is intentional - server/pattern-ai-server.mjs is run directly via
// `npm run dev:api`). We close it in `after` so this test file's process can exit.
const serverModule = await import('../server/pattern-ai-server.mjs');
const { callProvider, callOpenAI, callAnthropic, callOpenAICompatible } = serverModule;
const server = serverModule.default;

after(() => { server.close(); });

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

// callProvider() now also fires a fire-and-forget health-event report to
// /internal/ai-health-event on every call (success or failure) - see reportProviderHealth() in
// server/pattern-ai-server.mjs. Tests below that capture "the" fetch call's url/body via a
// closure variable must ignore that second call, or it silently clobbers what they captured from
// the real provider call. This neutral stub is what each of those tests returns for it.
const HEALTH_EVENT_URL = '/internal/ai-health-event';
const neutralHealthEventResponse = { ok: true, json: async () => ({}) };

function withEnv(key, value, fn) {
  const original = process.env[key];
  if (value === undefined) delete process.env[key]; else process.env[key] = value;
  return Promise.resolve().then(fn).finally(() => {
    if (original === undefined) delete process.env[key]; else process.env[key] = original;
  });
}

test('falls back to the server env key when no client key is supplied', async () => {
  await withEnv('OPENAI_API_KEY', 'env-key-123', async () => {
    let seenAuth = null;
    globalThis.fetch = async (_url, options) => {
      if (String(_url).includes(HEALTH_EVENT_URL)) return neutralHealthEventResponse;
      seenAuth = options.headers.Authorization;
      return { ok: true, json: async () => ({ output_text: JSON.stringify({ reply: 'hi' }), usage: null }) };
    };
    await callProvider('openai', undefined, undefined, { input: [], text: { format: { schema: { required: [] } } } });
    assert.equal(seenAuth, 'Bearer env-key-123');
  });
});

test('a client-supplied key overrides the env default for that call only, and is not retained server-side afterward', async () => {
  await withEnv('OPENAI_API_KEY', 'env-key-abc', async () => {
    const seenAuths = [];
    globalThis.fetch = async (_url, options) => {
      if (String(_url).includes(HEALTH_EVENT_URL)) return neutralHealthEventResponse;
      seenAuths.push(options.headers.Authorization);
      return { ok: true, json: async () => ({ output_text: JSON.stringify({ ok: true }), usage: null }) };
    };
    await callProvider('openai', 'client-key-999', undefined, { input: [], text: { format: { schema: { required: [] } } } });
    await callProvider('openai', undefined, undefined, { input: [], text: { format: { schema: { required: [] } } } });
    assert.deepEqual(seenAuths, ['Bearer client-key-999', 'Bearer env-key-abc'], 'the client key must only be used for the call it was supplied on');
  });
});

test('maps OpenAI Responses usage into the normalized envelope', async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ output_text: JSON.stringify({ reply: 'hi' }), usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } }) });
  const result = await callProvider('openai', 'k', undefined, { input: [], text: { format: { schema: { required: [] } } } });
  assert.deepEqual(result.data, { reply: 'hi' });
  assert.deepEqual(result.usage, { promptTokens: 10, completionTokens: 5, totalTokens: 15 });
  assert.equal(result.provider, 'openai');
});

test('maps Anthropic tool-use output and computes totalTokens from input+output when the provider omits it', async () => {
  let calledUrl = null;
  globalThis.fetch = async (url) => {
    if (String(url).includes(HEALTH_EVENT_URL)) return neutralHealthEventResponse;
    calledUrl = url;
    return { ok: true, json: async () => ({ content: [{ type: 'tool_use', input: { reply: 'hello' } }], usage: { input_tokens: 20, output_tokens: 8 } }) };
  };
  const result = await callProvider('anthropic', 'anthropic-key', undefined, {
    input: [{ role: 'system', content: [{ type: 'input_text', text: 'sys' }] }, { role: 'user', content: [{ type: 'input_text', text: 'hi' }] }],
    text: { format: { name: 'x', schema: { required: ['reply'] } } }
  });
  assert.match(calledUrl, /anthropic\.com/);
  assert.deepEqual(result.data, { reply: 'hello' });
  assert.deepEqual(result.usage, { promptTokens: 20, completionTokens: 8, totalTokens: 28 }, 'Anthropic never reports total_tokens directly - it must be computed');
});

test('a Kimi/DeepSeek response missing a required schema key throws SCHEMA_VALIDATION_FAILED, not a fabricated field', async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ notTheRightKey: 1 }) } }], usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 } }) });
  await assert.rejects(
    () => callProvider('deepseek', 'deepseek-key', undefined, { input: [{ role: 'user', content: [{ type: 'input_text', text: 'hi' }] }], text: { format: { schema: { required: ['reply'] } } } }),
    /SCHEMA_VALIDATION_FAILED/
  );
});

test('DeepSeek drops unsupported image input and appends an honest note rather than silently ignoring it', async () => {
  let sentBody = null;
  globalThis.fetch = async (_url, options) => {
    if (String(_url).includes(HEALTH_EVENT_URL)) return neutralHealthEventResponse;
    sentBody = JSON.parse(options.body);
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ reply: 'ok' }) } }], usage: null }) };
  };
  await callProvider('deepseek', 'k', undefined, {
    input: [{ role: 'user', content: [{ type: 'input_text', text: 'look at this' }, { type: 'input_image', image_url: 'data:image/png;base64,AAAA' }] }],
    text: { format: { schema: { required: ['reply'] } } }
  });
  const lastMessage = sentBody.messages[sentBody.messages.length - 1];
  const text = typeof lastMessage.content === 'string' ? lastMessage.content : lastMessage.content.map((part) => part.text || '').join(' ');
  assert.match(text, /not supported by this provider/);
});

test('Anthropic treats an output_text part (a prior assistant turn) the same as input_text, rather than silently dropping it to empty', async () => {
  let sentBody = null;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes(HEALTH_EVENT_URL)) return neutralHealthEventResponse;
    sentBody = JSON.parse(options.body);
    return { ok: true, json: async () => ({ content: [{ type: 'tool_use', input: { reply: 'ok' } }], usage: { input_tokens: 1, output_tokens: 1 } }) };
  };
  await callProvider('anthropic', 'k', undefined, {
    input: [
      { role: 'user', content: [{ type: 'input_text', text: 'first question' }] },
      { role: 'assistant', content: [{ type: 'output_text', text: 'a prior reply' }] },
      { role: 'user', content: [{ type: 'input_text', text: 'follow-up' }] }
    ],
    text: { format: { name: 'x', schema: { required: ['reply'] } } }
  });
  const assistantMessage = sentBody.messages.find((m) => m.role === 'assistant');
  assert.deepEqual(assistantMessage.content, [{ type: 'text', text: 'a prior reply' }], 'the prior assistant turn\'s real text must reach Anthropic, not an empty string');
});

test('Kimi/DeepSeek (OpenAI-compatible) treats an output_text part the same as input_text, rather than silently dropping it', async () => {
  let sentBody = null;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes(HEALTH_EVENT_URL)) return neutralHealthEventResponse;
    sentBody = JSON.parse(options.body);
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ reply: 'ok' }) } }], usage: null }) };
  };
  await callProvider('deepseek', 'k', undefined, {
    input: [
      { role: 'user', content: [{ type: 'input_text', text: 'first question' }] },
      { role: 'assistant', content: [{ type: 'output_text', text: 'a prior reply' }] },
      { role: 'user', content: [{ type: 'input_text', text: 'follow-up' }] }
    ],
    text: { format: { schema: { required: ['reply'] } } }
  });
  const assistantMessage = sentBody.messages.find((m) => m.role === 'assistant');
  assert.equal(assistantMessage.content, 'a prior reply', 'the prior assistant turn\'s real text must reach the provider, not an empty string');
});

test('Kimi (vision-capable) keeps image input as an image_url content part instead of dropping it', async () => {
  let sentBody = null;
  globalThis.fetch = async (_url, options) => {
    if (String(_url).includes(HEALTH_EVENT_URL)) return neutralHealthEventResponse;
    sentBody = JSON.parse(options.body);
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ reply: 'ok' }) } }], usage: null }) };
  };
  await callProvider('kimi', 'k', undefined, {
    input: [{ role: 'user', content: [{ type: 'input_text', text: 'look at this' }, { type: 'input_image', image_url: 'data:image/png;base64,AAAA' }] }],
    text: { format: { schema: { required: ['reply'] } } }
  });
  const lastMessage = sentBody.messages[sentBody.messages.length - 1];
  assert.ok(Array.isArray(lastMessage.content), 'Kimi messages carry structured content when an image is attached');
  assert.ok(lastMessage.content.some((part) => part.type === 'image_url'));
});

test('an unknown/missing provider falls back to openai', async () => {
  await withEnv('OPENAI_API_KEY', 'env-key-fallback', async () => {
    let calledUrl = null;
    globalThis.fetch = async (url) => {
      if (String(url).includes(HEALTH_EVENT_URL)) return neutralHealthEventResponse;
      calledUrl = url;
      return { ok: true, json: async () => ({ output_text: JSON.stringify({ reply: 'x' }), usage: null }) };
    };
    const result = await callProvider('not-a-real-provider', undefined, undefined, { input: [], text: { format: { schema: { required: [] } } } });
    assert.equal(result.provider, 'openai');
    assert.match(calledUrl, /openai\.com/);
  });
});

test('throws a provider-specific *_API_KEY_MISSING error when no key is available from either the client or the environment', async () => {
  await withEnv('ANTHROPIC_API_KEY', undefined, async () => {
    await assert.rejects(
      () => callProvider('anthropic', undefined, undefined, { input: [], text: { format: { schema: { required: [] } } } }),
      /ANTHROPIC_API_KEY_MISSING/
    );
  });
});

test('callOpenAI/callAnthropic/callOpenAICompatible are exported directly for lower-level testing', () => {
  assert.equal(typeof callOpenAI, 'function');
  assert.equal(typeof callAnthropic, 'function');
  assert.equal(typeof callOpenAICompatible, 'function');
});

// --- Section 7.16 follow-up: per-provider health-event reporting ---

test('callProvider() reports a health event with ok:true, the real latency and source, on a successful call', async () => {
  const healthCalls = [];
  globalThis.fetch = async (url, options) => {
    if (String(url).includes(HEALTH_EVENT_URL)) { healthCalls.push(JSON.parse(options.body)); return neutralHealthEventResponse; }
    return { ok: true, json: async () => ({ output_text: JSON.stringify({ reply: 'hi' }), usage: null }) };
  };
  await callProvider('openai', 'k', undefined, { input: [], text: { format: { schema: { required: [] } } } }, 'test.source');
  assert.equal(healthCalls.length, 1, 'exactly one health event must be reported per callProvider() call');
  assert.equal(healthCalls[0].provider, 'openai');
  assert.equal(healthCalls[0].ok, true);
  assert.equal(healthCalls[0].errorCode, null);
  assert.equal(healthCalls[0].source, 'test.source');
  assert.equal(typeof healthCalls[0].latencyMs, 'number');
});

test('callProvider() reports a health event with ok:false and the real error code on a provider failure, and still rejects with the original error', async () => {
  const healthCalls = [];
  globalThis.fetch = async (url, options) => {
    if (String(url).includes(HEALTH_EVENT_URL)) { healthCalls.push(JSON.parse(options.body)); return neutralHealthEventResponse; }
    return { ok: false, status: 401, json: async () => ({ error: { message: 'bad key' } }) };
  };
  await assert.rejects(
    () => callProvider('openai', 'k', undefined, { input: [], text: { format: { schema: { required: [] } } } }, 'test.source'),
    /bad key/
  );
  assert.equal(healthCalls.length, 1);
  assert.equal(healthCalls[0].ok, false);
  assert.equal(healthCalls[0].errorCode, 'bad key');
});

test('callProvider() also reports a health event (ok:false, *_API_KEY_MISSING) when no key is available at all, before ever reaching a provider', async () => {
  const healthCalls = [];
  globalThis.fetch = async (url, options) => {
    if (String(url).includes(HEALTH_EVENT_URL)) { healthCalls.push(JSON.parse(options.body)); return neutralHealthEventResponse; }
    throw new Error('must never reach a provider fetch when no key resolved at all');
  };
  await withEnv('ANTHROPIC_API_KEY', undefined, async () => {
    await assert.rejects(() => callProvider('anthropic', undefined, undefined, { input: [], text: { format: { schema: { required: [] } } } }, 'test.source'));
  });
  assert.equal(healthCalls.length, 1);
  assert.equal(healthCalls[0].ok, false);
  assert.equal(healthCalls[0].errorCode, 'ANTHROPIC_API_KEY_MISSING');
});

test('a rejected/unreachable health-event report never delays or changes callProvider()\'s own result', async () => {
  globalThis.fetch = async (url) => {
    if (String(url).includes(HEALTH_EVENT_URL)) throw new Error('ECONNREFUSED - Community API not running');
    return { ok: true, json: async () => ({ output_text: JSON.stringify({ reply: 'hi' }), usage: null }) };
  };
  const result = await callProvider('openai', 'k', undefined, { input: [], text: { format: { schema: { required: [] } } } }, 'test.source');
  assert.deepEqual(result.data, { reply: 'hi' }, 'the real AI response must be returned unchanged even though the health report failed');
});
