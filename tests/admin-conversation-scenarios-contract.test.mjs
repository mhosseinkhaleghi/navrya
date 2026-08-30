import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { authHeadersFor } from './helpers/auth-token.mjs';
import { __resetRateLimitStoreForTests } from '../server/community/security/rate-limit.mjs';

// Contract-level coverage for server/admin/routes.conversation-scenarios.mjs, mirroring
// admin-voice-providers-contract.test.mjs's own createApp()/repo.memory.mjs/authHeadersFor
// convention - a real Express app, a real in-memory repo, real session/CSRF headers per admin.

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

function faqDefinition(overrides) {
  return Object.assign({
    languages: { en: { groups: [['widget'], ['what is']], strong: ['what is a widget'], negative: [] } },
    responses: { en: { written: 'A widget is a thing.', voiceReply: 'A widget is a thing.' } }
  }, overrides || {});
}

test('a non-admin is rejected from every conversation-scenarios route', async () => {
  const user = await createUser('plain-user');
  const list = await api('GET', '/api/admin/conversation-scenarios', { userId: user.id });
  assert.equal(list.status, 403);
  const create = await api('POST', '/api/admin/conversation-scenarios', { userId: user.id, body: { scenarioKey: 'x.y', kind: 'faq' } });
  assert.equal(create.status, 403);
});

test('an unauthenticated request is rejected', async () => {
  const result = await api('GET', '/api/admin/conversation-scenarios', {});
  assert.equal(result.status, 401);
});

test('full lifecycle: create -> draft edit -> publish v1 -> new revision v2 (v1 still live) -> publish v2 (v1 archived) -> rollback to v1 (new v3, live)', async () => {
  const admin = await createAdmin('studio-admin');

  const created = await api('POST', '/api/admin/conversation-scenarios', {
    userId: admin.id, body: { scenarioKey: 'test.widget.purpose', domain: 'testing', kind: 'faq', ctaActionId: 'session.create', definition: faqDefinition() }
  });
  assert.equal(created.status, 201);
  const scenarioId = created.body.id;
  assert.equal(created.body.draftVersion.versionNumber, 1);
  assert.equal(created.body.publishedVersion, null);

  // Draft edit before first publish
  const editedDraft = await api('PATCH', `/api/admin/conversation-scenarios/${scenarioId}/draft`, {
    userId: admin.id, body: { languages: { en: { groups: [['widget'], ['what is', 'what does']], strong: ['what is a widget', 'what does a widget do'], negative: [] } } }
  });
  assert.equal(editedDraft.status, 200);
  assert.deepEqual(editedDraft.body.draftVersion.definition.languages.en.strong, ['what is a widget', 'what does a widget do']);
  // A patch merges into the definition - the untouched `responses` key must survive.
  assert.equal(editedDraft.body.draftVersion.definition.responses.en.written, 'A widget is a thing.');

  const publishedV1 = await api('POST', `/api/admin/conversation-scenarios/${scenarioId}/publish`, { userId: admin.id, body: {} });
  assert.equal(publishedV1.status, 200);
  assert.equal(publishedV1.body.publishedVersion.versionNumber, 1);
  assert.equal(publishedV1.body.draftVersionId, null);
  const v1Id = publishedV1.body.publishedVersionId;

  // Bundle now includes it
  const bundleAfterV1 = await repo.conversationScenarios.listPublishedForBundle();
  assert.ok(bundleAfterV1.some((s) => s.scenarioKey === 'test.widget.purpose' && s.publishedVersion === 1));

  const revision = await api('POST', `/api/admin/conversation-scenarios/${scenarioId}/revision`, { userId: admin.id });
  assert.equal(revision.status, 201);
  assert.equal(revision.body.draftVersion.versionNumber, 2);
  // v1 must remain exactly as published while v2 is being drafted.
  const stillV1 = await repo.conversationScenarios.get(scenarioId);
  assert.equal(stillV1.publishedVersion.versionNumber, 1);

  await api('PATCH', `/api/admin/conversation-scenarios/${scenarioId}/draft`, {
    userId: admin.id, body: { responses: { en: { written: 'A widget is a REVISED thing.', voiceReply: 'A widget is a revised thing.' } } }
  });
  const publishedV2 = await api('POST', `/api/admin/conversation-scenarios/${scenarioId}/publish`, { userId: admin.id, body: {} });
  assert.equal(publishedV2.status, 200);
  assert.equal(publishedV2.body.publishedVersion.versionNumber, 2);

  const versionsAfterV2 = await repo.conversationScenarios.listVersions(scenarioId);
  const v1Row = versionsAfterV2.find((v) => v.versionNumber === 1);
  assert.equal(v1Row.status, 'archived');
  assert.equal(v1Row.definition.responses.en.written, 'A widget is a thing.', 'the old published version content must remain byte-identical, never mutated');

  const rolledBack = await api('POST', `/api/admin/conversation-scenarios/${scenarioId}/rollback`, { userId: admin.id, body: { targetVersionId: v1Id } });
  assert.equal(rolledBack.status, 200);
  assert.equal(rolledBack.body.publishedVersion.versionNumber, 3, 'rollback creates a brand-new version, never resurrects the old one in place');
  assert.equal(rolledBack.body.publishedVersion.definition.responses.en.written, 'A widget is a thing.', 'rollback content matches the target version exactly');

  const finalBundle = await repo.conversationScenarios.listPublishedForBundle();
  const finalRow = finalBundle.find((s) => s.scenarioKey === 'test.widget.purpose');
  assert.equal(finalRow.publishedVersion, 3);
});

