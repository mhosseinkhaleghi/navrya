import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Voice/Chat form-interview workflow upgrade, defect 5: "personal account" must reliably switch
// the real UI from Prop to Personal before Personal-only fields are asked or written. Static-source
// guards (navrya-src has no DOM/React test harness, matching every other *.jsx test file's own
// convention) plus a real, executed test of the deterministic normalizeAccountKind() aliasing
// function itself (extracted by brace-matching, the same convention
// tests/psychology-intake-enum-normalization.test.mjs already established).

const root = process.cwd();
const characterAppSrc = await readFile(path.join(root, 'navrya-src', 'character-app.jsx'), 'utf8');
const accountsViewSrc = await readFile(path.join(root, 'navrya-src', 'accountsView.jsx'), 'utf8');

function extractFunctionSource(src, name) {
  const startMatch = new RegExp(`function ${name}\\(`).exec(src);
  assert.ok(startMatch, `could not find the real function ${name} in character-app.jsx`);
  const braceOpen = src.indexOf('{', startMatch.index);
  let depth = 0, i = braceOpen;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  assert.ok(depth === 0, `unbalanced braces extracting ${name}`);
  return src.slice(startMatch.index, i + 1);
}

function extractArrayLiteral(src, name) {
  const idx = src.indexOf(`var ${name} = [`);
  assert.notEqual(idx, -1, `could not find ${name}`);
  const end = src.indexOf('];', idx);
  return src.slice(idx, end + 2);
}

function normalizeAccountKindSandbox() {
  const src = [
    extractArrayLiteral(characterAppSrc, 'ACCOUNT_KIND_PERSONAL_ALIASES'),
    extractArrayLiteral(characterAppSrc, 'ACCOUNT_KIND_PROP_ALIASES'),
    extractFunctionSource(characterAppSrc, 'normalizeAccountKind')
  ].join('\n');
  const sandbox = {};
  vm.runInNewContext(src + '\nthis.normalizeAccountKind = normalizeAccountKind;', sandbox);
  return sandbox.normalizeAccountKind;
}

test('normalizeAccountKind() canonicalizes "personal"/"private" and Persian/Arabic/Spanish equivalents to \'personal\'', () => {
  const normalize = normalizeAccountKindSandbox();
  for (const value of ['personal', 'Personal', 'private', 'a personal account', 'شخصی', 'خصوصی', 'شخصي', 'خاص', 'cuenta personal', 'privada']) {
    assert.equal(normalize(value), 'personal', `expected "${value}" to normalize to 'personal'`);
  }
});

test('normalizeAccountKind() canonicalizes "prop"/"funded"/"firm" and Persian/Arabic/Spanish equivalents to \'prop\'', () => {
  const normalize = normalizeAccountKindSandbox();
  for (const value of ['prop', 'a prop firm', 'funded', 'firm', 'پراپ', 'شرکتی', 'ممول', 'financiada']) {
    assert.equal(normalize(value), 'prop', `expected "${value}" to normalize to 'prop'`);
  }
});

test('normalizeAccountKind() returns null (leaves the field missing) for an unrecognized value - never guesses', () => {
  const normalize = normalizeAccountKindSandbox();
  assert.equal(normalize('crypto'), null);
  assert.equal(normalize(''), null);
  assert.equal(normalize(null), null);
});

test('account.create/account.edit route the kind field through normalizeAccountField, which calls normalizeAccountKind for path === \'kind\' and falls back to the existing gate-rejection for everything else', () => {
  assert.match(characterAppSrc, /function normalizeAccountField\(gateFieldName\) \{/);
  assert.match(characterAppSrc, /if \(path === 'kind'\) return normalizeAccountKind\(value\);/);
});

test('the real account-manual-form registration already visibly switches the UI the instant it receives a canonical \'personal\'/\'prop\' value - the setter this normalizer feeds', () => {
  assert.match(accountsViewSrc, /if \(path === 'kind'\) \{ setMan\(\(m\) => \(\{ \.\.\.m, kind: value === 'personal' \? 'personal' : 'prop' \}\)\); return; \}/);
});

test('the account-manual-form interview declares kind as the FIRST question (order: 1), before every other field', () => {
  const idx = accountsViewSrc.indexOf('function buildAccountInterviewFields()');
  const block = accountsViewSrc.slice(idx, accountsViewSrc.indexOf('registry.register(\'account-manual-form\'', idx));
  assert.match(block, /\{ path: 'kind', order: 1,/);
});

test('Prop rule fields declare visibleWhen: () => manRef.current.kind === \'prop\', and Personal rule fields the mirror-image check - re-evaluated live, never a one-time snapshot', () => {
  const idx = accountsViewSrc.indexOf('function buildAccountInterviewFields()');
  const block = accountsViewSrc.slice(idx, accountsViewSrc.indexOf('registry.register(\'account-manual-form\'', idx));
  assert.match(block, /visibleWhen: \(\) => manRef\.current\.kind === 'prop'/);
  assert.match(block, /visibleWhen: \(\) => manRef\.current\.kind === 'personal'/);
});

test('manRef is read fresh on every render (the established stale-closure fix already used elsewhere in this file), so a kind switch mid-interview is reflected on the very next visibility check without needing the registration effect itself to re-run', () => {
  assert.match(accountsViewSrc, /const manRef = React\.useRef\(man\);\s*\n\s*manRef\.current = man;/);
});

test('the account-manual-form interview declares a final `save` action gate, deliberately outside the real form allowlist', () => {
  const idx = accountsViewSrc.indexOf('function buildAccountInterviewFields()');
  const block = accountsViewSrc.slice(idx, accountsViewSrc.indexOf('registry.register(\'account-manual-form\'', idx));
  assert.match(block, /\{ path: 'save', order: 99,[\s\S]{0,80}role: 'gate' \}/);
});
