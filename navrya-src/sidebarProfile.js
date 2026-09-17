// Assembles the sidebar profile card + account menu data from real sources only:
// - name / photo / email / role / XP:  store.getState().profile  (GET /api/users/me/profile)
// - level math:                         window.TradeJournalProfileXPRules (LEVEL_THRESHOLDS)
// - next goal:                          store.getState().nextGoal (account-profile-store nextGoal())
// - wallet credit:                      GET /api/sync/wallet
// - plan chip / renewal notice:         GET /api/sync/subscriptions
// - streak:                             TradeJournalPsychologyStore.disciplineStreak(trades)
// - achievements (x/14, recent unlocks): TradeJournalAccountProfileStore.getAchievements()
// - notification counts:                useNotificationBadges() (GET /api/sync/notifications/summary)
// - per-ticket support rows:            TradeJournalSupportStore.listTickets() (fetched when the menu opens)
// - "seen" cursor for account rows:     user preference 'accountMenuSeenAt' (server-backed)
// - log out:                            TradeJournalDevUserSwitcher.logout()
import React from 'react';
import { stringsFor } from './i18n.js';
import { buildNotifications, formatWalletUsd, levelSnapshot, newlyUnlocked, planChipLabel } from './profileMenuModel.js';

const SEEN_PREF = 'accountMenuSeenAt';
const CELEBRATE_MS = 6000;
const ACHIEVEMENT_REFRESH_DELAY_MS = 1500;
const DOMAIN_EVENTS = [
  'tradejournal:trades-changed', 'tradejournal:sessions-changed', 'tradejournal:patterns-changed',
  'tradejournal:strategy-education-changed', 'tradejournal:mental-health-changed', 'tradejournal:listing-published'
];

export function fmtWalletUsd(microUsd) { return formatWalletUsd(microUsd); }

// Real AI Wallet balance (GET /api/sync/wallet), refetched on wallet-affecting actions and when
// the tab regains focus/visibility. Shared by the header's HONOUR metric and the profile card.
export function useWalletBalance() {
  const [balance, setBalance] = React.useState(null);
  React.useEffect(() => {
    let cancelled = false;
    function reload() {
      fetch('/api/sync/wallet').then((r) => r.json()).then((d) => { if (!cancelled) setBalance(d.totalBalanceMicroUsd); }).catch(() => {});
    }
    reload();
    function onVisible() { if (document.visibilityState === 'visible') reload(); }
    window.addEventListener('navrya:wallet-changed', reload);
    window.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', reload);
    return () => {
      cancelled = true;
      window.removeEventListener('navrya:wallet-changed', reload);
      window.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', reload);
    };
  }, []);
  return balance;
}

function useSubscriptionPlan() {
  const [value, setValue] = React.useState(null);
  React.useEffect(() => {
    let cancelled = false;
    function reload() {
      fetch('/api/sync/subscriptions')
        .then((r) => (r.ok ? r.json() : null))
        .then((body) => { if (!cancelled && body) setValue({ plan: body.plan || null, subscription: body.subscription || null }); })
        .catch(() => {});
    }
    reload();
    window.addEventListener('navrya:wallet-changed', reload);
    return () => { cancelled = true; window.removeEventListener('navrya:wallet-changed', reload); };
  }, []);
  return value;
}

function useDisciplineStreak() {
  const [streak, setStreak] = React.useState(null);
  React.useEffect(() => {
    function recompute() {
      const tradeStore = window.TradeJournalTradeStore;
      const psychologyStore = window.TradeJournalPsychologyStore;
      if (!tradeStore || !psychologyStore) return;
      try { setStreak(psychologyStore.disciplineStreak(tradeStore.listSync())); } catch (_) { /* leave the last value */ }
    }
    recompute();
    window.addEventListener('tradejournal:trades-changed', recompute);
    return () => window.removeEventListener('tradejournal:trades-changed', recompute);
  }, []);
  return streak;
}

function readSeenAt() {
  const prefs = window.TradeJournalUserPreferences;
  if (!prefs || !prefs.getPref) return null;
  try { return prefs.getPref(SEEN_PREF, null); } catch (_) { return null; }
}

function achievementDefinitions() {
  const defs = window.TradeJournalProfileAchievements;
  return defs && Array.isArray(defs.definitions) ? defs.definitions : [];
}

function achievementTitle(key, def) {
  const i18n = window.TradeJournalAccountProfileI18n;
  if (i18n && def && def.labelKey) return i18n.t('ach' + def.labelKey + 'Title');
  return key;
}

function goTo(hash) { location.hash = hash; }

