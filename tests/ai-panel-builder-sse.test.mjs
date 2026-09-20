import assert from 'node:assert/strict';
import test, { after, afterEach, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';

// End-to-end coverage of POST /api/ai/panel-builder/generate's SSE protocol, using the same
// real two-server topology (AI gateway <-> Community API over real HTTP) as
// tests/ai-gateway-wallet.test.mjs, rather than mocking the internal bridge - only the literal
// upstream provider fetch is faked. AI_WALLET_ENFORCED is deliberately left unset in this file so
// entitlement/wallet plumbing (already covered by tests/panel-studio-entitlement.test.mjs and
// tests/ai-gateway-wallet.test.mjs) never gates these tests - this file is about the SSE protocol
// and persistence-timing invariants only.
process.env.INTERNAL_API_SECRET = 'test-internal-secret-please-ignore';
process.env.PATTERN_AI_PORT = '0';
process.env.OPENAI_API_KEY = 'test-fake-openai-key';
process.env.ANTHROPIC_API_KEY = 'test-fake-anthropic-key';

let communityRepo, communityServer, communityBaseUrl;
let aiServer, aiBaseUrl;

before(async () => {
  communityRepo = createMemoryRepo();
  communityServer = createApp({ repo: communityRepo, uploadsDir: '/tmp' }).listen(0);
  await new Promise((resolve) => communityServer.once('listening', resolve));
  communityBaseUrl = `http://127.0.0.1:${communityServer.address().port}`;
  process.env.COMMUNITY_API_URL = communityBaseUrl;

  const aiModule = await import('../server/pattern-ai-server.mjs');
  aiServer = aiModule.default;
  if (!aiServer.listening) await new Promise((resolve) => aiServer.once('listening', resolve));
  aiBaseUrl = `http://127.0.0.1:${aiServer.address().port}`;
});
after(async () => {
  await new Promise((resolve) => communityServer.close(resolve));
  aiServer.close();
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
});

let counter = 0;
function uniqueEmail() { counter += 1; return `panel-sse-tester-${counter}-${Date.now()}@example.com`; }

// Every caller defaults to a plan that actually carries the real aiPanelBuilder entitlement
// (commercial-defaults.mjs: only 'personalized' ships aiPanelBuilder:true) - this file's other
// tests are about the SSE protocol/persistence-timing invariants, not the entitlement gate itself
// (see the dedicated entitlement tests below), so they must not incidentally exercise the gate.
// Pass plan:'free' explicitly to get a genuinely non-entitled user.
async function registerAndGetCookie({ plan = 'personalized' } = {}) {
  const response = await fetch(`${communityBaseUrl}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: uniqueEmail(), password: 'a genuinely long passphrase 1234', displayName: 'Panel SSE Tester' })
  });
  const body = await response.json();
  if (plan) await communityRepo.users.update(body.user.id, { plan });
  const setCookie = response.headers.getSetCookie().find((c) => c.startsWith('navrya_session=') || c.startsWith('__Host-navrya_session='));
  return { userId: body.user.id, cookie: setCookie.split(';')[0] };
}

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

function sseFrame(event, data) { return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`; }

// An abort-aware fake OpenAI Responses stream: delivers each part after a short delay, honoring
// the composed AbortSignal exactly like a real fetch would (errors the stream when the caller's
// signal fires), so a cancellation test can prove the server-side stream actually stops.
function installOpenAiStreamMock(parts, { delayMs = 5 } = {}) {
  globalThis.fetch = async (url, options) => {
    if (String(url) !== 'https://api.openai.com/v1/responses') return originalFetch(url, options);
    const signal = options.signal;
    if (signal && signal.aborted) { const e = new Error('The operation was aborted'); e.name = 'AbortError'; throw e; }
    let aborted = false;
    if (signal) signal.addEventListener('abort', () => { aborted = true; });
    const body = new ReadableStream({
      async start(controller) {
        for (const part of parts) {
          if (aborted) { controller.error(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })); return; }
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          if (aborted) { controller.error(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })); return; }
          controller.enqueue(new TextEncoder().encode(part));
        }
        controller.close();
      }
    });
    return { ok: true, status: 200, body };
  };
}

function deltaParts(chunks) { return chunks.map((c) => sseFrame('response.output_text.delta', { delta: c })); }
function completedPart(usage) { return sseFrame('response.completed', { response: { usage } }); }
const DEFAULT_USAGE = { input_tokens: 40, output_tokens: 20, total_tokens: 60 };

