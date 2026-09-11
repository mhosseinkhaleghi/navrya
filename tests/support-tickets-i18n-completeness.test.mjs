import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Support Tickets + notification badges brief, section C.3/F: every new UI string this feature
// introduced must exist in all four supported languages (fa/ar/en/es), never silently falling
// back to English. Same static-source-regex convention as
// tests/admin-crypto-payments-i18n.test.mjs (this repo has no jsdom/RTL harness for JSX/DOM-heavy
// files, so completeness is verified against the real source text, not a rendered component).

const root = process.cwd();
const read = (...parts) => readFile(path.join(root, ...parts), 'utf8');

function extractLangBlock(src, langMarker, nextMarkers) {
  const start = src.indexOf(langMarker);
  assert.ok(start > -1, `language block "${langMarker}" must exist`);
  let end = src.length;
  for (const marker of nextMarkers) {
    const idx = src.indexOf(marker, start + langMarker.length);
    if (idx > -1 && idx < end) end = idx;
  }
  return src.slice(start, end);
}

function keysDefinedIn(block) {
  const keys = new Set();
  const re = /(\w+):\s*'/g;
  let match;
  while ((match = re.exec(block))) keys.add(match[1]);
  return keys;
}

const SUPPORT_TICKET_ADMIN_KEYS = [
  'tabSupport', 'supportPageSubtitle', 'statAwaitingStaff', 'statTotalTickets', 'supportSearchPlaceholder',
  'colTicketId', 'colSubject', 'colOwner', 'colCategory', 'colStatus', 'colLastActivity',
  'ticketStatusOpen', 'ticketStatusWaitingUser', 'ticketStatusResolved', 'ticketStatusClosed',
  'categoryFilterAll', 'categoryTechnical', 'categoryBilling', 'categoryAccount', 'categoryOther',
  'ticketDetailBackToQueue', 'ticketOwnerLabel', 'ticketCreatedLabel', 'replyAsStaffPlaceholder', 'sendReply', 'statusChangeLabel', 'ticketNotFound'
];

test('every new Support Tickets admin key exists in all four language blocks in public/pages/admin/app.js', async () => {
  const src = await read('public', 'pages', 'admin', 'app.js');
  const markers = ['\n  fa: {', '\n  ar: {', '\n  es: {', '\n};'];
  const enStart = src.indexOf('const translations = {') + 'const translations = {'.length;
  const enBlock = src.slice(enStart, src.indexOf(markers[0]));
  const faBlock = extractLangBlock(src, markers[0], markers.slice(1));
  const arBlock = extractLangBlock(src, markers[1], markers.slice(2));
  const esBlock = extractLangBlock(src, markers[2], markers.slice(3));
  const enKeys = keysDefinedIn(enBlock), faKeys = keysDefinedIn(faBlock), arKeys = keysDefinedIn(arBlock), esKeys = keysDefinedIn(esBlock);
  for (const key of SUPPORT_TICKET_ADMIN_KEYS) {
    assert.ok(enKeys.has(key), `en is missing admin key "${key}"`);
    assert.ok(faKeys.has(key), `fa is missing admin key "${key}"`);
    assert.ok(arKeys.has(key), `ar is missing admin key "${key}"`);
    assert.ok(esKeys.has(key), `es is missing admin key "${key}"`);
  }
});

test('the Support Tickets admin tab is registered in the nav, the builder dispatch table, and the route regex', async () => {
  const appSrc = await read('public', 'pages', 'admin', 'app.js');
  assert.match(appSrc, /support:\s*supportTicketsTab/);
  assert.match(appSrc, /\(users\|support\|ai\|technical\|xp\|marketplace\|financial\|commercial\|conversationStudio\)/);
  const htmlSrc = await read('public', 'pages', 'admin', 'index.html');
  assert.match(htmlSrc, /data-tab="support"/);
  assert.match(htmlSrc, /id="supportNavBadge"/);
});

test('navSupport and navBadgeUnread exist in all four language blocks of navrya-src/i18n.js', async () => {
  const src = await read('navrya-src', 'i18n.js');
  const markers = ['\n  fa: {', '\n  ar: {', '\n  es: {', '\n};'];
  const enStart = src.indexOf('export const NAVRYA_STRINGS = {') + 'export const NAVRYA_STRINGS = {'.length;
  const enBlock = src.slice(enStart, src.indexOf(markers[0]));
  const faBlock = extractLangBlock(src, markers[0], markers.slice(1));
  const arBlock = extractLangBlock(src, markers[1], markers.slice(2));
  const esBlock = extractLangBlock(src, markers[2], markers.slice(3));
  ['navSupport', 'navBadgeUnread'].forEach((key) => {
    [enBlock, faBlock, arBlock, esBlock].forEach((block) => assert.match(block, new RegExp(key + ":\\s*'")));
  });
});

test('every key in support-i18n.js exists across all four fa/ar/en/es dictionaries', async () => {
  const src = await read('public', 'pages', 'shared', 'support-i18n.js');
  const markers = ['\n    ar: {', '\n    en: {', '\n    es: {', '\n  };'];
  const faStart = src.indexOf('var messages = {') + 'var messages = {'.length;
  const faBlock = src.slice(faStart, src.indexOf(markers[0]));
  const arBlock = extractLangBlock(src, markers[0], markers.slice(1));
  const enBlock = extractLangBlock(src, markers[1], markers.slice(2));
  const esBlock = extractLangBlock(src, markers[2], markers.slice(3));
  const faKeys = keysDefinedIn(faBlock), arKeys = keysDefinedIn(arBlock), enKeys = keysDefinedIn(enBlock), esKeys = keysDefinedIn(esBlock);
  assert.ok(enKeys.size >= 25, 'sanity check - support-i18n.js should define a real number of keys');
  for (const key of enKeys) {
    assert.ok(faKeys.has(key), `fa is missing support-i18n key "${key}"`);
    assert.ok(arKeys.has(key), `ar is missing support-i18n key "${key}"`);
    assert.ok(esKeys.has(key), `es is missing support-i18n key "${key}"`);
  }
});

test('NavRow badge formatting: hidden at 0, capped at "99+" above 99, and a distinct numeric `count` prop from the pre-existing boolean `badge`', async () => {
  const src = await read('public', 'pages', 'shared', 'navrya', 'components', 'navigation', 'NavRow.jsx');
  assert.match(src, /if\s*\(n\s*<=\s*0\)\s*return null;/, 'a zero/falsy count must render nothing (hidden at zero)');
  assert.match(src, /n\s*>\s*99\s*\?\s*'99\+'\s*:\s*String\(n\)/, 'a count above 99 must render "99+"');
  assert.match(src, /count,\s*countLabel/, 'count/countLabel must be accepted as distinct props from the boolean `badge`');
});
