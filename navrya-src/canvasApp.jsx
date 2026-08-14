import { renderStrategiesHub } from './strategiesHubView.jsx';
import { renderDashboard } from './dashboardView.jsx';
import { renderSettings } from './settingsView.jsx';

// panel-system.js's render('dashboard'|'strategies'|'settings') calls into this file via
// window.TradeJournalNavryaCanvas.render (see character-app.jsx's mountCharacterApp) - these are
// the only three values 'view' is ever called with (navrya-src/store.js's setActiveId only routes
// these three ids here; 'sessions' goes through panel-system.js's own library render instead).
// Each is its own full-screen React root with its own real backends and i18n - dashboardView.jsx,
// strategiesHubView.jsx, settingsView.jsx. There is no shared generic panel-grid renderer anymore:
// the last one (the old CanvasView/SettingsView pair, backed by panelsAdapter.js's 4-span scheme)
// was replaced when Settings itself got the same real-backend treatment as Dashboard/Strategies.
export function renderCanvas(character, view) {
  if (view === 'strategies') return renderStrategiesHub(character);
  if (view === 'dashboard') return renderDashboard(character);
  if (view === 'settings') return renderSettings(character);
  return null;
}
