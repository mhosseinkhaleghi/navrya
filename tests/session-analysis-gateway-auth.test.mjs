import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';

// Adaptive AI Session Analysis - verifies /api/sessions/analyze and /api/sessions/visualize-
// scenario are real, dispatcher-wired routes on the AI gateway (not just exported functions),
// and that they sit behind the exact same real-session auth gate ADR-0001 section 6/7 requires
// of every other AI endpoint. Same two-real-server topology as tests/ai-gateway-auth.test.mjs.
process.env.INTERNAL_API_SECRET = 'test-internal-secret-please-ignore';
process.env.PATTERN_AI_PORT = '0';

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
});

async function registerAndGetCookie(email) {
  const response = await fetch(`${communityBaseUrl}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'a genuinely long passphrase 1234', displayName: 'Session Analysis Tester' })
  });
  const body = await response.json();
  const setCookie = response.headers.getSetCookie().find((c) => c.startsWith('navrya_session=') || c.startsWith('__Host-navrya_session='));
  return { userId: body.user.id, cookie: setCookie.split(';')[0] };
}

let counter = 0;
function uniqueEmail() { counter += 1; return `session-analysis-tester-${counter}-${Date.now()}@example.com`; }

test('an anonymous call to /api/sessions/analyze is rejected with AUTH_SESSION_REQUIRED, never reaching provider-calling logic', async () => {
  const response = await fetch(`${aiBaseUrl}/api/sessions/analyze`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: 'openai', analysisType: 'initial' })
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'AUTH_SESSION_REQUIRED');
});

test('an anonymous call to /api/sessions/visualize-scenario is rejected the same way', async () => {
  const response = await fetch(`${aiBaseUrl}/api/sessions/visualize-scenario`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({})
  });
  assert.equal(response.status, 401);
});

test('a real, valid session reaches the real analyzeSession handler (a clean *_API_KEY_MISSING with no key configured, never 401/404)', async () => {
  const { cookie } = await registerAndGetCookie(uniqueEmail());
  const response = await fetch(`${aiBaseUrl}/api/sessions/analyze`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ provider: 'openai', model: 'gpt-5.6-luna', language: 'en', analysisType: 'initial', activeScenarios: [], patternContext: [], images: [] })
  });
  assert.notEqual(response.status, 401);
  assert.notEqual(response.status, 404);
});

test('a real, valid session reaches the real visualizeScenario handler (CHART_IMAGE_REQUIRED with no image, never 401/404)', async () => {
  const { cookie } = await registerAndGetCookie(uniqueEmail());
  const response = await fetch(`${aiBaseUrl}/api/sessions/visualize-scenario`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ visualizationBrief: {}, language: 'en' })
  });
  assert.notEqual(response.status, 401);
  assert.notEqual(response.status, 404);
  assert.equal((await response.json()).error, 'CHART_IMAGE_REQUIRED');
});
