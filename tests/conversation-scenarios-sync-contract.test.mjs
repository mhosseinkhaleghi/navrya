import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { authHeadersFor } from './helpers/auth-token.mjs';
import { __resetRateLimitStoreForTests } from '../server/community/security/rate-limit.mjs';

// Contract coverage for the public GET /api/sync/conversation-scenarios bundle route - the
// browser Conversation Router's actual data source. Real Express app, real in-memory repo, real
// session auth (this route sits behind requireAuth() like every other /api/sync/* route, even
// though its content isn't user-specific).

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

async function get(userId) {
  const headers = userId ? await authHeadersFor(repo, userId) : {};
  const response = await fetch(baseUrl + '/api/sync/conversation-scenarios', { headers });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

test('an unauthenticated request is rejected', async () => {
  const result = await get(null);
  assert.equal(result.status, 401);
});

test('an empty scenario set returns a valid, empty bundle - never an error', async () => {
  const user = await repo.users.create({ displayName: 'plain-user' });
  const result = await get(user.id);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.scenarios, []);
  assert.equal(result.body.updatedAt, null);
  assert.ok(typeof result.body.version === 'string');
});

test('only published, non-archived scenarios appear - a draft and an archived scenario never leak into the bundle', async () => {
  const user = await repo.users.create({ displayName: 'plain-user-2' });

  const published = await repo.conversationScenarios.create({
    scenarioKey: 'sync.published.one', domain: 'testing', kind: 'faq',
    definition: { languages: { en: { groups: [['thing']], strong: [], negative: [] } }, responses: { en: { written: 'A thing.', voiceReply: 'A thing.' } } },
    createdBy: user.id
  });
  await repo.conversationScenarios.publish(published.id, published.draftVersionId, user.id);

  const draftOnly = await repo.conversationScenarios.create({
    scenarioKey: 'sync.draft.only', domain: 'testing', kind: 'faq',
    definition: { languages: { en: { groups: [['other']], strong: [], negative: [] } }, responses: { en: { written: 'Other.', voiceReply: 'Other.' } } },
    createdBy: user.id
  });

  const archived = await repo.conversationScenarios.create({
    scenarioKey: 'sync.archived.one', domain: 'testing', kind: 'faq',
    definition: { languages: { en: { groups: [['third']], strong: [], negative: [] } }, responses: { en: { written: 'Third.', voiceReply: 'Third.' } } },
    createdBy: user.id
  });
  await repo.conversationScenarios.publish(archived.id, archived.draftVersionId, user.id);
  await repo.conversationScenarios.archive(archived.id);

  const result = await get(user.id);
  assert.equal(result.status, 200);
  const keys = result.body.scenarios.map((s) => s.scenarioKey);
  assert.ok(keys.includes('sync.published.one'));
  assert.ok(!keys.includes('sync.draft.only'), 'a draft-only scenario must never appear in the public bundle');
  assert.ok(!keys.includes('sync.archived.one'), 'an archived scenario must never appear in the public bundle');
});

test('the bundle row shape is production-safe: no admin metadata, no authoring/audit fields', async () => {
  const user = await repo.users.create({ displayName: 'plain-user-3' });
  const scenario = await repo.conversationScenarios.create({
    scenarioKey: 'sync.shape.one', domain: 'testing', kind: 'faq', ctaActionId: 'session.create',
    definition: { languages: { en: { groups: [['gizmo']], strong: [], negative: [] } }, responses: { en: { written: 'A gizmo.', voiceReply: 'A gizmo.' } } },
    createdBy: user.id
  });
  await repo.conversationScenarios.publish(scenario.id, scenario.draftVersionId, user.id);

  const result = await get(user.id);
  const row = result.body.scenarios.find((s) => s.scenarioKey === 'sync.shape.one');
  assert.ok(row);
  assert.deepEqual(Object.keys(row).sort(), ['allowedProcesses', 'allowedSteps', 'audio', 'ctaActionId', 'dataQueryRef', 'definition', 'domain', 'id', 'kind', 'publishedVersion', 'scenarioKey'].sort());
  assert.deepEqual(row.audio, {}, 'no audio has been approved for this scenario yet');
  assert.equal(row.ctaActionId, 'session.create');
  assert.equal(row.publishedVersion, 1);
});

test('updatedAt reflects the most recently published scenario\'s own publish timestamp', async () => {
  const user = await repo.users.create({ displayName: 'plain-user-4' });
  const scenario = await repo.conversationScenarios.create({
    scenarioKey: 'sync.updated.one', domain: 'testing', kind: 'faq',
    definition: { languages: { en: { groups: [['doohickey']], strong: [], negative: [] } }, responses: { en: { written: 'A doohickey.', voiceReply: 'x' } } },
    createdBy: user.id
  });
  const before = Date.now();
  await repo.conversationScenarios.publish(scenario.id, scenario.draftVersionId, user.id);
  const result = await get(user.id);
  assert.ok(result.body.updatedAt);
  assert.ok(new Date(result.body.updatedAt).getTime() >= before - 1000);
});

// --- Journey H2, Gate 3: audio field ---

test('only an APPROVED, hash-current audio asset appears in the public bundle - a preview candidate never does', async () => {
  const user = await repo.users.create({ displayName: 'plain-user-5' });
  const scenario = await repo.conversationScenarios.create({
    scenarioKey: 'sync.audio.one', domain: 'testing', kind: 'faq',
    definition: { languages: { en: { groups: [['widget']], strong: [], negative: [] } }, responses: { en: { written: 'A widget.', voiceReply: 'A widget, spoken.' } } },
    createdBy: user.id
  });
  const published = await repo.conversationScenarios.publish(scenario.id, scenario.draftVersionId, user.id);

  const { computeAudioContentHash } = await import('../server/community/conversation-audio-identity.mjs');
  const hash = computeAudioContentHash({ text: 'A widget, spoken.', language: 'en', provider: 'elevenlabs', voiceId: 'v1', modelId: 'm1' });
  const asset = await repo.conversationAudioAssets.create({
    scenarioId: scenario.id, scenarioVersionId: published.publishedVersionId, language: 'en', variantKey: 'standard',
    contentHash: hash, provider: 'elevenlabs', voiceProfileKey: 'en_default', voiceId: 'v1', modelId: 'm1',
    fileUrl: '/uploads/conversation-audio/test.mp3', mimeType: 'audio/mpeg', createdBy: user.id
  });

  let result = await get(user.id);
  let row = result.body.scenarios.find((s) => s.scenarioKey === 'sync.audio.one');
  assert.deepEqual(row.audio, {}, 'a preview (not-yet-approved) candidate must never appear in the public bundle');

  await repo.conversationAudioAssets.approve(asset.id, user.id);
  result = await get(user.id);
  row = result.body.scenarios.find((s) => s.scenarioKey === 'sync.audio.one');
  assert.deepEqual(row.audio, { en: { standard: { url: '/uploads/conversation-audio/test.mp3', mimeType: 'audio/mpeg', durationMs: null } } });
});
