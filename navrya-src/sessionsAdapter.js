// Ports session-library.js's read/normalize logic verbatim (same localStorage key, same
// normalization rules) so the new NAVRYA Sessions view reads the exact same real data the
// legacy view did - never a parallel or reinvented session store.
const SESSION_KEY_PREFIX = 'tradejournal:sessions:v1:';
export const RESET_KEY = 'tradejournal:session-library-empty-reset:v1';
const CHARACTERS = ['hunter', 'engineer', 'commander', 'sage'];

export function storageKey(character) { return SESSION_KEY_PREFIX + character; }

export function readSessions(character) {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(character))) || [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) { return []; }
}

export function entryCount(session) { return (session.entries || session.charts || []).length; }

export function scenarioCount(session) {
  let count = 0;
  (session.entries || []).forEach((entry) => { count += (entry.scenarios || []).length; });
  if (!session.entries && Array.isArray(session.scenarios)) count = session.scenarios.length;
  return count;
}

export function hasChart(session) {
  return (session.entries || []).some((entry) => entry.hasImage && (entry.imageBlobId || entry.preview)) ||
    (session.charts || []).some((chart) => Boolean(chart.preview));
}

export function isUsable(session) {
  return Boolean(session && session.id && (session.name || session.market || session.date || session.startedAt || entryCount(session) || scenarioCount(session)));
}

export function sanitizeSessions(character, values) {
  const usable = values.filter(isUsable);
  if (usable.length !== values.length) {
    localStorage.setItem(storageKey(character), JSON.stringify(usable));
    window.dispatchEvent(new CustomEvent('tradejournal:sessions-changed', { detail: { character, count: usable.length } }));
  }
  return usable;
}

export function imageEntry(session) {
  const entries = (session.entries || []).slice().reverse();
  const entry = entries.find((item) => item.hasImage && (item.imageBlobId || item.preview));
  if (entry) return entry;
  const charts = (session.charts || []).slice().reverse();
  const chart = charts.find((item) => item.preview);
  return chart ? { preview: chart.preview, hasImage: true } : null;
}

export function sessionTimestamp(session) {
  const value = session.startedAt || session.createdAt || session.date || session.gregorianDate || 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

// session.market is stored without a space for New York ('NewYork') by the legacy creation
// flow, but NAVRYA's SESSION_FILTERS/SESSION_CITIES use 'New York' (with a space) - normalize
// so the design system's built-in city filter actually matches real data.
export function displayCity(market) {
  if (!market) return '—';
  return market === 'NewYork' ? 'New York' : market;
}

function pad(n) { return String(n).padStart(2, '0'); }

// Real, computed from the session's actual timestamp - never a fabricated string like the
// design system's own '20:46 UTC' mock default.
export function formatLastUpdate(session) {
  const time = sessionTimestamp(session);
  if (!time) return '—';
  const d = new Date(time);
  return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ' UTC';
}

// Maps a real, normalized session onto the flat shape SessionLibrary/SessionCard expect.
// `instrument` has no real backing field at the session level in this codebase (only trades
// carry an instrument) - shown as an honest '—' rather than invented, per the
// "insufficient data over fabricated numbers" standard used throughout this app.
export function toCardProps(session) {
  return {
    id: session.id,
    title: (session.name || session.market || 'Session') + ' — ' + (session.date || session.gregorianDate || '—'),
    status: session.status === 'closed' ? 'CLOSED' : 'ACTIVE',
    city: displayCity(session.market),
    timeframe: session.timeframe || '—',
    summary: entryCount(session) + ' entries · ' + scenarioCount(session) + ' scenarios',
    instrument: '—',
    lastUpdate: formatLastUpdate(session),
    showDetail: true
  };
}

// Loads a real chart thumbnail for a session, the same way session-library.js's
// hydrateImage() does (IndexedDB-backed image store first, inline preview fallback) - returns
// null (no image) rather than ever substituting the design system's decorative sample chart.
export async function loadThumbnail(session) {
  const entry = imageEntry(session);
  if (!entry) return null;
  if (entry.imageBlobId && window.TradeJournalImageStore) {
    try {
      const url = await window.TradeJournalImageStore.loadImageUrl(entry.imageBlobId);
      if (url) return url;
    } catch (_) { /* fall through to preview */ }
  }
  return entry.preview || null;
}

// Writes a new session directly in the canonical shape session-library.js already reads
// (id, name, market, timeframe, date, gregorianDate, jalali, status, startedAt, createdAt,
// entries) - the same localStorage key, so it appears identically for every other piece of
// code that reads sessions (the workspace view, session-signature backfill, etc).
export async function createSession(character, values) {
  const now = Date.now();
  // Real images (from NewSessionDialog's uploads, if any) are persisted the same way every
  // other chart upload in this app already is - TradeJournalImageStore (IndexedDB), with the
  // resulting imageBlobId stored on the entry - never a blob: URL saved directly into the
  // session object, since those don't survive a page reload.
  const entries = await Promise.all((values.uploads || []).map(async (upload) => {
    const entry = { id: 'entry-' + now + '-' + upload.timeframe, timeframe: upload.timeframe, hasImage: true, scenarios: [] };
    if (window.TradeJournalImageStore) {
      const blobId = 'img-' + now + '-' + upload.timeframe;
      try {
        await window.TradeJournalImageStore.saveImage(blobId, upload.file);
        entry.imageBlobId = blobId;
        return entry;
      } catch (_) { /* fall through to the inline data URL below */ }
    }
    entry.preview = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(upload.file);
    });
    return entry;
  }));
  const session = {
    id: 'session-' + now,
    name: values.city,
    market: values.city === 'New York' ? 'NewYork' : values.city,
    timeframe: values.timeframe,
    date: values.gregorian,
    gregorianDate: values.gregorian,
    jalali: values.jalali,
    status: 'open',
    startedAt: now,
    createdAt: now,
    entries
  };
  const list = readSessions(character);
  list.unshift(session);
  localStorage.setItem(storageKey(character), JSON.stringify(list));
  window.dispatchEvent(new CustomEvent('tradejournal:sessions-changed', { detail: { character, count: list.length } }));
  return session;
}

// Same guarded one-time reset session-library.js already performs, ported verbatim (same
// RESET_KEY) so an existing user's behavior is unchanged by this rewrite.
export async function resetOnce() {
  if (localStorage.getItem(RESET_KEY)) return;
  const blobIds = [];
  CHARACTERS.forEach((character) => {
    try {
      const sessions = JSON.parse(localStorage.getItem(storageKey(character))) || [];
      sessions.forEach((session) => (session.entries || []).forEach((entry) => { if (entry.imageBlobId) blobIds.push(entry.imageBlobId); }));
    } catch (_) { /* continue clearing the remaining stores */ }
  });
  if (window.TradeJournalImageStore) {
    await Promise.all(blobIds.map((id) => window.TradeJournalImageStore.deleteImage(id).catch(() => {})));
  }
  CHARACTERS.forEach((character) => localStorage.removeItem(storageKey(character)));
  localStorage.removeItem('tradejournal:session-signatures:v1');
  localStorage.setItem(RESET_KEY, new Date().toISOString());
  window.dispatchEvent(new CustomEvent('tradejournal:sessions-changed', { detail: { reset: true } }));
}
