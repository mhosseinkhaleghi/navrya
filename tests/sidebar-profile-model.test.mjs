import test from 'node:test';
import assert from 'node:assert/strict';
import {
  levelSnapshot, planChipLabel, planDisplayName, formatWalletUsd, relativeTime, daysUntil,
  buildNotifications, newlyUnlocked
} from '../navrya-src/profileMenuModel.js';
import { NAVRYA_STRINGS } from '../navrya-src/i18n.js';

const NOW = Date.parse('2026-09-17T12:00:00Z');
const DAY = 86400000;
const t = NAVRYA_STRINGS.fa;

test('levelSnapshot follows the real 7-level thresholds', () => {
  assert.deepEqual(levelSnapshot(420), { level: 3, levelCount: 7, xp: 420, floor: 300, next: 700, progress: 30, xpToNext: 280 });
  assert.equal(levelSnapshot(0).level, 1);
  assert.equal(levelSnapshot(99).progress, 99);
  const top = levelSnapshot(9000);
  assert.equal(top.level, 7);
  assert.equal(top.next, null);
  assert.equal(top.progress, 100);
  assert.equal(levelSnapshot(-5).xp, 0);
  assert.equal(levelSnapshot(150, [0, 100, 200]).progress, 50);
});

test('plan labels and wallet formatting', () => {
  assert.equal(planChipLabel('plus'), 'PLUS');
  assert.equal(planChipLabel('free'), 'FREE');
  assert.equal(planChipLabel(null), null);
  assert.equal(planDisplayName('pro'), 'Pro');
  assert.equal(formatWalletUsd(12400000), '$12.40');
  assert.equal(formatWalletUsd(null), null);
});

test('relative times use Latin digits in Persian, matching the rest of the sidebar', () => {
  assert.equal(relativeTime(new Date(NOW - 12 * 60000).toISOString(), NOW, 'fa'), '12 دقیقه پیش');
  assert.equal(relativeTime(new Date(NOW - DAY).toISOString(), NOW, 'fa'), 'دیروز');
  assert.equal(relativeTime('not a date', NOW, 'fa'), '');
  assert.equal(daysUntil(new Date(NOW + 4.2 * DAY).toISOString(), NOW), 5);
});

test('support tickets are listed one by one once loaded; only the count is used before that', () => {
  const tickets = [
    { id: 't1', subject: 'آپلود چارت انجام نمی‌شود', unread: true, lastActivityAt: new Date(NOW - 12 * 60000).toISOString() },
    { id: 't2', subject: 'old', unread: false, lastActivityAt: new Date(NOW - 3 * DAY).toISOString() }
  ];
  const loaded = buildNotifications({ tickets, badges: { supportUnread: 1, communityUnread: 0 }, now: NOW, lang: 'fa', t });
  assert.equal(loaded.items.length, 1);
  assert.equal(loaded.items[0].title, 'پاسخ تازه از پشتیبانی');
  assert.equal(loaded.items[0].body.text, 'تیکت «آپلود چارت انجام نمی‌شود»');
  assert.deepEqual(loaded.items[0].target, { type: 'support', id: 't1' });
  assert.equal(loaded.counts.support, 1);

  const countOnly = buildNotifications({ tickets: null, badges: { supportUnread: 2, communityUnread: 0 }, now: NOW, lang: 'fa', t });
  assert.equal(countOnly.items.length, 1);
  assert.equal(countOnly.items[0].body.text, '2 تیکت پاسخ تازه دارد');
  assert.equal(countOnly.counts.support, 2);
});

test('community is one grouped row built from the unread count, with no invented timestamp', () => {
  const result = buildNotifications({ badges: { supportUnread: 0, communityUnread: 3 }, now: NOW, lang: 'fa', t });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].title, '3 پست تازه در تالار گفتگو');
  assert.equal(result.items[0].time, '');
  assert.equal(result.unreadTotal, 3);
});

