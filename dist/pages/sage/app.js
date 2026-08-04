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

const savedLanguage = localStorage.getItem('sage-language') || 'fa';
document.documentElement.lang = savedLanguage;
document.documentElement.dir = savedLanguage === 'fa' || savedLanguage === 'ar' ? 'rtl' : 'ltr';

window.TradeJournalPanelCharacter = 'sage';