function labelsFor(t) {
  return {
    accountMenu: t.pcAccountMenu, openMenu: t.pcOpenMenu, close: t.pcClose, notifications: t.pcNotifications, alerts: t.pcAlerts,
    newCount: t.pcNewCount, notificationsAria: t.pcNotificationsAria, profile: t.pcProfile, logout: t.pcLogout,
    logoutAsk: t.pcLogoutAsk, logoutConfirm: t.pcLogoutConfirm, cancel: t.pcCancel, loggingOut: t.pcLoggingOut,
    logoutFailedShort: t.pcLogoutFailedShort, retry: t.pcRetry, logoutAccount: t.pcLogoutAccount,
    logoutFailed: t.pcLogoutFailed, retryLogout: t.pcRetryLogout, levelN: t.pcLevelN, ofN: t.pcOfN,
    xpToLevel: t.pcXpToLevel, maxLevel: t.pcMaxLevel, levelPath: t.pcLevelPath, streak: t.pcStreak,
    streakDays: t.pcStreakDays, achievements: t.pcAchievements, credit: t.pcCredit, markAllRead: t.pcMarkAllRead,
    filterAll: t.pcFilterAll, filterSupport: t.pcFilterSupport, filterCommunity: t.pcFilterCommunity,
    filterAccount: t.pcFilterAccount, myProfile: t.pcMyProfile, subscriptionWallet: t.pcSubscriptionWallet,
    editProfile: t.pcEditProfile, emailVerified: t.pcEmailVerified, achievementUnlocked: t.pcAchievementUnlocked,
    avatarAlt: t.pcAvatarAlt, unread: t.pcUnread, noNotifications: t.pcNoNotifications, nextGoal: t.nextGoalLabel,
    walletAria: t.pcWalletAria, streakAria: t.pcStreakAria, achievementsAria: t.pcAchievementsAria
  };
}

