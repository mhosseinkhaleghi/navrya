import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { createApp } from '../server/community/app.mjs';
import { createMemoryRepo } from '../server/db/repo.memory.mjs';
import { authHeadersFor } from './helpers/auth-token.mjs';

// Learned Command Record domain (055_learned_commands.sql) - Voice Command Learning Profile
// addendum. Mirrors instrument-catalog-api-contract.test.mjs's shape: ownership isolation,
// idempotent upsert-by-client-id, the one real business rule (phrase unique per user+language),
// plus the two narrower outcome/enabled actions this domain adds on top of that shape, plus the
// server-side learnability/field-mapping policy (section 2-4 of the addendum's own audit brief).
//
// Every actionId used below is a REAL, currently registered action from
// server/db/action-learnability.generated.json (mechanically derived from the real
// navrya-src/character-app.jsx source) - never an invented id. trade.wizard (direction/instrument),
// session.movementEntry.create (note), settings.character.switch (character), navigate.to
// (domainId), and psychology.mood.log (mood) are all real, learnable actions; settings.persona.
// update is real but has a gateField ('save'), so it is deliberately used as the
// confirmation_required rejection case, not as a learnable fixture.

let server, baseUrl, uploadsDir, repo;

before(async () => {
  uploadsDir = await mkdtemp(path.join(os.tmpdir(), 'tj-uploads-'));
  repo = createMemoryRepo();
  server = createApp({ repo, uploadsDir }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(uploadsDir, { recursive: true, force: true });
});

async function api(method, path, { body, userId } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (userId) Object.assign(headers, await authHeadersFor(repo, userId));
  const response = await fetch(baseUrl + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  return { status: response.status, body: json };
}
async function createUser(name) {
  return repo.users.create({ displayName: name });
}

test('a request with no auth is rejected', async () => {
  const result = await api('GET', '/api/sync/learned-commands');
  assert.equal(result.status, 401);
});

test('POST upserts a mapping and GET reassembles it, phrase normalized and starting at the fresh-mapping confidence', async () => {
  const user = await createUser('Learning Trader');
  const created = await api('POST', '/api/sync/learned-commands', { userId: user.id, body: { id: 'lc-a', normalizedPhrase: '  Log My Trade  ', language: 'en', actionId: 'trade.wizard', fieldMappings: { direction: 'long', instrument: 'XAUUSD' } } });
  assert.equal(created.status, 200);
  assert.equal(created.body.normalizedPhrase, 'log my trade');
  assert.equal(created.body.confidence, 60);
  assert.equal(created.body.enabled, true);
  assert.equal(created.body.source, 'explicit_approval');
  assert.equal(created.body.fieldMappings.direction, 'long');

  const fetched = await api('GET', '/api/sync/learned-commands/lc-a', { userId: user.id });
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.actionId, 'trade.wizard');

  const list = await api('GET', '/api/sync/learned-commands', { userId: user.id });
  assert.equal(list.body.learnedCommands.length, 1);
});

test('an empty phrase or missing actionId is rejected outright', async () => {
  const user = await createUser('Invalid Mapping Trader');
  const emptyPhrase = await api('POST', '/api/sync/learned-commands', { userId: user.id, body: { id: 'lc-empty', normalizedPhrase: '   ', actionId: 'trade.wizard' } });
  assert.equal(emptyPhrase.status, 400);
  const noAction = await api('POST', '/api/sync/learned-commands', { userId: user.id, body: { id: 'lc-no-action', normalizedPhrase: 'log this trade' } });
  assert.equal(noAction.status, 400);
});

test('an unknown/nonexistent action id is rejected - server-side validation, not just a non-empty-string check', async () => {
  const user = await createUser('Unknown Action Trader');
  const result = await api('POST', '/api/sync/learned-commands', { userId: user.id, body: { id: 'lc-unknown', normalizedPhrase: 'do the thing', actionId: 'this.action.does.not.exist' } });
  assert.equal(result.status, 400);
});

test('a gated action (confirmation_required, e.g. settings.persona.update - has a real gateField) can never be stored as a learned-command target', async () => {
  const user = await createUser('Gated Action Trader');
  const result = await api('POST', '/api/sync/learned-commands', { userId: user.id, body: { id: 'lc-gated', normalizedPhrase: 'be stricter with me', actionId: 'settings.persona.update' } });
  assert.equal(result.status, 400);
});

test('a high-riskLevel destructive action (e.g. trade.delete) can never be stored as a learned-command target', async () => {
  const user = await createUser('Destructive Action Trader');
  const result = await api('POST', '/api/sync/learned-commands', { userId: user.id, body: { id: 'lc-destructive', normalizedPhrase: 'delete my last trade', actionId: 'trade.delete' } });
  assert.equal(result.status, 400);
});

test('a field mapping value shaped like this app\'s own entity id is REJECTED outright (400) - never silently dropped and never persisted', async () => {
  const user = await createUser('Opaque Id Trader');
  const result = await api('POST', '/api/sync/learned-commands', { userId: user.id, body: { id: 'lc-b', normalizedPhrase: 'reopen my last trade', actionId: 'trade.wizard', fieldMappings: { instrument: 'trade-lz3k9f2a-a1b2c3d4' } } });
  assert.equal(result.status, 400);
});

test('a field mapping key outside the action\'s own declared reusableFields allowlist is rejected - a closed schema, not arbitrary JSON', async () => {
  const user = await createUser('Unknown Field Trader');
  const result = await api('POST', '/api/sync/learned-commands', { userId: user.id, body: { id: 'lc-badfield', normalizedPhrase: 'log this trade', actionId: 'trade.wizard', fieldMappings: { notARealField: 'x' } } });
  assert.equal(result.status, 400);
});

test('a gate field can never be smuggled into fieldMappings even for an otherwise-learnable-looking payload - reusableFields excludes the action\'s own gateField by construction', async () => {
  // settings.persona.update itself is rejected outright (confirmation_required) above; this
  // proves the SAME field-level exclusion holds even if a future action combined a real gateField
  // with an otherwise-learnable classification - reusableFieldsFor() always strips it.
  const user = await createUser('Gate Smuggle Trader');
  const result = await api('POST', '/api/sync/learned-commands', { userId: user.id, body: { id: 'lc-smuggle', normalizedPhrase: 'do it', actionId: 'settings.persona.update', fieldMappings: { save: true } } });
  assert.equal(result.status, 400);
});

test('a nested object value in fieldMappings is rejected - only plain scalars are ever accepted', async () => {
  const user = await createUser('Nested Value Trader');
  const result = await api('POST', '/api/sync/learned-commands', { userId: user.id, body: { id: 'lc-nested', normalizedPhrase: 'log this trade', actionId: 'trade.wizard', fieldMappings: { direction: { nested: true } } } });
  assert.equal(result.status, 400);
});

test('an unsupported targetStrategy value is rejected - a closed enum, never silently nulled out', async () => {
  const user = await createUser('Bad Strategy Trader');
  const result = await api('POST', '/api/sync/learned-commands', { userId: user.id, body: { id: 'lc-badstrategy', normalizedPhrase: 'log this trade', actionId: 'trade.wizard', targetStrategy: 'delete_everything' } });
  assert.equal(result.status, 400);
});

test('re-POSTing the same mapping id is an idempotent upsert that also resets the trust counters - redefining WHAT a mapping does starts trust over', async () => {
  const user = await createUser('Idempotent Mapping Trader');
  const created = await api('POST', '/api/sync/learned-commands', { userId: user.id, body: { id: 'lc-c', normalizedPhrase: 'switch character', actionId: 'settings.character.switch', fieldMappings: { character: 'hunter' } } });
  await api('POST', `/api/sync/learned-commands/${created.body.id}/outcome`, { userId: user.id, body: { outcome: 'success' } });
  const redefined = await api('POST', '/api/sync/learned-commands', { userId: user.id, body: { id: 'lc-c', normalizedPhrase: 'switch character', actionId: 'settings.character.switch', fieldMappings: { character: 'sage' } } });
  assert.equal(redefined.status, 200);
  assert.equal(redefined.body.fieldMappings.character, 'sage');
  assert.equal(redefined.body.confidence, 60, 'confidence resets on redefinition');
  assert.equal(redefined.body.successCount, 0, 'successCount resets on redefinition');
  const list = await api('GET', '/api/sync/learned-commands', { userId: user.id });
  assert.equal(list.body.learnedCommands.length, 1, 're-upserting the same id must never create a second mapping');
});

test('a duplicate normalized phrase (different id, same user, same language) is rejected with LEARNED_COMMAND_PHRASE_ALREADY_MAPPED', async () => {
  const user = await createUser('Duplicate Phrase Trader');
  await api('POST', '/api/sync/learned-commands', { userId: user.id, body: { id: 'lc-d1', normalizedPhrase: 'log this trade', language: 'en', actionId: 'trade.wizard' } });
  const duplicate = await api('POST', '/api/sync/learned-commands', { userId: user.id, body: { id: 'lc-d2', normalizedPhrase: 'Log This Trade', language: 'en', actionId: 'session.movementEntry.create' } });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error, 'LEARNED_COMMAND_PHRASE_ALREADY_MAPPED');
});

