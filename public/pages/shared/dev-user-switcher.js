(function () {
  'use strict';
  // Filename/global kept as-is on purpose (window.TradeJournalDevUserSwitcher, method names
  // currentUserId/ensureUser/isStoredUserValid/register/login/loginWithGoogle/logout) - every
  // existing call site across this codebase (community-store.js, trade-store.js,
  // pattern-registry-store.js, navrya-src's communityAvatar.jsx/messagesView.jsx/
  // marketplaceView.jsx, ...) already reaches identity through this exact API and needs no
  // change: what changes is HOW this module knows the current user, not the shape it exposes.
  //
  // There is no credential in localStorage any more (ADR-0001 section 2/5). Identity comes from
  // window.__NAVRYA_AUTH__, set once by boot-language-gate.js's own early GET /api/auth/session
  // call (credentials:'include' - the HttpOnly session cookie rides along automatically), and
  // kept live here on register/login/loginWithGoogle/logout. currentUserId() now returns the
  // REAL internal user id (previously it returned the raw bearer token itself, which silently
  // broke every "is this mine?" comparison across the app - communityView.jsx's
  // `currentUserId() === post.author.id`, marketplaceView.jsx's `... === listing.sellerId`,
  // messagesView.jsx's `message.senderId === currentUserId()` - all of those are now correct
  // automatically, with no change needed at any of those call sites).
  function el(tag, className, text) { var node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function button(text, className) { var b = el('button', className || '', text); b.type = 'button'; return b; }
  function icons(root) { if (window.TradeJournalIcons) window.TradeJournalIcons.schedule(root || document); }
  function toast(message, tone) { var node = el('div', 'tj-toast ' + (tone || ''), message); document.body.append(node); setTimeout(function () { node.remove(); }, 2600); }
  function lang() { return String(document.documentElement.lang || 'en').toLowerCase(); }
  function dir() { var l = lang(); return l === 'fa' || l === 'ar' ? 'rtl' : 'ltr'; }

  var copy = {
    fa: { title: 'حساب کاربری', current: 'وارد شده به‌عنوان', logoutBtn: 'خروج', loggedOut: 'با موفقیت خارج شدید.', logoutFailed: 'خروج انجام نشد. دوباره تلاش کنید.', adminLink: 'پنل مدیریت' },
    ar: { title: 'حساب المستخدم', current: 'مسجّل الدخول باسم', logoutBtn: 'تسجيل الخروج', loggedOut: 'تم تسجيل الخروج.', logoutFailed: 'تعذر تسجيل الخروج. حاول مرة أخرى.', adminLink: 'لوحة الإدارة' },
    en: { title: 'Account', current: 'Logged in as', logoutBtn: 'Log out', loggedOut: 'Logged out.', logoutFailed: 'Could not log out. Try again.', adminLink: 'Admin' },
    es: { title: 'Cuenta', current: 'Sesión iniciada como', logoutBtn: 'Cerrar sesión', loggedOut: 'Sesión cerrada.', logoutFailed: 'No se pudo cerrar sesión. Inténtalo de nuevo.', adminLink: 'Administración' }
  };
  function t(key) { var l = lang(); return (copy[l] && copy[l][key]) || copy.en[key] || key; }

  function authState() { return window.__NAVRYA_AUTH__ || { authenticated: false, userId: null, user: null, csrfToken: null, character: null }; }
  function currentUserId() { return authState().userId || ''; }
  function setAuthState(next) { window.__NAVRYA_AUTH__ = next; }
  function authFromSession(body) {
    return {
      authenticated: Boolean(body && body.authenticated),
      userId: body && body.user ? body.user.id : null,
      user: (body && body.user) || null,
      csrfToken: (body && body.csrfToken) || null,
      character: body && typeof body.character === 'string' ? body.character : null
    };
  }

  // On the four character pages, boot-language-gate.js (loaded first, in <head>) already started
  // the one early GET /api/auth/session call and will populate window.__NAVRYA_AUTH_READY__/
  // window.__NAVRYA_AUTH__ well before this script's own body runs. The select/character-chooser
  // and admin pages load this file WITHOUT boot-language-gate.js (they have no language-flash
  // concern to gate on), so this module is self-sufficient: if nothing has started that request
  // yet, it starts the identical one itself, exactly once.
  if (!window.__NAVRYA_AUTH_READY__) {
    window.__NAVRYA_AUTH_READY__ = fetch('/api/auth/session', { credentials: 'include' })
      .then(function (response) { return response.ok ? response.json() : { authenticated: false }; })
      .then(function (body) {
        var auth = authFromSession(body);
        setAuthState(auth);
        return auth;
      })
      .catch(function () {
        var auth = { authenticated: false, userId: null, user: null, csrfToken: null, character: null };
        setAuthState(auth);
        return auth;
      });
  }

  // Cross-tab logout (instruction: "notify other tabs with BroadcastChannel"). Every tab with
  // this script loaded joins the same channel; a tab that did NOT initiate the logout still
  // purges its own in-memory/local caches and returns to the account route.
  var CHANNEL_NAME = 'tradejournal-auth';
  var channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL_NAME) : null;
  function broadcastLogout() { if (channel) channel.postMessage({ type: 'logout' }); }
  if (channel) {
    channel.onmessage = function (event) {
      if (event && event.data && event.data.type === 'logout') applyLocalLogoutEffects();
    };
  }

  function applyLocalLogoutEffects() {
    setAuthState({ authenticated: false, userId: null, user: null, csrfToken: null, character: null });
    if (window.TradeJournalUserScopeGuard) window.TradeJournalUserScopeGuard.purgeAll();
    window.top.location.hash = '/';
  }

  function handleAuthResponse(fetchPromise) {
    return fetchPromise.then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (body) {
        if (!response.ok || !body || !body.user) {
          var error = new Error((body && body.error) || 'AUTH_FAILED');
          error.status = response.status;
          error.code = body && body.error;
          throw error;
        }
        setAuthState({ authenticated: true, userId: body.user.id, user: body.user, csrfToken: body.csrfToken || null, character: null });
        return body.user;
      });
    });
  }

  function register(payload) {
    return handleAuthResponse(fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload) }));
  }
  function login(payload) {
    return handleAuthResponse(fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(payload) }));
  }
  function loginWithGoogle(credential) {
    return handleAuthResponse(fetch('/api/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ credential: credential }) }));
  }

  // Confirm real server-side revocation BEFORE changing local state. csrf-fetch-patch.js owns
  // the signed double-submit header, so it always mirrors the current CSRF cookie instead of a
  // stale value returned by an earlier session bootstrap. A failed logout must not pretend to
  // succeed: that would route to the chooser while the cookie still authenticates it.
  function logout() {
    return fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).then(function (response) {
      if (response.ok || response.status === 401) return;
      return response.json().catch(function () { return {}; }).then(function (body) {
        var error = new Error((body && body.error) || 'LOGOUT_FAILED');
        error.status = response.status;
        error.code = body && body.error;
        throw error;
      });
    }).then(function () {
      if (window.TradeJournalUserScopeGuard) window.TradeJournalUserScopeGuard.purgeAll();
      setAuthState({ authenticated: false, userId: null, user: null, csrfToken: null, character: null });
      broadcastLogout();
      window.top.location.hash = '/';
    });
  }

  // Waits for boot-language-gate.js's own early session check if it hasn't resolved yet (this
  // script loads later in the existing page order, so in practice it almost always already
  // has), then reports whether a real session exists. No more self-healing/auto-bootstrap - a
  // caller with no session simply gets `false`/a rejection, same contract as before.
  function isStoredUserValid() {
    var ready = window.__NAVRYA_AUTH_READY__ || Promise.resolve(authState());
    return ready.then(function (auth) { return Boolean(auth && auth.authenticated); });
  }
  function refreshSession() {
    return fetch('/api/auth/session', { credentials: 'include' }).then(function (response) {
      if (!response.ok) throw new Error('SESSION_REFRESH_FAILED');
      return response.json();
    }).then(function (body) {
      var auth = authFromSession(body);
      setAuthState(auth);
      return auth;
    });
  }
  function ensureUser() {
    return isStoredUserValid().then(function (valid) {
      if (valid) return currentUserId();
      throw new Error('NOT_AUTHENTICATED');
    });
  }

  function buildCard() {
    var card = el('section', 'panel-settings-card tj-dev-user-card');
    card.dataset.devUserSwitcher = '';
    card.append(el('h3', '', t('title')));

    var currentName = el('strong', '', '…');
    var currentRow = el('div', 'tj-dev-user-current');
    currentRow.append(el('span', '', t('current') + ':'), currentName);
    card.append(currentRow);

    var logoutBtn = button(t('logoutBtn'), 'tj-secondary');
    logoutBtn.onclick = function () {
      logout().then(function () { toast(t('loggedOut'), 'success'); }).catch(function () { toast(t('logoutFailed'), 'error'); });
    };
    card.append(logoutBtn);

    var adminLink = el('a', 'tj-dev-user-admin-link', t('adminLink'));
    adminLink.href = '#/admin';
    if (window.location && window.location.hostname === 'app.navrya.com') adminLink.href = 'https://admin.navrya.com';
    adminLink.target = '_top';
    card.append(adminLink);

    var user = authState().user;
    currentName.textContent = user ? user.displayName + (user.email ? ' (' + user.email + ')' : '') : '—';

    return card;
  }

  function ensureSwitcher() {
    var settings = document.querySelector('.panel-settings');
    if (settings && !settings.querySelector('[data-dev-user-switcher]')) {
      var card = buildCard();
      card.dir = dir();
      settings.append(card);
      icons(settings);
    }
  }
  new MutationObserver(ensureSwitcher).observe(document.body, { subtree: true, childList: true });
  new MutationObserver(ensureSwitcher).observe(document.documentElement, { attributes: true, attributeFilter: ['lang', 'dir'] });
  setTimeout(ensureSwitcher, 0);

  window.TradeJournalDevUserSwitcher = {
    currentUserId: currentUserId, ensureUser: ensureUser, isStoredUserValid: isStoredUserValid, refreshSession: refreshSession,
    register: register, login: login, loginWithGoogle: loginWithGoogle, logout: logout
  };
}());
