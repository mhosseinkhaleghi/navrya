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

// Phase 8e of the local-first-to-server-authoritative migration (see ARCHITECTURE.md's Known
// Constraints section): lang/dir are now set by boot-language-gate.js, the very first script on
// this page (before this file even loads) - see hunter/app.js's own comment for the full detail.

window.TradeJournalPanelCharacter = 'sage';