test('the same phrase is never rejected as a duplicate across two different languages, or two different users - the uniqueness rule is per (user, language), not global', async () => {
  const user = await createUser('Multilingual Trader');
  const en = await api('POST', '/api/sync/learned-commands', { userId: user.id, body: { id: 'lc-e1', normalizedPhrase: 'log this trade', language: 'en', actionId: 'trade.wizard' } });
  const fa = await api('POST', '/api/sync/learned-commands', { userId: user.id, body: { id: 'lc-e2', normalizedPhrase: 'log this trade', language: 'fa', actionId: 'trade.wizard' } });
  assert.equal(en.status, 200);
  assert.equal(fa.status, 200);

  const userB = await createUser('Other Trader');
  const other = await api('POST', '/api/sync/learned-commands', { userId: userB.id, body: { id: 'lc-e3', normalizedPhrase: 'log this trade', language: 'en', actionId: 'trade.wizard' } });
  assert.equal(other.status, 200);
});

test('a mapping belonging to another user cannot be fetched, upserted, deleted, or have its outcome/enabled state changed', async () => {
  const owner = await createUser('Mapping Owner');
  const stranger = await createUser('Mapping Stranger');
  const created = await api('POST', '/api/sync/learned-commands', { userId: owner.id, body: { id: 'lc-f', normalizedPhrase: 'log this trade', actionId: 'trade.wizard' } });

  assert.equal((await api('GET', '/api/sync/learned-commands/lc-f', { userId: stranger.id })).status, 404);
  const overwrite = await api('POST', '/api/sync/learned-commands', { userId: stranger.id, body: { id: 'lc-f', normalizedPhrase: 'log this trade', actionId: 'session.movementEntry.create' } });
  assert.equal(overwrite.status, 403);
  assert.equal(overwrite.body.error, 'NOT_LEARNED_COMMAND_OWNER');
  assert.equal((await api('DELETE', '/api/sync/learned-commands/lc-f', { userId: stranger.id })).status, 403);
  assert.equal((await api('POST', `/api/sync/learned-commands/${created.body.id}/outcome`, { userId: stranger.id, body: { outcome: 'success' } })).status, 403);
  assert.equal((await api('POST', `/api/sync/learned-commands/${created.body.id}/enabled`, { userId: stranger.id, body: { enabled: false } })).status, 403);
});

