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

// --- Journey H2 expressive/context follow-up: Enhance Delivery + variant-aware audio identity ---

// Mirrors stubElevenLabs()'s own convention exactly, for the one new outbound call this gate
// adds: a direct OpenAI Responses API call from community-api (never a new pattern-ai-server.mjs
// endpoint - see server/community/enhance-delivery-provider.mjs's own header comment).
function stubOpenAI({ performanceText, fail } = {}) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(String(url), baseUrl);
    if (parsed.origin !== 'https://api.openai.com') return originalFetch(url, options);
    calls.push(parsed.pathname);
    if (fail) return { ok: false, status: 500, json: async () => ({ error: { message: 'boom' } }) };
    return { ok: true, status: 200, json: async () => ({ output_text: JSON.stringify({ performanceText: performanceText || '' }) }) };
  };
  return calls;
}

// admin_ai_keys is a global, provider-keyed singleton (never scoped to one admin/test) - this test
// MUST run before any other test in this file configures an 'openai' key, since that upsert would
// otherwise persist for the rest of the file's shared repo/server instance.
test('Enhance Delivery requires an admin-configured OpenAI key - fails loudly, never silently falling back to a different provider or a key this process was never given', async () => {
  const admin = await createAdmin('enhance-admin-3');
  const scenario = await createPublishedScenario(admin, 'enhance.three');
  const calls = stubOpenAI({ performanceText: 'irrelevant' });

  const result = await api('POST', `/api/admin/conversation-scenarios/${scenario.id}/versions/${scenario.publishedVersionId}/enhance-delivery`,
    { userId: admin.id, body: { language: 'en', variantKey: 'standard' } });

  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'OPENAI_KEY_NOT_CONFIGURED');
  assert.equal(calls.length, 0, 'must never reach OpenAI at all without a configured key');
});

test('Enhance Delivery for a scenario with no stored spoken text at all (neither the requested variant nor STANDARD) is rejected before ever reaching OpenAI', async () => {
  const admin = await createAdmin('enhance-admin-4');
  await repo.adminKeys.upsert({ provider: 'openai', apiKey: 'test-openai-key', updatedBy: admin.id });
  const created = await api('POST', '/api/admin/conversation-scenarios', {
    userId: admin.id, body: {
      scenarioKey: 'enhance.four', kind: 'faq',
      definition: { languages: { en: { groups: [['thingummy']], strong: [], negative: [] } }, responses: { en: { written: '', voiceReply: '' } } }
    }
  });
  const calls = stubOpenAI({ performanceText: 'irrelevant' });

  // A nonexistent variant key gracefully degrades to STANDARD (responseSetFor()'s own documented
  // behavior) - here STANDARD itself has no text either, so this must still be rejected, not
  // silently proceed with an empty canonical string.
  const result = await api('POST', `/api/admin/conversation-scenarios/${created.body.id}/versions/${created.body.draftVersionId}/enhance-delivery`,
    { userId: admin.id, body: { language: 'en', variantKey: 'NEVER_SAVED_VARIANT' } });

  assert.equal(result.status, 400);
  assert.equal(result.body.error, 'NO_SPOKEN_TEXT');
  assert.equal(calls.length, 0);
});

test('Enhance Delivery returns a valid, ready-to-review suggestion for the STANDARD response, and audits it', async () => {
  const admin = await createAdmin('enhance-admin');
  await repo.adminKeys.upsert({ provider: 'openai', apiKey: 'test-openai-key', updatedBy: admin.id });
  const scenario = await createPublishedScenario(admin, 'enhance.one');
  // faqDefinition()'s own canonical voiceReply is "A gadget is a thing, spoken." - the stubbed
  // suggestion must match it exactly (plus a supported tag) to be reported valid.
  const calls = stubOpenAI({ performanceText: '[curious] A gadget is a thing, spoken.' });

  const result = await api('POST', `/api/admin/conversation-scenarios/${scenario.id}/versions/${scenario.publishedVersionId}/enhance-delivery`,
    { userId: admin.id, body: { language: 'en', variantKey: 'standard', deliveryNote: 'warm and curious' } });

  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.performanceText, '[curious] A gadget is a thing, spoken.');
  assert.equal(result.body.valid, true);
  assert.ok(Array.isArray(result.body.supportedTags) && result.body.supportedTags.includes('curious'));
  assert.equal(calls.length, 1);

  const log = await repo.auditLog.list({ limit: 200 });
  const entry = log.find((e) => e.action === 'conversationAudio.enhanceDelivery' && e.targetId === scenario.id);
  assert.ok(entry);
  assert.equal(entry.details.valid, true);
});

