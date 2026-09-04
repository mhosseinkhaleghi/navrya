import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const [responsiveCss, sidebar, header, chatDock, voiceConsole, dashboard, strategies, subscriptions] = await Promise.all([
  readFile(path.join(root, 'public/pages/shared/navrya/responsive.css'), 'utf8'),
  readFile(path.join(root, 'public/pages/shared/navrya/components/navigation/Sidebar.jsx'), 'utf8'),
  readFile(path.join(root, 'public/pages/shared/navrya/components/header/CharacterHeader.jsx'), 'utf8'),
  readFile(path.join(root, 'public/pages/shared/navrya/components/assistant/ChatDock.jsx'), 'utf8'),
  readFile(path.join(root, 'public/pages/shared/navrya/components/assistant/VoiceConsole.jsx'), 'utf8'),
  readFile(path.join(root, 'navrya-src/dashboardView.jsx'), 'utf8'),
  readFile(path.join(root, 'navrya-src/strategiesHubView.jsx'), 'utf8'),
  readFile(path.join(root, 'navrya-src/subscriptionsView.jsx'), 'utf8')
]);

test('the phone navigation overlay locks the document but preserves its own contained navigation scroll', () => {
  assert.match(sidebar, /root\.classList\.add\('navrya-mobile-nav-open'\)/);
  assert.match(sidebar, /body\.style\.overflow = 'hidden'/);
  assert.match(sidebar, /body\.style\.touchAction = 'none'/);
  assert.match(sidebar, /root\.classList\.remove\('navrya-mobile-nav-open'\)/);
  assert.match(responsiveCss, /\.navrya-sidebar \{[\s\S]*?overflow: hidden !important;/);
  assert.match(responsiveCss, /\.navrya-sidebar \.navrya-scroll \{[\s\S]*?overflow-y: auto !important;[\s\S]*?overscroll-behavior: contain;/);
});

test('phone scrollbars are hidden and fixed assistant surfaces reserve readable page space', () => {
  assert.match(responsiveCss, /\.navrya-scroll,\s*\.navrya-scroll::\-webkit-scrollbar \{ scrollbar-width: none;/);
  assert.match(responsiveCss, /padding: 8px 8px max\(148px, calc\(var\(--navrya-chat-dock-reserved, 0px\) \+ 12px\)\);/);
  assert.match(responsiveCss, /\.app-shell \.content \{ padding-bottom: max\(24px, var\(--navrya-chat-dock-reserved, 0px\)\); \}/);
});

test('the phone header is a compact identity layout and does not expose desktop collapse controls', () => {
  assert.match(header, /if \(mobile\) \{[\s\S]*?navrya-character-header--mobile/);
  assert.match(header, /quote=\{undefined\}/);
  assert.match(header, /orientation="horizontal" showEdition=\{false\}/);
  assert.match(header, /const stacked = viewportWidth <= 1560;/);
  assert.match(responsiveCss, /\.navrya-header-collapse,\s*\.navrya-header-rail \{ display: none !important; \}/);
});

test('dashboard, strategies, and subscriptions expose responsive layout hooks instead of fixed desktop geometry', () => {
  assert.match(dashboard, /className="navrya-dashboard-actions"/);
  assert.match(dashboard, /className="navrya-dashboard-grid"/);
  assert.match(strategies, /className="navrya-strategy-card-grid"/);
  assert.match(strategies, /className="navrya-strategy-toolbar"/);
  assert.match(subscriptions, /className="navrya-subscriptions-view"/);
  assert.match(responsiveCss, /\.navrya-dashboard-actions \{ display: grid !important; grid-template-columns: minmax\(0, 1fr\); width: 100%; \}/);
  assert.match(responsiveCss, /\.navrya-dashboard-grid \{ grid-template-columns: minmax\(0, 1fr\) !important;/);
  assert.match(responsiveCss, /\.navrya-strategy-card-grid \{ grid-template-columns: minmax\(0, 1fr\) !important;/);
  assert.match(responsiveCss, /\.navrya-subscription-actions \{ display: grid !important;/);
});

test('the phone dock preserves its voice action while suppressing optional desktop controls', () => {
  assert.match(chatDock, /className="navrya-dock-primary-action"/);
  assert.match(chatDock, /className="navrya-dock-secondary-action"/);
  assert.match(responsiveCss, /\.navrya-dock-secondary-action,\s*\[data-navrya-chat-dock\] \.navrya-dock-model-switcher/);
  assert.match(responsiveCss, /\.navrya-dock-primary-action \{ width: 42px !important; height: 42px !important; \}/);
});

test('the voice console has dedicated phone geometry rather than desktop controls that overflow', () => {
  assert.match(chatDock, /className="navrya-dock-mascot"/);
  assert.match(voiceConsole, /className="navrya-voice-console"/);
  assert.match(voiceConsole, /className="navrya-voice-console-error-card"/);
  assert.match(voiceConsole, /className="navrya-voice-console-controls"/);
  assert.match(voiceConsole, /className="navrya-voice-console-main-action"/);
  assert.match(responsiveCss, /\.navrya-voice-console-controls \{ display: grid !important; grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
  assert.match(responsiveCss, /\.navrya-voice-console-main-action \{ grid-column: 1 \/ -1;/);
  assert.match(responsiveCss, /\.navrya-voice-console-error-actions \{ grid-column: 1 \/ -1;/);
});
