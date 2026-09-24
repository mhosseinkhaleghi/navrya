import assert from 'node:assert/strict';
import test, { after, afterEach } from 'node:test';

// Market Engineer Character Interaction Policy: server-side gear resolution, extending
// server/pattern-ai-server.mjs's existing CHARACTER_GEAR_INSTRUCTION/characterDeliveryGear -
// mirrors tests/commander-character-server-prompt.test.mjs's conventions.
// The AI server binds its port on import; every test process that imports it must use an ephemeral
// port (the convention tests/ai-gateway-auth.test.mjs and 15 others follow) or parallel test files
// collide on the default 8787 (EADDRINUSE crashes the later file).
process.env.PATTERN_AI_PORT = '0';
const serverModule = await import('../server/pattern-ai-server.mjs');
const { dockChat } = serverModule;
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

// Records every provider request (health events excluded) so a test can also assert HOW MANY model
// calls one turn made.
function captureOpenAIRequests(replyPayload) {
  const bodies = [];
  globalThis.fetch = async (url, options) => {
    if (String(url).includes(HEALTH_EVENT_URL)) return neutralHealthEventResponse;
    bodies.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ output_text: JSON.stringify(replyPayload), usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } }) };
  };
  return bodies;
}

async function systemTextFor(request, replyPayload) {
  const bodies = captureOpenAIRequests(replyPayload || { reply: 'ok', suggestions: [] });
  await withEnv({ OPENAI_API_KEY: 'test-key' }, async () => { await dockChat(Object.assign({ provider: 'openai', language: 'en' }, request)); });
  return { text: bodies[0].input[0].content[0].text, calls: bodies.length };
}

const FORM = { id: 'session-create', allowlist: ['city'], nextQuestion: { path: 'city', label: 'City', role: 'editable' } };
const GATE = { id: 'strategy-delete-confirm', allowlist: ['confirm'], nextQuestion: { path: 'confirm', label: 'Confirm delete', role: 'gate' } };
const PSYCHOLOGY = { id: 'mh-intake', allowlist: ['intake.demographics.maritalStatus'] };

// ---- Engineer gears ----

test('Engineer on a plain text turn gets SYSTEMS/NORMAL gear: technical partner, user is the owner, causality first', async () => {
  const { text } = await systemTextFor({ message: 'hi', character: 'engineer' });
  assert.match(text, /speaking as Market Engineer/);
  assert.match(text, /system owner and decision-maker, never a student/i);
  assert.match(text, /observation, then its cause and consequence/i);
  assert.match(text, /preserve every fact, number, safety warning, and required confirmation/);
});

test('Engineer NORMAL gear states there is NO signature address term (never "رفیق" or "قربان") - personality is how it thinks', async () => {
  const { text } = await systemTextFor({ message: 'hi', character: 'engineer' });
  assert.match(text, /no signature address term \(never "رفیق" or "قربان"\)/i);
});

test('Engineer + an open, non-gate form field gets DEBUG/FOCUSED gear: compact, fact-first, one variable at a time', async () => {
  const { text } = await systemTextFor({ message: 'New York', character: 'engineer', activeProcess: FORM });
  assert.match(text, /debug mode/i);
  assert.match(text, /one question at a time/i);
  assert.match(text, /Isolate one variable at a time/i);
  assert.doesNotMatch(text, /post-mortem mode/i);
});

test('Engineer + a gate field gets NEUTRAL gear: no debug/system metaphor, no humor, no technical flourish', async () => {
  const { text } = await systemTextFor({ message: 'yes', character: 'engineer', activeProcess: GATE });
  assert.match(text, /this is a confirmation step/i);
  assert.match(text, /no debug or system metaphor, no humor/i);
  assert.doesNotMatch(text, /brilliant technical partner/i);
  assert.doesNotMatch(text, /debug mode/i);
});

test('Engineer + a psychology process gets POST-MORTEM/HUMAN_MOMENT gear and explicitly never treats a feeling or the person as a bug/variable', async () => {
  const { text } = await systemTextFor({ message: 'x', character: 'engineer', activeProcess: PSYCHOLOGY });
  assert.match(text, /post-mortem mode/i);
  assert.match(text, /Never treat a feeling or the person as a bug, variable, or system to debug or optimize/i);
  assert.match(text, /hypothesis from execution from result/i);
  assert.doesNotMatch(text, /debug mode/i);
});

test('Engineer on a fresh action-discovery turn (availableActions, no activeProcess) gets the same NORMAL gear as plain Q&A', async () => {
  const { text } = await systemTextFor({ message: 'start a session', character: 'engineer', availableActions: [{ id: 'session.create', requiredFields: ['city'], optionalFields: [] }] });
  assert.match(text, /brilliant technical partner/i);
});

test('humor is scoped away from serious contexts: only NORMAL mentions "dry-witty"; DEBUG/POST-MORTEM/NEUTRAL never do', async () => {
  const normal = (await systemTextFor({ message: 'hi', character: 'engineer' })).text;
  assert.match(normal, /dry-witty in small doses/i);
  for (const activeProcess of [FORM, GATE, PSYCHOLOGY]) {
    const { text } = await systemTextFor({ message: 'x', character: 'engineer', activeProcess });
    assert.doesNotMatch(text, /dry-witty/i);
  }
});