test('Enhance Delivery reports an invented suggestion as invalid rather than silently presenting it as good - it never rejects the HTTP call outright, so the admin can still see and fix it', async () => {
  const admin = await createAdmin('enhance-admin-2');
  await repo.adminKeys.upsert({ provider: 'openai', apiKey: 'test-openai-key', updatedBy: admin.id });
  const scenario = await createPublishedScenario(admin, 'enhance.two');
  stubOpenAI({ performanceText: '[curious] A gadget is a thing, spoken, and also a completely invented extra sentence.' });

  const result = await api('POST', `/api/admin/conversation-scenarios/${scenario.id}/versions/${scenario.publishedVersionId}/enhance-delivery`,
    { userId: admin.id, body: { language: 'en', variantKey: 'standard' } });

  assert.equal(result.status, 200);
  assert.equal(result.body.valid, false);
  assert.equal(result.body.reason, 'DIALOGUE_CHANGED');
});

// Governance audit fix: Enhance Delivery spends real provider cost per call, exactly like the
// existing admin ElevenLabs /test-sample route - which is rate-limited. This was a real, found
// gap (Enhance Delivery originally had no cap at all) - fixed by mirroring that exact convention.
test('Enhance Delivery is rate-limited (5/min/session) exactly like the existing /test-sample precedent, so a runaway admin session cannot spend unbounded real provider cost', async () => {
  const admin = await createAdmin('rate-limited-enhance-admin');
  await repo.adminKeys.upsert({ provider: 'openai', apiKey: 'test-openai-key', updatedBy: admin.id });
  const scenario = await createPublishedScenario(admin, 'enhance.ratelimit.one');
  stubOpenAI({ performanceText: 'A gadget is a thing.' });
  let lastStatus = null;
  for (let i = 0; i < 6; i += 1) {
    const result = await api('POST', `/api/admin/conversation-scenarios/${scenario.id}/versions/${scenario.publishedVersionId}/enhance-delivery`,
      { userId: admin.id, body: { language: 'en', variantKey: 'standard' } });
    lastStatus = result.status;
    if (i < 5) assert.notEqual(result.status, 429, `request ${i + 1} of 5 must not be rate-limited yet`);
  }
  assert.equal(lastStatus, 429);
});

test('a non-admin is rejected from Enhance Delivery, never reaching OpenAI', async () => {
  const admin = await createAdmin('enhance-setup-admin');
  const user = await createUser('enhance-plain-user');
  await repo.adminKeys.upsert({ provider: 'openai', apiKey: 'test-openai-key', updatedBy: admin.id });
  const scenario = await createPublishedScenario(admin, 'enhance.five');
  const calls = stubOpenAI({ performanceText: 'irrelevant' });

  const result = await api('POST', `/api/admin/conversation-scenarios/${scenario.id}/versions/${scenario.publishedVersionId}/enhance-delivery`,
    { userId: user.id, body: { language: 'en', variantKey: 'standard' } });

  assert.equal(result.status, 403);
  assert.equal(calls.length, 0);
});

test('audio identity changes when the performance tag changes - regenerating with a different valid performanceText produces a different content hash, and approving it archives the prior asset for the same slot', async () => {
  const admin = await createAdmin('tag-identity-admin');
  const credential = await createCredential(admin.id);
  const created = await api('POST', '/api/admin/conversation-scenarios', {
    userId: admin.id, body: {
      scenarioKey: 'audio.tagidentity.one', kind: 'faq',
      definition: {
        languages: { en: { groups: [['flapdoodle'], ['what is']], strong: ['what is a flapdoodle'], negative: [] } },
        responses: { en: { written: 'A flapdoodle is a thing.', voiceReply: 'A flapdoodle is a thing.', performanceText: '[curious] A flapdoodle is a thing.' } }
      }
    }
  });
  stubElevenLabs();
  const first = await api('POST', `/api/admin/conversation-scenarios/${created.body.id}/versions/${created.body.draftVersionId}/audio`,
    { userId: admin.id, body: { language: 'en', credentialId: credential.id, voiceId: 'voice-1', modelId: 'eleven_v3' } });
  assert.equal(first.status, 201);
  assert.equal(first.body.usedPerformanceText, true, 'eleven_v3 supports tags and the performanceText is valid - it must be what gets hashed/synthesized');
  await api('POST', `/api/admin/conversation-scenarios/${created.body.id}/audio/${first.body.id}/approve`, { userId: admin.id });

  // Change [curious] to [softly] - same canonical dialogue, different performance direction.
  await api('PATCH', `/api/admin/conversation-scenarios/${created.body.id}/draft`, {
    userId: admin.id, body: { responses: { en: { written: 'A flapdoodle is a thing.', voiceReply: 'A flapdoodle is a thing.', performanceText: '[softly] A flapdoodle is a thing.' } } }
  });

  const staleCheck = await api('GET', `/api/admin/conversation-scenarios/${created.body.id}/versions/${created.body.draftVersionId}/audio`, { userId: admin.id });
  assert.equal(staleCheck.body.assets[0].isStale, true, 'changing only the performance tag must invalidate the previously-approved audio - never silently reused');

  const second = await api('POST', `/api/admin/conversation-scenarios/${created.body.id}/versions/${created.body.draftVersionId}/audio`,
    { userId: admin.id, body: { language: 'en', credentialId: credential.id, voiceId: 'voice-1', modelId: 'eleven_v3' } });
  assert.notEqual(second.body.contentHashShort, first.body.contentHashShort, 'a different performance tag must produce a different content hash');
  await api('POST', `/api/admin/conversation-scenarios/${created.body.id}/audio/${second.body.id}/approve`, { userId: admin.id });

  const list = await api('GET', `/api/admin/conversation-scenarios/${created.body.id}/versions/${created.body.draftVersionId}/audio`, { userId: admin.id });
  assert.equal(list.body.assets.find((a) => a.id === first.body.id).status, 'archived');
  assert.equal(list.body.assets.find((a) => a.id === second.body.id).status, 'approved');
});

