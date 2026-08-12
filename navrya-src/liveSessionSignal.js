// Cross-root signal for "a live session is open on the Sessions screen". HeaderApp and
// SessionsApp are two independent createRoot() trees (see character-app.jsx's comment on why),
// so they can't share React state directly - mirrors ai-settings-store.js's notify() CustomEvent
// pattern used elsewhere in this codebase for the same "two roots, one shared fact" problem.
// session-workspace-logic.js's open()/openReport()/reopen()/duplicate() all funnel through here
// too, via the window.TradeJournalNavryaLiveSession hook it defers to when present.
const EVENT = 'tradejournal:live-session-open-changed';
let openSessionId = null;
let openView = 'timeline';

export function getLiveSessionId() { return openSessionId; }
export function getLiveSessionView() { return openView; }

export function openLiveSession(id, view) {
  openSessionId = id;
  openView = view === 'report' ? 'report' : 'timeline';
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function closeLiveSession() {
  openSessionId = null;
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function subscribeLiveSession(fn) {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}