// Manual SSE client, mirroring exactly what the real browser client (fetch + response.body.getReader())
// will do - not EventSource, since this is a POST with a JSON body.
async function collectSseEvents(response, { onEvent } = {}) {
  const events = [];
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) > -1) {
      const rawFrame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      let eventName = 'message';
      const dataLines = [];
      rawFrame.split('\n').forEach((line) => {
        if (line.startsWith('event:')) eventName = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      });
      if (!dataLines.length) continue;
      const data = JSON.parse(dataLines.join('\n'));
      events.push({ event: eventName, data });
      if (onEvent) onEvent(eventName, data, reader);
    }
  }
  return events;
}

test('a request the target/prompt/provider validation rejects never opens an SSE stream at all - a plain 400 JSON', async () => {
  const { cookie } = await registerAndGetCookie();
  const badTarget = await fetch(`${aiBaseUrl}/api/ai/panel-builder/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ target: 'session.panel', prompt: 'x', provider: 'openai' })
  });
  assert.equal(badTarget.status, 400);
  assert.equal((await badTarget.json()).error, 'PANEL_STUDIO_TARGET_UNSUPPORTED');
  assert.notEqual(badTarget.headers.get('content-type'), 'text/event-stream; charset=utf-8');

  const emptyPrompt = await fetch(`${aiBaseUrl}/api/ai/panel-builder/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ target: 'dashboard.panel', prompt: '  ', provider: 'openai' })
  });
  assert.equal(emptyPrompt.status, 400);
  assert.equal((await emptyPrompt.json()).error, 'PANEL_STUDIO_PROMPT_REQUIRED');

  const badProvider = await fetch(`${aiBaseUrl}/api/ai/panel-builder/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ target: 'dashboard.panel', prompt: 'show my win rate', provider: 'gemini' })
  });
  assert.equal(badProvider.status, 400);
  assert.equal((await badProvider.json()).error, 'PANEL_STUDIO_PROVIDER_UNSUPPORTED');
});

test('happy path: started -> engine -> delta* -> validating -> complete, in order, and the revision is really persisted', async () => {
  installOpenAiStreamMock([...deltaParts(['<div id="x">', 'hello</div>']), completedPart(DEFAULT_USAGE)]);
  const { userId, cookie } = await registerAndGetCookie();

  const response = await fetch(`${aiBaseUrl}/api/ai/panel-builder/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ target: 'dashboard.panel', prompt: 'show my win rate', provider: 'openai', model: 'gpt-5.6-luna' })
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/event-stream; charset=utf-8');

  const events = await collectSseEvents(response);
  assert.deepEqual(events.map((e) => e.event), ['started', 'engine', 'delta', 'delta', 'validating', 'complete']);
  assert.ok(events[0].data.requestId);
  assert.deepEqual(events[1].data, { codingEngineId: 'codex', codingEngineLabel: 'Codex', provider: 'openai', model: 'gpt-5.6-luna' });
  assert.equal(events[2].data.text + events[3].data.text, '<div id="x">hello</div>');
  const complete = events[events.length - 1].data;
  assert.equal(complete.revision.source, '<div id="x">hello</div>');
  assert.equal(complete.revision.sourceKind, 'generated');
  assert.equal(complete.revision.codingEngineId, 'codex');
  assert.equal(complete.artifact.status, 'ready');
  assert.equal(complete.artifact.appliedRevisionId, null, 'generation alone must never apply the panel to the dashboard');

  const artifacts = await communityRepo.panelStudioArtifacts.listForUser(userId);
  assert.equal(artifacts.length, 1);
  assert.equal(artifacts[0].currentRevisionId, complete.revision.id);
});