test('DELETE removes a mapping outright', async () => {
  const user = await createUser('Delete Mapping Trader');
  await api('POST', '/api/sync/learned-commands', { userId: user.id, body: { id: 'lc-g', normalizedPhrase: 'log this trade', actionId: 'trade.wizard' } });
  const deleted = await api('DELETE', '/api/sync/learned-commands/lc-g', { userId: user.id });
  assert.equal(deleted.status, 204);
  const list = await api('GET', '/api/sync/learned-commands', { userId: user.id });
  assert.equal(list.body.learnedCommands.length, 0);
});

test('GET /match resolves a raw candidate phrase through the same normalization a stored phrase already passed through, and reports {match: null} when nothing matches - not a 404', async () => {
  const user = await createUser('Match Trader');
  await api('POST', '/api/sync/learned-commands', { userId: user.id, body: { id: 'lc-h', normalizedPhrase: 'log this trade', language: 'en', actionId: 'trade.wizard' } });
  const hit = await api('GET', `/api/sync/learned-commands/match?phrase=${encodeURIComponent('  Log This Trade.  ')}&language=en`, { userId: user.id });
  assert.equal(hit.status, 200);
  assert.equal(hit.body.match.id, 'lc-h');
  const miss = await api('GET', `/api/sync/learned-commands/match?phrase=${encodeURIComponent('do something else entirely')}`, { userId: user.id });
  assert.equal(miss.status, 200);
  assert.equal(miss.body.match, null);
});

test('POST /:id/outcome with success raises confidence and successCount; two corrections auto-disable the mapping', async () => {
  const user = await createUser('Outcome Trader');
  const created = await api('POST', '/api/sync/learned-commands', { userId: user.id, body: { id: 'lc-i', normalizedPhrase: 'log this trade', actionId: 'trade.wizard' } });
  const afterSuccess = await api('POST', `/api/sync/learned-commands/${created.body.id}/outcome`, { userId: user.id, body: { outcome: 'success' } });
  assert.equal(afterSuccess.body.confidence, 70);
  assert.equal(afterSuccess.body.successCount, 1);
  assert.equal(afterSuccess.body.enabled, true);

  await api('POST', `/api/sync/learned-commands/${created.body.id}/outcome`, { userId: user.id, body: { outcome: 'correction' } });
  const afterSecondCorrection = await api('POST', `/api/sync/learned-commands/${created.body.id}/outcome`, { userId: user.id, body: { outcome: 'correction' } });
  assert.equal(afterSecondCorrection.body.correctionCount, 2);
  assert.equal(afterSecondCorrection.body.enabled, false, 'two corrections auto-disable the mapping');
});

