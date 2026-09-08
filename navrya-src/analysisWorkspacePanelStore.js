// Storage for AI-authored Analysis Workspace panels (Phase 2). One preference row per panel,
// separate from the board row itself, for a concrete reason: server/community/
// routes.preferences.mjs caps EVERY preference value at 16KB of JSON, so a board row that
// inlined each panel's source would blow that limit as soon as a trader kept two or three
// panels. The board row therefore keeps only the small {title, prompt} metadata in the `custom`
// map analysisWorkspaceBoard.js already carries, and the actual widget source lives here.
//
// Key format is deliberately colon-free (see analysisWorkspaceBoard.js's boardKey comment): the
// server validates preference ids against /^[A-Za-z][A-Za-z0-9_-]{0,63}$/ and rejects anything
// else, which server-replica.js turns into a rolled-back write and a save-failed toast.
const KEY_PREFIX = 'analysisWorkspacePanel_';

// The server's own per-value ceiling, minus room for the JSON envelope around the source string
// (id/title/prompt/timestamps/escaping). A generation larger than this is refused up front with an
// honest message rather than written optimistically and then rolled back by the server.
export const MAX_VALUE_BYTES = 16 * 1024;
export const MAX_SOURCE_BYTES = 12 * 1024;

// Custom panel ids are generated here so they can never collide with a built-in catalog id
// ('cockpit'/'entry'/'dashboard'/'prevSummary'/'similar') and always stay inside the preference
// id charset and 64-char budget: 'analysisWorkspacePanel_' (23) + character (<=9) + '_' + this.
export function newPanelId() {
  return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function panelKey(character, panelId) { return KEY_PREFIX + character + '_' + panelId; }

export function isCustomPanelId(id) { return typeof id === 'string' && /^p[0-9a-z]{8,}$/.test(id); }

export function byteLength(text) {
  if (typeof TextEncoder === 'function') return new TextEncoder().encode(String(text)).length;
  return unescape(encodeURIComponent(String(text))).length;
}

export function loadPanel(character, panelId) {
  const prefs = window.TradeJournalUserPreferences;
  const saved = prefs ? prefs.getPref(panelKey(character, panelId), null) : null;
  return saved && typeof saved.source === 'string' ? saved : null;
}

// Returns { ok } or { ok: false, reason: 'too-large', bytes, limit } - never writes something the
// server is going to reject, so the trader is told the real reason instead of watching a
// save-failed toast appear from a rolled-back optimistic write.
export function savePanel(character, panel) {
  const record = {
    id: panel.id, title: String(panel.title || '').slice(0, 80), prompt: String(panel.prompt || '').slice(0, 2000),
    source: String(panel.source || ''), version: Number(panel.version) || 1,
    createdAt: panel.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  const sourceBytes = byteLength(record.source);
  if (sourceBytes > MAX_SOURCE_BYTES) return { ok: false, reason: 'too-large', bytes: sourceBytes, limit: MAX_SOURCE_BYTES };
  if (byteLength(JSON.stringify(record)) > MAX_VALUE_BYTES) return { ok: false, reason: 'too-large', bytes: sourceBytes, limit: MAX_SOURCE_BYTES };
  const prefs = window.TradeJournalUserPreferences;
  if (prefs) prefs.setPref(panelKey(character, record.id), record);
  return { ok: true, record };
}

export function deletePanel(character, panelId) {
  const prefs = window.TradeJournalUserPreferences;
  if (prefs) prefs.resetPref(panelKey(character, panelId));
}
