import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NAVRYA_STRINGS } from '../navrya-src/i18n.js';

// .jsx has no transform in this plain node --test runner, so the component wiring is checked
// at the source level (same convention as tests/mobile-responsive-shell.test.mjs).
const root = path.resolve(import.meta.dirname, '..');
const read = (file) => readFile(path.join(root, file), 'utf8');
const [sidebar, card, menu, hook, characterApp, css, styles] = await Promise.all([
  read('public/pages/shared/navrya/components/navigation/Sidebar.jsx'),
  read('public/pages/shared/navrya/components/identity/ProfileCard.jsx'),
  read('public/pages/shared/navrya/components/identity/AccountMenu.jsx'),
  read('navrya-src/sidebarProfile.js'),
  read('navrya-src/character-app.jsx'),
  read('public/pages/shared/navrya/profile-card.css'),
  read('public/pages/shared/navrya/styles.css')
]);

test('the design stylesheet is loaded through the shared NAVRYA entry point', () => {
  assert.match(styles, /@import url\("profile-card\.css"\);/);
});

test('every nv-* class the components render is defined in profile-card.css', () => {
  const used = new Set();
  for (const source of [card, menu]) {
    for (const match of source.matchAll(/className=(?:"([^"]+)"|\{([^}]+)\})/g)) {
      const text = match[1] || match[2];
      // A trailing '-' means a prefix completed by string concatenation (handled below).
      for (const cls of text.match(/nv-[a-z0-9_-]+/g) || []) if (!cls.endsWith('-')) used.add(cls);
    }
  }
  // Classes built by concatenation ('nv-tile nv-tile--' + tone, 'nv-orn nv-orn--' + corner).
  ['info', 'accent', 'gold', 'muted', 'danger'].forEach((tone) => used.add('nv-tile--' + tone));
  ['tl', 'tr', 'bl', 'br'].forEach((corner) => used.add('nv-orn--' + corner));
  const missing = [...used].filter((cls) => !new RegExp('\\.' + cls.replace(/[-_]/g, '\\$&') + '(?![a-z0-9_-])').test(css));
  assert.deepEqual(missing, []);
});

test('Sidebar renders the profile card, collapsed rail and side menu when a profile is given', () => {
  assert.match(sidebar, /import \{ ProfileCard, ProfileRail \} from '\.\.\/identity\/ProfileCard\.jsx'/);
  assert.match(sidebar, /import \{ AccountMenu \} from '\.\.\/identity\/AccountMenu\.jsx'/);
  assert.match(sidebar, /\{profile \? \([\s\S]*?<ProfileCard [\s\S]*?\) : \([\s\S]*?<QuoteCard/);
  assert.match(sidebar, /<ProfileRail /);
  assert.match(sidebar, /<AccountMenu[\s\S]*?containerRef=\{navRef\}/);
  // Menu closes on navigation and when the layout switches between rail/full/mobile.
  assert.match(sidebar, /const navigate = \(id\) => \{\s*setMenu\(null\);/);
  assert.match(sidebar, /React\.useEffect\(\(\) => \{ setMenu\(null\); \}, \[compact, mobile\]\);/);
});

test('character-app feeds the sidebar from the real profile hook instead of quote/reward props', () => {
  assert.match(characterApp, /import \{ useSidebarProfile, useWalletBalance, fmtWalletUsd \} from '\.\/sidebarProfile\.js';/);
  assert.match(characterApp, /const profile = useSidebarProfile\(\{ store, state: s, navryaCharacter, badges \}\);/);
  assert.match(characterApp, /rtl=\{rtl\} profile=\{profile\}/);
  assert.doesNotMatch(characterApp, /function rewardPropsFor/);
  assert.match(characterApp, /window\.addEventListener\('navrya:notifications-changed', refresh\);/);
});

test('the menu opens beside the sidebar through a portal that keeps the character skin and direction', () => {
  assert.match(menu, /import \{ createPortal \} from 'react-dom';/);
  assert.match(menu, /<div data-character=\{character\} dir=\{rtl \? 'rtl' : 'ltr'\}/);
  assert.match(menu, /document\.body/);
  assert.match(menu, /right: Math\.max\(8, right\)/);
  assert.match(menu, /box\.bottom - 10 - height/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.nv-am-wrap \{[^}]*bottom: max\(8px, env\(safe-area-inset-bottom\)\)/);
});

test('log out goes through the existing session logout, with a confirm step on the card and an error state', () => {
  assert.match(hook, /window\.TradeJournalDevUserSwitcher/);
  assert.match(hook, /switcher\.logout\(\)/);
  assert.match(card, /setLogoutState\('ask'\)/);
  assert.match(card, /setLogoutState\('error'\)/);
  assert.match(menu, /labels\.logoutFailed/);
});

test('sidebar profile data never touches browser storage', () => {
  for (const source of [card, menu, hook]) assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/);
  assert.match(hook, /setPref\(SEEN_PREF, stamp\)/);
});

test('all profile-card strings exist in every language', () => {
  const keys = Object.keys(NAVRYA_STRINGS.en).filter((key) => key.startsWith('pc'));
  assert.ok(keys.length >= 50);
  for (const lang of ['fa', 'ar', 'es']) {
    const missing = keys.filter((key) => typeof NAVRYA_STRINGS[lang][key] !== 'string' || !NAVRYA_STRINGS[lang][key]);
    assert.deepEqual(missing, [], lang);
  }
  const used = [...hook.matchAll(/t\.(pc[A-Za-z]+)/g)].map((m) => m[1]);
  assert.deepEqual(used.filter((key) => !keys.includes(key)), []);
});
