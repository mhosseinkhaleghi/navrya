// Phase 3 of the local-first-to-server-authoritative migration (see ARCHITECTURE.md's Global
// Data Sync section): reads the in-memory server-replica directly, the exact same 'sessions'
// domain public/pages/shared/session-workspace-logic.js registers (it loads first in every
// character page's script order, so by the time this module's own code ever runs - well after
// page load, once the NAVRYA bundle mounts - the domain is already registered). There is no
// localStorage cache, no offline outbox, and no local-first fallback for Sessions any more; see
// server-replica.js's own file header for the write/rollback contract.
export const RESET_KEY = 'tradejournal:session-library-empty-reset:v1';

// NewSessionDialog.jsx's own LOOP_INTERVALS - `loop` arrives here as one of these human-readable
// labels (its <Select>'s value), never a bare number of minutes. Falls back to trying a plain
// numeric string (e.g. if a future caller ever passes minutes directly) before giving up.
const LOOP_LABEL_TO_MINUTES = { '15 min': 15, '30 min': 30, '1 hour': 60, '4 hours': 240 };
function loopMinutesFrom(loop) {
  if (Object.prototype.hasOwnProperty.call(LOOP_LABEL_TO_MINUTES, loop)) return LOOP_LABEL_TO_MINUTES[loop];
  const n = Number(loop);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function domain() { return window.TradeJournalServerReplica && window.TradeJournalServerReplica.domain('sessions'); }

// `character` is still accepted by the functions below (existing callers keep passing it) but
// has never affected which sessions are read/written - one shared, account-wide bucket for
// every character, matching Section 7.18 Module 1's server-side scoping by user_id alone.
export function readSessions(character) {
  const live = domain();
  return live ? live.list() : [];
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
    const live = domain();
    // Deletes each unusable record individually through the replica (and so on the server too),
    // rather than the old bulk "overwrite the whole local list" - server-replica.js has no bulk
    // write of its own, only per-record upsert/remove, matching every other migrated domain.
    if (live) values.filter((s) => !isUsable(s)).forEach((s) => { if (s && s.id) live.remove(s.id).catch(() => {}); });
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
    showDetail: true,
    // Sort-only fields (SessionLibrary reads these to order the grid; stripped before they
    // reach SessionCard, which doesn't know them). Never trust storage array order alone for
    // "newest first" - save() on an existing session doesn't move it, only creation does.
    sortTimestamp: sessionTimestamp(session),
    sortEntryCount: entryCount(session)
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
// entries) - through the same replica domain, so it appears identically for every other piece of
// code that reads sessions (the workspace view, session-signature backfill, etc).
//
// updateIntervalMinutes/gracePeriodMinutes (`values.loop`/`values.grace` - collected by
// NewSessionDialog.jsx's own fields, fillable by AI action session.create too, per
// docs/ai/action-coverage-matrix.md's optionalFields list) were previously silently dropped here:
// the object literal below never included them at all, so whatever the user picked in the dialog
// (or the AI extracted from speech/text) never reached the server - every session silently fell
// back to the DB layer's own hardcoded defaults (30/5, see repo.pg.mjs/repo.memory.mjs) instead.
export async function createSession(character, values) {
  const now = Date.now();
  const loopMinutes = loopMinutesFrom(values.loop);
  const graceMinutes = Number(values.grace);
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
    ...(loopMinutes ? { updateIntervalMinutes: loopMinutes } : {}),
    ...(Number.isFinite(graceMinutes) && graceMinutes >= 0 ? { gracePeriodMinutes: graceMinutes } : {}),
    startedAt: now,
    createdAt: now,
    entries
  };
  // Optimistic apply, fire-and-forget send (matches every other migrated domain's save()/
  // create() - see server-replica.js's own file header): the record is already in the replica's
  // in-memory list by the time upsert() returns its Promise, so this never blocks the dialog on
  // the network the way an `await` here would (the old localStorage write never did either).
  const live = domain();
  if (live) live.upsert(session).catch(() => {});
  window.dispatchEvent(new CustomEvent('tradejournal:sessions-changed', { detail: { character, count: live ? live.list().length : 1 } }));
  return session;
}

// Historical one-time reset for a pre-server-sync bug where a fresh install could end up with
// demo/seed session data sitting in localStorage (see the flag's own name, ported verbatim from
// session-library.js). Kept as a guarded no-op: nothing writes session data to localStorage any
// more (readSessions()/createSession() above are fully replica-backed), so a fresh account starts
// empty from the server and there is nothing left here for this to clear - the seeding bug this
// once fixed cannot recur. The RESET_KEY guard itself is kept only so character-app.jsx's boot
// gate (`Promise.all([sessionsAdapter.resetOnce(), ...])`) keeps working unchanged, and so a
// browser that already ran this once continues to short-circuit exactly as before.
export async function resetOnce() {
  if (localStorage.getItem(RESET_KEY)) return;
  localStorage.setItem(RESET_KEY, new Date().toISOString());
}
