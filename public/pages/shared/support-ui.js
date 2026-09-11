(function () {
  'use strict';
  var i18n = window.TradeJournalSupportI18n;
  var switcher = window.TradeJournalDevUserSwitcher;
  var layer = window.TradeJournalPanelLayer;
  if (!i18n || !switcher || !layer) return;

  function icons(root) { if (window.TradeJournalIcons) window.TradeJournalIcons.schedule(root || document); }

  // #support (list + empty detail) or #support/:ticketId (list + that ticket's conversation) -
  // same one-level route shape messages-ui.js/community-ui.js already use for their own
  // list->detail routes.
  function route() {
    var match = window.location.hash.match(/^#support(?:\/([^/]+))?$/);
    if (!match) return null;
    return { ticketId: match[1] ? decodeURIComponent(match[1]) : null };
  }

  function renderPage(ticketId) {
    var navrya = window.TradeJournalNavryaSupport;
    var page;
    if (navrya && navrya.render) {
      page = navrya.render(ticketId);
    } else {
      // Defensive fallback only (module failed to load) - same honest "no real feature, just a
      // hint" precedent as community-ui.js's own marketplace/messages fallback branches.
      page = document.createElement('section');
      page.className = 'panel-page tj-support-page';
      page.dir = i18n.direction();
      var p = document.createElement('p');
      p.className = 'hint';
      p.textContent = i18n.t('errorGeneric');
      page.append(p);
    }
    layer.show(page, 'support');
    document.querySelectorAll('.sidebar nav a').forEach(function (a) { a.classList.toggle('active', a.getAttribute('href') === '#support'); });
    icons(page);
  }

  function render() {
    var current = route();
    if (!current) return;
    switcher.ensureUser().then(function () { renderPage(current.ticketId); });
  }

  window.addEventListener('hashchange', function () { if (location.hash.indexOf('#support') === 0) render(); });
  window.setTimeout(function () { if (location.hash.indexOf('#support') === 0) render(); }, 0);

  window.TradeJournalSupport = { route: route, render: render };
}());
