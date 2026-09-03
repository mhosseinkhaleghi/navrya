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

  // A `file://` document's own origin is not a meaningful security boundary to check against
  // (browsers report it inconsistently, e.g. the literal string "null" or "file://") - this app
  // explicitly supports being opened directly as a file, so origin validation is skipped only in
  // that one mode. Every real deployment (http/https) validates the real origin.
  function isTrustedOrigin(origin) {
    if (window.location.protocol === 'file:') return true;
    return origin === window.location.origin;
  }

  // A valid character-selection message, structurally: the exact expected type, and a character
  // key that is actually one of this shell's own known routes - never an arbitrary string used
  // to build a hash/URL.
  function isValidCharacterSelectedMessage(data) {
    return Boolean(data) && data.type === 'tradejournal:character-selected'
      && typeof data.character === 'string' && Object.prototype.hasOwnProperty.call(pages, data.character)
      && data.character !== 'select' && data.character !== 'admin'; // only real dashboard routes are selectable this way
  }

  function App() {
    const state = React.useState(pageFromHash());
    const page = state[0];
    const setPage = state[1];
    const current = pages[page];
    const iframeRef = React.useRef(null);

    React.useEffect(function () {
      function onHashChange() { setPage(pageFromHash()); }
      function onMessage(event) {
        if (!isTrustedOrigin(event.origin)) return;
        // The message must come from THIS shell's own currently-mounted iframe - never trust an
        // arbitrary window merely because it happened to send a well-formed-looking message.
        if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;
        if (!isValidCharacterSelectedMessage(event.data)) return;
        window.location.hash = '/dashboard/' + event.data.character;
      }
      window.addEventListener('hashchange', onHashChange);
      window.addEventListener('message', onMessage);
      return function () {
        window.removeEventListener('hashchange', onHashChange);
        window.removeEventListener('message', onMessage);
      };
    }, []);

    React.useEffect(function () { document.title = current.title; }, [current]);
    return React.createElement('main', { className: 'app-frame' },
      React.createElement('iframe', { key: page, ref: iframeRef, title: current.title, src: current.source }),
      React.createElement(VersionBadge)
    );
  }

  // Reads the build/dev-server-generated public/version.json (see scripts/write-version.mjs) so
  // every page - including the login/select screen, since it's routed through this same outer
  // shell - can show exactly which commit is running. Silently renders nothing if the file is
  // missing (e.g. this shell opened without ever running dev/build through npm).
  function VersionBadge() {
    const state = React.useState(null);
    const info = state[0];
    const setInfo = state[1];
    React.useEffect(function () {
      fetch('version.json').then(function (r) { return r.ok ? r.json() : null; }).then(setInfo).catch(function () {});
    }, []);
    if (!info) return null;
    return React.createElement('div', {
      style: {
        position: 'fixed', left: 8, bottom: 6, zIndex: 1, pointerEvents: 'none',
        font: '500 10px/1.4 -apple-system, BlinkMacSystemFont, sans-serif', letterSpacing: '.02em',
        color: 'rgba(244, 234, 215, .35)', userSelect: 'none'
      }
    }, 'v' + info.version + (info.dirty ? '*' : ''));
  }

  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
}());
