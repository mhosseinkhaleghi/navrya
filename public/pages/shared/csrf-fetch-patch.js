(function () {
  'use strict';
  // Attaches a valid X-CSRF-Token header to every same-origin, state-changing fetch() call in
  // the app, automatically - a single, central fix instead of hunting down and editing the
  // dozens of existing fetch() call sites across public/pages/shared/*.js and navrya-src/*.jsx.
  // The CSRF cookie (server/community/security/cookies.mjs) is deliberately NOT HttpOnly for
  // exactly this reason: it must be readable by page JS so it can be echoed back in a header
  // (the OWASP-documented signed double-submit pattern - see security/csrf.mjs). This file reads
  // it directly from document.cookie; it never touches the session cookie itself, which stays
  // HttpOnly and is never readable here (nor does it need to be - the browser attaches it to a
  // same-origin request automatically).
  //
  // Loaded once, immediately after boot-language-gate.js, before every other shared script -
  // every subsequent fetch() call in the page (including ones made before window.__NAVRYA_AUTH__
  // resolves) goes through this wrapper.
  var UNSAFE_METHODS = { POST: 1, PUT: 1, PATCH: 1, DELETE: 1 };
  var CSRF_COOKIE_NAMES = ['__Host-navrya_csrf', 'navrya_csrf'];

  function readCsrfCookie() {
    var cookie = document.cookie || '';
    for (var i = 0; i < CSRF_COOKIE_NAMES.length; i += 1) {
      var name = CSRF_COOKIE_NAMES[i];
      var match = cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
      if (match) return decodeURIComponent(match[1]);
    }
    return null;
  }

  function isSameOriginUrl(input) {
    try {
      var url = new URL(typeof input === 'string' ? input : input.url, window.location.href);
      return url.origin === window.location.origin;
    } catch (_) {
      return true; // a bare relative path that URL() still resolves against location.href - treat as same-origin
    }
  }

  if (typeof window.fetch !== 'function' || window.__TJ_CSRF_FETCH_PATCHED__) return;
  window.__TJ_CSRF_FETCH_PATCHED__ = true;
  var originalFetch = window.fetch.bind(window);

  window.fetch = function (input, init) {
    var method = ((init && init.method) || (typeof input === 'object' && input && input.method) || 'GET').toUpperCase();
    if (!UNSAFE_METHODS[method] || !isSameOriginUrl(input)) return originalFetch(input, init);

    var token = readCsrfCookie();
    if (!token) return originalFetch(input, init);

    var nextInit = init ? Object.assign({}, init) : {};
    var headers = new Headers(nextInit.headers || (typeof input === 'object' && input && input.headers) || {});
    if (!headers.has('x-csrf-token')) headers.set('x-csrf-token', token);
    nextInit.headers = headers;
    // credentials default to 'same-origin' for a relative URL either way, but 'include' is
    // explicit and correct for every deployment topology this app runs under (Vite dev proxy,
    // Caddy same-origin reverse proxy) - see vite.config.js/deploy/Caddyfile.
    if (!nextInit.credentials) nextInit.credentials = 'include';
    return originalFetch(input, nextInit);
  };
}());
