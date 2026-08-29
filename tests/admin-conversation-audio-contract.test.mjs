import assert from 'node:assert/strict';
import test, { after, afterEach, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { authHeadersFor } from './helpers/auth-token.mjs';
import { __resetRateLimitStoreForTests } from '../server/community/security/rate-limit.mjs';

// Journey H2, Gate 3: contract coverage for the Voice Asset Pipeline routes added to
// server/admin/routes.conversation-scenarios.mjs. Mirrors admin-voice-providers-contract.test.mjs's
// own createApp()/repo.memory.mjs/authHeadersFor/stubElevenLabs conventions exactly - real Express
// app, real in-memory repo, a stubbed ElevenLabs upstream (no real network call, no real API key
// needed in this environment - see docs/ai/conversation-voice-assets.md's honest disclosure).

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
async function createCredential(adminId) {
  const result = await api('POST', '/api/admin/voice-providers/credentials', { userId: adminId, body: { label: 'Studio Voice', apiKey: 'test-key-abcd1234' } });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return result.body;
}

// Mirrors admin-voice-providers-contract.test.mjs's own stubElevenLabs() exactly - intercepts only
// the real ElevenLabs origin, everything else (including this test file's own calls into the local
// Express app under test) passes straight through to the real fetch.
function stubElevenLabs({ fail } = {}) {
  const calls = [];
  const fakeMp3 = Buffer.from('ID3fakeaudiobytes');
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(String(url), baseUrl);
    if (parsed.origin !== 'https://api.elevenlabs.io') return originalFetch(url, options);
    calls.push(parsed.pathname);
    if (fail) return { ok: false, status: 500, text: async () => '' };
    return {
      ok: true, status: 200, text: async () => '',
      arrayBuffer: async () => fakeMp3.buffer.slice(fakeMp3.byteOffset, fakeMp3.byteOffset + fakeMp3.byteLength),
      headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'audio/mpeg' : null) }
    };
  };
  return calls;
}

function faqDefinition(overrides) {
  return Object.assign({
    languages: { en: { groups: [['gadget'], ['what is']], strong: ['what is a gadget'], negative: [] } },
    responses: { en: { written: 'A gadget is a thing.', voiceReply: 'A gadget is a thing, spoken.' } }
  }, overrides || {});
}

async function createPublishedScenario(admin, key, definition) {
  const created = await api('POST', '/api/admin/conversation-scenarios', { userId: admin.id, body: { scenarioKey: key, kind: 'faq', definition: definition || faqDefinition() } });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const published = await api('POST', `/api/admin/conversation-scenarios/${created.body.id}/publish`, { userId: admin.id, body: {} });
  assert.equal(published.status, 200, JSON.stringify(published.body));
  return published.body;
}

// --- Authorization ---

test('a non-admin is rejected from every audio route, never reaching ElevenLabs', async () => {
  const user = await createUser('plain-user');
  const admin = await createAdmin('setup-admin');
  const credential = await createCredential(admin.id);
  const scenario = await createPublishedScenario(admin, 'audio.auth.one');
  const calls = stubElevenLabs();

  const generate = await api('POST', `/api/admin/conversation-scenarios/${scenario.id}/versions/${scenario.publishedVersionId}/audio`,
    { userId: user.id, body: { language: 'en', credentialId: credential.id, voiceId: 'v1' } });
  assert.equal(generate.status, 403);
  const list = await api('GET', `/api/admin/conversation-scenarios/${scenario.id}/versions/${scenario.publishedVersionId}/audio`, { userId: user.id });
  assert.equal(list.status, 403);
  assert.equal(calls.length, 0, 'a non-admin request must never reach ElevenLabs');
});

test('an unauthenticated request is rejected', async () => {
  const admin = await createAdmin('setup-admin-2');
  const scenario = await createPublishedScenario(admin, 'audio.auth.two');
  const result = await api('GET', `/api/admin/conversation-scenarios/${scenario.id}/versions/${scenario.publishedVersionId}/audio`, {});
  assert.equal(result.status, 401);
});

// --- Privacy: data_query is structurally ineligible ---

