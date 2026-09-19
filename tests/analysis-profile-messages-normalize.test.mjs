import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeMessageProposals, normalizeTokenUsage, sanitizeMessageFields, mergeProposalStatuses,
  MESSAGE_CONTENT_MAX, PROPOSALS_PER_MESSAGE_MAX, CONCEPT_TITLE_MAX, CONCEPT_DESCRIPTION_MAX, UNDERSTANDING_SUMMARY_MAX
} from '../server/db/analysis-profile-normalize.mjs';

// Pure sanitizers for the Analysis Profile teaching chat (074_analysis_profile_messages.sql). Both
// repositories and the API run every message through these, so nothing malformed reaches the database.

const concept = (extra) => ({ id: 'p1', kind: 'concept', title: 'Swept liquidity levels', description: 'stops taken', priority: 'mandatory', ...extra });
const understanding = (extra) => ({ id: 'p2', kind: 'understanding', text: 'Reads structure first.', ...extra });

test('a concept and an understanding proposal round-trip with a pending status by default', () => {
  const out = normalizeMessageProposals([concept(), understanding()]);
  assert.deepEqual(out, [
    { id: 'p1', kind: 'concept', title: 'Swept liquidity levels', description: 'stops taken', priority: 'mandatory', status: 'pending' },
    { id: 'p2', kind: 'understanding', text: 'Reads structure first.', status: 'pending' }
  ]);
});

test('an unknown priority falls back to preferred and an unknown status to pending; nothing is invented beyond that', () => {
  const [c] = normalizeMessageProposals([concept({ priority: 'urgent!!', status: 'whatever' })]);
  assert.equal(c.priority, 'preferred');
  assert.equal(c.status, 'pending');
  assert.equal(normalizeMessageProposals([concept({ status: 'applied' })])[0].status, 'applied', 'a real status is preserved');
});

test('malformed proposals are dropped, never thrown on: wrong kind, blank title/text, bad or duplicate id, non-objects', () => {
  const out = normalizeMessageProposals([
    null, 7, 'x', [], { kind: 'concept', title: 'no id' }, concept({ id: 'has space' }), concept({ id: '' }),
    { id: 'k', kind: 'mystery', title: 'x' }, concept({ id: 'blank', title: '   ' }), understanding({ id: 'blank2', text: '   ' }),
    concept({ id: 'ok' }), concept({ id: 'ok', title: 'duplicate id' })
  ]);
  assert.deepEqual(out.map((p) => p.id), ['ok']);
  assert.equal(out[0].title, 'Swept liquidity levels', 'the first proposal with an id wins');
  assert.deepEqual(normalizeMessageProposals(undefined), []);
  assert.deepEqual(normalizeMessageProposals('nope'), []);
});

test('caps: at most 8 proposals, titles 100, descriptions 300, understanding 4000, and whitespace collapsed', () => {
  const many = Array.from({ length: 20 }, (_, i) => concept({ id: 'p' + i, title: 'T' + i }));
  assert.equal(normalizeMessageProposals(many).length, PROPOSALS_PER_MESSAGE_MAX);
  const [c] = normalizeMessageProposals([concept({ title: 't'.repeat(500), description: 'd'.repeat(900) })]);
  assert.equal(c.title.length, CONCEPT_TITLE_MAX);
  assert.equal(c.description.length, CONCEPT_DESCRIPTION_MAX);
  const [u] = normalizeMessageProposals([understanding({ text: 'u'.repeat(9000) })]);
  assert.equal(u.text.length, UNDERSTANDING_SUMMARY_MAX);
  assert.equal(normalizeMessageProposals([concept({ title: '  a   b\n c ' })])[0].title, 'a b c');
});

