import React from 'react';
import { createRoot } from 'react-dom/client';
import { Sidebar } from '../public/pages/shared/navrya/components/navigation/Sidebar.jsx';
import { CharacterHeader } from '../public/pages/shared/navrya/components/header/CharacterHeader.jsx';
import { MarketSessionCard } from '../public/pages/shared/navrya/components/market/MarketSessionCard.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
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
import { openIntake } from './mentalHealthIntakeModal.jsx';
import { openCalculator } from './tradeCalculatorModal.jsx';
import { openLogWizard } from './tradeLogModal.jsx';
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
      {/* Full header, collapsible to nothing - the "Collapse header" button sits over its own
          bottom-left corner (absolute, matching the design handoff) so it never displaces the
          header's own content. */}
      <div style={{ overflow: 'hidden', transition: 'max-height 220ms cubic-bezier(.22,.61,.36,1), opacity 220ms cubic-bezier(.22,.61,.36,1)', maxHeight: headerOpen ? 400 : 0, opacity: headerOpen ? 1 : 0 }}>
        <div style={{ position: 'relative' }}>
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
          <button
            type="button" onClick={() => setHeaderOpen(false)}
            style={{
              position: 'absolute', [rtl ? 'right' : 'left']: 24, bottom: 14, width: 196, height: 40, boxSizing: 'border-box',
              display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', borderRadius: 8, cursor: 'pointer',
              border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.6)', color: 'var(--text-muted)',
              font: 'var(--type-section-label)', letterSpacing: '.1em', textTransform: 'uppercase'
            }}
          >
            <Icon name="chevrons-up" size={18} />
            {t.collapseHeader}
          </button>
        </div>
      </div>
      {/* Compact live-clock rail shown in place of the header once collapsed - the same four
          MarketSessionCard rows the full header's own market strip uses, just laid out inline. */}
      <div style={{ overflow: 'hidden', transition: 'max-height 220ms cubic-bezier(.22,.61,.36,1), opacity 220ms cubic-bezier(.22,.61,.36,1)', maxHeight: headerOpen ? 0 : 80, opacity: headerOpen ? 0 : 1 }}>
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
            type="button" onClick={() => setHeaderOpen(true)} aria-label={t.expandHeader} title={t.expandHeader}
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
      )}
    </div>
  );
}