test('a performanceText is silently NOT used for audio generation when the chosen model does not support tags - falls back to plain canonical text, never breaks generation', async () => {
  const admin = await createAdmin('unsupported-model-admin');
  const credential = await createCredential(admin.id);
  const created = await api('POST', '/api/admin/conversation-scenarios', {
    userId: admin.id, body: {
      scenarioKey: 'audio.unsupportedmodel.one', kind: 'faq',
      definition: {
        languages: { en: { groups: [['wingding'], ['what is']], strong: ['what is a wingding'], negative: [] } },
        responses: { en: { written: 'A wingding is a thing.', voiceReply: 'A wingding is a thing.', performanceText: '[curious] A wingding is a thing.' } }
      }
    }
  });
  stubElevenLabs();
  const generated = await api('POST', `/api/admin/conversation-scenarios/${created.body.id}/versions/${created.body.draftVersionId}/audio`,
    { userId: admin.id, body: { language: 'en', credentialId: credential.id, voiceId: 'voice-1', modelId: 'eleven_multilingual_v2' } });
  assert.equal(generated.status, 201);
  assert.equal(generated.body.usedPerformanceText, false, 'eleven_multilingual_v2 does not support audio tags - must fall back to plain canonical text');
});

test('generating audio for a specific context variant is scoped to that exact variantKey, independent of STANDARD - the two are separate audio identities that can be approved independently', async () => {
  const admin = await createAdmin('variant-audio-admin');
  const credential = await createCredential(admin.id);
  const created = await api('POST', '/api/admin/conversation-scenarios', {
    userId: admin.id, body: {
      scenarioKey: 'audio.variant.one', kind: 'faq',
      definition: {
        languages: { en: { groups: [['whirligig'], ['what is']], strong: ['what is a whirligig'], negative: [] } },
        responses: { en: { written: 'A whirligig is a thing.', voiceReply: 'A whirligig is a thing.' } },
        variants: { en: [{ key: 'FIRST_TIME', context: { exposure: { type: 'FIRST_TIME' } }, written: 'Welcome! A whirligig is a thing.', voiceReply: 'Welcome! A whirligig is a thing.' }] }
      }
    }
  });
  stubElevenLabs();
  const standardAsset = await api('POST', `/api/admin/conversation-scenarios/${created.body.id}/versions/${created.body.draftVersionId}/audio`,
    { userId: admin.id, body: { language: 'en', variantKey: 'standard', credentialId: credential.id, voiceId: 'voice-1' } });
  const firstTimeAsset = await api('POST', `/api/admin/conversation-scenarios/${created.body.id}/versions/${created.body.draftVersionId}/audio`,
    { userId: admin.id, body: { language: 'en', variantKey: 'FIRST_TIME', credentialId: credential.id, voiceId: 'voice-1' } });

  assert.equal(standardAsset.status, 201);
  assert.equal(firstTimeAsset.status, 201);
  assert.equal(standardAsset.body.variantKey, 'standard');
  assert.equal(firstTimeAsset.body.variantKey, 'FIRST_TIME');
  assert.notEqual(standardAsset.body.contentHashShort, firstTimeAsset.body.contentHashShort, 'different dialogue text must produce different content identities');

  await api('POST', `/api/admin/conversation-scenarios/${created.body.id}/audio/${firstTimeAsset.body.id}/approve`, { userId: admin.id });
  const bundle = await repo.conversationScenarios.listPublishedForBundle();
  // Not published yet, so it never appears in the bundle - this only proves approval succeeded
  // independently for the variant slot without needing STANDARD to also be approved.
  assert.equal(bundle.find((s) => s.scenarioKey === 'audio.variant.one'), undefined);
  const list = await api('GET', `/api/admin/conversation-scenarios/${created.body.id}/versions/${created.body.draftVersionId}/audio`, { userId: admin.id });
  assert.equal(list.body.assets.find((a) => a.id === firstTimeAsset.body.id).status, 'approved');
  assert.equal(list.body.assets.find((a) => a.id === standardAsset.body.id).status, 'preview', 'approving the FIRST_TIME slot must never affect the independent STANDARD slot');
});