test('normalizeTokenUsage keeps only the two real numbers as whole non-negative numbers, and returns null for nothing', () => {
  assert.deepEqual(normalizeTokenUsage({ promptTokens: 120.9, completionTokens: 40, secret: 'x', raw: { a: 1 } }), { promptTokens: 120, completionTokens: 40 });
  assert.deepEqual(normalizeTokenUsage({ promptTokens: -5, completionTokens: 'lots' }), null);
  assert.deepEqual(normalizeTokenUsage({ promptTokens: 0, completionTokens: 0 }), null);
  assert.deepEqual(normalizeTokenUsage({ promptTokens: 10 }), { promptTokens: 10, completionTokens: 0 });
  for (const junk of [null, undefined, 7, 'x', [], [{ promptTokens: 1 }]]) assert.equal(normalizeTokenUsage(junk), null);
});

test('a user message needs text, and never carries proposals or token usage (they are stripped, not trusted)', () => {
  assert.deepEqual(sanitizeMessageFields({ role: 'user', content: '  hello  ', proposals: [concept()], tokenUsage: { promptTokens: 9 } }),
    { role: 'user', content: 'hello', proposals: [], tokenUsage: null });
  for (const content of ['', '   ', null, undefined]) assert.equal(sanitizeMessageFields({ role: 'user', content }), null);
});

test('an assistant message needs text OR at least one valid proposal', () => {
  assert.equal(sanitizeMessageFields({ role: 'assistant', content: '' }), null);
  assert.equal(sanitizeMessageFields({ role: 'assistant', content: '', proposals: [{ kind: 'nope' }] }), null);
  assert.equal(sanitizeMessageFields({ role: 'assistant', content: 'reply' }).proposals.length, 0);
  const onlyProposals = sanitizeMessageFields({ role: 'assistant', content: '', proposals: [concept()], tokenUsage: { promptTokens: 5, completionTokens: 2 } });
  assert.equal(onlyProposals.content, '');
  assert.deepEqual(onlyProposals.tokenUsage, { promptTokens: 5, completionTokens: 2 });
});

test('an unknown role, or something that is not an object, cannot be a message; content is capped', () => {
  for (const input of [null, undefined, 'hi', 7, [], {}, { role: 'system', content: 'x' }, { role: 'ADMIN', content: 'x' }]) assert.equal(sanitizeMessageFields(input), null);
  assert.equal(sanitizeMessageFields({ role: 'user', content: 'x'.repeat(20000) }).content.length, MESSAGE_CONTENT_MAX);
});

test('mergeProposalStatuses resolves a pending proposal ONCE - an applied or dismissed one is never flipped back or applied twice', () => {
  const proposals = normalizeMessageProposals([concept({ id: 'a' }), concept({ id: 'b', title: 'B' }), understanding({ id: 'c' })]);
  const first = mergeProposalStatuses(proposals, { a: 'applied', c: 'dismissed' });
  assert.deepEqual(first.map((p) => p.status), ['applied', 'pending', 'dismissed']);
  const second = mergeProposalStatuses(first, { a: 'dismissed', c: 'applied', b: 'applied' });
  assert.deepEqual(second.map((p) => p.status), ['applied', 'applied', 'dismissed'], 'only the still-pending proposal changed');
});

test('mergeProposalStatuses ignores unknown ids and refuses to set anything but applied/dismissed; unusable input yields null', () => {
  const proposals = normalizeMessageProposals([concept({ id: 'a' })]);
  assert.deepEqual(mergeProposalStatuses(proposals, { nope: 'applied' }).map((p) => p.status), ['pending']);
  assert.equal(mergeProposalStatuses(proposals, { a: 'pending' }), null, 'cannot "un-resolve" or set pending');
  assert.equal(mergeProposalStatuses(proposals, { a: 'bogus' }), null);
  for (const junk of [null, undefined, 'applied', 7, [], {}]) assert.equal(mergeProposalStatuses(proposals, junk), null);
  assert.deepEqual(mergeProposalStatuses(undefined, { a: 'applied' }), []);
  assert.equal(proposals[0].status, 'pending', 'the input is never mutated');
});