// ---- other characters unchanged ----

test('Hunter and Commander gear text is unchanged by the Engineer gate, and neither leaks Engineer wording', async () => {
  const hunter = (await systemTextFor({ message: 'hi', character: 'hunter' })).text;
  assert.match(hunter, /speaking as Hunter/);
  assert.match(hunter, /fast, observant field partner/i);
  assert.doesNotMatch(hunter, /Market Engineer/);
  const commander = (await systemTextFor({ message: 'hi', character: 'commander' })).text;
  assert.match(commander, /speaking as Commander/);
  assert.match(commander, /the user remains the command authority/i);
  assert.doesNotMatch(commander, /Market Engineer/);
});

test('Sage stays voice-only and unchanged: no style on a text turn, its own original one-line style on a voice turn', async () => {
  const textTurn = (await systemTextFor({ message: 'hi', character: 'sage' })).text;
  assert.doesNotMatch(textTurn, /speaking as/);
  const voiceTurn = (await systemTextFor({ message: 'hi', character: 'sage', source: 'voice' }, { reply: 'ok', voiceReply: 'ok' })).text;
  assert.match(voiceTurn, /You are speaking as the Market Master/);
});

test('Engineer is no longer voice-only: it gets its gear on a text turn too, and the old one-line voice style is replaced (not stacked) on a voice turn', async () => {
  const voiceTurn = (await systemTextFor({ message: 'hi', character: 'engineer', source: 'voice' }, { reply: 'ok', voiceReply: 'ok' })).text;
  assert.match(voiceTurn, /speaking as Market Engineer/);
  assert.doesNotMatch(voiceTurn, /You are speaking as the Market Engineer:/, 'the legacy one-line style must not stack on top of the gear paragraph');
});

// ---- no new business logic / no context expansion / no extra model call / bounded prompt size ----

test('the ONLY difference between an Engineer prompt and a no-style prompt is one appended gear paragraph - no extra context, data, or business instruction', async () => {
  const gearCases = [
    { name: 'NORMAL', request: { message: 'hi' } },
    { name: 'FOCUSED', request: { message: 'New York', activeProcess: FORM } },
    { name: 'NEUTRAL', request: { message: 'yes', activeProcess: GATE } },
    { name: 'HUMAN_MOMENT', request: { message: 'x', activeProcess: PSYCHOLOGY } }
  ];
  for (const { name, request } of gearCases) {
    const base = (await systemTextFor(Object.assign({ character: 'sage' }, request))).text;
    const engineer = (await systemTextFor(Object.assign({ character: 'engineer' }, request))).text;
    assert.ok(engineer.startsWith(base), `${name}: Engineer prompt must be the unstyled prompt plus a suffix`);
    const suffix = engineer.slice(base.length);
    assert.match(suffix, /^ You are speaking as Market Engineer/, name);
    assert.match(suffix, / This changes tone and framing only: preserve every fact, number, safety warning, and required confirmation\.$/, name);
  }
});

test('an Engineer turn makes exactly one model call - the policy adds no second call of any kind', async () => {
  for (const request of [{ message: 'hi' }, { message: 'New York', activeProcess: FORM }, { message: 'yes', activeProcess: GATE }]) {
    const { calls } = await systemTextFor(Object.assign({ character: 'engineer' }, request));
    assert.equal(calls, 1);
  }
});

test('deterministic form contracts still reach the model unchanged for Engineer: real display order, gate semantics, and direct-write policy', async () => {
  const { text } = await systemTextFor({ message: 'New York', character: 'engineer', activeProcess: FORM });
  assert.match(text, /in the form's own real display order/i);
  assert.match(text, /do not skip ahead to a different field/i);
  assert.match(text, /A separate, real confirmation step outside your control still applies to credentials, payment, destructive\/delete, and publish\/send actions/i);
});

test('every Engineer gear paragraph is compact (bounded prompt-size impact): each stays under 700 characters', async () => {
  const gearCases = [{ message: 'hi' }, { message: 'New York', activeProcess: FORM }, { message: 'yes', activeProcess: GATE }, { message: 'x', activeProcess: PSYCHOLOGY }];
  for (const request of gearCases) {
    const base = (await systemTextFor(Object.assign({ character: 'sage' }, request))).text;
    const engineer = (await systemTextFor(Object.assign({ character: 'engineer' }, request))).text;
    const added = engineer.length - base.length;
    assert.ok(added > 0 && added < 700, `added ${added} chars`);
  }
});

test('the Engineer gear paragraphs contain no user data placeholders and no privacy-relevant terms (no psychology/trade/account data is ever pulled in for style)', async () => {
  for (const activeProcess of [undefined, FORM, GATE, PSYCHOLOGY]) {
    const base = (await systemTextFor({ message: 'hi', character: 'sage', activeProcess })).text;
    const suffix = (await systemTextFor({ message: 'hi', character: 'engineer', activeProcess })).text.slice(base.length);
    assert.doesNotMatch(suffix, /===|USER DATA|LIVE STATE|balance|password|api ?key|token/i);
  }
});
