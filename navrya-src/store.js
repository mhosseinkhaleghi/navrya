// A tiny external store (React 18 useSyncExternalStore pattern) shared across the three
// independent React roots each character's bundle mounts (sidebar / header / sessions list).
// They can't share React context since each is its own createRoot() tree - only the
// sidebar+header roots stay permanently visible while the sessions-list root lives inside the
// legacy `.content` element and gets hidden/shown by panel-system.js's existing legacyChildren
// mechanism, so they must be separate mounts, not one tree. One store instance per character
// (createStore(character)), since each character page is its own bundle/module scope.
import * as sessionsAdapter from './sessionsAdapter.js';

export function createStore(character) {
  // Unified with the select (login) page's own key so a language switch made from inside a
  // character dashboard is visible everywhere else too - the app, not just this one character.
  const languageKey = 'tradejournal-language';
  const listeners = new Set();

  // useSyncExternalStore compares snapshots with Object.is - mutating one shared object in
  // place and returning that same reference from getState() means React never sees a change
  // (this was a real bug: the sidebar's collapse toggle silently did nothing, since nothing
  // ever re-rendered from a store update alone - HeaderApp only *looked* reactive because its
  // own once-a-second clock forces a re-render regardless of the store). Every setter below
  // replaces `state` with a new object instead of mutating the old one.
  let state = {
    language: document.documentElement.lang || 'fa',
    collapsed: false,
    activeId: 'sessions',
    sessions: [],
    thumbnails: {},
    profile: null,
    nextGoal: null
  };

  function emit() { listeners.forEach((fn) => fn()); }
  function set(patch) { state = { ...state, ...patch }; emit(); }

  function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  function getState() { return state; }

  function setLanguage(lang) {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'fa' || lang === 'ar' ? 'rtl' : 'ltr';
    localStorage.setItem(languageKey, lang);
    set({ language: lang });
  }

  function setCollapsed(collapsed) { set({ collapsed }); }

  function setActiveId(id) {
    const layer = window.TradeJournalPanelLayer;
    if (id === 'sessions') { if (layer) layer.render('library'); set({ activeId: id }); return; }
    if (id === 'dashboard' || id === 'strategies' || id === 'settings') { if (layer) layer.render(id); set({ activeId: id }); return; }
    const hashById = { psychology: '#mindset', 'ai-assistant': '#ai-settings', community: '#community', subscription: '#account/profile/subscriptions' };
    if (hashById[id]) location.hash = hashById[id];
    set({ activeId: id });
  }

  function refreshSessions() {
    const all = sessionsAdapter.sanitizeSessions(character, sessionsAdapter.readSessions(character));
    set({ sessions: all });
    all.forEach((session) => {
      sessionsAdapter.loadThumbnail(session).then((url) => {
        if (url && state.thumbnails[session.id] !== url) set({ thumbnails: { ...state.thumbnails, [session.id]: url } });
      });
    });
  }

  function refreshProfile() {
    const accountProfileStore = window.TradeJournalAccountProfileStore;
    if (!accountProfileStore) return;
    accountProfileStore.getProfile().then((profile) => set({ profile })).catch(() => {});
    // Real "what to do next" guidance for the sidebar's reward widget (Section 11's XP engine) -
    // previously always showed the same hardcoded chest/250 XP/73% regardless of trader state.
    if (accountProfileStore.nextGoal) accountProfileStore.nextGoal().then((nextGoal) => set({ nextGoal })).catch(() => {});
  }

  function init() {
    refreshSessions();
    refreshProfile();
    window.addEventListener('tradejournal:sessions-changed', refreshSessions);
    // Re-derive nextGoal whenever any of the domains it depends on change, so completing (say)
    // the first Trade updates the sidebar without waiting for a full page reload.
    ['tradejournal:trades-changed', 'tradejournal:sessions-changed', 'tradejournal:patterns-changed',
      'tradejournal:strategy-education-changed', 'tradejournal:mental-health-changed', 'tradejournal:listing-published'
    ].forEach((eventName) => window.addEventListener(eventName, refreshProfile));
  }

  function createSession(values) { return sessionsAdapter.createSession(character, values); }

  return { subscribe, getState, setLanguage, setCollapsed, setActiveId, init, createSession, character };
}
