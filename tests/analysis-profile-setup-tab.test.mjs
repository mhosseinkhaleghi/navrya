import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Analysis Profile detail view's "Setup" tab: everything the two-step wizard popup captures
// should also be here, editable, without reopening the wizard. Static-source style, same
// convention as tests/analysis-profile-onboarding.test.mjs (no JSX transform in `node --test`).
const root = process.cwd();
const source = async () => (await readFile(path.join(root, 'navrya-src', 'analysisProfilesView.jsx'), 'utf8')).replace(/\r\n/g, '\n');

test('the detail pill bar has a Setup tab right after Overview (Concepts, Knowledge, Memory and Report follow)', async () => {
  const text = await source();
  assert.match(text, /\['overview', tr\(lang, 'tabOverview'\)\], \['setup', tr\(lang, 'tabSetup'\)\], \['concepts', tr\(lang, 'tabConcepts'\)\], \['knowledge', tr\(lang, 'tabKnowledge'\)\], \['memory', tr\(lang, 'tabMemory'\)\], \['report', tr\(lang, 'tabReport'\)\]/);
});

test('SetupTab edits every field the wizard popup captures: primary/secondary style, focusIds, customFocuses, customMethodNotes, customMethodLinks', async () => {
  const text = await source();
  const fn = text.slice(text.indexOf('function SetupTab('), text.indexOf('function ProfileDetail('));
  for (const field of ['primaryStyleId', 'secondaryStyleIds', 'focusIds', 'customFocuses', 'customMethodNotes', 'youtubeUrl', 'websiteUrl', 'referenceUrl']) {
    assert.match(fn, new RegExp(field), `SetupTab must manage ${field}`);
  }
});

test('SetupTab saves through exactly one onUpdate() call, which the parent wires to a single store.update() - never a per-keystroke autosave', async () => {
  const text = await source();
  const fn = text.slice(text.indexOf('function SetupTab('), text.indexOf('function ProfileDetail('));
  const saveFn = fn.slice(fn.indexOf('function save()'), fn.indexOf('function save()') + 400);
  assert.match(saveFn, /onUpdate\(\{/);
  assert.equal((fn.match(/onUpdate\(/g) || []).length, 1, 'onUpdate must be called from exactly one place (the explicit Save button), never on every change');
  assert.match(text, /onUpdateProfile=\{\(patch\) => store\.update\(openProfile\.id, patch\)\}/);
});

test('SetupTab reuses the exact same store.helpers validators the wizard uses - never a second URL/focus validation copy', async () => {
  const text = await source();
  const fn = text.slice(text.indexOf('function SetupTab('), text.indexOf('function ProfileDetail('));
  assert.match(fn, /profileStore\(\)\s*&&\s*profileStore\(\)\.helpers/);
  assert.match(fn, /helpers\.makeCustomFocus/);
  assert.match(fn, /helpers\.normalizeHttpUrl/);
  assert.match(fn, /helpers\.isYoutubeUrl/);
});

test('SetupTab computes focus recommendations via the real registry (mergeFocusRecommendations), never a hardcoded per-style list', async () => {
  const text = await source();
  const fn = text.slice(text.indexOf('function SetupTab('), text.indexOf('function ProfileDetail('));
  assert.match(fn, /styles\.mergeFocusRecommendations\(primaryStyleId, secondaryStyleIds\)/);
});
