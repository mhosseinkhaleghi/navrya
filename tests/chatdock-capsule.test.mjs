import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  computeSideLane, computePinnedLane, computeWeld, computeAnchor, isLongForm, sameLane, sameWeld, sameAnchor, sideForDir, sideReservePx, isLaneDialog,
  SIDECAR_WIDTH_PX, SIDECAR_EDGE_PX, SIDECAR_MIN_HEIGHT_PX, DOCK_RESERVED_PX, WELD_MIN_ROOM_PX
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
const [dockSrc, popoverSrc, consoleSrc, sigilSrc, modalSrc, viewSrc, i18nSrc, responsiveCss, menuSrc, seedSrc] = await Promise.all([
  assistant('ChatDock.jsx'), assistant('ChatResponsePopover.jsx'), assistant('VoiceConsole.jsx'), assistant('CompanionSigil.jsx'),
  read('public', 'pages', 'shared', 'navrya', 'components', 'feedback', 'Modal.jsx'),
  read('navrya-src', 'chatDockView.jsx'), read('public', 'pages', 'shared', 'ai-i18n.js'),
  read('public', 'pages', 'shared', 'navrya', 'responsive.css'),
  assistant('DockMenu.jsx'), assistant('DockSeed.jsx')
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
  const a = { side: 'left', width: SIDECAR_WIDTH_PX, bottom: 120, height: 600 };
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

test('the design\'s geometry: the sidecar is 380 wide, the reserve is ONE constant, the weld needs room under the dialog, a long form is one the reserve already cuts', () => {
  assert.equal(SIDECAR_WIDTH_PX, 380);
  assert.equal(DOCK_RESERVED_PX, 24 + 68 + 2 + 130, 'margin + composer + joint + room for a short reply');
  assert.equal(isLongForm({ height: 900 - 48 - DOCK_RESERVED_PX }, 900), true, 'a dialog the reserve already caps is long');
  assert.equal(isLongForm({ height: 500 }, 900), false);
  const dialog = { left: 300, right: 1100, top: 100, bottom: 560, width: 800, height: 460 };
  assert.deepEqual(computeWeld({ viewportHeight: 900, dialogRect: dialog }), { left: 300, top: 560, width: 800 }, 'the bar takes the dialog\'s own left edge, width and bottom edge');
  assert.equal(computeWeld({ viewportHeight: 900, dialogRect: { ...dialog, bottom: 900 - WELD_MIN_ROOM_PX + 1 } }), null, 'no room under the dialog: the bar falls back to the bottom band');
  assert.equal(computeWeld({ viewportHeight: 900, dialogRect: null }), null);
  assert.equal(computeWeld({ viewportWidth: 720, viewportHeight: 900, dialogRect: dialog }), null, 'a phone gets the plain bottom bar, never a weld');
  assert.deepEqual(computeWeld({ viewportWidth: 1280, viewportHeight: 900, dialogRect: dialog }), { left: 300, top: 560, width: 800 });
  assert.equal(sameWeld({ left: 1, top: 2, width: 3 }, { left: 1, top: 2, width: 3 }), true);
  assert.equal(sameWeld({ left: 1, top: 2, width: 3 }, null), false);
});

test('the pinned lane is a column in the bottom inline-end corner; the anchor is the free corner of the page beside a scenario card', () => {
  assert.deepEqual(computePinnedLane({ viewportHeight: 900, dir: 'rtl' }), { side: 'left', width: 380, bottom: 24, height: 860 });
  assert.equal(computePinnedLane({ viewportHeight: 0, dir: 'rtl' }), null);
  const chart = { left: 432, right: 1344, top: 16, bottom: 564, width: 912, height: 548 };
  assert.deepEqual(computeAnchor({ dir: 'rtl', viewportWidth: 1440, viewportHeight: 900, anchorRect: chart }), { left: 456, top: 60, width: 520 }, 'plate XVI: 24px in from the inline-end edge, 44px below the top');
  const ltr = computeAnchor({ dir: 'ltr', viewportWidth: 1440, viewportHeight: 900, anchorRect: chart });
  assert.equal(ltr.left + ltr.width, chart.right - 24, 'mirrored for LTR');
  assert.equal(computeAnchor({ dir: 'rtl', viewportWidth: 1440, viewportHeight: 900, anchorRect: { ...chart, width: 380, right: 812 } }), null, 'too narrow');
  assert.equal(computeAnchor({ dir: 'rtl', viewportWidth: 1440, viewportHeight: 900, anchorRect: null }), null);
  assert.equal(sameAnchor({ left: 1, top: 2, width: 3 }, { left: 1, top: 2, width: 3 }), true);
});

test('receipts: a navigation reads as what happened when the caller supplies the sentence, and only then', () => {
  assert.equal(receiptEntry('navigate-to', 'domainId', 'dashboard', { ...opts, wentTo: (page) => 'به ' + page + ' رفتم' }), 'به داشبورد رفتم');
  assert.equal(receiptEntry('navigate-to', 'domainId', 'unknown-page', { ...opts, wentTo: (page) => 'به ' + page + ' رفتم' }), 'unknown-page', 'no page label: the value alone, never a sentence about nothing');
  assert.equal(receiptEntry('navigate-to', 'domainId', 'dashboard', opts), 'داشبورد');
});

test('chatDockView.jsx builds the popover meta from receipts and passes the character as the companion', () => {
  assert.match(viewSrc, /meta: workflowReceipts\(result\.workflow, receipts\)/);
  assert.doesNotMatch(code(viewSrc), /Object\.keys\(result\.workflow\.known \|\| \{\}\)\.map\(\(path\) => `\$\{path\}: /);
  assert.match(viewSrc, /const companion = companionFor\(i18n, navryaCharacter\);/);
  assert.match(viewSrc, /stringsFor\(languageOf\(i18n\)\)\.charTitle/);
  assert.match(viewSrc, /assetUrl\('assets\/portraits\/portrait-' \+ navryaCharacter \+ '\.webp'\)/);
  assert.match(viewSrc, /companion=\{companion\} surfaceJoined=\{historyOpen \|\| showReply\}/);
  assert.match(viewSrc, /companion=\{companion\} joined statusLabel=\{statusText\}/);
  assert.match(viewSrc, /wentTo: \(page\) => i18n\.t\('aiDockReceiptWentTo', \{ page \}\)/);
});

test('the reply header is the companion (portrait, name, the engine chip that opens the engine menu, a page-aware status) with history / pin / collapse / close', () => {
  assert.doesNotMatch(code(popoverSrc), /' · CHAT'/);
  assert.doesNotMatch(code(popoverSrc), /RULE ENGINE/);
  assert.doesNotMatch(code(popoverSrc), /STAGE_META|HeightStageRail|'FOLDED'/);
  assert.doesNotMatch(code(popoverSrc), /StatCell/);
  const header = popoverSrc.slice(popoverSrc.indexOf('<header'), popoverSrc.indexOf('</header>'));
  assert.match(header, /<CompanionSigil portrait=\{portrait\} size=\{36\} state=\{thinking \? 'thinking' : 'idle'\} \/>/);
  assert.match(header, /<DockMenu variant="chip" placement="down"/, 'the engine chip is the design\'s button: it opens the engine menu');
  assert.match(header, /<EngineChip model=\{model\}/, 'and stays a plain label where no menu is supplied');
  for (const control of ["icon=\"history\"", 'icon={pinIcon}', 'icon="chevron-down" label={sizeLabels.fold}', 'icon="x" label={sizeLabels.close}']) {
    assert.ok(header.includes(control), control + ' is in the header');
  }
  assert.match(popoverSrc, /const THREAD_MAX_HEIGHT = 'calc\(60vh - 150px\)';/, 'the whole card stays under 60% of the viewport');
  assert.match(popoverSrc, /<ReceiptChip key=\{k\} label=\{cell\.label\} value=\{cell\.value\} undo=\{k === receipts\.length - 1 \? undo : null\} \/>/);
});

test('the reply and the composer are one card: the reply loses its bottom edge, the row its top edge and the joint is an inset hairline', () => {
  assert.match(popoverSrc, /borderRadius: cardRadius\(false, joined\), border: '1px solid ' \+ EDGE, borderBottom: joined \? 0 : undefined,/);
  assert.match(dockSrc, /borderRadius: cardRadius\(surfaceJoined, false\),/);
  assert.match(dockSrc, /borderTop: surfaceJoined \? 0 : undefined,/);
  assert.match(dockSrc, /const joint = surfaceJoined \? \(\s*\n\s*<span aria-hidden="true" style=\{\{ position: 'absolute', top: 0, insetInlineStart: 14, insetInlineEnd: 14, height: 1, background: DIVIDER/);
  assert.match(dockSrc, /companion=\{companion\} joinedTop=\{surfaceJoined && !welded && !anchored\}/, 'the voice console joins the same way, except when it is welded or anchored');
  assert.match(consoleSrc, /borderRadius: cardRadius\(joinedTop, false\)/);
});

test('the dock row opens with the character\'s portrait - the open-conversation button - and shows one Voice button unless there is typed text', () => {
  assert.doesNotMatch(code(dockSrc), /ModelMascot/);
  assert.match(dockSrc, /<CompanionSigil portrait=\{companion && companion\.portrait\} size=\{40\} state=\{sigilState\} \/>/);
  assert.match(dockSrc, /<CompanionSigil className="navrya-dock-mascot" portrait=\{companion && companion\.portrait\} size=\{40\} state=\{sigilState\} \/>/);
  assert.match(dockSrc, /if \(replyAvailable\) emit\('expand'\); else if \(onHistory\) onHistory\(\);/);
  assert.match(dockSrc, /\{onVoiceToggle && showSend && \(\s*\n\s*<DockButton className="navrya-dock-mic"/);
  assert.match(sigilSrc, /export function CompanionSigil/);
  assert.doesNotMatch(code(sigilSrc), /onClick/, 'the sigil is decorative - never a decoy control');
});

test('voice is a state of the same capsule: no identity header of its own in the console, no engine logo, no decorative non-buttons', () => {
  const c = code(consoleSrc);
  assert.doesNotMatch(c, /· VOICE|PHASE_CODE|'MIC DENIED'/);
  assert.doesNotMatch(c, /navrya-voice-console-volume|navrya-voice-console-speed|'volume-2'|>1×</);
  assert.doesNotMatch(c, /ModelGlyph/, 'the engine logo is never drawn by the console - only the chip the dock hands it');
  assert.match(consoleSrc, /<CompanionSigil className="navrya-voice-console-sigil" portrait=\{companion && companion\.portrait\} size=\{40\} state=\{sigilState\} dot=\{false\} \/>/);
  const consoleVariant = consoleSrc.slice(consoleSrc.indexOf('// ---- CONSOLE'), consoleSrc.indexOf('export function VoiceMiniBar'));
  for (const piece of ['muteButton', 'captionsButton', 'typeButton', 'mainAction', 'endButton']) {
    assert.ok(consoleVariant.includes('{' + piece + '}'), piece + ' sits in the one control row');
  }
  assert.match(consoleSrc, /data-navrya-assistant="voice-mini"\s*\n\s*style=\{\{ \.\.\.frameFor\('card', joinedTop\)/, 'the minimized row is the same capsule shape, joined like the console');
});

test('placement: no dialog = bottom (or pinned); a conversation open beside a dialog = side; otherwise under; a voice session welds - and the reserve is published before measuring', () => {
  assert.match(dockSrc, /document\.querySelectorAll\('\[role="dialog"\]\[aria-modal="true"\]'\)/);
  const effect = dockSrc.slice(dockSrc.indexOf('const [dockMode, setDockMode]'), dockSrc.indexOf('const inLane = dockMode'));
  assert.ok(effect.indexOf('publishSide(true);') > -1 && effect.indexOf('publishSide(true);') < effect.indexOf('computeSideLane('), 'the reserve is published before the dialog is measured');
  assert.match(effect, /if \(input\.pinned && isLaneViewport\(vw\)\) commit\('side', computePinnedLane\(\{ viewportHeight: vh, dir \}\), null\);\s*\n\s*else commit\('free', null, null\);/);
  assert.match(effect, /if \(lane\) \{ commit\('side', lane, null\); return; \}/);
  assert.match(effect, /if \(refused\) refused\.add\(dialog\);\s*\n\s*\}\s*\n\s*publishSide\(false\);\s*\n\s*setHost\(host, 'under'\);\s*\n\s*commit\('under', null, null\);/);
  assert.match(effect, /const wantsSide = input\.pinned \|\| input\.scrollOpen;/, 'typed chat only takes a lane when the conversation is open (or pinned) - otherwise the dialog is left alone');
  assert.match(effect, /if \(attach\) \{ setWeldMark\(dialog\); commit\('weld', null, attach\); return; \}/);
  assert.match(effect, /choice = isLongForm\(\{ height: dialog\.offsetHeight \}, vh\) && isLaneViewport\(vw\) \? 'side' : 'weld';/, 'a voice session on a form too long to leave room under it takes the sidecar - decided once per dialog');
  assert.match(effect, /new MutationObserver\(onMutation\)/, 'a dialog mounting is seen before the browser paints it');
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

test('a dialog is never moved by the dock: ONE constant reserve, a padding glide instead of a jump, and the weld squares the dialog\'s bottom edge', () => {
  assert.match(dockSrc, /var reserved = inLane \|\| seed \? 0 : DOCK_RESERVED_PX;/, 'the reserve does not depend on the row height, the placement (except the side lane) or the voice console');
  assert.match(dockSrc, /\}, \[inLane, seed\]\);/);
  assert.doesNotMatch(code(dockSrc), /rowHeight \+ PANEL_TO_DOCK_GAP_PX \+ POPOVER_SHORT_REPLY_ALLOWANCE_PX/, 'the old row-height-dependent reserve is gone');
  assert.match(dockSrc, /: underDialog \? \{ maxHeight: DOCK_RESERVED_PX - DOCK_BOTTOM_PX - CAPSULE_ROW_PX, overflowY: 'auto' \} : null;/, 'under a dialog the reply never grows past the reserved band');
  assert.match(modalSrc, /transition: 'padding 220ms var\(--ease-out\)'/);
  assert.match(responsiveCss, /\[data-navrya-dock-host\] \{ transition: padding 220ms var\(--ease-out/);
  assert.match(responsiveCss, /\[data-navrya-dock-weld="true"\] \{\s*\n\s*border-bottom-left-radius: 0 !important;\s*\n\s*border-bottom-right-radius: 0 !important;\s*\n\s*border-bottom-width: 0 !important;/);
});

test('under a dialog (and as the fresh reply) the reply is the design\'s peek - except the safety card and the screenshot review, which always keep the full card', () => {
  assert.match(popoverSrc, /const dockLayout = React\.useContext\(DockLayoutContext\);/);
  assert.match(popoverSrc, /if \(\(shape === 'peek' \|\| dockLayout === 'under'\) && !safety && !review\) \{/);
  assert.match(popoverSrc, /data-navrya-response-variant="peek"/);
});

test('the composer is the design\'s: portrait, input, a "+" tools menu that keeps every old control, the engine menu, one primary button', () => {
  assert.doesNotMatch(code(dockSrc), /<ModelSwitcher|navrya-dock-secondary-action/);
  const tools = dockSrc.slice(dockSrc.indexOf('const toolItems = ['), dockSrc.indexOf('const engineItems'));
  assert.match(tools, /onAdd && \{ key: 'attach'/);
  assert.match(tools, /onNewChat && \{ key: 'new'/);
  assert.match(tools, /onHistory && \{ key: 'history'/);
  assert.match(tools, /onToggleTherapist && \{ key: 'therapist'/);
  assert.match(tools, /onFormConfirmToggle && formConfirmLabel && \{ key: 'form-confirm'/, 'ask-every-field is a real, persisted toggle');
  assert.match(tools, /onAutoCollapseChange && autoCollapseLabel && \{ key: 'auto-collapse'/);
  assert.match(dockSrc, /const engineItems = list && onModelChange\s*\n\s*\? list\.map\(\(m\) => \(\{ key: m\.id, role: 'menuitemradio'/);
  assert.match(dockSrc, /onSelect: \(\) => onModelChange\(m\.id\)/);
  assert.match(menuSrc, /aria-haspopup="menu" aria-expanded=\{open \? 'true' : 'false'\}/);
  assert.match(menuSrc, /if \(e\.key === 'Escape'\) setOpen\(false\);/);
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

test('the sidecar is a column of its own (header, checklist, last said, one control row) - no wrapping row hack in the lane any more', () => {
  assert.doesNotMatch(responsiveCss, /\[data-navrya-dock-layout="side"\] \.navrya-voice-console-controls/);
  const sidecar = consoleSrc.slice(consoleSrc.indexOf('// ---- SIDECAR'), consoleSrc.indexOf('// ---- ANCHOR'));
  assert.match(sidecar, /height: laneHeight \|\| undefined/);
  for (const piece of ['fv.modeChips', 'fields.map', 'fv.said.map', 'navrya-voice-console-controls']) assert.ok(sidecar.includes(piece), piece);
});

test('the new strings exist in all four languages', () => {
  for (const key of ['aiDockStatusReady', 'aiChatFeedbackWrong', 'aiDockTools', 'aiDockPlaceholderNamed', 'aiDockMessageTo', 'aiDockSeedOpen', 'aiDockReplyReady', 'aiDockJustNow', 'aiDockClosePeek', 'aiDockPin', 'aiDockUnpin', 'aiDockPreviousChats', 'aiDockStatusOn', 'aiDockSwitchEngine', 'aiDockUndo', 'aiDockReceiptWentTo', 'aiDockAutoCollapse', 'aiDockVoiceTag', 'aiDockSecondsShort', 'aiDockOpenConversation']) {
    assert.equal((i18nSrc.match(new RegExp(key + ": '", 'g')) || []).length, 4, key);
  }
});

test('history is the capsule\'s own joined panel, full width, in the design\'s card - with a delete per conversation behind an inline confirmation', () => {
  const panel = viewSrc.slice(viewSrc.indexOf('export function ConversationHistoryDropdown('), viewSrc.indexOf('function useFormVoiceModel('));
  assert.match(panel, /borderRadius: '20px 20px 0 0', border: '1px solid ' \+ EDGE, borderBottom: 0,/);
  assert.match(panel, /background: cardBackground\('card'\),/);
  assert.match(panel, /<CapsuleTop \/>/);
  assert.doesNotMatch(panel, /maxWidth: 360/, 'no longer a small separate dropdown');
  assert.match(panel, /iconButton\('trash-2', i18n\.t\('aiDockHistoryDelete'\), \(\) => \{ setFailedId\(null\); setConfirmId\(conversation\.id\); \}, 'danger'\)/);
  assert.match(panel, /onClick=\{\(\) => confirmDelete\(conversation\.id\)\}/, 'deleting only ever happens from the confirmation');
  assert.match(panel, /if \(ok\) setConfirmId\(null\); else setFailedId\(id\);/, 'a failed delete is reported, the row stays');
  assert.match(viewSrc, /await historyStore\.remove\(id\);/, 'the same store DELETE the AI Assistant screen uses');
  assert.match(viewSrc, /setHistoryList\(\(list\) => list\.filter\(\(conversation\) => conversation\.id !== id\)\);/);
  assert.match(viewSrc, /if \(activeConversationIdRef\.current === id\) \{\s*\n\s*startNewChat\(\);\s*\n\s*setHistoryOpen\(true\);/);
  assert.match(viewSrc, /onNewChat=\{startNewChat\} onDelete=\{deleteConversation\}/);
  assert.match(viewSrc, /\{showReply && \(/, 'while history is open it is the panel on the row (showReply is false then)');
  assert.match(viewSrc, /const showReply = replyVisible && !historyOpen && \(effectiveShape === 'peek' \|\| effectiveShape === 'scroll'\);/);
});

test('every capsule surface wears the design\'s card: the .45 gold edge, the accent gradient over the stage colour, the grabber and the corner ticks', () => {
  assert.match(dockSrc, /border: '1px solid ' \+ EDGE,/);
  assert.match(dockSrc, /background: surfaceJoined \? INK_DEEP : cardBackground\('card'\),/);
  assert.match(popoverSrc, /background: cardBackground\('card'\),/);
  assert.match(consoleSrc, /background: joinedTop \? '#0A0D12' : cardBackground\('card'\),/);
  assert.match(consoleSrc, /background: cardBackground\('weld'\), boxShadow: cardShadow\('weld'\)/);
  assert.equal((dockSrc.match(/<CapsuleTop \/>/g) || []).length, 1);
  assert.doesNotMatch(code(dockSrc) + code(popoverSrc) + code(consoleSrc), /border-gold-strong/, 'the old .9 edge is gone');
});

test('the seed is a 64px portrait with a badge, or the 56px variant with the "reply ready" pill - and both open the dock', () => {
  assert.match(seedSrc, /const size = count > 0 && pillLabel \? 56 : 64;/);
  assert.match(seedSrc, /border: '2px solid var\(--char-accent\)'/);
  assert.match(seedSrc, /background: 'var\(--char-accent\)', color: 'var\(--char-on-accent\)'/);
  assert.match(seedSrc, /onClick=\{onOpen\}/);
  assert.match(dockSrc, /if \(seed\) \{\s*\n\s*return \(\s*\n\s*<DockLayoutContext\.Provider value="bottom">\s*\n\s*<DockSeed/);
  assert.match(dockSrc, /\(e\.ctrlKey \|\| e\.metaKey\) && !e\.altKey && !e\.shiftKey && \(e\.key === 'k' \|\| e\.key === 'K'\)/);
  assert.match(dockSrc, /if \(e\.key === 'ArrowUp' && replyAvailable && shape !== 'scroll'\) \{ e\.preventDefault\(\); emit\('expand'\); \}/);
});

test('the history strings exist in all four languages', () => {
  for (const key of ['aiDockHistoryMessages', 'aiDockHistoryDelete', 'aiDockHistoryDeleteConfirm', 'aiDockHistoryDeleteYes', 'aiDockHistoryDeleteNo', 'aiDockHistoryDeleteFailed']) {
    assert.equal((i18nSrc.match(new RegExp(key + ": ['\"]", 'g')) || []).length, 4, key);
  }
});
