(function () {
  'use strict';
  // Phase 1 of the local-first-to-server-authoritative migration (see ARCHITECTURE.md's Known
  // Constraints / Global Data Sync section for the full plan). This is the stopgap that closes
  // the reported cross-user data-isolation bug NOW, ahead of Phase 2's full server-replica
  // rewrite: on login/reload, if the currently authenticated user differs from whoever last
  // wrote the browser's local caches, every user-scoped localStorage key is deleted outright
  // (never merely hidden in memory) before it can be read by anything else. Fail-closed: a key
  // with no recorded owner at all is treated exactly like a mismatch, not like "safe to adopt."
  //
  // This file MUST be the first shared <script> loaded on every character page, right after
  // app.js - see the four public/pages/{character}/index.html files. Its own check runs
  // synchronously at the bottom of this IIFE, so it always completes before any other shared
  // module's own top-level read() ever executes. It intentionally has zero dependency on any
  // other shared module (not even dev-user-switcher.js, which loads much later in the existing
  // order) - it reads the raw auth-token key directly, the same one dev-user-switcher.js itself
  // reads/writes under the name AUTH_TOKEN_KEY below.
  //
  // Generalizes (and, per explicit product decision, replaces) the bespoke `_ownerUserId`
  // mechanism ai-companion-profile.js prototyped for its own one document - that file's own
  // version only ever hid a mismatched document in memory, never deleted it from storage, which
  // is the "merely hide" failure mode this module is required not to repeat. ai-companion-profile.js
  // no longer needs its own copy: by the time it loads, this guard has already run.
  var AUTH_TOKEN_KEY = 'tradejournal:auth-token';
  var OWNER_USER_ID_KEY = 'tradejournal:owner-user-id:v1';

  // Every localStorage key whose correctness depends on WHICH authenticated user is active,
  // scoped to Phase 1: the five Section 7.18 domain caches, the Journey G companion-state
  // document, their shared sync outbox, the account-profile XP dedupe bookkeeping, and the
  // retired dev-mode identity key. Deliberately NOT included (see the Phase 1 report this file
  // shipped with): tradejournal:auth-token itself (the credential - cleared only by its own
  // clearToken()), tradejournal:ai-byok:v1 (an explicit, intentional opt-in the user asked to
  // keep out of scope), and every Group-B preference/layout/language key (session-signatures,
  // character-panels, ai-settings, app-settings, tradejournal-language, ...) - those are real
  // per-user data too, but out of scope for this stopgap; they are deferred to the later phase
  // that replaces localStorage for them as well.
  var EXACT_KEYS = [
    'tradejournal:patterns:v1',
    'tradejournal:strategies:v2',
    'tradejournal:strategy-education:v1', // legacy singleton - still read as a migration source if the key above is ever absent
    'tradejournal:trades:v1',
    'tradejournal:trade-settings:v1',
    'tradejournal:sessions:v1:shared',
    // Legacy per-character keys: nothing live writes these any more (session-workspace-logic.js/
    // sessionsAdapter.js already migrate and delete them once), but a stale copy left over from
    // before that migration existed would otherwise still be readable - purged defensively.
    'tradejournal:sessions:v1:hunter',
    'tradejournal:sessions:v1:engineer',
    'tradejournal:sessions:v1:commander',
    'tradejournal:sessions:v1:sage',
    'tradejournal:mental-health-profile:v2',
    'tradejournal:mental-health-profile:v1', // legacy
    'tradejournal:mental-health-compliance:v1',
    'tradejournal:companion-state:v1',
    // The shared offline outbox (sync-queue.js) - a queued entry has no owner field of its own,
    // so on any owner change the WHOLE queue must go: a pending write from the outgoing user
    // would otherwise be sent to the server under the incoming user's own auth token.
    'tradejournal:sync-queue:v1',
    // Retired identity key (superseded by AUTH_TOKEN_KEY itself) - nothing in the current
    // codebase writes it any more; purged defensively in case anything ever did.
    'tradejournal:dev-user-id',
    // account-profile-store.js's own "already sent" XP/achievement dedupe bookkeeping. Not a
    // leak of trade/session content, but leaving these stale for a new user silently suppresses
    // real XP they have not actually earned yet (the set says "already sent" for an event that
    // belonged to the PREVIOUS user).
    'tradejournal:account-profile-xp-sent-onboarding:v1',
    'tradejournal:account-profile-xp-sent-session:v1',
    'tradejournal:account-profile-xp-sent-pattern:v1',
    'tradejournal:account-profile-xp-sent-strategy:v1',
    'tradejournal:account-profile-xp-sent-trade:v1',
    'tradejournal:account-profile-xp-sent-psych:v1',
    'tradejournal:account-profile-xp-sent-community:v1',
    'tradejournal:account-profile-listing-ids:v1',
    'tradejournal:account-profile-purchase-ids:v1'
  ];

  // One-time migration-flag keys are already namespaced by an embedded userId
  // (...:v1:{userId}, or ...:v1:{character}:{userId} for sessions) - a user switch can never
  // read the WRONG one, since a different user simply has a different key name entirely, so
  // these are not a leak vector on their own. Swept anyway, for every embedded id found, purely
  // so a browser that has ever hosted more than one account doesn't accumulate one flag per past
  // user forever.
  var MIGRATION_FLAG_PREFIXES = [
    'tradejournal:patterns-migrated:v1:',
    'tradejournal:strategies-migrated:v1:',
    'tradejournal:trades-migrated:v1:',
    'tradejournal:sessions-migrated:v1:',
    'tradejournal:mental-health-migrated:v1:',
    'tradejournal:companion-state-migrated:v1:'
  ];

  function safeGet(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
  function safeSet(key, value) { try { localStorage.setItem(key, value); } catch (_) { /* no-op if storage is unavailable */ } }
  function safeRemove(key) { try { localStorage.removeItem(key); } catch (_) { /* no-op */ } }

  // The token itself (auth-tokens.mjs's signToken()) is `base64url(JSON{sub,iat,exp}) + '.' +
  // base64url(signature)` - a NEW token is minted on every login/re-login for the SAME account,
  // so comparing raw token strings (an earlier version of this file did) treats a plain re-login
  // as a different user and purges everything, including that user's own still-unsent sync-queue
  // entries. `sub` (the real, stable user id) is what must be compared instead. Decoding the
  // payload here does NOT verify the signature - that is deliberate and safe: this value only
  // ever drives a client-side purge/no-purge decision, never an authorization decision (every
  // real API call is still verified server-side by requireAuth on every request, unchanged). A
  // forged token could at worst cause an incorrect purge choice on this one browser, which is no
  // more than someone with that same local access could already do by editing localStorage
  // directly - it can never grant access to another account's real data.
  function decodeBase64Url(str) {
    var padded = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (str.length % 4)) % 4);
    return atob(padded);
  }
  function decodeTokenUserId(token) {
    try {
      var dot = token.indexOf('.');
      if (dot < 1) return null;
      var claims = JSON.parse(decodeBase64Url(token.slice(0, dot)));
      return claims && typeof claims.sub === 'string' && claims.sub ? claims.sub : null;
    } catch (_) { return null; }
  }

  // Fail-closed fallback: a present-but-undecodable token (corrupt/unexpected format) is still
  // treated as SOME identity - the raw token string itself - rather than silently treated as "no
  // one," which would leave a previous real user's data sitting there unrecognized/unprotected.
  function currentUserId() {
    var token = safeGet(AUTH_TOKEN_KEY) || '';
    if (!token) return '';
    return decodeTokenUserId(token) || token;
  }

  function sweepMigrationFlags() {
    var toRemove = [];
    try {
      for (var i = 0; i < localStorage.length; i += 1) {
        var key = localStorage.key(i) || '';
        for (var p = 0; p < MIGRATION_FLAG_PREFIXES.length; p += 1) {
          if (key.indexOf(MIGRATION_FLAG_PREFIXES[p]) === 0) { toRemove.push(key); break; }
        }
      }
    } catch (_) { /* storage unavailable - nothing to sweep */ }
    toRemove.forEach(safeRemove);
  }

  // session-entry-flow.js (the only module that actually opens the IndexedDB handle) is loaded
  // much later than this guard in the existing script order, so at real boot time it has not
  // defined window.TradeJournalImageStore yet. Leave a flag it checks for itself once its own
  // IIFE runs; this is the one place that flag is ever consumed. If the store IS already
  // available (the explicit logout() call path, where the whole page has long since loaded),
  // clear it directly instead of round-tripping through the flag. Called unconditionally from
  // purgeAll() below, so this fires on BOTH real purge paths - the boot-time owner-mismatch
  // check (checkAndPurgeIfNeeded(), the actual leak scenario: a different user's session simply
  // continuing to load, no explicit logout ever happening) and the explicit logout() call.
  //
  // Calling this fire-and-forget/best-effort (rather than something a later read path waits on)
  // is only safe BECAUSE EXACT_KEYS above has already been synchronously, completely removed by
  // the time this runs: nothing left in localStorage still references any blob id, so there is no
  // read path anywhere that depends on this having finished. That is a real dependency, not just
  // a convenience - if the localStorage purge were ever incomplete (a future domain added without
  // updating EXACT_KEYS, or a storage exception silently swallowed by safeRemove()), an orphaned
  // reference could survive alongside an orphaned blob, and this would stop being pure hygiene.
  function requestImageStoreClear() {
    if (window.TradeJournalImageStore && typeof window.TradeJournalImageStore.clearAll === 'function') {
      window.TradeJournalImageStore.clearAll().catch(function () { /* best-effort - orphaned blobs are a quota/hygiene concern, not a correctness one, since nothing left in localStorage still references their ids */ });
    } else {
      window.__TJ_PENDING_IMAGE_STORE_CLEAR__ = true;
    }
  }

  function notify(type, detail) {
    if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
      window.dispatchEvent(detail === undefined ? new CustomEvent(type) : new CustomEvent(type, { detail: detail }));
    }
  }

  function notifyAllDomainsChanged() {
    notify('tradejournal:patterns-changed', { count: 0 });
    notify('tradejournal:strategies-changed', { count: 0 });
    notify('tradejournal:strategy-education-changed', { count: 0 });
    notify('tradejournal:trades-changed', { count: 0 });
    notify('tradejournal:trade-settings-changed');
    notify('tradejournal:sessions-changed', { reset: true });
    notify('tradejournal:mental-health-changed');
    notify('tradejournal:companion-state-changed');
  }

  // Unconditional wipe of every Phase 1-scoped key, regardless of current content - called both
  // by the boot-time mismatch check below and directly by dev-user-switcher.js's logout(). Purge
  // means delete, never "return empty from memory while leaving the bytes on disk" - a later,
  // unrelated code path (or a bug) reading localStorage directly must see nothing, not just see
  // nothing through this module's own accessors.
  function purgeAll() {
    EXACT_KEYS.forEach(safeRemove);
    sweepMigrationFlags();
    requestImageStoreClear();
    safeRemove(OWNER_USER_ID_KEY);
    notifyAllDomainsChanged();
  }

  // The actual boot-time gate. Fail-closed: a live identity with no recorded owner at all (first
  // run of this guard on an existing browser, or any other reason OWNER_USER_ID_KEY is absent) is
  // treated exactly like a real mismatch - purged, never adopted, even if the data underneath
  // would in fact have belonged to the same real person. The five domains are already fully
  // server-synced (ARCHITECTURE.md 7.18), so this is a one-time forced reconcile-from-server on
  // next load for an existing legitimate user, not real data loss - see the Phase 1 report for
  // the one honest exception (a write still sitting unsent in the outbox at the moment of this
  // first purge). A stamp is only ever written here, never by an individual store's own write():
  // every domain shares the one real identity, so there is no scenario where only some stores
  // would be stale while others are fresh. Because the identity compared is the token's stable
  // `sub`, not the token string itself, an ordinary re-login or token rotation for the SAME
  // account is correctly recognized as a no-op here - it does not purge, and in particular does
  // not destroy that user's own still-unsent tradejournal:sync-queue:v1 entries.
  function checkAndPurgeIfNeeded() {
    var live = currentUserId();
    if (!live) return false; // nobody authenticated yet - nothing of a real user's to protect or leak
    var last = safeGet(OWNER_USER_ID_KEY);
    if (last === live) return false; // same account as last recorded here - the common case, do nothing
    purgeAll();
    safeSet(OWNER_USER_ID_KEY, live);
    return true;
  }

  checkAndPurgeIfNeeded();

  window.TradeJournalUserScopeGuard = {
    ownerUserIdKey: OWNER_USER_ID_KEY,
    exactKeys: EXACT_KEYS.slice(),
    migrationFlagPrefixes: MIGRATION_FLAG_PREFIXES.slice(),
    currentUserId: currentUserId,
    purgeAll: purgeAll,
    checkAndPurgeIfNeeded: checkAndPurgeIfNeeded
  };
}());