export function useSidebarProfile({ store, state, navryaCharacter, badges }) {
  const lang = state.language;
  const t = stringsFor(lang);
  const walletBalance = useWalletBalance();
  const plan = useSubscriptionPlan();
  const streak = useDisciplineStreak();
  const [achievements, setAchievements] = React.useState(null);
  const [tickets, setTickets] = React.useState(null);
  const [celebrate, setCelebrate] = React.useState(null);
  const [seenAt, setSeenAt] = React.useState(readSeenAt);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const knownKeysRef = React.useRef(null);

  const loadAchievements = React.useCallback(() => {
    const profileStore = window.TradeJournalAccountProfileStore;
    if (!profileStore || !profileStore.getAchievements) return;
    profileStore.getAchievements().then((rows) => {
      if (!Array.isArray(rows)) return;
      const fresh = newlyUnlocked(knownKeysRef.current, rows);
      knownKeysRef.current = new Set(rows.map((row) => row.achievementKey));
      setAchievements(rows);
      if (fresh.length) {
        const def = achievementDefinitions().find((d) => d.key === fresh[0].achievementKey) || {};
        setCelebrate({ key: fresh[0].achievementKey, name: achievementTitle(fresh[0].achievementKey, def), chip: def.points ? '+' + def.points + ' XP' : null });
      }
    }).catch(() => {});
  }, []);

  React.useEffect(() => {
    loadAchievements();
    let timer = null;
    function scheduleRefresh() {
      if (timer) clearTimeout(timer);
      // Unlocks are POSTed by account-profile-store.js after it observes the same events.
      timer = setTimeout(loadAchievements, ACHIEVEMENT_REFRESH_DELAY_MS);
    }
    DOMAIN_EVENTS.forEach((name) => window.addEventListener(name, scheduleRefresh));
    return () => {
      if (timer) clearTimeout(timer);
      DOMAIN_EVENTS.forEach((name) => window.removeEventListener(name, scheduleRefresh));
    };
  }, [loadAchievements]);

  React.useEffect(() => {
    if (!celebrate) return undefined;
    const timer = setTimeout(() => setCelebrate(null), CELEBRATE_MS);
    return () => clearTimeout(timer);
  }, [celebrate]);

  const loadTickets = React.useCallback(() => {
    const supportStore = window.TradeJournalSupportStore;
    if (!supportStore) return Promise.resolve(null);
    return supportStore.listTickets().then((rows) => { const list = Array.isArray(rows) ? rows : []; setTickets(list); return list; }).catch(() => null);
  }, []);

  const supportUnread = badges ? badges.supportUnread : null;
  React.useEffect(() => {
    if (!menuOpen) return undefined;
    loadTickets();
    loadAchievements();
    setSeenAt(readSeenAt());
    window.addEventListener('tradejournal:support-ticket-changed', loadTickets);
    return () => window.removeEventListener('tradejournal:support-ticket-changed', loadTickets);
  }, [menuOpen, loadTickets, loadAchievements, supportUnread]);

  const markAllRead = React.useCallback(() => {
    const stamp = new Date().toISOString();
    setSeenAt(stamp);
    const prefs = window.TradeJournalUserPreferences;
    if (prefs && prefs.setPref) prefs.setPref(SEEN_PREF, stamp);
    const jobs = [];
    const notificationsStore = window.TradeJournalNotificationsStore;
    if (badges && badges.communityUnread > 0 && notificationsStore) jobs.push(notificationsStore.acknowledgeCommunity().catch(() => {}));
    const supportStore = window.TradeJournalSupportStore;
    if (supportStore) {
      const listReady = Array.isArray(tickets) ? Promise.resolve(tickets) : loadTickets();
      // Opening a ticket is what clears its unread flag server-side (routes.support-tickets.mjs).
      jobs.push(listReady.then((list) => Promise.all((list || []).filter((ticket) => ticket.unread).map((ticket) => supportStore.getTicket(ticket.id).catch(() => {})))));
    }
    Promise.all(jobs).then(() => {
      window.dispatchEvent(new CustomEvent('navrya:notifications-changed'));
      loadTickets();
    });
  }, [badges, tickets, loadTickets]);

  const openNotification = React.useCallback((item) => {
    const target = item && item.target ? item.target : {};
    if (target.type === 'support') {
      store.setActiveId('support');
      if (target.id) goTo('#support/' + encodeURIComponent(target.id));
    } else if (target.type === 'community') {
      store.setActiveId('community');
    } else if (target.type === 'achievements') {
      goTo('#account/profile/achievements');
    } else if (target.type === 'subscription') {
      store.setActiveId('subscription');
    }
  }, [store]);

  const logout = React.useCallback(() => {
    const switcher = window.TradeJournalDevUserSwitcher;
    if (!switcher || typeof switcher.logout !== 'function') return Promise.reject(new Error('LOGOUT_UNAVAILABLE'));
    return Promise.resolve(switcher.logout());
  }, []);

  const rules = window.TradeJournalProfileXPRules;
  const account = state.profile;
  const snapshot = levelSnapshot(account ? account.xpTotal : 0, rules && rules.LEVEL_THRESHOLDS);
  const level = account && rules && rules.levelForXp ? rules.levelForXp(account.xpTotal) : snapshot.level;
  const defs = achievementDefinitions();
  const roleLabels = { trader: t.pcRoleTrader, mentor: t.pcRoleMentor, teacher: t.pcRoleTeacher };
  const title = (t.charTitle && t.charTitle[navryaCharacter]) || '';
  const roleLabel = account && roleLabels[account.profileRole] ? roleLabels[account.profileRole] : '';

  const goal = state.nextGoal;
  let goalView = null;
  if (goal && goal.kind === 'achievement') {
    const def = defs.find((d) => d.key === goal.key) || { labelKey: goal.labelKey };
    goalView = { name: achievementTitle(goal.key, def), chip: goal.points ? '+' + goal.points + ' XP' : null };
  } else if (goal && goal.kind === 'level') {
    goalView = { name: t.pcXpToLevel.replace('{xp}', goal.xpToGo).replace('{level}', Math.min(level + 1, snapshot.levelCount)), chip: null };
  } else if (goal && goal.kind === 'maxLevel') {
    goalView = { name: t.goalMaxLevel, chip: null };
  }

  const notifications = buildNotifications({
    tickets, badges, achievements, achievementDefs: defs, achievementTitle,
    subscription: plan ? plan.subscription : null, planId: plan ? plan.plan : null,
    seenAt, now: Date.now(), lang, t
  });

  return {
    name: account ? account.displayName : '',
    email: account ? account.email : '',
    emailVerified: Boolean(account && account.emailVerified),
    avatarUrl: account && account.avatarDataUrl ? account.avatarDataUrl : null,
    title,
    roleLine: roleLabel ? title + ' · ' + roleLabel : title,
    planChip: plan ? planChipLabel(plan.plan) : null,
    streak,
    achievementsDone: achievements ? achievements.length : 0,
    achievementsTotal: achievements ? defs.length : 0,
    walletLabel: formatWalletUsd(walletBalance),
    level,
    levelCount: snapshot.levelCount,
    xp: snapshot.xp,
    xpNext: snapshot.next,
    xpToNext: snapshot.xpToNext,
    progress: snapshot.progress,
    goal: goalView,
    celebrate,
    unreadTotal: notifications.unreadTotal,
    notifications,
    labels: labelsFor(t),
    onMenuOpenChange: setMenuOpen,
    onGoal: () => goTo(goal && goal.kind === 'achievement' ? '#account/profile/achievements' : '#account/profile/level'),
    onProfile: () => goTo('#account/profile'),
    onMyProfile: () => goTo('#account/profile'),
    onEditProfile: () => goTo('#account/profile/identity'),
    onLevelPath: () => goTo('#account/profile/level'),
    onWallet: () => store.setActiveId('subscription'),
    onSubscription: () => store.setActiveId('subscription'),
    onMarkAllRead: markAllRead,
    onNotification: openNotification,
    logout
  };
}
