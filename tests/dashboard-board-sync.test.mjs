import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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

test('settingsView.jsx\'s "Manage panels" section still imports the same real loadBoard/saveBoard/addCustomPanel from dashboardView.jsx - never a parallel copy of its own', async () => {
  const text = await source('settingsView.jsx');
  assert.match(text, /import \{ SPANS, loadBoard, saveBoard, catalogForLang, resolveCustomEntry, addCustomPanel \} from '\.\/dashboardView\.jsx';/);
  assert.doesNotMatch(text, /localStorage\s*\.\s*\w+\s*\(/, 'settingsView.jsx must never read/write the board directly - only through the shared functions');
});

test("panel-system.js's dead localStorage-backed panel-grid mechanism (load/save/storeKey/presets/makeCanvas/makeSettings/updatePanel/managerRow/register) is removed, not migrated - confirmed unreachable: window.TradeJournalNavryaCanvas is always set before any user interaction (navrya-src/entries/{character}.jsx -> mountCharacterApp())", async () => {
  const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
  const text = await readFile(shared('panel-system.js'), 'utf8');
  assert.doesNotMatch(text, /localStorage\s*\.\s*\w+\s*\(/, 'no real localStorage call should remain in this file');
  ['function load(', 'function save(', 'function storeKey(', 'function makeCanvas(', 'function makeSettings(', 'function updatePanel(', 'function managerRow(', 'function panelCard(', 'function bodyFor(', 'const presets'].forEach((snippet) => {
    assert.doesNotMatch(text, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `dead code snippet must be fully removed: ${snippet}`);
  });
  assert.doesNotMatch(text, /register\s*:/, 'TradeJournalPanelLayer.register must be removed - it had zero callers anywhere in the repo');
  // What must still be there, unaffected by the removal.
  assert.match(text, /window\.TradeJournalPanelLayer\s*=\s*\{character:character,theme:theme,show:showCustom,render:render\};/);
  assert.match(text, /function showCustom\(page, activeView\)/);
  assert.match(text, /function syncRank\(\)/);
  assert.match(text, /function syncMarketClocks\(\)/);
});

test('for every character page, every entry point unconditionally sets window.TradeJournalNavryaCanvas before any user interaction is possible - the fact that made panel-system.js\'s old dead-code fallback provably unreachable', async () => {
  for (const character of ['hunter', 'engineer', 'commander', 'sage']) {
    const entry = await readFile(navryaSrc(path.join('entries', character + '.jsx')), 'utf8');
    assert.match(entry, new RegExp("mountCharacterApp\\('" + character + "'\\)"), character + ': entry point calls mountCharacterApp() unconditionally at module load');
  }
  const characterApp = await source('character-app.jsx');
  assert.match(characterApp, /window\.TradeJournalNavryaCanvas = \{ render: /, 'mountCharacterApp() sets the hook unconditionally, not behind any feature flag');
});
