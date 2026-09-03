import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Phase 8d of the local-first-to-server-authoritative migration (see ARCHITECTURE.md's Known
// Constraints section): dashboardView.jsx (and every other .jsx file under navrya-src/) has no
// vm-sandbox test coverage anywhere in this project's own suite - none of these files can be
// `import`-ed directly in a plain `node --test` run (no JSX/ESM transform pipeline is wired into
// the test runner), so, like session-workspace-logic.js's own established convention, this file
// is static source assertions for the real migration, not dynamic execution. The underlying
// replica mechanics (optimistic apply, rollback, cross-account isolation) this migration reuses
// are already proven dynamically by tests/user-preferences-sync.test.mjs - this file verifies
// dashboardView.jsx's own specific wiring onto that already-tested primitive.
const root = process.cwd();
const navryaSrc = (...parts) => path.join(root, 'navrya-src', ...parts);
const source = (file) => readFile(navryaSrc(file), 'utf8');

test('boardKey()/loadBoard()/saveBoard() read and write through window.TradeJournalUserPreferences, not localStorage', async () => {
  const text = await source('dashboardView.jsx');
  assert.doesNotMatch(text, /localStorage\s*\.\s*\w+\s*\(/, 'no real localStorage call should remain in this file');
  assert.match(text, /export function boardKey\(character\)\s*\{\s*return\s*'dashboardBoard:'\s*\+\s*character;\s*\}/);
  assert.match(text, /const prefs = window\.TradeJournalUserPreferences;\s*\n\s*const saved = prefs \? prefs\.getPref\(boardKey\(character\), null\) : null;/);
  assert.match(text, /if \(prefs\) prefs\.setPref\(boardKey\(character\), value\);/);
});

test('loadBoard() still falls back to the real DEFAULT_BOARD when nothing is saved yet, preserving the pre-migration contract for a brand-new account', async () => {
  const text = await source('dashboardView.jsx');
  assert.match(text, /return \{ board: DEFAULT_BOARD\.slice\(\), spans: \{\}, hidden: \{\}, custom: \{\} \};/);
});

test('saveBoard() still dispatches tradejournal:dashboard-board-changed unchanged, so every existing listener keeps working', async () => {
  const text = await source('dashboardView.jsx');
  assert.match(text, /window\.dispatchEvent\(new CustomEvent\('tradejournal:dashboard-board-changed', \{ detail: \{ character \} \}\)\);/);
});

test('aiAssistantView.jsx\'s Panel Builder tab ("Manage panels" card) still imports the same real loadBoard/saveBoard/addCustomPanel from dashboardView.jsx - never a parallel copy of its own', async () => {
  // Moved here from settingsView.jsx (AI dashboard redesign): the AI panel builder and its
  // installed-panels list are an AI capability, not a setting, so both sections relocated
  // together to the AI Assistant page's own Panel Builder tab. settingsView.jsx no longer
  // imports from dashboardView.jsx at all.
  const text = await source('aiAssistantView.jsx');
  assert.match(text, /import \{ SPANS, loadBoard, saveBoard, catalogForLang, resolveCustomEntry, addCustomPanel \} from '\.\/dashboardView\.jsx';/);
  assert.doesNotMatch(text, /localStorage\s*\.\s*\w+\s*\(/, 'aiAssistantView.jsx must never read/write the board directly - only through the shared functions');

  const settingsText = await source('settingsView.jsx');
  assert.doesNotMatch(settingsText, /dashboardView\.jsx/, 'settingsView.jsx must not import from dashboardView.jsx any more - Panel Builder moved out');
});

test("panel-system.js's dead localStorage-backed panel-grid mechanism (load/save/storeKey/presets/makeCanvas/makeSettings/updatePanel/managerRow/panelCard/bodyFor) is removed, not migrated - confirmed unreachable: window.TradeJournalNavryaCanvas is always set before any user interaction (navrya-src/entries/{character}.jsx -> mountCharacterApp())", async () => {
  const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
  const text = await readFile(shared('panel-system.js'), 'utf8');
  assert.doesNotMatch(text, /localStorage\s*\.\s*\w+\s*\(/, 'no real localStorage call should remain in this file');
  ['function load(', 'function save(', 'function storeKey(', 'function makeCanvas(', 'function makeSettings(', 'function updatePanel(', 'function managerRow(', 'function panelCard(', 'function bodyFor(', 'const presets'].forEach((snippet) => {
    assert.doesNotMatch(text, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `dead code snippet must be fully removed: ${snippet}`);
  });
  // What must still be there, unaffected by the removal.
  assert.match(text, /function showCustom\(page, activeView\)/);
  assert.match(text, /function syncRank\(\)/);
  assert.match(text, /function syncMarketClocks\(\)/);
});

test("HOTFIX regression guard: TradeJournalPanelLayer.register() is back as a real, callable no-op - Phase 8d's own 'zero callers anywhere in the repo' claim was proven wrong in production (session-system.js/trade-open-positions.js/trade-reports.js/pattern-registry.js/strategy-education.js all still call layer.register() unconditionally at module load, and for two of them the resulting uncaught TypeError landed BEFORE their own window.TradeJournal* export, breaking those exports entirely). Deliberately still a bare no-op, not a reintroduction of the dead panel-grid body (load/save/storeKey/etc, asserted removed above) - render() never reads registered panel data any more, so a no-op is behaviorally identical to what these callers already got.", async () => {
  const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
  const text = await readFile(shared('panel-system.js'), 'utf8');
  assert.match(text, /function register\(\)\s*\{\s*\}/, 'register() must be a bare no-op body, not a real implementation');
  assert.match(text, /window\.TradeJournalPanelLayer\s*=\s*\{character:character,theme:theme,show:showCustom,render:render,register:register\};/, 'the exported object must include register:register');
});

test('every real caller of layer.<method>() in public/pages/shared only calls methods panel-system.js actually exports on TradeJournalPanelLayer - a durable, repo-wide guard against this exact bug class recurring for ANY method (not just register), for a file added after this test was written', async () => {
  const sharedDir = path.join(root, 'public', 'pages', 'shared');
  const panelSystemText = await readFile(path.join(sharedDir, 'panel-system.js'), 'utf8');
  const exportMatch = panelSystemText.match(/window\.TradeJournalPanelLayer\s*=\s*\{([^}]*)\};/);
  assert.ok(exportMatch, 'could not find the TradeJournalPanelLayer export object literal in panel-system.js');
  const exportedKeys = new Set(Array.from(exportMatch[1].matchAll(/(\w+)\s*:/g)).map((m) => m[1]));
  assert.ok(exportedKeys.has('register'), 'sanity check: register should be one of the exported keys');

  const entries = await readdir(sharedDir, { withFileTypes: true });
  const jsFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.js') && entry.name !== 'panel-system.js').map((entry) => entry.name);
  assert.ok(jsFiles.length > 10, 'sanity check: expected many shared .js files to scan');

  const offenders = [];
  for (const file of jsFiles) {
    const text = await readFile(path.join(sharedDir, file), 'utf8');
    // Only files that actually alias `layer` to window.TradeJournalPanelLayer are in scope - this
    // avoids false positives from an unrelated variable that happens to be named `layer` elsewhere.
    if (!/\blayer\s*=\s*window\.TradeJournalPanelLayer\b/.test(text)) continue;
    const calls = Array.from(text.matchAll(/\blayer\.(\w+)\s*\(/g)).map((m) => m[1]);
    calls.forEach((method) => {
      if (!exportedKeys.has(method)) offenders.push(`${file} calls layer.${method}() but TradeJournalPanelLayer has no such export`);
    });
  }
  assert.deepEqual(offenders, [], offenders.join('\n'));
});

test('for every character page, every entry point unconditionally sets window.TradeJournalNavryaCanvas before any user interaction is possible - the fact that made panel-system.js\'s old dead-code fallback provably unreachable', async () => {
  for (const character of ['hunter', 'engineer', 'commander', 'sage']) {
    const entry = await readFile(navryaSrc(path.join('entries', character + '.jsx')), 'utf8');
    assert.match(entry, new RegExp("mountCharacterApp\\('" + character + "'\\)"), character + ': entry point calls mountCharacterApp() unconditionally at module load');
  }
  const characterApp = await source('character-app.jsx');
  assert.match(characterApp, /window\.TradeJournalNavryaCanvas = \{ render: /, 'mountCharacterApp() sets the hook unconditionally, not behind any feature flag');
});