test('recent achievements respect the 14-day window and the seen cursor', () => {
  const defs = [{ key: 'ten_trades_closed', points: 30, labelKey: 'TenTradesClosed' }, { key: 'first_trade_closed', points: 10, labelKey: 'FirstTradeClosed' }];
  const achievements = [
    { achievementKey: 'ten_trades_closed', unlockedAt: new Date(NOW - DAY).toISOString() },
    { achievementKey: 'first_trade_closed', unlockedAt: new Date(NOW - 30 * DAY).toISOString() }
  ];
  const title = (key) => (key === 'ten_trades_closed' ? 'ده معامله بسته' : key);
  const unseen = buildNotifications({ achievements, achievementDefs: defs, achievementTitle: title, now: NOW, lang: 'fa', t });
  assert.equal(unseen.items.length, 1);
  assert.equal(unseen.items[0].title, 'دستاورد تازه: ده معامله بسته');
  assert.deepEqual(unseen.items[0].body, { text: '{xp} به امتیازتان اضافه شد', ltr: '+30 XP' });
  assert.equal(unseen.items[0].unread, true);
  assert.equal(unseen.counts.account, 1);

  const seen = buildNotifications({ achievements, achievementDefs: defs, achievementTitle: title, seenAt: new Date(NOW - 60000).toISOString(), now: NOW, lang: 'fa', t });
  assert.equal(seen.items[0].unread, false);
  assert.equal(seen.unreadTotal, 0);
});

test('subscription rows: renewal notice inside 7 days, ending notice, and payment trouble', () => {
  const renew = buildNotifications({ subscription: { planId: 'plus', status: 'active', currentPeriodEnd: new Date(NOW + 4.5 * DAY).toISOString(), cancelAtPeriodEnd: false }, now: NOW, lang: 'fa', t });
  assert.equal(renew.items[0].title, 'اشتراک Plus در 5 روز تمدید می‌شود');
  assert.equal(renew.items[0].body.text, 'تمدید خودکار روشن است');
  assert.equal(renew.items[0].unread, false);

  const ending = buildNotifications({ subscription: { planId: 'pro', status: 'active', currentPeriodEnd: new Date(NOW + 0.5 * DAY).toISOString(), cancelAtPeriodEnd: true }, now: NOW, lang: 'fa', t });
  assert.equal(ending.items[0].title, 'اشتراک Pro فردا تمام می‌شود');

  const far = buildNotifications({ subscription: { planId: 'plus', status: 'active', currentPeriodEnd: new Date(NOW + 20 * DAY).toISOString() }, now: NOW, lang: 'fa', t });
  assert.equal(far.items.length, 0);

  const pastDue = buildNotifications({ subscription: { planId: 'plus', status: 'past_due', currentPeriodEnd: new Date(NOW + 3 * DAY).toISOString(), updatedAt: new Date(NOW - 3600000).toISOString() }, now: NOW, lang: 'fa', t });
  assert.equal(pastDue.items[0].tone, 'danger');
  assert.equal(pastDue.items[0].unread, true);
});

test('groups keep the designed order: support, community, account', () => {
  const result = buildNotifications({
    tickets: [{ id: 't1', subject: 's', unread: true, lastActivityAt: new Date(NOW).toISOString() }],
    badges: { supportUnread: 1, communityUnread: 3 },
    achievements: [{ achievementKey: 'a', unlockedAt: new Date(NOW - 1000).toISOString() }],
    achievementDefs: [{ key: 'a', points: 5 }],
    now: NOW, lang: 'en', t: NAVRYA_STRINGS.en
  });
  assert.deepEqual(result.items.map((item) => item.group), ['support', 'community', 'account']);
  assert.equal(result.unreadTotal, 5);
});

test('newlyUnlocked never celebrates on the first fetch', () => {
  const rows = [{ achievementKey: 'a' }, { achievementKey: 'b' }];
  assert.deepEqual(newlyUnlocked(null, rows), []);
  assert.deepEqual(newlyUnlocked(new Set(['a']), rows), [{ achievementKey: 'b' }]);
});