test('cancellation: aborting the client connection mid-stream never reaches validating, and nothing is persisted', async () => {
  // Enough parts, with a real delay between them, that the test has a genuine window to abort
  // before the mock stream would otherwise complete on its own.
  installOpenAiStreamMock([...deltaParts(['<div>', 'partial', 'content', 'never', 'finishes', '</div>']), completedPart(DEFAULT_USAGE)], { delayMs: 40 });
  const { userId, cookie } = await registerAndGetCookie();

  const controller = new AbortController();
  const response = await fetch(`${aiBaseUrl}/api/ai/panel-builder/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ target: 'dashboard.panel', prompt: 'show my win rate', provider: 'openai' }),
    signal: controller.signal
  });

  let deltaCount = 0;
  await assert.rejects(() => collectSseEvents(response, {
    onEvent: (eventName) => {
      if (eventName === 'delta') {
        deltaCount += 1;
        if (deltaCount === 2) controller.abort();
      }
      assert.notEqual(eventName, 'validating', 'a cancelled stream must never reach validating');
      assert.notEqual(eventName, 'complete', 'a cancelled stream must never reach complete');
    }
  }));
  assert.ok(deltaCount >= 2, 'the test must actually have seen streamed deltas before cancelling');

  // Give the server a moment to actually process the disconnect and unwind.
  await new Promise((resolve) => setTimeout(resolve, 150));
  const artifacts = await communityRepo.panelStudioArtifacts.listForUser(userId);
  assert.equal(artifacts.length, 0, 'a cancelled generation must never create a persisted artifact/revision');
});

test('an honest unavailable refusal produces error:GENERATION_UNAVAILABLE and persists nothing', async () => {
  installOpenAiStreamMock([...deltaParts(['NAVRYA_UNAVAILABLE: no wallet data exists in this sandbox.']), completedPart(DEFAULT_USAGE)]);
  const { userId, cookie } = await registerAndGetCookie();
  const response = await fetch(`${aiBaseUrl}/api/ai/panel-builder/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ target: 'dashboard.panel', prompt: 'show my wallet balance', provider: 'openai' })
  });
  const events = await collectSseEvents(response);
  assert.deepEqual(events.map((e) => e.event), ['started', 'engine', 'delta', 'validating', 'error']);
  const errorEvent = events[events.length - 1];
  assert.equal(errorEvent.data.code, 'GENERATION_UNAVAILABLE');
  assert.equal((await communityRepo.panelStudioArtifacts.listForUser(userId)).length, 0);
});

test('an oversize generation produces error:GENERATION_TOO_LARGE and persists nothing', async () => {
  installOpenAiStreamMock([...deltaParts(['<div>' + 'x'.repeat(13 * 1024) + '</div>']), completedPart(DEFAULT_USAGE)]);
  const { userId, cookie } = await registerAndGetCookie();
  const response = await fetch(`${aiBaseUrl}/api/ai/panel-builder/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ target: 'dashboard.panel', prompt: 'a giant panel', provider: 'openai' })
  });
  const events = await collectSseEvents(response);
  assert.deepEqual(events.map((e) => e.event), ['started', 'engine', 'delta', 'validating', 'error']);
  assert.equal(events[events.length - 1].data.code, 'GENERATION_TOO_LARGE');
  assert.equal((await communityRepo.panelStudioArtifacts.listForUser(userId)).length, 0);
});

test('a genuine provider failure produces error:PROVIDER_ERROR before validating is ever reached', async () => {
  globalThis.fetch = async (url, options) => {
    if (String(url) !== 'https://api.openai.com/v1/responses') return originalFetch(url, options);
    return { ok: false, status: 500, json: async () => ({ error: { message: 'upstream exploded' } }) };
  };
  const { cookie } = await registerAndGetCookie();
  const response = await fetch(`${aiBaseUrl}/api/ai/panel-builder/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ target: 'dashboard.panel', prompt: 'show my win rate', provider: 'openai' })
  });
  const events = await collectSseEvents(response);
  assert.deepEqual(events.map((e) => e.event), ['started', 'engine', 'error']);
  assert.equal(events[events.length - 1].data.code, 'PROVIDER_ERROR');
});

test('a REVISION_CONFLICT from the persistence bridge surfaces as error:PERSIST_FAILED, never a complete event', async () => {
  installOpenAiStreamMock([...deltaParts(['<div>v1</div>']), completedPart(DEFAULT_USAGE)]);
  const { userId, cookie } = await registerAndGetCookie();
  const first = await fetch(`${aiBaseUrl}/api/ai/panel-builder/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ target: 'dashboard.panel', prompt: 'show my win rate', provider: 'openai' })
  });
  const firstEvents = await collectSseEvents(first);
  const artifactId = firstEvents[firstEvents.length - 1].data.artifact.id;

  installOpenAiStreamMock([...deltaParts(['<div>v2</div>']), completedPart(DEFAULT_USAGE)]);
  const conflicting = await fetch(`${aiBaseUrl}/api/ai/panel-builder/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    // Wrong baseRevisionId - the artifact's real current revision is not 'not-the-real-one'.
    body: JSON.stringify({ target: 'dashboard.panel', prompt: 'change it', provider: 'openai', artifactId, baseRevisionId: 'not-the-real-one' })
  });
  const events = await collectSseEvents(conflicting);
  assert.deepEqual(events.map((e) => e.event), ['started', 'engine', 'delta', 'validating', 'error']);
  assert.equal(events[events.length - 1].data.code, 'PERSIST_FAILED');

  const revisions = await communityRepo.panelStudioArtifacts.listRevisions(artifactId);
  assert.equal(revisions.length, 1, 'the conflicting generation must never have been appended to history');
});