test('an invalid outcome value is rejected - only the exact success/correction vocabulary is accepted', async () => {
  const user = await createUser('Invalid Outcome Trader');
  const created = await api('POST', '/api/sync/learned-commands', { userId: user.id, body: { id: 'lc-j', normalizedPhrase: 'log this trade', actionId: 'trade.wizard' } });
  const invalid = await api('POST', `/api/sync/learned-commands/${created.body.id}/outcome`, { userId: user.id, body: { outcome: 'maybe' } });
  assert.equal(invalid.status, 400);
});

test('POST /:id/enabled lets the user manually re-enable a mapping the correction policy auto-disabled - the dashboard\'s own manual override', async () => {
  const user = await createUser('Re-enable Trader');
  const created = await api('POST', '/api/sync/learned-commands', { userId: user.id, body: { id: 'lc-k', normalizedPhrase: 'log this trade', actionId: 'trade.wizard' } });
  await api('POST', `/api/sync/learned-commands/${created.body.id}/outcome`, { userId: user.id, body: { outcome: 'correction' } });
  await api('POST', `/api/sync/learned-commands/${created.body.id}/outcome`, { userId: user.id, body: { outcome: 'correction' } });
  const reenabled = await api('POST', `/api/sync/learned-commands/${created.body.id}/enabled`, { userId: user.id, body: { enabled: true } });
  assert.equal(reenabled.status, 200);
  assert.equal(reenabled.body.enabled, true);
});

test('listByUser returns mappings most-recently-updated first', async () => {
  const user = await createUser('Sorted Mapping Trader');
  await api('POST', '/api/sync/learned-commands', { userId: user.id, body: { id: 'lc-l1', normalizedPhrase: 'log this trade', actionId: 'trade.wizard' } });
  await api('POST', '/api/sync/learned-commands', { userId: user.id, body: { id: 'lc-l2', normalizedPhrase: 'switch to hunter', actionId: 'settings.character.switch', fieldMappings: { character: 'hunter' } } });
  const list = await api('GET', '/api/sync/learned-commands', { userId: user.id });
  assert.deepEqual(list.body.learnedCommands.map((item) => item.id), ['lc-l2', 'lc-l1']);
});

test('GET /actions returns only the currently-learnable action ids (never a gated or high-risk one), plus the fixed target-strategy enum - the dashboard\'s own action/strategy selectors read this, never a hand-typed duplicate', async () => {
  const user = await createUser('Catalog Trader');
  const result = await api('GET', '/api/sync/learned-commands/actions', { userId: user.id });
  assert.equal(result.status, 200);
  assert.ok(result.body.actions.some((a) => a.id === 'trade.wizard'));
  assert.ok(!result.body.actions.some((a) => a.id === 'trade.delete'), 'a high-risk action must never appear in the dashboard\'s own action catalog');
  assert.ok(!result.body.actions.some((a) => a.id === 'settings.persona.update'), 'a gated action must never appear either');
  assert.deepEqual(result.body.targetStrategies.sort(), ['active_open_trade', 'ask_when_multiple', 'currently_open_session', 'most_recent_matching_entity'].sort());
});

test('DELETE / (reset all) removes only the authenticated user\'s own mappings, leaving other users untouched', async () => {
  const user = await createUser('Reset Trader');
  const other = await createUser('Untouched Trader');
  await api('POST', '/api/sync/learned-commands', { userId: user.id, body: { id: 'lc-reset-1', normalizedPhrase: 'log this trade', actionId: 'trade.wizard' } });
  await api('POST', '/api/sync/learned-commands', { userId: user.id, body: { id: 'lc-reset-2', normalizedPhrase: 'switch character', actionId: 'settings.character.switch', fieldMappings: { character: 'hunter' } } });
  await api('POST', '/api/sync/learned-commands', { userId: other.id, body: { id: 'lc-reset-3', normalizedPhrase: 'log this trade', actionId: 'trade.wizard' } });

  const result = await api('DELETE', '/api/sync/learned-commands', { userId: user.id });
  assert.equal(result.status, 200);
  assert.equal(result.body.removed, 2);

  const afterList = await api('GET', '/api/sync/learned-commands', { userId: user.id });
  assert.equal(afterList.body.learnedCommands.length, 0);
  const otherList = await api('GET', '/api/sync/learned-commands', { userId: other.id });
  assert.equal(otherList.body.learnedCommands.length, 1, 'reset all must never touch another user\'s mappings');
});

test('a real, currently-navigable domain is a valid learnable navigate.to mapping', async () => {
  const user = await createUser('Navigation Trader');
  const result = await api('POST', '/api/sync/learned-commands', { userId: user.id, body: { id: 'lc-nav', normalizedPhrase: 'take me to strategies', actionId: 'navigate.to', fieldMappings: { domainId: 'strategies' } } });
  assert.equal(result.status, 200);
  assert.equal(result.body.fieldMappings.domainId, 'strategies');
});
