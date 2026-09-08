import assert from 'node:assert/strict';
import test from 'node:test';
import { buildManifest, loadSource, readExistingArtifact } from '../scripts/action-learnability-build.mjs';
import { isLearnableAction, getActionMetadata, manifestActionIds } from '../server/db/action-learnability.mjs';

// Voice Command Learning Profile addendum, section 2/3: the manifest is mechanically DERIVED from
// navrya-src/character-app.jsx's own real registerAction() calls (riskLevel/gateField/domain),
// never a second, hand-typed classification - this is the staleness gate that fails until
// `npm run action-learnability:build` is re-run and the result committed, the moment a real
// registration's own riskLevel/gateField/domain/id/requiredFields/optionalFields changes.

test('the committed manifest matches a fresh build from the real, current character-app.jsx - staleness gate', async () => {
  const source = await loadSource();
  const fresh = buildManifest(source);
  const existing = await readExistingArtifact();
  assert.ok(existing, 'server/db/action-learnability.generated.json must exist - run "npm run action-learnability:build"');
  assert.equal(existing.contentHash, fresh.contentHash, 'the committed manifest is stale - run "npm run action-learnability:build" and commit the result');
});

test('every id in the manifest is a real, non-empty, unique action id', async () => {
  const ids = manifestActionIds();
  assert.ok(ids.length > 0);
  assert.equal(new Set(ids).size, ids.length, 'no duplicate action ids');
  ids.forEach((id) => assert.ok(id && id.trim(), 'no empty action id'));
});

test('every action carrying a real gateField is classified confirmation_required, and is therefore never learnable - "never bypass a destructive confirmation"', async () => {
  const ids = manifestActionIds();
  const gated = ids.filter((id) => getActionMetadata(id).gateField);
  assert.ok(gated.length > 0, 'sanity check - this app has real gated actions today');
  gated.forEach((id) => {
    assert.equal(getActionMetadata(id).learnability, 'confirmation_required', id + ' has a gateField and must be confirmation_required');
    assert.equal(isLearnableAction(id), false, id + ' must never be learnable');
  });
});

test('every action with riskLevel "high" is never learnable, regardless of its own gateField presence', async () => {
  const ids = manifestActionIds();
  const highRisk = ids.filter((id) => getActionMetadata(id).riskLevel === 'high');
  assert.ok(highRisk.length > 0, 'sanity check - this app has real high-risk actions today');
  highRisk.forEach((id) => assert.equal(isLearnableAction(id), false, id + ' (riskLevel high) must never be learnable'));
});

test('the brief\'s own explicitly named consequential/destructive/messaging/publishing actions are all confirmed non-learnable today', async () => {
  const forbidden = [
    'trade.cancel', 'trade.close', 'trade.delete', 'session.delete', 'entry.delete', 'scenario.delete',
    'pattern.delete', 'pattern.stage.remove', 'strategy.delete', 'message.compose', 'message.reply',
    'community.post.create', 'community.comment.create', 'marketplace.publish', 'marketplace.messageSeller'
  ];
  forbidden.forEach((id) => {
    const meta = getActionMetadata(id);
    assert.ok(meta, id + ' must be a real, registered action (a stale test fixture would be worse than no test)');
    assert.equal(isLearnableAction(id), false, id + ' must never be a valid learned-command target');
  });
});

test('an unregistered/removed action id is not learnable and returns no metadata', async () => {
  assert.equal(getActionMetadata('this.action.does.not.exist'), null);
  assert.equal(isLearnableAction('this.action.does.not.exist'), false);
});

test('reusableFields for a gated action never includes its own gateField', async () => {
  const ids = manifestActionIds();
  const gated = ids.filter((id) => getActionMetadata(id).gateField);
  gated.forEach((id) => {
    const meta = getActionMetadata(id);
    assert.equal(meta.reusableFields.includes(meta.gateField), false, id + '\'s reusableFields must exclude its own gateField ' + meta.gateField);
  });
});

test('at least one action in each of the three learnable classifications exists today (learnable_workflow/learnable_navigation/learnable_safe_update) - the feature has something real to learn', async () => {
  const ids = manifestActionIds();
  const byClass = {};
  ids.forEach((id) => { const c = getActionMetadata(id).learnability; byClass[c] = (byClass[c] || 0) + 1; });
  assert.ok(byClass.learnable_workflow > 0);
  assert.ok(byClass.learnable_navigation > 0);
  assert.ok(byClass.learnable_safe_update > 0);
});
