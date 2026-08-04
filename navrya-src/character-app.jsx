import React from 'react';
import { createRoot } from 'react-dom/client';
import { Sidebar } from '../public/pages/shared/navrya/components/navigation/Sidebar.jsx';
import { CharacterHeader } from '../public/pages/shared/navrya/components/header/CharacterHeader.jsx';
import { SessionLibrary } from '../public/pages/shared/navrya/components/sessions/SessionLibrary.jsx';
import * as sessionsAdapter from './sessionsAdapter.js';
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
    { id: 'strategies', icon: 'strategies', label: t.navStrategies },
    { id: 'psychology', icon: 'psychology', label: t.navPsychology },
    { id: 'subscription', icon: 'subscription', label: t.navSubscription },
    { id: 'ai-assistant', icon: 'ai-assistant', label: t.navAiAssistant },
    { id: 'community', icon: 'community', label: t.navCommunity },
    { id: 'settings', icon: 'settings', label: t.navSettings },
    { id: 'more', icon: 'more', label: t.navMore }
  ];
}

// SCENARIOS and STREAK are computed from real stores; HONOUR and EXECUTION have no backing
// metric anywhere in this codebase and render an honest '—' rather than an invented number -
// the same "insufficient data over fabricated numbers" standard used throughout this app.
function useMetrics(sessions, t) {
  const [streak, setStreak] = React.useState(null);
  React.useEffect(() => {
    const tradeStore = window.TradeJournalTradeStore;
    const psychologyStore = window.TradeJournalPsychologyStore;
    if (!tradeStore || !psychologyStore) return;
    setStreak(psychologyStore.disciplineStreak(tradeStore.listSync()));
  }, [sessions]);
  const scenarios = React.useMemo(() => sessions.reduce((sum, s) => sum + sessionsAdapter.scenarioCount(s), 0), [sessions]);
  return [
    { icon: 'honour', label: t.honour, value: '—' },
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
  const metrics = useMetrics(s.sessions, t);
  const rules = window.TradeJournalProfileXPRules;
  const level = s.profile && rules ? rules.levelForXp(s.profile.xpTotal) : undefined;
  const xpMax = s.profile && rules ? (rules.xpForNextLevel(s.profile.xpTotal) ?? s.profile.xpTotal) : undefined;
  const marketLabels = { london: t.marketLondon, 'new-york': t.marketNewYork, tokyo: t.marketTokyo, sydney: t.marketSydney };
  const nextSession = marketAdapter.nextSessionCountdown(now);
  const markets = marketAdapter.marketStates(now).map((m) => ({ ...m, cityLabel: marketLabels[m.market] }));
  return (
    <div data-character={navryaCharacter} dir={rtl ? 'rtl' : 'ltr'} style={{ direction: rtl ? 'rtl' : 'ltr' }}>
      <CharacterHeader
        character={navryaCharacter}
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
        uptime={marketAdapter.utcClock(now)} uptimeLabel={t.appUptime}
        nextSession={{ city: marketLabels[nextSession.city.toLowerCase().replace(' ', '-')] || nextSession.city, startsIn: nextSession.startsIn }}
        nextSessionLabel={t.nextSession} startsInLabel={t.startsIn}
        markets={markets}
      />
    </div>
  );
}

function SessionsApp({ navryaCharacter, store }) {
  const s = useStore(store);
  const t = stringsFor(s.language);
  const rtl = isRtl(s.language);
  const cards = s.sessions.map((session) => {
    const props = sessionsAdapter.toCardProps(session);
    return {
      ...props,
      status: session.status === 'closed' ? t.closed : t.active,
      instrumentLabel: t.instrument, lastUpdateLabel: t.lastUpdate,
      openLabel: t.continueOpen, reportLabel: t.viewReport, repeatLabel: t.repeatCopy, deleteLabel: t.delete,
      thumbnail: s.thumbnails[session.id],
      onOpen: () => window.TradeJournalWorkspace && window.TradeJournalWorkspace.open(session.id),
      onReport: () => window.TradeJournalWorkspace && window.TradeJournalWorkspace.openReport(session.id),
      onRepeat: () => window.TradeJournalWorkspace && window.TradeJournalWorkspace.duplicate(session.id),
      onDelete: () => {
        if (window.confirm(t.deleteConfirm) && window.TradeJournalWorkspace) window.TradeJournalWorkspace.remove(session.id);
      }
    };
  });
  return (
    <div data-character={navryaCharacter} dir={rtl ? 'rtl' : 'ltr'} style={{ direction: rtl ? 'rtl' : 'ltr' }}>
      <SessionLibrary
        sessions={cards} onNewSession={store.createSession}
        title={t.sessionLibraryTitle} subtitle={t.sessionLibrarySubtitle} newSessionLabel={t.newSession}
        emptyStateProps={{ title: t.emptyTitle, helper: t.emptyHelper }}
        newSessionDialogProps={{
          labels: {
            dialogTitle: t.dialogTitle, createWithoutChart: t.createWithoutChart, cancel: t.cancel,
            uploadNotice: t.uploadNotice, uploadChart: t.uploadChart, tradingSession: t.tradingSession,
            primaryTimeframe: t.primaryTimeframe, gregorianDate: t.gregorianDate, jalaliDate: t.jalaliDate,
            loopInterval: t.loopInterval, graceMinutes: t.graceMinutes
          }
        }}
      />
    </div>
  );
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
  // DOM builders - same real localStorage panel data (navrya-src/panelsAdapter.js reads the
  // identical key format), only the rendering changes.
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

  function mount() {
    const sidebarRoot = document.getElementById('navryaSidebarRoot');
    const headerRoot = document.getElementById('navryaHeaderRoot');
    const sessionsRoot = document.getElementById('navryaSessionsRoot');
    if (!sidebarRoot || !headerRoot || !sessionsRoot) return;
    const store = createStore(character);
    sessionsAdapter.resetOnce().finally(() => {
      store.init();
      createRoot(sidebarRoot).render(<SidebarApp navryaCharacter={navryaCharacter} quotes={quotes} store={store} />);
      createRoot(headerRoot).render(<HeaderApp navryaCharacter={navryaCharacter} quotes={quotes} store={store} />);
      createRoot(sessionsRoot).render(<SessionsApp navryaCharacter={navryaCharacter} store={store} />);
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