// An abort-aware fake Anthropic Messages stream, mirroring installOpenAiStreamMock above but for
// the real Anthropic SSE event names (content_block_delta/message_start/message_delta) - proves
// the "Claude Code" coding-engine profile really drives a real streamed Anthropic call end to end,
// not just the OpenAI/"Codex" path every other test in this file exercises.
function installAnthropicStreamMock(parts, { delayMs = 0 } = {}) {
  globalThis.fetch = async (url, options) => {
    if (String(url) !== 'https://api.anthropic.com/v1/messages') return originalFetch(url, options);
    const signal = options.signal;
    if (signal && signal.aborted) { const e = new Error('The operation was aborted'); e.name = 'AbortError'; throw e; }
    let aborted = false;
    if (signal) signal.addEventListener('abort', () => { aborted = true; });
    const body = new ReadableStream({
      async start(controller) {
        for (const part of parts) {
          if (aborted) { controller.error(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })); return; }
          if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
          if (aborted) { controller.error(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })); return; }
          controller.enqueue(new TextEncoder().encode(part));
        }
        controller.close();
      }
    });
    return { ok: true, status: 200, body };
  };
}

test('Anthropic (Claude Code): started -> engine -> delta* -> validating -> complete over a real streamed /v1/messages call, and the revision is really persisted', async () => {
  installAnthropicStreamMock([
    sseFrame('message_start', { message: { usage: { input_tokens: 50 } } }),
    sseFrame('content_block_delta', { delta: { type: 'text_delta', text: '<div id="y">' } }),
    sseFrame('content_block_delta', { delta: { type: 'text_delta', text: 'claude says hi</div>' } }),
    sseFrame('message_delta', { usage: { output_tokens: 22 } })
  ]);
  const { userId, cookie } = await registerAndGetCookie();

  const response = await fetch(`${aiBaseUrl}/api/ai/panel-builder/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ target: 'dashboard.panel', prompt: 'show my win rate', provider: 'anthropic', model: 'claude-sonnet-4-5' })
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/event-stream; charset=utf-8');

  const events = await collectSseEvents(response);
  assert.deepEqual(events.map((e) => e.event), ['started', 'engine', 'delta', 'delta', 'validating', 'complete']);
  assert.deepEqual(events[1].data, { codingEngineId: 'claude-code', codingEngineLabel: 'Claude Code', provider: 'anthropic', model: 'claude-sonnet-4-5' });
  assert.equal(events[2].data.text + events[3].data.text, '<div id="y">claude says hi</div>');
  const complete = events[events.length - 1].data;
  assert.equal(complete.revision.source, '<div id="y">claude says hi</div>');
  assert.equal(complete.revision.codingEngineId, 'claude-code');
  assert.equal(complete.revision.provider, 'anthropic');

  const artifacts = await communityRepo.panelStudioArtifacts.listForUser(userId);
  assert.equal(artifacts.length, 1);
  assert.equal(artifacts[0].currentRevisionId, complete.revision.id);
});

// Issue: aiPanelBuilder must be gated independently of AI_WALLET_ENFORCED and BYOK. Before this
// fix, the ONLY place that ever checked the aiPanelBuilder feature flag was reserveForAiCall()
// (server/commercial/wallet-service.mjs), which the dispatcher only calls when
// `billedFeature && !isByok && aiWalletEnforced()` - so with wallet enforcement off (this file's
// own default, and any deployment that hasn't turned it on) or with a client-supplied apiKey, a
// Free-plan trader could reach real, billed provider calls this Studio's own plan matrix says they
// should never see. panelBuilderGenerate() now calls the entitlements bridge unconditionally,
// before writeSseHeaders/key-resolution/any provider request, regardless of either condition.
test('a non-entitled (free-plan) user is rejected with PANEL_STUDIO_NOT_ENTITLED before any SSE stream, even with BYOK, and even though AI_WALLET_ENFORCED is unset in this file', async () => {
  assert.notEqual(process.env.AI_WALLET_ENFORCED, 'true', 'this test only proves something real if wallet enforcement is genuinely off, matching this file\'s own default');
  const { cookie } = await registerAndGetCookie({ plan: 'free' });
  const response = await fetch(`${aiBaseUrl}/api/ai/panel-builder/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    // BYOK - a real-looking client-supplied key must never bypass the subscription feature gate.
    body: JSON.stringify({ target: 'dashboard.panel', prompt: 'show my win rate', provider: 'openai', apiKey: 'sk-test-byok-should-not-matter' })
  });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error, 'PANEL_STUDIO_NOT_ENTITLED');
  assert.notEqual(response.headers.get('content-type'), 'text/event-stream; charset=utf-8', 'a rejected-before-entitled request must never open an SSE stream');
});

