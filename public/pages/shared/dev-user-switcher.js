(function () {
  'use strict';
  // Filename/global kept as-is on purpose (window.TradeJournalDevUserSwitcher, method names
  // currentUserId/ensureUser/isStoredUserValid) - 19 other files reference this exact global by
  // name and ~30 call sites already build `{'x-dev-user-id': uid}` request headers directly.
  // None of that needs to change: the header still carries a string under that name, it's just
  // a signed session token now (see server/community/auth-real.mjs) instead of a raw user id.
  var KEY = 'tradejournal:auth-token';

  function el(tag, className, text) { var node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function button(text, className) { var b = el('button', className || '', text); b.type = 'button'; return b; }
  function icons(root) { if (window.TradeJournalIcons) window.TradeJournalIcons.schedule(root || document); }
  function toast(message, tone) { var node = el('div', 'tj-toast ' + (tone || ''), message); document.body.append(node); setTimeout(function () { node.remove(); }, 2600); }
  function lang() { return String(document.documentElement.lang || 'en').toLowerCase(); }
  function dir() { var l = lang(); return l === 'fa' || l === 'ar' ? 'rtl' : 'ltr'; }

  var copy = {
    fa: { title: 'حساب کاربری', current: 'وارد شده به‌عنوان', logoutBtn: 'خروج', loggedOut: 'با موفقیت خارج شدید.', adminLink: 'پنل مدیریت' },
    ar: { title: 'حساب المستخدم', current: 'مسجّل الدخول باسم', logoutBtn: 'تسجيل الخروج', loggedOut: 'تم تسجيل الخروج.', adminLink: 'لوحة الإدارة' },
    en: { title: 'Account', current: 'Logged in as', logoutBtn: 'Log out', loggedOut: 'Logged out.', adminLink: 'Admin' },
    es: { title: 'Cuenta', current: 'Sesión iniciada como', logoutBtn: 'Cerrar sesión', loggedOut: 'Sesión cerrada.', adminLink: 'Administración' }
  };
  function t(key) { var l = lang(); return (copy[l] && copy[l][key]) || copy.en[key] || key; }

  function currentUserId() { try { return localStorage.getItem(KEY) || ''; } catch (_) { return ''; } }
  function setToken(token) { try { localStorage.setItem(KEY, token); } catch (_) { /* no-op if storage is unavailable */ } }
  function clearToken() { try { localStorage.removeItem(KEY); } catch (_) { /* no-op */ } }

  function fetchMe() { return fetch('/api/users/me', { headers: { 'x-dev-user-id': currentUserId() } }); }

  // Shared by register()/login()/loginWithGoogle() - all three of routes.auth.mjs's endpoints
  // return the same {user, token} shape on success, or {error} on failure.
  function handleAuthResponse(fetchPromise) {
    return fetchPromise.then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (body) {
        if (!response.ok || !body || !body.token || !body.user) {
          var error = new Error((body && body.error) || 'AUTH_FAILED');
          error.status = response.status;
          error.code = body && body.error;
          throw error;
        }
        setToken(body.token);
        return body.user;
      });
    });
  }

  function register(payload) {
    return handleAuthResponse(fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }));
  }
  function login(payload) {
    return handleAuthResponse(fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }));
  }
  function loginWithGoogle(credential) {
    return handleAuthResponse(fetch('/api/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential: credential }) }));
  }
  // Phase 1 of the local-first-to-server-authoritative migration: logout must purge every
  // user-scoped local cache, not just the credential - see user-scope-guard.js (loaded first on
  // every character page, so it is always available by the time a real logout click can happen).
  // Called before clearToken() while every store/IndexedDB module is still fully loaded, so the
  // purge can act directly instead of falling back to the boot-time pending-clear flag.
  function logout() { if (window.TradeJournalUserScopeGuard) window.TradeJournalUserScopeGuard.purgeAll(); clearToken(); }

  // Pure check, no side effects: is the currently stored token one the server still accepts?
  // Cached per page load (not per call), same as before - costs a real network round trip.
  var validityCheck = null;
  function isStoredUserValid() {
    if (!currentUserId()) return Promise.resolve(false);
    if (!validityCheck) {
      validityCheck = fetchMe().then(function (response) { return response.ok; })
        .catch(function () { return true; }); // server unreachable - fail open, let the real call surface its own honest error
    }
    return validityCheck;
  }

  // Same validation, used by the deep API-call plumbing throughout the app (every store's
  // request() calls this before attaching x-dev-user-id) - unlike the old dev-mode version,
  // there is no self-healing auto-bootstrap anymore: without a credential there is nothing
  // sensible to fall back to, so this simply rejects and lets each caller's existing
  // .catch()/error handling take over (most already fail silently for background calls like
  // heartbeats).
  var pending = null;
  function ensureUser() {
    if (!pending) {
      pending = isStoredUserValid().then(function (valid) {
        if (valid) return currentUserId();
        throw new Error('NOT_AUTHENTICATED');
      });
    }
    return pending;
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
      logout();
      toast(t('loggedOut'), 'success');
      // This card lives inside a character page's iframe; the login screen is the outer
      // shell's default route (src/release.js), so the navigation must target the top window.
      window.top.location.hash = '/';
    };
    card.append(logoutBtn);

    // Discoverability only, not a security boundary by itself (see server/admin/auth-admin.mjs
    // for the real gate). target="_top" is required, not stylistic: this card lives inside a
    // character page's iframe, and #/admin is a route on the OUTER shell, not this iframe's own
    // document - a bare same-document href would silently change only the iframe's hash.
    var adminLink = el('a', 'tj-dev-user-admin-link', t('adminLink'));
    adminLink.href = '#/admin';
    if (window.location && window.location.hostname === 'app.navrya.com') adminLink.href = 'https://admin.navrya.com';
    adminLink.target = '_top';
    card.append(adminLink);

    fetchMe().then(function (response) { return response.ok ? response.json() : null; }).then(function (user) {
      currentName.textContent = user ? user.displayName + (user.email ? ' (' + user.email + ')' : '') : '—';
    }).catch(function () { currentName.textContent = '—'; });

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
    currentUserId: currentUserId, ensureUser: ensureUser, isStoredUserValid: isStoredUserValid,
    register: register, login: login, loginWithGoogle: loginWithGoogle, logout: logout
  };
}());
