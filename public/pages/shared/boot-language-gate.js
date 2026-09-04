(function () {
  'use strict';
  // Consolidated real-session boot gate (supersedes the Phase 8e localStorage-token version).
  // The very first script on every character page, before anything else - see the matching
  // `<style>html{visibility:hidden}</style>`, the first thing in <head>, and user-scope-guard.js's
  // own comment on why this must stay first. Cookie-based sessions (server/community/security/
  // session-service.mjs) mean there is no client-readable credential to inspect any more, so this
  // file now performs the ENTIRE early bootstrap sequence in one request:
  //   1. resolve the authenticated user from the real server session (GET /api/auth/session,
  //      credentials:'include' - the HttpOnly session cookie rides along automatically for a
  //      same-origin request, exactly like every other fetch in this app);
  //   2. purge any previous-user's cached data if the real returned user id differs from the
  //      last one recorded on this browser (fail-closed: no stamp at all is treated as a
  //      mismatch, never adopted - same rule Phase 1's user-scope-guard.js originally used);
  //   3. apply the real language/direction;
  //   4. reveal the page;
  //   5. redirect an unauthenticated dashboard visit to the account/character-select route.
  //
  // The purge logic (EXACT_KEYS et al.) is intentionally duplicated here rather than importing
  // user-scope-guard.js (which still exists, loaded later, as the on-demand copy
  // dev-user-switcher.js's logout() calls) - the same "duplicate one self-contained routine
  // instead of reordering scripts" tradeoff this file's own Phase 8e history already made,
  // because this script must remain a plain classic script with zero load-order dependency on
  // anything else, and turning user-scope-guard.js into an ES module the very first script could
  // import was judged a bigger, riskier change for this pass than keeping one small duplicate.
  var root = document.documentElement;
  var DEFAULT_LANG = 'en'; // matches the chooser's pre-auth default and avoids an unexpected fa/rtl fallback
  var TIMEOUT_MS = 5000;
  var OWNER_USER_ID_KEY = 'tradejournal:owner-user-id:v1';

  // Kept identical to user-scope-guard.js's own list on purpose (see that file's own comment for
  // why each key is there) - a future edit to one MUST be mirrored in the other.
  var EXACT_KEYS = [
    'tradejournal:patterns:v1', 'tradejournal:strategies:v2', 'tradejournal:strategy-education:v1',
    'tradejournal:trades:v1', 'tradejournal:trade-settings:v1', 'tradejournal:sessions:v1:shared',
    'tradejournal:sessions:v1:hunter', 'tradejournal:sessions:v1:engineer', 'tradejournal:sessions:v1:commander', 'tradejournal:sessions:v1:sage',
    'tradejournal:mental-health-profile:v2', 'tradejournal:mental-health-profile:v1', 'tradejournal:mental-health-compliance:v1',
    'tradejournal:companion-state:v1', 'tradejournal:sync-queue:v1', 'tradejournal:dev-user-id',
    'tradejournal:account-profile-xp-sent-onboarding:v1', 'tradejournal:account-profile-xp-sent-session:v1',
    'tradejournal:account-profile-xp-sent-pattern:v1', 'tradejournal:account-profile-xp-sent-strategy:v1',
    'tradejournal:account-profile-xp-sent-trade:v1', 'tradejournal:account-profile-xp-sent-psych:v1',
    'tradejournal:account-profile-xp-sent-community:v1', 'tradejournal:account-profile-listing-ids:v1',
    'tradejournal:account-profile-purchase-ids:v1'
  ];
  var MIGRATION_FLAG_PREFIXES = [
    'tradejournal:patterns-migrated:v1:', 'tradejournal:strategies-migrated:v1:', 'tradejournal:trades-migrated:v1:',
    'tradejournal:sessions-migrated:v1:', 'tradejournal:mental-health-migrated:v1:', 'tradejournal:companion-state-migrated:v1:'
  ];

  function safeGet(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
  function safeSet(key, value) { try { localStorage.setItem(key, value); } catch (_) { /* no-op */ } }
  function safeRemove(key) { try { localStorage.removeItem(key); } catch (_) { /* no-op */ } }

  function sweepMigrationFlags() {
    var toRemove = [];
    try {
      for (var i = 0; i < localStorage.length; i += 1) {
        var key = localStorage.key(i) || '';
        for (var p = 0; p < MIGRATION_FLAG_PREFIXES.length; p += 1) {
          if (key.indexOf(MIGRATION_FLAG_PREFIXES[p]) === 0) { toRemove.push(key); break; }
        }
      }
    } catch (_) { /* storage unavailable */ }
    toRemove.forEach(safeRemove);
  }

  function requestImageStoreClear() {
    if (window.TradeJournalImageStore && typeof window.TradeJournalImageStore.clearAll === 'function') {
      window.TradeJournalImageStore.clearAll().catch(function () { /* best-effort, see user-scope-guard.js's own comment */ });
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

  function purgeAll() {
    EXACT_KEYS.forEach(safeRemove);
    sweepMigrationFlags();
    requestImageStoreClear();
    safeRemove(OWNER_USER_ID_KEY);
    notifyAllDomainsChanged();
  }

  // Fail-closed exactly like the original: a real authenticated user id with no matching stamp
  // (first load, or a genuinely different account) purges before anything is trusted.
  function purgeIfOwnerMismatch(realUserId) {
    if (!realUserId) return;
    var last = safeGet(OWNER_USER_ID_KEY);
    if (last === realUserId) return;
    purgeAll();
    safeSet(OWNER_USER_ID_KEY, realUserId);
  }

  function applyLangDir(lang) {
    var known = lang === 'fa' || lang === 'ar' || lang === 'en' || lang === 'es' ? lang : DEFAULT_LANG;
    root.lang = known;
    root.dir = known === 'fa' || known === 'ar' ? 'rtl' : 'ltr';
  }
  // MUST set 'visible', never clear to '' - the hiding rule is a stylesheet rule
  // (<style>html{visibility:hidden}</style> in <head>), not an inline style; only an inline
  // value outranks it. See the original Phase 8e hotfix note this file's history carries.
  function reveal() { root.style.visibility = 'visible'; }

  function fail() {
    window.__TJ_LANGUAGE_HYDRATE_FAILED__ = true;
    applyLangDir(DEFAULT_LANG);
    reveal();
    redirectToAccount();
  }

  // Dashboard pages (every character page this script loads on) redirect an unauthenticated
  // visit to the account/character-select route - this script never runs on select/admin pages,
  // so every page it DOES run on is, by definition, a dashboard that requires a real session.
  // target="_top" because this page is always loaded inside the outer shell's iframe
  // (src/release.js) - a bare location.hash change would only affect this iframe's own history.
  function redirectToAccount() {
    try { window.top.location.hash = '/'; } catch (_) { window.location.hash = '/'; }
  }

  var controller = typeof AbortController === 'function' ? new AbortController() : null;
  var timer = setTimeout(function () { if (controller) controller.abort(); }, TIMEOUT_MS);

  window.__NAVRYA_AUTH_READY__ = fetch('/api/auth/session', {
    credentials: 'include', cache: 'no-store', signal: controller ? controller.signal : undefined
  })
    .then(function (response) {
      clearTimeout(timer);
      if (!response.ok) throw new Error('SESSION_BOOTSTRAP_FAILED');
      return response.json();
    })
    .then(function (body) {
      var auth = {
        authenticated: Boolean(body && body.authenticated),
        userId: body && body.user ? body.user.id : null,
        user: (body && body.user) || null,
        csrfToken: (body && body.csrfToken) || null
      };
      window.__NAVRYA_AUTH__ = auth;
      if (auth.authenticated) {
        purgeIfOwnerMismatch(auth.userId);
        applyLangDir(body.language);
        reveal();
      } else {
        // Nothing of a real user's to protect/leak, but also nothing to render - a dashboard
        // page with no session redirects to the account route rather than rendering empty/broken.
        applyLangDir(DEFAULT_LANG);
        reveal();
        redirectToAccount();
      }
      return auth;
    })
    .catch(function () {
      clearTimeout(timer);
      fail();
      window.__NAVRYA_AUTH__ = { authenticated: false, userId: null, user: null, csrfToken: null };
      return window.__NAVRYA_AUTH__;
    });
}());