test('an entitled user with AI_WALLET_ENFORCED unset and no BYOK key still clears the entitlement gate (proves the gate is not itself accidentally overzealous)', async () => {
  installOpenAiStreamMock([...deltaParts(['<div>ok</div>']), completedPart(DEFAULT_USAGE)]);
  const { cookie } = await registerAndGetCookie({ plan: 'personalized' });
  const response = await fetch(`${aiBaseUrl}/api/ai/panel-builder/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ target: 'dashboard.panel', prompt: 'show my win rate', provider: 'openai' })
  });
  assert.equal(response.status, 200);
  const events = await collectSseEvents(response);
  assert.equal(events[events.length - 1].event, 'complete');
});

// Issue: a generated dashboard panel's "revision context" (previousSource) must be server-loaded
// and ownership-verified, never a client-supplied string - a browser could otherwise smuggle
// arbitrary content into the model's own context, or read another trader's real panel source into
// a generation transcript, simply by claiming an artifactId it does not own.
test('a forged/foreign artifactId is rejected with PANEL_STUDIO_ARTIFACT_NOT_FOUND before any provider call, and never opens an SSE stream', async () => {
  installOpenAiStreamMock([...deltaParts(['<div>owner-only</div>']), completedPart(DEFAULT_USAGE)]);
  const { cookie: ownerCookie } = await registerAndGetCookie();
  const owned = await fetch(`${aiBaseUrl}/api/ai/panel-builder/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: ownerCookie },
    body: JSON.stringify({ target: 'dashboard.panel', prompt: 'show my win rate', provider: 'openai' })
  });
  const ownedEvents = await collectSseEvents(owned);
  const artifactId = ownedEvents[ownedEvents.length - 1].data.artifact.id;

  const { cookie: attackerCookie } = await registerAndGetCookie();
  const forged = await fetch(`${aiBaseUrl}/api/ai/panel-builder/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: attackerCookie },
    body: JSON.stringify({ target: 'dashboard.panel', prompt: 'change it', provider: 'openai', artifactId })
  });
  assert.equal(forged.status, 404);
  assert.equal((await forged.json()).error, 'PANEL_STUDIO_ARTIFACT_NOT_FOUND');
  assert.notEqual(forged.headers.get('content-type'), 'text/event-stream; charset=utf-8');
});

test('a revision request always carries the server-loaded current source in the model prompt, never a client-supplied previousSource', async () => {
  installOpenAiStreamMock([...deltaParts(['<div>v1</div>']), completedPart(DEFAULT_USAGE)]);
  const { cookie } = await registerAndGetCookie();
  const first = await fetch(`${aiBaseUrl}/api/ai/panel-builder/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ target: 'dashboard.panel', prompt: 'show my win rate', provider: 'openai' })
  });
  const firstEvents = await collectSseEvents(first);
  const artifactId = firstEvents[firstEvents.length - 1].data.artifact.id;
  const realSource = firstEvents[firstEvents.length - 1].data.revision.source;
  const baseRevisionId = firstEvents[firstEvents.length - 1].data.artifact.currentRevisionId;

  let capturedInstruction = null;
  globalThis.fetch = async (url, options) => {
    if (String(url) !== 'https://api.openai.com/v1/responses') return originalFetch(url, options);
    capturedInstruction = JSON.parse(options.body).input[0].content[0].text;
    const body = new ReadableStream({
      async start(controller) {
        controller.enqueue(new TextEncoder().encode(sseFrame('response.output_text.delta', { delta: '<div>v2</div>' })));
        controller.enqueue(new TextEncoder().encode(sseFrame('response.completed', { response: { usage: DEFAULT_USAGE } })));
        controller.close();
      }
    });
    return { ok: true, status: 200, body };
  };

  const revised = await fetch(`${aiBaseUrl}/api/ai/panel-builder/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      target: 'dashboard.panel', prompt: 'make it bigger', provider: 'openai', artifactId, baseRevisionId,
      previousSource: '<div>ATTACKER-INJECTED, must never reach the model</div>'
    })
  });
  const revisedEvents = await collectSseEvents(revised);
  assert.equal(revisedEvents[revisedEvents.length - 1].event, 'complete');
  assert.ok(capturedInstruction, 'the mocked provider call must actually have been reached');
  assert.ok(capturedInstruction.includes(realSource), 'the real, server-loaded current source must be in the prompt');
  assert.ok(!capturedInstruction.includes('ATTACKER-INJECTED'), 'a client-supplied previousSource must never reach the model');
});

// Issue: the post-stream cancellation race. A disconnect that lands AFTER the upstream provider
// stream has already fully completed (past every 'delta' event, at/after 'validating'), but before
// persistence finishes, must still never leave a revision behind - distinct from the existing
// mid-stream cancellation test above, which only proves a disconnect DURING streaming is safe.
test('post-stream-completion race: disconnecting after the upstream stream fully completes, but while persistence is still in flight, creates no revision', async () => {
  const { userId, cookie } = await registerAndGetCookie();
  let releasePersist;
  const persistGate = new Promise((resolve) => { releasePersist = resolve; });

  globalThis.fetch = async (url, options) => {
    if (String(url) === 'https://api.openai.com/v1/responses') {
      const body = new ReadableStream({
        async start(controller) {
          controller.enqueue(new TextEncoder().encode(sseFrame('response.output_text.delta', { delta: '<div>done</div>' })));
          controller.enqueue(new TextEncoder().encode(sseFrame('response.completed', { response: { usage: DEFAULT_USAGE } })));
          controller.close();
        }
      });
      return { ok: true, status: 200, body };
    }
    if (String(url).endsWith('/internal/panel-artifacts/revisions')) {
      // Holds the real internal persistence call open (never resolving on its own) until either
      // the test explicitly releases it, or the caller's own composed AbortSignal fires - exactly
      // like a real in-flight fetch would reject on abort. This gives the client's disconnect a
      // genuine window to land AFTER the whole upstream stream has already completed, proving this
      // is the post-stream race, not the already-covered mid-stream one.
      const signal = options.signal;
      await new Promise((resolve, reject) => {
        if (signal && signal.aborted) return reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));
        const onAbort = () => reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));
        if (signal) signal.addEventListener('abort', onAbort);
        persistGate.then(() => { if (signal) signal.removeEventListener('abort', onAbort); resolve(); });
      });
      return originalFetch(url, options);
    }
    return originalFetch(url, options);
  };

  const controller = new AbortController();
  const response = await fetch(`${aiBaseUrl}/api/ai/panel-builder/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ target: 'dashboard.panel', prompt: 'show my win rate', provider: 'openai' }),
    signal: controller.signal
  });

  let sawValidating = false;
  await assert.rejects(() => collectSseEvents(response, {
    onEvent: (eventName) => {
      if (eventName === 'validating' && !sawValidating) { sawValidating = true; controller.abort(); }
      assert.notEqual(eventName, 'complete', 'a stream aborted after validating must never still reach complete');
    }
  }));
  assert.ok(sawValidating, 'the test must actually have seen the upstream stream complete (validating) before disconnecting');

  // Give the server a moment to actually process the disconnect and unwind the held persistence call.
  await new Promise((resolve) => setTimeout(resolve, 200));
  releasePersist(); // defensive: release the gate in case anything is still (unexpectedly) waiting on it
  await new Promise((resolve) => setTimeout(resolve, 50));

  const artifacts = await communityRepo.panelStudioArtifacts.listForUser(userId);
  assert.equal(artifacts.length, 0, 'a disconnect that lands during persistence, even after the whole upstream stream already completed, must never leave a revision behind');
});
