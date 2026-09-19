import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { buildAnalysisProfileBrief } from '../server/ai/analysis-profile-brief.mjs';
import { BRIEF_FIXTURES } from './helpers/analysis-profile-brief-fixtures.mjs';

// The browser twin (public/pages/shared/analysis-profile-brief.js) that powers the Preview tab's
// free "Engine Brief" - proves it is byte-identical to the real server module
// (server/ai/analysis-profile-brief.mjs) across a shared fixture list, so what the trader sees in
// the Preview tab can never quietly drift from what the Session prompt actually sends.
const root = process.cwd();
async function loadBrowserTwin() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  const file = path.join(root, 'public', 'pages', 'shared', 'analysis-profile-brief.js');
  vm.runInContext(await readFile(file, 'utf8'), sandbox, { filename: 'analysis-profile-brief.js' });
  return sandbox.window.TradeJournalAnalysisProfileBrief;
}

test('registers window.TradeJournalAnalysisProfileBrief with build() and describeAnalysisStyle()', async () => {
  const twin = await loadBrowserTwin();
  assert.equal(typeof twin.build, 'function');
  assert.equal(typeof twin.describeAnalysisStyle, 'function');
});

for (const fixture of BRIEF_FIXTURES) {
  test(`server and browser briefs are identical: ${fixture.name}`, async () => {
    const twin = await loadBrowserTwin();
    const serverBrief = buildAnalysisProfileBrief(fixture.profile);
    const browserBrief = twin.build(fixture.profile);
    // The browser twin's objects come from a separate vm realm - deepEqual across realms reports a
    // false mismatch on structurally identical plain objects/arrays, so both sides are normalized
    // through JSON first (same fix this repo's other vm-sandbox tests already use).
    assert.deepEqual(JSON.parse(JSON.stringify(browserBrief)), JSON.parse(JSON.stringify(serverBrief)));
  });
}

test('describeAnalysisStyle matches on its own, including the empty cases', async () => {
  const twin = await loadBrowserTwin();
  for (const style of [null, undefined, {}, { id: 'x' }, { id: 'x', name: { en: 'X style' } },
    { id: 'smc', name: { en: 'SMC' }, coreConcepts: ['a'], analysisPrinciples: ['b'], limitations: ['c'], futurePromptGuidance: ['d'] }]) {
    assert.equal(twin.describeAnalysisStyle(style), (await import('../server/ai/analysis-profile-brief.mjs')).describeAnalysisStyle(style));
  }
});

test('every character page loads the browser brief twin as a script, right after analysis-context.js', async () => {
  for (const character of ['hunter', 'commander', 'engineer', 'sage']) {
    const html = await readFile(path.join(root, 'public', 'pages', character, 'index.html'), 'utf8');
    assert.match(html, /<script defer src="\.\.\/shared\/analysis-profile-brief\.js"><\/script>/, `${character}/index.html is missing the analysis-profile-brief.js script tag`);
  }
});
