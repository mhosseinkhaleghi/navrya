// Pure, DOM-free data shaping for the sidebar profile card and its account menu
// (components/identity/ProfileCard.jsx + AccountMenu.jsx). Kept free of React/window so
// tests/sidebar-profile-model.test.mjs can import it directly.
//
// Notification honesty: the server only exposes unread COUNTS for Community and Support
// (GET /api/sync/notifications/summary), plus a per-ticket `unread` flag on the ticket list.
// So Support can be listed ticket by ticket, Community is one grouped row, and the "account"
// rows (recent achievements, subscription renewal/payment trouble) are derived here from data
// the browser already has - never invented.

export const DEFAULT_LEVEL_THRESHOLDS = [0, 100, 300, 700, 1500, 3000, 6000];
const ACHIEVEMENT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_ACHIEVEMENT_ROWS = 4;
const RENEWAL_NOTICE_DAYS = 7;

export function levelSnapshot(xpTotal, thresholds) {
  const steps = Array.isArray(thresholds) && thresholds.length ? thresholds : DEFAULT_LEVEL_THRESHOLDS;
  const xp = Math.max(0, Number(xpTotal) || 0);
  let level = 1;
  for (let i = 0; i < steps.length; i += 1) if (xp >= steps[i]) level = i + 1;
  const floor = steps[level - 1];
  const next = level < steps.length ? steps[level] : null;
  const progress = next === null ? 100 : Math.max(0, Math.min(100, Math.round(((xp - floor) / (next - floor)) * 100)));
  return { level, levelCount: steps.length, xp, floor, next, progress, xpToNext: next === null ? 0 : next - xp };
}

const PLAN_CHIP = { free: 'FREE', plus: 'PLUS', pro: 'PRO', personalized: 'CUSTOM' };
const PLAN_NAME = { free: 'Free', plus: 'Plus', pro: 'Pro', personalized: 'Custom' };
export function planChipLabel(planId) {
  if (!planId) return null;
  return PLAN_CHIP[planId] || String(planId).toUpperCase();
}
export function planDisplayName(planId) {
  if (!planId) return '';
  return PLAN_NAME[planId] || String(planId);
}

export function formatWalletUsd(microUsd) {
  if (typeof microUsd !== 'number' || !Number.isFinite(microUsd)) return null;
  return '$' + (microUsd / 1000000).toFixed(2);
}

function fill(template, values) {
  return String(template || '').replace(/\{(\w+)\}/g, (match, key) => (values && values[key] !== undefined ? String(values[key]) : match));
}

function toMs(value) {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

const RELATIVE_UNITS = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
export function relativeTime(value, nowMs, lang) {
  const at = toMs(value);
  if (at === null) return '';
  const seconds = (at - nowMs) / 1000;
  let formatter;
  try { formatter = new Intl.RelativeTimeFormat((lang || 'en') + '-u-nu-latn', { numeric: 'auto' }); } catch (_) {
    try { formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' }); } catch (__) { return ''; }
  }
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit);
  }
  return formatter.format(0, 'minute');
}

export function daysUntil(value, nowMs) {
  const at = toMs(value);
  if (at === null) return null;
  return Math.ceil((at - nowMs) / 86400000);
}

