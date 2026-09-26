/* Pure geometry for where the ChatDock sits when a dialog is open or the dock is pinned (ChatDock
   design: plate III "side", plates XIV-XVII "how the voice bar attaches"). No DOM access here, so it
   is unit-testable as plain data (tests/chatdock-capsule.test.mjs).

   Three placements exist besides the ordinary bottom-centre one:
   - the SIDE lane: a column on the viewport's inline-end side, bottom-aligned with an open dialog (or
     pinned to that side by the user). Used by the open conversation beside a dialog, and by the voice
     sidecar for a form too long to leave room under it.
   - the WELD: the voice bar attached to the bottom edge of a dialog, the same width - "the dialog and
     the bar are one piece". Used for every ordinary popup while a voice session is live.
   - UNDER: the composer stays at the bottom in the band the dialog's backdrop reserves.

   The lane only exists when it genuinely clears the dialog: ChatDock publishes the lane width as
   --navrya-chat-dock-side-left/-right, Modal.jsx's backdrop reserves that space the same way it
   already reserves --navrya-chat-dock-reserved at the bottom, and computeSideLane() then re-checks the
   dialog's real measured rect. A hand-rolled dialog that ignores the reserve and still overlaps simply
   keeps the bottom placement - never a lane drawn over the dialog. */

export var SIDECAR_WIDTH_PX = 380;
export var SIDECAR_EDGE_PX = 16;
export var SIDECAR_GAP_PX = 12;
export var SIDECAR_MIN_VIEWPORT_PX = 1280;
export var SIDECAR_MIN_HEIGHT_PX = 360;
// Smaller aria-modal surfaces (menus, pickers) are not forms worth sitting beside.
export var DIALOG_MIN_WIDTH_PX = 420;
export var DIALOG_MIN_HEIGHT_PX = 240;

// The dock's own bottom margin, the composer row, the joint, and the room a short reply needs. The
// sum is what a dialog's backdrop reserves at ITS bottom edge - and it is one constant, never a
// function of the live row height or the placement, so opening a dialog or starting a voice session
// never moves the dialog (the "popup jumps when the chat dock appears" defect).
export var DOCK_BOTTOM_PX = 24;
export var DOCK_ROW_PX = 68;
export var PANEL_TO_DOCK_GAP_PX = 2;
export var REPLY_ALLOWANCE_PX = 130;
export var DOCK_RESERVED_PX = DOCK_BOTTOM_PX + DOCK_ROW_PX + PANEL_TO_DOCK_GAP_PX + REPLY_ALLOWANCE_PX;

// The voice bar's height (question block + control row) and the room the weld needs below a dialog.
export var WELD_BAR_MAX_PX = 168;
export var WELD_MIN_ROOM_PX = 112;

export var PHONE_MAX_WIDTH_PX = 720;

// The inline-end side: left in RTL (fa/ar - the app's sidebar is on the right), right in LTR.
export function sideForDir(dir) { return dir === 'rtl' ? 'left' : 'right'; }

// What Modal.jsx's backdrop reserves on that side while the lane is active.
export function sideReservePx() { return SIDECAR_EDGE_PX + SIDECAR_WIDTH_PX + SIDECAR_GAP_PX; }

export function isLaneViewport(viewportWidth) { return viewportWidth >= SIDECAR_MIN_VIEWPORT_PX; }

export function isLaneDialog(rect) {
  return !!rect && rect.width >= DIALOG_MIN_WIDTH_PX && rect.height >= DIALOG_MIN_HEIGHT_PX;
}

// A form long enough that the band reserved under dialogs already cuts it: it needs the side.
export function isLongForm(rect, viewportHeight) {
  return !!rect && viewportHeight > 0 && rect.height >= viewportHeight - 48 - DOCK_RESERVED_PX - 6;
}

