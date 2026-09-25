import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { normalizeNavigateDomainId, NAVIGATE_DOMAIN_IDS } from '../navrya-src/navigateDomain.js';

// navigate.to's domainId resolution (navrya-src/navigateDomain.js). Found via a real user report:
// "go to the accounts section" was answered with "I cannot move" - the model had named the page the
// way the user said it, the English-only alias table resolved nothing, and the navigation waited
// forever (see the matching chat-dock-core.js recovery test in tests/chat-dock-core.test.mjs).

const root = process.cwd();
const characterApp = (await readFile(path.join(root, 'navrya-src', 'character-app.jsx'), 'utf8')).replace(/\r\n/g, '\n');

test('the ids are exactly the keys of character-app.jsx\'s real NAVIGATE_TARGETS (one list, never two that drift)', () => {
  const block = /var NAVIGATE_TARGETS = \{([\s\S]*?)\n    \};/.exec(characterApp);
  assert.ok(block, 'could not find NAVIGATE_TARGETS');
  const keys = [...block[1].matchAll(/^\s*'?([a-z-]+)'?:\s*\(\)/gm)].map((m) => m[1]);
  assert.deepEqual(keys.slice().sort(), NAVIGATE_DOMAIN_IDS.slice().sort());
  assert.match(characterApp, /import \{ normalizeNavigateDomainId \} from '\.\/navigateDomain\.js';/);
  assert.match(characterApp, /normalizeField: \(path, value\) => path === 'domainId' \? normalizeNavigateDomainId\(value\) : value,/);
  assert.doesNotMatch(characterApp, /var NAVIGATE_ALIASES = \{/, 'the alias table lives in navigateDomain.js only');
});

test('every id resolves to itself, and the original English aliases still work', () => {
  for (const id of NAVIGATE_DOMAIN_IDS) assert.equal(normalizeNavigateDomainId(id), id);
  assert.equal(normalizeNavigateDomainId('Prop-Firm'), 'accounts');
  assert.equal(normalizeNavigateDomainId('home'), 'dashboard');
  assert.equal(normalizeNavigateDomainId('tickets'), 'support');
  assert.equal(normalizeNavigateDomainId('  Strategies '), 'strategies');
});

test('the page as the user says it, in all four UI languages, with "the ... section/page" filler', () => {
  const cases = {
    'بخش حساب‌ها': 'accounts', 'قسمت حساب ها': 'accounts', 'حسابها': 'accounts', 'پراپ فرم': 'accounts',
    'صفحهٔ تنظیمات': 'settings', 'سشن‌ها': 'sessions', 'داشبورد': 'dashboard', 'استراتژی‌ها': 'strategies',
    'الگوها': 'patterns', 'روان‌شناسی': 'psychology', 'هوش مصنوعی': 'ai-assistant', 'تالار گفتگو': 'community',
    'پشتیبانی': 'support', 'پروفایل': 'account',
    'الحسابات': 'accounts', 'لوحة التحكم': 'dashboard', 'قسم الجلسات': 'sessions', 'الإعدادات': 'settings',
    'the accounts page': 'accounts', 'accounts section': 'accounts', 'my accounts': 'accounts',
    'Cuentas': 'accounts', 'la sección de estrategias': 'strategies', 'Ajustes': 'settings', 'Sesiones': 'sessions'
  };
  for (const [raw, id] of Object.entries(cases)) assert.equal(normalizeNavigateDomainId(raw), id, raw);
});

test('anything that is not a page stays unresolved (never a guessed navigation)', () => {
  for (const raw of ['', null, undefined, 'blah', 'بخش', 'the page', 'حساب جدید باز کن و بعد تنظیمات']) {
    assert.equal(normalizeNavigateDomainId(raw), null, String(raw));
  }
});
