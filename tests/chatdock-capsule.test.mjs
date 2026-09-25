import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  computeSideLane, sameLane, sideForDir, sideReservePx, isLaneDialog,
  SIDECAR_WIDTH_PX, SIDECAR_EDGE_PX, SIDECAR_MIN_HEIGHT_PX
} from '../public/pages/shared/navrya/components/assistant/dockSideLane.js';
import { receiptEntry, workflowReceipts, NAV_LABEL_KEYS } from '../navrya-src/chatDockReceipts.js';

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
  assert.match(viewSrc, /companion=\{companion\} surfaceJoined=\{!!\(popover && popover\.open\)\}/);
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

test('the Voice console header is the same identity; the English phase code and the two decorative non-buttons are gone', () => {
  assert.doesNotMatch(code(consoleSrc), /· VOICE|PHASE_CODE|'MIC DENIED'/);
  assert.doesNotMatch(code(consoleSrc), /navrya-voice-console-volume|navrya-voice-console-speed|'volume-2'|>1×</);
  assert.match(consoleSrc, /<CompanionSigil portrait=\{companion && companion\.portrait\} size=\{36\}/);
});

test('ChatDock finds real dialogs, publishes the side reserve before measuring, never retries a dialog that ignored it, and cleans up', () => {
  assert.match(dockSrc, /document\.querySelectorAll\('\[role="dialog"\]\[aria-modal="true"\]'\)/);
  const effect = dockSrc.slice(dockSrc.indexOf('const [sideLane, setSideLane]'), dockSrc.indexOf('const inLane = !!sideLane;'));
  assert.ok(effect.indexOf('publish(true);') > -1 && effect.indexOf('publish(true);') < effect.indexOf('computeSideLane('), 'the reserve is published before the dialog is measured');
  assert.match(effect, /if \(refused\) refused\.add\(dialog\);/);
  assert.match(effect, /new MutationObserver\(schedule\)/);
  assert.match(effect, /new ResizeObserver\(schedule\)/);
  assert.match(effect, /setSideLane\(\(prev\) => \(sameLane\(prev, lane\) \? prev : lane\)\);/);
  assert.match(effect, /root\.style\.removeProperty\('--navrya-chat-dock-side-left'\);/);
  assert.match(effect, /root\.style\.removeProperty\('--navrya-chat-dock-side-right'\);/);
  assert.match(dockSrc, /data-navrya-dock-layout=\{inLane \? 'side' : 'bottom'\}/);
});

test('Modal.jsx reserves the side lane with safe 0px defaults, next to the existing bottom reserve', () => {
  assert.match(modalSrc, /padding: '24px calc\(24px \+ var\(--navrya-chat-dock-side-right, 0px\)\) calc\(24px \+ var\(--navrya-chat-dock-reserved, 0px\)\) calc\(24px \+ var\(--navrya-chat-dock-side-left, 0px\)\)'/);
});

test('in the side lane the Voice console uses the compact control grid instead of an overflowing row', () => {
  assert.match(responsiveCss, /\[data-navrya-dock-layout="side"\] \.navrya-voice-console-controls \{ display: grid !important; grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
  assert.match(responsiveCss, /\[data-navrya-dock-layout="side"\] \.navrya-voice-console-main-action \{ grid-column: 1 \/ -1;/);
});

test('the two new strings exist in all four languages', () => {
  assert.equal((i18nSrc.match(/aiDockStatusReady: '/g) || []).length, 4);
  assert.equal((i18nSrc.match(/aiChatFeedbackWrong: '/g) || []).length, 4);
});
