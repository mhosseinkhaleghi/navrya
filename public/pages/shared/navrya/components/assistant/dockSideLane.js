/* Pure geometry for the ChatDock "beside the modal" lane (ChatDock capsule redesign, artbook plate
   VII). When a real dialog (role="dialog" aria-modal="true" - Modal.jsx and every hand-rolled
   dialog in navrya-src) is open on a wide enough viewport, the whole dock (reply + input row, or the
   Voice console) moves into a lane on the viewport's inline-end side, bottom-aligned with the
   dialog, instead of sitting on top of the dialog's own fields.

   The lane only exists when it genuinely clears the dialog: ChatDock publishes the lane width as
   --navrya-chat-dock-side-left/-right, Modal.jsx's backdrop reserves that space the same way it
   already reserves --navrya-chat-dock-reserved at the bottom, and this function then re-checks the
   dialog's real measured rect. A hand-rolled dialog that ignores the reserve and still overlaps
   simply keeps the old bottom placement - never a lane drawn over the dialog. No DOM access here, so
   it is unit-testable as plain data (tests/chatdock-capsule.test.mjs). */

export var SIDECAR_WIDTH_PX = 376;
export var SIDECAR_EDGE_PX = 16;
export var SIDECAR_GAP_PX = 12;
export var SIDECAR_MIN_VIEWPORT_PX = 1280;
export var SIDECAR_MIN_HEIGHT_PX = 360;
// Smaller aria-modal surfaces (menus, pickers) are not forms worth sitting beside.
export var DIALOG_MIN_WIDTH_PX = 420;
export var DIALOG_MIN_HEIGHT_PX = 240;

// The inline-end side: left in RTL (fa/ar - the app's sidebar is on the right), right in LTR.
export function sideForDir(dir) { return dir === 'rtl' ? 'left' : 'right'; }

// What Modal.jsx's backdrop reserves on that side while the lane is active.
export function sideReservePx() { return SIDECAR_EDGE_PX + SIDECAR_WIDTH_PX + SIDECAR_GAP_PX; }

export function isLaneViewport(viewportWidth) { return viewportWidth >= SIDECAR_MIN_VIEWPORT_PX; }

export function isLaneDialog(rect) {
  return !!rect && rect.width >= DIALOG_MIN_WIDTH_PX && rect.height >= DIALOG_MIN_HEIGHT_PX;
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

export function sameLane(a, b) {
  if (!a || !b) return a === b;
  return a.side === b.side && a.width === b.width && a.bottom === b.bottom && a.height === b.height;
}