// Returns { items, counts: {support, community, account}, unreadTotal }.
// `tickets` is null until the ticket list has been fetched (then the badge count stands in).
export function buildNotifications({
  tickets = null, badges = null, achievements = null, achievementDefs = [], achievementTitle = (key) => key,
  subscription = null, planId = null, seenAt = null, now = Date.now(), lang = 'en', t = {}
} = {}) {
  const seenMs = seenAt ? toMs(seenAt) : null;
  const support = [];
  const community = [];
  const account = [];

  if (Array.isArray(tickets)) {
    tickets
      .filter((ticket) => ticket && ticket.unread)
      .sort((a, b) => (toMs(b.lastActivityAt) || 0) - (toMs(a.lastActivityAt) || 0))
      .forEach((ticket) => support.push({
        id: 'support:' + ticket.id, group: 'support', tone: 'info', icon: 'life-buoy', unread: true,
        title: t.pcNotifSupportTitle, body: { text: fill(t.pcNotifSupportBody, { subject: ticket.subject || '' }) },
        time: relativeTime(ticket.lastActivityAt, now, lang), target: { type: 'support', id: ticket.id }
      }));
  } else if (badges && badges.supportUnread > 0) {
    support.push({
      id: 'support:unread', group: 'support', tone: 'info', icon: 'life-buoy', unread: true,
      title: t.pcNotifSupportTitle, body: { text: fill(t.pcNotifSupportCount, { count: badges.supportUnread }) },
      time: '', target: { type: 'support' }
    });
  }

  if (badges && badges.communityUnread > 0) {
    community.push({
      id: 'community:unread', group: 'community', tone: 'accent', icon: 'messages-square', unread: true,
      title: fill(t.pcNotifCommunityTitle, { count: badges.communityUnread }), body: { text: t.pcNotifCommunityBody },
      time: '', target: { type: 'community' }
    });
  }

  if (Array.isArray(achievements)) {
    const defsByKey = {};
    (achievementDefs || []).forEach((def) => { if (def && def.key) defsByKey[def.key] = def; });
    achievements
      .filter((row) => row && row.achievementKey && toMs(row.unlockedAt) !== null && now - toMs(row.unlockedAt) <= ACHIEVEMENT_WINDOW_MS)
      .sort((a, b) => toMs(b.unlockedAt) - toMs(a.unlockedAt))
      .slice(0, MAX_ACHIEVEMENT_ROWS)
      .forEach((row) => {
        const def = defsByKey[row.achievementKey] || {};
        const points = Number(def.points) || 0;
        account.push({
          id: 'achievement:' + row.achievementKey, group: 'account', tone: 'gold', icon: 'trophy',
          unread: seenMs === null || toMs(row.unlockedAt) > seenMs,
          title: fill(t.pcNotifAchievementTitle, { title: achievementTitle(row.achievementKey, def) }),
          body: points > 0 ? { text: t.pcNotifAchievementBody, ltr: '+' + points + ' XP' } : { text: t.pcAchievementUnlocked },
          time: relativeTime(row.unlockedAt, now, lang), target: { type: 'achievements' }
        });
      });
  }

  if (subscription) {
    const plan = planDisplayName(subscription.planId || planId);
    if (subscription.status === 'past_due') {
      const changedMs = toMs(subscription.updatedAt);
      account.push({
        id: 'subscription:past-due', group: 'account', tone: 'danger', icon: 'triangle-alert',
        unread: seenMs === null || changedMs === null || changedMs > seenMs,
        title: t.pcNotifPastDueTitle, body: { text: t.pcNotifPastDueBody }, time: '', target: { type: 'subscription' }
      });
    } else {
      const days = daysUntil(subscription.currentPeriodEnd, now);
      if (days !== null && days >= 1 && days <= RENEWAL_NOTICE_DAYS) {
        const ending = Boolean(subscription.cancelAtPeriodEnd) || subscription.status === 'canceled';
        const key = ending ? (days === 1 ? 'pcNotifEndTomorrow' : 'pcNotifEndTitle') : (days === 1 ? 'pcNotifRenewTomorrow' : 'pcNotifRenewTitle');
        account.push({
          id: 'subscription:period-end', group: 'account', tone: 'muted', icon: 'crown', unread: false,
          title: fill(t[key], { plan, days }), body: { text: ending ? t.pcNotifAutoRenewOff : t.pcNotifAutoRenewOn },
          time: '', target: { type: 'subscription' }
        });
      }
    }
  }

  const counts = {
    support: Array.isArray(tickets) ? support.length : (badges ? badges.supportUnread || 0 : 0),
    community: badges ? badges.communityUnread || 0 : 0,
    account: account.filter((item) => item.unread).length
  };
  return { items: support.concat(community, account), counts, unreadTotal: counts.support + counts.community + counts.account };
}

// Keys added since the previous successful fetch - drives the card's brief "achievement
// unlocked" moment. The first fetch of a page load never celebrates (nothing to compare with).
export function newlyUnlocked(previousKeys, achievements) {
  if (!previousKeys || !Array.isArray(achievements)) return [];
  return achievements.filter((row) => row && row.achievementKey && !previousKeys.has(row.achievementKey));
}

export { fill as fillTemplate };
