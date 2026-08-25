import assert from 'node:assert/strict';
import test, { after, afterEach, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { authHeadersFor } from './helpers/auth-token.mjs';
import { createSession } from '../server/community/security/session-service.mjs';
import { issueCsrfToken } from '../server/community/security/csrf.mjs';
import { sessionCookieName, csrfCookieName } from '../server/community/security/cookies.mjs';
import { __resetRateLimitStoreForTests } from '../server/community/security/rate-limit.mjs';
import { __resetSecretCacheForTests } from '../server/community/security/secrets.mjs';

// Contract-level coverage for server/admin/routes.voice-providers.mjs, mirroring
// admin-api-contract.test.mjs's own createApp()/repo.memory.mjs convention - a real Express app,
// a real in-memory repo (so encryption/masking/FK-like behavior is exercised for real, not
// mocked), and a real session/CSRF pair per admin. Every ElevenLabs upstream call is intercepted
// via a global fetch stub (same pattern as tests/ai-elevenlabs-fa-voice-test.test.mjs) - this file
// never makes a real network call.

let server, baseUrl, repo;

before(async () => {
  delete process.env.ADMIN_AUTH_ENFORCED;
  __resetRateLimitStoreForTests();
  repo = createMemoryRepo();
  server = createApp({ repo, uploadsDir: '/tmp' }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

async function api(method, path, { body, userId, headers } = {}) {
  const reqHeaders = { 'Content-Type': 'application/json' };
  if (userId) Object.assign(reqHeaders, await authHeadersFor(repo, userId));
  Object.assign(reqHeaders, headers || {});
  const response = await fetch(baseUrl + path, { method, headers: reqHeaders, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function createUser(name) { return repo.users.create({ displayName: name }); }
async function createAdmin(name) {
  const user = await repo.users.create({ displayName: name });
  return repo.users.update(user.id, { role: 'admin' });
}
// A real admin session, but deliberately WITHOUT a fresh step-up (createSession's own reauth:false
// branch) - the one thing authHeadersFor's cached-session helper can never produce, since every
// session it mints is reauth-fresh by construction (see that helper's own comment). Needed to
// prove requireRecentReauth() actually rejects a stale-reauth admin, not just a non-admin.
async function staleReauthAdminHeaders(userId) {
  const { rawId, record } = await createSession(repo, { userId, reauth: false });
  const csrfToken = issueCsrfToken(record.id);
  return { Cookie: `${sessionCookieName()}=${rawId}; ${csrfCookieName()}=${csrfToken}`, 'x-csrf-token': csrfToken };
}

// Intercepts only https://api.elevenlabs.io/* calls, matched by real pathname (so /v1/user and
// /v1/user/subscription are never confused with each other via a naive prefix check). `routes` is
// {pathname: () => ({status, body}) | {status, body}}; an unmatched pathname 404s. Records every
// call's pathname (in order) so a test can assert exactly which upstream endpoints were/weren't hit.
function stubElevenLabs(routes) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(String(url), baseUrl);
    // Only intercept the real ElevenLabs origin - every other call (most importantly this same
    // test file's own api() helper calling the local Express app under test) must pass straight
    // through to the real fetch, or the test server itself becomes unreachable.
    if (parsed.origin !== 'https://api.elevenlabs.io') return originalFetch(url, options);
    calls.push(parsed.pathname);
    const handler = routes[parsed.pathname];
    const result = typeof handler === 'function' ? handler(options) : handler;
    if (!result) return { ok: false, status: 404, text: async () => '' };
    const status = result.status || 200;
    return {
      ok: status >= 200 && status < 300, status,
      text: async () => '',
      json: async () => result.body || {},
      arrayBuffer: async () => (result.buffer ? result.buffer.buffer.slice(result.buffer.byteOffset, result.buffer.byteOffset + result.buffer.byteLength) : new ArrayBuffer(0)),
      headers: { get: (name) => (result.headers || {})[name.toLowerCase()] || null }
    };
  };
  return calls;
}

async function createCredential(adminId, label = 'Primary ElevenLabs Account', apiKey = 'test-key-abcd1234') {
  const result = await api('POST', '/api/admin/voice-providers/credentials', { userId: adminId, body: { label, apiKey } });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return result.body;
}

// --- Authorization ---

test('a non-admin is rejected from every voice-providers route with ADMIN_ROLE_REQUIRED, never reaching the repo or ElevenLabs', async () => {
  const user = await createUser('Plain User');
  let called = false;
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith('https://api.elevenlabs.io')) { called = true; return { ok: false }; }
    return originalFetch(url, options);
  };
  const list = await api('GET', '/api/admin/voice-providers/credentials', { userId: user.id });
  assert.equal(list.status, 403);
  assert.equal(list.body.error, 'ADMIN_ROLE_REQUIRED');
  const create = await api('POST', '/api/admin/voice-providers/credentials', { userId: user.id, body: { label: 'x', apiKey: 'y' } });
  assert.equal(create.status, 403);
  assert.equal(called, false);
});

test('POST/PATCH/DELETE credentials require a fresh step-up reauth (401 STEP_UP_REQUIRED) even for a real admin whose session reauth has gone stale', async () => {
  const admin = await createAdmin('Stale Admin');
  const staleHeaders = await staleReauthAdminHeaders(admin.id);
  const create = await api('POST', '/api/admin/voice-providers/credentials', { headers: staleHeaders, body: { label: 'x', apiKey: 'y' } });
  assert.equal(create.status, 401);
  assert.equal(create.body.error, 'STEP_UP_REQUIRED');
});

// --- Credential CRUD, masking, encryption-at-rest ---

test('POST /credentials creates a credential whose response never includes apiKey - only a real keyHint (last 4 chars)', async () => {
  const admin = await createAdmin('Admin A');
  const record = await createCredential(admin.id, 'Primary', 'sk-verySECRETvalue9999');
  assert.equal(Object.prototype.hasOwnProperty.call(record, 'apiKey'), false);
  assert.equal(record.keyHint, '…9999');
  assert.equal(record.validationStatus, 'unknown');
});

// Found via real production testing: a pasted key that read back as "Invalid" turned out to carry
// invisible unicode (zero-width space/joiner, BOM, non-breaking space) that plain .trim() never
// strips - built from raw codepoints here, never a literal invisible character in this file's own
// source, for the same reason the fix itself avoids that (see repo.pg.mjs's sanitizeApiKey()).
test('a real key surrounded/interleaved with invisible unicode (zero-width space, BOM, non-breaking space) is stored and later used exactly as if those characters were never pasted', async () => {
  const admin = await createAdmin('Admin A2');
  const invisible = [0x200B, 0x200C, 0x200D, 0xFEFF, 0x00A0].map((cp) => String.fromCharCode(cp)).join('');
  const dirtyKey = 'sk-real-key' + invisible + '-abcd1234' + invisible;
  const record = await createCredential(admin.id, 'Pasted From Dashboard', dirtyKey);
  const decrypted = await repo.voiceProviderCredentials.get(record.id, { includeDecrypted: true });
  assert.equal(decrypted.apiKey, 'sk-real-key-abcd1234');
  assert.equal(record.keyHint, '…1234');
});

test('GET /credentials never leaks the raw key anywhere in the response body, and the stored value really is AES-GCM ciphertext', async () => {
  const admin = await createAdmin('Admin B');
  await createCredential(admin.id, 'Leak Check', 'sk-should-never-appear-plainly');
  const list = await api('GET', '/api/admin/voice-providers/credentials', { userId: admin.id });
  assert.equal(list.status, 200);
  const raw = JSON.stringify(list.body);
  assert.doesNotMatch(raw, /sk-should-never-appear-plainly/);
  const stored = list.body.find((c) => c.label === 'Leak Check');
  const decrypted = await repo.voiceProviderCredentials.get(stored.id, { includeDecrypted: true });
  assert.equal(decrypted.apiKey, 'sk-should-never-appear-plainly');
});

test('a wrong/mismatched ENCRYPTION_KEY fails closed on decryption rather than silently returning garbage or the plaintext', async () => {
  const admin = await createAdmin('Admin C');
  const record = await createCredential(admin.id, 'Key Rotation Victim', 'sk-original-key-value');
  const original = process.env.ENCRYPTION_KEY;
  process.env.ENCRYPTION_KEY = '11'.repeat(32); // a different, syntactically-valid 32-byte key
  // secrets.mjs's encryptionKeyHex() memoizes its resolved value - without clearing that cache,
  // this would keep reading whatever key was already resolved (e.g. dev's own ephemeral fallback)
  // and never actually observe the swapped env var at all.
  __resetSecretCacheForTests();
  try {
    await assert.rejects(() => repo.voiceProviderCredentials.get(record.id, { includeDecrypted: true }));
  } finally {
    if (original === undefined) delete process.env.ENCRYPTION_KEY; else process.env.ENCRYPTION_KEY = original;
    __resetSecretCacheForTests();
  }
});

test('PATCH with a blank/omitted apiKey retains the current key; a real replacement key changes it and resets validationStatus to unknown', async () => {
  const admin = await createAdmin('Admin D');
  const record = await createCredential(admin.id, 'Rotates', 'sk-original-value-1111');
  await repo.voiceProviderCredentials.recordValidation(record.id, { status: 'valid', error: null });
  const blankPatch = await api('PATCH', `/api/admin/voice-providers/credentials/${record.id}`, { userId: admin.id, body: { label: 'Rotates Renamed' } });
  assert.equal(blankPatch.status, 200);
  assert.equal(blankPatch.body.label, 'Rotates Renamed');
  assert.equal(blankPatch.body.validationStatus, 'valid', 'a blank apiKey must never reset validation status - the key itself never changed');
  let decrypted = await repo.voiceProviderCredentials.get(record.id, { includeDecrypted: true });
  assert.equal(decrypted.apiKey, 'sk-original-value-1111');

  const realPatch = await api('PATCH', `/api/admin/voice-providers/credentials/${record.id}`, { userId: admin.id, body: { apiKey: 'sk-brand-new-value-2222' } });
  assert.equal(realPatch.status, 200);
  assert.equal(realPatch.body.validationStatus, 'unknown', 'replacing the real key must invalidate the previous validation result');
  decrypted = await repo.voiceProviderCredentials.get(record.id, { includeDecrypted: true });
  assert.equal(decrypted.apiKey, 'sk-brand-new-value-2222');
});

test('DELETE is a separate, explicit action (never implied by a blank-key PATCH) and clears (never breaks) any character config that referenced it', async () => {
  const admin = await createAdmin('Admin E');
  const record = await createCredential(admin.id, 'To Be Deleted');
  const save = await api('PUT', '/api/admin/voice-providers/characters/hunter/male', { userId: admin.id, body: { enabled: true, credentialId: record.id, voiceId: 'v1', modelId: 'eleven_v3' } });
  assert.equal(save.status, 200);
  assert.equal(save.body.credentialId, record.id);

  const del = await api('DELETE', `/api/admin/voice-providers/credentials/${record.id}`, { userId: admin.id });
  assert.equal(del.status, 200);
  assert.equal(del.body.deleted, true);

  const characters = await api('GET', '/api/admin/voice-providers/characters', { userId: admin.id });
  const hunterMale = characters.body.find((c) => c.character === 'hunter' && c.gender === 'male');
  assert.equal(hunterMale.credentialId, null, 'the character config must fall back to no credential, never a dangling reference');

  const redelete = await api('DELETE', `/api/admin/voice-providers/credentials/${record.id}`, { userId: admin.id });
  assert.equal(redelete.status, 404);
});

// --- Validation (never spends paid audio; 401 vs 403 distinction) ---

test('validate never generates paid audio - only GET /v1/user is ever called', async () => {
  const admin = await createAdmin('Admin F');
  const record = await createCredential(admin.id);
  const calls = stubElevenLabs({ '/v1/user': { body: { subscription: { tier: 'creator' } } } });
  const result = await api('POST', `/api/admin/voice-providers/credentials/${record.id}/validate`, { userId: admin.id });
  assert.equal(result.status, 200);
  assert.equal(result.body.validationStatus, 'valid');
  assert.deepEqual(calls, ['/v1/user']);
});

test('a 401 upstream is recorded as invalid; a 403 upstream is recorded as restricted - the two are never conflated (mission: 403 means real-but-scope-limited, not automatically invalid)', async () => {
  const admin = await createAdmin('Admin G');
  const invalidCred = await createCredential(admin.id, 'Bad Key');
  stubElevenLabs({ '/v1/user': { status: 401 } });
  const invalidResult = await api('POST', `/api/admin/voice-providers/credentials/${invalidCred.id}/validate`, { userId: admin.id });
  assert.equal(invalidResult.body.validationStatus, 'invalid');

  const restrictedCred = await createCredential(admin.id, 'Scoped Key');
  stubElevenLabs({ '/v1/user': { status: 403 } });
  const restrictedResult = await api('POST', `/api/admin/voice-providers/credentials/${restrictedCred.id}/validate`, { userId: admin.id });
  assert.equal(restrictedResult.body.validationStatus, 'restricted');
});

// Found via real production testing: the previous version of this handler stamped ANY ElevenLabs
// error - not just a genuine 401 - as validationStatus:'invalid', which could permanently mislabel
// a perfectly real key after nothing worse than a single network blip or an ElevenLabs-side 5xx.
test('a transient upstream failure (timeout, network error, rate limit, 5xx) during validate never overwrites the stored validationStatus - only a real 401/403 is definitive', async () => {
  const admin = await createAdmin('Admin G2');
  const record = await createCredential(admin.id, 'Previously Unknown');
  assert.equal(record.validationStatus, 'unknown');

  stubElevenLabs({ '/v1/user': () => { throw new Error('boom'); } }); // simulates a network-level failure inside elevenLabsRequest
  const failed = await api('POST', `/api/admin/voice-providers/credentials/${record.id}/validate`, { userId: admin.id });
  assert.equal(failed.status, 502);
  assert.equal(failed.body.inconclusive, true);

  const after = await api('GET', '/api/admin/voice-providers/credentials', { userId: admin.id });
  const stillUnknown = after.body.find((c) => c.id === record.id);
  assert.equal(stillUnknown.validationStatus, 'unknown', 'a transient failure must never downgrade a real key to invalid');

  // A genuinely valid credential must also stay 'valid' through a later transient blip, never
  // silently flipped to 'invalid' by an unrelated network hiccup on a subsequent validate click.
  stubElevenLabs({ '/v1/user': { body: {} } });
  await api('POST', `/api/admin/voice-providers/credentials/${record.id}/validate`, { userId: admin.id });
  stubElevenLabs({ '/v1/user': { status: 429 } });
  await api('POST', `/api/admin/voice-providers/credentials/${record.id}/validate`, { userId: admin.id });
  const stillValid = (await api('GET', '/api/admin/voice-providers/credentials', { userId: admin.id })).body.find((c) => c.id === record.id);
  assert.equal(stillValid.validationStatus, 'valid');
});

test('the validate rate limiter allows 10 requests per minute per admin session and 429s the 11th', async () => {
  const admin = await createAdmin('Rate Limited Admin');
  const record = await createCredential(admin.id);
  stubElevenLabs({ '/v1/user': { body: {} } });
  let lastStatus = null;
  for (let i = 0; i < 11; i += 1) {
    const result = await api('POST', `/api/admin/voice-providers/credentials/${record.id}/validate`, { userId: admin.id });
    lastStatus = result.status;
    if (i < 10) assert.notEqual(result.status, 429, `request ${i + 1} of 10 must not be rate-limited yet`);
  }
  assert.equal(lastStatus, 429);
});

// --- Subscription/quota (nominal allowance, overage; separated from analytics-permission handling) ---

test('GET subscription computes nominalRemainingAllowance honestly (limit - count, never a guaranteed hard stop) and reports overageEnabled from the real upstream flag', async () => {
  const admin = await createAdmin('Admin H');
  const record = await createCredential(admin.id);
  stubElevenLabs({ '/v1/user/subscription': { body: { tier: 'creator', status: 'active', character_count: 4000, character_limit: 10000, allowed_to_use_rns: true } } });
  const result = await api('GET', `/api/admin/voice-providers/credentials/${record.id}/subscription`, { userId: admin.id });
  assert.equal(result.status, 200);
  assert.equal(result.body.nominalRemainingAllowance, 6000);
  assert.equal(result.body.overageEnabled, true);
});

test('GET upstream-usage treats a missing analytics permission (403) as ANALYTICS_PERMISSION_UNAVAILABLE, never as a hard failure or a fabricated zero', async () => {
  const admin = await createAdmin('Admin I');
  const record = await createCredential(admin.id);
  stubElevenLabs({ '/v1/workspace/analytics/query/usage-by-product-over-time': { status: 403 } });
  const result = await api('GET', `/api/admin/voice-providers/credentials/${record.id}/upstream-usage`, { userId: admin.id });
  assert.equal(result.status, 200);
  assert.equal(result.body.available, false);
  assert.equal(result.body.reason, 'ANALYTICS_PERMISSION_UNAVAILABLE');
});

// --- Per-character, per-gender configuration ---

test('GET /characters always returns one entry per (character, gender) combination, with the documented default shape for one nothing has configured yet', async () => {
  const admin = await createAdmin('Admin J');
  const result = await api('GET', '/api/admin/voice-providers/characters', { userId: admin.id });
  assert.equal(result.status, 200);
  const keys = result.body.map((c) => c.character + ':' + c.gender).sort();
  assert.deepEqual(keys, ['commander:female', 'commander:male', 'engineer:female', 'engineer:male', 'hunter:female', 'hunter:male', 'sage:female', 'sage:male']);
  // 'engineer:female' is never touched by any earlier test in this file - its entry proves the
  // real "never has to special-case not-configured" default shape, independent of whatever other
  // combinations earlier tests in this shared-repo suite (see admin-api-contract.test.mjs's own
  // convention) have since configured.
  const engineerFemale = result.body.find((c) => c.character === 'engineer' && c.gender === 'female');
  assert.equal(engineerFemale.enabled, false);
  assert.equal(engineerFemale.credentialId, null);
  assert.equal(engineerFemale.provider, 'elevenlabs');
  assert.equal(engineerFemale.fallbackProvider, 'openai');
});

test('PUT /characters/:character/:gender rejects an unsupported character, an unsupported gender, and a nonexistent credentialId, before ever touching the config table', async () => {
  const admin = await createAdmin('Admin K');
  const badCharacter = await api('PUT', '/api/admin/voice-providers/characters/wizard/male', { userId: admin.id, body: { enabled: true } });
  assert.equal(badCharacter.status, 400);
  assert.equal(badCharacter.body.error, 'UNSUPPORTED_CHARACTER');
  const badGender = await api('PUT', '/api/admin/voice-providers/characters/hunter/nonbinary', { userId: admin.id, body: { enabled: true } });
  assert.equal(badGender.status, 400);
  assert.equal(badGender.body.error, 'UNSUPPORTED_GENDER');
  const badCredential = await api('PUT', '/api/admin/voice-providers/characters/hunter/male', { userId: admin.id, body: { enabled: true, credentialId: 'does-not-exist' } });
  assert.equal(badCredential.status, 400);
  assert.equal(badCredential.body.error, 'CREDENTIAL_NOT_FOUND');
});

test('PUT /characters/:character/:gender round-trips a real, valid save', async () => {
  const admin = await createAdmin('Admin L');
  const record = await createCredential(admin.id);
  const save = await api('PUT', '/api/admin/voice-providers/characters/sage/female', { userId: admin.id, body: { enabled: true, credentialId: record.id, voiceId: 'voice-sage-f', modelId: 'eleven_v3' } });
  assert.equal(save.status, 200);
  const get = await api('GET', '/api/admin/voice-providers/characters', { userId: admin.id });
  const sageFemale = get.body.find((c) => c.character === 'sage' && c.gender === 'female');
  assert.equal(sageFemale.enabled, true);
  assert.equal(sageFemale.credentialId, record.id);
  assert.equal(sageFemale.voiceId, 'voice-sage-f');
});

// --- Voice/model catalogs ---

test('GET /voices and /models require a real credentialId and 400 without one', async () => {
  const admin = await createAdmin('Admin M');
  const voices = await api('GET', '/api/admin/voice-providers/voices?credentialId=nope', { userId: admin.id });
  assert.equal(voices.status, 400);
  assert.equal(voices.body.error, 'CREDENTIAL_NOT_FOUND');
});

test('GET /voices proxies through the given credential, maps the real upstream shape, and supports the search filter', async () => {
  const admin = await createAdmin('Admin N');
  const record = await createCredential(admin.id);
  stubElevenLabs({ '/v2/voices': { body: { voices: [{ voice_id: 'v1', name: 'Marin', category: 'premade' }, { voice_id: 'v2', name: 'Cedar', category: 'premade' }] } } });
  const all = await api('GET', `/api/admin/voice-providers/voices?credentialId=${record.id}`, { userId: admin.id });
  assert.equal(all.body.length, 2);
  assert.equal(all.body[0].voiceId, 'v1');
  const filtered = await api('GET', `/api/admin/voice-providers/voices?credentialId=${record.id}&search=marin`, { userId: admin.id });
  assert.equal(filtered.body.length, 1);
  assert.equal(filtered.body[0].name, 'Marin');
});

test('GET /models only ever returns models the upstream itself reports as text-to-speech capable', async () => {
  const admin = await createAdmin('Admin O');
  const record = await createCredential(admin.id);
  stubElevenLabs({ '/v1/models': { body: [{ model_id: 'eleven_v3', name: 'Eleven v3', can_do_text_to_speech: true, languages: ['fa', 'en'] }, { model_id: 'scribe_v1', name: 'Scribe', can_do_text_to_speech: false }] } });
  const result = await api('GET', `/api/admin/voice-providers/models?credentialId=${record.id}`, { userId: admin.id });
  assert.equal(result.body.length, 1);
  assert.equal(result.body[0].modelId, 'eleven_v3');
});

test('POST /validate-combo flags a model that does not support the requested language, and passes a genuinely compatible combination', async () => {
  const admin = await createAdmin('Admin P');
  const record = await createCredential(admin.id);
  stubElevenLabs({
    '/v1/voices/v1': { body: { voice_id: 'v1', name: 'Marin' } },
    '/v1/models': { body: [{ model_id: 'eleven_v3', can_do_text_to_speech: true, languages: ['en', 'es'] }] }
  });
  const mismatched = await api('POST', '/api/admin/voice-providers/validate-combo', { userId: admin.id, body: { languageCode: 'fa', credentialId: record.id, voiceId: 'v1', modelId: 'eleven_v3' } });
  assert.equal(mismatched.body.valid, false);
  assert.equal(mismatched.body.reason, 'MODEL_DOES_NOT_SUPPORT_LANGUAGE');
  const matched = await api('POST', '/api/admin/voice-providers/validate-combo', { userId: admin.id, body: { languageCode: 'en', credentialId: record.id, voiceId: 'v1', modelId: 'eleven_v3' } });
  assert.equal(matched.body.valid, true);
});

// --- Health derivation ---

test('GET /health derives disabled/unconfigured/invalid_credential/ready correctly from real config + credential state, per (character, gender)', async () => {
  const admin = await createAdmin('Admin Q');
  const goodCred = await createCredential(admin.id, 'Healthy Cred');
  const badCred = await createCredential(admin.id, 'Bad Cred');
  await repo.voiceProviderCredentials.recordValidation(badCred.id, { status: 'invalid', error: 'INVALID_CREDENTIAL' });

  await api('PUT', '/api/admin/voice-providers/characters/hunter/male', { userId: admin.id, body: { enabled: false } }); // stays default-disabled
  await api('PUT', '/api/admin/voice-providers/characters/commander/male', { userId: admin.id, body: { enabled: true, credentialId: null } }); // enabled, no credential
  await api('PUT', '/api/admin/voice-providers/characters/engineer/male', { userId: admin.id, body: { enabled: true, credentialId: badCred.id, voiceId: 'v', modelId: 'm' } });
  await api('PUT', '/api/admin/voice-providers/characters/sage/male', { userId: admin.id, body: { enabled: true, credentialId: goodCred.id, voiceId: 'v', modelId: 'm' } });

  const health = await api('GET', '/api/admin/voice-providers/health', { userId: admin.id });
  const byKey = {}; health.body.characters.forEach((c) => { byKey[c.character + ':' + c.gender] = c; });
  assert.equal(byKey['hunter:male'].status, 'disabled');
  assert.equal(byKey['commander:male'].status, 'unconfigured');
  assert.equal(byKey['engineer:male'].status, 'invalid_credential');
  assert.equal(byKey['sage:male'].status, 'ready');
  assert.ok(health.body.overallUsage24h, 'must also report a combined-across-languages 24h usage summary');
});

// --- Test-sample (admin-only, records real credit consumption) ---

test('POST /test-sample requires a real credentialId + text, synthesizes real audio, and records both a usage event and an audit entry marking credits consumed', async () => {
  const admin = await createAdmin('Admin R');
  const record = await createCredential(admin.id);
  const audioBuffer = Buffer.from('fake-mp3-bytes');
  stubElevenLabs({ '/v1/text-to-speech/v1': { buffer: audioBuffer, headers: { 'content-type': 'audio/mpeg', 'character-cost': '12' } } });
  const beforeUsage = await repo.voiceTtsUsage.recent({ limit: 100 });
  const beforeAudit = await repo.auditLog.list({ limit: 100 });

  const result = await api('POST', '/api/admin/voice-providers/test-sample', { userId: admin.id, body: { languageCode: 'fa', credentialId: record.id, voiceId: 'v1', modelId: 'eleven_v3', text: 'سلام دنیا' } });
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(Buffer.from(result.body.audioBase64, 'base64').toString(), 'fake-mp3-bytes');
  assert.equal(result.body.characterCost, 12);

  const afterUsage = await repo.voiceTtsUsage.recent({ limit: 100 });
  assert.equal(afterUsage.length, beforeUsage.length + 1);
  assert.equal(afterUsage[0].source, 'admin_test');
  assert.equal(afterUsage[0].success, true);

  const afterAudit = await repo.auditLog.list({ limit: 100 });
  assert.equal(afterAudit.length, beforeAudit.length + 1);
  assert.equal(afterAudit[0].action, 'voiceProvider.testSample.generate');
  assert.equal(afterAudit[0].details.creditsConsumed, true);
});

test('POST /test-sample without real text or a real credentialId is rejected before any ElevenLabs call', async () => {
  const admin = await createAdmin('Admin S');
  const record = await createCredential(admin.id);
  let called = false;
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith('https://api.elevenlabs.io')) { called = true; return { ok: false }; }
    return originalFetch(url, options);
  };
  const noText = await api('POST', '/api/admin/voice-providers/test-sample', { userId: admin.id, body: { languageCode: 'fa', credentialId: record.id, voiceId: 'v1', modelId: 'm', text: '' } });
  assert.equal(noText.status, 400);
  assert.equal(noText.body.error, 'TEXT_REQUIRED');
  const badCredential = await api('POST', '/api/admin/voice-providers/test-sample', { userId: admin.id, body: { languageCode: 'fa', credentialId: 'nope', voiceId: 'v1', modelId: 'm', text: 'hi' } });
  assert.equal(badCredential.status, 400);
  assert.equal(badCredential.body.error, 'CREDENTIAL_NOT_FOUND');
  assert.equal(called, false);
});

test('multiple credentials can exist at once and be shared or split independently across character+gender combinations', async () => {
  const admin = await createAdmin('Admin T');
  const shared = await createCredential(admin.id, 'Shared Account');
  const solo = await createCredential(admin.id, 'Sage-Only Account');
  await api('PUT', '/api/admin/voice-providers/characters/hunter/male', { userId: admin.id, body: { enabled: true, credentialId: shared.id, voiceId: 'v', modelId: 'm' } });
  await api('PUT', '/api/admin/voice-providers/characters/commander/female', { userId: admin.id, body: { enabled: true, credentialId: shared.id, voiceId: 'v', modelId: 'm' } });
  await api('PUT', '/api/admin/voice-providers/characters/sage/female', { userId: admin.id, body: { enabled: true, credentialId: solo.id, voiceId: 'v', modelId: 'm' } });
  const characters = await api('GET', '/api/admin/voice-providers/characters', { userId: admin.id });
  const byKey = {}; characters.body.forEach((c) => { byKey[c.character + ':' + c.gender] = c; });
  assert.equal(byKey['hunter:male'].credentialId, shared.id);
  assert.equal(byKey['commander:female'].credentialId, shared.id);
  assert.equal(byKey['sage:female'].credentialId, solo.id);
  const credentials = await api('GET', '/api/admin/voice-providers/credentials', { userId: admin.id });
  assert.ok(credentials.body.length >= 2);
});