test('generating audio for a kind:data_query scenario is rejected unconditionally, before any ElevenLabs call', async () => {
  const admin = await createAdmin('privacy-admin');
  const credential = await createCredential(admin.id);
  const created = await api('POST', '/api/admin/conversation-scenarios', {
    userId: admin.id, body: {
      scenarioKey: 'audio.dataquery.one', kind: 'data_query', dataQueryRef: 'trade.open_count',
      definition: { languages: { en: { groups: [['open trades']], strong: [], negative: [] } }, responses: { en: { written: 'You have {count} open trades.', voiceReply: 'You have {count} open trades.' } } }
    }
  });
  assert.equal(created.status, 201);
  const calls = stubElevenLabs();
  const generate = await api('POST', `/api/admin/conversation-scenarios/${created.body.id}/versions/${created.body.draftVersionId}/audio`,
    { userId: admin.id, body: { language: 'en', credentialId: credential.id, voiceId: 'v1' } });
  assert.equal(generate.status, 400);
  assert.equal(generate.body.error, 'AUDIO_NOT_ELIGIBLE_FOR_DATA_QUERY');
  assert.equal(calls.length, 0, 'a rejected data_query generation must never reach ElevenLabs');
});

// Release-prep hardening (H2 staging gate, item 27): eligibility is not merely `kind !==
// 'data_query'` - a `faq`/`surface_help` scenario whose response text still contains a
// `{variable}` placeholder (e.g. a still-mutable draft that hasn't passed publish validation yet,
// which is where this would normally be caught - see validateForPublish()) must be refused here
// too, independently of `kind`, before any ElevenLabs call.
test('generating audio for a faq/surface_help scenario is STILL rejected when its response text contains a {variable} placeholder, even though kind !== data_query', async () => {
  const admin = await createAdmin('privacy-admin-2');
  const credential = await createCredential(admin.id);
  const created = await api('POST', '/api/admin/conversation-scenarios', {
    userId: admin.id, body: {
      scenarioKey: 'audio.templatevar.one', kind: 'faq',
      definition: {
        languages: { en: { groups: [['widgetcount']], strong: [], negative: [] } },
        responses: { en: { written: 'You have {count} of them.', voiceReply: 'You have {count} of them, spoken.' } }
      }
    }
  });
  assert.equal(created.status, 201);
  const calls = stubElevenLabs();
  const generate = await api('POST', `/api/admin/conversation-scenarios/${created.body.id}/versions/${created.body.draftVersionId}/audio`,
    { userId: admin.id, body: { language: 'en', credentialId: credential.id, voiceId: 'v1' } });
  assert.equal(generate.status, 400);
  assert.equal(generate.body.error, 'AUDIO_NOT_ELIGIBLE_TEMPLATE_VARIABLES');
  assert.equal(calls.length, 0, 'a response referencing a runtime template variable must never reach ElevenLabs, regardless of scenario kind');
});

test('a faq scenario with genuinely static text (no {variable} anywhere) is unaffected by the template-variable check', async () => {
  const admin = await createAdmin('privacy-admin-3');
  const credential = await createCredential(admin.id);
  const scenario = await createPublishedScenario(admin, 'audio.templatevar.two');
  stubElevenLabs();
  const generate = await api('POST', `/api/admin/conversation-scenarios/${scenario.id}/versions/${scenario.publishedVersionId}/audio`,
    { userId: admin.id, body: { language: 'en', credentialId: credential.id, voiceId: 'v1' } });
  assert.equal(generate.status, 201, JSON.stringify(generate.body));
});

// --- Full lifecycle ---

