import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import * as serverRules from '../server/community/xp-rules.mjs';

const root = process.cwd();

// The browser file (profile-xp-rules.js) and the server file (xp-rules.mjs) declare the same
// data independently, since a browser script can't be imported by Node without a build step.
// This test is the thing that actually keeps them in sync: it fails the moment someone edits
// one file and not the other.
async function loadBrowserRules() {
  const source = await readFile(path.join(root, 'public', 'pages', 'shared', 'profile-xp-rules.js'), 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { filename: 'profile-xp-rules.js' });
  return sandbox.window.TradeJournalProfileXPRules;
}

// A vm-sandboxed array/object has a different [[Prototype]] than the outer realm's, so
// assert.deepEqual fails on identity even with byte-identical content (the same cross-realm
// pitfall documented elsewhere in this test suite). Comparing via JSON serialization sidesteps
// prototype identity entirely and is exactly what "byte-identical content" means here anyway.
function assertJsonEqual(actual, expected, message) { assert.equal(JSON.stringify(actual), JSON.stringify(expected), message); }

test('LEVEL_THRESHOLDS is byte-identical between the browser and server copies', async () => {
  const browserRules = await loadBrowserRules();
  assertJsonEqual(browserRules.LEVEL_THRESHOLDS, serverRules.LEVEL_THRESHOLDS);
});

test('POINTS_BY_TYPE is byte-identical between the browser and server copies', async () => {
  const browserRules = await loadBrowserRules();
  assertJsonEqual(browserRules.POINTS_BY_TYPE, serverRules.POINTS_BY_TYPE);
});

test('ONCE_PER_USER_TYPES is byte-identical between the browser and server copies', async () => {
  const browserRules = await loadBrowserRules();
  assertJsonEqual(browserRules.ONCE_PER_USER_TYPES, serverRules.ONCE_PER_USER_TYPES);
});

// XP engine rewrite (ARCHITECTURE.md Section 11): every type's domain/cap declaration must also
// stay byte-identical between the two copies, same as the original four exports above.
['DOMAIN_BY_TYPE', 'PER_SOURCE_MAX', 'PER_TYPE_PERIOD_CAP', 'DOMAIN_DAILY_CAP', 'SOURCE_TOTAL_CAP'].forEach((exportName) => {
  test(exportName + ' is byte-identical between the browser and server copies', async () => {
    const browserRules = await loadBrowserRules();
    assertJsonEqual(browserRules[exportName], serverRules[exportName]);
  });
});

test('RECURRING_DAILY_CAP_TOTAL is byte-identical between the browser and server copies', async () => {
  const browserRules = await loadBrowserRules();
  assert.equal(browserRules.RECURRING_DAILY_CAP_TOTAL, serverRules.RECURRING_DAILY_CAP_TOTAL);
});

test('every type in DOMAIN_BY_TYPE/PER_SOURCE_MAX/PER_TYPE_PERIOD_CAP is a real, declared POINTS_BY_TYPE key (no typo\'d event names)', async () => {
  const browserRules = await loadBrowserRules();
  const known = new Set(Object.keys(browserRules.POINTS_BY_TYPE));
  Object.keys(browserRules.DOMAIN_BY_TYPE).forEach((type) => assert.ok(known.has(type), 'DOMAIN_BY_TYPE has an unknown type: ' + type));
  Object.keys(browserRules.PER_SOURCE_MAX).forEach((type) => assert.ok(known.has(type), 'PER_SOURCE_MAX has an unknown type: ' + type));
  Object.keys(browserRules.PER_TYPE_PERIOD_CAP).forEach((type) => assert.ok(known.has(type), 'PER_TYPE_PERIOD_CAP has an unknown type: ' + type));
});

test('levelForXp agrees between both copies across every threshold boundary and level 7 clamps at the top', async () => {
  const browserRules = await loadBrowserRules();
  const probes = [0, 1, 99, 100, 101, 299, 300, 699, 700, 1499, 1500, 2999, 3000, 5999, 6000, 999999];
  probes.forEach((xp) => {
    assert.equal(browserRules.levelForXp(xp), serverRules.levelForXp(xp), 'levelForXp(' + xp + ') must match between browser and server');
  });
  assert.equal(serverRules.levelForXp(6000), 7);
  assert.equal(serverRules.levelForXp(999999), 7, 'XP far beyond the top threshold must still clamp to level 7, not overflow');
});

test('xpForNextLevel returns the correct next threshold, and null once level 7 is reached', async () => {
  const browserRules = await loadBrowserRules();
  assert.equal(serverRules.xpForNextLevel(0), 100);
  assert.equal(serverRules.xpForNextLevel(99), 100);
  assert.equal(serverRules.xpForNextLevel(6000), null);
  assert.equal(browserRules.xpForNextLevel(300), serverRules.xpForNextLevel(300));
});
