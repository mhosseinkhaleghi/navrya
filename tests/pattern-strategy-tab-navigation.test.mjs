import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Slice U2-b (execution brief section 9 item 4, "actual ... tab ... report navigation"):
// pattern.edit/strategy.edit can now jump straight to a specific real DetailView tab (details,
// chat, report, share) at open time - the exact same real openExisting(id, tabId) hub method
// pattern.delete/strategy.delete's own 'share' tab fix (marketplace.publish) already proved works,
// just not previously wired to a fillable field on these two actions. Same convention as
// tests/accounts-static.test.mjs's own account.open tab test: navrya-src has no DOM test harness
// in this project - the real proof is real-browser verification. These are static-source
// regression guards.
//
// Scope note (recorded honestly, not silently dropped): unlike account.open, pattern.edit/
// strategy.edit do NOT support a LATER, separate turn switching tabs live without re-stating the
// target's name. account.open's live switch works because 'tab' also lives on account-detail-
// {id}'s own registration allowlist, so a later turn's tab value applies directly to the already-
// open process without re-running open()/accountName resolution. pattern-editor-{id}/strategy-
// editor-{id}'s own registrations have no such 'tab' allowlist entry - dtab is owned by the parent
// StrategiesHub, not by PatternDetailsTab/StrategyDetailsTab themselves, and plumbing setDtab down
// into those per-item registrations is a larger, separate change left for a future pass. Today,
// tab only ever applies at fresh-open time (mirrors every other field on these two actions, all of
// which already require patternName/strategyName restated on any later turn too - no regression,
// just not yet the account.open-style live-switch upgrade).

const root = process.cwd();
const characterAppSrc = await readFile(path.join(root, 'navrya-src', 'character-app.jsx'), 'utf8');

function actionBlock(id) {
  const re = new RegExp(`id: '${id.replace(/\./g, '\\.')}'[\\s\\S]*?resultContext: \\(\\) => \\{\\}\\s*\\}\\);`);
  const match = re.exec(characterAppSrc);
  assert.ok(match, `could not find the real ${id} registration`);
  return match[0];
}

test('pattern.edit declares tab as an optional, resolution-only field validated against the exact real DetailView tab ids (details/chat/report/share) - an invalid value normalizes to null, never trusted through raw', () => {
  const block = actionBlock('pattern.edit');
  assert.match(block, /optionalFields: \['name', 'description', 'completionThreshold', 'instruments', 'tab'\]/);
  assert.match(block, /var validTab = \['details', 'chat', 'report', 'share'\];/);
  assert.match(block, /return validTab\.indexOf\(requestedTab\) !== -1 \? requestedTab : null;/);
});

test('pattern.edit\'s open() passes the resolved tab straight through to hub.openExisting(target.id, initialTab) - an unrecognized/omitted tab resolves to undefined so openExistingPattern\'s own tabId || \'details\' default still applies, never a raw unvalidated value', () => {
  const block = actionBlock('pattern.edit');
  assert.match(block, /var VALID_PATTERN_TABS = \['details', 'chat', 'report', 'share'\];/);
  assert.match(block, /var initialTab = VALID_PATTERN_TABS\.indexOf\(requestedTab\) !== -1 \? requestedTab : undefined;/);
  assert.match(block, /hub\.openExisting\(target\.id, initialTab\)/);
});

test('strategy.edit declares the identical tab field/validation convention as pattern.edit, appended onto the full real STRATEGY_FIELDS allowlist', () => {
  const block = actionBlock('strategy.edit');
  assert.match(block, /optionalFields: \['name'\]\.concat\(STRATEGY_FIELDS, \['tab'\]\)/);
  assert.match(block, /var validTab = \['details', 'chat', 'report', 'share'\];/);
  assert.match(block, /return validTab\.indexOf\(requestedTab\) !== -1 \? requestedTab : null;/);
});

test('strategy.edit\'s open() passes the resolved tab straight through to hub.openExisting(target.id, initialTab), same shape as pattern.edit', () => {
  const block = actionBlock('strategy.edit');
  assert.match(block, /var VALID_STRATEGY_TABS = \['details', 'chat', 'report', 'share'\];/);
  assert.match(block, /var initialTab = VALID_STRATEGY_TABS\.indexOf\(requestedTab\) !== -1 \? requestedTab : undefined;/);
  assert.match(block, /hub\.openExisting\(target\.id, initialTab\)/);
});

test('both actions\' own description text tells the model tab is only for an explicitly-requested specific tab (details/chat/report/share), never a guess, and defaults to details otherwise', () => {
  for (const id of ['pattern.edit', 'strategy.edit']) {
    const block = actionBlock(id);
    assert.match(block, /tab optionally jumps straight to one exact tab - details, chat, report, or share - only when the user actually asked for that specific tab; defaults to details otherwise\./);
  }
});
