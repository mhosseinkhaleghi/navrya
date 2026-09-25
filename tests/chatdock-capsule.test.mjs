import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  computeSideLane, sameLane, sideForDir, sideReservePx, isLaneDialog,
  SIDECAR_WIDTH_PX, SIDECAR_EDGE_PX, SIDECAR_MIN_HEIGHT_PX
} from '../public/pages/shared/navrya/components/assistant/dockSideLane.js';
import { receiptEntry, workflowReceipts, NAV_LABEL_KEYS, companionDisplayName } from '../navrya-src/chatDockReceipts.js';

// ChatDock companion capsule redesign (artbook plates III/IV/VII): one flush capsule, the character
// as the companion's identity, receipts instead of raw workflow paths, and a lane beside an open
// dialog. The geometry and wording are pure modules tested as data here; the JSX has no DOM test
// harness in this project, so the rendering contract is guarded statically below (same convention
// as tests/chatdock-modal-spacing.test.mjs), and real-browser verification is the user's own pass.

const root = process.cwd();
const read = (...p) => readFile(path.join(root, ...p), 'utf8').then((s) => s.replace(/\r\n/g, '\n'));
const assistant = (f) => read('public', 'pages', 'shared', 'navrya', 'components', 'assistant', f);
const [dockSrc, popoverSrc, consoleSrc, sigilSrc, modalSrc, viewSrc, i18nSrc, responsiveCss] = await Promise.all([
  assistant('ChatDock.jsx'), assistant('ChatResponsePopover.jsx'), assistant('VoiceConsole.jsx'), assistant('CompanionSigil.jsx'),
  read('public', 'pages', 'shared', 'navrya', 'components', 'feedback', 'Modal.jsx'),
  read('navrya-src', 'chatDockView.jsx'), read('public', 'pages', 'shared', 'ai-i18n.js'),
  read('public', 'pages', 'shared', 'navrya', 'responsive.css')
]);

// Absence checks look at code only - the files' own history comments name what was removed.
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// A Modal.jsx dialog of `width`, centred in the backdrop's padded box (24px + reserve on the side).
function modalRect(vw, vh, width, height, reserveLeft = 0, reserveRight = 0) {
  const boxLeft = 24 + reserveLeft;
  const boxWidth = vw - boxLeft - 24 - reserveRight;
  const w = Math.min(width, boxWidth);
  const left = boxLeft + (boxWidth - w) / 2;
  const top = (vh - height) / 2;
  return { left, right: left + w, top, bottom: top + height, width: w, height };
}

test('the lane is on the inline-end side: left in RTL, right in LTR', () => {
  assert.equal(sideForDir('rtl'), 'left');
  assert.equal(sideForDir('ltr'), 'right');
  assert.equal(sideReservePx(), SIDECAR_EDGE_PX + SIDECAR_WIDTH_PX + 12);
});

test('a 1080px account form on a ~1740px screen only clears the lane once Modal.jsx reserves it - which is why ChatDock publishes the reserve before measuring', () => {
  const vw = 1740; const vh = 960;
  const unreserved = modalRect(vw, vh, 1080, 720);
  assert.equal(computeSideLane({ viewportWidth: vw, viewportHeight: vh, dir: 'rtl', dialogRect: unreserved }), null, 'centred with no reserve, the dialog overlaps the lane');
  const reserved = modalRect(vw, vh, 1080, 720, sideReservePx(), 0);
  const lane = computeSideLane({ viewportWidth: vw, viewportHeight: vh, dir: 'rtl', dialogRect: reserved });
  assert.ok(lane, 'with the reserve the dialog re-centres clear of the lane');
  assert.equal(lane.side, 'left');
  assert.equal(lane.width, SIDECAR_WIDTH_PX);
  assert.equal(lane.bottom, Math.round(vh - reserved.bottom), 'the lane is bottom-aligned with the dialog');
  assert.equal(lane.height, Math.round(reserved.bottom - reserved.top));
  assert.ok(SIDECAR_EDGE_PX + lane.width <= reserved.left, 'the lane never reaches into the dialog');
});

