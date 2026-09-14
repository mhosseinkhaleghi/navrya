import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Session / Analysis Desk AI upgrade, section 3 - Multi-timeframe Session Entry capability.
// navrya-src has no DOM/React test harness in this project (see tests/session-actions.test.mjs's
// own comment) - these are static-source regression guards, the same convention every other *.jsx
// file in this repo is tested with (tests/live-session-market-chart.test.mjs, tests/session-
// analysis-action.test.mjs, ...).

const root = process.cwd();
const source = await readFile(path.join(root, 'navrya-src', 'liveSessionView.jsx'), 'utf8');

// Skips past the parameter list first (which may itself destructure an object - `({ a, b })` -
// before locating the function BODY's own opening brace; a naive "first { after the name" search
// would stop at the destructuring brace instead of the real body for every component here.
function extractFunctionSource(src, name) {
  const startMatch = new RegExp(`function ${name}\\(`).exec(src);
  assert.ok(startMatch, `could not find the real function ${name}`);
  const parenOpen = src.indexOf('(', startMatch.index);
  let parenDepth = 0, p = parenOpen;
  for (; p < src.length; p++) {
    if (src[p] === '(') parenDepth++;
    else if (src[p] === ')') { parenDepth--; if (parenDepth === 0) break; }
  }
  const braceOpen = src.indexOf('{', p);
  let depth = 0, i = braceOpen;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  assert.ok(depth === 0, `unbalanced braces extracting ${name}`);
  return src.slice(startMatch.index, i + 1);
}

test('MultiTimeframeSlots caps at maxSlots (4) and never silently guesses a timeframe when detection is unavailable', () => {
  const fn = extractFunctionSource(source, 'MultiTimeframeSlots');
  assert.match(fn, /const max = maxSlots \|\| 4;/);
  assert.match(fn, /filledCount < max/);
  assert.match(fn, /<option value="">\{tr\(lang, 'slotTimeframeManual'\)\}<\/option>/, 'an unfilled timeframe must show a real "pick one" prompt, never a pre-selected guess');
  assert.match(fn, /slot\.timeframe === slot\.asset\.timeframe/, 'the "auto-detected" badge only shows when the trader kept the detected value, never implying detection when they overrode it');
});

