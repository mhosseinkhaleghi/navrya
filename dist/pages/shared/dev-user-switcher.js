(function () {
  'use strict';
  var KEY = 'tradejournal:dev-user-id';

  function el(tag, className, text) { var node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function ico(name) { var node = el('i'); node.dataset.lucide = name; return node; }
  function button(text, className, icon) { var b = el('button', className || '', text); b.type = 'button'; if (icon) b.prepend(ico(icon)); return b; }
  function icons(root) { if (window.TradeJournalIcons) window.TradeJournalIcons.schedule(root || document); }
  function toast(message, tone) { var node = el('div', 'tj-toast ' + (tone || ''), message); document.body.append(node); setTimeout(function () { node.remove(); }, 2600); }
  function lang() { return String(document.documentElement.lang || 'en').toLowerCase(); }
  function dir() { var l = lang(); return l === 'fa' || l === 'ar' ? 'rtl' : 'ltr'; }

  var copy = {
    fa: { title: 'حساب کاربری (حالت توسعه)', hint: 'برای آزمایش بخش انجمن، بین کاربرهای ساخته‌شده جابه‌جا شو. کاربر جدید هنگام ورود ساخته می‌شود.', current: 'کاربر فعلی', switchBtn: 'انتخاب', switched: 'کاربر عوض شد.', adminLink: 'پنل مدیریت' },
    ar: { title: 'حساب المستخدم (وضع التطوير)', hint: 'للتبديل بين المستخدمين الحاليين لاختبار قسم المجتمع. يُنشأ مستخدم جديد عند تسجيل الدخول.', current: 'المستخدم الحالي', switchBtn: 'اختيار', switched: 'تم تبديل المستخدم.', adminLink: 'لوحة الإدارة' },
    en: { title: 'Account (dev mode)', hint: 'Switch between users already created for testing the Community section. New users are created at login.', current: 'Current user', switchBtn: 'Switch', switched: 'Switched user.', adminLink: 'Admin' },
    es: { title: 'Cuenta (modo desarrollo)', hint: 'Cambia entre usuarios ya creados para probar la sección Comunidad. Los usuarios nuevos se crean al iniciar sesión.', current: 'Usuario actual', switchBtn: 'Cambiar', switched: 'Usuario cambiado.', adminLink: 'Administración' }
  };
  function t(key) { var l = lang(); return (copy[l] && copy[l][key]) || copy.en[key] || key; }

  function currentUserId() { try { return localStorage.getItem(KEY) || ''; } catch (_) { return ''; } }
  function setCurrentUserId(id) { try { localStorage.setItem(KEY, id); } catch (_) { /* no-op if storage is unavailable */ } }

  function listUsers() { return fetch('/api/users').then(function (r) { return r.json(); }); }

  function bootstrapFrom(list) {
    if (list.length) { setCurrentUserId(list[0].id); return Promise.resolve(list[0].id); }
    return createUser('Trader ' + Math.random().toString(36).slice(2, 6)).then(function (user) { return user.id; });
  }

  // Pure check, no side effects: is the CURRENTLY stored id one the server actually knows about?
  // A stale id (most commonly: the in-memory dev backend was restarted, which resets its whole
  // user table - see community-api-server.mjs's own startup log) used to be trusted blindly
  // forever, on both this check and ensureUser() below - every request then failed 401
  // UNKNOWN_DEV_USER, silently swallowed by most callers, so the whole app just quietly fell
  // back to dead/demo-looking state with no visible reason and select/app.js's name popup never
  // re-triggered. Exposed so select/app.js's "does this browser already have an account" gate can
  // ask this instead of the old bare localStorage-presence check (hasDevUser()), which could
  // never tell a stale id apart from a real one. Cached per page load (not per call) since this
  // costs a real network round trip.
  var validityCheck = null;
  function isStoredUserValid() {
    var stored = currentUserId();
    if (!stored) return Promise.resolve(false);
    if (!validityCheck) {
      validityCheck = listUsers().then(function (users) {
        var list = Array.isArray(users) ? users : [];
        return list.some(function (u) { return u.id === currentUserId(); });
      }).catch(function () { return true; }); // GET /api/users itself unreachable - fail open, let the real call surface its own honest error
    }
    return validityCheck;
  }

  // Same validation, but self-healing: used by the deep API-call plumbing throughout the app
  // (every store's request() calls this before attaching x-dev-user-id), where "just get me some
  // working identity so this call can proceed" is the goal - unlike select/app.js's gate, which
  // must show the name step rather than silently substituting a random placeholder identity.
  var selfHeal = null;
  function ensureUser() {
    if (!selfHeal) {
      selfHeal = isStoredUserValid().then(function (valid) {
        if (valid) return currentUserId();
        return listUsers().then(function (users) { return bootstrapFrom(Array.isArray(users) ? users : []); }).catch(function () {
          var stored = currentUserId();
          return stored || Promise.reject(new Error('NO_CURRENT_USER'));
        });
      });
    }
    return selfHeal;
  }

  // The single place a new dev-mode user is ever created (POST /api/users), reused by both
  // ensureUser()'s auto-bootstrap below and the login-time name step in public/pages/select/.
  // Fixed from an earlier version that resolved on ANY response (including error bodies) and
  // persisted whatever came back, even `undefined` - a failed create looked like a silent
  // success and left dev-user-id set to the literal string "undefined". Now: only a genuine
  // {id,...} success response is persisted, and every other case rejects with a real Error so
  // callers can show the failure instead of silently limping on with a broken id.
  function createUser(displayName) {
    return fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName: displayName }) })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (body) {
          if (!response.ok || !body || !body.id) {
            var error = new Error((body && body.error) || 'CREATE_USER_FAILED');
            error.status = response.status;
            throw error;
          }
          setCurrentUserId(body.id);
          return body;
        });
      });
  }

  function buildCard() {
    var card = el('section', 'panel-settings-card tj-dev-user-card');
    card.dataset.devUserSwitcher = '';
    card.append(el('h3', '', t('title')), el('p', '', t('hint')));

    // Deliberately English and unconditional across every language - a safety/security
    // notice, not ordinary UI copy, so it stays unambiguous regardless of locale.
    var badge = el('div', 'tj-dev-mode-badge', 'DEV MODE — not real authentication');
    card.append(badge);

    var currentRow = el('div', 'tj-dev-user-current');
    var currentLabel = el('span', '', t('current') + ':');
    var currentName = el('strong', '', '…');
    currentRow.append(currentLabel, currentName);

    var select = document.createElement('select');
    var switchBtn = button(t('switchBtn'), 'tj-secondary');
    var switchRow = el('div', 'tj-calc-grid');
    switchRow.append(select, switchBtn);

    card.append(currentRow, switchRow);

    // Discoverability only, not a security boundary (admin auth is disabled by default in
    // this phase - see server/admin/auth-admin.mjs). target="_top" is required, not stylistic:
    // this card lives inside a character page's iframe, and #/admin is a route on the OUTER
    // shell (src/release.js), not on this iframe's own document - a bare same-document href
    // would silently change only the iframe's internal hash and never navigate anywhere.
    var adminLink = el('a', 'tj-dev-user-admin-link', t('adminLink'));
    adminLink.href = '#/admin';
    adminLink.target = '_top';
    card.append(adminLink);

    function refresh() {
      listUsers().then(function (users) {
        var list = Array.isArray(users) ? users : []; // listUsers() resolves to an error body ({error:'...'}) on a failed request, not an array
        select.replaceChildren();
        list.forEach(function (user) { select.append(new Option(user.displayName, user.id, false, user.id === currentUserId())); });
        var active = list.find(function (user) { return user.id === currentUserId(); });
        currentName.textContent = active ? active.displayName : '—';
      }).catch(function () { currentName.textContent = '—'; });
    }

    switchBtn.onclick = function () { if (select.value) { setCurrentUserId(select.value); refresh(); toast(t('switched'), 'success'); } };

    ensureUser().then(refresh).catch(function () { refresh(); });
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
    currentUserId: currentUserId, ensureUser: ensureUser, createUser: createUser, isStoredUserValid: isStoredUserValid
  };
}());