test('archiving a scenario excludes it from the published bundle regardless of its published version', async () => {
  const admin = await createAdmin('archiver');
  const created = await api('POST', '/api/admin/conversation-scenarios', { userId: admin.id, body: { scenarioKey: 'test.archive.me', kind: 'faq', definition: faqDefinition() } });
  await api('POST', `/api/admin/conversation-scenarios/${created.body.id}/publish`, { userId: admin.id, body: {} });
  let bundle = await repo.conversationScenarios.listPublishedForBundle();
  assert.ok(bundle.some((s) => s.scenarioKey === 'test.archive.me'));

  const archived = await api('POST', `/api/admin/conversation-scenarios/${created.body.id}/archive`, { userId: admin.id });
  assert.equal(archived.status, 200);
  bundle = await repo.conversationScenarios.listPublishedForBundle();
  assert.ok(!bundle.some((s) => s.scenarioKey === 'test.archive.me'), 'an archived scenario must never appear in the bundle');

  const unarchived = await api('POST', `/api/admin/conversation-scenarios/${created.body.id}/unarchive`, { userId: admin.id });
  assert.equal(unarchived.status, 200);
  bundle = await repo.conversationScenarios.listPublishedForBundle();
  assert.ok(bundle.some((s) => s.scenarioKey === 'test.archive.me'));
});

test('publish is blocked (422) by an unsafe CTA action id and by an invalid template variable', async () => {
  const admin = await createAdmin('validator-admin');
  const unsafeCta = await api('POST', '/api/admin/conversation-scenarios', { userId: admin.id, body: { scenarioKey: 'test.bad.cta', kind: 'faq', ctaActionId: 'trade.delete', definition: faqDefinition() } });
  assert.equal(unsafeCta.status, 400, 'an unsafe CTA is rejected at create time already');

  const badVar = await api('POST', '/api/admin/conversation-scenarios', {
    userId: admin.id, body: {
      scenarioKey: 'test.bad.var', kind: 'faq',
      definition: faqDefinition({ responses: { en: { written: 'Your {secretValue} is exposed.', voiceReply: 'Your {secretValue} is exposed.' } } })
    }
  });
  assert.equal(badVar.status, 201);
  const publishAttempt = await api('POST', `/api/admin/conversation-scenarios/${badVar.body.id}/publish`, { userId: admin.id, body: {} });
  assert.equal(publishAttempt.status, 422);
  assert.ok(publishAttempt.body.errors.some((e) => e.code === 'INVALID_TEMPLATE_VARIABLE'));
});

// ---- Journey H2 expressive/context follow-up: performanceText + variant-collision validation ----

test('publish is blocked (422) when a STANDARD performanceText no longer matches its own canonical voiceReply - the real, unbypassable enforcement even if an admin hand-edited it after Enhance Delivery', async () => {
  const admin = await createAdmin('performance-admin');
  const created = await api('POST', '/api/admin/conversation-scenarios', {
    userId: admin.id, body: {
      scenarioKey: 'test.performance.invalid', kind: 'faq',
      definition: faqDefinition({ responses: { en: { written: 'A widget is a thing.', voiceReply: 'A widget is a thing.', performanceText: '[curious] A widget is a completely different invented sentence.' } } })
    }
  });
  assert.equal(created.status, 201);
  const publishAttempt = await api('POST', `/api/admin/conversation-scenarios/${created.body.id}/publish`, { userId: admin.id, body: {} });
  assert.equal(publishAttempt.status, 422);
  assert.ok(publishAttempt.body.errors.some((e) => e.code === 'INVALID_PERFORMANCE_TEXT' && e.language === 'en'));
});