// Returns null (keep the normal bottom placement) or { side, width, bottom, height } in CSS px.
export function computeSideLane(input) {
  var vw = input && input.viewportWidth;
  var vh = input && input.viewportHeight;
  var rect = input && input.dialogRect;
  if (!isLaneViewport(vw) || !isLaneDialog(rect) || !(vh > 0)) return null;
  var side = sideForDir(input.dir);
  var laneOuter = SIDECAR_EDGE_PX + SIDECAR_WIDTH_PX + SIDECAR_GAP_PX;
  var freeOnSide = side === 'left' ? rect.left : vw - rect.right;
  if (freeOnSide < laneOuter - 0.5) return null;
  var bottomEdge = Math.min(rect.bottom, vh - SIDECAR_EDGE_PX);
  var top = Math.max(SIDECAR_EDGE_PX, Math.min(rect.top, bottomEdge - SIDECAR_MIN_HEIGHT_PX));
  if (bottomEdge - top < 200) return null;
  return { side: side, width: SIDECAR_WIDTH_PX, bottom: Math.round(vh - bottomEdge), height: Math.round(bottomEdge - top) };
}

// The pinned dock (no dialog): a column in the bottom inline-end corner, as tall as its content allows.
export function computePinnedLane(input) {
  var vh = input && input.viewportHeight;
  if (!(vh > 0)) return null;
  return { side: sideForDir(input.dir), width: SIDECAR_WIDTH_PX, bottom: DOCK_BOTTOM_PX, height: Math.max(SIDECAR_MIN_HEIGHT_PX, Math.round(vh - DOCK_BOTTOM_PX - SIDECAR_EDGE_PX)) };
}

// The voice bar welded to a dialog: the dialog's own left edge and width, starting at its bottom edge.
// null when there is no room left under the dialog (the caller then falls back to the bottom band).
export function computeWeld(input) {
  var vh = input && input.viewportHeight;
  var rect = input && input.dialogRect;
  if (!rect || !(vh > 0) || !isLaneDialog(rect)) return null;
  // "Narrow page: always the bar" - on a phone the dock is one full-width bar at the bottom (responsive.css).
  if (input.viewportWidth != null && input.viewportWidth <= PHONE_MAX_WIDTH_PX) return null;
  if (vh - rect.bottom < WELD_MIN_ROOM_PX) return null;
  return { left: Math.round(rect.left), top: Math.round(rect.bottom), width: Math.round(rect.width) };
}

// The voice capsule in a free corner of the page (plate XVI): a form that is not a dialog - a scenario card
// opened beside the chart - has no dialog to weld to and no sidecar to sit in, so the capsule steps aside to
// the top corner of the page's designated free area (an element marked data-navrya-dock-anchor: the chart),
// on the inline-end side, below the area's own header row. null when the area is missing or too small.
export var ANCHOR_WIDTH_PX = 520;
export var ANCHOR_INSET_PX = 24;
export var ANCHOR_TOP_PX = 44;
export var ANCHOR_MIN_WIDTH_PX = 360;
export function computeAnchor(input) {
  var rect = input && input.anchorRect;
  var vh = input && input.viewportHeight;
  var vw = input && input.viewportWidth;
  if (!rect || !(vh > 0) || rect.width < 420 || rect.height < 240) return null;
  var width = Math.min(ANCHOR_WIDTH_PX, Math.round(rect.width - 2 * ANCHOR_INSET_PX));
  if (width < ANCHOR_MIN_WIDTH_PX) return null;
  var left = input.dir === 'rtl' ? rect.left + ANCHOR_INSET_PX : rect.right - ANCHOR_INSET_PX - width;
  var top = Math.max(8, rect.top) + ANCHOR_TOP_PX;
  if (top + 140 > vh || left < 0 || (vw > 0 && left + width > vw)) return null;
  return { left: Math.round(left), top: Math.round(top), width: width };
}
export function sameAnchor(a, b) {
  if (!a || !b) return a === b;
  return a.left === b.left && a.top === b.top && a.width === b.width;
}

export function sameLane(a, b) {
  if (!a || !b) return a === b;
  return a.side === b.side && a.width === b.width && a.bottom === b.bottom && a.height === b.height;
}

export function sameWeld(a, b) {
  if (!a || !b) return a === b;
  return a.left === b.left && a.top === b.top && a.width === b.width;
}
