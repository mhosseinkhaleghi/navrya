(function () {
  'use strict';
  // Phase 8e of the local-first-to-server-authoritative migration (see ARCHITECTURE.md's Known
  // Constraints section): the very first script on every character page, even before
  // user-scope-guard.js - its one job is to determine the real, server-stored language
  // preference and reveal the page (see the matching `<style>html{visibility:hidden}</style>`,
  // the very first thing in <head>) only once that's known, so a returning non-Persian/non-RTL
  // user never sees a flash of the page's default fa/rtl layout before flipping to their own.
  //
  // This intentionally does NOT wait for user-preferences.js/server-replica.js to load and
  // register the 'preferences' domain through the normal script order - moving those two scripts
  // ahead of user-scope-guard.js (the tested "must be the very first shared script" invariant
  // from Phase 1) was judged a bigger, riskier change than duplicating one small, self-contained
  // fetch here. user-preferences.js still hydrates the same domain again normally later in the
  // usual script order (a second, harmless GET to the same endpoint) for every other in-app
  // reader/writer of this preference (`navrya-src/store.js`'s setLanguage(), Settings' language
  // switcher) to use.
  //
  // Explicitly NOT a localStorage fallback: the one storage read here is
  // `tradejournal:auth-token`, the single documented EXACT_KEYS exception (the credential itself,
  // never user data) every other migrated domain already reads the exact same way to attach the
  // request header.
  var root = document.documentElement;
  var DEFAULT_LANG = 'fa'; // matches every character page's own pre-existing default (<html lang="fa" dir="rtl">)
  var TIMEOUT_MS = 5000;

  function applyLangDir(lang) {
    var known = lang === 'fa' || lang === 'ar' || lang === 'en' || lang === 'es' ? lang : DEFAULT_LANG;
    root.lang = known;
    root.dir = known === 'fa' || known === 'ar' ? 'rtl' : 'ltr';
  }
  function reveal() { root.style.visibility = ''; }

  // Surfaced explicitly, not left to chance: character-app.jsx's own boot-gate failure banner
  // (TradeJournalServerReplica.failedDomains()) checks this flag too, so a real
  // preferences-hydration failure is never silently shown as "everything is fine" just because
  // this early gate has no error UI of its own to render yet - applying the honest default and
  // revealing is not the same as claiming hydration actually succeeded.
  function fail() {
    window.__TJ_LANGUAGE_HYDRATE_FAILED__ = true;
    applyLangDir(DEFAULT_LANG);
    reveal();
  }

  var token;
  try { token = localStorage.getItem('tradejournal:auth-token') || ''; } catch (_) { token = ''; }
  if (!token) { applyLangDir(DEFAULT_LANG); reveal(); return; } // no authenticated user yet - nothing to hydrate, stays at the real default

  var controller = typeof AbortController === 'function' ? new AbortController() : null;
  var timer = setTimeout(function () { if (controller) controller.abort(); }, TIMEOUT_MS);

  fetch('/api/sync/preferences', { headers: { 'x-dev-user-id': token }, signal: controller ? controller.signal : undefined })
    .then(function (response) {
      clearTimeout(timer);
      if (!response.ok) throw new Error('PREFERENCES_HYDRATE_FAILED');
      return response.json();
    })
    .then(function (body) {
      var rows = (body && body.preferences) || [];
      var row = rows.filter(function (item) { return item.id === 'language'; })[0];
      applyLangDir(row ? row.value : DEFAULT_LANG);
      reveal();
    })
    .catch(function () { clearTimeout(timer); fail(); });
}());
