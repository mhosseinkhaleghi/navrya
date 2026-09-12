import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test, { after, before, afterEach } from 'node:test';
import { WebSocket, WebSocketServer } from 'ws';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';

process.env.INTERNAL_API_SECRET = 'test-internal-secret-please-ignore';
process.env.PATTERN_AI_PORT = '0';

let communityServer, communityBaseUrl, aiServer, aiBaseUrl, upstreamServer, upstreamUrl;
const originalFetch = globalThis.fetch;

before(async () => {
  upstreamServer = new WebSocketServer({ port: 0 });
  await new Promise((resolve) => upstreamServer.once('listening', resolve));
  upstreamUrl = `ws://127.0.0.1:${upstreamServer.address().port}/gemini-live`;
  process.env.GEMINI_LIVE_SOCKET_UPSTREAM = upstreamUrl;

  communityServer = createApp({ repo: createMemoryRepo(), uploadsDir: '/tmp' }).listen(0);
  await new Promise((resolve) => communityServer.once('listening', resolve));
  communityBaseUrl = `http://127.0.0.1:${communityServer.address().port}`;
  process.env.COMMUNITY_API_URL = communityBaseUrl;

  const aiModule = await import('../server/pattern-ai-server.mjs');
  aiServer = aiModule.default;
  if (!aiServer.listening) await new Promise((resolve) => aiServer.once('listening', resolve));
  aiBaseUrl = `http://127.0.0.1:${aiServer.address().port}`;
  process.env.ALLOWED_ORIGINS = aiBaseUrl;
});

afterEach(() => { globalThis.fetch = originalFetch; });
after(async () => {
  globalThis.fetch = originalFetch;
  await Promise.all([
    new Promise((resolve) => communityServer.close(resolve)),
    new Promise((resolve) => aiServer.close(resolve)),
    new Promise((resolve) => upstreamServer.close(resolve))
  ]);
});

async function register() {
  const response = await fetch(`${communityBaseUrl}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `gemini-relay-${Date.now()}-${Math.random()}@example.com`, password: 'a genuinely long passphrase 1234', displayName: 'Gemini Relay Tester' })
  });
  const cookie = response.headers.getSetCookie().find((value) => value.startsWith('navrya_session=') || value.startsWith('__Host-navrya_session='));
  return cookie.split(';')[0];
}

async function mint(cookie) {
  const token = `auth_tokens/test_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  globalThis.fetch = async (url, options) => {
    if (String(url) === 'https://generativelanguage.googleapis.com/v1beta/auth_tokens') {
      return new Response(JSON.stringify({ name: token, expireTime: new Date(Date.now() + 30 * 60 * 1000).toISOString() }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return originalFetch(url, options);
  };
  try {
    const response = await fetch(`${aiBaseUrl}/api/ai/gemini-live/session`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ language: 'fa', apiKey: 'test-gemini-key-not-real' })
    });
    assert.equal(response.status, 200);
    return response.json();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function connect(url, cookie) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, { headers: { Cookie: cookie, Origin: aiBaseUrl } });
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

test('a real authenticated Gemini token is relayed over NAVRYA origin and Gemini messages pass bidirectionally', async () => {
  const cookie = await register();
  const creds = await mint(cookie);
  const upstreamReceived = new Promise((resolve) => {
    upstreamServer.once('connection', (socket, request) => {
      assert.equal(new URL(request.url, upstreamUrl).searchParams.get('access_token'), creds.token);
      socket.once('message', (data) => {
        resolve(JSON.parse(data.toString()));
        socket.send(JSON.stringify({ setupComplete: {} }));
      });
    });
  });

  const relayUrl = aiBaseUrl.replace(/^http/, 'ws') + `/api/ai/gemini-live/socket?access_token=${encodeURIComponent(creds.token)}`;
  const client = await connect(relayUrl, cookie);
  const reply = new Promise((resolve) => client.once('message', (data) => resolve(JSON.parse(data.toString()))));
  client.send(JSON.stringify({ setup: { model: `models/${creds.model}` } }));

  assert.deepEqual(await upstreamReceived, { setup: { model: `models/${creds.model}` } });
  assert.deepEqual(await reply, { setupComplete: {} });
  client.close();
});

test('a forged or replayed Gemini token cannot open the relay', async () => {
  const cookie = await register();
  const url = aiBaseUrl.replace(/^http/, 'ws') + '/api/ai/gemini-live/socket?access_token=auth_tokens%2Fnever_minted';
  const status = await new Promise((resolve) => {
    const socket = new WebSocket(url, { headers: { Cookie: cookie, Origin: aiBaseUrl } });
    socket.once('unexpected-response', (_request, response) => resolve(response.statusCode));
    socket.once('error', () => {});
  });
  assert.equal(status, 401);
});

test('a cross-site WebSocket origin is rejected before it can consume a valid lease', async () => {
  const cookie = await register();
  const creds = await mint(cookie);
  const url = aiBaseUrl.replace(/^http/, 'ws') + `/api/ai/gemini-live/socket?access_token=${encodeURIComponent(creds.token)}`;
  const status = await new Promise((resolve) => {
    const socket = new WebSocket(url, { headers: { Cookie: cookie, Origin: 'https://attacker.example' } });
    socket.once('unexpected-response', (_request, response) => resolve(response.statusCode));
    socket.once('error', () => {});
  });
  assert.equal(status, 403);
  const client = await connect(url, cookie);
  client.close();
});

test('the browser adapter uses the same-origin relay and contains no direct Google WebSocket endpoint', async () => {
  const source = await readFile(new URL('../navrya-src/geminiLiveVoice.js', import.meta.url), 'utf8');
  assert.match(source, /\/api\/ai\/gemini-live\/socket/);
  assert.doesNotMatch(source, /generativelanguage\.googleapis\.com\/ws/);
});

test('production passes the browser-origin allowlist to the AI gateway that owns the Gemini relay', async () => {
  const compose = await readFile(new URL('../docker-compose.production.yml', import.meta.url), 'utf8');
  const patternAiStart = compose.indexOf('\n  pattern-ai:');
  const communityApiStart = compose.indexOf('\n  community-api:');
  assert.ok(patternAiStart !== -1 && communityApiStart > patternAiStart, 'pattern-ai service block is missing');
  const patternAi = compose.slice(patternAiStart, communityApiStart);
  assert.match(patternAi, /\n\s+ALLOWED_ORIGINS:\s+\$\{ALLOWED_ORIGINS\}/);
});
