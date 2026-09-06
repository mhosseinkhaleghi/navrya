import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Slice U2-c (execution brief section 9 item 4, "actual search/sort/tab ... navigation"):
// strategies.search + the real 'strategies-index' registration (IndexView's own query/sort/
// top-level Patterns-vs-Strategies tab). Same convention as tests/community-marketplace-
// messaging-actions.test.mjs's own marketplace.search coverage: navrya-src has no DOM test
// harness in this project - the real proof is real-browser verification. These are static-source
// regression guards.
//
// Scope note (recorded honestly, not silently dropped): the Positions tab's own rich filter
// toolbar (query/status/direction/patternId/accountId/from/to - strategiesHubView.jsx's own
// PositionsView) is deliberately NOT wired this slice. navigate.to's own description already
// explicitly tells the model "open positions" has no single dedicated page ("spans three real
// surfaces, not one page") - exposing a voice-fillable filter for a surface voice cannot even
// navigate to on its own would be a materially bigger, separately-scoped change (letting the
// model land there at all, or filter fields ONLY when a human happens to already be looking at
// it via activeOpenProcess()'s general "adopt the currently open real form" mechanism - not yet
// verified for this specific screen). Left for a future, dedicated sub-slice.

const root = process.cwd();
const characterAppSrc = await readFile(path.join(root, 'navrya-src', 'character-app.jsx'), 'utf8');
const strategiesHubSrc = await readFile(path.join(root, 'navrya-src', 'strategiesHubView.jsx'), 'utf8');
const chatDockCoreSrc = await readFile(path.join(root, 'public', 'pages', 'shared', 'chat-dock-core.js'), 'utf8');

function actionBlock(id) {
  const re = new RegExp(`id: '${id.replace(/\./g, '\\.')}'[\\s\\S]*?resultContext: \\(\\) => \\{\\}\\s*\\}\\);`);
  const match = re.exec(characterAppSrc);
  assert.ok(match, `could not find the real ${id} registration`);
  return match[0];
}

test('strategies.search has no required fields (listKind/query/sort all optional), declares entityAlreadyPersisted (the list stays showing, refinable across turns, mirroring marketplace.search\'s own precedent), and is available unconditionally', () => {
  const block = actionBlock('strategies.search');
  assert.match(block, /domain: 'strategies'/);
  assert.match(block, /entityAlreadyPersisted: true/);
  assert.match(block, /requiredFields: \[\], optionalFields: \['listKind', 'query', 'sort'\]/);
  assert.match(block, /available: \(\) => true/);
});

test('strategies.search normalizes listKind to exactly "patterns" or "strategies" (anything else rejected to null, never guessed) and sort to one of recent/realization/usage', () => {
  const block = actionBlock('strategies.search');
  assert.match(block, /return wantedKind === 'patterns' \|\| wantedKind === 'strategies' \? wantedKind : null;/);
  assert.match(block, /return \['recent', 'realization', 'usage'\]\.indexOf\(wantedSort\) !== -1 \? wantedSort : null;/);
});

test('strategies.search\'s open() navigates to the Strategies view and polls (via the shared pollFor() helper) for the real strategies-index registration - resolving null if a specific Pattern/Strategy is open instead (never force-closes it)', () => {
  const block = actionBlock('strategies.search');
  assert.match(block, /if \(store\.getState\(\)\.activeId !== 'strategies'\) store\.setActiveId\('strategies'\);/);
  assert.match(block, /registry\.query\('strategies-index'\)\.open/);
  assert.match(block, /resolve\(\{ processId: 'strategies-index' \}\)/);
});

test('strategies.search never touches API keys, auth tokens, or admin credentials', () => {
  const block = actionBlock('strategies.search');
  assert.doesNotMatch(block, /apiKey|api_key|authToken|adminKey/i);
});

test('the real strategies-index registration exists with an allowlist of exactly listKind/query/sort, isOpen() reflects whether IndexView (not Positions/Analysis Profiles/a specific open item) is genuinely showing right now via live tab/openId refs - never a stale mount-time snapshot', () => {
  const idx = strategiesHubSrc.indexOf("registry.register('strategies-index'");
  assert.ok(idx > -1, 'could not find the strategies-index registration');
  const block = strategiesHubSrc.slice(idx, idx + 900);
  assert.match(block, /allowlist: \['listKind', 'query', 'sort'\],/);
  assert.match(block, /isOpen: \(\) => strategiesIndexMountedRef\.current && !openIdRef\.current && \(tabRef\.current === 'patterns' \|\| tabRef\.current === 'strategies'\),/);
  assert.match(strategiesHubSrc, /const tabRef = React\.useRef\(tab\);\s*\n\s*tabRef\.current = tab;/);
  assert.match(strategiesHubSrc, /const openIdRef = React\.useRef\(openId\);\s*\n\s*openIdRef\.current = openId;/);
});

test('strategies-index\'s applyValue() drives the exact real setTab/setQuery/setSort state IndexView\'s own toolbar already uses - never a second, parallel list-control mechanism - and rejects an invalid listKind rather than calling setTab with it', () => {
  const idx = strategiesHubSrc.indexOf("registry.register('strategies-index'");
  const block = strategiesHubSrc.slice(idx, idx + 900);
  assert.match(block, /if \(path === 'listKind'\) \{ if \(value === 'patterns' \|\| value === 'strategies'\) setTab\(value\); return; \}/);
  assert.match(block, /if \(path === 'query'\) \{ setQuery\(String\(value == null \? '' : value\)\); return; \}/);
  assert.match(block, /setSort\(tr\(lang, sortKey\)\);/);
});

test('applyValue() translates the AI\'s stable sort value into the CURRENT UI language\'s own label via tr() - never the raw English key - because IndexView\'s own sort state IS the displayed label string itself (sort === sortLabels[i]), a real, pre-existing difference from marketplace\'s own stable-key sort this slice deliberately does not refactor away', () => {
  const idx = strategiesHubSrc.indexOf("registry.register('strategies-index'");
  const block = strategiesHubSrc.slice(idx, idx + 900);
  assert.match(block, /var sortKey = value === 'realization' \? 'sortRealization' : value === 'usage' \? 'sortUsage' : value === 'recent' \? 'sortRecent' : null;/);
});

test('strategies-index is added to BOTH the unconditional activeProcess exclusion and the workflowProcessExcluded check in chat-dock-core.js - the same F33-F36 entityAlreadyPersisted-with-empty-requiredFields fix every other search/settings action already needed, not just one half of it', () => {
  assert.match(chatDockCoreSrc, /activeProcess\.id === 'marketplace-storefront' \|\| activeProcess\.id === 'strategies-index' \|\| activeProcess\.id === 'session-delete-confirm'/);
  assert.match(chatDockCoreSrc, /workflowProcessId === 'marketplace-storefront' \|\| workflowProcessId === 'strategies-index' \|\| workflowProcessId === 'session-delete-confirm'/);
});