test('publish is blocked (422) when a VARIANT performanceText no longer matches that variant\'s own canonical dialogue', async () => {
  const admin = await createAdmin('performance-admin-2');
  const created = await api('POST', '/api/admin/conversation-scenarios', {
    userId: admin.id, body: {
      scenarioKey: 'test.performance.variant.invalid', kind: 'faq',
      definition: Object.assign(faqDefinition(), {
        variants: { en: [{ key: 'FIRST_TIME', context: { exposure: { type: 'FIRST_TIME' } }, written: 'Welcome, a widget is a thing.', voiceReply: 'Welcome, a widget is a thing.', performanceText: '[curious] Welcome, this is an invented different sentence.' }] }
      })
    }
  });
  const publishAttempt = await api('POST', `/api/admin/conversation-scenarios/${created.body.id}/publish`, { userId: admin.id, body: {} });
  assert.equal(publishAttempt.status, 422);
  assert.ok(publishAttempt.body.errors.some((e) => e.code === 'INVALID_PERFORMANCE_TEXT' && e.variantKey === 'FIRST_TIME'));
});

test('publish succeeds when performanceText only adds supported tags/punctuation to the exact canonical dialogue', async () => {
  const admin = await createAdmin('performance-admin-3');
  const created = await api('POST', '/api/admin/conversation-scenarios', {
    userId: admin.id, body: {
      scenarioKey: 'test.performance.valid', kind: 'faq',
      definition: faqDefinition({ responses: { en: { written: 'A widget is a thing.', voiceReply: 'A widget is a thing.', performanceText: '[curious] A widget is a thing.' } } })
    }
  });
  const published = await api('POST', `/api/admin/conversation-scenarios/${created.body.id}/publish`, { userId: admin.id, body: {} });
  assert.equal(published.status, 200, JSON.stringify(published.body));
});

test('publish is blocked (422) by two context variants in the same language that can both match the same real-world context - an authoring collision, never resolved randomly', async () => {
  const admin = await createAdmin('collision-variant-admin');
  const created = await api('POST', '/api/admin/conversation-scenarios', {
    userId: admin.id, body: {
      scenarioKey: 'test.variantcollision.one', kind: 'faq',
      definition: Object.assign(faqDefinition({ languages: { en: { groups: [['sprocket'], ['what is']], strong: ['what is a sprocket'], negative: [] } }, responses: { en: { written: 'A sprocket is a thing.', voiceReply: 'x' } } }), {
        variants: {
          en: [
            { key: 'FIRST_TIME', context: { exposure: { type: 'FIRST_TIME' } }, written: 'Welcome sprocket.', voiceReply: 'x' },
            { key: 'ALSO_FIRST_TIME', context: { exposure: { type: 'FIRST_TIME' } }, written: 'Hello sprocket.', voiceReply: 'x' }
          ]
        }
      })
    }
  });
  const publishAttempt = await api('POST', `/api/admin/conversation-scenarios/${created.body.id}/publish`, { userId: admin.id, body: {} });
  assert.equal(publishAttempt.status, 422);
  assert.ok(publishAttempt.body.errors.some((e) => e.code === 'VARIANT_CONTEXT_COLLISION'));
});

test('publish succeeds with two variants that target different, non-overlapping surfaces - never a false-positive collision', async () => {
  const admin = await createAdmin('no-collision-admin');
  const created = await api('POST', '/api/admin/conversation-scenarios', {
    userId: admin.id, body: {
      scenarioKey: 'test.variantcollision.two', kind: 'faq',
      definition: Object.assign(faqDefinition({ languages: { en: { groups: [['gubbins'], ['what is']], strong: ['what is a gubbins'], negative: [] } }, responses: { en: { written: 'A gubbins is a thing.', voiceReply: 'x' } } }), {
        variants: {
          en: [
            { key: 'ON_SESSIONS', context: { exposure: { type: 'FIRST_TIME' }, surface: { page: 'sessions' } }, written: 'On sessions.', voiceReply: 'x' },
            { key: 'ON_DASHBOARD', context: { exposure: { type: 'FIRST_TIME' }, surface: { page: 'dashboard' } }, written: 'On dashboard.', voiceReply: 'x' }
          ]
        }
      })
    }
  });
  const published = await api('POST', `/api/admin/conversation-scenarios/${created.body.id}/publish`, { userId: admin.id, body: {} });
  assert.equal(published.status, 200, JSON.stringify(published.body));
});

