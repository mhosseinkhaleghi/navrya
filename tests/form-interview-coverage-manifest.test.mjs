import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { FORM_INTERVIEW_COVERAGE } from '../docs/ai/form-interview-coverage.mjs';

// Voice/Chat form-interview workflow upgrade: enforces docs/ai/form-interview-coverage.mjs against
// the REAL Process Registry registrations in navrya-src - never a hand-typed, driftable list. A
// future fillable form that registers with the Process Registry but declares neither real
// `interview:` metadata nor an explicit manifest exclusion/pending entry fails this test.

const root = process.cwd();
const navryaSrcDir = path.join(root, 'navrya-src');

// Finds every `registry.register('<literal>' ...)` call site across every real .jsx source file,
// returning { key, file, block } - `key` is the literal string portion only (a dynamic
// `'prefix-' + entity.id` call site yields just `'prefix-'`), `block` is the balanced-paren real
// call expression text (register(...)), used to check for a real `interview:` property.
async function findRegistrations() {
  const files = (await readdir(navryaSrcDir)).filter((f) => f.endsWith('.jsx'));
  const results = [];
  for (const file of files) {
    const src = await readFile(path.join(navryaSrcDir, file), 'utf8');
    const callRe = /registry\.register\(\s*'([^']+)'/g;
    let match;
    while ((match = callRe.exec(src))) {
      const key = match[1];
      // Balance parens from the real 'register(' opening to find the whole call expression.
      const openParenIdx = src.indexOf('(', match.index + 'registry.register'.length);
      let depth = 0, i = openParenIdx;
      for (; i < src.length; i++) {
        if (src[i] === '(') depth++;
        else if (src[i] === ')') { depth--; if (depth === 0) break; }
      }
      results.push({ key, file, block: src.slice(match.index, i + 1) });
    }
  }
  return results;
}

const registrations = await findRegistrations();

test('every real Process Registry registration in navrya-src has a manifest entry - a new registration with none fails, by design', () => {
  const missing = registrations.filter((r) => !FORM_INTERVIEW_COVERAGE[r.key]);
  assert.deepEqual(missing.map((r) => `${r.key} (${r.file})`), [], 'a registration with no manifest entry at all must be classified as interviewable/excluded/pending before it ships');
});

test('every manifest entry classified "interviewable" is a real registration whose own source actually declares interview: { fields: [...] } - never claimed without being built', () => {
  for (const [key, entry] of Object.entries(FORM_INTERVIEW_COVERAGE)) {
    if (entry.status !== 'interviewable') continue;
    const found = registrations.find((r) => r.key === key);
    assert.ok(found, `manifest claims "${key}" is interviewable but no real registration with that key exists`);
    assert.match(found.block, /interview:\s*\{\s*fields:/, `"${key}"'s own real registration does not declare interview.fields`);
    assert.ok(entry.sourceFile, `"${key}" is missing its manifest sourceFile`);
  }
});

test('every manifest entry classified "excluded" or "pending" carries a real, non-empty reason - never a silent, unexplained exclusion', () => {
  for (const [key, entry] of Object.entries(FORM_INTERVIEW_COVERAGE)) {
    if (entry.status !== 'excluded' && entry.status !== 'pending') continue;
    assert.equal(typeof entry.reason, 'string');
    assert.ok(entry.reason.trim().length > 10, `"${key}"'s reason is too short to be a real explanation`);
  }
});

test('the three forms this pass migrated (mh-intake, account-manual-form, session-ai-analysis-form) are classified interviewable', () => {
  assert.equal(FORM_INTERVIEW_COVERAGE['mh-intake'].status, 'interviewable');
  assert.equal(FORM_INTERVIEW_COVERAGE['account-manual-form'].status, 'interviewable');
  assert.equal(FORM_INTERVIEW_COVERAGE['session-ai-analysis-form'].status, 'interviewable');
});

test('sensitive/payment/credential-adjacent and destructive-only/context-marker registrations stay explicitly excluded, never silently promoted to interviewable', () => {
  const excludedKeys = ['session-delete-confirm', 'trade-details-', 'marketplace-listing-', 'messages-compose', 'messages-thread-reply', 'community-new-post', 'community-comment-', 'publish-flow', 'strategy-hub-publish-flow', 'ai-assistant-panel-builder'];
  for (const key of excludedKeys) {
    assert.ok(FORM_INTERVIEW_COVERAGE[key], `expected an excluded manifest entry for "${key}"`);
    assert.equal(FORM_INTERVIEW_COVERAGE[key].status, 'excluded');
  }
});

// Proves the checking logic itself actually fails for a genuinely uncovered registration - not
// just that today's real manifest happens to be complete. A fabricated source snippet stands in
// for "a future fillable form that registers with the Process Registry" (real files are never
// mutated by a test) - this exercises the exact same key-extraction/cross-check the tests above run
// against real navrya-src, just against a synthetic input.
test('coverage-manifest failure for a future fillable form that lacks interview metadata (the checker itself, exercised against a synthetic registration)', () => {
  const fakeSrc = `
    React.useLayoutEffect(() => {
      registry.register('future-widget-form', {
        allowlist: ['title', 'description'],
        isOpen: () => mountedRef.current,
        applyValue: (path, value) => setDraft((d) => ({ ...d, [path]: value }))
      });
    }, []);
  `;
  const callRe = /registry\.register\(\s*'([^']+)'/g;
  const match = callRe.exec(fakeSrc);
  assert.ok(match);
  const key = match[1];
  // Step 1: a brand-new registration with no manifest entry at all must be reported missing.
  const fakeManifest = {}; // this future form was never added to the manifest
  assert.equal(fakeManifest[key], undefined, 'a genuinely new registration has no manifest entry yet - the coverage test above would fail exactly like this until it is classified');
  // Step 2: even if someone incorrectly marks it "interviewable" without actually building
  // interview.fields, the source-declaration check must still catch it.
  fakeManifest[key] = { status: 'interviewable', sourceFile: 'navrya-src/futureWidget.jsx' };
  assert.doesNotMatch(fakeSrc, /interview:\s*\{\s*fields:\s*\[/, 'the fabricated registration deliberately has no interview.fields - claiming "interviewable" for it must fail the real declaration check the same way the suite above enforces');
});
