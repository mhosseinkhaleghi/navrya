import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Slice U2-f (execution brief section 9 item 5, "exact session ... selection"): session.open.
// Same convention as tests/session-actions.test.mjs: navrya-src has no DOM test harness in this
// project - the real proof is real-browser verification. These are static-source regression
// guards.
//
// Scope note (recorded honestly, not silently dropped): ENTRY selection (the other half of "exact
// session/entry/scenario selection") is deliberately NOT implemented this slice. A Session Entry
// has no real, spoken-friendly identifier at all - only its kind (chart/movement/fate) and its own
// createdAt timestamp, unlike a Session (real market/date) or a Scenario (a real, human-chosen
// title, already covered by session.scenario.edit's own resolution). "Open the 10am entry" would
// require the model to compare an approximate spoken time against exact timestamps with no
// tolerance rule ever defined anywhere in this product - inventing one would be a real product/UX
// decision, not a voice-wiring one. Left for a future, dedicated design pass. Scenario selection
// itself needed no new work - session.scenario.edit already resolves/opens a named or
// currently-active Scenario with zero edit fields supplied.

const root = process.cwd();
const characterAppSrc = await readFile(path.join(root, 'navrya-src', 'character-app.jsx'), 'utf8');

function actionBlock(id) {
  const re = new RegExp(`id: '${id.replace(/\./g, '\\.')}'[\\s\\S]*?resultContext: \\(\\) => \\{\\}\\s*\\}\\);`);
  const match = re.exec(characterAppSrc);
  assert.ok(match, `could not find the real ${id} registration`);
  return match[0];
}

test('session.open has no required fields (city/date/view all optional), is available unconditionally, and never declares entityAlreadyPersisted - it is a one-shot navigation, not a multi-turn form', () => {
  const block = actionBlock('session.open');
  assert.match(block, /domain: 'sessions'/);
  assert.doesNotMatch(block, /entityAlreadyPersisted/);
  assert.match(block, /requiredFields: \[\], optionalFields: \['city', 'date', 'view'\]/);
  assert.match(block, /available: \(\) => true/);
});

test('session.open reuses the EXISTING normalizeSessionCity() helper for city (never a second, duplicated city-matching implementation), and validates view to exactly "report" or null - never a raw/invented value', () => {
  const block = actionBlock('session.open');
  assert.match(block, /if \(path === 'city'\) return normalizeSessionCity\(value\);/);
  assert.match(block, /if \(path === 'view'\) return String\(value \|\| ''\)\.trim\(\)\.toLowerCase\(\) === 'report' \? 'report' : null;/);
});

test('with neither city nor date given, session.open resolves the trader\'s single currently-open Session (status !== "closed") - zero or more than one open Session refuses rather than guessing (F53)', () => {
  const block = actionBlock('session.open');
  assert.match(block, /if \(!wantedCity && !wantedDate\) \{/);
  assert.match(block, /var openOnes = sessions\.filter\(\(s\) => s\.status !== 'closed'\);/);
  assert.match(block, /if \(openOnes\.length !== 1\) return null; \/\/ none or ambiguous - never guess \(F53\)/);
});

test('with city and/or date given, session.open resolves a SPECIFIC Session (open or closed) by an exact match against the real market/date fields every session card\'s own title already shows - zero or ambiguous matches refuse, never guessed (F53)', () => {
  const block = actionBlock('session.open');
  assert.match(block, /var matches = sessions\.filter\(\(s\) => \(!wantedCity \|\| s\.market === wantedCity\) && \(!wantedDate \|\| s\.date === wantedDate \|\| s\.gregorianDate === wantedDate\)\);/);
  assert.match(block, /if \(matches\.length !== 1\) return null; \/\/ zero or ambiguous - never guess \(F53\)/);
});

test('session.open drives the exact real openLiveSession() every session card\'s own "Open"/"Report" button already calls - never a second, parallel navigation path - passing through view only when it resolved to "report"', () => {
  const block = actionBlock('session.open');
  assert.match(block, /openLiveSession\(target\.id, viewField && viewField\.value === 'report' \? 'report' : undefined\);/);
});

test('session.open never mutates the target Session\'s own status - it is read-only navigation, deliberately distinct from the real, separate reopen() status flip a closed Session\'s own manual "Reopen" button performs', () => {
  const block = actionBlock('session.open');
  assert.doesNotMatch(block, /\.reopen\(/);
  assert.match(block, /This never reopens a closed Session \(that is a separate, explicit human action\) - it only views it\./);
});

test('session.open never touches API keys, auth tokens, or admin credentials', () => {
  const block = actionBlock('session.open');
  assert.doesNotMatch(block, /apiKey|api_key|authToken|adminKey/i);
});
