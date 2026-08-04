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

const savedLanguage = localStorage.getItem('hunter-language') || 'fa';
document.documentElement.lang = savedLanguage;
document.documentElement.dir = savedLanguage === 'fa' || savedLanguage === 'ar' ? 'rtl' : 'ltr';

window.TradeJournalPanelCharacter = 'hunter';
