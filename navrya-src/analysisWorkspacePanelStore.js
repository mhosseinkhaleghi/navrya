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

// The prompt is stored beside the source so a revision can be pre-filled with what was originally
// asked. It has to be BUDGETED, not just "generously capped": the ceiling that actually matters is
// the server's 16KB per whole JSON value, and the first version of this file allowed 2000 prompt
// characters - which in Persian or Arabic is ~4KB of UTF-8, enough that a source comfortably under
// MAX_SOURCE_BYTES could still push the encoded record over the server's limit. The write was then
// refused while reporting the SOURCE size against the SOURCE limit, i.e. telling the trader to
// "ask for a simpler panel" when the prompt was the thing that overflowed. 400 characters leaves
// 12KB of source room to survive JSON escaping with margin to spare.
export const MAX_PROMPT_CHARS = 400;

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
    id: panel.id, title: String(panel.title || '').slice(0, 80), prompt: String(panel.prompt || '').slice(0, MAX_PROMPT_CHARS),
    source: String(panel.source || ''), version: Number(panel.version) || 1,
    createdAt: panel.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  const sourceBytes = byteLength(record.source);
  if (sourceBytes > MAX_SOURCE_BYTES) return { ok: false, reason: 'too-large', bytes: sourceBytes, limit: MAX_SOURCE_BYTES };
  // Belt and braces behind the prompt budget above: report the ENCODED size against the SERVER's
  // own ceiling, so if JSON escaping ever pushes a legal-looking record over the edge the trader is
  // told the real number that failed rather than a source size that was fine.
  const encodedBytes = byteLength(JSON.stringify(record));
  if (encodedBytes > MAX_VALUE_BYTES) return { ok: false, reason: 'too-large', bytes: encodedBytes, limit: MAX_VALUE_BYTES };
  const prefs = window.TradeJournalUserPreferences;
  if (prefs) prefs.setPref(panelKey(character, record.id), record);
  return { ok: true, record };
}

export function deletePanel(character, panelId) {
  const prefs = window.TradeJournalUserPreferences;
  if (prefs) prefs.resetPref(panelKey(character, panelId));
}
