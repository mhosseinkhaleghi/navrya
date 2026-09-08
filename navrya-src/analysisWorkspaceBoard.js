// Analysis Workspace board persistence - the deliberate sibling of dashboardView.jsx's own
// boardKey()/loadBoard()/saveBoard(), following the identical contract (one whole-board object
// per character, read and written through window.TradeJournalUserPreferences rather than
// localStorage, a change event dispatched on every save) instead of a parallel, slightly
// different scheme. Phase 8d of the local-first-to-server-authoritative migration applies here
// exactly as it does there: boardKey(character) is a preference key, not a storage key, and the
// synchronous getPref() read is safe as a lazy useState initializer because this board only ever
// mounts inside an already-open Live Session, well after the app's own boot gate has resolved.
//
// ONE documented difference from the Dashboard's board, forced by the surface itself. The
// Dashboard is a free 12-column flow grid, so a panel's width is a `span` (3/4/6/8/12). The
// Analysis Workspace is the two-column cockpit the Live Session has always had: a wide column
// that scrolls (sticky chart/timeline register pinned at its top) beside a narrow 326px rail
// that stays put. Both columns' sticky behaviour is a real feature - the register and the
// session dashboard have to stay visible while the trader scrolls through entries - and a flat
// flow grid cannot reproduce it (three rail panels against two main-column panels do not tile
// into two clean columns; the third would wrap under the wide column). So width here is which
// REGION a panel sits in - 'main' (wide) or 'rail' (narrow) - and "resize" is a move between
// them. Ordering, hiding, removing, re-adding, the persisted object shape and the change event
// all match the Dashboard exactly.
export const REGIONS = ['main', 'rail'];

// Reproduces the pre-board Timeline layout exactly: register then selected-entry detail down the
// wide column; session dashboard, previous-session summary and similar sessions down the rail.
export const DEFAULT_BOARD = ['cockpit', 'entry', 'dashboard', 'prevSummary', 'similar'];
export const DEFAULT_REGIONS = {
  cockpit: 'main', entry: 'main', dashboard: 'rail', prevSummary: 'rail', similar: 'rail'
};

// Underscore, NOT the colon dashboardView.jsx's own boardKey() uses. server/community/
// routes.preferences.mjs validates every preference id against /^[A-Za-z][A-Za-z0-9_-]{0,63}$/,
// which has no ':' in it - a colon key is rejected with VALIDATION_FAILED, and server-replica.js
// then rolls the optimistic local write back and toasts a save failure, so the layout silently
// never persists. (The Dashboard's 'dashboardBoard:<character>' key has exactly this defect; it is
// its own pre-existing bug, reported separately rather than silently changed from here.)
export function boardKey(character) { return 'analysisWorkspaceBoard_' + character; }

// `custom` is carried through untouched (never read in this pass) purely to keep the persisted
// shape identical to the Dashboard board's - the AI-authored-panel work is a separate phase, and
// a board saved now must not need a migration when it lands.
export function defaultState() {
  return { board: DEFAULT_BOARD.slice(), regions: {}, hidden: {}, custom: {} };
}

export function loadBoard(character) {
  const prefs = window.TradeJournalUserPreferences;
  const saved = prefs ? prefs.getPref(boardKey(character), null) : null;
  if (saved && Array.isArray(saved.board)) {
    return { board: saved.board, regions: saved.regions || {}, hidden: saved.hidden || {}, custom: saved.custom || {} };
  }
  return defaultState();
}

export function saveBoard(character, value) {
  const prefs = window.TradeJournalUserPreferences;
  if (prefs) prefs.setPref(boardKey(character), value);
  window.dispatchEvent(new CustomEvent('tradejournal:analysis-workspace-board-changed', { detail: { character } }));
}

// A panel's own default region unless the trader has explicitly moved it. An unknown id (a board
// saved by a newer build, or a future custom panel) falls back to the wide column rather than
// silently vanishing into a rail it was never designed for.
export function regionOf(state, id) {
  const region = state.regions && state.regions[id];
  return REGIONS.indexOf(region) >= 0 ? region : (DEFAULT_REGIONS[id] || 'main');
}
