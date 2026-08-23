(function () {
  const pagePrefix = window.location.protocol === 'file:' ? 'public/pages/' : 'pages/';
  const pages = {
    select: { title: 'NAVRYA · Choose Your Character', source: pagePrefix + 'select/index.html' },
    hunter: { title: 'NAVRYA · Hunter', source: pagePrefix + 'hunter/index.html' },
    engineer: { title: 'NAVRYA · Engineer', source: pagePrefix + 'engineer/index.html' },
    commander: { title: 'NAVRYA · Commander', source: pagePrefix + 'commander/index.html' },
    sage: { title: 'NAVRYA · Market Sage', source: pagePrefix + 'sage/index.html' },
    admin: { title: 'NAVRYA · Admin', source: pagePrefix + 'admin/index.html' }
  };

  // The admin page is a standalone top-level page like select/, not nested in a character
  // iframe - it needs its own branch here, since a character page's own in-iframe hash change
  // (e.g. a plain <a href="#/admin">) only ever affects that iframe's own document, never this
  // outer shell's real hash. Reaching this route from inside a character page requires
  // target="_top" on the link (see the Settings-page admin link), not a bare anchor.
  function pageFromHash() {
    const hostname = window.location.hostname.toLowerCase();
    const isAdminHost = hostname === 'admin.navrya.com' || hostname === 'admin.staging.navrya.com';
    const isAppHost = hostname === 'app.navrya.com' || hostname === 'staging.navrya.com';
    if (isAdminHost) return 'admin';
    if (isAppHost && window.location.hash === '#/admin') return 'select';
    const dash = window.location.hash.match(/^#\/dashboard\/(hunter|engineer|commander|sage)$/);
    if (dash) return dash[1];
    if (window.location.hash === '#/admin') return 'admin';
    return 'select';
  }

  function App() {
    const state = React.useState(pageFromHash());
    const page = state[0];
    const setPage = state[1];
    const current = pages[page];

    React.useEffect(function () {
      function onHashChange() { setPage(pageFromHash()); }
      function onMessage(event) {
        if (event.data && event.data.type === 'tradejournal:character-selected' && pages[event.data.character]) {
          window.location.hash = '/dashboard/' + event.data.character;
        }
      }
      window.addEventListener('hashchange', onHashChange);
      window.addEventListener('message', onMessage);
      return function () {
        window.removeEventListener('hashchange', onHashChange);
        window.removeEventListener('message', onMessage);
      };
    }, []);

    React.useEffect(function () { document.title = current.title; }, [current]);
    return React.createElement('main', { className: 'app-frame' }, React.createElement('iframe', { key: page, title: current.title, src: current.source }));
  }

  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
}());