// Plain DOM, not a React root - it needs to exist before/outside any of the roots mount() creates,
// and never re-renders (the grid is static; the glow's color follows --char-atmosphere via CSS,
// not JS). Guarded so a hot-reload or a second mount() call never stacks a duplicate pair.
function ensureBackgroundLayer(navryaCharacter) {
  if (document.getElementById('navryaBackgroundGrid')) return;
  const grid = document.createElement('span');
  grid.id = 'navryaBackgroundGrid';
  grid.setAttribute('aria-hidden', 'true');
  grid.setAttribute('data-character', navryaCharacter);
  grid.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:0;opacity:.5;'
    + 'background-image:linear-gradient(rgba(38,51,50,.28) 1px,transparent 1px),linear-gradient(90deg,rgba(38,51,50,.28) 1px,transparent 1px);'
    + 'background-size:48px 48px';
  const glow = document.createElement('span');
  glow.setAttribute('aria-hidden', 'true');
  glow.setAttribute('data-character', navryaCharacter);
  glow.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:0;opacity:.8;'
    + 'background:radial-gradient(90% 70% at 20% 0%,var(--char-atmosphere) 0%,transparent 70%)';
  document.body.insertBefore(glow, document.body.firstChild);
  document.body.insertBefore(grid, document.body.firstChild);
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
        description: 'Create a new trading session',
        aliases: ['start session', 'new session', 'open a session', 'start a session'],
        requiredFields: ['city', 'timeframe'],
        optionalFields: ['gregorian', 'jalali', 'loop', 'grace'],
        available: () => true,
        open: () => {
          if (getLiveSessionId()) closeLiveSession();
          if (store.getState().activeId !== 'sessions') store.setActiveId('sessions');
          window.dispatchEvent(new CustomEvent('tradejournal:ai-open-new-session'));
        },
        normalizeField: (path, value) => {
          if (path === 'city') return normalizeSessionCity(value);
          if (path === 'timeframe') return normalizeSessionTimeframe(value);
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
        description: 'Plan and open a new trade (direction, entry, stop, target, risk). linkedStrategyId/linkedPatternIds: pass the Strategy/Pattern NAME exactly as the user said it (e.g. "Conservative Scalper") - NAVRYA resolves the real id from that name itself; never invent or omit it for lacking a real id. IMPORTANT - riskPercent (and every other field): extraction and safety policy are two different, separate jobs, and enforcing policy is never your job here, even once. Put the exact riskPercent number the user literally typed into the suggestion/fields array on every single turn they state one, with zero exceptions - including a message that also mentions anger, recent losses, or stress in the same breath. NAVRYA itself runs a real, deterministic check on that number after you extract it and will pause for explicit confirmation if it conflicts with anything - that downstream check is the ONLY thing allowed to hold the value back, and it can only do that if you hand the number over first. Silently re-suggesting the OLD value, or leaving the field out of your suggestion, is a bug: it skips NAVRYA own real safety check entirely and is far less safe than extracting the number and letting NAVRYA evaluate it. You may still say in your own reply that you are concerned - just also extract the number.',
        aliases: ['take a long', 'take a short', 'go long', 'go short', 'open a trade', 'start a trade', 'size a trade', 'plan a trade', 'open a position', 'open a long position', 'open a short position'],
        requiredFields: ['direction', 'entryPrice', 'stopLoss', 'riskPercent', 'takeProfits'],
        optionalFields: ['leverage', 'marginMode', 'accountBalance', 'riskAmount', 'linkedStrategyId', 'linkedPatternIds'],
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
          }
        },
        normalizeField: (path, value) => {
          var helpers = window.TradeJournalAITradeActions;
          if (!helpers) return value;
          var strategyStore = window.TradeJournalStrategyEducationStore;
          var patternStore = window.TradeJournalPatternStore;
          return helpers.normalizeField(path, value, {
            strategies: strategyStore && typeof strategyStore.listActive === 'function' ? strategyStore.listActive() : [],
            patterns: patternStore && typeof patternStore.listForScenarios === 'function' ? patternStore.listForScenarios() : []
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
        description: 'Navigate to a real page/section of NAVRYA. Valid domainId values: dashboard, sessions, strategies, patterns, settings, psychology, ai-assistant, community, account. There is no single dedicated page for "reports"/"trading calendar" (legacy, unreachable from current navigation), "trade-planning"/"open positions" (spans three real surfaces, not one page), or "character" (switching the active character is done from Settings) - if asked to go to one of those, say plainly that no such page exists rather than calling this action.',
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
        description: 'Create a new market Pattern definition in NAVRYA (name, optional description, optional completion threshold percentage from 0 to 100). Opens the real Pattern editor immediately.',
        aliases: ['create a pattern', 'new pattern', 'make a pattern', 'add a pattern', 'create a new pattern', 'define a pattern'],
        requiredFields: ['name'], optionalFields: ['description', 'completionThreshold'],
        available: () => true,
        open: () => new Promise((resolve) => {
          if (store.getState().activeId !== 'strategies') store.setActiveId('strategies');
          pollFor(
            () => window.TradeJournalNavryaPatternHub,
            (hub) => {
              var created = hub.createNew();
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
        description: 'Open an EXISTING market Pattern by name so its name, description, or completion threshold percentage (0-100) can be edited. patternName identifies which existing Pattern to open - it is never a rename. Only select this action once the user has actually named which existing Pattern they mean; if they have not, ask them which Pattern first instead of guessing.',
        aliases: ['edit a pattern', 'edit the pattern', 'update a pattern', 'change the pattern', 'open the pattern'],
        requiredFields: ['patternName'], optionalFields: ['name', 'description', 'completionThreshold'],
        available: () => true,
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

    sessionsAdapter.resetOnce().finally(() => {
      store.init();
      createRoot(sidebarRoot).render(<SidebarApp navryaCharacter={navryaCharacter} quotes={quotes} store={store} />);
      createRoot(headerRoot).render(<HeaderApp navryaCharacter={navryaCharacter} quotes={quotes} store={store} />);
      createRoot(sessionsRoot).render(<SessionsApp character={character} navryaCharacter={navryaCharacter} store={store} />);
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
