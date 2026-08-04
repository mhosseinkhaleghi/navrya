import { CHARACTERS } from './characters.js';

// panel-system.js sets window.TradeJournalPanelLayer.character synchronously on every
// character page load - the one reliable source of "which character is this" that every
// view mounted outside the tagged Sidebar/Header/Sessions roots (Dashboard, Strategies,
// Psychology, AI Assistant, Community, Pattern Registry, Strategy Education, Subscription,
// and the modals that mount straight onto document.body) can read, without needing every
// render*() call site in character-app.jsx's hook wiring to thread a character prop through.
export function currentNavryaCharacter() {
  const layer = window.TradeJournalPanelLayer;
  const appCharacter = (layer && layer.character) || 'hunter';
  return (CHARACTERS[appCharacter] && CHARACTERS[appCharacter].navryaCharacter) || 'hunter';
}
