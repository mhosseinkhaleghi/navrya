import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Regression test for two real, back-to-back production incidents on the same file pair: opening
// the Strategies hub's Analysis Profile Setup tab threw "SPECIAL_STYLE_IDS is not defined", and
// once that shipped, its very next real-browser check threw "FocusChip is not defined" - both were
// pieces of analysisProfileOnboarding.jsx (a constant, then a component) that analysisProfilesView
// .jsx's inline SetupTab reused by copying the wizard's JSX without importing what it borrowed.
// Because every test for these .jsx files is static-source (no JSX transform in `node --test`, per
// this repo's own convention - see tests/analysis-profile-onboarding.test.mjs's header), nothing
// ever actually EXECUTED the SetupTab render, so neither ReferenceError was caught until a real
// user opened the page in a real browser, live in production, twice in a row.
//
// This file closes that blind spot for the whole Analysis Profile domain with two checks per listed
// file: (1) every bare ALL_CAPS/CONSTANT_CASE identifier used as real code (not inside a string, a
// comment, a regex literal, or after a `.` - i.e. not a property access), and (2) every `<Component`
// JSX tag - must be either imported or declared (const/let/var/function/class, including
// destructuring) in that same file. Deliberately narrow: it catches exactly the shape of bug that
// shipped (a name reused across files without being wired up), scoped to files this repo cannot
// otherwise verify by execution - not a general-purpose linter.

const root = process.cwd();
const FILES = [
  'analysisProfileOnboarding.jsx', 'analysisProfileRite.jsx', 'analysisProfilesView.jsx', 'analysisProfileConcepts.jsx',
  'analysisProfileMemory.jsx', 'analysisProfileKnowledge.jsx', 'analysisProfileChat.jsx',
  'analysisProfilePreview.jsx', 'analysisProfileReport.jsx', 'analysisProfileBrain.jsx', 'engineLearning.jsx', 'reportCharts.jsx'
];

const KNOWN_GLOBALS = new Set([
  'React', 'JSON', 'Object', 'Array', 'Math', 'Date', 'String', 'Number', 'Boolean', 'Promise',
  'Map', 'Set', 'RegExp', 'Error', 'Intl', 'URL', 'NaN', 'Infinity', 'CSS'
]);

const CONSTANT_RE = /(?<![.\w])([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+|[A-Z]{4,})\b/g;
const JSX_TAG_RE = /<([A-Z][A-Za-z0-9]*)\b/g;

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

// Every name this file makes available at module scope: imported (named or default), or
// declared via const/let/var/function/class (including destructuring).
function declaredNames(src) {
  const known = new Set(KNOWN_GLOBALS);
  for (const m of src.matchAll(/import\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:,|from)/g)) known.add(m[1]);
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from/g)) {
    for (const part of m[1].split(',')) { const name = part.trim().split(/\s+as\s+/).pop().trim(); if (name) known.add(name); }
  }
  for (const m of src.matchAll(/\b(?:const|let|var|function|class)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g)) known.add(m[1]);
  for (const m of src.matchAll(/\b(?:const|let|var)\s*\{([^}]*)\}\s*=/g)) {
    for (const part of m[1].split(',')) { const name = part.trim().split(':')[0].trim(); if (name) known.add(name); }
  }
  return known;
}

function undeclaredConstants(source) {
  const src = stripNoise(source);
  const known = declaredNames(src);
  const used = new Set([...src.matchAll(CONSTANT_RE)].map((m) => m[1]));
  return [...used].filter((name) => !known.has(name)).sort();
}

function undeclaredJsxComponents(source) {
  const src = stripNoise(source);
  const known = declaredNames(src);
  const used = new Set([...src.matchAll(JSX_TAG_RE)].map((m) => m[1]));
  return [...used].filter((name) => !known.has(name)).sort();
}

for (const file of FILES) {
  test(`${file}: every bare CONSTANT_CASE identifier is imported or declared in this file`, async () => {
    const source = await readFile(path.join(root, 'navrya-src', file), 'utf8');
    const missing = undeclaredConstants(source);
    assert.deepEqual(missing, [], `${file} references CONSTANT_CASE identifier(s) that are never imported or declared: ${missing.join(', ')}`);
  });

  test(`${file}: every <Component /> JSX tag is imported or declared in this file`, async () => {
    const source = await readFile(path.join(root, 'navrya-src', file), 'utf8');
    const missing = undeclaredJsxComponents(source);
    assert.deepEqual(missing, [], `${file} uses JSX component(s) that are never imported or declared: ${missing.join(', ')}`);
  });
}
