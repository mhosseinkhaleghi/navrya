import React from 'react';
import { createRoot } from 'react-dom/client';
import { Sidebar } from '../public/pages/shared/navrya/components/navigation/Sidebar.jsx';
import { CharacterHeader } from '../public/pages/shared/navrya/components/header/CharacterHeader.jsx';
import { MarketSessionCard } from '../public/pages/shared/navrya/components/market/MarketSessionCard.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Modal } from '../public/pages/shared/navrya/components/feedback/Modal.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { SessionLibrary } from '../public/pages/shared/navrya/components/sessions/SessionLibrary.jsx';
import { TIMEFRAMES as SESSION_TIMEFRAMES, SESSION_CITIES } from '../public/pages/shared/navrya/components/sessions/NewSessionDialog.jsx';
import * as sessionEntryCards from './sessionEntryCardsView.jsx';
import * as sessionsAdapter from './sessionsAdapter.js';
import { LiveSessionView } from './liveSessionView.jsx';
import { openLiveSession, closeLiveSession, getLiveSessionId, getLiveSessionView, subscribeLiveSession } from './liveSessionSignal.js';
import * as marketAdapter from './marketAdapter.js';
import { createStore } from './store.js';
import { CHARACTERS } from './characters.js';
import { stringsFor, isRtl } from './i18n.js';
import { renderCanvas } from './canvasApp.jsx';
import { renderSubscriptions } from './subscriptionsView.jsx';
import { renderAiAssistant } from './aiAssistantView.jsx';
import { renderCommunity } from './communityView.jsx';
import { openPublishFlow } from './publishFlowModal.jsx';
import { renderPsychology } from './psychologyView.jsx';
import { renderPatternRegistry } from './patternRegistryView.jsx';
import { renderStrategyEducation } from './strategyEducationView.jsx';
import { renderChatDock } from './chatDockView.jsx';
import { renderAccountProfile } from './accountProfileView.jsx';
import { openIntake, INTAKE_ENUM_OPTIONS } from './mentalHealthIntakeModal.jsx';
import { AnalysisProfileOnboarding } from './analysisProfileOnboarding.jsx';
import { openCalculator } from './tradeCalculatorModal.jsx';
import { openLogWizard } from './tradeLogModal.jsx';
import { useAccounts } from './accountsView.jsx';
import { openClosePosition } from './closePositionModal.jsx';
import { openEmotion } from './logEmotionModal.jsx';
import { openTradeDetails } from './tradeDetailsModal.jsx';
import { openPostTradeReflection } from './postTradeReflectionModal.jsx';
import { openPreSessionCheckIn } from './preSessionCheckInModal.jsx';

function useStore(store) {
  return React.useSyncExternalStore(store.subscribe, store.getState);
}

function useClock() {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function navItems(t) {
  return [
    { id: 'sessions', icon: 'sessions', label: t.navSessions },
    { id: 'dashboard', icon: 'dashboard', label: t.navDashboard },
    { id: 'accounts', icon: 'wallet', label: t.navAccounts },
    { id: 'strategies', icon: 'strategies', label: t.navStrategies },
    { id: 'psychology', icon: 'psychology', label: t.navPsychology },
    { id: 'subscription', icon: 'subscription', label: t.navSubscription },
    { id: 'ai-assistant', icon: 'ai-assistant', label: t.navAiAssistant },
    { id: 'community', icon: 'community', label: t.navCommunity },
    { id: 'settings', icon: 'settings', label: t.navSettings },
    { id: 'more', icon: 'more', label: t.navMore }
  ];
}

function fmtWalletUsd(microUsd) { return '$' + (microUsd / 1000000).toFixed(2); }

// HONOUR now shows the real AI Wallet balance (GET /api/sync/wallet - the same endpoint
// accountProfileView.jsx's Subscription tab already uses as its own source of truth for this
// number, never a second/parallel wallet read). SCENARIOS and STREAK are computed from real
// stores; EXECUTION still has no backing metric anywhere in this codebase and renders an honest
// '—' rather than an invented number - the same "insufficient data over fabricated numbers"
// standard used throughout this app.
function useWalletBalance() {
  const [balance, setBalance] = React.useState(null);
  React.useEffect(() => {
    let cancelled = false;
    function reload() {
      fetch('/api/sync/wallet').then((r) => r.json()).then((d) => { if (!cancelled) setBalance(d.totalBalanceMicroUsd); }).catch(() => {});
    }
    reload();
    // Refetch whenever a wallet-affecting action fires this event (topup/purchase confirmed,
    // upgrade confirmed - accountProfileView.jsx dispatches it) and whenever the tab regains
    // focus/visibility, so the header never shows a stale balance after the user does something
    // wallet-affecting on another tab/device or comes back to this one.
    function onWalletChanged() { reload(); }
    function onVisible() { if (document.visibilityState === 'visible') reload(); }
    window.addEventListener('navrya:wallet-changed', onWalletChanged);
    window.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', reload);
    return () => {
      cancelled = true;
      window.removeEventListener('navrya:wallet-changed', onWalletChanged);
      window.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', reload);
    };
  }, []);
  return balance;
}

// Real-money subscription rollout: an attractive, hard-to-miss popup when the wallet is genuinely
// depleted (balance <= 0) or the active subscription has real payment trouble ('past_due' -
// server/commercial/subscription-service.mjs's recordPaymentFailure) - never for a plain Free
// account that simply never upgraded (that is not "ran out of anything"). A fully lapsed/expired
// subscription is not distinguishable from "never subscribed" from the client's own two existing
// endpoints (an expired row stops being the "active" subscription entirely, per
// entitlement-resolver.mjs's own real-time re-check) - this deliberately covers the two signals
// that ARE real and unambiguous, rather than over-firing for every free user.
// Dismissal is remembered in localStorage for a cool-down window so this never nags on every
// single page navigation once the user has already seen and closed it.
const WALLET_GATE_SNOOZE_MS = 30 * 60 * 1000; // 30 minutes
const WALLET_GATE_SNOOZE_KEY = 'navrya:wallet-low-balance-snoozed-until';
function WalletLowBalanceGate({ lang }) {
  const t = stringsFor(lang);
  const rtl = isRtl(lang);
  const [reason, setReason] = React.useState(null); // 'balance' | 'past_due' | null
  const [dismissed, setDismissed] = React.useState(false);
  React.useEffect(() => {
    function check() {
      try {
        const snoozedUntil = Number(localStorage.getItem(WALLET_GATE_SNOOZE_KEY)) || 0;
        if (Date.now() < snoozedUntil) return;
      } catch (_) { /* private-browsing/storage-disabled - never block the check over this */ }
      Promise.all([
        fetch('/api/sync/wallet').then((r) => r.json()).catch(() => null),
        fetch('/api/sync/subscriptions').then((r) => r.json()).catch(() => null)
      ]).then(([wallet, sub]) => {
        if (wallet && wallet.totalBalanceMicroUsd <= 0) setReason('balance');
        else if (sub && sub.subscription && sub.subscription.status === 'past_due') setReason('past_due');
      });
    }
    check();
    window.addEventListener('navrya:wallet-changed', check);
    return () => window.removeEventListener('navrya:wallet-changed', check);
  }, []);
  function dismiss() {
    try { localStorage.setItem(WALLET_GATE_SNOOZE_KEY, String(Date.now() + WALLET_GATE_SNOOZE_MS)); } catch (_) { /* best-effort only */ }
    setDismissed(true);
  }
  if (!reason || dismissed) return null;
  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ direction: rtl ? 'rtl' : 'ltr' }}>
      <Modal
        open title={t.walletLowBalanceTitle} icon="wallet" onClose={dismiss} width={420}
        footer={(
          <>
            <span style={{ flex: 1 }} />
            <Button variant="secondary" onClick={dismiss}>{t.walletLowBalanceDismiss}</Button>
            <Button variant="primary" icon="crown" onClick={() => { dismiss(); location.hash = '#account/profile/subscriptions'; }}>{t.walletLowBalanceCta}</Button>
          </>
        )}
      >
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-primary)', lineHeight: 1.6 }}>{t.walletLowBalanceBody}</p>
      </Modal>
    </div>
  );
}

function useMetrics(sessions, t) {
  const [streak, setStreak] = React.useState(null);
  React.useEffect(() => {
    const tradeStore = window.TradeJournalTradeStore;
    const psychologyStore = window.TradeJournalPsychologyStore;
    if (!tradeStore || !psychologyStore) return;
    setStreak(psychologyStore.disciplineStreak(tradeStore.listSync()));
  }, [sessions]);
  const scenarios = React.useMemo(() => sessions.reduce((sum, s) => sum + sessionsAdapter.scenarioCount(s), 0), [sessions]);
  const walletBalance = useWalletBalance();
  return [
    { icon: 'honour', label: t.honour, value: walletBalance === null ? '—' : fmtWalletUsd(walletBalance) },
    { icon: 'scenarios', label: t.scenarios, value: String(scenarios) },
    { icon: 'execution', label: t.execution, value: '—' },
    { icon: 'streak', label: t.streak, value: streak === null ? '—' : String(streak) }
  ];
}

// Translates the real nextGoal computed by account-profile-store.js's nextGoal() into the
// Sidebar/RewardCard's existing {reward, xp, progress} prop shape - previously these were always
// the same hardcoded "250 XP / 73%" chest regardless of the trader's actual state (Section 11's
// XP engine had no client-side surface at all until this pass). Achievement titles are looked up
// via the account-profile i18n dictionary (already loaded, already the single source for these
// strings) rather than duplicating them here.
function rewardPropsFor(goal, t) {
  const profileI18n = window.TradeJournalAccountProfileI18n;
  if (!goal) return {};
  if (goal.kind === 'achievement') {
    const title = profileI18n ? profileI18n.t('ach' + goal.labelKey + 'Title') : goal.key;
    return { reward: title, rewardXp: goal.points + ' XP', rewardProgress: goal.progress };
  }
  if (goal.kind === 'level') {
    return { reward: t.level, rewardXp: t.goalXpToGo.replace('{xp}', goal.xpToGo), rewardProgress: goal.progress };
  }
  if (goal.kind === 'maxLevel') {
    return { reward: t.goalMaxLevel, rewardXp: '', rewardProgress: 100 };
  }
  return {};
}

function SidebarApp({ navryaCharacter, quotes, store }) {
  const s = useStore(store);
  const t = stringsFor(s.language);
  const rtl = isRtl(s.language);
  const rewardProps = rewardPropsFor(s.nextGoal, t);
  return (
    <div data-character={navryaCharacter} dir={rtl ? 'rtl' : 'ltr'} style={{ direction: rtl ? 'rtl' : 'ltr' }}>
      <Sidebar
        character={navryaCharacter} items={navItems(t)} activeId={s.activeId} collapsed={s.collapsed}
        quote={quotes[s.language] || quotes.en} rtl={rtl}
        activeLabel={t.activeLabel} collapseLabel={s.collapsed ? t.expandSidebar : t.collapseSidebar}
        rewardLabel={t.nextGoalLabel} {...rewardProps}
        onRewardOpen={() => { location.hash = s.nextGoal && s.nextGoal.kind === 'achievement' ? '#account/profile/achievements' : '#account/profile/level'; }}
        onNavigate={store.setActiveId} onToggle={() => store.setCollapsed(!s.collapsed)}
      />
    </div>
  );
}

