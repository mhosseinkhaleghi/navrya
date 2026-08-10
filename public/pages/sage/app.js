// Trimmed for the NAVRYA sidebar/header/Sessions redesign - see hunter/app.js for the detailed
// comment on why this file no longer manages the old topbar/toolbar DOM.
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
const savedLanguage = localStorage.getItem('tradejournal-language') || localStorage.getItem('sage-language') || 'fa';
localStorage.setItem('tradejournal-language', savedLanguage);
document.documentElement.lang = savedLanguage;
document.documentElement.dir = savedLanguage === 'fa' || savedLanguage === 'ar' ? 'rtl' : 'ltr';

window.TradeJournalPanelCharacter = 'sage';
