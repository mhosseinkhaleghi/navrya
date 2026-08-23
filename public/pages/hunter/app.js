// Trimmed for the NAVRYA sidebar/header/Sessions redesign: the old topbar (language picker,
// market clocks, settings gear, level ring) and the old static Sessions toolbar/cards
// (#newSession, .search-box, .star, .view-toggle) no longer exist in the DOM - all of that
// logic moved into navrya-hunter-sessions-app.js. What's kept here is only what every OTHER
// (still-legacy) tab on this page depends on: the toast element. document.documentElement's
// lang/dir bootstrap (several modules - session-library's successor, psychology-store,
// account-profile-i18n, mental-health-i18n - read document.documentElement.lang directly or via
// a MutationObserver) moved to boot-language-gate.js, the very first script on the page - see
// its own comment below and in that file.
const toast = document.querySelector('.toast');
let toastTimer;

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2600);
}
window.TradeJournalShowToast = showToast;

// Phase 8e of the local-first-to-server-authoritative migration (see ARCHITECTURE.md's Known
// Constraints section): lang/dir are now set by boot-language-gate.js, the very first script on
// this page (before this file even loads) - it reads the real server-stored preference and
// reveals the page only once known, instead of this file synchronously reading localStorage.
// No code here needs the value directly; every later reader already reads
// document.documentElement.lang/dir off the DOM, already set correctly by the time this runs.

window.TradeJournalPanelCharacter = 'hunter';
