(function () {
  'use strict';
  // Phase 2 of the local-first-to-server-authoritative migration (see ARCHITECTURE.md's Global
  // Data Sync section / the Phase 2 report). Generic, in-memory-only replica infrastructure every
  // migrated domain store (patterns/strategies/trades/sessions/mental-health) builds on instead of
  // localStorage - the browser holds a per-tab, in-memory copy hydrated from the server after
  // authentication, discarded on unload. No domain-specific logic lives here: normalize/validate/
  // business rules stay entirely inside each domain's own store file, unchanged. This module only
  // ever holds { list/document in memory, hydrate from GET, push a write with rollback-on-failure }.
  //
  // Public contract every registered domain gets (list-shaped domains; see registerDocumentDomain
  // for the one single-document domain, Mental Health):
  //   list()            - synchronous, current in-memory array (possibly empty before hydration -
  //                        see isHydrated()/hydrationError() for the honest distinction a UI needs)
  //   find(id)           - synchronous
  //   isHydrated()        - true once the initial GET has resolved (success OR failure)
  //   hydrationError()    - the Error from a failed hydration, or null
  //   hydrate()           - idempotent; safe to call more than once, only the first call fetches
  //   upsert(item)        - optimistic local apply + POST; rolls back and rejects on failure
  //   remove(id)          - optimistic local removal + DELETE; rolls back and rejects on failure
  //   setAllLocal(items)  - replaces the in-memory list without a network call (used by hydrate())
  //
  // No localStorage, no IndexedDB, no fallback-to-disk anywhere in this file - that is the entire
  // point of Phase 2. A failed write is surfaced (rolled back + a translated toast), never silently
  // dropped and never written to disk as a consolation.
  var listDomains = {};
  var documentDomains = {};

  // Cookie-based sessions (ADR-0001) mean there is no client-readable credential to attach as a
  // header any more - the browser sends the HttpOnly session cookie automatically on every
  // same-origin request, and csrf-fetch-patch.js attaches the CSRF header for unsafe methods.
  // This function keeps its old name/shape (a truthy/falsy "is there a current user" gate) so
  // every call site below needs only a rename, not a rewrite: hydrate()/upsert()/remove() all
  // still check "do we have an authenticated user before attempting this network call", they
  // just no longer need to build a header from the answer.
  function hasCurrentUser() {
    var auth = window.__NAVRYA_AUTH__;
    return Boolean(auth && auth.authenticated);
  }

  function notify(type, detail) {
    if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      window.dispatchEvent(detail === undefined ? new CustomEvent(type) : new CustomEvent(type, { detail: detail }));
    }
  }

  // Minimal, translated, non-blocking failure toast - every domain store that used to have its own
  // private toast() (dev-user-switcher.js, session-entry-flow.js, ...) already established this
  // exact "append a div, remove it after ~2.6s" shape; this is the one shared copy Phase 2 needs
  // for write failures, not a new UI system.
  var TOAST_COPY = {
    fa: 'ذخیره‌سازی روی سرور ناموفق بود. تغییرات شما لغو شد.',
    ar: 'فشل الحفظ على الخادم. تم التراجع عن تغييراتك.',
    en: 'Saving to the server failed. Your change was rolled back.',
    es: 'No se pudo guardar en el servidor. Se deshizo tu cambio.'
  };
  function toastSaveFailed() {
    if (typeof document === 'undefined' || !document.body) return;
    var lang = String((document.documentElement && document.documentElement.lang) || 'en').toLowerCase();
    var message = TOAST_COPY[lang] || TOAST_COPY.en;
    var node = document.createElement('div');
    node.className = 'tj-replica-toast';
    node.setAttribute('style', 'position:fixed;bottom:24px;inset-inline:0;margin:0 auto;width:max-content;max-width:90vw;background:#3a1414;color:#ffd7d7;border:1px solid #7a2d2d;border-radius:10px;padding:10px 16px;font-size:13px;z-index:9999;');
    node.textContent = message;
    document.body.appendChild(node);
    if (typeof setTimeout === 'function') setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 3200);
  }

  function requestJson(url, options) {
    return fetch(url, options).then(function (response) {
      if (!response.ok) { var error = new Error('REPLICA_REQUEST_FAILED'); error.status = response.status; throw error; }
      if (response.status === 204) return null;
      return response.json();
    });
  }

  // Every migrated domain's records are plain JSON (ISO date strings, no functions/circular
  // refs) - a deep clone here is what makes per-item rollback below actually safe. Without it,
  // two writes to the same record (e.g. create() immediately followed by save(), or a user
  // editing the same field twice in quick succession) would share the SAME object reference, so
  // an EARLIER write's own domain-store normalize() (which mutates its input in place, the
  // existing convention throughout this codebase) would retroactively corrupt what a LATER
  // write's rollback snapshot thought "the previous value" was.
  function deepClone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }

  // --- List-shaped domains (patterns, strategies, trades, sessions) ---------------------------
  function registerListDomain(name, config) {
    var state = { items: [], hydrated: false, hydrationError: null, hydratePromise: null };
    var extractList = config.extractList || function (body) { return body[name] || []; };

    // Cloned on the way out too, not just on the way in - a caller mutating what list()/find()
    // handed back (every existing domain store's own normalize() mutates its argument in place,
    // the established convention throughout this codebase) must never corrupt this module's own
    // internal state or a rollback target that's still pending.
    function list() { return state.items.map(deepClone); }
    function find(id) { return deepClone(state.items.find(function (item) { return item.id === id; })) || null; }
    function isHydrated() { return state.hydrated; }
    function hydrationErrorValue() { return state.hydrationError; }

    function setAllLocal(items) {
      state.items = Array.isArray(items) ? items.slice() : [];
      notify('tradejournal:replica-' + name + '-changed', { count: state.items.length });
    }

    function hydrate() {
      if (state.hydratePromise) return state.hydratePromise;
      if (!hasCurrentUser()) {
        // No authenticated user yet - never treat this as "the account is empty." Hydration
        // simply has not run; isHydrated() stays false so a boot gate keeps waiting rather than
        // rendering a false-empty account.
        state.hydratePromise = Promise.resolve();
        return state.hydratePromise;
      }
      state.hydratePromise = requestJson(config.hydrateUrl)
        .then(function (body) { setAllLocal((extractList(body) || []).map(deepClone)); state.hydrated = true; state.hydrationError = null; })
        .catch(function (error) { state.hydrated = true; state.hydrationError = error; });
      return state.hydratePromise;
    }

    // Per-item optimistic apply happens SYNCHRONOUSLY, in call order - upsert()/remove() must
    // never defer that part, since save()/create()'s own synchronous-return contract (and an
    // immediate listSync() right after) depends on it. What DOES need to be serialized per record
    // id is each write's own network round trip and its rollback target: two writes to the SAME
    // record close together (e.g. create() immediately followed by save() on the record it just
    // returned, a real pattern in this codebase) must never let an earlier write's rollback
    // restore to a value that was itself only an unconfirmed later-superseded guess. pendingByRecord
    // defers only the "send + wait + rollback-if-needed" portion of each write until the previous
    // write to that SAME id has fully settled - by then "the previous value" is always either the
    // last server-confirmed value or nothing, never another write's own still-pending state.
    // Writes to different ids are never serialized against each other.
    var pendingByRecord = {};
    function afterPending(id, run) {
      var previous = pendingByRecord[id] || Promise.resolve();
      var settled = previous.then(NOOP, NOOP);
      var result = settled.then(run);
      pendingByRecord[id] = result.then(NOOP, NOOP);
      return result;
    }
    function NOOP() {}

    function upsert(item) {
      var applied = deepClone(item);
      var index = state.items.findIndex(function (existing) { return existing.id === applied.id; });
      var nextItems = state.items.slice();
      if (index > -1) nextItems[index] = applied; else nextItems.unshift(applied);
      setAllLocal(nextItems); // synchronous optimistic apply

      return afterPending(item.id, function () {
        // Captured only once any earlier write to this same id has already settled - see the
        // block comment above for why this timing is what makes rollback below safe.
        var current = state.items.slice();
        var i = current.findIndex(function (existing) { return existing.id === applied.id; });
        var previousItem = (i > -1 && current[i] !== applied) ? current[i] : undefined;

        function rollback() {
          var latest = state.items.slice();
          var j = latest.findIndex(function (existing) { return existing.id === applied.id; });
          if (j === -1 || latest[j] !== applied) return; // superseded already - leave it alone
          if (previousItem === undefined) latest.splice(j, 1); else latest[j] = previousItem;
          setAllLocal(latest);
        }

        if (!hasCurrentUser()) { rollback(); toastSaveFailed(); throw new Error('NO_CURRENT_USER'); }
        return requestJson(config.writeUrl, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item)
        }).then(function (saved) {
          var latest = state.items.slice();
          var j = latest.findIndex(function (existing) { return existing.id === applied.id; });
          if (j > -1 && latest[j] === applied) {
            var reconciled = deepClone(saved) || applied;
            latest[j] = reconciled;
            setAllLocal(latest);
            return reconciled;
          }
          return saved || applied;
        }).catch(function (error) {
          rollback();
          toastSaveFailed();
          throw error;
        });
      });
    }

    function remove(id) {
      var index = state.items.findIndex(function (item) { return item.id === id; });
      var removedNow = index > -1 ? state.items[index] : undefined;
      setAllLocal(state.items.filter(function (item) { return item.id !== id; })); // synchronous optimistic apply

      return afterPending(id, function () {
        function restoreIfStillAbsent() {
          if (removedNow === undefined) return;
          var current = state.items.slice();
          if (current.some(function (item) { return item.id === id; })) return; // a later write already re-created it
          current.unshift(removedNow);
          setAllLocal(current);
        }
        if (!hasCurrentUser()) { restoreIfStillAbsent(); toastSaveFailed(); throw new Error('NO_CURRENT_USER'); }
        return requestJson(config.deleteUrlFor(id), { method: 'DELETE' })
          .catch(function (error) {
            if (error && error.status === 404) return; // already gone server-side - the local removal stands
            restoreIfStillAbsent();
            toastSaveFailed();
            throw error;
          });
      });
    }

    var domain = {
      list: list, find: find, isHydrated: isHydrated, hydrationError: hydrationErrorValue,
      setAllLocal: setAllLocal, hydrate: hydrate, upsert: upsert, remove: remove
    };
    listDomains[name] = domain;
    return domain;
  }

  // --- Single-document domains (Mental Health Profile) ----------------------------------------
  function registerDocumentDomain(name, config) {
    var state = { doc: null, hydrated: false, hydrationError: null, hydratePromise: null };
    var extractDoc = config.extractDoc || function (body) { return body[name] || null; };
    // The two existing single-document routes don't agree on their own POST response shape
    // (mental-health.mjs returns the saved document directly; companion.mjs wraps it as
    // {state: saved}) - extractSaved lets each registration say which its own writeUrl uses,
    // rather than this module guessing. Defaults to "the body itself" (the more common shape).
    var extractSaved = config.extractSaved || function (body) { return body; };

    function get() { return deepClone(state.doc); } // same "never a live reference out" guarantee as list()/find() above
    function isHydrated() { return state.hydrated; }
    function hydrationErrorValue() { return state.hydrationError; }

    function setLocal(doc) {
      state.doc = doc;
      notify('tradejournal:replica-' + name + '-changed');
    }

    function hydrate() {
      if (state.hydratePromise) return state.hydratePromise;
      if (!hasCurrentUser()) { state.hydratePromise = Promise.resolve(); return state.hydratePromise; }
      state.hydratePromise = requestJson(config.hydrateUrl)
        .then(function (body) { setLocal(deepClone(extractDoc(body))); state.hydrated = true; state.hydrationError = null; })
        .catch(function (error) { state.hydrated = true; state.hydrationError = error; });
      return state.hydratePromise;
    }

    // A single document has no per-record id to guard rollback-vs-superseded with the way the
    // list domains above do - the same "whichever copy's lastUpdatedAt is newer wins" rule
    // Section 7.18 Module 5 already established for this exact document is the reconciliation
    // this domain's own store (mental-health-store.js) is expected to apply on its side before
    // ever calling set() again after a rollback; this module only guarantees the rolled-back
    // value is this call's own true previous value, deep-cloned so later local mutation can't
    // corrupt it retroactively.
    function set(doc) {
      var applied = deepClone(doc);
      var previous = state.doc;
      setLocal(applied);
      function rollback() { if (state.doc === applied) setLocal(previous); }
      if (!hasCurrentUser()) { rollback(); toastSaveFailed(); return Promise.reject(new Error('NO_CURRENT_USER')); }
      return requestJson(config.writeUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(doc)
      }).then(function (body) {
        var reconciled = deepClone(extractSaved(body)) || applied;
        if (state.doc === applied) setLocal(reconciled);
        return reconciled;
      }).catch(function (error) { rollback(); toastSaveFailed(); throw error; });
    }

    var domain = { get: get, isHydrated: isHydrated, hydrationError: hydrationErrorValue, setLocal: setLocal, hydrate: hydrate, set: set };
    documentDomains[name] = domain;
    return domain;
  }

  function domain(name) { return listDomains[name] || documentDomains[name] || null; }

  // Aggregates every domain ever registered by the time this is called - character-app.jsx's
  // mount() calls this right before its first render, which (see the four character index.html
  // files' script order) is always after every domain store's own <script> has already run its
  // top-level registerListDomain()/hydrate() call. Resolves once every domain has SETTLED
  // (success or failure) - never rejects itself, since one domain's outage must not block the
  // whole app; failedDomains() is what a boot gate checks to show an honest error instead of a
  // false-empty account.
  function allReady() {
    var promises = []
      .concat(Object.keys(listDomains).map(function (key) { return listDomains[key].hydrate(); }))
      .concat(Object.keys(documentDomains).map(function (key) { return documentDomains[key].hydrate(); }));
    return Promise.all(promises);
  }

  function failedDomains() {
    var failed = [];
    Object.keys(listDomains).forEach(function (key) { if (listDomains[key].hydrationError()) failed.push(key); });
    Object.keys(documentDomains).forEach(function (key) { if (documentDomains[key].hydrationError()) failed.push(key); });
    return failed;
  }

  window.TradeJournalServerReplica = {
    registerListDomain: registerListDomain,
    registerDocumentDomain: registerDocumentDomain,
    domain: domain,
    allReady: allReady,
    failedDomains: failedDomains
  };
}());