test('publish is blocked when a positive test-corpus example resolves to a different published scenario', async () => {
  const admin = await createAdmin('collision-admin');
  const first = await api('POST', '/api/admin/conversation-scenarios', {
    userId: admin.id, body: {
      scenarioKey: 'test.collision.a', kind: 'faq',
      definition: { languages: { en: { groups: [['gadget'], ['what is']], strong: ['what is a gadget'], negative: [] } }, responses: { en: { written: 'A gadget is one thing.', voiceReply: 'x' } } }
    }
  });
  await api('POST', `/api/admin/conversation-scenarios/${first.body.id}/publish`, { userId: admin.id, body: {} });

  // Deliberately weaker triggers than test.collision.a for this exact phrase (groups only, no
  // strong-phrase match) - simulates a real authoring mistake: an admin writes "what is a
  // gadget" as this scenario's OWN positive example, genuinely believing it targets this
  // scenario, while an already-published scenario actually wins that phrase at HIGH confidence
  // with a real margin (110 vs 70) - exactly what publish validation must catch.
  const second = await api('POST', '/api/admin/conversation-scenarios', {
    userId: admin.id, body: {
      scenarioKey: 'test.collision.b', kind: 'faq',
      definition: {
        languages: { en: { groups: [['gadget'], ['what is']], strong: [], negative: [] } },
        responses: { en: { written: 'A gadget is a DIFFERENT thing.', voiceReply: 'x' } },
        testCorpus: { positive: ['what is a gadget'], negative: [] }
      }
    }
  });
  assert.equal(second.status, 201);
  const publishAttempt = await api('POST', `/api/admin/conversation-scenarios/${second.body.id}/publish`, { userId: admin.id, body: {} });
  assert.equal(publishAttempt.status, 422);
  assert.ok(publishAttempt.body.errors.some((e) => e.code === 'POSITIVE_EXAMPLE_MISROUTED'));
});

// Uses vocabulary ('sprocket') unique to this test - every scenario created earlier in this file
// (and still published in the shared repo/app instance) uses its own distinct noun specifically
// so unrelated tests can never accidentally collide with each other via leftover shared state.
test('the Trigger Lab tester (/test) runs the exact shared matcher and never mutates anything', async () => {
  const admin = await createAdmin('tester-admin');
  const created = await api('POST', '/api/admin/conversation-scenarios', {
    userId: admin.id, body: {
      scenarioKey: 'test.tester.one', kind: 'faq',
      definition: { languages: { en: { groups: [['sprocket'], ['what is']], strong: ['what is a sprocket'], negative: [] } }, responses: { en: { written: 'A sprocket is a thing.', voiceReply: 'x' } } }
    }
  });
  const result = await api('POST', `/api/admin/conversation-scenarios/${created.body.id}/test`, { userId: admin.id, body: { text: 'what is a sprocket' } });
  assert.equal(result.status, 200);
  assert.equal(result.body.confidenceBand, 'HIGH');
  assert.equal(result.body.resolution, 'LOCAL');
  assert.equal(result.body.winnerScenarioKey, 'test.tester.one');
  // still just a draft - never published by testing it
  const stillDraft = await repo.conversationScenarios.get(created.body.id);
  assert.equal(stillDraft.publishedVersionId, null);
});

test('test-batch reports positive/negative pass rates from the version\'s own stored test corpus', async () => {
  const admin = await createAdmin('batch-admin');
  const created = await api('POST', '/api/admin/conversation-scenarios', {
    userId: admin.id, body: {
      scenarioKey: 'test.batch.one', kind: 'faq',
      definition: {
        languages: { en: { groups: [['thingamajig'], ['what is']], strong: ['what is a thingamajig'], negative: [] } },
        responses: { en: { written: 'A thingamajig is a thing.', voiceReply: 'x' } },
        testCorpus: { positive: ['what is a thingamajig'], negative: ['delete the thingamajig'] }
      }
    }
  });
  const result = await api('POST', `/api/admin/conversation-scenarios/${created.body.id}/test-batch`, { userId: admin.id });
  assert.equal(result.status, 200);
  assert.equal(result.body.positivePassRate, 1);
  assert.equal(result.body.negativeRejectionRate, 1);
});

test('every mutating route writes a real admin_audit_log row (scenario id/version only, never the full definition)', async () => {
  const admin = await createAdmin('audit-admin');
  const created = await api('POST', '/api/admin/conversation-scenarios', { userId: admin.id, body: { scenarioKey: 'test.audit.one', kind: 'faq', definition: faqDefinition() } });
  await api('POST', `/api/admin/conversation-scenarios/${created.body.id}/publish`, { userId: admin.id, body: {} });
  const log = await repo.auditLog.list({ limit: 200 });
  const createEntry = log.find((e) => e.action === 'conversationScenario.create' && e.targetId === created.body.id);
  const publishEntry = log.find((e) => e.action === 'conversationScenario.publish' && e.targetId === created.body.id);
  assert.ok(createEntry, 'create must be audited');
  assert.ok(publishEntry, 'publish must be audited');
  assert.equal(JSON.stringify(createEntry.details).indexOf('widget is a thing'), -1, 'audit details must never carry the full response text');
});
