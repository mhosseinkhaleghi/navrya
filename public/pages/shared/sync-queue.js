(function () {
  'use strict';

  // Generic offline-write outbox shared by every local-first-to-server module (Sessions,
  // Pattern Registry, Strategy Education, Trade Store, Mental Health Profile - see
  // ARCHITECTURE.md's Global Data Sync section). Every module keeps writing to its own
  // localStorage cache first, exactly as before, then calls enqueue() to push that same write
  // to the server in the background - the cache is never blocked on the network.
  //
  // Outbox storage is localStorage, not IndexedDB, on purpose: entries here are small
  // structured records (a session/pattern/trade JSON payload), never raw image bytes - those
  // stay in TradeJournalImageStore's existing IndexedDB blob store and are referenced by id/URL,
  // never embedded in an outbox entry. Keeping this on localStorage means it reuses the exact
  // fake-localStorage sandbox this project's entire test suite already relies on, instead of
  // requiring a real or polyfilled IndexedDB just to unit-test retry/backoff logic.
  var KEY = 'tradejournal:sync-queue:v1';
  var senders = {}; // module name -> async function(entry) => Promise (resolve = sent, reject = retry later)
  var timer = null;

  function uid() { return 'sync-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); }
  function readAll() { try { var value = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(value) ? value : []; } catch (_) { return []; } }
  function writeAll(items) { localStorage.setItem(KEY, JSON.stringify(items)); }

  // Exponential backoff capped at 5 minutes, matching the "retries with backoff" requirement
  // without ever locking a failing entry out permanently.
  function backoffMs(attempts) { return Math.min(300000, 1000 * Math.pow(2, Math.max(0, attempts))); }

  function enqueue(module, recordId, payload, action) {
    var items = readAll();
    var entry = {
      id: uid(), module: String(module), recordId: String(recordId), action: action || 'upsert',
      payload: payload, attempts: 0, nextAttemptAt: 0, createdAt: Date.now()
    };
    items.push(entry);
    writeAll(items);
    scheduleFlush(0);
    return entry.id;
  }

  // A module registers its own send function once, at load time - the queue only owns the
  // outbox/retry mechanics, never the request shape (different modules hit different routes).
  function registerModule(module, sendFn) {
    senders[module] = sendFn;
    scheduleFlush(0);
  }

  async function attempt(entry) {
    try {
      await senders[entry.module](entry);
      return true;
    } catch (_err) {
      return false;
    }
  }

  async function runOnce() {
    var items = readAll();
    if (!items.length) return;
    var now = Date.now();
    var remaining = [];
    for (var i = 0; i < items.length; i++) {
      var entry = items[i];
      // No sender registered for this module yet (e.g. this script ran before that module's own
      // store did) - leave the entry exactly as-is. This is not a failed send, so it must never
      // consume an attempt or start the backoff clock; it becomes eligible again the instant
      // that module calls registerModule().
      if (!senders[entry.module]) { remaining.push(entry); continue; }
      if (entry.nextAttemptAt > now) { remaining.push(entry); continue; }
      var ok = await attempt(entry);
      if (!ok) {
        entry.attempts += 1;
        entry.nextAttemptAt = Date.now() + backoffMs(entry.attempts);
        remaining.push(entry);
      }
    }
    writeAll(remaining);
  }

  // flush() is reentrant-safe by sharing one in-flight promise rather than a bare boolean flag:
  // every caller (the internal timer, enqueue()'s immediate-send attempt, an external "online"
  // event, or a test) that calls flush() while a run is already in progress gets back that SAME
  // promise instead of a no-op - so `await TradeJournalSyncQueue.flush()` always means "at least
  // one full pass over the outbox has completed since this call", regardless of who else was
  // already flushing when it was made. A call that arrives mid-run schedules exactly one more
  // pass afterward (rerun), so a write enqueued during a run is never silently dropped until the
  // next timer tick.
  var inFlight = null;
  var rerunRequested = false;
  function flush() {
    if (inFlight) { rerunRequested = true; return inFlight; }
    inFlight = runOnce().finally(function () {
      inFlight = null;
      if (rerunRequested) { rerunRequested = false; flush(); }
    });
    return inFlight;
  }

  // setTimeout-only (never a direct call alongside it) so a fake, synchronously-invoking
  // setTimeout in tests (this project's existing sandbox convention, e.g. `setTimeout: fn =>
  // fn()`) is the one and only way flush() ever runs from module load/enqueue/registerModule -
  // no separate code path to keep in sync with the reentrancy handling above.
  function scheduleFlush(delay) {
    clearTimeout(timer);
    timer = setTimeout(flush, delay === undefined ? 15000 : delay);
  }

  function pendingCount(module) {
    return readAll().filter(function (entry) { return !module || entry.module === module; }).length;
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', function () { scheduleFlush(0); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) scheduleFlush(0); });
    scheduleFlush(0);
  }

  window.TradeJournalSyncQueue = { enqueue: enqueue, registerModule: registerModule, flush: flush, pendingCount: pendingCount };
}());
