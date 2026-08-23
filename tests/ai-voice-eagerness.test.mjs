import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const root = process.cwd();
const source = await readFile(path.join(root, 'public', 'pages', 'shared', 'ai-voice-eagerness.js'), 'utf8');

function sandbox() {
  const window = {};
  vm.runInNewContext(source, { window: window }, { filename: 'ai-voice-eagerness.js' });
  return window.TradeJournalAIVoiceEagerness.deriveEagerness;
}

test('a workflow waiting on exactly one yes/no gate field gets high eagerness - a destructive/publish confirmation is a short, closed-form answer', () => {
  const deriveEagerness = sandbox();
  ['confirm', 'confirmDelete', 'confirmPublish', 'send', 'publish'].forEach((field) => {
    assert.equal(deriveEagerness({ workflow: { missing: [field] } }), 'high', field);
  });
});

test('a workflow waiting on exactly one short slot field (city, timeframe, a price, a percent) gets high eagerness', () => {
  const deriveEagerness = sandbox();
  ['city', 'timeframe', 'direction', 'exitPrice', 'entryPrice', 'stopLoss', 'riskPercent', 'leverage', 'ratingValue'].forEach((field) => {
    assert.equal(deriveEagerness({ workflow: { missing: [field] } }), 'high', field);
  });
});

test('a workflow waiting on exactly one long-form field (a note, description, evidence, review) gets low eagerness - cutting the user off mid-thought is worse than waiting', () => {
  const deriveEagerness = sandbox();
  ['note', 'description', 'evidence', 'problem', 'trigger', 'reviewText', 'draft'].forEach((field) => {
    assert.equal(deriveEagerness({ workflow: { missing: [field] } }), 'low', field);
  });
});

test('Therapist Mode always gets low eagerness, regardless of workflow state - reflection/journaling is long-form by nature', () => {
  const deriveEagerness = sandbox();
  assert.equal(deriveEagerness({ therapistMode: true }), 'low');
  assert.equal(deriveEagerness({ therapistMode: true, workflow: { missing: ['confirm'] } }), 'low', 'even a technically-short field must not override Therapist Mode');
});

test('an explicit Companion "Explain" (teaching) turn gets low eagerness', () => {
  const deriveEagerness = sandbox();
  assert.equal(deriveEagerness({ companionIntent: 'explain' }), 'low');
});

test('no active workflow, or a workflow missing more than one unrelated field, falls back to medium - normal conversation, no single expected shape to anchor on', () => {
  const deriveEagerness = sandbox();
  assert.equal(deriveEagerness({}), 'medium', 'no workflow at all');
  assert.equal(deriveEagerness({ workflow: { missing: [] } }), 'medium', 'workflow with nothing missing');
  assert.equal(deriveEagerness({ workflow: { missing: ['city', 'timeframe'] } }), 'medium', 'two short fields still missing - no single closed-form answer expected next');
});

test('a workflow missing multiple fields that are ALL long-form still gets low eagerness', () => {
  const deriveEagerness = sandbox();
  assert.equal(deriveEagerness({ workflow: { missing: ['description', 'evidence', 'problem', 'trigger'] } }), 'low');
});

test('a workflow missing an unrecognized field name (not in any list) falls back to medium, never guessed as high or low', () => {
  const deriveEagerness = sandbox();
  assert.equal(deriveEagerness({ workflow: { missing: ['someBrandNewFieldNeverSeenBefore'] } }), 'medium');
});
