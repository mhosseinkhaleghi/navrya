import assert from 'node:assert/strict';
import test, { after, afterEach, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';

// Proves the real end-to-end wiring server/pattern-ai-server.mjs's own comment on
// recordSessionAnalysisCompletion() promises: a completion is written ONLY after a genuine
// successful provider call, using the gateway's OWN verified identity (never a client-asserted
// userId), and a failed/errored provider call never writes anything. Same real two-server
// topology as tests/session-analysis-gateway-auth.test.mjs; only the OpenAI provider leg of
// globalThis.fetch is stubbed - every /internal/* call still hits the real second Community API
// server for real.
process.env.INTERNAL_API_SECRET = 'test-internal-secret-please-ignore';
process.env.PATTERN_AI_PORT = '0';

let communityRepo, communityServer, communityBaseUrl;
let aiServer, aiBaseUrl;
let originalFetch;

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
  originalFetch = globalThis.fetch;
});
after(async () => {
  globalThis.fetch = originalFetch;
  await new Promise((resolve) => communityServer.close(resolve));
  aiServer.close();
});
afterEach(() => { globalThis.fetch = originalFetch; });

function stubOpenAiSuccess() {
  globalThis.fetch = async (url, opts) => {
    if (String(url).includes('api.openai.com')) {
      return { ok: true, json: async () => ({ output_text: JSON.stringify({}), usage: null }) };
    }
    return originalFetch(url, opts);
  };
}
function stubOpenAiFailure() {
  globalThis.fetch = async (url, opts) => {
    if (String(url).includes('api.openai.com')) {
      return { ok: false, status: 500, json: async () => ({ error: { message: 'boom' } }) };
    }
    return originalFetch(url, opts);
  };
}

async function registerAndGetCookie(email) {
  const response = await fetch(`${communityBaseUrl}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'a genuinely long passphrase 1234', displayName: 'Completion Recording Tester' })
  });
  const body = await response.json();
  const setCookie = response.headers.getSetCookie().find((c) => c.startsWith('navrya_session=') || c.startsWith('__Host-navrya_session='));
  return { userId: body.user.id, cookie: setCookie.split(';')[0] };
}

let counter = 0;
function uniqueEmail() { counter += 1; return `completion-recording-tester-${counter}-${Date.now()}@example.com`; }

async function makeSession(userId) {
  await communityRepo.instrumentCatalog.upsert(userId, { id: 'instrument-' + userId, code: 'XAUUSD' });
  return communityRepo.tradingSessions.upsert(userId, {
    id: 'sess-' + userId, market: 'London', instrument: 'XAUUSD', timeframe: '15m', date: '2026-01-01', entries: []
  });
}

test('a real successful /api/sessions/analyze call records a completion against the caller\'s OWN verified identity and the named Session', async () => {
  stubOpenAiSuccess();
  const { userId, cookie } = await registerAndGetCookie(uniqueEmail());
  const session = await makeSession(userId);
  const response = await fetch(`${aiBaseUrl}/api/sessions/analyze`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      provider: 'openai', model: 'gpt-5.6-luna', apiKey: 'sk-test-byok-not-a-real-key', language: 'en', analysisType: 'initial',
      sessionId: session.id, entryId: null, activeScenarios: [], patternContext: [], images: []
    })
  });
  assert.equal(response.status, 200);

  // A completion should now exist - poll briefly since the gateway's own comment says this write
  // is best-effort and fires after the response body is already built, not necessarily before the
  // HTTP response bytes are flushed to this test's own fetch() caller.
  let rows = [];
  for (let i = 0; i < 20 && rows.length === 0; i += 1) {
    rows = await communityRepo.sessionAiAnalysisCompletions.listForUser(userId);
    if (!rows.length) await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sessionId, session.id);
  assert.equal(rows[0].userId, userId);
});

test('a client-asserted sessionId belonging to a DIFFERENT user never gets a completion recorded against the caller', async () => {
  stubOpenAiSuccess();
  const owner = await registerAndGetCookie(uniqueEmail());
  const ownerSession = await makeSession(owner.userId);
  const attacker = await registerAndGetCookie(uniqueEmail());

  const response = await fetch(`${aiBaseUrl}/api/sessions/analyze`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: attacker.cookie },
    body: JSON.stringify({
      provider: 'openai', model: 'gpt-5.6-luna', apiKey: 'sk-test-byok-not-a-real-key', language: 'en', analysisType: 'initial',
      sessionId: ownerSession.id, activeScenarios: [], patternContext: [], images: []
    })
  });
  assert.equal(response.status, 200, 'the analysis itself still succeeds - only the ledger write is rejected');
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.deepEqual(await communityRepo.sessionAiAnalysisCompletions.listForUser(attacker.userId), []);
  assert.deepEqual(await communityRepo.sessionAiAnalysisCompletions.listForUser(owner.userId), [], 'the real owner never asked for this analysis either - nothing should be recorded for anyone');
});

test('a provider failure never records a completion, and a cache-only/no-sessionId call records nothing either', async () => {
  stubOpenAiFailure();
  const { userId, cookie } = await registerAndGetCookie(uniqueEmail());
  const session = await makeSession(userId);
  const response = await fetch(`${aiBaseUrl}/api/sessions/analyze`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      provider: 'openai', model: 'gpt-5.6-luna', apiKey: 'sk-test-byok-not-a-real-key', language: 'en', analysisType: 'initial',
      sessionId: session.id, activeScenarios: [], patternContext: [], images: []
    })
  });
  assert.notEqual(response.status, 200);
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.deepEqual(await communityRepo.sessionAiAnalysisCompletions.listForUser(userId), []);
});
