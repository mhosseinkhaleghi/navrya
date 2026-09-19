import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Regression test for a real production incident: analysisProfilesView.jsx referenced
// SPECIAL_STYLE_IDS (a SetupTab filter constant) without ever importing or declaring it - the
// constant existed only as an unexported top-level const in analysisProfileOnboarding.jsx. Because
// every test for these .jsx files is static-source (no JSX transform in `node --test`, per this
// repo's own convention - see tests/analysis-profile-onboarding.test.mjs's header), nothing ever
// actually EXECUTED the SetupTab render, so the `ReferenceError: SPECIAL_STYLE_IDS is not defined`
// shipped silently through every prior phase's test run and only surfaced once a real user opened
// the Strategies hub in a real browser, live in production.
//
// This file closes that specific blind spot for the whole Analysis Profile domain: for each listed
// file, every bare ALL_CAPS/CONSTANT_CASE identifier used as real code (not inside a string, a
// comment, a regex literal, or after a `.` - i.e. not a property access) must be either imported or
// declared (const/let/var/function/class, including destructuring) in that same file. It is a
// deliberately narrow lint, not a general one: it catches exactly the shape of bug that just shipped
// (a shared constant used but never wired up), scoped to files this repo cannot otherwise verify by
// execution.

const root = process.cwd();
const FILES = [
  'analysisProfileOnboarding.jsx', 'analysisProfilesView.jsx', 'analysisProfileConcepts.jsx',
  'analysisProfileMemory.jsx', 'analysisProfileKnowledge.jsx', 'analysisProfileChat.jsx',
  'analysisProfilePreview.jsx', 'analysisProfileReport.jsx', 'engineLearning.jsx', 'reportCharts.jsx'
];

const KNOWN_GLOBALS = new Set([
  'React', 'JSON', 'Object', 'Array', 'Math', 'Date', 'String', 'Number', 'Boolean', 'Promise',
  'Map', 'Set', 'RegExp', 'Error', 'Intl', 'URL', 'NaN', 'Infinity', 'CSS'
]);

const IDENT_RE = /(?<![.\w])([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+|[A-Z]{4,})\b/g;

// Blanks out block/line comments and string/template literal bodies (keeping delimiters, so
// positions still line up), and best-effort blanks a `/regex/` literal when a `/` follows a
// character that can only mean "start of a regex" (an operator/keyword/opening bracket), never a
// division. Division inside these ten files is rare enough that a missed edge case only risks a
// false positive (an extra name to allowlist), never a false negative that could hide a real bug.
function stripNoise(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const two = src.slice(i, i + 2);
    const ch = src[i];
    if (two === '/*') { const end = src.indexOf('*/', i + 2); out += ' '.repeat((end === -1 ? n : end + 2) - i); i = end === -1 ? n : end + 2; continue; }
    if (two === '//') { const end = src.indexOf('\n', i + 2); out += ' '.repeat((end === -1 ? n : end) - i); i = end === -1 ? n : end; continue; }
    if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1;
      while (j < n && src[j] !== ch) { j += src[j] === '\\' ? 2 : 1; }
      out += ch + ' '.repeat(Math.max(0, j - i - 1)) + (j < n ? src[j] : '');
      i = j + 1; continue;
    }
    if (ch === '/') {
      const prevNonSpace = out.trimEnd().slice(-1);
      if (prevNonSpace === '' || '(,=:[!&|?{;'.includes(prevNonSpace) || out.trimEnd().endsWith('return')) {
        let j = i + 1; let closed = false;
        while (j < n && src[j] !== '\n') {
          if (src[j] === '\\') { j += 2; continue; }
          if (src[j] === '/') { closed = true; break; }
          j += 1;
        }
        if (closed) { out += '/' + ' '.repeat(Math.max(0, j - i - 1)) + '/'; i = j + 1; continue; }
      }
    }
    out += ch; i += 1;
  }
  return out;
}

function undeclaredConstants(source) {
  const src = stripNoise(source);
  const known = new Set(KNOWN_GLOBALS);
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from/g)) {
    for (const part of m[1].split(',')) { const name = part.trim().split(/\s+as\s+/).pop().trim(); if (name) known.add(name); }
  }
  for (const m of src.matchAll(/\b(?:const|let|var|function|class)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g)) known.add(m[1]);
  for (const m of src.matchAll(/\b(?:const|let|var)\s*\{([^}]*)\}\s*=/g)) {
    for (const part of m[1].split(',')) { const name = part.trim().split(':')[0].trim(); if (name) known.add(name); }
  }
  const used = new Set([...src.matchAll(IDENT_RE)].map((m) => m[1]));
  return [...used].filter((name) => !known.has(name)).sort();
}

for (const file of FILES) {
  test(`${file}: every bare CONSTANT_CASE identifier is imported or declared in this file`, async () => {
    const source = await readFile(path.join(root, 'navrya-src', file), 'utf8');
    const missing = undeclaredConstants(source);
    assert.deepEqual(missing, [], `${file} references CONSTANT_CASE identifier(s) that are never imported or declared: ${missing.join(', ')}`);
  });
}