test('LTR mirrors onto the right-hand side', () => {
  const vw = 1600; const vh = 900;
  const rect = modalRect(vw, vh, 860, 640, 0, sideReservePx());
  const lane = computeSideLane({ viewportWidth: vw, viewportHeight: vh, dir: 'ltr', dialogRect: rect });
  assert.ok(lane);
  assert.equal(lane.side, 'right');
  assert.ok(vw - SIDECAR_EDGE_PX - lane.width >= rect.right);
});

test('no lane below 1280px, for small aria-modal surfaces (menus/pickers), or for a dialog that still overlaps (a hand-rolled one that ignores the reserve)', () => {
  const vh = 900;
  assert.equal(computeSideLane({ viewportWidth: 1279, viewportHeight: vh, dir: 'rtl', dialogRect: modalRect(1279, vh, 700, 600, sideReservePx()) }), null);
  assert.equal(isLaneDialog({ width: 300, height: 400 }), false);
  assert.equal(isLaneDialog({ width: 600, height: 200 }), false);
  assert.equal(computeSideLane({ viewportWidth: 1600, viewportHeight: vh, dir: 'rtl', dialogRect: { left: 24, right: 1576, top: 24, bottom: 876, width: 1552, height: 852 } }), null);
  assert.equal(computeSideLane({ viewportWidth: 1600, viewportHeight: vh, dir: 'rtl', dialogRect: null }), null);
});

test('a short dialog still gets a usable lane (minimum height), anchored to the dialog bottom and kept inside the viewport', () => {
  const vw = 1600; const vh = 900;
  const rect = modalRect(vw, vh, 600, 260, sideReservePx());
  const lane = computeSideLane({ viewportWidth: vw, viewportHeight: vh, dir: 'rtl', dialogRect: rect });
  assert.ok(lane);
  assert.equal(lane.height, SIDECAR_MIN_HEIGHT_PX);
  assert.equal(lane.bottom, Math.round(vh - rect.bottom));
});

test('sameLane() compares by value so ChatDock only re-renders when the lane really moved', () => {
  const a = { side: 'left', width: 376, bottom: 120, height: 600 };
  assert.equal(sameLane(a, { ...a }), true);
  assert.equal(sameLane(a, { ...a, bottom: 121 }), false);
  assert.equal(sameLane(null, null), true);
  assert.equal(sameLane(a, null), false);
});

const opts = {
  navLabel: (key) => ({ navDashboard: 'داشبورد', navAccounts: 'حساب‌ها', navStrategies: 'استراتژی‌ها' })[key] || null,
  fieldLabel: (processId, p) => (processId === 'account-manual-form' ? ({ platform: 'پلتفرم / بروکر', isProp: 'حساب فرم' })[p] || null : null)
};

test('receipts: a navigation reads as the page\'s own sidebar label, never "domainId: dashboard"', () => {
  assert.equal(receiptEntry('navigate-to', 'domainId', 'dashboard', opts), 'داشبورد');
  assert.equal(receiptEntry('navigate-to', 'domainId', 'patterns', opts), 'استراتژی‌ها', 'patterns lands on the Strategies page, like NAVIGATE_TARGETS');
  assert.equal(receiptEntry('navigate-to', 'domainId', 'unknown-page', opts), 'unknown-page');
  for (const key of Object.values(NAV_LABEL_KEYS)) assert.match(key, /^nav[A-Z]/);
});

test('receipts: a form field uses its real interview label; no label shows the value alone; booleans never print true/false; nothing applied is hidden', () => {
  assert.equal(receiptEntry('account-manual-form', 'platform', 'MetaTrader 5', opts), 'پلتفرم / بروکر: MetaTrader 5');
  assert.equal(receiptEntry('session-create', 'tradingSession', 'new-york', opts), 'new-york');
  assert.equal(receiptEntry('account-manual-form', 'isProp', true, opts), 'حساب فرم: ✓');
  assert.equal(receiptEntry('x', 'flag', false, opts), '—');
  assert.equal(receiptEntry('x', 'tags', ['a', 'b'], opts), 'a, b');
  assert.equal(receiptEntry('x', 'nested', { a: 1 }, opts), 'nested', 'a value with no text form falls back to its path instead of disappearing');
  assert.deepEqual(
    workflowReceipts({ processId: 'account-manual-form', known: { platform: 'MetaTrader 5', initialBalance: 100000 } }, opts),
    ['پلتفرم / بروکر: MetaTrader 5', '100000']
  );
  assert.deepEqual(workflowReceipts(null, opts), []);
});

