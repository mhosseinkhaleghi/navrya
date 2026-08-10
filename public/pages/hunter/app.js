// Trimmed for the NAVRYA sidebar/header/Sessions redesign: the old topbar (language picker,
// market clocks, settings gear, level ring) and the old static Sessions toolbar/cards
// (#newSession, .search-box, .star, .view-toggle) no longer exist in the DOM - all of that
// logic moved into navrya-hunter-sessions-app.js. What's kept here is only what every OTHER
// (still-legacy) tab on this page depends on: the toast element, and document.documentElement's
// lang/dir bootstrap (several modules - session-library's successor, psychology-store,
// account-profile-i18n, mental-health-i18n - read document.documentElement.lang directly or via
// a MutationObserver, so this must still run before those scripts do).
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

// Unified with the select (login) page's own key - a language chosen at login must carry
// through into every character dashboard instead of each one defaulting to Persian on its own.
// The old per-character key is kept only as a fallback for a browser that set it before this
// fix shipped; the unified key then becomes canonical going forward.
const savedLanguage = localStorage.getItem('tradejournal-language') || localStorage.getItem('hunter-language') || 'fa';
localStorage.setItem('tradejournal-language', savedLanguage);
document.documentElement.lang = savedLanguage;
document.documentElement.dir = savedLanguage === 'fa' || savedLanguage === 'ar' ? 'rtl' : 'ltr';

window.TradeJournalPanelCharacter = 'hunter';