test('generate -> preview (not runtime-active) -> approve -> appears in the published bundle -> regenerate+approve archives the prior slot-mate', async () => {
  const admin = await createAdmin('lifecycle-admin');
  const credential = await createCredential(admin.id);
  const scenario = await createPublishedScenario(admin, 'audio.lifecycle.one');
  stubElevenLabs();

  const generated = await api('POST', `/api/admin/conversation-scenarios/${scenario.id}/versions/${scenario.publishedVersionId}/audio`,
    { userId: admin.id, body: { language: 'en', credentialId: credential.id, voiceId: 'voice-1', modelId: 'model-1', voiceProfileKey: 'en_default' } });
  assert.equal(generated.status, 201, JSON.stringify(generated.body));
  assert.equal(generated.body.status, 'preview');
  assert.equal(generated.body.usedFallbackText, false);
  assert.ok(generated.body.fileUrl.startsWith('/uploads/conversation-audio/'));

  // Not runtime-active yet
  let bundle = await repo.conversationScenarios.listPublishedForBundle();
  let row = bundle.find((s) => s.scenarioKey === 'audio.lifecycle.one');
  assert.deepEqual(row.audio, {});

  const approved = await api('POST', `/api/admin/conversation-scenarios/${scenario.id}/audio/${generated.body.id}/approve`, { userId: admin.id });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.status, 'approved');

  bundle = await repo.conversationScenarios.listPublishedForBundle();
  row = bundle.find((s) => s.scenarioKey === 'audio.lifecycle.one');
  assert.equal(row.audio.en.standard.url, generated.body.fileUrl);
  assert.equal(row.audio.en.standard.mimeType, 'audio/mpeg');

  // Regenerate (a different voice) and approve - must archive the first, not stack alongside it.
  const regenerated = await api('POST', `/api/admin/conversation-scenarios/${scenario.id}/versions/${scenario.publishedVersionId}/audio`,
    { userId: admin.id, body: { language: 'en', credentialId: credential.id, voiceId: 'voice-2', modelId: 'model-1', voiceProfileKey: 'en_default' } });
  assert.equal(regenerated.status, 201);
  await api('POST', `/api/admin/conversation-scenarios/${scenario.id}/audio/${regenerated.body.id}/approve`, { userId: admin.id });

  const list = await api('GET', `/api/admin/conversation-scenarios/${scenario.id}/versions/${scenario.publishedVersionId}/audio`, { userId: admin.id });
  const first = list.body.assets.find((a) => a.id === generated.body.id);
  const second = list.body.assets.find((a) => a.id === regenerated.body.id);
  assert.equal(first.status, 'archived', 'the previously-approved asset for the same slot must be archived, never deleted');
  assert.equal(second.status, 'approved');

  bundle = await repo.conversationScenarios.listPublishedForBundle();
  row = bundle.find((s) => s.scenarioKey === 'audio.lifecycle.one');
  assert.equal(row.audio.en.standard.url, regenerated.body.fileUrl, 'the bundle must reflect the newly-approved asset');
});

// --- Staleness ---

test('an approved candidate for a draft becomes stale (and cannot be approved) once the draft\'s spoken text changes', async () => {
  const admin = await createAdmin('stale-admin');
  const credential = await createCredential(admin.id);
  const created = await api('POST', '/api/admin/conversation-scenarios', { userId: admin.id, body: { scenarioKey: 'audio.stale.one', kind: 'faq', definition: faqDefinition() } });
  stubElevenLabs();

  const generated = await api('POST', `/api/admin/conversation-scenarios/${created.body.id}/versions/${created.body.draftVersionId}/audio`,
    { userId: admin.id, body: { language: 'en', credentialId: credential.id, voiceId: 'voice-1' } });
  assert.equal(generated.status, 201);

  let list = await api('GET', `/api/admin/conversation-scenarios/${created.body.id}/versions/${created.body.draftVersionId}/audio`, { userId: admin.id });
  assert.equal(list.body.assets[0].isStale, false);

  await api('PATCH', `/api/admin/conversation-scenarios/${created.body.id}/draft`, {
    userId: admin.id, body: { responses: { en: { written: 'A gadget is a thing.', voiceReply: 'A gadget is now something completely different, spoken.' } } }
  });

  list = await api('GET', `/api/admin/conversation-scenarios/${created.body.id}/versions/${created.body.draftVersionId}/audio`, { userId: admin.id });
  assert.equal(list.body.assets[0].isStale, true, 'editing the draft spoken text must mark the existing candidate stale');

  const approveAttempt = await api('POST', `/api/admin/conversation-scenarios/${created.body.id}/audio/${generated.body.id}/approve`, { userId: admin.id });
  assert.equal(approveAttempt.status, 409);
  assert.equal(approveAttempt.body.error, 'AUDIO_STALE');
});

test('a published version\'s approved audio can never go stale under it (definitions are immutable once published)', async () => {
  const admin = await createAdmin('immutable-admin');
  const credential = await createCredential(admin.id);
  const scenario = await createPublishedScenario(admin, 'audio.immutable.one');
  stubElevenLabs();
  const generated = await api('POST', `/api/admin/conversation-scenarios/${scenario.id}/versions/${scenario.publishedVersionId}/audio`,
    { userId: admin.id, body: { language: 'en', credentialId: credential.id, voiceId: 'voice-1' } });
  await api('POST', `/api/admin/conversation-scenarios/${scenario.id}/audio/${generated.body.id}/approve`, { userId: admin.id });

  // Start and edit a NEW draft (v2) - the already-published v1 must remain completely unaffected.
  await api('POST', `/api/admin/conversation-scenarios/${scenario.id}/revision`, { userId: admin.id });
  await api('PATCH', `/api/admin/conversation-scenarios/${scenario.id}/draft`, { userId: admin.id, body: { responses: { en: { written: 'changed', voiceReply: 'changed spoken' } } } });

  const list = await api('GET', `/api/admin/conversation-scenarios/${scenario.id}/versions/${scenario.publishedVersionId}/audio`, { userId: admin.id });
  assert.equal(list.body.assets[0].isStale, false, 'v1\'s own approved audio must stay current regardless of what happens to the v2 draft');
  const bundle = await repo.conversationScenarios.listPublishedForBundle();
  assert.ok(bundle.find((s) => s.scenarioKey === 'audio.immutable.one').audio.en.standard);
});