test('chatDockView.jsx builds the popover meta from receipts and passes the character as the companion', () => {
  assert.match(viewSrc, /meta: workflowReceipts\(result\.workflow, receipts\)/);
  assert.doesNotMatch(code(viewSrc), /Object\.keys\(result\.workflow\.known \|\| \{\}\)\.map\(\(path\) => `\$\{path\}: /);
  assert.match(viewSrc, /const companion = companionFor\(i18n, navryaCharacter\);/);
  assert.match(viewSrc, /stringsFor\(languageOf\(i18n\)\)\.charTitle/);
  assert.match(viewSrc, /assetUrl\('assets\/portraits\/portrait-' \+ navryaCharacter \+ '\.webp'\)/);
  assert.match(viewSrc, /companion=\{companion\} surfaceJoined=\{historyOpen \|\| !!\(popover && popover\.open\)\}/);
  assert.match(viewSrc, /companion=\{companion\} joined statusLabel=\{i18n\.t\('aiDockStatusReady'\)\}/);
});

test('the reply header is the companion (portrait + name + engine label); the technical labels and the stage rail are gone', () => {
  assert.doesNotMatch(code(popoverSrc), /' · CHAT'/);
  assert.doesNotMatch(code(popoverSrc), /RULE ENGINE/);
  assert.doesNotMatch(code(popoverSrc), /STAGE_META|HeightStageRail|'FOLDED'/);
  assert.doesNotMatch(code(popoverSrc), /StatCell/);
  const header = popoverSrc.slice(popoverSrc.indexOf('<header'), popoverSrc.indexOf('</header>'));
  assert.match(header, /<CompanionSigil portrait=\{portrait\} size=\{36\} state=\{thinking \? 'thinking' : 'idle'\} \/>/);
  assert.match(header, /<EngineChip model=\{model\}/);
  assert.match(header, /toggleFold/, 'fold (collapse to the header) is kept');
  assert.match(popoverSrc, /const THREAD_MAX_HEIGHT = 'min\(44vh, 520px\)';/);
  assert.match(popoverSrc, /<ReceiptChip key=\{i\} label=\{cell\.label\} value=\{cell\.value\} \/>/);
});

test('`joined` squares the reply\'s bottom and the row\'s top so the two stacked elements read as one capsule', () => {
  assert.match(popoverSrc, /borderRadius: joined \? `\$\{radius\}px \$\{radius\}px 0 0` : radius,/);
  assert.match(popoverSrc, /borderBottom: joined \? 0 : undefined,/);
  assert.match(dockSrc, /const rowRadius = surfaceJoined \? `0 0 \$\{CAPSULE_RADIUS_PX\}px \$\{CAPSULE_RADIUS_PX\}px` : CAPSULE_RADIUS_PX;/);
  assert.match(dockSrc, /borderTop: surfaceJoined \? '1px solid var\(--border-hairline\)' : undefined,/);
  assert.match(dockSrc, /companion=\{companion\} joinedTop=\{surfaceJoined\}/, 'the Voice console joins the same way');
  assert.match(consoleSrc, /borderRadius: joinedTop \? '0 0 20px 20px' : 20,/);
});

test('the dock row opens with the character\'s portrait, not the engine mascot, and shows one Voice button unless there is typed text', () => {
  assert.doesNotMatch(code(dockSrc), /ModelMascot/);
  assert.match(dockSrc, /<CompanionSigil className="navrya-dock-mascot" portrait=\{companion && companion\.portrait\} size=\{40\} state=\{sigilState\} \/>/);
  assert.match(dockSrc, /\{onVoiceToggle && showSend && \(\s*\n\s*<DockButton className="navrya-dock-mic"/);
  assert.match(sigilSrc, /export function CompanionSigil/);
  assert.doesNotMatch(code(sigilSrc), /onClick/, 'the sigil is decorative - never a decoy control');
});

test('voice is a state of the same capsule: one status line and one compact row, with no identity header of its own, no engine logo, no decorative non-buttons', () => {
  const c = code(consoleSrc);
  assert.doesNotMatch(c, /· VOICE|PHASE_CODE|'MIC DENIED'/);
  assert.doesNotMatch(c, /navrya-voice-console-volume|navrya-voice-console-speed|'volume-2'|>1×</);
  assert.doesNotMatch(c, /ModelGlyph|EngineChip/, 'the joined reply header is the one identity header; the thinking state never shows the engine logo');
  assert.match(consoleSrc, /<CompanionSigil className="navrya-voice-console-sigil" portrait=\{companion && companion\.portrait\} size=\{40\}/);
  assert.match(consoleSrc, /<VoiceMeter voiceState=\{voiceState\} muted=\{voiceMuted\} getVoiceMediaStream=\{getVoiceMediaStream\} count=\{34\} height=\{30\}/);
  const controls = consoleSrc.slice(consoleSrc.indexOf('className="navrya-voice-console-controls"'), consoleSrc.indexOf('export function VoiceMiniBar'));
  for (const piece of ['navrya-voice-console-mute', 'navrya-voice-console-captions', 'navrya-voice-console-type', 'navrya-voice-console-main-action', 'navrya-voice-console-end']) {
    assert.ok(controls.includes(piece), piece + ' sits in the one control row');
  }
  assert.match(consoleSrc, /data-navrya-assistant="voice-mini"\s*\n\s*style=\{\{ \.\.\.capsuleFrame\(joinedTop\)/, 'the minimized row is the same capsule shape, joined like the console');
});

test('placement: no dialog = bottom; a lane that clears the dialog = side; otherwise under - the reserve is published before measuring and a dialog that ignored it is never retried', () => {
  assert.match(dockSrc, /document\.querySelectorAll\('\[role="dialog"\]\[aria-modal="true"\]'\)/);
  const effect = dockSrc.slice(dockSrc.indexOf('const [dockMode, setDockMode]'), dockSrc.indexOf('const inLane = dockMode'));
  assert.ok(effect.indexOf('publishSide(true);') > -1 && effect.indexOf('publishSide(true);') < effect.indexOf('computeSideLane('), 'the reserve is published before the dialog is measured');
  assert.match(effect, /if \(!dialog\) \{ setHost\(null\); publishSide\(false\); commit\('free', null\); return; \}/);
  assert.match(effect, /if \(lane\) \{ commit\('side', lane\); return; \}/);
  assert.match(effect, /if \(refused\) refused\.add\(dialog\);\s*\n\s*\}\s*\n\s*publishSide\(false\);\s*\n\s*setHost\(host, 'under'\);\s*\n\s*commit\('under', null\);/);
  assert.match(effect, /new MutationObserver\(schedule\)/);
  assert.match(effect, /new ResizeObserver\(schedule\)/);
  assert.match(effect, /setSideLane\(\(prev\) => \(sameLane\(prev, lane\) \? prev : lane\)\);/);
  assert.match(effect, /root\.style\.removeProperty\('--navrya-chat-dock-side-left'\);/);
  assert.match(effect, /root\.style\.removeProperty\('--navrya-chat-dock-side-right'\);/);
  assert.match(dockSrc, /data-navrya-dock-layout=\{dockLayout\}/);
  assert.match(dockSrc, /<DockLayoutContext\.Provider value=\{dockLayout\}>/);
});

test('every dialog backdrop - Modal.jsx and the hand-rolled ones - is tagged, so one CSS rule reserves the lane/band for all of them', () => {
  const effect = dockSrc.slice(dockSrc.indexOf('const [dockMode, setDockMode]'), dockSrc.indexOf('const inLane = dockMode'));
  assert.match(effect, /function findBackdrop\(dialog\)/);
  assert.match(effect, /if \(position !== 'fixed'\) continue;/);
  assert.match(effect, /rect\.width >= vw \* 0\.9 && rect\.height >= vh \* 0\.9/);
  assert.match(effect, /el\.setAttribute\('data-navrya-dock-host', kind\)/);
  assert.match(effect, /hostEl\.removeAttribute\('data-navrya-dock-host'\)/);
  assert.match(responsiveCss, /\[data-navrya-dock-host="side"\] \{\s*\n\s*padding-left: calc\(24px \+ var\(--navrya-chat-dock-side-left, 0px\)\) !important;\s*\n\s*padding-right: calc\(24px \+ var\(--navrya-chat-dock-side-right, 0px\)\) !important;/);
  assert.match(responsiveCss, /\[data-navrya-dock-host\] \{ padding-bottom: calc\(24px \+ var\(--navrya-chat-dock-reserved, 0px\)\) !important; \}/);
  assert.match(responsiveCss, /\[data-navrya-dock-host\] \[role="dialog"\]\[aria-modal="true"\] \{ max-height: calc\(100vh - 48px - var\(--navrya-chat-dock-reserved, 0px\)\) !important; \}/);
});

test('the bottom reserve follows the layout: 0 in the lane (the dialog gets its full height back), row + peek band under a dialog, unchanged otherwise', () => {
  assert.match(dockSrc, /var reserved = dockMode === 'side'\s*\n\s*\? 0\s*\n\s*: dockMode === 'under'\s*\n\s*\? DOCK_BOTTOM_PX \+ rowHeight \+ JOINED_GAP_PX \+ UNDER_DIALOG_ALLOWANCE_PX\s*\n\s*: 24 \+ rowHeight \+ PANEL_TO_DOCK_GAP_PX \+ POPOVER_SHORT_REPLY_ALLOWANCE_PX;/);
  assert.match(dockSrc, /\}, \[rowHeight, dockMode\]\);/);
  assert.match(dockSrc, /: underDialog \? \{ maxHeight: UNDER_DIALOG_ALLOWANCE_PX, overflowY: 'auto' \} : null;/, 'under a dialog the reply never grows past the reserved band');
});

test('under a dialog the reply is the design\'s peek - except the safety card and the screenshot review, which always keep the full panel', () => {
  assert.match(popoverSrc, /const dockLayout = React\.useContext\(DockLayoutContext\);/);
  assert.match(popoverSrc, /if \(dockLayout === 'under' && !safety && !review\) \{/);
  assert.match(popoverSrc, /data-navrya-response-variant="peek"/);
});

test('the composer is the design\'s: portrait, input, a "+" tools menu that keeps every old control, the engine menu, one primary button', () => {
  assert.doesNotMatch(code(dockSrc), /<ModelSwitcher|navrya-dock-secondary-action/);
  const tools = dockSrc.slice(dockSrc.indexOf('const toolItems = ['), dockSrc.indexOf('const engineItems'));
  assert.match(tools, /onAdd && \{ key: 'attach'/);
  assert.match(tools, /onNewChat && \{ key: 'new'/);
  assert.match(tools, /onHistory && \{ key: 'history'/);
  assert.match(tools, /onToggleTherapist && \{ key: 'therapist'/);
  assert.match(dockSrc, /const engineItems = list && onModelChange\s*\n\s*\? list\.map\(\(m\) => \(\{ key: m\.id, role: 'menuitemradio'/);
  assert.match(dockSrc, /onSelect: \(\) => onModelChange\(m\.id\)/);
  assert.match(dockSrc, /aria-haspopup="menu" aria-expanded=\{open \? 'true' : 'false'\}/);
  assert.match(dockSrc, /if \(e\.key === 'Escape'\) setOpen\(false\);/);
  assert.match(viewSrc, /toolsLabel=\{i18n\.t\('aiDockTools'\)\}/);
});

test('English/Spanish capital plate titles read as names in the dock; Persian passes through', () => {
  assert.equal(companionDisplayName('THE MARKET ENGINEER'), 'The Market Engineer');
  assert.equal(companionDisplayName('EL GRAN SABIO DEL MERCADO'), 'El Gran Sabio Del Mercado');
  assert.equal(companionDisplayName('مهندس بازار'), 'مهندس بازار');
  assert.equal(companionDisplayName('The Hunter'), 'The Hunter');
  assert.equal(companionDisplayName(''), '');
  assert.match(viewSrc, /name: companionDisplayName\(titles\[navryaCharacter\] \|\| ''\)/);
});

test('Modal.jsx reserves the side lane with safe 0px defaults, next to the existing bottom reserve', () => {
  assert.match(modalSrc, /padding: '24px calc\(24px \+ var\(--navrya-chat-dock-side-right, 0px\)\) calc\(24px \+ var\(--navrya-chat-dock-reserved, 0px\)\) calc\(24px \+ var\(--navrya-chat-dock-side-left, 0px\)\)'/);
});

test('in the side lane the voice row wraps: the waveform on its own line, the controls below it', () => {
  assert.match(responsiveCss, /\[data-navrya-dock-layout="side"\] \.navrya-voice-console-controls \{ flex-wrap: wrap !important;/);
  assert.match(responsiveCss, /\[data-navrya-dock-layout="side"\] \.navrya-voice-console-meter \{ flex: 1 1 100% !important; order: -1;/);
});

test('the new strings exist in all four languages', () => {
  assert.equal((i18nSrc.match(/aiDockStatusReady: '/g) || []).length, 4);
  assert.equal((i18nSrc.match(/aiChatFeedbackWrong: '/g) || []).length, 4);
  assert.equal((i18nSrc.match(/aiDockTools: '/g) || []).length, 4);
});

test('history is the capsule\'s own joined panel, full width, with a delete per conversation behind an inline confirmation', () => {
  const panel = viewSrc.slice(viewSrc.indexOf('export function ConversationHistoryDropdown('), viewSrc.indexOf('function ChatDockApp('));
  assert.match(panel, /borderRadius: '20px 20px 0 0', border: '1px solid var\(--border-gold-strong\)', borderBottom: 0,/);
  assert.doesNotMatch(panel, /maxWidth: 360/, 'no longer a small separate dropdown');
  assert.match(panel, /iconButton\('trash-2', i18n\.t\('aiDockHistoryDelete'\), \(\) => \{ setFailedId\(null\); setConfirmId\(conversation\.id\); \}, 'danger'\)/);
  assert.match(panel, /onClick=\{\(\) => confirmDelete\(conversation\.id\)\}/, 'deleting only ever happens from the confirmation');
  assert.match(panel, /if \(ok\) setConfirmId\(null\); else setFailedId\(id\);/, 'a failed delete is reported, the row stays');
  assert.match(viewSrc, /await historyStore\.remove\(id\);/, 'the same store DELETE the AI Assistant screen uses');
  assert.match(viewSrc, /setHistoryList\(\(list\) => list\.filter\(\(conversation\) => conversation\.id !== id\)\);/);
  assert.match(viewSrc, /if \(activeConversationIdRef\.current === id\) \{\s*\n\s*startNewChat\(\);\s*\n\s*setHistoryOpen\(true\);/);
  assert.match(viewSrc, /onNewChat=\{startNewChat\} onDelete=\{deleteConversation\}/);
  assert.match(viewSrc, /\{popover && !historyOpen && \(/, 'while history is open it is the panel on the row');
  assert.match(viewSrc, /surfaceJoined=\{historyOpen \|\| !!\(popover && popover\.open\)\}/);
});

test('every capsule surface has the strong gold edge and a lit top line, so its top edge reads clearly on the dark page', () => {
  assert.match(dockSrc, /border: '1px solid var\(--border-gold-strong\)',/);
  assert.match(dockSrc, /0 0 40px var\(--char-glow\),inset 0 1px 0 rgba\(244,234,215,\.12\)/);
  assert.equal((popoverSrc.match(/border: '1px solid var\(--border-gold-strong\)', borderBottom: joined \? 0 : undefined,/g) || []).length, 2);
  assert.match(consoleSrc, /border: '1px solid var\(--border-gold-strong\)',/);
  assert.doesNotMatch(code(popoverSrc) + code(consoleSrc), /border: '1px solid var\(--border-gold\)', borderBottom/);
});

test('the history strings exist in all four languages', () => {
  for (const key of ['aiDockHistoryMessages', 'aiDockHistoryDelete', 'aiDockHistoryDeleteConfirm', 'aiDockHistoryDeleteYes', 'aiDockHistoryDeleteNo', 'aiDockHistoryDeleteFailed']) {
    assert.equal((i18nSrc.match(new RegExp(key + ": ['\"]", 'g')) || []).length, 4, key);
  }
});