test('MultiTimeframeSlots reuses the one existing MediaPicker (intent=chartEntry) per slot - never a duplicate upload path', () => {
  const fn = extractFunctionSource(source, 'MultiTimeframeSlots');
  assert.match(fn, /<MediaPicker\s*\n\s*open=\{pickingIndex != null\} lang=\{lang\} intent="chartEntry" sessionId=\{null\}/);
  assert.match(fn, /onConfirm=\{\(asset\) => \{ const index = pickingIndex;/);
});

test('ChartEntryModal\'s Multi-timeframe toggle is off by default (preserving the exact existing single-image "Add chart" flow) and only offered for a plain manual open, never when pinned to a captured Media Asset', () => {
  const fn = extractFunctionSource(source, 'ChartEntryModal');
  assert.match(fn, /const \[multiTimeframe, setMultiTimeframe\] = React\.useState\(false\);/);
  assert.match(fn, /\{!mediaAsset && \(/);
  assert.match(fn, /<MultiTimeframeSlots lang=\{lang\} slots=\{multiSlots\} onChange=\{setMultiSlots\} maxSlots=\{4\} \/>/);
});

test('ChartEntryModal.submit() requires at least one filled slot AND a timeframe on every filled slot in multi-timeframe mode - "the user may select four slots and only fill two; analyze exactly the supplied images"', () => {
  const fn = extractFunctionSource(source, 'ChartEntryModal');
  assert.match(fn, /if \(multiTimeframe\) \{/);
  assert.match(fn, /const filled = multiSlots\.filter\(Boolean\);/);
  assert.match(fn, /if \(!filled\.length\) \{ setError\(tr\(lang, 'atLeastOneImageRequired'\)\); return; \}/);
  assert.match(fn, /if \(filled\.some\(\(s\) => !s\.timeframe\)\) \{ setError\(tr\(lang, 'atLeastOneImageRequired'\)\); return; \}/);
  assert.match(fn, /images: filled\.map\(\(s\) => \(\{ mediaAssetId: s\.asset\.id, imageUrl: s\.asset\.url, timeframe: s\.timeframe, detectedTimeframe: s\.asset\.timeframe \|\| '' \}\)\),/);
});

test('submitChartEntry builds the canonical images[] array and mirrors the FIRST image onto the entry\'s own legacy single-image fields (backward-compat read fallback), and links every image\'s Media Drive asset without re-uploading', () => {
  const fn = extractFunctionSource(source, 'submitChartEntry');
  assert.match(fn, /const isMulti = Array\.isArray\(images\) && images\.length > 0;/);
  assert.match(fn, /const primary = isMulti \? images\[0\] : null;/);
  assert.match(fn, /const canonicalImages = isMulti \? buildCanonicalImages\(images, entryId\) : \[\];/);
  assert.match(fn, /imageUrl: isMulti \? primary\.imageUrl : \(mediaAssetId \? imageUrl : undefined\),/);
  assert.match(fn, /if \(isMulti\) canonicalImages\.forEach\(\(img\) => \{ if \(img\.mediaAssetId\) linkMediaAsset\(img\.mediaAssetId,/);
});

test('a legacy single-image "Add chart" submission (no images[] array) is completely unaffected - the same storeImage()/single mediaAssetId path runs exactly as before', () => {
  const fn = extractFunctionSource(source, 'submitChartEntry');
  assert.match(fn, /const \{ blobId, preview \} = \(mediaAssetId \|\| isMulti\) \? \{ blobId: undefined, preview: undefined \} : await storeImage\(file\);/);
});

test('attachMultipleImages is a first-class capability for ANY entry kind (chart or movement) - reused, not duplicated, and mirrors the first image onto legacy fields only when the entry did not already have one', () => {
  const fn = extractFunctionSource(source, 'attachMultipleImages');
  assert.match(fn, /target\.images = canonicalImages;/);
  assert.match(fn, /if \(!target\.hasImage\) \{/);
  assert.match(fn, /canonicalImages\.forEach\(\(img\) => \{ if \(img\.mediaAssetId\) linkMediaAsset\(img\.mediaAssetId,/);
});

test('EntryDetailPanel offers "Add images" (multi-timeframe) for BOTH a chart and a movement entry - the same MultiImageAttachModal, never a kind-specific branch', () => {
  const fn = extractFunctionSource(source, 'EntryDetailPanel');
  assert.match(fn, /\[multiAttachOpen, setMultiAttachOpen\] = React\.useState\(false\);/);
  assert.doesNotMatch(fn, /entry\.type === 'movement' \? setMultiAttachOpen/, 'must never branch this action by entry kind');
  assert.match(fn, /<MultiImageAttachModal/);
  assert.match(fn, /onSave=\{async \(images\) => \{ await onAttachMultipleImages\(entry, images\); setMultiAttachOpen\(false\); \}\}/);
});

test('MultiImageAttachModal pre-fills its slots from an entry\'s existing images[] (editing, not always starting empty) and reuses the same required-timeframe validation', () => {
  const fn = extractFunctionSource(source, 'MultiImageAttachModal');
  assert.match(fn, /const existing = Array\.isArray\(entry\.images\) \? entry\.images : \[\];/);
  assert.match(fn, /if \(!filled\.length \|\| filled\.some\(\(s\) => !s\.timeframe\)\) \{ setError\(tr\(lang, 'atLeastOneImageRequired'\)\); return; \}/);
});

test('all four i18n dictionaries declare the new multi-timeframe strings (toggle, hint, add/remove slot, manual/auto-detected labels)', () => {
  ['multiTimeframeToggle', 'multiTimeframeHint', 'addImageSlot', 'slotTimeframeDetected', 'slotTimeframeManual', 'atLeastOneImageRequired', 'removeImageSlot'].forEach((key) => {
    const count = (source.match(new RegExp(key + ':', 'g')) || []).length;
    assert.ok(count >= 4, `${key} must be declared in all four language blocks (found ${count})`);
  });
});