function HeaderApp({ navryaCharacter, quotes, store }) {
  const s = useStore(store);
  const t = stringsFor(s.language);
  const rtl = isRtl(s.language);
  const now = useClock();
  // Collapse-to-rail toggle from the design handoff (code-codex/dashboard/NavryaDashboard.dc.html):
  // the full 320px header can shrink to a slim 72px live-clock rail. Local, runtime-only state -
  // same as the Sidebar's own `collapsed` in store.js, which also doesn't persist across reloads -
  // since nothing outside this one root needs to react to it.
  const [headerOpen, setHeaderOpen] = React.useState(true);
  // "APP UPTIME" is Steam-style playtime: total time the account has ever been online, server-
  // accumulated across every login (routes.profile.mjs's hoursOnlineFor(), fed by admin-
  // heartbeat.js's 45s beat into user_sessions) - not a per-mount session clock. Each character
  // page is its own full reload, so s.profile.hoursOnline is re-fetched fresh every time and
  // keeps growing across character switches instead of restarting at zero. appStartRef only
  // covers the gap between that fetch and now, so the number keeps ticking live between fetches
  // rather than jumping once a heartbeat lands.
  const appStartRef = React.useRef(Date.now());
  const baseUptimeMs = s.profile ? s.profile.hoursOnline * 3600000 : 0;
  const metrics = useMetrics(s.sessions, t);
  const rules = window.TradeJournalProfileXPRules;
  const level = s.profile && rules ? rules.levelForXp(s.profile.xpTotal) : undefined;
  const xpMax = s.profile && rules ? (rules.xpForNextLevel(s.profile.xpTotal) ?? s.profile.xpTotal) : undefined;
  const marketLabels = { london: t.marketLondon, 'new-york': t.marketNewYork, tokyo: t.marketTokyo, sydney: t.marketSydney };
  const nextSession = marketAdapter.nextSessionCountdown(now);
  const markets = marketAdapter.marketStates(now).map((m) => ({ ...m, cityLabel: marketLabels[m.market] }));
  const nextCityLabel = marketLabels[nextSession.city.toLowerCase().replace(' ', '-')] || nextSession.city;
  return (
    <div data-character={navryaCharacter} dir={rtl ? 'rtl' : 'ltr'} style={{ direction: rtl ? 'rtl' : 'ltr' }}>
      <button
        type="button" className="navrya-mobile-menu-toggle" aria-label="Open navigation" aria-controls="navryaSidebarRoot"
        onClick={() => window.dispatchEvent(new CustomEvent('navrya:mobile-menu', { detail: { open: true } }))}
      ><Icon name="menu" size={20} /></button>
      {/* Header actions live in their own row. They must never occupy the same pixels as the
          market rail, and expanded/collapsed states deliberately keep the control at inline-end. */}
      <div className="navrya-header-expanded" style={{ overflow: 'hidden', transition: 'max-height 220ms cubic-bezier(.22,.61,.36,1), opacity 220ms cubic-bezier(.22,.61,.36,1)', maxHeight: headerOpen ? 420 : 0, opacity: headerOpen ? 1 : 0 }}>
        <CharacterHeader
            character={navryaCharacter}
            title={t.charTitle && t.charTitle[navryaCharacter]}
            name={s.profile ? s.profile.displayName : undefined}
            handle={s.profile ? '@' + s.profile.id : undefined}
            level={level} xp={s.profile ? s.profile.xpTotal : undefined} xpMax={xpMax}
            quote={quotes[s.language] || quotes.en}
            metrics={metrics}
            date={now.toISOString().slice(0, 10)}
            language={s.language.toUpperCase()}
            onLanguageChange={(value) => store.setLanguage(value.toLowerCase())}
            onSettings={() => store.setActiveId('settings')}
            onIdentityClick={() => { if (window.TradeJournalAccountProfilePage) window.TradeJournalAccountProfilePage.open(); }}
            levelLabel={t.level} rankLabel={t.rank}
            uptime={marketAdapter.elapsedClock(baseUptimeMs + (now.getTime() - appStartRef.current))} uptimeLabel={t.appUptime}
            nextSession={{ city: nextCityLabel, startsIn: nextSession.startsIn }}
            nextSessionLabel={t.nextSession} startsInLabel={t.startsIn}
            markets={markets}
        />
        <div className="navrya-header-toggle-row" style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 8 }}>
          <button
            type="button" className="navrya-header-collapse" onClick={() => setHeaderOpen(false)}
            style={{
              width: 44, height: 36, boxSizing: 'border-box',
              display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', borderRadius: 8, cursor: 'pointer',
              border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.6)', color: 'var(--text-muted)',
              font: 'var(--type-section-label)', letterSpacing: '.1em', textTransform: 'uppercase'
            }}
            aria-label={t.collapseHeader} title={t.collapseHeader}
          >
            <Icon name="chevrons-up" size={18} />
          </button>
        </div>
      </div>
      {/* Compact live-clock rail shown in place of the header once collapsed - the same four
          MarketSessionCard rows the full header's own market strip uses, just laid out inline. */}
      <div className="navrya-header-rail" style={{ overflow: 'hidden', transition: 'max-height 220ms cubic-bezier(.22,.61,.36,1), opacity 220ms cubic-bezier(.22,.61,.36,1)', maxHeight: headerOpen ? 0 : 80, opacity: headerOpen ? 0 : 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: 72, boxSizing: 'border-box', padding: '0 14px', borderRadius: 12, border: '1px solid var(--border-gold)', background: 'linear-gradient(90deg, var(--char-atmosphere) 0%, var(--surface-780, var(--surface-800)) 38%, var(--ink-900) 100%)', boxShadow: 'var(--shadow-panel)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            {markets.map((m) => (
              <MarketSessionCard key={m.market} market={m.market} state={m.state} countdown={m.countdown} cityLabel={m.cityLabel} minWidth={190} height={52} style={{ flex: '1 1 0' }} />
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: rtl ? 'flex-start' : 'flex-end', gap: 2, flex: 'none', padding: rtl ? '0 0 0 12px' : '0 12px 0 0' }}>
            <span style={{ font: 'var(--type-caption)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t.nextShort + ' · ' + nextCityLabel}</span>
            <span className="navrya-tabular" dir="ltr" style={{ font: 'var(--type-countdown)', color: 'var(--gold-warm)' }}>{nextSession.startsIn}</span>
          </div>
          <button
            type="button" className="navrya-header-expand" onClick={() => setHeaderOpen(true)} aria-label={t.expandHeader} title={t.expandHeader}
            style={{ width: 44, height: 44, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--border-gold)', background: 'rgba(11,20,21,.72)', color: 'var(--text-muted)' }}
          >
            <Icon name="chevrons-down" size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

function SessionsApp({ character, navryaCharacter, store }) {
  const s = useStore(store);
  const t = stringsFor(s.language);
  const rtl = isRtl(s.language);
  // Live Session (navrya-src/liveSessionView.jsx) replaces the Session Library in place, in this
  // same root, whenever a session is open - the cross-root signal (liveSessionSignal.js) exists
  // only so HeaderApp (a separate createRoot tree) can hide the character header at the same time.
  const liveSessionId = React.useSyncExternalStore(subscribeLiveSession, getLiveSessionId);
  // Defect #5: Session Start's account picker only ever lists this user's real ACTIVE accounts
  // (never archived - defect #3) - the same live, event-driven useAccounts() hook the Accounts
  // Portfolio itself uses, so a session created right after a new account elsewhere reflects it
  // without a page reload.
  const sessionAccounts = useAccounts().filter((a) => a.status === 'active');
  const sessionAccountOptions = sessionAccounts.map((a) => ({ value: a.id, label: a.firm }));
  const cards = s.sessions.map((session) => {
    const props = sessionsAdapter.toCardProps(session);
    return {
      ...props,
      status: session.status === 'closed' ? t.closed : t.active,
      instrumentLabel: t.instrument, lastUpdateLabel: t.lastUpdate,
      openLabel: t.continueOpen, reportLabel: t.viewReport, repeatLabel: t.repeatCopy, deleteLabel: t.delete,
      thumbnail: s.thumbnails[session.id],
      onOpen: () => openLiveSession(session.id),
      onReport: () => openLiveSession(session.id, 'report'),
      onRepeat: () => window.TradeJournalWorkspace && window.TradeJournalWorkspace.duplicate(session.id),
      onDelete: () => {
        if (window.confirm(t.deleteConfirm) && window.TradeJournalWorkspace) window.TradeJournalWorkspace.remove(session.id);
      }
    };
  });
  return (
    <div data-character={navryaCharacter} dir={rtl ? 'rtl' : 'ltr'} style={{ direction: rtl ? 'rtl' : 'ltr' }}>
      {liveSessionId ? (
        <LiveSessionView
          key={liveSessionId} character={character} sessionId={liveSessionId} navActiveId={s.activeId} language={s.language}
          initialView={getLiveSessionView()} onBack={closeLiveSession}
        />
      ) : (
        <SessionLibrary
          // HOTFIX: creating a session used to just close the dialog and leave the user sitting on
          // the Session Library - session.create's own AI action already navigates in via
          // resultContext() (openLiveSession() below), but the plain "New session" button never
          // did. store.createSession() resolves with the real created session (sessionsAdapter.js's
          // own return value), so this is the exact same navigation, just reached from the manual
          // path too instead of only the voice/chat one.
          sessions={cards}
          onNewSession={(values) => Promise.resolve(store.createSession(values)).then((session) => {
            if (session && session.id) openLiveSession(session.id);
            return session;
          })}
          title={t.sessionLibraryTitle} subtitle={t.sessionLibrarySubtitle} newSessionLabel={t.newSession}
          emptyStateProps={{ title: t.emptyTitle, helper: t.emptyHelper }}
          newSessionDialogProps={{
            labels: {
              dialogTitle: t.dialogTitle, createWithoutChart: t.createWithoutChart, createSession: t.createSession, cancel: t.cancel,
              uploadNotice: t.uploadNotice, uploadChart: t.uploadChart, tradingSession: t.tradingSession,
              primaryTimeframe: t.primaryTimeframe, gregorianDate: t.gregorianDate, jalaliDate: t.jalaliDate,
              loopInterval: t.loopInterval, graceMinutes: t.graceMinutes,
              sessionAccount: t.sessionAccount, sessionNoAccount: t.sessionNoAccount, instrument: t.instrument,
              liveSessionWarning: t.liveSessionWarning
            },
            accountOptions: sessionAccountOptions
          }}
        />
      )}
    </div>
  );
}

// Plain DOM, not a React root - it needs to exist before/outside any of the roots mount() creates,
// and never re-renders (the grid is static; the glow's color follows --char-atmosphere via CSS,
// not JS). Guarded so a hot-reload or a second mount() call never stacks a duplicate pair.
//
// NAVRYA chat dock redesign (NavryaChatDock.dc.html): the design's own reference renders show a
// real, per-character photographic backdrop bleeding through behind the grid/glow, not just a flat
// colour. panel-system.js already resolves and publishes this correctly per character as
// `--ps-backdrop` (a real `url("assets/{character}-...webp")`, one already-shipped asset per
// character - see its own `themes` map) - it was simply never consumed anywhere in the current
// NAVRYA canvas (the two places that DO read `--ps-backdrop`, panel-system.css/session-system.css,
// belong to the legacy vanilla panel-grid/session-hero renderers, both confirmed dead relative to
// this canvas - see ARCHITECTURE.md's Known Constraints). Consumed here via `var(--ps-backdrop)`
// (never re-reading/hardcoding the path itself) so this stays correct regardless of load order or
// which character is active - a stale/missing value simply paints nothing, never a broken image.
function ensureBackgroundLayer(navryaCharacter) {
  if (document.getElementById('navryaBackgroundGrid')) return;
  const backdrop = document.createElement('span');
  backdrop.setAttribute('aria-hidden', 'true');
  backdrop.setAttribute('data-character', navryaCharacter);
  backdrop.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:0;opacity:.28;filter:saturate(.85);'
    + 'background-image:linear-gradient(180deg,rgba(3,8,7,.35),rgba(3,8,7,.92)),var(--ps-backdrop);'
    + 'background-size:cover;background-position:center';
  // Real bug fix (found via a live production report on the Commander page): this grid's line
  // colour was a literal `rgba(38,51,50,...)` - a fixed dark green-gray, identical on every
  // character. It happened to blend into Hunter's own green palette and go unnoticed there, but
  // reads as a genuine wrong-colour cast on every other character. `--ps-accent-rgb` is the same
  // reliable, globally-published (panel-system.js, not scoped to any subtree) per-character value
  // already used for this exact "low-opacity accent tint" purpose elsewhere in this app (e.g.
  // `session-chip`'s own `rgba(var(--ps-accent-rgb),...)` background/border) - used here instead
  // of a second hardcoded colour.
  const grid = document.createElement('span');
  grid.id = 'navryaBackgroundGrid';
  grid.setAttribute('aria-hidden', 'true');
  grid.setAttribute('data-character', navryaCharacter);
  grid.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:0;opacity:.5;'
    + 'background-image:linear-gradient(rgba(var(--ps-accent-rgb),.16) 1px,transparent 1px),linear-gradient(90deg,rgba(var(--ps-accent-rgb),.16) 1px,transparent 1px);'
    + 'background-size:48px 48px';
  const glow = document.createElement('span');
  glow.setAttribute('aria-hidden', 'true');
  glow.setAttribute('data-character', navryaCharacter);
  glow.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:0;opacity:.8;'
    + 'background:radial-gradient(90% 70% at 20% 0%,var(--char-atmosphere) 0%,transparent 70%)';
  document.body.insertBefore(glow, document.body.firstChild);
  document.body.insertBefore(grid, document.body.firstChild);
  document.body.insertBefore(backdrop, document.body.firstChild);
}

// Analysis Profiles domain (see ARCHITECTURE.md §7.25). The brief's first-run rule: show the
// two-step onboarding once, when the user genuinely has zero Analysis Profiles yet, and never
// again once at least one exists. Deliberately mounted at the user-bootstrap level (this file's
// own mount(), below) rather than any per-character DOM hack, since Analysis Profiles are
// user-scoped, not character-scoped - the exact same reasoning Sessions/Patterns/Strategies
// already follow for their own server-replica.js domains. "Set up later" never leaves the user
// with zero profiles: it creates the safe General Market Analysis default the brief specifies.
function AnalysisProfileFirstRunGate({ lang }) {
  const [open, setOpen] = React.useState(true);
  if (!open) return null;
  function finish() { setOpen(false); }
  function complete(draft) { if (window.TradeJournalAnalysisProfileStore) window.TradeJournalAnalysisProfileStore.create(draft); finish(); }
  function skip() {
    if (window.TradeJournalAnalysisProfileStore) {
      // §5 of the brief names this default profile "General Market Analysis" verbatim - a fixed
      // localized name distinct from the general_analysis style's own catalog display name
      // ("General / Open Analysis"), not derived via suggestedName().
      const defaultName = { fa: 'تحلیل عمومی بازار', ar: 'تحليل عام للسوق', en: 'General Market Analysis', es: 'Análisis general del mercado' };
      window.TradeJournalAnalysisProfileStore.create({
        name: defaultName[lang] || defaultName.en, primaryStyleId: 'general_analysis',
        focusIds: ['market_structure', 'trend', 'key_levels', 'momentum']
      });
    }
    finish();
  }
  return <AnalysisProfileOnboarding mode="first-run" lang={lang} onComplete={complete} onSkip={skip} />;
}

export function mountCharacterApp(character) {
  const config = CHARACTERS[character];
  if (!config) throw new Error('Unknown NAVRYA character: ' + character);
  const { navryaCharacter, quotes } = config;

  // AssetBase.jsx's assetUrl() auto-detects its base by scanning <link rel="stylesheet"> tags
  // for one whose href ends in "styles.css" - but every character page's own page-local
  // stylesheet is ALSO named styles.css and appears earlier in <head>, so the auto-detection
  // would silently pick the wrong base and break every NAVRYA image. This explicit override
  // (which AssetBase.jsx checks first) fixes it regardless of <link> tag order.
  window.NAVRYA_ASSET_BASE = '../shared/navrya/';

  // panel-system.js's render('dashboard'|'strategies'|'settings') delegates to this hook when
  // present (see panel-system.js's render()), instead of its own legacy makeCanvas/makeSettings
  // DOM builders - each view is its own real, backend-connected screen (navrya-src/canvasApp.jsx).
  window.TradeJournalNavryaCanvas = { render: (view) => renderCanvas(character, view) };

  // account-profile-ui.js's subscriptionsTab() defers to this hook when present (see
  // renderPage()'s state.tab === 'subscriptions' branch) - same real getSubscriptions() data.
  window.TradeJournalNavryaSubscriptions = { render: renderSubscriptions };

  // ai-settings-ui.js's renderPage() defers to this hook when present.
  window.TradeJournalNavryaAiAssistant = { render: renderAiAssistant };

  // community-ui.js's renderPage() defers to this hook when present.
  window.TradeJournalNavryaCommunity = { render: renderCommunity };

  // marketplace-ui.js's openPublishFlow() defers to this hook when present - shared by
  // Pattern Registry's/Strategy Education's sharing tabs too, not just Community.
  window.TradeJournalNavryaPublishFlow = { open: openPublishFlow };

  // psychology-ui.js's renderPage() defers to this hook when present.
  window.TradeJournalNavryaPsychology = { render: renderPsychology };

  // pattern-registry.js's renderList()/renderProfile() defer to this hook when present.
  window.TradeJournalNavryaPatternRegistry = { render: renderPatternRegistry };

  // strategy-education.js's renderList()/renderDetail() defer to this hook when present.
  window.TradeJournalNavryaStrategyEducation = { render: renderStrategyEducation };

  // account-profile-ui.js's renderPage() defers to this hook when present.
  window.TradeJournalNavryaAccountProfile = { render: renderAccountProfile };

  // mental-health-profile-page.js's/mental-health-ui.js's "Start intake" buttons both call
  // window.TradeJournalMentalHealthIntake.open(refresh) directly (there is no legacy fallback
  // here, unlike the TradeJournalNavryaXxx hooks above) - this IS that global, real
  // TradeJournalMentalHealthStore/I18n data underneath, only the rendering is React now.
  window.TradeJournalMentalHealthIntake = { open: openIntake };

  // trade-ui.js's ensureGlobalUi() FAB defers to this hook when present (see that file's own
  // fab.onclick) - same real TradeJournalTradeStore/TradeCalculator/TradeUI data every other
  // TradeJournalTradeUI.openCalculator() caller already goes through, only the dialog is React now.
  window.TradeJournalNavryaTradeCalculator = { open: openCalculator };

  // trade-ui.js's own openWizard(seed, options) defers to this hook when present (see that
  // file's own function body) - every existing caller (the calculator's "Log trade" button,
  // chat-dock-core.js's screenshot-triggered applyExtractionToWizard, and the live-session
  // "register trade" launch button) keeps working unchanged, same seed/options contract, only
  // the dialog itself is React now.
  window.TradeJournalNavryaTradeLog = { open: openLogWizard };

  // trade-ui.js's own closeTrade(id, callback) defers to this hook when present (see that
  // file's own function body) - every existing caller (trade-open-positions.js's close button,
  // the session-workspace position row's close action, the Dashboard's own Positions panel)
  // keeps the exact same id/callback contract; only the dialog itself is React now.
  window.TradeJournalNavryaClosePosition = { open: openClosePosition };

  // trade-ui.js's own openEmotion(tradeId, stage, seed) defers to this hook when present - every
  // existing caller (session position rows' "Log emotion" button, the Dashboard's own Positions
  // panel, the wizard's post-save prompts) keeps the exact same contract, only React now.
  window.TradeJournalNavryaLogEmotion = { open: openEmotion };

  // trade-ui.js's own details(id) (exported as TradeJournalTradeUI.viewTrade) defers to this
  // hook when present - same real fields/actions, only React now.
  window.TradeJournalNavryaTradeDetails = { open: openTradeDetails };

  // mental-health-continuous.js's own openPostTradeReflection(trade) defers to this hook when
  // present (see that file's own function body) - it's what onTradeClosed(trade) opens right
  // after closePositionModal.jsx saves a close, same enabled/cooldownMinutes settings gate,
  // same addPostTradeReflection() write; only the dialog itself is React now.
  window.TradeJournalNavryaPostTradeReflection = { open: openPostTradeReflection };

  // mental-health-continuous.js's own openPreSessionCheckIn(session, onDone) defers to this hook
  // when present (see that file's own function body) - liveSessionView.jsx's withPreSessionCheckIn()
  // calls it directly (the legacy wrapEntryFlow() monkey-patch of TradeJournalEntryFlow.openEntry
  // never fires from the NAVRYA session screen, since it builds entries straight against
  // TradeJournalWorkspace and never calls that legacy function), same real
  // addPreSessionCheckIn() write, same onDone(session, onDone) continuation contract; only the
  // dialog itself is React now.
  window.TradeJournalNavryaPreSessionCheckIn = { open: openPreSessionCheckIn };

  // session-workspace-logic.js's entryCard() defers to TradeJournalSessionCards.renderEntry when
  // present (see session-workspace-logic.js's entryCard()) - overwrites the plain-DOM version
  // session-card-updates.js sets earlier in the page's own <script> load order, since this file
  // loads last. Same normalizeSession/patternCatalog/availablePatterns callers elsewhere already
  // depend on (session-workspace-logic.js's normalize(), trade-ui.js, etc.) - only renderEntry's
  // markup changed, from manual DOM building to JSX + NAVRYA components.
  window.TradeJournalSessionCards = {
    normalizeSession: sessionEntryCards.normalizeSession,
    renderEntry: sessionEntryCards.renderEntry,
    renderActions: sessionEntryCards.renderActions,
    renderTimelineNav: sessionEntryCards.renderTimelineNav,
    patternCatalog: sessionEntryCards.patternCatalog,
    availablePatterns: sessionEntryCards.availablePatterns
  };

  // session-workspace-logic.js's open() defers to this hook when present (see that file's own
  // open=function(idValue){...} reassignment) - same real find()/save()/log() data every other
  // TradeJournalWorkspace caller (openReport/reopen/duplicate) already goes through, only the
  // open-session screen itself is now navrya-src/liveSessionView.jsx instead of hand-built DOM.
  // getActiveSessionId: exposed for ai-context-engine.js's snapshot() (Journey B) - the real,
  // already-imported getLiveSessionId() from liveSessionSignal.js, just reachable off this same
  // window hook alongside .open() rather than a second global.
  window.TradeJournalNavryaLiveSession = { open: openLiveSession, getActiveSessionId: getLiveSessionId };

  // Every design handoff (Calculator, Trade Log, Dashboard, Settings) opens its character page
  // with the same two fixed full-viewport overlays - a faint 48px grid and a soft radial glow of
  // the character's own atmosphere color - directly under <body>. The live app never had them.
  // Added once here (not per-view) since it's page chrome, not any one screen's content; each
  // React root already sets its own data-character locally, so these two spans carry the same
  // attribute themselves to resolve --char-atmosphere without touching the static index.html.
  ensureBackgroundLayer(navryaCharacter);

  function mount() {
    const sidebarRoot = document.getElementById('navryaSidebarRoot');
    const headerRoot = document.getElementById('navryaHeaderRoot');
    const sessionsRoot = document.getElementById('navryaSessionsRoot');
    if (!sidebarRoot || !headerRoot || !sessionsRoot) return;
    const store = createStore(character);

    // The one shared React store every root on this page already renders from, exposed for
    // ai-context-engine.js's snapshot() (current activeId) and for the session.create action
    // below (navigating to the Sessions tab) - same "window hook a shared module defers to"
    // convention as every TradeJournalNavryaXxx assignment in this function.
    window.TradeJournalNavryaStore = store;

    // AI Action Registry (Journey A vertical slice): "start a New York session" and similar.
    // open()/submit()/resultContext() only ever call real, already-existing entry points - the
    // Sessions tab navigation store.setActiveId() already does, the tradejournal:ai-open-new-session
    // signal SessionLibrary.jsx already listens for, the session-create registration
    // NewSessionDialog.jsx already makes (submit() -> the same onCreate()/store.createSession()
    // path the dialog's own button uses), and the openLiveSession() the "Open" button on a
    // session card already calls.
    //
    // normalizeField() maps a natural-language extraction (the model may just as reasonably say
    // "15 minutes" or "new york" as "15m"/"New York") onto NewSessionDialog's own real dropdown
    // option lists (imported directly, never duplicated) before the workflow engine ever treats
    // a field as known - an unrecognized value returns null (ai-workflow-engine.js then leaves
    // that field missing rather than live-applying or submitting a value the real UI wouldn't
    // actually accept).
    function normalizeSessionTimeframe(raw) {
      var text = String(raw || '').trim().toLowerCase().replace(/\s+/g, '');
      if (SESSION_TIMEFRAMES.indexOf(String(raw || '').trim()) > -1) return String(raw).trim();
      var match = /^(\d+)(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$/.exec(text);
      if (!match) return null;
      var unit = /^m/.test(match[2]) ? 'm' : /^h/.test(match[2]) ? 'h' : 'D';
      var candidate = match[1] + unit;
      return SESSION_TIMEFRAMES.indexOf(candidate) > -1 ? candidate : null;
    }
    function normalizeSessionCity(raw) {
      var text = String(raw || '').trim().toLowerCase().replace(/\s+/g, '');
      var found = SESSION_CITIES.find((city) => city.toLowerCase().replace(/\s+/g, '') === text);
      return found || null;
    }
    if (window.TradeJournalAIActionRegistry) {
      window.TradeJournalAIActionRegistry.registerAction({
        id: 'session.create', domain: 'sessions', riskLevel: 'low',
        description: 'Create a new trading session. instrument (required) is a real, exact instrument code from the user\'s own Instrument Catalog (e.g. XAUUSD, BTCUSDT) - never a guessed/aliased symbol. accountId (optional) links it to one of the user\'s real active accounts by name.',
        aliases: ['start session', 'new session', 'open a session', 'start a session'],
        requiredFields: ['city', 'timeframe', 'instrument'],
        optionalFields: ['gregorian', 'jalali', 'loop', 'grace', 'accountId'],
        available: () => true,
        open: () => {
          if (getLiveSessionId()) closeLiveSession();
          if (store.getState().activeId !== 'sessions') store.setActiveId('sessions');
          window.dispatchEvent(new CustomEvent('tradejournal:ai-open-new-session'));
        },
        // accountId/instrument resolution is the exact same STRICT, ask-rather-than-guess
        // TradeJournalAITradeActions.resolveAccountId()/resolveInstrument() trade.calculator's
        // own fields already use (see that action's own normalizeField below) - an ambiguous or
        // unmatched value resolves to null (field stays unfilled) rather than a guess.
        normalizeField: (path, value) => {
          if (path === 'city') return normalizeSessionCity(value);
          if (path === 'timeframe') return normalizeSessionTimeframe(value);
          if (path === 'accountId') {
            var helpers = window.TradeJournalAITradeActions;
            var accountsStore = window.TradeJournalAccountsStore;
            if (!helpers) return null;
            return helpers.resolveAccountId(value, accountsStore && typeof accountsStore.listActive === 'function' ? accountsStore.listActive() : []);
          }
          if (path === 'instrument') {
            var tradeHelpers = window.TradeJournalAITradeActions;
            var catalogStore = window.TradeJournalInstrumentCatalogStore;
            if (!tradeHelpers) return null;
            return tradeHelpers.resolveInstrument(value, catalogStore && typeof catalogStore.listSync === 'function' ? catalogStore.listSync() : []);
          }
          return value;
        },
        submit: () => window.TradeJournalAIProcessRegistry && window.TradeJournalAIProcessRegistry.submit('session-create'),
        resultContext: (session) => { if (session && session.id) openLiveSession(session.id); }
      });
    }

    // AI Action Registry (Journey B vertical slice): "I want to take BTC long" and similar
    // conversational trade-planning flows. Deliberately named 'trade.calculator', not e.g.
    // 'trade.startPlan' - ai-workflow-engine.js's own processIdFor() derives the real UI process
    // id purely by replacing dots with dashes (see that file's own comment on the mapping), and
    // the real target here is the existing 'trade-calculator' process tradeCalculatorModal.jsx
    // already registers (chosen over the Trade Wizard because the Calculator is the one real
    // Trade UI surface that already supports takeProfits/linkedStrategyId live, and now
    // linkedPatternIds/sourceSessionId/sourceScenarioId too - see that file's own registration
    // block). Matching the action id to that exact existing process name lets the untouched
    // Workflow Engine route straight to it with zero engine changes, the same way
    // 'session.create' -> 'session-create' already matches NewSessionDialog.jsx's registration.
    //
    // No symbol/instrument field: confirmed (trade.types.js, ARCHITECTURE.md) that no such field
    // exists anywhere in the real Trade model today - a Trade is sized and risk-managed, never
    // tied to a specific instrument name. "BTC" in the example prompt is simply never extracted -
    // a documented gap, not an invented field. No timeframe field either, for the same reason:
    // the Calculator (this action's real target) has no timeframe control at all - only the
    // Wizard's later steps do, and the Wizard's own allowlist lacks takeProfits - so timeframe
    // stays a known limitation of this MVP rather than something faked onto this UI.
    //
    // The actual normalization/resolution rules live in public/pages/shared/ai-trade-actions.js
    // (a plain, unit-testable shared module - this file is JSX and has no test harness of its
    // own), loaded on this page ahead of this bundle; this just forwards to it with the real
    // Strategy/Pattern lookup lists this scope already has access to.
    if (window.TradeJournalAIActionRegistry) {
      window.TradeJournalAIActionRegistry.registerAction({
        id: 'trade.calculator', domain: 'trades', riskLevel: 'medium',
        // Found via real browser testing (Journey C). Two separate model-behavior gaps, both
        // fixed the same way (this is the ONLY field the model gets: catalogFor() never sends a
        // per-field description, so this string carries both):
        // 1) With no hint beyond the literal field name, a model reasonably reads
        //    "linkedStrategyId"/"linkedPatternIds" as requiring a real internal id it doesn't
        //    have, and refuses to fill them from a name the user actually said ("I don't have a
        //    strategy ID to link"). resolveStrategyId()/resolvePatternIds() in
        //    ai-trade-actions.js already resolve a plain spoken NAME to the real id - they were
        //    always meant to receive the name, never an id the model would have to invent.
        // 2) A well-aligned model, asked to raise risk right after the user described anger and
        //    losses, reasonably tries to be protective ITSELF - it declines to extract
        //    riskPercent at all ("I don't recommend this, I haven't proposed any change"). That
        //    is exactly the "LLM as the rule engine" failure mode the architecture spec warns
        //    against (section 3), just arriving organically instead of through this app's own
        //    code: with nothing ever extracted, ai-proactive-engine.js's real, deterministic
        //    strategy-risk-limit rule never even runs, so the user never gets the real evidence
        //    card or the real, explicit override path - the model's own good intentions silently
        //    pre-empt NAVRYA's real policy layer. The fix is the same kind as (1): tell the model
        //    plainly that extraction and policy are different jobs, and this one is never its job.
        description: 'Plan and create a brand-new Trade (direction, entry, stop, target, risk) via the quick single-screen Calculator - this is the DEFAULT action for creating a Trade from a plain description. "Log a trade"/"open the trade log"/a request for the fuller multi-step log (concept tags, chart note, screenshots) is a DIFFERENT action (trade.wizard) - use that one instead when the user\'s own wording asks for logging/the wizard specifically, never this one. "Open this trade"/"mark it open" about an EXISTING, already-visible Hunting Trade is a third, different action (trade.open, a lifecycle status change) - never this one; use this one whenever no specific existing Trade is already in view and the user has not asked for the log wizard by name. linkedStrategyId/linkedPatternIds: pass the Strategy/Pattern NAME exactly as the user said it (e.g. "Conservative Scalper") - NAVRYA resolves the real id from that name itself; never invent or omit it for lacking a real id. IMPORTANT - riskPercent (and every other field): extraction and safety policy are two different, separate jobs, and enforcing policy is never your job here, even once. Put the exact riskPercent number the user literally typed into the suggestion/fields array on every single turn they state one, with zero exceptions - including a message that also mentions anger, recent losses, or stress in the same breath. NAVRYA itself runs a real, deterministic check on that number after you extract it and will pause for explicit confirmation if it conflicts with anything - that downstream check is the ONLY thing allowed to hold the value back, and it can only do that if you hand the number over first. Silently re-suggesting the OLD value, or leaving the field out of your suggestion, is a bug: it skips NAVRYA own real safety check entirely and is far less safe than extracting the number and letting NAVRYA evaluate it. You may still say in your own reply that you are concerned - just also extract the number.',
        aliases: ['take a long', 'take a short', 'go long', 'go short', 'open a trade', 'start a trade', 'size a trade', 'plan a trade', 'open a position', 'open a long position', 'open a short position'],
        // instrument is required, but a Trade sourced from an active Session is prefilled (and
        // then locked in the UI - see tradeCalculatorModal.jsx) from that session's own real
        // instrument below, in open() - the model is never asked to state it again in that case.
        requiredFields: ['direction', 'entryPrice', 'stopLoss', 'riskPercent', 'takeProfits', 'instrument'],
        optionalFields: ['leverage', 'marginMode', 'accountBalance', 'riskAmount', 'linkedStrategyId', 'linkedPatternIds', 'accountId'],
        available: () => true,
        // Session/Scenario context is inherited here, once, from the real snapshot the workflow
        // engine already passed into start() - never asked for as a chat field (there is nothing
        // for the user to "say" here; see tradeCalculatorModal.jsx's own sourceSessionId/
        // sourceScenarioId state comment). By the time this returns, the calculator's own
        // useLayoutEffect registration has already run (a fresh root's first commit is
        // synchronous - see that file's own comment on the switch from useEffect), so the
        // applyValue() calls below always land on a real, already-registered process.
        open: (context) => {
          window.TradeJournalNavryaTradeCalculator.open();
          var registry = window.TradeJournalAIProcessRegistry;
          var entities = context && context.activeEntities;
          if (registry && entities) {
            if (entities.sessionId) registry.applyValue('trade-calculator', 'sourceSessionId', entities.sessionId, 'replace');
            if (entities.scenarioId) registry.applyValue('trade-calculator', 'sourceScenarioId', entities.scenarioId, 'replace');
            // Instrument Catalog domain: a Trade sourced from a live Session must carry that
            // session's own instrument, never a different one the model separately extracted -
            // prefilled here (then locked read-only in tradeCalculatorModal.jsx) the same way
            // session.scenario.edit's open() already reads a session via window.TradeJournalWorkspace.
            if (entities.sessionId) {
              var sourceSession = window.TradeJournalWorkspace && window.TradeJournalWorkspace.find(entities.sessionId);
              if (sourceSession && sourceSession.instrument) registry.applyValue('trade-calculator', 'instrument', sourceSession.instrument, 'replace');
            }
          }
          // accountsView.jsx's AccountDetail registers 'account-detail-{id}' purely for context
          // while a real account is on screen (same "registered purely so this can be read back"
          // precedent as tradeDetailsModal.jsx's own 'trade-details-{id}') - resolved directly
          // here (context here is ai-context-engine.js's own raw snapshot, which has no concept
          // of an active Account) rather than through ai-context-builder.js, mirroring exactly
          // how resolveActiveIdByPrefix() itself works.
          if (registry && typeof registry.openIdsWithPrefix === 'function') {
            var openAccountIds = registry.openIdsWithPrefix('account-detail-');
            if (openAccountIds.length) registry.applyValue('trade-calculator', 'accountId', openAccountIds[0].slice('account-detail-'.length), 'replace');
          }
        },
        normalizeField: (path, value) => {
          var helpers = window.TradeJournalAITradeActions;
          if (!helpers) return value;
          var strategyStore = window.TradeJournalStrategyEducationStore;
          var patternStore = window.TradeJournalPatternStore;
          var accountsStore = window.TradeJournalAccountsStore;
          var catalogStore = window.TradeJournalInstrumentCatalogStore;
          return helpers.normalizeField(path, value, {
            strategies: strategyStore && typeof strategyStore.listActive === 'function' ? strategyStore.listActive() : [],
            patterns: patternStore && typeof patternStore.listForScenarios === 'function' ? patternStore.listForScenarios() : [],
            accounts: accountsStore && typeof accountsStore.listActive === 'function' ? accountsStore.listActive() : [],
            instrumentCatalog: catalogStore && typeof catalogStore.listSync === 'function' ? catalogStore.listSync() : []
          });
        },
        // Delegates straight to the calculator's own registered submit() (see
        // tradeCalculatorModal.jsx) via the exact same TradeJournalAIProcessRegistry.submit()
        // Journey A's session.create already uses - builds the trade through
        // applyCalculatedToTrade()/tradeStore.save(), the same real persistence path the
        // "Register Trade" button uses, never a parallel one.
        submit: () => window.TradeJournalAIProcessRegistry && window.TradeJournalAIProcessRegistry.submit('trade-calculator'),
        // trade-open-positions.js already listens for tradeStore.save()'s own
        // tradejournal:trades-changed event, so the Open Positions panel refreshes on its own -
        // this only navigates the user to see the trade they just described, the same "land in
        // the result" precedent session.create's own resultContext already set.
        resultContext: (trade) => { if (trade && trade.id && window.TradeJournalNavryaTradeDetails) window.TradeJournalNavryaTradeDetails.open(trade.id); }
      });
    }

    // Journey H1: closes a confirmed gap - tradeLogModal.jsx's own real 'trade-wizard' process
    // registration (allowlist + live field-fill) has existed since Journey B, but had no submit()
    // and no Action Registry entry at all, so Voice could never OPEN the real "Log a trade" wizard
    // (dashboardView.jsx's own real button, t('logTrade') - a fuller, multi-step logging flow with
    // concept tags/chart note/emotions/screenshots) or complete it, only fill fields into one a
    // human had already opened by hand. Deliberately a SEPARATE action from trade.calculator, not
    // a merged/ambiguous one - both are real, distinct, human-clickable entry points
    // (dashboardView.jsx's "Log a trade" vs "Calculator" buttons) for the same underlying "create a
    // Trade" outcome; aliases below are narrowly scoped to logging/wizard-specific phrasing so the
    // two never compete for the same plain "go long"/"plan a trade" utterance (see
    // trade.calculator's own updated description above).
    if (window.TradeJournalAIActionRegistry) {
      window.TradeJournalAIActionRegistry.registerAction({
        id: 'trade.wizard', domain: 'trades', riskLevel: 'medium',
        description: 'Open the real, full multi-step "Log a trade" wizard (status, timeframes/trends, concept tags + chart note, emotions, screenshots) and log a brand-new Trade through it - use this ONLY when the user\'s own wording explicitly asks to "log" a trade, open the trade log/wizard, or otherwise wants the fuller step-by-step flow rather than a quick calculator. For a plain "go long"/"plan a trade"/"size a trade" request with no mention of logging/the wizard, use trade.calculator instead. accountId/instrument live in a persistent header shown on every step, not one specific step.',
        aliases: ['log a trade', 'log this trade', 'open the trade log', 'open the log wizard', 'start the trade wizard'],
        requiredFields: ['direction', 'instrument'],
        optionalFields: (window.TradeJournalTradeTypes && window.TradeJournalTradeTypes.tradeWizardPaths ? window.TradeJournalTradeTypes.tradeWizardPaths : []).filter((f) => f !== 'direction' && f !== 'instrument'),
        available: () => true,
        open: (context, initialFields) => new Promise((resolve) => {
          var seed = {};
          var entities = context && context.activeEntities;
          if (entities && entities.sessionId) seed.source = { sessionId: entities.sessionId };
          window.TradeJournalNavryaTradeLog.open(seed, {});
          var registry = window.TradeJournalAIProcessRegistry;
          pollFor(
            () => registry && registry.query('trade-wizard').open,
            () => resolve({ processId: 'trade-wizard' }),
            () => resolve(null) // the real wizard never actually mounted/registered (unexpected)
          );
        }),
        // registry.submit() delegates to tradeLogModal.jsx's own finish() (see that registration's
        // own comment) - the exact same real save path the wizard's own "Register" button calls.
        submit: () => window.TradeJournalAIProcessRegistry && window.TradeJournalAIProcessRegistry.submit('trade-wizard'),
        resultContext: (trade) => { if (trade && trade.id && window.TradeJournalNavryaTradeDetails) window.TradeJournalNavryaTradeDetails.open(trade.id); }
      });
    }

    // AI Action Registry (Journey D): "take me to the Dashboard" and similar navigation-from-
    // knowledge requests. Reuses the exact same real navigation primitives the sidebar/reward
    // widget/account-profile hash router already use themselves - store.setActiveId() for the
    // three React "canvas" views (dashboard/strategies/settings) + sessions, location.hash for
    // the hash-routed pages (psychology/ai-assistant/community/account, exactly like store.js's
    // own hashById map and the reward widget's own onRewardOpen already do) - never a new,
    // separate "AI navigation" mechanism, and never arbitrary DOM mutation.
    //
    // domainId values are intentionally exactly the real ai-knowledge-registry.js domain ids that
    // actually have ONE real, single navigable page today - "reports" (legacy/unreachable from
    // current navigation), "trade-planning" (no single page - genuinely cross-cutting across three
    // real surfaces) and "character" (switching the active character is done from Settings, not a
    // page of its own) are deliberately excluded, matching those domains' own honestly-documented
    // gaps rather than inventing a target for them. "patterns" lands on the same Strategies Hub
    // page as "strategies" - its own tab is not a separately hash-addressable route today.
    //
    // The untouched, protected Workflow Engine always drives a submit through a real, registered
    // TradeJournalAIProcessRegistry process (its own applyValue()/query() both key off one) -
    // navigate.to has no fillable form of its own, so it registers the thinnest possible real
    // process purely so the engine's own liveness check (isOpen()) has something real to read:
    // "open" exactly while THIS workflow is the current one, never permanently. A permanently-open
    // registration would make activeOpenProcess() wrongly report something open on every future
    // turn, silently disabling Journey A/B's own action discovery for the rest of the session -
    // found by reading ai-workflow-engine.js's own scheduleSubmit()/pruneIfAbandoned() liveness
    // checks before writing this, not by trial and error in the browser.
    //
    // ai-workflow-engine.js's own submit-grace window (SUBMIT_GRACE_MS, ~3s in production) applies
    // here exactly like every other AI action - a real, small, honestly-disclosed UX cost (a brief
    // pause before the app actually navigates), not a special case carved out of that protected,
    // untouched engine.
    var NAVIGATE_TARGETS = {
      dashboard: () => store.setActiveId('dashboard'),
      sessions: () => store.setActiveId('sessions'),
      accounts: () => store.setActiveId('accounts'),
      strategies: () => store.setActiveId('strategies'),
      patterns: () => store.setActiveId('strategies'),
      settings: () => store.setActiveId('settings'),
      psychology: () => store.setActiveId('psychology'),
      'ai-assistant': () => store.setActiveId('ai-assistant'),
      community: () => store.setActiveId('community'),
      account: () => { location.hash = '#account/profile'; }
    };
    var NAVIGATE_ALIASES = {
      home: 'dashboard', main: 'dashboard',
      session: 'sessions', trading: 'sessions',
      'prop-firm': 'accounts', propfirm: 'accounts', wallet: 'accounts',
      strategy: 'strategies', pattern: 'patterns',
      setting: 'settings', preferences: 'settings',
      mindset: 'psychology', mental: 'psychology',
      assistant: 'ai-assistant', aisettings: 'ai-assistant', ai: 'ai-assistant',
      profile: 'account', subscription: 'account', subscriptions: 'account'
    };
    function normalizeNavigateDomainId(raw) {
      var key = String(raw || '').trim().toLowerCase().replace(/\s+/g, '');
      if (NAVIGATE_TARGETS[key]) return key;
      return NAVIGATE_ALIASES[key] || null;
    }
    if (window.TradeJournalAIProcessRegistry) {
      window.TradeJournalAIProcessRegistry.register('navigate-to', {
        allowlist: ['domainId'],
        isOpen: () => {
          var workflowEngine = window.TradeJournalAIWorkflowEngine;
          var wf = workflowEngine && workflowEngine.current();
          return !!(wf && wf.actionId === 'navigate.to');
        },
        // No live-fillable form exists to reflect a value onto while collecting - the real effect
        // happens exactly once, in submit() below. TradeJournalAIProcessRegistry.register()'s own
        // default no-op would cover this identically; kept explicit here for the same reason the
        // comment above exists at all.
        applyValue: () => {}
      });
    }
    if (window.TradeJournalAIActionRegistry) {
      window.TradeJournalAIActionRegistry.registerAction({
        id: 'navigate.to', domain: 'navigation', riskLevel: 'low',
        description: 'Navigate to a real page/section of NAVRYA. Valid domainId values: dashboard, sessions, accounts, strategies, patterns, settings, psychology, ai-assistant, community, account. "accounts" is the prop-firm/personal trading Accounts ledger; "account" (singular) is the user\'s own profile/subscription page - do not confuse the two. There is no single dedicated page for "reports"/"trading calendar" (legacy, unreachable from current navigation), "trade-planning"/"open positions" (spans three real surfaces, not one page), or "character" (switching the active character is done from Settings) - if asked to go to one of those, say plainly that no such page exists rather than calling this action.',
        aliases: ['take me to', 'go to', 'navigate to', 'open the', 'show me the'],
        requiredFields: ['domainId'], optionalFields: [],
        available: () => true,
        normalizeField: (path, value) => path === 'domainId' ? normalizeNavigateDomainId(value) : value,
        submit: (known) => {
          var target = NAVIGATE_TARGETS[known.domainId];
          if (!target) return { navigated: false, domainId: known.domainId };
          target();
          return { navigated: true, domainId: known.domainId };
        },
        resultContext: () => {}
      });
    }

    // Journey F, first vertical slice: "Create a Pattern." Unlike session.create/trade.calculator,
    // Pattern creation has no separate "submit" moment - PatternStore.create() (called inside
    // open(), via strategiesHubView.jsx's own window.TradeJournalNavryaPatternHub hook) persists a
    // real Pattern immediately and returns its real id; everything after that is a normal live
    // edit of an already-existing record through its own already-registered 'pattern-editor-{id}'
    // process (see that file's PatternDetailsTab). open() reports that real dynamic process id
    // back via ai-workflow-engine.js's own open()-return convention (see that file's comment on
    // why applyKnownFields() resolves it lazily rather than start() awaiting it). submit()/
    // resultContext() are deliberately close to no-ops: the record already exists and is already
    // visible the moment open() resolves.
    //
    // Two separate things have to be waited for, found via real browser testing (the first
    // attempt applied 'name' to nothing and silently lost it): (1) the Strategies Hub itself may
    // not be mounted yet (a per-view React root, unmounted while any other page is showing - see
    // canvasApp.jsx) - waited for via its own window hook; (2) creating the Pattern only sets React
    // state (setTab/openItem) - PatternDetailsTab does not actually MOUNT and run its own
    // registration effect until React commits that state change and runs effects afterward, which
    // is asynchronous relative to the synchronous hub.createNew() call. Resolving open() the
    // instant hub.createNew() returns raced ai-workflow-engine.js's very next applyKnownFields()
    // call against that not-yet-existing registration - the field values were sent to
    // TradeJournalAIProcessRegistry.applyValue() for a process id nothing was listening on yet, so
    // they were silently dropped. open() now also polls TradeJournalAIProcessRegistry.query() for
    // the real registration to actually exist before resolving.
    // Shared by pattern.create and pattern.edit below: waits for something to become truthy
    // (a window hook mounting, a process finishing registration), polling rather than assuming
    // either already exists - found necessary via real browser testing, see pattern.create's own
    // comment for exactly which two race conditions this closes.
    function pollFor(check, onReady, onGiveUp) {
      var attempts = 0;
      var poll = setInterval(() => {
        attempts += 1;
        var value = check();
        if (value) { clearInterval(poll); onReady(value); }
        else if (attempts > 40) { clearInterval(poll); onGiveUp(); } // ~2s at 50ms
      }, 50);
    }

    if (window.TradeJournalAIActionRegistry) {
      window.TradeJournalAIActionRegistry.registerAction({
        id: 'pattern.create', domain: 'patterns', riskLevel: 'low', entityAlreadyPersisted: true,
        description: 'Create a new market Pattern definition in NAVRYA (name, optional description, optional completion threshold percentage from 0 to 100). instruments (required) is one or more real, exact instrument codes from the user\'s own Instrument Catalog (e.g. XAUUSD, BTCUSDT) this pattern applies to - never a guessed/aliased symbol, and never invented if the user has not actually named one. Opens the real Pattern editor immediately once at least one instrument is resolved.',
        aliases: ['create a pattern', 'new pattern', 'make a pattern', 'add a pattern', 'create a new pattern', 'define a pattern'],
        requiredFields: ['instruments'], optionalFields: ['name', 'description', 'completionThreshold'],
        available: () => true,
        // Deliberately requires instruments on the SAME turn the action is selected (same
        // "F53: resolve now, from what was actually said this turn, never guess" contract as
        // pattern.edit's own patternName below) - a brand-new pattern can no longer be persisted
        // blank-then-filled-in for this one field, so there is nothing real to create yet if no
        // instrument resolved. This action's own description steers the model to ask which
        // instrument(s) first instead of guessing.
        open: (context, initialFields) => new Promise((resolve) => {
          var instrumentsField = (initialFields || []).filter((f) => f && f.path === 'instruments')[0];
          var helpers = window.TradeJournalAITradeActions;
          var catalogStore = window.TradeJournalInstrumentCatalogStore;
          var catalog = catalogStore && typeof catalogStore.listSync === 'function' ? catalogStore.listSync() : [];
          var instruments = helpers && instrumentsField ? helpers.resolveInstruments(instrumentsField.value, catalog) : [];
          if (!instruments.length) { resolve(null); return; }
          if (store.getState().activeId !== 'strategies') store.setActiveId('strategies');
          pollFor(
            () => window.TradeJournalNavryaPatternHub,
            (hub) => {
              var created = hub.createNew(instruments);
              if (!created || !created.id) { resolve(null); return; }
              var processId = 'pattern-editor-' + created.id;
              var registry = window.TradeJournalAIProcessRegistry;
              pollFor(
                () => registry && registry.query(processId).open,
                () => resolve({ processId }),
                () => resolve(null) // the real editor never actually mounted/registered (unexpected)
              );
            },
            () => resolve(null) // the Strategies Hub never mounted (unexpected)
          );
        }),
        submit: () => undefined,
        resultContext: () => {}
      });
    }

    // Journey F, second slice: "Edit the Liquidity Sweep pattern's threshold to 85%." Unlike
    // pattern.create, there is no new entity to make - the real target is an EXISTING Pattern that
    // must first be RESOLVED by name (F53: never guess). `patternName` is a resolution-only field,
    // never applied to the real UI (it isn't on 'pattern-editor-{id}''s own allowlist in
    // pattern-registry.types.js, so a harmless no-op even if it were ever pushed) - it exists only
    // so open() knows which real Pattern to open. Deliberately requires patternName on the SAME
    // turn the action is selected (ai-workflow-engine.js's start() now passes this turn's own
    // extracted fields straight through to open() for exactly this reason) rather than trying to
    // resolve it across a later turn once a workflow is already active: this action's own
    // description steers the model to ask "which Pattern?" in plain conversation first if it
    // doesn't yet have a name, the same as it already would for any other missing required field
    // it doesn't attempt an action without.
    if (window.TradeJournalAIActionRegistry) {
      window.TradeJournalAIActionRegistry.registerAction({
        id: 'pattern.edit', domain: 'patterns', riskLevel: 'low', entityAlreadyPersisted: true,
        description: 'Open an EXISTING market Pattern by name so its name, description, completion threshold percentage (0-100), or instrument list can be edited. patternName identifies which existing Pattern to open - it is never a rename. instruments, if the user asks to change which instruments this pattern applies to, must be real, exact codes from the user\'s own Instrument Catalog - never guessed. Only select this action once the user has actually named which existing Pattern they mean; if they have not, ask them which Pattern first instead of guessing.',
        aliases: ['edit a pattern', 'edit the pattern', 'update a pattern', 'change the pattern', 'open the pattern'],
        requiredFields: ['patternName'], optionalFields: ['name', 'description', 'completionThreshold', 'instruments'],
        available: () => true,
        normalizeField: (path, value) => {
          if (path !== 'instruments') return value;
          var helpers = window.TradeJournalAITradeActions;
          var catalogStore = window.TradeJournalInstrumentCatalogStore;
          if (!helpers) return [];
          return helpers.resolveInstruments(value, catalogStore && typeof catalogStore.listSync === 'function' ? catalogStore.listSync() : []);
        },
        open: (context, initialFields) => new Promise((resolve) => {
          var nameField = (initialFields || []).filter((f) => f && f.path === 'patternName')[0];
          var patternName = nameField ? String(nameField.value == null ? '' : nameField.value).trim() : '';
          if (!patternName) { resolve(null); return; } // nothing to resolve yet - see this action's own description
          var store2 = window.TradeJournalPatternStore;
          var patterns = store2 ? store2.listSync() : [];
          var matches = patterns.filter((p) => String(p.name || '').trim().toLowerCase() === patternName.toLowerCase());
          if (matches.length !== 1) { resolve(null); return; } // zero or ambiguous - never guess (F53)
          var target = matches[0];
          if (store.getState().activeId !== 'strategies') store.setActiveId('strategies');
          pollFor(
            () => window.TradeJournalNavryaPatternHub,
            (hub) => {
              hub.openExisting(target.id);
              var processId = 'pattern-editor-' + target.id;
              var registry = window.TradeJournalAIProcessRegistry;
              pollFor(
                () => registry && registry.query(processId).open,
                () => resolve({ processId }),
                () => resolve(null) // the real editor never actually mounted/registered (unexpected)
              );
            },
            () => resolve(null) // the Strategies Hub never mounted (unexpected)
          );
        }),
        submit: () => undefined,
        resultContext: () => {}
      });
    }

    // Journey F, F15: Strategy creation/editing, the same shape as pattern.create/pattern.edit
    // above (real fields, real allowlist - see strategy-education.types.js's own textPaths/
    // numericPaths, extended with 'name' by strategiesHubView.jsx's own registration effect).
    var STRATEGY_FIELDS = [
      'positionManagement.entryRules', 'positionManagement.stopLossRules', 'positionManagement.exitTargetRules', 'positionManagement.positionSizingRules', 'positionManagement.freeNotes',
      'riskManagement.maxRiskPerTradePercent', 'riskManagement.dailyDrawdownLimitPercent', 'riskManagement.totalDrawdownLimitPercent', 'riskManagement.maxConcurrentTrades', 'riskManagement.maxProfitCapPerTrade', 'riskManagement.freeNotes',
      'overallFramework.description'
    ];
    if (window.TradeJournalAIActionRegistry) {
      window.TradeJournalAIActionRegistry.registerAction({
        id: 'strategy.create', domain: 'strategies', riskLevel: 'low', entityAlreadyPersisted: true,
        description: 'Create a new trading Strategy definition in NAVRYA (name, and optionally its entry/stop/exit/sizing rules, risk management limits like max risk per trade percent/max concurrent trades/drawdown limits, and overall framework description). Opens the real Strategy editor immediately.',
        aliases: ['create a strategy', 'new strategy', 'make a strategy', 'add a strategy', 'create a new strategy', 'define a strategy'],
        requiredFields: ['name'], optionalFields: STRATEGY_FIELDS,
        available: () => true,
        open: () => new Promise((resolve) => {
          if (store.getState().activeId !== 'strategies') store.setActiveId('strategies');
          pollFor(
            () => window.TradeJournalNavryaStrategyHub,
            (hub) => {
              var created = hub.createNew();
              if (!created || !created.id) { resolve(null); return; }
              var processId = 'strategy-editor-' + created.id;
              var registry = window.TradeJournalAIProcessRegistry;
              pollFor(
                () => registry && registry.query(processId).open,
                () => resolve({ processId }),
                () => resolve(null) // the real editor never actually mounted/registered (unexpected)
              );
            },
            () => resolve(null) // the Strategies Hub never mounted (unexpected)
          );
        }),
        submit: () => undefined,
        resultContext: () => {}
      });

      // Mirrors pattern.edit exactly: strategyName is resolution-only (never applied to the real
      // UI - it isn't on the real allowlist above), exact case-insensitive match, never guess
      // (F53) - zero or ambiguous matches resolve nothing rather than picking one.
      window.TradeJournalAIActionRegistry.registerAction({
        id: 'strategy.edit', domain: 'strategies', riskLevel: 'low', entityAlreadyPersisted: true,
        description: 'Open an EXISTING Strategy by name so its rules can be edited: entry/stop/exit/sizing rules, risk management limits (max risk per trade percent, max concurrent trades, drawdown limits, max profit cap), or overall framework description. strategyName identifies which existing Strategy to open - it is never a rename (use "name" for that). Only select this action once the user has actually named which existing Strategy they mean; if they have not, ask them which Strategy first instead of guessing. Editing a Strategy\'s own maxRiskPerTradePercent is not the same as a Trade\'s own risk override - never confuse the two.',
        aliases: ['edit a strategy', 'edit the strategy', 'update a strategy', 'change the strategy', 'open the strategy'],
        requiredFields: ['strategyName'], optionalFields: ['name'].concat(STRATEGY_FIELDS),
        available: () => true,
        open: (context, initialFields) => new Promise((resolve) => {
          var nameField = (initialFields || []).filter((f) => f && f.path === 'strategyName')[0];
          var strategyName = nameField ? String(nameField.value == null ? '' : nameField.value).trim() : '';
          if (!strategyName) { resolve(null); return; } // nothing to resolve yet - see this action's own description
          var store2 = window.TradeJournalStrategyEducationStore;
          var strategies = store2 ? store2.listSync() : [];
          var matches = strategies.filter((s) => String(s.name || '').trim().toLowerCase() === strategyName.toLowerCase());
          if (matches.length !== 1) { resolve(null); return; } // zero or ambiguous - never guess (F53)
          var target = matches[0];
          if (store.getState().activeId !== 'strategies') store.setActiveId('strategies');
          pollFor(
            () => window.TradeJournalNavryaStrategyHub,
            (hub) => {
              hub.openExisting(target.id);
              var processId = 'strategy-editor-' + target.id;
              var registry = window.TradeJournalAIProcessRegistry;
              pollFor(
                () => registry && registry.query(processId).open,
                () => resolve({ processId }),
                () => resolve(null) // the real editor never actually mounted/registered (unexpected)
              );
            },
            () => resolve(null) // the Strategies Hub never mounted (unexpected)
          );
        }),
        submit: () => undefined,
        resultContext: () => {}
      });
    }

    // Accounts domain (prop-firm/personal trading accounts - navrya-src/accountsView.jsx).
    // account.create/account.edit mirror pattern.create/pattern.edit's shape (poll for the real
    // hub, open a real visible form, poll for that form's own process registration) with one
    // deliberate difference: neither ever declares/forwards a `submit`. accounts-view.jsx's
    // ManualAccountModal registers 'account-manual-form' with no `submit` of its own, so
    // TradeJournalAIProcessRegistry.submit('account-manual-form') is always a safe no-op - only
    // the human clicking "Create account"/"Save changes" in that visible form ever calls
    // window.TradeJournalAccountsStore.save(). Matches the product brief precisely: "AI can fill
    // a visible form but cannot silently save, archive, delete, bypass risk controls, or claim a
    // rule is satisfied."
    if (window.TradeJournalAIActionRegistry) {
      var ACCOUNT_FIELDS = (window.TradeJournalAccountsTypes && window.TradeJournalAccountsTypes.manualAccountPaths) || [];
      window.TradeJournalAIActionRegistry.registerAction({
        id: 'account.create', domain: 'accounts', riskLevel: 'low',
        description: 'Open the real "create account" form for a new prop-firm or personal trading Account (this is the Accounts ledger - distinct from the user\'s own profile, see navigate.to). Every account here is manual - NAVRYA has no live broker/prop-firm connection, so this only opens the visible form and fills the fields you are given; the account itself is never created until the human clicks "Create account" themselves, even once every field is filled.',
        aliases: ['create an account', 'new account', 'add an account', 'create a prop account', 'add a personal account', 'set up a trading account'],
        requiredFields: [], optionalFields: ACCOUNT_FIELDS,
        available: () => true,
        open: () => new Promise((resolve) => {
          if (store.getState().activeId !== 'accounts') store.setActiveId('accounts');
          pollFor(
            () => window.TradeJournalNavryaAccountsHub,
            (hub) => {
              hub.createNew();
              var registry = window.TradeJournalAIProcessRegistry;
              pollFor(
                () => registry && registry.query('account-manual-form').open,
                () => resolve({ processId: 'account-manual-form' }),
                () => resolve(null)
              );
            },
            () => resolve(null)
          );
        }),
        submit: () => undefined,
        resultContext: () => {}
      });

      // Mirrors pattern.edit/strategy.edit: accountName is resolution-only (never applied to the
      // real form), and resolution goes through ai-trade-actions.js's resolveAccountId() - see
      // that function's own comment on why it is stricter than resolveStrategyId/resolvePatternIds
      // (an account is a real money boundary; an ambiguous name must never be guessed).
      window.TradeJournalAIActionRegistry.registerAction({
        id: 'account.edit', domain: 'accounts', riskLevel: 'low',
        description: 'Open an EXISTING trading Account\'s rules for editing, by its firm/label name. accountName identifies which existing Account to open - it is never a rename. Only select this once the user has actually named which existing Account they mean; if the name is missing, unmatched, or ambiguous, ask which Account first instead of guessing.',
        aliases: ['edit an account', 'edit the account', 'update account rules', 'change the account rules', 'open the account settings'],
        requiredFields: ['accountName'], optionalFields: ACCOUNT_FIELDS,
        available: () => true,
        open: (context, initialFields) => new Promise((resolve) => {
          var nameField = (initialFields || []).filter((f) => f && f.path === 'accountName')[0];
          var accountName = nameField ? String(nameField.value == null ? '' : nameField.value).trim() : '';
          if (!accountName) { resolve(null); return; }
          var accountsStore = window.TradeJournalAccountsStore;
          var helpers = window.TradeJournalAITradeActions;
          var list = accountsStore ? accountsStore.listActive() : [];
          var targetId = helpers ? helpers.resolveAccountId(accountName, list) : null;
          if (!targetId) { resolve(null); return; } // zero or ambiguous - never guess
          if (store.getState().activeId !== 'accounts') store.setActiveId('accounts');
          pollFor(
            () => window.TradeJournalNavryaAccountsHub,
            (hub) => {
              hub.editExisting(targetId);
              var registry = window.TradeJournalAIProcessRegistry;
              pollFor(
                () => registry && registry.query('account-manual-form').open,
                () => resolve({ processId: 'account-manual-form' }),
                () => resolve(null)
              );
            },
            () => resolve(null)
          );
        }),
        submit: () => undefined,
        resultContext: () => {}
      });

      // Pure navigation (open/select an existing Account to view it) - never a mutation, so
      // unlike account.create/account.edit this has no reason to withhold a real effect from
      // open() itself.
      window.TradeJournalAIActionRegistry.registerAction({
        id: 'account.open', domain: 'accounts', riskLevel: 'low',
        description: 'Open an EXISTING trading Account by its firm/label name to view its overview, rules, pre-trade check, performance and behaviour tabs. A real navigation only, never a mutation. accountName identifies which existing Account to open; if the name is missing, unmatched, or ambiguous, ask which Account first instead of guessing.',
        aliases: ['open my account', 'open the account', 'show me my account', 'go to my account', 'view account', 'select account'],
        requiredFields: ['accountName'], optionalFields: [],
        available: () => true,
        open: (context, initialFields) => new Promise((resolve) => {
          var nameField = (initialFields || []).filter((f) => f && f.path === 'accountName')[0];
          var accountName = nameField ? String(nameField.value == null ? '' : nameField.value).trim() : '';
          if (!accountName) { resolve(null); return; }
          var accountsStore = window.TradeJournalAccountsStore;
          var helpers = window.TradeJournalAITradeActions;
          var list = accountsStore ? accountsStore.listActive() : [];
          var targetId = helpers ? helpers.resolveAccountId(accountName, list) : null;
          if (!targetId) { resolve(null); return; } // zero or ambiguous - never guess
          if (store.getState().activeId !== 'accounts') store.setActiveId('accounts');
          pollFor(
            () => window.TradeJournalNavryaAccountsHub,
            (hub) => {
              hub.open(targetId);
              var registry = window.TradeJournalAIProcessRegistry;
              pollFor(
                () => registry && registry.query('account-detail-' + targetId).open,
                () => resolve({ processId: 'account-detail-' + targetId }),
                () => resolve(null)
              );
            },
            () => resolve(null)
          );
        }),
        submit: () => undefined,
        resultContext: () => {}
      });
    }

    // Journey F, F19/F20: Session Entry + Scenario actions. Same real architecture as
    // pattern.create/strategy.create - Action Registry -> Workflow Engine -> Process Registry ->
    // liveSessionView.jsx's own real UI/persistence, never a second AI-to-Session-store path.
    // available() gates every one of these on a real active Session (F5: no active Session, no
    // guessing) - context.activeEntities is ai-context-engine.js's own snapshot() shape.
    if (window.TradeJournalAIActionRegistry) {
      window.TradeJournalAIActionRegistry.registerAction({
        id: 'session.chartEntry.create', domain: 'sessions', riskLevel: 'low', entityAlreadyPersisted: true,
        description: 'Open the real Chart Entry form for the current active trading Session (optionally timeframe, market, date, and a note). A real chart screenshot must still be attached by the user through the real form - this can never auto-complete or fabricate an image. Only available while a Session is actively open.',
        aliases: ['add a chart entry', 'add a chart', 'log a chart entry', 'upload a chart'],
        requiredFields: [], optionalFields: ['timeframe', 'market', 'date', 'note'],
        available: (context) => !!(context && context.activeEntities && context.activeEntities.sessionId),
        open: () => new Promise((resolve) => {
          if (store.getState().activeId !== 'sessions') store.setActiveId('sessions');
          pollFor(
            () => window.TradeJournalNavryaLiveSessionHub,
            (hub) => {
              hub.addChartEntry();
              var registry = window.TradeJournalAIProcessRegistry;
              pollFor(
                () => registry && registry.query('live-session-chart-entry').open,
                () => resolve({ processId: 'live-session-chart-entry' }),
                () => resolve(null)
              );
            },
            () => resolve(null) // the Live Session workspace never mounted (unexpected)
          );
        }),
        submit: () => undefined,
        resultContext: () => {}
      });

      window.TradeJournalAIActionRegistry.registerAction({
        // Deliberately NOT entityAlreadyPersisted, unlike pattern.create/strategy.create/
        // scenario.create - found via real browser testing. Those stay "open" because a
        // deliberate, real UI gesture keeps them so (a modal the user must explicitly close, or a
        // multi-field record naturally filled over several turns) - a Movement Entry's own
        // registration ('live-session-entry-{id}') instead reports itself open merely because it
        // is WHICHEVER entry happens to be currently selected in the timeline, an ambient,
        // passive state with no deliberate "stay focused here" gesture behind it and only one
        // real field (note) worth filling. Keeping this workflow alive indefinitely blocked every
        // later turn from discovering ANY other action at all ("Create a scenario called X" was
        // mis-routed into the still-open entry's own note field instead) - the normal auto-
        // submit-then-clear grace window (the same one session.create/trade.calculator already
        // use) is the correct shape here: a few seconds' room for a quick correction, then the
        // workflow releases control for the next, likely unrelated, turn.
        id: 'session.movementEntry.create', domain: 'sessions', riskLevel: 'low',
        description: 'Add a movement note entry to the current active trading Session. Opens the real entry immediately and fills its note field. Only available while a Session is actively open.',
        aliases: ['add a movement note', 'add a movement entry', 'log a movement', 'add a note'],
        requiredFields: [], optionalFields: ['note'],
        available: (context) => !!(context && context.activeEntities && context.activeEntities.sessionId),
        open: (context) => new Promise((resolve) => {
          if (store.getState().activeId !== 'sessions') store.setActiveId('sessions');
          // Journey F, F21: reuse the currently-selected Entry if it is already a still-empty
          // Movement Entry, instead of unconditionally creating a new one. Found via real browser
          // testing of the exact two-turn pattern the spec requires ("Add a movement entry." then,
          // separately, "Price swept the previous high and rejected."): requiredFields is
          // deliberately empty (see this action's own comment above), so the workflow reaches
          // pending-submit and clears within a few seconds whether or not a note was ever
          // supplied - a delayed follow-up re-triggers fresh discovery of this same action (there
          // is no movementEntry.edit, unlike Scenario's title-resolved edit), and without this
          // check it silently created a SECOND, redundant entry instead of filling the first
          // one's note.
          var sessionId = context && context.activeEntities && context.activeEntities.sessionId;
          var entryId = context && context.activeEntities && context.activeEntities.entryId;
          var session = sessionId && window.TradeJournalWorkspace ? window.TradeJournalWorkspace.find(sessionId) : null;
          var existing = entryId && session ? (session.entries || []).find((e) => e.id === entryId) : null;
          var reuse = existing && existing.type === 'movement' && !existing.movementNote;
          pollFor(
            () => window.TradeJournalNavryaLiveSessionHub,
            (hub) => {
              var created = reuse ? existing : hub.addMovementEntry();
              if (!created || !created.id) { resolve(null); return; }
              var processId = 'live-session-entry-' + created.id;
              var registry = window.TradeJournalAIProcessRegistry;
              pollFor(
                () => registry && registry.query(processId).open,
                () => resolve({ processId }),
                () => resolve(null)
              );
            },
            () => resolve(null) // the Live Session workspace never mounted (unexpected)
          );
        }),
        submit: () => undefined,
        resultContext: () => {}
      });

      // AI-access follow-up: the user's own AI Analysis feature (sessionAiAnalysisModal.jsx ->
      // POST /api/sessions/analyze) had no Action Registry action at all - reachable only via 3
      // manual button clicks inside Live Session. No required/optional fields at all (unlike
      // chartEntry/movementEntry above) - this always targets the session's own latest chart
      // entry with an image, the exact same default sessionAiAnalysisModal.jsx already falls back
      // to when opened with no pinned entry. entityAlreadyPersisted:true because the result modal
      // stays open showing the analysis until explicitly closed, same reasoning as chartEntry.create.
      window.TradeJournalAIActionRegistry.registerAction({
        id: 'session.analysis.run', domain: 'sessions', riskLevel: 'low', entityAlreadyPersisted: true,
        description: 'Run the real AI Analysis on the current active trading Session\'s most recent chart entry - the same operation the in-app "AI analysis" button performs (a market thesis, key observations, and scenario watch items). This is a real analysis call and may take several seconds. Only available while a Session is actively open with at least one chart entry that has an image attached.',
        aliases: ['run ai analysis', 'analyze the chart', 'analyze this session', 'analyze the market', 'what does the ai think'],
        requiredFields: [], optionalFields: [],
        available: (context) => {
          var sessionId = context && context.activeEntities && context.activeEntities.sessionId;
          var session = sessionId && window.TradeJournalWorkspace ? window.TradeJournalWorkspace.find(sessionId) : null;
          return !!(session && (session.entries || []).some((e) => e.type === 'chart' && (e.hasImage || e.preview || e.imageBlobId)));
        },
        open: () => { if (store.getState().activeId !== 'sessions') store.setActiveId('sessions'); },
        submit: () => new Promise((resolve) => {
          pollFor(
            () => window.TradeJournalNavryaLiveSessionHub,
            (hub) => { hub.runAiAnalysis().then(resolve).catch(() => resolve(null)); },
            () => resolve(null) // the Live Session workspace never mounted (unexpected)
          );
        }),
        resultContext: () => {}
      });

      // 2026-08-28 bug report: the real Pre-Session Check-In popup (preSessionCheckInModal.jsx)
      // shows itself as a precondition before session.movementEntry.create's/
      // session.scenario.create's own target UI ever opens - reactive, opened by app code
      // directly, never by an action's own open(). Standalone fallback ONLY: while it is showing
      // with an AI workflow already in flight (the common case - the user asked to add an entry,
      // and this popup interrupted that), preSessionCheckInModal.jsx's own mount effect calls
      // ai-workflow-engine.js's retargetOrStart() directly, pointing the SAME already-in-flight
      // workflow at this popup rather than starting a second, competing one - this action exists
      // only for retargetOrStart()'s OTHER case, when nothing was already in flight (a human's
      // own manual click opened the popup with no AI involvement yet). available() is gated
      // strictly on the popup already being open - this action can never summon it.
      window.TradeJournalAIActionRegistry.registerAction({
        id: 'session.preSessionCheckIn.fill', domain: 'sessions', riskLevel: 'low', entityAlreadyPersisted: true,
        description: 'Fill the real, already-open Pre-Session Check-In popup (sleep quality, current stress level, a significant personal event) with what the user explicitly states. This popup only ever appears on its own, as a real precondition before the first entry of a Session - never open it yourself; only use this action while it is already showing.',
        aliases: [],
        requiredFields: [], optionalFields: ['sleepQuality', 'currentStressLevel', 'significantPersonalEvent'],
        available: () => { var registry = window.TradeJournalAIProcessRegistry; return !!(registry && registry.query('mh-pre-session-checkin').open); },
        open: () => Promise.resolve({ processId: 'mh-pre-session-checkin' }),
        submit: () => undefined,
        resultContext: () => {}
      });

      window.TradeJournalAIActionRegistry.registerAction({
        // Deliberately NOT entityAlreadyPersisted, unlike pattern.create/strategy.create - found
        // via real browser testing. chat-dock-core.js's own activeProcess resolution already, and
        // deliberately, treats every 'live-session-scenario-{id}' registration as passive (never
        // "something open" there at all - see that file's own comment, added for Journey B's
        // "start a Trade from this Scenario" discovery), so the workflow-continuation branch this
        // flag exists to keep alive for can structurally never fire for a Scenario in the first
        // place - keeping the workflow around anyway only blocked ALL further action discovery
        // (a later "Add X to the evidence" got silently swallowed) for no benefit. A follow-up
        // edit instead goes through fresh re-discovery of session.scenario.edit, resolved by
        // title from conversation history - the exact same real, already-proven mechanism
        // pattern.edit/strategy.edit already use for "the Pattern I don't yet have a name for".
        id: 'session.scenario.create', domain: 'sessions', riskLevel: 'low',
        // 2026-08-28 bug report: probability/invalidationNote/invalidationTags were never
        // AI-fillable at all (an earlier, deliberate decision to keep probability human-only -
        // explicitly reversed now per the user's own request). probability must still only ever
        // be the EXACT percentage the user explicitly states - never inferred/estimated from
        // their confidence, tone, or wording, the same "never guess" rule every other numeric
        // AI-fillable field in this app already follows.
        description: 'Create a new Scenario (title, and optionally description, evidence, problem, trigger, probability, invalidationNote, invalidationTags) inside the active trading Session, attached to its currently selected Entry. patternName links it to an existing Pattern by name. probability is 0-100 and must only be the exact percentage the user explicitly states - never inferred from confidence/tone. invalidationTags are the real, specific conditions that would invalidate this Scenario (comma-separate more than one) - never invented.',
        aliases: ['create a scenario', 'add a scenario', 'new scenario', 'create a new scenario'],
        requiredFields: ['title'], optionalFields: ['description', 'evidence', 'problem', 'trigger', 'patternName', 'probability', 'invalidationNote', 'invalidationTags'],
        available: (context) => !!(context && context.activeEntities && context.activeEntities.sessionId && context.activeEntities.entryId),
        open: (context) => new Promise((resolve) => {
          var entryId = context && context.activeEntities && context.activeEntities.entryId;
          if (!entryId) { resolve(null); return; }
          if (store.getState().activeId !== 'sessions') store.setActiveId('sessions');
          pollFor(
            () => window.TradeJournalNavryaLiveSessionHub,
            (hub) => {
              var created = hub.addScenarioToEntry(entryId);
              if (!created || !created.id) { resolve(null); return; }
              var processId = 'live-session-scenario-' + created.id;
              var registry = window.TradeJournalAIProcessRegistry;
              pollFor(
                () => registry && registry.query(processId).open,
                () => resolve({ processId }),
                () => resolve(null)
              );
            },
            () => resolve(null) // the Live Session workspace never mounted (unexpected)
          );
        }),
        submit: () => undefined,
        resultContext: () => {}
      });

      // Mirrors pattern.edit/strategy.edit: scenarioTitle is resolution-only, exact case-
      // insensitive match, never guessed (F53) - and, per F15 (Journey F "zero stale entity
      // leakage between Sessions"), scoped to the CURRENT active Session's own scenarios only,
      // never a cross-Session search.
      //
      // 2026-08-28 bug report: real production testing found that continuing to fill a Scenario
      // ACROSS SEPARATE TURNS ("create a scenario" ... then, later, "set the title to X and the
      // description to Y") never actually worked - session.scenario.create is deliberately
      // single-shot (see its own comment above), so a follow-up turn has no live workflow to
      // continue, and this action's own scenarioTitle requirement had NOTHING for the model to
      // resolve by: a just-created Scenario still carries its untouched default title ("New
      // scenario"), not yet the real name the user is IN THE PROCESS of dictating. Confirmed
      // live: the model correctly refused to guess a scenarioTitle (exactly as this action's own
      // description told it to) and gave up, offering the user manual entry instead - a real,
      // previously-unexercised gap, not a regression from any of today's other fixes.
      //
      // scenarioTitle now becomes optional: when omitted, resolves the Scenario the user is
      // CURRENTLY looking at - context.activeEntities.scenarioId, ai-context-engine.js's own
      // activeScenarioId() (the topmost open 'live-session-scenario-{id}' registration, the exact
      // same real "currently open" signal Journey B's own "start a Trade from this Scenario"
      // already trusts) - never a guess across Sessions/Entries. scenarioTitle is still there,
      // unchanged, for the genuinely different case: naming an EXISTING, already-titled Scenario
      // the user is not currently looking at.
      window.TradeJournalAIActionRegistry.registerAction({
        // Also deliberately NOT entityAlreadyPersisted - same reasoning as session.scenario.create
        // above. Every edit turn re-resolves fresh; there is nothing useful a kept-alive workflow
        // would add here since the continuation branch can never reach it anyway.
        id: 'session.scenario.edit', domain: 'sessions', riskLevel: 'low',
        // 2026-08-28 bug report: probability/invalidationNote/invalidationTags added (see
        // session.scenario.create's own comment above on why probability is no longer
        // human-only) - this is also how an ALREADY-SET probability gets genuinely changed
        // later (e.g. "actually, make it 70%"), the same real append-a-new-history-entry write
        // the manual slider itself performs, never blocked from re-setting an existing value.
        description: 'Continue filling/editing a Scenario in the active trading Session (title, description, evidence, problem, trigger, probability, invalidationNote, invalidationTags, or its Pattern link via patternName) - including CHANGING a value already set (e.g. "actually make the probability 70%"), never just filling blanks once. Most commonly this is the Scenario the user is CURRENTLY looking at (its card is already open, e.g. right after session.scenario.create, or across several follow-up turns while dictating its fields one at a time) - leave scenarioTitle unset for that, it resolves automatically. Only set scenarioTitle to open a DIFFERENT, already-named Scenario the user explicitly names that is not the one currently open. probability is 0-100 and must only be the exact percentage the user explicitly states - never inferred from confidence/tone. invalidationTags are the real, specific conditions that would invalidate this Scenario (comma-separate more than one) - never invented.',
        aliases: ['edit a scenario', 'edit the scenario', 'update a scenario', 'change the scenario', 'open the scenario', 'fill in the scenario', 'continue the scenario'],
        requiredFields: [], optionalFields: ['scenarioTitle', 'title', 'description', 'evidence', 'problem', 'trigger', 'patternName', 'probability', 'invalidationNote', 'invalidationTags'],
        available: (context) => !!(context && context.activeEntities && context.activeEntities.sessionId),
        open: (context, initialFields) => new Promise((resolve) => {
          var sessionId = context && context.activeEntities && context.activeEntities.sessionId;
          if (!sessionId) { resolve(null); return; }
          var session = window.TradeJournalWorkspace ? window.TradeJournalWorkspace.find(sessionId) : null;
          if (!session) { resolve(null); return; }
          var flat = (session.entries || []).reduce((all, entry) => all.concat((entry.scenarios || []).map((sc) => sc)), []);
          var titleField = (initialFields || []).filter((f) => f && f.path === 'scenarioTitle')[0];
          var wanted = titleField ? String(titleField.value == null ? '' : titleField.value).trim() : '';
          var target;
          if (wanted) {
            var matches = flat.filter((sc) => String(sc.title || '').trim().toLowerCase() === wanted.toLowerCase());
            if (matches.length !== 1) { resolve(null); return; } // zero or ambiguous - never guess (F53)
            target = matches[0];
          } else {
            var activeScenarioId = context && context.activeEntities && context.activeEntities.scenarioId;
            if (!activeScenarioId) { resolve(null); return; } // no name given AND nothing currently open - never a guess
            target = flat.find((sc) => sc.id === activeScenarioId);
            if (!target) { resolve(null); return; }
          }
          if (store.getState().activeId !== 'sessions') store.setActiveId('sessions');
          pollFor(
            () => window.TradeJournalNavryaLiveSessionHub,
            (hub) => {
              if (!hub.openScenario(target.id)) { resolve(null); return; }
              var processId = 'live-session-scenario-' + target.id;
              var registry = window.TradeJournalAIProcessRegistry;
              pollFor(
                () => registry && registry.query(processId).open,
                () => resolve({ processId }),
                () => resolve(null) // the target Scenario's own card never actually mounted/registered (unexpected)
              );
            },
            () => resolve(null) // the Live Session workspace never mounted (unexpected)
          );
        }),
        submit: () => undefined,
        resultContext: () => {}
      });
    }

    // Journey F, F22/F23/F24: Trade lifecycle actions. Same real architecture as every action
    // above - Action Registry -> Workflow Engine -> Process Registry -> real Trade UI ->
    // existing TradeJournalTradeStore. Every lifecycle mutation below goes through the exact
    // real functions dashboardView.jsx's own Positions panel / closePositionModal.jsx /
    // logEmotionModal.jsx already use (tradeStore.updateStatus(), the real Close Position modal's
    // own submit(), the real emotion modal's own submit()) - never a second, parallel path.
    //
    // Active Trade resolution (F22 section 5): only context.activeEntities.tradeId - resolved by
    // ai-context-engine.js's activeTradeId() from whichever real 'trade-details-{id}' process is
    // open (the Trade Details view, auto-opened by trade.calculator's own resultContext right
    // after creating a Trade, or by the dashboard's own "eye" button for an existing one). Zero
    // and multiple candidates both resolve to null here (never a guess) - "uniquely resolvable
    // visible Trade" auto-selection was deliberately left out of this gate's scope: guessing
    // which of several visible Hunting/Open trades on the dashboard is "this trade" without an
    // explicit Trade Details view open is exactly the kind of guess F5/F53 already forbid for
    // Session/Scenario/Pattern/Strategy, generalized here rather than relaxed for Trade.
    if (window.TradeJournalAIActionRegistry) {
      function resolveActiveTrade(context) {
        var tradeId = context && context.activeEntities && context.activeEntities.tradeId;
        if (!tradeId || !window.TradeJournalTradeStore) return null;
        return window.TradeJournalTradeStore.find(tradeId);
      }
      // Shared by trade.open/trade.cancel: opens the real Trade Details view for the resolved
      // Trade (satisfies "the user must SEE lifecycle operations occurring through the real
      // NAVRYA UI" - F22 section 1) and waits for its own real 'trade-details-{id}' registration,
      // the exact same registration activeTradeId() itself reads.
      function openTradeDetailsProcess(tradeId, resolve) {
        if (store.getState().activeId !== 'dashboard') store.setActiveId('dashboard');
        pollFor(
          () => window.TradeJournalNavryaTradeDetails,
          (hub) => {
            hub.open(tradeId);
            var processId = 'trade-details-' + tradeId;
            var registry = window.TradeJournalAIProcessRegistry;
            pollFor(
              () => registry && registry.query(processId).open,
              () => resolve({ processId: processId }),
              () => resolve(null)
            );
          },
          () => resolve(null)
        );
      }

      window.TradeJournalAIActionRegistry.registerAction({
        // F22 section 6: "Open this trade." (lifecycle transition of an EXISTING, resolved
        // Hunting Trade) vs "Open a trade for me." (trade.calculator - plan/create a NEW Trade).
        // The distinction lives entirely in aliases/description, the same real signal the model
        // already uses to pick between session.scenario.create vs session.scenario.edit - never
        // a code-level heuristic on the sentence itself. No entityAlreadyPersisted: the mutation
        // happens synchronously in open() (updateStatus(), the exact same call the real "Mark
        // Open" button makes) - there is no multi-turn form to keep a workflow alive for.
        id: 'trade.open', domain: 'trades', riskLevel: 'low',
        description: 'Convert an EXISTING Hunting Trade to Open - a lifecycle status transition, never the creation of a new Trade. Only matches an explicit reference to an already-resolved/visible Trade ("Open THIS trade", "mark it as open") - "Open a trade for me" or "open a long position" with no existing Trade in view means trade.calculator instead (planning a brand-new Trade), never this action. Only available when a real Hunting Trade is currently resolved as the active Trade.',
        aliases: ['open this trade', 'mark this trade open', 'activate this trade', 'mark open'],
        requiredFields: [], optionalFields: [],
        available: (context) => { var t = resolveActiveTrade(context); return !!(t && t.status === 'hunting'); },
        open: (context) => new Promise((resolve) => {
          var trade = resolveActiveTrade(context);
          if (!trade || trade.status !== 'hunting') { resolve(null); return; }
          window.TradeJournalTradeStore.updateStatus(trade.id, 'open');
          openTradeDetailsProcess(trade.id, resolve);
        }),
        submit: () => undefined,
        resultContext: () => {}
      });

      // F37: found via real browser testing that a boolean gate field (confirm/confirmDelete/
      // confirmPublish/send/publish) is uniquely vulnerable to ai-workflow-engine.js's own
      // missingFields() rule ("known" the instant a value isn't undefined/null/'') - an explicit
      // false extraction (the model correctly says "not yet confirmed" as {path:'confirm',
      // value:false} rather than omitting the field) still counts as fully known, silently
      // completing and clearing the workflow after the grace window with nothing actually
      // confirmed. A LATER "Yes." then finds no workflow left to continue and falls to fresh
      // discovery, re-resolving the target from WHATEVER is active by then - for pattern.delete,
      // reproduced as deleting a completely different Pattern the user never even asked about.
      // The fix: normalizeField returns null (never applied, per applyKnownFields()'s own
      // "value === null -> return" rule) for an explicit false on the gate field, so it stays
      // genuinely missing - exactly as if the model had never mentioned it - until a real true
      // arrives. Shared by every gate-field action below rather than duplicated per action.
      function normalizeGateField(gateFieldName) {
        return function (path, value) {
          if (path === gateFieldName && (value === false || value === 'false')) return null;
          return value;
        };
      }

      window.TradeJournalAIActionRegistry.registerAction({
        // F22 section 7/16: CONSEQUENTIAL - the real "Cancel Trade" button (dashboardView.jsx/
        // liveSessionView.jsx) has no confirmation dialog today, unlike every destructive delete
        // elsewhere in this app (window.confirm on Session/Pattern/Strategy/Scenario/Trade
        // delete). Rather than silently cancelling the instant the model returns this action, or
        // retrofitting window.confirm onto three existing human-facing buttons out of this
        // gate's own scope, the smallest deterministic seam is a required `confirm` field:
        // open() only shows the real Trade (Trade Details, so the target is visible and
        // unambiguous) - the actual mutation happens in submit(), and ONLY once confirm is
        // explicitly true. A model that never extracts confirm:true simply never completes the
        // workflow (F53's own "ask, never guess" extended to a yes/no confirmation, not just an
        // entity name).
        id: 'trade.cancel', domain: 'trades', riskLevel: 'high',
        description: 'Cancel (abandon) an EXISTING Hunting Trade - a consequential, hard-to-undo status change. This opens the real Trade Details view so the exact Trade is visible, but does NOT cancel it yet. Set confirm to true ONLY once the user has explicitly confirmed they want to cancel THIS specific Trade (e.g. they said "yes", "cancel it", "confirm") - if they have not yet confirmed, ask them plainly ("Cancel this Hunting Trade - are you sure?") and leave confirm unset. Never infer confirm from the original cancel request alone.',
        aliases: ['cancel this trade', 'abandon this trade', 'cancel the trade'],
        requiredFields: ['confirm'], optionalFields: [],
        normalizeField: normalizeGateField('confirm'),
        available: (context) => { var t = resolveActiveTrade(context); return !!(t && t.status === 'hunting'); },
        open: (context) => new Promise((resolve) => {
          var trade = resolveActiveTrade(context);
          if (!trade || trade.status !== 'hunting') { resolve(null); return; }
          openTradeDetailsProcess(trade.id, resolve);
        }),
        submit: (known, context) => {
          if (known.confirm !== true && known.confirm !== 'true') return undefined;
          var trade = resolveActiveTrade(context);
          if (!trade || trade.status !== 'hunting') return undefined;
          return window.TradeJournalTradeStore.updateStatus(trade.id, 'cancelled');
        },
        resultContext: () => {}
      });

      window.TradeJournalAIActionRegistry.registerAction({
        // F23: the primary vertical slice. Real Close Position modal
        // (closePositionModal.jsx/'trade-close-position'), real exit-price validation, real
        // computeClose() P&L math - the model never calculates P&L, only explains the real
        // number NAVRYA already computed. Deliberately NOT entityAlreadyPersisted, unlike
        // pattern.create/strategy.create/session.chartEntry.create: this action genuinely can
        // (and should) auto-complete once its one required field is known, the same normal
        // auto-submit-then-clear shape session.create/trade.calculator already use - and unlike
        // Scenario/Entry, 'trade-close-position' has a real, non-empty allowlist, so it is never
        // excluded from activeProcess: the normal workflow-continuation branch already reaches it.
        id: 'trade.close', domain: 'trades', riskLevel: 'high',
        description: 'Close an EXISTING Open Trade at a real exit price. Opens the real Close Position form - exitPrice is the only field; NAVRYA itself computes P&L, percentage, and outcome from the real Trade data, never the model. Only available when a real Open Trade is currently resolved as the active Trade.',
        aliases: ['close this trade', 'close the trade', 'close this position', 'exit this trade'],
        requiredFields: ['exitPrice'], optionalFields: [],
        available: (context) => { var t = resolveActiveTrade(context); return !!(t && t.status === 'open'); },
        open: (context) => new Promise((resolve) => {
          var trade = resolveActiveTrade(context);
          if (!trade || trade.status !== 'open') { resolve(null); return; }
          pollFor(
            () => window.TradeJournalNavryaClosePosition,
            (hub) => {
              hub.open(trade.id);
              var registry = window.TradeJournalAIProcessRegistry;
              pollFor(
                () => registry && registry.query('trade-close-position').open,
                () => resolve({ processId: 'trade-close-position' }),
                () => resolve(null)
              );
            },
            () => resolve(null)
          );
        }),
        submit: () => window.TradeJournalAIProcessRegistry && window.TradeJournalAIProcessRegistry.submit('trade-close-position'),
        resultContext: (trade) => { if (trade && trade.id && window.TradeJournalNavryaTradeDetails) window.TradeJournalNavryaTradeDetails.open(trade.id); }
      });

      window.TradeJournalAIActionRegistry.registerAction({
        // F22 section 13/14: the real emotion-log form's own AI allowlist is ONLY ['note']
        // (logEmotionModal.jsx) - dominantEmotions/stressLevel are real slider/picker controls
        // with no chat-fillable path today, and focusQuality/planCommitment have no real control
        // at all (hardcoded to 5 by the form itself). This is not a scope choice made here - the
        // real form structurally cannot be AI-filled beyond note, which already guarantees
        // "never fabricate stress/focus/commitment scores" by construction rather than by prompt
        // instruction alone. stage is resolved from the real Trade's own current status, mirroring
        // trade-store.js's own addEmotion() default logic, never asked as a chat field.
        // Deliberately NOT entityAlreadyPersisted - same reasoning as trade.close above:
        // 'trade-emotion-log' has a real, non-empty allowlist (['note']), so it is never excluded
        // from activeProcess, and requiredFields: [] means this reaches pending-submit
        // immediately, the same normal shape session.movementEntry.create already established.
        id: 'trade.emotion.log', domain: 'trades', riskLevel: 'low',
        description: 'Open the real emotion-log form for the active Trade. note is the only field the real form allows filling from chat - stress level, dominant emotions, and every other score are real slider/picker controls only the user can set by hand; never invent or infer a numeric value for any of them.',
        aliases: ['log an emotion for this trade', 'log my emotion', 'log how i feel about this trade'],
        requiredFields: [], optionalFields: ['note'],
        available: (context) => !!resolveActiveTrade(context),
        open: (context) => new Promise((resolve) => {
          var trade = resolveActiveTrade(context);
          if (!trade) { resolve(null); return; }
          var stage = trade.status === 'closed' ? 'exit' : trade.status === 'open' ? 'mid_trade' : 'entry';
          pollFor(
            () => window.TradeJournalNavryaLogEmotion,
            (hub) => {
              hub.open(trade.id, stage);
              var registry = window.TradeJournalAIProcessRegistry;
              pollFor(
                () => registry && registry.query('trade-emotion-log').open,
                () => resolve({ processId: 'trade-emotion-log' }),
                () => resolve(null)
              );
            },
            () => resolve(null)
          );
        }),
        submit: () => window.TradeJournalAIProcessRegistry && window.TradeJournalAIProcessRegistry.submit('trade-emotion-log'),
        resultContext: () => {}
      });
    }

    // Journey F, F26-F32: Community/Marketplace/Messaging - the same real architecture as every
    // action above, with one structural difference: none of Community Post/Comment, Marketplace
    // Publish, or Messaging Send has a real draft-then-publish two-step in the product (every
    // real submit button performs its REST call immediately). Every one of these actions
    // therefore requires an explicit boolean gate field (publish/send/confirmPublish) the model
    // may only extract from a message expressing genuine publish/send intent - never from
    // "write"/"draft"/"compose" alone. See docs/ai/action-coverage-matrix.md's own F26-F32 notes
    // for the full reasoning. MODEL INTERPRETS -> NAVRYA RESOLVES TARGET -> REAL UI SHOWS CONTENT
    // -> USER INTENT AUTHORIZES THE EXTERNAL EFFECT -> EXISTING PRODUCT PERMISSIONS EXECUTE.
    if (window.TradeJournalAIActionRegistry) {
      function resolveActivePostId(context) { return context && context.activeEntities && context.activeEntities.postId; }
      function resolveActiveListingId(context) { return context && context.activeEntities && context.activeEntities.listingId; }
      function resolveActivePatternId(context) { return context && context.activeEntities && context.activeEntities.patternId; }
      function resolveActiveStrategyId(context) { return context && context.activeEntities && context.activeEntities.strategyId; }
      // F37: same helper as the Trade-lifecycle block's own normalizeGateField (see trade.cancel)
      // - `function` declarations are block-scoped under strict mode, so each
      // `if (window.TradeJournalAIActionRegistry) { ... }` block needs its own copy, the same way
      // resolveActivePatternId/resolveActiveStrategyId above are already re-declared per block
      // rather than shared across them.
      function normalizeGateField(gateFieldName) {
        return function (path, value) {
          if (path === gateFieldName && (value === false || value === 'false')) return null;
          return value;
        };
      }
      // F37: resolveActiveTrade/openTradeDetailsProcess, same reasoning - the Trade-lifecycle
      // block's own copies (see trade.cancel/trade.close) are not visible here.
      function resolveActiveTrade(context) {
        var tradeId = context && context.activeEntities && context.activeEntities.tradeId;
        if (!tradeId || !window.TradeJournalTradeStore) return null;
        return window.TradeJournalTradeStore.find(tradeId);
      }
      function openTradeDetailsProcess(tradeId, resolve) {
        if (store.getState().activeId !== 'dashboard') store.setActiveId('dashboard');
        pollFor(
          () => window.TradeJournalNavryaTradeDetails,
          (hub) => {
            hub.open(tradeId);
            var processId = 'trade-details-' + tradeId;
            var registry = window.TradeJournalAIProcessRegistry;
            pollFor(
              () => registry && registry.query(processId).open,
              () => resolve({ processId: processId }),
              () => resolve(null)
            );
          },
          () => resolve(null)
        );
      }

      window.TradeJournalAIActionRegistry.registerAction({
        id: 'community.post.create', domain: 'community', riskLevel: 'high',
        description: 'Open the real Community post composer and fill its text - this does NOT publish anything by itself. publish must ONLY be set to true once the user has explicitly asked to actually post/publish/share it publicly right now (e.g. "post this", "publish it", "share it with the Community"). "Write", "draft", "compose", or "create a post saying X" alone must leave publish unset - the composer stays open with the text filled, nothing goes public. Never infer publish from the drafting request alone, even a fully-worded one.',
        aliases: ['create a community post', 'write a post', 'draft a post', 'compose a community post'],
        requiredFields: ['publish'], optionalFields: ['text'],
        normalizeField: normalizeGateField('publish'),
        available: () => true,
        open: () => new Promise((resolve) => {
          if (location.hash.indexOf('#community/feed') !== 0 && location.hash.indexOf('#community') !== 0) location.hash = '#community/feed';
          pollFor(
            () => window.TradeJournalNavryaCommunityShell,
            (hub) => {
              hub.openNewPost();
              var registry = window.TradeJournalAIProcessRegistry;
              pollFor(
                () => registry && registry.query('community-new-post').open,
                () => resolve({ processId: 'community-new-post' }),
                () => resolve(null)
              );
            },
            () => resolve(null)
          );
        }),
        submit: (known) => {
          if (known.publish !== true && known.publish !== 'true') return undefined;
          return window.TradeJournalAIProcessRegistry && window.TradeJournalAIProcessRegistry.submit('community-new-post');
        },
        resultContext: () => {}
      });

      window.TradeJournalAIActionRegistry.registerAction({
        id: 'community.comment.create', domain: 'community', riskLevel: 'high',
        description: 'Reply to the Community post the user currently has expanded/in view, filling the real comment draft - this does NOT post the comment by itself. send must ONLY be set to true once the user has explicitly asked to actually send/post the reply now. "Write a reply saying X"/"draft a comment" alone must leave send unset. Only available while a real Community post is already expanded/visible - never guesses which post "this" refers to.',
        aliases: ['reply to this post', 'comment on this post', 'draft a reply', 'write a comment'],
        requiredFields: ['send'], optionalFields: ['draft'],
        normalizeField: normalizeGateField('send'),
        available: (context) => !!resolveActivePostId(context),
        open: (context) => new Promise((resolve) => {
          var postId = resolveActivePostId(context);
          if (!postId) { resolve(null); return; }
          resolve({ processId: 'community-comment-' + postId });
        }),
        submit: (known, context) => {
          if (known.send !== true && known.send !== 'true') return undefined;
          var postId = resolveActivePostId(context);
          if (!postId) return undefined;
          return window.TradeJournalAIProcessRegistry && window.TradeJournalAIProcessRegistry.submit('community-comment-' + postId);
        },
        resultContext: () => {}
      });

      window.TradeJournalAIActionRegistry.registerAction({
        // F27-31: resolves whichever of Pattern/Strategy is currently open - real, existing
        // pattern-editor-{id}/strategy-editor-{id} registrations, never a guess between them.
        id: 'marketplace.publish', domain: 'marketplace', riskLevel: 'high',
        description: 'Open the real Marketplace publishing form for the Pattern or Strategy currently open, filling title/description/price/currency/preview-item-count - this does NOT publish anything by itself. confirmPublish must ONLY be set to true once the user has explicitly asked to actually publish it publicly right now (e.g. "publish this", "list it on Marketplace", "make it public"). Performance data (win rate, sample size) is always NAVRYA\'s own real, computed evidence - it is never a field you fill or invent; if the form requires data NAVRYA does not have, that field stays empty, never fabricated. Only available while a real Pattern or Strategy is open.',
        aliases: ['publish this pattern', 'publish this strategy', 'publish this to marketplace', 'list this on marketplace'],
        requiredFields: ['confirmPublish'], optionalFields: ['title', 'description', 'priceAmount', 'priceCurrency', 'previewItemCount'],
        normalizeField: normalizeGateField('confirmPublish'),
        available: (context) => !!(resolveActivePatternId(context) || resolveActiveStrategyId(context)),
        // Journey H1: previously routed through the orphaned, pre-NAVRYA legacy pages
        // (window.TradeJournalPatternRegistry/StrategyEducation, pattern-registry.js/
        // strategy-education.js) instead of the LIVE Strategies Hub's own Share tab
        // (strategiesHubView.jsx) - found via real code tracing while building page-aware Voice:
        // panel-system.js's own showCustom() (what those legacy pages' layer.show() calls into)
        // removes the previous panelPage from the DOM but never unmounts its React root (unlike
        // the real render() path, which does), so invoking this action while the live Hub was
        // showing left it mounted-but-detached and showed the user the wrong, old-look page. The
        // live Hub already has its own real, working publish form (PublishForm, inside ShareTab) -
        // it simply had never been wired into the AI Process Registry before now (see
        // strategiesHubView.jsx's own 'strategy-hub-publish-flow' registration).
        open: (context) => new Promise((resolve) => {
          var patternId = resolveActivePatternId(context);
          var strategyId = !patternId ? resolveActiveStrategyId(context) : null;
          if (!patternId && !strategyId) { resolve(null); return; }
          // resolveActivePatternId/resolveActiveStrategyId only resolve while the user is on a
          // DIFFERENT DetailView tab (pattern-editor-{id}/strategy-editor-{id} aren't registered
          // while their own Share tab is showing) - capture the id now, before navigating away
          // from the tab that resolved it. Forcing activeId through the real render() path (only
          // when it isn't already 'strategies') is the same self-healing step pattern.create/
          // strategy.create already take, and would also unmount any already-orphaned legacy root
          // left over from before this fix.
          if (store.getState().activeId !== 'strategies') store.setActiveId('strategies');
          var registry = window.TradeJournalAIProcessRegistry;
          pollFor(
            () => window.TradeJournalNavryaPatternHub || window.TradeJournalNavryaStrategyHub,
            () => {
              if (patternId) window.TradeJournalNavryaPatternHub.openExisting(patternId, 'share');
              else window.TradeJournalNavryaStrategyHub.openExisting(strategyId, 'share');
              pollFor(
                () => window.TradeJournalNavryaShareTabHub,
                (shareHub) => {
                  shareHub.openPublishForm();
                  pollFor(
                    () => registry && registry.query('strategy-hub-publish-flow').open,
                    () => resolve({ processId: 'strategy-hub-publish-flow' }),
                    () => resolve(null) // the real publish form never actually mounted/registered (unexpected)
                  );
                },
                () => resolve(null) // the Share tab never mounted (unexpected)
              );
            },
            () => resolve(null) // the Strategies Hub never mounted (unexpected)
          );
        }),
        submit: (known) => {
          if (known.confirmPublish !== true && known.confirmPublish !== 'true') return undefined;
          return window.TradeJournalAIProcessRegistry && window.TradeJournalAIProcessRegistry.submit('strategy-hub-publish-flow');
        },
        resultContext: () => {}
      });

      window.TradeJournalAIActionRegistry.registerAction({
        // Eligibility (not a seller, already unlocked) is enforced entirely by the real
        // registration's own isOpen() - the model never decides eligibility itself (F22 section 20).
        id: 'marketplace.rate', domain: 'marketplace', riskLevel: 'medium',
        description: 'Rate the Marketplace listing currently open, using the real rating form. Only available when NAVRYA\'s own real eligibility check (not the seller, already unlocked) already permits rating - never claim eligibility yourself.',
        aliases: ['rate this listing', 'rate this strategy', 'rate this pattern', 'leave a review'],
        requiredFields: ['ratingValue'], optionalFields: ['reviewText'],
        available: (context) => {
          var listingId = resolveActiveListingId(context);
          var registry = window.TradeJournalAIProcessRegistry;
          return !!(listingId && registry && registry.query('marketplace-rate-' + listingId).open);
        },
        open: (context) => new Promise((resolve) => {
          var listingId = resolveActiveListingId(context);
          if (!listingId) { resolve(null); return; }
          resolve({ processId: 'marketplace-rate-' + listingId });
        }),
        submit: (known, context) => {
          var listingId = resolveActiveListingId(context);
          if (!listingId) return undefined;
          return window.TradeJournalAIProcessRegistry && window.TradeJournalAIProcessRegistry.submit('marketplace-rate-' + listingId);
        },
        resultContext: () => {}
      });

      window.TradeJournalAIActionRegistry.registerAction({
        // Reuses openThread(listingId), the exact real call the "Message Seller" button already
        // makes - never openThreadWithUser (message.compose's own, different path).
        id: 'marketplace.messageSeller', domain: 'marketplace', riskLevel: 'high',
        description: 'Message the seller of the Marketplace listing currently open, filling the real message draft - this does NOT send anything by itself. send must ONLY be set to true once the user has explicitly asked to actually send the message now. Only available while a real Marketplace listing is open.',
        aliases: ['message this seller', 'message the seller', 'ask the seller', 'contact this seller'],
        requiredFields: ['send'], optionalFields: ['text'],
        normalizeField: normalizeGateField('send'),
        available: (context) => !!resolveActiveListingId(context),
        open: (context) => new Promise((resolve) => {
          var listingId = resolveActiveListingId(context);
          if (!listingId) { resolve(null); return; }
          pollFor(
            () => window.TradeJournalNavryaMessageSeller,
            (hub) => {
              hub.open();
              var registry = window.TradeJournalAIProcessRegistry;
              pollFor(
                () => registry && registry.query('messages-thread-reply').open,
                () => resolve({ processId: 'messages-thread-reply' }),
                () => resolve(null)
              );
            },
            () => resolve(null)
          );
        }),
        submit: (known) => {
          if (known.send !== true && known.send !== 'true') return undefined;
          return window.TradeJournalAIProcessRegistry && window.TradeJournalAIProcessRegistry.submit('messages-thread-reply');
        },
        resultContext: () => {}
      });

      window.TradeJournalAIActionRegistry.registerAction({
        // F32 section 21: recipient resolution priority is 1) exact active conversation/thread
        // (message.reply, a different action - a thread already exists), 2) explicit recipient
        // name (this action), 3) exact contextual seller (marketplace.messageSeller, a different
        // action). recipientName is resolved through the real user-search endpoint (see
        // messagesView.jsx's own applyValue) - never a guessed id.
        id: 'message.compose', domain: 'messaging', riskLevel: 'high',
        description: 'Open the real "New Message" composer for an explicitly-named recipient (not an already-open conversation or a Marketplace seller - those are different actions) and fill the draft - this does NOT send anything by itself. recipientName must be the exact name the user said; NAVRYA resolves the real user from it, never a guessed id - if it does not resolve to exactly one real user, nothing is sent. send must ONLY be set to true once the user has explicitly asked to actually send the message now.',
        aliases: ['message someone', 'send a message to', 'write a message to', 'compose a message'],
        requiredFields: ['send'], optionalFields: ['recipientName', 'text'],
        normalizeField: normalizeGateField('send'),
        available: () => true,
        open: () => new Promise((resolve) => {
          if (location.hash.indexOf('#community/messages') !== 0) location.hash = '#community/messages';
          pollFor(
            () => window.TradeJournalNavryaCommunityShell,
            (hub) => {
              hub.openNewMessage();
              var registry = window.TradeJournalAIProcessRegistry;
              pollFor(
                () => registry && registry.query('messages-compose').open,
                () => resolve({ processId: 'messages-compose' }),
                () => resolve(null)
              );
            },
            () => resolve(null)
          );
        }),
        submit: (known) => {
          if (known.send !== true && known.send !== 'true') return undefined;
          return window.TradeJournalAIProcessRegistry && window.TradeJournalAIProcessRegistry.submit('messages-compose');
        },
        resultContext: () => {}
      });

      window.TradeJournalAIActionRegistry.registerAction({
        // F32 section 21, priority 1: the currently active/open conversation thread only -
        // messages-thread-reply is a fixed process id (one thread panel mounted at a time), so
        // "open" here just means "is a real conversation currently showing", never a guess among
        // several past conversations.
        id: 'message.reply', domain: 'messaging', riskLevel: 'high',
        description: 'Reply within the conversation thread the user currently has open, filling the real draft - this does NOT send anything by itself. send must ONLY be set to true once the user has explicitly asked to actually send the message now (e.g. "send it"). "Say X"/"draft a reply" alone must leave send unset. Only available while a real conversation thread is already open - never guesses which one.',
        aliases: ['reply to this', 'send a reply', 'respond to this message'],
        requiredFields: ['send'], optionalFields: ['draft'],
        normalizeField: normalizeGateField('send'),
        available: () => { var registry = window.TradeJournalAIProcessRegistry; return !!(registry && registry.query('messages-thread-reply').open); },
        open: () => new Promise((resolve) => {
          var registry = window.TradeJournalAIProcessRegistry;
          if (!registry || !registry.query('messages-thread-reply').open) { resolve(null); return; }
          resolve({ processId: 'messages-thread-reply' });
        }),
        submit: (known) => {
          if (known.send !== true && known.send !== 'true') return undefined;
          return window.TradeJournalAIProcessRegistry && window.TradeJournalAIProcessRegistry.submit('messages-thread-reply');
        },
        resultContext: () => {}
      });

      // F33-F36: Account/Profile, Trading Settings, Language/Region, AI provider Settings.
      // Same core architecture as every action above - real Settings/Profile UI, real existing
      // save/update mechanism, never a hidden store mutation. Explicitly excluded from this
      // gate, matching the request exactly: password, API key editing/reveal, admin role,
      // billing/subscription, account deletion. None of these fields exist in any allowlist
      // below, and none of the real registrations they target expose them either (see
      // accountProfileView.jsx/aiAssistantView.jsx's own comments on this).

      window.TradeJournalAIActionRegistry.registerAction({
        // F33 section 4/5/6: displayName/email/phone only - avatarDataUrl is deliberately never
        // a fillable field here (section 8: the model cannot supply a real picked file, and must
        // never fabricate one). requiredFields is empty on purpose (unlike a consequential/public
        // action, a harmless resave of a user's own already-correct profile values carries no
        // real risk - same precedent as trade.emotion.log's own zero-required-fields shape): a
        // bare "Edit my profile." still opens the real Identity tab and lets the model ask what
        // to change via its own reply, without ever inventing a value.
        id: 'profile.edit', domain: 'account', riskLevel: 'low',
        description: 'Open the real Account Profile Identity tab and fill display name, email, and/or phone with EXACTLY what the user stated - never invent or infer a value they did not give. Never touch role, avatar/profile image, password, or any credential field - those are separate, out of scope here.',
        aliases: ['edit my profile', 'update my profile', 'change my display name', 'update my bio'],
        requiredFields: [], optionalFields: ['displayName', 'email', 'phone'],
        available: () => true,
        open: () => new Promise((resolve) => {
          location.hash = '#account/profile/identity';
          var registry = window.TradeJournalAIProcessRegistry;
          pollFor(
            () => registry && registry.query('account-profile-identity').open,
            () => resolve({ processId: 'account-profile-identity' }),
            () => resolve(null)
          );
        }),
        submit: () => window.TradeJournalAIProcessRegistry && window.TradeJournalAIProcessRegistry.submit('account-profile-identity'),
        resultContext: () => {}
      });

      window.TradeJournalAIActionRegistry.registerAction({
        // F33 section 7: role is a plain product label (trader/mentor/teacher) the real Role tab
        // already lets a human pick freely - never admin/moderator/any authorization role, which
        // do not exist as options here at all. account-profile-role's own applyValue (see
        // accountProfileView.jsx) independently rejects anything outside REAL_ROLES regardless of
        // what this description says, so "Make me admin." can never apply even if misextracted.
        id: 'profile.role.update', domain: 'account', riskLevel: 'low',
        description: 'Change the user\'s real product role to exactly one of trader, mentor, or teacher - a display/UX preference, never an authorization or admin permission. Only set role once the user names one of these three; never guess, and never accept any other value (e.g. "admin").',
        aliases: ['change my role', 'set my role', 'update my role'],
        requiredFields: ['role'], optionalFields: [],
        available: () => true,
        open: () => new Promise((resolve) => {
          location.hash = '#account/profile/role';
          var registry = window.TradeJournalAIProcessRegistry;
          pollFor(
            () => registry && registry.query('account-profile-role').open,
            () => resolve({ processId: 'account-profile-role' }),
            () => resolve(null)
          );
        }),
        submit: () => window.TradeJournalAIProcessRegistry && window.TradeJournalAIProcessRegistry.submit('account-profile-role'),
        resultContext: () => {}
      });

      // 2026-08-28 bug report: activeProcess.allowlist only ever sends the MODEL field PATHS
      // (chat-dock-core.js's modelFacingAllowlist()) - no type or valid-option info at all - so a
      // spoken/localized answer ("متاهل هستم", "married", "I'm married") reasonably comes back as
      // free text, not the exact internal key (mentalHealthIntakeModal.jsx's own TileGrid options
      // compare against, e.g. 'married') its own value=== check requires to visibly select
      // anything. Found via real production testing: the write itself always succeeded (the raw
      // text landed in the store), the tile just never lit up, silently. normalizeIntakeChoice()
      // maps free text onto the real internal key by comparing against that SAME option's own
      // real, already-shown label in EVERY supported language (fa/ar/en/es -
      // mental-health-i18n.js's own messages dictionary, reused directly - never a second,
      // hand-duplicated translation table that could drift from what the user actually sees) -
      // the same "map a natural-language extraction onto the real option list" pattern
      // normalizeSessionCity()/normalizeSessionTimeframe() above already use for session.create,
      // applied here for every enum-shaped intake field. An unrecognized value returns null -
      // ai-workflow-engine.js then leaves that field missing rather than live-applying a value no
      // real tile would ever visibly match.
      function normalizeIntakeChoice(optionPairs, i18nPrefix, rawValue) {
        var text = String(rawValue == null ? '' : rawValue).trim().toLowerCase();
        if (!text) return null;
        var keys = optionPairs.map((pair) => pair[0]);
        var exact = keys.find((key) => key.toLowerCase() === text || key.toLowerCase().replace(/_/g, ' ') === text);
        if (exact) return exact;
        var messages = window.TradeJournalMentalHealthI18n && window.TradeJournalMentalHealthI18n.messages;
        if (!messages) return null;
        var langs = Object.keys(messages);
        for (var i = 0; i < keys.length; i++) {
          for (var j = 0; j < langs.length; j++) {
            var label = messages[langs[j]][i18nPrefix + keys[i]];
            if (label && String(label).trim().toLowerCase() === text) return keys[i];
          }
        }
        // Real speech rarely IS the bare label - "متاهل هستم" ("I am married"), not just "متاهل".
        // Found via real production testing (the marital-status bug report). Fall back to the
        // longest real label that appears inside the spoken text (or the text inside a short
        // label, for the reverse case - "مطلق" spoken alone should still match the
        // "مطلقه/مطلق" combined-gender label) - longest-first so a short, generic label can never
        // pre-empt a more specific one that also matches (e.g. never let a short label shadow a
        // longer, more specific one sharing a common prefix).
        var candidates = [];
        for (var k = 0; k < keys.length; k++) {
          for (var l = 0; l < langs.length; l++) {
            var candidateLabel = messages[langs[l]][i18nPrefix + keys[k]];
            if (!candidateLabel) continue;
            var normalized = String(candidateLabel).trim().toLowerCase();
            if (normalized.length > 1 && (text.indexOf(normalized) > -1 || normalized.indexOf(text) > -1)) {
              candidates.push({ key: keys[k], length: normalized.length });
            }
          }
        }
        if (!candidates.length) return null;
        candidates.sort((a, b) => b.length - a.length);
        return candidates[0].key;
      }
      // Same idea as normalizeIntakeChoice() above, for the intake's 6 real boolean-shaped fields
      // (isFullTimeTrader, borrowedMoneyForTrading, the 4 transparencyMatrix.* fields) - a model
      // has no schema hint that these expect a literal true/false either, so a spoken "بله"/"yes"
      // needs the same real-label comparison, reusing mental-health-i18n.js's own mhYes/mhNo
      // strings across every supported language.
      function normalizeIntakeBoolean(rawValue) {
        if (rawValue === true || rawValue === false) return rawValue;
        var text = String(rawValue == null ? '' : rawValue).trim().toLowerCase();
        if (text === 'true') return true;
        if (text === 'false') return false;
        var messages = window.TradeJournalMentalHealthI18n && window.TradeJournalMentalHealthI18n.messages;
        if (!messages) return null;
        var langs = Object.keys(messages);
        for (var i = 0; i < langs.length; i++) {
          var yes = messages[langs[i]].mhYes, no = messages[langs[i]].mhNo;
          if (yes && String(yes).trim().toLowerCase() === text) return true;
          if (no && String(no).trim().toLowerCase() === text) return false;
        }
        // Same real-speech fallback as normalizeIntakeChoice() above ("بله حتما" / "yes it is"),
        // never both a yes AND a no match at once - an ambiguous/contradictory answer is left
        // missing rather than guessed either way.
        var sawYes = false, sawNo = false;
        for (var j = 0; j < langs.length; j++) {
          var yesLabel = messages[langs[j]].mhYes, noLabel = messages[langs[j]].mhNo;
          if (yesLabel && text.indexOf(String(yesLabel).trim().toLowerCase()) > -1) sawYes = true;
          if (noLabel && text.indexOf(String(noLabel).trim().toLowerCase()) > -1) sawNo = true;
        }
        if (sawYes && !sawNo) return true;
        if (sawNo && !sawYes) return false;
        return null;
      }
      // marketsTraded (intake.tradingHistory.marketsTraded) is the one intake enum field that is
      // ALSO a real free-text field (mentalHealthIntakeModal.jsx's own InstrumentPicker accepts
      // custom market names beyond its 6 presets) - unlike the strict-choice fields above, an
      // unrecognized value is never rejected, only passed through as a genuine custom entry,
      // matching what a human typing a market name directly into that same control already does.
      function normalizeIntakeMarket(rawValue) {
        var text = String(rawValue == null ? '' : rawValue).trim();
        if (!text) return null;
        var lower = text.toLowerCase();
        var presets = INTAKE_ENUM_OPTIONS.MARKET_PRESETS;
        var exact = presets.find((key) => key.toLowerCase() === lower);
        if (exact) return exact;
        var messages = window.TradeJournalMentalHealthI18n && window.TradeJournalMentalHealthI18n.messages;
        if (messages) {
          var langs = Object.keys(messages);
          for (var i = 0; i < presets.length; i++) {
            for (var j = 0; j < langs.length; j++) {
              var label = messages[langs[j]]['mhMarketsPreset_' + presets[i]];
              if (label && String(label).trim().toLowerCase() === lower) return presets[i];
            }
          }
        }
        return text;
      }
      var INTAKE_BOOLEAN_PATHS = {
        'intake.demographics.isFullTimeTrader': true, 'intake.financialContext.borrowedMoneyForTrading': true,
        'intake.transparencyMatrix.profitKnownToFamily': true, 'intake.transparencyMatrix.lossKnownToFamily': true,
        'intake.transparencyMatrix.capitalKnownToFamily': true, 'intake.transparencyMatrix.tradingActivityKnownToFamily': true
      };

      // Journey H1: closes a confirmed gap - the real Psychology Intake wizard
      // (mentalHealthIntakeModal.jsx, 13 steps) has always had a real 'mh-intake' Process Registry
      // registration (so an already-open intake can be filled), but NO Action Registry entry
      // existed to let Voice open it in the first place; the only prior path was the Companion's
      // own proactive "next best step" nudge (ai-journey-steps.js's 'intake' step,
      // journeySteps.registerExecutor above), never something the user could ask for by name.
      // Deliberately open-only and entityAlreadyPersisted (mirrors settings.trading.update's own
      // shape exactly): this action NEVER fabricates or infers a single answer - it only navigates
      // there, exactly like its own description tells the model. Every subsequent field fill
      // still flows through the SAME, already-privacy-scoped 'mh-intake' allowlist
      // (mental-health.types.js's intakePaths) a human-opened intake already uses - no new data
      // exposure, no change to ai-user-memory.js's own minimized getRelevantPsychologyContext().
      window.TradeJournalAIActionRegistry.registerAction({
        id: 'psychology.intake.start', domain: 'psychology', riskLevel: 'low', entityAlreadyPersisted: true,
        description: 'Open the real Psychology Intake wizard so the user can begin/resume it. This action ONLY navigates there - never fabricate, infer, or pre-fill a single answer on this turn; every intake field is filled later, only from what the user explicitly states themselves, turn by turn, exactly like typing it into the real form would be.',
        aliases: ['start my intake', 'start the psychology intake', 'begin my intake', 'open psychology intake', 'take the intake'],
        requiredFields: [], optionalFields: [],
        available: () => true,
        // 2026-08-28 bug report fix: maps a spoken/localized answer onto the real internal enum
        // key every intake TileGrid actually compares against - see normalizeIntakeChoice()'s own
        // comment above. A path with no case here (age/capitalAllocationPercent/yearsTrading,
        // all numeric; the free-text-safe motivation/lossReaction choices already covered) passes
        // through unchanged - mental-health-store.js's own setPath() already Number()-coerces the
        // numeric ones.
        normalizeField: (path, value) => {
          if (path === 'intake.demographics.gender') return normalizeIntakeChoice(INTAKE_ENUM_OPTIONS.GENDERS, 'mhGender_', value);
          if (path === 'intake.demographics.maritalStatus') return normalizeIntakeChoice(INTAKE_ENUM_OPTIONS.MARITAL_STATUSES, 'mhMaritalStatus_', value);
          if (path === 'intake.demographics.primaryOccupation') return normalizeIntakeChoice(INTAKE_ENUM_OPTIONS.OCCUPATION_TYPES, 'mhOccupationType_', value);
          if (path === 'intake.financialContext.capitalType') return normalizeIntakeChoice(INTAKE_ENUM_OPTIONS.CAPITAL_TYPES, 'mhCapitalType_', value);
          if (path === 'intake.motivationForTrading') return normalizeIntakeChoice(INTAKE_ENUM_OPTIONS.MOTIVATIONS, 'mhMotivation_', value);
          if (path === 'intake.firstBigLossReaction') return normalizeIntakeChoice(INTAKE_ENUM_OPTIONS.LOSS_REACTIONS, 'mhLossReaction_', value);
          if (path === 'intake.tradingHistory.marketsTraded') return normalizeIntakeMarket(value);
          if (INTAKE_BOOLEAN_PATHS[path]) return normalizeIntakeBoolean(value);
          return value;
        },
        open: () => new Promise((resolve) => {
          if (!window.TradeJournalMentalHealthIntake) { resolve(null); return; }
          window.TradeJournalMentalHealthIntake.open();
          var registry = window.TradeJournalAIProcessRegistry;
          pollFor(
            () => registry && registry.query('mh-intake').open,
            () => resolve({ processId: 'mh-intake' }),
            () => resolve(null) // the real intake modal never actually mounted/registered (unexpected)
          );
        }),
        submit: () => undefined,
        resultContext: () => {}
      });

      window.TradeJournalAIActionRegistry.registerAction({
        // F34: real trade-store.js settings()/saveSettings() - the exact object the Calculator
        // and Trade Log already read defaultRiskPercent from. entityAlreadyPersisted: true
        // because settings-trading-defaults' own applyValue (settingsView.jsx) already performs
        // the real, complete, immediate persist on every field - there is no separate Save step
        // to schedule (same shape as pattern.edit/strategy.edit above).
        // Section 10/12: this is the user's DEFAULT risk (a Settings preference that pre-fills
        // future calculations) - NEVER the same thing as an already-open Trade's own risk field
        // (trade.calculator's own workflow) or a Strategy's own max-risk rule (strategy.edit).
        // Only extract these fields from an explicit "my default risk" / "Trading Settings"
        // request, never from a bare "set risk to X%" while a Trade or Strategy editor is the
        // one actually open and active.
        id: 'settings.trading.update', domain: 'settings', riskLevel: 'low', entityAlreadyPersisted: true,
        description: 'Update the user\'s real Trading DEFAULTS (default risk per trade, leverage cap, max trades per session) in Settings - these pre-fill the Calculator and Trade Log, they never place an order or change an already-open Trade. Distinct from a currently open Trade\'s own risk field or a Strategy\'s own max-risk rule - only match this action for an explicit "my default risk" / "Trading Settings" request. Existing NAVRYA validation clamps every value to its real supported range; never decide what is valid yourself.',
        aliases: ['set my default risk', 'change my default risk', 'set my leverage cap', 'update my trading defaults', 'set my default timeframe'],
        requiredFields: [], optionalFields: ['defaultRiskPercent', 'leverageCap', 'maxTradesPerSession'],
        available: () => true,
        open: () => new Promise((resolve) => {
          if (store.getState().activeId !== 'settings') store.setActiveId('settings');
          var registry = window.TradeJournalAIProcessRegistry;
          pollFor(
            () => registry && registry.query('settings-trading-defaults').open,
            () => resolve({ processId: 'settings-trading-defaults' }),
            () => resolve(null)
          );
        }),
        submit: () => undefined,
        resultContext: () => {}
      });

      // F35: settings-region-language's own real allowlist validates `language` against the
      // fixed code list ['fa','ar','en','es'] (languageOptions, settingsView.jsx) - but a model
      // extracting "language" from "Change NAVRYA to Persian." just as naturally returns the
      // English name "Persian" as it appeared in the request, not the code. Found via real
      // browser testing: without normalization, that exact request silently applied nothing at
      // all (the code-only check correctly rejected "Persian", leaving the interface language
      // unchanged) - the same "map a natural-language extraction onto the real option list"
      // problem normalizeSessionTimeframe()/normalizeSessionCity() above already solve for
      // session.create, applied here.
      function normalizeSettingsLanguage(raw) {
        var text = String(raw || '').trim().toLowerCase();
        var codes = ['fa', 'ar', 'en', 'es'];
        if (codes.indexOf(text) > -1) return text;
        var names = {
          persian: 'fa', farsi: 'fa', 'فارسی': 'fa', fa: 'fa',
          arabic: 'ar', 'العربية': 'ar', ar: 'ar',
          english: 'en', en: 'en',
          spanish: 'es', 'español': 'es', espanol: 'es', es: 'es'
        };
        return names[text] || null;
      }

      window.TradeJournalAIActionRegistry.registerAction({
        // F35: real store.js setLanguage() for the interface language, plus the real,
        // already-persisted Region & language preferences (settings-region-language,
        // settingsView.jsx). entityAlreadyPersisted: true for the same reason as Trading
        // defaults above - every field here applies and persists immediately, no separate Save.
        // Section 16: a user SPEAKING Persian must never, by itself, change the app language -
        // only an explicit request to change the interface/app language may set `language`.
        id: 'settings.language.update', domain: 'settings', riskLevel: 'low', entityAlreadyPersisted: true,
        description: 'Change the real interface language and/or Region & language preferences (country, timezone, account currency, week start) in Settings. `language` must ONLY be set from an EXPLICIT request to change NAVRYA\'s interface/app language (e.g. "change the app language to Persian", "switch the interface to Spanish") - never merely because the user is speaking a different language. Only real, currently supported values ever apply; never invent a locale, country, or timezone NAVRYA does not actually offer.',
        aliases: ['change navrya to persian', 'switch the interface to spanish', 'change the app language', 'set my timezone', 'change my region'],
        requiredFields: [], optionalFields: ['language', 'region.country', 'region.timezone', 'region.currency', 'region.weekStart'],
        available: () => true,
        normalizeField: (path, value) => (path === 'language' ? normalizeSettingsLanguage(value) : value),
        open: () => new Promise((resolve) => {
          if (store.getState().activeId !== 'settings') store.setActiveId('settings');
          var registry = window.TradeJournalAIProcessRegistry;
          pollFor(
            () => registry && registry.query('settings-region-language').open,
            () => resolve({ processId: 'settings-region-language' }),
            () => resolve(null)
          );
        }),
        submit: () => undefined,
        resultContext: () => {}
      });

      window.TradeJournalAIActionRegistry.registerAction({
        // F36: real ai-settings-store.js saveSettings()/setVoice() - the exact store the
        // ChatDock's own engine switcher and the AI Assistant screen already read/write.
        // entityAlreadyPersisted: true - every field applies and persists immediately (see
        // ai-assistant-engine's own applyValue, aiAssistantView.jsx), no separate Save step.
        // Section 22/29: API key, "remember this key", and spend budget are NEVER fillable here -
        // not merely left off the allowlist, but never wired into applyValue at all, so extending
        // this allowlist later cannot silently reopen that seam. NAVRYA never displays, reads
        // aloud, or repeats an API key back through this or any other conversational action.
        id: 'settings.ai.update', domain: 'settings', riskLevel: 'low', entityAlreadyPersisted: true,
        description: 'Switch the real AI provider (e.g. OpenAI, Claude/Anthropic, Kimi, DeepSeek), the active model for that provider, or its Voice toggle. `provider` and `model` only apply when they exactly match NAVRYA\'s real, currently offered catalog for that provider - if the user names one that is not available, say so rather than inventing it. NEVER accept, display, or fill an API key, "remember this key", or spend budget through this action - those remain strictly manual, outside chat.',
        aliases: ['switch the assistant to openai', 'use anthropic', 'switch to kimi', 'use deepseek', 'change the ai model', 'turn on voice mode'],
        requiredFields: [], optionalFields: ['provider', 'model', 'voice'],
        available: () => true,
        // The real catalog's own ids (openai/anthropic/kimi/deepseek) are lowercase codes, but a
        // model extracting "provider" from "Switch the assistant to Anthropic." just as
        // naturally returns the display label as it appeared in the request ("Anthropic",
        // "OpenAI") - found via real browser testing: without normalization, that exact request
        // silently applied nothing (the id-only check correctly rejected "Anthropic", leaving
        // the active provider unchanged). Same normalizeField fix as settings.language.update's
        // own 'language' field, reading the real catalog directly rather than duplicating it -
        // matches by id OR real label, case-insensitively; 'model' matches case-insensitively
        // against every real model string across the whole catalog, returning the exact real
        // string so the later options-check in applyValue (aiAssistantView.jsx) still passes.
        normalizeField: (path, value) => {
          var settingsStore = window.TradeJournalAISettingsStore;
          if (!settingsStore) return value;
          var catalog = settingsStore.providerCatalog();
          if (path === 'provider') {
            var text = String(value || '').trim().toLowerCase();
            var hit = catalog.filter((p) => p.id.toLowerCase() === text || p.label.toLowerCase() === text)[0];
            return hit ? hit.id : null;
          }
          if (path === 'model') {
            var wanted = String(value || '').trim().toLowerCase();
            for (var i = 0; i < catalog.length; i++) {
              var real = catalog[i].models.filter((m) => m.toLowerCase() === wanted)[0];
              if (real) return real;
            }
            return null;
          }
          return value;
        },
        open: () => new Promise((resolve) => {
          location.hash = '#ai-settings';
          var registry = window.TradeJournalAIProcessRegistry;
          pollFor(
            () => registry && registry.query('ai-assistant-engine').open,
            () => resolve({ processId: 'ai-assistant-engine' }),
            () => resolve(null)
          );
        }),
        submit: () => undefined,
        resultContext: () => {}
      });

      // F37: destructive actions. MODEL interprets intent -> NAVRYA resolves the exact target ->
      // the real entity is shown in its real editor/detail view -> a deterministic `confirm`
      // gate (never inferred from the delete request alone; rejections are resolved client-side
      // by the new gate-field fast-path above, never left to a model's own judgment) -> only then
      // does submit() call the exact same real store method the human-facing "Delete" button's
      // own (native, AI-unreachable) window.confirm() would have led to. Never
      // AI -> store.delete(id) directly behind the UI: open() always shows the target first, and
      // submit() always re-verifies the target is STILL the one showing (via the real
      // per-entity registry entry's own isOpen(), or - for Session, which has no such per-entity
      // registration - a fresh getActiveSessionId() re-check) immediately before deleting, so a
      // target switched mid-confirmation (F37 section 6) is refused, never silently redirected.
      // Community post/comment, message, and Marketplace listing deletion are intentionally
      // EXCLUDED - no real, reachable delete UI exists for any of them (verified by repository
      // audit: community-store.js's removePost() is never called from communityView.jsx; no
      // comment/message delete exists at any layer; marketplace has no unpublish/withdraw route).
      // Account deletion is intentionally EXCLUDED - no such flow exists in the product at all.

      var pendingPatternDeleteId = null;
      window.TradeJournalAIActionRegistry.registerAction({
        id: 'pattern.delete', domain: 'patterns', riskLevel: 'high',
        description: 'Permanently delete an EXISTING Pattern - this cannot be undone. Resolves the exact Pattern either from the one currently open (patternName left unset) or by exact name (patternName set) - if several Patterns match or none do, ask which one instead of guessing. confirm must ONLY be set to true once the user has explicitly confirmed the deletion after being asked (e.g. "yes", "delete it", "confirm") - never inferred from the original delete request alone.',
        aliases: ['delete this pattern', 'delete the pattern', 'remove this pattern', 'delete pattern'],
        requiredFields: ['confirm'], optionalFields: ['patternName'],
        normalizeField: normalizeGateField('confirm'),
        available: () => true,
        open: (context, initialFields) => new Promise((resolve) => {
          var nameField = (initialFields || []).filter((f) => f && f.path === 'patternName')[0];
          var patternName = nameField ? String(nameField.value == null ? '' : nameField.value).trim() : '';
          var store2 = window.TradeJournalPatternStore;
          var id;
          if (patternName) {
            var patterns = store2 ? store2.listSync() : [];
            var matches = patterns.filter((p) => String(p.name || '').trim().toLowerCase() === patternName.toLowerCase());
            if (matches.length !== 1) { resolve(null); return; } // zero or ambiguous - never guess (F53)
            id = matches[0].id;
          } else {
            id = resolveActivePatternId(context);
            if (!id) { resolve(null); return; }
          }
          pendingPatternDeleteId = id;
          if (store.getState().activeId !== 'strategies') store.setActiveId('strategies');
          pollFor(
            () => window.TradeJournalNavryaPatternHub,
            (hub) => {
              hub.openExisting(id);
              var registry = window.TradeJournalAIProcessRegistry;
              pollFor(
                () => registry && registry.query('pattern-editor-' + id).open,
                () => resolve({ processId: 'pattern-editor-' + id }),
                () => resolve(null)
              );
            },
            () => resolve(null)
          );
        }),
        submit: (known, context) => {
          if (known.confirm !== true && known.confirm !== 'true') return undefined;
          var id = pendingPatternDeleteId;
          pendingPatternDeleteId = null;
          if (!id) return undefined;
          // F37 section 6: found via real browser testing that pattern-editor-{id}'s own isOpen()
          // is NOT a reliable "is this specific Pattern still the one showing" signal - switching
          // from Pattern A to Pattern B leaves A's registration reporting isOpen:true forever (it
          // is never explicitly unregistered on navigate-away, unlike a real modal). Re-resolving
          // the ACTIVE Pattern fresh from context (the same "most recently registered wins" signal
          // resolveActivePatternId() already uses elsewhere) correctly reflects the true current
          // target instead - if something else is now active, the stale confirmation is refused.
          var currentActive = resolveActivePatternId(context);
          if (currentActive && currentActive !== id) return undefined;
          return window.TradeJournalPatternStore.remove(id);
        },
        resultContext: () => {}
      });

      var pendingStrategyDeleteId = null;
      window.TradeJournalAIActionRegistry.registerAction({
        id: 'strategy.delete', domain: 'strategies', riskLevel: 'high',
        description: 'Permanently delete an EXISTING Strategy - this cannot be undone. Any Trade linked to it keeps its own record; only the link is cleared (NAVRYA\'s own existing behavior - never invented). Resolves the exact Strategy either from the one currently open (strategyName left unset) or by exact name (strategyName set) - if several match or none do, ask which one instead of guessing. confirm must ONLY be set to true once the user has explicitly confirmed the deletion after being asked - never inferred from the original delete request alone.',
        aliases: ['delete this strategy', 'delete the strategy', 'remove this strategy', 'delete strategy'],
        requiredFields: ['confirm'], optionalFields: ['strategyName'],
        normalizeField: normalizeGateField('confirm'),
        available: () => true,
        open: (context, initialFields) => new Promise((resolve) => {
          var nameField = (initialFields || []).filter((f) => f && f.path === 'strategyName')[0];
          var strategyName = nameField ? String(nameField.value == null ? '' : nameField.value).trim() : '';
          var store2 = window.TradeJournalStrategyEducationStore;
          var id;
          if (strategyName) {
            var strategies = store2 ? store2.listSync() : [];
            var matches = strategies.filter((s) => String(s.name || '').trim().toLowerCase() === strategyName.toLowerCase());
            if (matches.length !== 1) { resolve(null); return; }
            id = matches[0].id;
          } else {
            id = resolveActiveStrategyId(context);
            if (!id) { resolve(null); return; }
          }
          pendingStrategyDeleteId = id;
          if (store.getState().activeId !== 'strategies') store.setActiveId('strategies');
          pollFor(
            () => window.TradeJournalNavryaStrategyHub,
            (hub) => {
              hub.openExisting(id);
              var registry = window.TradeJournalAIProcessRegistry;
              pollFor(
                () => registry && registry.query('strategy-editor-' + id).open,
                () => resolve({ processId: 'strategy-editor-' + id }),
                () => resolve(null)
              );
            },
            () => resolve(null)
          );
        }),
        submit: (known, context) => {
          if (known.confirm !== true && known.confirm !== 'true') return undefined;
          var id = pendingStrategyDeleteId;
          pendingStrategyDeleteId = null;
          if (!id) return undefined;
          // F37 section 6: same fix as pattern.delete above - strategy-editor-{id}'s own isOpen()
          // is not reliable across a Strategy switch either; re-resolve fresh from context.
          var currentActive = resolveActiveStrategyId(context);
          if (currentActive && currentActive !== id) return undefined;
          return window.TradeJournalStrategyEducationStore.remove(id);
        },
        resultContext: () => {}
      });

      var pendingSessionDeleteId = null;
      window.TradeJournalAIActionRegistry.registerAction({
        id: 'session.delete', domain: 'sessions', riskLevel: 'high',
        description: 'Permanently delete the currently active trading Session - this cannot be undone. Trades created from it keep their own record; only the source link is left as-is (NAVRYA\'s own existing behavior - no reference cleanup is invented here). Only available while a real Session is active. confirm must ONLY be set to true once the user has explicitly confirmed the deletion after being asked - never inferred from the original delete request alone.',
        aliases: ['delete this session', 'delete the session', 'remove this session', 'delete session'],
        requiredFields: ['confirm'], optionalFields: [],
        normalizeField: normalizeGateField('confirm'),
        available: (context) => !!(context && context.activeEntities && context.activeEntities.sessionId),
        open: (context) => new Promise((resolve) => {
          var id = context && context.activeEntities && context.activeEntities.sessionId;
          if (!id) { resolve(null); return; }
          pendingSessionDeleteId = id;
          // 'session-delete-confirm' has no real per-session DOM registration to reuse (Sessions
          // are not individually process-registered the way Pattern/Strategy/Trade are) - but
          // ai-workflow-engine.js's own scheduleSubmit() unconditionally checks
          // registry.query(processId).open before ever calling submit(), and an id that was never
          // registered at all evaluates that as false, silently discarding the workflow without
          // ever attempting the delete. Found via real browser testing: "Yes." correctly matched
          // and applied confirm:true, but submit() was never invoked at all. Registering a real,
          // minimal, always-open entry here (matching every other synthetic, non-DOM-backed
          // process id in this codebase) is the fix - session.delete's own submit() already does
          // the real "is this still the active session" check via getActiveSessionId(), so this
          // registration exists purely to satisfy scheduleSubmit()'s liveness check, not as a
          // second source of truth.
          var registry = window.TradeJournalAIProcessRegistry;
          if (registry) registry.register('session-delete-confirm', { allowlist: ['confirm'], isOpen: () => true });
          resolve({ processId: 'session-delete-confirm' });
        }),
        submit: (known) => {
          if (known.confirm !== true && known.confirm !== 'true') return undefined;
          var id = pendingSessionDeleteId;
          pendingSessionDeleteId = null;
          if (!id) return undefined;
          // F37 section 6: Sessions have no per-entity process registration to check isOpen()
          // against (getActiveSessionId() IS the real "which one is active" signal) - re-read it
          // fresh, immediately before deleting, rather than trusting the id captured at open().
          var live = window.TradeJournalNavryaLiveSession;
          if (!live || live.getActiveSessionId() !== id) return undefined;
          return window.TradeJournalWorkspace && window.TradeJournalWorkspace.remove(id);
        },
        resultContext: () => {}
      });

      var pendingScenarioDeleteId = null;
      window.TradeJournalAIActionRegistry.registerAction({
        id: 'scenario.delete', domain: 'sessions', riskLevel: 'high',
        description: 'Permanently delete the Scenario the user currently has expanded/open within the active Session - this cannot be undone. Only available while a real Scenario is expanded - never guesses which one. confirmDelete must ONLY be set to true once the user has explicitly confirmed the deletion after being asked - never inferred from the original delete request alone. The real editor has no confirmation of its own, so this gate is the only one that exists.',
        aliases: ['delete this scenario', 'delete the scenario', 'remove this scenario'],
        requiredFields: ['confirmDelete'], optionalFields: [],
        normalizeField: normalizeGateField('confirmDelete'),
        available: (context) => !!(context && context.activeEntities && context.activeEntities.scenarioId),
        open: (context) => new Promise((resolve) => {
          var id = context && context.activeEntities && context.activeEntities.scenarioId;
          if (!id) { resolve(null); return; }
          pendingScenarioDeleteId = id;
          resolve({ processId: 'live-session-scenario-' + id });
        }),
        submit: (known, context) => {
          if (known.confirmDelete !== true && known.confirmDelete !== 'true') return undefined;
          var id = pendingScenarioDeleteId;
          pendingScenarioDeleteId = null;
          if (!id) return undefined;
          // F37 section 6: re-verify the ACTIVE scenario still matches the one originally shown -
          // the deterministic confirm fast-path (chat-dock-core.js) applies confirmDelete to the
          // EXISTING workflow directly, without re-running open()/fresh discovery, so a switch to
          // a different Scenario before confirming is no longer naturally caught the way it would
          // be if every "Yes." re-triggered discovery from scratch.
          var currentActive = context && context.activeEntities && context.activeEntities.scenarioId;
          if (currentActive && currentActive !== id) return undefined;
          return window.TradeJournalAIProcessRegistry && window.TradeJournalAIProcessRegistry.submit('live-session-scenario-' + id);
        },
        resultContext: () => {}
      });

      var pendingEntryDeleteId = null;
      window.TradeJournalAIActionRegistry.registerAction({
        id: 'entry.delete', domain: 'sessions', riskLevel: 'high',
        description: 'Permanently delete the Session Entry the user currently has open within the active Session - this cannot be undone. Only available while a real Entry is open - never guesses which one. confirmDelete must ONLY be set to true once the user has explicitly confirmed the deletion after being asked - never inferred from the original delete request alone. The real editor has no confirmation of its own, so this gate is the only one that exists.',
        aliases: ['delete this entry', 'delete the entry', 'remove this entry'],
        requiredFields: ['confirmDelete'], optionalFields: [],
        normalizeField: normalizeGateField('confirmDelete'),
        available: (context) => !!(context && context.activeEntities && context.activeEntities.entryId),
        open: (context) => new Promise((resolve) => {
          var id = context && context.activeEntities && context.activeEntities.entryId;
          if (!id) { resolve(null); return; }
          pendingEntryDeleteId = id;
          resolve({ processId: 'live-session-entry-' + id });
        }),
        submit: (known, context) => {
          if (known.confirmDelete !== true && known.confirmDelete !== 'true') return undefined;
          var id = pendingEntryDeleteId;
          pendingEntryDeleteId = null;
          if (!id) return undefined;
          // F37 section 6: same fix as scenario.delete above.
          var currentActive = context && context.activeEntities && context.activeEntities.entryId;
          if (currentActive && currentActive !== id) return undefined;
          return window.TradeJournalAIProcessRegistry && window.TradeJournalAIProcessRegistry.submit('live-session-entry-' + id);
        },
        resultContext: () => {}
      });

      var pendingTradeDeleteId = null;
      window.TradeJournalAIActionRegistry.registerAction({
        id: 'trade.delete', domain: 'trades', riskLevel: 'high',
        description: 'Permanently delete an EXISTING Trade record (including its logged emotion entries) - this cannot be undone. Use this ONLY when the user says "delete"/"remove" the trade (or its record) - never for "cancel"/"abandon" (that is trade.cancel, a status change on a Hunting Trade that keeps the record) or a real exit (trade.close). A "delete"/"remove" request maps here regardless of the Trade\'s current status (Hunting, Open, Closed, or Cancelled) - it always means removing the record entirely, not changing its status. Only available for a real, currently resolved active Trade. confirm must ONLY be set to true once the user has explicitly confirmed the deletion after being asked - never inferred from the original delete request alone.',
        aliases: ['delete this trade', 'delete the trade', 'remove this trade', 'delete trade record'],
        requiredFields: ['confirm'], optionalFields: [],
        normalizeField: normalizeGateField('confirm'),
        available: (context) => !!resolveActiveTrade(context),
        open: (context) => new Promise((resolve) => {
          var trade = resolveActiveTrade(context);
          if (!trade) { resolve(null); return; }
          pendingTradeDeleteId = trade.id;
          openTradeDetailsProcess(trade.id, resolve);
        }),
        submit: (known, context) => {
          if (known.confirm !== true && known.confirm !== 'true') return undefined;
          var id = pendingTradeDeleteId;
          pendingTradeDeleteId = null;
          if (!id) return undefined;
          // F37 section 6: same fix as pattern.delete/strategy.delete above - re-resolve the
          // ACTIVE Trade fresh from context (resolveActiveTrade's own "most recently registered
          // wins" signal) rather than trusting a specific registration's own isOpen() in
          // isolation, found via real testing to potentially keep reporting itself open long
          // after the user has moved on to a different entity.
          var currentActive = resolveActiveTrade(context);
          if (currentActive && currentActive.id !== id) return undefined;
          return window.TradeJournalTradeStore.remove(id);
        },
        resultContext: () => {}
      });
    }

    // Journey G (AI Companion & Journey Orchestration): the real executors behind the steps
    // ai-journey-steps.js can't resolve through the Action Registry alone (no matching
    // conversational action exists for these, or the target isn't a fresh entity to create). Every
    // executor below calls a real, already-imported entry point - the exact same one its own
    // TradeJournalNavryaXxx hook above already exposes - never a second, parallel open path.
    if (window.TradeJournalAIJourneySteps) {
      var journeySteps = window.TradeJournalAIJourneySteps;
      journeySteps.registerExecutor('intake', () => openIntake());
      journeySteps.registerExecutor('post_trade_reflection', (ctx) => { if (ctx.reflectionDueTrade) openPostTradeReflection(ctx.reflectionDueTrade); });
      journeySteps.registerExecutor('open_trade_attention', (ctx) => { if (ctx.openTrade) openTradeDetails(ctx.openTrade); });
      journeySteps.registerExecutor('scenario_plan', (ctx) => {
        var openSession = (ctx.sessions || []).find((s) => s.status === 'open');
        if (openSession) openLiveSession(openSession.id); else store.setActiveId('sessions');
      });
      journeySteps.registerExecutor('pattern_report', (ctx) => {
        if (!ctx.reportablePattern) return;
        if (store.getState().activeId !== 'strategies') store.setActiveId('strategies');
        location.hash = '#strategies/patterns/' + ctx.reportablePattern.id + '/report';
      });
    }

    // Phase 2 of the local-first-to-server-authoritative migration (see ARCHITECTURE.md's Global
    // Data Sync section): the real boot gate. Every migrated domain's server-replica.js
    // registration/hydrate() call already ran (its <script> tag loads earlier than this bundle's
    // on every character page), so by the time allReady() is called here every one of those
    // promises already exists - this just waits for them all to settle (success or failure)
    // before the first real render, so a still-hydrating replica can never look like a genuinely
    // empty account. A hard hydration failure renders an honest error state instead of the normal
    // UI, directly into these same root elements, rather than silently proceeding with empty data.
    const replicaReady = window.TradeJournalServerReplica ? window.TradeJournalServerReplica.allReady() : Promise.resolve();
    Promise.all([sessionsAdapter.resetOnce(), replicaReady]).finally(() => {
      const failed = window.TradeJournalServerReplica ? window.TradeJournalServerReplica.failedDomains() : [];
      // Phase 8e: boot-language-gate.js (the very first script on this page, before this bundle
      // even loads) surfaces its own hydration failure through this flag rather than a
      // failedDomains() entry, since it runs before server-replica.js's 'preferences' domain is
      // even registered - checked here so that failure is never silently shown as "everything is
      // fine" just because the gate itself has no error UI of its own to render.
      if (window.__TJ_LANGUAGE_HYDRATE_FAILED__) failed.push('language');
      if (failed.length) {
        const lang = String(document.documentElement.lang || 'en').toLowerCase();
        const copy = {
          fa: 'اتصال به سرور برای بارگذاری اطلاعات شما ناموفق بود. لطفاً صفحه را دوباره بارگذاری کنید.',
          ar: 'فشل الاتصال بالخادم لتحميل بياناتك. يرجى إعادة تحميل الصفحة.',
          en: 'Could not reach the server to load your data. Please reload the page.',
          es: 'No se pudo conectar con el servidor para cargar tus datos. Recarga la página.'
        };
        const message = copy[lang] || copy.en;
        [sidebarRoot, headerRoot, sessionsRoot].forEach((root) => {
          if (!root) return;
          root.innerHTML = '';
          const banner = document.createElement('div');
          banner.setAttribute('style', 'padding:32px;text-align:center;color:#ffd7d7;font-size:14px;');
          banner.textContent = message;
          root.appendChild(banner);
        });
        return;
      }
      store.init();
      createRoot(sidebarRoot).render(<SidebarApp navryaCharacter={navryaCharacter} quotes={quotes} store={store} />);
      createRoot(headerRoot).render(<HeaderApp navryaCharacter={navryaCharacter} quotes={quotes} store={store} />);
      createRoot(sessionsRoot).render(<SessionsApp character={character} navryaCharacter={navryaCharacter} store={store} />);

      // Analysis Profiles domain first-run onboarding (see this file's own AnalysisProfileFirstRunGate,
      // above, and ARCHITECTURE.md §7.25). Gated here, after the replica boot gate has already
      // resolved above, so window.TradeJournalAnalysisProfileStore.listSync() reflects this
      // account's real, hydrated data - never a false-empty read before hydration settles. Only
      // ever shown when the user genuinely has zero profiles; a returning user with ≥1 profile
      // never sees this root render anything.
      const analysisOnboardingRoot = document.getElementById('navryaAnalysisProfileOnboardingRoot');
      if (analysisOnboardingRoot && window.TradeJournalAnalysisProfileStore && !window.TradeJournalAnalysisProfileStore.listSync().length) {
        createRoot(analysisOnboardingRoot).render(<AnalysisProfileFirstRunGate lang={String(document.documentElement.lang || 'en').toLowerCase()} />);
      }

      // Real-money subscription rollout: a page-level popup when the wallet is depleted or the
      // active subscription has hit payment trouble - no matching DOM anchor exists in any
      // character page's static HTML shell (unlike the onboarding root above), so this creates its
      // own container and appends it to <body>, the same "mount a fresh div, no template change
      // needed" approach renderAccountProfile()/openCalculator() and friends already use for
      // page-level overlays elsewhere in this app.
      const walletGateRoot = document.createElement('div');
      document.body.appendChild(walletGateRoot);
      createRoot(walletGateRoot).render(<WalletLowBalanceGate lang={String(document.documentElement.lang || 'en').toLowerCase()} />);
    });

    // The global assistant (replaces the retired global-ai-dock.js floating launcher) - always
    // mounted alongside header/sidebar, not gated behind sessionsAdapter.resetOnce() like the
    // session-scoped roots above, since it has no session data of its own to wait for.
    const chatDockRoot = document.getElementById('navryaChatDockRoot');
    if (chatDockRoot) renderChatDock(chatDockRoot, navryaCharacter);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
}