// --- Usage/audit ---

test('generation records a studio_audio_generation usage event (separate from live_voice_mode) and an audit row with no key material or audio bytes', async () => {
  const admin = await createAdmin('usage-admin');
  const credential = await createCredential(admin.id);
  const scenario = await createPublishedScenario(admin, 'audio.usage.one');
  stubElevenLabs();
  const generated = await api('POST', `/api/admin/conversation-scenarios/${scenario.id}/versions/${scenario.publishedVersionId}/audio`,
    { userId: admin.id, body: { language: 'en', credentialId: credential.id, voiceId: 'voice-1' } });
  assert.equal(generated.status, 201);

  const usage = await repo.voiceTtsUsage.aggregateByLanguage({});
  const enUsage = usage.find((u) => u.languageCode === 'en');
  assert.ok(enUsage && enUsage.requestCount >= 1);

  const log = await repo.auditLog.list({ limit: 200 });
  const generateEntry = log.find((e) => e.action === 'conversationAudio.generate' && e.targetId === generated.body.id);
  assert.ok(generateEntry);
  const raw = JSON.stringify(generateEntry.details);
  assert.doesNotMatch(raw, /test-key-abcd1234/);
  assert.doesNotMatch(raw, /ID3fakeaudiobytes/);

  const approveResult = await api('POST', `/api/admin/conversation-scenarios/${scenario.id}/audio/${generated.body.id}/approve`, { userId: admin.id });
  assert.equal(approveResult.status, 200);
  const approveEntry = (await repo.auditLog.list({ limit: 200 })).find((e) => e.action === 'conversationAudio.approve' && e.targetId === generated.body.id);
  assert.ok(approveEntry);
});

test('a failed ElevenLabs call records a failed usage event and never creates an audio asset', async () => {
  const admin = await createAdmin('failure-admin');
  const credential = await createCredential(admin.id);
  const scenario = await createPublishedScenario(admin, 'audio.failure.one');
  stubElevenLabs({ fail: true });
  const generate = await api('POST', `/api/admin/conversation-scenarios/${scenario.id}/versions/${scenario.publishedVersionId}/audio`,
    { userId: admin.id, body: { language: 'en', credentialId: credential.id, voiceId: 'voice-1' } });
  assert.equal(generate.status, 502);
  const assets = await repo.conversationAudioAssets.listForVersion(scenario.publishedVersionId);
  assert.equal(assets.length, 0);
  // aggregateByLanguage() sums across every 'en' event this whole shared-repo test file has
  // recorded so far (the same real cross-test-state consideration Gate 2's own test suite ran
  // into) - recent() lets this test check the ONE event it actually just caused, unambiguously.
  const [mostRecent] = await repo.voiceTtsUsage.recent({ limit: 1 });
  assert.equal(mostRecent.languageCode, 'en');
  assert.equal(mostRecent.success, false);
  assert.equal(mostRecent.source, 'studio_audio_generation');
});

test('uses the spokenResponse text, and falls back to written text (flagged) only when spokenResponse is empty', async () => {
  const admin = await createAdmin('fallback-admin');
  const credential = await createCredential(admin.id);
  const created = await api('POST', '/api/admin/conversation-scenarios', {
    userId: admin.id, body: {
      scenarioKey: 'audio.fallback.one', kind: 'faq',
      definition: { languages: { en: { groups: [['thing']], strong: [], negative: [] } }, responses: { en: { written: 'Written only, no spoken variant yet.', voiceReply: '' } } }
    }
  });
  stubElevenLabs();
  const generated = await api('POST', `/api/admin/conversation-scenarios/${created.body.id}/versions/${created.body.draftVersionId}/audio`,
    { userId: admin.id, body: { language: 'en', credentialId: credential.id, voiceId: 'voice-1' } });
  assert.equal(generated.status, 201);
  assert.equal(generated.body.usedFallbackText, true);
});
