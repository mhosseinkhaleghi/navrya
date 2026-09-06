import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Slice U1-f (execution brief section 9 item 5, "a startable Fate operation"): the real Session
// Fate flow (PulseBand's own "Fate" button - a final chart entry, then a whole-session outcome
// summary) had no Action Registry action at all. session.fate.run wraps the exact same real
// trigger PulseBand already calls (withPreSessionCheckIn -> setFateStep('entry')) - never a
// fabricated shortcut. The real two-step flow, once open, is already AI-fillable through its own
// pre-existing live-session-fate-entry/live-session-fate-summary registrations, so this action
// carries no fields of its own. Same convention as tests/session-analysis-action.test.mjs and
// tests/session-actions.test.mjs (F19/F20): navrya-src has no DOM test harness in this project -
// the real proof is real-browser verification. These are static-source regression guards.

const root = process.cwd();
const characterAppSrc = await readFile(path.join(root, 'navrya-src', 'character-app.jsx'), 'utf8');
const liveSessionSrc = await readFile(path.join(root, 'navrya-src', 'liveSessionView.jsx'), 'utf8');

function actionBlock(id) {
  const re = new RegExp(`id: '${id.replace(/\./g, '\\.')}'[\\s\\S]*?resultContext: \\(\\) => \\{\\}\\s*\\}\\);`);
  const match = re.exec(characterAppSrc);
  assert.ok(match, `could not find the real ${id} registration`);
  return match[0];
}

// --- Action Registry: session.fate.run ---

test('session.fate.run has no required/optional fields of its own (the real two-step flow is separately AI-fillable once open via its own pre-existing registrations), deliberately does NOT declare entityAlreadyPersisted (no chat-dock-core.js exclusion-list entry needed, mirroring session.movementEntry.create\'s simpler self-completing precedent), and is only available while a Session is actively open', () => {
  const block = actionBlock('session.fate.run');
  assert.match(block, /domain: 'sessions'/);
  assert.doesNotMatch(block, /entityAlreadyPersisted/);
  assert.match(block, /requiredFields: \[\], optionalFields: \[\]/);
  assert.match(block, /available: \(context\) => !!\(context && context\.activeEntities && context\.activeEntities\.sessionId\)/);
});

test('session.fate.run\'s open() drives the real live session hub (hub.startFate()) via the shared pollFor() helper - the exact same pattern chartEntry.create/analysis.run already use, never a second hub-lookup mechanism - then polls for the real live-session-fate-entry registration to actually appear before resolving', () => {
  const block = actionBlock('session.fate.run');
  assert.match(block, /if \(store\.getState\(\)\.activeId !== 'sessions'\) store\.setActiveId\('sessions'\);/);
  assert.match(block, /window\.TradeJournalNavryaLiveSessionHub/);
  assert.match(block, /hub\.startFate\(\);/);
  assert.match(block, /registry\.query\('live-session-fate-entry'\)\.open/);
  assert.match(block, /resolve\(\{ processId: 'live-session-fate-entry' \}\)/);
});

test('session.fate.run\'s open() resolves null (never hangs the calling workflow forever) both when the Live Session workspace never mounted and when the pre-session check-in gate defers the flow (live-session-fate-entry never actually registers)', () => {
  const block = actionBlock('session.fate.run');
  assert.match(block, /\(\) => resolve\(null\) \/\/ the pre-session check-in gate may have deferred it/);
  assert.match(block, /\(\) => resolve\(null\)\r?\n\s*\);\r?\n\s*\}\),/);
});

test('session.fate.run\'s submit() is a no-op - the real flow already started inside open(), and the two-step form itself is filled/submitted through its own live-session-fate-entry/live-session-fate-summary registrations, not this action', () => {
  const block = actionBlock('session.fate.run');
  assert.match(block, /submit: \(\) => undefined,/);
});

test('session.fate.run never touches API keys, auth tokens, or admin credentials', () => {
  const block = actionBlock('session.fate.run');
  assert.doesNotMatch(block, /apiKey|api_key|authToken|adminKey/i);
});

// --- liveSessionView.jsx: the hub method ---

test('the hub ref object exposes setFateStep alongside the pre-existing fields, kept current every render via the same liveSessionHubRef.current = {...} assignment every other hub-backed field already uses - never a stale closure', () => {
  assert.match(liveSessionSrc, /liveSessionHubRef\.current = \{ session, addEntry, addScenario, setChartModalOpen, withPreSessionCheckIn, selectEntry, setOpenScenarios, setSessionAnalysisEntry, setSessionAnalysisAutoRun, setFateStep \};/);
});

test('hub.startFate() calls the EXACT same real trigger PulseBand\'s own onFate handler already calls (withPreSessionCheckIn gate, then setFateStep(\'entry\')) - never a fabricated shortcut or a second, parallel way to enter the Fate flow', () => {
  const fn = liveSessionSrc.slice(liveSessionSrc.indexOf('startFate: () =>'), liveSessionSrc.indexOf('startFate: () =>') + 200);
  assert.match(fn, /liveSessionHubRef\.current\.withPreSessionCheckIn\(\(\) => liveSessionHubRef\.current\.setFateStep\('entry'\)\);/);
  assert.match(liveSessionSrc, /onFate=\{\(\) => withPreSessionCheckIn\(\(\) => setFateStep\('entry'\)\)\}/, 'PulseBand\'s own manual trigger must still call the same withPreSessionCheckIn/setFateStep pair, proving startFate() is not a second, divergent path');
});

test('live-session-fate-entry\'s own registration is unchanged by this slice - still gated on mountedRef (only open while fateStep === \'entry\'), so query(\'live-session-fate-entry\').open genuinely reflects whether the real form is showing', () => {
  const idx = liveSessionSrc.indexOf("registry.register('live-session-fate-entry'");
  assert.ok(idx > -1);
  const block = liveSessionSrc.slice(idx, idx + 300);
  assert.match(block, /isOpen: \(\) => mountedRef\.current,/);
});
